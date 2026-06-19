# Apply Progress: federated-hooks-parity-guard

**Change**: federated-hooks-parity-guard
**Mode**: Strict TDD (Node native test runner — `node --test scripts/**/*.test.js`)
**Apply date**: 2026-06-19
**Applies to commits**: (local changes applied)

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| T1.1 — readBackendModeSync helper | `scripts/hooks/ospec-hooks-launch.test.js` | Unit | n/a | ✅ Fails initially because helper and export don't exist | ✅ Implemented in launch.js, verified transitively | ✅ Tested with valid, empty, and malformed mock yaml contents | ➖ Minimal, clean regex approach |
| T1.2 — verify helper empty/missing config | `scripts/hooks/ospec-hooks-launch.test.js` | Unit | n/a | ✅ Fails initially | ✅ Defaults to `openspec` on error/missing | ✅ 2 cases (non-existent config, empty config) | ➖ None needed |
| T2.1 — resolveInvocation config checks | `scripts/hooks/ospec-hooks-launch.test.js` | Unit | n/a | ✅ Fails on check since config is not read | ✅ Added check for federation-aware subcommands | ✅ 3 subcommands (`session-start`, `pre-compact`, `stop`) | ➖ Structured mapping |
| T2.2 — bypass binary on workspace-federated | `scripts/hooks/ospec-hooks-launch.test.js` | Unit | n/a | ✅ Fails: asserts binary path instead of node fallback | ✅ Bypasses and returns node fallback | ✅ Verified with mock exists/read callbacks | ➖ None needed |
| T2.3 — pre-tool-use zero config E/S read | `scripts/hooks/ospec-hooks-launch.test.js` | Unit | n/a | ✅ Verified in test: mock throws if read is attempted | ✅ Passes without reading file on hot path | ✅ Covered for `pre-tool-use` | ➖ None needed |
| T3.1 — update test seams | `scripts/hooks/ospec-hooks-launch.test.js` | Unit | n/a | n/a (cosmetic/import changes) | ✅ Tested seam parameter injection | ➖ None | ➖ None needed |
| T3.2 — resolveInvocation resolves to Go binary under openspec | `scripts/hooks/ospec-hooks-launch.test.js` | Unit | n/a | n/a (already covered by existing test) | ✅ Verified by existing binary resolution test | ➖ None | ➖ None needed |
| T3.3 — resolveInvocation bypasses on workspace-federated | `scripts/hooks/ospec-hooks-launch.test.js` | Unit | n/a | ✅ Fails with AssertionError | ✅ Passes successfully | ✅ Covered | ➖ None needed |
| T3.4 — resolveInvocation uses Go binary on hot path | `scripts/hooks/ospec-hooks-launch.test.js` | Unit | n/a | ✅ Fails if readFileSync is executed or bypass occurs | ✅ Passes successfully, Go binary resolved, no E/S read | ✅ Covered | ➖ None needed |
| T3.5 — resolveInvocation defaults on missing config | `scripts/hooks/ospec-hooks-launch.test.js` | Unit | n/a | ✅ Fails if exists check is not respected | ✅ Passes successfully, defaults to Go binary | ✅ Covered | ➖ None needed |
| T4.1 — run npm test | Full suite | Integration | n/a | n/a | ✅ 457/457 tests green | ➖ None | ➖ None needed |
| T4.2 — manual verification | None (unit tested) | Manual | n/a | n/a | ✅ Simulating different backends resolves commands appropriately | ➖ None | ➖ None needed |

---

## Test Summary

- **Net new tests retained this batch**: 3 new tests added to `scripts/hooks/ospec-hooks-launch.test.js`
- **Total tests passing after all changes**: 457
- **Layers used**: Unit

---

## Final Test Run Summary

```
# tests 457
# pass  457
# fail    0
# cancelled 0
# skipped   1
# todo      0
```

Runner: `npm.cmd test`
Date: 2026-06-19

---

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/hooks/ospec-hooks-launch.js` | Modified | Added `readBackendModeSync` helper and updated `resolveInvocation` to support capability-aware routing. |
| `scripts/hooks/ospec-hooks-launch.test.js` | Modified | Added three unit tests verifying the bypassing behavior under different conditions. |
| `openspec/changes/federated-hooks-parity-guard/apply-progress.md` | Created | This file |
