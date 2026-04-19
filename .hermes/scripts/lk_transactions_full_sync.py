#!/usr/bin/env python3
"""
LK Transactions Full Sync
Usa Shopify Transactions API: GET /admin/api/2024-01/orders/{order_id}/transactions.json
Inclui: AUTHORIZATION, SALE, CAPTURE, REFUND, VOID, etc.
Checkpoint: /tmp/lk_tx_full_checkpoint.json
"""
import requests, time, json, sys, subprocess

PAT = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
PROJECT = "cnjimxglpktznenpbail"
SHOP = "lk-sneakerss"
API_VER = "2024-01"
SHOP_TOKEN = subprocess.run(
    ["doppler", "secrets", "get", "SHOPIFY_ACCESS_TOKEN", "-p", "lc-keys", "-c", "prd", "--plain"],
    capture_output=True, text=True
).stdout.strip()
SB_URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"

BATCH_SIZE = 50
PAGE_SIZE = 250
IDLE_SLEEP = 0.55
RATE_SLEEP = 0.12
MAX_RETRIES = 3
CHK_FILE = "/tmp/lk_tx_full_checkpoint.json"

def supabase_query(query, retry=2):
    for attempt in range(retry + 1):
        try:
            r = requests.post(SB_URL, headers={
                "Authorization": f"Bearer {PAT}",
                "Content-Type": "application/json"
            }, json={"query": query}, timeout=30)
            if r.status_code in (200, 201):
                return r.json()
            if r.status_code == 400 and "T_RETRY" in r.text:
                time.sleep(2)
                continue
            print(f"    [!] SB error {r.status_code}: {r.text[:120]}")
            return None
        except Exception as e:
            if attempt < retry:
                time.sleep(1)
            else:
                print(f"    [!] SB exception: {e}")
                return None
    return None

def upsert_transactions(rows):
    if not rows:
        return 0
    values = []
    for r in rows:
        amt = str(r.get("amount") or "0.00")
        curr = r.get("currency", "BRL")
        gw = r.get("gateway", "").replace("'", "''")
        ts = r.get("created_at", "")[:19]
        values.append(
            f"({r['id']}, {r['order_id']}, '{r['kind']}', '{r['status']}', "
            f"{amt}, '{curr}', '{gw}', '{ts}')"
        )
    sql = "INSERT INTO lk_intel.transactions_full " \
          "(id, order_id, kind, status, amount, currency, gateway, created_at) VALUES\n" \
          + ",\n".join(values) + \
          " ON CONFLICT (id) DO NOTHING"
    result = supabase_query(sql)
    if result is not None:
        return len(rows)
    return 0

def fetch_transactions_for_order(order_id):
    url = f"https://{SHOP}.myshopify.com/admin/api/{API_VER}/orders/{order_id}/transactions.json?limit=250"
    headers = {"X-Shopify-Access-Token": SHOP_TOKEN, "Content-Type": "application/json"}
    txns = []
    while url:
        for attempt in range(MAX_RETRIES):
            try:
                r = requests.get(url, headers=headers, timeout=15)
                if r.status_code == 200:
                    data = r.json().get("transactions", [])
                    txns.extend(data)
                    link = r.headers.get("Link", "")
                    next_url = None
                    for part in link.split(","):
                        if 'rel="next"' in part:
                            next_url = part.split(";")[0].strip()[1:-1]
                            break
                    url = next_url
                    break
                elif r.status_code == 429:
                    time.sleep(5)
                    continue
                else:
                    url = None
                    break
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(1)
                else:
                    url = None
                    break
        else:
            time.sleep(RATE_SLEEP)
    return txns

def load_checkpoint():
    try:
        with open(CHK_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"last_order_id": 0, "inserted": 0, "errors": 0, "batch": 0}

def save_checkpoint(cp):
    with open(CHK_FILE, "w") as f:
        json.dump(cp, f)

def main():
    cp = load_checkpoint()
    last_id = cp["last_order_id"]
    inserted = cp["inserted"]
    errors = cp["errors"]
    batch_num = cp["batch"]

    print(f"[TX] Last order_id: {last_id} | Inserted: {inserted} | Batch: {batch_num}", flush=True)
    print("=" * 60, flush=True)

    result = supabase_query("SELECT COUNT(*) FROM lk_intel.orders WHERE id > 0")
    total_orders = result[0]["count"] if result else "?"
    print(f"Total orders in DB: {total_orders}\n", flush=True)

    offset = 0
    batch_count = 0
    running_inserted = inserted

    while True:
        query = f"""
            SELECT id FROM lk_intel.orders
            WHERE id > {last_id}
            ORDER BY id ASC
            LIMIT {PAGE_SIZE}
        """
        res = supabase_query(query)
        if not res or len(res) == 0:
            print("\n[DONE] No more orders.", flush=True)
            break

        order_ids = [row["id"] for row in res]
        new_last = order_ids[-1]
        batch_count += 1

        all_rows = []
        order_errors = 0

        for oid in order_ids:
            txns = fetch_transactions_for_order(oid)
            for t in txns:
                all_rows.append({
                    "id": t["id"],
                    "order_id": oid,
                    "kind": t.get("kind",""),
                    "status": t.get("status",""),
                    "amount": t.get("amount","0.00"),
                    "currency": t.get("currency","BRL"),
                    "gateway": t.get("gateway",""),
                    "created_at": t.get("created_at",""),
                })
            time.sleep(RATE_SLEEP)

        n = upsert_transactions(all_rows)
        running_inserted += n

        last_id = new_last
        cp = {"last_order_id": last_id, "inserted": running_inserted,
              "errors": errors + order_errors, "batch": batch_num + batch_count}
        save_checkpoint(cp)

        print(f"  Batch {batch_num + batch_count:4d} | orders {order_ids[0]}→{order_ids[-1]} | "
              f"txns {len(all_rows):4d} | inserted {n:4d} | total {running_inserted:,}", flush=True)

        if len(order_ids) < PAGE_SIZE:
            print("\n[DONE] Last page.", flush=True)
            break

        time.sleep(0.3)

    print(f"\n{'='*60}", flush=True)
    print(f"[FINAL] batches={batch_num + batch_count} inserted={running_inserted:,} errors={errors}", flush=True)

    result = supabase_query(
        "SELECT COUNT(*) as total, MIN(created_at) as oldest, MAX(created_at) as newest "
        "FROM lk_intel.transactions_full"
    )
    if result:
        print(f"\n[VERIFY] transactions_full: {result}", flush=True)

if __name__ == "__main__":
    subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "start", "lk_transactions_full_sync"], capture_output=True)
    try:
        main()
        subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "end", "lk_transactions_full_sync", "success"], capture_output=True)
    except Exception as e:
        subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "end", "lk_transactions_full_sync", "failure", str(e)], capture_output=True)
        raise
