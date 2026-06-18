# Federation Markers Specification

## Purpose

Defines the distributed canonical marker contract (`openspec/federation.member.yaml`),
the atlas-as-derived-cache inversion, merge semantics, the `enroll` write operation,
derived member state, and the resumable bootstrap lot model. This is the mechanism
layer for the federated workspace; cross-cutting change authoring is out of scope (C2+).

---

## Requirements

### Requirement: Marker Schema

Every federated member repo MUST contain `openspec/federation.member.yaml` as the
canonical, version-controlled source of truth for that member's federation identity.
The system MUST enforce the following schema:

| Field | Type | Constraint |
|-------|------|------------|
| `federation.id` | string | MUST be unique across the roster |
| `member.id` | string | MUST identify this repo within the federation |
| `member.role` | string | MUST be one of `{primary, secondary}` |
| `member.type` | string | MUST be one of `{microservicio, microfrontal, nuget}` |
| `member.layer` | string | MUST be one of `{dominio, common}` |
| `member.remote` | string | SHOULD be present; MAY be absent for local-only members |
| `member.provides` | object[] | Contract descriptors this member exposes; MAY be empty |
| `member.provides[].id` | string | MUST — unique contract identifier within this member |
| `member.provides[].consumers` | string[] | `member.id` values that consume this contract; MAY be empty |
| `member.provides[].surface` | string | Where the contract truth lives (e.g., `openapi`); MAY be absent |
| `roster` | object[] | Each entry MUST include `{id, remote}` |
| `updated_at` | ISO 8601 string | MUST be present; used as the merge timestamp |

Example `member.provides` entry — the provider declares its own consumers:

```yaml
member:
  id: svc-payments
  provides:
    - id: payments-api
      consumers: [svc-checkout, svc-reporting]
      surface: openapi
    - id: payments-events
      consumers: []          # no known consumers yet; provider-only impact
```

A member repo MUST NOT write to another member's `openspec/federation.member.yaml`.

#### Scenario: Valid marker loaded into atlas

- GIVEN a member repo containing `openspec/federation.member.yaml` with all required fields
- WHEN the system reads the marker
- THEN it parses without error and the member is included in the derived atlas

#### Scenario: Member without `remote` field — fail-open warning

- GIVEN a marker where `member.remote` is absent
- WHEN the system reads it during atlas reconstruction
- THEN the member is included in the atlas
- AND a warning is emitted stating the member is not remotely reconstructible
- AND atlas reconstruction MUST NOT abort

---

### Requirement: Atlas as Derived Cache

`openspec/workspace.yaml` MUST be treated as a derived, regenerable cache. It MUST be
listed in `.gitignore` and MUST NOT be committed as a canonical artifact. The
`openspec/federation.member.yaml` files in individual member repos are the sole source
of truth. Any code path that loads the atlas MUST handle a missing or corrupt
`workspace.yaml` by regenerating from member markers.

When loading the atlas, the system MUST check whether `openspec/workspace.yaml`
is currently tracked by git (using `git ls-files openspec/workspace.yaml` or
equivalent). If the file is git-tracked, the system MUST emit a warning
instructing the user to manually untrack it
(`git rm --cached openspec/workspace.yaml`). C1 MUST NOT execute
`git rm --cached` or any other destructive git operation automatically;
migration is always manual.

#### Scenario: Atlas absent at load time

- GIVEN `openspec/workspace.yaml` does not exist
- WHEN the system requests atlas data
- THEN it regenerates the atlas by reading all available member markers
- AND writes the result to `openspec/workspace.yaml`

#### Scenario: Atlas corrupt at load time

- GIVEN `openspec/workspace.yaml` exists but fails to parse as valid YAML
- WHEN the system attempts to load it
- THEN it falls back to full regeneration from member markers
- AND emits a warning about the corrupt cache before proceeding

#### Scenario: Atlas is gitignored

- GIVEN `.gitignore` includes `openspec/workspace.yaml`
- WHEN atlas regeneration writes `openspec/workspace.yaml`
- THEN `git status` MUST NOT show the file as a tracked or staged change

#### Scenario: workspace.yaml is git-tracked — warn-on-detect

- GIVEN `openspec/workspace.yaml` exists and `git ls-files openspec/workspace.yaml`
  returns a non-empty result (the file is tracked in git)
- WHEN the system loads the atlas
- THEN a warning is emitted informing the user that `workspace.yaml` is
  git-tracked and instructing them to run
  `git rm --cached openspec/workspace.yaml` manually
- AND atlas loading MUST continue normally after emitting the warning
- AND C1 MUST NOT execute any git removal or modification automatically

---

### Requirement: Atlas Merge Semantics

When merging markers from multiple member repos, the system MUST apply union +
latest-wins semantics: all member entries are included (union), and when the same
`member.id` appears in more than one marker, the entry with the latest `updated_at`
wins. When `updated_at` values are equal, the system MUST apply a deterministic
tiebreak: lexicographic ascending order by the SOURCE marker's `member.id` (the
`member.id` field of the marker file that contains the conflicting roster entry).
The entry from the lexicographically greater source `member.id` wins (e.g.,
`svc-web` wins over `svc-api`). This algorithm is stateless and OS-independent.
Merge MUST be fail-open: a marker that
fails to parse MUST emit a warning and be skipped without aborting the merge.

When a member entry is selected as winner, its `member.provides` array is adopted
wholesale from that winning marker. Individual `provides` objects MUST NOT be merged
or reconciled across different source markers; the provider is the sole authority
over its own contract declarations. This preserves union + latest-wins + tiebreak
coherence without requiring per-contract merge logic.

#### Scenario: Latest-wins on conflicting entries

- GIVEN two markers both containing a roster entry for `svc-auth` with different `updated_at`
- WHEN the system merges them
- THEN the entry with the later `updated_at` is kept; the older entry is discarded

#### Scenario: Equal `updated_at` — lexicographic tiebreak by source `member.id`

- GIVEN two member markers where marker A has `member.id: svc-api` and marker B
  has `member.id: svc-web`, and both contain a roster entry for the same member
  (`id: svc-gateway`) with an identical `updated_at` value
- WHEN the system merges the two markers
- THEN the roster entry sourced from marker B (`member.id: svc-web`) is kept,
  because `svc-web` is lexicographically greater than `svc-api`
- AND the roster entry sourced from marker A (`member.id: svc-api`) is discarded
- AND a warning is emitted identifying the tie and the winning source
- AND re-running the merge with the same inputs produces the identical outcome

#### Scenario: Malformed marker skipped fail-open

- GIVEN three member markers where one is syntactically invalid YAML
- WHEN the system runs atlas merge
- THEN the invalid marker is skipped with a warning
- AND the atlas is built from the two valid markers
- AND the merge MUST NOT throw or abort

---

### Requirement: Enroll Operation

`enroll` is the ONLY sanctioned write into a member repo. It MUST write
`openspec/federation.member.yaml` in the target member directory. Only the
orchestrator MAY invoke `enroll`; individual phase skills MUST NOT write member
markers directly. `enroll` MUST be idempotent: calling it twice with the same data MUST NOT
produce an error. When the incoming data is byte-for-byte identical to the
existing marker, `enroll` MUST NOT rewrite the file and MUST NOT refresh
`updated_at`. `updated_at` is refreshed ONLY when the content changes. This
prevents phantom timestamp advances that would falsely trigger latest-wins
in the merge.

#### Scenario: Enroll writes marker on first call

- GIVEN a member directory with no existing `openspec/federation.member.yaml`
- WHEN `enroll` is called with valid member data
- THEN `openspec/federation.member.yaml` is created with the supplied data
- AND `updated_at` is set to the current UTC timestamp

#### Scenario: Enroll is idempotent — no timestamp refresh on identical data

- GIVEN a member directory with an existing `openspec/federation.member.yaml`
  whose content is byte-for-byte identical to the supplied data
- WHEN `enroll` is called again with the same data
- THEN no error is raised
- AND the file is NOT rewritten
- AND `updated_at` MUST NOT be refreshed (byte-for-byte stable marker)

#### Scenario: Enroll updates an existing marker

- GIVEN a member marker where `member.role` differs from the incoming value
- WHEN `enroll` is called with the updated data
- THEN the marker is overwritten with the new data and `updated_at` is refreshed

---

### Requirement: Derived Member State

The system MUST derive member state from the filesystem without storing it in the
marker itself:

| State | Condition |
|-------|-----------|
| `initialized` | Member directory contains `openspec/config.yaml` |
| `pending` | Member has `openspec/federation.member.yaml` but no `openspec/config.yaml` |

Brownfield/greenfield classification is derived by the `workspace-explore` phase (see
`workspace-explore` spec) and is NOT stored in the marker.

#### Scenario: Member state is `initialized`

- GIVEN a member directory with both `openspec/federation.member.yaml` and `openspec/config.yaml`
- WHEN the system computes derived state
- THEN state is `initialized`

#### Scenario: Member state is `pending`

- GIVEN a member directory with `openspec/federation.member.yaml` but no `openspec/config.yaml`
- WHEN the system computes derived state
- THEN state is `pending`

---

### Requirement: Impact Set from Provides Consumers

The system MUST be able to reconstruct the full impact set of a provider member
solely from the `provides[].consumers` fields declared in markers — without
re-enrolling or re-querying member repos.

The impact set of a provider is defined as: `{provider.member.id} ∪ ⋃ provides[i].consumers`
across all entries in its `member.provides` array. When `consumers` is empty for
every `provides` entry, the impact set MUST contain only the provider itself. The
system MUST NOT error or abort if `consumers` is absent or empty.

#### Scenario: Impact set includes declared consumers

- GIVEN a marker for `svc-payments` with `provides: [{id: payments-api, consumers: [svc-checkout, svc-reporting]}]`
- WHEN the system computes the impact set of `svc-payments`
- THEN the impact set is `{svc-payments, svc-checkout, svc-reporting}`

#### Scenario: Impact set edge — consumers empty (provider only)

- GIVEN a marker for `svc-payments` with `provides: [{id: payments-events, consumers: []}]`
- WHEN the system computes the impact set of `svc-payments`
- THEN the impact set is `{svc-payments}` (only the provider)
- AND the system MUST NOT error or return an empty set

---

### Requirement: Resumable Bootstrap Lot

Bootstrap of multiple members MUST be tracked as a resumable lot. Each member in the
lot MUST carry one of two states: `done` or `pending`. A member that fails during
bootstrap MUST be marked `pending` without aborting remaining members. Re-running
bootstrap MUST skip `done` members and retry only `pending` ones. Lot state MUST be
persisted so bootstrap can resume after an interruption.

#### Scenario: Partial bootstrap — one member fails

- GIVEN a bootstrap lot of three members where the second fails during `enroll`
- WHEN bootstrap runs
- THEN the first member is marked `done`, the second `pending`, and the third continues
- AND each member's outcome is recorded independently

#### Scenario: Bootstrap resumes from persisted lot

- GIVEN a lot where member A is `done` and member B is `pending`
- WHEN bootstrap is re-run
- THEN member A is skipped
- AND member B is retried from the beginning of its enroll flow

---

## Clarifications

### Session 2026-06-17

- Q: When two markers share the same `updated_at` for the same `member.id`, which tiebreak algorithm determines the winner? → A: Lexicographic ascending by SOURCE marker's `member.id`; the lexicographically greater id wins (e.g., `svc-web` > `svc-api`). Deterministic, stateless, OS-independent.
- Q: What is the migration policy when `openspec/workspace.yaml` is already tracked in git when C1 loads the atlas? → A: warn-on-detect: the system calls `git ls-files openspec/workspace.yaml`; if tracked, emits a warning instructing the user to run `git rm --cached openspec/workspace.yaml` manually. C1 MUST NOT execute any destructive git operation automatically.
- Q: Does `enroll` refresh `updated_at` when called with identical data? → A: No. When the incoming data is byte-for-byte identical to the existing marker, `enroll` MUST NOT rewrite the file and MUST NOT refresh `updated_at`. The timestamp is refreshed ONLY when content changes, preventing phantom timestamp advances in the merge.
- Extension 2026-06-17 — `member.provides` promoted from `string[]` to `object[]`: each entry now carries `id` (MUST), `consumers` (array of `member.id` that consume this contract; MAY be empty), and `surface` (free label for where the contract truth lives, e.g. `openapi`; MAY be absent). Rationale: enables the impact graph (provider → consumers) to be reconstructed purely from markers without re-enrolling members. The PROVIDER declares its own consumers. Merge semantics are unaffected: `provides` is adopted wholesale from the winning member entry; per-contract merge is NOT performed.
