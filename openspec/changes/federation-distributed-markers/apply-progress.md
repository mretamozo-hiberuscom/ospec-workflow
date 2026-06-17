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
