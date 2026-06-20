# Capability Registry Specification

## Purpose

The capability registry is the authoritative, first-class declaration of project
technologies in `openspec/config.yaml`. It gives downstream components — the skill
registry and the orchestrator's skill resolver — a stable list of active capabilities
(e.g., `angular`, `dotnet`, `postgres`) from which to select and inject relevant
stack skills into phase sub-agents.

---

## Requirements

### Requirement: Capabilities Block Schema

The `openspec/config.yaml` file MAY contain a top-level `capabilities:` YAML
sequence. Each entry MUST have a `name` field (string, slug form, no spaces or
special characters). Each entry MAY have an optional `version` field (string).
Each entry MAY have a `source` field with value `declared` or `detected`; when
`source` is absent it MUST default to `declared`. An absent `capabilities:` key
MUST be treated as an empty list — identical to no capabilities being active.

#### Scenario: Complete entry with version and source declared

- GIVEN `openspec/config.yaml` contains `capabilities: [{name: angular, version: "17", source: declared}]`
- WHEN the config is read by any consumer
- THEN the capability `angular` at version `17` with source `declared` is available for stack-skill resolution

#### Scenario: Minimal entry — name only

- GIVEN `openspec/config.yaml` contains `capabilities: [{name: postgres}]`
- WHEN the config is read
- THEN the capability `postgres` is registered with source defaulting to `declared`
- AND it participates in resolution identically to an explicit `source: declared` entry

#### Scenario: No capabilities block — strict no-op

- GIVEN `openspec/config.yaml` has no `capabilities:` key
- WHEN any consumer inspects the capability list
- THEN the list is empty, no stack skills are selected, and runtime behavior is
  identical to the pre-capabilities baseline

#### Scenario: Empty capabilities list — strict no-op

- GIVEN `openspec/config.yaml` contains `capabilities: []`
- WHEN any consumer inspects the capability list
- THEN the list is empty and stack-skill injection does not occur

---

### Requirement: SessionStart Capabilities Surfacing

When `runSessionStart` produces or reuses the registry cache and `openspec/config.yaml`
contains a `capabilities:` block with at least one entry, the result object MUST
include a `capabilities` field — an array of the active capability `name` strings,
in declaration order. When the block is absent or empty, the `capabilities` key
MUST be absent from the result object (no empty array).

#### Scenario: Capabilities surfaced in result

- GIVEN `openspec/config.yaml` contains `capabilities: [{name: angular}, {name: postgres}]`
- WHEN `runSessionStart` executes
- THEN the result MUST include `capabilities: ["angular", "postgres"]`

#### Scenario: No capabilities block — key absent from result

- GIVEN `openspec/config.yaml` has no `capabilities:` key
- WHEN `runSessionStart` executes
- THEN the result MUST NOT include a `capabilities` field

---

### Requirement: Capability-to-Stack-Skill Resolution Contract

A capability entry with `name` N resolves to the set of registry skill entries whose
`capabilities` array contains the value N (exact string match, case-sensitive). This
matching is performed at injection time by the orchestrator's skill resolver. A
capability that matches no skill entries MUST NOT raise an error; the candidate
injection set for that capability is simply empty.

#### Scenario: Single capability matches one stack skill

- GIVEN `config.yaml` declares capability `angular`
  AND the registry contains skill `stack-angular` with `capabilities: ["angular"]`
- WHEN the orchestrator resolves stack skills for the active capability list
- THEN `stack-angular` is included in the candidate injection set

#### Scenario: Capability matches no registered skill — silent no-op

- GIVEN `config.yaml` declares capability `vue`
  AND no registry skill entry has `vue` in its `capabilities` array
- WHEN the orchestrator resolves stack skills
- THEN no stack skill is injected and no error is emitted

#### Scenario: Multiple capabilities — union of matched skills

- GIVEN `config.yaml` declares `angular` and `postgres`
  AND the registry contains `stack-angular` (capabilities: ["angular"]) and `stack-postgres` (capabilities: ["postgres"])
- WHEN the orchestrator resolves stack skills
- THEN both `stack-angular` and `stack-postgres` are in the candidate set

#### Scenario: Case-sensitive name matching

- GIVEN `config.yaml` declares capability `Angular` (capital A)
  AND the registry contains `stack-angular` with `capabilities: ["angular"]` (lowercase)
- WHEN the orchestrator performs resolution
- THEN `stack-angular` is NOT matched (case mismatch)
- AND the candidate set for that capability is empty

---

### Requirement: Declared vs Detected Source Semantics

A `source: declared` entry MUST be treated as authoritative: tooling MUST NOT
remove or overwrite it without explicit user action. A `source: detected` entry
SHOULD be treated as advisory: tooling MAY refresh, update, or remove it
automatically as project state changes, without user confirmation.

Both source values participate in stack-skill resolution through the same
capability-name matching path; `source` does not affect resolution priority or
eligibility.

> **Resolution (AMBIGUITY-A1 — detection shape)**: This change ships the
> `source: declared|detected` **schema field only**. No detection-writing component
> is implemented in this change; `source: detected` is a forward-compatible slot
> reserved for a future change that will specify which component writes it and what
> heuristics it uses (file extensions, framework config files, lockfile inspection,
> etc.). Semantics in this change: `source: declared` is authoritative — tooling
> MUST NOT remove or overwrite it without explicit user action. `source: detected`
> is advisory — tooling MAY refresh, update, or remove it automatically as project
> state changes. Both values participate in stack-skill resolution identically
> (resolution is by capability name, not by source).

#### Scenario: Declared entry — treated as authoritative

- GIVEN a capability entry with `source: declared`
- WHEN any tooling inspects the capabilities block
- THEN the entry MUST NOT be automatically modified or removed

#### Scenario: Both sources participate in resolution equally

- GIVEN `config.yaml` contains `{name: angular, source: declared}` and `{name: postgres, source: detected}`
- WHEN the orchestrator resolves stack skills
- THEN both capabilities are matched against registry entries using the same resolution path
- AND `source` does not alter which skills are returned

---

## Cross-References

- `skills` domain spec — stack-skill tier; `capabilities:` frontmatter field on stack skills
- `skill-registry` domain spec — `capabilities` field in the cache skill entry schema
- `agents` domain spec — capability-aware injection into sub-agent launch prompts
- `openspec/config.yaml` — authoritative location of the `capabilities:` block

---

## Clarifications

### Session 2026-06-20

- Q: Which component writes `source: detected` entries and what detection heuristics are used? → A: `source: detected` is a forward-compatible schema field only in this change; no detection-writing component is implemented here. `declared` is authoritative and cannot be auto-removed by tooling; `detected` is advisory and may be auto-refreshed by a future change. Both values resolve stack skills identically.
