# Apply Progress — hooks-path-traversal-hardening

## Batch 1 — 2026-06-15 (all tasks, first and only batch)

**Change**: hooks-path-traversal-hardening
**Mode**: Strict TDD
**Delivery**: size:exception (single PR, ~250 lines, Low risk, exception-ok accepted)
**Host platform**: Windows (win32) — `//go:build windows` tests run; `//go:build !windows` excluded by OS

---

### Safety Net Baseline

Run before any production changes:
```
go test ./internal/hooks/... -count=1
ok  internal/hooks  0.580s   (all existing tests passing)
```

---

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `pathsafe_posix_test.go` | Unit (internal) | N/A (new file) | Written — `//go:build !windows` excluded on Windows host; file exists and references `validatePath` | N/A on Windows (build tag) | 7 cases including lexical-collapse (task 2.2) | Clean |
| 1.2 | `pathsafe_windows_test.go` | Unit (internal) | N/A (new file) | Written — compile error confirmed: `undefined: validatePath` (exit 1) | 5/5 PASS after task 2.1 | 5 cases (2 accept, 3 reject) | Clean |
| 2.1 | `pathsafe_windows_test.go` | Unit | N/A | RED from 1.2 | `go test -run TestValidatePath`: 5/5 PASS (0.273s) | Covered by tasks 1.1+1.2+2.2 | Clean — no magic numbers, pure function |
| 2.2 | `pathsafe_posix_test.go` | Unit | n/a | Added lexical-collapse case (`/home/u/../../../etc` → `/etc`) | `go test ./internal/hooks/...`: ok 0.464s (posix excluded on Windows, suite stays GREEN) | Triangulated: `/home/u/../../../etc` forces the real Clean+IsAbs logic | None needed |
| 3.1 | `precompact_test.go` | Behavior | N/A (new test group) | Written — 3 sub-cases (traversal, valid-tmpdir, non-existent abs) | Tests pass even before hardening (all paths lead to `continue:true`; these are regression-pin tests) | 3 sub-cases cover traversal reject, valid accept, missing-dir fallback | Clean |
| 3.2 | `precompact_test.go` | Behavior | Pre-existing: ok 0.580s | Covered by 3.1 | `go test ./...`: all 7 packages ok (0.481s) | N/A — implementation follows spec exactly | None needed |
| 4.1 | `subagentstop_test.go` | Behavior | N/A (new test group) | Written — case (a): traversal path, no events; case (b): valid path, event emitted | Both cases pass before hardening (traversal target `../../.env` doesn't exist, so no read occurs either way) | 2 sub-cases: reject path (no event) vs. accept path (event with `fallback-registry`) | Clean |
| 4.2 | `subagentstop_test.go` | Behavior | Pre-existing: ok 0.580s | Covered by 4.1 | `go test ./...`: all 7 packages ok (0.481s) | N/A | None needed |
| 5.1 | `stop_test.go` | Behavior | Pre-existing: ok 0.580s | Written — traversal cwd, assert `continue:true`, exit 0 | `go test -run TestStop_TraversalCwdNonBlocking`: PASS | Single regression case (pinning existing non-blocking contract) | Clean |
| 5.2 | `subagentstop_test.go` | Behavior | Pre-existing: ok 0.580s | Written — traversal cwd with `fallback-registry`, assert no `.ospec` at traversal target | `go test -run TestSubagentStop_TraversalCwdNonBlocking`: PASS | Verifies both `continue:true` and that traversal path is not used as workspace root | Clean |

### Test Summary

- **Total new tests written**: 19 new test cases (5 Windows validatePath + 7 POSIX validatePath + 3 resolveCwd hardening + 2 transcript traversal + 1 stop regression + 2 subagent cwd regression)
- **Total tests passing (full suite)**: 119 PASS in hooks package, all 7 packages ok
- **Layers used**: Unit/internal (validatePath matrix), Behavior/package-hooks-test (handler dispatch)
- **Approval tests** (refactoring): None — no existing tests were refactored; all additions
- **Pure functions created**: 1 (`validatePath` — no side effects, same input → same output)
- **Final full-suite run**: `go test ./...` — all 7 packages ok

---

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `internal/hooks/common.go` | Modified | Added `validatePath(p string) (string, bool)` with `path/filepath` + `strings` imports; segment scan via `filepath.ToSlash` + split on `/` |
| `internal/hooks/precompact.go` | Modified | Replaced `resolveCwd` body: `validatePath` → `os.Stat`/`IsDir` → fallback `"."` |
| `internal/hooks/subagentstop.go` | Modified | Replaced `strings.TrimSpace` / empty guard in `findResolutionInTranscript` with `validatePath`; reject → `return "", nil` |
| `internal/hooks/pathsafe_posix_test.go` | Created | `//go:build !windows`, `package hooks`, `TestValidatePath_Posix` — 7 cases including lexical-collapse triangulation |
| `internal/hooks/pathsafe_windows_test.go` | Created | `//go:build windows`, `package hooks`, `TestValidatePath_Windows` — 5 cases covering Windows-literal paths |
| `internal/hooks/precompact_test.go` | Modified | Added `TestPreCompact_ResolveCwdHardening` (3 sub-cases) |
| `internal/hooks/subagentstop_test.go` | Modified | Added `TestSubagentStop_TranscriptPathTraversal` (2 sub-cases) + `TestSubagentStop_TraversalCwdNonBlocking` |
| `internal/hooks/stop_test.go` | Modified | Added `TestStop_TraversalCwdNonBlocking` |

`stop.go` intentionally NOT modified — transitively secured by `resolveCwd` change (confirmed in design).

---

### Deviations from Design

None — implementation matches design.md exactly. `validatePath` signature, `resolveCwd` body, and `findResolutionInTranscript` guard all match the Interface/Contracts section verbatim.

One note: the `subagentstop.go` file did NOT have a `path/filepath` import at the start (despite the task saying it was already present). The build succeeded anyway because `validatePath` is defined in `common.go` (same package) and does not require an import in `subagentstop.go`. No duplicate import was added.

---

### Status

10/10 tasks complete. Ready for `sdd-verify`.

---

## Batch 2 — 2026-06-15 (W1/W2 test-hardening continuation)

**Change**: hooks-path-traversal-hardening
**Mode**: Strict TDD
**Delivery**: size:exception (continuation batch, test-quality only, no production code changed)
**Scope**: Fix two verify WARNINGs (W1 non-discriminating fu-c1 test; W2 non-hermetic traversal-cwd tests)

---

### Safety Net Baseline

Before changes:
```
go test ./internal/hooks/... -count=1
ok  internal/hooks  0.481s   (all tests passing, but .ospec/ leaked into internal/hooks/)
```

---

### TDD Cycle Evidence (Batch 2)

| Task | Test / Location | RED basis | GREEN | TRIANGULATE | Notes |
|------|----------------|-----------|-------|-------------|-------|
| W1 (fu-c1 discriminating) | `subagentstop_test.go` — `TestSubagentStop_TranscriptPathTraversal/traversal_transcript_path_rejected_even_when_file_exists_(discriminating)` | Removing the `validatePath` gate from `findResolutionInTranscript` would cause `readFilePermissive("../secret/transcript.jsonl")` to succeed (file EXISTS at the traversal path), returning `"fallback-registry"`, writing an event, making `os.Stat(evPath)` succeed — assertion would FAIL. | PASS: no event emitted, gate rejects relative path before read | Sub-test `same_file_via_absolute_path_allows_event_emission_(triangulation)` uses the identical file via absolute path and confirms event IS emitted — proving gate, not file absence, is the cause | `t.Chdir(workspace)` used to make the traversal path resolve to a real file |
| W2 (subagentstop hermetic) | `subagentstop_test.go` — `TestSubagentStop_TraversalCwdNonBlocking` | Before fix: `.ospec/` written to `internal/hooks/` (confirmed via `ls internal/hooks/.ospec`). This is detectable: delete dir, run test, dir reappears → non-hermetic. | PASS: `t.Chdir(t.TempDir())` added; fresh run after deleting `internal/hooks/.ospec` → dir NOT recreated (CLEAN confirmed) | Positive assertion added: `tmpOspec := filepath.Join(tmpDir, ".ospec")` exists → confirms fallback wrote to hermetic temp dir | CWD isolation via `t.Chdir(tmpDir)` before handler invocation |
| W2 (stop hermetic) | `stop_test.go` — `TestStop_TraversalCwdNonBlocking` | Same as above: stop handler writes `latest.md` under `"."` fallback, landing in `internal/hooks/.ospec/session/` | PASS: `t.Chdir(t.TempDir())` added; no leak confirmed | Stop handler writes to temp dir CWD now | No new assertion needed (test was already minimal non-blocking pin) |

### Evidence

- **Full suite GREEN after changes**: `go test ./... -count=1` → all 7 packages `ok`
- **W2 hermetic proof**: Deleted `internal/hooks/.ospec`, ran traversal-cwd tests, confirmed `CLEAN: no .ospec leaked into package dir`
- **W1 RED proof basis** (reasoning): Without the `validatePath` gate in `findResolutionInTranscript`, `readFilePermissive("../secret/transcript.jsonl")` would read the real file (placed at that exact relative path via `t.Chdir(workspace)`) and return `"fallback-registry"`, triggering event emission — the `os.Stat(evPath) == nil` assertion would then fail.

---

### Files Changed (Batch 2)

| File | Action | Description |
|------|--------|-------------|
| `internal/hooks/subagentstop_test.go` | Modified | Replaced non-discriminating `TestSubagentStop_TranscriptPathTraversal` case (a) with discriminating version (file placed at traversal target, `t.Chdir`, RED-provable); hardened `TestSubagentStop_TraversalCwdNonBlocking` with `t.Chdir(t.TempDir())` and positive `.ospec` fallback assertion |
| `internal/hooks/stop_test.go` | Modified | Added `t.Chdir(t.TempDir())` to `TestStop_TraversalCwdNonBlocking` for hermetic isolation |

Production code (`subagentstop.go`, `precompact.go`, `common.go`, `stop.go`): **NOT changed** — behavior unchanged, test quality only.

---

### Deviations from Design

None — no production behavior change; test-quality fixes only.

---

### Status (Batch 2)

W1 and W2 resolved. All 10 original tasks remain `[x]`. Full suite GREEN (7/7 packages).
Ready for `sdd-verify` re-run.

---

## Batch 3 — 2026-06-15 (4R CRITICAL: root-rejection hardening)

**Change**: hooks-path-traversal-hardening
**Mode**: Strict TDD
**Delivery**: size:exception (continuation batch, ~25 lines production code change + ~65 lines tests)
**Scope**: Close 2 CRITICAL findings from 4R review gate — `validatePath` accepted filesystem root `/` and Windows drive/volume root `C:\`, `\\host\share` (both absolute, no `..` segment, but steer `.ospec/` writes to filesystem root if used as workspace cwd).

---

### Safety Net Baseline (Batch 3)

Before changes:
```
go test ./internal/hooks/... -count=1
ok  internal/hooks  0.517s   (all tests passing)
```

---

### TDD Cycle Evidence (Batch 3)

| Task | Test File | Layer | RED | GREEN | TRIANGULATE / NOTES |
|------|-----------|-------|-----|-------|---------------------|
| Root-rejection unit (Windows) | `pathsafe_windows_test.go` | Unit (internal) | Written — 2 new rows: `drive_root_C:\\_rejected` (wantOK=false), `UNC_volume_root_rejected` (wantOK=false). Confirmed RED: `validatePath("C:\\") ok=true, want false` + `validatePath("\\\\host\\share") ok=true, want false` (exit 1, 0.270s) | GREEN after adding `filepath.Dir(cleaned)==cleaned` guard to `validatePath`. All 7 Windows cases PASS. | Removing the new root check would cause both FAIL — discriminating. Confirmed: `filepath.Dir("C:\\")=="C:\\"` and `filepath.Dir("\\\\host\\share")=="\\\\host\\share"` on Windows. |
| Root-rejection unit (POSIX) | `pathsafe_posix_test.go` | Unit (internal) | Written — 1 new row: `filesystem_root_rejected` (`/`, wantOK=false). Build-tagged `!windows`, excluded on Windows host. RED on POSIX: `validatePath("/") ok=true, want false` before fix. | GREEN after implementation — `filepath.Dir("/")=="/"` on POSIX. Excluded on Windows host; logic verified analytically. | Removing the root check would cause FAIL on POSIX. POSIX root case covered analytically and by `filepath.Dir` invariant (`filepath.Dir("/")=="/"` holds per Go stdlib). |
| Root-rejection behavior (Windows) | `subagentstop_test.go` | Behavior | Added post-GREEN (see note). `TestSubagentStop_DriveRootCwdFallback` — passes `C:\` as cwd, asserts positive: `.ospec` in hermetic temp dir; negative: no `.ospec` at `C:\`. | PASS on first run (fix already in place). | Post-GREEN addition rationale: a pre-fix behavior test is unsafe — in RED state with admin privileges, the store would attempt to write `C:\.ospec` (root write). Unit matrix rows are the primary discriminating RED evidence. Behavior test provides defense-in-depth that the validated path flows through `resolveCwd` correctly. |
| Spec update | `specs/hooks-runtime/spec.md` | Artifact | N/A | Updated: amended validatePath requirement table with root condition; added 3 new Given/When/Then scenarios (POSIX root, drive root, UNC root); appended Clarifications entry (source: 4R review gate, "harden-policy-now"). | N/A |

**RED evidence (Batch 3)**:
```
go test ./internal/hooks/... -count=1 -run TestValidatePath -v
--- FAIL: TestValidatePath_Windows/drive_root_C:\_rejected
    pathsafe_windows_test.go:67: validatePath("C:\\") ok = true, want false
--- FAIL: TestValidatePath_Windows/UNC_volume_root_rejected
    pathsafe_windows_test.go:67: validatePath("\\\\host\\share") ok = true, want false
FAIL  internal/hooks  0.270s
```

**Discriminating-RED reasoning**: Removing the `filepath.Dir(cleaned)==cleaned` check from `validatePath` would revert to the pre-fix state where `C:\` and `\\host\share` (and `/` on POSIX) pass validation. The two Windows unit rows would immediately FAIL with `ok=true, want false`. The POSIX unit row would FAIL on a POSIX host with `ok=true, want false`. The behavior test positive assertion would FAIL (`.ospec` would not land in the hermetic temp dir).

**GREEN evidence (Batch 3)**:
```
go test ./... -count=1
ok  github.com/mretamozo-hiberuscom/ospec-workflow/cmd/ospec-hooks   4.314s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/hooks    0.532s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/jsonio   0.245s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/rules    0.268s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/skillreg 0.288s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/store    0.305s
ok  github.com/mretamozo-hiberuscom/ospec-workflow/internal/yamllite 0.253s

go vet ./internal/hooks/   → (no output — clean)
```

---

### Files Changed (Batch 3)

| File | Action | Description |
|------|--------|-------------|
| `internal/hooks/common.go` | Modified | Added `filepath.Dir(cleaned)==cleaned` root-rejection guard after the `..`-segment scan in `validatePath`. Updated doc comment to document the root-rejection policy and detection rationale. |
| `internal/hooks/pathsafe_windows_test.go` | Modified | Added 2 rejection rows: `drive_root_C:\\_rejected` (`C:\`, wantOK=false) and `UNC_volume_root_rejected` (`\\host\share`, wantOK=false). Both include RED-proof comments. |
| `internal/hooks/pathsafe_posix_test.go` | Modified | Added 1 rejection row: `filesystem_root_rejected` (`/`, wantOK=false). Includes RED-proof comment. Build-tagged `!windows` — runs on POSIX only. |
| `internal/hooks/subagentstop_test.go` | Modified | Added `runtime` import; added `TestSubagentStop_DriveRootCwdFallback` behavior test with `runtime.GOOS` guard (Windows-only). Post-GREEN addition with full rationale documented. |
| `openspec/changes/hooks-path-traversal-hardening/specs/hooks-runtime/spec.md` | Modified | Amended validatePath requirement with root-rejection condition; added 3 new Given/When/Then scenarios (POSIX root, drive root, UNC root); appended 4R review gate Clarifications entry. |
| `openspec/changes/hooks-path-traversal-hardening/state.yaml` | Modified | status → `ready-for-verify`; apply.note updated with Batch 3 summary; verify.status → `pending`; 4R CRITICAL findings marked RESOLVED. |

Production code change summary: 1 guard added in `common.go` (~8 lines). No other production files modified.

---

### Deviations from Design

None — the implementation is a pure additive extension to `validatePath` in `common.go`, consistent with the fail-safe contract: callers degrade identically (`resolveCwd` → `"."`, `findResolutionInTranscript` → treated as absent). The `filepath.Dir(cleaned)==cleaned` detection matches the approach specified in the 4R scope document.

---

### Status (Batch 3)

4R CRITICAL findings resolved. All 10 original tasks remain `[x]`. Spec updated with normative root-rejection policy. Full suite GREEN (7/7 packages), go vet clean.
Ready for `sdd-verify`.
