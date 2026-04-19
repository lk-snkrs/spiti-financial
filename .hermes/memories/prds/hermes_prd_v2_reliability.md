# Hermes PRD v2 — Reliability & Integrity Audit

**Date:** 2026-04-19
**Scope:** heartbeat-rotativo, hermes_remediate integration, alert flow, proactive engine, monitor daemon
**Workspace:** `/root/.hermes/hermes-agent`

---

## 1. Executive Summary

The Hermes monitoring stack consists of four loosely-coupled components:

| Component | File | Role |
|---|---|---|
| Monitor Daemon | `monitor_daemon.py` | System metrics collector — runs as a daemon, writes `monitor-state.json` |
| Alert System | `alert_system.py` | Alert evaluator + dispatcher — reads state file, fires notifications |
| Proactive Engine | `proactive_insight_engine.py` | Scheduled intelligence — reads SessionDB, surfaces anomalies |
| Dashboard | `monitor_dashboard.py` | TUI consumer of `monitor-state.json` |

**Overall Posture:** The system is functional but has significant blind spots, deduplication gaps, threshold misalignments, and zero auto-remediation capability. There is no "hermes_remediate" integration anywhere in the codebase.

---

## 2. Monitor Daemon — Blind Spots

### 2.1 Deduplication is Ineffective (CRITICAL)

**File:** `monitor_daemon.py` lines 220–225

```python
recent = [a for a in alerts if (datetime.now() - datetime.fromisoformat(a["timestamp"])).total_seconds() < 60]
for na in new_alerts:
    if not any(a["metric"] == na["metric"] for a in recent):
        alerts.append(na)
```

**Problems:**
- The 60-second window means an alert fires every ~60 seconds for a *persistent condition*
- Log shows the **same 7 snap disk alerts repeating every 60 seconds** for over 24 minutes (lines 7–182 of `monitor-daemon.log`)
- The deduplication only suppresses re-alerting if the same metric fired within the last 60 seconds — it does **not** resolve or clear alerts when the condition clears
- `alerts` list grows unbounded — only truncated to 100 entries at line 228, which means stale alerts persist indefinitely

**Evidence:**
```
2026-04-19 15:51:29 [MONITOR] WARNING: ALERT: disk_/snap/canonical-livepatch/384 = 100.0
2026-04-19 15:52:29 [MONITOR] WARNING: ALERT: disk_/snap/canonical-livepatch/384 = 100.0
... (repeated every 60 seconds for 24+ minutes)
```

### 2.2 No Alert Resolution / Auto-Clear

- Alerts are never cleared when a condition returns to normal
- A 100%-full snap partition that gets cleaned will still show as "alerting" until the daemon restarts or the 100-entry cap evicts it
- No hysteresis (no "recovery" event is emitted when a metric crosses back below threshold)

### 2.3 snap Mountpoints Are Noise (FALSE POSITIVES)

**Finding:** 7 of 10 partitions in the current state are snap loop devices at 100% — this is **expected behavior** for squashfs snap images. They are read-only and cannot be freed.

**Current behavior:** These trigger CRITICAL alerts continuously, polluting logs and the alert history.

**Should be:** Either:
1. Excluded from alerting (filter by `fstype == "squashfs"`)
2. Classified as INFO (not alertable) since they are inert read-only images

### 2.4 Monitor Daemon Does Not Produce Recovery Events

- When a metric crosses BACK below threshold, nothing is emitted
- Downstream systems (alert_system.py) never see a "resolved" state
- The `active_alerts` dict in `AlertManager` also never clears resolved alerts — it only manages `last_alert_time` for rate-limiting

### 2.5 CPU Measurement Uses `interval=None` — Always Returns 0.0 on First Call

**File:** `monitor_daemon.py` line 100

```python
"percent": psutil.cpu_percent(interval=None),
```

`psutil.cpu_percent(interval=None)` returns a meaningless 0.0 on the **first** call in a process because psutil requires a prior call with an actual interval to initialize. The `per_cpu` call on the next line has the same problem.

**Fix:** Use `interval=0.1` or call `cpu_percent(interval=None)` once at startup before the loop.

### 2.6 No Temperature Monitoring

`ALERT_THRESHOLDS` defines `"temperature": 80.0` but `get_cpu_stats()` never populates temperature data — the temperature check is simply absent from the code.

### 2.7 PID File Has No Guaranteed Cleanup on Crash

The PID file is written before the daemon loop and removed via `atexit`. If the process is killed with `SIGKILL`, the PID file persists with a stale PID. The startup script (`start_monitoring.sh` lines 14–23) has a `kill -0` check, but this only works on the same PID being reused — it doesn't detect a genuinely dead process whose PID was reassigned.

---

## 3. Alert System — Blind Spots

### 3.1 No Auto-Remediation (`hermes_remediate` does not exist)

There is no `hermes_remediate` module, no `remediate` function, and no auto-fix capability anywhere in the codebase. The alert system is **read-only** — it evaluates and notifies but never acts.

### 3.2 Rate-Limiting Collision Across Alert Levels

**File:** `alert_system.py` lines 259–268

```python
def should_fire(self, alert: Alert) -> bool:
    last = self.last_alerts.get(alert.metric)
    interval = self.config["alert_interval_seconds"]  # default 300s
    if last is None:
        return True
    elapsed = (datetime.now() - last).total_seconds()
    return elapsed >= interval
```

**Problem:** A WARNING and a CRITICAL for the same metric share the same rate-limit bucket. If WARNING fires at T=0, CRITICAL cannot fire until T+300s — even if the situation has become genuinely critical. The metric name is the same (`cpu_percent`) for both severity levels.

**Additionally:** `AlertManager.active_alerts` is populated but never used to track resolution — it is only written to, never read by any downstream consumer.

### 3.3 Threshold Misalignment Between monitor_daemon and alert_system

| Metric | monitor_daemon threshold | alert_system threshold |
|---|---|---|
| cpu_percent WARNING | 90.0 | 85.0 |
| memory_percent WARNING | 85.0 | 85.0 |
| disk_percent CRITICAL | 90.0 | 90.0 |

The monitor daemon uses its own hardcoded `ALERT_THRESHOLDS` dict and never reads `alert_config.json`. The alert system uses `alert_config.json` with different values. This means the two components can disagree on what constitutes an alert.

### 3.4 Webhook/Email Dispatch Has No Retry Logic

`dispatch_webhook` and `dispatch_email` attempt delivery once and log failures. There is:
- No exponential backoff
- No dead-letter queue
- No retry queue
- No circuit breaker

### 3.5 No TLS Certificate Verification in Webhook Dispatch

**File:** `alert_system.py` lines 204–218

```python
with urllib.request.urlopen(req, timeout=10) as resp:
```

Uses default SSL context — no explicit cert verification. If a webhook URL uses HTTPS, this relies on system CA certificates without custom validation.

### 3.6 Alert History Has No Cleanup / Archival

`alert_history.json` grows unbounded (capped at 1000 entries in memory at line 103, but that cap is only applied on save — the file itself is never pruned).

### 3.7 No Integration with Gateway for Alert Routing

No `gateway.*` or `alert.*gateway` integration pattern exists. Alerts are logged and written to files, but there is no mechanism to route them to platform-specific channels (Telegram, Discord, etc.) based on the gateway that generated the underlying session.

---

## 4. Proactive Insight Engine — Blind Spots

### 4.1 Hardcoded Token Anomaly Threshold is Masked

**File:** `proactive_insight_engine.py` line 38

```python
TOKEN_ANOMALY_THRESHOLD=***    # 3x average = token anomaly
```

The actual value `***` is present in the source. Regardless of the actual number, the comment says "3x" but the check at line 169 uses `>=` — so a value of exactly 3.0x triggers, not slightly above.

### 4.2 detect_cost_spike Has Math Errors

**File:** `proactive_insight_engine.py` lines 108–112

```python
prev_daily = prev_cost / max(len(previous_sessions), 1) * 7 / len(previous_sessions) if previous_sessions else 0
curr_daily = curr_cost / max(len(current_sessions), 1) * 7 / len(current_sessions) if current_sessions else 0

prev_days_approx = len(previous_sessions) / max(1, len(previous_sessions)) * 7
if prev_days_approx == 0:
    return None
```

`prev_days_approx` simplifies to `7` whenever `previous_sessions` is non-empty. This means `prev_daily` and `curr_daily` are dividing by the same value (7), which cancels out — the daily normalization is a no-op and the comparison is of raw totals (not per-day).

### 4.3 detect_session_drop Uses Simple Count Ratio — Easily Misleading

**File:** `proactive_insight_engine.py` line 137

```python
ratio = len(current_sessions) / max(len(previous_sessions), 1)
```

A day with 2 sessions vs a previous period with 3 sessions triggers `SESSION_DROP_THRESHOLD = 0.5` (50%) — only if exactly 50% fewer. But the default threshold is 0.5 (50%), and the check is `ratio <= SESSION_DROP_THRESHOLD`. So it only fires when sessions dropped by 50% or more, which is a very high bar. A drop from 10 to 5 sessions (50%) would be flagged, but a drop from 10 to 6 (40%) would not, even though 40% is also significant.

### 4.4 InsightsEngine._get_tool_usage Double-Counting Risk

**File:** `agent/insights.py` lines 267–279

The merge logic for `tool_name` and `tool_calls` sources takes `max(tool_counts, tool_calls_counts)` per tool. If the same tool call appears in BOTH sources for the same session, it will be double-counted (max doesn't deduplicate across sources, it picks the larger count).

### 4.5 No Resolution for Proactive Alerts

Even when the proactive engine detects a cost spike, session drop, or token anomaly, nothing in the system acts on it. The output goes to stdout (or Telegram via format_gateway) but no auto-remediation is triggered.

---

## 5. Integration & Cross-Cutting Blind Spots

### 5.1 No hermes_remediate Integration

Despite the task mentioning `hermes_remediate`, no such component exists. The alert flow is:
```
monitor_daemon → monitor-state.json → alert_system.py → logs/history → (no action)
```

There is no path from alert detection to system action. Remediation must be manual.

### 5.2 No Heartbeat-Rotativo Mechanism

"heartbeat-rotativo" (rotating heartbeat) is not a named component. However, the delegate tool (`tools/delegate_tool.py` lines 437–469) does implement a real heartbeat thread for delegation — but this is:
- Isolated to delegation only
- Not exposed as a reusable component
- Not monitored by the alert system
- No rotating/periodic health-check mechanism for the agent loop itself

### 5.3 Two Independent Alert Engines with No Correlation

1. `monitor_daemon.py` `check_thresholds()` — fires alerts into its own `alerts[]` list
2. `alert_system.py` `evaluate_state()` — independently evaluates the same state file

Both produce alerts. The monitor-daemon alerts go into `monitor-state.json["alerts"]`. The alert-system alerts go into `alert_history.json`. There is no deduplication between them, no unified view, and no priority ordering across both sources.

### 5.4 start_monitoring.sh Does Not Track Alert System PID

**File:** `start_monitoring.sh` lines 35–40

```bash
$PYTHON "$HERMES_DIR/alert_system.py" &
ALERT_PID=$!
echo $ALERT_PID > "$HERMES_DIR/alert-system.pid"
```

But there is no corresponding `kill` command in the "Stop services" section at the bottom of the script (lines 50–52) — only the monitor daemon PID is documented for stopping. The alert system PID file is written but not used.

### 5.5 No Health Check Between Components

The alert system reads `monitor-state.json` but has no way to detect if the monitor daemon is actually running. If the daemon dies:
- `STATE_FILE.exists()` returns True (file still exists from last run)
- `json.load()` succeeds using stale data
- Alerts are evaluated against potentially very old data

The comment at line 303-305 acknowledges this:
```python
if not state:
    logger.warning("No monitor state file found, is the daemon running?")
```

But it only checks for file existence, not freshness (timestamp age).

### 5.6 process_count Anomaly Detection Is Too Simple

**File:** `alert_system.py` line 181

```python
if proc_count >= 500:
    alerts.append(Alert("WARNING", "process_count", proc_count, 500, f"High process count: {proc_count}"))
```

Only checks absolute count. On a 8-core system, 245 processes is healthy. The threshold should be configurable, and the check should be relative to historical baseline.

---

## 6. Specific Findings Summary

| ID | Severity | Component | Finding |
|---|---|---|---|
| F-01 | CRITICAL | monitor_daemon | Snap squashfs partitions causing alert spam — should be excluded |
| F-02 | HIGH | monitor_daemon | Deduplication window too short (60s) — persistent alerts fire repeatedly |
| F-03 | HIGH | alert_system | WARNING/CRITICAL share rate-limit bucket — CRITICAL can be blocked by WARNING |
| F-04 | HIGH | alert_system | No auto-remediation exists (hermes_remediate not implemented) |
| F-05 | HIGH | proactive_engine | Cost spike daily normalization math is a no-op |
| F-06 | MEDIUM | monitor_daemon | cpu_percent(interval=None) returns 0.0 on first call |
| F-07 | MEDIUM | alert_system | No retry/dead-letter for webhook/email failures |
| F-08 | MEDIUM | alert_system | Threshold misalignment between monitor_daemon and alert_system |
| F-09 | MEDIUM | integration | No freshness check on monitor-state.json — stale data used silently |
| F-10 | MEDIUM | proactive_engine | Session drop threshold (50%) too high — 40% drops undetected |
| F-11 | LOW | monitor_daemon | Temperature metric defined but never collected |
| F-12 | LOW | monitor_daemon | PID file can persist after SIGKILL |
| F-13 | LOW | start_monitoring.sh | alert-system.pid written but not used in stop commands |
| F-14 | LOW | insights | tool_usage merge takes max() — potential double-count |
| F-15 | LOW | alert_system | active_alerts dict populated but never read by any consumer |

---

## 7. Recommendations (Priority Order)

1. **Exclude squashfs snap mounts** from disk alerting (fstype == "squashfs") — eliminates spam
2. **Increase deduplication window** in monitor_daemon to 300s (5 min) matching alert_system
3. **Separate rate-limit buckets** per severity level per metric
4. **Add state freshness check**: validate `timestamp` age in monitor-state.json before processing
5. **Fix cpu_percent()** to use `interval=0.1` on first call
6. **Implement hermes_remediate** as a new component: alert triggers → action plan → execution → verification
7. **Fix cost_spike normalization** math — divide by actual days in period, not session count
8. **Add hysteresis** — emit RESOLVED events when metrics return below threshold
9. **Add webhook/email retry queue** with exponential backoff
10. **Add stop command** for alert-system.pid in start_monitoring.sh footer

---

## 8. Component Interaction Map

```
SessionDB (SQLite)
    │
    └── proactive_insight_engine.py ──reads──> SessionDB
              │
              └── generates ──> stdout / Telegram (no auto-action)

monitor_daemon.py ──writes──> monitor-state.json
    │                              │
    └── check_thresholds()          └── alert_system.py ──reads──> monitor-state.json
              │                              │
              └── logs (alerts list)         └── dispatch_log / dispatch_file / dispatch_webhook / dispatch_email
                                               │
                                               └── alert_history.json
                                               │
                                               └── (NO auto-remediation)

monitor_daemon ──writes──> monitor-state.json ──reads──> monitor_dashboard.py (TUI)
```

**Legend:** No component in this chain has the ability to change system state. All are observers and notifiers only.
