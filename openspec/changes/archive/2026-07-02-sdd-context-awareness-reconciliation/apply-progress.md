# Apply Progress: sdd-context-awareness-reconciliation

## Batch 1 — Phase 1: Drift Detection Primitives (`scripts/lib/ospec-state.js`)

**Mode**: Strict TDD
**Scope**: Foundation primitives only (`detectSpecDrift`, `readStagedFiles`, `matchesGlobs`, internal manifest parser). Phase 2+ (hook integrations, orchestrator prose, `/sdd-reconcile` triplet) intentionally NOT started in this batch.

### Completed Tasks

- [x] 1.1 RED — `matchesGlobs(file, globs)` failing tests (`**`, `*`, literal, no-match)
- [x] 1.2 RED — `readStagedFiles(gitRunner, timeoutMs)` failing tests (parses cached diff, null on failure)
- [x] 1.3 RED — `detectSpecDrift(...)` failing tests (drifted / not-drifted / suppression / fail-safe / sources-parsed / latest-row-wins / null-when-none)
- [x] 1.4 GREEN — Implemented `matchesGlobs`, `readStagedFiles`, `detectSpecDrift` + internal `parseManifest`/`findSuppressedDomainsSync` helpers in `ospec-state.js`; exported all three public functions
- [x] 1.5 TRIANGULATE — Added: two domains drifted simultaneously; irregular whitespace/trailing comma in `sources:`; active change's `specs/` dir must not suppress an unrelated domain
- [x] 1.6 REFACTOR — Manifest Domain Map + Entries parsing isolated in a single internal `parseManifest` helper (no exported surface change); confirmed still green

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/ospec-state.js` | Modified | Added `matchesGlobs`, `readStagedFiles`, `detectSpecDrift` (sync, fail-safe, shared 5s deadline mirroring `resolveGitState`) plus internal helpers `globToRegExp`, `parseManifest`, `findSuppressedDomainsSync`, `defaultDriftGitRunner`, `parseGitFileList`. Exported the three public functions. Added `node:fs` (sync) and `node:child_process` (`execFileSync`) requires. |
| `scripts/lib/ospec-state.test.js` | Modified | Added 16 tests: 4 for `matchesGlobs`, 2 for `readStagedFiles`, 10 for `detectSpecDrift` (7 core scenarios + 3 triangulation cases). Added `buildManifest`, `createDriftFixture`, `createActiveChange`, `stubGitRunner` test helpers matching the design's Testing Strategy row (temp `openspec/` fixture with config + manifest, injected `gitRunner` stub keyed on `diff`/`--cached` args). |

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | `scripts/lib/ospec-state.test.js` | Unit | ✅ 20/20 (pre-existing suite, captured before any production edit) | ✅ Written — 4 cases for `matchesGlobs` (`**` any-depth, `*` single-segment, literal, no-match) | ✅ Passed | ➖ Folded into 1.5's triangulation set | ✅ Clean | RED captured by isolating the production file via `git stash` (restoring the pre-drift-helper `ospec-state.js`) and running `node --test scripts/lib/ospec-state.test.js`: all 16 new tests failed with `TypeError: X is not a function` — the exact expected RED signature, not an environment error. |
| 1.2 | `scripts/lib/ospec-state.test.js` | Unit | ✅ 20/20 | ✅ Written — 2 cases: parses `git diff --name-only --cached` output; returns `null` (not a throw) on git failure | ✅ Passed | ➖ Two cases already exercise both code paths (success/failure) | ✅ Clean | |
| 1.3 | `scripts/lib/ospec-state.test.js` | Unit | ✅ 20/20 | ✅ Written — 7 scenario tests: drifted, not-drifted (out-of-scope diff), active-change suppression, git-failure fail-safe, `sources:` parsed from manifest, latest-Entries-row-wins, `null` when zero domains drift | ✅ Passed | see 1.5 | ✅ Clean | Temp `openspec/` fixture (`config.yaml` + `specs/_baseline/manifest.md`) built per-test via `createDriftFixture`; `stubGitRunner` keyed on `args[0] === "diff"` + presence of `--cached`, matching the design's Testing Strategy row exactly. |
| 1.4 | `scripts/lib/ospec-state.js` (production) | Unit | ✅ 20/20 baseline unaffected by the new code paths | (RED delivered by 1.1–1.3) | ✅ 36/36 passed — verified by execution (`node --test scripts/lib/ospec-state.test.js`), not inferred | n/a (implementation task) | ✅ Manifest parsing written as a single `parseManifest` helper from the first implementation (no interim duplication to later extract) | GREEN confirmed via the same git-stash isolation technique in reverse: restored the implementation (`git stash pop`) and reran — 36/36 tests green, 0 failures. Full repo `npm test` (`node scripts/check.js`) also run afterward: 762/762 native tests pass, 0 errors/0 warnings, "All checks passed" (dist generation/validation for all 4 targets unaffected). |
| 1.5 | `scripts/lib/ospec-state.test.js` | Unit | ✅ 20/20 | ✅ Written — 3 triangulation cases: two domains drifted simultaneously; irregular whitespace + trailing comma in `sources:`; an unrelated active change's `specs/{other-domain}` must not suppress the domain under test | ✅ Passed | ✅ 3/3 triangulation cases pass against the real (non-hardcoded) implementation — `detectSpecDrift` iterates `baseline.domains_done` generically and `parseManifest`'s `split(",").map(trim).filter(Boolean)` genuinely handles irregular whitespace/trailing commas, so no Fake-It shortcut was present to "break" | ✅ Clean | Triangulation tests were authored in the same edit pass as 1.3's core RED tests (one coherent test-file diff) and validated together in the RED and GREEN runs described above — the RED run confirmed all 3 triangulation tests also failed with `TypeError` pre-implementation, and the GREEN run confirmed all 3 pass post-implementation. |
| 1.6 | `scripts/lib/ospec-state.js` | Unit | ✅ 36/36 (post-1.4/1.5 state, pre-refactor-review) | n/a — refactor task, not new behavior | n/a | n/a | ✅ Reviewed `parseManifest`/`findSuppressedDomainsSync` for duplicated parsing logic (none found — Domain Map `sources:` and Entries-table parsing already live in exactly one function); reran the full test file post-review: still 36/36 green, 0 failures | Structural "one internal helper" requirement was satisfied by construction during 1.4 (no exported surface change either way); this step is a verification pass, not a code-shape change, per Strict TDD's "REFACTOR: ➖ None needed if code was already clean" allowance. |

### Test Summary

- **Total tests written**: 16 (4 `matchesGlobs` + 2 `readStagedFiles` + 7 `detectSpecDrift` core + 3 `detectSpecDrift` triangulation)
- **Total tests passing**: 36/36 in `scripts/lib/ospec-state.test.js` (20 pre-existing + 16 new); 762/762 in the full repo `npm test` run
- **Layers used**: Unit (16), Integration (0), E2E (0)
- **Approval tests** (refactoring): None — no pre-existing behavior was being refactored; this batch only adds new exports
- **Pure functions created**: `matchesGlobs`, `globToRegExp`, `escapeGlobLiteral`, `parseGitFileList` are pure. `parseManifest` is pure (string in, structured data out). `readStagedFiles`, `detectSpecDrift`, `findSuppressedDomainsSync`, `defaultDriftGitRunner` perform I/O (fs reads, git subprocess) by design — they are the fail-safe boundary the pure helpers sit behind, mirroring `resolveGitState`'s shape in `scripts/hooks/lib/git-state.js`.

### Execution Methodology Note

Because a single apply batch authored both the failing tests and the implementation, genuine (not fabricated) RED evidence was captured by temporarily isolating the production file with `git stash push --keep-index -- scripts/lib/ospec-state.js` (reverting only `ospec-state.js` to its pre-batch state while keeping the new test file), running the suite to observe real `TypeError` failures, then `git stash pop` to restore the implementation and rerunning for GREEN. Both runs used the actual `node --test` runner — no execution output was fabricated or assumed.

### Deviations from Design

None — implementation matches `design.md`'s Interfaces/Contracts section exactly:
- `detectSpecDrift({workspace, gitRunner, timeoutMs}) → null | {status: "warning", domains: [...]}` — signature, return shape, and field names (`domain`, `sinceCommit`, `sources`, `files`) match verbatim.
- `readStagedFiles(gitRunner, timeoutMs) → string[] | null` matches.
- `matchesGlobs(file, globs) → boolean` with `**`→any-depth / `*`→single-segment semantics matches.
- The shared-deadline pattern (`deadline = Date.now() + budget`, `remaining()` clamped to `Math.max(1, ...)`) mirrors `resolveGitState` in `scripts/hooks/lib/git-state.js` as directed.
- `sources:` parsing (split on `,`, trim each entry) reuses the exact convention already present in `openspec/specs/_baseline/manifest.md`'s Domain Map bullets — no new manifest field introduced.

### Issues Found

None.

### Remaining Tasks

- [ ] Phase 2: SessionStart Integration (`scripts/hooks/session-start.js` + `session-start.test.js`) — 2.1–2.4
- [ ] Phase 3: PreToolUse Integration (`scripts/hooks/pre-tool-use.js` + `pre-tool-use.test.js`) — 3.1–3.4
- [ ] Phase 4: Orchestrator Prose + Frontmatter (`agents/sdd-orchestrator.agent.md`) — 4.1–4.3
- [ ] Phase 5: `/sdd-reconcile` Triplet (`commands/`, `skills/`, `agents/`) — 5.1–5.4
- [ ] Phase 6: Verification Pass — 6.1–6.3

### Workload / PR Boundary

- Mode: `size:exception` (per `state.yaml`'s `delivery-strategy-001` approval and `tasks.md`'s Review Workload Forecast: `400-line budget risk: High`, `Delivery strategy: exception-ok`)
- Current work unit: Suggested Work Unit 1 — "`scripts/lib/ospec-state.js` drift primitives + `ospec-state.test.js`" (self-contained; settles the shared interface Phase 2/3 hooks depend on)
- Boundary: This batch starts and ends entirely within Work Unit 1. No hook files (`session-start.js`, `pre-tool-use.js`), agent prose, or `/sdd-reconcile` triplet files were touched — those are Work Units 2 and 3, explicitly out of scope for this batch per the orchestrator's instruction.
- Estimated review budget impact: `git diff --stat` for this batch's two files is well within the 400-line single-PR budget on its own; the overall change's High risk stems from Units 2–3, not this unit.

### Status

6/6 Phase 1 tasks complete (1.1–1.6, all `[x]`). Ready for next batch (Phase 2: SessionStart Integration), which depends on this batch's exports (`detectSpecDrift`, `readStagedFiles`, `matchesGlobs`) remaining stable.

## Batch 2 — Phase 2: SessionStart Integration (`scripts/hooks/session-start.js`)

**Mode**: Strict TDD
**Scope**: Only the additive `result.specDrift` block in `scripts/hooks/session-start.js`, gated by `DISABLE_SPEC_DRIFT_GUARD`, plus its test coverage in `scripts/hooks/session-start.test.js`. Phase 3+ (`pre-tool-use.js` Step 5c, orchestrator prose, `/sdd-reconcile` triplet) intentionally NOT started in this batch, per the orchestrator's instruction.

### Completed Tasks

- [x] 2.1 RED — Extended `session-start.test.js` with 6 new tests: drift present (`specDrift.status:"warning"` naming the domain, `systemMessage` mentions it), zero drift → key entirely absent, `DISABLE_SPEC_DRIFT_GUARD=true` → absent with no drift git probes invoked, openspec-not-initialized → drift check never runs, `gitCollaboration`+`specDrift` firing together (ordered, newline-joined), drift git probe throws mid-probe → `status:"ok"` still returned with no `specDrift` key
- [x] 2.2 GREEN — Modified `session-start.js`: imported `detectSpecDrift` from `../lib/ospec-state.js`; added a `DISABLE_SPEC_DRIFT_GUARD !== "true"`-gated block after the existing `gitCollaboration` block, before `return result`, wrapped in try/catch, assigning `result.specDrift` and appending a `systemMessage` line only when `detectSpecDrift` returns non-null
- [x] 2.3 TRIANGULATE — Added the two triangulation cases listed above (ordering-when-both-fire; fail-safe-when-git-throws) in the same RED pass as 2.1 (one coherent test-file diff, per Strict TDD's triangulation requirement)
- [x] 2.4 REFACTOR — Extracted the duplicated `execFileSync`-based workspace-scoped git-runner construction (previously inlined separately in both the `gitCollaboration` block and the new `specDrift` block) into one shared top-level `createWorkspaceGitRunner(workspace)` helper; both blocks now call `gitRunner || createWorkspaceGitRunner(workspace)`; hoisted the `node:child_process` require to the top of the file (was previously required lazily inside each block); reran — still 33/33 green in `session-start.test.js`, 768/768 in the full suite

### Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `scripts/hooks/session-start.js` | Modified | Imported `detectSpecDrift`; added top-level `execFileSync` require; added shared `createWorkspaceGitRunner(workspace)` helper (used by both `gitCollaboration` and the new block); added the additive `specDrift` block (gated by `DISABLE_SPEC_DRIFT_GUARD`, try/catch, appends to `systemMessage`) after the `gitCollaboration` block, before `return result`. Refactored the pre-existing `gitCollaboration` block's inline runner construction to use the new shared helper (behavior-preserving — same `execFileSync` args, same `cwd`/`timeout`/`encoding`/`stdio`). |
| `scripts/hooks/session-start.test.js` | Modified | Extended `createFixture` with an optional `manifestContent` param (writes `openspec/specs/_baseline/manifest.md` when provided, mirroring `ospec-state.test.js`'s `createDriftFixture`). Added `baselineDomainsDoneConfig`, `buildManifest` (same shape as `ospec-state.test.js`'s helper), and `makeDriftSessionGitRunner` (combines the existing git-collaboration probe stub with a `diff --name-only <hash>..HEAD` drift-probe stub keyed by range, so one injected `gitRunner` answers both hook paths — reusing the existing `makeSessionGitRunner` collaboration-probe convention rather than duplicating it). Added a `Phase 5: Spec Drift Advisory in SessionStart` test section with 6 tests. |

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 2.1 | `scripts/hooks/session-start.test.js` | Unit | ✅ 27/27 (pre-existing suite captured via `node --test scripts/hooks/session-start.test.js` before any production edit) | ✅ Written — 6 cases (see Completed Tasks above) | ✅ Passed | see 2.3 | ✅ Clean | Genuine RED captured by running the extended test file against the unmodified `session-start.js`: exactly the 2 "specDrift must be present" assertions failed with `AssertionError` (`actual: undefined, expected: true`) — the correct RED signature for an additive feature; the 4 "absent" assertions passed vacuously pre-implementation (expected, since the feature didn't exist yet to make them fire falsely), confirmed by inspecting the RED run's pass/fail list line-by-line rather than assuming from the aggregate count. |
| 2.2 | `scripts/hooks/session-start.js` (production) | Unit | ✅ 27/27 baseline unaffected by the new code path | (RED delivered by 2.1) | ✅ 33/33 passed — verified by execution (`node --test scripts/hooks/session-start.test.js`), not inferred | n/a (implementation task) | see 2.4 | GREEN confirmed by rerunning after implementing the `specDrift` block: all 6 new tests passed and all 27 pre-existing tests remained green (no regression in `baseline`/`capabilities`/`security`/`gitCollaboration` assertions). |
| 2.3 | `scripts/hooks/session-start.test.js` | Unit | ✅ 27/27 | ✅ Written in the same 2.1 pass — ordering case (`gitCollaboration`+`specDrift` both fire, `systemMessage.split("\n")` asserted to have exactly 2 lines in the correct order) and fail-safe case (drift git probe throws → `status:"ok"`, `specDrift` undefined, no crash) | ✅ Passed | ✅ 2/2 triangulation cases pass against the real (non-hardcoded) implementation — the ordering case genuinely exercises string concatenation order (`gitCollaboration` block runs and appends first, `specDrift` block runs second and appends second), and the fail-safe case genuinely exercises `detectSpecDrift`'s internal per-domain git-failure catch (not a hardcoded early-return) | ✅ Clean | Both cases were part of the same RED/GREEN execution pair described in 2.1/2.2 — verified failing pre-implementation (specDrift absent when it should have fired) and passing post-implementation. |
| 2.4 | `scripts/hooks/session-start.js` | Unit | ✅ 33/33 (post-2.2 state, pre-refactor-review) | n/a — refactor task, not new behavior | n/a | n/a | ✅ Extracted `createWorkspaceGitRunner(workspace)` as a single top-level helper; replaced both inline `function workspaceGitRunner(...)` closures (one in `gitCollaboration`, one in `specDrift`) with `gitRunner \|\| createWorkspaceGitRunner(workspace)`; hoisted `require("node:child_process")` to the top of the file; reran the test file after the refactor — still 33/33 green, 0 failures, confirming the extraction was behavior-preserving | Structural duplication (two near-identical inline runner closures) was intentionally left in place during 2.2's GREEN step (minimal-code-to-pass, matching design.md's per-block pseudocode) and then removed here per task 2.4's explicit instruction. |

### Test Summary

- **Total tests written**: 6 (`session-start.test.js`, Phase 5 section: drift-present, zero-drift-absent, bypass-absent, not-initialized-absent, ordering-triangulation, fail-safe-triangulation)
- **Total tests passing**: 33/33 in `scripts/hooks/session-start.test.js` (27 pre-existing + 6 new); 768/768 in the full repo `npm test` run (`node scripts/check.js`)
- **Layers used**: Unit (6), Integration (0), E2E (0)
- **Approval tests** (refactoring): None — the 2.4 refactor changed only the `gitCollaboration` block's runner-construction plumbing, not its observable behavior; the 7 pre-existing `git-collab-session:*` tests already act as the approval/regression net for that block and stayed green throughout
- **Pure functions created**: None new in this batch (`createWorkspaceGitRunner` returns an I/O-performing closure by design, consistent with `resolveGitState`'s own runner-injection pattern); the batch composes the already-pure `detectSpecDrift`/`matchesGlobs` from Phase 1 rather than adding new pure logic

### Execution Methodology Note

Unlike Phase 1 (which needed `git stash` isolation because tests and implementation were authored in one pass with no pre-existing partial implementation to diff against), Phase 2's RED evidence was captured directly: the test file was extended first and run as-is against the still-unmodified `session-start.js`, producing genuine `AssertionError` failures (not a `TypeError`, since `detectSpecDrift` already existed from Phase 1 — the missing piece was purely the integration wiring in the hook). GREEN and the post-refactor rerun both used the actual `node --test` runner; no execution output was fabricated or assumed. The full-suite `npm test` (`node scripts/check.js`) was run once at the end of the batch and reported `768 tests, 768 pass, 0 fail, 0 errors, 0 warnings — All checks passed.`

### Deviations from Design

None — implementation matches `design.md`'s Data Flow / File Changes sections:
- `result.specDrift` shape (`{status:"warning", domains:[{domain, sinceCommit, message}]}`) matches the design's SessionStart JSON example verbatim.
- Placement (after the `gitCollaboration` `if` block, before `return result`) matches.
- `DISABLE_SPEC_DRIFT_GUARD` checked independently in the hook (not inside `detectSpecDrift`), mirroring `DISABLE_GIT_COLLABORATION_GUARD`'s placement, per the design's "Bypass placement" Architecture Decision.
- try/catch wrapping so drift detection "must never break session start" — matches the design's pseudocode comment verbatim.
- The `createWorkspaceGitRunner` extraction (task 2.4) matches the design's "reuse the workspace-scoped runner pattern" note in the Data Flow section.

One implementation-detail note (not a deviation, since `specs/hooks/spec.md` does not prescribe exact wording): the Spanish advisory text (`"El dominio '{domain}' ha derivado desde {hash}. Considera ejecutar /sdd-reconcile {domain}."` for the per-domain `message`, and `"Deriva de especificación en: {names}. Considera ejecutar /sdd-reconcile."` for the `systemMessage` line) follows the existing Spanish-language convention already used by `composeAdvisory`/`buildBaselineHint`/the security-alert message in this same file, since the spec only requires "a human-readable advisory" without mandating exact copy.

### Issues Found

None.

### Remaining Tasks

- [ ] Phase 3: PreToolUse Integration (`scripts/hooks/pre-tool-use.js` + `pre-tool-use.test.js`) — 3.1–3.4
- [ ] Phase 4: Orchestrator Prose + Frontmatter (`agents/sdd-orchestrator.agent.md`) — 4.1–4.3
- [ ] Phase 5: `/sdd-reconcile` Triplet (`commands/`, `skills/`, `agents/`) — 5.1–5.4
- [ ] Phase 6: Verification Pass — 6.1–6.3

### Workload / PR Boundary

- Mode: `size:exception` (per `state.yaml`'s `delivery-strategy-001` approval and `tasks.md`'s Review Workload Forecast: `400-line budget risk: High`, `Delivery strategy: exception-ok`)
- Current work unit: within Suggested Work Unit 2 — "`session-start.js` + `pre-tool-use.js` integrations + their test files" (this batch covers only the `session-start.js` half; `pre-tool-use.js` remains for a subsequent batch, per the orchestrator's explicit Phase-2-only scope instruction)
- Boundary: This batch starts and ends entirely within the `session-start.js`/`session-start.test.js` slice of Work Unit 2. No `pre-tool-use.js`, agent prose, or `/sdd-reconcile` triplet files were touched.
- Estimated review budget impact: `git diff --stat` for this batch's two files (`scripts/hooks/session-start.js` + `scripts/hooks/session-start.test.js`) is well within the 400-line single-PR budget on its own — production diff is roughly +45/-15 lines, test diff is roughly +185 lines (all new test code); the overall change's High risk stems from the full Unit 2+3 scope, not this slice.

### Status

Phase 2 (2.1–2.4) complete, all `[x]`. Combined with Phase 1: 10/10 tasks complete across Batches 1–2. Ready for next batch (Phase 3: PreToolUse Integration), which depends on this batch's and Phase 1's exports (`detectSpecDrift`, `readStagedFiles`, `matchesGlobs`) remaining stable and on the `DISABLE_SPEC_DRIFT_GUARD` env-var convention established here being reused verbatim for Step 5c.

## Batch 3 — Phase 3: PreToolUse Integration (`scripts/hooks/pre-tool-use.js`)

**Mode**: Strict TDD
**Scope**: Only the additive Step 5c (`SPEC DRIFT ADVISORY`) block in `scripts/hooks/pre-tool-use.js`, gated by `DISABLE_SPEC_DRIFT_GUARD`, plus its test coverage in `scripts/hooks/pre-tool-use.test.js`. Phase 4+ (orchestrator prose, `/sdd-reconcile` triplet) intentionally NOT started in this batch, per the orchestrator's instruction.

### Pre-Implementation Reconnaissance

- Re-read `scripts/hooks/pre-tool-use.js` and `scripts/hooks/session-start.js` directly (not from memory/design assumptions) before writing any code:
  - `session-start.js`'s Phase 2 work (already merged) introduced a **local, non-exported** `createWorkspaceGitRunner(workspace)` helper — used only inside `session-start.js`, not exported from that module and not reusable cross-file without an awkward cross-hook `require`.
  - `pre-tool-use.js` never needed an equivalent wrapper in the first place: `evaluateToolUse` has no `workspace`-resolution concept (unlike `session-start.js`, which resolves `workspace` from `input.cwd` via `resolveWorkspaceCwd`) — every existing helper in `pre-tool-use.js` (`findActiveChangeNameSync`, `getCumulativeTokensSync`, Step 5b's `resolveGitState(injectedGitRunner)`) already operates directly against `process.cwd()`, and `git-state.js`'s `defaultGitRunner` / `ospec-state.js`'s `defaultDriftGitRunner(workspace)` both already default correctly with no cwd override needed when `workspace === process.cwd()`.
  - **Decision**: did NOT reuse or duplicate `createWorkspaceGitRunner` in `pre-tool-use.js`. Instead, added one line — `const workspace = (opts && opts.workspace) || process.cwd();` — mirroring the existing `injectedGitRunner` DI pattern already on the same line (`opts.gitRunner`). This is the minimal, convention-matching seam: `opts` is already `evaluateToolUse`'s test-injection surface (git-guard tests already inject `opts.gitRunner`), so `opts.workspace` is the natural parallel rather than a new mechanism. In production (`main()`, which never passes `opts.workspace`), this is byte-for-byte equivalent to the design's literal `workspace: process.cwd()` pseudocode. Documented as a **testability-only, non-behavior-changing deviation** from `design.md`'s pseudocode (see Deviations section below) — required because there is no other way to point `detectSpecDrift`'s synchronous `fs` reads at a temp fixture directory without either (a) a workspace DI seam or (b) `process.chdir()` (rejected — no precedent for it anywhere in this repo's test suites, and it would mutate global process state across the whole test file for no benefit over the one-line DI parameter).
  - Confirmed exact insertion point by re-reading the real current file rather than trusting `tasks.md`'s prose: `tasks.md` task 3.2 says "before the `commands.length === 0` early-allow", but `design.md`'s Data Flow section (the authoritative source per the orchestrator's own routing rule that design.md governs implementation when the two disagree) explicitly says "after the Step 5b git-collaboration block **and after** the `commands.length === 0` early-allow ... before the Step 6 ASK loop" — with the rationale spelled out ("a `git commit` always carries a command, so it is never short-circuited there"). Implemented per `design.md` (Step 5c placed immediately after the `commands.length === 0` block, immediately before the `// Step 6 — ASK rules.` comment) — verified by direct inspection of the current file, not by assumption from either source alone.

### Completed Tasks

- [x] 3.1 RED — Extended `pre-tool-use.test.js` with 8 new tests under a `Phase 3: Step 5c Spec Drift Advisory integration` section: (a) staged file overlaps a drifted domain → `ask` naming the domain; (b) no overlap → falls through to `allow`; (c) a DENY rule (`rm -rf /`) matches first → `deny`, drift/collab git probes never invoked; (d) `DISABLE_SPEC_DRIFT_GUARD=true` → skipped, drift probe never invoked (collab probes still resolve normally, proving the two guards are independent); (e) `readStagedFiles` resolution fails (stubbed to throw) → best-effort empty array, no false fire, `allow`; (f) Step 5b's `ask` (onDefault branch) fires first → its reason wins, drift probe never invoked (no `driftRanges` stubbed, so a call would throw) — no double prompt
- [x] 3.2 GREEN — Modified `pre-tool-use.js`: imported `detectSpecDrift`, `readStagedFiles`, `matchesGlobs` from `../lib/ospec-state.js`; added a local `GIT_COMMIT_RE` constant (`/\bgit\s+commit\b/i`, scoped to Step 5c — kept separate from `git-state.js`'s own internal `GIT_COMMIT_RE`, which is not exported); added `const workspace = (opts && opts.workspace) || process.cwd();` alongside the existing `injectedGitRunner` line; inserted the Step 5c block after the `commands.length === 0` early-allow, before Step 6, gated by `DISABLE_SPEC_DRIFT_GUARD !== "true"` plus a `git commit` match across `commands`; wrapped in try/catch (advisory-only, falls through to Step 6 on any failure); filters `drift.domains` by `staged.some(file => matchesGlobs(file, domain.sources))` and returns `makeDecision("ask", ...)` naming only the overlapping domain(s) when `hits.length > 0`
- [x] 3.3 TRIANGULATE — Added the two triangulation cases from `tasks.md` in the same RED pass as 3.1: (g) two drifted domains (`hooks` + `skills`, via a new `TWO_DOMAIN_MANIFEST` fixture), only `hooks` overlaps staged files → reason matches `/hooks/` and explicitly `assert.doesNotMatch(..., /skills/)`; (h) a `commands` array mixing a non-commit command (`git status --short`) with a `git commit` command → Step 5c still fires correctly, proving `commands.some(...)` — not `commands[0]` or a single-command assumption — drives the match
- [x] 3.4 REFACTOR — Reviewed both guards for duplicated bypass logic: Step 5b checks `process.env.DISABLE_GIT_COLLABORATION_GUARD !== "true"` (line ~401), Step 5c checks `process.env.DISABLE_SPEC_DRIFT_GUARD !== "true"` (line ~438) — two distinct env vars, no shared helper to extract (unlike Phase 2's `createWorkspaceGitRunner` extraction, there is no duplicated *runner-construction* code here either: Step 5b calls `resolveGitState(injectedGitRunner)` directly and Step 5c calls `detectSpecDrift({workspace, gitRunner: injectedGitRunner})` directly — both simply forward `injectedGitRunner` as-is, since neither `git-state.js`'s `defaultGitRunner` nor `ospec-state.js`'s `defaultDriftGitRunner(workspace)` need a `pre-tool-use.js`-local wrapper the way `session-start.js`'s workspace-resolved-from-JSON-input case did). Confirmed clean by inspection — no code changes made for this task, consistent with Strict TDD's "➖ None needed if code was already clean" allowance (matches task 1.6's precedent); reran `npm test scripts/hooks/pre-tool-use.test.js` — still 41/41 green.

### Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `scripts/hooks/pre-tool-use.js` | Modified | Imported `detectSpecDrift`/`readStagedFiles`/`matchesGlobs` from `../lib/ospec-state.js`; added a Step-5c-scoped `GIT_COMMIT_RE` constant; added `const workspace = (opts && opts.workspace) || process.cwd();` next to the existing `injectedGitRunner` line (testability-only DI seam, see Deviations); inserted the additive Step 5c block (gated by `DISABLE_SPEC_DRIFT_GUARD`, try/catch, always `ask` never `deny`) after the `commands.length === 0` early-allow and before the `// Step 6 — ASK rules.` comment. No existing code paths (Step 5, 5b, 6, 7) were reordered or modified. |
| `scripts/hooks/pre-tool-use.test.js` | Modified | Added a `Phase 3: Step 5c Spec Drift Advisory integration` section (8 tests, a–h). Added local test helpers `buildManifest`, `HOOKS_MANIFEST`, `TWO_DOMAIN_MANIFEST`, `createDriftFixture` (temp `openspec/` fixture via sync `fs`, matching `ospec-state.test.js`'s `createDriftFixture` and `session-start.test.js`'s manifest-fixture conventions but using `fs.mkdtempSync`/sync fs throughout since `evaluateToolUse` itself is synchronous — no `async`/`t.after` await needed), `makeDriftGuardGitRunner` (combines the existing `makeGitStubRunner`-style collab-probe convention with the drift-range and `--cached` staged-files probes, mirroring `session-start.test.js`'s `makeDriftSessionGitRunner`; defaults collab responses to a clean feature branch so Step 5b does not intercept Step 5c's tests by default), and `driftGuardDecision` (parallels the existing `gitGuardDecision` helper, extended to also inject `opts.workspace`). |

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 3.1 | `scripts/hooks/pre-tool-use.test.js` | Unit | ✅ 33/33 (pre-existing suite captured via `node --test scripts/hooks/pre-tool-use.test.js` before any production edit) | ✅ Written — 8 cases (a–h above) | ✅ Passed | see 3.3 | ✅ Clean | Genuine RED captured directly (same technique as Batch 2, since `detectSpecDrift`/`readStagedFiles`/`matchesGlobs` already existed from Phase 1 — the missing piece was purely Step 5c's wiring): ran the extended test file against the unmodified `pre-tool-use.js` and got exactly 3 failures — (a) "overlap→ask" (`AssertionError: 'allow' !== 'ask'`), (g) "two domains, one overlaps→ask" (same), (h) "mixed commit/non-commit→ask" (same) — the correct RED signature for an additive `ask`-only feature: the 5 "must NOT fire / must stay allow-or-deny" cases (b, c, d, e, f) passed vacuously pre-implementation (expected — nothing existed yet to falsely fire), confirmed by inspecting the RED run's per-test pass/fail list line-by-line, not the aggregate count alone. |
| 3.2 | `scripts/hooks/pre-tool-use.js` (production) | Unit | ✅ 33/33 baseline unaffected by the new code path | (RED delivered by 3.1) | ✅ 41/41 passed — verified by execution (`node --test scripts/hooks/pre-tool-use.test.js`), not inferred | n/a (implementation task) | see 3.4 | GREEN confirmed by rerunning after implementing the Step 5c block: all 8 new tests passed (including the 3 that were genuinely RED) and all 33 pre-existing tests remained green (no regression in DENY/ASK rule ordering, agent-shield, token-advisor, attribution-deny, or Step 5b git-guard behavior). |
| 3.3 | `scripts/hooks/pre-tool-use.test.js` | Unit | ✅ 33/33 | ✅ Written in the same 3.1 pass — cases (g) two-domains-one-overlap and (h) mixed-commit-array | ✅ Passed | ✅ 2/2 triangulation cases pass against the real (non-hardcoded) implementation — (g) genuinely exercises `drift.domains.filter(...)` narrowing to only the overlapping domain (not a hardcoded single-domain assumption: `TWO_DOMAIN_MANIFEST` seeds two real drifted domains, and the assertion explicitly checks the reason does NOT mention `skills`), and (h) genuinely exercises `commands.some(GIT_COMMIT_RE.test)` against a multi-element array (not `commands[0]`) | ✅ Clean | Both cases were part of the same RED/GREEN execution pair described in 3.1/3.2 — verified failing pre-implementation and passing post-implementation. |
| 3.4 | `scripts/hooks/pre-tool-use.js` | Unit | ✅ 41/41 (post-3.2 state, pre-refactor-review) | n/a — refactor task, not new behavior | n/a | n/a | ✅ Reviewed both guard blocks side-by-side for duplicated bypass/runner-construction logic; found none (distinct env vars checked inline, no wrapper needed on either side per the Pre-Implementation Reconnaissance above); reran the test file post-review — still 41/41 green, 0 failures | Structural duplication genuinely did not exist to extract, unlike Phase 2 (2.4) where `session-start.js`'s two blocks each independently built a workspace-scoped runner closure — `pre-tool-use.js`'s two blocks each forward `injectedGitRunner` untouched, so there was nothing to factor out. Verification-only pass, per Strict TDD's "➖ None needed if code was already clean" allowance (same precedent as 1.6). |

### Test Summary

- **Total tests written**: 8 (`pre-tool-use.test.js`, `Phase 3: Step 5c Spec Drift Advisory integration` section: overlap-fires, no-overlap-silent, deny-precedence, bypass-skips, staged-resolution-fails-safe, step-5b-wins-ordering, two-domains-one-overlap-triangulation, mixed-commit-array-triangulation)
- **Total tests passing**: 41/41 in `scripts/hooks/pre-tool-use.test.js` (33 pre-existing + 8 new); 776/776 in the full repo `npm test` run (`node scripts/check.js`) — up from 768/768 at the end of Batch 2, confirming the +8 new tests and zero regressions
- **Layers used**: Unit (8), Integration (0), E2E (0)
- **Approval tests** (refactoring): None — task 3.4's review changed no code, so the full 41-test file itself is the regression net; all 33 pre-existing tests (DENY rules, ASK rules, agent-shield, token-advisor, attribution-deny, Step 5b git-guard a–h) stayed green throughout
- **Pure functions created**: None new in this batch — the batch composes the already-pure `detectSpecDrift`/`readStagedFiles`/`matchesGlobs` from Phase 1 rather than adding new pure logic, consistent with the design's "both hooks share one helper, no git logic duplicated in hook files" architecture decision

### Execution Methodology Note

Same direct-RED technique as Batch 2 (not the `git stash` isolation Batch 1 needed): the test file was extended first and run as-is against the still-unmodified `pre-tool-use.js`, producing genuine `AssertionError` failures on exactly the 3 tests that require Step 5c to actively fire (`'allow' !== 'ask'`), while the 5 "must not fire" tests passed vacuously (correct, since nothing existed yet to wrongly fire). GREEN and the post-refactor-review rerun both used the actual `node --test` runner — no execution output was fabricated or assumed. The full-suite `npm test` (`node scripts/check.js`) was run once at the end of the batch and reported `776 tests, 776 pass, 0 fail, 0 errors, 0 warnings — All checks passed.`

### Deviations from Design

One documented, testability-only deviation (no observable production-behavior change):

- **`opts.workspace` DI seam added to `evaluateToolUse`**: `design.md`'s Data Flow pseudocode for Step 5c writes `detectSpecDrift({ workspace: process.cwd(), gitRunner: injectedGitRunner })` literally, with no mention of an injectable `workspace` parameter. In production (`main()`, and any real Claude Code invocation, which never sets `opts.workspace`), the implemented code is byte-for-byte equivalent: `const workspace = (opts && opts.workspace) || process.cwd();` resolves to `process.cwd()` exactly as the design specifies. The `opts.workspace` seam exists solely so `pre-tool-use.test.js` can point `detectSpecDrift`'s synchronous `openspec/config.yaml` / `manifest.md` reads at an isolated temp fixture directory (`createDriftFixture`) instead of either (a) mutating the real repository's own `openspec/` state via `process.cwd()`-relative writes (unsafe — this repo's actual `openspec/` is live workflow state, unlike disposable temp dirs) or (b) `process.chdir()` (rejected — no precedent anywhere in this repo's test suites, and it would be a global, harder-to-reason-about mutation for the whole test-file process versus a scoped function parameter). This mirrors the already-established `opts.gitRunner` injection pattern on the exact same function signature, so it introduces no new DI mechanism — only extends the existing one by one field. Not flagged as a spec/design gap requiring re-approval: `specs/hooks/spec.md`'s Step 5c requirement and all four of its scenarios are satisfied verbatim by the implementation; this is purely an internal testability seam, analogous to how `resolveGitState`/`detectSpecDrift`/`readStagedFiles` already accept injectable `gitRunner` parameters the design never explicitly called out as "for tests" either.

Everything else matches `design.md`'s Interfaces/Contracts and Data Flow sections exactly:
- Evaluation order (`5 → 5b → 5c → 6 → 7`) matches `specs/hooks/spec.md`'s revised table verbatim — confirmed by direct code placement (Step 5c inserted after the `commands.length === 0` early-allow block and before the `// Step 6 — ASK rules.` comment), not by assumption.
- Step 5c always returns `ask`, never `deny` — no code path in the new block calls `makeDecision("deny", ...)`.
- `DISABLE_SPEC_DRIFT_GUARD` is a single, independent kill switch distinct from `DISABLE_GIT_COLLABORATION_GUARD`, matching the hooks spec's Clarifications session and the `sessions-start.js` Phase 2 precedent.
- Best-effort staged-file fallback (`readStagedFiles(...) ?? []`) matches the design's pseudocode comment (`// fallback: empty ⇒ no overlap ⇒ no fire (safe)`) verbatim.
- try/catch wraps the entire Step 5c body so any `detectSpecDrift`/`readStagedFiles` failure is advisory-only and falls through to Step 6, matching "advisory only — fall through to Step 6" in the design's pseudocode comment verbatim.

One placement clarification (not a deviation — see Pre-Implementation Reconnaissance above): `tasks.md` task 3.2's prose ("before the `commands.length === 0` early-allow") conflicts with `design.md`'s Data Flow section ("after ... the `commands.length === 0` early-allow"). Implemented per `design.md`, which is the authoritative technical-design artifact and whose stated rationale ("a `git commit` always carries a command, so it is never short-circuited there") is self-consistent with the actual code structure — the `commands.length === 0` block is itself an early-return that would never touch a `git commit` invocation regardless of which side of it Step 5c sits on, so functionally both placements are equivalent for the `git commit` case; `design.md`'s explicit placement was followed for exactness.

### Issues Found

None. `createWorkspaceGitRunner` from Phase 2 (`session-start.js`) was confirmed local/non-exported before starting this batch (see Pre-Implementation Reconnaissance) — this is a Phase-2-only helper, not a shared cross-hook utility, and `pre-tool-use.js` correctly does not import it. No action needed on Phase 2's code as a result of this finding; it is purely a design-fit observation for this batch's own implementation choice.

### Remaining Tasks

- [ ] Phase 4: Orchestrator Prose + Frontmatter (`agents/sdd-orchestrator.agent.md`) — 4.1–4.3
- [ ] Phase 5: `/sdd-reconcile` Triplet (`commands/`, `skills/`, `agents/`) — 5.1–5.4
- [ ] Phase 6: Verification Pass — 6.1–6.3

### Workload / PR Boundary

- Mode: `size:exception` (per `state.yaml`'s `delivery-strategy-001` approval and `tasks.md`'s Review Workload Forecast: `400-line budget risk: High`, `Delivery strategy: exception-ok`)
- Current work unit: completes Suggested Work Unit 2 — "`session-start.js` + `pre-tool-use.js` integrations + their test files" (Batch 2 covered the `session-start.js` half; this batch covers the `pre-tool-use.js` half, closing out Work Unit 2 in full)
- Boundary: This batch starts and ends entirely within the `pre-tool-use.js`/`pre-tool-use.test.js` slice of Work Unit 2. No `session-start.js`, agent prose, or `/sdd-reconcile` triplet files were touched.
- Estimated review budget impact: `git diff --stat` for this batch's two files (`scripts/hooks/pre-tool-use.js` + `scripts/hooks/pre-tool-use.test.js`) is well within the 400-line single-PR budget on its own — production diff is roughly +45/-1 lines, test diff is roughly +230 lines (all new test code); the overall change's High risk stems from the full Unit 2+3 scope (now Unit 2 is fully complete), not this slice.

### Status

Phase 3 (3.1–3.4) complete, all `[x]`. Combined with Phases 1–2: 14/14 tasks complete across Batches 1–3. Work Unit 2 ("hook integrations") is now fully complete. Ready for the next batch (Phase 4: Orchestrator Prose + Frontmatter), which is prose-only and has no runtime-code dependency on this batch's exports — it only needs `specDrift`/`capabilities` session context (already emitted by Phase 2) to reference in the orchestrator's ambient-awareness gate prose.

## Batch 4 — Phase 4: Orchestrator Prose + Frontmatter (`agents/sdd-orchestrator.agent.md`)

**Mode**: Prose-only — not covered by `npm test`'s unit/integration TDD layer (no strict-TDD RED/GREEN/REFACTOR cycle applies to a Markdown instruction file); verification is (a) frontmatter YAML still parses and (b) the document's Markdown heading hierarchy stays valid, both confirmed via the full `npm test` generation/validation pipeline (`scripts/check.js`).
**Scope**: Only `agents/sdd-orchestrator.agent.md` — the frontmatter `agents: [...]` allowlist and one new CORE subsection. Phase 5 (`/sdd-reconcile` triplet: `commands/sdd-reconcile.prompt.md` + `skills/sdd-reconcile/SKILL.md` + `agents/sdd-reconcile.agent.md`) and Phase 6 (verification pass) intentionally NOT started in this batch.

### Completed Tasks

- [x] 4.1 — Added `'sdd-reconcile'` to the frontmatter `agents: [...]` allowlist (line 5), inserted after `'sdd-archive'` and before `'sdd-onboard'`.
- [x] 4.2 — Inserted a new `### Ambient SDD Awareness Gate (MANDATORY)` subsection immediately after `### SDD Init Guard (MANDATORY)` and before `### Route Selection & Dispatch`. Content is near-verbatim from `design.md`'s "Orchestrator gate prose (to inject)" section, expanded to explicitly satisfy all scenarios in `openspec/changes/sdd-context-awareness-reconciliation/specs/agents/spec.md`:
  - Opens with "Independent of whether the user's request mentions 'SDD' or invokes any `/sdd-*` command" — makes explicit that this gate's trigger condition is broader than the Init Guard's (which only fires on explicit persisted SDD commands), satisfying the "gate fires without the word 'SDD' ever appearing" scenario.
  - Overlap check: (a) a non-terminal (active) OpenSpec change's declared file scope, OR (b) a specced baseline domain's source globs, sourced from session-start `specDrift`/`capabilities` context — matches design.md's overlap logic verbatim.
  - Non-trivial threshold stated as the finalized hybrid OR: ≥2 files touched, OR introduces new logic/architecture (new function/module or behavior change) regardless of file count — matches the Clarifications session's resolved threshold in `specs/agents/spec.md` verbatim (not the earlier "per the threshold defined in design.md" placeholder).
  - Single-file cosmetic carve-out stated explicitly (typo, comment-only, rename, formatting, behavior-preserving one-liner) — MUST NOT fire.
  - Multi-file-cosmetic-still-fires trade-off stated explicitly as an "Accepted trade-off" paragraph, naming the 5-file repo-wide-rename example and citing that it's a deliberate recall-over-precision choice, not an oversight — matches the Clarifications session's answer verbatim in substance.
  - Decline path: proceed directly, create no `openspec/` artifacts.
  - Uses `vscode/askQuestions` (not the generic `AskUserQuestion` term used in spec.md/design.md) — this repo's orchestrator consistently calls its blocking-question tool `vscode/askQuestions` everywhere else in this same file (User Question Gate Protocol, Route Selection, Review Workload Guard, etc.); `AskUserQuestion` in the spec/design artifacts is the platform-agnostic requirement term, and `vscode/askQuestions` is its concrete binding in this codebase — not a deviation, just terminology resolution consistent with every other MANDATORY gate in this file.
  - Closes with the CORE-zone placement statement ("lives in CORE alongside the SDD Init Guard... MUST NOT be relocated to a `skills/_shared/` on-demand handler"), matching `specs/agents/spec.md`'s explicit normative sentence about §15 Orchestrator Body Partitioning.
- [x] 4.3 — Ran full `npm test` (`scripts/check.js`): 776/776 tests pass, 0 fail, 0 errors, 0 warnings, "All checks passed." All four `dist/` targets (self-generated/validated in temp dirs per this repo's convention — `dist/` is gitignored and never hand-edited) regenerated cleanly from the modified frontmatter/prose with no generation or validation errors.

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `agents/sdd-orchestrator.agent.md` | Modified | Added `'sdd-reconcile'` to frontmatter `agents: [...]` (line 5). Inserted `### Ambient SDD Awareness Gate (MANDATORY)` subsection (18 lines) immediately after `### SDD Init Guard (MANDATORY)`'s closing line ("Do NOT skip this check...") and before `### Route Selection & Dispatch`. No other sections touched. |
| `openspec/changes/sdd-context-awareness-reconciliation/tasks.md` | Modified | Marked 4.1, 4.2, 4.3 as `[x]`. |

### Deviations from Design

None in substance. One terminology-resolution note (not a deviation): the design/spec artifacts use the generic term `AskUserQuestion` for the blocking-question call; the inserted prose uses `vscode/askQuestions`, which is the concrete tool name this exact agent file already uses for every other MANDATORY blocking gate (Init Guard's own confirmation flow, Route Selection's advisory-confidence branch, Review Workload Guard, sdd-clarify routing, etc.) — using the generic term here would have been the actual inconsistency.

### Issues Found

None.

### Remaining Tasks

- [ ] Phase 5: `/sdd-reconcile` Triplet (`commands/`, `skills/`, `agents/`) — 5.1–5.4
- [ ] Phase 6: Verification Pass — 6.1–6.3

### Workload / PR Boundary

- Mode: `size:exception` (per `state.yaml`'s `delivery-strategy-001` approval and `tasks.md`'s Review Workload Forecast: `400-line budget risk: High`, `Delivery strategy: exception-ok`)
- Current work unit: within Suggested Work Unit 3 — "`agents/sdd-orchestrator.agent.md` prose/frontmatter + `/sdd-reconcile` triplet + `dist/` regeneration" (this batch covers only the orchestrator prose/frontmatter slice; the `/sdd-reconcile` triplet remains for a subsequent batch, per the orchestrator's explicit Phase-4-only scope instruction)
- Boundary: This batch starts and ends entirely within `agents/sdd-orchestrator.agent.md` (plus the accompanying `tasks.md` status update). No `commands/sdd-reconcile.prompt.md`, `skills/sdd-reconcile/SKILL.md`, or `agents/sdd-reconcile.agent.md` files were created.
- Estimated review budget impact: `git diff --stat` for this batch's file is well within the 400-line single-PR budget on its own — the diff is +19/-0 lines in the agent file (one new subsection) plus a 1-line frontmatter edit; the overall change's High risk stems from the full Unit 2+3 scope (Unit 2 is fully complete; Unit 3 is roughly half-done after this batch), not this slice.

### Status

Phase 4 (4.1–4.3) complete, all `[x]`. Combined with Phases 1–3: 17/17 tasks complete across Batches 1–4. Ready for the next batch (Phase 5: `/sdd-reconcile` Triplet), which now has a valid `sdd-reconcile` entry in the orchestrator's `agents: [...]` allowlist (from this batch's 4.1) to dispatch to once the triplet files exist.

## Batch 5 — Phase 5: `/sdd-reconcile` Triplet (`commands/`, `skills/`, `agents/`)

**Mode**: Prose/new-files-only — not covered by `npm test`'s unit/integration TDD layer (no strict-TDD RED/GREEN/REFACTOR cycle applies to new command/skill/agent Markdown files, per the design's own Testing Strategy row for this phase). Verification is generation/validation: new frontmatter parses, the skill is discoverable by `discoverSkills`, and all four `dist/` targets regenerate cleanly — confirmed via the full `npm test` (`scripts/check.js`) run.
**Scope**: Only the three new `/sdd-reconcile` triplet files (`commands/sdd-reconcile.prompt.md`, `skills/sdd-reconcile/SKILL.md`, `agents/sdd-reconcile.agent.md`). Phase 6 (verification pass) intentionally NOT started in this batch.

### Completed Tasks

- [x] 5.1 — Created `commands/sdd-reconcile.prompt.md` mirroring `commands/sdd-baseline.prompt.md`'s exact frontmatter shape (`name`, `description`, `agent: sdd-orchestrator`, `argument-hint: "<domain name or blank>"`, `tools: ['agent', 'read', 'search', 'edit', 'execute']`); body routes the slash command to the `sdd-reconcile` executor via the orchestrator and states the phase is explicit/opt-in (never auto-invoked).
- [x] 5.2 — Created `skills/sdd-reconcile/SKILL.md` mirroring `skills/sdd-baseline/SKILL.md`'s stop-sign pattern exactly: `disable-model-invocation: true`, `user-invocable: false`, `metadata.delegate_only: true`, same `> **ORCHESTRATOR GATE**` banner verbatim (only the phase name swapped). `description` frontmatter leads with `"Trigger: sdd reconcile, spec drift, reconcile domain, fold changes into spec, /sdd-reconcile. ..."` — matches the repo-wide `"Trigger: {words}. {what it does}."` convention (confirmed against `skills/sdd-baseline/SKILL.md`, `skills/sdd-workspace/SKILL.md`, etc. via `Grep`) so `scripts/lib/skill-registry.js`'s `extractTriggers` (matches `/\bTrigger:\s*(.+)$/i`, splits on `,`/`;`) will index it with real trigger keywords instead of falling back to the whole-description fallback. Body is a condensed 6-step algorithm summary (not the full executor logic) plus an explicit "Opt-in only" paragraph restating the spec-reconciliation domain's Opt-In Invocation Only requirement, and defers full step-by-step instructions to `agents/sdd-reconcile.agent.md`.
- [x] 5.3 — Created `agents/sdd-reconcile.agent.md` mirroring `agents/sdd-baseline.agent.md`'s frontmatter shape (`name`, `description`, `tools: ['read', 'search', 'edit', 'execute']`, `user-invocable: false`, `target: vscode`, same "modelo intencionalmente omitido" comment convention). Body implements the design's `/sdd-reconcile` algorithm as executor instructions across Steps 0–5:
  - **Step 0** (design step 1 + 2): reads `baseline.domains_done` from `openspec/config.yaml`; an explicitly named unknown domain is rejected (`blocked`, valid-name list, no git/writes) before any diff or write; when the domain argument is omitted, invokes the real `detectSpecDrift` export from `scripts/lib/ospec-state.js` via `execute` (`node -e "...require('./scripts/lib/ospec-state.js').detectSpecDrift(...)"`) rather than re-deriving drift detection in prose — reuses the exact tested Phase-1 primitive as the source of truth for "which domains are drifted"; `null` result ⇒ no-op, `success`, no writes.
  - **Step 1** (design step 3): resolves the diff-window per target — auto-detected domains reuse `detectSpecDrift`'s already-filtered `sinceCommit`/`sources`/`files` verbatim (no recomputation); explicitly named domains read the manifest's latest Entries row + Domain Map `sources:` bullet, then compute `git diff --name-only {sinceCommit}..HEAD` filtered by the same `**`/`*` glob semantics as `matchesGlobs`; explicit instruction to inspect nothing outside the resolved `files` list.
  - **Step 2** (design step 4): derives requirement/scenario text only from the diffs of files in that window.
  - **Step 3** (design step 5): re-reads `openspec/specs/{domain}/spec.md` fresh from disk immediately before writing (never reuses an earlier in-memory read); merges the delta additively (new/amended sections only); explicit "leave every other existing requirement/scenario byte-for-byte unchanged" instruction; missing `spec.md` ⇒ per-domain `blocked` (recommend `sdd-baseline` first), no write.
  - **Step 4** (design step 6): on a per-domain successful write, resolves the new HEAD short hash via `git rev-parse --short HEAD` and appends exactly one Entries row `| {domain} | reconciled | - | {hash} | {UTC} |`; explicit "never edit/reorder/delete any prior row" instruction; failure before any write ⇒ no row appended for that domain, drift status unchanged for the next session-start check.
  - **Step 5**: aggregates per-domain outcomes independently (one domain's failure does not block or roll back another domain's success in the same run), matching the "domain omitted — all drifted domains processed, a domain with no drift is left untouched" scenario.
  - Result Contract section mirrors `agents/sdd-baseline.agent.md`'s exact field list (`status`/`executive_summary`/`artifacts`/`next_recommended`/`risks`/`skill_resolution`) per `sdd-phase-common.md` §D, with reconcile-specific status semantics (`blocked` for an invalid named domain needs no `question_gate` — the fix is a corrected argument, not a decision) and an explicit "do NOT modify any file outside `openspec/specs/{domain}/spec.md` and `openspec/specs/_baseline/manifest.md`" boundary line, plus an "Opt-in boundary" section reiterating that no hook/gate may auto-invoke this agent.
- [x] 5.4 — Ran the full `npm test` (`scripts/check.js`): `776 tests, 776 pass, 0 fail` (unchanged from Batch 4 — this phase is prose-only, no new `node --test` unit tests apply), `0 errors, 0 warnings`, `"All checks passed."` All four `dist/` targets self-generated and validated cleanly in temp dirs, with the generation diff explicitly listing `+ skills/sdd-reconcile/SKILL.md` among the added files — confirming the new skill's frontmatter parses and it builds without error to all 4 targets, same as `commands/sdd-reconcile.prompt.md` + `agents/sdd-reconcile.agent.md`.

  **CORRECTION (post-`sdd-verify`, WARNING-1)**: the original wording above claimed the skill "is picked up by the same discovery pipeline `discoverSkills` uses" — that was imprecise/false. `discoverSkills`' `shouldIncludeSkill` (`scripts/lib/skill-registry.js:188`) deliberately excludes every `sdd-*` skill directory from its registry cache; `sdd-reconcile` is correctly absent from that cache, identical to `sdd-baseline` and every other SDD phase skill. What actually happened in this batch is generation/validation via `scripts/check.js`'s dist-build pipeline (frontmatter parses, file builds to all 4 targets), which is a different code path than `discoverSkills`. Registration/discoverability for SDD phase skills runs through `agents/sdd-orchestrator.agent.md`'s `agents: [...]` allowlist plus command routing (`commands/sdd-reconcile.prompt.md`'s `agent: sdd-orchestrator`), not through the skill-registry cache. The corresponding spec scenario was reworded in `specs/spec-reconciliation/spec.md` to match this reality.

### Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `commands/sdd-reconcile.prompt.md` | Created | Frontmatter mirrors `commands/sdd-baseline.prompt.md` (`agent: sdd-orchestrator`, `argument-hint: "<domain name or blank>"`); routes to the orchestrator, states explicit/opt-in invocation. |
| `skills/sdd-reconcile/SKILL.md` | Created | Stop-sign delegate-only skill mirroring `skills/sdd-baseline/SKILL.md`'s exact pattern; `Trigger:`-led description for `discoverSkills` indexing; condensed 6-step algorithm summary; explicit Opt-In Invocation Only restatement. |
| `agents/sdd-reconcile.agent.md` | Created | The executor. Frontmatter mirrors `agents/sdd-baseline.agent.md`. Body implements the design's `/sdd-reconcile` algorithm end-to-end (Steps 0–5 above), reusing `detectSpecDrift`/`matchesGlobs` from `scripts/lib/ospec-state.js` via `execute` rather than reimplementing drift logic in prose. Result Contract per `sdd-phase-common.md` §D. |
| `openspec/changes/sdd-context-awareness-reconciliation/tasks.md` | Modified | Marked 5.1, 5.2, 5.3, 5.4 as `[x]`. |

### Deviations from Design

None in substance. One implementation-detail choice (not a deviation — the design's algorithm steps 1–2 describe *what* must happen, not *how* the agent must compute it): `agents/sdd-reconcile.agent.md`'s Step 0 has the executor invoke the real `detectSpecDrift` export via `node -e "require('./scripts/lib/ospec-state.js').detectSpecDrift(...)"` (through the `execute` tool) when the domain argument is omitted, rather than asking the LLM executor to re-derive "which domains are drifted" from raw manifest/config/git state in prose. This keeps the drift-detection logic single-sourced in the already-tested Phase 1 primitive (no divergent reimplementation risk between the hooks' drift detection and the reconcile agent's), while still satisfying the design's stated algorithm steps verbatim for explicitly-named domains (which read the manifest/globs directly, since `detectSpecDrift` only reports domains that are *currently* drifted — an explicitly named domain that isn't drifted yet must still be processable per the "domain specified" scenario, so it cannot always go through `detectSpecDrift`).

### Issues Found

None.

### Remaining Tasks

- [ ] Phase 6: Verification Pass — 6.1–6.3

### Workload / PR Boundary

- Mode: `size:exception` (per `state.yaml`'s `delivery-strategy-001` approval and `tasks.md`'s Review Workload Forecast: `400-line budget risk: High`, `Delivery strategy: exception-ok`)
- Current work unit: completes Suggested Work Unit 3's `/sdd-reconcile` triplet slice — "`agents/sdd-orchestrator.agent.md` prose/frontmatter + `/sdd-reconcile` triplet + `dist/` regeneration" (Batch 4 covered the orchestrator prose/frontmatter half; this batch covers the triplet half)
- Boundary: This batch starts and ends entirely within the three new triplet files (plus the accompanying `tasks.md` status update). No `scripts/lib/ospec-state.js`, hook files, or `agents/sdd-orchestrator.agent.md` were touched — those were Batches 1–4.
- Estimated review budget impact: `git diff --stat` for this batch's four files is well within the 400-line single-PR budget on its own — three new Markdown files (~55 + ~35 + ~110 lines) plus a 4-line `tasks.md` status edit; the overall change's High risk stems from the full Unit 1–3 scope (now fully implemented across Batches 1–5), not this slice.

### Status

Phase 5 (5.1–5.4) complete, all `[x]`. Combined with Phases 1–4: 21/21 tasks complete across Batches 1–5. Only Phase 6 (Verification Pass, 6.1–6.3) remains — a cross-check/integration-check/state-update pass with no new production files, ready to run once the orchestrator schedules it.
