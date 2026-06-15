# Proposal: Hooks Path-Traversal Hardening

## Intent

The `ospec-hooks` Go runtime reads two untrusted hook-payload fields as filesystem
paths without traversal validation. `transcript_path` is passed straight to
`os.ReadFile` (subagentstop.go:196,213), and `cwd` is only `filepath.Clean`-ed
(precompact.go:323) — `Clean` preserves leading `..` — then used as the workspace
root that `store.NewStore` joins with every read/write path (store.go:82-99). A
crafted payload can therefore read files outside the intended location or steer
`.ospec/` writes outside the workspace. These are the CRITICAL-origin follow-ups
`fu-c1` / `fu-c2` accepted during `harness-go-migration` verify. No live exploit
was observed; this closes the hardening gap.

## Scope

### In Scope
- `fu-c1`: validate `transcript_path` before reading it in the subagent-stop handler.
- `fu-c2`: validate `cwd` against traversal in the precompact, stop, and subagent-stop handlers.
- A shared validation helper in `internal/hooks` (single policy, one test surface).
- Tests covering traversal rejection and legitimate-path acceptance.

### Out of Scope
- Other hooks (`session-start`, `pre-tool-use`) — they do not read these fields as paths.
- The JS fallback hooks (`scripts/hooks/*.js`) — Phase 1 parity scope, untouched.
- Cleanup follow-ups `fu-w1`/`fu-w2` (nesting depth) and testing-gap W1.
- Sandboxing or capability-dropping beyond path validation.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `hooks-runtime`: add a security requirement that hook handlers MUST validate
  untrusted filesystem path inputs (`transcript_path`, `cwd`) against path traversal
  before any read/write, with defined fail-safe behavior.

## Approach

Add a shared helper in `internal/hooks` (the package already centralizes
`resolveCwd`/`continueWithError`). Rationale: both flows are the same problem —
untrusted path from JSON — and `cwd` is consumed identically by three handlers, so
per-handler logic would duplicate policy and drift. Proposed shape:
- `cwd`: reject inputs containing `..` traversal segments and require an
  absolute, existing directory; on failure fall back to the safe default (`.`)
  so the hook stays non-blocking (handlers already always emit `{"continue":true}`).
- `transcript_path`: reject `..` traversal; treat invalid paths the same as a
  missing file (`readFilePermissive` already returns nil/no-error for ENOENT),
  so resolution simply degrades to "not found". Exact policy (absolute-only vs
  workspace-confined) is a design-phase decision — see Risks.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/hooks/common.go` | Modified | Add shared path-validation helper(s) |
| `internal/hooks/precompact.go` | Modified | `resolveCwd` validates traversal |
| `internal/hooks/subagentstop.go` | Modified | Validate `transcript_path` + `cwd` |
| `internal/hooks/stop.go` | Modified | `cwd` validated via shared `resolveCwd` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Over-strict policy rejects legitimate relative `cwd` | Med | Preserve current `.` default fallback; keep hooks non-blocking |
| Behavior divergence between handlers | Low | Single shared helper, table-driven tests |
| Windows vs POSIX path semantics differ | Med | Use `filepath` + cover both in tests |

## Rollback Plan

Change is isolated to four files in `internal/hooks` with no data/schema/config
impact. Rollback = `git revert` the change commit and rebuild `ospec-hooks`; the
JS fallback hooks remain intact as the deeper safety net.

## Dependencies

- None. Pure stdlib (`path/filepath`); existing `internal/store` unchanged.

## Success Criteria

- [ ] `transcript_path` containing `..` traversal is rejected/treated as not-found, never read.
- [ ] `cwd` containing `..` traversal does not steer store reads/writes outside the workspace.
- [ ] precompact, stop, and subagent-stop all route `cwd` through the validated helper.
- [ ] All affected handlers still emit `{"continue":true}` and exit 0 on rejection (non-blocking).
- [ ] `go test ./...` green; new table-driven tests cover reject + accept cases.
