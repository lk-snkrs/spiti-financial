#!/usr/bin/env python3
"""
LK Intel - Incremental Shopify Sync
Pulls only NEW/UPDATED records since last sync checkpoint.
Runs every hour via cron. Zero dependency on OpenClaw.
"""
import json, time, requests
from datetime import datetime, timedelta
import subprocess

# ── Config ──
MGMT_TOKEN = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
PROJECT_ID = "cnjimxglpktznenpbail"
SHOP = "lk-sneakerss.myshopify.com"
API_VER = "2024-01"
BATCH_SIZE = 10
SQL_DELAY = 0.6

SHOP_TOKEN = subprocess.run(
    ["doppler", "secrets", "get", "SHOPIFY_ACCESS_TOKEN", "-p", "lc-keys", "-c", "prd", "--plain"],
    capture_output=True, text=True
).stdout.strip()

# ── SQL helpers ──
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
        if r.status_code in (200, 201):
            return r.json()
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

# ── Checkpoint ──
def get_checkpoint(entity):
    r = run_sql(f"SELECT last_cursor, last_synced_at FROM lk_intel.sync_checkpoints WHERE entity={sv(entity)}")
    if isinstance(r, list) and r:
        return r[0].get('last_cursor'), r[0].get('last_synced_at')
    return None, None

def set_checkpoint(entity, cursor=None, synced_at=None):
    cursor_val = sv(cursor) if cursor else 'NULL'
    synced_val = f"'{synced_at}'" if synced_at else 'NOW()'
    run_sql(f"""
    INSERT INTO lk_intel.sync_checkpoints (entity, last_cursor, last_synced_at, source, updated_at)
    VALUES ({sv(entity)}, {cursor_val}, {synced_val}::timestamptz, 'shopify', NOW())
    ON CONFLICT (entity) DO UPDATE SET
        last_cursor = EXCLUDED.last_cursor,
        last_synced_at = EXCLUDED.last_synced_at,
        updated_at = EXCLUDED.updated_at;
    """)

# ── Shopify API ──
def shopify_get(endpoint, params=None, pages=999):
    if params is None: params = {}
    params['limit'] = 250
    all_data = []
    use_timestamp = 'updated_at_min' in params  # se tem timestamp, paginação por cursor não funciona bem
    for page_num in range(pages):
        r = requests.get(
            f"https://{SHOP}/admin/api/{API_VER}/{endpoint}.json",
            headers={"X-Shopify-Access-Token": SHOP_TOKEN},
            params=params, timeout=60
        )
        if r.status_code != 200:
            # Se page_info quebrou E já temos dados, tenta continuar com timestamp
            if page_num > 0 and use_timestamp and all_data:
                print(f"  Page {page_num} failed ({r.status_code}), continuing with timestamp fallback...", flush=True)
                break
            print(f"  Shopify Error: {r.status_code} {r.text[:100]}", flush=True)
            break
        data = r.json()
        key = endpoint.split('/')[-1]
        records = data.get(key, data.get('customers', data.get('orders', [])))
        all_data.extend(records)
        link = r.headers.get('Link', '')
        if 'rel="next"' not in link:
            break
        next_url = [l for l in link.split(',') if 'rel="next"' in l][0]
        raw_cursor = next_url.split('<')[1].split('>')[0]
        params = {'page_info': raw_cursor, 'limit': 250}
        # Timestamp e page_info são incompatíveis — se tínhamos timestamp, não use mais cursor
        if use_timestamp:
            print(f"  Page {page_num+1}: {len(records)} records (timestamp pagination)", flush=True)
            break  # volta pro loop principal com o que temos
        time.sleep(0.5)
    return all_data

def shopify_count(endpoint, params=None):
    if params is None: params = {}
    r = requests.get(
        f"https://{SHOP}/admin/api/{API_VER}/{endpoint}/count.json",
        headers={"X-Shopify-Access-Token": SHOP_TOKEN},
        params=params, timeout=30
    )
    if r.status_code == 200:
        return r.json().get('count', 0)
    return 0

# ── Batch insert ──
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
        else:
            if '429' in str(result):
                time.sleep(5)
                result2 = run_sql(sql)
                if isinstance(result2, list) or 'error' not in str(result2):
                    inserted += len(batch)
        time.sleep(SQL_DELAY)
    return inserted

# ════════════════════════════════════════
# SYNC FUNCTIONS
# ════════════════════════════════════════

def sync_products_incremental():
    """Sync products updated since last checkpoint"""
    print("\n📦 PRODUCTS (incremental)", flush=True)
    _, last_sync = get_checkpoint('shopify_products')
    
    since = None
    if last_sync:
        since = (datetime.fromisoformat(str(last_sync).replace('+00:00','')) - timedelta(minutes=5)).isoformat()
        print(f"  Since: {since}", flush=True)
    
    params = {'status': 'any'}
    if since:
        params['updated_at_min'] = since
    
    products = shopify_get("products", params)
    print(f"  Fetched: {len(products)}", flush=True)
    
    if not products:
        print("  No changes", flush=True)
        set_checkpoint('shopify_products', synced_at=datetime.utcnow().isoformat())
        return
    
    rows = []
    for p in products:
        pid = p.get('id')
        title = p.get('title','')
        handle = p.get('handle','')
        body = p.get('body_html','') or ''
        ptype = p.get('product_type','')
        vendor = p.get('vendor','')
        status = p.get('status','')
        tags = p.get('tags','')
        img = ''
        if p.get('image'): img = p['image'].get('src','') or ''
        raw = json.dumps(p, ensure_ascii=False)
        created = p.get('created_at','')
        updated = p.get('updated_at','')
        
        tags_arr = f"ARRAY[{','.join(sv(t.strip()) for t in tags.split(',') if t.strip())}]::text[]" if tags else "'{}'::text[]"
        rows.append(
            f"({pid}, {sv(title)}, {sv(handle)}, {sv(body)}, {sv(ptype)}, "
            f"{sv(vendor)}, {sv(status)}, {tags_arr}, {sv(img)}, "
            f"'shopify', {sv(raw)}, '{created}'::timestamptz, '{updated}'::timestamptz, NOW())"
        )
    
    n = batch_upsert('products',
        ['shopify_id','title','handle','body_html','product_type','vendor','status','tags','featured_image_url','source','raw','product_created_at','product_updated_at','updated_at'],
        rows, ['shopify_id'], ['title','status','tags','featured_image_url','product_updated_at','updated_at'])
    print(f"  ✅ Upserted: {n}", flush=True)
    set_checkpoint('shopify_products', synced_at=datetime.utcnow().isoformat())

def sync_variants_incremental():
    """Sync variants from products (Shopify doesn't have separate variant endpoint for incremental)"""
    print("\n🏷️ VARIANTS (with products)", flush=True)
    _, last_sync = get_checkpoint('shopify_variants')
    
    since = None
    if last_sync:
        since = (datetime.fromisoformat(str(last_sync).replace('+00:00','')) - timedelta(minutes=5)).isoformat()
    
    params = {'status': 'any'}
    if since:
        params['updated_at_min'] = since
    
    products = shopify_get("products", params)
    
    all_variants = []
    for p in products:
        for v in p.get('variants', []):
            all_variants.append(v)
    
    print(f"  Fetched: {len(all_variants)} variants from {len(products)} products", flush=True)
    
    if not all_variants:
        print("  No changes", flush=True)
        set_checkpoint('shopify_variants', synced_at=datetime.utcnow().isoformat())
        return
    
    rows = []
    for v in all_variants:
        vid = v.get('id')
        pid = v.get('product_id')
        title = v.get('title','')
        sku = v.get('sku','')
        barcode = v.get('barcode','')
        price = v.get('price','0')
        compare = v.get('compare_at_price')
        cost = v.get('inventory_item_id')  # we'll fix cost later
        inv = v.get('inventory_quantity', 0)
        inv_item = v.get('inventory_item_id')
        o1 = v.get('option1','')
        o2 = v.get('option2','')
        o3 = v.get('option3','')
        weight = v.get('grams', 0)
        wunit = v.get('weight_unit','kg')
        shipping = v.get('requires_shipping', False)
        taxable = v.get('taxable', False)
        created = v.get('created_at','')
        updated = v.get('updated_at','')
        
        price_num = float(price) if price else 0
        compare_num = float(compare) if compare else 'NULL'
        cost_val = 'NULL'  # Shopify doesn't expose cost via API easily
        
        rows.append(
            f"({vid}, {pid}, {sv(title)}, {sv(sku)}, {sv(barcode)}, "
            f"{price_num}, {compare_num}, {cost_val}, {inv}, {inv_item or 'NULL'}, "
            f"{sv(o1)}, {sv(o2)}, {sv(o3)}, {weight}, {sv(wunit)}, "
            f"{sv(shipping)}, {sv(taxable)}, TRUE, "
            f"'{created}'::timestamptz, '{updated}'::timestamptz, NOW())"
        )
    
    n = batch_upsert('variants',
        ['shopify_variant_id','shopify_product_id','title','sku','barcode','price','compare_at_price','cost','inventory_quantity','inventory_item_id','option1','option2','option3','weight_grams','weight_unit','requires_shipping','taxable','is_active','variant_created_at','variant_updated_at','updated_at'],
        rows, ['shopify_variant_id'], ['price','compare_at_price','inventory_quantity','variant_updated_at','updated_at'])
    print(f"  ✅ Upserted: {n}", flush=True)
    set_checkpoint('shopify_variants', synced_at=datetime.utcnow().isoformat())

def sync_customers_incremental():
    """Sync customers updated since last checkpoint"""
    print("\n👤 CUSTOMERS (incremental)", flush=True)
    _, last_sync = get_checkpoint('shopify_customers')
    
    params = {'limit': 250}
    if last_sync:
        since = (datetime.fromisoformat(str(last_sync).replace('+00:00','')) - timedelta(minutes=5)).isoformat()
        params['updated_at_min'] = since
        print(f"  Since: {since}", flush=True)
    
    customers = shopify_get("customers", params)
    print(f"  Fetched: {len(customers)}", flush=True)
    
    if not customers:
        print("  No changes", flush=True)
        set_checkpoint('shopify_customers', synced_at=datetime.utcnow().isoformat())
        return
    
    rows = []
    for c in customers:
        cid = c.get('id')
        email = c.get('email','') or ''
        fname = c.get('first_name','') or ''
        lname = c.get('last_name','') or ''
        full = f"{fname} {lname}".strip()
        phone = c.get('phone','') or ''
        tags = c.get('tags','') or ''
        orders_count = c.get('orders_count', 0) or 0
        total_spent = float(c.get('total_spent','0') or 0)
        accepts = c.get('accepts_marketing', False)
        note = c.get('note','') or ''
        created = c.get('created_at','')
        updated = c.get('updated_at','')
        
        tags_arr = f"ARRAY[{','.join(sv(t.strip()) for t in tags.split(',') if t.strip())}]::text[]" if tags else "'{}'::text[]"
        rows.append(
            f"({cid}, {cid}, {sv(email)}, {sv(fname)}, {sv(lname)}, {sv(full)}, "
            f"{sv(phone)}, {tags_arr}, {sv(note)}, {sv(accepts)}, "
            f"{orders_count}, {total_spent:.2f}, 'shopify', NULL, "
            f"'{created}'::timestamptz, '{updated}'::timestamptz, NOW())"
        )
    
    n = batch_upsert('customers',
        ['id','shopify_customer_id','email','first_name','last_name','full_name','phone','tags','notes','accepts_marketing','orders_count','total_spent','source','raw','customer_created_at','customer_updated_at','updated_at'],
        rows, ['shopify_customer_id'], ['email','total_spent','orders_count','customer_updated_at','updated_at'])
    print(f"  ✅ Upserted: {n}", flush=True)
    set_checkpoint('shopify_customers', synced_at=datetime.utcnow().isoformat())

def sync_orders_incremental():
    """Sync orders updated since last checkpoint"""
    print("\n🛒 ORDERS (incremental)", flush=True)
    _, last_sync = get_checkpoint('shopify_orders')
    
    params = {'limit': 250, 'status': 'any'}
    if last_sync:
        since = (datetime.fromisoformat(str(last_sync).replace('+00:00','')) - timedelta(minutes=5)).isoformat()
        params['updated_at_min'] = since
        print(f"  Since: {since}", flush=True)
    
    orders = shopify_get("orders", params)
    print(f"  Fetched: {len(orders)}", flush=True)
    
    if not orders:
        print("  No changes", flush=True)
        set_checkpoint('shopify_orders', synced_at=datetime.utcnow().isoformat())
        return
    
    order_rows = []
    item_rows = []
    refund_rows = []
    
    for o in orders:
        oid = o.get('id')
        onum = str(o.get('order_number',''))
        email = o.get('email','') or ''
        phone = o.get('phone','') or ''
        cid = o.get('customer', {}).get('id') if o.get('customer') else None
        fin = o.get('financial_status','')
        ful = o.get('fulfillment_status','') or ''
        cur = o.get('currency','BRL')
        subtotal = float(o.get('subtotal_price',0) or 0)
        total = float(o.get('total_price',0) or 0)
        discount = float(o.get('total_discounts',0) or 0)
        shipping = 0
        try:
            shipping = float(o.get('total_shipping_price_set',{}).get('shop_money',{}).get('amount',0) or 0)
        except: pass
        tax = float(o.get('total_tax',0) or 0)
        tags = o.get('tags','') or ''
        note = o.get('note','') or ''
        source = o.get('source_name','')
        cancelled = o.get('cancelled_at')
        closed = o.get('closed_at')
        processed = o.get('processed_at')
        billing = json.dumps(o.get('billing_address'), ensure_ascii=False) if o.get('billing_address') else 'NULL'
        shipping_addr = json.dumps(o.get('shipping_address'), ensure_ascii=False) if o.get('shipping_address') else 'NULL'
        raw = json.dumps(o, ensure_ascii=False)
        created = o.get('created_at','')
        updated = o.get('updated_at','')
        
        tags_arr = f"ARRAY[{','.join(sv(t.strip()) for t in tags.split(',') if t.strip())}]::text[]" if tags else "'{}'::text[]"
        billing_val = sv(billing) if billing != 'NULL' else 'NULL'
        shipping_val = sv(shipping_addr) if shipping_addr != 'NULL' else 'NULL'
        
        order_rows.append(
            f"({oid}, {oid}, {sv(onum)}, {sv(email)}, {sv(phone)}, "
            f"{cid or 'NULL'}, {sv(fin)}, {sv(ful)}, {sv(cur)}, "
            f"{subtotal:.2f}, {total:.2f}, {discount:.2f}, {shipping:.2f}, {tax:.2f}, "
            f"{tags_arr}, {sv(note)}, {sv(source)}, "
            f"{sv(cancelled)}, {sv(closed)}, {sv(processed)}, "
            f"{billing_val}::jsonb, {shipping_val}::jsonb, "
            f"{sv(raw)}::jsonb, "
            f"'{created}'::timestamptz, '{updated}'::timestamptz, NOW())"
        )
        
        for li in o.get('line_items', []):
            li_id = li.get('id')
            pid = li.get('product_id')
            vid = li.get('variant_id')
            title = li.get('title','')
            vtitle = li.get('variant_title','') or ''
            sku = li.get('sku','')
            vendor = li.get('vendor','')
            ptype = li.get('product_type', li.get('properties',{}).get('product_type','')) if isinstance(li.get('properties'), dict) else ''
            qty = int(li.get('quantity',0) or 0)
            price = float(li.get('price',0) or 0)
            total_disc = float(li.get('total_discount',0) or 0)
            compare = li.get('compare_at_price')
            
            compare_num = float(compare) if compare else 'NULL'
            
            item_rows.append(
                f"({li_id}, {li_id}, {oid}, {pid or 'NULL'}, {vid or 'NULL'}, "
                f"{sv(title)}, {sv(vtitle)}, {sv(sku)}, {sv(vendor)}, "
                f"{sv(ptype)}, {qty}, {price:.2f}, {price*qty:.2f}, "
                f"{total_disc:.2f}, {compare_num}, 'shopify', NULL, "
                f"'{created}'::timestamptz, NOW())"
            )
        
        # Refunds — only successful transactions count
        for r in o.get('refunds', []):
            # Sum only successful refund transactions
            total_ref = sum(
                float(t.get('amount', '0') or '0')
                for t in r.get('transactions', [])
                if t.get('status') == 'success' and t.get('kind') == 'refund'
            )
            refund_rows.append(
                f"({oid}, {oid}, {oid}, {total_ref:.2f}, "
                f"{sv(r.get('note', '') or '')}, "
                f"{sv(json.dumps(r, ensure_ascii=False))}, "
                f"'{created}'::timestamptz)"
            )
    
    # Insert orders
    n_orders = batch_upsert('orders',
        ['id','shopify_order_id','order_number','email','phone','customer_id','financial_status','fulfillment_status','currency','subtotal_price','total_price','total_discount','total_shipping','total_tax','tags','note','source_name','cancelled_at','closed_at','processed_at','billing_address','shipping_address','raw','order_created_at','order_updated_at','updated_at'],
        order_rows, ['shopify_order_id'],
        ['fulfillment_status','total_price','order_updated_at','updated_at'])
    # NOTE: financial_status intentionally omitted from update_cols.
    # The webhook (refunds/create, orders/cancelled) is the authoritative source for
    # financial_status changes. The sync only sets it on INSERT (new orders).
    # This prevents the April-9 bug where bulk re-sync overwrote 'refunded'/'voided'
    # orders back to 'paid'.
    print(f"  ✅ Orders: {n_orders}", flush=True)
    
    # Insert order items (drop FK temporarily for safety)
    run_sql("ALTER TABLE lk_intel.order_items DROP CONSTRAINT IF EXISTS order_items_variant_id_fkey")
    n_items = batch_upsert('order_items',
        ['id','shopify_line_item_id','order_id','product_id','variant_id','title','variant_title','sku','vendor','product_type','quantity','unit_price','line_total','total_discount','compare_at_price','source','raw','created_at','updated_at'],
        item_rows, ['shopify_line_item_id'],
        ['quantity','unit_price','line_total','total_discount','updated_at'])
    print(f"  ✅ Order Items: {n_items}", flush=True)
    
    # Insert refunds (only successful transactions count — status=success, kind=refund)
    if refund_rows:
        n_refunds = batch_upsert('refunds',
            ['id','shopify_refund_id','order_id','total_refunded','note','raw','created_at'],
            refund_rows, ['shopify_refund_id'],
            ['total_refunded','note','raw','updated_at'])
        print(f"  ✅ Refunds: {n_refunds}", flush=True)
    
    set_checkpoint('shopify_orders', synced_at=datetime.utcnow().isoformat())

def sync_inventory_incremental():
    """Sync inventory levels"""
    print("\n📊 INVENTORY (full refresh - small dataset)", flush=True)
    
    # Get all locations
    locations = shopify_get("locations")
    print(f"  Locations: {len(locations)}", flush=True)
    
    # Get inventory for each variant (via products)
    # Shopify inventory_items API
    all_levels = []
    for loc in locations:
        loc_id = loc.get('id')
        r = requests.get(
            f"https://{SHOP}/admin/api/{API_VER}/inventory_levels.json",
            headers={"X-Shopify-Access-Token": SHOP_TOKEN},
            params={'location_id': loc_id, 'limit': 250},
            timeout=60
        )
        if r.status_code == 200:
            levels = r.json().get('inventory_levels', [])
            all_levels.extend(levels)
        time.sleep(0.3)
    
    print(f"  Fetched: {len(all_levels)} levels", flush=True)
    
    if not all_levels:
        set_checkpoint('shopify_inventory', synced_at=datetime.utcnow().isoformat())
        return
    
    # Truncate and re-insert (inventory changes frequently, easier to refresh)
    run_sql("TRUNCATE lk_intel.inventory_levels")
    
    rows = []
    for il in all_levels:
        inv_item = il.get('inventory_item_id')
        loc_id = il.get('location_id')
        available = il.get('available', 0) or 0
        
        # Look up variant_id from variants table
        rows.append(
            f"({inv_item}, {loc_id}, {available}, 0, 0, 0, NOW())"
        )
    
    n = batch_upsert('inventory_levels',
        ['variant_id','location_id','available','on_hand','committed','incoming','updated_at'],
        rows, ['variant_id','location_id'], ['available','updated_at'])
    print(f"  ✅ Upserted: {n}", flush=True)
    set_checkpoint('shopify_inventory', synced_at=datetime.utcnow().isoformat())

# ════════════════════════════════════════
# MAIN
# ════════════════════════════════════════
if __name__ == "__main__":
    print("🔄 LK INTEL - Shopify Incremental Sync", flush=True)
    print("=" * 50, flush=True)
    start = time.time()
    
    try:
        # Audit trail
        import subprocess
        subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "start", "lk_shopify_sync", "Incremental sync all entities"],
                      capture_output=True, timeout=10)

        sync_products_incremental()
        time.sleep(1)
        sync_variants_incremental()
        time.sleep(1)
        sync_customers_incremental()
        time.sleep(1)
        sync_orders_incremental()
        time.sleep(1)
        sync_inventory_incremental()
        
        elapsed = time.time() - start
        print(f"\n{'=' * 50}", flush=True)
        print(f"✅ SHOPIFY SYNC DONE ({elapsed:.0f}s)", flush=True)

        # Audit trail
        import subprocess
        subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "end", "lk_shopify_sync", f"Success — {elapsed:.0f}s"],
                      capture_output=True, timeout=10)

        # Quick validation
        try:
            r = run_sql("""
            SELECT
                (SELECT count(*) FROM lk_intel.products) as products,
                (SELECT count(*) FROM lk_intel.variants) as variants,
                (SELECT count(*) FROM lk_intel.customers) as customers,
                (SELECT count(*) FROM lk_intel.orders) as orders,
                (SELECT count(*) FROM lk_intel.order_items) as items
            """)
            if isinstance(r, list) and r:
                for k, v in r[0].items():
                    print(f"  {k}: {v}", flush=True)
        except Exception as e:
            print(f"  (validation skipped: {e})", flush=True)
    except Exception as e:
        print(f"❌ ERROR: {e}", flush=True)
        # Audit trail
        import subprocess
        subprocess.run(["python3", "/root/.hermes/scripts/sync_log.py", "end", "lk_shopify_sync", f"ERROR: {e}"],
                      capture_output=True, timeout=10)
        import traceback
        traceback.print_exc()