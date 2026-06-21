# Delta for routing

## ADDED Requirements

### Requirement: Quality Gate Audit Block in state.yaml

When `sdd-verify` evaluates a `quality_gates:` policy, it MUST write a
`quality-gates` entry under `state.yaml.gates` immediately after evaluation
completes and before the phase returns. The entry shape is:

```yaml
gates:
  quality-gates:
    status: pass | fail | skipped
    evaluated_at: <ISO 8601 UTC timestamp>
    override:                              # present only when user forced archive with written justification
      timestamp: <ISO 8601 UTC timestamp>
      justification: "<verbatim user text>"
    gates:
      tests:
        status: pass | fail | skipped
        required: true
        on_fail: halt
        detail: "coverage 72% < minimum 80%"   # present only when informative
      lint:
        status: fail
        required: true
        on_fail: halt
      architecture:
        status: skipped
        required: false
        on_fail: advisory
        detail: "command not configured"
      security:
        status: pass
        required: false
        on_fail: advisory
```

Top-level `gates.quality-gates.status` aggregation rules:

| Condition | Top-level status |
|-----------|----------------|
| Any gate with `required: true, on_fail: halt` has status `fail` | `fail` |
| No halt-required failure; at least one gate `pass` or `skipped` | `pass` |
| All gates skipped (no commands) OR policy was absent | `skipped` |

When `quality_gates:` is absent, the `gates.quality-gates` key MUST NOT be written.

#### Scenario: Policy evaluated — audit block written with correct top-level status

- GIVEN `quality_gates:` declares `lint` with `required: true, on_fail: halt`
  AND the lint command fails
- WHEN `sdd-verify` completes evaluation
- THEN `state.yaml.gates.quality-gates.status` is `fail`
- AND `state.yaml.gates.quality-gates.gates.lint.status` is `fail`

#### Scenario: All gates pass — top-level status is pass

- GIVEN all configured gates pass their commands
- WHEN `sdd-verify` writes the audit block
- THEN `state.yaml.gates.quality-gates.status` is `pass`

#### Scenario: All commands absent — top-level status is skipped

- GIVEN `quality_gates:` declares gates but none have a `command` set
- WHEN `sdd-verify` evaluates the policy
- THEN `state.yaml.gates.quality-gates.status` is `skipped`

#### Scenario: Policy absent — no audit block written

- GIVEN `config.yaml` has no `quality_gates:` key
- WHEN `sdd-verify` completes
- THEN `state.yaml` contains no `gates.quality-gates` entry

---

### Requirement: Archive Dispatch Block on Failed Halt Gate

Before dispatching `sdd-archive`, the orchestrator MUST read
`state.yaml.gates.quality-gates.status`. If the value is `fail`, the orchestrator
MUST NOT dispatch `sdd-archive` and MUST surface the blocking gate(s) to the user
via the standard question gate before offering remediation options (fix and re-run
verify, or explicit override with written justification).

When the user provides a written justification to force archive despite a failed halt gate,
the orchestrator MUST:

1. Record the override in `state.yaml` under `gates.quality-gates.override` with:
   - `timestamp`: UTC ISO 8601 timestamp of the override decision.
   - `justification`: verbatim text provided by the user.
2. Append an Override section to `verify-report.md` containing the same `timestamp` and
   `justification` text.
3. Only after BOTH audit entries are persisted MUST the orchestrator dispatch `sdd-archive`.

If the key is absent, `pass`, or `skipped`, the orchestrator MUST proceed with archive
dispatch normally.

#### Scenario: Failed halt gate blocks archive

- GIVEN `state.yaml.gates.quality-gates.status: fail`
- WHEN the orchestrator reaches the sdd-archive dispatch point
- THEN it MUST NOT dispatch `sdd-archive`
- AND MUST surface the blocking gate detail to the user via `vscode/askQuestions`
- AND MUST offer remediation options: fix and re-run verify, or override with written justification

#### Scenario: User overrides blocked archive with written justification

- GIVEN `state.yaml.gates.quality-gates.status: fail`
- AND the user provides a written justification to force archive
- WHEN the orchestrator records the override
- THEN it writes `gates.quality-gates.override.timestamp` (UTC ISO 8601) and `gates.quality-gates.override.justification` (verbatim) to `state.yaml`
- AND appends an Override section with the same timestamp and justification to `verify-report.md`
- AND dispatches `sdd-archive` only after both audit entries are persisted

#### Scenario: Passing quality gates do not block archive

- GIVEN `state.yaml.gates.quality-gates.status: pass`
- WHEN the orchestrator reaches the sdd-archive dispatch point
- THEN archive dispatch proceeds normally

#### Scenario: Quality gates absent — archive dispatch unchanged

- GIVEN `state.yaml` has no `gates.quality-gates` key
- WHEN the orchestrator reaches the sdd-archive dispatch point
- THEN it proceeds with archive dispatch as in the pre-quality-gates baseline

---

## Clarifications

### Session 2026-06-21

- Q: When a gate with `on_fail: halt` fails and blocks archive, can the user force the archive anyway — and if so, with what audit trail? → A: Yes. The user MAY force archive by providing a written justification. The justification MUST be recorded in `state.yaml` under `gates.quality-gates.override` (with UTC timestamp and verbatim text) AND in an Override section of `verify-report.md`. Archive is dispatched only after both audit entries are written (full-traceability override).
