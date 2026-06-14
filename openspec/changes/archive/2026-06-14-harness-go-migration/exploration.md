# Exploration: Go Migration for Harness (Runtime Hooks)

## Recommendation (Summary)

**Migrate only the runtime hooks layer to Go; keep generators in Node.js.** Go solves the cold-start latency problem that affects PreToolUse (fires on every tool call), but generator scripts (route-dispatcher, skill-registry, target-transform) run at build/plan time where latency is uncritical. Phased approach: Phase 1 implements hooks-only migration with single cross-compiled binary per target; Phase 2 (deferred) optionally addresses generators if needed.

---

## Executive Context

### Current State: The Two Roles in `scripts/`

The harness contains two distinct categories of code with very different performance profiles:

#### Category A: Runtime Hooks (High Frequency / Hot Path)
- **Files**: `scripts/hooks/{pre-tool-use, session-start, pre-compact, subagent-stop, stop}.js`
- **Invocation pattern**: Spawned as subprocess from `hooks/hooks.json` (Claude engine integration)
- **Frequency**:
  - **PreToolUse**: Fires on **every tool call** (highest frequency), timeout=5s
  - **SessionStart**: Once per session
  - **PreCompact**, **Stop**, **SubagentStop**: Once per session lifecycle
- **Current implementation**: Each is a CLI script that reads JSON from stdin, processes, writes JSON to stdout
- **Distribution**: Emitted into each of 4 targets (claude, vscode, github-copilot, opencode) by the generator

#### Category B: Build/Generator/Planning Scripts (Low Frequency)
- **Files**: `scripts/lib/route-dispatcher.js`, `scripts/lib/skill-registry.js`, `scripts/lib/ospec-state.js`, `scripts/configure/*.js`, `scripts/lib/target-*.js`
- **Invocation pattern**: Direct Node.js module imports + CLI execution during build, test, and planning
- **Frequency**: Build time (rare), plan time (orchestrator startup), test time (CI)
- **Route-dispatcher note**: Consumed by orchestrator **at planning time** (synchronous, not in hot path during execution)
- **Distribution**: Source code only; never embedded in targets
- **Test coverage**: 20 test files; pure functions, table-driven tests

---

## Latency Analysis: Node.js vs Go

### Cold-Start Overhead (per process spawn)

| Runtime | Typical Startup | Observation |
|---------|-----------------|-------------|
| Node.js 22 (script startup) | 0.3–0.5s | Parsing, module loading, V8 warmup |
| Go (static binary) | 0.005–0.05s | Direct syscall, no interpretation |
| **Relative win** | **6–100x faster** | Typical CLI execution within 50ms |

### PreToolUse Impact Calculation

Assuming a typical LLM session with ~20–30 tool calls (conservative):

- **Current (Node.js)**: 20 calls × 0.4s = **8 seconds cumulative overhead**
- **With Go**: 20 calls × 0.03s = **0.6 seconds cumulative overhead**
- **Latency reduction**: ~7.4 seconds per session (10–15% of total wall-clock time for tool-heavy sessions)

**Impact**: Most visible on first tool call in a session; subsequent calls' Node startup time overlaps with Claude's network latency.

---

## Scope Decision Matrix

| Scope | Hooks Only | Full Layer | Phased (Recommended) |
|-------|-----------|-----------|----------------------|
| **What** | 5 runtime hooks (~600 LOC) | Hooks + generators (~3000 LOC) | Phase 1: hooks; Phase 2 (deferred): generators |
| **Latency Win** | ✅ PreToolUse goes from ~400ms to ~30ms | ✅ Same as hooks-only for runtime | ✅ Immediate win for hot path |
| **Complexity** | Low: self-contained event handlers | High: affects build pipeline, orchestrator tie-in | Medium: clear boundaries |
| **Testing Rewrite** | Small (5 test files → Go table-driven) | Large (20 test files → Go) | Progressive (Phase 1: 5 files) |
| **Interop During Migration** | N/A (complete at once) | N/A | Manageable: hooks in Go, generators in Node |
| **Route-Dispatcher Impact** | None (stays Node) | Risky: consumed by orchestrator; requires careful refactoring | None (stays Node) |
| **CI/Toolchain Cost** | Moderate (Go 1.23+ setup) | Moderate (same as hooks-only) | Moderate (defer Phase 2 decision) |
| **Contributor Friction** | Mild: touch hooks rarely | Moderate: core logic change | Mild: isolated to hooks |
| **Effort (est.)** | 2–3 days | 2–4 weeks | 2–3 days (Phase 1); defer Phase 2 |

**Recommendation**: **Phased approach** balances risk, latency win, and complexity.

---

## Distribution Model: How Go Hooks Land in Targets

### Current (Node.js)
1. Generator reads source tree (`scripts/hooks/*.js`, `scripts/lib/*.js`)
2. Walks require graph from hooks → self-contained bundle
3. Writes to `dist/<target>/scripts/hooks/*.js`
4. Each target's `hooks/hooks.json` references `node scripts/hooks/pre-tool-use.js`
5. Copied into target repo as-is

### With Go (Proposed)
1. **Build time**: Compile Go source to `dist/<target>/scripts/hooks/ospec-hooks` (single binary per target, or with `-o` per OS)
   - On first `npm run build:*`: `go build -o dist/<target>/scripts/hooks/ospec-hooks ./cmd/hooks/`
   - Single binary: dispatches on `$1` argument (`pre-tool-use`, `session-start`, etc.)
2. **hooks.json update**:
   ```json
   {
     "hooks": {
       "PreToolUse": [{
         "type": "command",
         "command": "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks pre-tool-use"
       }],
       "SessionStart": [{
         "type": "command",
         "command": "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks session-start"
       }]
     }
   }
   ```
3. **Where the binary lives**:
   - **Option A** (simpler): Check in compiled binary (one per target, tiny size ~5–15 MB)
   - **Option B** (cleaner): Build during target generation, no checked-in binaries
4. **Cross-compilation**:
   - Build steps: `GOOS=darwin GOARCH=arm64 go build` (macOS), `GOOS=windows GOARCH=amd64` (Windows), etc.
   - Claude Marketplace target handles platform-specific packaging (or: single x86-64 binary per target, documented minimum requirements)

---

## OCP/SRP Sketch: Making Hooks Pluggable

### Current State (Hardcoded)
```javascript
// scripts/hooks/pre-tool-use.js
const DENY_RULES = [
  { pattern: /\brm\b.*-rf/, reason: "..." },
  // ... 7 more rules hardcoded
];

const ASK_RULES = [
  { pattern: /\bnpm\s+install\b/, reason: "..." },
  // ... 9 more rules hardcoded
];

// Adding a new rule requires editing this file
```

### Go Equivalent (Extensible)
```go
// cmd/hooks/rules.json (or embedded in binary)
{
  "deny": [
    {"pattern": "\\brm\\b.*-rf", "reason": "..."},
    {"pattern": "..."}
  ],
  "ask": [
    {"pattern": "\\bnpm\\s+install\\b", "reason": "..."},
    {"pattern": "..."}
  ]
}

// cmd/hooks/main.go
func init() {
  rules := loadRules("rules.json") // or embed in binary
}
```

**Benefits**:
- Rules defined in config, not code
- Operators can extend rules without recompiling (if rules are external)
- Binary remains stable; rules versioned separately if needed

**Limitation**:
- route-dispatcher (currently hardcoded phases, gates) is harder to make pluggable
- Reason: It's a pure dispatcher consumed at planning time; config overhead may not justify complexity
- **Conclusion**: Leave route-dispatcher in Node.js; focus OCP effort on hooks

---

## Risks & Friction

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Go toolchain not in CI** | Medium | Add `go install`, `go build` to CI matrix; document Go version requirement (≥1.23) |
| **Cross-compilation matrix** | Medium | Start with single target (macOS arm64), expand incrementally; use GitHub Actions `matrix` strategy |
| **No Go test coverage yet** | Medium | Rewrite 5 hooks test files (~200 LOC) as Go table-driven tests; leverage `testing.T` and `testify` for assertions |
| **Contributor knowledge gap** | Low–Medium | Hooks are isolated; most team contributors don't touch them frequently; document with examples |
| **Parting with 20 JS test files** | Medium (Phase 2 only) | For Phase 1 (hooks-only), only rewrite 5 test files; generators stay in Node.js with existing tests intact |
| **route-dispatcher timing** | Low (Phase 1) | Stays in Node.js; no change. Phase 2 would require careful orchestrator refactoring |
| **Interop during Phase 1** | Low | Hooks in Go, generators in Node.js, clean boundary; no circular dependencies |
| **Binary distribution & versioning** | Medium | Decide: check in binaries (simpler, size cost ~5–15 MB per target) or build-step (cleaner, requires Go in dev env) |
| **Windows PowerShell compatibility** | Low | Go binaries work fine; no PowerShell-specific logic needed in hooks (already JSON-based) |

---

## Testing Strategy (Phase 1)

### Current (Node.js)
- 5 hook test files: `scripts/hooks/*.test.js`
- Table-driven tests using Node.js `assert` and `test()`
- No external dependencies

### Proposed (Go)
- 5 hook test files (rewritten): `cmd/hooks/*_test.go`
- Table-driven tests using Go `testing.T` and a small assertion helper (or `testify/assert`)
- No external build dependencies (Go stdlib sufficient)

### Example: Rewriting pre-tool-use.test.js → pre_tool_use_test.go

**Node.js**:
```javascript
test("denies commands with unacceptable destructive impact", () => {
  const commands = ["rm -rf /", "sudo rm -fr / --no-preserve-root", ...];
  for (const command of commands) {
    assert.equal(decisionFor(command).permissionDecision, "deny", command);
  }
});
```

**Go (table-driven)**:
```go
func TestDenyRules(t *testing.T) {
  tests := []struct {
    name     string
    command  string
    expected string
  }{
    {"deny rm -rf /", "rm -rf /", "deny"},
    {"deny rm -fr / --no-preserve-root", "sudo rm -fr / --no-preserve-root", "deny"},
  }
  for _, tt := range tests {
    t.Run(tt.name, func(t *testing.T) {
      decision := evaluateToolUse(toolInput{command: tt.command})
      if decision.PermissionDecision != tt.expected {
        t.Errorf("expected %s, got %s", tt.expected, decision.PermissionDecision)
      }
    })
  }
}
```

**Effort**: ~1 day to port all 5 test files.

---

## Recommended Phased Approach

### Phase 1: Hooks-Only Migration (Recommended for immediate proposal)

**Scope**:
- Migrate 5 runtime hooks (pre-tool-use, session-start, pre-compact, subagent-stop, stop) to Go
- Single binary dispatched on subcommand

**Artifacts to create**:
- `cmd/hooks/main.go` — dispatcher + entry points
- `cmd/hooks/pre_tool_use.go` — safety rule engine (logic from pre-tool-use.js)
- `cmd/hooks/session_start.go` — registry cache refresh (logic from session-start.js)
- `cmd/hooks/pre_compact.go`, `cmd/hooks/stop.go`, `cmd/hooks/subagent_stop.go`
- `cmd/hooks/*_test.go` — table-driven tests (port from JS)
- `go.mod`, `go.sum` — minimal dependencies (stdlib only preferred)
- Update `scripts/configure/cli.js` to compile Go binary during target generation
- Update `hooks/hooks.json` to reference binary instead of node scripts

**Test coverage**:
- Port all 5 `.test.js` files (~200 LOC) to Go
- Maintain same test cases; assert behavior equivalence
- Run `go test ./cmd/hooks/...` in CI

**Build changes**:
- Add `go build` step to `npm run build:*` targets
- Decide: single binary dispatched by subcommand, or 5 separate binaries (latter adds complexity)

**Estimated effort**: 2–3 days (senior dev with Go experience)

**Success criteria**:
- All hook behavior identical (safety rules, state management, JSON I/O)
- Test coverage ≥95%
- ~10x latency improvement for PreToolUse (0.4s → 0.03s)
- No changes to orchestrator, route-dispatcher, or other Node.js layers

---

### Phase 2: Generator Migration (Deferred / Optional)

**Out of Scope** for this proposal. Deferred to future exploration if Phase 1 shows value and team appetite. Reasons:
1. Generators run at build/plan time (no latency sensitivity)
2. route-dispatcher consumed by orchestrator at planning time (requires careful refactoring)
3. Would require rewriting 20 test files and impact team's JS expertise
4. Node.js is well-suited for the current generator architecture

**If revisited**: Would require separate exploration focused on:
- Orchestrator → route-dispatcher integration (synchronous call, timing implications)
- Parting with CommonJS + Node.js test runner
- Skill registry and target-transform as standalone Go packages or lambdas
- Trade-offs of unified language vs. pragmatic split

---

## Out of Scope (Phase 1)

1. **Generators** (route-dispatcher, skill-registry, target-transform): Remain in Node.js
2. **Orchestrator refactoring**: route-dispatcher stays callable as Node.js module
3. **Artifact store abstraction**: Stays in Node.js; hooks only read/write via artifact-store API
4. **Plugin marketplace integration**: No changes to `.claude-plugin/` generation
5. **CI/CD pipeline refactoring**: Go build integrated into existing npm scripts

---

## Key Decisions for Proposal Phase

Before advancing to sdd-propose, clarify:

1. **Binary distribution**: Check in compiled binaries per target (simpler for users) or build-step generation (cleaner, requires Go in dev env)?
2. **Single binary vs. separate**: Dispatch all 5 hooks via single `ospec-hooks <hook-name>` binary, or separate binaries per hook?
3. **External rules config**: Rules (DENY_RULES, ASK_RULES) defined in config file, or embedded in binary at compile time?
4. **Windows/macOS/Linux**: Phase 1 target all platforms, or start with one (e.g., macOS only, expand later)?
5. **Go version**: Require Go 1.23+ (current stable) or older for broader contributor compatibility?

---

## Success Metrics (Phase 1)

- ✅ PreToolUse latency: 0.4s → ~0.03s (10x improvement)
- ✅ All 5 hook behaviors identical to Node.js originals (test parity)
- ✅ No new dependencies on external Go packages (stdlib only)
- ✅ Cross-compilation to Windows, macOS (arm64 + x86_64), Linux (amd64)
- ✅ Hook discovery & testing in CI (no manual platform tweaking)
- ✅ Single `go mod` file, minimal go.sum (< 10 transitive deps if any)

---

## Affected Codebase Paths

| Path | Impact | Change |
|------|--------|--------|
| `scripts/hooks/*.js` | Replaced | Migrate to `cmd/hooks/*.go` |
| `scripts/hooks/*.test.js` | Replaced | Migrate to `cmd/hooks/*_test.go` |
| `hooks/hooks.json` | Updated | Point to binary instead of node scripts |
| `scripts/configure/cli.js` | Updated | Add Go compilation step during target generation |
| `scripts/lib/*.js` | Unchanged | Generators stay in Node.js |
| `scripts/configure/*.js` | Unchanged | Target generation stays in Node.js |
| CI pipeline | Updated | Add `go install`, `go build`, `go test` steps |
| Package.json | Updated | Add build script: `"build:hooks:go": "go build -o dist/hooks/ospec-hooks ./cmd/hooks/"` |

---

## Conclusion

**Go is the right choice for the hooks layer**, solving the real cold-start latency problem in PreToolUse. Keeping generators in Node.js pragmatically balances latency improvement with team velocity and complexity. A phased approach (hooks first, generators deferred) allows validation before committing to larger changes.

**Next step**: Proposal phase should lock in the binary distribution strategy and platform matrix, then design the Go module structure and testing harness.
