# Proposal: Capability Registry & Stack Skills

## Intent

Operative knowledge today lives in two disconnected places: the `skills/` catalog
(SDD-phase + utility skills, discovered by *trigger words*) and `config.yaml`
`context` (free-text "detected stack" prose). There is **no first-class declaration
of project capabilities** (angular, dotnet, postgres, docker) and **no stack/tech
skills at all** — selective loading is keyword-trigger only, never capability-aware.
ECC's model (skills #2 + selective context #3 + capability registry #7) collapses
into one gap: declare capabilities once, author tech-stack skills, and inject them
*selectively by capability + task domain* so sub-agents get the right operative
knowledge without 4000-token global prompts.

## Scope

### In Scope
- New `capabilities:` block in `openspec/config.yaml`: explicit list with optional
  `version` and `source` (`declared | detected`).
- New **stack-skill tier** under `skills/` (e.g. `skills/stack-{name}/`), distinct
  from the SDD-phase and utility tiers, carrying operative per-technology knowledge.
- Capability-aware selective loading: `skill-resolver` + registry map
  capabilities → stack skills and inject them into the relevant phase sub-agent
  (frontend task → angular/tailwind; backend → dotnet/postgres).
- Registry: index stack skills with a `capabilities` field; SessionStart surfaces
  declared/detected capabilities.
- Seed 2–3 reference stack skills (e.g. angular, dotnet, postgres) as the contract
  example — not an exhaustive library.

### Out of Scope
- Deep auto-detection heuristics (detection shape decided in design; may start minimal).
- Authoring the full stack-skill library for every technology.
- Trigger-based loading for utility skills (coexists, unchanged).
- Routing the whole orchestrator on capabilities (this change covers skill selection only).

## Capabilities

### New Capabilities
- `capability-registry`: the `capabilities:` declaration, its schema, and
  capability → stack-skill resolution.

### Modified Capabilities
- `skills`: add the stack-skill tier and a `capabilities` frontmatter field.
- `skill-registry`: index stack skills, add capabilities to the cache schema.
- `agents`: capability-aware injection of stack skills into phase sub-agents.

## Approach

Extend the config schema with `capabilities:`; add the stack-skill tier; teach
`skill-resolver`/registry to match `capabilities → skills` and inject selectively per
phase/task domain, reusing the existing fingerprint + cache. Seed reference stack
skills so the contract is testable end-to-end.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/config.yaml` (schema) | Modified | Add `capabilities:` block |
| `skills/stack-*/` | New | Seed reference stack skills |
| `scripts/lib/skill-registry.js` | Modified | Index stack skills + capabilities field |
| `skills/_shared/skill-resolver.md` | Modified | Capability-aware resolution order |
| `openspec/specs/{capability-registry,skills,skill-registry,agents}` | New/Modified | Specs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Token bloat if all stack skills load | Med | Select by capability + task domain, not globally |
| Capability drift vs actual code | Med | `source: declared\|detected` + staleness hint |
| Scope creep (full skill library) | Med | Seed only 2–3 reference skills |

## Rollback Plan

Additive and opt-in: no `capabilities:` block and no stack skills = current behavior.
Rollback = remove stack skills + revert resolver/registry/schema edits; cache
regenerates from fingerprint. No data migration.

## Dependencies

- None blocking. Synergizes with `sdd-lifecycle-hooks` (`load-skill` action can load a
  stack skill at a boundary).

## Success Criteria

- [ ] `capabilities:` declarable in `config.yaml` with version + source.
- [ ] Stack-skill tier exists; 2–3 reference skills authored and indexed.
- [ ] Only capability-relevant stack skills are injected per task domain.
- [ ] Registry cache schema carries `capabilities`.
- [ ] No-op when no capabilities/stack skills are present.
- [ ] `npm test` green.
