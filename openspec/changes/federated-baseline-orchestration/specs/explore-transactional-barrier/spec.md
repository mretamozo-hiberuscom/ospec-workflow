# Explore Transactional Barrier (S3) Specification

## Purpose

Defines the atomicity and crash-safety requirements for `workspace-explore`'s
writes of `openspec/workspace.yaml` (atlas cache) and `openspec/workspace-map.md`
(human-readable map). Without an atomic barrier, a crash mid-write leaves these
files in a partially-written or corrupt state, causing downstream consumers to
read inconsistent data. The canonical pattern is: write full content to a temp
file, then rename (atomic on POSIX; safe on Windows with a documented fallback).

This spec also defines the canonical temp+rename pattern reused by all C2 write
paths, including `federation-baseline-status.yaml`.

This spec is a hardening item (S3) absorbed into C2 from the C1 advisory set.

---

## Requirements

### Requirement: Atomic Write of workspace.yaml

`workspace-explore` MUST write `openspec/workspace.yaml` using the temp+rename
procedure:

1. Write the complete updated content to a temp file named
   `openspec/workspace.yaml.tmp`.
2. Rename (move) the temp file to `openspec/workspace.yaml`.
3. If the rename fails, the temp file MUST be deleted and an error returned.
   The pre-existing `openspec/workspace.yaml` (if any) MUST remain intact.

On Windows, if the OS rename is non-atomic when the target exists, the
implementation MUST use a try-rename-then-fallback strategy: rename the
existing file to `openspec/workspace.yaml.bak`, rename the temp to the
target, then delete the `.bak`. Any failure in the fallback chain MUST
leave the original file intact and MUST NOT leave the target in a
partially-written state.

#### Scenario: Normal write — temp then rename

- GIVEN `openspec/workspace.yaml` exists with valid content
- WHEN `workspace-explore` writes an updated atlas
- THEN `openspec/workspace.yaml.tmp` is created first with the full new content
- AND the rename atomically replaces `workspace.yaml` with the temp file
- AND at no point is `workspace.yaml` observable in a partially-written state

#### Scenario: Crash after temp write, before rename

- GIVEN the process crashes after writing `workspace.yaml.tmp` but before
  the rename completes
- WHEN `workspace-explore` is re-run
- THEN it detects the stale `workspace.yaml.tmp` and discards or overwrites it
- AND `workspace.yaml` retains the content from before the crash, OR is
  successfully replaced by the re-run's new temp+rename cycle
- AND the re-run MUST NOT error due to the presence of the stale `.tmp` file

#### Scenario: Write failure — original preserved

- GIVEN the temp file write fails (e.g., disk full or permission denied)
- WHEN `workspace-explore` handles the error
- THEN the existing `openspec/workspace.yaml` is NOT modified or deleted
- AND an error is returned to the caller with the failure reason
- AND the stale or incomplete `.tmp` file is removed if possible

#### Scenario: Windows rename fallback — no corruption

- GIVEN a Windows environment where the OS rename fails because the target exists
- WHEN `workspace-explore` applies the fallback strategy (bak → rename → delete bak)
- THEN the target `workspace.yaml` is updated to the new content
- AND if the fallback fails at any step, the original file is preserved
- AND no `.bak` file is left behind on success

---

### Requirement: Atomic Write of workspace-map.md

`workspace-explore` MUST apply the same temp+rename procedure to
`openspec/workspace-map.md`:

1. Write the complete updated content to `openspec/workspace-map.md.tmp`.
2. Rename the temp file to `openspec/workspace-map.md`.
3. On failure, delete the temp file and preserve the existing
   `openspec/workspace-map.md`.

`workspace.yaml` and `workspace-map.md` MUST be written as two independent
atomic operations within the same explore run; they are NOT bundled into a
single two-file transaction. Partial success (one written, one failed) MUST
be reported as a warning. The successfully written file MUST NOT be reverted.

#### Scenario: Both files written atomically — normal run

- GIVEN `workspace-explore` completes member classification
- WHEN it writes output artifacts
- THEN `workspace.yaml` is written via temp+rename
- AND `workspace-map.md` is written via a separate temp+rename
- AND both final files contain fully consistent content

#### Scenario: workspace-map.md write fails after workspace.yaml succeeds

- GIVEN `workspace.yaml` is written successfully via temp+rename
  AND the `workspace-map.md.tmp` write then fails (e.g., disk full)
- WHEN `workspace-explore` handles the failure
- THEN `workspace.yaml` is retained as written and MUST NOT be reverted
- AND the existing `workspace-map.md` is preserved
- AND a warning is emitted describing the partial write outcome

#### Scenario: Stale workspace-map.md.tmp detected at run start

- GIVEN `openspec/workspace-map.md.tmp` exists from a previous crashed run
- WHEN `workspace-explore` begins the write phase
- THEN it overwrites or removes the stale `.tmp` file before writing new content
- AND proceeds with the normal temp+rename flow without error

---

### Requirement: Canonical Temp+Rename Pattern for C2 Write Paths

Any orchestrator component or delegated agent introduced by C2 that writes a
persistent state file MUST apply the same temp+rename pattern. This requirement
canonicalizes the pattern for all C2 artifacts.

Naming convention:
- For `{name}.yaml` → temp file is `{name}.yaml.tmp`
- For `{name}.md` → temp file is `{name}.md.tmp`

Affected C2 write paths that MUST use this pattern:
- `openspec/workspace.yaml` (this spec, S3)
- `openspec/workspace-map.md` (this spec, S3)
- `openspec/changes/{change}/federation-baseline-status.yaml`
  (see `federated-baseline-orchestration` spec)

#### Scenario: federation-baseline-status.yaml written atomically

- GIVEN the orchestrator updating `federation-baseline-status.yaml`
- WHEN it writes the update
- THEN it writes to `federation-baseline-status.yaml.tmp` first
- AND renames to `federation-baseline-status.yaml` atomically
- AND if rename fails, the existing `federation-baseline-status.yaml` is preserved
  and the `.tmp` file is removed

#### Scenario: Pattern reuse verified across paths

- GIVEN any C2 write path (workspace.yaml, workspace-map.md,
  federation-baseline-status.yaml) and a simulated mid-write crash
- WHEN the affected component is re-run after the crash
- THEN it handles the stale `.tmp` file gracefully (overwrite or remove)
- AND the final file is consistent after the re-run

---

### Requirement: Stale Temp File Detection and Cleanup

At the beginning of any write operation, if a `.tmp` file already exists at
the expected temp path (from a prior crashed run), the writer MUST overwrite
it unconditionally. The writer MUST NOT fail or skip the write due to the
presence of a stale `.tmp` file.

Additionally, on Windows, at the beginning of any write OR read operation, if
the target file is ABSENT but a `.bak` orphaned by a crashed rename-fallback
(see the Windows fallback in *Atomic Write of workspace.yaml*) is present, the
implementation MUST restore the `.bak` to the target path before proceeding.
The absence of the target while a recoverable `.bak` is present MUST NOT be
treated as data loss. This recovery clause applies to every C2 write path that
uses the canonical bak-fallback (`workspace.yaml`, `workspace-map.md`,
`federation-baseline-status.yaml`).

#### Scenario: Stale .tmp overwritten unconditionally

- GIVEN `openspec/workspace.yaml.tmp` exists with stale content from a prior run
- WHEN `workspace-explore` begins the write phase for `workspace.yaml`
- THEN it overwrites `workspace.yaml.tmp` with the new content
- AND the rename proceeds normally
- AND no error is raised due to the pre-existing `.tmp`

## Clarifications

### Session 2026-06-18

- Q: ¿Cómo se recupera el estado si un crash de Windows interrumpe el fallback de rename y deja un `.bak` huérfano sin fichero destino? → A: Al inicio de cualquier escritura o lectura, si el destino está ausente pero existe un `.bak` huérfano de un fallback abortado, restaurar `.bak`→destino antes de continuar; la ausencia del destino con un `.bak` recuperable presente NO se trata como pérdida de datos. Aplica a todos los paths bak-fallback de C2 (`workspace.yaml`, `workspace-map.md`, `federation-baseline-status.yaml`). Default seguro que completa la historia crash-safe.
- Q: ¿Aplica race condition por escritores concurrentes en `federation-baseline-status.yaml`? → A: No en v1. El bucle es secuencial (decisión `parallelization: sequential`): el orquestador delega y espera el retorno del agente antes de continuar, por lo que no hay escritores concurrentes sobre el mismo fichero. El read-modify-write atómico (temp+rename) es suficiente; la concurrencia se difiere a la ejecución paralela de v2 (out of scope).
