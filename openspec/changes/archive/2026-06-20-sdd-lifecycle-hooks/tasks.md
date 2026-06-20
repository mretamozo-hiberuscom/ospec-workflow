# Tasks: SDD Lifecycle Hooks

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `hooks:` block absent → no-op | MUST | `lifecycle-hooks.js::parseHooksBlock` returns `{}` | covered-by-design | Unit-testable |
| `hooks:` block well-formed → parsed and cached | MUST | `lifecycle-hooks.js::parseHooksBlock` | covered-by-design | Unit-testable |
| Unknown event key → silently ignored | MUST | `parseHooksBlock` filters by `KNOWN_EVENTS` | covered-by-design | Unit-testable |
| Action object fields parsed correctly per `type` | MUST | `parseHooksBlock` + `validateHooksBlock` | covered-by-design | Unit-testable |
| 7 lifecycle events recognized and fired at phase boundaries | MUST | `KNOWN_EVENTS` constant + orchestrator dispatch section | covered-by-design | Agent-instruction-only for dispatch |
| `before-implementation` fires before `sdd-apply` dispatch | MUST | Orchestrator dispatch section | covered-by-design | Agent-instruction-only |
| `before-task` fires once per task (realized as per apply invocation) | MUST | Decision 2: per-apply-invocation; `occurrences[]` indexed audit | covered-by-design | Reconciliation note for `sdd-archive` |
| `before-commit` fires at apply→verify transition | MUST | Decision 1: fires after last apply batch, before verify | covered-by-design | Agent-instruction-only |
| Absent-phase event → skipped, recorded in audit | MUST | `eventAppliesToRoute()` + orchestrator audit write | covered-by-design | `eventAppliesToRoute` unit-testable |
| Declaration order preserved across actions in an event | MUST | `planExecution()` orders by index 0 first | covered-by-design | Unit-testable |
| `halt` failure stops remaining actions in that event list | MUST | `planExecution()` halt-stop boundary marks remaining as skipped | covered-by-design | Unit-testable |
| `advisory` failure → record in audit, continue, cross boundary | MUST | `computeEventStatus()` + orchestrator crossing | covered-by-design | `computeEventStatus` unit-testable |
| `halt` failure → block boundary, surface to user | MUST | Decision 4: `vscode/askQuestions` Retry/Override/Abort gate | covered-by-design | Agent-instruction-only |
| `run-command` issues via granted execute tool, PreToolUse evaluates | MUST | Decision 3: existing tool grant, no bypass | covered-by-design | Agent-instruction-only |
| `lifecycle_hooks:` audit block written after each event | MUST | `buildAuditEntry()` shapes; orchestrator writes to `state.yaml` incrementally | covered-by-design | Shape unit-testable; write is agent-instruction-only |
| Skipped event recorded as `status: skipped`, `actions: []` | MUST | `buildAuditEntry` skipped shape + orchestrator write | covered-by-design | Unit-testable shape |
| `before-task` audit uses `occurrences[]` indexed array | MUST | `buildAuditEntry` occurrences branch | covered-by-design | Unit-testable |
| `load-skill` content injected into `## Hook-Injected Skills and Rules` block | MUST (when action fires) | Orchestrator dispatch section + agents spec | covered-by-design | Agent-instruction-only |
| Injection block appended after `## Project Standards (auto-resolved)` | MUST | Orchestrator composition rule | covered-by-design | Agent-instruction-only |
| Multiple `load-skill`/`load-rules` actions merged into single block, declaration order | MUST | Orchestrator composition rule | covered-by-design | Agent-instruction-only |
| `skill_resolution` field in sub-agent envelope unaffected by hook injection | MUST | Agents spec + orchestrator instruction | covered-by-design | Agent-instruction-only |
| Audit block written incrementally (not deferred to route end) | MUST | Orchestrator writes immediately after each event | covered-by-design | Agent-instruction-only |
| No `hooks:` block → route execution identical to pre-hooks baseline | MUST | `parseHooksBlock` returns `{}`; orchestrator skips dispatch | covered-by-design | |

### Reconciliation Verdict

- MUST coverage: **complete** — all 23 MUST scenarios have clear design allocation.
- SHOULD/MAY gaps: none. The `docs/sdd-lifecycle-hooks.md` concept doc is a MAY per design open question; included as optional task in Phase 4.
- Ambiguities to track: `before-task` literal "once per task line" vs. "once per apply invocation" (Design Decision 2) — flagged for `sdd-archive` when merging the delta spec. Does not block implementation.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1 000–1 100 additions (minimal deletions) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: pure helper + tests (~490 lines); PR 2: orchestrator MD + docs + config + dist regeneration (~570 lines, generated code dominates) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

> Delivery strategy is `single-pr`. A `size:exception` approval or explicit chain strategy selection is required before `sdd-apply` starts. Breakdown by source: `lifecycle-hooks.js` ~190 lines, `lifecycle-hooks.test.js` ~300 lines, `sdd-orchestrator.agent.md` delta ~100 lines, `openspec-convention.md` delta ~45 lines, `config.yaml` example ~18 lines, 4 dist targets × ~100 lines generated = ~400 lines. Generated dist artifacts are the largest contributor and are a natural `size:exception` candidate for PR 2.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Pure helper `lifecycle-hooks.js` + `lifecycle-hooks.test.js` (full RED → GREEN cycle) | PR 1 | Self-contained; `npm test` passes; no orchestrator changes yet |
| 2 | Orchestrator MD + `openspec-convention.md` + `config.yaml` example + optional `docs/sdd-lifecycle-hooks.md` + all 4 dist regenerations | PR 2 | Depends on PR 1 being merged; generated code dominates; `size:exception` candidate for PR 2 |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: RED — Write Failing Tests for Pure Helper

- [x] 1.1 Create `scripts/lib/lifecycle-hooks.test.js` with `require("node:assert/strict")` and `require("node:test")` boilerplate; import all named exports from `./lifecycle-hooks.js` (file does not exist yet — require will throw, making every test fail at load time; acceptable RED signal).
- [x] 1.2 Add failing test group for `parseHooksBlock`: (a) absent/`null` content → returns `{}`; (b) valid YAML-like object with two known event keys → returns parsed map; (c) object containing an unknown event key → that key absent from result; (d) action object fields (`type`, `skill`, `on_failure`, `rules`, `command`) are preserved on parsed actions.
- [x] 1.3 Add failing test group for `validateHooksBlock`: (a) action missing `type` → errors array contains message; (b) `load-skill` missing `skill` field → error; (c) `load-rules` missing `rules` field → error; (d) `run-command` missing `command` field → error; (e) invalid `on_failure` value → error; (f) well-formed block → `{valid: true, errors: []}`.
- [x] 1.4 Add failing test group for `eventAppliesToRoute`: (a) event present in `routePhases` → `true`; (b) `before-verify` when route is `["sdd-apply"]` → `false`; (c) `before-implementation` when `sdd-apply` is in phases → `true`.
- [x] 1.5 Add failing test group for `planExecution`: (a) three actions A/B/C → returned order is A, B, C; (b) B has `on_failure: halt` and is marked failed → C entry has `outcome: skipped`; (c) advisory failure on B → C is not skipped.
- [x] 1.6 Add failing test group for `computeEventStatus`: (a) all actions `success` → `done`; (b) one `halt` action `failed` → `failed`; (c) one `advisory` action `failed`, rest `success` → `done`; (d) all `skipped` → `skipped`.
- [x] 1.7 Add failing test group for `buildAuditEntry` single-fire events: (a) `before-change` with one `success` action → shape matches `{status: "done", actions: [{outcome: "success", policy: "advisory"}]}`; (b) skipped event → `{status: "skipped", actions: []}`.
- [x] 1.8 Add failing test group for `buildAuditEntry` `before-task` (`occurrences[]`): (a) first invocation `index:0, batch:1` → `occurrences[0]` present; (b) second invocation `index:1, batch:2` appended → `occurrences` has two entries; (c) top-level `status` reflects worst outcome across occurrences.
- [x] 1.9 Run `node --test scripts/lib/lifecycle-hooks.test.js`; confirm all tests fail with `MODULE_NOT_FOUND` or `TypeError` (RED confirmed — do NOT proceed to Phase 2 until RED is verified).

---

## Phase 2: GREEN — Implement Pure Helper

- [x] 2.1 Create `scripts/lib/lifecycle-hooks.js` with `"use strict";` header and comment block naming the module-purity contract (mirrors `route-dispatcher.js` style: zero I/O, no `fs`, no `require` of runtime deps beyond `module.exports`).
- [x] 2.2 Define constants: `KNOWN_EVENTS` (array of 7 event names from spec taxonomy), `KNOWN_ACTION_TYPES` (`["load-skill", "load-rules", "run-command"]`), `KNOWN_POLICIES` (`["advisory", "halt"]`); export all three.
- [x] 2.3 Implement `parseHooksBlock(rawHooks)`: accept the already-parsed `hooks:` value (object or `null`/`undefined`); return `{}` when absent; iterate keys and include only those present in `KNOWN_EVENTS`; preserve each event's action list as-is (no type coercion).
- [x] 2.4 Implement `validateHooksBlock(hooks)` → `{valid, errors}`: iterate all event/action entries; for each action check `type` is in `KNOWN_ACTION_TYPES`, `on_failure` (when present) is in `KNOWN_POLICIES`, and the type-specific required field is present (`skill` for `load-skill`, `rules` for `load-rules`, `command` for `run-command`); accumulate error strings; return `{valid: errors.length === 0, errors}`.
- [x] 2.5 Implement `eventAppliesToRoute(event, routePhases)` → `boolean`: use the mapping `{before-change: always-true, before-implementation: "sdd-apply", before-task: "sdd-apply", before-commit: "sdd-apply", before-verify: "sdd-verify", after-verify: "sdd-verify", after-archive: "sdd-archive"}` (events not tied to a specific phase return `true`; others return `routePhases.includes(mappedPhase)`).
- [x] 2.6 Implement `planExecution(actions)`: return a copy of `actions` in original order; after the first action where `on_failure === "halt"` is encountered during execution (caller marks it failed), caller must skip remaining — the helper's job is to return the ordered list and provide a `computeHaltIndex(results)` utility (or encode halt-stop logic inside `planExecution` by annotating each action with its declared policy for the caller's reference).
- [x] 2.7 Implement `computeEventStatus(actionOutcomes)` → `"done" | "failed" | "skipped"`: if any outcome is `"failed"` with `policy: "halt"` → `"failed"`; if all are `"skipped"` → `"skipped"`; otherwise → `"done"`.
- [x] 2.8 Implement `buildAuditEntry(event, results, opts)`: for non-`before-task` events return `{status, actions: [{type, outcome, policy, ...fields}]}` where `status` is from `computeEventStatus`; for `before-task` return `{status, occurrences: [{index, batch, status, actions}]}` merging any existing `occurrences` passed via `opts.existing` (append-not-overwrite continuity rule).
- [x] 2.9 Export all public symbols: `KNOWN_EVENTS`, `KNOWN_ACTION_TYPES`, `KNOWN_POLICIES`, `parseHooksBlock`, `validateHooksBlock`, `eventAppliesToRoute`, `planExecution`, `computeEventStatus`, `buildAuditEntry`.
- [x] 2.10 Run `node --test scripts/lib/lifecycle-hooks.test.js`; confirm all tests pass (GREEN). Fix any failing test by adjusting the implementation, not the test assertions.

---

## Phase 3: Orchestrator Agent Dispatch Instructions

- [x] 3.1 Open `agents/sdd-orchestrator.agent.md`; add a new top-level section `## Lifecycle Hook Dispatch` (place it after the existing route-execution / phase-dispatch section). Document: (a) read and cache the `hooks:` block from `openspec/config.yaml` once at the start of route execution (absent = no-op; `{}` cached); (b) the 7-event taxonomy and which phase boundary each maps to; (c) Decision 1 clarification: `before-commit` fires after the last `sdd-apply` batch returns `done`, before `before-verify`/`sdd-verify` dispatch (or at the apply→verify transition when no explicit commit step exists); (d) Decision 2 clarification: `before-task` fires once per `sdd-apply` dispatch (per orchestrator invocation), not per task line in `tasks.md`; repeat firings appended to `occurrences[]`.
- [x] 3.2 In the same section add a sub-section `### Action Execution`. Document: (a) run actions in declaration order; (b) `load-skill` → read the file at `skill:` path relative to repo root and accumulate content; (c) `load-rules` → accumulate `rules:` text verbatim; (d) after all `load-skill`/`load-rules` actions complete for a boundary, if any content was accumulated, append a `## Hook-Injected Skills and Rules` block to the next sub-agent's launch prompt *after* any existing `## Project Standards (auto-resolved)` block; (e) `run-command` → issue the `command` string via the orchestrator's already-granted execute tool (`execute`/`Bash`); it flows through PreToolUse DENY/ASK evaluation and MUST NOT use a bypass channel; if the tool is absent from the grant, treat as `outcome: failed` and apply `on_failure` policy.
- [x] 3.3 In the same section add a sub-section `### Failure Policy`. Document: (a) `advisory` failure → record `outcome: failed, policy: advisory` in `lifecycle_hooks:` and continue to next action and cross the boundary; (b) `halt` failure → record `outcome: failed, policy: halt`, mark remaining actions `outcome: skipped`, write `lifecycle_hooks.{event}.status: failed` and the blocking reason to `state.yaml`, then call `vscode/askQuestions` with the exact 3-option shape from Decision 4 (Retry / Override and continue / Abort); Retry re-issues the action; Override records an `approvals` ledger entry and crosses the boundary; Abort leaves `status: blocked`; the boundary phase MUST NOT be dispatched until the answer resolves.
- [x] 3.4 In the same section add a sub-section `### Audit Persistence`. Document: (a) write/merge `lifecycle_hooks.{event}` into `state.yaml` immediately after that event's actions complete — do NOT defer to route end; (b) use the `buildAuditEntry` shape (see `scripts/lib/lifecycle-hooks.js`) for field names and values; (c) when `eventAppliesToRoute` returns false, write `{status: skipped, actions: []}` immediately when the route is resolved (at route start); (d) `before-task` entries append to `occurrences[]` using append-not-overwrite (read existing `occurrences` before writing).

---

## Phase 4: Documentation Updates

- [x] 4.1 Modify `skills/_shared/openspec-convention.md`: after the `gates:` block documentation (or in the `state.yaml` structure section), add a `lifecycle_hooks:` block description covering the full YAML shape (`status` values, `actions[]` fields, `occurrences[]` for `before-task`, `message` field on failed actions); add the `hooks:` block schema to the `openspec/config.yaml` description (event keys from taxonomy, action object fields, `on_failure` default `advisory`); include a minimal annotated example.
- [x] 4.2 Modify `openspec/config.yaml`: append a fully commented `hooks:` example block below the existing `routing:` section; every line MUST be commented out (`#`) so the block is documentation-only and does not activate hooks; include at least one example of each action type (`load-skill`, `load-rules`, `run-command`) with `on_failure` shown.
- [x] 4.3 (OPTIONAL — implemented, low cost) Create `docs/sdd-lifecycle-hooks.md`: concept doc distinguishing the three hook kinds (lifecycle hooks, harness hooks `hooks-runtime`, passive rules `rules.{phase}`); document the 7-event taxonomy, action types, failure policy, and the `## Hook-Injected Skills and Rules` prompt block; mirrors the structure of `docs/sdd-routing.md`.

---

## Phase 5: Dist Regeneration and Full Test Suite

- [x] 5.1 Run `npm run build:claude` to regenerate `dist/claude-marketplace/**` from the modified `agents/sdd-orchestrator.agent.md` and `skills/_shared/openspec-convention.md`; do NOT hand-edit any file under `dist/`.
- [x] 5.2 Run `npm run build:copilot` to regenerate `dist/github-copilot/**`.
- [x] 5.3 Run `npm run build:vscode` to regenerate `dist/vscode/**`.
- [x] 5.4 Run `npm run build:opencode` to regenerate `dist/opencode/**`.
- [x] 5.5 Run `npm test` (invokes `node scripts/check.js` which runs all `scripts/**/*.test.js`); confirm all tests pass including: `lifecycle-hooks.test.js` (pure helper), `manifest-sync.test.js` (plugin manifest parity), `validate-github-copilot.test.js`, `validate-opencode.test.js` (generated-target structural validation), and the full existing suite. Result: 0 errors, 0 warnings — All checks passed.
