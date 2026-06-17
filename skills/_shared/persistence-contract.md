# Persistence Contract (shared across all SDD skills)

## Mode Resolution

The orchestrator passes `artifact_store.mode` with one of: `openspec | none`.

The orchestrator asks the user which mode they want when `/sdd-new`, `/sdd-ff`, or `/sdd-continue` is invoked for the first time in a session. The choice is cached for the session.

Default: use `openspec` for persisted SDD workflows. Use `none` only when the user explicitly wants inline-only output or project files must not be changed.

## Mode Roles

- **`openspec`**: Source of truth. Files in repo, git history, team-shareable, full audit trail.
- **`none`**: Ephemeral. Lost when the conversation ends.

> **Prompt-layer mode vs. harness backend.** This `artifact_store.mode`
> (`openspec | none`) is a *prompt-layer* decision: it tells a phase agent
> whether to persist to files or return inline. It is distinct from the
> *harness* backend adapter in `scripts/lib/artifact-store.js`, whose modes
> (`openspec | workspace-federated`) decide **where and how** the runtime
> resolves the on-disk layout for hooks. The two are aligned on `openspec` but
> answer different questions. `workspace-federated` (multi-repo) is implemented
> for reads (aggregated cross-repo active changes); coordinated multi-repo
> **writes** remain roadmapped.

## Workspace Federation (harness backend: `workspace-federated`)

Selected by `artifact_store.backend: workspace-federated` in `openspec/config.yaml`.
A **coordinator** repo declares its members in `openspec/workspace.yaml` (the atlas);
each member stays a standard OpenSpec repo. The harness aggregates active changes across
all reachable members, tagging each with a `source` member id (coordinator entries use
`source: "."`). Unreachable members are skipped fail-open, never fatal. See
`sdd-workspace` (`init`/`status`/`impact`) and `docs/harness-runtime.md`.

**Change-linking model.** A cross-repo change is coordinated centrally: the coordinator
change folder holds the cross-cutting `proposal.md`/`design.md` plus `federation.yaml`
linking each member to its slice change:

```yaml
federation_id: rollout-auth-v2
coordinator_change: rollout-auth-v2
slices:
  - member: api
    change: add-token-endpoint
  - member: web
    change: consume-token-endpoint
```

**v1 boundary (read-and-link).** The federated store reads and reconciles member state
but MUST NOT write into a member repo; `changeDirectory`/`writeSessionSummary`/`readConfig`
stay coordinator-local, and the derived `.ospec/` surface stays in the coordinator
workspace. Slices are authored inside each member with the normal single-repo workflow.

### Atlas as Derived Cache (C1 marker inversion)

C1 inverts the federation source-of-truth contract. The distributed markers
`openspec/federation.member.yaml` in each member repo are the **sole source of truth**;
`openspec/workspace.yaml` (the atlas) is demoted to a **derived, regenerable cache**. The
cache is gitignored and MUST NOT be committed as a canonical artifact — it is rebuilt from
the markers on demand.

Atlas load contract (realized in `scripts/lib/artifact-store.js` `loadAtlas`):

- **Valid cache is trusted.** A `workspace.yaml` that parses to a usable atlas is used as-is
  (the federated happy path is unchanged); `sdd-workspace explore` is responsible for
  refreshing it after `enroll`.
- **Absent or corrupt → regenerate.** When `workspace.yaml` is missing (ENOENT) or fails to
  parse (corrupt/unparseable), the loader regenerates the atlas from the available member
  markers (`scanMemberMarkers` → `mergeMarkersIntoAtlas` → `serializeAtlas`), writes the
  rebuilt cache, and emits a warning before proceeding when the prior cache was corrupt.
- **Warn-on-detect when git-tracked.** On every load the system runs
  `git ls-files openspec/workspace.yaml` (fail-open if git is absent). If the result is
  non-empty the file is tracked, so it emits a warn-on-detect warning instructing the user to
  run `git rm --cached openspec/workspace.yaml` manually, then continues loading normally.
- **No destructive git ops.** C1 MUST NOT execute `git rm --cached` or any other destructive
  or automatic git operation; cache migration is always manual.

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

The orchestrator pre-resolves compact rules from the skill registry and injects them as `## Project Standards (auto-resolved)` in your launch prompt. With that block present, sub-agents do NOT read the registry or *other* skills' SKILL.md files — those project standards arrive pre-digested. This does not affect a phase agent's own phase SKILL.md, which is always required (see `sdd-phase-common.md` §A).

To generate/update: run the `skill-registry` skill, or run `sdd-init`.

Sub-agent skill loading: check for a `## Project Standards (auto-resolved)` block in your prompt — if present, follow those rules. If not present, check for `SKILL: Load` instructions as a fallback. If neither exists, proceed without — this is not an error.

## Detail Level

The orchestrator may pass `detail_level`: `concise | standard | deep`. This controls output verbosity but does NOT affect what gets persisted — always persist the full artifact when mode is `openspec`.
