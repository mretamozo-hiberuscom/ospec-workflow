# Tasks: SDD Context Awareness & Spec Reconciliation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| Domain Drift Detection Helper (drifted / not-drifted / suppression / fail-safe / sources-parsed-from-manifest) | MUST | `scripts/lib/ospec-state.js`: `detectSpecDrift`, `readStagedFiles`, `matchesGlobs` + manifest parser | covered-by-design | Sync, shared 5s deadline, mirrors `resolveGitState` |
| SessionStart Spec Drift Summary (present / absent-no-drift / absent-bypass / absent-not-init) | MUST | `scripts/hooks/session-start.js` additive `specDrift` block after git-collab (~line 208) | covered-by-design | try/catch; `DISABLE_SPEC_DRIFT_GUARD` gate |
| Pre-Commit Drift Advisory Step 5c (fires-on-overlap / no-overlap / DENY-precedence / bypass) | MUST | `scripts/hooks/pre-tool-use.js` Step 5c after 5b, before Step 6 | covered-by-design | Always `ask`, never `deny`; same bypass var |
| Ambient SDD Awareness Active-Question Gate (all 8 scenarios incl. OR-condition trade-off) | MUST | `agents/sdd-orchestrator.agent.md` new CORE subsection after Init Guard (~line 164) | covered-by-design | Prose-only; ≥2 files OR new logic/architecture |
| Opt-In Invocation Only | MUST | Hooks only recommend text; `agents/sdd-reconcile.agent.md` is the sole executor | covered-by-design | No hook auto-invokes reconcile |
| Diff-Window-Scoped Retroactive Spec Delta (domain-specified / omitted-all-drifted / no-op) | MUST | `agents/sdd-reconcile.agent.md` algorithm steps 1-4 | covered-by-design | Inspects only the filtered diff window |
| Read-Then-Update — No Silent Overwrite | MUST | `agents/sdd-reconcile.agent.md` algorithm step 5 | covered-by-design | Re-read before merge; additive only |
| Manifest-Append Convention (row appended / failure = no row) | MUST | `agents/sdd-reconcile.agent.md` algorithm step 6 | covered-by-design | Mirrors `sdd-baseline` append-only convention |
| Unknown Domain Handling | MUST | `agents/sdd-reconcile.agent.md` algorithm step 1 | covered-by-design | Reject before any diff/write |
| Command and Skill Registration (routes via orchestrator / discoverable) | MUST | `commands/sdd-reconcile.prompt.md` + `skills/sdd-reconcile/SKILL.md` | covered-by-design | Mirrors `sdd-baseline` triplet |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none — design.md's Open Questions section is resolved (agent file required, full triplet)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~850-950 (excl. `dist/`, gitignored/regenerated, per rollout note) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Unit 1: drift primitives; Unit 2: hook integrations; Unit 3: orchestrator prose + reconcile triplet |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | `scripts/lib/ospec-state.js` drift primitives + `ospec-state.test.js` | PR 1 | Self-contained; settles the shared interface both hooks depend on |
| 2 | `session-start.js` + `pre-tool-use.js` integrations + their test files | PR 2 | Depends on Unit 1's exports being stable |
| 3 | `agents/sdd-orchestrator.agent.md` prose/frontmatter + `/sdd-reconcile` triplet + `dist/` regeneration | PR 3 | Prose/new files only; no shared runtime logic with Units 1-2 |

> With `exception-ok`, a single oversized PR with `size:exception` is the accepted path; the unit split above is for implementation-order clarity, not a required chain.

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Drift Detection Primitives (`scripts/lib/ospec-state.js`) — Foundation

- [x] 1.1 **RED** — In `ospec-state.test.js`, add failing tests for `matchesGlobs(file, globs)`: `**` any-depth match, `*` single-segment match, literal match, no-match. Run `npm test` — expect failures.
- [x] 1.2 **RED** — Add failing tests for `readStagedFiles(gitRunner, timeoutMs)`: parses `git diff --name-only --cached`; returns `null` on failure, never throws.
- [x] 1.3 **RED** — Add failing tests for `detectSpecDrift({workspace, gitRunner, timeoutMs})` covering: drifted, not-drifted (out-of-scope diff), active-change suppression, fail-safe (missing hash/no git/detached HEAD → no throw), `sources:` parsed from the manifest Domain Map, latest-Entries-row-wins, `null` when zero domains drift. Use a temp `openspec/` fixture + injected `gitRunner` stub keyed on `diff`/`--cached` args.
- [x] 1.4 **GREEN** — Implement `matchesGlobs`, `readStagedFiles`, `detectSpecDrift` (+ internal manifest parser) in `ospec-state.js`; sync, shared 5s deadline split across per-domain probes (mirrors `resolveGitState`); export all three. Run `npm test` — Phase 1 RED tests pass.
- [x] 1.5 **TRIANGULATE** — Add: two domains drifted simultaneously; irregular whitespace/trailing comma in `sources:`; an active change's `specs/` dir name that must not suppress an unrelated domain. Run `npm test`.
- [x] 1.6 **REFACTOR** — Extract the manifest Domain Map/Entries parsing into one internal helper; no exported surface change; `npm test` stays green.

## Phase 2: SessionStart Integration

- [x] 2.1 **RED** — Extend `session-start.test.js`: drift present → `specDrift.status:"warning"` naming all drifted domains, `systemMessage` names them (appended after git-collaboration line); zero drift → key entirely absent; `DISABLE_SPEC_DRIFT_GUARD=true` → absent, no git probes invoked; openspec not initialized → early-return path, drift check never runs.
- [x] 2.2 **GREEN** — Modify `session-start.js`: import `detectSpecDrift`; after the `gitCollaboration` block (~line 208), guarded by `DISABLE_SPEC_DRIFT_GUARD !== "true"`, call it via the workspace-scoped runner, wrap in try/catch, assign `result.specDrift` and append to `systemMessage` when non-null. Run `npm test` — Phase 2 RED tests pass.
- [x] 2.3 **TRIANGULATE** — Add: `gitCollaboration` + `specDrift` firing together (both lines present, newline-joined, in order); injected runner throws mid-probe → `status:"ok"` still returned, no `specDrift` key.
- [x] 2.4 **REFACTOR** — Factor the duplicated workspace-scoped git-runner construction into one local helper shared by `gitCollaboration` and `specDrift`. `npm test` stays green.

## Phase 3: PreToolUse Integration

- [x] 3.1 **RED** — Extend `pre-tool-use.test.js` with Step 5c: staged files overlap a drifted domain on `git commit` → `ask` naming the domain; no overlap → falls through to Step 6; a DENY rule matches first → `deny`, drift probes never invoked; `DISABLE_SPEC_DRIFT_GUARD=true` → skipped, no writes; `readStagedFiles` returns `null` → best-effort empty array, no false fire; Step 5b fires first → its `ask` wins, no double prompt.
- [x] 3.2 **GREEN** — Modify `pre-tool-use.js`: import `detectSpecDrift`, `readStagedFiles`, `matchesGlobs`; insert Step 5c after the Step 5b block (~line 408), before the `commands.length === 0` early-allow, gated by `DISABLE_SPEC_DRIFT_GUARD !== "true"` plus a `git commit` match; filter staged files against drifted domains' globs, return `makeDecision("ask", ...)` naming overlaps; wrap in try/catch (falls through to Step 6 on error). Run `npm test` — Phase 3 RED tests pass.
- [x] 3.3 **TRIANGULATE** — Add: two drifted domains, only one overlaps staged files → reason names only that one; commit command mixed with non-commit commands → 5c still evaluates only on the commit match.
- [x] 3.4 **REFACTOR** — Confirm no duplicated bypass logic between Step 5b/5c (distinct env vars: `DISABLE_GIT_COLLABORATION_GUARD` vs `DISABLE_SPEC_DRIFT_GUARD`). `npm test` stays green.

## Phase 4: Orchestrator Prose + Frontmatter

- [x] 4.1 Modify `agents/sdd-orchestrator.agent.md`: add `'sdd-reconcile'` to the frontmatter `agents: [...]` allowlist (line 5).
- [x] 4.2 Modify `agents/sdd-orchestrator.agent.md`: insert `### Ambient SDD Awareness Gate (MANDATORY)` immediately after `### SDD Init Guard (MANDATORY)` (~line 164) — always-on overlap check (active change scope OR specced domain globs, via `specDrift`/`capabilities` context), non-trivial classification (≥2 files OR new logic/architecture per agents/spec.md), `AskUserQuestion` call before proceeding, and the decline path (proceed directly, no `openspec/` artifacts).
- [x] 4.3 Run `npm test` (`scripts/check.js`) to regenerate/validate all four `dist/` targets; confirm the frontmatter/prose change propagates without breaking generation.

## Phase 5: `/sdd-reconcile` Triplet

- [x] 5.1 Create `commands/sdd-reconcile.prompt.md` mirroring `commands/sdd-baseline.prompt.md`: `agent: sdd-orchestrator`, `name`/`description`, `argument-hint: "<domain or blank>"`.
- [x] 5.2 Create `skills/sdd-reconcile/SKILL.md` mirroring `skills/sdd-baseline/SKILL.md`: `disable-model-invocation: true`, `user-invocable: false`, `metadata.delegate_only: true`, trigger words for `discoverSkills`; body = ORCHESTRATOR GATE banner + condensed algorithm summary; per Opt-In Invocation Only, advisory text may recommend but never auto-invoke.
- [x] 5.3 Create `agents/sdd-reconcile.agent.md` mirroring `agents/sdd-baseline.agent.md`: `tools: ['read','search','edit','execute']`, `user-invocable: false`, `target: vscode`; implement the design's `/sdd-reconcile` algorithm (steps 1-6: validate domain against `baseline.domains_done` and reject unknowns with the valid list; default to all drifted domains when omitted, no-op if none; diff-window-scoped `git diff` filtered by globs, nothing outside inspected; derive requirement/scenario text only from the window; re-read then merge additively into `spec.md`, no clobber; append one Entries row on success only, none on failure); Result Contract per `sdd-phase-common.md` §D.
- [x] 5.4 Run `npm test` to regenerate `dist/**` for all four targets; confirm the new command+skill+agent files build cleanly with valid frontmatter and the skill is indexed by `discoverSkills`.

## Phase 6: Verification Pass

- [x] 6.1 Run the full `npm test` suite (Phases 1-3 unit tests + Phase 4/5 generation checks); confirm no regressions in the existing `git-state.js`/`gitCollaboration` corpus.
- [x] 6.2 Integration check: with `DISABLE_SPEC_DRIFT_GUARD=true` in a fixture repo with an intentionally drifted domain, confirm no `specDrift` key and no Step 5c fire; unset the guard and confirm both fire — validates the single shared kill switch.
- [x] 6.3 Cross-check the Spec/Design Reconciliation matrix against the final diff; update `state.yaml` — `phases.apply.status: done`, top-level `status: ready-for-verify`.
