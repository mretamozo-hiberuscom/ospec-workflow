# Workspace Explore Specification

## Purpose

Defines the `workspace-explore` phase: discovery of federated member repos inside a
workspace container, classification of each member by type/layer/brownfield-greenfield/
init-done, and emission of canonical markers, atlas cache, and a human-readable map.
No cross-cutting authoring or baseline orchestration is in scope (C2+).

---

## Requirements

### Requirement: Container Detection

The system MUST detect a workspace container by scanning immediate children at depth 1
only. A child directory MUST be recognized as a member git repo when `.git` is present
as either a directory OR a file (git worktree pointer or submodule). When `.gitmodules`
is present in the container root, it MUST be treated as the authoritative list of
submodule member paths; the filesystem `.git` scan is the secondary source. Entries
from both sources are unioned without duplicates.

A secondary manifest file (e.g., `package.json`, `*.csproj`, `go.mod`) MAY be read
within each member root to infer the technology stack when no stack signal is otherwise
available.

A directory that has its own `.git` at root level is a normal git repo, NOT a
workspace container. Detection MUST NOT recurse beyond depth 1.

#### Scenario: `.git` as directory (normal repo)

- GIVEN a container with `services/auth/.git` present as a directory
- WHEN workspace-explore scans immediate children
- THEN `services/auth` is added to the discovered member list

#### Scenario: `.git` as file (submodule or worktree)

- GIVEN a container with `libs/ui/.git` present as a regular file
- WHEN workspace-explore scans immediate children
- THEN `libs/ui` is detected as a member repo identically to a directory-based `.git`

#### Scenario: `.gitmodules` is authoritative — union with filesystem

- GIVEN a container with `.gitmodules` declaring `libs/shared`
  AND the filesystem scan also finds `services/extra/.git` as a directory
- WHEN workspace-explore runs
- THEN `libs/shared` and `services/extra` are both in the member list with no duplicates

#### Scenario: No member repos found — empty container

- GIVEN a directory with no immediate children containing `.git`
- WHEN workspace-explore runs
- THEN an empty member list is returned with a warning
- AND no markers, atlas cache, or map markdown are written

---

### Requirement: Member Classification

Each discovered member MUST be classified along four dimensions and the results MUST
be recorded in the member's marker via `enroll`:

| Dimension | Values | Derivation |
|-----------|--------|------------|
| `type` | `microservicio`, `microfrontal`, `nuget` | Secondary manifest; SHOULD prompt user when undeterminable |
| `layer` | `dominio`, `common` | Secondary manifest or directory convention; SHOULD prompt user when undeterminable |
| brownfield/greenfield | `brownfield` if non-scaffolding source files exist; otherwise `greenfield` | Filesystem probe |
| `init-done` | `true` if `openspec/config.yaml` exists; `false` otherwise | Filesystem probe |

When `type` or `layer` cannot be determined from the filesystem, the system SHOULD emit
a per-member warning and MAY set the field to `null` pending user clarification.

#### Scenario: Microservice brownfield with init done

- GIVEN a member repo with `package.json` identifying a Node.js service, committed source files, and `openspec/config.yaml`
- WHEN workspace-explore classifies it
- THEN `type: microservicio`, `brownfield: true`, `init-done: true`

#### Scenario: Nuget common greenfield without init

- GIVEN a member repo with a `*.csproj` at root, only scaffolding files, and no `openspec/config.yaml`
- WHEN workspace-explore classifies it
- THEN `type: nuget`, `layer: common`, `brownfield: false`, `init-done: false`

#### Scenario: Type cannot be inferred

- GIVEN a member repo with no secondary manifest and no recognizable stack signal
- WHEN workspace-explore classifies it
- THEN `type` is set to `null` with a per-member warning
- AND the member is still included in all output artifacts

---

### Requirement: Explore Artifacts

`workspace-explore` MUST produce exactly three artifact types per run:

| Artifact | Location | Notes |
|----------|----------|-------|
| Member marker | `{member-dir}/openspec/federation.member.yaml` per member | Written exclusively via `enroll` (see `federation-markers` spec) |
| Atlas cache | `openspec/workspace.yaml` in the container root | Regenerated after all markers are written |
| Map markdown | `openspec/workspace-map.md` in the container root | Human-readable list of members with classification, state, and warnings |

Markers MUST be written via `enroll` only; direct file writes are prohibited. Atlas
cache regeneration MUST occur after all `enroll` calls complete. The map markdown MUST
include every discovered member regardless of whether its enroll succeeded, recording
failures inline as warnings.

#### Scenario: All members succeed — three artifacts emitted

- GIVEN a container with three member repos, each fully classifiable
- WHEN workspace-explore completes
- THEN a marker exists for each member, `openspec/workspace.yaml` is written, and `openspec/workspace-map.md` lists all three with classification and state

#### Scenario: Partial explore — one member enroll fails

- GIVEN three member repos where the `enroll` write for the second member fails
- WHEN workspace-explore runs
- THEN markers for members one and three are written
- AND the second member is recorded as `pending` in `workspace-map.md` with the failure reason
- AND the atlas cache is built from the successfully enrolled markers only

---

## Clarifications

### Session 2026-06-17

- Q: What is the migration policy when `openspec/workspace.yaml` is already tracked in git when the atlas is loaded during workspace-explore? → A: The atlas loader (not workspace-explore itself) detects the git-tracked file via `git ls-files` and emits a warning. workspace-explore does NOT run any git removal operation; migration is manual. workspace-explore continues writing `openspec/workspace.yaml` as a regenerable cache regardless.
- Q: Does `enroll` refresh `updated_at` when workspace-explore calls it with unchanged member data? → A: No. `enroll` is byte-for-byte stable when the incoming data matches the existing marker. workspace-explore's enroll calls follow this rule; no phantom timestamp advances are generated for re-explored members with unchanged classification.
