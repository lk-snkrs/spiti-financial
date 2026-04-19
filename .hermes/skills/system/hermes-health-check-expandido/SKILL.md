---
name: hermes-health-check-expandido
description: Expandido health check para verificar tokens dentro dos scripts e freshness dos dados
triggers: ["health check", "sistema 100%", "tudo ok", "sem erros"]
---

# Hermes Health Check Expandido

## Regra COO
"Sistema 100%" ≠ cron não reportou erro. Verificar DADOS, não só status.

## Checks Obrigatórios

### 1. Tokens nos Scripts (não só PAT)
```bash
grep -r "sbp_\|shpat_" /root/.hermes/scripts/*.py | grep -v "^#" | grep -v "sbp_5cd91628" 
# Detectar: tokens placeholder, tokens revogados, tokens hardcoded
```

### 2. Shopify Shop Name
Cada script concatena diferente:
- `f"https://{SHOP}/admin/..."` → precisa `lk-sneakerss.myshopify.com`
- `f"https://{SHOP}.myshopify.com/..."` → precisa `lk-sneakerss`

### 3. Freshness dos Dados
```sql
-- Transactions: última insert há < 24h?
SELECT MAX(created_at) FROM lk_intel.transactions_full;

-- Orders hoje: pedidos vs ontem
SELECT COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) as today,
       COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE - 1) as yesterday
FROM lk_intel.orders;
```

### 4. Script Syntax vs Lógica
```bash
python3 -m py_compile script.py  # Syntax OK
# Mas ainda pode ter token fake, URL errada, lógica quebrada
```

### 5. Crons vs Dados Reais
Cron报告 OK + DB vazio = problema real (não está no radar)
