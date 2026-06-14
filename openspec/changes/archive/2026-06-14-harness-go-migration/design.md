# Design: Harness Go Migration (Phase 1 — Runtime Hooks Only)

## Technical Approach

Re-implement the 5 runtime hooks (`pre-tool-use`, `session-start`, `pre-compact`,
`stop`, `subagent-stop`) as a single cross-compiled Go binary `ospec-hooks`,
dispatched by `os.Args[1]`. Per-hook behavior (main hooks spec §2–6) and the
stdin-JSON → stdout-JSON contract are carried over verbatim. Generators stay in
Node.js. The JS hooks remain as the rollback fallback until parity is signed off.
This design satisfies the locked decisions in
`specs/hooks-runtime/spec.md` (single binary, `go:embed` rules, full platform
matrix, Go 1.23+, build-step-in-CI, opencode via `spawnSync`).

## Architecture Decisions

### Decision: init()-registered Handler registry behind a subcommand dispatcher

**Choice**: `cmd/ospec-hooks/main.go` reads `os.Args[1]`, looks it up in a
package-level `map[string]Handler` in `internal/hooks`, and calls `Run`. Each
handler lives in its own file and self-registers via `init()`.
**Alternatives considered**: a `switch` statement in `main.go`; five separate
binaries.
**Rationale**: OCP — adding a hook is a new `internal/hooks/<name>.go` file whose
`init()` registers it; `main.go` and existing handlers are untouched. SRP — one
file per hook. A single artifact per platform keeps the distribution surface
small (spec Clarification d2).

### Decision: embed exact JS regex sources via `go:embed` + `regexp2` (NOT stdlib `regexp`)

**Choice**: Store the DENY/ASK rules as an embedded `internal/rules/rules.json`
(ordered list of `{pattern, reason}` carrying the **verbatim** JS regex source
strings), loaded with `//go:embed` and compiled with
`github.com/dlclark/regexp2`.
**Alternatives considered**: stdlib `regexp` (RE2); rewriting the patterns into
RE2-compatible multi-step matching.
**Rationale**: **Critical discovery** — four current rules (DENY `rm`, DENY
`remove-item`, ASK `rm`, ASK `remove-item`) use lookahead assertions
`(?=[^\r\n;&|]*\s-…)`. RE2 (Go stdlib `regexp`) does **not** support lookahead,
so the patterns cannot compile as-is. `regexp2` is a .NET-flavored engine with
lookaround support, letting us embed the JS sources byte-for-byte and guarantee
parity (a hard success criterion). It is a single dependency, well within the
"fewer than 10 transitive deps" SHOULD. `go:embed` satisfies Clarification d3
(compile-time rules, recompile-to-change, tamper resistance). Rewriting patterns
was rejected: re-deriving 4 complex patterns risks silent behavioral drift.

### Decision: per-consumer binary placement (dist vs. plugin tree)

**Choice**: CI compiles per-platform binaries into `release/dist/` (not
committed). The install/packaging step places the platform-appropriate binary
into **two** locations by consumer: `scripts/hooks/ospec-hooks(.exe)` inside the
generated tree for claude/vscode/copilot (resolved via `CLAUDE_PLUGIN_ROOT` /
repo-relative), and `release/dist/ospec-hooks(.exe)` for opencode (the plugin
resolves `{plugin_dir}/../../release/dist/…`, else `$PATH`).
**Alternatives considered**: commit binaries per platform (drift, repo bloat);
single location for all targets.
**Rationale**: Clarification d1 forbids committing binaries; the two registration
surfaces (shell command vs. `spawnSync` path resolution) reference different
paths, so packaging must satisfy both. `gatherRuntimeScripts` only walks `*.js`,
so the binary is never auto-gathered — placement is an explicit install step.

## Go Code Structure

```
go.mod  go.sum                         module root at repo root; Go 1.23
cmd/ospec-hooks/main.go                 dispatch on os.Args[1]; unknown → exit !=0
internal/hooks/handler.go               Handler interface + registry + Register()
internal/hooks/pretooluse.go            §3 DENY/ASK/allow; error → ask, exit 0
internal/hooks/sessionstart.go          §2 registry+fingerprint cache; error → exit 1
internal/hooks/precompact.go            §4 active change, YAML, summary; continue:true
internal/hooks/stop.go                  §6 latest-session trace; continue:true
internal/hooks/subagentstop.go          §5 degraded-resolution; locked JSONL append
internal/rules/rules.go                 //go:embed rules.json; Evaluate(cmd) decision
internal/rules/rules.json               DENY (8) + ASK (10) verbatim JS sources
internal/store/store.go                 artifact-store port (config, active changes,
                                        cache path, session summary, runtime events)
internal/skillreg/skillreg.go           skill discovery + fingerprint (session-start)
internal/yamllite/yamllite.go           inline scalar/list extraction (no YAML dep)
internal/jsonio/jsonio.go               stdin→[]byte (empty→{}), one-line stdout
```

```go
// internal/hooks/handler.go
type Handler interface {
    Name() string
    Run(stdin []byte) (stdout []byte, exitCode int)  // never panics out
}
var registry = map[string]Handler{}
func Register(h Handler) { registry[h.Name()] = h }   // called from each init()
func Dispatch(args []string, stdin []byte) (stdout []byte, exit int) // main calls this
```

`init()` in each `internal/hooks/<name>.go` calls `Register(&fooHandler{})`. The
dispatcher never edits when a hook is added (OCP). The handler boundary takes
`stdin []byte` and returns `stdout []byte` so handlers are pure and table-testable
without touching real stdin/stdout.

## Data Flow

### Sequence (a): PreToolUse DENY / ASK / allow (end-to-end)

```
Host ──"ospec-hooks pre-tool-use" + stdin JSON──► main.go
  main.go: sub = os.Args[1]="pre-tool-use" ──► hooks.Dispatch ──► PreToolUse.Run
    parse {tool_name, tool_input}
        └─ parse error ──► makeDecision("ask", "...could not inspect...") ─┐
    cmds = extractCommands(command, commands[])                            │
        └─ len==0 ──► makeDecision("allow", "...no command payload")       │
    for cmd: rules.Evaluate → first DENY hit ──► deny(reason) ─────────────┤
    for cmd: first ASK  hit ──► ask(reason) ──────────────────────────────┤
    else ──► allow("...passed the safety policy")                          │
  write one JSON line {hookSpecificOutput:{hookEventName:"PreToolUse",     │
        permissionDecision, permissionDecisionReason}} ◄────────────────────┘
  exit 0  (always 0 for pre-tool-use, even on parse error)
```

### Sequence (b): opencode `spawnSync` bridge

```
opencode runtime ──tool.execute.before(input, output)──► generated ospec.js plugin
  resolveBinary(): release/dist/ospec-hooks(.exe)  ─if missing─► "ospec-hooks" on $PATH
  payload = JSON {tool_name: input.tool, tool_input: output.args||{}}
  spawnSync(bin, ["pre-tool-use"], {input: payload, encoding:"utf8"})
        ├─ ENOENT / non-zero / unparseable stdout ──► FAIL-OPEN: return (allow)
        └─ ok ──► JSON.parse(stdout).hookSpecificOutput.permissionDecision
                    allow ──► return (pass through)
                    deny|ask ──► throw Error(permissionDecisionReason)  // ask⇒hard block
  session.created ──► spawnSync(bin,["session-start"], input:{cwd:directory}); errors swallowed
```

## Per-Hook I/O Contract

| Subcommand | stdin (JSON) | stdout (JSON) | Exit success / error |
|---|---|---|---|
| `pre-tool-use` | `{tool_name, tool_input:{command?, commands[]?}}` | `{hookSpecificOutput:{hookEventName,permissionDecision,permissionDecisionReason}}` | 0 / **0** (error→ask) |
| `session-start` | `{cwd?}` | `{status, ospecDetected, registry:{status,path}, baseline?}` | 0 / **1** (`{status:"error",message}`) |
| `pre-compact` | `{cwd?}` | `{"continue":true}` | 0 / 0 (`continue:true`+systemMessage) |
| `stop` | `{cwd?, sessionId?, timestamp?}` | `{"continue":true}` | 0 / 0 (continue+systemMessage) |
| `subagent-stop` | `{cwd?, agent_*?, skill_resolution?, transcript_path?, timestamp?}` | `{"continue":true}` or `{continue:true,systemMessage}` | 0 / 0 |
| unknown | — | none | **non-zero**, no hook JSON |

Empty stdin resolves to `{}`. Each handler writes exactly one UTF-8 JSON line.

## File Changes

| File | Action | Description |
|---|---|---|
| `go.mod`, `go.sum` | Create | Module root, Go 1.23, `dlclark/regexp2` dep |
| `cmd/ospec-hooks/main.go` | Create | Subcommand dispatcher |
| `internal/hooks/handler.go` | Create | `Handler` interface + init() registry |
| `internal/hooks/{pretooluse,sessionstart,precompact,stop,subagentstop}.go` | Create | One handler per hook, ported §2–6 |
| `internal/rules/rules.go` + `rules.json` | Create | `go:embed` DENY/ASK, verbatim JS sources, `regexp2` |
| `internal/{store,skillreg,yamllite,jsonio}/*.go` | Create | Ported helpers (artifact-store, skill registry, inline YAML, stdio) |
| `internal/**/_test.go` | Create | Table-driven tests ported from `scripts/hooks/*.test.js` |
| `hooks/hooks.json` | Modify | All 5 commands → `"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks <sub>"` (drops `node`); timeouts unchanged |
| `scripts/lib/target-profiles/opencode-plugin.js` | Modify | `PLUGIN_SOURCE` emits `spawnSync` (binary path resolution + fail-open + ask⇒throw) instead of `require()` of hook JS |
| `scripts/lib/target-profiles/github-copilot.js` | Verify/Modify | Confirm `stripPathVar` transform passes the new `node`-less command verbatim into both `bash`+`powershell`; adjust if it assumed a `node` prefix |
| `scripts/configure/install-claude.js`, `install-target.js` | Modify | Add step copying the platform binary into `scripts/hooks/` (claude/vscode/copilot) and `release/dist/` (opencode) |
| `.github/workflows/build-hooks.yml` | Create | Cross-compile matrix + `go test`; archive `release/dist/` |
| `scripts/configure/__fixtures__/golden/opencode/.opencode/plugins/ospec.js` | Modify | Regenerate golden to the new `spawnSync` plugin |
| `scripts/hooks/*.js`, `*.test.js` | **Unchanged** | Retained as rollback fallback (spec: JS Fallback) |

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit (Go) | Each handler's behavior + state transitions | Table-driven `Run(stdin)→(stdout,exit)`; inject clock; `t.TempDir()` for fs (cache, summary, trace, JSONL) |
| Rules parity | DENY/ASK/allow precedence, shell-name normalization, command extraction | Shared corpus `command → expected decision` derived from `pre-tool-use.test.js`; assert identical via `regexp2`-compiled embedded sources |
| Cross-impl parity | Same input JSON → identical output JSON for all 5 hooks | Golden fixtures `(stdin, expected-stdout)`; run **both** JS (`npm test`) and Go (`go test`) against the same corpus during Phase 1 |
| Integration | opencode `spawnSync` bridge | `spawnSync` against a built binary; assert allow/deny/ask + fail-open + session-start swallow; gate with `testing.Short()` skip |
| CI | All of the above, every platform | `go test ./...` in the matrix job; existing `npm test` job stays green (fallback still wired/tested) |

Strict TDD is active: write the ported Go table test first, then the handler.
Golden files must be deterministic — inject `now()` and fix all inputs.

## CI Cross-Compile Flow

```
push/PR ─► build-hooks.yml
  job: test   (ubuntu/windows/macos) ─► actions/setup-go@v5 go=1.23 ─► go test ./...
  job: build  matrix {GOOS,GOARCH}: windows/amd64, darwin/arm64, darwin/amd64, linux/amd64
        GOOS=$o GOARCH=$a go build -o release/dist/ospec-hooks[-$o-$a][.exe] ./cmd/ospec-hooks
        upload-artifact ─► release/dist/**
  (consumed by) install-claude.js / install-target.js: pick host-matching binary,
        copy to scripts/hooks/ (claude/vscode/copilot) + release/dist/ (opencode)
```

Binaries are CI artifacts under `release/dist/`, never committed (Clarification
d1). `validate-harness.yml` is unchanged; the new Go job runs alongside it.

## Migration / Rollout

Phased: JS hooks stay active-capable throughout Phase 1. Go binary becomes the
wired runtime only after the parity corpus passes on all platforms. Both test
suites run in CI during the overlap.

## Rollback Plan

One config revert per target, no data migration:
- `hooks/hooks.json` (claude/vscode): restore `node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.js"`.
- github-copilot: restore `node "scripts/hooks/<name>.js"` in both shell keys (flows from canonical).
- `opencode-plugin.js`: restore the `require()`-based `PLUGIN_SOURCE`.
- Drop the `build-hooks.yml` build step.
The 5 `scripts/hooks/*.js` files and all `.ospec/` data are untouched, so reverting
fully restores prior behavior.

## Open Questions

- [ ] Confirm `github-copilot.js` `stripPathVar` emits the new `node`-less command
  unchanged into both `bash` and `powershell` keys (and POSIX exec bit on the binary).
- [ ] Confirm vscode identity transform needs no runtime/var change for a native
  binary command (it inherits canonical `hooks.json` verbatim).
- [ ] Confirm `release/dist/` is the agreed install destination the opencode plugin
  resolves at runtime in a synced destination repo (vs. CI-only artifact location).
