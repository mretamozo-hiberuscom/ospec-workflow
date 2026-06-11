# Tasks: Workspace-Federated Artifact Backend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 760–880 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Feature-branch chain: runtime core → harness wiring → prompt surfaces |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

> Estimate exceeds 400 lines and crosses runtime + prompt layers. Recommend three
> chained PRs so each slice has autonomous scope, its own tests, and a clean rollback.

### Suggested Work Units (chained PRs)

| Unit | Goal | Notes |
|------|------|-------|
| A (PR #1) | Runtime core: `workspace-atlas.js` + `readBackendMode` + federated store ops | Self-contained; all TDD; no behavior change until hooks wire it |
| B (PR #2) | Harness wiring: four hooks select backend from config | Depends on A; regression suite must stay green |
| C (PR #3) | Prompt surfaces: `sdd-workspace` trio + orchestrator advisory + convention/docs | Depends on A interface names; review + sdd-verify |

---

## Phase 1: Runtime — `workspace-atlas.js` (Strict TDD)

Verification: `node --test "scripts/**/*.test.js"`. 1.1 before 1.2.

- [x] 1.1 **[RED]** Add `scripts/lib/workspace-atlas.test.js`: `parseAtlas` parses members + contracts; ignores unsupported nested shape; empty/malformed content → `{ members: [], contracts: [] }`. `resolveMembers` resolves relative and absolute `path`, applies default `openspec_root: openspec`, marks a missing path `reachable: false`. `computeImpact` returns provider+consumers, leaf→self, multi-contract union.
- [x] 1.2 **[GREEN]** Add `scripts/lib/workspace-atlas.js` with `parseAtlas`, `resolveMembers`, `computeImpact` using `node:*` builtins only (mirror `ospec-state.js` parsers). Export all three. All tests green.

## Phase 2: Runtime — `readBackendMode()` (Strict TDD)

Verification: `node --test "scripts/**/*.test.js"`. Independent of Phase 1.

- [x] 2.1 **[RED]** Add tests in `scripts/lib/ospec-state.test.js`: `readBackendMode(content)` → `openspec` when `artifact_store` block absent; `workspace-federated` when set; `openspec` for an unknown value; tolerant of CRLF and comments.
- [x] 2.2 **[GREEN]** Add `readBackendMode(configContent)` to `scripts/lib/ospec-state.js` (indentation-scoped, mirrors `readStatus`); validate against `ARTIFACT_STORE_MODES`, fall back to `openspec` on unknown; add to `module.exports`. All tests green.

## Phase 3: Runtime — Federated store ops (Strict TDD)

Verification: `node --test "scripts/**/*.test.js"`. Depends on Phase 1.

- [x] 3.1 **[RED]** Extend `scripts/lib/artifact-store.test.js`: federated `isInitialized` true with atlas / false without; `findActiveChanges` unions coordinator + member changes with `source` tags; excludes member terminal states; skips an unreachable member without throwing; `changeDirectory` returns the coordinator path; derived paths unchanged.
- [x] 3.2 **[GREEN]** Replace the not-implemented federated branch in `scripts/lib/artifact-store.js` with real ops using `workspace-atlas.js` (`parseAtlas`/`resolveMembers`) and `ospec-state.findActiveChanges` per member; keep the derived surface shared; record skipped members as warnings on the return value, not exceptions. All tests green (including the existing openspec suite).

## Phase 4: Harness — hook backend selection (Strict TDD)

Verification: `node --test "scripts/**/*.test.js"`. Depends on Phases 2–3.

- [x] 4.1 **[RED]** Add cases to the four hook test files: with `artifact_store.backend: workspace-federated` the hook constructs a federated store; absent/unknown → `openspec`; existing openspec assertions remain unchanged (regression).
- [x] 4.2 **[GREEN]** In `session-start.js`, `pre-compact.js`, `stop.js`, `subagent-stop.js`: read config, resolve mode via `readBackendMode`, pass it to `createArtifactStore`. Keep the `mode` parameter override for tests. All tests green.

## Phase 5: Prompt — `sdd-workspace` trio

Verification: review + sdd-verify checklist against `sdd-workspace` spec. 5.1–5.3 independent.

- [x] 5.1 Create `agents/sdd-workspace.agent.md`: executor boundary (mirror `agents/sdd-foundation.agent.md`); reads `skills/sdd-workspace/SKILL.md` + `_shared/sdd-phase-common.md`; result contract; `blocked + question_gate` for atlas confirmation on `init`.
- [x] 5.2 Create `skills/sdd-workspace/SKILL.md`: `init` (scan siblings for `openspec/`, propose members, write atlas only on confirmation, update-not-overwrite), `status` (aggregated active changes + unreachable flagging), `impact <change>` (contract-graph affected members); read-only-to-members rule.
- [x] 5.3 Create `commands/sdd-workspace.prompt.md`: frontmatter (`name: sdd-workspace`, `agent: sdd-orchestrator`, `argument-hint: "<init|status|impact> [change]"`), routing prompt, `${input}` passthrough.

## Phase 6: Prompt — Orchestrator, convention, docs

Verification: review + sdd-verify. 6.1–6.3 independent.

- [x] 6.1 Modify `agents/sdd-orchestrator.agent.md`: federated recovery (resume from aggregated active changes when backend is federated) + **Impact Advisory** before a cross-repo change (run `sdd-workspace impact`, surface affected members via `askQuestions`); add `sdd-workspace` to the `agents` list.
- [x] 6.2 Modify `skills/_shared/persistence-contract.md`: document `artifact_store.backend` selection and the coordinator/atlas/`federation.yaml` change-linking model; clarify the v1 read-and-link boundary.
- [x] 6.3 Modify `docs/harness-runtime.md` (atlas + federated ops) and add a `/sdd-workspace` row to the `README.md` command table.
