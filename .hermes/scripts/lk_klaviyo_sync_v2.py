#!/usr/bin/env python3
"""
LK Intel - Klaviyo Sync v2
Campaigns, flows, lists
"""
import sys
sys.path.insert(0, "/root/.hermes/scripts")
from _hermes_config import PAT, SB_URL
import json, time, requests, urllib.parse
import sys
sys.path.insert(0, "/root/.hermes/scripts")
from _hermes_config import PAT, SB_URL
import subprocess

MGMT_TOKEN = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
PROJECT_ID = "cnjimxglpktznenpbail"
KLAVIYO_REV = "2024-06-15"
BATCH_SIZE = 10
SQL_DELAY = 0.6

KLAVIYO_KEY = subprocess.run(
    ["doppler", "secrets", "get", "KLAVIYO_API_KEY", "-p", "lc-keys", "-c", "prd", "--plain"],
    capture_output=True, text=True
).stdout.strip()

def run_sql(sql, retries=3):
    for attempt in range(retries):
        r = requests.post(
            f"https://api.supabase.com/v1/projects/{PROJECT_ID}/database/query",
            headers={"Authorization": f"Bearer {MGMT_TOKEN}", "Content-Type": "application/json"},
            json={"query": sql}, timeout=60
        )
        if r.status_code == 429:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code in (200, 201): return r.json()
        return {"error": f"{r.status_code}: {r.text[:200]}"}
    return {"error": "429 max retries"}

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

def klaviyo_get(endpoint, params=None):
    if params is None: params = {}
    headers = {
        "Authorization": f"Klaviyo-API-Key {KLAVIYO_KEY}",
        "accept": "application/json",
        "revision": KLAVIYO_REV
    }
    all_data = []
    page = None
    while True:
        if page:
            params['page[cursor]'] = page
        r = requests.get(f"https://a.klaviyo.com/api/{endpoint}", headers=headers, params=params, timeout=60)
        if r.status_code == 429:
            time.sleep(5)
            continue
        if r.status_code != 200:
            print(f"  Klaviyo Error: {r.status_code} {r.text[:150]}", flush=True)
            return all_data
        data = r.json()
        all_data.extend(data.get('data', []))
        next_url = data.get('links', {}).get('next')
        if not next_url: break
        parsed = urllib.parse.urlparse(next_url)
        qs = urllib.parse.parse_qs(parsed.query)
        page = qs.get('page[cursor]', [None])[0]
        if not page: break
        time.sleep(0.5)
    return all_data

def sync_campaigns():
    print("\n📧 KLAVIYO CAMPAIGNS", flush=True)
    # v3 requires channel filter
    campaigns = klaviyo_get("campaigns/", params={
        'fields[campaign]': 'name,status,created_at,archived',
        'filter': 'equals(messages.channel,"email")'
    })
    print(f"  Found: {len(campaigns)}", flush=True)
    rows = []
    for c in campaigns:
        attrs = c.get('attributes', {})
        cid = c.get('id', '')
        name = attrs.get('name', '')
        status = attrs.get('status', '')
        created = attrs.get('created_at', '')
        archived = attrs.get('archived', False)
        created_ts = f"'{created}'" if created else 'NULL'
        rows.append(f"({sv(cid)}, {sv(name)}, {sv(status)}, {created_ts}::timestamptz, {sv(archived)})")
    
    # Add columns if not exist
    run_sql("ALTER TABLE lk_intel.klaviyo_campaigns ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE")
    
    n = batch_upsert('klaviyo_campaigns',
        ['campaign_id','name','status','created_at_klaviyo','archived'],
        rows, ['campaign_id'], ['name','status','archived'])
    print(f"  ✅ Upserted: {n}", flush=True)

def sync_flows():
    print("\n🌊 KLAVIYO FLOWS", flush=True)
    flows = klaviyo_get("flows/", params={
        'fields[flow]': 'name,status,created,updated,archived,trigger_type'
    })
    print(f"  Found: {len(flows)}", flush=True)
    rows = []
    for f in flows:
        attrs = f.get('attributes', {})
        fid = f.get('id', '')
        name = attrs.get('name', '')
        status = attrs.get('status', '')
        ftype = attrs.get('trigger_type', '')
        created = attrs.get('created', '')
        updated = attrs.get('updated', '')
        archived = attrs.get('archived', False)
        created_ts = f"'{created}'" if created else 'NULL'
        updated_ts = f"'{updated}'" if updated else 'NULL'
        rows.append(f"({sv(fid)}, {sv(name)}, {sv(status)}, {sv(ftype)}, {created_ts}::timestamptz, {updated_ts}::timestamptz, {sv(archived)})")
    
    run_sql("ALTER TABLE lk_intel.klaviyo_flows ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE")
    
    n = batch_upsert('klaviyo_flows',
        ['flow_id','name','status','flow_type','created_at_klaviyo','updated_at_klaviyo','archived'],
        rows, ['flow_id'], ['name','status','updated_at_klaviyo','archived'])
    print(f"  ✅ Upserted: {n}", flush=True)

def sync_lists():
    print("\n📋 KLAVIYO LISTS", flush=True)
    lists = klaviyo_get("lists/", params={
        'fields[list]': 'name,created,updated'
    })
    print(f"  Found: {len(lists)}", flush=True)
    rows = []
    for l in lists:
        attrs = l.get('attributes', {})
        lid = l.get('id', '')
        name = attrs.get('name', '')
        created = attrs.get('created', '')
        updated = attrs.get('updated', '')
        created_ts = f"'{created}'" if created else 'NULL'
        updated_ts = f"'{updated}'" if updated else 'NULL'
        rows.append(f"({sv(lid)}, {sv(name)}, NULL, 0, {created_ts}::timestamptz, {updated_ts}::timestamptz)")
    
    n = batch_upsert('klaviyo_lists',
        ['list_id','name','list_type','member_count','created_at_klaviyo','updated_at_klaviyo'],
        rows, ['list_id'], ['name','updated_at_klaviyo'])
    print(f"  ✅ Upserted: {n}", flush=True)

if __name__ == "__main__":
    subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "start", "lk_klaviyo_sync_v2"], capture_output=True)
    print("=" * 50, flush=True)
    start = time.time()
    try:
        sync_campaigns()
        time.sleep(1)
        sync_flows()
        time.sleep(1)
        sync_lists()
        elapsed = time.time() - start
        print(f"\n{'=' * 50}", flush=True)
        print(f"✅ KLAVIYO SYNC DONE ({elapsed:.0f}s)", flush=True)
        subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "end", "lk_klaviyo_sync_v2", "success"], capture_output=True)
    except Exception as e:
        print(f"❌ ERROR: {e}", flush=True)
        subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "end", "lk_klaviyo_sync_v2", "failure", str(e)], capture_output=True)
        import traceback
        traceback.print_exc()