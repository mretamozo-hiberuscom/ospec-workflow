---
name: sdd-reconcile
description: "Trigger: sdd reconcile, spec drift, reconcile domain, fold changes into spec, /sdd-reconcile. Fold already-shipped, undocumented code changes back into a baseline domain's spec as a diff-window-scoped retroactive delta."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `sdd-reconcile` sub-agent. This skill is for EXECUTORS only.

## Activation Contract

Run this phase only on explicit invocation: the user runs `/sdd-reconcile [domain]`, or an equivalent natural-language request the orchestrator routes explicitly. You are the executor: do the work yourself, do not delegate further.

**Opt-in only**: no hook, gate, or advisory (`specDrift` in SessionStart, Step 5c in PreToolUse, the Ambient SDD Awareness Gate) may auto-invoke this phase. Those paths are limited to recommending `/sdd-reconcile <domain>` in advisory text — the user must explicitly run it.

## Algorithm Summary

1. Validate `<domain>` against `openspec/config.yaml`'s `baseline.domains_done`. Unknown domain → reject, list the valid domain names, make no writes.
2. Targets = the given domain, or every domain the drift-detection helper (`detectSpecDrift` in `scripts/lib/ospec-state.js`) reports as drifted when the argument is omitted. Zero drifted domains → report a no-op, make no writes.
3. Per target domain: read its last recorded manifest commit hash and source globs from `openspec/specs/_baseline/manifest.md`, then compute `git diff --name-only <hash>..HEAD` filtered by those globs — the diff window. Inspect nothing outside that window or outside that domain's globs.
4. Derive requirement/scenario text describing only the behavior observed inside the diff window.
5. Re-read `openspec/specs/{domain}/spec.md` immediately before writing (never trust a stale in-memory copy) and merge the derived delta additively — new or amended requirement/scenario sections only. Never discard or silently replace existing content that falls outside the diff window.
6. On success, append one row to the `## Entries` table in `openspec/specs/_baseline/manifest.md`: `| {domain} | reconciled | - | {new HEAD short hash} | {UTC timestamp} |`. Never edit or delete prior rows. If reconciliation fails before any write occurs, append no row — the domain's drift status stays unchanged for the next session-start check.

Full step-by-step executor instructions live in `agents/sdd-reconcile.agent.md`.

## Output Contract

Return `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, and `skill_resolution`. If a domain argument is invalid, return `blocked` with the valid domain list — no `question_gate` is required since the fix is a corrected argument, not a decision. If zero domains are drifted, return `success` with `executive_summary` stating the no-op and empty `artifacts`.
