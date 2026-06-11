# Proposal: Workspace-Federated Artifact Backend

## Intent

The harness now resolves all artifact paths through `scripts/lib/artifact-store.js`
(`createArtifactStore({ mode, workspace })`), with a real `openspec` adapter and a
**declared but unimplemented** `workspace-federated` door: its canonical operations
throw `does not implement … yet`. This change implements that backend so SDD can
coordinate a change that spans multiple repositories (microservices, microfrontends,
packages) without abandoning the single-repo machinery each member already uses.

`openspec` behavior stays byte-for-byte identical. Federation is an **overlay**: a
coordinator repo declares member repos in an atlas, each member stays a standard
OpenSpec repo, and the federated store aggregates a cross-repo view plus an impact
graph. Cross-repo **write** coordination (applying a slice in every repo at once) is
explicitly deferred to a future change; v1 delivers atlas, member resolution,
aggregated read, the federated change-linking model, and impact surfacing.

## Scope

### In Scope
- **Atlas** `openspec/workspace.yaml` in the coordinator repo: schema, members
  (`id`, `path`, `role`, optional `openspec_root`), and cross-repo `contracts`
  (`id`, `provider`, `consumers`, `surface`).
- **Federated adapter**: implement the deferred canonical ops in
  `createArtifactStore({ mode: "workspace-federated" })` — `isInitialized`,
  `readConfig`, `findActiveChanges` (aggregated + `source: {memberId}` tag),
  `changeDirectory`. Derived `.ospec/` ops stay workspace-local (already working).
- **Backend selection in the harness**: `artifact_store.backend: openspec | workspace-federated`
  in `openspec/config.yaml`; the four stateful hooks read it and construct the
  correct store. Default `openspec` — absent key is non-federated.
- **Federated change-linking model**: a coordinator change holds the cross-cutting
  `proposal.md`/`design.md` plus `federation.yaml` (member → slice change name);
  each member runs a standard change folder for its slice.
- **`sdd-workspace`** command/agent (front door): `init` (scaffold the atlas by
  scanning sibling repos), `status` (aggregated active changes across members),
  `impact <change>` (contract-graph affected members).
- **Fail-open federation**: missing atlas → behaves as uninitialized; an unreachable
  or non-OpenSpec member is skipped with a warning, never crashes a hook.

### Out of Scope
- Cross-repo **apply/verify/archive orchestration** (writing slices into every member
  in one run). v1 reads and links; coordinated multi-repo writes are a follow-up.
- Any change to the `openspec` adapter behavior or to `ospec-state.js` low-level IO.
- A package/dependency-graph resolver beyond the explicit `contracts` declared in the
  atlas (no automatic dependency inference v1).
- Remote members over a network (members are local filesystem paths v1).

## Capabilities

> Contract for sdd-spec. New domain `artifact-store-federated` is authored as a full
> spec (JS runtime). `sdd-session-hooks`, `sdd-orchestrator`, and the new
> `sdd-workspace` are specced as deltas/new prompt-layer capabilities.

### New Capabilities
- `artifact-store-federated`: atlas parsing, member resolution, aggregated
  `findActiveChanges`, fail-open member skipping. **JS runtime — Strict TDD.**
- `sdd-workspace`: atlas init/status/impact front door (agent + skill + command).

### Modified Capabilities
- `sdd-session-hooks`: hooks resolve backend mode from `artifact_store.backend` and
  construct the matching store.
- `sdd-orchestrator`: federated recovery spans members; an **Impact Advisory** runs
  before a cross-repo change using the contract graph.

## Approach

The coordinator repo holds `openspec/workspace.yaml`. The federated store resolves
each member's absolute OpenSpec root and reuses the **existing**
`ospec-state.findActiveChanges` per member, tagging results with `source: {memberId}`,
then concatenates the coordinator's own active changes. Atlas parsing reuses the
hand-rolled, dependency-free parser primitives already proven in `ospec-state.js`
(`extractListSection`, indentation-scoped scalars) — the repo forbids npm deps. The
hooks pick the backend by reading one config key before constructing the store;
everything downstream is the store contract, so no hook learns federation specifics.
Impact analysis walks the `contracts` graph: a change touching a provider flags its
consumers as affected.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/artifact-store.js` | Modified | Implement federated canonical ops; add atlas resolution |
| `scripts/lib/workspace-atlas.js` | New | Atlas parse + member/contract resolution (no deps) |
| `scripts/lib/artifact-store.test.js` | Modified | Federated canonical-op coverage |
| `scripts/lib/workspace-atlas.test.js` | New | Atlas parsing + impact graph (TDD) |
| `scripts/hooks/*.js` (4 stateful) | Modified | Resolve backend mode from config; construct store |
| `scripts/hooks/*.test.js` | Modified | Backend-selection coverage |
| `agents/sdd-workspace.agent.md` | New | Atlas front-door executor |
| `skills/sdd-workspace/SKILL.md` | New | init/status/impact protocol |
| `commands/sdd-workspace.prompt.md` | New | Entry point |
| `agents/sdd-orchestrator.agent.md` | Modified | Federated recovery + Impact Advisory |
| `skills/_shared/persistence-contract.md` | Modified | Backend selection + federation model |
| `openspec/config.yaml` schema | Modified | `artifact_store.backend` key |
| `docs/harness-runtime.md` | Modified | Federated backend section |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Atlas YAML grows beyond the hand-rolled parser's safe subset | Med | Constrain the supported subset (flat scalars + list-of-maps, two indent levels); spec the grammar; reject and warn on unsupported shapes rather than mis-parse |
| A member path is missing/moved → hook crash | Med | Member resolution is fail-open: unreachable or non-OpenSpec members are skipped with a `runtime_observability` warning; session never breaks |
| Federated change drifts from member slices | Med | `federation.yaml` is the single link record; `sdd-workspace status` reconciles by reading each member's actual active changes |
| Backend misconfig (federated key but no atlas) | Low | `isInitialized()` false when atlas absent → harness treats repo as uninitialized, same as a fresh openspec repo |
| Scope creep into multi-repo writes | Med | Out-of-scope is explicit; v1 store exposes read+resolve only; `changeDirectory` returns the coordinator path, never a member's |

## Rollback Plan

Additive and gated by config. To revert: set/leave `artifact_store.backend: openspec`
(or remove the key), delete `scripts/lib/workspace-atlas.js`, restore the federated
branch in `artifact-store.js` to the not-implemented door, drop the `sdd-workspace`
trio and the orchestrator Impact Advisory. No member repo is mutated by v1, so there is
nothing to migrate back. `openspec/workspace.yaml` can be deleted without affecting any
member's changes or archives.

## Dependencies

- Builds directly on the shipped `artifact-store.js` adapter and the `ospec-state.js`
  parser/`findActiveChanges` primitives. No external dependencies.

## Success Criteria

- [ ] `createArtifactStore({ mode: "workspace-federated" })` resolves members from
      `openspec/workspace.yaml` and aggregates active changes tagged by `source`.
- [ ] A missing atlas yields `isInitialized() === false`; an unreachable member is
      skipped with a warning and the session continues.
- [ ] The four stateful hooks select the backend from `artifact_store.backend` and
      otherwise behave identically; all existing tests stay green.
- [ ] `sdd-workspace init` scaffolds a valid atlas; `status` lists active changes per
      member; `impact <change>` lists affected members from the contract graph.
- [ ] `openspec` behavior is unchanged (regression suite green); the federated store
      never writes into a member repo in v1.
