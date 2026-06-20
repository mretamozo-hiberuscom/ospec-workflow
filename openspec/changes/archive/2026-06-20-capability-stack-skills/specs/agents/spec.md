# Delta for agents

## ADDED Requirements

### Requirement: Capability-Aware Stack-Skill Injection

Before dispatching any SDD phase sub-agent that reads, writes, or reviews code
(i.e., `sdd-apply`, `sdd-design`, `sdd-tasks`, `sdd-spec`, `sdd-verify`, and the
4R reviewers), the orchestrator MUST perform capability-aware stack-skill injection
as an additional step within the existing `## Project Standards (auto-resolved)`
composition:

1. **Candidate resolution**: read the active capability list from the session cache
   (as surfaced by `runSessionStart`) and intersect it with the `capabilities` arrays
   of all registry skill entries. The result is the capability-matched candidate set.

2. **Task-domain filtering (judgment-based)**: from the capability-matched candidate
   set, the orchestrator MUST apply semantic judgment to select only the stack skills
   relevant to the current sub-agent's task. The orchestrator reads each candidate
   skill's `description` and `capabilities` frontmatter and weighs them against the
   content and intent of the current task (e.g., a task such as "crear formulario
   reactivo" targets the frontend domain; the orchestrator selects `stack-angular`
   and does NOT inject `stack-postgres` whose description covers a backend database
   runtime). There is NO explicit `domain:` field on task entries and NO `domain:`
   field on skill frontmatter; selection is entirely by orchestrator judgment over the
   semantic match between skill descriptions and task intent.

3. **Injection**: inject the compact rules of the filtered stack skills into the
   sub-agent launch prompt inside the existing `## Project Standards (auto-resolved)`
   block, appended after utility-skill compact rules. The injection MUST respect the
   existing five-skill cap defined in `skills/_shared/skill-resolver.md`; across the
   combined set (utility + stack) at most five skill blocks MUST be included.

4. **No-op path**: when the active capability list is empty (no `capabilities:` block
   in `config.yaml`) OR when the candidate set is empty (no registry entries match),
   the orchestrator MUST NOT add any stack-skill content and MUST NOT error. Prompt
   composition is identical to the pre-capabilities baseline.

The orchestrator MUST NOT inject stack skills into sub-agents that perform purely
mechanical or meta operations where technology-specific knowledge is irrelevant
(e.g., `sdd-archive`, `sdd-init`).

> **Resolution (AMBIGUITY-A2 — task-domain filtering)**: Selection from the
> capability-matched candidate set is by orchestrator judgment and semantic
> relevance. The orchestrator reads each candidate skill's `description` and
> `capabilities` frontmatter and weighs them against the task content and intent.
> There is NO explicit `domain:` field on task entries and NO `domain:` field on
> skill frontmatter. This mirrors ECC's model: skills are framework/domain-named
> and selection is semantic, not a centralized capability→task map. Stack skills
> MUST carry a meaningful `description` (see skills delta spec) so that
> judgment-based selection is reliable.

> **Resolution (AMBIGUITY-A3 — multi-skill precedence)**: When a single capability
> name resolves to more than one stack-skill entry, the default tie-breaking order
> is deterministic registry order (alphabetical by skill `id`). With the 2–3 seed
> stack skills shipped in v1 (one per technology), this case never occurs in
> practice. A future change that adds multiple skills per capability MUST specify
> an explicit precedence rule at that time.

#### Scenario: Capability-matched skills injected for frontend apply task

- GIVEN `config.yaml` declares capabilities `angular` and `postgres`
  AND the registry has `stack-angular` (capabilities: ["angular"]) and `stack-postgres` (capabilities: ["postgres"])
  AND the orchestrator reads `stack-angular`'s description (Angular frontend framework) and `stack-postgres`'s description (PostgreSQL backend runtime) and judges by semantic match that the task intent targets the frontend domain
- WHEN the orchestrator composes the sub-agent launch prompt
- THEN `stack-angular` compact rules are included in `## Project Standards (auto-resolved)`
- AND `stack-postgres` compact rules are NOT included (domain mismatch)

#### Scenario: No capabilities declared — baseline prompt, no stack skills

- GIVEN `config.yaml` has no `capabilities:` key
- WHEN the orchestrator dispatches `sdd-apply`
- THEN no stack-skill content is added to the launch prompt
- AND prompt composition is identical to the pre-capabilities baseline

#### Scenario: Capability declared but no registry entry matches — silent no-op

- GIVEN `config.yaml` declares capability `vue`
  AND no registry skill entry has `vue` in its `capabilities` array
- WHEN the orchestrator resolves stack skills
- THEN no stack-skill content is injected and no error is raised

#### Scenario: Five-skill cap respected across utility and stack skills

- GIVEN the orchestrator has already selected three utility skills by code-context matching
  AND two capability-matched stack skills are in the filtered candidate set
- WHEN the orchestrator composes the launch prompt
- THEN the combined injection contains exactly five skill blocks (three utility + two stack)
- AND no additional skills are added beyond the cap

#### Scenario: Stack skills not injected into sdd-archive

- GIVEN `config.yaml` declares active capabilities with matching registry entries
- WHEN the orchestrator dispatches `sdd-archive`
- THEN no stack-skill content is added to that sub-agent's launch prompt

---

## Cross-References

- `capability-registry` domain spec — active capability list schema and resolution contract
- `skill-registry` domain spec — `capabilities` field on cache entries
- `skills` domain spec — stack-skill tier definition; `capabilities:` frontmatter
- `skills/_shared/skill-resolver.md` — five-skill cap; injection order; `## Project Standards` block

---

## Clarifications

## Session 2026-06-20

- Q: How does the orchestrator determine which stack skills are relevant to a given task — is there an explicit domain field on task entries or skill frontmatter? → A: No explicit `domain:` field on task entries or skill frontmatter. The orchestrator applies semantic judgment using each candidate skill's `description` and `capabilities` frontmatter weighed against the content and intent of the current task, faithful to ECC's model. The concrete example: a task "crear formulario reactivo" leads the orchestrator to select `stack-angular` and ignore `stack-postgres` by reading their descriptions, not by a domain-field lookup.
- Q: When a single capability name resolves to more than one stack-skill entry, what is the priority order for the five-skill cap? → A: Default to deterministic registry/alphabetical order by skill `id`. With the 2–3 seed skills in v1 (one per technology) this case never occurs. A future change adding multiple skills per capability will specify an explicit precedence rule.
