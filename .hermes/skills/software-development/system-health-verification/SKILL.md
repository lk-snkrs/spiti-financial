# Diagnostic Due Diligence — Always Verify Data, Not Just Process Status

## When to use
Before declaring a system "healthy" or "working", especially after a reported issue or during routine audit.

## Core Principle
**"Working" = data is correct, not just "no error reported".**

A script can:
- Run without errors
- Exit with code 0
- Print "Done" or "Success"
- Have a valid API token
AND still be inserting wrong data or zero data.

## The 3-Layer Verification Checklist

Whenever you audit a data system, always check ALL 3 layers:

### Layer 1: Process Status (what most people check)
- [ ] Script exited without error
- [ ] Cron didn't report failure
- [ ] Token is "valid" (API responded)
❌ **NOT SUFFICIENT**

### Layer 2: Data Freshness (what smart people check)
- [ ] Count of records today > 0
- [ ] MAX(created_at) is recent
- [ ] No sudden drops in volume
⚠️ **BETTER, but still not enough**

### Layer 3: Data Correctness (what you MUST check)
- [ ] Sampled a specific record and verified field values
- [ ] Spot-checked a known order/customer has correct data
- [ ] Verified INSERT statements are actually being reached
- [ ] Checked that checkpoint files are being updated
- [ ] Confirmed math/logic in sync scripts matches actual API response structure
✅ **THIS IS THE MINIMUM**

## Real Examples from 2026-04-19

### Bug 1: Token placeholder (shpat_...f1ba)
- Health check: PASSED (token matched expected format)
- Actual: Token was a placeholder, API returned 0 results
- Found by: Verifying transactions_full had 0 rows despite 1000s of orders

### Bug 2: Shop name wrong (lksneakers vs lksneakerss)
- Health check: PASSED (no error thrown)
- Actual: API returned "shop not found" silently
- Found by: Direct curl test with known order ID

### Bug 3: Domain doubled (lk-sneakerss.myshopify.com.myshopify.com)
- Script ran without error
- Actual: SSL/HTTPS error silently ignored by requests library
- Found by: Comparing API response from manual curl vs script output

### Bug 4: gap suspicion wrong
- Assumed: Gap in Shopify order IDs meant sync stopped
- Reality: Shopify IDs are not sequential, gap was normal
- Found by: Checking actual transaction dates, not ID assumptions

## Verification Commands Template

```bash
# Before declaring a sync "working":
# 1. Check count
curl -s -X POST "https://api.supabase.com/..." -d '{"query": "SELECT COUNT(*) FROM table"}'

# 2. Check freshness
curl -s -X POST "https://api.supabase.com/..." -d '{"query": "SELECT MAX(created_at) FROM table"}'

# 3. Check specific record
curl -s -X POST "https://api.supabase.com/..." -d '{"query": "SELECT * FROM table ORDER BY id DESC LIMIT 3"}'

# 4. Verify checkpoint
cat /tmp/sync_checkpoint.json

# 5. Direct API test
curl "https://api.endpoint.com/expected_data" -H "Authorization: Bearer TOKEN" | python3 -m json.tool | head -20
```

## Anti-Patterns

**BAD:** "The cron ran at 6am and didn't error, so it's working"
**BETTER:** "The cron ran, and transactions_full now has 113 new rows from today"

**BAD:** "Token test returned OK"
**BETTER:** "Token returns shop data for OUR shop, not just 'valid response'"

**BAD:** "Health check passed"
**BETTER:** "Health check confirmed transactions from today exist in DB"

## Red Flags That Something Is Wrong

- Count is 0 or suspiciously round (0, 100, 1000)
- MAX(date) is more than 1 hour in the past for a frequently-updated table
- Script runs in < 1 second for a table that should have lots of data
- No errors in logs but also no "INSERT" or "Upsert" confirmation
- Checkpoint file hasn't changed in days
- API response format doesn't match what script expects (check the actual JSON keys!)

## When Investigating a Bug

1. Reproduce the exact API call the script makes (curl)
2. Verify the response matches what the script expects
3. Check if INSERT is actually being called (add print/log)
4. Verify the database received the data (query it directly)
5. Check if checkpoint was updated

Never assume the script is doing what the code says it should do.
