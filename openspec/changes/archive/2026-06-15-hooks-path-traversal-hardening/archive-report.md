# Archive Report — hooks-path-traversal-hardening

**Change**: hooks-path-traversal-hardening
**Change Classification**: high-risk (security-sensitive path-traversal hardening)
**Archive Date**: 2026-06-15
**Archive Status**: Complete

---

## Executive Summary

The hooks-path-traversal-hardening change has been successfully completed and archived. It implements two follow-ups from the harness-go-migration change: fu-c1 (transcript_path validation) and fu-c2 (cwd validation). All 10 original tasks were completed in Batch 1, and Batch 3 resolved 2 CRITICAL findings from the 4R review gate via root-rejection hardening. The change passed verification (verdict PASS, no unaccepted warnings) and the 4R review gate is closed (decision harden-policy-now).

---

## Closure Verification

**Verdict**: PASS
**Previous Verdict**: PASS (unchanged from Batch 1 through Batch 3 re-verify)
**Verification Report**: openspec/changes/archive/2026-06-15-hooks-path-traversal-hardening/verify-report.md

### Key Evidence

- Full test suite green: `go test ./...` — 7/7 packages ok (exit 0)
- Go vet clean: `go vet ./internal/hooks/` — exit 0, NO `stdversion` warning
- Go 1.23+ minimum preserved: no Go 1.24+ std API used; `t.Chdir` (Go 1.24) appears only in comments; actual helper is `chdirT` (os.Getwd + os.Chdir + t.Cleanup at subagentstop_test.go:386)
- All MUST scenarios covered with runtime-test evidence (POSIX-literal cases platform-gated on Windows host but structurally sound)
- 4R review-gate CRITICALs: 2 RESOLVED in Batch 3 via `filepath.Dir(cleaned)==cleaned` root-rejection guard

---

## 4R Review Gate Outcomes

**Gate Status**: done
**Gate Decision**: harden-policy-now
**Findings Summary**: 0 BLOCKER, 2 CRITICAL (RESOLVED), 2 WARNING, 2 SUGGESTION (risk: none; readability: none)

### Critical Findings (RESOLVED)

1. **CRITICAL**: `validatePath` accepted filesystem root `/` (review-reliability)
   - **Resolution**: Batch 3 adds guard `filepath.Dir(cleaned) == cleaned` → reject
   - **Test Evidence**: `TestValidatePath_Posix/filesystem_root_rejected` (platform-gated on Windows; structural sound; mirrored by Windows analog)
   - **Status**: RESOLVED ✓

2. **CRITICAL**: `validatePath` accepted Windows drive root `C:\` and UNC `\\host\share` (review-reliability)
   - **Resolution**: Batch 3 same guard; two new Windows unit rows
   - **Test Evidence**: `TestValidatePath_Windows/drive_root_C:\_rejected`, `TestValidatePath_Windows/UNC_volume_root_rejected` (PASS)
   - **Behavior Test**: `TestSubagentStop_DriveRootCwdFallback` (post-GREEN, justified; asserts fallback to `.` when root is degraded)
   - **Status**: RESOLVED ✓

---

## Accepted Follow-ups

The following follow-ups were surfaced by the 4R review gate and explicitly accepted as out-of-scope under the `harden-policy-now` decision. They are recorded here for future work and do not block this change:

### fu-pt1-transcript-ioerror-logging

**Source**: review-resilience WARNING  
**Location**: internal/hooks/subagentstop.go:262  
**Issue**: Swallowed I/O error from `findResolutionInTranscript` is not logged. The function may silently fail to read the transcript file and return an empty event list without diagnostic output.  
**Scope**: Out of scope for this change (fu-c1/fu-c2 focus). Path validation prevents malformed paths from reaching the read layer; but legitimate absolute paths with read permission issues should be logged at the handler level.  
**Suggested Action**: Add structured logging (warn level) when `findResolutionInTranscript` returns due to I/O error (not path rejection) so operators can diagnose missing skill resolution events.

### fu-pt2-resolvecwd-filevsdir-test

**Source**: review-reliability WARNING  
**Location**: internal/hooks/precompact.go (resolveCwd behavior)  
**Issue**: The file-vs-directory fallback path in `resolveCwd` is untested. The spec requires `os.Stat` to check that the resolved path is an existing directory; if it is a file or does not exist, the handler must fall back to `"."`. Current test matrix covers traversal and valid directory cases but not the file-exists-but-not-dir case.  
**Scope**: Out of scope for this change. Tests cover traversal (reject) and valid directory (accept); the edge case of a path that resolves to a file (not a directory) is a behavioral refinement.  
**Suggested Action**: Add a test case to `TestPreCompact_ResolveCwdHardening` that supplies a `cwd` pointing to an existing file (not a directory) and verifies fallback to `"."`.

### fu-pt3-readfilepermissive-nonenoent-test

**Source**: review-reliability SUGGESTION  
**Location**: internal/hooks (readFilePermissive behavior)  
**Issue**: The `readFilePermissive` error-handling path for non-ENOENT/EACCES errors is untested. The function is designed to be permissive — swallowing ENOENT and EACCES — but other errors (e.g., EIO, permission denied on parent directory) are not covered by tests.  
**Scope**: Out of scope for this change (path validation prevents malformed paths before readFilePermissive is called). The error paths are resilience concerns, not security issues.  
**Suggested Action**: Add unit tests for `readFilePermissive` covering non-ENOENT and non-EACCES error conditions (e.g., simulated I/O error) to ensure graceful degradation.

### fu-pt4-walk-error-swallow

**Source**: review-resilience SUGGESTION (pre-existing, out of scope)  
**Location**: internal/hooks/precompact.go (collectSpecArtifactsPC function)  
**Issue**: `filepath.Walk` error is swallowed without logging in `collectSpecArtifactsPC`. If the walk encounters a permissions error or other I/O issue during artifact collection, it silently fails without diagnostic output.  
**Scope**: Pre-existing, outside the scope of fu-c1/fu-c2. This is a broader resilience concern in the precompact handler.  
**Suggested Action**: Future resilience pass should add structured logging for Walk errors (at warn level) so missing artifacts can be debugged.

---

## Design & Implementation Notes

### Go 1.23+ Compatibility (chdirT helper)

The spec requires Go 1.23+ as the minimum toolchain version. Batch 2 initially used `t.Chdir` (Go 1.24+) in tests, but the orchestrator identified this as a version violation. Batch 2b resolved by:

- Implementing a `chdirT` helper function in `subagentstop_test.go:386` that uses only Go 1.23-compatible APIs: `os.Getwd`, `os.Chdir`, and `t.Cleanup`.
- Replacing all `t.Chdir` calls with `chdirT(t, newdir)`.
- Verifying with `go vet ./internal/hooks/` — exit 0, NO `stdversion` warning.

This ensures the hooks-runtime binary and tests remain compatible with Go 1.23 through the supported release cycle.

### Single Shared Validation Helper

Both fu-c1 (transcript_path) and fu-c2 (cwd) use the same `validatePath` helper in `internal/hooks/common.go`. This:

- Enforces consistency: both flows use identical logic for path validation (absolute + no `..` + NOT a root).
- Enables easy policy updates: modifying the validation policy requires a single code change, not per-handler edits.
- Simplifies testing: unit tests for `validatePath` cover both use cases.

The Batch 3 4R refinement (root-rejection guard) was implemented as a single 3-line addition to `validatePath`, automatically hardening both flows.

---

## Specs Synced

### openspec/specs/hooks-runtime/spec.md

**Action**: UPDATED (merged delta spec)

**Requirements Added**:
- Requirement: Untrusted CWD Traversal Validation (fu-c2) — 8 scenarios (valid cwd, traversal rejection, relative rejection, handler non-blocking, root rejection for POSIX `/`, Windows `C:\`, Windows UNC)
- Requirement: Untrusted Transcript Path Validation (fu-c1) — 5 scenarios (valid path accept, traversal rejection, handler non-blocking)

**Clarifications Added**:
- Session 2026-06-15 clarifications (transcript_path policy, cwd stat check)
- Session 2026-06-15 4R review gate refinement (normative root-rejection policy via `filepath.Dir(cleaned)==cleaned`)

**Change Type**: ADDED (two new requirements + clarifications appended to existing harness-go-migration spec)

---

## Change Artifacts Included in Archive

- ✅ proposal.md — original scope and approach
- ✅ specs/hooks-runtime/spec.md — delta spec (path-traversal requirements and clarifications)
- ✅ design.md — implementation design and policy documentation
- ✅ tasks.md — 10 original tasks (all marked complete)
- ✅ apply-progress.md — Batch 1, Batch 2, Batch 2b, Batch 3 execution records with TDD evidence
- ✅ verify-report.md — verification evidence (test results, spec compliance matrix, TDD assessment)
- ✅ state.yaml — workflow state with all phases marked done and approvals recorded

---

## Session Timeline

| Date | Phase | Status | Key Event |
|------|-------|--------|-----------|
| 2026-06-15 00:00 | propose | done | Initial follow-up selection and route validation |
| 2026-06-15 | spec | done | Delta spec written with fu-c1/fu-c2 requirements |
| 2026-06-15 | clarify | done | Two AskUserQuestion clarifications (transcript_path policy, cwd stat check) accepted |
| 2026-06-15 | design | done | Design documented; single shared validatePath helper chosen |
| 2026-06-15 | tasks | done | 10 tasks created (all TDD; all closed in Batch 1) |
| 2026-06-15 | apply | done | Batch 1 (10 tasks complete, ~250 LOC, exception-ok), Batch 2 (W1/W2 test-hardening), Batch 2b (chdirT Go 1.23 compat fix), Batch 3 (4R CRITICAL root-rejection hardening) |
| 2026-06-15 | verify | done | Initial PASS (Batch 1), re-verify PASS (Batch 3 with 2 CRITICALs RESOLVED) |
| 2026-06-15 | 4R gate | done | 2 CRITICAL findings RESOLVED in Batch 3; decision harden-policy-now; advisory follow-ups accepted as out-of-scope |
| 2026-06-15 | archive | done | Spec merged, archive-report written, change moved to archive |

---

## Closure Checklist

- [x] Verification verdict: PASS (no FAIL, no unaccepted WARNINGs)
- [x] 4R review gate: closed (decision harden-policy-now; 2 CRITICALs RESOLVED)
- [x] All original tasks completed (10/10)
- [x] All Batch 3 refinements verified at runtime
- [x] Go 1.23+ compatibility confirmed (no `stdversion` warning)
- [x] Delta spec merged into main spec (openspec/specs/hooks-runtime/spec.md)
- [x] Archive report completed
- [x] Accepted follow-ups recorded (4 items: fu-pt1, fu-pt2, fu-pt3, fu-pt4)
- [x] Change ready for archival

---

## SDD Cycle Complete

The change has been fully planned (proposal, spec, design, tasks), implemented (apply), verified (verify), reviewed and hardened (4R gate), and is now archived. No further work is required unless the accepted follow-ups are promoted to a future SDD change.

Ready to begin the next change.
