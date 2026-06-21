# Delta for agents

## ADDED Requirements

### Requirement: Phase-Start Operative Memory Read

All SDD phase agents listed in the `project-memory` spec phase-read table SHOULD read the designated `openspec/memory/` files at phase start, before beginning any phase work. This step MUST be performed after the skill-loading step described in Section 5 of the agents spec. Files absent from `openspec/memory/` MUST be silently skipped; absence is not an error.

The memory-read step extends the existing two-step skill-loading pattern to three steps:
1. Load `skills/{phase-name}/SKILL.md`
2. Load `skills/_shared/sdd-phase-common.md`
3. Read designated `openspec/memory/` files (per the `project-memory` spec phase-read table)

#### Scenario: Memory read performed before phase work

- GIVEN `openspec/memory/decisions.md` exists and `sdd-design` is dispatched
- WHEN sdd-design starts execution after loading its skills
- THEN it reads `decisions.md` and `conventions.md` before producing any design output
- AND the memory content informs the design without re-deriving established decisions

#### Scenario: Memory absent — phase proceeds without error

- GIVEN `openspec/memory/` does not exist
- WHEN any phase agent reaches the memory-read step
- THEN it skips all memory reads silently
- AND executes phase work as in the pre-memory baseline

---

### Requirement: sdd-archive Operative Memory Write

After a successful archive, `sdd-archive` MUST execute the decisions-write contract defined in the `project-memory` spec: inspect `open_decisions` in `state.yaml` and prepend all entries with `status: resolved` to `openspec/memory/decisions.md`. This write occurs after the standard archive artifacts are persisted and the `state.yaml` is updated.

`openspec/memory/decisions.md` MUST be listed in the archive phase `artifacts` when at least one entry is written. When no resolved decisions exist, the write is skipped and `artifacts` is unchanged.

#### Scenario: Resolved decisions written as archive artifact

- GIVEN `state.yaml.open_decisions` contains entries with `status: resolved`
- WHEN sdd-archive completes all standard archive steps
- THEN it prepends the resolved entries to `openspec/memory/decisions.md`
- AND `openspec/memory/decisions.md` appears in the returned `artifacts` list

#### Scenario: No resolved decisions — archive unaffected

- GIVEN `state.yaml.open_decisions` is empty or contains only open entries
- WHEN sdd-archive completes
- THEN no write to `openspec/memory/decisions.md` occurs
- AND the archive phase `status` remains `success`

---

### Requirement: sdd-verify Operative Memory Write

After producing its verify report, `sdd-verify` MUST execute the known-issues-write contract defined in the `project-memory` spec: prepend all findings with severity `WARNING` or `BLOCKER` to `openspec/memory/known-issues.md`. The official sdd-verify severity taxonomy is `INFO < WARNING < BLOCKER` (ascending); only `WARNING` and `BLOCKER` qualify for write. This write occurs after the verify report is finalized. Findings at `INFO` severity MUST NOT be written.

`openspec/memory/known-issues.md` MUST be listed in the verify phase `artifacts` when at least one entry is written. A clean verify (no qualifying findings) MUST NOT trigger a write.

#### Scenario: WARNING findings written as verify artifact

- GIVEN sdd-verify produces findings with severity `WARNING` or `BLOCKER`
- WHEN the verify report is finalized
- THEN each qualifying finding is prepended to `openspec/memory/known-issues.md`
- AND `openspec/memory/known-issues.md` appears in the returned `artifacts` list

#### Scenario: Clean verify — known-issues unchanged

- GIVEN sdd-verify produces no findings at WARNING or above
- WHEN the verify phase completes
- THEN no write to `openspec/memory/known-issues.md` occurs
- AND `status` is `success` with no memory-file entry in `artifacts`

---

## Cross-References

- `project-memory` spec: canonical file-format contract, ownership table, entry structure, graceful-absence rules
- `skills/_shared/sdd-phase-common.md`: shared executor protocol; the memory-read step is inserted after skill loading
- `openspec/specs/agents/spec.md` Section 5: existing two-step skill-loading pattern extended here to three steps

## Clarifications

### Session 2026-06-20

- Q: What is the official sdd-verify severity taxonomy and which levels are written to `known-issues.md`? → A: INFO < WARNING < BLOCKER. The official sdd-verify severity enum is {INFO, WARNING, BLOCKER} in that order. INFO is NEVER written to `known-issues.md`; only WARNING and BLOCKER are promoted. The sdd-verify contract uses the "WARNING-or-above is written" threshold.
