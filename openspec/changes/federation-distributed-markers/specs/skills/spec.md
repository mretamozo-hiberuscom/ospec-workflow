# Delta for skills

## ADDED Requirements

### Requirement: sdd-init Multirepo Detection Gate

The `sdd-init` skill MUST detect when the target directory (resolved from `target_dir`
or cwd) is a workspace container: a directory that has no `.git` of its own AND has
two or more immediate children each containing `.git` (directory or file). On
detecting a container, the skill MUST return `status: blocked` with a `question_gate`
offering exactly two options: (a) proceed as a federated workspace init, or (b)
proceed as a normal single-repo init. The skill MUST NOT auto-select the federated
path without user confirmation (D2).

This check MUST run before any artifact write; if the gate is triggered, no files are
created.

#### Scenario: Container detected — blocked with federated-vs-normal gate

- GIVEN `sdd-init` targets a directory with no `.git` of its own and two or more children with `.git`
- WHEN the skill runs its detection step
- THEN it returns `status: blocked` with a `question_gate` listing `federated` and `normal` options
- AND no artifacts are written before the user responds

#### Scenario: Single-repo directory — gate not triggered

- GIVEN `sdd-init` targets a directory that has its own `.git`
- WHEN the skill runs its detection step
- THEN detection MUST NOT trigger the multirepo gate
- AND normal init flow continues

#### Scenario: Container with fewer than two child repos — gate not triggered

- GIVEN a directory with no `.git` of its own but only one immediate child with `.git`
- WHEN `sdd-init` runs detection
- THEN the multirepo gate MUST NOT fire (threshold is ≥2 children)
- AND the skill proceeds as a normal single-repo init for that child

---

### Requirement: sdd-workspace `enroll` Operation

The `sdd-workspace` skill MUST support an `enroll` operation. When invoked with
`operation: enroll` and valid member data, the skill MUST write
`openspec/federation.member.yaml` in the specified member directory. `enroll` is the
ONLY write operation `sdd-workspace` is permitted to perform on member repos; all
other member-repo interactions MUST remain read-only (D7). The `enroll` operation MUST
be idempotent and MUST be accessible only when the caller is the orchestrator.

#### Scenario: Enroll invoked — marker written, success returned

- GIVEN the orchestrator calls `sdd-workspace` with `operation: enroll` and valid member data
- WHEN the skill executes the operation
- THEN `openspec/federation.member.yaml` is written in the member directory
- AND the skill returns `status: success` with the artifact path in `artifacts`

#### Scenario: Enroll called twice with same data — idempotent, no timestamp refresh

- GIVEN `openspec/federation.member.yaml` already exists in the member directory
  with content that is byte-for-byte identical to the supplied data
- WHEN `sdd-workspace enroll` is called again with the same data
- THEN the skill returns `status: success` with no error
- AND the file is NOT rewritten
- AND `updated_at` MUST NOT be refreshed (byte-for-byte stable marker)

---

## Clarifications

### Session 2026-06-17

- Q: Does `enroll` refresh `updated_at` when called with identical data? → A: No. When the incoming data is byte-for-byte identical to the existing marker, `sdd-workspace enroll` MUST NOT rewrite the file and MUST NOT refresh `updated_at`. The timestamp is refreshed ONLY when content changes, preventing phantom timestamp advances in the merge.
