---
name: skill-registry
description: "Create or update the project skill registry. Trigger: update skills, skill registry, actualizar skills, or after skill changes."
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
---

## Purpose

You generate or update the **skill registry cache** — a JSON catalog of all available skills with **compact rules** (pre-digested, 5-15 line summaries) that any delegator injects directly into sub-agent prompts. Sub-agents do NOT read individual SKILL.md files unless no compact-rule source exists and exact paths are supplied.

This is the foundation of the **Skill Resolver Protocol** (see `_shared/skill-resolver.md`). The registry is built ONCE (expensive), then read cheaply at every delegation.

## When to Run

- After installing or removing skills
- After setting up a new project
- When the user explicitly asks to update the registry
- As part of `sdd-init` (it calls this same logic)

## What to Do

### Step 1: Scan User Skills

1. Glob for `*/SKILL.md` files across ALL known skill directories. Check every path below — scan ALL that exist, not just the first match:

   **User-level (global skills):**
   - `~/.claude/skills/` — Claude Code
   - `~/.config/opencode/skills/` — OpenCode
   - `~/.gemini/skills/` — Gemini CLI
   - `~/.cursor/skills/` — Cursor
   - `~/.copilot/skills/` — VS Code Copilot
   - The parent directory of this skill file (catch-all for any tool)

   **Project-level (workspace skills):**
   - `{project-root}/.claude/skills/` — Claude Code
   - `{project-root}/.gemini/skills/` — Gemini CLI
   - `{project-root}/.agent/skills/` — Antigravity (workspace)
   - `{project-root}/skills/` — Generic

2. Probe each root safely before scanning it:
   - If the directory does not exist, record a note and continue.
   - If the directory is unreadable due to permissions, record a warning and continue.
   - If the path is a broken symlink/junction or cannot be resolved, record a warning and continue.
   - Never abort the registry build because one external root is missing or broken.

3. **SKIP `sdd-*` and `_shared`** — those are SDD workflow skills, not coding/task skills
4. Also **SKIP `skill-registry`** — that's this skill
5. **Deduplicate** — if the same skill name appears in multiple locations, keep the project-level version (more specific). If both are user-level, keep the first found.
6. For each skill found, read the **full SKILL.md** (if a SKILL.md exceeds 200 lines, focus on the frontmatter and Critical Patterns / Rules sections only) to extract:
   - `name` field (from frontmatter)
   - `description` field → extract the trigger text (after "Trigger:" in the description)
   - **Compact rules** — the actionable patterns and constraints (see Step 1b)
7. Build a table of: Trigger | Skill Name | Full Path

### Step 1b: Generate Compact Rules

For each skill found in Step 1, generate a **compact rules block** (5-15 lines max) containing ONLY:
- Actionable rules and constraints ("do X", "never Y", "prefer Z over W")
- Key patterns with one-line examples where critical
- Breaking changes or gotchas that would cause bugs if missed

**DO NOT include**: purpose/motivation, when-to-use, full code examples, installation steps, or anything the sub-agent doesn't need to APPLY the skill.

Format per skill:
```markdown
### {skill-name}
- Rule 1
- Rule 2
- ...
```

**Example** — compact rules for a React 19 skill:
```markdown
### react-19
- No useMemo/useCallback — React Compiler handles memoization automatically
- use() hook for promises/context, replaces useEffect for data fetching
- Server Components by default, add 'use client' only for interactivity/hooks
- ref is a regular prop — no forwardRef needed
- Actions: use useActionState for form mutations, useOptimistic for optimistic UI
- Metadata: export metadata object from page/layout, no <Head> component
```

**The compact rules are the MOST IMPORTANT output of this skill.** They are what sub-agents actually receive. Invest time making them accurate and concise.

### Step 2: Scan Project Conventions

1. Check the project root for convention files. Look for:
   - `agents.md` or `AGENTS.md`
   - `CLAUDE.md` (only project-level, not `~/.claude/CLAUDE.md`)
   - `.cursorrules`
   - `GEMINI.md`
   - `copilot-instructions.md`
2. Probe each convention path safely. Missing files, unreadable files, and broken links become warnings, not fatal errors.
3. **If an index file is found** (e.g., `agents.md`, `AGENTS.md`): READ its contents and extract all referenced file paths. These index files typically list project conventions with paths — extract every referenced path and include it in the registry table alongside the index file itself.
4. For non-index files (`.cursorrules`, `CLAUDE.md`, etc.): record the file directly.
5. The final table should include the index file AND all paths it references — zero extra hops for sub-agents.

### Step 3: Write the Registry Cache

Build the registry cache JSON:

```json
{
  "version": 1,
  "fingerprint": "sha256:...",
  "generated_at": "ISO-8601",
  "skills": [
    {
      "id": "skill-name",
      "path": "skills/skill-name/SKILL.md",
      "triggers": ["trigger from frontmatter"],
      "compact_rules": ["Rule 1", "Rule 2"]
    }
  ],
  "project_conventions": [
    {
      "path": "AGENTS.md",
      "notes": "Index file or convention source"
    }
  ]
}
```

### Step 4: Persist the Registry

**This step is MANDATORY — do NOT skip it.**

Create the `.ospec/cache/` directory in the project root if it doesn't exist, then write:

```
.ospec/cache/skill-registry.cache.json
```

### Step 5: Return Summary

```markdown
## Skill Registry Updated

**Project**: {project name}
**Location**: .ospec/cache/skill-registry.cache.json

### User Skills Found
| Skill | Trigger |
|-------|---------|
| {name} | {trigger} |
| ... | ... |

### Project Conventions Found
| File | Path |
|------|------|
| {file} | {path} |

### Next Steps
The orchestrator reads this registry cache once per session and passes pre-resolved compact rules to sub-agents via their launch prompts.
To update after installing/removing skills, run this again.

### Scan Warnings
{List unreadable roots, missing directories, or broken links encountered during scanning. If none, say "None".}
```

## Rules

- ALWAYS write `.ospec/cache/skill-registry.cache.json` when the project uses persisted OpenSpec artifacts
- SKIP `sdd-*`, `_shared`, and `skill-registry` directories when scanning
- Read SKILL.md files (respecting the 200-line guard in Step 1) to generate accurate compact rules — this is a build-time cost, not a runtime cost
- Compact rules MUST be 5-15 lines per skill — concise, actionable, no fluff
- Include ALL convention index files found (not just the first)
- If no skills or conventions are found, write an empty registry (so sub-agents don't waste time searching)
- Missing directories, permission errors, broken symlinks/junctions, and unreadable roots MUST be downgraded to warnings. They must never abort registry creation.
