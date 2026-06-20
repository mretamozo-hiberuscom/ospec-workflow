# Delta for skills

## ADDED Requirements

### Requirement: Stack-Skill Tier

The `skills/` catalog MUST support a fourth tier — **stack skills** — alongside the
existing SDD-phase, utility, and support-package tiers. Each stack skill MUST live
at `skills/stack-{name}/SKILL.md` where `{name}` is a lowercase slug matching the
technology it covers (e.g., `stack-angular`, `stack-dotnet`, `stack-postgres`).

Stack skills carry operative, per-technology knowledge — authoring conventions,
framework-specific patterns, and project coding rules for a given library or
runtime. They are NOT SDD-phase procedure files and MUST NOT carry the
`disable-model-invocation: true`, `user-invocable: false`, or
`metadata.delegate_only: true` fields.

Stack-skill `SKILL.md` files MUST include:
- `license: Apache-2.0` (matching the utility tier)
- `metadata.author: manuel-retamozo-garcia`
- `metadata.version`: quoted semantic string
- `description`: single physical YAML line describing the technology domain and key
  use cases; MUST be meaningful enough for the orchestrator to apply judgment-based
  selection (e.g., `"Angular frontend framework — components, reactive forms, routing, signals"`).
  A vague or empty description prevents reliable semantic filtering and is not permitted.
- `capabilities`: the optional frontmatter field declaring which capability names
  this skill addresses (see Requirement: Stack-Skill capabilities Frontmatter Field)

The registry inclusion filter (`shouldIncludeSkill`) requires no change: the
`stack-{name}` directory prefix does not start with `sdd-`, is not `_shared`, and
is not `skill-registry`, so stack skills are automatically indexed alongside utility
skills. They ARE included in fingerprint paths and ARE emitted as registry entries.

#### Scenario: Stack skill passes existing inclusion filter

- GIVEN a file at `skills/stack-angular/SKILL.md` exists in the plugin
- WHEN `discoverSkills` scans the `skills/` tree
- THEN `shouldIncludeSkill("skills/stack-angular/SKILL.md")` returns `true`
- AND `stack-angular` appears as an entry in the `skills` array of the generated cache

#### Scenario: Stack skill excluded from SDD-phase tier conventions

- GIVEN a file at `skills/stack-dotnet/SKILL.md` with `license: Apache-2.0`
  and NO `disable-model-invocation` or `user-invocable` fields
- WHEN the registry scanner processes it
- THEN it is indexed as a normal registry entry (same as a utility skill)
- AND the ORCHESTRATOR GATE blockquote MUST NOT appear in its body

#### Scenario: Seed reference skills cover the contract

- GIVEN reference stack skills `skills/stack-angular/`, `skills/stack-dotnet/`,
  and `skills/stack-postgres/` exist with valid frontmatter and body
- WHEN `discoverSkills` runs
- THEN all three appear in the registry `skills` array with non-empty `compact_rules`
  and `capabilities` arrays

---

### Requirement: Stack-Skill capabilities Frontmatter Field

Every stack-skill `SKILL.md` SHOULD declare a `capabilities:` frontmatter field
whose value is a list of one or more capability name strings. These names MUST
match (exactly, case-sensitive) the `name` values used in the `capabilities:`
block of `openspec/config.yaml`. When the `capabilities:` field is absent, the
skill MUST still be indexed; its registry entry will carry an empty `capabilities`
array and the skill will not be selected by capability-based resolution.

The `capabilities:` field MUST NOT be used as a general keyword tag; it MUST
list only technology names that correspond to declared project capabilities.

#### Scenario: capabilities field present and non-empty

- GIVEN a stack skill with frontmatter `capabilities: [angular]`
- WHEN the frontmatter parser reads the field
- THEN the value is available as a parseable list containing `"angular"`
- AND the registry entry for this skill carries `capabilities: ["angular"]`

#### Scenario: capabilities field absent — skill still indexed, empty array in cache

- GIVEN a stack skill `SKILL.md` that has no `capabilities:` field in frontmatter
- WHEN `discoverSkills` processes it
- THEN the skill IS included in the registry with `capabilities: []`
- AND it will NOT be matched by any capability-based resolution

---

## Cross-References

- `capability-registry` domain spec — schema and semantics of capability names
- `skill-registry` domain spec — how `capabilities` is read from frontmatter and
  stored in the cache entry schema
- `agents` domain spec — how capabilities gate stack-skill injection into sub-agents
- `skills/_shared/skill-resolver.md` — full skill resolution and injection order

---

## Clarifications

### Session 2026-06-20

- Q: Must a stack skill's `description` frontmatter field be meaningful enough to support orchestrator judgment-based selection without an explicit domain field? → A: Yes. The `description` MUST describe the technology domain and key use cases clearly (e.g., "Angular frontend framework — components, reactive forms, routing, signals") so the orchestrator can semantically match it against task intent. There is no `domain:` field on skill frontmatter; `description` is the sole signal for judgment-based selection.
