# Hermes PRD v2 — Brain Intelligence Audit
**Audit Date:** 2026-04-19 16:15 UTC  
**Workspace:** /root/.hermes/hermes-agent  
**Auditor:** Subagent Hermes Brain Audit  

---

## 1. Decisions & Lessons Quality

### decisions.md — Audit Log
**Path:** `/root/.hermes/hermes-agent/decisions.md`

- **Format:** Structured decision log with date, decision, reason, actions taken
- **Content quality:** High — captures cron conflict resolution, job pause rationale, preservation principles
- **Last entry:** 2026-04-19 (today) — Cron Audit covering 27 Hermes jobs, 5 conflicts identified
- **Decision preservation:** Good — "preservation principle" (no deletions, only pauses) is documented and followed
- **Traceability:** Job IDs (e.g., `b4c584055fd6`) referenced explicitly

**Issues found:**
- Decisions are logged in prose markdown only — not queryable programmatically
- No structured storage (JSON/DB) of decisions — depends on human review of markdown
- No automated reminder system for "next review" dates (scheduled 2026-05-01 but no cron hook)

**Grade: B+** — Good discipline, needs programmatic persistence.

---

## 2. Mem0 Sync — Full API Test Results

### Configuration
| Parameter | Value |
|---|---|
| API Key | `m0-40cao...` (43 chars — valid) |
| Package | `mem0ai 1.0.11` |
| Provider name | `mem0` |
| Default user_id | `hermes-user` |
| Default agent_id | `hermes` |
| Rerank | Enabled |
| Config loading | Env vars + `$HERMES_HOME/mem0.json` override |

### API v2 Compatibility — PASSED
All three tools verified against live API:

```
✅ mem0_profile  → {"result": "...", "count": N}
✅ mem0_search   → {"results": [{"memory": "...", "score": 0.9}, ...], "count": N}  
✅ mem0_conclude → {"result": "Fact stored."}
```

### v2 Filter Migration — PASSED
Read operations use `filters={"user_id": "hermes-user"}` (no bare `user_id=` kwarg).  
Write operations use `filters={"user_id": "hermes-user", "agent_id": "hermes"}`.  
Both confirmed via live API calls and unit test suite (`test_mem0_v2.py`).

### Response Unwrapping — PASSED
`_unwrap_results()` handles all shapes correctly:
- `{"results": [...]}` → extracts list (API v2)
- `[...]` → passes through (backward compat)
- `None` / `{}` → returns `[]`

### Circuit Breaker — IMPLEMENTED
- Threshold: 5 consecutive failures
- Cooldown: 120 seconds
- Auto-reset after cooldown expires
- Both prefetch and sync threads handle breaker-open state gracefully

### Issues
- **No `$HERMES_HOME/mem0.json` found** — config lives in env only. This is fine but undocumented.
- **No Mem0 health monitoring in alert_system** — if Mem0 goes down, the circuit breaker prevents spam but no alert fires
- **Sessions today: 0 in monitor-state** — current session tracking shows zero, suggesting the Hermes agent has not been used today or sessions are not being recorded properly

**Grade: A-** — Production-ready, minor gaps in monitoring.

---

## 3. brain_sync.sh — NOT FOUND

**CRITICAL GAP:** No `brain_sync.sh` script exists anywhere in the repository.

Searched:
- `/root/.hermes/hermes-agent/scripts/` — no brain_sync
- `/root/.hermes/hermes-agent/` root — no brain_sync
- All cron jobs referencing "brain sync" are Hermes agent jobs (prompt-based), not shell scripts

**What exists instead:**
- `Hermes Brain Sync` (cron job `227f3cc47955`) — runs at 0 6 * * * — prompt-based brain sync via agent
- `Hermes Brain Sync — Night` (cron job `364fb6bd4036`) — runs at 0 22 * * * — second daily sync
- `Hermes Consolidation — Weekly` (job `1b9828fbd7c6`) — Monday 9am — weekly memory consolidation
- `Hermes Weekly Learning Review` (job `c6586db92487`) — **PAUSED** — was Sun 8pm, now superseded

**Gap:** All "brain sync" operations are prompt-inference calls, not direct Mem0 API batch operations. There is no dedicated shell script that:
- Directly calls Mem0 API for bulk memory operations
- Syncs decisions/lessons from structured storage to Mem0
- Consolidates session learnings into long-term memory
- Performs cross-session deduplication

**Recommendation:** Create `/root/.hermes/hermes-agent/scripts/brain_sync.sh` that:
1. Pulls recent decisions from `decisions.md` (or JSON equivalent)
2. Calls `mem0_conclude` for each significant decision
3. Pulls session summaries from `hermes_state.db`
4. Batch-updates Mem0 with consolidated learnings
5. Logs sync results to `logs/brain_sync.log`

**Grade: F** — Missing component. All brain sync is agent-prompt-dependent rather than deterministic script-driven.

---

## 4. Session Protocols

### MemoryManager Orchestration
**Path:** `/root/.hermes/hermes-agent/agent/memory_manager.py`

```
Pre-turn:  prefetch_all(query)     → MemoryManager → providers.prefetch()
Post-turn: sync_all(user, assistant) → providers.sync_turn()
Background: queue_prefetch_all()  → providers.queue_prefetch()
```

**Lifecycle hooks implemented:**
- `on_turn_start(turn_number, message, **kwargs)` — notified per turn
- `on_session_end(messages)` — session teardown
- `on_pre_compress(messages)` — pre-compression context
- `on_memory_write(action, target, content)` — cross-provider write propagation
- `on_delegation(task, result, child_session_id)` — subagent completion

**Turn sync flow (Mem0):**
```
sync_turn(user_content, assistant_content)
  → Thread: client.add(messages, user_id=..., agent_id=...)
  → Non-blocking, waits for previous sync (5s timeout)
```

**Tool schemas registered:** `mem0_profile`, `mem0_search`, `mem0_conclude`

**Single external provider rule:** Enforced — only one non-builtin memory provider allowed. Mem0 is registered as external.

**Issues:**
- No explicit "consolidation trigger" — memory grows unbounded until compression
- `on_pre_compress` provides context but doesn't write back to Mem0
- No session-level summary pushed to Mem0 on `on_session_end`

**Grade: A-** — Well-designed orchestration, missing session-end consolidation hook.

---

## 5. Knowledge Freshness

### ProactiveInsightEngine
**Path:** `/root/.hermes/hermes-agent/proactive_insight_engine.py`

- Runs anomaly detection across Hermes session history
- Detects: cost spikes (2x threshold), session drops (50%), token anomalies (3x), tool over-reliance (80%), idle days, productivity trends
- Period comparison: current vs previous period
- Outputs: `terminal`, `gateway` (Telegram), `json` formats
- Cron: `0 * * * *` — hourly (via system crontab `proactive-insight.sh`)

**Status:** Active and functional.

### AlertSystem
**Path:** `/root/.hermes/hermes-agent/alert_system.py`

- Monitors: CPU, memory, swap, disk, load average, process count
- Dispatch: log, file, webhook, email
- Rate limiting: 300s default interval between repeat alerts
- Deduplication by metric
- Alert history: last 1000 alerts in `alert_history.json`
- Config: `alert_config.json` with overrideable thresholds

**Current daemon status:**
```
CPU: 7.8%
Memory: 9.2%
Sessions today: 0  ← ⚠️ No sessions recorded today
Last update: 2026-04-19T16:14:24
```

**Alert log:** `logs/alerts.log` and `logs/alert-daemon.log` active.

### Cross-Company Intelligence Engine
**Path:** `/root/.hermes/hermes-agent/cross_company_intel/engine.py`

- Covers: LK Sneakers, Zipper Gallery, Spiti Auction
- Detects: revenue spikes (1.5x), order drops (40%), refund alerts (10%+), inventory warnings, cross-company momentum patterns
- Store: `cross_company_intel/store.py` — persists insights
- Cron: `0 9 * * 4` (LK Cross-Company Intel job)

**Status:** Active, three-company setup.

### LK Intel Schema Audit (Separate Report)
**Path:** `/root/.hermes/hermes-agent/LK_INTEL_SCHEMA_AUDIT.md`

- 68 total tables (63 + 5 views)
- 14 healthy, 9 empty-but-expected, 5 never-populated, 1 partial COGS, 6 stale
- **Critical:** `variants.cost` 100% NULL — breaks all profitability analysis
- **Critical:** `transactions` table empty — sync script exists but broken
- **Critical:** `hermes_outcomes` 0 rows — no outcome tracking for suggestions
- **Critical:** `consequence_log` 0 rows — no second-order effect tracking
- **Critical:** `customer_segments` and `customer_rfm` both empty — RFM/scoring never computed
- All 62 `hermes_suggestions` stuck in "suggested" status — zero ever reviewed

**Grade for knowledge freshness: B** — Multiple active pipelines, but significant ghost tables and stale data.

---

## 6. Intelligence Gaps

### P0 — Critical Gaps

1. **No `brain_sync.sh`** — Brain sync is entirely prompt-dependent, not script-driven. No deterministic batch memory consolidation.

2. **`consequence_log` empty (0 rows)** — Schema exists to track second-order effects of playbook actions but is never written to. The **Decisions** system records what was decided but never records what happened as a result.

3. **`hermes_outcomes` empty (0 rows)** — All 62 suggestions are "suggested" status, none reviewed/acted upon. No feedback loop from action to outcome.

4. **`variants.cost` 100% NULL** — No COGS data from Tiny ERP. All margin calculations broken. `restock_predictions.margin_pct` is null/invalid.

5. **`transactions` table empty** — Shopify GraphQL sync script exists but writes zero rows despite thousands of orders.

### P1 — Significant Gaps

6. **`decisions.md` not programmatic** — Decisions logged as prose markdown, not queryable. No JSON/DB backing. "Next review: 2026-05-01" is a comment with no automated enforcement.

7. **`customer_segments` + `customer_rfm` empty** — RFM scoring and customer segmentation never computed. Computed tables need scheduled population jobs.

8. **Sessions today: 0** — Current session tracking shows zero sessions for today. Either Hermes hasn't been used today, or the monitor-daemon isn't recording sessions properly.

9. **`sync_log` empty** — No audit trail for any sync operations. Impossible to debug what ran, when, and what failed.

10. **62 `hermes_suggestions` all "suggested"** — Zero human review loop. Suggestions pile up without ever being accepted/rejected.

### P2 — Moderate Gaps

11. **No Mem0 health alert** — Circuit breaker prevents spam but doesn't generate an alert when Mem0 goes down.

12. **`on_pre_compress` read-only** — Provides context to compression but doesn't write consolidated insights back to Mem0.

13. **No session-end Mem0 summary** — `on_session_end` fires but doesn't push a session summary to Mem0.

14. **`cross_company_intel` uses hardcoded DB paths** — LK path is `~/.hermes/hermes-agent/lk_intel.db` (absolute), Zipper/Spiti use `~/.hermes/*.db`. No unified config.

15. **ProactiveInsightEngine has hardcoded thresholds** — `COST_SPIKE_THRESHOLD = 2.0`, `TOKEN_ANOMALY_THRESHOLD = ***` — values are code constants, not config.

---

## 7. Summary Scores

| Component | Score | Notes |
|---|---|---|
| Decisions quality | B+ | Good discipline, prose-only, no programmatic query |
| Mem0 API | A- | v2 compatible, circuit breaker, working — minor monitoring gap |
| brain_sync.sh | **F** | **Missing entirely** — all sync is prompt-dependent |
| Session protocols | A- | Well-orchestrated, missing session-end Mem0 summary |
| Knowledge freshness | B | Active pipelines, significant ghost tables and stale data |
| Intelligence gaps | P0×5 | consequence_log, hermes_outcomes, variants.cost, transactions, brain_sync |
| Overall | **C+** | Functional but with 5 critical gaps requiring immediate attention |

---

## 8. Recommendations (Priority Order)

1. **[P0] Create `scripts/brain_sync.sh`** — Deterministic Mem0 batch sync script that pulls session summaries, decisions, and lesson patterns, then calls `mem0_conclude` for long-term memory.

2. **[P0] Wire `consequence_log` writes** — After each significant action, record observed effect to `lk_intel.consequence_log` via Supabase.

3. **[P0] Debug `sync_shopify_transactions.py`** — transactions table has 0 rows. Fix GraphQL sync or replace with REST-based transaction extraction.

4. **[P0] Investigate zero sessions today** — Monitor state shows 0 sessions for 2026-04-19. Verify session recording is working.

5. **[P0] Wire Tiny ERP → `variants.cost`** — Without COGS data, all margin analytics are broken. Contact Tiny ERP team.

6. **[P1] Make `decisions.md` programmatic** — Export decisions to JSON/Supabase table with `decided_at`, `status`, `next_review`. Add cron to check and alert on overdue reviews.

7. **[P1] Add Mem0 health alert** — When circuit breaker opens, generate an alert through `alert_system.py`.

8. **[P1] Compute `customer_segments` and `customer_rfm`** — Add scheduled jobs to populate these from `orders` + `customers` tables.

9. **[P1] Wire `sync_log`** — Add INSERT to all sync scripts for audit trail.

10. **[P2] Session-end Mem0 summary** — In `on_session_end`, call `mem0_conclude` with a session summary.

---

*Report generated: 2026-04-19 16:15 UTC*  
*Next scheduled review: 2026-05-01*  
*Files referenced: decisions.md, plugins/memory/mem0/__init__.py, agent/memory_manager.py, proactive_insight_engine.py, alert_system.py, cross_company_intel/engine.py, LK_INTEL_SCHEMA_AUDIT.md*
