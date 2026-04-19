#!/usr/bin/env python3
"""
LK Intel - JudgeMe Reviews Sync v2
"""
import sys
sys.path.insert(0, "/root/.hermes/scripts")
from _hermes_config import PAT, SB_URL
import json, time, requests
import sys
sys.path.insert(0, "/root/.hermes/scripts")
from _hermes_config import PAT, SB_URL
import subprocess

MGMT_TOKEN = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
PROJECT_ID = "cnjimxglpktznenpbail"
JUDGEME_API = "https://judge.me/api/v1"
SHOP = "lk-sneakerss.myshopify.com"
BATCH_SIZE = 10
SQL_DELAY = 0.6

JUDGEME_PRIVATE = subprocess.run(
    ["doppler", "secrets", "get", "JUDGEME_PRIVATE_TOKEN", "-p", "lc-keys", "-c", "prd", "--plain"],
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

def sync_reviews():
    print("\n⭐ JUDGEME REVIEWS", flush=True)
    all_reviews = []
    page = 1
    while True:
        r = requests.get(
            f"{JUDGEME_API}/reviews",
            params={'api_token': JUDGEME_PRIVATE, 'shop_domain': SHOP, 'page': page, 'per_page': 100},
            timeout=60
        )
        if r.status_code == 429:
            time.sleep(10)
            continue
        if r.status_code != 200:
            print(f"  Error: {r.status_code} {r.text[:100]}", flush=True)
            break
        data = r.json()
        reviews = data.get('reviews', [])
        if not reviews: break
        all_reviews.extend(reviews)
        print(f"  Page {page}: {len(reviews)} (total: {len(all_reviews)})", flush=True)
        if len(reviews) < 100: break
        page += 1
        time.sleep(0.5)
    
    print(f"  Total: {len(all_reviews)}", flush=True)
    
    rows = []
    for r in all_reviews:
        rid = str(r.get('id',''))
        pid = str(r.get('product_id',''))
        ptitle = r.get('product_title','')
        title = r.get('title','') or ''
        body = r.get('body','') or ''
        rating = float(r.get('rating',0) or 0)
        reviewer = r.get('reviewer')
        rname = remail = ''
        if isinstance(reviewer, dict):
            rname = reviewer.get('name','')
            remail = reviewer.get('email','')
        elif isinstance(reviewer, str):
            rname = reviewer
        verified_raw = r.get('verified', False)
        verified = True if verified_raw is True or verified_raw == 'yes' else False
        rdate = r.get('created_at','')
        helpful = int(r.get('helpful_count',0) or 0)
        curated = r.get('curated','')
        
        rdate_ts = f"'{rdate}'" if rdate else 'NULL'
        rows.append(
            f"({sv(rid)}, {sv(pid)}, {sv(ptitle[:500])}, "
            f"{sv(title[:500])}, {sv(body[:2000])}, "
            f"{rating}, {sv(rname[:200])}, {sv(remail[:200])}, "
            f"{sv(verified)}, {rdate_ts}::timestamptz, "
            f"{helpful}, {sv(curated)})"
        )
    
    n = batch_upsert('judgeme_reviews',
        ['review_id','product_id','product_title','title','body','rating','reviewer_name','reviewer_email','verified','review_date','helpful_count','curated'],
        rows, ['review_id'], ['title','body','rating','helpful_count','curated'])
    print(f"  ✅ Upserted: {n}", flush=True)
    
    # Product stats
    time.sleep(1)
    print("\n📊 Product stats...", flush=True)
    run_sql("""
    INSERT INTO lk_intel.judgeme_product_stats (product_id, product_title, avg_rating, review_count, five_star, four_star, three_star, two_star, one_star, updated_at)
    SELECT product_id, MAX(product_title), ROUND(AVG(rating)::numeric,2), COUNT(*),
        SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END), SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END), SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END),
        SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END), NOW()
    FROM lk_intel.judgeme_reviews WHERE product_id IS NOT NULL GROUP BY product_id
    ON CONFLICT (product_id) DO UPDATE SET
        product_title=EXCLUDED.product_title, avg_rating=EXCLUDED.avg_rating,
        review_count=EXCLUDED.review_count, five_star=EXCLUDED.five_star,
        four_star=EXCLUDED.four_star, three_star=EXCLUDED.three_star,
        two_star=EXCLUDED.two_star, one_star=EXCLUDED.one_star, updated_at=EXCLUDED.updated_at;
    """)
    rc = run_sql("SELECT count(*) as c FROM lk_intel.judgeme_product_stats")
    try:
        print(f"  ✅ Product stats: {json.loads(rc)[0]['c']} products", flush=True)
    except:
        print(f"  Done", flush=True)

if __name__ == "__main__":
    subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "start", "lk_judgeme_sync_v2"], capture_output=True)
    print("=" * 50, flush=True)
    start = time.time()
    try:
        sync_reviews()
        elapsed = time.time() - start
        print(f"\n{'=' * 50}", flush=True)
        print(f"✅ JUDGEME SYNC DONE ({elapsed:.0f}s)", flush=True)
        subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "end", "lk_judgeme_sync_v2", "success"], capture_output=True)
    except Exception as e:
        print(f"❌ ERROR: {e}", flush=True)
        subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "end", "lk_judgeme_sync_v2", "failure", str(e)], capture_output=True)
        import traceback
        traceback.print_exc()