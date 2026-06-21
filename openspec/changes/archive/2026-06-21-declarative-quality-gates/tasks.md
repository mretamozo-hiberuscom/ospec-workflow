# Tasks: Declarative Quality Gates

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed files | 7 |
| Estimated changed lines | 600–720 (additions + deletions) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: pure lib + tests (phases 1–2, ~430 lines) → PR 2: schema + prose contracts (phases 3–4, ~220 lines) |
| Delivery strategy | single-pr (cached) |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

> **Note:** Delivery strategy is `single-pr`. Because the forecast is **High**, the
> orchestrator MUST obtain a `size:exception` approval before dispatching `sdd-apply`.
> The two-PR split above is the alternative if the team prefers chained PRs instead.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Pure library `quality-gates.js` + co-located test file (Phases 1–2) | PR 1 | Base: `main`; self-contained; `npm test` must be green |
| 2 | Config schema doc + skill/agent prose contracts (Phases 3–4) | PR 2 | Base: PR 1 branch; no code to test; inspection-verified |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| Policy schema: 4 typed gates in `config.yaml` | MUST | `parseQualityGates` + `config.yaml` commented example | covered-by-design | |
| Policy absent → strict no-op | MUST | `parseQualityGates` returns `null`; verify SKILL no-op branch | covered-by-design | |
| Unknown gate keys silently ignored | MUST | `parseQualityGates` filters against `KNOWN_GATES` (lifecycle-hooks pattern) | covered-by-design | |
| Command absent → gate skipped-with-warning | MUST | `classifyGate` empty-command branch | covered-by-design | |
| Exit 0 → pass; non-zero → fail | MUST | `classifyGate` exitCode branches | covered-by-design | |
| Coverage below minimum → tests gate fail | MUST | `classifyGate` + `parseCoverage` | covered-by-design | |
| Coverage command absent → coverage skipped, gate NOT failed | MUST | `classifyGate` absent-coverage-command branch | covered-by-design | |
| ALL gates evaluated before enforcement (no fail-fast) | MUST | Design data-flow; agent loop rule in SKILL.md | covered-by-design | |
| `on_fail` defaults to `advisory` regardless of `required` | MUST | `parseQualityGates` default; spec clarification `clarify-on-fail-default` | covered-by-design | |
| required+halt+fail → BLOCKER + blocksArchive | MUST | `enforceGate` mapping table | covered-by-design | |
| required+advisory+fail → WARNING; archive not blocked | MUST | `enforceGate` mapping table | covered-by-design | |
| required:false+fail → informational only | MUST | `enforceGate` no-finding branch | covered-by-design | |
| Aggregate status: halt-required fail → `fail` | MUST | `aggregateStatus` | covered-by-design | |
| Aggregate status: no halt-fail → `pass`; all skipped → `skipped` | MUST | `aggregateStatus` | covered-by-design | |
| Per-gate audit in `verify-report.md` gate table | MUST | `buildAuditBlock` + sdd-verify SKILL write step | covered-by-design | |
| Per-gate audit in `state.yaml.gates.quality-gates` | MUST | `buildAuditBlock` + sdd-verify SKILL write step | covered-by-design | |
| Skipped gate appears in audit with warning detail | MUST | `classifyGate` detail field + `buildAuditBlock` | covered-by-design | |
| `coverage_threshold` superseded when policy present | MUST | sdd-verify SKILL migration note | covered-by-design | |
| `coverage_threshold` active when policy absent | MUST | no-op branch preserves baseline behavior | covered-by-design | |
| sdd-verify gate-eval step after test/build, before memory write | MUST | sdd-verify SKILL.md new step position | covered-by-design | |
| Envelope `status: success`; report carries FAIL outcome | MUST | sdd-verify SKILL envelope contract | covered-by-design | |
| `state.yaml.gates.quality-gates` NOT written when policy absent | MUST | `parseQualityGates` null → skip write | covered-by-design | |
| Orchestrator blocks archive when `status: fail` | MUST | agents/sdd-orchestrator.agent.md archive-dispatch block | covered-by-design | |
| Override: user justification → two-place audit before dispatch | MUST | orchestrator override flow; spec clarification `clarify-archive-override` | covered-by-design | |
| Override records `timestamp` + `justification` in state.yaml + verify-report.md | MUST | orchestrator override flow | covered-by-design | |
| Passing/absent quality gates → archive dispatch unchanged | MUST | orchestrator normal dispatch; key-absent branch | covered-by-design | |
| Convention doc: `gates.quality-gates` audit block + override sub-block | SHOULD | `skills/_shared/openspec-convention.md` | covered-by-design | |

### Reconciliation Verdict

- MUST coverage: **complete** — all 25 MUST scenarios have a clear design allocation.
- SHOULD/MAY gaps: none.
- Ambiguities to track: none — all three clarify decisions (`clarify-coverage-measurement`, `clarify-on-fail-default`, `clarify-archive-override`) are resolved in `state.yaml.approvals`.

---

## Phase 1: Test Scaffolding — RED (write failing tests first)

> All tasks in this phase create `scripts/lib/quality-gates.test.js`. Run `npm test`
> after each task to confirm RED. Do NOT implement `quality-gates.js` yet.

- [x] 1.1 Create `scripts/lib/quality-gates.test.js` — scaffold file with `import { ... } from './quality-gates.js'` stub and `node:test` / `node:assert` imports; file must exist before task 1.2.
- [x] 1.2 Add failing tests for `parseQualityGates`: (a) `null`/`undefined` input → returns `null`; (b) all four gates recognized, defaults applied (`required: false`, `on_fail: 'advisory'`); (c) unknown gate key dropped silently; (d) explicit `on_fail: halt` preserved; (e) `tests.coverage` sub-object normalized.
- [x] 1.3 Add failing tests for `validateQualityGates`: (a) valid policy → `{ valid: true, errors: [] }`; (b) unknown `on_fail` value → `errors` array non-empty, `valid: false`; (c) calling with any input MUST NOT throw.
- [x] 1.4 Add failing tests for `parseCoverage`: (a) `"85"` → `85`; (b) `"72.4"` → `72.4`; (c) empty string → `null`; (d) `"not a number"` → `null`; (e) `null` input → `null`.
- [x] 1.5 Add failing tests for `classifyGate`: (a) absent/empty `command` → `{ status: 'skipped', detail: 'command not configured' }`; (b) `exitCode: 0` → `{ status: 'pass' }`; (c) `exitCode: 1` → `{ status: 'fail' }`; (d) tests gate with `coverage.minimum: 80`, `coverageStdout: '72'` and exitCode 0 → `{ status: 'fail', detail: 'coverage 72% < minimum 80%' }`; (e) tests gate with `coverage.minimum: 80`, absent `coverage.command` → `{ status: 'pass', detail: <coverage-skipped-warning> }` (gate NOT failed); (f) tests gate, `coverageStdout` un-parseable → coverage skipped-with-warning, not fail.
- [x] 1.6 Add failing tests for `enforceGate`: (a) `required:true, on_fail:'halt', status:'fail'` → `{ finding: 'BLOCKER', blocksArchive: true }`; (b) `required:true, on_fail:'advisory', status:'fail'` → `{ finding: 'WARNING', blocksArchive: false }`; (c) `required:false, status:'fail'` → `{ finding: null, blocksArchive: false }`; (d) `status:'pass'` → `{ finding: null, blocksArchive: false }`; (e) `status:'skipped'` → `{ finding: null, blocksArchive: false }`.
- [x] 1.7 Add failing tests for `aggregateStatus`: (a) one gate `fail` with `required:true, on_fail:'halt'` → `'fail'`; (b) one `fail` (advisory), one `pass` → `'pass'`; (c) all gates `skipped` → `'skipped'`; (d) mix of `pass` and `skipped`, no fail → `'pass'`.
- [x] 1.8 Add failing tests for `buildAuditBlock`: (a) output has top-level `status`, `evaluated_at`, `gates` keys; (b) each gate entry has `status`, `required`, `on_fail`; (c) `detail` key present only when informative; (d) top-level `status` matches `aggregateStatus` result.
- [x] 1.9 Confirm `npm test` is RED — all new tests fail with `MODULE_NOT_FOUND` or similar; no regressions in existing tests.

## Phase 2: Pure Library Implementation — GREEN

> Implement `scripts/lib/quality-gates.js` to make Phase 1 tests pass.
> Run `npm test` after each task to track GREEN progress.

- [x] 2.1 Create `scripts/lib/quality-gates.js` — CommonJS module; declare and export `KNOWN_GATES = ['tests','lint','architecture','security']` and `KNOWN_ON_FAIL = ['advisory','halt']`; add `module.exports` stub so require works (eliminates `MODULE_NOT_FOUND` errors).
- [x] 2.2 Implement `parseQualityGates(rawPolicy)` — return `null` when `rawPolicy` is falsy; iterate `KNOWN_GATES`; for each present gate apply defaults `{ required: false, on_fail: 'advisory' }`; merge explicit values; for `tests`, normalize `coverage` sub-object; drop keys not in `KNOWN_GATES`. Export and run task-1.2 tests GREEN.
- [x] 2.3 Implement `validateQualityGates(policy)` — iterate gates; check `on_fail` in `KNOWN_ON_FAIL`; check `required` is boolean; push error strings; return `{ valid: errors.length === 0, errors }`; wrap in try/catch to guarantee no-throw. Run task-1.3 tests GREEN.
- [x] 2.4 Implement `parseCoverage(stdout)` — guard null/undefined; `parseFloat(stdout.trim())`; return `null` if `isNaN`. Run task-1.4 tests GREEN.
- [x] 2.5 Implement `classifyGate(name, cfg, exec)` — guard: `!cfg.command` → `skipped`; exitCode 0 → `pass`; non-zero → `fail`; for `name === 'tests'` and `cfg.coverage?.minimum` set: if `cfg.coverage.command` absent → append coverage-skipped warning to detail (no override of status); else call `parseCoverage(exec.coverageStdout)` → if result < minimum → force `fail` + detail; if `parseCoverage` returns `null` → append coverage-skipped warning. Run task-1.5 tests GREEN.
- [x] 2.6 Implement `enforceGate(name, cfg, result)` — only acts on `result.status === 'fail'`; matrix: `required && on_fail==='halt'` → BLOCKER+blocksArchive; `required && on_fail==='advisory'` → WARNING; else null. Always return `{ finding, blocksArchive }`. Run task-1.6 tests GREEN.
- [x] 2.7 Implement `aggregateStatus(gateResults)` — scan for any gate where `required && on_fail==='halt' && status==='fail'` → return `'fail'`; else if any `pass` or `skipped` → `'pass'`; else `'skipped'`. Run task-1.7 tests GREEN.
- [x] 2.8 Implement `buildAuditBlock(results, evaluatedAt)` — build `{ status: aggregateStatus(results), evaluated_at: evaluatedAt, gates: { [name]: { status, required, on_fail, ...(detail ? {detail} : {}) } } }`; `override` key is NOT included (added by orchestrator at runtime). Run task-1.8 tests GREEN.
- [x] 2.9 Run full `npm test` — all existing + new tests GREEN; no regressions; verify `quality-gates.test.js` is discovered by `scripts/**/*.test.js` glob.

## Phase 3: Config Schema Documentation

- [x] 3.1 Modify `openspec/config.yaml` — add a `# quality_gates:` commented block (sibling of the existing `# hooks:` block) documenting the full schema: all four typed gates with `required`, `on_fail`, `command` fields, plus `tests.coverage.{minimum,command}`; include migration note that `quality_gates.tests.coverage.minimum` supersedes `rules.verify.coverage_threshold` when the block is declared.

## Phase 4: Prose Contracts — Inspection-Verified

> These tasks modify prose/agent/skill documents. They are NOT unit-testable;
> verification is by inspection (read and confirm correctness against spec + design).

- [x] 4.1 Modify `skills/sdd-verify/SKILL.md` — insert a new numbered step "Quality Gates Evaluation" after the existing test/build verification steps and before the operative-memory write step: (a) read `quality_gates:` from config; (b) call `parseQualityGates` → if `null`, skip entire block (no-op); (c) for each gate, execute its command via the `execute` tool, capture exit code and coverage stdout; (d) call `classifyGate`, then `enforceGate` for ALL gates before enforcement; (e) call `aggregateStatus` + `buildAuditBlock`; (f) write gate result table to `verify-report.md`; (g) write audit block to `state.yaml.gates.quality-gates`; (h) set overall outcome (`FAIL` if any BLOCKER, `PASS WITH WARNINGS` if any WARNING, `PASS` otherwise); include migration note: when `quality_gates:` present, use `tests.coverage.minimum`, ignore `rules.verify.coverage_threshold`.
- [x] 4.2 Modify `agents/sdd-verify.agent.md` — add gate evaluation contract section: commands executed via agent's `execute` tool; all gates evaluated before enforcement (no fail-fast); both audit destinations written atomically before returning; policy-absent → no audit written, baseline behavior unchanged; agent envelope `status` is always `success` (agent work completed); `verify-report.md` outcome field carries PASS/FAIL/PASS WITH WARNINGS.
- [x] 4.3 Modify `agents/sdd-orchestrator.agent.md` — add archive-dispatch guard: after `sdd-verify` completes, read `state.yaml.gates.quality-gates.status`; if `fail` → surface blocking gate details via question gate (options: fix + re-run verify, or override with written justification); if user provides justification → write `gates.quality-gates.override { timestamp, justification }` to `state.yaml` AND append Override section to `verify-report.md` → only then dispatch `sdd-archive`; if `pass`, `skipped`, or key absent → dispatch normally.
- [x] 4.4 Modify `skills/_shared/openspec-convention.md` — add `gates.quality-gates` audit block shape documentation: include the YAML shape from the routing spec (`status`, `evaluated_at`, per-gate sub-keys, optional `override` sub-block with `timestamp` + `justification`); note the block is a sibling of `clarify` and `4r-review-gate` entries under `gates:`; note it is written only when `quality_gates:` policy is declared.

## Phase 5: 4R-CRITICAL Remediation (cycle 4r-critical-1) — Effect-Layer Hardening

> Triggered by the 4R review gate (1 CRITICAL + convergent WARNINGs). Design amended
> with decisions H1–H7. Pure-layer changes follow Strict TDD (failing test first);
> effect-layer changes are prose contracts verified by inspection. Authoritative
> clarify decisions are NOT relitigated.

### 5a: Pure-layer remediation — RED then GREEN

- [x] 5.1 Add failing-first unit tests (H4/H5/H6) to `scripts/lib/quality-gates.test.js`: `DEFAULT_GATE_TIMEOUT_MS`; `timeout_ms` parse/validate; `coverage.minimum` coercion/omission + validation; `parseCoverage` range (`150/-5→null`, boundaries 0/100, fractional); `parseCoverage(undefined)→null`; malformed `parseQualityGates` inputs; `classifyGate` `error`/timeout/NaN-exit precedence; `classifyCoverage` helper in isolation; `enforceGate`/`aggregateStatus` treat required-halt `error` as blocking; `aggregateStatus([])`/`buildAuditBlock([])` empty contract. Remove stale `"until Phase 2"` comment.
- [x] 5.2 Implement `quality-gates.js`: add `DEFAULT_GATE_TIMEOUT_MS` + `timeout_ms` parse (H5); coerce/range-validate `coverage.minimum` and surface invalid via `validateQualityGates` (H6); range-validate `parseCoverage` (no clamp, H6); extract pure `classifyCoverage` helper (readability); add `error` status to `classifyGate` with timeout/tool-failure/NaN-exit precedence (H4); rename `exec`→`execResult`; `enforceGate`/`aggregateStatus` treat `error` like `fail` (H4); module-header naming-asymmetry note. Run all tests GREEN.
- [x] 5.3 Run full `npm test` + `node --test scripts/**/*.test.js` — 671/671 GREEN, 0 regressions.

### 5b: Effect-layer remediation — prose contracts (inspection-verified)

- [x] 5.4 `skills/sdd-verify/SKILL.md` Step 9a — bounded-timeout execution + `execResult` shape (H5/H4); surface `validateQualityGates` errors in `## Quality Gates` (H6); fail-closed audit write + read-back + `status: blocked` envelope on persistence failure (H1).
- [x] 5.5 `agents/sdd-verify.agent.md` — bounded-timeout/abort + `execResult` fields + `error` status (H4/H5); fail-closed write/read-back/`blocked` envelope (H1); gate-command trust boundary + credential hygiene (H7).
- [x] 5.6 `agents/sdd-orchestrator.agent.md` Archive Dispatch Guard — policy-aware block (config + state.yaml + envelope): block on absent-but-declared, `fail`, `error`, non-success envelope (H2); two-place override confirmation before dispatch (H3).
- [x] 5.7 `openspec/config.yaml` — document `timeout_ms`, `error` status, out-of-range coverage handling, and gate-command trust-boundary/credential-hygiene note (H7).
- [x] 5.8 `skills/_shared/openspec-convention.md` — add `error` status value, `quality_gates`/`quality-gates` naming-asymmetry note, and tighten aggregation-rule ordering.
