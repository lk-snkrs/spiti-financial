#!/usr/bin/env python3
"""
LK Intel - GA4 Sync v4
Traffic, source/medium, product performance
INCREMENTAL: uses sync_checkpoints, resumes from last date
"""
import json, time, requests, jwt
from datetime import date, timedelta
import subprocess

MGMT_TOKEN = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
PROJECT_ID = "cnjimxglpktznenpbail"
GA4_PROPERTY = "348553567"
BATCH_SIZE = 10
SQL_DELAY = 0.6
CHECKPOINT_NAME = "ga4_daily_traffic"

with open('/tmp/fluid_griffin_sa.json') as f:
    GA4_SA = json.load(f)

def run_sql(sql_str, retries=3):
    for attempt in range(retries):
        r = requests.post(
            f"https://api.supabase.com/v1/projects/{PROJECT_ID}/database/query",
            headers={"Authorization": f"Bearer {MGMT_TOKEN}", "Content-Type": "application/json"},
            json={"query": sql_str}, timeout=60
        )
        if r.status_code == 429:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code in (200, 201):
            return r.json()
        return {"error": f"{r.status_code}: {r.text[:200]}"}
    return {"error": "429 max retries"}

def get_checkpoint():
    """Get last synced date from checkpoint system"""
    result = run_sql(f"""
        SELECT last_cursor, last_synced_at FROM lk_intel.sync_checkpoints
        WHERE entity = '{CHECKPOINT_NAME}'
        ORDER BY updated_at DESC LIMIT 1;
    """)
    if result and isinstance(result, list) and len(result) > 0:
        row = result[0]
        cursor = row.get('last_cursor')
        if cursor:
            return cursor  # ISO date string like "2025-11-06"
    return None

def save_checkpoint(cursor):
    """Save checkpoint with current timestamp"""
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    run_sql(f"""
        INSERT INTO lk_intel.sync_checkpoints (entity, last_cursor, last_synced_at, source, updated_at)
        VALUES ('{CHECKPOINT_NAME}', '{cursor}', '{now}', 'ga4', '{now}')
        ON CONFLICT (entity) DO UPDATE SET
            last_cursor = EXCLUDED.last_cursor,
            last_synced_at = EXCLUDED.last_synced_at,
            updated_at = EXCLUDED.updated_at;
    """)

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
        sql_str = f"""INSERT INTO lk_intel.{table} ({', '.join(columns)}) VALUES {', '.join(batch)}
        ON CONFLICT ({', '.join(conflict_cols)}) DO UPDATE SET
            {', '.join(f'{c}=EXCLUDED.{c}' for c in update_cols)};"""
        result = run_sql(sql_str)
        if isinstance(result, list) or (isinstance(result, dict) and 'error' not in result):
            inserted += len(batch)
        elif '429' in str(result):
            time.sleep(5)
            result2 = run_sql(sql_str)
            if isinstance(result2, list) or 'error' not in str(result2):
                inserted += len(batch)
        time.sleep(SQL_DELAY)
    return inserted

def get_ga4_token():
    now = int(time.time())
    payload = {
        'iss': GA4_SA['client_email'],
        'scope': 'https://www.googleapis.com/auth/analytics.readonly',
        'aud': 'https://oauth2.googleapis.com/token',
        'iat': now, 'exp': now + 3600
    }
    signed = jwt.encode(payload, GA4_SA['private_key'], algorithm='RS256')
    r = requests.post('https://oauth2.googleapis.com/token',
        data={'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': signed})
    return r.json()['access_token']

def ga4_report(dimensions, metrics, start, end):
    token = get_ga4_token()
    r = requests.post(
        f"https://analyticsdata.googleapis.com/v1beta/properties/{GA4_PROPERTY}:runReport",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "dateRanges": [{"startDate": start, "endDate": end}],
            "dimensions": [{"name": d} for d in dimensions],
            "metrics": [{"name": m} for m in metrics],
            "limit": "100000"
        }, timeout=120
    )
    if r.status_code != 200:
        print(f"  GA4 Error: {r.status_code} {r.text[:150]}", flush=True)
        return []
    return r.json().get('rows', [])

def parse_date(val):
    if not val or len(val) != 8: return None
    return f"{val[:4]}-{val[4:6]}-{val[6:8]}"

def mval(mets, idx, default=0, typ='int'):
    v = mets[idx].get('value', str(default)) if len(mets) > idx else str(default)
    try:
        return int(float(v)) if typ == 'int' else float(v)
    except:
        return default

def sync_ga4():
    print("\n📈 GA4 SYNC v4 (INCREMENTAL)", flush=True)
    
    # Get checkpoint — last synced date
    last_cursor = get_checkpoint()
    
    if last_cursor:
        # Resume from the day AFTER last_cursor
        start_date = date.fromisoformat(last_cursor) + timedelta(days=1)
        print(f"  📍 Resuming from: {start_date} (last synced: {last_cursor})", flush=True)
    else:
        # First run — use a reasonable start date (3 months back to catch any gaps)
        start_date = date.today() - timedelta(days=7)
        print(f"  🆕 First run — fetching last 7 days: {start_date}", flush=True)
    
    end_date = date.today()
    
    if start_date > end_date:
        print("  ✅ Already up to date!", flush=True)
        return
    
    total = 0
    current = start_date
    
    while current <= end_date:
        current_end = min(current + timedelta(days=29), end_date)
        s = current.isoformat()
        e = current_end.isoformat()
        print(f"  📅 {s} to {e}", flush=True)
        
        # Traffic by page
        rows_data = ga4_report(
            ['date', 'pagePath', 'deviceCategory', 'country'],
            ['sessions', 'activeUsers', 'newUsers', 'screenPageViews', 'averageSessionDuration', 'bounceRate', 'eventCount', 'ecommercePurchases', 'totalRevenue'],
            s, e
        )
        
        if rows_data:
            rows = []
            for row in rows_data:
                dims = row.get('dimensionValues', [])
                mets = row.get('metricValues', [])
                d_date = parse_date(dims[0].get('value','')) if len(dims)>0 else None
                d_page = dims[1].get('value','')[:500] if len(dims)>1 else ''
                d_device = dims[2].get('value','')[:50] if len(dims)>2 else ''
                d_country = dims[3].get('value','')[:100] if len(dims)>3 else ''
                rows.append(
                    f"({sv(d_date)}, {sv(d_page)}, NULL, NULL, NULL, NULL, "
                    f"{sv(d_device)}, {sv(d_country)}, "
                    f"{mval(mets,0)}, {mval(mets,1)}, {mval(mets,2)}, {mval(mets,3)}, "
                    f"{mval(mets,4,0,'float')}, {mval(mets,5,0,'float')}, "
                    f"{mval(mets,6)}, {mval(mets,7)}, {mval(mets,8,0,'float')})"
                )
            n = batch_upsert('ga4_daily_traffic',
                ['date','page_path','page_title','source','medium','campaign','device_category','country',
                 'sessions','active_users','new_users','pageviews','engagement_time_seconds','bounce_rate',
                 'event_count','conversions','revenue'],
                rows, ['date','page_path','source','medium','device_category','country'],
                ['sessions','active_users','new_users','pageviews','engagement_time_seconds','bounce_rate','event_count','conversions','revenue'])
            total += n
            print(f"    Traffic: {n}", flush=True)
        
        # Source/medium
        src_rows = ga4_report(
            ['date', 'source', 'medium'],
            ['sessions', 'activeUsers', 'newUsers', 'eventCount', 'ecommercePurchases', 'totalRevenue'],
            s, e
        )
        if src_rows:
            rows = []
            for row in src_rows:
                dims = row.get('dimensionValues', [])
                mets = row.get('metricValues', [])
                d_date = parse_date(dims[0].get('value','')) if len(dims)>0 else None
                d_src = dims[1].get('value','')[:100] if len(dims)>1 else ''
                d_med = dims[2].get('value','')[:50] if len(dims)>2 else ''
                rows.append(
                    f"({sv(d_date)}, '(aggregate)', NULL, {sv(d_src)}, {sv(d_med)}, NULL, NULL, NULL, "
                    f"{mval(mets,0)}, {mval(mets,1)}, {mval(mets,2)}, 0, 0, 0, "
                    f"{mval(mets,3)}, {mval(mets,4)}, {mval(mets,5,0,'float')})"
                )
            n = batch_upsert('ga4_daily_traffic',
                ['date','page_path','page_title','source','medium','campaign','device_category','country',
                 'sessions','active_users','new_users','pageviews','engagement_time_seconds','bounce_rate',
                 'event_count','conversions','revenue'],
                rows, ['date','page_path','source','medium','device_category','country'],
                ['sessions','active_users','new_users','event_count','conversions','revenue'])
            total += n
            print(f"    Source/medium: {n}", flush=True)
        
        # Products
        prod_rows = ga4_report(
            ['date', 'itemName', 'itemCategory'],
            ['itemViewClicks', 'addToCarts', 'checkouts', 'ecommercePurchases', 'itemsPurchased', 'itemRevenue'],
            s, e
        )
        if prod_rows:
            rows = []
            for row in prod_rows:
                dims = row.get('dimensionValues', [])
                mets = row.get('metricValues', [])
                d_date = parse_date(dims[0].get('value','')) if len(dims)>0 else None
                d_name = dims[1].get('value','')[:500] if len(dims)>1 else ''
                d_cat = dims[2].get('value','')[:200] if len(dims)>2 else ''
                rows.append(
                    f"({sv(d_date)}, {sv(d_name[:100])}, {sv(d_name)}, {sv(d_cat)}, NULL, "
                    f"{mval(mets,0)}, {mval(mets,1)}, {mval(mets,2)}, {mval(mets,3)}, "
                    f"{mval(mets,4)}, {mval(mets,5,0,'float')}, 0)")
            n = batch_upsert('ga4_product_performance',
                ['date','product_id','product_name','product_category','product_brand',
                 'item_views','add_to_carts','checkouts','purchases','quantity_purchased','item_revenue','item_list_price'],
                rows, ['date','product_id'],
                ['item_views','add_to_carts','checkouts','purchases','quantity_purchased','item_revenue'])
            total += n
            print(f"    Products: {n}", flush=True)
        
        # Save checkpoint after each chunk
        save_checkpoint(current_end.isoformat())
        
        current = current_end + timedelta(days=1)
        time.sleep(2)
    
    print(f"  ✅ Total: {total} rows", flush=True)

if __name__ == "__main__":
    subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "start", "lk_ga4_sync_v4"], capture_output=True)
    print("=" * 50, flush=True)
    start = time.time()
    try:
        sync_ga4()
        elapsed = time.time() - start
        print(f"\n{'=' * 50}", flush=True)
        print(f"✅ GA4 SYNC DONE ({elapsed/60:.1f} min)", flush=True)
        subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "end", "lk_ga4_sync_v4", "success"], capture_output=True)
    except Exception as e:
        print(f"❌ ERROR: {e}", flush=True)
        subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "end", "lk_ga4_sync_v4", "failure", str(e)], capture_output=True)
        import traceback
        traceback.print_exc()
