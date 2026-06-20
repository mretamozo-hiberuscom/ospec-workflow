# Apply Progress: sdd-lifecycle-hooks

**Mode**: Strict TDD (RED → GREEN → REFACTOR)
**Delivery**: `size:exception` (single PR — approved via vscode/askQuestions, approval ID: review-workload-001)
**Batch**: 1 of 1 (full task list implemented in one pass)

---

## Completed Tasks

### Phase 1 — RED (Failing Tests Written)

- [x] 1.1 `scripts/lib/lifecycle-hooks.test.js` created with boilerplate and all named imports (MODULE_NOT_FOUND confirmed RED).
- [x] 1.2 parseHooksBlock test group (absent → `{}`, known keys preserved, unknown key absent, field preservation).
- [x] 1.3 validateHooksBlock test group (missing type, missing skill/rules/command, invalid on_failure, well-formed → valid).
- [x] 1.4 eventAppliesToRoute test group (always-true before-change, before-verify false when sdd-apply-only route, before-implementation true when sdd-apply present).
- [x] 1.5 planExecution test group (order preserved, halt failure marks subsequent as skipped, advisory failure does not skip, input immutability).
- [x] 1.6 computeEventStatus test group (all success → done, halt failed → failed, advisory failed rest success → done, all skipped → skipped, vacuous empty → skipped).
- [x] 1.7 buildAuditEntry single-fire test group (shape check, skipped event, field mapping, on_failure→policy transform).
- [x] 1.8 buildAuditEntry before-task occurrences test group (first invocation, second appended, top-level worst status).
- [x] 1.9 RED confirmed: `node --test scripts/lib/lifecycle-hooks.test.js` → MODULE_NOT_FOUND (1 fail, 0 pass).

### Phase 2 — GREEN (Implementation)

- [x] 2.1–2.9 `scripts/lib/lifecycle-hooks.js` created with "use strict" header, module-purity contract comment, all 8 exports.
- [x] 2.10 GREEN confirmed: 43/43 tests pass, 0 fail.

**REFACTOR**: Code was already clean upon GREEN — pure functions, internal helpers extracted (_mapToAuditAction, _worstOccurrenceStatus, _buildSingleFireEntry, _buildBeforeTaskEntry), no duplication. No refactoring step needed.

### Phase 3 — Orchestrator Agent Dispatch Instructions

- [x] 3.1 `## Lifecycle Hook Dispatch` section added to `agents/sdd-orchestrator.agent.md` with: setup/caching, 7-event taxonomy table, Decision 1 (before-commit timing), Decision 2 (before-task per-invocation).
- [x] 3.2 `### Action Execution` sub-section: declaration order, load-skill file accumulation, load-rules text accumulation, ## Hook-Injected Skills and Rules prompt block (after ## Project Standards), run-command via execute/Bash tool through PreToolUse.
- [x] 3.3 `### Failure Policy` sub-section: advisory (record + continue), halt (record + skip remaining + write state.yaml + vscode/askQuestions 3-option gate: Retry/Override/Abort).
- [x] 3.4 `### Audit Persistence` sub-section: write immediately, use buildAuditEntry shape, before-task append-not-overwrite, skipped events at route start.

### Phase 4 — Documentation

- [x] 4.1 `skills/_shared/openspec-convention.md` updated: `lifecycle_hooks:` block schema with field reference table, `hooks:` block in config.yaml with schema reference table and valid event keys list.
- [x] 4.2 `openspec/config.yaml` updated: commented `hooks:` example block after routing section, all lines commented out (#), includes one example of each action type (load-skill, load-rules, run-command) with on_failure shown.
- [x] 4.3 (OPTIONAL — implemented, low cost) `docs/sdd-lifecycle-hooks.md` created: 3-hook disambiguation table, 7-event taxonomy with phase requirements, action type reference, failure policy table, audit shape example, pure helper export reference, rollout/opt-in section. Mirrors `docs/sdd-routing.md` structure.

### Phase 5 — Dist Regeneration and Full Test Suite

- [x] 5.1 `npm run build:claude` → `dist/claude-marketplace/` regenerated. Validation passed.
- [x] 5.2 `npm run build:copilot` → `dist/github-copilot/` regenerated. 0 errors, 0 warnings.
- [x] 5.3 `npm run build:vscode` → `dist/vscode/` regenerated. 0 errors, 0 warnings.
- [x] 5.4 `npm run build:opencode` → `dist/opencode/` regenerated. 0 errors, 0 warnings.
- [x] 5.5 `npm test` → **All checks passed** (0 errors, 0 warnings). lifecycle-hooks.test.js: 43/43 pass. manifest-sync, validate-github-copilot, validate-opencode: all pass. Full existing suite: unchanged.

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.2–1.8 / 2.1–2.9 | `scripts/lib/lifecycle-hooks.test.js` | Unit | N/A (new file) | ✅ Written (MODULE_NOT_FOUND) | ✅ 43/43 pass | ✅ Multiple cases per behavior (2+ test cases for each function, happy path + edge/boundary) | ✅ Internal helpers extracted, no duplication |

### Test Summary

- **Total tests written**: 43
- **Total tests passing**: 43
- **Layers used**: Unit (43)
- **Approval tests** (refactoring): None — no refactoring tasks
- **Pure functions created**: 7 (`parseHooksBlock`, `validateHooksBlock`, `eventAppliesToRoute`, `planExecution`, `computeEventStatus`, `buildAuditEntry`, plus 4 internal helpers)

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-hooks.test.js` | Created | 43 unit tests for all 7 exported functions + constants. RED-first. |
| `scripts/lib/lifecycle-hooks.js` | Created | Pure helper: parse/validate/order/policy/audit-shape; zero I/O; module-purity contract. |
| `agents/sdd-orchestrator.agent.md` | Modified | New `## Lifecycle Hook Dispatch` section with 4 sub-sections: Setup, Action Execution, Failure Policy, Audit Persistence. |
| `skills/_shared/openspec-convention.md` | Modified | `lifecycle_hooks:` block schema, `hooks:` block schema, both with annotated examples and field reference tables. |
| `openspec/config.yaml` | Modified | Commented `hooks:` example block (documentation-only, all lines prefixed with `#`). |
| `docs/sdd-lifecycle-hooks.md` | Created | Concept doc: 3-hook disambiguation, 7-event taxonomy, action types, failure policy, audit shape, pure helper reference, rollout notes. |
| `dist/claude-marketplace/**` | Regenerated | Via `npm run build:claude` — not hand-edited. |
| `dist/github-copilot/**` | Regenerated | Via `npm run build:copilot` — not hand-edited. |
| `dist/vscode/**` | Regenerated | Via `npm run build:vscode` — not hand-edited. |
| `dist/opencode/**` | Regenerated | Via `npm run build:opencode` — not hand-edited. |

---

## Deviations from Design

None — implementation matches design.md exactly:
- Pure helper in `scripts/lib/lifecycle-hooks.js`, effectful dispatch in orchestrator MD (Decision 5).
- `planExecution` accepts actions with optional outcomes and applies halt-stop in a single pass (clean realization of Decision 2's "annotate policy for caller's reference").
- `buildAuditEntry('before-task', results, {existing: ...})` uses append-not-overwrite (Decision 2's occurrences[] contract).
- `computeEventStatus` uses `policy` field (audit shape), not `on_failure` (config field).

## Workload / PR Boundary

- **Mode**: `size:exception` (single PR)
- **Approval**: review-workload-001 (accepted at 2026-06-20T18:45:00Z)
- **Estimated additions**: ~620 lines (lifecycle-hooks.js ~175, lifecycle-hooks.test.js ~255, orchestrator delta ~115, openspec-convention delta ~110, config.yaml delta ~35, docs/sdd-lifecycle-hooks.md ~130). Dist target regenerations are generated, not hand-counted. Actual vs forecast (1000-1100) is lower because docs/concept-doc overlap was avoided.

---

## Remediation Pass — 4R Findings (2026-06-20)

**Status**: pass-with-warnings → remediation complete (NOT archived; state.yaml status unchanged)
**Strict TDD**: active throughout remediation
**Safety net baseline**: 43/43 tests passing before any changes

### RED phase (failing tests written first)

10 new tests added to `scripts/lib/lifecycle-hooks.test.js` before implementing any code:

| Test | Finding |
|------|---------|
| null action element does not throw and produces error | reliability-C1 |
| undefined action element does not throw and produces error | reliability-C1 |
| primitive string action element does not throw and produces error | reliability-C1 |
| non-array event value produces error (not silently skipped) | reliability-C1 |
| load-skill with path traversal (..) is rejected | security-load-skill |
| load-skill with absolute path is rejected | security-load-skill |
| load-skill with Windows drive letter is rejected | security-load-skill |
| load-skill with valid skills/ path is accepted | security-load-skill |
| load-rules text exceeding 4000 chars is rejected | security-load-rules |
| load-rules text at exactly 4000 chars is accepted | security-load-rules |

RED confirmed: `node --test scripts/lib/lifecycle-hooks.test.js` → 8 fail, 45 pass (valid fixture update also made to one pre-existing test whose skill path `"x.md"` became invalid under the new confinement rule — assertion semantics unchanged).

### GREEN phase (implementation)

Changes made to `scripts/lib/lifecycle-hooks.js`:

1. **Finding 1 (reliability-C1)**: `validateHooksBlock` — added guard before any property dereference on action elements. Null/undefined/primitive/array elements now push `{prefix}: action must be an object` and continue. Non-array, non-null event values now push `{event}: actions must be a list` before continuing.

2. **Finding 2 (security)**: Added pure internal helper `_isConfinedSkillPath(skillPath)` — string-only validation, zero fs access. Checks: no absolute path (`/` or `\` prefix), no Windows drive letter (`[a-zA-Z]:`), no `..` segment, must start with `skills/`. Integrated into `validateHooksBlock` after the existing `!action.skill` check.

3. **Finding 3 (security)**: Added `action.rules.length > 4000` check in `validateHooksBlock`. Pushes `{prefix}: load-rules 'rules' exceeds maximum length of 4000 characters`.

4. **Finding 4 (documentation)**: Trust boundary notes added to `agents/sdd-orchestrator.agent.md` in the Lifecycle Hook Dispatch section:
   - `load-skill` failure path documented (invalid path or file not found → `outcome: failed`, `on_failure` policy applies)
   - `load-rules` trust boundary: UNTRUSTED content, must be in delimited block, cannot alter gate verdicts
   - `after-archive` injected content must be discarded (no persistence side effects)
   - `run-command` trust boundary: highest-trust action, PreToolUse covers limited DENY/ASK patterns, operators must treat as trusted config

GREEN confirmed: `node --test scripts/lib/lifecycle-hooks.test.js` → **53/53 pass, 0 fail**

### Spec update

`openspec/changes/sdd-lifecycle-hooks/specs/lifecycle-hooks/spec.md` updated with new `## ADDED Requirements — 4R Remediation` section covering:
- `validateHooksBlock` never-throw contract with per-input-type behaviour table
- `load-skill` path confinement requirement and rejection criteria table
- `load-rules` 4000-char length cap
- Trust boundary requirement for hook-injected content (untrusted text, delimited injection, after-archive discard, run-command trust note)

### Final test run

`npm test` → **547/547 pass, 0 fail, 0 errors, 0 warnings — All checks passed.**

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Finding 1 (no-throw guard) | `scripts/lib/lifecycle-hooks.test.js` | Unit | 43/43 pass | 4 tests → 4 fail | 53/53 pass | null, undefined, primitive, non-array (4 cases) | No duplication — guard is a single if-block |
| Finding 2 (path confinement) | `scripts/lib/lifecycle-hooks.test.js` | Unit | 43/43 pass | 3 tests → 3 fail + 1 passing (valid path) | 53/53 pass | traversal, absolute Unix, Windows drive letter, valid path (4 cases) | Pure helper extracted (`_isConfinedSkillPath`) |
| Finding 3 (length cap) | `scripts/lib/lifecycle-hooks.test.js` | Unit | 43/43 pass | 1 test → 1 fail + 1 passing (boundary) | 53/53 pass | over-cap + at-cap boundary (2 cases) | Inline condition — no duplication |
| Finding 4 (documentation) | n/a — doc only | n/a | n/a | n/a | n/a | n/a | n/a |

### Files Changed (remediation)

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-hooks.js` | Modified | `_isConfinedSkillPath` helper; `validateHooksBlock` never-throw guard, path confinement check, length cap |
| `scripts/lib/lifecycle-hooks.test.js` | Modified | 10 new tests for Findings 1–3; fixture update for pre-existing test (skill path now requires `skills/` prefix) |
| `agents/sdd-orchestrator.agent.md` | Modified | Trust boundary notes for `load-skill`, `load-rules`, `run-command`, and `after-archive` in Lifecycle Hook Dispatch section |
| `openspec/changes/sdd-lifecycle-hooks/specs/lifecycle-hooks/spec.md` | Modified | ADDED Requirements section: no-throw contract, path confinement, length cap, trust boundary |

---

## Remediation Pass #2 (2026-06-20)

**Status**: all fixes applied; full suite GREEN
**Strict TDD**: active throughout; RED-first for all code changes
**Safety net baseline**: 53/53 tests passing before any changes

### RED phase (failing tests written first)

6 new tests added to `scripts/lib/lifecycle-hooks.test.js` before implementing any code:

| Test | Finding |
|------|---------|
| `skill: 42` (integer) does not throw and produces error | FIX 1 — non-string skill TypeError |
| `skill: true` (boolean) does not throw and produces error | FIX 1 — non-string skill TypeError |
| `skill: {}` (object) does not throw and produces error | FIX 1 — non-string skill TypeError |
| `skill: [1]` (array) does not throw and produces error | FIX 1 — non-string skill TypeError |
| `rules: 42` (number) produces error and is rejected | FIX 2 — non-string rules silent bypass |
| `rules: {}` (object) produces error and is rejected | FIX 2 — non-string rules silent bypass |

RED confirmed: `node --test scripts/lib/lifecycle-hooks.test.js` → 6 fail, 53 pass.

### GREEN phase (implementation)

Changes made to `scripts/lib/lifecycle-hooks.js`:

1. **FIX 1 — CRITICAL regression (`_isConfinedSkillPath` TypeError)**: Added defense-in-depth guard to `_isConfinedSkillPath` — `if (typeof skillPath !== "string") return false;` at the top, before any `.startsWith()` call. Added type check in `validateHooksBlock` load-skill branch: when `skill` is truthy but `typeof action.skill !== "string"`, push `${prefix}: load-skill 'skill' must be a string` and do NOT call `_isConfinedSkillPath`. This restores the never-throw contract.

2. **FIX 2 — silent bypass (`rules.length > 4000` on non-string)**: Added type check in `validateHooksBlock` load-rules branch: when `rules` is truthy but `typeof action.rules !== "string"`, push `${prefix}: load-rules 'rules' must be a string`. This prevents `undefined > 4000` from silently evaluating to `false`.

GREEN confirmed: `node --test scripts/lib/lifecycle-hooks.test.js` → **59/59 pass, 0 fail**.

### Orchestrator doc hardening (FIX 3)

Changes made to `agents/sdd-orchestrator.agent.md` in the `#### load-skill action` section:

- **(a) load-skill FILE CONTENT UNTRUSTED label**: added explicit trust boundary note for file content (symmetric to load-rules), requiring wrap in delimited block (`--- begin hook-injected skills ---` / `--- end hook-injected skills ---`), forbidding gate-verdict override or elevated authority claims.
- **(b) Validation-first (mandatory pre-read step)**: rewritten so that `validateHooksBlock` acceptance and `_isConfinedSkillPath` confirmation are documented as a MANDATORY step before any file read, not only in the failure-path clause. If validation fails, action is `outcome: failed` and `on_failure` applies without reading the file.
- **(c) Symlink-escape guard**: added requirement that after string-level path confinement is confirmed, the orchestrator MUST resolve the real filesystem path and verify it stays within the repository root. If it escapes (symlink outside repo), treat as `outcome: failed` per `on_failure` policy.

Changes made in `#### run-command action` section:

- **(d) Credential-hygiene note**: added note that `action.command` strings are written verbatim into `state.yaml` (a committable artifact); operators MUST NOT embed secrets or credentials in `command` fields.

### Spec alignment (FIX 4)

`openspec/changes/sdd-lifecycle-hooks/specs/lifecycle-hooks/spec.md` extended with new "Remediation Pass #2" section containing:

- Non-string `skill` MUST be rejected without throwing — 4 scenarios (integer, boolean, object, array)
- Non-string `rules` MUST be rejected — 2 scenarios (number, object)
- Symlink-escape guard requirement — runtime requirement + scenario
- Credential-hygiene constraint for `run-command` — requirement + scenario

### Final test run

`npm test` → **553/553 pass, 0 fail, 0 errors, 0 warnings — All checks passed.**

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| FIX 1 (non-string skill TypeError) | `scripts/lib/lifecycle-hooks.test.js` | Unit | 53/53 pass | 4 tests → 4 fail | 59/59 pass | 4 cases: integer, boolean, object, array | Defense-in-depth guard extracted to top of `_isConfinedSkillPath`; type check inlined in load-skill branch |
| FIX 2 (rules silent bypass) | `scripts/lib/lifecycle-hooks.test.js` | Unit | 53/53 pass | 2 tests → 2 fail | 59/59 pass | 2 cases: number and object | Inline type check, no duplication |
| FIX 3 (orchestrator doc) | n/a — doc only | n/a | n/a | n/a | n/a | n/a | n/a |
| FIX 4 (spec alignment) | n/a — spec only | n/a | n/a | n/a | n/a | n/a | n/a |

### Files Changed (remediation pass #2)

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-hooks.js` | Modified | Defense-in-depth guard in `_isConfinedSkillPath`; type checks in `validateHooksBlock` for non-string `skill` (FIX 1) and non-string `rules` (FIX 2) |
| `scripts/lib/lifecycle-hooks.test.js` | Modified | 6 new tests for FIX 1 (4 cases) and FIX 2 (2 cases) |
| `agents/sdd-orchestrator.agent.md` | Modified | load-skill section: UNTRUSTED FILE CONTENT label, mandatory pre-read validation step, symlink-escape guard; run-command section: credential-hygiene note |
| `openspec/changes/sdd-lifecycle-hooks/specs/lifecycle-hooks/spec.md` | Modified | Remediation pass #2 section: non-string skill/rules scenarios, symlink-escape guard, credential-hygiene constraint |

---

## Remediation Pass #3 (2026-06-20)

**Status**: entry-guard WARNING closed; full suite GREEN
**Strict TDD**: RED-first
**Safety net baseline**: 553/553 tests passing before changes

### Finding (reliability re-review, WARNING)

`validateHooksBlock(null)` / `validateHooksBlock(undefined)` threw `TypeError: Cannot convert undefined or null to object` at the `Object.entries(hooks)` entry — unreachable through the normal `parseHooksBlock → validateHooksBlock` pipeline (parseHooksBlock always returns a plain object), but it violated the function's own absolute never-throw contract.

### RED phase

4 new tests added to `scripts/lib/lifecycle-hooks.test.js`: `null`, `undefined`, array, and primitive arguments — each asserts `doesNotThrow` and `{ valid: true, errors: [] }` (absent/non-map hooks = nothing to validate = vacuously valid).

RED confirmed: 3 fail (null, undefined, array), 1 pre-pass (primitive `42` — `Object.entries(42)` returns `[]` and never threw).

### GREEN phase

Added an entry guard at the top of `validateHooksBlock`: if `hooks` is null / non-object / array, return `{ valid: true, errors: [] }` immediately. Mirrors `parseHooksBlock`'s tolerance.

GREEN confirmed: `npm test` → **557/557 pass, 0 fail, 0 errors, 0 warnings — All checks passed.**

### Files Changed (remediation pass #3)

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-hooks.js` | Modified | Entry guard in `validateHooksBlock` — null/non-object/array argument → `{valid:true,errors:[]}` (never throws) |
| `scripts/lib/lifecycle-hooks.test.js` | Modified | 4 new tests for the entry-guard never-throw contract |

### Outcome

The never-throw contract for `validateHooksBlock` is now total: no input shape (argument-level or element-level) can throw. The reliability CRITICAL (reliability-C1) and its pass #2 regression are fully resolved; only the residual entry-guard WARNING remained, now closed.
