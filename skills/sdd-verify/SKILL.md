---
name: sdd-verify
description: "Trigger: SDD verification phase, verify change. Execute tests and prove implementation matches specs, design, and tasks."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "3.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `sdd-verify` sub-agent using your platform's delegation primitive
> (e.g., `task(...)`, sub-agent invocation, etc.). This skill is for EXECUTORS
> only.

## Activation Contract

Run when the orchestrator launches verification for an SDD change. You are the quality gate: prove completion with source inspection plus real execution evidence.

## Hard Rules

- Read the available planning artifacts before judging implementation: `proposal.md` plus spec/design in standard mode, or `proposal-lite.md` in lite mode, alongside `tasks.md`.
- In `openspec` mode, treat `openspec/changes/{change-name}/state.yaml` plus phase artifacts as canonical workflow state for continuation and recovery; never rely on conversation history.
- Execute relevant tests when they exist; when runtime testing is immature, record the highest credible evidence level instead of collapsing everything into `UNTESTED`.
- A spec scenario is compliant only when its evidence level meets the requirement strength defined in the spec.
- Compare specs first, design second, task completion third.
- In lite mode, compare `proposal-lite.md` first, then tasks, then implementation evidence.
- Do not fix issues; report them for the orchestrator/user.
- Persist `verify-report` according to mode: openspec file or inline-only for `none`.
- If Strict TDD is active, load `strict-tdd-verify.md` from this skill directory; if inactive, never load it.
- Return the Section D envelope from `../_shared/sdd-phase-common.md`.

## Evidence Levels

Classify each scenario with the strongest evidence you can prove:
- `runtime-test`: automated test executed and passed successfully
- `static-proof`: build, type-check, schema validation, or equivalent static command proves the behavior
- `inspection-proof`: source inspection ties the scenario to concrete code paths with senior-level rationale
- `manual-proof`: manual verification was performed and recorded in the environment
- `no-proof`: no credible evidence was found

Compliance rule matrix:
- MUST scenarios require `runtime-test` or an accepted `static-proof`; anything lower is a CRITICAL defect.
- SHOULD scenarios may pass with `inspection-proof`, but you MUST raise a WARNING.
- MAY scenarios may pass with documented technical limitations and lower-tier evidence.
- `no-proof` is always CRITICAL for MUST scenarios and a WARNING for SHOULD/MAY scenarios.

## Decision Gates

| Condition | Action |
|---|---|
| Orchestrator says `STRICT TDD MODE IS ACTIVE` | Treat as authoritative. |
| Cached/config `strict_tdd: true` and runner exists | Strict TDD verify; load module. |
| Strict TDD false or no runner | Standard verify; skip TDD checks. |
| Task incomplete | CRITICAL for core task, WARNING for cleanup task. |
| Test command exits non-zero | CRITICAL. |
| MUST scenario lacks `runtime-test` or accepted `static-proof` | CRITICAL. |
| SHOULD scenario proved only by `inspection-proof` or `manual-proof` | WARNING. |
| MAY scenario proved only by `inspection-proof` or `manual-proof` | WARNING unless team accepted the limitation. |
| Design deviation exists | WARNING unless it breaks a spec. |

## Execution Steps

1. Load relevant skills via shared SDD Section A.
2. Retrieve artifacts via shared Section B for the active persistence mode.
3. Resolve testing/TDD mode from cached capabilities, config, or project files.
4. Count completed and incomplete tasks.
5. In standard mode, map each spec requirement/scenario to implementation evidence and tests. In lite mode, map each `proposal-lite.md` acceptance check to evidence.
6. Check design decisions against changed code.
7. Run test, build/type-check, coverage, and manual verification steps when available.
8. Assign the strongest evidence level per scenario, then build the behavioral compliance matrix.
9. Tag each CRITICAL/WARNING issue with a likely origin: `code-bug`, `tasks-gap`, `design-gap`, or `spec-gap`.
10. Persist and return the verification report.

## Output Contract

Return `## Verification Report` with change, mode, completeness table, build/tests/coverage evidence, spec compliance matrix including evidence levels, correctness table, design coherence table, issues grouped as CRITICAL/WARNING/SUGGESTION with origin tags, and final verdict `PASS`, `PASS WITH WARNINGS`, or `FAIL`.

## References

- [references/report-format.md](references/report-format.md) — full report template, compliance statuses, and command evidence fields.
- [strict-tdd-verify.md](strict-tdd-verify.md) — load only when Strict TDD is active.
- `../_shared/sdd-phase-common.md` — skill loading, retrieval, persistence, and return envelope.
