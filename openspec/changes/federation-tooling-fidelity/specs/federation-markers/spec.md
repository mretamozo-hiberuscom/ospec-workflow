# Delta for federation-markers

## MODIFIED Requirements

### Requirement: Atlas Merge Semantics

When merging markers from multiple member repos, the system MUST apply union +
latest-wins semantics: all member entries are included (union), and when the same
`member.id` appears in more than one marker, the entry with the latest `updated_at`
wins. When `updated_at` values are equal, the system MUST apply a deterministic
tiebreak: lexicographic ascending order by the SOURCE marker's `member.id` (the
`member.id` field of the marker file that contains the conflicting roster entry).
The entry from the lexicographically greater source `member.id` wins (e.g.,
`svc-web` wins over `svc-api`). This algorithm is stateless and OS-independent.
Merge MUST be fail-open: a marker that fails to parse MUST emit a warning and be
skipped without aborting the merge.

When a member entry is selected as winner, its `member.provides` array is adopted
wholesale from that winning marker. Individual `provides` objects MUST NOT be merged
or reconciled across different source markers; the provider is the sole authority
over its own contract declarations. This preserves union + latest-wins + tiebreak
coherence without requiring per-contract merge logic.

When constructing the derived contract for each `provides[]` entry, the following
fields are handled positionally (reserved): `id`, `provider` (synthesized from the
winning member's `member.id`), and `consumers`. Every additional field present in
the `provides[]` entry — including `surface` and any future non-reserved field —
MUST be copied verbatim into the derived contract object. `serializeAtlas` already
emits extra keys from the contract object via its generic loop; `mergeMarkersIntoAtlas`
MUST populate those keys from the source entry. The merge→serialize round-trip MUST
be idempotent: regenerating the atlas from the same markers MUST reproduce the same
`openspec/workspace.yaml` content, including all `surface` values.

(Previously: `mergeMarkersIntoAtlas` built each contract with only `{id, provider, consumers}`; `surface` was silently dropped and did not survive atlas regeneration.)

#### Scenario: Latest-wins on conflicting entries

- GIVEN two markers both containing a roster entry for `svc-auth` with different `updated_at`
- WHEN the system merges them
- THEN the entry with the later `updated_at` is kept; the older entry is discarded

#### Scenario: Equal `updated_at` — lexicographic tiebreak by source `member.id`

- GIVEN two member markers where marker A has `member.id: svc-api` and marker B has `member.id: svc-web`, and both contain a roster entry for the same member (`id: svc-gateway`) with an identical `updated_at` value
- WHEN the system merges the two markers
- THEN the roster entry sourced from marker B (`member.id: svc-web`) is kept, because `svc-web` is lexicographically greater than `svc-api`
- AND the roster entry sourced from marker A (`member.id: svc-api`) is discarded
- AND a warning is emitted identifying the tie and the winning source
- AND re-running the merge with the same inputs produces the identical outcome

#### Scenario: Malformed marker skipped fail-open

- GIVEN three member markers where one is syntactically invalid YAML
- WHEN the system runs atlas merge
- THEN the invalid marker is skipped with a warning
- AND the atlas is built from the two valid markers
- AND the merge MUST NOT throw or abort

#### Scenario: surface preserved through merge into contract

- GIVEN a winning marker for `svc-payments` containing `provides: [{id: payments-api, consumers: [svc-checkout], surface: openapi}]`
- WHEN `mergeMarkersIntoAtlas` builds the derived contract
- THEN the contract entry for `payments-api` MUST include `surface: openapi`
- AND `serializeAtlas` MUST emit the `surface` key when writing `openspec/workspace.yaml`

#### Scenario: Merge to serialize round-trip is idempotent

- GIVEN a set of member markers with at least one `provides[]` entry carrying a `surface` field
- WHEN the atlas is merged and serialized to produce `openspec/workspace.yaml`, then merged and serialized again from the same markers
- THEN the second `openspec/workspace.yaml` MUST be byte-for-byte identical to the first
- AND `surface` MUST be present and unchanged in both outputs

#### Scenario: provides entry without surface serializes correctly

- GIVEN a winning marker where a `provides[]` entry has no `surface` field
- WHEN `mergeMarkersIntoAtlas` builds the derived contract and `serializeAtlas` serializes it
- THEN the contract entry MUST NOT contain a `surface` key
- AND no error MUST be raised
- AND the reserved fields (`id`, `provider`, `consumers`) MUST be serialized correctly
