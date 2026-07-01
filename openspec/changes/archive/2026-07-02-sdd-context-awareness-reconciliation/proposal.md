# Proposal: SDD Context Awareness & Spec Reconciliation

## Intent

Two gaps let the plugin's own SDD flow be silently bypassed. (1) **Discoverability:** the orchestrator only routes into SDD when the user says "SDD" or runs `/sdd-*`. A plain request ("fix this bug in X") that touches files inside an active change's scope or a specced baseline domain never triggers a nudge. (2) **Drift:** direct edits (no `/sdd-apply`) let `openspec/specs/**` drift from code, with no passive detection — only a manual `/sdd-baseline` re-run catches per-domain hash staleness. This change adds ambient awareness plus continuous, advisory-only drift detection, and an opt-in reconcile command.

## Scope

### In Scope
- **Drift-detection helper** in `scripts/lib/ospec-state.js` comparing each baseline-owned domain's recorded manifest commit hash against current HEAD for that domain's source globs.
- **Session-start drift summary** (aggregate: N drifted domains) via a new `result.specDrift` field, mirroring existing security/gitCollaboration blocks.
- **Pre-tool-use pre-commit advisory**: on `git commit`, `ask` (never `deny`) when drifted domains overlap staged files.
- **Ambient awareness gate** in `agents/sdd-orchestrator.agent.md` (near SDD Init Guard): an always-on rule directing `AskUserQuestion` when a non-trivial task overlaps an active change's scope or a specced domain — independent of the word "SDD".
- **New `/sdd-reconcile` command + `skills/sdd-reconcile/SKILL.md`**: opt-in, folds drifted code into retroactive spec deltas scoped to the per-domain diff window.
- `DISABLE_SPEC_DRIFT_GUARD` env-var kill switch for the new hook paths.

### Out of Scope
- Automatic spec rewriting or hard-blocking edits/commits (always advisory).
- Changing `sdd-baseline` hash-recording behavior.
- Hand-editing `dist/` (regenerated from source).

## Capabilities

### New Capabilities
- `spec-reconciliation`: `/sdd-reconcile` command + skill that seeds retroactive spec deltas from the diff since a domain's last recorded baseline hash.

### Modified Capabilities
- `hooks`: session-start drift summary, pre-tool-use pre-commit drift advisory, and the `ospec-state.js` drift helper.
- `agents`: ambient SDD awareness active-question gate in the orchestrator.

## Approach

Reuse existing primitives, additively. Drift = `manifest.md` per-domain hash vs. `git diff <hash>..HEAD` filtered by that domain's source globs (from the manifest Domain Map). Session-start already computes `baselineHint`/reads config — add a parallel `specDrift` block guarded by `DISABLE_SPEC_DRIFT_GUARD`, appending to `systemMessage`. Pre-tool-use reuses the `isRiskyAction`/`makeDecision("ask", ...)` pattern already used by the git-collaboration guard. The awareness gate is prose-only in the orchestrator agent, consuming the `specDrift`/`capabilities` context already injected at session start.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/ospec-state.js` | Modified | New domain-drift helper (hash vs. HEAD by source globs) |
| `scripts/hooks/session-start.js` | Modified | Additive `result.specDrift` block + env kill switch |
| `scripts/hooks/pre-tool-use.js` | Modified | Additive pre-commit drift advisory (`ask`) |
| `agents/sdd-orchestrator.agent.md` | Modified | Ambient awareness active-question rule |
| `skills/sdd-reconcile/SKILL.md`, `commands/sdd-reconcile.prompt.md` | New | Opt-in reconcile flow |
| `dist/**` (all 4 targets) | Regenerated | Built from source; not hand-edited |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| False-positive awareness prompts create friction on every edit/commit | High | Precise "non-trivial" threshold (multi-file / new-logic, not one-line fixes) — deferred to sdd-design; env kill switch |
| Bug in per-session hooks has high blast radius (runs for every project) | Med | Additive blocks only; wrap in try/catch (never break session start); `DISABLE_SPEC_DRIFT_GUARD` opt-out |
| Domain→file ownership ambiguity for drift | Med | Derive globs from manifest Domain Map; resolve edge cases in sdd-design |
| `git diff` cost on large repos at session start | Low | Reuse short-hash diff scoped to globs; 5s timeout pattern like git-state |

## Rollback Plan

All hook changes are additive blocks, not rewrites of existing logic. Rollback tiers: (1) immediate — set `DISABLE_SPEC_DRIFT_GUARD=true` to neutralize both hook paths at runtime; (2) full — revert the additive blocks in `session-start.js`/`pre-tool-use.js`/`ospec-state.js` and the orchestrator gate, then rebuild `dist/`. The `/sdd-reconcile` skill/command are new files, removable with no impact on existing routes. No data migration is involved.

## Dependencies

- Existing `openspec/specs/_baseline/manifest.md` per-domain hashes.
- Git available in workspace (already assumed by git-state hooks).

## Success Criteria

- [ ] Drifted baseline domains surface at session start (advisory) and before `git commit`, never blocking.
- [ ] Orchestrator issues an `AskUserQuestion` when a non-trivial task overlaps an active change or specced domain, without the user mentioning SDD.
- [ ] `/sdd-reconcile` produces retroactive spec deltas scoped to the per-domain diff window.
- [ ] `DISABLE_SPEC_DRIFT_GUARD=true` fully neutralizes the new hook paths.
- [ ] `npm test` passes across all four build targets; no `dist/` hand-edits.
- [ ] `sdd-design` resolves: (a) "non-trivial" definition, (b) domain→path ownership rule, (c) env-var opt-out surface.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention from the `branch-pr` skill (e.g. `git checkout -b feat/sdd-context-awareness-reconciliation main`).
