# Tasks: Federation Distributed Markers (C1 — mechanism + workspace-explore)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~580–650 net additions across 13 files |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Feature Branch Chain WU1 → WU2 → {WU3, WU4} → WU5, or single-pr with `size:exception` |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

> **Gate before apply.** `delivery_strategy: single-pr` + High budget risk requires a user decision.
> Options: (a) **Feature Branch Chain** — WU1→WU2→{WU3,WU4}→WU5, each PR targeting the previous
> branch; diff per PR stays focused and reviewable. (b) **size:exception** — single PR with
> maintainer approval. The orchestrator MUST capture this choice before `sdd-apply` starts.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| WU1 | `workspace-atlas.js` marker read/merge/serialize + `loadAtlas` regeneration | PR 1 | Base: feature/fed-markers; autonomously testable |
| WU2 | `federation-marker.js` `enroll` | PR 2 | Base: PR 1 branch; depends on WU1 `serializeAtlas` conventions |
| WU3 | `sdd-init` container detection + `target_dir` | PR 3a | Base: PR 2 branch; independent of WU1/WU2 logic |
| WU4 | `sdd-workspace` `enroll` + `explore` subcommand | PR 3b | Base: PR 2 branch; depends on WU1/WU2 |
| WU5 | `.gitignore`, `persistence-contract.md`, orchestrator note | PR 4 | Base: after PR 3a and PR 3b |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| Marker Schema — valid marker loaded | MUST | `federation-marker.js parseMarker` + `workspace-atlas.js loadMarkerFromMember` | covered-by-design | |
| Marker Schema — `remote` absent (fail-open warning) | SHOULD | `loadMarkerFromMember` emits warning; member included | covered-by-design | |
| Atlas Derived Cache — absent at load | MUST | `artifact-store.js loadAtlas` ENOENT branch → regenerate | covered-by-design | |
| Atlas Derived Cache — corrupt at load | MUST | `loadAtlas` parse-failure branch → regenerate + warning | covered-by-design | |
| Atlas Derived Cache — gitignored | MUST | `.gitignore` entry; git status must not show file | covered-by-design | |
| Atlas Derived Cache — git-tracked warn-on-detect | MUST | `loadAtlas` + `git ls-files`, fail-open; C1 NEVER auto-removes | covered-by-design | |
| Merge — latest-wins on conflict | MUST | `mergeMarkersIntoAtlas` latest `updated_at` wins | covered-by-design | |
| Merge — equal `updated_at` tiebreak | MUST | lex-ascending by source `member.id`; greater id wins; tie warning emitted | covered-by-design | Deterministic, OS-independent |
| Merge — malformed marker skipped fail-open | MUST | `mergeMarkersIntoAtlas` parse error → skip + warning, no abort | covered-by-design | |
| Enroll — first write | MUST | `federation-marker.js enroll`, atomic temp+rename | covered-by-design | |
| Enroll — idempotent, no `updated_at` refresh | MUST | content-minus-timestamp comparison; identical → no write | covered-by-design | |
| Enroll — update refreshes `updated_at` | MUST | changed-content path in `enroll` | covered-by-design | |
| Derived Member State — `initialized` | MUST | classify step: `openspec/config.yaml` present | covered-by-design | |
| Derived Member State — `pending` | MUST | classify step: marker present, no `config.yaml` | covered-by-design | |
| Impact Set — includes `provides[].consumers` | MUST | `mergeMarkersIntoAtlas` builds `contracts[]` `{id, provider, consumers}`; existing `computeImpact` reused | covered-by-design | |
| Impact Set — consumers empty (provider only) | MUST | empty `consumers[]` → impact = `{provider}` only | covered-by-design | |
| Resumable Bootstrap — partial failure | MUST | `sdd-workspace explore` per-member error handling; `workspace-map.md` records pending | covered-by-design | |
| Resumable Bootstrap — resumes from lot | MUST | idempotent `enroll` skips done members; `workspace-map.md` pending state | covered-by-design | |
| Container Detection — `.git` as directory | MUST | `scanMemberMarkers` depth-1 `stat` + `isDirectory` | covered-by-design | |
| Container Detection — `.git` as file (submodule/worktree) | MUST | same; `isFile` check | covered-by-design | |
| Container Detection — `.gitmodules` authoritative union | SHOULD | `scanMemberMarkers` parses `.gitmodules`, unions with filesystem scan | covered-by-design | |
| Container Detection — empty container (warning, no artifacts) | SHOULD | `scanMemberMarkers` empty → warning returned; caller skips artifact writes | covered-by-design | |
| Member Classification — microservice brownfield, init done | MUST | `sdd-workspace explore classify` | covered-by-design | |
| Member Classification — nuget common greenfield | MUST | same | covered-by-design | |
| Member Classification — type cannot be inferred (null + warning) | SHOULD | classify: `type: null` + per-member warning; member still in all artifacts | covered-by-design | |
| Explore Artifacts — 3 artifacts on success | MUST | enroll → scan → merge → write cache + write map | covered-by-design | |
| Explore Artifacts — partial enroll fail → pending in map | MUST | continue loop; failed member recorded `pending` in map; atlas from succeeded | covered-by-design | |
| `sdd-init` `target_dir` provided | MUST | `skills/sdd-init/SKILL.md` `## Parameters` block reading | covered-by-design | |
| `sdd-init` `target_dir` absent → cwd fallback | MUST | same; absent block → cwd | covered-by-design | |
| `sdd-init` `target_dir` non-existent → blocked | MUST | stat fails → `status: blocked` + `question_gate(invalid-path)`; no file writes | covered-by-design | |
| `sdd-init` multirepo container → blocked + question_gate | MUST | detection gate: no own `.git` + ≥2 child `.git` | covered-by-design | Gate before any artifact write |
| `sdd-init` single-repo — gate not triggered | MUST | own `.git` present → detection skipped | covered-by-design | |
| `sdd-init` <2 child repos — gate not triggered | MUST | threshold ≥2; below threshold → normal init | covered-by-design | |
| `sdd-workspace enroll` — marker written, success | MUST | `skills/sdd-workspace/SKILL.md` + `federation-marker.js enroll` | covered-by-design | |
| `sdd-workspace enroll` — idempotent, no timestamp refresh | MUST | same; identical data → `status: fresh` | covered-by-design | |

### Reconciliation Verdict

- MUST coverage: **complete** — 0 blockers
- SHOULD/MAY gaps: none blocking; all SHOULD scenarios have design allocation
- Ambiguities to track: none — amb-1..amb-4 closed in specs and design (2026-06-17)

---

## Phase 1: Regression Baseline

- [x] 1.1 Run `npm test` and confirm all existing tests pass; capture green output as the pre-change baseline — no file modifications.
- [x] 1.2 [NO-REGRESSION] Verify `scripts/lib/workspace-atlas.test.js` (parseAtlas, resolveMembers, computeImpact) and the 6 federated cases in `scripts/lib/artifact-store.test.js` pass without any modification — this proves the additive inversion leaves the valid-cache happy path intact.

## Phase 2: WU1 — workspace-atlas.js Marker Functions + loadAtlas Regeneration

- [x] 2.1 [TEST-RED] In `scripts/lib/workspace-atlas.test.js`, add failing tests for `loadMarkerFromMember`: valid `federation.member.yaml` → `{ok:true, marker}`; missing `remote` field → `{ok:true, marker}` + warning emitted; file not found → `{ok:false, warning}`; malformed YAML → `{ok:false, warning}`.
- [x] 2.2 [TEST-RED] In `scripts/lib/workspace-atlas.test.js`, add failing tests for `scanMemberMarkers`: child dir with `.git` as directory counted as member; child dir with `.git` as plain file counted identically; `.gitmodules` entries unioned with filesystem scan without duplicates; container with no child `.git` → empty array + warning.
- [x] 2.3 [TEST-RED] In `scripts/lib/workspace-atlas.test.js`, add failing tests for `mergeMarkersIntoAtlas`: union of all member entries from multiple markers; duplicate `member.id` → later `updated_at` wins; equal `updated_at` → lexicographic tiebreak (source `member.id` greater wins, tie warning emitted); re-run with same inputs → identical output; malformed marker skipped without abort; `provides: [{id, consumers, surface}]` → `contracts: [{id, provider:member.id, consumers}]`; `consumers: []` → impact set contains only the provider.
- [x] 2.4 [TEST-RED] In `scripts/lib/workspace-atlas.test.js`, add failing test: `serializeAtlas(atlas)` output fed into `parseAtlas` produces identical `members` and `contracts` (round-trip).
- [x] 2.5 [TEST-RED] In `scripts/lib/artifact-store.test.js`, add failing tests for `loadAtlas` on `workspace-federated` store: atlas absent (ENOENT) → regenerates from markers and writes `openspec/workspace.yaml`; atlas present but unparseable YAML → emits corrupt-cache warning then regenerates; atlas present and git-tracked (mocked `git ls-files` non-empty) → emits warning but loading continues normally; existing 6 federated tests MUST NOT be modified.
- [x] 2.6 Add `loadMarkerFromMember(memberRoot)` to `scripts/lib/workspace-atlas.js`: reads `{memberRoot}/openspec/federation.member.yaml`; parses with a dependency-free YAML subset (pattern matches the `parseAtlas` approach); emits per-member warning when `member.remote` is absent; returns `{ok:true, marker}` on success or `{ok:false, warning}` on any error.
- [x] 2.7 Add `scanMemberMarkers(containerRoot)` to `scripts/lib/workspace-atlas.js`: reads immediate children at depth 1 only (no recursion); for each child, `stat({child}/.git)` — count it as a member if `isDirectory()` OR `isFile()` (submodule/worktree); parses `{containerRoot}/.gitmodules` if present and unions declared paths; calls `loadMarkerFromMember` per discovered member; returns `[{memberDir, marker|error}]` and emits a warning if the array is empty.
- [x] 2.8 Add `mergeMarkersIntoAtlas(markers)` to `scripts/lib/workspace-atlas.js`: union all member entries across markers; on duplicate `member.id`, keep the entry with the later `updated_at`; on equal `updated_at`, the entry from the lexicographically greater SOURCE `member.id` wins and a tie-warning is emitted; parse errors are skipped with a warning (fail-open); converts `member.provides[{id,consumers,surface}]` from the winning entry to `contracts[{id, provider:member.id, consumers}]` — `provides[]` is adopted wholesale, no per-contract merge; returns `{atlas:{members,contracts}, warnings:[]}`.
- [x] 2.9 Add `serializeAtlas(atlas)` to `scripts/lib/workspace-atlas.js`: serializes `{members[], contracts[]}` to a YAML string that `parseAtlas` can parse and reproduce the same structure; `parseAtlas` function body MUST remain byte-identical (zero edits).
- [x] 2.10 Modify `createWorkspaceFederatedStore.loadAtlas()` in `scripts/lib/artifact-store.js`: on ENOENT or YAML parse failure (catch block), call `scanMemberMarkers` → `mergeMarkersIntoAtlas` → `serializeAtlas` → `fs.writeFile(atlasPath)` (mkdir -p beforehand); before returning from any code path (valid-cache or regenerated), run `git ls-files openspec/workspace.yaml` via `child_process.spawnSync` (fail-open: if git absent or command errors, skip silently) and emit a `console.warn` when the output is non-empty instructing the user to run `git rm --cached openspec/workspace.yaml`; valid-cache fast path (successful `parseAtlas` call) unchanged.
- [x] 2.11 Export `loadMarkerFromMember`, `scanMemberMarkers`, `mergeMarkersIntoAtlas`, `serializeAtlas` from `scripts/lib/workspace-atlas.js`.
- [x] 2.12 [NO-REGRESSION] Run `npm test` — all Phase 2 new tests pass; all Phase 1 baseline tests remain green.

## Phase 3: WU2 — federation-marker.js (Enroll)

> Depends on WU1 `serializeAtlas` conventions for the canonical YAML format.

- [x] 3.1 [TEST-RED] Create `scripts/lib/federation-marker.test.js` with failing tests: `enroll` first-write creates `{memberDir}/openspec/federation.member.yaml` with all supplied fields + `updated_at` set to current UTC; `enroll` called again with identical data → file NOT rewritten, `updated_at` NOT advanced (byte-stable); `enroll` called with changed `member.role` → file rewritten, `updated_at` refreshed; `parseMarker`/`serializeMarker` round-trip preserves all fields including `provides[]` sub-fields `{id, consumers, surface}`.
- [x] 3.2 Create `scripts/lib/federation-marker.js`: implement dependency-free `parseMarker(content)` for the `federation.member.yaml` YAML subset including `member.provides` as a list of maps with `{id, consumers[], surface}` sub-fields; implement `serializeMarker(data)` producing canonical YAML with `updated_at` as the last field.
- [x] 3.3 Implement `enroll(memberDir, data)` in `scripts/lib/federation-marker.js`: ensure `{memberDir}/openspec/` exists (mkdir -p); if existing marker present, read and parse it; strip `updated_at` from both the existing marker and the incoming data, compare the two normalized forms (deep-equality of the stripped objects); identical → return `{status:'fresh', path, updated_at}` with no write; different → set `data.updated_at = new Date().toISOString()`, serialize via `serializeMarker`, write atomically (write to a `.tmp` file beside the target, then `fs.rename`); return `{status:'written', path, updated_at}`.
- [x] 3.4 [NO-REGRESSION] Run `npm test` — all Phase 3 tests pass; Phases 1–2 tests remain green.

## Phase 4: WU3 — sdd-init Container Detection + target_dir

> WU3 and WU4 are independent of each other; both depend on WU1+WU2 being merged first.

- [x] 4.1 Modify `skills/sdd-init/SKILL.md`: insert a pre-execution resolution step — (a) read `target_dir` from the `## Parameters` prompt block (`target_dir: <path>` line); fall back to cwd when the block is absent or the key is missing; (b) if `target_dir` is present and `fs.stat` returns ENOENT → return `status: blocked` with `question_gate(invalid-path)`, no file writes; (c) after resolving a valid base path, perform depth-1 child scan: if the resolved path has no `.git` of its own AND has 2 or more immediate children each containing `.git` (directory OR file) → return `status: blocked` with `question_gate` listing exactly two options: `federated` and `normal`; gate fires before any artifact write; single-repo (own `.git` present) and <2-children cases fall through to the existing init flow unchanged.
- [x] 4.2 Modify `agents/sdd-init.agent.md`: add a `## Parameters` section documenting the `target_dir` contract — absent → cwd; present and valid → init scoped to that path; present and non-existent → blocked + question_gate; note that the orchestrator injects this block, NOT env vars or dynamic frontmatter.

## Phase 5: WU4 — sdd-workspace enroll + explore Subcommand

- [x] 5.1 [TEST-RED] Create `scripts/lib/federation-explore.test.js` with failing integration tests using `fs.mkdtemp` container fixtures: container with 3 members all classifiable → all 3 artifacts written (`federation.member.yaml` per member, `openspec/workspace.yaml`, `openspec/workspace-map.md`); second member `enroll` write fails → members 1+3 enrolled, member 2 recorded as `pending` in map with failure reason, atlas built from succeeded only; container with no child `.git` → no artifacts written + warning; child with `.git` as a plain file (worktree) → counted as a valid member; re-running explore on unchanged members → markers byte-stable (`updated_at` not advanced).
- [x] 5.2 Modify `skills/sdd-workspace/SKILL.md`: add `enroll` operation section — writes `openspec/federation.member.yaml` in the specified member dir via `federation-marker.js enroll`; MUST be idempotent; accessible only when the caller is the orchestrator; include the **operational caveat**: a new consumer that is added without re-enrolling its provider leaves the provider's contract graph stale in the atlas until the next `enroll` on that provider — document this in the skill and surface it in `workspace-map.md` warnings when relevant; add `explore`/`classify` subcommand section — depth-1 scan via `scanMemberMarkers`; classify each member on 4 dimensions (type, layer, brownfield/greenfield, init-done) using secondary manifests and filesystem probes; call `enroll` per member; per-member failure → log `pending` in map, continue; after all enrolls call `scanMemberMarkers` + `mergeMarkersIntoAtlas` + `serializeAtlas` → write `openspec/workspace.yaml`; write `openspec/workspace-map.md` listing every member with classification, derived state, and per-member warnings.
- [x] 5.3 Modify `agents/sdd-workspace.agent.md`: add `enroll` and `explore` entries to the subcommand table; annotate `enroll` as orchestrator-only; note the stale-graph caveat for consumers added without re-enrolling the provider.
- [x] 5.4 Modify `agents/sdd-orchestrator.agent.md`: add a Workspace Federation section noting markers-as-truth inversion, `sdd-workspace explore` as the federation front door, and D11 coordinator repo as a future interface (informational note only — not designed in C1).
- [x] 5.5 [NO-REGRESSION] Run `npm test` — all Phase 5 tests pass; Phases 1–3 tests remain green.

## Phase 6: WU5 — Docs, .gitignore, and Final Verification

- [ ] 6.1 Add `openspec/workspace.yaml` to `.gitignore`.
- [ ] 6.2 Modify `skills/_shared/persistence-contract.md`: add a section for the atlas-as-derived-cache inversion — markers (`openspec/federation.member.yaml` in member repos) are the sole source of truth; `openspec/workspace.yaml` is a regenerable cache; valid cache is trusted; absent or corrupt → regenerate; `git ls-files` warn-on-detect if tracked; C1 never executes `git rm --cached` or any destructive git operation automatically.
- [ ] 6.3 [NO-REGRESSION] Run full `npm test` suite — all phases green. Inspect `git diff scripts/lib/workspace-atlas.js` and confirm `parseAtlas` function body is byte-identical to pre-C1 baseline (only additive changes below the existing `module.exports` line are expected).
