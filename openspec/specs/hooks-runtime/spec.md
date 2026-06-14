# Delta for hooks — harness-go-migration Phase 1

## Scope Note

This delta migrates the 5 runtime hooks from per-script Node.js execution to a Go
binary dispatched by subcommand. Sections 2–6 of the main hooks spec
(`openspec/specs/hooks/spec.md` — SessionStart, PreToolUse, PreCompact,
SubagentStop, Stop per-hook behavioral contracts) are **fully preserved and not
modified**. Only the registration model and non-functional requirements change.
New cross-cutting requirements are added below.

---

## MODIFIED Requirements

### Requirement: Hook Registration

`hooks/hooks.json` is the single source of truth for hook binding for the claude
and vscode targets. It MUST list all five lifecycle events under the top-level
`hooks` key.

All entries MUST be of type `"command"`. The command template MUST invoke the Go
binary with the hook event name as its first positional argument instead of a
Node.js script.

Command template for the claude target:
`"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks <subcommand>"`

#### Event-to-Subcommand Mapping

| Event | Subcommand | Timeout |
|---|---|---|
| `SessionStart` | `session-start` | none |
| `PreToolUse` | `pre-tool-use` | 5 s |
| `PreCompact` | `pre-compact` | 5 s |
| `SubagentStop` | `subagent-stop` | 5 s |
| `Stop` | `stop` | 5 s |

#### Stdin / Stdout Contract (unchanged from main spec §1.3)

Every hook invocation MUST:
- Read its input payload as UTF-8 JSON from stdin; empty stdin resolves to `{}`.
- Write exactly one UTF-8 JSON line to stdout before exiting.
- Never crash silently; errors MUST produce a valid JSON stdout line.

(Previously: each hook was a standalone `node "…/<name>.js"` command; runtime was
Node.js 22+ CommonJS. The stdin/stdout contract is identical.)

#### Scenario: Hook registered with correct subcommand

- GIVEN `hooks/hooks.json` is updated with the Go binary command for all events
- WHEN the host reads the registration
- THEN each of the 5 events MUST map to its corresponding subcommand per the table above

#### Scenario: github-copilot both shell keys updated

- GIVEN the github-copilot `.github/hooks/hooks.json` requires `bash` and `powershell` keys
- WHEN the config is updated for the Go binary
- THEN both keys MUST contain the same repo-relative binary path and subcommand argument

---

### Requirement: Non-Functional Requirements

(Previously: "All hooks MUST be pure Node.js 22+ CommonJS with no external npm
dependencies." The other NFRs — timeouts, non-blocking, tolerating missing openspec
tree — are unchanged.)

- The Go binary MUST compile to a standalone native executable with no Node.js
  runtime dependency.
- The minimum Go toolchain version is **Go 1.23**. All CI pipelines and contributor environments MUST use Go 1.23 or later.
- The binary MUST be cross-compiled for the full platform matrix: **Windows amd64, macOS arm64, macOS amd64, Linux amd64**. Binaries MUST NOT be committed to the repo; the CI build step compiles them and archives them under `release/dist/`.
- The binary MUST complete within 5 seconds for PreToolUse, PreCompact, SubagentStop,
  and Stop; SessionStart has no declared timeout.
- The binary MUST be non-blocking: it MUST write its response and exit within the
  timeout.
- The binary MUST tolerate a completely missing or malformed `openspec/` tree without
  crashing.
- The binary SHOULD depend only on the Go standard library, or fewer than 10
  transitive dependencies.
- DENY/ASK rules MUST be embedded in the binary at compile time using `go:embed`. Changing the rule policy requires recompilation; this provides parity with the currently hardcoded JS rules.
- All 5 hook behavioral contracts MUST be verified by Go table-driven tests ported
  from the 5 existing `*.test.js` files.

#### Scenario: Binary runs without Node.js

- GIVEN a machine where Node.js is not installed
- WHEN the Go binary is invoked with any valid subcommand
- THEN it MUST execute and produce valid JSON output on stdout

---

## ADDED Requirements

### Requirement: Go Binary Subcommand Dispatch

The binary MUST dispatch to the correct hook handler by inspecting `os.Args[1]`
(the subcommand). No existing handler MUST require modification when a new
subcommand is added (OCP: each hook is a self-contained handler file).

Each handler MUST implement the full behavioral contract of the corresponding JS
hook as specified in sections 2–6 of the main hooks spec. This includes, but is
not limited to:
- PreToolUse: DENY/ASK/allow precedence, command extraction, shell-tool
  normalization, error → `ask` (§3).
- SessionStart: workspace resolution, ospec detection, fingerprint cache v2,
  baseline hint, error → `{"status":"error"}` + exit 1 (§2).
- PreCompact: active change selection, YAML extraction, session summary render,
  idempotent write, always `{"continue":true}` (§4).
- Stop: latest-session trace render, always overwrite, always `{"continue":true}` (§6).
- SubagentStop: degraded resolution detection, advisory-locked JSONL append,
  `systemMessage` on warning, always `{"continue":true}` (§5).

**Exit code rules (per-subcommand):**

| Subcommand | Exit code on success | Exit code on unhandled error | Reason |
|---|---|---|---|
| `session-start` | 0 | 1 | Mirrors JS `process.exitCode = 1` on error |
| `pre-tool-use` | 0 | 0 | Error → `ask` JSON; never non-zero |
| `pre-compact` | 0 | 0 | Error → `{"continue":true,"systemMessage":"…"}` |
| `stop` | 0 | 0 | Error → `{"continue":true,"systemMessage":"…"}` |
| `subagent-stop` | 0 | 0 | Error → `{"continue":true,"systemMessage":"…"}` |
| unknown | — | non-zero | Usage error; no hook JSON written |

#### Scenario: Dispatcher routes to correct handler

- GIVEN `ospec-hooks subagent-stop` is invoked with a JSON payload on stdin
- WHEN the binary reads `os.Args[1]`
- THEN it MUST route exclusively to the SubagentStop handler

#### Scenario: Unknown subcommand rejected cleanly

- GIVEN `ospec-hooks unknown-event` is invoked
- WHEN the binary inspects the argument
- THEN it MUST exit non-zero
- AND MUST NOT write a valid hook JSON response to stdout

#### Scenario: session-start exits 1 on unhandled error

- GIVEN `ospec-hooks session-start` is invoked
- WHEN an unhandled error occurs during processing
- THEN it MUST write `{"status":"error","message":"<msg>"}` to stdout
- AND MUST exit with code 1

#### Scenario: pre-tool-use exits 0 on parse error

- GIVEN malformed JSON is piped to `ospec-hooks pre-tool-use`
- WHEN the handler fails to parse input
- THEN it MUST write a valid `hookSpecificOutput` JSON with `permissionDecision: "ask"` to stdout
- AND MUST exit with code 0

---

### Requirement: Per-Target Hook Invocation Wiring

All four targets MUST invoke the Go binary via their respective extension surface.
The JSON stdin/stdout contract MUST be identical across all targets.

| Target | Config file | Invocation surface | Hooks wired |
|---|---|---|---|
| claude | `hooks/hooks.json` | Shell command via `CLAUDE_PLUGIN_ROOT` | All 5 |
| vscode | inherits canonical `hooks/hooks.json` via identity transform | Shell command | All 5 |
| github-copilot | `.github/hooks/hooks.json` (`bash` + `powershell` keys, repo-relative) | Shell command | 2 (sessionStart, preToolUse) |
| opencode | `.opencode/plugins/ospec.js` (generated) | spawnSync — see Requirement: opencode SpawnSync | 2 (session.created → session-start, tool.execute.before → pre-tool-use) |

#### Scenario: claude and vscode wiring covers all 5 hooks

- GIVEN the canonical `hooks/hooks.json` is updated with the Go binary command
- WHEN the vscode identity transform is applied
- THEN both targets MUST produce hook registrations for all 5 events pointing to the binary

#### Scenario: github-copilot wiring covers only its 2 hooks

- GIVEN `.github/hooks/hooks.json` currently declares only `sessionStart` and `preToolUse`
- WHEN the Go binary is substituted
- THEN the github-copilot config MUST NOT add additional hook events beyond those 2

---

### Requirement: opencode SpawnSync Invocation Contract

The opencode plugin (`.opencode/plugins/ospec.js`) MUST bridge the Go binary via
`spawnSync` because opencode has no shell-command hook surface. This implements
approval decision `opencode-coupling-O1-002` (Option A: spawnSync).

The generated plugin MUST:

1. For `session.created` events: call `spawnSync` with the binary and subcommand
   `session-start`, pass `{"cwd": directory}` as UTF-8 JSON to stdin, parse stdout
   as JSON. Any failure MUST be swallowed; session-start is best-effort.
2. For `tool.execute.before` events: call `spawnSync` with subcommand `pre-tool-use`,
   pass `{"tool_name": input.tool, "tool_input": output.args || {}}` as UTF-8 JSON
   to stdin, parse stdout JSON.
3. Apply the decision from `hookSpecificOutput.permissionDecision`:
   - `"allow"` → return (pass through).
   - `"deny"` or `"ask"` → throw `Error(permissionDecisionReason)`. (opencode has no
     native "ask" surface; both deny and ask collapse to a hard block.)
4. If spawnSync fails (binary absent, non-zero exit, unparseable stdout): treat as
   `"allow"` (fail-open, MUST NOT block the tool call).

**Binary path resolution**: The plugin MUST resolve the binary using the following priority order:
1. `{plugin_dir}/../../release/dist/ospec-hooks` (`.exe` suffix on Windows) — the known dist path produced by the CI build step.
2. `ospec-hooks` on `$PATH` — fallback for developer environments that have the binary installed globally.
The binary is NOT committed to the repo; it is built and archived under `release/dist/` by CI.

#### Scenario: opencode blocks a deny-level command

- GIVEN the plugin is loaded and the binary is reachable
- WHEN `tool.execute.before` fires for `rm -rf /` (matches DENY rule)
- THEN the plugin MUST spawnSync `ospec-hooks pre-tool-use` with the tool payload
- AND parse `permissionDecision: "deny"` from stdout
- AND throw an `Error` containing `permissionDecisionReason`

#### Scenario: opencode blocks an ask-level command

- GIVEN `tool.execute.before` fires for `npm install` (matches ASK rule)
- WHEN the plugin evaluates the binary stdout
- THEN it MUST throw an `Error` (ASK collapses to block; opencode has no "ask" UI)

#### Scenario: session-start failure is non-fatal

- GIVEN the binary is absent or returns an error during `session.created`
- WHEN the plugin calls spawnSync
- THEN it MUST swallow the error
- AND the session MUST start normally

#### Scenario: pre-tool-use spawn failure allows the call (fail-open)

- GIVEN the binary cannot be found at `tool.execute.before` time
- WHEN spawnSync fails with ENOENT or equivalent
- THEN the plugin MUST NOT throw
- AND MUST allow the tool call to proceed

---

### Requirement: JS Fallback Until Parity Validated

The 5 current Node.js hook scripts (`scripts/hooks/pre-tool-use.js`,
`session-start.js`, `pre-compact.js`, `stop.js`, `subagent-stop.js`) MUST remain
present and functionally unmodified throughout Phase 1. The Go binary becomes the
active wiring only after behavior parity is validated via the ported test suite.

Rollback MUST be achievable by reverting per-target command strings to their
previous `node ".../<name>.js"` form (one config change per target). No data
migration, schema change, or `.ospec/` file modification is required.

#### Scenario: Rollback restores JS hooks without data migration

- GIVEN the Go binary is active in all target configs
- WHEN a rollback decision is made
- THEN restoring `node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.js"` (claude/vscode)
  and `node "scripts/hooks/<name>.js"` (github-copilot) in each config MUST fully
  restore previous behavior
- AND no changes to `.ospec/` data files are needed

#### Scenario: JS hooks unmodified while Go binary is active

- GIVEN the Go binary wiring is deployed across targets
- WHEN Phase 1 is active
- THEN all 5 files at `scripts/hooks/*.js` MUST remain present and unmodified
- AND MUST be invocable as a functional alternative wiring at any time

---

## Clarifications

### Session 2026-06-14

- Q: Binary distribution: build-step in CI (recommended) vs. check-in binaries per target/platform? → A: Build-step in CI. CI compiles and cross-compiles `ospec-hooks` per platform; artifacts live in `release/dist`; binaries are NOT committed to the repo. The opencode plugin resolves the binary path from the known dist path (`release/dist/ospec-hooks`) or from `$PATH`.
- Q: Binary shape: single `ospec-hooks <subcommand>` dispatcher (recommended) vs. 5 separate per-hook binaries? → A: Single binary `ospec-hooks` dispatched by subcommand (`os.Args[1]`). All targets and the opencode plugin reference this single binary name. Adding a hook requires only a new subcommand file; no dispatch edits are needed (OCP).
- Q: DENY/ASK rules: compile-time `go:embed` (recommended) vs. external `rules.json` editable at runtime? → A: Embedded at compile time with `go:embed`. Changing the rule policy requires recompilation; provides parity with the currently hardcoded JS rules.
- Q: Platform matrix: Windows + macOS (arm64+amd64) + Linux amd64 day one (recommended) vs. a subset? → A: Full matrix day one — Windows amd64, macOS arm64, macOS amd64, Linux amd64.
- Q: Minimum Go version: Go 1.23+ (recommended) vs. an older version for contributor compatibility? → A: Go 1.23+.
