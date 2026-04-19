---
name: prd-creation-systematic-audit
description: Create comprehensive PRDs using parallel subagent audits. Each area gets a dedicated subagent for honest system assessment.
---

# PRD Creation Systematic Audit Pattern

## Context
When starting a new improvement cycle or quarterly review, use this pattern to create comprehensive PRDs.

## Pattern: Parallel Subagent Audit

Run 3-4 subagents in parallel, each auditing a different area:

```
Subagent 1: Infrastructure (VPS, SSH, Docker, Services)
Subagent 2: Intelligence (Brain/mem0, decisions quality, session protocols)
Subagent 3: Reliability (monitoring, alerting, proactivity)
Subagent 4: Data/Crons (LK data, cron efficiency, costs)
```

Each subagent:
- Probes real data (not assumptions)
- Finds actual bugs, not theoretical ones
- Grades each component 1-10 with honest scores
- Documents what works vs what's broken

## Key Lessons Learned

### Lesson 1: "100% OK" is always wrong
Never accept "system is healthy" without probing:
- Token validity != data freshness
- Cron running != data being inserted
- No errors logged != everything working

### Lesson 2: Monitor what actually matters
- Snap disks at 100% = expected behavior, filter them
- CPU 0.0 on first call = psutil needs initialization
- Rate-limit collision = WARNING blocks CRITICAL

### Lesson 3: Integration > Existence
A script that exists but is never called is useless:
- hermes_remediate.sh existed for months, never called
- health_check checked PAT but not tokens inside scripts
- "system 100%" persisted while data was 7 days stale

### Lesson 4: PRD must have clear ownership
- Items only user can do (external auth, payments)
- Items agent can do independently
- Items blocked by dependencies

## Trigger
Use when:
- Starting a new improvement cycle
- After a major incident
- Monthly/quarterly review
- User asks "are we really 100%?"

## Files Generated
Save PRDs to `~/.hermes/memories/prds/`
