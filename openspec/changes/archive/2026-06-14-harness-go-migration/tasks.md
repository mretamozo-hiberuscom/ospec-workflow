# Tasks: Harness Go Migration — Phase 1 Runtime Hooks

> Scope: Migrate 5 runtime hooks (`pre-tool-use`, `session-start`, `pre-compact`,
> `stop`, `subagent-stop`) to a single cross-compiled Go binary `ospec-hooks`.
> Generators stay in Node.js except the opencode plugin (`require()` → `spawnSync`).
> JS hooks remain unmodified as rollback fallback throughout Phase 1.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2 700 (+2 600 new Go, +100 modified JS/JSON/YAML) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → foundation + rules; PR 2 → handlers + tests; PR 3 → wiring + CI |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| WU-1 | Go module + jsonio + rules engine + dispatcher skeleton (Phase 1) | PR 1 | Self-contained; `go test ./internal/rules/... ./cmd/...` green; no handler code yet |
| WU-2 | Helper packages (store, skillreg, yamllite) + all 5 hook handlers with table-driven tests (Phase 2) | PR 2 | Depends on WU-1; `go test ./...` green; JS hooks still active wiring |
| WU-3 | opencode plugin spawnSync + hooks.json wiring + install packaging + CI cross-compile (Phases 3–5) | PR 3 | Depends on WU-2; `npm test` green; binary in two locations; fallback verified |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| Hook registration — 5 events, type `"command"`, Go binary command | MUST | `hooks/hooks.json` Modify | covered-by-design | |
| Event-to-subcommand mapping (table) + timeout values preserved | MUST | `hooks/hooks.json` + `cmd/ospec-hooks/main.go` | covered-by-design | |
| Stdin empty→`{}`, one UTF-8 JSON line stdout, never silent crash | MUST | `internal/jsonio/jsonio.go` | covered-by-design | |
| github-copilot `bash`+`powershell` keys both updated | MUST | `scripts/lib/target-profiles/github-copilot.js` verify/modify | covered-by-design | Open question: `stripPathVar` node-less compatibility — must verify in task 4.2 |
| Binary runs standalone (no Node.js) | MUST | `go.mod` + CI build matrix | covered-by-design | |
| Go 1.23+ minimum toolchain | MUST | `go.mod` | covered-by-design | |
| Cross-compile: Windows amd64, macOS arm64+amd64, Linux amd64 | MUST | `.github/workflows/build-hooks.yml` | covered-by-design | |
| Binaries NOT committed to repo | MUST | `.gitignore` + CI artifacts under `release/dist/` | covered-by-design | Explicit `.gitignore` task needed |
| DENY/ASK rules embedded with `go:embed` using `regexp2` | MUST | `internal/rules/rules.go` + `rules.json` | covered-by-design | Critical: 4 rules use `(?=…)` lookahead; RE2 (stdlib) cannot compile them |
| All 5 hook behavioral contracts verified by Go table-driven tests | MUST | `internal/hooks/*_test.go` ported from `*.test.js` | covered-by-design | |
| Subcommand dispatcher (OCP via `init()` registry) | MUST | `cmd/ospec-hooks/main.go` + `internal/hooks/handler.go` | covered-by-design | |
| Unknown subcommand → non-zero exit, no hook JSON | MUST | `hooks.Dispatch` in `handler.go` | covered-by-design | |
| `session-start` exits 1 on unhandled error | MUST | `internal/hooks/sessionstart.go` | covered-by-design | |
| `pre-tool-use` exits 0 on parse error (error→ask) | MUST | `internal/hooks/pretooluse.go` | covered-by-design | |
| Per-target wiring: claude, vscode, github-copilot, opencode | MUST | Design "File Changes" table entries | covered-by-design | vscode identity transform — open question, verify task 4.3 |
| opencode `spawnSync` contract (binary path priority, fail-open, ask→throw) | MUST | `scripts/lib/target-profiles/opencode-plugin.js` Modify | covered-by-design | |
| JS hooks (`scripts/hooks/*.js`) unchanged throughout Phase 1 | MUST | "Unchanged" in design's file table | covered-by-design | |
| Rollback by config revert only; no data migration | MUST | Design Rollback Plan section | covered-by-design | |
| Binary depends only on stdlib or <10 transitive deps | SHOULD | `regexp2` = 1 dep; no others planned | covered-by-design | |
| `release/dist/` as agreed opencode plugin dist path | MAY | Design Decision §3 + opencode PLUGIN_SOURCE | covered-by-design | Open question in design; assumed confirmed by spec clarification d1 |

### Reconciliation Verdict

- MUST coverage: complete — all 18 MUST scenarios have clear design allocation
- SHOULD/MAY gaps: none
- Ambiguities to track:
  - `github-copilot.js` `stripPathVar` transform must be verified to emit node-less binary path unchanged into both shell keys (task 4.2)
  - vscode identity transform must be verified to need no `node`-specific adjustment (task 4.3)
  - Binary exec bit on POSIX systems must be set when copying into plugin tree (task 4.5)

---

## Phase 1: Foundation — Go Module, Rules Engine, Dispatcher Skeleton

- [x] 1.1 RED: Create `internal/rules/rules_test.go` — table-driven tests: each of 8 DENY patterns blocks one or more commands from the `pre-tool-use.test.js` "deny" corpus; each of 10 ASK patterns triggers "ask"; `"git status"` → "allow"; run `go test ./internal/rules/...` → RED (package doesn't exist)
- [x] 1.2 Initialize `go.mod` at repo root (`go mod init <module-name>`, Go 1.23); add `github.com/dlclark/regexp2` dep; run `go mod tidy` to generate `go.sum`
- [x] 1.3 Create `internal/rules/rules.json` — ordered array `[{"action":"deny"|"ask","pattern":"<verbatim-JS-regex-string>","reason":"..."},...]`; copy all 8 DENY + 10 ASK entries verbatim from `scripts/hooks/pre-tool-use.js` `DENY_RULES` / `ASK_RULES` constants (preserve lookahead syntax `(?=[^\r\n;&|]*\s-…)` exactly)
- [x] 1.4 Create `internal/rules/rules.go` — `//go:embed rules.json`; parse JSON once at `init()`; compile each pattern with `regexp2.MustCompile(pattern, regexp2.None)`; export `Evaluate(cmd string) (action, reason string)` returning `"deny"`, `"ask"`, or `"allow"`
- [x] 1.5 GREEN: `go test ./internal/rules/...` passes; TRIANGULATE: add at least 3 edge cases (empty string, Unicode command, chained `&&` with deny after allow segment)
- [x] 1.6 Create `internal/jsonio/jsonio.go` — `ReadStdin() ([]byte, error)` reads all of `os.Stdin`; empty/whitespace-only input returns `[]byte("{}")`, not error; `WriteStdout(b []byte)` writes one UTF-8 line + `\n` to `os.Stdout`
- [x] 1.7 Create `internal/jsonio/jsonio_test.go` — table tests: empty bytes → `{}`, valid JSON passthrough, single newline → `{}`
- [x] 1.8 Create `internal/hooks/handler.go` — `Handler` interface (`Name() string`, `Run(stdin []byte) (stdout []byte, exitCode int)`); package-level `registry map[string]Handler`; `Register(h Handler)`; `Dispatch(args []string, stdin []byte) ([]byte, int)` — unknown subcommand writes nothing to stdout, exits non-zero
- [x] 1.9 Create `cmd/ospec-hooks/main.go` — read stdin via `jsonio.ReadStdin()`, call `hooks.Dispatch(os.Args[1:], stdin)`, write stdout via `jsonio.WriteStdout(out)`, `os.Exit(code)`
- [x] 1.10 RED: Create `cmd/ospec-hooks/main_test.go` — test `hooks.Dispatch([]string{"unknown-cmd"}, []byte("{}"))` returns exit != 0 and empty stdout; test `hooks.Dispatch(nil, []byte("{}"))` (no args) returns exit != 0; run `go test ./cmd/...` → RED until Dispatch exists
- [x] 1.11 GREEN: `go test ./cmd/ospec-hooks/... ./internal/rules/... ./internal/jsonio/...` all pass

---

## Phase 2: Core Implementation — Helper Packages + 5 Hook Handlers

### Helper packages (handler dependencies)

- [x] 2.1 Create `internal/store/store.go` — Go port of `scripts/lib/artifact-store.js` surface: `NewStore(workspace string) *Store`; `IsInitialized() bool` (checks `.ospec/` dir + `openspec/config.yaml`); `ReadConfig() ([]byte, error)`; `CachePath() string`; `CacheRelPath string`; `ReadBaselineState() (map[string]any, error)`; `ReadActiveChanges() ([]map[string]any, error)`; `ReadSessionSummary() (string, error)`; `WriteSessionSummary(content string) error`; `ReadRuntimeEvents() ([]byte, error)`; `AppendRuntimeEvent(line []byte) error` (advisory-locked via `syscall` on POSIX / `LockFileEx` on Windows)
- [x] 2.2 Create `internal/store/store_test.go` — tests using `t.TempDir()`: `IsInitialized` false when dir missing, true when `.ospec/openspec/config.yaml` exists; `ReadConfig` returns content; `AppendRuntimeEvent` is idempotent across two calls
- [x] 2.3 Create `internal/skillreg/skillreg.go` — port `scripts/lib/skill-registry.js` surface: `DiscoverSkills(dir string) ([]SkillEntry, error)`; `CalculateFingerprint(skills []SkillEntry) string` (deterministic hash); `ReadCache(path string) (map[string]any, error)`; `WriteCache(path string, data map[string]any) error`; cache version constant = 2
- [x] 2.4 Create `internal/skillreg/skillreg_test.go` — `t.TempDir()` fs tests: empty dir → 0 skills; known skill YAML files → fingerprint matches; round-trip read/write cache
- [x] 2.5 Create `internal/yamllite/yamllite.go` — port `extractFirstScalar` and `formatNextAction` from `scripts/hooks/pre-compact.js`; no YAML library dep — pure string scanning of inline scalar/list values
- [x] 2.6 Create `internal/yamllite/yamllite_test.go` — table tests matching the YAML extraction cases in `scripts/hooks/pre-compact.test.js`

### pre-tool-use handler (TDD)

- [x] 2.7 RED: Create `internal/hooks/pretooluse_test.go` — table-driven `Run(stdin)→(stdout,exitCode)` tests: all deny corpus commands → `permissionDecision:"deny"`, exit 0; all ask corpus → `"ask"`, exit 0; allow corpus → `"allow"`, exit 0; malformed JSON stdin → `"ask"`, exit 0; `commands` array (mixed string/object) → correct decision; deny wins over ask in same command; run `go test ./internal/hooks/... -run TestPreToolUse` → RED
- [x] 2.8 Create `internal/hooks/pretooluse.go` — port `normalizeToolName`, `isShellTool`, `extractCommands`, `evaluateToolUse` logic; call `rules.Evaluate`; on parse error write `{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:"..."}}` exit 0; `init()` registers handler
- [x] 2.9 GREEN: `go test ./internal/hooks/... -run TestPreToolUse` passes (all 12 test cases plus triangulation)

### session-start handler (TDD)

- [x] 2.10 RED: Create `internal/hooks/sessionstart_test.go` — table tests: `t.TempDir()` workspaces: ospec absent → `{status:"ok",ospecDetected:false}`; ospec present → cache written, `ospecDetected:true`; baseline hint included when `status:"partial"`; unhandled error → stdout `{status:"error",message:"..."}`, exitCode=1
- [x] 2.11 Create `internal/hooks/sessionstart.go` — port `resolveWorkspace`, `buildBaselineHint`, `runSessionStart`; inject `now func()time.Time` for deterministic tests; use `internal/store` + `internal/skillreg`; error → write `{"status":"error","message":"..."}`, return exit 1; `init()` registers handler
- [x] 2.12 GREEN: `go test ./internal/hooks/... -run TestSessionStart` passes

### pre-compact handler (TDD)

- [x] 2.13 RED: Create `internal/hooks/precompact_test.go` — table tests: active change present → YAML extracted → summary written; no active change → `{"continue":true}`; idempotent write (call Run twice → same file); error → `{"continue":true,"systemMessage":"..."}`, exit 0
- [x] 2.14 Create `internal/hooks/precompact.go` — port `pre-compact.js` logic; inject `now` and `store`; always exit 0; `init()` registers handler
- [x] 2.15 GREEN: `go test ./internal/hooks/... -run TestPreCompact` passes

### stop handler (TDD)

- [x] 2.16 RED: Create `internal/hooks/stop_test.go` — table tests: latest-session file overwritten on each call; `toPortablePath` normalizes separators; error → `{"continue":true,"systemMessage":"..."}`, exit 0
- [x] 2.17 Create `internal/hooks/stop.go` — port `stop.js` logic; reuses yamllite helpers; inject `now` and `store`; always exit 0; `init()` registers handler
- [x] 2.18 GREEN: `go test ./internal/hooks/... -run TestStop` passes

### subagent-stop handler (TDD)

- [x] 2.19 RED: Create `internal/hooks/subagentstop_test.go` — table tests: `isDegradedResolution` for all 3 degraded values + known-good; `findStructuredResolution` in nested objects and arrays; JSONL append (two sequential calls → two lines in file); warning systemMessage when degraded; always `{"continue":true}`, exit 0
- [x] 2.20 Create `internal/hooks/subagentstop.go` — port `normalizeResolution`, `isDegradedResolution`, `findStructuredResolution`, `appendRuntimeEvent` logic; use `internal/store` advisory-locked append; `init()` registers handler
- [x] 2.21 GREEN: `go test ./internal/hooks/...` (all 5 handlers) passes
- [x] 2.22 REFACTOR: Extract shared `continue:true` error-wrapper and timestamp-resolution helpers into `internal/hooks/common.go`; re-run `go test ./...` to confirm no regression

---

## Phase 3: opencode Plugin Generator Change

- [x] 3.1 RED: Update `scripts/configure/__fixtures__/golden/opencode/.opencode/plugins/ospec.js` to the target `spawnSync`-based content: `resolveBinary()` (checks `{plugin_dir}/../../release/dist/ospec-hooks[.exe]`, then PATH); `spawnSync` for `session-start` (payload `{cwd:directory}`, errors swallowed); `spawnSync` for `pre-tool-use` (payload `{tool_name,tool_input}`); fail-open on ENOENT/non-zero/unparseable; `ask` collapses to `throw`; run `npm test` → RED (opencode-plugin.js still emits `require()` plugin)
- [x] 3.2 Modify `scripts/lib/target-profiles/opencode-plugin.js`: replace `PLUGIN_SOURCE` string with the new `spawnSync` implementation per spec Requirement: opencode SpawnSync Invocation Contract (§ binary path resolution priority 1+2, fail-open, `deny|ask` → `throw Error(reason)`)
- [x] 3.3 GREEN: `npm test` passes — golden fixture matches generated plugin; existing test cases for other targets unaffected

---

## Phase 4: Wiring — hooks.json, github-copilot, Install Packaging

- [x] 4.1 Modify `hooks/hooks.json`: replace all 5 `"node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.js\""` command strings with `"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks <subcommand>"` per the event-to-subcommand table; preserve `"timeout": 5` on all hooks except `SessionStart`
- [x] 4.2 Read `scripts/lib/target-profiles/github-copilot.js` `stripPathVar` transform: confirm `"${CLAUDE_PLUGIN_ROOT}/"` stripping on the new binary command yields `"scripts/hooks/ospec-hooks <subcommand>"` in both `bash` and `powershell` keys; if the transform strips only the var prefix and leaves the rest verbatim, it is correct as-is; if it hard-coded a `node ` prefix assumption, remove it; add exec-bit note for POSIX binary in `.github/hooks/` (may require no code change, only documentation)
- [x] 4.3 Read `scripts/lib/target-profiles/vscode.js`: confirm the vscode identity transform copies `hooks/hooks.json` verbatim without any `node`-specific path processing; if no adjustment needed, mark done; if `node` was assumed, fix the transform
- [x] 4.4 Add to `.gitignore`: `release/dist/ospec-hooks`, `release/dist/ospec-hooks.exe`, `release/dist/ospec-hooks-*`, `scripts/hooks/ospec-hooks`, `scripts/hooks/ospec-hooks.exe` (prevent accidental binary commits)
- [x] 4.5 Modify `scripts/configure/install-claude.js`: after `buildClaudeMarketplace`, add `copyBinaryToTree(outDir)` — detect platform (`process.platform`, `process.arch`), pick `release/dist/ospec-hooks-{os}-{arch}[.exe]`, copy to `<outDir>/scripts/hooks/ospec-hooks[.exe]`; if source binary absent (pre-CI dev), print warning and skip without exiting non-zero
- [x] 4.6 Modify `scripts/configure/install-target.js`: after `runConfigure` + `writeTree`, add the same `copyBinaryToTree(outDir)` call; for `opencode` target, also ensure `release/dist/ospec-hooks[.exe]` (the local un-suffixed symlink/copy) exists for the plugin's path-resolution priority 1; if binary absent, warn and skip
- [x] 4.7 Run `npm test` to confirm all configure tests (cli.test.js, install-target golden comparisons) still pass with the hooks.json changes

---

## Phase 5: CI Cross-Compile Workflow

- [x] 5.1 Create `.github/workflows/build-hooks.yml` — trigger: `push`/`pull_request` on `cmd/**`, `internal/**`, `go.mod`, `go.sum`, `.github/workflows/build-hooks.yml`; job `test`: matrix `[ubuntu-latest, windows-latest, macos-latest]`, `actions/setup-go@v5` `go-version: '1.23'`, `go test ./...`; job `build` (needs: test): matrix `{goos: windows, goarch: amd64}`, `{goos: darwin, goarch: arm64}`, `{goos: darwin, goarch: amd64}`, `{goos: linux, goarch: amd64}`; env `GOOS`+`GOARCH`; `go build -o release/dist/ospec-hooks-$GOOS-$GOARCH[.exe] ./cmd/ospec-hooks`; `actions/upload-artifact@v4` with path `release/dist/**`
- [x] 5.2 Verify `release/dist/` exists in `.gitignore` (task 4.4 may have covered this); if not, add `release/dist/` as a directory entry
- [x] 5.3 Confirm the existing `validate-harness.yml` (or equivalent) workflow continues to run `npm test` independently; both CI jobs run in parallel without interfering

---

## Phase 6: Integration Tests + Fallback Verification

- [x] 6.1 Create `cmd/ospec-hooks/integration_test.go` — build binary with `exec.Command("go","build","...")` into `t.TempDir()`; pipe JSON to `ospec-hooks pre-tool-use` → assert `"deny"` stdout; pipe to `ospec-hooks session-start` with empty ospec dir → assert `ospecDetected:false`; pipe to `ospec-hooks unknown` → assert non-zero exit; gate entire file with `if testing.Short() { t.Skip("integration") }` at top
- [x] 6.2 Create `internal/testdata/parity/` golden fixture files — `pre-tool-use-deny.json` (stdin + expected stdout), `pre-tool-use-ask.json`, `pre-tool-use-allow.json`, `pre-tool-use-error.json` — used by both `go test` and callable from `npm test` parity check; document cross-runner parity claim in `internal/testdata/parity/README` (one line: "Run npm test + go test ./... against these fixtures to assert identical behavior")
- [x] 6.3 Add parity assertions to `internal/hooks/pretooluse_test.go` TRIANGULATE step — load `internal/testdata/parity/*.json`, run `Run(stdin)`, compare `stdout` byte-for-byte with `expectedStdout` in fixture
- [x] 6.4 Verify JS hooks are unchanged: run `git diff scripts/hooks/` — must be clean (zero modifications to all 5 `*.js` and 5 `*.test.js` files); if clean, mark done; if dirty, undo unintended changes
- [x] 6.5 Run full test suite `npm test && go test ./...` from repo root; confirm both pass green; confirm `go test -short ./...` skips integration tests cleanly
