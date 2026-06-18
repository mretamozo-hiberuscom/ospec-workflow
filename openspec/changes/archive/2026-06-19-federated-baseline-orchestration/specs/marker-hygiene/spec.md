# Marker Hygiene (S1) Specification

## Purpose

Defines normative requirements for tagging markers written by the
`workspace-explore` phase and for suppressing the fail-open "no remote"
warnings those markers trigger in the atlas loader. Explore-origin markers
are structurally valid but intentionally incomplete (they lack `member.remote`
and full `roster` data). Without a sentinel tag, downstream consumers emit
noisy "not remotely reconstructible" warnings that are only meaningful for
fully curated production-level markers.

This spec is a hardening item (S1) absorbed into C2 from the C1 advisory set.

---

## Requirements

### Requirement: Explore-Origin Marker Tag

When `workspace-explore` calls `enroll` to write or update a member marker,
the written marker MUST include the following field at the top level:

```yaml
origin: explore
```

This field is a sentinel that downstream consumers use to distinguish
explore-origin markers from markers written by higher-precedence paths
(`sdd-init`, manual curation).

Origin precedence order (lowest to highest):

```
explore < init < manual
```

When `enroll` is called by `workspace-explore` and the target member's marker
already has an `origin` value of higher precedence (`init` or `manual`), the
`origin` field MUST NOT be downgraded. `enroll` MUST preserve the existing
higher-precedence value and MUST NOT refresh `updated_at` for the `origin`
field alone (byte-stable rule from C1 `enroll` idempotency).

When `enroll` is called by `sdd-init` or a manual path and the target marker
has `origin: explore`, the `origin` field MUST be upgraded to `init` or
`manual` respectively.

#### Scenario: Explore enroll sets `origin: explore` on new marker

- GIVEN a member directory with no existing marker
- WHEN `workspace-explore` calls `enroll` for that member
- THEN the written marker contains `origin: explore` at the top level

#### Scenario: Explore enroll does not downgrade `origin: init`

- GIVEN a member marker with `origin: init` already present
- WHEN `workspace-explore` calls `enroll` for that member with unchanged data
- THEN the marker's `origin` field remains `init`
- AND `updated_at` is NOT refreshed (enroll byte-stable rule — no content change)

#### Scenario: Explore enroll does not downgrade `origin: manual`

- GIVEN a member marker with `origin: manual`
- WHEN `workspace-explore` calls `enroll` for that member
- THEN the marker's `origin` field remains `manual`
- AND `updated_at` is NOT refreshed

#### Scenario: sdd-init enroll upgrades `origin: explore` to `origin: init`

- GIVEN a member marker with `origin: explore` written by a prior explore run
- WHEN `sdd-init` calls `enroll` with updated member data
- THEN the marker's `origin` field is set to `init`
- AND `updated_at` is refreshed (content changed)

---

### Requirement: Suppression of Fail-Open "No Remote" Member Warning

When the atlas loader reconstructs the atlas from member markers and encounters
a marker with `origin: explore`, it MUST suppress the "member is not remotely
reconstructible" warning for that member (even when `member.remote` is absent).

This warning MUST still be emitted for:
- Markers with `origin: init`
- Markers with `origin: manual`
- Markers with no `origin` field (legacy markers; preserve existing behavior)

Suppression applies to the warning emission ONLY. Explore-origin members MUST
still be included in the atlas regardless of whether `member.remote` is present.

#### Scenario: Explore-origin marker — "no remote" warning suppressed

- GIVEN a marker with `origin: explore` and `member.remote` absent
- WHEN the atlas loader reads this marker
- THEN the member is included in the atlas
- AND the "not remotely reconstructible" warning is NOT emitted for this member

#### Scenario: Init-origin marker — "no remote" warning emitted

- GIVEN a marker with `origin: init` and `member.remote` absent
- WHEN the atlas loader reads this marker
- THEN the member is included in the atlas
- AND the "not remotely reconstructible" warning IS emitted for this member

#### Scenario: Legacy marker (origin absent) — "no remote" warning emitted

- GIVEN a marker with no `origin` field and `member.remote` absent
- WHEN the atlas loader reads this marker
- THEN the "not remotely reconstructible" warning IS emitted (legacy behavior
  preserved)

#### Scenario: Explore-origin member always included in atlas

- GIVEN three markers: two with `origin: explore` (both missing `member.remote`)
  and one with `origin: init` (also missing `member.remote`)
- WHEN the atlas is built
- THEN all three members appear in the atlas
- AND the "no remote" warning is emitted only for the `origin: init` marker

---

### Requirement: Suppression of Roster "No Remote" Warning for Explore-Origin Sources

Atlas merge emits a "roster entry has no remote" warning for roster entries that
lack a `remote` field. When a roster entry is sourced from a marker with
`origin: explore`, this warning MUST be suppressed. The suppression decision MUST
be based on the source marker's `origin` field, not on the entry itself.

#### Scenario: Roster "no remote" suppressed for explore-origin source

- GIVEN an atlas merge where a roster entry comes from a marker with `origin: explore`
  AND that roster entry has no `remote` field
- WHEN the atlas is built
- THEN no "roster entry has no remote" warning is emitted for that entry
- AND the roster entry is included in the atlas normally

#### Scenario: Roster "no remote" preserved for init-origin source

- GIVEN a roster entry sourced from a marker with `origin: init` and no `remote`
- WHEN the atlas is built
- THEN the "roster entry has no remote" warning IS emitted for that entry

---

### Requirement: origin Field Is Non-Breaking for C1 Consumers

The addition of `origin` to marker YAML MUST be backward-compatible. Any C1
consumer that does not recognize the `origin` field MUST continue to function
normally; the field MUST be treated as ignorable by consumers that do not
implement S1 suppression logic. This MUST be verified by ensuring that existing
atlas-merge tests pass without modification when markers contain `origin: explore`.

#### Scenario: Old consumer ignores origin field

- GIVEN a marker with `origin: explore` and all required C1 fields present
- WHEN a C1-era atlas consumer (that does not read `origin`) processes it
- THEN the marker is parsed and included in the atlas without error
- AND the consumer's behavior is identical to processing a marker without the
  `origin` field
