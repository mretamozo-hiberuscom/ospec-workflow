# Quality Gates Specification

## Purpose

The `quality-gates` domain defines the typed declarative policy that `sdd-verify`
evaluates to gate change progression. It covers the `quality_gates:` schema in
`config.yaml`, per-gate evaluation and enforcement semantics, audit shape, coverage
threshold migration, and no-op behavior when the policy is absent.

---

## Requirements

### Requirement: Quality Gate Policy Schema

The system MUST support an optional `quality_gates:` key in `openspec/config.yaml`
with four typed gate slots: `tests`, `lint`, `architecture`, and `security`. Absence
of `quality_gates:` is a strict no-op; existing verify behavior is unchanged.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `{gate}.required` | boolean | `false` | Whether gate failure affects the verification outcome |
| `{gate}.command` | string | absent | Shell command to run; absent = skip-with-warning |
| `{gate}.on_fail` | `advisory` \| `halt` | `advisory` | Enforcement when `required: true` and gate fails |
| `tests.coverage.minimum` | integer 0–100 | absent | Coverage floor; absent = no coverage check |
| `tests.coverage.command` | string | absent | Shell command whose stdout is the coverage percentage (0–100); absent = skip coverage check with warning |

Unknown gate keys at the `quality_gates:` level MUST be silently ignored (forward-compatibility).

#### Scenario: All four gates declared — policy read successfully

- GIVEN `config.yaml` declares `quality_gates:` with all four gate entries
- WHEN `sdd-verify` reads the policy
- THEN it recognizes `tests`, `lint`, `architecture`, and `security` and evaluates each

#### Scenario: `quality_gates:` absent — strict no-op

- GIVEN `config.yaml` has no `quality_gates:` key
- WHEN `sdd-verify` runs
- THEN it MUST NOT evaluate any quality gates
- AND behavior is identical to the pre-quality-gates baseline

---

### Requirement: Per-Gate Evaluation Semantics

For each gate declared in `quality_gates:`, `sdd-verify` MUST:

1. Check that `command` is set; if absent or empty, the gate status is **skipped**.
2. Execute the configured `command`.
3. Classify: exit code 0 → **pass**; non-zero → **fail**.
4. For `tests` only: if `coverage.minimum` is set, `sdd-verify` MUST run the command
   specified in `tests.coverage.command` and parse its stdout as the coverage percentage.
   If the measured percentage is below `coverage.minimum`, the gate result is **fail**
   regardless of the main command exit code. If `tests.coverage.command` is absent, the
   coverage check MUST be **skipped** with a warning and MUST NOT cause the gate to fail.

`sdd-verify` MUST evaluate ALL declared gates before applying any enforcement
(fail-fast within the gate loop is prohibited).

#### Scenario: Command exits 0 — gate passes

- GIVEN `quality_gates.lint.command: "npm run lint"` is set
- WHEN `sdd-verify` runs the command and it exits with code 0
- THEN the `lint` gate status is `pass`

#### Scenario: Command exits non-zero — gate fails

- GIVEN `quality_gates.lint.command: "npm run lint"` is set
- WHEN the command exits with a non-zero code
- THEN the `lint` gate status is `fail`

#### Scenario: Coverage below minimum — tests gate fails even on command success

- GIVEN `quality_gates.tests.coverage.minimum: 80` AND `quality_gates.tests.coverage.command: "npm run coverage:pct"` AND the coverage command outputs `72`
- WHEN `sdd-verify` evaluates the tests gate and the main command exits 0
- THEN the tests gate status is `fail` with detail "coverage 72% < minimum 80%"

#### Scenario: Coverage command absent — coverage check skipped with warning

- GIVEN `quality_gates.tests.coverage.minimum: 80` AND `tests.coverage.command` is absent
- WHEN `sdd-verify` evaluates the tests gate
- THEN the coverage check is skipped with warning detail "coverage.command not configured; coverage check skipped"
- AND the tests gate MUST NOT be marked `fail` due to the absent coverage command

#### Scenario: All gates evaluated before enforcement applied

- GIVEN three gates are declared and the first gate fails
- WHEN `sdd-verify` evaluates the policy
- THEN it evaluates the remaining gates before applying any enforcement
- AND all gate results appear in the audit output

---

### Requirement: Skip-with-Warning for Absent Command

When a gate's `command` is absent or empty, `sdd-verify` MUST record the gate as
**skipped** with a warning. A skipped gate MUST NOT be treated as a failure even when
`required: true`.

#### Scenario: Command absent — gate skipped, archive not blocked

- GIVEN `quality_gates.architecture.required: true` AND `command` is absent
- WHEN `sdd-verify` evaluates the architecture gate
- THEN gate status is `skipped` with a warning detail
- AND the gate does NOT block archive dispatch

---

### Requirement: Enforcement Mode

When a gate has `required: true` and status `fail`, `sdd-verify` MUST apply the
gate's `on_fail` enforcement:

| `on_fail` | `required` | Behavior |
|-----------|-----------|----------|
| `halt` | `true` | Records `BLOCKER` finding; overall verify outcome is `FAIL`; archive blocked |
| `advisory` | `true` | Records `WARNING` finding; overall outcome is `PASS WITH WARNINGS`; archive not blocked |
| any | `false` | Informational only; `on_fail` ignored; archive not blocked |

The `on_fail` field MUST default to `advisory` for all gates regardless of the `required` value. No implicit `halt` behavior is inferred from `required: true`. To trigger archive-blocking enforcement, the operator MUST declare `on_fail: halt` explicitly.

#### Scenario: Required halt gate fails — archive blocked

- GIVEN `quality_gates.lint.required: true, on_fail: halt`
- WHEN the lint gate result is `fail`
- THEN `sdd-verify` records a BLOCKER finding and overall outcome `FAIL`
- AND the orchestrator MUST NOT dispatch `sdd-archive`

#### Scenario: Required advisory gate fails — proceed with warning

- GIVEN `quality_gates.security.required: true, on_fail: advisory`
- WHEN the security gate result is `fail`
- THEN `sdd-verify` records a WARNING finding and overall outcome `PASS WITH WARNINGS`
- AND archive dispatch is not blocked

#### Scenario: Non-required gate fails — informational only

- GIVEN `quality_gates.architecture.required: false`
- WHEN the architecture gate result is `fail`
- THEN the result is informational; archive is not blocked

---

### Requirement: Per-Gate Audit

`sdd-verify` MUST record each evaluated gate's result in:

1. **`verify-report.md`** — a gate result table with columns: `gate`, `status`
   (pass/fail/skipped), `required`, `on_fail`, and optional `detail`.
2. **`state.yaml`** under `gates.quality-gates:` (see routing spec for audit block shape).

#### Scenario: All evaluated gates appear in both audit destinations

- GIVEN three gates are configured and evaluated
- WHEN `sdd-verify` completes
- THEN `verify-report.md` contains a row for each gate
- AND `state.yaml.gates.quality-gates` contains per-gate status entries

#### Scenario: Skipped gate included in audit with warning detail

- GIVEN the `architecture` gate is skipped (no command)
- WHEN `sdd-verify` writes audit entries
- THEN the audit shows `architecture | skipped` with detail "command not configured"

---

### Requirement: Coverage Threshold Migration

`quality_gates.tests.coverage.minimum` supersedes `rules.verify.coverage_threshold`.
When `quality_gates:` is declared, `sdd-verify` MUST use
`quality_gates.tests.coverage.minimum` and MUST ignore `rules.verify.coverage_threshold`.
When `quality_gates:` is absent, `rules.verify.coverage_threshold` remains active
(backward compatibility).

#### Scenario: New policy supersedes legacy field

- GIVEN `quality_gates.tests.coverage.minimum: 80` AND `rules.verify.coverage_threshold: 70`
- WHEN `sdd-verify` evaluates the tests gate
- THEN it uses `80` as the threshold and ignores `70`

#### Scenario: Legacy field active when policy absent

- GIVEN `config.yaml` has `rules.verify.coverage_threshold: 70` AND no `quality_gates:`
- WHEN `sdd-verify` runs
- THEN it uses `70` as the coverage threshold (backward-compatible behavior)

---

## Clarifications

### Session 2026-06-21

- Q: How does sdd-verify obtain the coverage percentage — from the test command's stdout, a separate coverage report command, or a parsed artifact? → A: Via a separate optional `tests.coverage.command` field. Its stdout MUST be the coverage percentage. When absent, the coverage check is skipped with a warning and does NOT fail the gate.
- Q: Should `on_fail` implicitly default to `halt` when `required: true`, or remain `advisory` regardless? → A: `on_fail` defaults to `advisory` for ALL gates regardless of `required`. There is NO implicit `halt` based on `required`. To get blocking behavior, the operator MUST declare `on_fail: halt` explicitly.
