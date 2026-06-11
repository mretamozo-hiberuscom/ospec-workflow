# sdd-workspace Specification

## Purpose

New capability (full spec — prompt/Markdown layer): a front door to create and inspect
the federation atlas. `sdd-workspace` is an executor phase (agent + skill + command,
mirroring the `sdd-foundation`/`sdd-baseline` trio) that manages
`openspec/workspace.yaml` and surfaces cross-repo state. It does NOT apply changes into
member repos.

## Requirements

### Requirement: Atlas Initialization

`sdd-workspace init` MUST scaffold `openspec/workspace.yaml` for the coordinator repo.
It MUST scan sibling directories for candidate OpenSpec member repos (a directory
containing `openspec/`), propose them as a reviewable member list, and only write the
atlas after explicit user confirmation through the orchestrator's question gate. It MUST
NOT overwrite an existing atlas; on re-run it MUST read and update it.

#### Scenario: Scaffold from siblings

- GIVEN sibling dirs `../api` and `../web` each containing `openspec/`
- WHEN `sdd-workspace init` runs and the user confirms
- THEN `openspec/workspace.yaml` lists `api` and `web` as members

#### Scenario: Existing atlas is updated, not overwritten

- GIVEN an existing `openspec/workspace.yaml` with member `api`
- WHEN `sdd-workspace init` runs and the user adds `web`
- THEN `api` is preserved and `web` is appended

### Requirement: Aggregated Status

`sdd-workspace status` MUST report each member's active changes (via the federated
store's aggregated `findActiveChanges`) tagged by member id, and MUST flag members in
the atlas that are unreachable or contain no OpenSpec root.

#### Scenario: Status lists per-member active changes

- GIVEN members `api` (1 active change) and `web` (0 active changes)
- WHEN `sdd-workspace status` runs
- THEN the report shows `api`'s change and `web` as idle

#### Scenario: Unreachable member flagged

- GIVEN a member whose path no longer exists
- WHEN `sdd-workspace status` runs
- THEN that member is listed as unreachable
- AND the command still completes

### Requirement: Impact Analysis

`sdd-workspace impact <change>` MUST, given a change that touches a provider member,
list the affected members computed from the contract graph (provider plus its
consumers), so a coordinator can scope reviewer load before planning a cross-repo
change.

#### Scenario: Impact lists consumers

- GIVEN contract `api-v1` with `provider: api`, `consumers: [web]`
- WHEN `sdd-workspace impact` is run for a change touching `api`
- THEN the affected set lists `api` and `web`

### Requirement: Read-Only Guarantee

`sdd-workspace` MUST NOT write into any member repository. Its only writes are
`openspec/workspace.yaml` and reports surfaced to the user. This preserves the v1
read-and-link boundary.

#### Scenario: No member mutation

- GIVEN any `sdd-workspace` subcommand
- WHEN it runs
- THEN no file under a member repo is created or modified
