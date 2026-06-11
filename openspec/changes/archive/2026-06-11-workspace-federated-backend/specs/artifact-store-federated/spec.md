# artifact-store-federated Specification

## Purpose

New capability (full spec — JS runtime): implement the `workspace-federated` mode of
`createArtifactStore` so the harness resolves canonical artifacts across declared
member repositories via an atlas, while keeping the `openspec` mode unchanged and
preserving fail-open hook behavior. Scope: `scripts/lib/artifact-store.js` and a new
`scripts/lib/workspace-atlas.js`. Additive; the derived `.ospec/` surface is untouched.

## Requirements

### Requirement: Atlas Resolution

The federated store MUST treat `openspec/workspace.yaml` under the coordinator
workspace as the atlas. `isInitialized()` MUST resolve to `true` only when that file
exists and parses into at least a `members` list. When the atlas is absent,
`isInitialized()` MUST resolve to `false` and MUST NOT throw.

#### Scenario: Atlas present

- GIVEN a coordinator workspace with `openspec/workspace.yaml` declaring one member
- WHEN `isInitialized()` is called on a `workspace-federated` store
- THEN it resolves to `true`

#### Scenario: Atlas absent

- GIVEN a coordinator workspace with no `openspec/workspace.yaml`
- WHEN `isInitialized()` is called
- THEN it resolves to `false`
- AND no error is thrown

### Requirement: Member Resolution

The store MUST resolve each atlas member to an absolute OpenSpec root using the
member `path` (relative to the coordinator workspace, or absolute) joined with
`openspec_root` (default `openspec`). A member whose resolved root does not exist or
contains no `changes/` directory MUST be skipped, and the skip MUST be reported as a
non-fatal warning rather than raised as an error.

#### Scenario: Relative member path resolves

- GIVEN a member with `path: ../services/api` and no `openspec_root`
- WHEN members are resolved from a coordinator at `/work/coordinator`
- THEN the member root is `/work/services/api/openspec`

#### Scenario: Unreachable member is skipped, not fatal

- GIVEN an atlas with members `api` (exists) and `ghost` (path does not exist)
- WHEN `findActiveChanges()` runs
- THEN changes from `api` are returned
- AND `ghost` is omitted with a recorded warning
- AND no error propagates to the caller

### Requirement: Aggregated Active Changes

`findActiveChanges()` MUST return the union of (a) the coordinator's own active
changes and (b) each reachable member's active changes, each entry tagged with a
`source` field equal to the member `id` (coordinator entries tagged `source: "."`).
Each member's active changes MUST be computed with the existing single-repo discovery
(`ospec-state.findActiveChanges`) so member semantics (skip `archive`, skip terminal
statuses, newest-first) are identical to standalone mode.

#### Scenario: Union across members

- GIVEN coordinator change `rollout` and member `api` change `add-endpoint`
- WHEN `findActiveChanges()` runs
- THEN the result contains both, with `add-endpoint` tagged `source: "api"`
- AND `rollout` tagged `source: "."`

#### Scenario: Member terminal states excluded

- GIVEN member `api` has one `active` and one `archived` change
- WHEN `findActiveChanges()` runs
- THEN only the `active` change from `api` appears

### Requirement: Coordinator-Scoped Canonical Writes

In v1 the federated store MUST NOT write into any member repo. `changeDirectory(name)`
MUST resolve to the coordinator path `openspec/changes/{name}`, and `readConfig()` MUST
read the coordinator `openspec/config.yaml`. The derived surface (`cachePath`,
`sessionSummaryPath`, `latestSessionPath`, `runtimeEventPath`, `appendRuntimeEvent`)
MUST remain workspace-local and behave identically to `openspec` mode.

#### Scenario: changeDirectory stays coordinator-local

- GIVEN a federated store at `/work/coordinator`
- WHEN `changeDirectory("rollout")` is called
- THEN it returns `/work/coordinator/openspec/changes/rollout`
- AND never a member path

### Requirement: Atlas Parsing Subset

`workspace-atlas.js` MUST parse a constrained, dependency-free subset: top-level
scalar keys, a `members` list of maps (`id`, `path`, `role`, optional `openspec_root`),
and a `contracts` list of maps (`id`, `provider`, `consumers` list, `surface`). Shapes
outside this subset MUST be ignored with a warning rather than mis-parsed. Parsing MUST
use only `node:*` builtins (no YAML dependency), mirroring `ospec-state.js`.

#### Scenario: Members and contracts parse

- GIVEN an atlas with two members and one contract
- WHEN it is parsed
- THEN both members resolve with their fields
- AND the contract lists its provider and consumers

#### Scenario: Unsupported nested shape is ignored

- GIVEN an atlas member with a deeply nested unsupported block
- WHEN it is parsed
- THEN the supported fields still resolve
- AND the unsupported block is skipped without throwing

### Requirement: Contract Impact Graph

Given a member id, `workspace-atlas.js` MUST compute the set of affected members as the
consumers of every contract whose `provider` is that member. The provider itself MUST
be included in the affected set. The function MUST be pure and side-effect free.

#### Scenario: Provider change flags consumers

- GIVEN contract `api-v1` with `provider: api`, `consumers: [web, mobile]`
- WHEN impact is computed for `api`
- THEN the affected set is `{api, web, mobile}`

#### Scenario: Leaf member affects only itself

- GIVEN `web` is a consumer in no contract's provider position
- WHEN impact is computed for `web`
- THEN the affected set is `{web}`
