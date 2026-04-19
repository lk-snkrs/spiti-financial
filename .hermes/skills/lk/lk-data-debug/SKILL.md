---
name: lk-data-debug
description: Debug patterns for LK Intel sync scripts — timezone bugs, Shopify pagination, token audit, schema verification
tags: [lk, debug, sync, postgresql]
---

# LK Data Debug — Padrões de Diagnóstico

## Escopo
Debug de sync scripts LK (Shopify, Meta, Klaviyo, JudgeMe, GA4, Frenet, Transactions).

---

## Timezone Bug — PADRÃO CRÍTICO

### Sintoma
`CURRENT_DATE` no PostgreSQL = UTC. Scripts comparam datas UTC com datas BRT. Resultado: alertas falsos de "ZERO PEDIDOS" ou contagens erradas depois das 12h BRT.

### Como detectar
```bash
grep -n "CURRENT_DATE" /root/.hermes/scripts/lk_*.py
```
Se encontrar `CURRENT_DATE` sozinho (sem `AT TIME ZONE`), está errado.

### Como corrigir
```sql
-- ❌ ERRADO
WHERE order_created_at >= CURRENT_DATE

-- ✅ CORRETO (BRT)
WHERE (order_created_at AT TIME ZONE 'America/Sao_Paulo') >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date

-- Ranges (dias passados) são mais tolerantes:
WHERE order_created_at >= CURRENT_DATE - INTERVAL '7 days'  -- OK para ranges
-- Mas comparisons de dia atual precisam do fix BRT:
WHERE (order_created_at AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date
```

### Arquivos com timezone bugs (histórico)
- `lk_anomaly_check.py` — 8x `CURRENT_DATE` corrigido → `(CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date`
- `lk_anomaly_deepdive.py` — 8x corrigido
- `lk_morning_briefing.py` — `brt_today()` helper adicionado + import `datetime, timezone`

---

## Shopify Pagination Bug — PADRÃO CRÍTICO

### Sintoma
Erro: `Shopify Error: 400 {"errors":{"page_info":"Invalid value."}}`

### Causa Raiz
`page_info` cursor e `updated_at_min` timestamp são **incompatíveis** no Shopify API.
- `page_info` funciona sozinho (cursor pagination)
- `updated_at_min` funciona sozinho (timestamp filtering)
- Juntos: cursor fica inválido quando checkpoint é antigo

### Como corrigir
```python
def shopify_get(endpoint, params=None, pages=999):
    if params is None: params = {}
    params['limit'] = 250
    all_data = []
    use_timestamp = 'updated_at_min' in params  # detecta incompatibilidade
    
    for page_num in range(pages):
        r = requests.get(...)
        
        if r.status_code != 200:
            if page_num > 0 and use_timestamp and all_data:
                print(f"  Page {page_num} failed, continuing with timestamp fallback...")
                break
            print(f"  Shopify Error: {r.status_code}")
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
        
        if use_timestamp:
            print(f"  Page {page_num+1}: {len(records)} records (timestamp pagination)")
            break
        params = {'page_info': raw_cursor, 'limit': 250}
        time.sleep(0.5)
    return all_data
```

---

## Token Revogação — PADRÃO CRÍTICO

### Sintoma
23 scripts em `/tmp` tinham token `sbp_2297055c...` (revogado 19/04) em vez do token atual `sbp_5cd916...`.

### Prevenção
```bash
grep -r "sbp_[a-z0-9]\{40\}" /root/.hermes/scripts/*.py
grep -r "sbp_[a-z0-9]\{40\}" /tmp/lk_*.py
```

### Health Check (preventivo)
`/root/.hermes/scripts/hermes_health_check.py` — roda 05:00 BRT, escaneia PAT + tokens

### Tokens Válidos (2026-04-19)
- PAT: `sbp_5cd916280ef631f32155ee303c19f0f15d69223d` ✅
- Revogado: `sbp_2297055c60ee166d8e1aa8476660b13b465d23b4` ❌ (19/04)
- Shop token: `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` ✅

---

## Verificar Schema Real — Técnica

Sempre verificar schema via API antes de assumir colunas:

```python
import requests
PAT = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
PROJECT = "cnjimxglpktznenpbail"
MGMT = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
headers = {"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"}

# Listar colunas de uma tabela
query = """SELECT column_name FROM information_schema.columns 
WHERE table_schema = 'lk_intel' AND table_name = 'products' ORDER BY column_name;"""

# Listar TODAS as tabelas
query = """SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'lk_intel' ORDER BY table_name;"""
```

### Schema LK Intel (verificadas 2026-04-19)
| Tabela | Colunas importantes |
|--------|---------------------|
| `orders` | id, order_number, customer_id, financial_status, total_price, order_created_at |
| `variants` | **is_active** ✅, inventory_quantity, shopify_variant_id, sku, price |
| `products` | status (NÃO is_active), title, vendor, product_type |
| `inventory_levels` | available, on_hand, incoming, location_id, variant_id |
| `transactions` | tabela vazia (não usar) |
| `transactions_full` | id, order_id, kind, status, amount, gateway, created_at |
| `judgeme_reviews` | id, rating, title, body, created_at, verified |
| `ga4_daily_traffic` | event_date, sessions, users, pageviews |

### Armadilhas Comuns
- `products.is_active` → NÃO EXISTE. Usar `variants.is_active`
- `lk_intel.inventory` → NÃO EXISTE. Usar `inventory_levels` ou `variants.inventory_quantity`
- `orders.name` → NÃO EXISTE. Usar `orders.order_number`
- `orders.total_amount` → NÃO EXISTE. Usar `total_price`

---

## /tmp vs /root — Arquitetura

### Regra
- `/root/.hermes/scripts/` — **canonical** (versionado, backup-ok)
- `/tmp` — só scripts que o **cron executa** (cópia do /root)

### After editing
```bash
cp /root/.hermes/scripts/lk_*.py /tmp/
```

### After token renewal
```bash
sed -i 's/sbp_OLD/sbp_NEW/g' /root/.hermes/scripts/*.py
sed -i 's/sbp_OLD/sbp_NEW/g' /tmp/lk_*.py
python3 /root/.hermes/scripts/hermes_health_check.py
```

---

## Silent Sync Failures — PADRÃO CRÍTICO (19/04/2026)

### O problema
Scripts podem rodar SEM inserir dados — cron reporta OK, DB fica vazio. Ninguém percebe.

### 3 formas de falhar silenciosamente
1. **Token placeholder** — script usa `shpat_...f1ba` fake, API retorna 0, INSERT faz nothing
2. **Shop name errado** — API retorna 0 results, script continua "done"
3. **URL dobrada** — `lk-sneakerss.myshopify.com.myshopify.com` → SSL error silencioso

### Sintoma
- Cron reporta "OK" mas tabela não recebe dados novos
- `MAX(created_at)` da tabela para de avançar
- Sem erro no log do script

### Como detectar — VERIFICAÇÃO DE FRESCOR
Sempre verificar DADOS, não só status do cron:

```python
# Transactions freshness — comparar checkpoint com realidade
import requests
PAT = "sbp_5cd916280ef631f32155ee303c19f0d69223d"
r = requests.post(
    "https://api.supabase.com/v1/projects/cnjimxglpktznenpbail/database/query",
    headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
    json={"query": "SELECT MAX(created_at) as last_tx FROM lk_intel.transactions_full"}
)
last_tx = r.json()[0]["last_tx"]
age_hours = (datetime.now() - parse(last_tx)).total_seconds() / 3600
if age_hours > 12:
    print(f"⚠️  STALE: {age_hours:.0f}h sem transactions novas")
```

### Checklist de sanity check de sync
```python
def verify_sync_freshness():
    checks = {
        "orders": "SELECT MAX(created_at) FROM lk_intel.orders",
        "transactions": "SELECT MAX(created_at) FROM lk_intel.transactions_full",
        "variants": "SELECT COUNT(*) FROM lk_intel.variants",
    }
    # Para cada: comparar com hora atual, alertar se >6h sem update
```

---

## Shopify Shop Name — 2 Padrões de Concatenação (19/04/2026)

### Os 2 padrões
| Padrão | URL gerada | SHOP deve ser |
|--------|------------|---------------|
| `f"https://{SHOP}/admin/api/..."` | `https://lk-sneakerss.myshopify.com/admin/api/...` | `lk-sneakerss.myshopify.com` |
| `f"https://{SHOP}.myshopify.com/..."` | `https://lk-sneakerss.myshopify.com/admin/api/...` | `lk-sneakerss` |

### Como validar no health check
```python
# Detectar qual padrão o script usa
double_domain = re.search(r'\{SHOP\}\.myshopify\.com', content)
direct_domain = re.search(r'https://\{SHOP\}/', content)

if double_domain:
    # Script appenda .myshopify.com — SHOP deve ser só store name
    if 'myshopify.com' in shop_name:
        error = "SHOP contém domínio mas script já concatena .myshopify.com"
elif direct_domain:
    # Script usa SHOP como domínio direto
    if 'myshopify.com' not in shop_name:
        error = "SHOP precisa do domínio completo"
```

### Nomes válidos
- Store name: `lk-sneakerss`, `lksneakers`
- Full domain: `lk-sneakerss.myshopify.com`

### Regra prática
Novo script Shopify → testar API com curl ANTES de pushar:
```bash
curl -s "https://lk-sneakerss.myshopify.com/admin/api/2024-01/shop.json" \
  -H "X-Shopify-Access-Token: $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['shop']['name'])"
```

---

## Checkpoints de Sync (como verificar)

```python
import requests
PAT = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
r = requests.post(
    "https://api.supabase.com/v1/projects/cnjimxglpktznenpbail/database/query",
    headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
    json={"query": "SELECT entity, last_synced_at FROM lk_intel.sync_checkpoints ORDER BY last_synced_at DESC;"},
    timeout=10
)
for row in r.json():
    print(f"{row['entity']:<35} | {row['last_synced_at']}")
```

Output típico (2026-04-19):
```
shopify_variants         | 2026-04-19 13:04:57+00  ✅
shopify_orders           | 2026-04-19 01:25:42+00  ✅
ga4_daily_traffic        | 2026-04-18 22:35:27+00  ✅
transactions_full        | 2026-04-12 13:13:37+00  ⚠️ OLD (7 dias)
meta_ad_insights         | 2026-04-12 14:25:26+00  ❌ TOKEN (38 dias)
```

---

## Meta Ads Token — Recuperação

### Sintoma
`{"error": "Invalid OAuth access token"}` desde 12/03/2026.

### Solução (usuário precisa fazer)
1. Abre `business.facebook.com` → Settings → Ad Accounts
2. Gera novo `access_token` com permissão `ads_read`
3. Atualiza no Doppler:
```bash
doppler secrets set META_ACCESS_TOKEN=NOVO_TOKEN -p lc-keys -c prd
```

### Script usa Doppler (não hardcoded)
```python
META_TOKEN = subprocess.run(
    ["doppler", "secrets", "get", "META_ACCESS_TOKEN", "-p", "lc-keys", "-c", "prd", "--plain"],
    capture_output=True, text=True
).stdout.strip()
```

---

## 3 Camadas de Auto-Healing

| Camada | O que faz | Quando |
|--------|-----------|--------|
| `hermes_health_check.py` | Previne — audit PAT + scripts + crons | Diário 05:00 |
| `hermes_remediate.sh` | Conserta deterministic errors | Sob demanda |
| Health check pausa crons | Isola problema | Se detectar anomalia |
