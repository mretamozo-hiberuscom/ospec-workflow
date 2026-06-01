# Persistence Contract (shared across all SDD skills)

## Mode Resolution

The orchestrator passes `artifact_store.mode` with one of: `openspec | none`.

The orchestrator asks the user which mode they want when `/sdd-new`, `/sdd-ff`, or `/sdd-continue` is invoked for the first time in a session. The choice is cached for the session.

Default: use `openspec` for persisted SDD workflows. Use `none` only when the user explicitly wants inline-only output or project files must not be changed.

## Mode Roles

- **`openspec`**: Source of truth. Files in repo, git history, team-shareable, full audit trail.
- **`none`**: Ephemeral. Lost when the conversation ends.

## Behavior Per Mode

| Mode | Read from | Write to | Project files |
|------|-----------|----------|---------------|
| `openspec` | Filesystem | Filesystem | Yes |
| `none` | Orchestrator prompt context | Nowhere | Never |

## State Persistence

Each phase executor persists DAG state when it writes its own artifact, and the orchestrator may repair or advance that state when routing the next phase. This keeps recovery anchored in the filesystem even when chat context is compacted.

| Mode | Persist State | Recover State |
|------|--------------|---------------|
| `openspec` | Read-merge-update `openspec/changes/{change-name}/state.yaml` on every phase transition | Read `openspec/changes/{change-name}/state.yaml` |
| `none` | Not possible — warn user | Not possible |

## Common Rules

- `openspec` → write files ONLY to paths defined in `openspec-convention.md`
- `none` → do NOT create or modify any project files; return results inline only
- NEVER force `openspec/` creation unless orchestrator explicitly passed `openspec`
- If unsure which mode to use, default to `none`

## Sub-Agent Context Rules

Sub-agents launch with a fresh context and NO access to the orchestrator's instructions.

Who reads, who writes:
- Non-SDD (general task): orchestrator passes relevant prior context in the prompt; sub-agent reports discoveries in its return envelope.
- SDD (phase with dependencies): sub-agent reads artifacts directly from the active backend; sub-agent saves its artifact.
- SDD (phase without dependencies, e.g. explore): nobody reads; sub-agent saves its artifact when persistence is active.

Why this split:
- Orchestrator reads for non-SDD: it knows what context is relevant; sub-agents doing broad searches waste tokens on irrelevant results.
- Sub-agents read for SDD: SDD artifacts are large; inlining them in the orchestrator prompt would consume the context window.
- Sub-agents always write: they have the complete detail on what happened; nuance is lost by the time results flow back to the orchestrator.

## Orchestrator Prompt Instructions for Sub-Agents

Non-SDD:
```text
CONTEXT REPORTING (MANDATORY):
If you make important discoveries, decisions, or fix bugs, include them in your final return envelope under `discoveries` or `risks` with affected paths and rationale.
```

SDD (with dependencies):
```text
Artifact store mode: {openspec|none}

If mode is `openspec`, read the required artifacts from:
- openspec/changes/{change-name}/proposal.md
- openspec/changes/{change-name}/proposal-lite.md
- openspec/changes/{change-name}/specs/**/spec.md
- openspec/changes/{change-name}/design.md
- openspec/changes/{change-name}/tasks.md
- openspec/changes/{change-name}/state.yaml
- openspec/config.yaml

PERSISTENCE (MANDATORY when mode is `openspec`):
After completing your work, write the phase artifact to the expected OpenSpec path.
Then update openspec/changes/{change-name}/state.yaml with the new phase status and timestamp.
If you return without writing it, the next phase CANNOT find your artifact and the pipeline BREAKS.
```

SDD (no dependencies):
```text
Artifact store mode: {openspec|none}

PERSISTENCE (MANDATORY when mode is `openspec`):
After completing your work, write the phase artifact to the expected OpenSpec path.
Then update openspec/changes/{change-name}/state.yaml with the new phase status and timestamp.
If mode is `none`, return the artifact inline only.
```

## Skill Registry

The orchestrator pre-resolves compact rules from the skill registry and injects them as `## Project Standards (auto-resolved)` in your launch prompt. Sub-agents do NOT read the registry or individual SKILL.md files — rules arrive pre-digested.

To generate/update: run the `skill-registry` skill, or run `sdd-init`.

Sub-agent skill loading: check for a `## Project Standards (auto-resolved)` block in your prompt — if present, follow those rules. If not present, check for `SKILL: Load` instructions as a fallback. If neither exists, proceed without — this is not an error.

## Detail Level

The orchestrator may pass `detail_level`: `concise | standard | deep`. This controls output verbosity but does NOT affect what gets persisted — always persist the full artifact when mode is `openspec`.
