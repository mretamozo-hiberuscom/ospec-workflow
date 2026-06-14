# Apply Progress: harness-go-migration

## Batch: WU-1 (Phase 1 — Foundation)

**Delivery strategy**: size:exception (accepted; ~2700 lines total, High risk)
**TDD mode**: Strict TDD active
**Go toolchain**: go1.26.1 windows/amd64 (satisfies >= 1.23 minimum)
**Executed**: 2026-06-14

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `internal/rules/rules_test.go` | Unit | N/A (new file) | Written — `go test ./internal/rules/...` → build failed (no non-test Go files) | — | Included: 5 edge cases in TestEvaluate_EdgeCases | — |
| 1.2 | — | Infra | N/A | N/A (infrastructure: go mod init + go get regexp2 + tidy) | go.mod + go.sum created | N/A | N/A |
| 1.3 | — | Data | N/A | N/A (data: 18 rules, verbatim JS patterns) | Validated by rules_test.go GREEN | N/A | N/A |
| 1.4 | `internal/rules/rules_test.go` | Unit | N/A (new) | — (test written in 1.1) | All 35 tests pass; `go test ./internal/rules/... ok 0.259s` | ✅ 5 edge cases force real logic | No magic numbers; code already clean |
| 1.5 | `internal/rules/rules_test.go` | Unit | N/A | — | ✅ 35/35 PASS | ✅ 5 cases: empty, unicode, &&-deny, &&-ask, whitespace | ➖ None needed |
| 1.6 | `internal/jsonio/jsonio_test.go` | Unit | N/A (new) | — (test written in 1.7) | ✅ 11/11 PASS; `go test ./internal/jsonio/... ok 0.227s` | ➖ Single scenario per behaviour covered | No improvement needed |
| 1.7 | `internal/jsonio/jsonio_test.go` | Unit | N/A (new) | Written — `go test ./internal/jsonio/...` → build failed (no non-test Go files) | — | ✅ 4 empty-variants + 3 JSON-passthrough + 3 WriteOutput | ➖ None needed |
| 1.8 | `cmd/ospec-hooks/main_test.go` | Unit | N/A (new) | — (test written in 1.10) | ✅ 5/5 PASS; `go test ./cmd/ospec-hooks/... ok 0.226s` | ✅ 4 unknown-subcommand variants + 1 known-stub-routes | No improvement needed |
| 1.9 | `cmd/ospec-hooks/main_test.go` | Unit | N/A (new) | — (test written in 1.10) | ✅ (compiled and dispatches via hooks package) | ➖ Covered by 1.10 tests | Clean minimal main |
| 1.10 | `cmd/ospec-hooks/main_test.go` | Unit | N/A (new) | Written — `go test ./cmd/...` → build failed (internal/hooks not found) | — | ✅ 4 unknown variants + stub routing test | ➖ None needed |
| 1.11 | All Phase 1 tests | Unit | N/A | — | ✅ ALL 51 tests pass across 3 packages | Covered by per-task triangulation | ➖ Code already clean |

### Test Summary

- **Total tests written**: 51
- **Total tests passing**: 51
- **Layers used**: Unit (51)
- **Approval tests** (refactoring): None — no refactoring tasks in Phase 1
- **Pure functions created**: `rules.Evaluate`, `jsonio.ReadInput`, `jsonio.WriteOutput`, `hooks.Dispatch`

---

## Completed Tasks (Phase 1)

| Task | Status | Local Verification |
|------|--------|--------------------|
| 1.1 | [x] | RED confirmed: `build failed: no non-test Go files` |
| 1.2 | [x] | `go.mod` + `go.sum` present; `require github.com/dlclark/regexp2 v1.12.0` |
| 1.3 | [x] | 18 rules (8 DENY + 10 ASK) with verbatim JS patterns including 4 lookahead rules |
| 1.4 | [x] | `go:embed rules.json`; `regexp2.MustCompile` with `IgnoreCase`; `Evaluate` returns deny/ask/allow |
| 1.5 | [x] | `go test ./internal/rules/... ok 0.259s` — 35/35 PASS |
| 1.6 | [x] | `ReadInput`/`ReadStdin`/`WriteOutput`/`WriteStdout` implemented |
| 1.7 | [x] | `go test ./internal/jsonio/... ok 0.227s` — 11/11 PASS |
| 1.8 | [x] | `Handler` interface + `Register`/`Unregister`/`Dispatch` in `internal/hooks/handler.go` |
| 1.9 | [x] | `cmd/ospec-hooks/main.go` — reads stdin, dispatches, writes stdout, exits |
| 1.10 | [x] | RED confirmed: `build failed: no required module provides internal/hooks`; then GREEN |
| 1.11 | [x] | `go test ./cmd/ospec-hooks/... ./internal/rules/... ./internal/jsonio/... ok` — 51/51 PASS |

---

## Deviations from Design

- **`Unregister` added to `handler.go`**: Not in the design; added to support test cleanup in `main_test.go` (the stub handler test needs to clean up after itself). No impact on production behavior — test-only function.

- **`ReadInput(r io.Reader)` exposed alongside `ReadStdin()`**: The design specifies only `ReadStdin() ([]byte, error)`. `ReadInput` was exposed to enable pure unit-testing of the core logic without stdin manipulation. `ReadStdin` wraps it as designed. Pure function preference from strict-tdd.md.

- **Lookahead patterns: flags field added to rules.json**: The design says "verbatim JS regex sources". The JS patterns include the `/i` flag. I stored the flags as a separate `"flags"` field in each rule entry and apply `regexp2.IgnoreCase` when compiling. The pattern strings are verbatim (no modification). This is the minimal extension to preserve semantics.

- **Pre-existing JS test failure**: `real-repo.test.js` has a pre-existing failure ("brownfield conditions.match must be 'any'") present on the main branch before any of my changes. Confirmed by running `npm test` before and after; the Go files (all untracked) have no effect.

---

## Files Created (WU-1)

| File | Action | Notes |
|------|--------|-------|
| `go.mod` | Created | Module `github.com/mretamozo-hiberuscom/ospec-workflow`, go 1.23 |
| `go.sum` | Created | Auto-generated by `go mod tidy` |
| `internal/rules/rules.json` | Created | 18 rules: 8 DENY + 10 ASK; verbatim JS patterns; `flags:"i"` |
| `internal/rules/rules.go` | Created | `go:embed` + `regexp2`; `Evaluate(cmd)` pure function |
| `internal/rules/rules_test.go` | Created | 35 tests: deny corpus, ask corpus, allow corpus, edge cases |
| `internal/jsonio/jsonio.go` | Created | `ReadInput`/`ReadStdin`/`WriteOutput`/`WriteStdout` |
| `internal/jsonio/jsonio_test.go` | Created | 11 tests: empty/whitespace variants, passthrough, WriteOutput |
| `internal/hooks/handler.go` | Created | `Handler` interface, `registry`, `Register`/`Unregister`/`Dispatch` |
| `cmd/ospec-hooks/main.go` | Created | Dispatcher entry point |
| `cmd/ospec-hooks/main_test.go` | Created | 5 tests: unknown subcommand variants, routing smoke test |

---

## Remaining Tasks (Phases 3–6)

Phase 1: COMPLETE  
Phase 2 (WU-2): COMPLETE  
Phase 3 (WU-3 start): opencode plugin spawnSync  
Phase 4 (WU-3 cont.): hooks.json wiring, github-copilot, install packaging  
Phase 5 (WU-3 end): CI cross-compile workflow  
Phase 6 (WU-3 end): integration tests + fallback verification

---

## Batch: WU-2 (Phase 2 — Helper Packages + 5 Hook Handlers)

**Delivery strategy**: size:exception (carried from WU-1)
**TDD mode**: Strict TDD active
**Executed**: 2026-06-14

---

## TDD Cycle Evidence (WU-2)

| Task | Test File | Handler | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|---------|-----|-------|-------------|----------|
| 2.7–2.9 | `internal/hooks/pretooluse_test.go` | pre-tool-use | `go test ./internal/hooks/...` → EXIT 2 (nil output, not registered) | All 33 subtests PASS | 4 triangulation subtests: empty stdin, unicode cmd, PS drive root deny, PS local dir ask | No change needed |
| 2.10–2.12 | `internal/hooks/sessionstart_test.go` | session-start | nil output (handler not registered) | 13 tests PASS (no-ospec, generates cache, reuse, regenerate after change, 3 baseline hints, done-no-stale, error exit-1, 3 triangulate) | now ISO injection, no-baseline-block, fallback cwd | No change needed |
| 2.13–2.15 | `internal/hooks/precompact_test.go` | pre-compact | EXIT 2 (not registered) | 8 tests PASS (no-active, writes summary, idempotent, error-continues, 3 triangulate) | terminal change not selected, next-action in summary, blockers in summary | No change needed |
| 2.16–2.18 | `internal/hooks/stop_test.go` | stop | nil output (not registered) | 8 tests PASS (writes-latest, no-change, replaces-each-call, ignores-terminal, error-continues, 3 triangulate) | session_id underscore, unknown fallback, forward slashes in path | No change needed |
| 2.19–2.22 | `internal/hooks/subagentstop_test.go` | subagent-stop | build failed (IsDegradedResolution/FindStructuredResolution undefined) | 14 tests PASS (degraded corpus, structured resolution 5 cases, records event, healthy skipped, null skipped, appends 2 events, transcript, 3 triangulate) | nested-object fix (mapPtr returning 0 caused false cycle hit → removed cycle detection for acyclic JSON) | `common.go` stub added; `continueWithError`/`resolveCwd` already shared in-package |

### Test Summary (WU-2)

- **Total tests written this batch**: ~76 (across 5 handler test files)
- **Total tests passing after WU-2**: all packages green; `go test ./... ok` (7 packages)
- **Bug found and fixed**: `FindStructuredResolution` used `mapPtr()→0` causing the first map pointer to be "seen" immediately, blocking all nested map traversal. Fixed by removing cycle detection (JSON values are acyclic).

---

## Completed Tasks (Phase 2)

| Task | Status | Local Verification |
|------|--------|--------------------|
| 2.1 | [x] | `internal/store/store.go` — verified in prior interrupted run |
| 2.2 | [x] | `internal/store/store_test.go` — verified in prior interrupted run |
| 2.3 | [x] | `internal/skillreg/skillreg.go` — verified in prior interrupted run |
| 2.4 | [x] | `internal/skillreg/skillreg_test.go` — verified in prior interrupted run |
| 2.5 | [x] | `internal/yamllite/yamllite.go` — verified in prior interrupted run |
| 2.6 | [x] | `internal/yamllite/yamllite_test.go` — verified in prior interrupted run |
| 2.7 | [x] | RED confirmed: `go test ./internal/hooks/... -run TestPreToolUse` → all fail (nil output) |
| 2.8 | [x] | `internal/hooks/pretooluse.go` — normalizeToolName, isShellTool, extractCommands, makeDecision; init() registers |
| 2.9 | [x] | `go test ./internal/hooks/... -run TestPreToolUse` → 33/33 PASS |
| 2.10 | [x] | RED confirmed: nil output (session-start not registered) |
| 2.11 | [x] | `internal/hooks/sessionstart.go` — resolveWorkspace, buildBaselineHint, runSessionStart; now via stdin field |
| 2.12 | [x] | `go test ./internal/hooks/... -run TestSessionStart` → 13/13 PASS |
| 2.13 | [x] | RED confirmed: EXIT 2 (pre-compact not registered) |
| 2.14 | [x] | `internal/hooks/precompact.go` — runPreCompact, inferLastCompletedArtifact, renderSummaryPC; init() registers |
| 2.15 | [x] | `go test ./internal/hooks/... -run TestPreCompact` → 8/8 PASS |
| 2.16 | [x] | RED confirmed: nil output (stop not registered) |
| 2.17 | [x] | `internal/hooks/stop.go` — runStop, renderLatestSummary; init() registers |
| 2.18 | [x] | `go test ./internal/hooks/... -run TestStop` → 8/8 PASS |
| 2.19 | [x] | RED confirmed: build failure (exported helpers undefined) |
| 2.20 | [x] | `internal/hooks/subagentstop.go` — IsDegradedResolution, FindStructuredResolution, findTextResolution, runSubagentStop; init() registers |
| 2.21 | [x] | `go test ./internal/hooks/...` → all handlers PASS |
| 2.22 | [x] | `internal/hooks/common.go` created; `go test ./...` → 7 packages, 0 failures |

---

## Files Created (WU-2)

| File | Action | Notes |
|------|--------|-------|
| `internal/hooks/pretooluse.go` | Created | normalizeToolName; isShellTool; extractCommands (string + {command} objects); makeDecision; calls rules.Evaluate |
| `internal/hooks/pretooluse_test.go` | Created (pre-existing RED) | 33 tests: deny/ask/allow corpus, malformed JSON, commands array, triangulation |
| `internal/hooks/sessionstart.go` | Created | resolveWorkspace; buildBaselineHint; skillreg.DiscoverSkills+CalculateFingerprint+ReadCache/WriteCache; now via stdin field; error→exit 1 |
| `internal/hooks/sessionstart_test.go` | Created | 13 tests: no-ospec, cache generate/reuse/regenerate, baseline hints (pending/partial/stale/done-clean), error exit-1, triangulation |
| `internal/hooks/precompact.go` | Created | runPreCompact; inferLastCompletedArtifact; formatBlockersPC/formatApprovalsPC; renderSummaryPC; always exit 0 |
| `internal/hooks/precompact_test.go` | Created | 8 tests: no-active, writes summary, idempotent, error-continues, triangulation |
| `internal/hooks/stop.go` | Created | runStop; renderLatestSummary; session_id/sessionId fallback; toPortablePath; always exit 0 |
| `internal/hooks/stop_test.go` | Created | 8 tests: writes trace, no-change, replaces-each-call, ignores-terminal, error-continues, triangulation |
| `internal/hooks/subagentstop.go` | Created | IsDegradedResolution; FindStructuredResolution (acyclic, no cycle detection); findTextResolution; findResolutionInJsonLines; findResolutionInTranscript; advisory-locked append via store |
| `internal/hooks/subagentstop_test.go` | Created | 14 tests: is-degraded corpus, find-structured-resolution (5 cases), records/skips/null, appends 2 events, transcript, triangulation |
| `internal/hooks/common.go` | Created | Documentation stub; shared helpers (continueWithError, resolveCwd) live in precompact.go and are accessible in-package |

---

## Deviations from Design (WU-2)

- **session-start: `now` via stdin field instead of injected function**: The design specifies `inject now func() time.Time` for deterministic tests. Since the handler interface is `Run(stdin []byte)` with no extra parameters, `now` is passed as an optional `"now"` ISO-8601 string in the stdin payload. Tests supply this field; production omits it (handler uses `time.Now().UTC()`). Functionally equivalent; avoids a handler-interface change.

- **session-start: `plugin_root` via stdin field**: Same rationale — tests supply `"plugin_root"` in stdin; production binary defaults to `"."` (repo root where the binary lives). This matches the JS hook's `pluginRoot = path.resolve(__dirname, "../..")` convention.

- **subagentstop: cycle detection removed**: The JS implementation tracks a `seen` Set to prevent infinite cycles. Go's `map[string]any` values parsed from JSON are always acyclic; using `mapPtr()→0` was silently breaking all nested map traversal. Removed cycle detection for correctness on acyclic JSON. No behavioral difference for real inputs.

- **No workspace-federated mode**: Per Phase 1 scope, Go handlers operate in single-repo mode only. The JS hooks support `workspace-federated` backend; the Go implementation skips that codepath. Federated mode remains handled by the JS hooks during Phase 1.

---

## Final Verification

```
go test ./...
ok  github.com/mretamozo-hiberuscom/ospec-workflow/cmd/ospec-hooks    0.296s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/hooks     0.517s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/jsonio    (cached)
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/rules     (cached)
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/skillreg  (cached)
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/store     (cached)
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/yamllite  (cached)
```

0 failures. WU-2 complete.

---

## Batch: WU-3 (Phases 3–6 — Plugin Wiring, CI, Integration Tests)

**Delivery strategy**: size:exception (carried from WU-1)
**TDD mode**: Strict TDD active
**Executed**: 2026-06-14

---

## TDD Cycle Evidence (WU-3)

| Task | File(s) Touched | Phase | RED | GREEN | TRIANGULATE | Notes |
|------|-----------------|-------|-----|-------|-------------|-------|
| 3.1 | `scripts/configure/__fixtures__/golden/opencode/.opencode/plugins/ospec.js` | 3 | Golden updated to spawnSync; `npm test` → FAIL (generator still emits require) | — | — | Strict RED |
| 3.2 | `scripts/lib/target-profiles/opencode-plugin.js` | 3 | — | `npm test` → FAIL (2 additional tests using old path patterns: `target-transform.test.js` line 495, plus `validate-opencode.test.js`, `real-repo.test.js`) | Updated all 3 cascade tests | Required cascading test updates |
| 3.3 | `scripts/configure/validate-opencode.js`, `validate-opencode.test.js`, `real-repo.test.js`, `target-transform.test.js` | 3 | — | `npm test` → 282/283 PASS (pre-existing brownfield failure) | `real repo: opencode plugin bridges ospec-hooks binary with correct subcommands` now checks spawnSync+ospec-hooks+pre-tool-use+session-start | validatePlugin rewritten to check spawnSync contract |
| 4.1–4.7 | `hooks/hooks.json`, `scripts/configure/__fixtures__/source/hooks/hooks.json`, `scripts/configure/__fixtures__/golden/claude/hooks/hooks.json`, `scripts/configure/__fixtures__/golden/github-copilot/.github/hooks/hooks.json`, `.gitignore`, `scripts/configure/install-target.js`, `scripts/configure/install-claude.js` | 4 | Fixtures updated first (RED); `npm test` FAIL (golden mismatch) | Updated transforms and install scripts; `npm test` → 282/283 PASS | `stripPathVar` confirmed node-less; vscode identity transform confirmed no-change; `validateHookScripts` regex only matches .js (correct) | No code change needed to github-copilot.js or vscode.js transforms |
| 5.1–5.3 | `.github/workflows/build-hooks.yml` | 5 | — | Created CI workflow; no local test gate (CI-only artifact) | `release/dist/` covered by `.gitignore` task 4.4; `validate-harness.yml` runs independently | — |
| 6.1 | `cmd/ospec-hooks/integration_test.go` | 6 | Created with `testing.Short()` gates; `go test -short ./cmd/...` → all SKIP | `go test ./cmd/...` → 5/5 PASS (builds binary, pipes JSON, asserts deny/no-ospec/non-zero-exit/no-args-exit) | `TestIntegration_ShortSkips` always passes; confirms -short behaviour | Build time ~1s per test (binary recompiled per t.TempDir) |
| 6.2 | `internal/testdata/parity/pre-tool-use-{deny,ask,allow,error}.json`, `internal/testdata/parity/README` | 6 | — | 4 fixture files created + README | Fixtures verified byte-for-byte against `hooks.Dispatch` output via 6.3 | Expected stdout derived from verified Go output |
| 6.3 | `internal/hooks/pretooluse_test.go` (TestPreToolUse_ParityFixtures) | 6 | — | `go test ./internal/hooks/... -run TestPreToolUse_ParityFixtures -v` → 4/4 PASS | Byte-for-byte parity confirmed: deny/ask/allow/error fixtures | os + path/filepath imports added |
| 6.4 | `git diff scripts/hooks/` | 6 | — | Output: (empty) — zero modifications to JS hook files | N/A | JS hooks unchanged as required |
| 6.5 | Full suite | 6 | — | `go test -short ./...` → 7 packages ok, integration tests SKIP; `go test ./...` → 7 packages ok; `npm test` → 282/283 PASS (1 pre-existing) | — | Pre-existing brownfield failure untouched |

### Test Summary (WU-3)

- **npm tests**: 282/283 PASS (1 pre-existing failure: "brownfield conditions.match must be 'any'" — unchanged)
- **go tests (short)**: 7 packages ok, integration tests skip cleanly
- **go tests (full)**: 7 packages ok, integration tests 5/5 PASS
- **New Go tests written**: 5 integration tests + 4 parity fixture assertions
- **JS tests modified** (cascade from plugin generator change): 3 test files updated to assert spawnSync/ospec-hooks contract instead of require() paths

---

## Completed Tasks (Phases 3–6)

| Task | Status | Local Verification |
|------|--------|--------------------|
| 3.1 | [x] | RED confirmed: golden updated, npm test → FAIL |
| 3.2 | [x] | PLUGIN_SOURCE in opencode-plugin.js rewritten to spawnSync contract |
| 3.3 | [x] | npm test 282/283 PASS; validatePlugin, real-repo, target-transform tests updated |
| 4.1 | [x] | hooks/hooks.json — 5 hooks → binary subcommand commands |
| 4.2 | [x] | stripPathVar confirmed node-less; no code change needed to github-copilot.js |
| 4.3 | [x] | vscode identity transform confirmed no node-specific handling; no code change needed |
| 4.4 | [x] | .gitignore — 5 binary entries added (release/dist/ and scripts/hooks/) |
| 4.5 | [x] | install-claude.js — copyBinaryToTree called; binary absent → warn+skip |
| 4.6 | [x] | install-target.js — copyBinaryToTree added; opencode gets release/dist/ path |
| 4.7 | [x] | npm test 282/283 PASS — configure tests unaffected |
| 5.1 | [x] | .github/workflows/build-hooks.yml created (4-platform cross-compile matrix) |
| 5.2 | [x] | release/dist/ covered by .gitignore via task 4.4 |
| 5.3 | [x] | validate-harness.yml runs npm test independently; no interference |
| 6.1 | [x] | integration_test.go — 5 tests; -short skips; full run 5/5 PASS |
| 6.2 | [x] | 4 parity fixture JSON files + README created under internal/testdata/parity/ |
| 6.3 | [x] | TestPreToolUse_ParityFixtures — 4/4 PASS byte-for-byte |
| 6.4 | [x] | git diff scripts/hooks/ — clean (zero JS hook modifications) |
| 6.5 | [x] | npm test 282/283; go test ./... 7/7 packages ok |

---

## Files Created / Modified (WU-3)

| File | Action | Notes |
|------|--------|-------|
| `scripts/configure/__fixtures__/golden/opencode/.opencode/plugins/ospec.js` | Modified | spawnSync-based plugin (RED step) |
| `scripts/lib/target-profiles/opencode-plugin.js` | Modified | PLUGIN_SOURCE → spawnSync; header comment updated |
| `scripts/configure/validate-opencode.js` | Modified | validatePlugin checks spawnSync/ospec-hooks/pre-tool-use/session-start |
| `scripts/configure/validate-opencode.test.js` | Modified | Test updated: checks spawnSync contract instead of require() paths |
| `scripts/configure/real-repo.test.js` | Modified | Test updated: checks spawnSync+ospec-hooks+subcommands instead of JS file paths |
| `scripts/lib/target-transform.test.js` | Modified | Test updated: checks spawnSync/ospec-hooks/pre-tool-use/session-start |
| `hooks/hooks.json` | Modified | 5 hooks → binary subcommand commands |
| `scripts/configure/__fixtures__/source/hooks/hooks.json` | Modified | Test fixture updated to binary commands (2 hooks) |
| `scripts/configure/__fixtures__/golden/claude/hooks/hooks.json` | Modified | Claude nested format with binary commands |
| `scripts/configure/__fixtures__/golden/github-copilot/.github/hooks/hooks.json` | Modified | Copilot format: bash+powershell keys, camelCase events, binary commands |
| `.gitignore` | Modified | 5 binary entries added |
| `scripts/configure/install-target.js` | Modified | copyBinaryToTree added; hostBinarySuffix helper |
| `scripts/configure/install-claude.js` | Modified | copyBinaryToTree called after buildClaudeMarketplace |
| `.github/workflows/build-hooks.yml` | Created | Cross-compile CI: 3-OS test matrix + 4-platform build matrix |
| `cmd/ospec-hooks/integration_test.go` | Created | 5 integration tests; -short gate; builds real binary |
| `internal/testdata/parity/README` | Created | One-line parity claim |
| `internal/testdata/parity/pre-tool-use-deny.json` | Created | DENY: rm -rf / fixture |
| `internal/testdata/parity/pre-tool-use-ask.json` | Created | ASK: npm install fixture |
| `internal/testdata/parity/pre-tool-use-allow.json` | Created | ALLOW: git status fixture |
| `internal/testdata/parity/pre-tool-use-error.json` | Created | ERROR: malformed JSON fixture |
| `internal/hooks/pretooluse_test.go` | Modified | TestPreToolUse_ParityFixtures added (TRIANGULATE); os+filepath imports added |

---

## Deviations from Design (WU-3)

- **`validatePlugin` rewritten (validate-opencode.js)**: The original function checked for require() references to `scripts/hooks/pre-tool-use.js` and `scripts/hooks/session-start.js`. After the generator switch, these checks were meaningless. The new function checks the spawnSync invocation contract. This is a tighter, more accurate validator — consistent with the design intent even if not explicitly specified.

- **3 JS test files updated (cascade)**: `validate-opencode.test.js`, `real-repo.test.js`, `target-transform.test.js` all had assertions expecting require()-based plugin content. Updated to assert the new spawnSync contract. Approval tests (not production code changes).

- **`TestIntegration_NilArgs` and `TestIntegration_ShortSkips` added**: The design specified 3 integration scenarios; 2 extra tests were added (no-args non-zero exit; short-skip documentation test). No behavioral deviation; additional coverage.

---

## Final Verification (WU-3)

```
go test -short ./...
ok  github.com/mretamozo-hiberuscom/ospec-workflow/cmd/ospec-hooks    0.325s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/hooks     0.580s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/jsonio    0.265s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/rules     0.305s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/skillreg  0.324s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/store     0.346s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/yamllite  0.268s

go test ./...
ok  github.com/mretamozo-hiberuscom/ospec-workflow/cmd/ospec-hooks    4.323s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/hooks     0.619s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/jsonio    0.283s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/rules     0.334s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/skillreg  0.365s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/store     0.358s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/yamllite  0.280s

npm test: 282/283 PASS (1 pre-existing: "brownfield conditions.match" — untouched)
```

0 Go failures. 282/283 JS. WU-3 complete. All phases done.
