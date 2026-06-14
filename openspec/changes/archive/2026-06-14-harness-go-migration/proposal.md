# Proposal: Harness Go Migration (Phase 1 — Runtime Hooks Only)

## Intent

PreToolUse fires on every tool call with a Node.js cold-start of ~0.3–0.5s, adding ~8s of cumulative latency to a tool-heavy session. Re-implement the 5 runtime hooks as a single cross-compiled Go binary (~0.03s startup, 10x faster) while preserving behavior exactly. Generators stay in Node.js (deferred Phase 2). Delivery strategy: `exception-ok`.

## Scope

### In Scope (Phase 1)
- Re-implement 5 hooks in Go: `pre-tool-use`, `session-start`, `pre-compact`, `stop`, `subagent-stop`.
- Single binary dispatched by subcommand; cross-compiled per OS/arch (no sh/bash/pwsh-per-OS).
- Port the 5 `*.test.js` files to Go table-driven tests (behavior parity).
- Update each target's hook wiring to invoke the binary.
- Keep current JS hooks in place as fallback until parity is validated.

### Out of Scope (deferred Phase 2)
- Generators / build scripts: `scripts/lib/route-dispatcher.js`, `skill-registry.js`, `target-transform.js`, `scripts/configure/*`. **Stay in Node.js.**
- Orchestrator integration; route-dispatcher planning-time call path.
- Marketplace / `.claude-plugin` generation logic.

## Capabilities

> Contract with sdd-spec. Behavior is preserved; only the runtime/registration model changes.

### New Capabilities
- None.

### Modified Capabilities
- `hooks`: The registration/runtime-model requirements change. Existing spec section 1 states each hook is "a standalone Node.js 22+ CommonJS script" with command template `node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.js"`. This becomes a single Go binary dispatched by subcommand (`ospec-hooks <event>`). The stdin→JSON / stdout→JSON contract (sec 1.3) and all per-hook behaviors (sec 2–6) are UNCHANGED and must be carried into Go verbatim.

## Behaviors to Preserve (per hook)

| Hook | Must-preserve contract | Source |
|------|------------------------|--------|
| `pre-tool-use` | DENY (8 rules) → ASK (10 rules) → allow precedence; shell-tool name normalization; command extraction from `command`/`commands[]`; error → `ask`; `hookSpecificOutput` shape | `scripts/hooks/pre-tool-use.js` |
| `session-start` | Skill-registry discovery + fingerprint cache (v2) reuse/generate; baseline hint; ospec-not-detected skip; error → status `error` | `scripts/hooks/session-start.js` |
| `pre-compact` | Active-change selection; inline YAML extraction (no external parser); last-completed-artifact inference; Session Summary markdown; idempotent write; `{"continue":true}` | `scripts/hooks/pre-compact.js` |
| `stop` | Latest-session trace render + write; reuse pre-compact YAML helpers; `{"continue":true}` | `scripts/hooks/stop.js` |
| `subagent-stop` | Degraded `skill_resolution` detection (input + transcript scan); advisory-locked JSONL append; systemMessage on warning | `scripts/hooks/subagent-stop.js` |

## Approach

Single Go module at `cmd/hooks/`. `main.go` dispatches on `os.Args[1]` to one handler per event (OCP: adding a hook = new subcommand file, no edits to existing dispatch). Each handler reads JSON from stdin, processes, writes JSON to stdout — identical to today. Safety rules (DENY/ASK) live in a dedicated `rules` source/data unit so the policy is the single thing that changes when rules evolve (SRP). Build emits `ospec-hooks` (or `ospec-hooks.exe`) per target into `scripts/hooks/`.

## Per-Target Invocation

| Target | Wiring file | Today | With Go binary |
|--------|-------------|-------|----------------|
| claude | `hooks/hooks.json` (nested) | `node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.js"` | `"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks <event>"` |
| github-copilot | `.github/hooks/hooks.json` (`bash`+`powershell`, repo-relative, subset via eventMap) | `node "scripts/hooks/<name>.js"` | `"scripts/hooks/ospec-hooks <event>"` in both keys |
| vscode | identity transform (`target-profiles/vscode.js`) | inherits canonical `hooks.json` form | same canonical command form; confirm runtime/var in design |
| opencode | `.opencode/plugins/ospec.js` (NO shell hooks) | `require()`s hook JS in-process: `evaluateToolUse()`, `runSessionStart()` | **cannot `require()` a Go binary** — see Risk O1 |

## Open Decisions (for clarify gate — not decided here)

| # | Decision | Options | Recommended default |
|---|----------|---------|---------------------|
| 1 | Binary distribution | A: check in per-target/platform binaries (~5–15MB each, no Go for users, drift risk) · B: build-step at generation in CI, ship as release/dist artifacts | **B** — clean repo, no stale-binary drift; gate behind CI Go toolchain |
| 2 | Binary shape | A: single `ospec-hooks <event>` dispatcher · B: 5 separate binaries | **A** — OCP-friendly, one artifact per platform, smaller surface |
| 3 | DENY/ASK rules location | A: embed at compile time (`go:embed`) · B: external `rules.json` editable at runtime | **A** — parity with today's hardcoded rules + tamper resistance; optional override later |
| 4 | Platform matrix | A: full Windows + macOS(arm64+amd64) + Linux(amd64) day one · B: subset, expand later | **A** — users span all three OSes; partial coverage breaks JS-parity guarantee; Go cross-compile is cheap |
| 5 | Minimum Go version | A: Go 1.23+ (current stable) · B: older for contributor compat | **A** — modern stdlib, mature `go:embed`, security patches |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **O1: opencode in-process coupling.** `opencode-plugin.js` generator emits a plugin that `require()`s the hook JS exports; a Go binary breaks this. This is a generator inseparable from the hooks (per approval scope). | High | Do NOT migrate the generator. Options for design: opencode plugin `spawnSync` the Go binary feeding JSON stdin/parsing stdout, OR keep a thin JS hook shim for opencode only. Flag as dependency; resolve in design. |
| Go toolchain absent in CI/dev | Med | Add Go ≥1.23 to CI matrix + build step; document requirement |
| Cross-compile matrix breakage | Med | GitHub Actions `matrix`; CI `go test` per platform |
| Behavior drift from JS | Med | Port all 5 test files; assert parity; keep JS fallback until validated |
| Copilot `bash`/`powershell` both point at one binary path | Low | Same relative path works on both shells; verify exec bit on POSIX |
| Binary size in repo (if Decision 1=A) | Low–Med | Prefer build-step (Decision 1=B) |

## Rollback Plan

The current JS hooks remain in `scripts/hooks/*.js` and stay the active wiring until parity is signed off. Rollback = revert the per-target `hooks.json` / plugin command strings back to `node "...<name>.js"` (single config change per target) and drop the Go build step; no data migration, no orchestrator change. JS fallback is the safety net throughout Phase 1.

## Dependencies

- Go ≥1.23 toolchain in dev + CI (Decision 5).
- Resolution of opencode coupling (Risk O1) before opencode wiring is changed.
- `artifact-store` / `skill-registry` JSON-on-disk contracts that hooks read/write remain stable (consumed, not migrated).

## Success Criteria

- [ ] All 5 hook behaviors identical to JS originals (ported tests pass).
- [ ] PreToolUse startup ~0.4s → ~0.03s.
- [ ] Single Go binary, stdlib-only (or <10 transitive deps).
- [ ] Cross-compiled for Windows, macOS (arm64+amd64), Linux (amd64) per Decision 4.
- [ ] claude + github-copilot wire to the binary; opencode path resolved per O1; vscode confirmed.
- [ ] JS hooks retained as fallback until parity validated; rollback is a one-line-per-target config revert.
