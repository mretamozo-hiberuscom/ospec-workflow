# sdd-session-hooks Backend Selection Specification

## Purpose

Modified capability (delta — JS runtime): the four stateful hooks
(`session-start`, `pre-compact`, `stop`, `subagent-stop`) MUST construct their
artifact store using the backend declared in `openspec/config.yaml`, instead of always
defaulting to `openspec`. Scope: hook runtime only; additive and fail-open.

## Requirements

### Requirement: Backend Resolution From Config

Before constructing a store, each stateful hook MUST read
`artifact_store.backend` from `openspec/config.yaml` (when present) and pass it as the
store `mode`. When the key is absent, malformed, or the config is missing, the hook
MUST default to `openspec`. An unknown backend value MUST fall back to `openspec` with
a recorded warning rather than throwing.

#### Scenario: Federated backend selected

- GIVEN `openspec/config.yaml` contains `artifact_store:\n  backend: workspace-federated`
- WHEN a hook constructs its store
- THEN the store mode is `workspace-federated`

#### Scenario: Absent key defaults to openspec

- GIVEN a config with no `artifact_store` block
- WHEN a hook constructs its store
- THEN the store mode is `openspec`
- AND existing behavior is unchanged

#### Scenario: Unknown backend falls back safely

- GIVEN `artifact_store.backend: dropbox`
- WHEN a hook constructs its store
- THEN the store mode is `openspec`
- AND a warning is recorded
- AND the hook completes without error

### Requirement: Federated Session Continuity

When the backend is `workspace-federated`, `pre-compact` and `stop` MUST operate on the
aggregated active changes returned by the federated store, selecting the most recently
updated change across all members for the session summary and latest trace. The derived
`.ospec/` write locations MUST remain coordinator-workspace-local.

#### Scenario: Summary spans members

- GIVEN a federated coordinator where member `api` has the newest active change
- WHEN `pre-compact` runs
- THEN the session summary describes that member's change
- AND it is written under the coordinator `.ospec/session/`

### Requirement: Non-Regression For openspec

With `artifact_store.backend` absent or `openspec`, every hook MUST produce byte-for-byte
the same output it produced before backend selection existed.

#### Scenario: openspec output unchanged

- GIVEN a standard single-repo workspace with no `artifact_store` block
- WHEN each hook runs
- THEN its result envelope is identical to the pre-change behavior
