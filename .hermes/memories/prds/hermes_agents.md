# Hermes PRD — New Sub-Agent Opportunities

## 1. Executive Summary

Hermes has a mature **delegate tool** (`delegate_task`) that spawns isolated subagent processes with restricted toolsets. Currently, subagents are **general-purpose** — the parent delegates a specific task, the child handles it, returns a summary. This is powerful but underspecialized.

The next leap is **specialized subagent archetypes** — agents pre-configured with domain-specific system prompts, toolsets, and behavioral defaults. This document identifies concrete opportunities, maps them to Hermes's existing infrastructure, and defines concrete PRD specs for each.

---

## 2. Current Delegate Architecture — Baseline

The `delegate_task` tool (tools/delegate_tool.py) currently:
- Spawns `AIAgent` children with isolated `task_id` (separate terminal session, file cache)
- Supports single and batch (parallel, up to 3 concurrent) modes
- Inherits parent's enabled toolsets, strips blocked tools (`delegate_task`, `clarify`, `memory`, `send_message`, `execute_code`)
- Supports different `provider:model` per subagent via `delegation.provider` config
- Max delegation depth: **2** (parent → child → grandchild rejected)
- Progress callback relays child tool calls to parent spinner/display
- Heartbeat thread prevents gateway inactivity timeout during long subagent runs

**What this means**: Building a new subagent type mostly means:
1. Writing a **focused system prompt** (the `ephemeral_system_prompt` arg)
2. Optionally restricting the **toolset** (pass `toolsets=[...]` to delegate)
3. Optionally routing to a **different model** (via `tasks[i].model` or delegation config)
4. Optionally providing **context templates** — known patterns the subagent handles

No new delegation infrastructure needed — just new prompt + toolset configurations.

---

## 3. Specialized Subagent Opportunities

### 3.1 Research Agent

**Role**: Deep-dive web research with structured output

**System prompt archetype**:
```
You are a focused research agent. Your job is to gather comprehensive,
accurate information on the given topic using web search and extraction tools.

OUTPUT FORMAT:
- Key findings (bullet list)
- Sources (URLs, starred if high confidence)
- Knowledge gaps (what you couldn't find)
- Recommended next steps

RULES:
- Verify information across multiple sources before reporting
- Flag conflicting information explicitly
- Do NOT speculate; distinguish facts from hypotheses
- Stop when you have sufficient evidence, not when you hit max iterations
- Report concisely — the parent agent synthesizes your output
```

**Toolset**: `['web', 'file']` — web search/extract + file write for saving research

**Use cases**:
- Parent agent needs market research, competitive analysis, technical deep-dive
- Complex multi-source queries that would flood parent context
- "Research X and save findings to research/x.md"

**Existing partial implementation**: `skills/autonomous-ai-agents/` skill exists — this would be a code-level specialization of that pattern

**Differentiation from generic delegate**:
- Structured output template enforced in prompt
- Stop condition: "sufficient evidence" not "max iterations"
- Explicit source credibility scoring

### 3.2 Code Review Agent

**Role**: Specialized agent for reviewing code changes, PRs, and codebases

**System prompt archetype**:
```
You are an expert code review agent. You analyze code for:
1. Correctness — logic errors, edge cases, race conditions
2. Security — injection vectors, credential handling, input validation
3. Performance — N+1 queries, unnecessary allocations, algorithmic complexity
4. Maintainability — naming, comments, test coverage, API design
5. Best practices — language idioms, framework conventions, dependency health

OUTPUT FORMAT:
## Issues Found
- [CRITICAL] File:line — description — suggested fix
- [WARN] File:line — description — suggested fix  
- [INFO] File:line — observation

## Summary
X critical, Y warnings, Z info items
Hotspots: most concerning areas ranked by severity

RULES:
- Always provide specific file:line references
- Provide actionable fixes, not just descriptions
- Distinguish opinion (style) from evidence-based issues
- Check test coverage — flag files without tests
```

**Toolset**: `['terminal', 'file', 'code_execution']`
- `terminal`: run linters, test suites, git commands
- `file`: read source files in full
- `code_execution`: run test commands, validate syntax

**Use cases**:
- Pre-commit code review: "review the changes in this branch"
- Security audit: "run a security review on this codebase"
- PR review automation in CI/CD pipelines
- Technical debt analysis

**Integration point**: Could be triggered by a git hook or by the `terminal` tool's `watch` pattern for file changes in a PR branch

### 3.3 Debug Agent

**Role**: Systematic debugging with structured failure mode analysis

**System prompt archetype**:
```
You are an expert debugging agent. You investigate failures systematically:

DIAGNOSTIC PROTOCOL:
1. REPRODUCE — confirm the failure with minimal reproduction
2. ISOLATE — narrow to the specific component/line
3. HYPOTHESIZE — form a testable theory for root cause
4. VERIFY — test the hypothesis directly
5. FIX — apply minimal correct fix
6. CONFIRM — verify fix resolves the original failure

OUTPUT FORMAT:
## Reproduction
Command/steps to reproduce: [command]

## Root Cause
[One sentence. If uncertain, list top 2-3 hypotheses with confidence %]

## Fix Applied
[Specific changes: file, line, before → after]

## Verification
[Confirmation that the fix works and doesn't break other tests]

RULES:
- Always reproduce before fixing
- Never assume — verify every hypothesis
- Prefer the minimal fix over architectural changes
- If fix requires more than 3 file changes, flag for human review
```

**Toolset**: `['terminal', 'file', 'code_execution']`
- Same as code review but focused on the failing code path

**Differentiation from generic delegate**:
- Structured diagnostic protocol enforced
- Explicit reproduction step before any fix
- Minimal-fix discipline with escalation threshold

### 3.4 Data Analysis Agent

**Role**: Autonomous data processing, transformation, and insight extraction

**System prompt archetype**:
```
You are a data analysis agent. You work with CSV, JSON, and structured data files.

CAPABILITIES:
- Load and explore datasets (head, describe, shape, dtypes)
- Clean data (missing values, outliers, type conversions)
- Transform and join datasets
- Generate summary statistics and visualizations (save as PNG)
- Identify correlations, trends, anomalies
- Export processed data and analysis reports

OUTPUT FORMAT:
## Dataset Overview
[Shape, columns, types, missing data %]

## Key Findings
[Top 3-5 insights with supporting numbers]

## Transformations Applied
[List of cleaning/transform steps]

## Output Files
[Files created and their purpose]

## Next Steps
[Recommended follow-up analyses]
```

**Toolset**: `['file', 'code_execution']` — file for reading/writing data, `code_execution` for Python-based analysis

**Code execution configuration**: 
```python
# When delegating to data analysis agent:
execution_mode="interactive"  # REPL-style, persists across calls
libraries=["pandas", "numpy", "matplotlib", "scipy", "scikit-learn"]
```

**Use cases**:
- "Analyze our sales data from last quarter and find trends"
- "Clean this messy CSV and produce a deduplicated version"
- "Run statistical tests on experiment results and report significance"

### 3.5 Test Generation Agent

**Role**: Automatically generate test coverage for code files

**System prompt archetype**:
```
You are a test generation agent. You write comprehensive tests for Python code.

PRIORITY ORDER:
1. Happy path tests for every public function/method
2. Edge case tests (empty inputs, None, boundary values)
3. Error condition tests (invalid inputs, exception paths)
4. Integration tests for multi-component workflows

TEST STYLE:
- pytest format with clear test names: test_<function>_<scenario>
- Each test is self-contained (no shared state between tests)
- Use pytest fixtures for common setup
- Mock external dependencies (APIs, databases, file I/O)
- Include docstrings explaining what is being tested and why

OUTPUT:
- Write tests to the file specified in context
- If no file specified, write to tests/test_<module>.py
- Include __init__.py if creating new test directories
```

**Toolset**: `['file', 'terminal']` — file for reading source + writing tests, terminal for running test suite to validate

**Escalation**: If code is too complex for reliable automatic tests (e.g., involves external APIs, async workflows), return a list of manual test cases to write instead

### 3.6 Monitoring/Alerting Agent

**Role**: Passive monitoring of system state, proactively reporting anomalies

**Differentiation from Cron**: 
- Cron runs on schedule (time-based)
- Monitoring agent runs on **event-based** triggers (file change, log pattern, metric threshold)
- Can run continuously as a background daemon

**System prompt archetype**:
```
You are a monitoring agent. You watch for specific patterns and report when triggered.

MONITORING RULES:
You have been configured with specific watch patterns. When a pattern fires:

1. ASSESS — determine severity and relevance
2. CORRELATE — check if this is part of a larger pattern (e.g., repeated failures)
3. RESPOND:
   - If CRITICAL: send alert immediately via send_message
   - If WARN: log and include in next periodic summary
   - If INFO: no action, log only

4. ESCALATE if:
   - The same issue fires more than 3 times in 10 minutes
   - A fix you attempted didn't resolve the issue
   - The issue affects user-facing functionality

REPORTING:
Every 15 minutes (or on demand), produce a summary:
## Monitoring Report
- Events fired: [list]
- Resolved automatically: [list]
- Escalated: [list]
- System status: HEALTHY/DEGRADED/CRITICAL
```

**Toolset**: `['terminal', 'file', 'send_message']` — terminal for log commands, file for reading logs, send_message for alerts

**Integration with Background Observer** (from proactivity PRD):
- The observer fires events into `~/.hermes/observer_events.jsonl`
- The monitoring agent reads events, evaluates them against rules, and acts

---

## 4. Cross-Cutting Infrastructure

### 4.1 Subagent Registry

Define a registry of **subagent archetypes** in `agent/subagent_registry.py`:

```python
SUBAGENT_TYPES = {
    "research": SubagentDef(
        name="Research Agent",
        system_prompt_template=RESEARCH_AGENT_PROMPT,
        default_toolsets=["web", "file"],
        default_model=None,  # inherits from parent
        max_iterations=80,
    ),
    "code_review": SubagentDef(...),
    "debug": SubagentDef(...),
    "data_analysis": SubagentDef(...),
    "test_generation": SubagentDef(...),
    "monitoring": SubagentDef(...),
}
```

**Benefits**:
- Model can reference `delegate_task(tasks=[{"type": "research", "goal": "..."}])` — type-safe
- Documentation auto-generated from registry
- Consistent toolset defaults per archetype
- Enables future `//research` slash command shortcut

### 4.2 Structured Output Enforcement

Many subagents above have structured output formats. Rather than relying on prompt instruction alone, Hermes should:

1. Use **instructed output schemas** — pass a `response_format` to the subagent's LLM call
2. Parse the output with a lightweight schema validator (pydantic or manual)
3. If parsing fails, retry once with "your output didn't match the expected format, please reformat"

This ensures the parent agent gets parseable data from subagents, not just freeform text.

### 4.3 Subagent-to-Subagent Communication

Currently, subagents cannot communicate with each other — they each get isolated contexts. For complex workflows (e.g., research → code review → test generation), consider:

```
Pattern A — Sequential Handoff:
  Parent spawns ResearchAgent → results written to file
  Parent spawns CodeReviewAgent → reads from research output
  Parent spawns TestGenAgent → reads from code review output

Pattern B — Shared Context Space:
  Subagents share a temporary `context_store` (file-based or in-memory dict)
  Each writes outputs with a structured key namespace
  Parent reads all outputs after all complete

Pattern C — Supervisor Pattern:
  Parent spawns a SupervisorAgent with full context
  Supervisor spawns/coordinates WorkerAgents for sub-tasks
  Supervisor synthesizes final output (delegate depth: 2 → 3)
```

**Recommendation**: Implement Pattern A first (file-based handoff, no new infrastructure), then evaluate if Pattern B or C is needed.

---

## 5. Recommended Priority Order

| Priority | Subagent | Rationale |
|----------|----------|-----------|
| 1 | **Research Agent** | Highest immediate utility, clearest structure, minimal new infra |
| 2 | **Debug Agent** | Solves a real daily pain point, structured protocol well-defined |
| 3 | **Test Generation Agent** | High value for code quality, clear output format |
| 4 | **Code Review Agent** | Requires more nuance (opinion vs evidence), harder to constrain |
| 5 | **Data Analysis Agent** | Requires `code_execution` with proper sandbox, more risk |
| 6 | **Monitoring Agent** | Depends on Background Observer (proactivity PRD Phase 3) |

---

## 6. Prompt Engineering Notes

**Critical principle**: Subagent system prompts must be **self-contained**. The subagent knows nothing about the parent's conversation. Every piece of context the subagent needs must be:
1. In the `goal` string (task-specific)
2. In the `context` string (background, constraints)
3. In the workspace path hints

The existing `_build_child_system_prompt()` in `delegate_tool.py` already handles this pattern. New subagent prompts should follow the same structure:
```
[Role]
[TASK]
[CONTEXT]
[OUTPUT FORMAT]
[WORKSPACE PATH]
[Behavioral rules]
```

---

## 7. Open Questions

1. **Model routing**: Should specialized subagents use different (cheaper/faster) models? E.g., debug and test gen on `haiku`, research on `sonnet`, code review on `opus`.
2. **Subagent memory**: Should subagents have write access to a **task-scoped memory** (not shared `MEMORY.md`) that the parent can read afterward? This would enable lightweight handoffs without file I/O.
3. **Cost visibility**: How should subagent API costs be surfaced to the parent and end user?
4. **Timeout strategy**: Different subagent types need different timeouts — research might need 5 minutes, code review 30 seconds. Should timeout be per-type or per-task?
