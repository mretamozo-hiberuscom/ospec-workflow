## Verification Report

**Change**: federation-distributed-markers (C1 — mechanism + workspace-explore)
**Version**: spec amendment 2026-06-17 (`member.provides` object schema)
**Mode**: Strict TDD
**Classification**: high-risk
**Branch**: `feat/federation-distributed-markers` (commits `4efe753`, `f30ab07`, `06462da`, `fda2c5e`, `c3d3ff7`, `8656fc4`, `a6e3c46`)
**Skill resolution**: fallback-config (no `.ospec/cache/skill-registry.cache.json`; rules from `openspec/config.yaml`)

> **FINAL RE-VERIFY 2026-06-18 (post-WU7)** — This report was re-run after hardening
> slice **WU7** (commit `a6e3c46`) landed to close two 4R advisory findings:
> `resilience-warning-001`/`reliability-warning-002` (data loss — `readExistingMarker`
> now rethrows genuine non-ENOENT I/O errors instead of overwriting a healthy marker;
> corrupt-marker self-heal preserved) and `risk-warning-symlink-001` (physical
> `isRealPathWithinRoot` lstat/realpath guard added in `scanMemberMarkers`, keeping WU6's
> lexical guard). The earlier `stale: true` flag is now cleared. **New baseline: 362 pass /
> 0 fail / 0 skipped** (verify's own direct `node --test` run + the embedded `npm test`
> "Native Node tests" step). Both WU7 findings are **CLOSED BY TESTS** (see the WU7 Hardening
> Verification section); `risk-critical-001` (WU6) **remains CLOSED** with no regression.
> Verdict stays **PASS WITH WARNINGS** — the remaining non-blocking advisories (git flake
> `reliability-warning-001`, spec wording, heuristic corruption, agent-procedure static-proof,
> readability/suggestions) were NOT in WU7 scope and remain open follow-ups, not regressions.

> **PRIOR RE-VERIFY 2026-06-17 (post-WU6)** — Re-run after security slice **WU6** (commit
> `8656fc4`) remediated the 4R CRITICAL `risk-critical-001` (path traversal). Baseline then
> was **357 pass / 0 fail / 0 skipped**. `risk-critical-001` was **CLOSED BY TESTS** (see the
> WU6 Security Verification section). Superseded by the WU7 re-verify above.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 33 (Phases 1–6) |
| Tasks complete | 33 |
| Tasks incomplete | 0 |

All Phase 1–6 tasks are `[x]` in `tasks.md`; `state.yaml` reports `apply.status: done`, `chain.delivered: true`, all five work units `done`.

### Build & Tests Execution

**Build / validators**: ✅ Passed
```text
npm test  → node scripts/check.js
4-target generation (claude/vscode/github-copilot/opencode) + validation
0 errors, 0 warnings
All checks passed.
```

**Tests**: ✅ 362 passed / ❌ 0 failed / ⚠️ 0 skipped (executed by verify, not trusted from report)
```text
npm test  → node scripts/check.js → step "Native Node tests" (check.js:56)
            runs `node --test scripts/**/*.test.js`
→ All checks passed.   (4-target generators + validators: 0 errors, 0 warnings)

node --test "scripts/**/*.test.js"   (verify's own direct run)
# tests 362
# pass 362
# fail 0
# cancelled 0
# skipped 0
# todo 0

Re-run (known-flake target, isolated):
node --test scripts/lib/artifact-store.test.js
# tests 17  # pass 17  # fail 0  # skipped 0
```
Real counts match the post-WU7 apply-progress baseline (362 pass / 0 fail = 353 WU1–WU5
+ 4 WU6 + 5 WU7). `npm test` (`check.js`) embeds the native suite as its "Native Node tests"
step, so the generator/validator AND the 362-test suite are both green in one pipeline. The known
WU1 `git` integration flake (`reliability-warning-001`) did **not** reproduce across the full-suite
run plus an isolated artifact-store re-run (17/17) (see WARNING W3).

**Manual verification**: performed (git state)
```text
git check-ignore -v openspec/workspace.yaml → .gitignore:9 (rule matches)
git ls-files openspec/workspace.yaml        → (empty: not tracked)
git log --oneline                            → 5 WU commits present on the feature branch
```

**Coverage**: ➖ Not available (no coverage tool configured in this repo; `npm test` is a generator+validator+`node --test` pipeline). Not a failure.

### Spec Compliance Matrix
| Requirement | Scenario | Evidence Level | Source | Result |
|-------------|----------|----------------|--------|--------|
| Marker Schema | Valid marker loaded into atlas | `runtime-test` | `workspace-atlas.test.js > loadMarkerFromMember parses a valid marker` | PASS |
| Marker Schema | Member without `remote` — fail-open warning (SHOULD) | `runtime-test` | `workspace-atlas.test.js > loadMarkerFromMember warns but succeeds when remote is absent` | PASS |
| Atlas Derived Cache | Atlas absent at load | `runtime-test` | `artifact-store.test.js > regenerates the atlas from markers when it is absent` | PASS |
| Atlas Derived Cache | Atlas corrupt at load | `runtime-test` | `artifact-store.test.js > regenerates and warns when the cache is corrupt` | PASS |
| Atlas Derived Cache | Atlas is gitignored | `static-proof` + `manual-proof` | `federation-derived-cache.test.js` + `git check-ignore`/`git ls-files` empty | PASS |
| Atlas Derived Cache | workspace.yaml git-tracked — warn-on-detect | `runtime-test` | `artifact-store.test.js > warns but keeps loading when workspace.yaml is git-tracked` (git present, executed) | PASS |
| Atlas Merge Semantics | Latest-wins on conflicting entries | `runtime-test` | `workspace-atlas.test.js > keeps the later updated_at on duplicate member.id` | PASS |
| Atlas Merge Semantics | Equal `updated_at` — lexicographic tiebreak | `runtime-test` | `workspace-atlas.test.js > breaks an updated_at tie by greater source member.id` | PASS |
| Atlas Merge Semantics | Malformed marker skipped fail-open | `runtime-test` | `workspace-atlas.test.js > skips a malformed marker without aborting` | PASS |
| Enroll Operation | Writes marker on first call | `runtime-test` | `federation-marker.test.js > enroll writes the marker on first call` | PASS |
| Enroll Operation | Idempotent — no timestamp refresh | `runtime-test` | `federation-marker.test.js > enroll is idempotent on identical data` (+ key-order test) | PASS |
| Enroll Operation | Updates an existing marker | `runtime-test` | `federation-marker.test.js > enroll rewrites and refreshes updated_at when content changes` | PASS |
| Derived Member State | State is `initialized` | `runtime-test` | `federation-explore.test.js > node service … initDone true` | PASS |
| Derived Member State | State is `pending` | `runtime-test` | `federation-explore.test.js > csproj-only … initDone false` | PASS |
| Impact Set | Includes declared consumers | `runtime-test` | `workspace-atlas.test.js > maps provides to contracts … + computeImpact` | PASS |
| Impact Set | Consumers empty (provider only) | `runtime-test` | `workspace-atlas.test.js > provider-only impact set when consumers are empty` | PASS |
| Resumable Bootstrap | Partial bootstrap — one member fails | `runtime-test` | `federation-explore.test.js > records a failed enroll as pending …` | PASS |
| Resumable Bootstrap | Resumes from persisted lot | `runtime-test` | `federation-explore.test.js > re-running explore … byte-stable` (idempotent skip; derived state) | PASS |
| Container Detection | `.git` as directory | `runtime-test` | `workspace-atlas.test.js > scanMemberMarkers detects a member whose .git is a directory` | PASS |
| Container Detection | `.git` as file (submodule/worktree) | `runtime-test` | `workspace-atlas.test.js > … .git is a plain file` + `federation-explore.test.js > worktree` | PASS |
| Container Detection | `.gitmodules` authoritative union (SHOULD) | `runtime-test` | `workspace-atlas.test.js > unions .gitmodules paths without duplicates` | PASS |
| Container Detection | Empty container — warning, no artifacts (SHOULD) | `runtime-test` | `workspace-atlas.test.js > returns empty with a warning` + `federation-explore.test.js > writes no artifacts and warns` | PASS |
| Member Classification | Microservice brownfield, init done | `runtime-test` | `federation-explore.test.js > classifies a node service as microservicio/dominio/brownfield` | PASS |
| Member Classification | Nuget common greenfield | `runtime-test` | `federation-explore.test.js > classifies a csproj-only package as nuget/common/greenfield` | PASS |
| Member Classification | Type cannot be inferred (SHOULD) | `runtime-test` | `federation-explore.test.js > sets type null with a warning` | PASS |
| Explore Artifacts | All members succeed — 3 artifacts | `runtime-test` | `federation-explore.test.js > writes a marker per member plus the atlas cache and the map` | PASS |
| Explore Artifacts | Partial explore — one enroll fails | `runtime-test` | `federation-explore.test.js > records a failed enroll as pending and builds the atlas from the survivors` | PASS |
| sdd-init `target_dir` | Provided — init scoped to directory | `static-proof` | `sdd-init-federation.test.js` (content contract on `SKILL.md`/`agent.md`) | PASS (see W4) |
| sdd-init `target_dir` | Absent — cwd fallback | `static-proof` | `sdd-init-federation.test.js > documents the cwd fallback` | PASS (see W4) |
| sdd-init `target_dir` | Non-existent path → blocked | `static-proof` | `sdd-init-federation.test.js > non-existent target_dir → blocked + question_gate` | PASS (see W4) |
| sdd-init Multirepo Gate | Container detected → blocked + gate | `static-proof` | `sdd-init-federation.test.js > depth-1 container detection …` | PASS (see W4) |
| sdd-init Multirepo Gate | Single-repo — gate not triggered | `static-proof` | `sdd-init-federation.test.js > single-repo … fall through to normal init` | PASS (see W4) |
| sdd-init Multirepo Gate | <2 child repos — gate not triggered | `static-proof` | `sdd-init-federation.test.js` (threshold ≥2 token assertions) | PASS (see W4) |
| sdd-workspace `enroll` | Marker written, success returned | `runtime-test` | `federation-marker.test.js`/`federation-explore.test.js` (executable enroll path) + `SKILL.md` doc | PASS |
| sdd-workspace `enroll` | Twice with same data — idempotent | `runtime-test` | `federation-marker.test.js > enroll is idempotent …` + explore byte-stable re-run | PASS |

**Compliance summary**: 35/35 scenarios satisfied at acceptable evidence levels (29 `runtime-test`, 6 `static-proof` for agent-procedure docs). 0 MUST scenarios below the required strength.

### WU6 Security Verification — `risk-critical-001` (path traversal) CLOSED BY TESTS

**Threat**: `parseGitmodulesPaths` fed `.gitmodules` `path = ...` values **unvalidated** into
`memberDirs`. The same set drove BOTH the write path (`explore` → `enroll` → `fs.mkdir` + atomic
marker write) and the read path (`loadMarkerFromMember`/`classifyMember`). A malicious
`path = ../evil` or absolute path enabled arbitrary out-of-tree file creation/write and
out-of-tree reads (info disclosure).

**Fix (verified by source inspection)**: a single shared invariant
`isWithinRoot(containerRoot, candidateAbs)` (`workspace-atlas.js` L440–448) is applied at the
**single discovery boundary** `scanMemberMarkers` (L451–533, guard at L462–467). A candidate is
contained only when it resolves strictly below `containerRoot` (`candidate.startsWith(root + path.sep)`;
equal-to-root rejected). Escaping `.gitmodules` member paths are warned and skipped (fail-open,
no throw). **Both** consumers inherit the filter: `explore` iterates only `scanMemberMarkers`'s
filtered `discovered` rows for `classifyMember`/`enroll` (`federation-explore.js` L201, L215–240),
and its post-write `rescan` reuses the same guarded function (L245). No duplicated check; no edits
needed in `federation-explore.js`/`federation-marker.js`.

**Test → behavior map** (4 new RED-first tests, all `runtime-test`):
| WU6 Test | Source | Proves |
|----------|--------|--------|
| `isWithinRoot accepts nested members and rejects traversal/absolute escapes` | `workspace-atlas.test.js` L343 | Pure invariant: nested/deep accepted; equal-root, `../evil` parent-traversal, and name-prefix sibling (`${root}-evil`) all rejected |
| `scanMemberMarkers rejects a .gitmodules path that escapes the container root (read path)` | `workspace-atlas.test.js` L356 | A planted out-of-tree marker is NOT read; relative `../evil-*` AND absolute (`os.tmpdir()`) escapes skipped; legitimate in-root `svc-api` still discovered; per-escape `/escape/i` warning surfaced |
| `explore never enrolls or writes outside the container on a traversal path` | `federation-explore.test.js` L324 | Write path: `exists(outside) === false` and `exists(outside/marker) === false` — no `mkdir`/marker created out-of-tree; malicious member excluded from `members`; in-root `svc-api` still enrolled; `status: success` + fail-open warning |
| `explore writes no artifacts when the only member escapes the container` | `federation-explore.test.js` L362 | All-escaping container yields `members: []`, `artifacts: []`, `exists(outside) === false`, traversal warning |

**RED → GREEN evidence**: apply-progress records the RED gate as `33 pass / 4 fail`
(`isWithinRoot is not a function`; scan read-path; 2× explore write-path) before the guard, then
`37 pass / 0 fail` for the two files after. Verify re-ran the full suite green (357/357).
**Assertion quality**: concrete value/existence assertions, real production calls, no tautologies,
no ghost loops over possibly-empty collections. **`risk-critical-001` is remediated and closed by
executable tests.**

**Additive / no-regression proof**: `git show --numstat 8656fc4` — `workspace-atlas.js` 29 add / 1
del (the lone deletion is `const warnings = []` → `const warnings = [...traversalWarnings]` inside
`scanMemberMarkers`), test files 64 + 63 additions / 0 deletions. `parseAtlas` is byte-identical
(appears only as unchanged export context in the diff). All 353 WU1–WU5 tests preserved and green.

### WU7 Hardening Verification — `resilience-warning-001`/`reliability-warning-002` + `risk-warning-symlink-001` CLOSED BY TESTS

**Fix A — `resilience-warning-001` (+ `reliability-warning-002`): `readExistingMarker` data loss.**
The function previously wrapped BOTH `fs.readFile` and `parseMarker` in one `try` and special-cased
only `ENOENT`; every other error fell through to `return null`, so a HEALTHY-but-temporarily-unreadable
marker (transient `EACCES`/`EBUSY`/`EISDIR`/lock) was treated as absent and `enroll` OVERWROTE the
canonical source-of-truth marker → data loss. **Fix (verified by source inspection,
`federation-marker.js` L338–375)**: read and parse are now two distinct `try` blocks — `ENOENT` on
read → `null` (write fresh); any other read error → **RETHROW** (enroll aborts, healthy marker
preserved); parse failure on present content → `null` (corrupt self-heal rewrite). The self-heal path
is structurally separated from the I/O path, so it stays intact.

**Fix B — `risk-warning-symlink-001`: lexical-only containment.** WU6's `isWithinRoot` is purely
lexical; a real symlink/junction planted inside `containerRoot` with a clean name (no `../`) passes
the lexical check but physically points OUTSIDE. **Fix (verified by source inspection,
`workspace-atlas.js` L465–500 + guard applied at the `scanMemberMarkers` boundary L566–572)**: a new
`isRealPathWithinRoot(containerRoot, candidateAbs)` resolves the real on-disk target via
`fs.lstat`/`fs.realpath`. A not-yet-existing dir (`lstat` ENOENT) is accepted (first-enroll); a
non-symlink entry is accepted; an EXISTING symlink whose real target escapes (or dangles) is rejected
(warn + skip, fail-open). The lexical `isWithinRoot` `../`/absolute rejection from WU6 is untouched
(no `risk-critical-001` regression). Both the read path (`loadMarkerFromMember`/`classifyMember`) and
the write path (`explore` → `enroll`) inherit the guard since both consume `scanMemberMarkers`.

**Test → behavior map** (5 new RED-first tests, all `runtime-test`):
| WU7 Test | Source | Proves |
|----------|--------|--------|
| `enroll rethrows a transient I/O read error and does NOT overwrite a healthy marker` | `federation-marker.test.js` L222 | (a) A stubbed `EACCES` on the marker read makes `enroll` reject (`error.code === 'EACCES'`) and the seeded healthy marker is **byte-preserved** (`assert.equal(after, seeded)`) — no overwrite |
| `enroll rethrows EISDIR when the marker path is a directory (no silent overwrite)` | `federation-marker.test.js` L262 | (a) A directory at the marker path makes `fs.readFile` raise `EISDIR`, which is rethrown; no stray `.tmp` left behind |
| `enroll rewrites a present-but-unparseable marker (corrupt self-heal stays green)` | `federation-marker.test.js` L283 | (b) A whitespace-only present marker yields `status: 'written'` and a clean re-parse (`parsed.member.id === 'svc-api'`) — self-heal intact |
| `scanMemberMarkers rejects a symlinked member that escapes the container (read path)` | `workspace-atlas.test.js` L409 | (c) A real symlink/junction `legit` → outside dir is skipped; only the in-root `svc-api` survives; per-escape `/escape|symlink/i` warning surfaced; no out-of-tree read |
| `explore never enrolls or writes through a symlinked member that escapes the container` | `federation-explore.test.js` L389 | (c) Write path: `exists(outside/marker) === false` — no marker written THROUGH the symlink; `legit` excluded from `members`; in-root `svc-api` still enrolled; `status: success` + fail-open warning |

**RED → GREEN evidence**: apply-progress records the RED gate as `47 pass / 4 fail` (EACCES data-loss;
EISDIR rethrow; scan symlink read-path; explore symlink write-path; the self-heal regression was green
from the start) before the fixes, then `51 pass / 0 fail` for the three files after. Verify re-ran the
full suite green (**362/362**). **Assertion quality**: concrete value/existence assertions
(byte-equality of the preserved marker, `EISDIR`/`EACCES` code matchers, `exists(...) === false`, real
production calls), no tautologies, no ghost loops. **Both findings are remediated and closed by
executable tests; `risk-critical-001` (WU6) is NOT regressed — its lexical traversal tests remain green
in the 362-suite.**

**Additive / no-regression proof**: `git diff --numstat a6e3c46` — `federation-marker.js` 20 add / 3 del
(the `readExistingMarker` read-vs-parse restructure), `workspace-atlas.js` 67 add / 3 del (the
`isRealPathWithinRoot` guard + its application). `parseAtlas` is **byte-identical**. All 357 WU1–WU6
tests preserved and green.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Additive inversion (parseAtlas untouched) | ✅ Implemented | 6 federated `artifact-store.test.js` + all `workspace-atlas.test.js` cases pass unmodified; apply-progress `git diff --numstat` = 525 additions / 0 deletions |
| `loadAtlas` regeneration branch | ✅ Implemented | ENOENT + corrupt → `regenerateAtlas` → write cache; valid-cache fast path preserved (`artifact-store.js` L181–207) |
| Marker read/merge/serialize | ✅ Implemented | `loadMarkerFromMember`/`scanMemberMarkers`/`mergeMarkersIntoAtlas`/`serializeAtlas` exported (`workspace-atlas.js`) |
| Idempotent atomic `enroll` | ✅ Implemented | content-minus-timestamp `isDeepStrictEqual`, `.tmp`+`rename` (`federation-marker.js`) |
| explore/classify backbone | ✅ Implemented | `federation-explore.js` composes WU1/WU2 functions; per-member failure → `pending`, never aborts |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Additive regeneration branch, not a rewrite | ✅ Yes | error-path-only regeneration; happy path untouched |
| Read/merge in atlas module; WRITE in new `federation-marker.js` | ✅ Yes | separation honored; `enroll` write-only module |
| Idempotent enroll via content-minus-timestamp | ✅ Yes | `isDeepStrictEqual`, order-insensitive (stricter than design's string compare) |
| Merge = union + latest-wins + lexicographic tiebreak, fail-open | ✅ Yes | tiebreak `svc-web > svc-api` proven; tie warning emitted |
| explore as `sdd-workspace` subcommand | ⚠️ Partial | realized as a new `federation-explore.js` lib module backing the subcommand (test 5.1 mandated executable code) — documented deviation S2 |
| `target_dir` via `## Parameters`; filesystem-derived lot state | ✅ Yes | documented in `SKILL.md`/`agent.md`; no separate lot file |
| Corruption detection (heuristic) | ⚠️ Deviation | parseAtlas is lenient → corruption inferred as non-empty content parsing to 0 members AND 0 contracts (W2) |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | "TDD Cycle Evidence" tables present for WU1–WU5 in apply-progress |
| All tasks have tests | ✅ | 63 new tests across 6 files cover every WU (WU1–WU5 54 + WU6 4 + WU7 5) |
| RED confirmed (tests exist) | ✅ | All listed test files exist and were verified in the codebase |
| GREEN confirmed (tests pass) | ✅ | 362/362 on verify's own execution |
| Triangulation adequate | ✅ | merge 7 cases, enroll first/idempotent/key-order/change, classify micro/nuget/null |
| Safety Net for modified files | ✅ | `parseAtlas`/federated cases run green before and after the additive inversion |

**TDD Compliance**: 6/6 checks passed.

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | ~36 | `workspace-atlas.test.js`, `federation-marker.test.js` | `node:test` |
| Integration (fs/git fixtures) | ~18 | `artifact-store.test.js`, `federation-explore.test.js` | `node:test` + `fs.mkdtemp` + real `git` |
| Content-contract | 17 | `sdd-init-federation.test.js`, `federation-derived-cache.test.js` | `node:test` |
| **Total (suite)** | **362** | all `scripts/**/*.test.js` | |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected in the repo. Not a failure.

### Assertion Quality
Audited all 6 change-related test files (`workspace-atlas.test.js`, `artifact-store.test.js`,
`federation-marker.test.js`, `federation-explore.test.js`, `sdd-init-federation.test.js`,
`federation-derived-cache.test.js`).

- No tautologies (`expect(true)…`), no assertions without a production-code call.
- No ghost loops over possibly-empty collections.
- Merge/enroll/explore assertions verify concrete expected values (winner role, tie winner
  `svc-web`, survivor set `[m-a, m-c]`, byte-stable marker content, fresh status).
- Content-contract tests assert specific behavioral tokens (not mere file existence), matching
  the repo's established `docs-lint`/`manifest-sync` pattern.

**Assertion quality**: ✅ All assertions verify real behavior.

### Quality Metrics
**Linter**: ➖ Not available (no standalone linter target; `scripts/check.js` validators pass `0 errors, 0 warnings`)
**Type Checker**: ➖ Not available (plain CommonJS, no TS in `scripts/lib`)

### Issues Found

**CRITICAL**: None. (`risk-critical-001` path traversal was the only prior CRITICAL; it is
now **remediated by WU6** and closed by 4 executable RED-first tests — see WU6 Security
Verification. It remains closed post-WU7 with no regression.)

**CLOSED THIS RE-VERIFY (by WU7, confirmed by tests)**:
- **`resilience-warning-001`** (was W5) [code-bug] — `readExistingMarker` non-ENOENT swallow /
  data loss. **CLOSED**: read/parse split rethrows genuine I/O errors; proven by the `EACCES`
  byte-preservation test and the `EISDIR` rethrow test.
- **`reliability-warning-002`** (was W6) [tasks-gap] — corrupt/empty existing-marker recovery had
  no test. **CLOSED**: present-but-unparseable (whitespace) marker self-heal proven by a green
  regression test (`status: written`, clean re-parse).
- **`risk-warning-symlink-001`** [code-bug] — lexical-only containment symlink escape. **CLOSED**:
  physical `isRealPathWithinRoot` lstat/realpath guard at the `scanMemberMarkers` boundary; proven
  by the read-path (`scanMemberMarkers`) and write-path (`explore`) symlink-escape tests.

**WARNING** (all pre-existing, NONE introduced or regressed by WU6/WU7; none in WU7 scope):
- **W1 [spec-gap]** — Cross-spec wording inconsistency. `workspace-explore` › *Member
  Classification* states all four dimensions "MUST be recorded in the member's marker via
  `enroll`", but `federation-markers` › *Derived Member State* explicitly says
  brownfield/init-done are NOT stored in the marker. The implementation records only
  `type`+`layer` in the marker and brownfield/init-done in `workspace-map.md` — internally
  consistent with the authoritative `federation-markers` spec, but the two change-local specs
  contradict each other in prose. Recommend reconciling the wording in `sdd-spec`. Non-blocking.
- **W2 [design-gap]** — Heuristic corruption detection. `isCorruptCache` (`artifact-store.js`)
  flags any non-empty cache that parses to 0 members AND 0 contracts as corrupt and regenerates.
  A legitimately empty federated workspace (valid atlas, zero members, non-empty bytes) would
  trigger an unnecessary regeneration. Safe (regeneration is idempotent) and documented in
  apply-progress, but the signal is heuristic rather than a true parse error. Low impact.
- **W3 [code-bug / known-flake, NOT a regression]** — WU1 `git` integration test
  (`artifact-store.test.js > warns but keeps loading when workspace.yaml is git-tracked`) is a
  real `git init`/`git add` fixture reported as intermittently flaky. It did **not** reproduce
  in this verify (full suite 362/362, plus isolated `node --test scripts/lib/artifact-store.test.js`
  → 17/17). Reproduction notes: re-run the isolated file repeatedly; a lone transient `fail 1`
  there is this pre-existing flake (no DI seam over `spawnSync`), not a code defect. Recommend a
  retry/de-flake or a `spawnSync` seam in a follow-up. Non-blocking.
- **W4 [design-gap, inherent limitation]** — Agent-procedure scenarios for `sdd-init`
  (`target_dir` resolution, ENOENT→blocked, container-detection gate, `federated|normal` options)
  are verified only by `static-proof` content-contract token tests, not by runtime execution of
  the agent honoring `target_dir`/blocking. This is inherent to markdown-agent deliverables and
  matches the repo pattern, but the runtime behavior is not executably guaranteed. Accepted.

> Note: the prior **W5** (`resilience-warning-001`) and **W6** (`reliability-warning-002`) WARNINGs
> are now **CLOSED by WU7** (see "CLOSED THIS RE-VERIFY" above) and are no longer open.

**SUGGESTION** (advisory, non-blocking, open for follow-up):
- **S1** — explore-written markers omit `roster` and `member.remote`, so `loadMarkerFromMember`
  emits a fail-open "no remote" warning for every explore-enrolled member. Harmless but noisy;
  consider suppressing/labeling explore-origin markers.
- **S2** — `federation-explore.js` is a new lib module not enumerated in the design *File Changes*
  table (design realized explore as a `SKILL.md` subcommand). Task 5.1 mandated an executable
  integration test, which required the module. Additive and documented; consider updating the
  design retroactively for traceability.
- **S3 (explore non-atomic multi-artifact write)** — `explore` writes `workspace.yaml` +
  `workspace-map.md` per-member without a transactional barrier; a crash mid-run can leave a
  partially-regenerated cache. Self-healing on the next run (cache is derived), so low impact.
- **S4–S6 / readability (×2)** — the remaining 4R SUGGESTIONs plus the two `review-readability`
  advisories (naming/comment density in the new lib modules) are cosmetic, non-blocking, and
  carried forward for follow-up. None affect behavior or test outcomes.

All advisory items above remain **open follow-ups, not regressions**.

### Verdict
**PASS WITH WARNINGS** (final re-verify post-WU7, `stale` flag cleared)
All 35 spec scenarios are satisfied (35/35), the full `npm test` pipeline is runtime-green
(its embedded "Native Node tests" step plus verify's own direct run = **362/362**, 0 fail,
0 skipped), TDD evidence is real and confirmed for WU1–WU7, and the additive WU6+WU7 guards left
`parseAtlas` byte-identical and every pre-existing federated test green.

**Both WU7 findings are CLOSED BY TESTS:** (Fix A) `resilience-warning-001`/`reliability-warning-002`
— `readExistingMarker` now splits read vs parse, rethrows genuine non-ENOENT I/O errors so a healthy
marker is byte-preserved (`assert.equal(after, seeded)`) instead of overwritten, while the
present-but-unparseable self-heal still rewrites (`status: written`); (Fix B) `risk-warning-symlink-001`
— a physical `isRealPathWithinRoot` lstat/realpath guard at the `scanMemberMarkers` boundary skips
an existing symlink/junction member that escapes the real container (no out-of-tree read on the
read path; `exists(outside/marker) === false` on the write path), while a not-yet-existing first-enroll
dir and a normal in-root member still work.

**`risk-critical-001` (WU6) remains CLOSED with no regression:** the lexical `isWithinRoot`
`../`/absolute traversal rejection is preserved alongside the new physical guard, and its RED-first
tests stay green in the 362-suite. `parseAtlas` is byte-identical across WU6 and WU7.

**Remaining open advisories (follow-up, not regressions):** W1 (spec wording), W2 (heuristic
corruption detection), W3 (`reliability-warning-001` known git flake — did NOT reproduce: full suite
362/362 + isolated artifact-store 17/17), W4 (inherent agent-procedure static-proof), and the
SUGGESTIONs S1–S6 (explore-origin marker noise, design traceability for `federation-explore.js`,
explore non-atomic multi-artifact write, two `review-readability` cosmetics). No CRITICAL defects;
the change is **ready to archive**.
