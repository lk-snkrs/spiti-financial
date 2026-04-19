# Hermes — Priority Actions Today
**Date:** 2026-04-19
**Mode:** COO Emergency Audit
**Items:** 8 total | 🔴 Critical: 3 | 🟡 Medium: 3 | 🟢 Quick: 2

---

## 🔴 CRITICAL — Requires Lucas Action

### 1. Meta Ads Token — 38 DAYS BROKEN
**Impact:** No advertising intelligence. LK Intel blind on paid acquisition.
**Action:** Lucas must manually refresh OAuth token
**Steps:**
```bash
# 1. Go to: https://business.facebook.com/settings/system-users
# 2. Create System User with ads_read + ads_management
# 3. Generate new token
# 4. Update:
doppler secrets set META_ACCESS_TOKEN="NEW_TOKEN" -p lc-keys -c prd
# 5. Test:
/root/.hermes/scripts/meta_token_test.sh
```
**Verify:** `meta_token_test.sh` returns ✅ not ❌
**Blocker:** Lucas action only — no automation possible

---

### 2. Brain Sync VPS — SSH BLOCKED
**Impact:** Strategic decisions not syncing to VPS backup. Brain is offline.
**Action:** Lucas needs VPS console access (VNC/KVM)
**Two options:**

**Option A (Fastest):** Access VPS console → unblock SSH
```bash
# In VPS console:
uffw allow 22/tcp  # or
csf -a YOUR_IP     # or check fail2ban
systemctl restart ssh
```

**Option B (Strategic):** Decommission VPS, consolidate Brain to local
- Move `/root/hermes-brain/` content to `/root/.hermes/memories/`
- Brain already has copies at `/root/.hermes/hermes-agent/` checkout
- Update AGENTS.md to remove VPS reference
- **Saves:** ~$20-30/month VPS cost

**Verify (Option A):** `ssh root@72.60.150.124` connects
**Blocker:** Lucas console access required

---

### 3. lk_email_draft.py — MISSING FILE
**Impact:** Email drafting may fail. Cron running but from wrong path.
**Action:** Copy script to correct location
```bash
# Find the actual script:
find /tmp /root/.hermes /root/.openclaw -name "lk_email_draft.py" 2>/dev/null

# Copy to canonical location:
cp FOUND_PATH /root/.hermes/scripts/lk_email_draft.py

# Verify cron will find it:
grep lk_email_draft /var/log/lk_email_draft.log | tail -5
```
**Status:** Script is running (logs show activity) but cron points to wrong path
**Quick fix:** Copy file, no data loss

---

## 🟡 MEDIUM PRIORITY — Can Fix Today

### 4. proactive-insight.sh — PLACEHOLDER ENGINE
**Impact:** Real proactive insights NOT being generated. System is reactive only.
**Current state:** Script just checks for a trigger file `/tmp/claw_vip_dormant_trigger` that never exists
**Action:** Implement real signal detection
```bash
# Real signals to detect:
# 1. VIP customer dormant > 30 days → WhatsApp alert
# 2. Top seller stock < 5 units → restock alert
# 3. Cart abandonment spike → Klaviyo flow trigger
# 4. Anomaly score > threshold → notify Lucas

# Quick fix: Wire to existing LK anomaly detection
# Check: lk_anomaly_alert_9h already detects anomalies
# Wire: proactive-insight.sh calls same anomaly query
```
**Priority:** Lower than the 3 critical items but high value

---

### 5. Smart Routing — DISABLED
**Impact:** All tasks use expensive M2.7 even when M2.1 would suffice
**Cost leak:** Unknown but肯定的 for simple tasks (emails, summaries)
**Action:** Enable in config
```yaml
# In ~/.hermes/config.yaml
smart_model_routing:
  enabled: true  # Currently implicit but NOT being used
  cheap_model:
    provider: minimax
    model: MiniMax-M2.1  # For simple tasks
```
**Note:** Per AGENTS.md, M2.7 is "always" used. This is a policy decision — Lucas should decide if cost savings justify potential quality reduction for simple tasks.

---

### 6. Supabase Connectivity — FAILING
**Impact:** LK Intel data may be stale (heartbeat shows "fail")
**Action:** Investigate + fix
```bash
# Check Supabase direct connectivity:
python3 -c "
import os
key = os.getenv('SUPABASE_LK_SERVICE_KEY','')
print(f'Key present: {bool(key)}')
print(f'Key starts: {key[:10]}...')
"

# Test via CLI:
supabase projects list  # or
psql 'postgresql://...'  # test connection

# Check if IP changed:
supabase projects_retrieve cnjimxglpktznenpbail
```
**Likely cause:** IP whitelist changed, service key rotated, or network issue

---

## 🟢 QUICK WINS

### 7. Consolidate Shopify Sync Crons
**Current:** 8 runs/day (6-22h hourly + 0h + 3h + 19:15)
**Proposed:** 8 runs/day (every 2h: 6,8,10,12,14,16,18,20 + 0h, 3h = 10 total → consolidate to every 2h = 5 runs + 0h, 3h = 7)
**Savings:** 3 fewer Python API calls/day, less Supabase load
**Action:** Edit crontab — remove redundant entries
```bash
crontab -e
# Remove: 0 6-22 * * * (hourly)
# Keep: 0 */2 * * * (every 2h)
```

---

### 8. Add Cost Tracking to lk_cockpit_dashboard
**Impact:** Zero visibility into MiniMax spend
**Quick win:** Add a cost section to the HTML dashboard
```javascript
// Add to lk_cockpit_dashboard.html:
// Fetch from MiniMax usage API or track locally
// Display: Daily spend, MTD spend, budget remaining
```
**No cost without this:** Unknown burn rate

---

## VERIFICATION CHECKLIST

After completing this session, verify:
- [ ] Meta Ads token tested (even if not refreshed today)
- [ ] Brain sync VPS status confirmed (fix or document decommission)
- [ ] lk_email_draft.py in correct path
- [ ] proactive-insight.sh flagged as placeholder for prioritization
- [ ] Supabase connectivity issue investigated
- [ ] Shopfy sync crons consolidated (if time permits)
- [ ] Cost tracking gap added to pending.md

## ESCALATION QUEUE

If Lucas is unavailable today:
1. Meta Ads — remains broken until token refreshed (no workaround)
2. Brain VPS — local memories still accessible, VPS backup unavailable
3. lk_email_draft — script still runs from /tmp/ copies, monitor for breakage
4. Supabase — check if reads still work (anon key vs service key issue)
