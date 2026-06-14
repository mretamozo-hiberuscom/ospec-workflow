# Archive Report: harness-go-migration

## Change Archived

**Change**: harness-go-migration
**Archived to**: `openspec/changes/archive/2026-06-14-harness-go-migration/`

### Specs Synced
| Domain | Action | Details |
|--------|--------|---------|
| hooks-runtime | Created | New full specification for the Go binary hooks runtime, cross-compilation matrix, and opencode SpawnSync contract. |

### Archive Contents
- proposal.md ✅
- specs/ ✅
  - hooks-runtime/spec.md
- design.md ✅
- tasks.md ✅ (51/51 tasks complete)
- apply-progress.md ✅
- verify-report.md ✅

### Source of Truth Updated
The following specs now reflect the new behavior:
- `openspec/specs/hooks-runtime/spec.md`

### Accepted Warnings / Follow-ups
- **fu-c1-transcript-path-validation** (Hardening): subagent-stop transcript_path read traversal validation.
- **fu-c2-cwd-path-validation** (Hardening): precompact/stop/subagentstop cwd path traversal validation.
- **fu-w1-store-nesting** (Cleanup): store.go ReadBaselineState nesting depth.
- **fu-w2-yamllite-nesting** (Cleanup): yamllite.go extractScalarAtPath nesting depth.
- **W1** (Testing Gap): opencode plugin behavior has no e2e execution test.
- **W2** (Design Gap): workspace-federated backend not migrated to Go yet (Phase 1 scope limited to single-repo).
- **W3** (Code Bug/Parity): subagent-stop cycle detection divergence (behaves correctly for JSON).

### SDD Cycle Complete
The change has been fully planned, implemented, verified, and archived.
Ready for the next change.
