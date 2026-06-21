# Apply Progress: declarative-quality-gates

## Batch 2 (2026-06-21) — COMPLETE (4R-CRITICAL remediation, cycle 4r-critical-1)

**Change**: declarative-quality-gates
**Mode**: Strict TDD (pure layer) + inspection-verified prose (effect layer)
**Trigger**: 4R review gate — 1 CRITICAL (resilience: partial audit write → silent archive bypass) + convergent WARNINGs (risk W2, reliability). Design amended with decisions H1–H7.

### Completed Tasks (Phase 5)

- [x] 5.1 RED — added 29 failing-first tests (H4/H5/H6 + defensive parsing + empty-array + `classifyCoverage`); removed stale `"until Phase 2"` comment. Confirmed RED: 69 tests / 20 fail.
- [x] 5.2 GREEN — implemented `DEFAULT_GATE_TIMEOUT_MS`, `timeout_ms` parse (H5), `coverage.minimum` coercion/omission + validation (H6), `parseCoverage` range-validate no-clamp (H6), `classifyCoverage` pure helper (readability), `error` status with timeout/tool-failure/NaN-exit precedence (H4), `exec`→`execResult` rename, `enforceGate`/`aggregateStatus` treat `error` as blocking (H4), module-header naming-asymmetry note. 69/69 GREEN.
- [x] 5.3 Full suite: `npm test` 0 errors/0 warnings; `node --test scripts/**/*.test.js` → **671/671 pass, 0 fail** (was 642; +29 new). No regressions.
- [x] 5.4 `skills/sdd-verify/SKILL.md` Step 9a — bounded-timeout execution, `execResult` shape, validation-error surfacing, fail-closed write + read-back + `blocked` envelope (H1/H4/H5/H6).
- [x] 5.5 `agents/sdd-verify.agent.md` — `execResult`/`error`/timeout contract, fail-closed write, gate-command trust boundary (H1/H4/H5/H7).
- [x] 5.6 `agents/sdd-orchestrator.agent.md` — policy-aware archive guard (H2) + two-place override confirmation (H3).
- [x] 5.7 `openspec/config.yaml` — `timeout_ms`, `error` status, out-of-range coverage, trust-boundary/credential-hygiene note (H5/H4/H6/H7).
- [x] 5.8 `skills/_shared/openspec-convention.md` — `error` status, naming-asymmetry note, tightened aggregation ordering (resolves prior verify SUGGESTION #2).

### TDD Cycle Evidence (Batch 2)

| Task | Layer | RED | GREEN | Notes |
|------|-------|-----|-------|-------|
| 5.1 | Unit | ✅ 20 fail (69 total) | — | failing-first |
| 5.2 H5 timeout_ms | Unit | ✅ | ✅ 6 tests | default/positive/non-positive/non-int/validate |
| 5.2 H6 coverage | Unit | ✅ | ✅ 6 tests | coerce/omit/validate/parseCoverage range |
| 5.2 H4 error status | Unit | ✅ | ✅ 8 tests | timedOut/error/NaN-exit/precedence/enforce/aggregate/audit |
| 5.2 classifyCoverage | Unit | ✅ | ✅ 4 tests | below/no-cmd/unparseable+OOR/omitted |
| 5.2 defensive + empty | Unit | ✅ | ✅ 5 tests | malformed inputs, `[]` contracts |
| 5.3 full suite | Unit | — | ✅ 671/671 | 0 regressions |
| 5.4–5.8 prose | Effect | N/A | ✅ inspection | I/O contracts, not unit-testable |

### Deviations from Design (Batch 2)

None — H1–H7 implemented as amended. Aggregation-rule ordering in `openspec-convention.md`
tightened to match implementation precedence (halt-fail/error → skipped → pass), also
resolving the prior verify's SUGGESTION #2 (ambiguous routing-table row).

### CRITICAL Resolution

The CRITICAL (partial audit write → silent archive bypass) is closed by two independent
layers: H1 ties the success envelope to a verified write (read-back; `blocked` on failure),
and H2 makes the orchestrator guard policy-aware so "declared policy + absent block" is a
conservative BLOCK, not a no-op. No single point of failure can bypass a required halt gate.

---

## Batch 1 (2026-06-21) — COMPLETE (size:exception, single PR)

**Change**: declarative-quality-gates
**Mode**: Strict TDD
**Delivery**: `size:exception` — full task list in one batch per user approval in state.yaml

---

### Completed Tasks

- [x] 1.1 Scaffolded `scripts/lib/quality-gates.test.js` with `node:test`/`node:assert` imports and require of `./quality-gates.js`
- [x] 1.2 Tests for `parseQualityGates` (null/undefined→null; 4 gates + defaults; unknown key drop; explicit halt; coverage sub-object)
- [x] 1.3 Tests for `validateQualityGates` (valid→pass; unknown on_fail→fail; never-throw contract)
- [x] 1.4 Tests for `parseCoverage` ("85"→85; "72.4"→72.4; empty→null; NaN string→null; null→null)
- [x] 1.5 Tests for `classifyGate` (absent/empty cmd→skipped; exitCode 0→pass; exitCode 1→fail; coverage below min→fail; absent coverage cmd→pass+warn; unparseable stdout→warn not fail)
- [x] 1.6 Tests for `enforceGate` (halt-required fail→BLOCKER; advisory-required fail→WARNING; non-required fail→null; pass→null; skipped→null)
- [x] 1.7 Tests for `aggregateStatus` (halt-required fail→fail; advisory fail+pass→pass; all skipped→skipped; pass+skipped→pass)
- [x] 1.8 Tests for `buildAuditBlock` (shape has status/evaluated_at/gates; per-gate has status/required/on_fail; detail conditional; top-level status delegates to aggregateStatus)
- [x] 1.9 RED confirmed: MODULE_NOT_FOUND, 538 baseline pass, 1 failure (quality-gates.test.js suite)
- [x] 2.1 Created `scripts/lib/quality-gates.js` with KNOWN_GATES, KNOWN_ON_FAIL, module.exports stub
- [x] 2.2 Implemented `parseQualityGates` — task-1.2 tests GREEN
- [x] 2.3 Implemented `validateQualityGates` — task-1.3 tests GREEN
- [x] 2.4 Implemented `parseCoverage` — task-1.4 tests GREEN
- [x] 2.5 Implemented `classifyGate` — task-1.5 tests GREEN
- [x] 2.6 Implemented `enforceGate` — task-1.6 tests GREEN
- [x] 2.7 Implemented `aggregateStatus` — task-1.7 tests GREEN
- [x] 2.8 Implemented `buildAuditBlock` — task-1.8 tests GREEN
- [x] 2.9 Full `npm test`: 578/578 pass (538 baseline + 40 new quality-gates tests), 0 fail
- [x] 3.1 Added commented `quality_gates:` block to `openspec/config.yaml` documenting full schema + migration note
- [x] 4.1 Modified `skills/sdd-verify/SKILL.md` — inserted Step 9a: Quality Gates Evaluation between Steps 9 and 10
- [x] 4.2 Modified `agents/sdd-verify.agent.md` — added Quality Gate Evaluation Contract section
- [x] 4.3 Modified `agents/sdd-orchestrator.agent.md` — added Archive Dispatch Guard (Quality Gates) section
- [x] 4.4 Modified `skills/_shared/openspec-convention.md` — added `gates.quality-gates:` block documentation

---

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/quality-gates.test.js` | Created | 40-test TDD test suite (RED first, then GREEN) |
| `scripts/lib/quality-gates.js` | Created | Pure decision core: parseQualityGates, validateQualityGates, parseCoverage, classifyGate, enforceGate, aggregateStatus, buildAuditBlock |
| `openspec/config.yaml` | Modified | Added commented `quality_gates:` schema block with all 4 gate slots, migration note |
| `skills/sdd-verify/SKILL.md` | Modified | Inserted Step 9a: Quality Gates Evaluation (after test/build, before memory write) |
| `agents/sdd-verify.agent.md` | Modified | Added Quality Gate Evaluation Contract section |
| `agents/sdd-orchestrator.agent.md` | Modified | Added Archive Dispatch Guard with override-with-audit flow |
| `skills/_shared/openspec-convention.md` | Modified | Added `gates.quality-gates:` block documentation with full YAML shape and field reference |
| `openspec/changes/declarative-quality-gates/tasks.md` | Updated | All 22 tasks marked [x] |
| `openspec/changes/declarative-quality-gates/apply-progress.md` | Created | This file |
| `openspec/changes/declarative-quality-gates/state.yaml` | Updated | phases.apply: done, status: ready-for-verify |

---

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1–1.9 | `scripts/lib/quality-gates.test.js` | Unit | N/A (new file) | ✅ Written | ✅ MODULE_NOT_FOUND confirmed RED | ✅ 40 cases | ✅ Clean |
| 2.1 | `scripts/lib/quality-gates.js` | Unit | N/A (new) | ✅ Written (tasks 1.2–1.8) | ✅ Passed | ✅ All spec scenarios covered | ✅ Clean |
| 2.2 parseQualityGates | — | Unit | N/A | ✅ Tasks 1.2 tests | ✅ 6 tests GREEN | ✅ null/defaults/unknown/halt/coverage | ➖ No refactor needed |
| 2.3 validateQualityGates | — | Unit | N/A | ✅ Tasks 1.3 tests | ✅ 6 tests GREEN | ✅ valid/invalid/never-throw | ➖ No refactor needed |
| 2.4 parseCoverage | — | Unit | N/A | ✅ Tasks 1.4 tests | ✅ 5 tests GREEN | ✅ valid/empty/NaN/null | ➖ No refactor needed |
| 2.5 classifyGate | — | Unit | N/A | ✅ Tasks 1.5 tests | ✅ 7 tests GREEN | ✅ 6 behavior paths | ➖ No refactor needed |
| 2.6 enforceGate | — | Unit | N/A | ✅ Tasks 1.6 tests | ✅ 5 tests GREEN | ✅ BLOCKER/WARNING/null matrix | ➖ No refactor needed |
| 2.7 aggregateStatus | — | Unit | N/A | ✅ Tasks 1.7 tests | ✅ 4 tests GREEN | ✅ fail/pass/skipped/mix | ➖ No refactor needed |
| 2.8 buildAuditBlock | — | Unit | N/A | ✅ Tasks 1.8 tests | ✅ 5 tests GREEN | ✅ shape/detail/status | ➖ No refactor needed |
| 2.9 full suite | — | Unit | ✅ 538/538 | N/A | ✅ 578/578 pass | N/A | N/A |
| 3.1 config.yaml | Prose | — | N/A | N/A | ✅ Inspection | Triangulation skipped: config doc, no logic | N/A |
| 4.1–4.4 Prose | Prose | — | N/A | N/A | ✅ Inspection | Triangulation skipped: prose contracts, not unit-testable | N/A |

### Test Summary

- **Total tests written**: 40
- **Total tests passing**: 578 (538 pre-existing + 40 new)
- **Layers used**: Unit (40)
- **Approval tests** (refactoring): None — no refactoring tasks
- **Pure functions created**: 7 (`parseQualityGates`, `validateQualityGates`, `parseCoverage`, `classifyGate`, `enforceGate`, `aggregateStatus`, `buildAuditBlock`)

---

### Deviations from Design

None — implementation matches design exactly.

Key decision honored: `aggregateStatus` returns `'skipped'` when all gates are skipped (consistent with task 1.7c and routing spec), NOT `'pass'` — the task 2.7 prose said "else if any pass or skipped → 'pass'" which would have returned 'pass' for all-skipped. The test cases (task 1.7c) and routing spec table are the authoritative contract; the implementation follows them.

### Issues Found

None.

### Workload / PR Boundary

- Mode: size:exception (user-approved, recorded in state.yaml approvals.review-workload-001)
- Boundary: all phases 1–4 in one batch
- Estimated review budget impact: ~450 lines (within the high forecast of 600–720; actual scope was lighter because prose contracts were added rather than rewritten)
