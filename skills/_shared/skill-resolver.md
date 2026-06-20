# Skill Resolver — Universal Protocol

Any agent that **delegates work to sub-agents** MUST follow this protocol to resolve and inject relevant skills. This applies to any orchestrator, phase controller, or future workflow that launches sub-agents.

## Why This Exists

Sub-agents are born with no context about what skills exist. Without skill injection, a reviewer may miss project conventions, a fix agent may ignore testing standards, and a PR creator may miss the expected review shape.

## When to Apply

Before every sub-agent launch that involves **reading, writing, or reviewing code**. Skip only for purely mechanical delegations, such as running one known test command.

## Resolution Order

Use exactly one ordered strategy across all agents and documents:

1. `Project Standards` already injected in the launch prompt.
2. Orchestrator session cache.
3. `.ospec/cache/skill-registry.cache.json`.
4. Exact `SKILL.md` fallback paths explicitly provided for the task.
5. `skill_resolution: none` if no source exists.

If `## Project Standards (auto-resolved)` is present, use it and do not load additional skill sources unless the orchestrator explicitly requests a high-fidelity fallback. Prefer compact rules; use full `SKILL.md` files only as fallback step 4.

## Registry Cache

The durable registry cache lives at:

```text
.ospec/cache/skill-registry.cache.json
```

Suggested cache shape:

```json
{
  "version": 2,
  "fingerprint": "sha256:...",
  "generated_at": "ISO-8601",
  "skills": [
    {
      "id": "angular",
      "path": "skills/angular/SKILL.md",
      "triggers": ["*.ts", "*.html", "Angular"],
      "compact_rules": ["..."],
      "capabilities": ["angular"]
    }
  ]
}
```

Fingerprint inputs should include `skills/**/SKILL.md`, `skills/_shared/*.md`, `rules/**/*.md`, and detected project convention files. If the fingerprint is unchanged, reuse the cache. If cache is missing or stale, regenerate compact rules.

## Match Relevant Skills

Match skills on two dimensions:

### Code Context

What files will the sub-agent touch or review?

Common examples — always defer to registry `triggers` as the source of truth:

- `.tsx`, `.jsx` → React skills
- `.ts` → TypeScript skills
- `app/**`, `pages/**` → framework skills
- `.py` → Python skills
- `.go` → Go skills
- `*.test.*`, `*.spec.*` → testing skills
- Style files → CSS/design-system skills

### Task Context

What action will the sub-agent perform?

| Sub-agent action | Match skills with triggers mentioning... |
| --- | --- |
| Create a PR | "PR", "pull request" |
| Write/review code | The specific framework/language |
| Create tickets | "issue", "Jira", "epic", "task" |
| Write docs | "docs", "RFC", "README" |
| Write comments | "comment" |
| Run tests | "test", "vitest", "pytest", "playwright" |

If more than five skill blocks match, keep only the five most relevant. Prioritize code-context matches over task-context matches.

### Stack-Skill Candidate Resolution

When `capabilities:` are active in the project context:
1. **Name Intersection**: Intersect the active capabilities list (from the session cache) with each skill's `capabilities[]` array (case-sensitive). Sort the resulting candidate set by skill `id` ascending.
2. **Judgment Filter**: Filter the sorted candidates by comparing their `description` and `capabilities` against the sub-agent's task content, context, and intent. Only include skills that are semantically relevant to the task (no `domain:` field).
3. **Append to Project Standards**: Format and append the compact rules of the selected stack skills to the `## Project Standards (auto-resolved)` block, respecting the combined utility and stack cap of **5 skill blocks** total.
4. **Exclusions**: Do NOT inject stack skills into `sdd-archive` or `sdd-init` dispatches.

## Inject into Sub-Agent Prompt

Copy matching compact rule blocks into the sub-agent prompt before task-specific instructions:

```markdown
## Project Standards (auto-resolved)

{paste compact rules blocks for each matching skill}
```

Key rule: inject compact rules text when available. The sub-agent should read exact `SKILL.md` files only when the orchestrator explicitly chose fallback step 4.

## Project Conventions

If Project Standards or the registry cache includes project conventions, and the sub-agent will work on the project's code, also add:

```markdown
## Project Conventions
Read these files for project-specific patterns:
- {path1} — {notes}
- {path2} — {notes}
```

Keep conventions compact: at most five blocks per delegation, 50–150 tokens each, prioritized by affected files and requested action.

## Compaction Safety

This protocol is compaction-safe because:

- The durable registry lives in `.ospec/cache/skill-registry.cache.json`, not only in orchestrator memory.
- Each delegation can rehydrate the session cache from the registry cache if needed.
- Compact rules are copied into each sub-agent's prompt at launch time.

## Feedback Loop

Sub-agents MUST report their skill resolution status in their return envelope:

- `injected` — received `## Project Standards (auto-resolved)` from the orchestrator.
- `fallback-registry` — no standards received, self-loaded from `.ospec/cache/skill-registry.cache.json`.
- `fallback-path` — no standards or registry cache received, loaded exact `SKILL.md` fallback paths.
- `none` — no skills loaded at all.

Orchestrator self-correction rule: if a sub-agent reports anything other than `injected`, the orchestrator MUST rehydrate the session cache from `.ospec/cache/skill-registry.cache.json` or explicit fallback paths before subsequent delegations.

## Integration Points

- **SDD orchestrator**: follows this protocol for all delegations.
- **Phase agents**: use injected Project Standards first, then the registry cache or exact path fallback.
- **Any future workflow that delegates**: MUST reference this protocol.
