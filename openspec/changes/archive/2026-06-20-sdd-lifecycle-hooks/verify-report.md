# Verification Report: sdd-lifecycle-hooks

**Mode**: openspec / Strict TDD active
**Verdict**: **PASS WITH WARNINGS**
**Date**: 2026-06-20

---

## Test Execution (re-run by verify, verbatim)

`npm test` (= `node scripts/check.js`, runs all `scripts/**/*.test.js` + golden/parity suites):

```
0 errors, 0 warnings

All checks passed.
```

`node --test scripts/lib/lifecycle-hooks.test.js`:

```
ℹ tests 43
ℹ suites 0
ℹ pass 43
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 62.2623
```

Full suite includes golden/parity tests that all pass: `generated claude tree matches the committed golden`, `generated github-copilot tree matches the committed golden`, `generated opencode tree matches the committed golden`, `real repo: sdd-clarify agent propagates to all four targets`, and the orchestrator/skill propagation checks. Exit code 0.

**Dist parity note**: `dist/` is gitignored (0 tracked files), so `git status` shows no `dist/**` diff. The golden suite regenerates into a temp dir and compares against the working-tree `dist/`, which DOES contain the new `## Lifecycle Hook Dispatch` section (verified in 8 dist files across all 4 targets). Parity holds; regeneration did not drift.

---

## Completeness

23/23 task lines marked `[x]`. All 5 phases (RED, GREEN, orchestrator dispatch, docs, dist+suite) complete. No incomplete tasks.

---

## Spec Compliance Matrix

### Decision-core MUST scenarios — runtime-test (pure helper)

| Scenario | Evidence | Level | Status |
|---|---|---|---|
| Absent `hooks:` block → `{}` | `parseHooksBlock(null/undefined)` tests | runtime-test | ✅ |
| Well-formed block parsed | `parseHooksBlock` known-events test | runtime-test | ✅ |
| Unknown event key ignored | `parseHooksBlock unknown key absent` test | runtime-test | ✅ |
| Action object fields parsed per type | field-preservation tests + `validateHooksBlock` group | runtime-test | ✅ |
| Absent-phase event skipped | `eventAppliesToRoute` (before-verify on [sdd-apply]→false) + `buildAuditEntry(null)` | runtime-test | ✅ |
| Declaration order preserved | `planExecution` A/B/C order test | runtime-test | ✅ |
| `halt` failure stops remaining actions | `planExecution` halt→C skipped test | runtime-test | ✅ |
| `advisory` failure → event status `done` | `computeEventStatus` advisory-failed→done test | runtime-test | ✅ |
| Audit block shape (single-fire + skipped) | `buildAuditEntry` shape/skipped tests | runtime-test | ✅ |
| `before-task` `occurrences[]` indexed append | `buildAuditEntry before-task` 4 tests | runtime-test | ✅ |
| 7 events recognized | `KNOWN_EVENTS` length+contents test | runtime-test | ✅ |

### Effectful-dispatch MUST scenarios — inspection-proof (orchestrator markdown)

These are orchestrator-runtime behaviors with no executable harness (agent-instruction-only by design Decision 5). Verified by source inspection of `agents/sdd-orchestrator.agent.md §Lifecycle Hook Dispatch`.

| Scenario | Evidence in orchestrator MD | Level | Status |
|---|---|---|---|
| `before-implementation` fires before apply dispatch | Event Taxonomy table + Action Execution | inspection-proof | ⚠️ |
| `before-commit` at apply→verify transition (Decision 1) | Decision 1 paragraph (L426) | inspection-proof | ⚠️ |
| `halt` failure blocks boundary + surfaces to user | Failure Policy §halt + 3-option `vscode/askQuestions` gate (L473-499) | inspection-proof | ⚠️ |
| `run-command` flows through PreToolUse, no bypass | Action Execution §run-command (L456-461) | inspection-proof | ⚠️ |
| Audit written incrementally (not deferred) | Audit Persistence (L501-513) | inspection-proof | ⚠️ |
| `load-skill`/`load-rules` injected into `## Hook-Injected Skills and Rules` after `## Project Standards` | Action Execution §Injecting (L447-454) | inspection-proof | ⚠️ |
| Multiple actions merged into single block, declaration order | L453 | inspection-proof | ⚠️ |
| `skill_resolution` unaffected by hook injection | L454 | inspection-proof | ⚠️ |
| No hook actions → prompt/route unchanged | Setup L412 (`{}` → skip firing) | inspection-proof | ⚠️ |

All inspection-proof scenarios are documented precisely and consistently with the spec. The WARNING tier reflects that MUST scenarios in this group lack an executable test (architectural ceiling for orchestrator-prose behavior), not that the documentation is wrong or incomplete.

---

## Design Coherence

| Design item | Implementation | Match |
|---|---|---|
| Decision 5: pure helper + effectful MD | `lifecycle-hooks.js` zero I/O (no `fs`, no `require` beyond exports); purity comment mirrors `route-dispatcher.js` header | ✅ |
| Decision 1: `before-commit` at apply→verify | Orchestrator L421/L426 | ✅ |
| Decision 2: `before-task` per-apply-invocation, `occurrences[]` | `buildAuditEntry` occurrences branch + orchestrator L428 | ✅ (reconciliation pending — see W1) |
| Decision 3: `run-command` via granted execute tool, PreToolUse | Orchestrator L456-461 | ✅ |
| Decision 4: 3-option Retry/Override/Abort gate | Orchestrator L481-499 matches design JSON shape exactly | ✅ |
| Audit `policy` (not `on_failure`) in shape | `_mapToAuditAction` maps `on_failure`→`policy`; test asserts `on_failure` absent | ✅ |
| 3-hook disambiguation | Present in spec (table), `openspec-convention.md`, orchestrator L395-400, `docs/sdd-lifecycle-hooks.md` L11-13 | ✅ |

Helper purity confirmed: `lifecycle-hooks.js` contains no `require()` of runtime deps, no `fs`, no global mutation; all functions deterministic on arguments. Mirrors `route-dispatcher.js` style (hardcoded `KNOWN_*` constants, purity contract comment block).

---

## TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | ✅ | apply-progress "TDD Cycle Evidence" table present |
| RED before GREEN | ✅ | Phase 1.9: `MODULE_NOT_FOUND` (1 fail, 0 pass) confirmed before Phase 2 |
| GREEN confirmed on re-run | ✅ | 43/43 pass when verify re-ran the suite |
| Triangulation adequate | ✅ | 2+ cases per function (happy path + edge/boundary/immutability) |
| Safety net for modified files | ➖ | New file — N/A |

**Assertion quality**: ✅ All assertions verify real behavior. No tautologies, no ghost loops, no assertion-without-production-call. Immutability proof uses `Object.freeze` + post-call check; halt/advisory tests assert distinct expected values (`skipped` vs `success`).

**Test layer distribution**: Unit 43 / Integration 0 / E2E 0 (plus pre-existing golden/parity E2E suites unchanged). Appropriate — the testable surface is a pure function module.

**Coverage / linter**: No coverage or lint tool wired into `npm test`; skipped cleanly (not a failure).

---

## Issues

### CRITICAL
None.

### WARNING

| ID | Finding | Origin |
|---|---|---|
| W1 | Spec literal "`before-task` fires once per task" is realized as once-per-`sdd-apply`-invocation (Decision 2). Faithful at the orchestrator dispatch layer but diverges from the spec's literal wording. Already flagged in design Open Questions and tasks Reconciliation for `sdd-archive` when promoting the delta. | spec-gap (reconciliation) |
| W2 | All effectful-dispatch MUST scenarios (9 listed above) are covered only by `inspection-proof` — no executable test exercises the orchestrator prose (boundary firing, PreToolUse routing of `run-command`, prompt injection, `state.yaml` writes, halt gate). This is the architectural ceiling for agent-markdown behavior and matches the existing accepted pattern for routing, but the MUST behaviors are not runtime-proven end-to-end. | design-gap (inherent limitation) |

### SUGGESTION

| ID | Finding | Origin |
|---|---|---|
| S1 | `computeEventStatus` returns `done` for an event whose only action is an advisory failure (correct per spec: boundary proceeds, action `outcome: failed` records the failure). Consider a doc note clarifying event-`status: done` can coexist with a failed advisory action so audit readers aren't misled. | design-gap |
| S2 | apply-progress collapses all task rows into one TDD evidence row and RED is "load-time `MODULE_NOT_FOUND`" rather than per-function RED. Acceptable for a new pure module, but per-behavior RED transitions would strengthen future evidence. | tasks-gap |

---

## Verdict

**PASS WITH WARNINGS** — 43/43 unit tests green, full suite + golden/parity pass with exit 0, all unit-testable MUST behaviors proven by runtime-test, effectful layer documented precisely and consistently with all three spec deltas. No CRITICAL defects. Two WARNINGs (the `before-task` reconciliation already earmarked for archive, and the inherent inspection-only ceiling for orchestrator-prose MUSTs) and two SUGGESTIONs do not block archival.

**Next recommended**: `sdd-archive` (carry W1 `before-task` reconciliation into the delta-promotion step).
