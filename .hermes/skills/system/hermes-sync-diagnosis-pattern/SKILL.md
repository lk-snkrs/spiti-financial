---
name: hermes-sync-diagnosis-pattern
description: Diagnose sync scripts that appear OK but insert zero data
triggers: ["sync parou", "dados stale", "sync broken", "zero rows", "transactions vazio"]
---

# Hermes Sync Diagnosis Pattern

## Trigger
When a sync script appears to run OK but data is stale or missing.

## Diagnostic Steps (in order)

### Step 1: Check script tokens
```bash
grep -n "TOKEN\|SHOP\s*=" /path/to/script.py | head -10
```

### Step 2: Test API directly
```bash
TOKEN="token_from_script"
curl -s "https://lk-sneakerss.myshopify.com/admin/api/2024-01/shop.json" \
  -H "X-Shopify-Access-Token: $TOKEN"
```

### Step 3: Verify DB data
```sql
SELECT COUNT(*) as total, MAX(created_at) as newest FROM lk_intel.transactions_full;
```

## Known Fake Tokens
- `shpat_...f1ba` — placeholder token
- `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` — known invalid
- `sbp_2297055c60ee166d8e1aa8476660b13b465d23b4` — revoked PAT

## Shopify Shop Name Patterns
- `f"https://{SHOP}/..."` → needs full domain `lk-sneakerss.myshopify.com`
- `f"https://{SHOP}.myshopify.com/..."` → needs store name only `lk-sneakerss`
