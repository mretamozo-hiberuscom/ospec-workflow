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

---

# WU3 — `sdd-init` Container Detection + `target_dir`

**Batch**: WU3 (Phase 4) — built on top of WU1 (`4efe753`) and WU2 (`f30ab07`) on `feat/federation-distributed-markers`. Per the WU2 return and `state.yaml` chain, WU3 depends only on WU1 and is independent of WU2.
**Mode**: Strict TDD (strict_tdd: true, runner `npm test` → `node scripts/check.js` → `node --test scripts/**/*.test.js` + 4 target generators).
**Delivery**: Feature Branch Chain (approval `review-workload-001`) — this batch = **WU3**, child PR on top of WU1's branch.
**Skill resolution**: fallback-config (no `.ospec/cache/skill-registry.cache.json`; rules injected via `## Project Standards` from `openspec/config.yaml`).

## Scope of this batch

- **Phase 4: WU3 — `sdd-init` federated bridge** (tasks 4.1–4.2): document the `target_dir`
  resolution (`## Parameters` block, cwd fallback, ENOENT → blocked) and the depth-1 multirepo
  container-detection gate (no own `.git` + ≥2 child `.git` → blocked + `federated|normal`
  question_gate) in the two source-of-truth markdown files.

Phases 5–6 (WU4–WU5) are **NOT** implemented in this batch and remain pending.

## Per-task status (WU3)

### Phase 4 — WU3

- [x] 4.1 `skills/sdd-init/SKILL.md` — added a `## Pre-Execution: Federated Bridge` section with Step 0a (resolve `target_dir` from the `## Parameters` block; absent/missing → cwd; present + ENOENT → `status: blocked` + `question_gate(invalid-path)`, no writes) and Step 0b (depth-1 child scan; no own `.git` AND ≥2 children with `.git` dir/file → `status: blocked` + `question_gate` with exactly `federated`/`normal`, before any artifact write; own `.git` and <2 children fall through to normal init).
- [x] 4.2 `agents/sdd-init.agent.md` — added a `## Parameters` section documenting the `target_dir` contract (absent → cwd; present + valid → init scoped to that path; present + non-existent → `status: blocked` + `question_gate`), and the note that the orchestrator injects the block — NOT env vars, NOT dynamic frontmatter.

## TDD note (documentation-contract deliverable)

WU3 changes no executable code — the deliverable is the documented behavior contract inside
two markdown files. Following the repo's existing markdown content-contract test pattern
(`scripts/docs-lint.test.js`, `scripts/manifest-sync.test.js`), the contract was pinned with a
new `node --test` file `scripts/sdd-init-federation.test.js` that asserts the required
behavioral tokens are present in `skills/sdd-init/SKILL.md` and `agents/sdd-init.agent.md`.
Tests were written RED-first against the not-yet-written contract.

## Test evidence (WU3)

| Run | Command | Result |
|-----|---------|--------|
| RED gate | `node --test scripts/sdd-init-federation.test.js` (file present, contract absent) | `0 pass / 10 fail` |
| GREEN (intermediate) | same, after first SKILL/agent edits | `8 pass / 2 fail` (two regex-order mismatches in the prose) |
| GREEN | same, after wording fixes (contiguous `two or more (≥2) … .git`, `absent → cwd`, `no own .git`) | `10 pass / 0 fail / 0 skipped` |
| Full suite (4.x) | `npm test` (`node scripts/check.js`) | `All checks passed.` (4 targets generate + validate; `0 errors, 0 warnings`) |
| Full native suite | `node --test scripts/**/*.test.js` | `337 pass / 0 fail / 0 skipped` (327 WU1+WU2 baseline + 10 WU3) |

> The known WU1 `git` integration flake in `artifact-store.test.js` did NOT appear this run
> (full native suite `337/337` clean). It is outside WU3 scope.

## TDD Cycle Evidence (WU3)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 `SKILL.md` federated bridge | `sdd-init-federation.test.js` | Unit (content contract) | N/A (new test file) | ✅ Written | ✅ Passed | ✅ 7 cases (target_dir / cwd-fallback / ENOENT-blocked+invalid-path / depth-1+no-own-.git+≥2 / federated+normal / before-any-write / single-repo fall-through) | ➖ Prose only |
| 4.2 `agent.md` `## Parameters` | `sdd-init-federation.test.js` | Unit (content contract) | N/A (new test file) | ✅ Written | ✅ Passed | ✅ 3 cases (## Parameters+target_dir / absent→cwd+valid→scoped+missing→blocked / orchestrator-injects + not-env-var/frontmatter) | ➖ Prose only |

### Test Summary (WU3)

- Total new tests written: 10 (all in `scripts/sdd-init-federation.test.js`)
- Total tests passing (full native suite): 337 (327 WU1+WU2 baseline + 10 WU3)
- Layers used: Unit / content-contract (10)
- Approval tests (refactoring): None — WU3 only adds new doc sections; no existing test modified
- Pure functions created: None — WU3 is a documentation-contract deliverable (no executable code)

## Files touched (WU3)

| File | Action | What was done |
|------|--------|---------------|
| `skills/sdd-init/SKILL.md` | Modified (additive) | Added `## Pre-Execution: Federated Bridge` section (Step 0a `target_dir` resolution + Step 0b multirepo container-detection gate). Existing sections untouched. |
| `agents/sdd-init.agent.md` | Modified (additive) | Added a `## Parameters` section documenting the `target_dir` contract + orchestrator-injection note. Existing sections untouched. |
| `scripts/sdd-init-federation.test.js` | Created | 10 RED-first content-contract tests pinning the WU3 behavior in the two markdown files. |
| `openspec/changes/federation-distributed-markers/tasks.md` | Modified | Phase 4 (4.1–4.2) checked off `[x]`. |
| `openspec/changes/federation-distributed-markers/state.yaml` | Modified | `WU3.status: done` (phases `[Phase 4]`); chain slice WU3 `done`; apply stays `partial`, top-level `applying`. |
| `openspec/changes/federation-distributed-markers/apply-progress.md` | Modified | Appended this WU3 section; WU1 + WU2 history preserved verbatim. |

## Suggested work-unit commit (WU3)

Not committed/pushed (left staged-ready for the maintainer). Suggested single work-unit commit grouping the WU3 contract test + the two documentation edits:

```
feat(federation): puente federado de sdd-init con target_dir y deteccion de contenedor multirepo

Documenta en skills/sdd-init/SKILL.md el paso de pre-ejecucion: resuelve target_dir desde el
bloque ## Parameters (ausente o clave faltante -> cwd; presente con ENOENT -> status blocked +
question_gate invalid-path, sin escrituras) y la puerta de deteccion de contenedor a profundidad
1 (sin .git propio Y >=2 hijos con .git de tipo directorio o archivo -> status blocked +
question_gate con las opciones federated/normal, antes de cualquier escritura; repo unico con
.git propio y <2 hijos continuan el flujo normal). Anade en agents/sdd-init.agent.md la seccion
## Parameters con el contrato de target_dir (ausente -> cwd; valido -> init acotado a esa ruta;
inexistente -> blocked + question_gate) y la nota de que el orquestador inyecta el bloque, no
variables de entorno ni frontmatter dinamico. Fija el contrato con scripts/sdd-init-federation.test.js
(10 tests de contenido RED-first). Cobertura TDD: 10 tests nuevos; suite completa 337/337 en verde.
```

## Deviations from design (WU3)

None blocking. Implementation notes:
- **Contract-as-tests for a docs deliverable**: WU3 has no executable code, so strict TDD was
  honored by writing a content-contract test (`scripts/sdd-init-federation.test.js`) RED-first,
  asserting the required behavioral tokens in the two markdown files. This mirrors the repo's
  established markdown content-contract tests (`docs-lint.test.js`, `manifest-sync.test.js`) and
  gives the verify phase an executable gate for the WU3 behavior.
- **Wording tuned to the contract regexes**: two prose phrasings were adjusted during GREEN so
  the contract tokens read contiguously (`two or more (≥2) … .git`, `no own .git`, `absent → cwd`)
  — no behavioral change, only word order, so the documented contract and its test agree.
- **No generator/agent regeneration needed in-repo**: `agents/*.agent.md` + `skills/**` are the
  source of truth; the 4-target generators (claude/vscode/github-copilot/opencode) ran inside
  `npm test` and validated the edits (`0 errors, 0 warnings`). No committed `dist/` exists to update.

## Remaining work (NOT in this batch)

- [ ] WU4 (Phase 5) — `sdd-workspace` `enroll` + `explore`/`classify` subcommand (depends on WU1+WU2).
- [ ] WU5 (Phase 6) — `.gitignore`, `persistence-contract.md`, orchestrator note + final verification (depends on WU1–WU4).

**Next recommended**: run WU4 — `sdd-workspace` `enroll` + `explore` subcommand (depends on WU1+WU2, both already committed).

---

# WU4 — `sdd-workspace` enroll + explore Subcommand

**Batch**: WU4 (Phase 5) — built on top of WU1 (`4efe753`), WU2 (`f30ab07`), WU3 (`06462da`) on `feat/federation-distributed-markers`. Per the chain, WU4 depends on WU1+WU2 (both already committed).
**Mode**: Strict TDD (strict_tdd: true, runner `npm test` → `node scripts/check.js` → `node --test scripts/**/*.test.js` + 4 target generators).
**Delivery**: Feature Branch Chain (approval `review-workload-001`) — this batch = **WU4**, child PR on top of WU2's branch.
**Skill resolution**: fallback-config (no `.ospec/cache/skill-registry.cache.json`; rules injected via `## Project Standards` from `openspec/config.yaml`).

## Scope of this batch

- **Phase 5: WU4 — `sdd-workspace` `enroll` + `explore`/`classify` subcommand** (tasks 5.1–5.5):
  the executable backbone `scripts/lib/federation-explore.js` (discover → classify → enroll →
  regenerate atlas + map) plus the skill/agent documentation for `enroll` and `explore`.

Phase 6 (WU5) is **NOT** implemented in this batch and remains pending.

## Per-task status (WU4)

### Phase 5 — WU4

- [x] 5.1 RED-first integration tests in new `scripts/lib/federation-explore.test.js` (`fs.mkdtemp` container fixtures): 3-members-all-classifiable → 3 artifact types written + atlas has all ids; node-service classified `microservicio`/`dominio`/brownfield; csproj-only classified `nuget`/`common`/greenfield; undeterminable stack → `type: null` + per-member warning, member still enrolled; `.git`-as-plain-file (worktree) counted as a member; empty container → no artifacts + warning; partial enroll failure (`openspec` is a file) → member recorded `pending` with reason, atlas built from survivors only; re-run → marker byte-stable (`updated_at` not advanced, enroll `fresh`); `classifyMember` shared-dir → `layer: common`.
- [x] 5.2 `skills/sdd-workspace/SKILL.md` — relaxed Hard Rules to allow the single `enroll` member write (D7, orchestrator-only); added `enroll` execution-step (idempotent, byte-stable) with the **stale contract-graph operational caveat**; added `explore`/`classify` execution-step (depth-1 `scanMemberMarkers` → 4-dimension classify → per-member `enroll` → `mergeMarkersIntoAtlas` → `serializeAtlas` → write `workspace.yaml` + `workspace-map.md`; per-member failure → `pending`, continue; empty container → no artifacts); extended the Decision Gates table.
- [x] 5.3 `agents/sdd-workspace.agent.md` — added `enroll`/`explore` to the subcommand list (enroll annotated orchestrator-only, idempotent; explore partial-failure semantics); relaxed the member READ-ONLY artifact note to the D7 `enroll` exception; added the stale-graph caveat; updated the Result Contract `artifacts`/`risks` lines.
- [x] 5.4 `agents/sdd-orchestrator.agent.md` — extended the `Workspace Federation` section: markers-as-truth (C1 inversion), atlas-as-derived-cache, `enroll` as the only member write, `sdd-workspace explore` as the federation front door, and a D11 coordinator-repo informational note (NOT designed in C1).
- [x] 5.5 Full `npm test` green; WU1–WU3 baseline + WU4 tests all pass.

## Test evidence (WU4)

| Run | Command | Result |
|-----|---------|--------|
| Safety-net baseline | `node --test workspace-atlas.test.js federation-marker.test.js artifact-store.test.js` | `50 pass / 0 fail` |
| RED gate | `node --test scripts/lib/federation-explore.test.js` (test present, module absent) | `0 pass / 1 fail` (module `./federation-explore.js` cannot be required) |
| GREEN | `node --test scripts/lib/federation-explore.test.js` (after impl) | `9 pass / 0 fail / 0 skipped` |
| Full suite (5.5) | `npm test` (`node scripts/check.js`) | `All checks passed.` (4 targets generate + validate; `0 errors, 0 warnings`) |
| Full native suite | `node --test scripts/**/*.test.js` | `346 pass / 0 fail / 0 skipped` (337 WU1+WU2+WU3 baseline + 9 WU4) |

> The known WU1 `git` integration flake in `artifact-store.test.js` did NOT appear this run
> (full native suite `346/346` clean). It is outside WU4 scope.

## TDD Cycle Evidence (WU4)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5.1 `explore` artifacts/partial/empty/worktree/idempotent | `federation-explore.test.js` | Integration (fs container fixtures) | ✅ 50/50 | ✅ Written | ✅ Passed | ✅ 9 cases (3-artifacts / micro+dominio+brownfield / nuget+common+greenfield / type-null+warning / worktree-file / empty-container / partial-fail+pending / byte-stable re-run / shared-dir layer) | ➖ Clean as written |
| 5.1 `classifyMember` | `federation-explore.test.js` | Unit (fs probes) | ✅ 50/50 | ✅ Written | ✅ Passed | ✅ type micro/nuget/null + layer dominio/common + brownfield true/false | ✅ Extracted `detectType`/`deriveLayer`/`hasSourceFiles` helpers |
| 5.2–5.4 skill/agent contract | `skills/sdd-workspace/SKILL.md`, `agents/*.agent.md` | Doc contract | N/A | ➖ Prose | ✅ `npm test` validators green | ➖ Prose only | ➖ Prose only |

### Test Summary (WU4)

- Total new tests written: 9 (all in `scripts/lib/federation-explore.test.js`)
- Total tests passing (full native suite): 346 (337 WU1+WU2+WU3 baseline + 9 WU4)
- Layers used: Integration (8), Unit (1)
- Approval tests (refactoring): None — WU4 adds a new module + additive doc sections; no existing test modified
- Pure functions created: `detectType`, `deriveLayer`, `renderWorkspaceMap` (+ helpers); `classifyMember`/`explore` are I/O-bound by necessity (filesystem discovery + atomic enroll)

## Files touched (WU4)

| File | Action | What was done |
|------|--------|---------------|
| `scripts/lib/federation-explore.js` | Created | Executable backbone of the `explore`/`classify` subcommand: `classifyMember` (type/layer/brownfield/init-done from manifests + fs probes) and `explore(containerRoot)` (depth-1 discover via `scanMemberMarkers` → classify → idempotent `enroll` per member → `mergeMarkersIntoAtlas` → `serializeAtlas` → write `workspace.yaml` + `workspace-map.md`; per-member enroll failure recorded `pending` and never aborts; empty container writes no artifacts). Reuses WU1 `scanMemberMarkers`/`mergeMarkersIntoAtlas`/`serializeAtlas` and WU2 `enroll`. |
| `scripts/lib/federation-explore.test.js` | Created | 9 RED-first integration/unit tests with `fs.mkdtemp` container fixtures (3-artifacts, classification triangulation, type-null warning, worktree `.git` file, empty container, partial-failure `pending`, byte-stable re-run, shared-dir layer). |
| `skills/sdd-workspace/SKILL.md` | Modified (additive) | Relaxed Hard Rules to the D7 single-`enroll`-write exception; added `enroll` and `explore`/`classify` execution-steps + stale-graph caveat; extended Decision Gates. |
| `agents/sdd-workspace.agent.md` | Modified (additive) | Added `enroll`/`explore` subcommands (orchestrator-only enroll; partial-failure semantics), the D7 member-write note, the stale-graph caveat, and updated Result Contract lines. |
| `agents/sdd-orchestrator.agent.md` | Modified (additive) | Extended `Workspace Federation` with markers-as-truth, derived-cache atlas, explore-as-front-door, and a D11 coordinator-repo informational note. |
| `openspec/changes/federation-distributed-markers/tasks.md` | Modified | Phase 5 (5.1–5.5) checked off `[x]`. |
| `openspec/changes/federation-distributed-markers/state.yaml` | Modified | `WU4.status: done` (phases `[Phase 5]`); chain slice WU4 `done`; apply stays `partial`, top-level `applying`. |
| `openspec/changes/federation-distributed-markers/apply-progress.md` | Modified | Appended this WU4 section; WU1 + WU2 + WU3 history preserved verbatim. |

## Suggested work-unit commit (WU4)

Not committed/pushed (left staged-ready for the maintainer). Suggested single work-unit commit grouping the WU4 tests + implementation + documentation:

```
feat(federation): subcomando explore/classify y enroll de sdd-workspace

Crea scripts/lib/federation-explore.js como backbone ejecutable del subcomando explore:
descubre miembros del contenedor a profundidad 1 (scanMemberMarkers, .git directorio o
archivo de worktree), clasifica cada uno en type/layer/brownfield/init-done desde
manifiestos secundarios y sondeos de filesystem, llama enroll por miembro (idempotente y
atomico de WU2) y regenera el cache derivado openspec/workspace.yaml (mergeMarkersIntoAtlas
+ serializeAtlas de WU1) mas openspec/workspace-map.md. Un fallo de enroll por miembro se
registra como pending con su motivo y nunca aborta la corrida; el atlas se reconstruye solo
con los marcadores realmente escritos; un contenedor vacio no escribe artefactos. Documenta
en skills/sdd-workspace/SKILL.md (relaja la regla de solo-lectura a la unica escritura
enroll por D7, anade operaciones enroll y explore/classify con el aviso de grafo de
contratos obsoleto), agents/sdd-workspace.agent.md (subcomandos enroll/explore, enroll solo
para el orquestador) y agents/sdd-orchestrator.agent.md (marcadores como verdad, atlas como
cache derivado, explore como puerta de entrada y nota informativa del repo coordinador D11).
Cobertura TDD: 9 tests nuevos; suite completa 346/346 en verde.
```

## Deviations from design (WU4)

None blocking. Implementation notes:
- **New `scripts/lib/federation-explore.js` module**: the design's File-Changes table realizes
  `explore` as a `sdd-workspace` SKILL.md subcommand (agent procedure) and does not enumerate a
  JS module. However, task 5.1 mandates an EXECUTABLE integration test (`federation-explore.test.js`,
  `fs.mkdtemp` fixtures asserting written artifacts), which requires a real implementation. The
  module name is implied by the test filename. The module is the executable backbone the SKILL.md
  procedure documents, and it composes only already-shipped WU1/WU2 functions — purely additive,
  consistent with the WU1/WU2 lib-module pattern. No existing module was modified.
- **Deterministic enroll-failure injection**: the partial-failure scenario is exercised by creating
  the failing member's `openspec` path as a FILE, so `enroll`'s `mkdir(openspec, { recursive })`
  throws naturally — no mocking/DI seam needed (mirrors WU1's real-fixture approach over mocks).
- **Explore-written markers omit `roster`**: explore cannot reliably determine member remotes from
  the filesystem, so it writes only `federation` + `member` blocks. This also avoids sparse roster
  entries clobbering a member's own rich entry under WU1's latest-wins merge, keeping each atlas
  member equal to its own marker's block. `roster` remains fully supported by parse/serialize for
  other callers.
- **Classification heuristics**: type from secondary manifest (`*.csproj` → `nuget`,
  `package.json`/`go.mod` → `microservicio`, else `null` + warning); layer from directory convention
  (`common`/`shared`) or `nuget` → `common`, else `dominio`; brownfield from a bounded (depth-3,
  skip `.git`/`openspec`/`node_modules`/build dirs) source-extension probe; init-done from
  `openspec/config.yaml` presence. These satisfy every `Member Classification` spec scenario and are
  refinable when richer signals (user prompts) land in C2+.

## Remaining work (NOT in this batch)

- [ ] WU5 (Phase 6) — `.gitignore`, `persistence-contract.md`, orchestrator note + final verification (depends on WU1–WU4).

**Next recommended**: run WU5 — `.gitignore` (`openspec/workspace.yaml`), `persistence-contract.md` atlas-as-derived-cache section, and final full-suite verification (depends on WU1–WU4, all now staged).

---

# WU5 — Docs, `.gitignore`, and Final Verification (FINAL slice)

**Batch**: WU5 (Phase 6) — built on top of WU1 (`4efe753`), WU2 (`f30ab07`), WU3 (`06462da`), WU4 (`fda2c5e`) on `feat/federation-distributed-markers`. WU5 is the final slice and depends on WU1–WU4 (all committed).
**Mode**: Strict TDD (strict_tdd: true, runner `npm test` → `node scripts/check.js` → `node --test scripts/**/*.test.js` + 4 target generators).
**Delivery**: Feature Branch Chain (approval `review-workload-001`) — this batch = **WU5**, final child PR on top of WU4's branch.
**Skill resolution**: fallback-config (no `.ospec/cache/skill-registry.cache.json`; rules injected via `## Project Standards` from `openspec/config.yaml`).

## Scope of this batch

- **Phase 6: WU5 — docs, `.gitignore`, final verification** (tasks 6.1–6.3): gitignore the
  derived atlas cache, document the atlas-as-derived-cache inversion in the shared persistence
  contract, and run the final full-suite regression with the `parseAtlas` byte-identical check.

This is the FINAL apply slice. After WU5, all six phases (1–6 / WU1–WU5) are complete.

## Per-task status (WU5)

### Phase 6 — WU5

- [x] 6.1 `.gitignore` — added `openspec/workspace.yaml` under a Spanish comment block explaining it is a regenerable derived cache (markers are the truth). `git check-ignore -v` confirms the rule matches; `git ls-files openspec/workspace.yaml` is empty (not tracked) — satisfies the `Atlas is gitignored` spec scenario (`git status` must not show the file).
- [x] 6.2 `skills/_shared/persistence-contract.md` — added an `### Atlas as Derived Cache (C1 marker inversion)` subsection inside the Workspace Federation section: markers (`openspec/federation.member.yaml`) are the sole source of truth; `openspec/workspace.yaml` is a gitignored, regenerable cache; valid cache is trusted; absent (ENOENT) or corrupt → regenerate from markers (`scanMemberMarkers` → `mergeMarkersIntoAtlas` → `serializeAtlas`); `git ls-files` warn-on-detect when tracked (fail-open, instructs manual `git rm --cached openspec/workspace.yaml`); C1 never executes a destructive/automatic git op.
- [x] 6.3 Full `npm test` green (`All checks passed.`); full native suite `353/353`; `git diff scripts/lib/workspace-atlas.js` empty for WU5 (the file is untouched this batch — `parseAtlas` remains byte-identical to its WU1-committed state, which itself was `525` additions / `0` deletions over the pre-C1 baseline).

## TDD note (documentation/config-contract deliverable)

WU5 changes no executable code — the deliverable is a gitignore rule plus a documented
contract in `persistence-contract.md`. Following the repo's existing markdown/config
content-contract test pattern (`scripts/docs-lint.test.js`, `scripts/manifest-sync.test.js`,
`scripts/sdd-init-federation.test.js`), the contract was pinned with a new `node --test` file
`scripts/federation-derived-cache.test.js` that asserts the required tokens in `.gitignore`
and `persistence-contract.md`. Tests were written RED-first against the not-yet-applied
contract, giving the verify phase an executable gate for the WU5 behavior.

## Test evidence (WU5)

| Run | Command | Result |
|-----|---------|--------|
| RED gate | `node --test scripts/federation-derived-cache.test.js` (test present, contract absent) | `0 pass / 7 fail` |
| GREEN | same, after `.gitignore` + `persistence-contract.md` edits | `7 pass / 0 fail / 0 skipped` |
| Gitignore proof | `git check-ignore -v openspec/workspace.yaml` + `git ls-files openspec/workspace.yaml` | rule `​.gitignore:9` matches; `ls-files` empty (not tracked) |
| Full suite (6.3) | `npm test` (`node scripts/check.js`) | `All checks passed.` (4 targets generate + validate; `0 errors, 0 warnings`) |
| Full native suite | `node --test scripts/**/*.test.js` | `353 pass / 0 fail / 0 skipped` (346 WU1–WU4 baseline + 7 WU5) |
| Scope check | `git status --short` | only `.gitignore`, `persistence-contract.md`, `federation-derived-cache.test.js` |

> The known WU1 `git` integration flake in `artifact-store.test.js` did NOT appear this run
> (full native suite `353/353` clean). It is outside WU5 scope; if it ever surfaces, re-run to
> confirm it is the pre-existing flake, not a WU5 regression.

## TDD Cycle Evidence (WU5)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 6.1 `.gitignore` derived cache | `federation-derived-cache.test.js` | Unit (content contract) | N/A (new test file) | ✅ Written | ✅ Passed | ➖ Single rule assertion | ➖ Config only |
| 6.2 `persistence-contract.md` inversion | `federation-derived-cache.test.js` | Unit (content contract) | N/A (new test file) | ✅ Written | ✅ Passed | ✅ 6 cases (derived-cache / markers-as-truth / regenerable+valid-trusted / absent+corrupt→regenerate / git ls-files warn-on-detect / no destructive git op) | ➖ Prose only |

### Test Summary (WU5)

- Total new tests written: 7 (all in `scripts/federation-derived-cache.test.js`)
- Total tests passing (full native suite): 353 (346 WU1–WU4 baseline + 7 WU5)
- Layers used: Unit / content-contract (7)
- Approval tests (refactoring): None — WU5 only adds a gitignore rule + a doc subsection + a new test; no existing test modified
- Pure functions created: None — WU5 is a documentation/config-contract deliverable (no executable code)

## Files touched (WU5)

| File | Action | What was done |
|------|--------|---------------|
| `.gitignore` | Modified (additive) | Added `openspec/workspace.yaml` (with an explanatory comment) so the derived atlas cache is never committed. Satisfies the `Atlas is gitignored` spec scenario. |
| `skills/_shared/persistence-contract.md` | Modified (additive) | Added `### Atlas as Derived Cache (C1 marker inversion)` documenting markers-as-truth, the regenerable cache, valid-cache-trusted, absent/corrupt→regenerate, `git ls-files` warn-on-detect, and the no-destructive-git-op rule. Existing sections untouched. |
| `scripts/federation-derived-cache.test.js` | Created | 7 RED-first content-contract tests pinning the WU5 gitignore rule and the persistence-contract inversion tokens. |
| `openspec/changes/federation-distributed-markers/tasks.md` | Modified | Phase 6 (6.1–6.3) checked off `[x]` — ALL phase tasks now complete. |
| `openspec/changes/federation-distributed-markers/state.yaml` | Modified | `WU5.status: done` (phases `[Phase 6]`); chain slice WU5 `done`; `chain.delivered: true`; `apply.status: done`; top-level `status: ready-for-verify`. |
| `openspec/changes/federation-distributed-markers/apply-progress.md` | Modified | Appended this WU5 section; WU1 + WU2 + WU3 + WU4 history preserved verbatim. |

## Suggested work-unit commit (WU5)

Not committed/pushed (left staged-ready for the maintainer). Suggested single work-unit commit grouping the WU5 contract test + the gitignore rule + the doc edit:

```
feat(federation): cache derivado del atlas en gitignore y contrato de persistencia

Anade openspec/workspace.yaml a .gitignore como cache derivado y regenerable (la verdad son
los marcadores openspec/federation.member.yaml de cada repo miembro, nunca se versiona el
atlas) y documenta en skills/_shared/persistence-contract.md la inversion atlas-como-cache:
los marcadores son la unica fuente de verdad; el cache valido se confia; ausente (ENOENT) o
corrupto -> se regenera desde los marcadores (scanMemberMarkers + mergeMarkersIntoAtlas +
serializeAtlas); git ls-files emite un aviso warn-on-detect si el cache esta versionado
(fail-open, instruye git rm --cached manual) y C1 nunca ejecuta una operacion git destructiva
o automatica. Fija el contrato con scripts/federation-derived-cache.test.js (7 tests de
contenido RED-first). Cobertura TDD: 7 tests nuevos; suite completa 353/353 en verde.
```

## Deviations from design (WU5)

None blocking. Implementation notes:
- **Contract-as-tests for a docs/config deliverable**: WU5 has no executable code, so strict
  TDD was honored by writing `scripts/federation-derived-cache.test.js` RED-first, asserting
  the required tokens in `.gitignore` and `persistence-contract.md`. This mirrors the repo's
  established content-contract tests and gives verify an executable gate.
- **Orchestrator note already delivered in WU4**: task 6.x text and the chain slice mention an
  "orchestrator note", but the `agents/sdd-orchestrator.agent.md` Workspace Federation section
  (markers-as-truth, atlas-as-derived-cache, explore-as-front-door, D11 informational note) was
  already added in WU4 (task 5.4) and is committed at `fda2c5e`. WU5 therefore does not re-touch
  that file; the orchestrator-facing documentation requirement is satisfied by the existing WU4
  edit, and the shared persistence contract (6.2) is the WU5-specific docs surface.

## Apply-phase final summary (WU1–WU5 complete)

The C1 apply phase is **fully delivered** across the Feature Branch Chain:

| WU | Phase(s) | Commit | Deliverable | New tests |
|----|----------|--------|-------------|-----------|
| WU1 | 1–2 | `4efe753` | `workspace-atlas.js` marker read/merge/serialize + `loadAtlas` regeneration | 19 |
| WU2 | 3 | `f30ab07` | `federation-marker.js` idempotent atomic `enroll` | 9 |
| WU3 | 4 | `06462da` | `sdd-init` container detection + `target_dir` (docs contract) | 10 |
| WU4 | 5 | `fda2c5e` | `sdd-workspace` `enroll` + `explore`/`classify` subcommand | 9 |
| WU5 | 6 | (staged) | `.gitignore` + `persistence-contract.md` derived-cache contract | 7 |

- **Total tests**: `353 pass / 0 fail / 0 skipped` (full native suite); `npm test` → `All checks passed.`
- **All tasks checked**: every Phase 1–6 task in `tasks.md` is `[x]`.
- **Additive guarantee held**: `parseAtlas` byte-identical to pre-C1 baseline; the 6 federated
  `artifact-store.test.js` cases and all original `workspace-atlas.test.js` cases unmodified.
- **State**: `apply.status: done`, `chain.delivered: true`, top-level `status: ready-for-verify`.

### Residual risks for the verify phase

- **WU1 `git` integration flake** (`artifact-store.test.js`, real `git init`/`add` fixture):
  observed once during WU2 as a single transient `fail 1` that did not reproduce. Did NOT appear
  in WU5 (`353/353`). If verify sees it, re-run to confirm it is the pre-existing flake, not a
  regression.
- **No committed `dist/`**: `agents/*.agent.md` + `skills/**` are the source of truth; the 4-target
  generators run inside `npm test` and validate the edits (`0 errors, 0 warnings`). There is no
  committed generated output to diff.
- **Markers written by `enroll` are out-of-repo side effects** (in member repos), not in this
  single-repo tree. Single-PR rollback = revert the merge; manual cleanup = delete each member's
  `openspec/federation.member.yaml` and un-gitignore the cache (documented in design Migration).

**Next recommended**: `sdd-verify` — the apply phase is complete; all WUs delivered and staged-ready.

---

# WU6 — Security Fix: Path-Traversal Containment (`risk-critical-001`, FOLLOW-ON slice)

**Batch**: WU6 (Phase 7) — built on top of WU1 (`4efe753`), WU2 (`f30ab07`), WU3 (`06462da`), WU4 (`fda2c5e`), WU5 (`c3d3ff7`) on `feat/federation-distributed-markers`. WU6 is a follow-on security slice raised by the 4R risk reviewer (CRITICAL `risk-critical-001`); it depends on WU1 (`scanMemberMarkers`) and WU4 (`explore`/`enroll`).
**Mode**: Strict TDD (strict_tdd: true, runner `npm test` → `node scripts/check.js` → `node --test scripts/**/*.test.js` + 4 target generators).
**Delivery**: Feature Branch Chain (approval `review-workload-001`) — this batch = **WU6**, follow-on child PR on top of WU5's branch.
**Skill resolution**: fallback-config (no `.ospec/cache/skill-registry.cache.json`; rules injected via `## Project Standards` from `openspec/config.yaml`).

## The vulnerability (closed by WU6)

`parseGitmodulesPaths` extracted `.gitmodules` `path = ...` values and inserted them
**unvalidated** into `memberDirs` (`scanMemberMarkers`, `workspace-atlas.js`). Both downstream
paths trusted that set:

- **Write path**: `explore` (`federation-explore.js`) iterates `scanMemberMarkers` output and
  calls `enroll(memberRoot, …)` → `fs.mkdir(openspecDir, { recursive })` + atomic marker write.
  A `.gitmodules` with `path = ../../../../tmp/evil` (or an absolute path) caused directory
  creation + file write **outside** `containerRoot` (arbitrary file write/create).
- **Read path**: the same unvalidated dir feeds `loadMarkerFromMember` / `classifyMember`,
  enabling **out-of-tree reads** (info disclosure).

## The fix

A single shared containment invariant — `isWithinRoot(containerRoot, candidateAbs)` — applied
at the **single discovery boundary** `scanMemberMarkers`. Because BOTH the read path
(`loadMarkerFromMember`/`classifyMember`) and the write path (`explore` → `enroll`) consume the
output of `scanMemberMarkers`, guarding there closes both with no duplicated check (the security
invariant lives in one place). Escaping `.gitmodules` member paths are **warned and skipped**
(fail-open, consistent with the module's posture); the run continues with the remaining valid
members and never throws/aborts on a traversal attempt.

```js
function isWithinRoot(containerRoot, candidateAbs) {
  const root = path.resolve(containerRoot);
  const candidate = path.resolve(candidateAbs);
  if (candidate === root) return false;            // degenerate: member == root
  return candidate.startsWith(root + path.sep);    // strictly below root only
}
```

Both `../evil` traversal and absolute paths resolve outside `root + path.sep` and are rejected;
a name-prefix sibling (`/srv/container-evil`) is correctly rejected by the `root + path.sep`
guard.

## Per-task status (WU6)

### Phase 7 — WU6

- [x] 7.1 RED tests in `scripts/lib/workspace-atlas.test.js`: `isWithinRoot` unit (nested accept / equal-root reject / parent-traversal reject / name-prefix-sibling reject) + `scanMemberMarkers` rejects a `.gitmodules` `path = ../evil` AND an absolute path (read path) — escaping members skipped (no out-of-tree read), in-root member still discovered, fail-open warning surfaced.
- [x] 7.2 RED tests in `scripts/lib/federation-explore.test.js`: `explore` on a traversal `.gitmodules` creates NOTHING outside `containerRoot` (no enroll/mkdir/marker write), skips the malicious member, still enrolls the legitimate in-root member, surfaces a traversal warning; an all-escaping container writes no artifacts.
- [x] 7.3 `isWithinRoot(containerRoot, candidateAbs)` added to `scripts/lib/workspace-atlas.js` and exported.
- [x] 7.4 Guard applied in `scanMemberMarkers`: escaping `.gitmodules` member dirs warned + skipped; warnings merged into the returned `warnings`. Single boundary protects read + write paths. No change needed in `federation-explore.js` or `federation-marker.js` (both consume `scanMemberMarkers`).
- [x] 7.5 Full `npm test` green; WU1–WU5 baseline + 4 new WU6 tests all pass.

## Test evidence (WU6)

| Run | Command | Result |
|-----|---------|--------|
| RED gate | `node --test workspace-atlas.test.js federation-explore.test.js` (tests present, guard absent) | `33 pass / 4 fail` (`isWithinRoot is not a function`; scan read-path; 2× explore write-path) |
| GREEN | same two files (after guard) | `37 pass / 0 fail / 0 skipped` |
| Full suite (7.5) | `npm test` (`node scripts/check.js`) | `All checks passed.` (4 targets generate + validate; `0 errors, 0 warnings`) |
| Full native suite | `node --test scripts/**/*.test.js` | `357 pass / 0 fail / 0 skipped` (353 WU1–WU5 baseline + 4 WU6) |
| Additive check | `git diff --numstat scripts/lib/workspace-atlas.js` | `29 / 1` — the single deletion is `const warnings = [];` → `const warnings = [...traversalWarnings];` inside `scanMemberMarkers`; `parseAtlas` remains byte-identical |

> The known WU1 `git` integration flake in `artifact-store.test.js` did NOT appear this run
> (full native suite `357/357` clean). It is outside WU6 scope; if it ever surfaces, re-run to
> confirm it is the pre-existing flake, not a WU6 regression.

## TDD Cycle Evidence (WU6)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 7.3 `isWithinRoot` | `workspace-atlas.test.js` | Unit | ✅ 50/50 federation tests | ✅ Written | ✅ Passed | ✅ 5 cases (nested / equal-root / parent-traversal / name-prefix-sibling / nested-deep) | ➖ Clean as written |
| 7.4 `scanMemberMarkers` guard (read path) | `workspace-atlas.test.js` | Unit (fs fixtures) | ✅ 50/50 | ✅ Written | ✅ Passed | ✅ relative `../evil` + absolute escape + in-root regression + warning | ➖ Single helper, no extraction |
| 7.4 `explore` guard (write path) | `federation-explore.test.js` | Integration (fs container fixtures) | ✅ 50/50 | ✅ Written | ✅ Passed | ✅ traversal-no-write + in-root-still-enrolled + all-escaping-no-artifacts | ➖ Reuses shared guard |

### Test Summary (WU6)

- Total new tests written: 4 (3 in `workspace-atlas.test.js`, 1 added there as `isWithinRoot` unit; 2 in `federation-explore.test.js`) → **4 net new `test(...)` blocks** (`isWithinRoot` unit, `scanMemberMarkers` read-path, 2× `explore` write-path)
- Total tests passing (full native suite): 357 (353 WU1–WU5 baseline + 4 WU6)
- Layers used: Unit (2), Integration (2)
- Approval tests (refactoring): None — WU6 is additive; the only existing-code edit is the guard inside `scanMemberMarkers` (no test modified)
- Pure functions created: `isWithinRoot` (pure, deterministic, OS-aware via `path.resolve`/`path.sep`)

## Files touched (WU6)

| File | Action | What was done |
|------|--------|---------------|
| `scripts/lib/workspace-atlas.js` | Modified (additive guard) | Added pure `isWithinRoot(containerRoot, candidateAbs)` + applied it in `scanMemberMarkers` to warn+skip escaping `.gitmodules` member dirs; merged traversal warnings into the returned `warnings`; exported `isWithinRoot`. `parseAtlas` byte-identical (29 additions / 1 deletion, the deletion being `const warnings = []` → spread). |
| `scripts/lib/workspace-atlas.test.js` | Modified (additive) | Added `isWithinRoot` unit test + `scanMemberMarkers` traversal read-path test (relative + absolute escape, in-root regression, warning). Imported `isWithinRoot`. Existing tests unchanged. |
| `scripts/lib/federation-explore.test.js` | Modified (additive) | Added 2 write-path security tests (`explore` traversal-no-write + all-escaping-no-artifacts). Existing tests unchanged. |
| `openspec/changes/federation-distributed-markers/tasks.md` | Modified | Added Phase 7 (7.1–7.5) checked off `[x]`. |
| `openspec/changes/federation-distributed-markers/state.yaml` | Modified | Added `WU6.status: done` (phases `[Phase 7]`); extended chain `order`/`slices` with WU6; `gates['4r-review-gate'].findings[risk-critical-001].status: remediated` + `remediated_by: WU6`; flagged the prior verify run `stale: true` (re-run required, verdict unchanged). |
| `openspec/changes/federation-distributed-markers/apply-progress.md` | Modified | Appended this WU6 section; WU1–WU5 history preserved verbatim. |

## How both paths are now guarded

- **Read path** — `scanMemberMarkers` calls `loadMarkerFromMember` only for member dirs that
  pass `isWithinRoot`; escaping `.gitmodules` paths are skipped before any `fs.readFile`, so
  out-of-tree reads (`classifyMember` included, since it runs only over `explore`'s `discovered`
  rows) can no longer occur.
- **Write path** — `explore` enrolls only the members in `scanMemberMarkers`'s filtered output;
  the escaping member never reaches `enroll`, so `fs.mkdir`/atomic marker write outside
  `containerRoot` is impossible. The follow-up `rescan` inside `explore` uses the same guarded
  function, so the rebuilt atlas also excludes escaping members.

## Suggested work-unit commit (WU6)

Not committed/pushed (left staged-ready for the maintainer). Suggested single work-unit commit
(type `fix` for the security remediation; no model attribution, no `Co-Authored-By`):

```
fix(federation): rechaza rutas de miembro que escapan del contenedor (path traversal)

Cierra la vulnerabilidad critica risk-critical-001: parseGitmodulesPaths insertaba los
valores `path = ...` de .gitmodules sin validar en memberDirs, permitiendo que explore ->
enroll creara directorios y escribiera marcadores FUERA de containerRoot (escritura
arbitraria) y que loadMarkerFromMember/classifyMember leyeran fuera del arbol (divulgacion
de informacion). Anade el invariante compartido isWithinRoot(containerRoot, candidateAbs) en
workspace-atlas.js y lo aplica en el unico punto de descubrimiento scanMemberMarkers: las
rutas de miembro que escapan (../evil o absolutas) se avisan y se omiten en modo fail-open,
sin abortar la corrida, protegiendo a la vez la ruta de lectura (loadMarkerFromMember/
classifyMember) y la de escritura (explore -> enroll), que consumen la salida de
scanMemberMarkers. Cobertura TDD: 4 tests nuevos RED-first (isWithinRoot, scanMemberMarkers
read-path, explore write-path x2); suite completa 357/357 en verde. parseAtlas byte-identico.
```

## Deviations from design (WU6)

WU6 is not in the original C1 design — it is a follow-on remediation for the 4R CRITICAL
finding `risk-critical-001`. Implementation notes:
- **Single-boundary guard over duplicated checks**: the risk reviewer's `fix_hint` suggested
  rejecting "after resolving memberRoot". Rather than duplicating the check in `explore` AND in
  the read helpers, the guard lives once in `scanMemberMarkers` (the only place member dirs are
  discovered). Both consumers (`explore` write path and the in-scan read) inherit it, keeping the
  security invariant in one auditable place — exactly as the task requested.
- **Fail-open, not fail-closed**: a traversal attempt warns and skips the offending member, then
  continues with the valid ones, matching the module's established fail-open posture
  (`loadMarkerFromMember`, `mergeMarkersIntoAtlas`). It never throws/aborts the whole run.
- **`federation-explore.js` and `federation-marker.js` untouched**: the guard at the discovery
  boundary fully protects the `explore` → `enroll` write path, so no edits were needed in those
  modules; this keeps the WU6 diff minimal and the invariant centralized.

## Verify re-run required (NOT changed by apply)

The committed verify run (`PASS WITH WARNINGS`, `353 pass`) predates WU6. `state.yaml` now flags
`phases.verify.stale: true` with the reason; the apply phase did **not** alter the verify verdict.
A re-run of `sdd-verify` (and optionally `review-risk`) is required to re-bless the tree and
confirm `risk-critical-001` is closed.

**Next recommended**: re-run `sdd-verify` (apply complete with `357/357` green), then re-run
`review-risk` to confirm closure of `risk-critical-001`.

---

# WU7 — Hardening: I/O-Error Distinction + Physical Symlink Containment (FOLLOW-ON slice)

**Batch**: WU7 (Phase 8) — built on top of WU1 (`4efe753`), WU2 (`f30ab07`), WU3 (`06462da`), WU4 (`fda2c5e`), WU5 (`c3d3ff7`), WU6 (`8656fc4`) on `feat/federation-distributed-markers`. WU7 is a follow-on hardening slice raised by the 4R reviewers (two advisory WARNINGs); it depends on WU2 (`enroll`/`readExistingMarker`), WU4 (`explore`) and WU6 (`scanMemberMarkers` containment boundary).
**Mode**: Strict TDD (strict_tdd: true, runner `npm test` → `node scripts/check.js` → `node --test scripts/**/*.test.js` + 4 target generators).
**Delivery**: Feature Branch Chain (approval `review-workload-001`) — this batch = **WU7**, follow-on child PR on top of WU6's branch.
**Skill resolution**: fallback-config (no `.ospec/cache/skill-registry.cache.json`; rules injected via `## Project Standards` from `openspec/config.yaml`).

## The two hardening findings (closed by WU7)

### Fix A — `resilience-warning-001` (+ `reliability-warning-002`): data loss in `readExistingMarker`

`readExistingMarker` wrapped BOTH the `fs.readFile` and the `parseMarker` calls in a single
`try`, and the `catch` special-cased only `ENOENT`; EVERY other error fell through to
`return null`. So a HEALTHY-but-temporarily-unreadable marker (transient `EACCES`/`EBUSY`,
an `EISDIR`, a lock) was reported as "absent", and `enroll` then OVERWROTE the canonical
source-of-truth marker → data loss. `reliability-warning-002` flagged that the
corrupt/empty self-heal recovery path had no test.

### Fix B — `risk-warning-symlink-001`: lexical-only containment

WU6's `isWithinRoot` is purely lexical (`path.resolve`). A real SYMLINK planted inside
`containerRoot` whose name has no `../` (e.g. a `.gitmodules` `path = legit` where `legit`
is a symlink) resolves lexically inside root but physically points OUTSIDE, letting
`loadMarkerFromMember` (read) and `explore` → `enroll` (write) follow it out of root.
Distinct from `risk-critical-001` (lexical `../`/absolute vector, already closed by WU6).

## The fixes

### Fix A — explicit read-vs-parse failure domains

`readExistingMarker` now performs the read and the parse as TWO distinct `try` blocks:

```js
async function readExistingMarker(markerPath) {
  let content;
  try {
    content = await fs.readFile(markerPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null; // absent → write fresh
    throw error;                              // genuine I/O error → abort, never overwrite
  }
  try {
    return parseMarker(content);
  } catch {
    return null;                              // present-but-unparseable → self-heal rewrite
  }
}
```

This makes the distinguishing logic explicit:
- **absent** (`ENOENT` on read) → `null` → `enroll` writes a fresh marker;
- **genuine I/O error** (`error.code` is anything other than `ENOENT` on read — `EACCES`/
  `EBUSY`/`EISDIR`/lock) → **RETHROW** → `enroll` aborts for that member and the healthy
  marker is preserved;
- **corrupt** (present content that fails `parseMarker`) → `null` → `enroll` self-heals by
  rewriting cleanly. The self-heal path is structurally separated from the I/O path, so it
  stays intact.

### Fix B — physical (`realpath`) containment at the single boundary

A new pure-ish guard `isRealPathWithinRoot(containerRoot, candidateAbs)` resolves the real
on-disk target with `fs.lstat`/`fs.realpath` and is applied in `scanMemberMarkers` at the
discovery→use boundary (the same single boundary WU6 used), so BOTH the read path
(`loadMarkerFromMember`/`classifyMember`) and the write path (`explore` → `enroll`) inherit it:

```js
async function isRealPathWithinRoot(containerRoot, candidateAbs) {
  let entryStats;
  try { entryStats = await fs.lstat(candidateAbs); }
  catch (error) { return error.code === "ENOENT"; } // absent → accept (first-enroll); else reject
  if (!entryStats.isSymbolicLink()) return true;     // real dir already cleared lexical → accept
  let realRoot;
  try { realRoot = await fs.realpath(containerRoot); } catch { realRoot = path.resolve(containerRoot); }
  let realCandidate;
  try { realCandidate = await fs.realpath(candidateAbs); } catch { return false; } // dangling → reject
  if (realCandidate === realRoot) return false;
  return realCandidate.startsWith(realRoot + path.sep);
}
```

- a **not-yet-existing** member dir (`lstat` → `ENOENT`) is ACCEPTED — the normal first-enroll
  case, already cleared by the lexical check;
- a **non-symlink** entry is ACCEPTED without paying for `realpath` on every normal member;
- an **EXISTING symlink** (or Windows junction, which `lstat` also flags as a symlink) is
  resolved and REJECTED when its real target escapes the real container root (or dangles);
  an in-root symlink target is still accepted.

The lexical `isWithinRoot` `../`/absolute rejection from WU6 is left untouched (no
`risk-critical-001` regression). `federation-explore.js` and `federation-marker.js` need NO
edits — `explore` consumes `scanMemberMarkers`, so the boundary guard covers its write path.

## Per-task status (WU7)

### Phase 8 — WU7

- [x] 8.1 RED-first tests in `scripts/lib/federation-marker.test.js`: transient `EACCES` on a HEALTHY marker → `enroll` rejects + marker byte-preserved (no overwrite); marker-path-is-a-directory → `EISDIR` rethrown, no `.tmp` left; present-but-unparseable (whitespace) marker → `status: written` self-heal (green regression, closes `reliability-warning-002`).
- [x] 8.2 RED-first tests in `scripts/lib/workspace-atlas.test.js` (read path) and `scripts/lib/federation-explore.test.js` (write path): a REAL symlink inside the container (clean name, `.gitmodules path = legit`) pointing outside is skipped with a warning, no out-of-tree read; `explore` never writes a marker THROUGH the symlink outside the real container while still enrolling the legit in-root member. `t.skip()` guard for OSes that cannot create symlinks (not triggered — junctions worked on this Windows host).
- [x] 8.3 `readExistingMarker` split into read-phase + parse-phase in `scripts/lib/federation-marker.js`: ENOENT→null, other read error→rethrow, parse failure→null.
- [x] 8.4 `isRealPathWithinRoot` added to `scripts/lib/workspace-atlas.js` and applied at the `scanMemberMarkers` discovery→use boundary (warn + skip, fail-open). Lexical `isWithinRoot` preserved.
- [x] 8.5 Full `npm test` green; WU1–WU6 baseline + 5 new WU7 tests all pass.

## Test evidence (WU7)

| Run | Command | Result |
|-----|---------|--------|
| RED gate | `node --test federation-marker.test.js workspace-atlas.test.js federation-explore.test.js` (tests present, fixes absent) | `47 pass / 4 fail` (EACCES data-loss; EISDIR rethrow; scan symlink read-path; explore symlink write-path). The self-heal regression was green from the start. |
| GREEN | same three files (after both fixes) | `51 pass / 0 fail / 0 skipped` |
| Full suite (8.5) | `npm test` (`node scripts/check.js`) | `All checks passed.` (4 targets generate + validate; `0 errors, 0 warnings`) |
| Full native suite | `node --test scripts/**/*.test.js` | `362 pass / 0 fail / 0 skipped` (357 WU1–WU6 baseline + 5 WU7) |
| Additive check | `git diff --numstat federation-marker.js workspace-atlas.js` | `20 / 3` (marker) and `67 / 3` (atlas) — `parseAtlas` byte-identical; the small deletions are the `readExistingMarker` body restructure and the `scanMemberMarkers` final-loop `loadMarkerFromMember(...)` call reshaped to add the guard. |

> The known WU1 `git` integration flake in `artifact-store.test.js` did NOT appear this run
> (full native suite `362/362` clean). It is outside WU7 scope; if it ever surfaces, re-run to
> confirm it is the pre-existing flake, not a WU7 regression.

## TDD Cycle Evidence (WU7)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 8.3 `readExistingMarker` (Fix A) | `federation-marker.test.js` | Unit (fs fixtures + readFile stub) | ✅ 46/46 prior | ✅ Written | ✅ Passed | ✅ 3 cases (EACCES data-loss / EISDIR rethrow+no-tmp / corrupt self-heal stays green) | ➖ Clean as written |
| 8.4 `isRealPathWithinRoot` + `scanMemberMarkers` guard (Fix B, read path) | `workspace-atlas.test.js` | Unit (real symlink/junction fixtures) | ✅ 50/50 federation | ✅ Written | ✅ Passed | ✅ symlink-escape skipped + in-root regression + warning | ➖ Single guard, no extraction |
| 8.4 `explore` guard (Fix B, write path) | `federation-explore.test.js` | Integration (real symlink container fixture) | ✅ 50/50 | ✅ Written | ✅ Passed | ✅ no-write-through-symlink + legit-still-enrolled + warning | ➖ Reuses shared boundary |

### Test Summary (WU7)

- Total new tests written: 5 (3 in `federation-marker.test.js`, 1 in `workspace-atlas.test.js`, 1 in `federation-explore.test.js`)
- Total tests passing (full native suite): 362 (357 WU1–WU6 baseline + 5 WU7)
- Layers used: Unit (4), Integration (1)
- Approval tests (refactoring): None — WU7 edits are localized to `readExistingMarker` and the `scanMemberMarkers` guard; no existing test modified
- Pure functions created: `isRealPathWithinRoot` (I/O-bound by necessity — it resolves real on-disk paths; deterministic given the filesystem)

## Files touched (WU7)

| File | Action | What was done |
|------|--------|---------------|
| `scripts/lib/federation-marker.js` | Modified | Split `readExistingMarker` into read-phase + parse-phase: ENOENT→null (absent), other read error→RETHROW (genuine I/O error, no overwrite), parse failure→null (corrupt self-heal). 20 additions / 3 deletions. |
| `scripts/lib/workspace-atlas.js` | Modified (additive guard) | Added `isRealPathWithinRoot(containerRoot, candidateAbs)` (lstat/realpath physical containment) + applied it at the `scanMemberMarkers` discovery→use boundary (warn + skip escaping symlinks, fail-open). Lexical `isWithinRoot` untouched; `parseAtlas` byte-identical. 67 additions / 3 deletions. |
| `scripts/lib/federation-marker.test.js` | Modified (additive) | Added 3 Fix-A tests (EACCES data-loss, EISDIR rethrow + no-tmp, corrupt self-heal). Existing tests unchanged. |
| `scripts/lib/workspace-atlas.test.js` | Modified (additive) | Added 1 Fix-B read-path symlink-escape test. Existing tests unchanged. |
| `scripts/lib/federation-explore.test.js` | Modified (additive) | Added 1 Fix-B write-path symlink-escape test. Existing tests unchanged. |
| `openspec/changes/federation-distributed-markers/tasks.md` | Modified | Added Phase 8 (8.1–8.5) checked off `[x]`. |
| `openspec/changes/federation-distributed-markers/state.yaml` | Modified | Added `WU7.status: done` (phases `[Phase 8]`); extended chain `order`/`slices` with WU7; set `resilience-warning-001`, `reliability-warning-002`, `risk-warning-symlink-001` to `status: closed` + `remediated_by: WU7`; flagged the prior verify run `stale: true` (re-run required). |
| `openspec/changes/federation-distributed-markers/apply-progress.md` | Modified | Appended this WU7 section; WU1–WU6 history preserved verbatim. |

## How both findings are now closed

- **`resilience-warning-001` / `reliability-warning-002` (Fix A)** — `enroll` can no longer
  mistake an unreadable healthy marker for an absent one: a non-ENOENT read error propagates
  and aborts the write (proven by the `EACCES` data-loss test asserting the marker is
  byte-preserved, and the `EISDIR` rethrow test). The corrupt-marker self-heal is structurally
  separated into the parse phase and proven by the present-but-unparseable rewrite test.
- **`risk-warning-symlink-001` (Fix B)** — an existing symlink/junction member dir that
  physically escapes the real container root is resolved via `realpath` and rejected at the
  single discovery boundary, fail-open, before any read or write. Proven by the
  `scanMemberMarkers` read-path test (no out-of-tree read) and the `explore` write-path test
  (no marker written through the symlink), with a normal in-root member still discovered/enrolled.

## Suggested work-unit commit (WU7)

Not committed/pushed (left staged-ready for the maintainer). Suggested single work-unit commit
(type `fix` for the hardening remediation; no model attribution, no `Co-Authored-By`):

```
fix(federation): evita perdida de datos en lectura de marcador y refuerza la contencion ante symlinks

Cierra dos hallazgos advisory del 4R. resilience-warning-001 (+ reliability-warning-002):
readExistingMarker envolvia lectura y parseo en un solo try y trataba TODO error que no fuera
ENOENT como "ausente", de modo que un marcador sano pero temporalmente ilegible (EACCES/EBUSY/
EISDIR/bloqueo) hacia que enroll SOBREESCRIBIERA la fuente de verdad (perdida de datos). Ahora
separa lectura y parseo en dominios de fallo distintos: ENOENT en lectura -> null (ausente,
escribe nuevo); cualquier otro error de lectura -> RELANZA para que enroll aborte sin
sobreescribir; fallo de parseo sobre contenido presente -> null (auto-reparacion reescribiendo
limpio), que permanece en verde. risk-warning-symlink-001: la contencion isWithinRoot de WU6 es
solo lexica (path.resolve), asi que un symlink real plantado dentro de containerRoot con nombre
sin ../ pasaba el chequeo y permitia que loadMarkerFromMember/enroll lo siguieran fuera del raiz.
Anade el guard fisico isRealPathWithinRoot (lstat/realpath) en el unico limite de descubrimiento
scanMemberMarkers: una ruta inexistente (primer enroll) se acepta, una entrada no-symlink se
acepta, y un symlink existente que escapa o cuelga fuera del raiz real se avisa y se omite en modo
fail-open, protegiendo a la vez la ruta de lectura y la de escritura (explore -> enroll). Conserva
el rechazo lexico ../ /absoluto de WU6 (sin regresion de risk-critical-001). Cobertura TDD: 5 tests
nuevos RED-first (EACCES, EISDIR, auto-reparacion; scanMemberMarkers y explore con symlink real);
suite completa 362/362 en verde. parseAtlas byte-identico.
```

## Deviations from design (WU7)

WU7 is not in the original C1 design — it is a follow-on remediation for two 4R advisory
WARNINGs. Implementation notes:
- **Read-vs-parse split over a code-flag**: rather than inspecting the error to guess whether it
  came from `fs.readFile` or `parseMarker`, the function performs the read and the parse in two
  separate `try` blocks. This makes the I/O-error-vs-parse-failure distinction structural and
  unambiguous, which is more robust than pattern-matching error messages.
- **Single-boundary physical guard, layered on the lexical one**: `isRealPathWithinRoot` is
  applied at the same `scanMemberMarkers` discovery→use boundary as WU6's lexical guard, keeping
  the security invariant in one auditable place. The lexical check stays as the cheap first gate
  (rejects `../`/absolute before any fs call); the physical check is the second gate (only
  pays for `realpath` on actual symlink entries).
- **ENOENT accepted to preserve first-enroll**: per the task, a not-yet-existing in-root member
  dir (the normal first-enroll case) must still be accepted, so `lstat` → `ENOENT` returns
  accept. Only an EXISTING symlink escaping (or a dangling symlink, via `realpath` throwing) is
  rejected — distinguished by checking `lstat` BEFORE `realpath`.
- **`federation-explore.js`/`federation-marker.js` untouched for Fix B**: the boundary guard at
  `scanMemberMarkers` fully covers `explore`'s write path (it consumes the filtered output), so
  no edits were needed there — keeping the WU7 diff minimal and the invariant centralized.
- **Symlinks really exercised on Windows**: the `t.skip()` fallback was provided for OSes that
  cannot create symlinks, but on this Windows host directory junctions (`fs.symlink(..., "junction")`)
  succeeded without elevation, so both Fix-B tests ran for real (0 skipped).

## Verify re-run required (NOT changed by apply)

The committed verify run (`PASS WITH WARNINGS`, `357 pass`) predates WU7. `state.yaml` now flags
`phases.verify.stale: true` with the reason; the apply phase did **not** alter the verify verdict.
A re-run of `sdd-verify` (and optionally `review-resilience`/`review-risk`) is required to
re-bless the tree and confirm `resilience-warning-001` and `risk-warning-symlink-001` are closed.

**Next recommended**: re-run `sdd-verify` (apply complete with `362/362` green), then archive via
`sdd-archive` once verify re-blesses the tree.
