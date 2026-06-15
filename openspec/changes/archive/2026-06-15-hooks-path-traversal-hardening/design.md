# Design: Hooks Path-Traversal Hardening

## Technical Approach

Introduce ONE unexported path-validation helper in `internal/hooks/common.go` that
encodes the locked policy: a path is valid only when it is absolute (`filepath.IsAbs`)
AND its cleaned form contains no `..` segment. Both untrusted flows route through it:

- `cwd` (precompact / stop / subagent-stop): `resolveCwd` calls the helper, then adds
  the cwd-specific `os.Stat` existing-directory check on top; any failure falls back to `"."`.
- `transcript_path` (subagent-stop): `findResolutionInTranscript` calls the helper before
  `readFilePermissive`; rejection degrades to "absent" (identical to ENOENT), so no read occurs.

This satisfies both ADDED requirements in
`specs/hooks-runtime/spec.md` while keeping every handler non-blocking (`{"continue":true}`, exit 0),
which they already are. The shared helper holds the policy common to both flows
(absolute + no `..`); the Stat directory check is layered only in `resolveCwd` because
it is cwd-specific per the clarifications.

## Architecture Decisions

### Decision: Single shared helper carries only the common policy; Stat layered in resolveCwd

**Choice**: `validatePath(p string) (cleaned string, ok bool)` in `common.go` enforces
absolute + no-`..`. `resolveCwd` calls it, then does `os.Stat`/`IsDir`.
**Alternatives considered**: (a) put the Stat check inside the shared helper and have the
transcript flow ignore the directory result; (b) two separate helpers.
**Rationale**: A file (`transcript_path`) is not a directory, so a Stat-dir check cannot live
in the shared helper without diverging semantics. Keeping the helper to the exact intersection
of the two policies (absolute + no `..`) gives one test surface for the shared rule and prevents
drift, satisfying the locked "single shared validation helper" decision.

### Decision: `..` detection on the slash-normalized cleaned path

**Choice**: split `filepath.ToSlash(filepath.Clean(p))` on `/` and reject any `..` element.
**Alternatives considered**: substring `strings.Contains(p, "..")` (false positives like `..foo`);
checking only `strings.HasPrefix`.
**Rationale**: Segment-wise check is exact and OS-portable. `filepath.Clean` collapses interior
`..` for absolute paths and preserves leading `..` for relative ones; combined with the `IsAbs`
gate this closes both the relative-escape and the Windows `..\..\` cases. The explicit `..` scan
is retained per the locked decision even though `IsAbs` already rejects leading `..`, because the
clarification mandates both conditions.

### Decision: stop.go needs NO code change

**Choice**: leave `stop.go` untouched.
**Alternatives considered**: edit `runStop` for parity with the proposal's affected-areas table.
**Rationale**: `stop.go:57` already calls `resolveCwd(input.Cwd)`. Hardening `resolveCwd`
transitively secures the stop handler. The proposal table lists `stop.go` as Modified, but
grounding shows the routing is already in place; only a regression test is added. (Flagged in Risks.)

## Data Flow

Validation path (both untrusted inputs converge on `validatePath`):

    cwd ──► resolveCwd ──► validatePath ──┐                   reject │ accept
                                          ├─ IsAbs? & no ".."? ──────┤
    transcript_path ──► findResolution ───┘                          │
                          InTranscript                               │
                                                                     ▼
        resolveCwd:  ok ► os.Stat dir? ─ yes ► return cleaned        validatePath
                                       └ no  ► return "."             returns ok=true/false
                     reject ─────────────────► return "."
        transcript:  ok ► readFilePermissive(cleaned)
                     reject ─────────────────► return "" (treated as absent, no read)

Downstream: `resolveCwd` result is handed to `store.NewStore(workspace)`; a `"."` fallback
confines all `.ospec/` joins to the process CWD instead of an attacker-chosen root.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/hooks/common.go` | Modify | Add `validatePath(p string) (string, bool)` + segment `..` scan; add `path/filepath`, `strings` imports. Holds the shared absolute+no-`..` policy. |
| `internal/hooks/precompact.go` | Modify | `resolveCwd` calls `validatePath`; on `ok` run `os.Stat`/`IsDir`; any failure returns `"."`. |
| `internal/hooks/subagentstop.go` | Modify | `findResolutionInTranscript` replaces its trim/empty guard with `validatePath`; reject ⇒ return `"", nil` (absent) before `readFilePermissive`. |
| `internal/hooks/pathsafe_posix_test.go` | Create | `//go:build !windows`, `package hooks` internal unit table tests for `validatePath` with POSIX literals. |
| `internal/hooks/pathsafe_windows_test.go` | Create | `//go:build windows`, `package hooks` internal unit table tests for `validatePath` with Windows literals. |
| `internal/hooks/precompact_test.go` | Modify | Add `resolveCwd` behavior cases: traversal reject, missing-dir Stat fallback (cross-platform via `t.TempDir()`). |
| `internal/hooks/subagentstop_test.go` | Modify | Add transcript accept (event written) vs reject (no read / no event) cases. |
| `internal/hooks/stop_test.go` | Modify | Add cwd-traversal non-blocking regression (`continue:true`, exit 0). |

`stop.go` is intentionally NOT modified (see Decision above).

## Interfaces / Contracts

```go
// common.go — shared policy: absolute path with no ".." segment.
func validatePath(p string) (cleaned string, ok bool) {
    p = strings.TrimSpace(p)
    if p == "" {
        return "", false
    }
    cleaned = filepath.Clean(p)
    if !filepath.IsAbs(cleaned) {
        return "", false
    }
    for _, seg := range strings.Split(filepath.ToSlash(cleaned), "/") {
        if seg == ".." {
            return "", false
        }
    }
    return cleaned, true
}

// precompact.go — cwd flow adds the existing-directory check.
func resolveCwd(cwd string) string {
    cleaned, ok := validatePath(cwd)
    if !ok {
        return "."
    }
    if info, err := os.Stat(cleaned); err != nil || !info.IsDir() {
        return "."
    }
    return cleaned
}

// subagentstop.go — transcript flow degrades to "absent" on reject.
func findResolutionInTranscript(transcriptPath string) (string, error) {
    path, ok := validatePath(transcriptPath)
    if !ok {
        return "", nil // treated as absent — no os.ReadFile
    }
    data, err := readFilePermissive(path)
    // ...unchanged...
}
```

## Testing Strategy

Strict TDD: write `validatePath` unit tests RED first (helper does not yet exist), then GREEN,
then triangulate with the lexical-collapse and Stat-fallback edge cases.

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (internal, `package hooks`) | `validatePath` accept/reject matrix | Table-driven `t.Run`; split by build tag for OS-literal paths |
| Unit (cross-platform) | `resolveCwd` Stat fallback | `t.TempDir()` (host-absolute) for existing-dir accept and `+"/missing"` for fallback |
| Behavior (`package hooks_test`) | Handlers stay non-blocking on reject | `hooks.Dispatch` ⇒ assert `continue:true`, exit 0, no event/summary leak |

`validatePath` accept/reject matrix:

| Case | Input | Expect | File |
|------|-------|--------|------|
| Valid absolute dir (POSIX) | `/home/user/project` | ok, `/home/user/project` | posix |
| Valid absolute file (POSIX) | `/tmp/session/transcript.jsonl` | ok | posix |
| Relative traversal | `../../etc` | reject (not abs) | posix |
| Relative non-traversal | `relative/path` | reject (not abs) | posix |
| Empty / whitespace | `""`, `"   "` | reject | posix |
| Lexical collapse documents behavior | `/home/u/../../../etc` → `/etc` | ok (abs, no `..` after Clean) | posix |
| Valid absolute dir (Windows) | `C:\Users\user\project` | ok | windows |
| Valid absolute file (Windows) | `C:\sessions\transcript.jsonl` | ok | windows |
| Windows traversal | `..\..\Windows\System32` | reject (not abs) | windows |
| Windows traversal file | `..\..\secrets.txt` | reject | windows |
| Windows relative | `relative\path` | reject | windows |

Windows/POSIX tagging rationale (FLAGGED): literal-path cases are OS-dependent because
`filepath.IsAbs` and the separator differ by GOOS. `C:\...` is absolute only on Windows;
`/home/...` is absolute only on POSIX; backslashes are ordinary filename bytes on POSIX. They
MUST live in `//go:build windows` / `//go:build !windows` files so each platform asserts the
real semantics. `filepath.FromSlash` does NOT help (it cannot synthesize a drive letter), so
do not rely on it to fold the two matrices into one. The `resolveCwd` Stat cases use
`t.TempDir()`, which is always host-absolute, and therefore stay untagged/cross-platform.

Behavior cases: precompact + stop traversal `cwd` ⇒ `continue:true`/exit 0 with no summary
written under the traversal root; subagent-stop with empty inline resolution and a traversal
`transcript_path` pointing at a real degraded-resolution file ⇒ file NOT read, no event emitted;
absolute path to the same file ⇒ event emitted (proves the gate, not a blanket skip).

## Migration / Rollout

No migration required. Pure stdlib (`path/filepath`, `os`, `strings`); `internal/store`
unchanged. Rollback = `git revert` + rebuild `ospec-hooks`; JS fallback hooks remain the
deeper safety net.

## Open Questions

- None. transcript_path policy (absolute + no `..`) and cwd Stat check are locked in
  `## Clarifications`; out-of-scope follow-ups `fu-w1`/`fu-w2` (nesting depth) are excluded.
