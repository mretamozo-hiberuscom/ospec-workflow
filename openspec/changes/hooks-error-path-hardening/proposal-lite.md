# Proposal Lite: Hooks Error-Path Hardening

## Change Class

small

## Intent

Close 4 advisory reliability/resilience items accepted (not implemented) during the 4R review gate of `hooks-path-traversal-hardening`. Real disk I/O errors are silently dropped on two error paths in the Go `ospec-hooks` runtime, and two error branches lack test coverage. No new user-visible behavior — observability + test robustness only. The non-blocking hook contract (`{"continue":true}`, exit 0) MUST be preserved on every path.

## Boundaries

- In scope: fu-pt1 (log dropped transcript I/O error), fu-pt2 + fu-pt3 (add missing branch tests), fu-pt4 (confirm Walk-swallow policy first; minimal logging only if confirmed).
- Out of scope: changing hook exit/continue semantics, new config, broader logging framework, any path-traversal behavior change.
- fu-pt4 is OPTIONAL: confirm intended policy before touching code; drop it if it risks scope creep beyond `small`.

## Affected Areas

| Area | Impact | Notes |
|------|--------|-------|
| `internal/hooks/subagentstop.go` (~L262, `runSubagentStop`) | Modify | fu-pt1: surface non-nil err from `findResolutionInTranscript` via `systemMessage`, keep `continue:true` |
| `internal/hooks/subagentstop_test.go` | Modify | fu-pt1 + fu-pt3: cover error surfacing & `readFilePermissive` non-ENOENT/EACCES propagation |
| `internal/hooks/precompact_test.go` | Modify | fu-pt2: cover `resolveCwd` fallback-to-"." when cwd is a file |
| `internal/hooks/precompact.go` (`collectSpecArtifactsPC`) | Modify (optional) | fu-pt4: minimal `filepath.Walk` error logging IF policy confirms |

## Acceptance Checks

- [ ] `findResolutionInTranscript` non-ENOENT/EACCES error is surfaced (systemMessage), still `continue:true`, exit 0.
- [ ] New table tests cover fu-pt2 (file-not-dir cwd) and fu-pt3 (I/O error propagation); use `t.TempDir()`, OS-literal cases under `//go:build` where needed.
- [ ] fu-pt4 policy explicitly confirmed before any code change; no behavior change otherwise.
- [ ] `go test ./...` green; no Go 1.24+ std APIs introduced.

## Risks and Rollback

- Risk: Low — additive logging + tests, no contract change. Main watch: fu-pt4 scope creep (mitigated by optional/confirm-first gating).
- Rollback: pure git revert of the commit(s); no data migration, no state changes.
