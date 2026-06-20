# Apply Progress: Capability Registry & Stack Skills

This document tracks implementation progress and provides verification evidence for the `capability-stack-skills` change.

## Implementation Summary

All tasks from `tasks.md` have been implemented and verified locally. The full test suite runs successfully with zero errors.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1–1.4 | `scripts/lib/capability-registry.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 5 cases | ✅ Clean |
| 1.5 | `scripts/lib/skill-registry.test.js` | Unit | ✅ 1/1 | ✅ Written | ✅ Passed | ✅ 5 cases | ✅ Clean |
| 1.6–1.7 | `scripts/lib/skill-registry.test.js` | Unit | ✅ 1/1 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 1.8–1.10 | `scripts/hooks/session-start.test.js` | Unit | ✅ 8/8 | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean |

### Test Summary
- **Total tests written**: 17
- **Total tests passing**: 581 (all checks passed)
- **Layers used**: Unit (17)
- **Approval tests** (refactoring): None — no refactoring tasks
- **Pure functions created**: 3 (`parseCapabilities`, `capabilityNames`, `matchStackSkills` under `capability-registry.js`)

## Phase 6: Expand Stack Skills and Sync with ECC

Phase 6 tasks have been successfully completed:
1. **C#/.NET guidelines updated**: Synced `skills/stack-dotnet/SKILL.md` with idiomatic ECC rules (immutability, explicit mod/nullability, interface-based DI boundaries, and proper async/await cancellation token handling) merged with adaptive project-flavor detection rules (MVC Controllers, Minimal APIs, Clean Architecture layered separation).
2. **Angular guidelines updated**: Synced `skills/stack-angular/SKILL.md` with ECC rules (version checks, Angular CLI defaults, `ng build` validation, explicit versioning for `ng new`) merged with existing standalone components, typed reactive forms, RxJS unsubscribe patterns, and signals reactivity rules.
3. **Java guidelines created**: Created `skills/stack-java/SKILL.md` supporting Quarkus (CDI, Panache, JAX-RS Resource naming) and Spring Boot (Controller naming, constructor-based DI) guidelines, record-based immutability, stream best practices, and `Optional` query results.
4. **Kafka guidelines created**: Created `skills/stack-kafka/SKILL.md` covering producer idempotence (`enable.idempotence=true`), manual offset commits (`enable.auto.commit=false`), retry/DLQ patterns, Schema Registry contract verification, and partition keys for ordering.
5. **SQL Server guidelines created**: Created `skills/stack-sqlserver/SKILL.md` detailing monotonically increasing clustered keys, index covering via `INCLUDE`, Read Committed Snapshot Isolation (RCSI), avoiding cursors (set-based operations), SARGable query design, and narrow transaction scopes.
6. **Tests updated**: Updated discovery and session-start integration tests in `scripts/lib/skill-registry.test.js` and `scripts/hooks/session-start.test.js` to ensure the registry and cache generation functions are fully aware of and successfully parse `java`, `kafka`, and `sqlserver` stack skills.
7. **Configurations regenerated**: Successfully ran the builds for all targets (`build:claude`, `build:copilot`, `build:vscode`, `build:opencode`), compiling and packaging the new stack skills into their respective distribution manifests and profiles.
8. **Final test run**: Executed `npm test` successfully to confirm 100% green status across all tests and target configurations.
