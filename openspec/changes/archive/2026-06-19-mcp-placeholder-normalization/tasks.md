# Tasks: MCP Placeholder Normalization (per-target)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| Step 8 `.mcp.json` intercepted (MCP normalization), passthrough renumbered to step 9 | MUST | New branch in `handleFile` before passthrough block (`target-transform.js`) | covered-by-design | Branch guarded by `profile.mcpPlaceholders` truthy |
| claude profile opts in | MUST | `claude.js` — add `mcpPlaceholders: { style: "env-expansion" }` | covered-by-design | |
| github-copilot profile opts in | MUST | `github-copilot.js` — add `mcpPlaceholders: { style: "env-expansion" }` | covered-by-design | |
| vscode profile does NOT opt in — passthrough preserved verbatim | MUST | Flag absent from vscode profile; branch short-circuits | covered-by-design | |
| `${input:NAME}` → `${NAME:-}` across `env`, `args`, `url`, `headers` string values | MUST | `toEnvExpansion` + `normalizeMcpPlaceholders` in `target-transform.js`; `command` intentionally excluded | covered-by-design | |
| No `${input:` residual in claude `.mcp.json` | MUST | `toEnvExpansion` regex covers all occurrences; golden locks result | covered-by-design | |
| No `${input:` residual in github-copilot `.mcp.json` | MUST | Same mechanism | covered-by-design | |
| opencode — existing `{env:NAME}` transform remains correct, `opencode.json` no residual | MUST | `transformMcpServers`/`toOpencodeVars` untouched; fixture update exercises path; golden regenerated | covered-by-design | |
| vscode `.mcp.json` preserves `${input:NAME}` verbatim | MUST | Profile opt-out; falls through to generic passthrough unchanged | covered-by-design | |
| `validate-github-copilot.js` fails on residual `${input:` in `.mcp.json` | MUST | New `validateMcpResidualPlaceholders` wired into `validate()` in `validate-github-copilot.js` | covered-by-design | Scoped to `.mcp.json` |
| `validate-opencode.js` fails on residual `${input:` in `opencode.json` | MUST | New `validateMcpResidualPlaceholders` wired into `validate()` in `validate-opencode.js` | covered-by-design | Scoped to `opencode.json` |
| Source fixture carries `env` block with `${input:NAME}` for test coverage | MUST | `__fixtures__/source/.mcp.json` — add `env` block to context7 entry | covered-by-design | Triggers golden comparison and unit test placeholder path |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: `mapVarValues` generalization — design defers to apply: add a `mapVarValuesWith(obj, fn)` sibling OR generalize the existing `mapVarValues` to accept a mapper argument; either is valid as long as `toOpencodeVars` callers still work unchanged.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150–165 lines (additions + deletions) |
| Low-review-cost mechanical lines | ~12 (fixture + 3 golden files) |
| High-review-cost lines | ~140–153 (logic + tests) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

Breakdown by file:
- `target-transform.js`: +~27 lines (`toEnvExpansion` + `mapVarValuesWith` + `normalizeMcpPlaceholders` + branch)
- `target-transform.test.js`: +~55 lines (3 new behavioral tests + 1 regression guard)
- `claude.js` + `github-copilot.js`: +1 line each
- `validate-github-copilot.js`: +~10 lines (function + wire-up)
- `validate-opencode.js`: +~10 lines (function + wire-up)
- `validate-github-copilot.test.js`: +~18 lines (poisoned-tree test)
- `validate-opencode.test.js`: +~18 lines (poisoned-tree test)
- Source + 3 golden fixtures: +~12 lines (mechanical, low review cost)

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Transform behavior: RED tests → GREEN impl → profile flags | PR 1 | `target-transform.test.js`, `target-transform.js`, `claude.js`, `github-copilot.js` |
| 2 | Fixture + golden lock | PR 1 | Mechanical low-review-cost diff; `source/.mcp.json` + 3 golden files |
| 3 | Validator residual check: RED tests → GREEN impl | PR 1 | `validate-github-copilot.{js,test.js}`, `validate-opencode.{js,test.js}` |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Transform — RED → GREEN (behavior + profiles)

Strict TDD: write failing tests first, then implement. Commit unit 1 when all Phase 1 tests are GREEN.

- [x] 1.1 **[RED]** In `scripts/lib/target-transform.test.js`, add a test using inline `.mcp.json` fixture (env block with `${input:CONTEXT7_API_KEY}`) + claude profile: assert the output `.mcp.json` contains `${CONTEXT7_API_KEY:-}` and does NOT match `/\$\{input:/`. This test MUST fail on current code (passthrough returns verbatim).
- [x] 1.2 **[RED]** In `target-transform.test.js`, add a parallel test using github-copilot profile and same inline fixture: assert `${CONTEXT7_API_KEY:-}` present and no `${input:` residual. MUST fail on current code.
- [x] 1.3 **[RED]** In `target-transform.test.js`, add a test covering all four normalized fields: inline `.mcp.json` with `${input:KEY}` in `env`, `args`, `url`, and `headers` values, using claude profile: assert all four are rewritten to `${KEY:-}` and no `${input:` remains. MUST fail.
- [x] 1.4 **[GUARD]** In `target-transform.test.js`, add regression-guard test using vscode profile + same inline fixture: assert the output `.mcp.json` still contains `${input:CONTEXT7_API_KEY}` verbatim. This test MUST pass NOW (current passthrough is correct) and must stay green after implementation.
- [x] 1.5 **[GREEN]** In `scripts/lib/target-transform.js`, add `toEnvExpansion(value)` function after `toOpencodeVars` — replaces `${input:NAME}` with `${NAME:-}` using the same name-character class (`[A-Za-z_][A-Za-z0-9_]*`) as `toOpencodeVars`. Function replacer avoids `$`-token ambiguity.
- [x] 1.6 **[GREEN]** In `target-transform.js`, add `mapVarValuesWith(obj, fn)` sibling alongside `mapVarValues` (or generalize `mapVarValues` to accept a second mapper argument, keeping the existing `toOpencodeVars` call-sites unchanged).
- [x] 1.7 **[GREEN]** In `target-transform.js`, add `normalizeMcpPlaceholders(file)` function: `JSON.parse` content into a fresh object, walk each `mcpServers` entry rewriting `env` via `mapVarValuesWith`, `args` via `.map(toEnvExpansion)`, `url` via `toEnvExpansion`, and `headers` via `mapVarValuesWith`; return `{ path: file.path, content: JSON.stringify(obj, null, 2) }`. `command` is NOT rewritten.
- [x] 1.8 **[GREEN]** In `handleFile` in `target-transform.js`, insert the interception branch immediately before the `profile.toolMap && path.endsWith(".md")` passthrough block: `if (profile.mcpPlaceholders && path === ".mcp.json") { return normalizeMcpPlaceholders(file); }`.
- [x] 1.9 **[GREEN]** In `scripts/lib/target-profiles/claude.js`, add `mcpPlaceholders: { style: "env-expansion" },` to the profile object (place near the `rules:` declaration for grouping clarity).
- [x] 1.10 **[GREEN]** In `scripts/lib/target-profiles/github-copilot.js`, add `mcpPlaceholders: { style: "env-expansion" },` to the profile object (place near the `drop:` declaration).
- [x] 1.11 Run `node --test scripts/lib/target-transform.test.js` — all tests must be GREEN, including 1.1–1.4.

---

## Phase 2: Fixture + Golden Lock (mechanical)

Add the source fixture data that triggers the normalization path in all targets, then regenerate and commit the three affected golden files. Low-review-cost mechanical diff.

- [x] 2.1 In `scripts/configure/__fixtures__/source/.mcp.json`, add `"env": { "CONTEXT7_API_KEY": "${input:CONTEXT7_API_KEY}" }` to the `io.github.upstash/context7` server entry.
- [x] 2.2 Update `scripts/configure/__fixtures__/golden/claude/.mcp.json` — context7 entry gains `"env": { "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY:-}" }` (normalized form).
- [x] 2.3 Update `scripts/configure/__fixtures__/golden/github-copilot/.mcp.json` — context7 entry gains `"env": { "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY:-}" }` (normalized form).
- [x] 2.4 Update `scripts/configure/__fixtures__/golden/opencode/opencode.json` — context7 mcp server entry gains `"environment": { "CONTEXT7_API_KEY": "{env:CONTEXT7_API_KEY}" }` (via existing `toOpencodeVars` path).
- [x] 2.5 Run `node --test scripts/configure/cli.test.js` — golden comparison loop must pass for all three targets (claude, github-copilot, opencode).

---

## Phase 3: Validators — RED → GREEN

Add the residual-placeholder guard to both validators. Commit unit 3 when all Phase 3 tests are GREEN and existing clean-tree tests still pass.

- [x] 3.1 **[RED]** In `scripts/configure/validate-github-copilot.test.js`, add a test: generate github-copilot output to a tmpOut, then overwrite `.mcp.json` in that tree with content containing `${input:RESIDUAL_KEY}`, run `validate(out)`, assert `result.errors` is non-empty and at least one error references the residual placeholder. MUST fail on current code (no such check exists yet).
- [x] 3.2 **[RED]** In `scripts/configure/validate-opencode.test.js`, add a test: generate opencode output to a tmpOut, overwrite `opencode.json` with content containing `${input:RESIDUAL_KEY}`, run `validate(out)`, assert `result.errors` non-empty with a residual placeholder error. MUST fail on current code.
- [x] 3.3 **[GREEN]** In `scripts/configure/validate-github-copilot.js`, add `validateMcpResidualPlaceholders(root, errors)` — read `.mcp.json` if it exists, scan its text content for `/\$\{input:/`, call `addError` with a descriptive message on any match. Mirror the `validateForbiddenText` pattern (read file, regex test, addError).
- [x] 3.4 **[GREEN]** In `validate-github-copilot.js`, wire `validateMcpResidualPlaceholders(absRoot, errors)` into the `validate()` function body (after `validateMcp`).
- [x] 3.5 **[GREEN]** In `scripts/configure/validate-opencode.js`, add `validateMcpResidualPlaceholders(root, errors)` — read `opencode.json` if it exists, scan for `/\$\{input:/`, `addError` on match. Scope to `opencode.json` only (`.mcp.json` is already a forbidden path in opencode output).
- [x] 3.6 **[GREEN]** In `validate-opencode.js`, wire `validateMcpResidualPlaceholders(absRoot, errors)` into `validate()` body (after `validateConfig`).
- [x] 3.7 Run `node --test scripts/configure/validate-github-copilot.test.js scripts/configure/validate-opencode.test.js` — all tests GREEN, including the new poisoned-tree tests (3.1, 3.2) and the existing "validate accepts generated output" tests (clean-tree coverage of the negative scenario).
