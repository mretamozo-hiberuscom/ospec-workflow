# Design: Workspace-Federated Artifact Backend

## Technical Approach

Implement the deferred `workspace-federated` branch of `createArtifactStore` as an
**overlay** over the existing single-repo machinery. A new dependency-free
`scripts/lib/workspace-atlas.js` parses `openspec/workspace.yaml` and exposes member
resolution and a contract impact graph. The federated store keeps the shared derived
surface (already workspace-local) and implements the canonical ops by **delegating to
`ospec-state.findActiveChanges` per member** and concatenating with the coordinator's
own changes, each tagged by `source`. The four stateful hooks gain one cheap config
read to pick the backend; everything else stays behind the store contract.

Surface split (per `rules.design`): `scripts/lib/workspace-atlas.js`,
`scripts/lib/artifact-store.js`, and the hook backend-selection are **JS runtime**
(Strict TDD). The `sdd-workspace` trio, orchestrator advisory, convention/doc updates
are **prompt/Markdown layer** (review + sdd-verify).

## Component Architecture

### New files

| File | Contract |
|---|---|
| `scripts/lib/workspace-atlas.js` | `parseAtlas(content)` → `{ members[], contracts[] }` over the constrained subset; `resolveMembers(workspace, atlas)` → `[{ id, root, reachable }]` (fs check, fail-open); `computeImpact(atlas, memberId)` → `Set<id>` (pure). `node:*` only, mirrors `ospec-state.js` parsers. |
| `scripts/lib/workspace-atlas.test.js` | TDD: parse subset, ignore unsupported shapes, relative/absolute path resolution, unreachable skip, impact graph (provider+consumers, leaf). |
| `agents/sdd-workspace.agent.md` | Executor boundary (mirrors `agents/sdd-foundation.agent.md`); reads `skills/sdd-workspace/SKILL.md` + `_shared/sdd-phase-common.md`; result contract; `blocked + question_gate` for atlas confirmation on `init`. |
| `skills/sdd-workspace/SKILL.md` | `init`/`status`/`impact` protocol; read-only-to-members rule; atlas update-not-overwrite rule. |
| `commands/sdd-workspace.prompt.md` | Mirrors `commands/sdd-baseline.prompt.md`: `agent: sdd-orchestrator`, routing prompt, `${input}` for subcommand + change name. |

### Modified surfaces

| File | Action | Layer |
|---|---|---|
| `scripts/lib/artifact-store.js` | Replace the federated not-implemented door with real ops using `workspace-atlas.js` + `ospec-state.js`; derived surface unchanged | **JS runtime (TDD)** |
| `scripts/hooks/session-start.js`, `pre-compact.js`, `stop.js`, `subagent-stop.js` | Resolve `artifact_store.backend` from config; pass as store `mode` | **JS runtime (TDD)** |
| `scripts/lib/ospec-state.js` | Add `readBackendMode(configContent)` line parser (mirrors `readBaselineState`/`readStatus`) | **JS runtime (TDD)** |
| `agents/sdd-orchestrator.agent.md` | Federated recovery (aggregated active changes) + Impact Advisory before cross-repo changes | Prompt |
| `skills/_shared/persistence-contract.md` | Backend selection + federation change-linking model | Prompt |
| `docs/harness-runtime.md` | Federated backend + atlas section | Prompt |

## Data Design

### `openspec/workspace.yaml` (coordinator atlas — supported subset)

```yaml
schema: workspace-federated
version: 1
members:
  - id: api
    path: ../services/api      # relative to coordinator workspace, or absolute
    role: backend
    openspec_root: openspec    # optional; default "openspec"
  - id: web
    path: ../apps/web
    role: frontend
contracts:
  - id: api-public-v1
    provider: api
    consumers: [web]
    surface: openapi           # free-form tag (where the contract truth lives)
```

Parser subset rule: top-level scalars; `members` and `contracts` as a list of maps with
scalar fields plus one inline list (`consumers`). Anything deeper is ignored with a
warning. This is exactly the shape `ospec-state.extractListSection` already handles for
`approvals`/`blocking_questions` (list-of-maps), extended with an inline list field.

### `openspec/changes/{coordinator-change}/federation.yaml` (change-linking record)

```yaml
federation_id: rollout-auth-v2
coordinator_change: rollout-auth-v2
slices:
  - member: api
    change: add-token-endpoint
  - member: web
    change: consume-token-endpoint
```

The coordinator change owns the cross-cutting `proposal.md`/`design.md`; each `slice`
points at a standard change folder inside that member repo. v1 reads and reconciles
slices; it does not create them in member repos.

### `openspec/config.yaml` — backend key

```yaml
artifact_store:
  backend: openspec            # openspec | workspace-federated (default openspec)
```

## Flow Design

### (a) Hook backend selection

```
Hook              config.yaml            artifact-store
 │ read openspec/config.yaml ──►│              │
 │◄─ artifact_store.backend ────│              │
 │ createArtifactStore({ mode, workspace }) ──►│
 │   (unknown/absent → "openspec" + warn)      │
 │◄────────── store ───────────────────────────│
 │ store.cachePath() / findActiveChanges() ... │
```

### (b) Federated findActiveChanges

```
federated store      workspace-atlas       member: api        coordinator
 │ parseAtlas() ─────►│                        │                  │
 │ resolveMembers() ─►│ fs-check each path     │                  │
 │◄─ [{api, root, reachable:true}, {ghost, reachable:false}]      │
 │ for reachable members:                      │                  │
 │   ospec-state.findActiveChanges(api/openspec) ──►│             │
 │◄─ tag source:"api" ────────────────────────────│              │
 │ + coordinator findActiveChanges() tag source:"." ──────────────►│
 │ concat + return (ghost skipped, warning recorded)              │
```

### (c) sdd-workspace impact

```
Orchestrator        sdd-workspace        workspace-atlas
 │ impact <change> ──►│                      │
 │                    │ parseAtlas() ───────►│
 │                    │ which member does change touch? (federation.yaml)
 │                    │ computeImpact(atlas, member) ──►│
 │◄─ affected: {provider ∪ consumers} ◄──────│
 │ Impact Advisory (askQuestions before planning cross-repo work)
```

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|
| Federation model | Overlay: coordinator atlas + standard member repos linked by `federation.yaml` | Central monorepo store owning all changes | Members stay fully functional standalone OpenSpec repos; zero migration; reuses all single-repo machinery |
| Member change discovery | Reuse `ospec-state.findActiveChanges` per member | Re-implement aggregated discovery | Identical semantics (archive skip, terminal skip, newest-first) for free; one tested code path |
| Atlas parsing | Hand-rolled constrained subset in `workspace-atlas.js` | Add a YAML dependency | Repo rule: `node:*` only, no package.json; `ospec-state` proves list-of-maps parsing suffices |
| v1 write boundary | Read + link only; `changeDirectory` stays coordinator-local | Coordinated multi-repo apply | Multi-repo write needs transactional semantics across repos — out of scope; keeps v1 safe and reviewable |
| Backend selection | Explicit `artifact_store.backend` config key | Auto-detect from `workspace.yaml` presence | Explicit is auditable and lets a coordinator repo hold an atlas without forcing federation on every hook run |
| Unreachable member | Fail-open skip + warning | Throw / block session | Hooks MUST never break the session (existing invariant); a moved sibling repo is an ops reality, not a fatal error |

## Testing Strategy — STRICT TDD for JS runtime

Test command: `node --test "scripts/**/*.test.js"`. RED-GREEN-REFACTOR mandatory for
runtime files; follow existing conventions (`node:test`, `assert/strict`, `mkdtemp`
fixtures with `t.after` cleanup, injected `now`).

| Surface | Verification | Approach |
|---|---|---|
| `workspace-atlas.js` `parseAtlas` | Unit (TDD) | members/contracts parse; unsupported nested shape ignored; empty/malformed → safe defaults |
| `workspace-atlas.js` `resolveMembers` | Unit (TDD) | relative vs absolute path; default `openspec_root`; missing path → `reachable:false` |
| `workspace-atlas.js` `computeImpact` | Unit (TDD) | provider→consumers; leaf member→self; multi-contract union |
| `artifact-store.js` federated ops | Unit (TDD) | aggregated `findActiveChanges` with `source` tags; member terminal exclusion; ghost skip non-fatal; `changeDirectory` coordinator-local; atlas-absent → `isInitialized:false` |
| `ospec-state.js` `readBackendMode` | Unit (TDD) | absent block → `openspec`; `workspace-federated`; unknown → `openspec` |
| hook backend selection | Unit (TDD) | each hook constructs the configured mode; openspec output unchanged (regression) |
| `sdd-workspace` trio, orchestrator advisory, docs | Review + sdd-verify | checklist vs `sdd-workspace` spec success criteria |
| Federated end-to-end | Manual scenario in verify | coordinator + 2 member fixtures: status → impact → aggregated recovery |

## Migration / Rollout

No migration; additive and config-gated. Existing single-repo repos are unaffected
(default `openspec`). Rollback = restore the federated not-implemented door, delete
`workspace-atlas.js` + the `sdd-workspace` trio, revert hook backend selection, and drop
the orchestrator advisory. The `openspec` regression suite is the gate that proves
non-regression.

## Open Questions

- [ ] None blocking for v1. Coordinated multi-repo **apply** (writing slices into member
      repos transactionally) is deliberately deferred to a follow-up change and is the
      natural next milestone once read+link proves out.
