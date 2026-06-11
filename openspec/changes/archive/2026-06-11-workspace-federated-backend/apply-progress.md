# Apply Progress: Workspace-Federated Artifact Backend

## Unit A — Runtime core (PR #1) — DONE

Branch: `feat/federated-runtime-core`. Strict TDD (RED→GREEN). Suite: 75/75 green.

| Phase | Status | Output |
|-------|--------|--------|
| 1 `workspace-atlas.js` | done | `scripts/lib/workspace-atlas.js` + `workspace-atlas.test.js` (8 tests): `parseAtlas`, `resolveMembers`, `computeImpact` |
| 2 `readBackendMode()` | done | `scripts/lib/ospec-state.js` (+ 4 tests); modes extracted to leaf `scripts/lib/artifact-store-modes.js` to avoid an import cycle |
| 3 Federated store ops | done | `scripts/lib/artifact-store.js`: real `isInitialized`/`findActiveChanges` (aggregated, `source`-tagged, fail-open member skip); coordinator surface shared by both modes |

Notes:
- The federated door is no longer "not implemented" for reads. Coordinator-local
  `readConfig`/`changeDirectory`/`writeSessionSummary` are shared with the openspec mode;
  only `isInitialized` + `findActiveChanges` are federation-specific.
- No behavior change for existing repos: hooks still construct `openspec` by default.
  Backend selection is Unit B.

## Unit B — Harness wiring (PR #2) — DONE

Branch: `feat/federated-runtime-core` (stacked). Strict TDD. Suite: 79/79 green.

Phase 4: added `createArtifactStoreFromConfig({ workspace, mode })` to
`artifact-store.js` — resolves the backend from the coordinator `openspec/config.yaml`
via `readBackendMode` (explicit `mode` overrides; absent/unknown → openspec), keeping
the config path inside the store (no path literals leak back into hooks). The four
stateful hooks (`session-start`, `pre-compact`, `stop`, `subagent-stop`) now construct
via this factory. New backend-selection tests on session-start, pre-compact, and stop;
subagent-stop wired for uniformity (no behavior change, guarded by regression).

## Unit C — Prompt surfaces (PR #3) — DONE

Branch: `feat/federated-runtime-core` (stacked). Review + sdd-verify (no JS, no TDD).
Runtime suite still 79/79 green (Markdown additions do not affect it; `sdd-workspace`
is excluded from the skill registry by the `sdd-*` rule).

Phase 5: `agents/sdd-workspace.agent.md`, `skills/sdd-workspace/SKILL.md`,
`commands/sdd-workspace.prompt.md` — `init`/`status`/`impact`, read-only to members,
confirm-before-write atlas.

Phase 6: orchestrator gains a Workspace Federation section (aggregated recovery +
Impact Advisory + read-and-link boundary) and `sdd-workspace` in its `agents` list;
`persistence-contract.md` documents backend selection, the atlas, and the
`federation.yaml` change-linking model; `docs/harness-runtime.md` reflects the
implemented federated reads; README gains a `/sdd-workspace` row.

All three units (A, B, C) of the planned change are applied. Pending: `sdd-verify`
checklist against the three specs, then `sdd-archive`.
