# Verification Report: harness-go-migration

**Verdict: PASS WITH WARNINGS**

Strict TDD verification of the Go runtime-hooks migration (Phase 1). All MUST spec
scenarios are backed by runtime test evidence or accepted golden/static proof. Both
test suites are green except for one pre-existing, unrelated JS failure. No CRITICAL
defects. Three WARNINGs and two SUGGESTIONs (all previously known / accepted-scope).

- Change: `harness-go-migration`
- Mode: openspec / standard route
- Strict TDD: ACTIVE (orchestrator-asserted)
- Runners: `go test ./...` (go1.26.1, satisfies >=1.23) + `npm test` (Node test runner)
- Verified: 2026-06-14

---

## Test Execution Evidence (runtime)

### Go — `go test -count=1 ./...` (fresh, uncached)

```
ok  .../cmd/ospec-hooks    4.297s
ok  .../internal/hooks     0.614s
ok  .../internal/jsonio    0.297s
ok  .../internal/rules     0.346s
ok  .../internal/skillreg  0.378s
ok  .../internal/store     0.383s
ok  .../internal/yamllite  0.295s
```

7/7 packages PASS, 0 failures. `internal/hooks` alone: 104 subtests PASS / 0 FAIL.
`go test -short ./...` cleanly SKIPs the integration suite (confirmed). Full run executes
the 5 integration tests (real binary built + piped JSON).

### JS — `npm test`

```
tests 283 | pass 282 | fail 1 | skipped 0
```

The single failure is `real repo: live brownfield routing entry matches brownfield ctx
and rejects baselined ctx` (`scripts/configure/real-repo.test.js:341`,
"brownfield conditions.match must be 'any'"). This is **pre-existing on main (59fbfe8),
unrelated to this change**, and explicitly excluded from this change's defect accounting.
Not counted against this change.

---

## Spec Compliance Matrix (specs/hooks-runtime/spec.md)

| # | Requirement / Scenario | Strength | Evidence | Level | Status |
|---|------------------------|----------|----------|-------|--------|
| R1 | Hook registered with correct subcommand (5 events) | MUST | `hooks/hooks.json` maps all 5 events to correct subcommand + timeout 5 (none on SessionStart); claude golden + integration tests | runtime-test | PASS |
| R1 | github-copilot both shell keys updated | MUST | github-copilot golden: bash+powershell identical repo-relative paths; `target-transform.test.js`/`validate-opencode.test.js` green | runtime-test | PASS |
| R2 | Binary runs without Node.js | MUST | Native Go binary; `integration_test.go` builds + invokes binary directly, no node in path; pure stdlib+regexp2 | runtime-test | PASS |
| R3 | Dispatcher routes to correct handler | MUST | `main_test.go TestDispatch_KnownSubcommandRoutes`; per-handler `init()` registration; 104 hooks subtests | runtime-test | PASS |
| R3 | Unknown subcommand rejected cleanly (non-zero, no JSON) | MUST | `main_test.go TestDispatch_UnknownSubcommand` (4 variants: unknown/nil/empty/empty-string) + `integration` no-args exit non-zero | runtime-test | PASS |
| R3 | session-start exits 1 on unhandled error | MUST | `sessionstart_test.go` error → `{status:"error"}` + exitCode 1 | runtime-test | PASS |
| R3 | pre-tool-use exits 0 on parse error (→ ask) | MUST | `pretooluse_test.go TestPreToolUse_MalformedJSON` → ask, exit 0 | runtime-test | PASS |
| R4 | claude + vscode wiring covers all 5 hooks | MUST | `hooks/hooks.json` (5 hooks) + vscode identity transform verified node-less; claude golden | runtime-test | PASS |
| R4 | github-copilot wiring covers only its 2 hooks | MUST | golden declares only sessionStart + preToolUse | runtime-test | PASS |
| R5 | opencode blocks deny-level command (throw) | MUST | Golden plugin: `deny|ask → throw Error(reason)`; generator golden byte-match (npm); Go binary deny runtime-tested. No e2e plugin execution. | static-proof + inspection | PASS (W1) |
| R5 | opencode blocks ask-level command (throw) | MUST | same as above | static-proof + inspection | PASS (W1) |
| R5 | session-start failure non-fatal | MUST | Golden plugin: try/catch swallow around session.created spawnSync | inspection-proof | PASS (W1) |
| R5 | pre-tool-use spawn failure fail-open | MUST | Golden plugin: ENOENT/non-zero/unparseable → no verdict → return (allow) | inspection-proof | PASS (W1) |
| R5 | binary path resolution (dist then PATH) | MUST | Golden `resolveBinary()`: `../../release/dist/ospec-hooks[.exe]` then PATH | inspection-proof | PASS |
| R6 | Rollback restores JS hooks without data migration | MUST | JS hooks present + intact; config revert is a one-line-per-target string swap; no `.ospec/` change | inspection-proof | PASS |
| R6 | JS hooks unmodified while Go binary active | MUST | `git diff scripts/hooks/` clean; zero untracked files in `scripts/hooks/` (task 6.4) | runtime-test (verified) | PASS |
| R2 | Go 1.23+ minimum | MUST | `go.mod` go 1.23; toolchain go1.26.1 | static-proof | PASS |
| R2 | Cross-compile matrix (win/macOS arm64+amd64/linux amd64) | MUST | `.github/workflows/build-hooks.yml` 4-platform build matrix | inspection-proof (CI-only) | PASS |
| R2 | Binaries NOT committed | MUST | `.gitignore` entries for `release/dist/` + `scripts/hooks/ospec-hooks*` | static-proof | PASS |
| R2 | DENY/ASK embedded via go:embed | MUST | `internal/rules/rules.go` `//go:embed rules.json`; 18 rules | runtime-test | PASS |
| R2 | All 5 contracts via Go table-driven tests | MUST | 5 handler `*_test.go` ported from `*.test.js`; all green | runtime-test | PASS |
| NFR | <10 transitive deps (stdlib + regexp2) | SHOULD | single dep `dlclark/regexp2 v1.12.0` | static-proof | PASS |

**MUST coverage: complete.** No MUST scenario lacks at least accepted static-proof.

---

## DENY/ASK Lookahead Parity (regexp2) — focus item

The 4 rules that require lookahead (`(?=...)`, impossible in stdlib RE2) compile and run
under `regexp2`, and tests exercise the lookahead-driven deny-vs-ask discrimination:

| Lookahead rule | Test (passing) | Discrimination proven |
|----------------|----------------|------------------------|
| `rm` recursive-force → **deny** when target is `/` | `rules_test TestEvaluate_Deny/rm_-rf_/` + `pretooluse TestPreToolUse_DenyCorpus` | `rm -rf /` deny |
| `rm` recursive-force → **ask** otherwise | `rules_test TestEvaluate_Ask/rm_-rf_./dist` + `pretooluse_Triangulate` | `rm -rf ./dist` ask |
| `Remove-Item` recurse+force → **deny** at drive root | `TestEvaluate_Deny/Remove-Item_C:\_-Recurse_-Force` + `pretooluse_Triangulate` | `Remove-Item C:\ ...` deny |
| `Remove-Item` recurse+force → **ask** for local dir | `TestEvaluate_Ask/Remove-Item_./dist...` + `pretooluse_Triangulate` | `Remove-Item ./dist ...` ask |

Additionally `git push --force` (deny) vs `git push --force-with-lease` (ask) is exercised
and passes, confirming pattern-precedence + ASK/DENY ordering. Lookahead parity: **verified
at runtime**.

---

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | OK | 3 batches (WU-1/2/3) with TDD Cycle Evidence tables in apply-progress |
| All tasks have tests | OK | Every handler/engine task maps to an existing `*_test.go` |
| RED confirmed (tests exist) | OK | All reported test files exist; RED states (build-fail / nil-output) plausible for new packages |
| GREEN confirmed (tests pass) | OK | Fresh `go test -count=1 ./...` → 7/7; 104 hooks subtests pass |
| Triangulation adequate | OK | Edge-case subtests present (empty/unicode/whitespace/&&-chains; deny-vs-ask drive-root) |
| Safety Net for modified files | OK | Go files are new; JS golden changes guarded by existing npm suite |

**TDD Compliance: 6/6 checks passed.**

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | ~190 (51 WU-1 + ~76 WU-2 + handlers/helpers) | 10 Go `*_test.go` | `go test` |
| Integration | 5 | `cmd/ospec-hooks/integration_test.go` (real binary, -short gated) | `go test` |
| Cross-impl parity | 4 fixtures | `internal/testdata/parity/*.json` via `TestPreToolUse_ParityFixtures` | `go test` |
| JS generator/wiring | 282 passing | configure + target-transform suites | Node test runner |

### Changed File Coverage

Coverage analysis skipped — no coverage threshold tool configured for this change. Per-file
coverage is informational only and not blocking under the strict-TDD rules.

---

## Assertion Quality Audit

Scanned all 12 Go `*_test.go` files. No tautologies (`if true`), no assertions that skip
production code, no ghost loops over possibly-empty collections that pass silently.

| File | Line | Pattern | Assessment | Severity |
|------|------|---------|------------|----------|
| `cmd/ospec-hooks/integration_test.go` | 149-155 | `TestIntegration_ShortSkips` asserts nothing (`_ = os.Getenv("HOME")` to dodge lint) | Deliberate documentation placeholder; not masquerading as scenario coverage (real integration scenarios are separate tests) | SUGGESTION (S2) |
| `internal/hooks/pretooluse_test.go` | 219-252 | parity loop guarded by `if len(paths)==0 { t.Skip }` | Correct guard — not a ghost loop; fixtures confirmed present (4/4 run) | OK |
| various | — | `_ = json.Unmarshal(...)` / `_ = os.WriteFile(...)` in setup | Standard Go test setup error-ignoring, not weak assertions | OK |

The deny/ask/allow corpora, dispatcher, and parity tests all call real production code
(`hooks.Dispatch`, `rules.Evaluate`) and assert concrete values + exit codes.

**Assertion quality: 0 CRITICAL, 0 WARNING, 1 SUGGESTION.**

### Quality Metrics

- Linter: not configured for Go in this repo — skipped (not a failure).
- Type checker: `go build`/`go vet` implicit via `go test` compilation — clean.

---

## Findings (severity + origin tag)

### CRITICAL
None.

### WARNING

- **W1 — opencode plugin behavior has no end-to-end execution test** `[tasks-gap]`
  The 4 opencode SpawnSync scenarios (deny→throw, ask→throw, session-start swallow,
  pre-tool-use fail-open) are proven by golden byte-match of the generated plugin plus
  Go-binary runtime tests, but no test loads `.opencode/plugins/ospec.js` and invokes its
  `tool.execute.before`/`event` handlers against a (mock or real) spawnSync. The throw/
  fail-open logic is small and fully visible in the golden, so risk is low. Recommend a
  future plugin-execution test that stubs `spawnSync` and asserts throw/return.

- **W2 — workspace-federated backend not implemented in Go handlers** `[design-gap]`
  Go `session-start`/`pre-compact` handle single-repo only; the JS hooks still own
  `workspace-federated`. Known and accepted for Phase 1. The active config uses backend
  `openspec` (not federated), so no live spec scenario is broken. Tracked for the wiring
  cutover phase.

- **W3 — `subagent-stop` cycle detection removed vs JS** `[code-bug]` (low)
  The Go port dropped the JS `seen`-set cycle guard because the original `mapPtr()→0`
  implementation silently broke all nested-map traversal. JSON values are acyclic so this
  is behaviorally correct for real inputs, and 14 subagentstop tests pass. Noted because it
  is a deliberate divergence from the JS source; no defect observed.

### SUGGESTION

- **S1 — Go module path is a placeholder** `[tasks-gap]`
  `github.com/mretamozo-hiberuscom/ospec-workflow` must be renamed before commit/archive.
  Known follow-up; not a spec defect.

- **S2 — `TestIntegration_ShortSkips` asserts nothing** `[code-bug]` (cosmetic)
  Documentation-only test. Harmless; consider removing or converting to a real `-short`
  behavior assertion.

---

## Scope / Policy Notes (not defects)

- Working tree intentionally uncommitted (user commits later). No git commit/push performed.
- `git diff scripts/hooks/` is clean and there are no untracked files under `scripts/hooks/`,
  confirming the 5 JS hooks + 5 `*.test.js` remain the intact rollback fallback.

---

## Final Verdict

**PASS WITH WARNINGS.** All MUST scenarios satisfied with runtime-test or accepted
static/golden proof; lookahead DENY/ASK parity proven at runtime; JS fallback intact;
both suites green modulo the single pre-existing unrelated JS failure. No CRITICAL issues.
Address W1 (opencode e2e) and S1 (module rename) before/with archive.
