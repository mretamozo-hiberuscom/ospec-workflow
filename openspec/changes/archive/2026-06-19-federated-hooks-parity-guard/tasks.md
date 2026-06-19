# Tasks: federated-hooks-parity-guard

**Delivery**: Single PR, exception-ok
**Estimated changed lines**: ~60-100

---

## Phase 1 — Launcher configuration reader

- [x] **T1.1** Edit `scripts/hooks/ospec-hooks-launch.js`: Add helper function `readBackendModeSync(configPath, readFileSync)` to extract backend mode synchronously using a line-by-line regex parse.
- [x] **T1.2** Verify helper function behaves correctly when `config.yaml` has no backend defined or does not exist.

## Phase 2 — Capability-aware routing in launcher

- [x] **T2.1** Edit `scripts/hooks/ospec-hooks-launch.js`: Update `resolveInvocation(sub, scriptDir, suffix, exists, readFileSync)` to check the backend mode for subcommands: `session-start`, `pre-compact`, and `stop`.
- [x] **T2.2** In `resolveInvocation`, if the subcommand is one of the three above and the backend is `workspace-federated`, bypass the native Go binary and resolve to the Node.js fallback script.
- [x] **T2.3** Ensure `pre-tool-use` and `subagent-stop` subcommands do NOT trigger `readBackendModeSync` or filesystem read operations, preserving absolute zero overhead on the hot path.

## Phase 3 — Launcher tests

- [x] **T3.1** Edit `scripts/hooks/ospec-hooks-launch.test.js`: Update imports/destructuring to include any necessary test seams (e.g. custom `readFileSync` injection).
- [x] **T3.2** Add test: `resolveInvocation` resolves to Go binary when backend is `openspec` and binary is present.
- [x] **T3.3** Add test: `resolveInvocation` resolves to Node fallback for `session-start` when backend is `workspace-federated` and binary is present.
- [x] **T3.4** Add test: `resolveInvocation` resolves to Go binary for `pre-tool-use` when backend is `workspace-federated` and binary is present (ensures no desvío/bypass on hot path).
- [x] **T3.5** Add test: `resolveInvocation` handles missing config file gracefully, defaulting to `openspec` (using Go binary).

## Phase 4 — Verification

- [x] **T4.1** Run `npm test` to verify all tests in the codebase (including new launcher tests) pass.
- [x] **T4.2** Perform manual verification by simulating a `workspace-federated` configuration and asserting launcher behavior.

---

## Review Workload Forecast

| Metric | Value |
|--------|-------|
| Estimated changed lines | ~60-100 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Decision needed before apply | No |

## Dependencies
None.
