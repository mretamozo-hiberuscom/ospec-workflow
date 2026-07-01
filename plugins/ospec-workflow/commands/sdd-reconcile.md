---
name: sdd-reconcile
description: Fold already-shipped, undocumented code changes back into a baseline domain's spec as a retroactive, diff-window-scoped delta.
argument-hint: "<domain name or blank>"
tools: ['Agent', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'PowerShell']
---

Route this slash command to the `sdd-reconcile` executor via the SDD orchestrator.

Launch the `sdd-reconcile` phase for the given domain, or for every domain currently reported as drifted when no domain is given. This is an explicit, opt-in action — it is never auto-invoked by a hook or advisory.

User input: `$ARGUMENTS`
