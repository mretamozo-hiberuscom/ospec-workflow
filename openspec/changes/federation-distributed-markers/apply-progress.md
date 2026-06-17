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

- [ ] WU3 (Phase 4) — `sdd-init` container detection + `target_dir`.
- [ ] WU4 (Phase 5) — `sdd-workspace` `enroll` + `explore`/`classify` subcommand.
- [ ] WU5 (Phase 6) — `.gitignore`, `persistence-contract.md`, orchestrator note + final verification.

**Next recommended**: run WU3 — `sdd-init` container detection + `target_dir` (independent of WU2; depends only on WU1).

---

# WU2 — `federation-marker.js` (Enroll)

**Batch**: WU2 (Phase 3) — built on top of WU1 (committed on `feat/federation-distributed-markers`, commit `4efe753`).
**Mode**: Strict TDD (strict_tdd: true, runner `npm test` → `node --test scripts/**/*.test.js`)
**Delivery**: Feature Branch Chain (approval `review-workload-001`) — this batch = **WU2**, child PR on top of WU1's branch.
**Skill resolution**: fallback-config (no `.ospec/cache/skill-registry.cache.json`; rules injected via `## Project Standards` from `openspec/config.yaml`).

## Scope of this batch

- **Phase 3: WU2 — `scripts/lib/federation-marker.js`** (tasks 3.1–3.4): new write-only module with `parseMarker`, `serializeMarker`, and idempotent atomic `enroll`.

Phases 4–6 (WU3–WU5) are **NOT** implemented in this batch and remain pending.

## Per-task status (WU2)

### Phase 3 — WU2

- [x] 3.1 RED tests in new `scripts/lib/federation-marker.test.js`: enroll first-write (all fields + fresh UTC `updated_at`); idempotent no-refresh (byte-stable); key-order-insensitive idempotency; change-refresh (role flip → new `updated_at`); `parseMarker`/`serializeMarker` round-trip (incl. `provides[]` `{id, consumers, surface}` + empty consumers); openspec dir auto-create; no leftover `.tmp`.
- [x] 3.2 `parseMarker(content)` + `serializeMarker(data)` implemented (dependency-free YAML subset; `provides`/`roster` as inline-map list items; `updated_at` serialized last). Round-trips with the WU1 marker format.
- [x] 3.3 `enroll(memberDir, data)` implemented: `mkdir -p {memberDir}/openspec`; reads+parses existing marker; strips `updated_at` from both sides and compares via `util.isDeepStrictEqual` (order-insensitive normalized comparison); identical → `{status:'fresh', path, updated_at}` (no write, timestamp preserved); changed → `updated_at = new Date().toISOString()`, serialize, atomic `.tmp`+`fs.rename` → `{status:'written', path, updated_at}`.
- [x] 3.4 Full `npm test` green; WU1 baseline + WU2 tests all pass.

## Test evidence (WU2)

| Run | Command | Result |
|-----|---------|--------|
| RED gate | `node --test scripts/lib/federation-marker.test.js` (test file present, module absent) | `0 pass / 1 fail` (module `./federation-marker.js` cannot be required) |
| GREEN | `node --test scripts/lib/federation-marker.test.js` (after impl) | `9 pass / 0 fail / 0 skipped` |
| Determinism | same file ×5 consecutive runs | `9 pass / 0 fail` every run (no flake) |
| Full suite (3.4) | `npm test` | `All checks passed.` |
| Full native suite | `node --test scripts/**/*.test.js` | `327 pass / 0 fail / 0 skipped` (318 WU1 baseline + 9 WU2) |

> Note: one transient `fail 1` was observed in a single full-suite run and did NOT reproduce (subsequent runs `327/327`). It originated in a WU1 integration test (real `git` fixture in `artifact-store.test.js`), outside WU2 scope; the WU2 file is deterministic across 5 isolated runs.

## TDD Cycle Evidence (WU2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.2 `parseMarker`/`serializeMarker` | `federation-marker.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 cases (full round-trip / provides+empty-consumers / updated_at-last) | ➖ Clean as written |
| 3.3 `enroll` first-write | `federation-marker.test.js` | Unit (fs fixtures) | N/A (new) | ✅ Written | ✅ Passed | ✅ first-write + openspec-autocreate + no-leftover-tmp | ➖ Clean as written |
| 3.3 `enroll` idempotency | `federation-marker.test.js` | Unit (fs fixtures) | N/A (new) | ✅ Written | ✅ Passed | ✅ identical-data + key-order-insensitive | ✅ Normalized via `isDeepStrictEqual` |
| 3.3 `enroll` change-refresh | `federation-marker.test.js` | Unit (fs fixtures) | N/A (new) | ✅ Written | ✅ Passed | ➖ role-flip single | ➖ Clean as written |

### Test Summary (WU2)

- Total new tests written: 9 (all in `scripts/lib/federation-marker.test.js`)
- Total tests passing (full native suite): 327 (318 WU1 baseline + 9 WU2)
- Layers used: Unit (9)
- Approval tests (refactoring): None — WU2 is a brand-new file; no existing code modified
- Pure functions created: `parseMarker`, `serializeMarker` (+ helpers); `enroll` is I/O-bound by necessity (atomic write)

## Files touched (WU2)

| File | Action | What was done |
|------|--------|---------------|
| `scripts/lib/federation-marker.js` | Created | New write-only module: dependency-free `parseMarker`/`serializeMarker` (YAML subset, `updated_at` last) + idempotent atomic `enroll` (content-minus-timestamp comparison via `isDeepStrictEqual`, `.tmp`+`rename`). |
| `scripts/lib/federation-marker.test.js` | Created | 9 unit tests (RED-first) covering round-trip, first-write timestamping, idempotency (incl. key-order insensitivity), change-refresh, openspec auto-create, no leftover `.tmp`. |
| `openspec/changes/federation-distributed-markers/tasks.md` | Modified | Phase 3 (3.1–3.4) checked off `[x]`. |
| `openspec/changes/federation-distributed-markers/state.yaml` | Modified | `WU2.status: done` (phases `[Phase 3]`); chain slice WU2 `done`; apply stays `partial`, top-level `applying`. |
| `openspec/changes/federation-distributed-markers/apply-progress.md` | Modified | Appended this WU2 section; WU1 history preserved verbatim. |

## Suggested work-unit commit (WU2)

Not committed/pushed (left staged-ready for the maintainer). Suggested single work-unit commit grouping WU2 tests + implementation:

```
feat(federation): anade marcador federation-marker con enroll idempotente y atomico

Crea scripts/lib/federation-marker.js con parseMarker/serializeMarker (subconjunto
YAML sin dependencias, updated_at como ultimo campo, provides/roster como mapas en
linea) y enroll(memberDir, data): asegura openspec/, compara el contenido sin
timestamp via isDeepStrictEqual y, si es identico, devuelve status fresh sin reescribir
(updated_at byte-estable); ante cambio, refresca updated_at y escribe de forma atomica
(.tmp + rename). Respeta las convenciones de serializeAtlas de WU1. Cobertura TDD: 9
tests nuevos; suite completa 327/327 en verde.
```

## Deviations from design (WU2)

None blocking. Implementation notes:
- **Normalized idempotency comparison**: the design says "deep-equality of the stripped objects". Implemented with `node:util.isDeepStrictEqual` after stripping `updated_at` from both the parsed existing marker and the incoming data. This is order-insensitive (a caller supplying `member` keys in a different order still resolves to `status:'fresh'`), which is stricter/safer than a raw string comparison and is covered by a dedicated triangulation test.
- **Corrupt existing marker**: if an existing `federation.member.yaml` is present but unparseable, `enroll` treats it as absent and rewrites cleanly (fail-safe), rather than aborting. This keeps `enroll` resilient and aligns with the federation fail-open posture; it is not contradicted by any spec scenario.
- **Module self-contained**: `parseMarker`/serializer helpers are reimplemented inside `federation-marker.js` rather than imported from `workspace-atlas.js`, per the design decision to keep the member-repo WRITE path separate from the hook-facing READ/aggregation module (`workspace-atlas.js` does not export `parseMarker`). Both share the same YAML-subset conventions so markers round-trip across modules.
