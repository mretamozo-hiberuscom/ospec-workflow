# Delta for agents

## ADDED Requirements

### Requirement: sdd-verify Quality Gate Enforcement

When `quality_gates:` is declared in `config.yaml`, `sdd-verify` MUST read the policy,
evaluate each configured gate per the quality-gates spec, enforce required gates with
the declared `on_fail` mode, and write per-gate audit entries to `verify-report.md`
and `state.yaml`. This evaluation step MUST run after existing test/build verification
steps and before the operative-memory write step defined in Section 14.

When `quality_gates:` is absent from `config.yaml`, `sdd-verify` MUST NOT alter its
baseline verify behavior in any way.

#### Scenario: Quality gates evaluated as part of verify

- GIVEN `quality_gates:` is declared with at least one gate entry
- WHEN `sdd-verify` executes
- THEN it evaluates all declared gates before finalizing the verify outcome
- AND per-gate results are written to `verify-report.md` and `state.yaml.gates.quality-gates`

#### Scenario: Required halt gate fails — envelope reports FAIL outcome

- GIVEN a gate has `required: true, on_fail: halt` and its command exits non-zero
- WHEN `sdd-verify` finalizes and returns its result envelope
- THEN the envelope `status` is `success` (agent work completed)
- AND `verify-report.md` records overall outcome `FAIL` with a BLOCKER finding
- AND `state.yaml.gates.quality-gates.status` is `fail`

#### Scenario: Quality gates policy absent — baseline behavior unchanged

- GIVEN `config.yaml` has no `quality_gates:` key
- WHEN `sdd-verify` executes
- THEN it follows the baseline verify protocol without evaluating any quality gates
- AND no `gates.quality-gates` entry is written to `state.yaml`
