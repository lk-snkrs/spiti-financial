#!/usr/bin/env python3
"""
LK Collection Sorting — Batch Script
Recebe handles via argumento e ordena apenas essas coleções.
Uso: python3 lk_sort_batch.py batch1|lote2|lote3
"""
import sys
sys.path.insert(0, "/root/.hermes/scripts")
from _hermes_config import PAT, SB_URL
import requests, json, time, sys
from datetime import datetime, timedelta

SHOP = "lk-sneakerss.myshopify.com"
import sys
sys.path.insert(0, "/root/.hermes/scripts")
from _hermes_config import PAT, SB_URL
import subprocess
TOKEN = subprocess.run(
    ["doppler", "secrets", "get", "SHOPIFY_ACCESS_TOKEN", "-p", "lc-keys", "-c", "prd", "--plain"],
    capture_output=True, text=True
).stdout.strip()
BASE = f"https://{SHOP}/admin/api/2025-01"
HEAD = {"X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json", "Accept": "application/json"}
MGMT = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
SQL = f"https://api.supabase.com/v1/projects/cnjimxglpktznenpbail/database/query"

BATCHES = {
    "lote1": [
        "adidas-todos-os-modelos","adidas-liberty-london","adidas-adi2000","adidas-adistar-jellyfish-pharrell-williams",
        "adidas-campus","adidas-gazelle","adidas-gazelle-indoor","adidas-handball-spezial","adidas-japan",
        "adidas-sl-72","adidas-superstar","adidas-taekwondo","adidas-taekwondo-mei-ballet","adidas-tokyo",
        "adidas-x-bad-bunny","adidas-x-clot","asics-todos-os-modelos","asics-gel-kayano-14","asics-gt-2160",
        "onitsuka-tiger-todos-os-modelos","onitsuka-tiger-california-78-ex","onitsuka-tiger-mexico-66",
        "onitsuka-tiger-mexico-66-exposed","onitsuka-tiger-mexico-66-fringe","onitsuka-tiger-mexico-66-sabot",
        "onitsuka-tiger-mexico-66-slip-on","onitsuka-tiger-mexico-66-tgrs","onitsuka-tiger-mexico-mid",
        "onitsuka-tiger-moage-co","onitsuka-tiger-otiger-court","onitsuka-tiger-tsunahiki-slip-on",
        "onitsuka-tiger-x-versace","puma-todos-os-modelos","puma-speedcat",
        "vans-todos-os-modelos","vans-skool","yeezy","yeezy-350","yeezy-foam-runner","yeezy-slide",
    ],
    "lote2": [
        "new-balance-todos-os-modelos","new-balance-1906l","new-balance-1906r","new-balance-204l",
        "new-balance-530","new-balance-550","on-running-todos-os-modelos","on-running-cloudsolo","on-running-cloudtilt",
        "air-jordan","air-jordan-1","air-jordan-3","air-jordan-4",
        "converse-todos-os-modelos","converse-chuck-70-high",
        "stussy","supreme","uniqlo-x-kaws","kith","lululemon","balenciaga",
        "comme-des-garcons","fear-of-god","slyce","nude-project","saint-studio",
        "aime-leon-dore","aime-leon-dore-x-porsche","loewe-x-on-running",
        "masp","masp-x-leonilson","nike-todos-os-modelos","nike-air-force-1","nike-air-max",
        "nike-air-rift","nike-cortez","nike-dunk","nike-dunk-high","nike-dunk-sb",
        "nike-mind-001","nike-vomero-5","nike-vomero-premium",
        "nike-jordan-jumpman-jack-travis-scott","air-jordan-travis-scott",
    ],
    "lote3": [
        "alo-yoga-1","alo-yoga-runner","alo-yoga-slipper-recovery",
        "accessorios","accessorios-alo-yoga","accessorios-best-sellers",
        "sneakers","roupas","athleisure","collectibles","eyewear",
        "camiseta-1","moletom-1","shorts","bone-streetwear","calca-streetwear",
        "camisa-streetwear","bermuda-streetwear","jaqueta-streetwear","short-streetwear",
        "tops-alo-yoga","calcas-alo-yoga","moletom-alo-yoga","kids-1","skims",
        "crocs","havaianas","autry","dane-se","dane-se-x-rubem-valentim",
        "denim-tears","egho-studios","jason-markk","labubu","palm-angels","pop-mart",
        "represent-clo","rhode","sufgang","bermuda-streetwear","bermuda-streetwear",
    ]
}

def sql(q):
    r = requests.post(SQL, headers={"Authorization": f"Bearer {MGMT}", "Content-Type": "application/json"}, json={"query": q}, timeout=30)
    try: d=r.json(); return d if isinstance(d,list) else []
    except: return []

def sg(p):
    r=requests.get(BASE+p,headers=HEAD,timeout=30); r.raise_for_status(); return r.json()
def sp(p,d):
    r=requests.put(BASE+p,headers=HEAD,json=d,timeout=30); r.raise_for_status(); return r.json()

now=datetime.now()
cutoff=(now-timedelta(days=60)).isoformat()
ago3m=(now-timedelta(days=90)).strftime("%Y-%m-%d")

sd=sql(f"SELECT product_id,SUM(quantity) as ts FROM lk_intel.order_items oi JOIN lk_intel.orders o ON oi.order_id=o.shopify_order_id WHERE o.created_at>='{ago3m}' AND o.financial_status='paid' AND quantity<100 AND line_total<50000 GROUP BY product_id")
sbp={str(r['product_id']):r['ts'] for r in sd if isinstance(r,dict)} if isinstance(sd,list) else {}

all_c=sg("/smart_collections.json?limit=250")['smart_collections']
id_map={c['handle']:c['id'] for c in all_c}

def sort_collection(cid, handle):
    prods=sg(f"/collections/{cid}/products.json?limit=250").get('products',[])
    if not prods: return (0,0,0,0)
    fp=[]
    for p in prods:
        try: fp.append(sg(f"/products/{p['id']}.json")['product'])
        except: fp.append(p)
        time.sleep(0.03)
    n,mv,d,e=[],[],[],[]
    for p in fp:
        pid=p['id']; ca=p.get('created_at',''); vn=ca>=cutoff if ca else False
        vs=p.get('variants',[])
        has_stk=any(v.get('inventory_management')!='shopify' or (v.get('inventory_quantity') or 0)>0 for v in vs)
        all_oos=all(v.get('inventory_management')=='shopify' and (v.get('inventory_quantity') or 0)<=0 for v in vs)
        has_ds=any(v.get('inventory_management')!='shopify' for v in vs)
        is_eos=all_oos and not has_ds
        ts=sbp.get(str(pid),0); p['_ts']=ts
        if vn and has_stk: n.append(p)
        elif is_eos: e.append(p)
        elif ts>0 and has_stk: mv.append(p)
        elif has_stk: d.append(p)
        else: e.append(p)
    n.sort(key=lambda x:x.get('created_at',''),reverse=True)
    mv.sort(key=lambda x:x['_ts'],reverse=True)
    d.sort(key=lambda x:x.get('created_at',''),reverse=True)
    e.sort(key=lambda x:x['_ts'],reverse=True)
    sp(f'/smart_collections/{cid}/order.json',{'sort_order':'manual','products':[p['id'] for p in n+mv+d+e]})
    return (len(n),len(mv),len(d),len(e))

if __name__=="__main__":
    batch=sys.argv[1] if len(sys.argv)>1 else "lote1"
    handles=BATCHES.get(batch,[])
    print(f"LOTE: {batch} — {len(handles)} coleções")
    total_n,total_mv,total_d,total_e=0,0,0,0
    for h in handles:
        cid=id_map.get(h)
        if not cid: print(f"  SKIP {h} (nao encontrado)"); continue
        try:
            n,mv,d,e=sort_collection(cid,h)
            print(f"  {h}: {n}n/{mv}mv/{d}d/{e}e")
            total_n+=n; total_mv+=mv; total_d+=d; total_e+=e
            time.sleep(0.3)
        except Exception as ex:
            print(f"  ERRO {h}: {ex}")
    print(f"RESULTADO: {total_n}n/{total_mv}mv/{total_d}d/{total_e}e ordenados")
