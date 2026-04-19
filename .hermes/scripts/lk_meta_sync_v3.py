#!/usr/bin/env python3
"""
LK Intel - Meta Ads Sync v3
Corrigido: usa checkpoint em vez de data fixa.
 Só puxa desde a última sync (incremental).
"""
import sys
sys.path.insert(0, "/root/.hermes/scripts")
from _hermes_config import PAT, SB_URL
import json, time, requests
from datetime import date, timedelta
import sys
sys.path.insert(0, "/root/.hermes/scripts")
from _hermes_config import PAT, SB_URL
import subprocess

MGMT_TOKEN = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
PROJECT_ID = "cnjimxglpktznenpbail"
META_API = "https://graph.facebook.com/v19.0"
AD_ACCOUNT = "act_10153947479906477"
BATCH_SIZE = 10
SQL_DELAY = 0.6
CHECKPOINT_NAME = "meta_ad_insights"

META_TOKEN = subprocess.run(
    ["doppler", "secrets", "get", "META_ACCESS_TOKEN", "-p", "lc-keys", "-c", "prd", "--plain"],
    capture_output=True, text=True
).stdout.strip()

URL = f"https://api.supabase.com/v1/projects/{PROJECT_ID}/database/query"

def run_sql(sql, retries=3):
    for attempt in range(retries):
        r = requests.post(URL,
            headers={"Authorization": f"Bearer {MGMT_TOKEN}", "Content-Type": "application/json"},
            json={"query": sql}, timeout=120
        )
        if r.status_code == 429:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code in (200, 201): return r.json()
        return {"error": f"{r.status_code}: {r.text[:200]}"}
    return {"error": "429 max retries"}

def get_checkpoint():
    result = run_sql(f"""
        SELECT last_cursor FROM lk_intel.sync_checkpoints
        WHERE entity = '{CHECKPOINT_NAME}'
        ORDER BY updated_at DESC LIMIT 1;
    """)
    if result and isinstance(result, list) and len(result) > 0:
        cursor = result[0].get('last_cursor')
        if cursor:
            return cursor  # ISO date string
    return None

def save_checkpoint(cursor):
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    result = run_sql(f"""
        INSERT INTO lk_intel.sync_checkpoints (entity, last_cursor, last_synced_at, source, updated_at)
        VALUES ('{CHECKPOINT_NAME}', '{cursor}', '{now}', 'meta_ads', '{now}')
        ON CONFLICT (entity) DO UPDATE SET
            last_cursor = EXCLUDED.last_cursor,
            last_synced_at = EXCLUDED.last_synced_at,
            updated_at = EXCLUDED.updated_at;
    """)
    return result

def sv(val):
    if val is None: return 'NULL'
    if isinstance(val, bool): return 'TRUE' if val else 'FALSE'
    if isinstance(val, (int, float)): return str(val)
    s = str(val)
    if '$$' in s:
        if '$_$' in s: return "'" + s.replace("'", "''") + "'"
        return f"$_${s}$_$"
    return f"$${s}$$"

def batch_upsert(table, columns, rows, conflict_cols, update_cols, batch_size=BATCH_SIZE):
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        sql = f"""INSERT INTO lk_intel.{table} ({', '.join(columns)}) VALUES {', '.join(batch)}
        ON CONFLICT ({', '.join(conflict_cols)}) DO UPDATE SET
            {', '.join(f'{c}=EXCLUDED.{c}' for c in update_cols)};"""
        result = run_sql(sql)
        if isinstance(result, list) or (isinstance(result, dict) and 'error' not in result):
            inserted += len(batch)
        elif '429' in str(result):
            time.sleep(5)
            result2 = run_sql(sql)
            if isinstance(result2, list) or 'error' not in str(result2):
                inserted += len(batch)
        time.sleep(SQL_DELAY)
    return inserted

def sync_campaigns():
    print("\n📢 META CAMPAIGNS", flush=True)
    resp = requests.get(
        f"{META_API}/{AD_ACCOUNT}/campaigns",
        params={
            'fields': 'id,name,objective,status,buy_type,created_time,updated_time',
            'limit': 500, 'access_token': META_TOKEN
        }, timeout=120
    )
    if resp.status_code != 200:
        print(f"  Error: {resp.text[:150]}", flush=True)
        return

    campaigns = resp.json().get('data', [])
    print(f"  Found: {len(campaigns)}", flush=True)

    rows = []
    for c in campaigns:
        cid = c.get('id','')
        name = c.get('name','')
        obj = c.get('objective','')
        status = c.get('status','')
        buy = c.get('buy_type','')
        created = c.get('created_time','')
        updated = c.get('updated_time','')
        rows.append(
            f"({sv(cid)}, {sv(name)}, {sv(obj)}, {sv(status)}, {sv(buy)}, "
            f"'{created}'::timestamptz, '{updated}'::timestamptz)"
        )

    n = batch_upsert('meta_campaigns',
        ['campaign_id','campaign_name','objective','status','buy_type','created_at_meta','updated_at_meta'],
        rows, ['campaign_id'], ['campaign_name','status','updated_at_meta'])
    print(f"  ✅ Upserted: {n}", flush=True)

def sync_insights(start_date, end_date):
    print(f"\n📊 META AD INSIGHTS ({start_date} → {end_date})", flush=True)
    total = 0
    current = start_date

    while current < end_date:
        current_end = min(current + timedelta(days=7), end_date)
        since = current.isoformat()
        until = current_end.isoformat()

        resp = requests.get(
            f"{META_API}/{AD_ACCOUNT}/insights",
            params={
                'fields': 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,'
                          'spend,impressions,clicks,reach,frequency,ctr,cpc,cpm,'
                          'actions,action_values',
                'level': 'ad',
                'time_range': json.dumps({'since': since, 'until': until}),
                'time_increment': 1,
                'limit': 500,
                'access_token': META_TOKEN
            }, timeout=120
        )

        if resp.status_code == 429:
            wait = int(resp.headers.get('retry-after', '60'))
            print(f"  Rate limited: {wait}s", flush=True)
            time.sleep(wait)
            continue

        if resp.status_code != 200:
            print(f"  Error {since}: {resp.text[:100]}", flush=True)
            current = current_end + timedelta(days=1)
            time.sleep(2)
            continue

        insights = resp.json().get('data', [])
        if not insights:
            current = current_end + timedelta(days=1)
            time.sleep(2)
            continue

        rows = []
        for row in insights:
            d_date = row.get('date_start', '')
            campaign_id = row.get('campaign_id', '')
            campaign_name = row.get('campaign_name', '')
            adset_id = row.get('adset_id', '')
            adset_name = row.get('adset_name', '')
            ad_id = row.get('ad_id', '')
            ad_name = row.get('ad_name', '')
            spend = float(row.get('spend', 0) or 0)
            impressions = int(float(row.get('impressions', 0) or 0))
            clicks = int(float(row.get('clicks', 0) or 0))
            reach = int(float(row.get('reach', 0) or 0))
            frequency = float(row.get('frequency', 0) or 0)
            ctr_val = float(row.get('ctr', 0) or 0)
            cpc_val = float(row.get('cpc', 0) or 0)
            cpm_val = float(row.get('cpm', 0) or 0)

            purchase = add_to_cart = view_content = initiate_checkout = 0
            link_clicks = landing_page = messaging = 0
            revenue = 0.0
            for a in row.get('actions', []):
                atype = a.get('action_type', '')
                aval = int(float(a.get('value', 0) or 0))
                if 'purchase' in atype and 'omni' not in atype: purchase = aval
                elif 'add_to_cart' in atype: add_to_cart = aval
                elif atype == 'onsite_conversion.view_content' or atype == 'onsite_web_view_content': view_content = aval
                elif 'initiate_checkout' in atype: initiate_checkout = aval
                elif atype == 'link_click': link_clicks = aval
                elif atype == 'landing_page_view': landing_page = aval
                elif 'messaging_conversation_started' in atype: messaging = aval
            for av in row.get('action_values', []):
                if 'purchase' in av.get('action_type', '') and 'omni' not in av.get('action_type', ''):
                    revenue = float(av.get('value', 0) or 0)

            roas = revenue / spend if spend > 0 else 0

            rows.append(
                f"({sv(d_date)}, {sv(campaign_id)}, {sv(campaign_name)}, "
                f"{sv(adset_id)}, {sv(adset_name)}, {sv(ad_id)}, {sv(ad_name)}, "
                f"{round(spend,2)}, {impressions}, {clicks}, {reach}, "
                f"{round(frequency,4)}, {round(ctr_val,4)}, {round(cpc_val,2)}, {round(cpm_val,2)}, "
                f"0, 0, {round(roas,4)}, {round(revenue,2)}, "
                f"{purchase}, {add_to_cart}, {view_content}, {initiate_checkout})"
            )

        n = batch_upsert('meta_ad_insights',
            ['date','campaign_id','campaign_name','adset_id','adset_name','ad_id','ad_name',
             'spend','impressions','clicks','reach','frequency','ctr','cpc','cpm',
             'conversions','conversion_rate','roas','revenue',
             'action_purchase','action_add_to_cart','action_view_content','action_initiate_checkout'],
            rows, ['date','campaign_id','adset_id','ad_id'],
            ['spend','impressions','clicks','reach','frequency','ctr','cpc','cpm',
             'roas','revenue','action_purchase','action_add_to_cart','action_view_content','action_initiate_checkout'])
        total += n
        print(f"  📅 {since}: {n} rows", flush=True)

        # Save checkpoint after each day chunk
        save_checkpoint(until)

        current = current_end + timedelta(days=1)
        time.sleep(3)

    print(f"  ✅ Total: {total}", flush=True)
    return total

if __name__ == "__main__":
    print("📢 LK INTEL - Meta Ads Sync v3 (checkpoint-based)", flush=True)
    print("=" * 50, flush=True)
    start = time.time()

    try:
        sync_campaigns()
        time.sleep(2)

        # INCREMENTAL: start from checkpoint (last synced date)
        checkpoint = get_checkpoint()
        if checkpoint:
            # Parse checkpoint (ISO date string)
            start_date = date.fromisoformat(checkpoint)
            # Add 1 day buffer to avoid re-fetching last day (might be incomplete)
            start_date = start_date + timedelta(days=1)
        else:
            # First run: start from 30 days ago
            start_date = date.today() - timedelta(days=30)

        end_date = date.today()

        # Don't fetch future data
        if end_date <= start_date:
            print(f"  ⏭️  No new data (start={start_date}, end={end_date})")
        else:
            total = sync_insights(start_date, end_date)

        elapsed = time.time() - start
        print(f"\n{'=' * 50}", flush=True)
        print(f"✅ META ADS SYNC DONE ({elapsed/60:.1f} min)", flush=True)

    except Exception as e:
        print(f"❌ ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
