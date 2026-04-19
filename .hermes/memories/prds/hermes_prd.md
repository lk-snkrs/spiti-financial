# Hermes Agent — COO Audit PRD
**Date:** 2026-04-19
**Auditor:** COO (Brutal Honest Mode)
**Status:** 🔴 CRITICAL — 5 failures, 3 broken paths, Brain Sync dead

---

## 1. INFRASTRUCTURE OVERVIEW

### 1.1 Server Topology
| Component | Location | Status | Notes |
|-----------|----------|--------|-------|
| Hermes Agent | `/root/.hermes/hermes-agent/` | ✅ Running (PID 4037542) | v0.9.0 |
| OpenClaw Workspace | `/root/.openclaw/workspace/` | ✅ Running | |
| Hermes Brain (VPS) | `root@72.60.150.124:/root/hermes-brain/` | ❌ SSH BLOCKED | Port 22 refused |
| n8n | localhost:5678 | ✅ Running (393MB RSS) | Heavy consumer |
| Mem0 MCP Server | localhost (mem0-mcp-server) | ✅ Running | |
| fail2ban | localhost | ✅ Running (74min CPU) | |
| Doppler API server | localhost:2432703 | ✅ Running | |

### 1.2 VPS Assessment — THE BRAIN IS OFFLINE
```
VPS: 72.60.150.124
SSH: PORT 22 BLOCKED ❌
HTTP: 80, 443 ✅
Brain Sync Cron: FAILING since ~April 19
```

**Cost vs Benefit of VPS:**
- VPS cost: ~$20-30/month (estimated)
- Brain content: strategic docs, memories, decisions
- **VERDICT:** VPS is not justified if SSH is blocked permanently. Brain files live locally too. Either fix SSH or consolidate Brain content into `/root/.hermes/` (already has `memories/`) and decommission VPS.

---

## 2. MODEL COST ANALYSIS — MiniMax

### 2.1 Current Configuration
```yaml
provider: minimax
model: MiniMax-M2.7
smart_routing: DISABLED (per AGENTS.md: "smart routing DESATIVADO — sempre M2.7")
cheap_model: MiniMax-M2.1 (defined but NEVER USED)
summary_model: MiniMax-M2.7
```

### 2.2 Cost Gaps (Brutal Truth)
| Gap | Severity | Detail |
|-----|----------|--------|
| No cost visibility | 🔴 CRITICAL | `lk_cockpit_dashboard.html` has ZERO cost/billing display |
| No budget alerts | 🔴 CRITICAL | No spending cap notifications |
| Smart routing disabled | 🟡 MEDIUM | M2.1 is never used even for simple tasks |
| Usage tracking | 🟡 MEDIUM | `usage_pricing.py` exists but no aggregation dashboard |
| Cost per cron job | 🟡 MEDIUM | No per-job cost breakdown |

**Recommendation:** Enable smart routing for simple tasks (emails, summaries) → M2.1. Track costs per cron run.

---

## 3. MEMORY ARCHITECTURE — Mem0 + Brain

### 3.1 Current State
```
Mem0: ✅ Configured (API key present in ~/.hermes/mem0.json)
  - user_id: hermes-user
  - agent_id: hermes
  - Free tier: 10K memories
  - Tools: mem0_profile, mem0_search, mem0_conclude
  - MCP server running (PID 204693)

Brain: ❌ BROKEN — VPS SSH unreachable
  - Cron job "Hermes Brain Sync" FAILING since April 19
  - Error: "Porta SSH (22) bloqueada"
  - Impact: Decisions not syncing to VPS, strategic docs not backed up
```

### 3.2 Brain Sync Failure Impact
```
Source of Truth (per AGENTS.md):
  Brain (.md files) → Mem0 (index)

Broken chain:
  Brain (VPS) ← SSH BLOCKED → local sync script
  Mem0 (index) ← not being updated from Brain

Real impact: 
  - New decisions today NOT reaching Mem0
  - Mem0 is building an index of potentially stale data
```

### 3.3 Missing Files (Cron Failures)
| File | Cron Reference | Status |
|------|---------------|--------|
| `/root/.hermes/scripts/lk_email_draft.py` | `*/5 * * * *` | ❌ File missing |
| `/root/.openclaw/workspace/skills/analytics/spiti-lances/scripts/gmail_idle_watch.py` | `@reboot` | ❌ File missing |
| `/root/.hermes/scripts/` | Source of truth dir | ⚠️ Only `/tmp/` copies exist for some scripts |

---

## 4. CRON EFFICIENCY AUDIT

### 4.1 Cron Inventory (26 jobs)
```
HERMES CRON (in ~/.hermes/cron/jobs.json — internal scheduler):
  26 jobs defined (many are @reboot or hourly variants)

SYSTEM CRONTAB (root):
  1. 0 16 * * *   daily_report.js
  2. 0 13 * * *   whatsapp_alerts.js
  3. */30 * * * * vault sync.sh
  4. 0 6-22 * * *  sync_shopify_lk.js (hourly 6h-22h)
  5. 0 0,3 * * *   sync_shopify_lk.js (midnight + 3am)
  6. 15 19 * * 1-6 sync_shopify_lk.js (Sunday-thin 19:15)
  7. @reboot        gmail_idle_watch.py ❌ MISSING
  8. 30 23 * * *   vault-daily-log.sh
  9. */3 * * * *   email_poller.py ❌ NO TOKEN
  10. 0 3 * * *     cleanup-idle-procs.sh
  11. 5 0 * * *     run_semrush_when_ready.sh
  12. 0 * * * *     proactive-insight.sh ⚠️ PLACEHOLDER
  13. 0 8 * * 1,3,5 trend-alert.sh
  14. 0 0 1 * *     ltv-scoring.py
  15. 0 10 * * 1    crosssell-engine.sh
  16. 0 20 * * 0    content-ideas.sh
  17. 0 10 * * 2,4  lead-scoring.py
  18. 0 14 * * 3     collector-engagement.py
  19. 0 9 * * 1-4   stock-alert.sh
  20. */5 * * * *   lk_email_draft.py ❌ MISSING FILE

OPENCLAW WORKSPACE SHARED SCRIPTS (called by openclaw agents):
  21. ab-reasoning.sh
  22. agent-lk-automation.sh
  23. churn-alert.sh
  24. crosssell-engine.sh
  25. proactive-insight.sh ⚠️ PLACEHOLDER (same as #12)
  26. trend-alert.sh
  ... (40+ scripts total in shared/scripts/)
```

### 4.2 Failures Summary
| # | Cron | Error | Severity | Days Broken |
|---|------|-------|----------|-------------|
| 1 | daily_report | Telegram 401 Unauthorized | 🔴 CRITICAL | 4+ days |
| 2 | spiti_email_poller | "Sem access token" | 🟡 MEDIUM | Documented low priority |
| 3 | Hermes Brain Sync | SSH 22 blocked | 🔴 CRITICAL | 1 day (19/04) |
| 4 | lk_email_draft | File missing `/root/.hermes/scripts/` | 🔴 CRITICAL | Unknown |
| 5 | gmail_idle_watch | File missing | 🟡 MEDIUM | @reboot |

### 4.3 Overlap & Consolidation Opportunities
| Issue | Recommendation |
|-------|----------------|
| `trend-alert.sh` (crontab) + `trend-alert.sh` (openclaw) | Deduplicate — same script called 2 ways |
| `proactive-insight.sh` (crontab) + openclaw `proactive-insight.sh` | BOTH ARE PLACEHOLDERS — real analysis needed |
| 3x/day heartbeat (Hermes internal) | Could be 2x/day (morning + evening) |
| `lk_email_draft` every 5 min | Too frequent for email drafting — 15-30 min is enough |
| Multiple Shopify sync crons (every hour 6h-22h + 0h + 3h + 19h) | 8 runs/day — consolidate to every 2h 6h-22h = 8 runs, remove redundant |
| `crosssell-engine.sh` + `crosssell-deliver.sh` | These are separate but called by same workflow — consolidate |

---

## 5. BUSINESS ANOMALIES & PROACTIVITY GAPS

### 5.1 Current Anomalies (from heartbeat-state.json)
```
WARNING: 3 top sellers OUT OF STOCK
  - Rhode Peptide Eye Prep
  - NB 204L Mushroom  
  - NB 204L Arid Ti
  Impact: R$214K/month revenue at risk
  SKUs with no stock: 3,944
```

### 5.2 Proactivity Gap Analysis
| Expected Proactive Action | Current State | Gap |
|--------------------------|---------------|-----|
| Stock anomaly → alert before stockout | `lk_anomaly_alert_9h` exists | ✅ Working but not catching top-seller stockouts提前 |
| Cost spike → notify | No tracking | ❌ NO COST VISIBILITY |
| Meta Ads down 38 days → auto-escalate | Documented but not fixed | ❌ Known issue, no auto-remediation |
| Brain Sync fail → alert + local fallback | Silent failure | ❌ Brain sync failing silently |
| Supabase connectivity fail → alert | Shows in heartbeat but not fixing | ❌ Auto-remediation not triggered |

### 5.3 LK Intel Dashboard — Data Gaps
```
lk_cockpit_dashboard.html missing:
  - Cost/spend section
  - Meta Ads performance (token invalid 38 days)
  - Conversion funnel visualization
  - Real-time stock levels
  - Revenue vs target
```

---

## 6. KNOWN ISSUES (from heartbeat + logs)

### 6.1 Priority Issues
| Issue | Owner | Days | Impact |
|-------|-------|------|--------|
| Meta Ads token INVALID | Lucas | 38+ | No advertising data |
| daily_report Telegram 401 | Lucas | 4+ | No daily reports |
| Brain Sync VPS SSH blocked | Lucas (VPS console) | 1 | Strategic docs not syncing |
| Supabase connectivity FAIL | Auto | ? | LK Intel data may be stale |

### 6.2 WhatsApp Alerts — Working ✅
```
whatsapp_alerts.js: ✅ Running
  - Champions: 0, VIPs: 8, At-Risk: 3
  - VIPs and At-Risk customers being notified
  - Last run: April 18
```

### 6.3 Email Draft — Working but with file issue
```
lk_email_draft: ⚠️ PARTIAL
  - Runs every 5 min
  - Reads from 2 inboxes (lk, zipper)
  - Generates drafts for Mercado Livre emails
  - PROBLEM: Cron calls /root/.hermes/scripts/lk_email_draft.py (MISSING)
  - Script actually runs from /tmp/ copies
```

---

## 7. RECOMMENDATIONS SUMMARY

### 7.1 Immediate Actions (Today)
1. **Lucas action:** Fix Meta Ads token (38 days broken)
2. **Lucas action:** Access VPS console → unblock SSH port 22 OR consolidate Brain to local
3. **Fix:** Copy `lk_email_draft.py` to `/root/.hermes/scripts/`
4. **Fix:** `proactive-insight.sh` is a placeholder — implement real signal analysis

### 7.2 This Week
1. Enable MiniMax smart routing (use M2.1 for simple tasks)
2. Add cost tracking dashboard section
3. Consolidate duplicate Shopify sync crons (8 → 4 runs)
4. Fix heartbeat Supabase connectivity check
5. Add cost alerts in MiniMax dashboard

### 7.3 Strategic
1. Decommission VPS OR get console access to fix SSH
2. Consolidate all scripts to single source of truth (`/root/.hermes/scripts/`)
3. Implement real proactive insight engine (current one is a placeholder)
4. Add Meta Ads recovery auto-check (token refresh reminder after 30 days)

---

## 8. SCORECARD

| Area | Score | Trend |
|------|-------|-------|
| Infrastructure | 6/10 | ↓ (VPS down) |
| Cost Visibility | 2/10 | ↓ (zero tracking) |
| Cron Health | 7/10 | → (mostly working) |
| Memory Architecture | 6/10 | ↓ (Brain sync broken) |
| Proactivity | 3/10 | ↓ (insight engine is placeholder) |
| Business Data | 5/10 | ↓ (Meta Ads 38 days down) |

**Overall: 4.8/10** — System running but neglected. Critical issues not being fixed.
