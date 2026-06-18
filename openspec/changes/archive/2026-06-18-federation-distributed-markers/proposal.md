# Proposal: Federation Distributed Markers (C1 — mechanism + workspace-explore)

## Intent

The federated route only activates when `artifact_store.backend: workspace-federated` is already set, and nothing sets it automatically: `sdd-init` never detects multirepo and never bridges to a federated flow. The current atlas (`openspec/workspace.yaml`) is the centralized canonical source with members fully read-only, which does not fit a distributed-traceability model. C1 builds the federation MECHANISM layer plus the `workspace-explore/classify` phase so the orchestrator can discover, classify, and enroll members from per-repo canonical markers. Decisions D1–D11 are CLOSED in `program.md`; this proposal implements them, it does not reopen them.

## Scope

### In Scope
- `.git` multirepo container detection (depth 1, dir or submodule file) — D1.
- `sdd-init` bridge: detect repo container → `status: blocked` + `question_gate` (federated-vs-normal) — D2.
- NEW `target_dir` capability so the orchestrator can drive per-member `sdd-init` — D3.
- Atlas inversion: distributed canonical marker `openspec/federation.member.yaml` as source of truth; `workspace.yaml` becomes a derived, gitignored, regenerable cache — D4/D5/D6.
- `enroll` operation: the ONLY sanctioned write into members, orchestrator-owned — D7.
- Derived state (`initialized`/`pending`, brownfield/greenfield) — D8; resumable bootstrap lot — D9.
- `workspace-explore/classify` phase: map repos, classify by type/layer/brownfield-greenfield/init-done, write markers + atlas cache + a human-readable map markdown.

### Out of Scope (C2–C5 / v2)
- `sdd-baseline` per-repo orchestration, general foundation + markitdown, cross-repo general baseline, roadmap/gaps.
- Dedicated coordinator repo implementation (only the D11 hybrid model is referenced; built in C3).
- Cross-cutting multi-repo change authoring (v2). Greenfield bootstrap beyond marking.

## Capabilities

### New Capabilities
- `federation-markers`: distributed canonical marker schema (D5), atlas-as-derived-cache with regeneration + latest-wins merge (D4/D6), `enroll` write (D7), derived state (D8), resumable bootstrap (D9).
- `workspace-explore`: discovery/classification phase producing markers, atlas cache, and a readable map artifact.

### Modified Capabilities
- `agents`: `sdd-init` agent gains the `target_dir` parameter contract (D3).
- `skills`: `sdd-init` gains multirepo detection + federated-vs-normal decision gate (D1/D2); `sdd-workspace` gains the `enroll` operation, relaxing its read-only hard rule (D7).

## Approach

Invert the canonical contract incrementally and test-first. Bifurcate atlas read logic: add marker readers/mergers in `workspace-atlas.js` and route `artifact-store.js` `loadAtlas()` to reconstruct from member markers, keeping `workspace.yaml` as a regenerable cache. Add `.git` detection + bridge gate to `sdd-init`, plus `target_dir`. Add `enroll` (orchestrator-owned member write) to `sdd-workspace`. Implement `workspace-explore/classify` to map, classify, and emit markers + cache + map. Detailed merge/timestamp and `target_dir` propagation mechanics are deferred to design.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/workspace-atlas.js` | Modified | Add `loadMarkerFromMember`, `mergeMarkersIntoAtlas`; atlas becomes derived |
| `scripts/lib/artifact-store.js` | Modified | `loadAtlas()` reconstructs from markers, cache fallback |
| `skills/sdd-init/SKILL.md` | Modified | Multirepo detection, bridge gate, `target_dir` |
| `skills/sdd-workspace/SKILL.md` | Modified | `enroll` operation; relax read-only |
| `agents/sdd-init.agent.md` | Modified | `target_dir` parameter |
| `openspec/specs/{agents,skills}/spec.md` | Modified | Delta specs |
| `.gitignore` | Modified | Ignore derived `workspace.yaml` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Contract inversion breaks tested code (`workspace-atlas.js`, `artifact-store.js` federated cases) | High | TDD-first regeneration tests; bifurcate reader/writer; keep `parseAtlas` for cache deserialization |
| `target_dir` is NEW in agent API; propagation unresolved | Med | Defer mechanism to design; flag as open decision |
| `enroll` inverts read-only; partial bootstrap inconsistency | Med | Resumable lot (D9); mark failed members `pending`; orchestrator-only writes |
| Atlas gitignore changes visibility; existing repos need migration | Med | Add `.gitignore` rule on init; document migration; treat `workspace.yaml` legacy as cache |
| Non-deterministic merge on equal `updated_at` | Med | Define resolution in design (fail-open warnings, timestamp precision) |

## Rollback Plan

Single-PR delivery: revert the merge commit to restore the centralized-atlas behavior in one step. Library and skill changes are repo-local and revert cleanly. The only out-of-repo side effect is markers written into member repos via `enroll`; document a cleanup note (delete `openspec/federation.member.yaml` per affected member, un-gitignore `workspace.yaml`). Because `workspace.yaml` is retained as a cache, reverting does not lose discovery data.

## Dependencies

- None external for C1. Anticipate the tasks forecast may exceed the 400-line budget and request `size:exception` (delivery strategy is `single-pr`).

## Success Criteria

- [ ] `sdd-init` detects a `.git` container and returns `blocked` + `question_gate` (federated-vs-normal).
- [ ] `sdd-init` accepts `target_dir` to operate outside cwd.
- [ ] Atlas regenerates from distributed markers; `workspace.yaml` is gitignored cache.
- [ ] `enroll` writes `openspec/federation.member.yaml` only at enroll, orchestrator-owned.
- [ ] `workspace-explore/classify` emits markers + atlas cache + readable map; classifies type/layer/brownfield-greenfield/init-done.
- [ ] New + refactored tests pass (`npm test`); no regression in non-federated paths.
