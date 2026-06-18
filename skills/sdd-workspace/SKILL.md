---
name: sdd-workspace
description: "Trigger: sdd workspace, federated, multi-repo, atlas, cross-repo impact, artifact_store.backend workspace-federated. Manage the federation atlas and surface cross-repo state."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `sdd-workspace` sub-agent. This skill is for EXECUTORS only.

## Activation Contract

Run this phase when the user invokes `/sdd-workspace`, or when a cross-repo change needs
the federation atlas (`artifact_store.backend: workspace-federated`). You are the
executor: do the work yourself, do not delegate.

The harness backend is resolved from `openspec/config.yaml` `artifact_store.backend`.
The atlas at `openspec/workspace.yaml` is the coordinator's declaration of member repos
and cross-repo contracts (see `_shared/persistence-contract.md`).

## Hard Rules

- **`enroll` is the ONLY member write (D7)**: the sole sanctioned write into a member
  repo is `openspec/federation.member.yaml` via the `enroll` operation. Every OTHER
  member-repo interaction MUST stay read-only. Coordinator-side writes remain limited to
  `openspec/workspace.yaml`, `openspec/workspace-map.md`, and (on `init` confirmation)
  `artifact_store.backend` in `openspec/config.yaml`.
- **`enroll` is orchestrator-only**: accept `enroll` (and `explore`, which calls it) only
  when the caller is the orchestrator. Never self-trigger marker writes.
- **Update, never clobber**: on `init` re-run, read the existing atlas and append/merge
  members; never drop members the user did not ask to remove.
- **Confirm before writing the atlas**: `init` MUST return `blocked` with a
  `question_gate` carrying the proposed member list; only write after approval.
- **Fail-open reporting**: an unreachable or non-OpenSpec member is reported as
  unreachable, never a hard error — `status`/`impact`/`explore` still complete.
- **Atlas is a derived cache**: `openspec/workspace.yaml` is regenerated from the
  member markers; it is never the source of truth (see `_shared/persistence-contract.md`).
- **v1 is read-and-link (plus enroll)**: beyond `enroll`, do not create or apply changes
  inside member repos. Cross-repo content writes are out of scope.

## Decision Gates

| Condition | Action |
|---|---|
| `init`, no atlas yet | Scan siblings → propose members → return `blocked/question_gate`. |
| `init`, atlas exists | Read it; propose additions/edits → confirm → merge-write. |
| `enroll`, caller is the orchestrator | Write `openspec/federation.member.yaml` in the member dir (idempotent). |
| `enroll`, identical data already on disk | Return `success`/`fresh`; do NOT rewrite, do NOT refresh `updated_at`. |
| `explore`, container with ≥1 member | Classify → `enroll` each → regenerate atlas + map. |
| `explore`, empty container (no child `.git`) | Return a warning; write NO artifacts. |
| `status` | Aggregate active changes across reachable members; flag unreachable. |
| `impact`, change touches a provider | List provider plus its contract consumers. |
| `impact`, no contract for the touched member | Report the member affects only itself. |

## Execution Steps

### `init`

1. Scan sibling directories of the coordinator workspace for candidate members: a
   directory containing an `openspec/` root.
2. Propose a member list: `id` (directory name), `path` (relative to the coordinator),
   and a guessed `role` for the user to confirm or edit.
3. Return `status: blocked` with `question_gate` containing the proposed members. Do
   NOT write the atlas yet.
4. On relaunch with the approved/edited list:
   - Read any existing `openspec/workspace.yaml`; merge the approved members (preserve
     existing entries and `contracts`).
   - Write `openspec/workspace.yaml` in the supported subset (see Atlas Format).
   - Optionally set `artifact_store.backend: workspace-federated` in
     `openspec/config.yaml` (preserve all other keys) when the user opts in.
   - Return `success` with `next_recommended: sdd-workspace status`.

### `enroll`

> Orchestrator-only. Writes the canonical member marker — the federation source of truth.

1. Accept the operation only when the caller is the orchestrator and member data is
   supplied (`member.id` at minimum; optionally `role`, `type`, `layer`, `remote`,
   `provides`).
2. Call `enroll(memberDir, data)` from `scripts/lib/federation-marker.js`. It writes
   `{memberDir}/openspec/federation.member.yaml` atomically.
3. **Idempotency**: `enroll` strips `updated_at`, compares the normalized content to any
   existing marker, and when they match it returns `{ status: 'fresh' }` WITHOUT rewriting
   the file and WITHOUT refreshing `updated_at` (byte-for-byte stable). Content changes
   return `{ status: 'written' }` with a fresh `updated_at`.
4. Return `success` with the marker path in `artifacts`.

> **Operational caveat (stale contract graph)**: a member's `provides[]` declares both its
> contracts and their `consumers`. A NEW consumer that is added without re-enrolling its
> PROVIDER leaves the provider's contract graph stale in the atlas until the next `enroll`
> on that provider. Surface this caveat in `workspace-map.md` warnings whenever a consumer
> references a provider whose marker has not been re-enrolled.

### `explore` / `classify`

> Realizes the `workspace-explore` phase. Executable backbone: `scripts/lib/federation-explore.js` `explore(containerRoot)`.

1. **Discover** members at depth 1 via `scanMemberMarkers` — a child is a member when it
   has `.git` as a directory OR a plain file (worktree/submodule); `.gitmodules` paths are
   unioned in. No recursion beyond depth 1.
2. If no member is found, return a warning and write NO artifacts (empty container).
3. **Classify** each member on four dimensions, reading secondary manifests and probing the
   filesystem:
   - `type` \u2014 `microservicio` / `microfrontal` / `nuget` (e.g. `*.csproj` \u2192 `nuget`,
     `package.json`/`go.mod` \u2192 `microservicio`); undeterminable \u2192 `null` + per-member warning.
   - `layer` \u2014 `dominio` / `common` (directory convention or manifest); undeterminable \u2192 warning.
   - brownfield/greenfield \u2014 `brownfield` when non-scaffolding source files exist.
   - init-done \u2014 `true` when `openspec/config.yaml` is present.
4. **Enroll** each member via `enroll` (idempotent). A per-member enroll failure is recorded
   as `pending` with its reason and the loop CONTINUES \u2014 it never aborts the run.
5. After all enrolls, regenerate the derived cache: `scanMemberMarkers` \u2192
   `mergeMarkersIntoAtlas` \u2192 `serializeAtlas` \u2192 write `openspec/workspace.yaml`. The atlas
   is built from the markers that were actually written (failed members are excluded).
6. Write `openspec/workspace-map.md` listing EVERY discovered member with its
   classification, derived state (`initialized`/`pending`), enroll outcome, and per-member
   warnings \u2014 including members whose enroll failed (recorded inline as `pending`).
7. Return `success` with the three artifact types in `artifacts` (per-member markers, atlas
   cache, map markdown).

### `status`

1. Parse `openspec/workspace.yaml`. For each member, resolve its OpenSpec root
   (`path` + `openspec_root`, default `openspec`).
2. For each reachable member, list active changes (exclude `archive/` and terminal
   states), tagged by member id; tag coordinator changes `source: "."`.
3. Flag members whose root is missing or has no `changes/` directory as unreachable.
4. Return `success` with the per-member report inline. Writes nothing.

### `impact <change>`

1. Determine which member the change touches (from the change's `federation.yaml`
   slices, or the user-named member).
2. Walk `contracts`: the affected set is the touched member plus the `consumers` of
   every contract whose `provider` is that member.
3. Return `success` with the affected member set so the orchestrator can scope reviewer
   load before planning. Writes nothing.

## Atlas Format (supported subset)

```yaml
schema: workspace-federated
version: 1
members:
  - id: api
    path: ../services/api      # relative to the coordinator workspace, or absolute
    role: backend
    openspec_root: openspec    # optional; default "openspec"
  - id: web
    path: ../apps/web
    role: frontend
contracts:
  - id: api-public-v1
    provider: api
    consumers: [web]
    surface: openapi           # free-form tag for where the contract truth lives
```

Keep the atlas within this subset (top-level scalars, `members` and `contracts` as a
list of maps, an inline `consumers` list). Deeper nesting is ignored by the harness
parser — do not rely on it.

## Output Contract

Return `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, and
`skill_resolution`. For `init`, include `question_gate` with the proposed member list
before any write.
