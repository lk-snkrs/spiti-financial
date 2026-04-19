# Hermes PRD — Proactivity Capabilities

## 1. Executive Summary

Hermes is currently a **reactive agent** — it responds to user input but takes no autonomous action between requests. Competitor agents (AutoGPT, LangChain Agents, Claude's Computer Use) operate on loops that include self-directed planning, environmental monitoring, and iterative goal refinement. Closing this gap is the highest-leverage improvement for making Hermes feel like a true intelligent assistant rather than a sophisticated autocomplete.

**Target state**: Hermes Level 3 — Partially Autonomous Agent
> *Given a goal, the agent plans, executes, and adjusts using its toolkit with minimal oversight.*

---

## 2. Proactivity Gap Analysis

### 2.1 Current Architecture

| Component | Current Behavior | Proactivity Level |
|-----------|-----------------|-------------------|
| Agent Loop | Synchronous, single-turn: user input → LLM → tool calls → done | Level 0 — Purely reactive |
| Memory | Passive storage, read at session start, never updated mid-session without explicit tool call | Level 1 — Storage only |
| Todo | In-memory task list, session-scoped, no autonomous tracking | Level 1 — Ephemeral state |
| Delegate | Explicit spawn only, no self-initiated subagent creation | Level 0 — No autonomy |
| Cron | Time-based scheduling, but **user must configure jobs** — agent cannot self-schedule | Level 1 — External trigger |
| Skills | Loaded on demand, no autonomous skill selection or learning | Level 0 — Reactive |

### 2.2 The Core Gap: No Autonomous Loop

The `HermesAgentLoop` class runs a tool-calling loop until `max_turns` or the model stops calling tools. This is structurally similar to LangChain's `AgentExecutor`, but lacks:

1. **Self-evaluation** — the agent cannot judge whether its current state is progress toward a goal
2. **Plan adaptation** — no replanning when a tool result contradicts expectations
3. **Environmental monitoring** — no passive observation of system state between turns
4. **Self-initiated action** — every action traces back to an explicit user turn
5. **Persistent autonomous context** — no concept of "working on something in the background"

### 2.3 Maturity Mapping (AWS Framework)

| Level | Name | Hermes Current | Target |
|-------|------|---------------|--------|
| 1 | Chain | ✅ CLI commands, cron scripts | — |
| 2 | Workflow | ✅ Delegate + batch subagents | — |
| 3 | Partially Autonomous | ❌ No self-evaluation loop | **This PRD** |
| 4 | Fully Autonomous | ❌ No self-set goals | Future |

---

## 3. Proposed Capabilities

### 3.1 Autonomous Loop (`autonomous_loop` mode)

**What**: A new execution mode for `AIAgent` where the agent:
1. Receives a high-level **goal** (not a specific task)
2. Decomposes into sub-tasks autonomously (using `todo` tool)
3. Iterates: execute → evaluate result → adapt plan
4. Can spawn subagents via `delegate_task` for independent workstreams
5. Runs in a background thread, periodically reporting to the parent conversation
6. Stops when: goal achieved, max iterations reached, or user interrupts

**Behavioral difference vs. current loop**:

```
CURRENT (reactive):
  User: "build me a web scraper"
  → Agent runs, produces code, DONE

AUTONOMOUS (proactive):
  User: "monitor GitHub for issues on my repos and summarize daily"
  → Agent decomposes: [set up monitoring, check issues, summarize]
  → Agent acts on each sub-task
  → Agent recognizes it can't complete in one session (long-running)
  → Agent creates a cron job to check issues daily
  → Agent reports completion with "I've set up daily monitoring"
```

**Key design constraints**:
- Must be **interruptible** at any point by the user
- Progress must be visible so the user can course-correct
- Max autonomous duration should be configurable (`autonomous_max_duration` in config.yaml)
- Never performs destructive actions autonomously (always confirm)

**Implementation notes**:
- Wrap existing `HermesAgentLoop` with an outer evaluation loop
- Add a `should_continue()` check: calls the LLM with tool results + goal, asks "have we succeeded / should we continue?"
- Track `goal_progress` in `TodoStore` with new `blocked` / `failed` statuses
- Background thread model: same pattern as cron scheduler's `ThreadPoolExecutor`

### 3.2 Proactive Memory — Episodic Learning

**What**: Hermes should **proactively write to memory** without being asked, based on:
1. **User corrections** — "remember this" patterns, but also corrections that imply a preference
2. **Self-discovered facts** — environment facts the agent learns mid-session (tool versions, OS details, project conventions)
3. **Outcome patterns** — when a task succeeds or fails, record why for future reference

**Behavioral change**: The agent is **instructed in its system prompt** to call `memory.add(...)` proactively when it:
- Receives a correction from the user (content correction or preference signal)
- Discovers a tool/OS/project fact that wasn't in context
- Completes a task that involved non-obvious decisions or workarounds

**Schema change**: No new tool needed — the existing `memory` tool with `action=add` is sufficient. The proactivity is a **behavioral directive** in the prompt, not a new capability.

**Character budget**: Current limits (2200 memory / 1375 user) are appropriate but the agent should be coached to be concise.

### 3.3 Background Observer Mode

**What**: A lightweight daemon thread, spawned on session start, that:
1. **Monitors configured watch paths** (file changes, log file updates)
2. **Watches scheduled jobs** — alerts the agent if a cron job fails
3. **Tracks time-bounded tasks** — if the user asks "remind me in 30 min", the observer handles the timer
4. **Maintains "while you were away" summary** — when the user returns, reports significant events

**Use cases**:
- `//watch ./src` → agent reacts to file changes (code change monitoring)
- Cron job failure → observer notifies agent → agent can auto-fix or alert user
- User says "check on X in 2 hours" → observer fires a callback → agent follows up proactively

**Implementation notes**:
- Lightweight: `watchfiles` library for file watching, `threading.Timer` for reminders
- Observer results stored in a `~/.hermes/observer_events.jsonl` — agent reads on next turn
- Observer tool: `observer_tool` with actions: `watch(path, pattern)`, `unwatch(path)`, `list_watches()`
- Config: `observer.watch_paths: []` in config.yaml

### 3.4 Self-Scheduling (Agent-Initiated Cron)

**What**: The agent can **create its own cron jobs** without user configuration.

**Example**:
```
User: "keep an eye on my Klaviyo metrics and alert me if open rates drop below 20%"
→ Agent: calls new tool `create_cron_job(...)` 
→ Job is created with schedule "daily" and appropriate script/prompt
→ Agent reports: "I've set up daily monitoring. You'll be alerted if open rates drop."
```

**New tool**: `create_cron_job(goal, schedule, deliver="origin")` → returns job ID

**Behavioral constraints**:
- Max 5 agent-created cron jobs per user (prevent abuse)
- Agent-created jobs have `origin: agent` to distinguish from user-created
- User can view/list/delete agent-created jobs with `cron list --creator=agent`

---

## 4. Implementation Phases

### Phase 1: Minimal Proactivity (Low risk, high impact)
- **Owner**: System prompt change + behavioral coaching
- **Changes**: Update system prompt to instruct agent to proactively write memory
- **No code changes** beyond prompt injection
- **Metric**: Memory write frequency in telemetry

### Phase 2: Autonomous Loop
- **Owner**: `run_agent.py` + `HermesAgentLoop`
- **Changes**: New `mode="autonomous"` in `AIAgent.__init__`, outer evaluation loop, `should_continue` LLM call
- **Risk**: Medium — affects core loop, needs careful testing
- **Metrics**: Autonomous task completion rate, average turns to goal

### Phase 3: Background Observer
- **Owner**: New file `tools/observer_tool.py`, integration in `run_agent.py`
- **Changes**: File watcher daemon, observer events store, new tool schema
- **Risk**: Low — additive, no existing behavior changed
- **Metrics**: Observer events captured, user engagement with "while you were away"

### Phase 4: Self-Scheduling
- **Owner**: `tools/cronjob_tools.py` + new tool schema
- **Changes**: New `create_cron_job` tool, owner tracking on jobs
- **Risk**: Low — uses existing cron infrastructure
- **Metrics**: Agent-created job count, job completion rate

---

## 5. Configuration Options

```yaml
# config.yaml
proactivity:
  autonomous_max_duration: 3600   # seconds before autonomous loop self-terminates
  autonomous_max_iterations: 200  # max turns in autonomous mode
  memory_auto_save: true           # coach agent to proactively save to memory
  observer_enabled: true           # enable background file/job watching
  max_agent_cron_jobs: 5           # cap on agent-created cron jobs

observer:
  watch_paths: []                  # paths to passively monitor
  watch_debounce_ms: 500           # debounce file change events
```

---

## 6. Open Questions

1. **Safety bounds**: What actions should be blocked in autonomous mode? (e.g., `send_message` to external chats, `execute_code` with sudo)
2. **Context window management**: Long autonomous runs generate huge histories. Should autonomous sessions use a separate, larger context window?
3. **Billing transparency**: Autonomous loops can make many API calls. How do we surface cost to the user before engagement?
4. **Observer privacy**: File watching raises privacy questions. Should this require explicit opt-in per-directory?
