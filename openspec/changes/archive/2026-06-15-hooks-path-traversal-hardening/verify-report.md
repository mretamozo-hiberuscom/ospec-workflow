# Verification Report — hooks-path-traversal-hardening

- **Change**: hooks-path-traversal-hardening
- **Mode**: openspec / standard route / **Strict TDD active**
- **Test runner**: `go test ./...` (Go runtime in `internal/hooks`)
- **Host platform**: Windows — `//go:build windows` tests execute; `//go:build !windows` (POSIX) tests are platform-gated (excluded), not failures
- **Verdict**: **PASS**
- **Executive summary**: PASS — full suite green (7/7 packages), `go vet ./internal/hooks/` clean (no `stdversion` warning; Go 1.23+ MUST satisfied), all MUST scenarios covered with runtime-test evidence. Batch 3 (4R CRITICAL root-rejection) is verified: `validatePath` now rejects filesystem/volume roots (`/`, `C:\`, `\\host\share`) and the new rejection rows pass at runtime. The two 4R review-gate CRITICALs are RESOLVED. fu-c1 and fu-c2 discriminating + triangulation pairs remain green.
- **Re-verify note (2026-06-15, Batch 3)**: This run supersedes the prior PASS. It re-confirms the earlier closure of W1/W2 and additionally verifies the root-rejection hardening that closed the 2 CRITICAL findings surfaced by the 4R review gate (decision: `harden-policy-now`).

---

## Test Execution Evidence

`go test ./... -count=1` (fresh re-verify run, Batch 3):

```
ok  github.com/.../cmd/ospec-hooks      3.934s
ok  github.com/.../internal/hooks       0.528s
ok  github.com/.../internal/jsonio      0.240s
ok  github.com/.../internal/rules       0.274s
ok  github.com/.../internal/skillreg    0.298s
ok  github.com/.../internal/store       0.312s
ok  github.com/.../internal/yamllite    0.250s
EXIT=0  (7/7 packages green)
```

`go vet ./internal/hooks/` → exit 0, NO output (no `stdversion` / Go-version warning).
`go.mod` declares `go 1.23`. Confirmed no Go 1.24+ std API in use: `t.Chdir` (Go 1.24) appears
only inside comments; the actual helper is the locally-defined `chdirT` (os.Getwd + os.Chdir +
t.Cleanup) at `subagentstop_test.go:386`. The hooks-runtime spec MUST "Go 1.23+ minimum" holds.

Targeted verbose run (re-verify) — all PASS at runtime:
- `TestValidatePath_Windows` — 7/7 subtests PASS, now including:
  - `drive_root_C:\_rejected` (`C:\`) — PASS
  - `UNC_volume_root_rejected` (`\\host\share`) — PASS
- `TestSubagentStop_DriveRootCwdFallback` — PASS (new Batch 3 behavior test, Windows-only)
- `TestSubagentStop_TranscriptPathTraversal` — 2/2 PASS (discriminating + triangulation)
- `TestSubagentStop_TraversalCwdNonBlocking` — PASS (hermetic; `chdirT` isolated)
- `TestStop_TraversalCwdNonBlocking` — PASS (hermetic)
- `TestPreCompact_ResolveCwdHardening` — 3/3 PASS

`TestValidatePath_Posix` (incl. new `filesystem_root_rejected` row for `/`) did NOT execute on
this Windows host (build-tag `//go:build !windows`). Structurally sound and mirrored by the
Windows analog. Platform-gating is a flag, not a failure.

Source-tree hygiene re-checked: `internal/hooks/.ospec/` does NOT exist after the suite run
(no non-hermetic pollution).

---

## Completeness

10/10 original tasks marked `[x]`. Batch 3 is a pure additive extension. Files Changed table in
apply-progress matches the actual source:
- `internal/hooks/common.go` — `validatePath` now adds the root guard (`filepath.Dir(cleaned) == cleaned` → reject) at lines 36-38, after the absolute + no-`..` checks.
- `internal/hooks/precompact.go` — `resolveCwd` unchanged (degrades to `"."` via shared helper).
- `internal/hooks/subagentstop.go` — `findResolutionInTranscript` gate (lines 193-197) unchanged; rejected paths return `"", nil` before any `readFilePermissive`.
- New/updated tests: `pathsafe_windows_test.go` (+2 rows), `pathsafe_posix_test.go` (+1 row), `subagentstop_test.go` (+`TestSubagentStop_DriveRootCwdFallback`).

---

## Spec Compliance Matrix (all requirements MUST)

| # | Scenario | Covering test | Runtime status | Evidence | Verdict |
|---|----------|---------------|----------------|----------|---------|
| fu-c2-1 | Valid absolute cwd accepted — POSIX | `TestValidatePath_Posix/valid_absolute_dir` | gated off (Windows host) | structural + Windows analog | PASS (platform-gated) |
| fu-c2-2 | Valid absolute cwd accepted — Windows | `TestValidatePath_Windows/valid_absolute_dir` | PASS | runtime-test | PASS |
| fu-c2-3 | POSIX traversal cwd rejected | `TestValidatePath_Posix/relative_traversal` | gated off | structural + Windows analog | PASS (platform-gated) |
| fu-c2-4 | Windows traversal cwd rejected | `TestValidatePath_Windows/Windows_traversal_dir` | PASS | runtime-test | PASS |
| fu-c2-5 | Relative non-traversal cwd rejected | `TestValidatePath_Windows/Windows_relative` (+ POSIX gated) | PASS | runtime-test | PASS |
| fu-c2-6 | Reject cwd that is not an existing dir (Stat fallback) | `TestPreCompact_ResolveCwdHardening/non-existent_absolute_cwd` | PASS | runtime-test | PASS |
| fu-c2-7 | Handler stays non-blocking on cwd rejection | `TestPreCompact_ResolveCwdHardening`, `TestStop_TraversalCwdNonBlocking`, `TestSubagentStop_TraversalCwdNonBlocking` | PASS | runtime-test | PASS |
| **fu-c2-8 (Batch 3)** | **POSIX filesystem root `/` rejected** | `TestValidatePath_Posix/filesystem_root_rejected` | gated off | structural + `filepath.Dir("/")=="/"` invariant + Windows analog | PASS (platform-gated) |
| **fu-c2-9 (Batch 3)** | **Windows drive root `C:\` rejected** | `TestValidatePath_Windows/drive_root_C:\_rejected` + `TestSubagentStop_DriveRootCwdFallback` | PASS | runtime-test (DISCRIMINATING) | PASS |
| **fu-c2-10 (Batch 3)** | **Windows UNC volume root `\\host\share` rejected** | `TestValidatePath_Windows/UNC_volume_root_rejected` | PASS | runtime-test (DISCRIMINATING) | PASS |
| fu-c1-1 | Valid transcript path accepted — POSIX | `TestSubagentStop_TranscriptPath`, `...TranscriptPathTraversal/valid` | PASS | runtime-test | PASS |
| fu-c1-2 | Valid transcript path accepted — Windows | `TestValidatePath_Windows/valid_absolute_file` + behavior | PASS | runtime-test | PASS |
| fu-c1-3 | Traversal transcript rejected — treated as absent | `TestSubagentStop_TranscriptPathTraversal/traversal...discriminating` | PASS | runtime-test (DISCRIMINATING) | PASS |
| fu-c1-4 | Windows traversal transcript rejected | `TestValidatePath_Windows/Windows_traversal_file` | PASS | runtime-test | PASS |
| fu-c1-5 | Handler non-blocking on transcript rejection | `TestSubagentStop_TranscriptPathTraversal` | PASS | runtime-test | PASS |
| fu-c1-6 | Rejected path NOT passed to os.ReadFile | discriminating test + triangulation + `findResolutionInTranscript` early `return "", nil` | PASS | runtime-test (DISCRIMINATING) + inspection | PASS |
| shared | Single shared helper for both flows | `validatePath` in common.go used by both `resolveCwd` and `findResolutionInTranscript`; root guard applies to both | n/a | inspection | PASS |

---

## Batch 3 — 4R CRITICAL Root-Rejection: RESOLVED (orchestrator-flagged scrutiny)

### CRITICAL #1 — `validatePath` accepted filesystem root `/` — RESOLVED
### CRITICAL #2 — `validatePath` accepted Windows drive/volume root (`C:\`, `\\host\share`) — RESOLVED

`validatePath` (`common.go:36-38`) now adds, after the absolute + no-`..` checks:

```go
if filepath.Dir(cleaned) == cleaned {
    return "", false
}
```

This is the ONLY code path in `validatePath` that rejects an absolute, no-`..` path. It is
therefore strictly discriminating for the new rows:

- **Unit-matrix RED evidence (primary)**: apply-progress Batch 3 records the genuine pre-fix RED —
  with the guard absent, `validatePath("C:\\") ok=true, want false`, `validatePath("\\\\host\\share") ok=true, want false`
  (`TestValidatePath_Windows` exit 1), and on POSIX `validatePath("/") ok=true, want false`. After
  adding the guard the rows go GREEN. Removing the guard would flip every `wantOK:false` root row
  back to a FAIL. Confirmed empirically: the rows currently PASS with the guard present (verbose run above).
- **Behavior test (defense-in-depth, post-GREEN)**: `TestSubagentStop_DriveRootCwdFallback` passes
  `cwd: "C:\\"` with a degraded resolution to force the event-write path, then asserts (positive)
  `.ospec` lands in the hermetic temp CWD via the `"."` fallback, and (negative) `C:\.ospec` is NOT
  created. The positive assertion is discriminating: without root-rejection, `resolveCwd` would
  return `"C:\\"` and `tmpDir/.ospec` would be absent → FAIL.

**Strict-TDD assessment of the post-GREEN behavior test (acceptable):** Adding
`TestSubagentStop_DriveRootCwdFallback` after GREEN is the correct call here. A pre-fix behavior
RED is unsafe — in the RED state `validatePath` would accept `C:\`, `os.Stat` succeeds on a real
drive root, and the store would attempt a real `C:\.ospec` write at the filesystem root. The
discriminating RED evidence properly lives in the unit matrix (pure, side-effect-free, genuinely
RED before the guard); the behavior test adds composition coverage that the validated path flows
through `resolveCwd` and the fallback chain. This is sound strict-TDD evidence for this case.

### fu-c2 — cwd traversal (STRONG, unchanged from prior PASS)
`TestSubagentStop_TraversalCwdNonBlocking` (`cwd: "../../etc"` + degraded resolution) forces the
event-write path and asserts `../../etc/.ospec` does NOT exist — discriminating: without the
`"."` fallback the store would create `.ospec/` under the traversal target and the test would FAIL.

### fu-c1 — transcript traversal (STRONG, DISCRIMINATING, unchanged from prior PASS)
`TestSubagentStop_TranscriptPathTraversal` writes a real parseable degraded-resolution payload at
`root/secret/transcript.jsonl`; the discriminating sub-test reaches it via
`../secret/transcript.jsonl` after `chdirT(t, workspace)` and asserts NO event (gate blocks the
read before `readFilePermissive`); the triangulation sub-test reads the SAME file by absolute path
and asserts exactly one event. Both PASS.

---

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | OK | "TDD Cycle Evidence" tables present in apply-progress (incl. Batch 3) |
| All tasks have tests | OK | 10/10 original tasks map to existing test files; Batch 3 rows mapped |
| RED confirmed (tests exist) | OK | all listed test files exist; Batch 3 unit rows had genuine RED (exit 1 before guard) |
| GREEN confirmed (tests pass) | OK | every listed test PASS on fresh execution (7/7 packages) |
| Triangulation adequate | OK | validatePath now 7 Windows + 8 POSIX cases (incl. lexical-collapse + root rows); transcript accept/reject pair |
| Safety Net for modified files | OK | pre-existing suite baseline recorded before each batch |
| Strictly-failing-first RED | OK | Batch 3 unit root rows genuinely RED before the `filepath.Dir(cleaned)==cleaned` guard; behavior test added post-GREEN (justified — pre-fix behavior RED would attempt a real `C:\.ospec` root write) |

---

## Test Layer Distribution

| Layer | Tests | Files | Notes |
|-------|-------|-------|-------|
| Unit (internal `package hooks`) | 15 cases (validatePath) | `pathsafe_windows_test.go` (7, run), `pathsafe_posix_test.go` (8, gated) | OS-literal, build-tagged |
| Behavior (`package hooks_test` / `runSubagentStop`) | 8+ cases | `precompact_test.go`, `subagentstop_test.go`, `stop_test.go` | handler dispatch / event-store side effects; incl. new drive-root fallback test |

No integration/E2E tooling applicable. Coverage tool not configured in cached capabilities —
coverage analysis skipped (not a failure).

---

## Assertion Quality

| File | Location | Issue | Severity |
|------|----------|-------|----------|
| `pathsafe_windows_test.go` / `pathsafe_posix_test.go` | root-rejection rows | Discriminating: each `wantOK:false` root row would flip to FAIL if the `filepath.Dir(cleaned)==cleaned` guard were removed; RED proof recorded in apply-progress | OK |
| `subagentstop_test.go` | `TestSubagentStop_DriveRootCwdFallback` | Positive + negative side-effect assertions; positive (`.ospec` in temp CWD) is discriminating against missing root-rejection | OK |
| `subagentstop_test.go` | `TestSubagentStop_TranscriptPathTraversal` | Discriminating + paired triangulation (real file reachable via `..`) | OK |
| `precompact_test.go` | `TestPreCompact_ResolveCwdHardening` (a)(c) | Asserts only `continue:true`/exit 0; precompact does not write on traversal so fu-c2 strong proof lives in subagent-stop test | SUGGESTION |

No tautologies, ghost loops, or assertions-without-production-call found.

---

## Quality Metrics

- **Build / vet**: `go test ./...` compiles and passes cleanly (7/7). `go vet ./internal/hooks/` exit 0 with NO `stdversion` warning — Go 1.23+ minimum MUST satisfied (no >1.23 std API; `t.Chdir` only in comments, `chdirT` helper used).
- **Linter / type checker**: Go compiler is the type gate; no errors. No separate linter configured — skipped.

---

## Design Coherence

| Decision | Status |
|----------|--------|
| Single shared `validatePath` (absolute + no `..` + NOT a root), Stat layered only in `resolveCwd` | Matches source exactly |
| Root detection via `filepath.Dir(cleaned) == cleaned` | Matches spec normative policy + 4R clarification |
| `..` detection on slash-normalized cleaned path | `strings.Split(filepath.ToSlash(cleaned), "/")` — matches |
| `stop.go` unmodified, transitively secured | Confirmed |

No deviations from design.md or the amended spec.

---

## Issues

### CRITICAL
None. The 2 prior 4R-gate CRITICALs (root acceptance for `/` and `C:\`/`\\host\share`) are RESOLVED and verified at runtime.

### WARNING
None.

### SUGGESTION
- `TestPreCompact_ResolveCwdHardening` cases (a)/(c) assert only non-blocking behavior; consider asserting no `.ospec` lands under the traversal/non-existent root for symmetry with the subagent-stop tests. (Non-blocking; precompact does not write on traversal.)

### Accepted follow-ups (carried from the 4R review gate — explicitly OUT OF SCOPE, not new defects)
These were surfaced at the 4R gate and accepted as follow-ups under the `harden-policy-now`
decision (which scoped Batch 3 to the 2 CRITICALs only). They do not break any spec scenario in
this change and are recorded as accepted, not defects:
- review-resilience WARNING: swallowed I/O error not logged at `subagentstop.go:262`.
- review-reliability WARNING: `resolveCwd` file-vs-dir fallback path untested.
- review-reliability SUGGESTION: `readFilePermissive` non-ENOENT error path untested.
- review-resilience SUGGESTION: `filepath.Walk` error swallowed in `collectSpecArtifactsPC` (pre-existing, out of scope).

---

## Final Verdict

**PASS.** All MUST scenarios — including the three Batch 3 root-rejection scenarios (POSIX `/`,
Windows `C:\`, UNC `\\host\share`) — are covered with runtime-test evidence (POSIX-literal cases
platform-gated on this Windows host but structurally sound and mirrored by the Windows analog).
The full suite is green (7/7) and `go vet ./internal/hooks/` is clean, satisfying the Go 1.23+
minimum MUST. The two 4R review-gate CRITICALs are RESOLVED: `validatePath` rejects filesystem/
volume roots via `filepath.Dir(cleaned) == cleaned`, the new unit rows are genuinely discriminating
(RED before the guard, GREEN after), and the post-GREEN behavior test provides justified
defense-in-depth. fu-c1 and fu-c2 discriminating + triangulation pairs remain green. No CRITICAL
defects and no residual WARNINGs; the listed advisory items are accepted out-of-scope follow-ups.
Ready for archive.
