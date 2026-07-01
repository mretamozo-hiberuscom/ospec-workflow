---
name: sdd-baseline
description: Seed openspec/specs/ with baseline specs of existing behavior (brownfield repos, resumable batches).
argument-hint: "<domain name or blank>"
tools: ['Agent', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'PowerShell']
---

Route this slash command to the `sdd-baseline` executor via the SDD orchestrator.

Launch or resume the `sdd-baseline` phase. Each run completes one domain batch and returns `partial` until all pending domains are done. Pass any optional domain name to target a specific domain.

User input: `$ARGUMENTS`
