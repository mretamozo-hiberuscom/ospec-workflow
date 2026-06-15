# Tasks: Hooks Path-Traversal Hardening

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| fu-c2: `resolveCwd` validates cwd before use; shared helper required | MUST | `validatePath` in `common.go`; `resolveCwd` updated in `precompact.go` | covered-by-design | All three handlers already call `resolveCwd`; updating it is sufficient |
| fu-c2: Reject cwd with `..` segment | MUST | `validatePath` segment scan via `strings.Split(filepath.ToSlash(cleaned), "/")` | covered-by-design | |
| fu-c2: Reject non-absolute cwd | MUST | `validatePath` `filepath.IsAbs` gate | covered-by-design | |
| fu-c2: Reject cwd that is not an existing directory | MUST | `resolveCwd` calls `os.Stat`/`IsDir` after `validatePath` ok | covered-by-design | Stat check is cwd-specific, layered on top of shared helper per clarification |
| fu-c2: Fall back to `"."` on any rejection | MUST | `resolveCwd` returns `"."` on `!ok` or Stat failure | covered-by-design | |
| fu-c2: Handler non-blocking on cwd rejection | MUST | Handlers already emit `{"continue":true}`, exit 0 — unchanged | covered-by-design | `stop.go` needs NO code change (transitively secured) |
| fu-c2: Valid absolute POSIX cwd accepted | MUST | `validatePath` POSIX unit tests + `resolveCwd` Stat test via `t.TempDir()` | covered-by-design | `pathsafe_posix_test.go` |
| fu-c2: Valid absolute Windows cwd accepted | MUST | `validatePath` Windows unit tests | covered-by-design | `pathsafe_windows_test.go` (build windows) |
| fu-c2: POSIX traversal cwd rejected | MUST | `validatePath` POSIX unit tests | covered-by-design | `pathsafe_posix_test.go` |
| fu-c2: Windows traversal cwd rejected | MUST | `validatePath` Windows unit tests | covered-by-design | `pathsafe_windows_test.go` (build windows) |
| fu-c1: `findResolutionInTranscript` validates `transcript_path` before reading | MUST | `validatePath` called at top of `findResolutionInTranscript` in `subagentstop.go` | covered-by-design | |
| fu-c1: Reject `transcript_path` not absolute | MUST | `validatePath` `filepath.IsAbs` gate | covered-by-design | |
| fu-c1: Reject `transcript_path` with `..` segment | MUST | `validatePath` segment scan | covered-by-design | |
| fu-c1: Rejected path treated as absent — no `os.ReadFile` | MUST | `findResolutionInTranscript` returns `"", nil` on `!ok`, never calls `readFilePermissive` | covered-by-design | |
| fu-c1: Handler non-blocking on transcript rejection | MUST | Handler path unchanged: emit `{"continue":true}`, exit 0 | covered-by-design | |
| fu-c1: Valid absolute POSIX transcript_path accepted | MUST | `pathsafe_posix_test.go` + behavior test in `subagentstop_test.go` | covered-by-design | |
| fu-c1: Valid absolute Windows transcript_path accepted | MUST | `pathsafe_windows_test.go` | covered-by-design | |
| fu-c1: POSIX traversal transcript rejected — treated as absent | MUST | `subagentstop_test.go` behavior case | covered-by-design | |
| fu-c1: Windows traversal transcript rejected | MUST | `pathsafe_windows_test.go` + `subagentstop_test.go` | covered-by-design | |
| Single shared helper for both flows | MUST | `validatePath` is the only policy function; `resolveCwd` and `findResolutionInTranscript` both call it | covered-by-design | No per-handler duplication permitted |
| fu-w1/fu-w2 nesting depth cleanups | — | OUT OF SCOPE | n/a | Excluded per design and clarifications |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none (spec has no SHOULD/MAY requirements)
- Ambiguities to track: none — clarifications locked transcript_path policy (absolute + no `..`) and cwd Stat check

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~250 (additions + deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | All phases in one PR | PR 1 | ~250 lines; exception-ok accepted; size budget comfortably under 400 |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Foundation — `validatePath` RED tests

- [x] 1.1 Create `internal/hooks/pathsafe_posix_test.go` — `//go:build !windows`, `package hooks`, table-driven `TestValidatePath_Posix` with `t.Run` covering: valid absolute dir (`/home/user/project` → ok), valid absolute file (`/tmp/session/transcript.jsonl` → ok), relative traversal (`../../etc` → reject), relative non-traversal (`relative/path` → reject), empty string (`""` → reject), whitespace-only (`"   "` → reject). All cases MUST compile but FAIL at runtime (`validatePath` does not exist yet). Run `go test ./internal/hooks/... -run TestValidatePath_Posix` to confirm RED.
- [x] 1.2 Create `internal/hooks/pathsafe_windows_test.go` — `//go:build windows`, `package hooks`, table-driven `TestValidatePath_Windows` with `t.Run` covering: valid absolute dir (`C:\Users\user\project` → ok), valid absolute file (`C:\sessions\transcript.jsonl` → ok), Windows traversal dir (`..\..\Windows\System32` → reject), Windows traversal file (`..\..\secrets.txt` → reject), Windows relative (`relative\path` → reject). FAIL until `validatePath` exists.

---

## Phase 2: Core — `validatePath` GREEN + TRIANGULATE

- [x] 2.1 GREEN: Add `validatePath(p string) (cleaned string, ok bool)` to `internal/hooks/common.go` — trim whitespace, `filepath.Clean`, `filepath.IsAbs` gate, segment scan via `strings.Split(filepath.ToSlash(cleaned), "/")` rejecting any `".."` element, return `cleaned, true` only when all checks pass. Add `"path/filepath"` and `"strings"` to imports. `go test ./internal/hooks/... -run TestValidatePath` MUST turn GREEN on the host platform.
- [x] 2.2 TRIANGULATE: Add lexical-collapse case to `TestValidatePath_Posix` in `pathsafe_posix_test.go` — input `/home/u/../../../etc`, expected: `ok=true`, `cleaned="/etc"` (absolute after `filepath.Clean`, no `..` segments remain in the cleaned form). Confirm `go test ./internal/hooks/...` still GREEN.

---

## Phase 3: Wire `resolveCwd` — RED → GREEN

- [x] 3.1 RED: Add `TestPreCompact_ResolveCwdHardening` to `internal/hooks/precompact_test.go` using `package hooks_test` and `hooks.Dispatch`. Three sub-cases via `t.Run`: (a) `"../../etc"` traversal cwd → assert `continue:true`, exit 0; (b) valid `t.TempDir()` cwd with an empty-changes workspace → assert `continue:true`, exit 0; (c) absolute path to a non-existing directory (e.g., `t.TempDir()+"/nonexistent"`) → assert `continue:true`, exit 0. Cases (a) and (c) FAIL because current `resolveCwd` does not reject them (case (b) already passes; include it as the triangulation anchor).
- [x] 3.2 GREEN: Replace `resolveCwd` in `internal/hooks/precompact.go` — body becomes: call `validatePath(cwd)`; on `!ok` return `"."`. On `ok`, call `os.Stat(cleaned)`; if `err != nil || !info.IsDir()` return `"."`. Return `cleaned`. Remove the old `strings.TrimSpace` / `filepath.Clean` body. Confirm `go test ./...` GREEN.

---

## Phase 4: Wire `findResolutionInTranscript` — RED → GREEN

- [x] 4.1 RED: Add `TestSubagentStop_TranscriptPathTraversal` to `internal/hooks/subagentstop_test.go` using `package hooks_test`. Two sub-cases via `t.Run`: (a) traversal `transcript_path` `"../../.env"` with degraded inline resolution absent and no inline `result` field → `continue:true`, exit 0, no events file created at any path under `t.TempDir()` (the gate prevents a read, so no event is emitted); (b) valid absolute path `filepath.Join(t.TempDir(), "transcript.jsonl")` containing `{"skill_resolution":"fallback-registry"}` → event emitted (proves the gate allows valid paths through). Case (a) FAIL because current `findResolutionInTranscript` proceeds past the empty guard.
- [x] 4.2 GREEN: In `internal/hooks/subagentstop.go`, replace the `path := strings.TrimSpace(transcriptPath); if path == ""` guard at the top of `findResolutionInTranscript` with: `path, ok := validatePath(transcriptPath); if !ok { return "", nil }`. The `path/filepath` import is already present in `subagentstop.go`; verify no duplicate import is added. Confirm `go test ./...` GREEN.

---

## Phase 5: Regression guards

- [x] 5.1 Add `TestStop_TraversalCwdNonBlocking` to `internal/hooks/stop_test.go` — dispatch stop handler with traversal `cwd` `"../../etc"` and no other fields → assert `continue:true`, exit 0. This is a regression guard: `stop.go` calls `resolveCwd` which is now hardened; the test pins the non-blocking contract for the stop handler under a traversal payload. `go test ./...` MUST pass.
- [x] 5.2 Add `TestSubagentStop_TraversalCwdNonBlocking` to `internal/hooks/subagentstop_test.go` — dispatch subagent-stop with `cwd: "../../etc"` and `result: {"skill_resolution":"fallback-registry"}`. Assert `continue:true`, exit 0. Verify no `.ospec` directory is created under the literal path `"../../etc"` (the store falls back to `"."` which is the test binary cwd, not the traversal target). `go test ./...` MUST pass.

---

## Files Touched / Created Summary

| File | Action | Phase |
|---|---|---|
| `internal/hooks/common.go` | Modify — add `validatePath` + imports | Phase 2 |
| `internal/hooks/precompact.go` | Modify — replace `resolveCwd` body | Phase 3 |
| `internal/hooks/subagentstop.go` | Modify — replace guard in `findResolutionInTranscript` | Phase 4 |
| `internal/hooks/pathsafe_posix_test.go` | Create — `//go:build !windows`, `package hooks` unit tests | Phase 1 |
| `internal/hooks/pathsafe_windows_test.go` | Create — `//go:build windows`, `package hooks` unit tests | Phase 1 |
| `internal/hooks/precompact_test.go` | Modify — add `TestPreCompact_ResolveCwdHardening` | Phase 3 |
| `internal/hooks/subagentstop_test.go` | Modify — add `TestSubagentStop_TranscriptPathTraversal` + `TestSubagentStop_TraversalCwdNonBlocking` | Phases 4, 5 |
| `internal/hooks/stop_test.go` | Modify — add `TestStop_TraversalCwdNonBlocking` | Phase 5 |
| `internal/hooks/stop.go` | NOT modified — transitively secured by `resolveCwd` change | — |
