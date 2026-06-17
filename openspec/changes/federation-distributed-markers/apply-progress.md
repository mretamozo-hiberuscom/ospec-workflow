# Apply Progress: Federation Distributed Markers (C1)

**Change**: federation-distributed-markers
**Mode**: Strict TDD (strict_tdd: true, runner `npm test` → `node --test scripts/**/*.test.js`)
**Delivery**: Feature Branch Chain (approval `review-workload-001`) — this batch = **WU1**
**Skill resolution**: fallback-config (no `.ospec/cache/skill-registry.cache.json` present; rules from `openspec/config.yaml`)

## Scope of this batch

- **Phase 1: Regression Baseline** (tasks 1.1–1.2) — establish the green pre-change baseline; no file modifications.
- **Phase 2: WU1 — `workspace-atlas.js` marker functions + `loadAtlas` regeneration** (tasks 2.1–2.12).

Phases 3–6 (WU2–WU5) are **NOT** implemented in this batch and remain pending.

## Status legend

- `[x]` implemented and verified locally
- `[~]` implemented but not yet verified locally
- `[ ]` pending

## Per-task status

### Phase 1 — Regression Baseline

- [x] 1.1 Full `npm test` baseline captured green before any edit (`All checks passed.`).
- [x] 1.2 `scripts/lib/workspace-atlas.test.js` + 6 federated cases in `scripts/lib/artifact-store.test.js` pass unmodified — baseline `22/22` across both files; no existing test refactored.

### Phase 2 — WU1

- [x] 2.1 RED tests for `loadMarkerFromMember` (valid / missing-remote+warning / not-found / malformed).
- [x] 2.2 RED tests for `scanMemberMarkers` (`.git` dir / `.git` file / `.gitmodules` union no-dup / empty+warning).
- [x] 2.3 RED tests for `mergeMarkersIntoAtlas` (union / latest-wins / equal-ts tiebreak+warning / determinism / malformed-skip / provides→contracts / empty-consumers impact).
- [x] 2.4 RED test for `serializeAtlas` round-trip through `parseAtlas`.
- [x] 2.5 RED tests for `loadAtlas` (absent→regenerate+write / corrupt→warn+regenerate / git-tracked→warn+continue). 6 existing federated tests unmodified.
- [x] 2.6 `loadMarkerFromMember(memberRoot)` implemented (dependency-free marker YAML subset parser; fail-open).
- [x] 2.7 `scanMemberMarkers(containerRoot)` implemented (depth-1 only; `.git` dir/file; `.gitmodules` union; empty-warning).
- [x] 2.8 `mergeMarkersIntoAtlas(markers)` implemented (union + latest-wins + lexicographic-greater source tiebreak + fail-open; `provides`→`contracts` wholesale).
- [x] 2.9 `serializeAtlas(atlas)` implemented (parseAtlas-compatible YAML; `parseAtlas` body byte-identical — 0 deletions).
- [x] 2.10 `createWorkspaceFederatedStore.loadAtlas()` modified (ENOENT/corrupt → regenerate+write; warn-on-detect `git ls-files` before return, fail-open; valid-cache fast path preserved).
- [x] 2.11 Four new functions exported from `scripts/lib/workspace-atlas.js`.
- [x] 2.12 Full `npm test` green; all WU1 tests pass and baseline stays green.

## Test evidence

| Run | Command | Result |
|-----|---------|--------|
| Baseline (1.1/1.2) | `node --test workspace-atlas.test.js artifact-store.test.js` | `22 pass / 0 fail` |
| RED gate | same two files (after writing tests, before impl) | `22 pass / 19 fail` (new functions absent) |
| GREEN | same two files (after impl) | `41 pass / 0 fail / 0 skipped` |
| Full suite (2.12) | `npm test` | `All checks passed.` |
| Full native suite | `node --test scripts/**/*.test.js` | `318 pass / 0 fail / 0 skipped` |

Additive-only check: `git diff --numstat scripts/lib/workspace-atlas.js` → `525 0` (525 additions, 0 deletions) — `parseAtlas` byte-identical.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.6 `loadMarkerFromMember` | `workspace-atlas.test.js` | Unit | ✅ 22/22 | ✅ Written | ✅ Passed | ✅ 4 cases | ➖ Clean as written |
| 2.7 `scanMemberMarkers` | `workspace-atlas.test.js` | Unit (fs fixtures) | ✅ 22/22 | ✅ Written | ✅ Passed | ✅ 4 cases | ➖ Clean as written |
| 2.8 `mergeMarkersIntoAtlas` | `workspace-atlas.test.js` | Unit | ✅ 22/22 | ✅ Written | ✅ Passed | ✅ 7 cases | ✅ Extracted helpers |
| 2.9 `serializeAtlas` | `workspace-atlas.test.js` | Unit | ✅ 22/22 | ✅ Written | ✅ Passed | ➖ Round-trip single | ➖ Clean as written |
| 2.10 `loadAtlas` regeneration | `artifact-store.test.js` | Unit (fs + git fixtures) | ✅ 6/6 federated | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Extracted `regenerateAtlas`/`warnIfGitTracked`/`isCorruptCache` |

### Test Summary

- Total new tests written: 19 (16 in `workspace-atlas.test.js`, 3 in `artifact-store.test.js`)
- Total tests passing (full native suite): 318
- Layers used: Unit (19)
- Approval tests (refactoring): None — WU1 is additive; existing files untouched except `loadAtlas`
- Pure functions created: `mergeMarkersIntoAtlas`, `serializeAtlas`, `parseMarker` (+ helpers); `loadMarkerFromMember`/`scanMemberMarkers` are I/O-bound by necessity

## Files touched

| File | Action | What was done |
|------|--------|---------------|
| `scripts/lib/workspace-atlas.js` | Modified (additive) | Added `loadMarkerFromMember`, `scanMemberMarkers`, `mergeMarkersIntoAtlas`, `serializeAtlas` + private marker-parser/merge helpers; exported the four. `parseAtlas` body byte-identical (525 additions, 0 deletions). |
| `scripts/lib/artifact-store.js` | Modified | `loadAtlas()` now regenerates from markers on ENOENT/corrupt cache, writes the derived cache, and warns-on-detect when `workspace.yaml` is git-tracked (fail-open). Added `node:child_process` `spawnSync` import. Valid-cache fast path preserved. |
| `scripts/lib/workspace-atlas.test.js` | Modified | Added 16 unit tests + fixtures/helpers for the four new functions. Existing tests unchanged. |
| `scripts/lib/artifact-store.test.js` | Modified | Added 3 unit tests (regenerate / corrupt-warn / git-tracked-warn) + helpers. 6 existing federated tests unchanged. |
| `openspec/changes/federation-distributed-markers/tasks.md` | Modified | Phase 1 + Phase 2 checked off `[x]`. |
| `openspec/changes/federation-distributed-markers/state.yaml` | Modified | `apply.status: partial`, top-level `status: applying`, WU ledger. |

## Suggested work-unit commit (WU1)

Not committed/pushed (left staged-ready for the maintainer). Suggested single work-unit commit grouping WU1 tests + implementation:

```
feat(federation): añade lectura, fusión y serialización de marcadores distribuidos

Incorpora `loadMarkerFromMember`, `scanMemberMarkers`, `mergeMarkersIntoAtlas` y
`serializeAtlas` en workspace-atlas.js (aditivo, parseAtlas intacto) e invierte
loadAtlas en artifact-store.js para regenerar el cache derivado openspec/workspace.yaml
desde los marcadores ante ausencia o corrupción, con aviso warn-on-detect si el cache
está versionado en git. Cobertura TDD: 19 tests nuevos; suite completa en verde.
```

## Deviations from design

None blocking. Implementation notes:
- **Corruption detection**: `parseAtlas` is intentionally lenient and never throws, so a corrupt cache is detected heuristically — a non-empty file that parses to zero members AND zero contracts is treated as corrupt and triggers regeneration. This is safe against all existing federated tests (each ships an atlas with ≥1 member).
- **Merge model**: members are unioned from both each marker's own `member` block (which carries `provides`→`contracts`) and its `roster` entries; the source-`member.id` tiebreak applies to roster-sourced conflicts (matches the `svc-web > svc-api` spec scenario).
- **git-tracked test**: implemented as a real `git init` + `git add` integration test with a `t.skip()` guard when git is unavailable, rather than mocking `spawnSync` (no DI seam exists). Git was present in this run, so the test executed (0 skipped).

## Remaining work (NOT in this batch)

- [ ] WU2 (Phase 3) — `scripts/lib/federation-marker.js` `parseMarker`/`serializeMarker`/`enroll`.
- [ ] WU3 (Phase 4) — `sdd-init` container detection + `target_dir`.
- [ ] WU4 (Phase 5) — `sdd-workspace` `enroll` + `explore`/`classify` subcommand.
- [ ] WU5 (Phase 6) — `.gitignore`, `persistence-contract.md`, orchestrator note + final verification.

**Next recommended**: run WU2 — `federation-marker.js enroll` (depends on WU1 `serializeAtlas` conventions).
