# Apply Progress: mcp-placeholder-normalization

**Mode**: Strict TDD
**Batch**: 1 (first and only — single-PR change)
**Date**: 2026-06-16

---

## Completed Tasks

- [x] 1.1 [RED] claude profile test: `${input:CONTEXT7_API_KEY}` in env → `${CONTEXT7_API_KEY:-}`, no residual
- [x] 1.2 [RED] github-copilot profile test: same env rewrite assertion
- [x] 1.3 [RED] all four fields test (env, args, url, headers) with claude profile — all rewritten
- [x] 1.4 [GUARD] vscode regression guard: `${input:NAME}` preserved verbatim — passed before and after
- [x] 1.5 [GREEN] `toEnvExpansion(value)` added after `toOpencodeVars` in `target-transform.js`
- [x] 1.6 [GREEN] `mapVarValuesWith(obj, fn)` sibling added alongside `mapVarValues`
- [x] 1.7 [GREEN] `normalizeMcpPlaceholders(file)` added — parses JSON, walks env/args/url/headers, reserializes
- [x] 1.8 [GREEN] Interception branch added in `handleFile` before passthrough: `if (profile.mcpPlaceholders && path === ".mcp.json")`
- [x] 1.9 [GREEN] `mcpPlaceholders: { style: "env-expansion" }` added to `claude.js`
- [x] 1.10 [GREEN] `mcpPlaceholders: { style: "env-expansion" }` added to `github-copilot.js`
- [x] 1.11 `node --test scripts/lib/target-transform.test.js` — 51/51 GREEN
- [x] 2.1 `__fixtures__/source/.mcp.json` — added `env: { CONTEXT7_API_KEY: "${input:CONTEXT7_API_KEY}" }` to context7 entry
- [x] 2.2 `golden/claude/.mcp.json` — updated with `env: { CONTEXT7_API_KEY: "${CONTEXT7_API_KEY:-}" }`
- [x] 2.3 `golden/github-copilot/.mcp.json` — updated with same normalized env
- [x] 2.4 `golden/opencode/opencode.json` — updated with `environment: { CONTEXT7_API_KEY: "{env:CONTEXT7_API_KEY}" }`
- [x] 2.5 `node --test scripts/configure/cli.test.js` — 15/15 GREEN (all three golden targets pass)
- [x] 3.1 [RED] `validate-github-copilot.test.js` — poisoned-tree test: `.mcp.json` with `${input:RESIDUAL_KEY}` → errors non-empty
- [x] 3.2 [RED] `validate-opencode.test.js` — poisoned-tree test: `opencode.json` with `${input:RESIDUAL_KEY}` → errors non-empty
- [x] 3.3 [GREEN] `validateMcpResidualPlaceholders(root, errors)` added to `validate-github-copilot.js`
- [x] 3.4 [GREEN] Wired into `validate()` after `validateMcp` in `validate-github-copilot.js`
- [x] 3.5 [GREEN] `validateMcpResidualPlaceholders(root, errors)` added to `validate-opencode.js` (scoped to `opencode.json`)
- [x] 3.6 [GREEN] Wired into `validate()` after `validateConfig` in `validate-opencode.js`
- [x] 3.7 `node --test scripts/configure/validate-github-copilot.test.js scripts/configure/validate-opencode.test.js` — 20/20 GREEN

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `target-transform.test.js` | Unit | 47/47 | Written (fails, passthrough returns verbatim) | 51/51 after impl | 3 test cases (claude/copilot/all-fields) | Clean |
| 1.2 | `target-transform.test.js` | Unit | 47/47 | Written (fails, passthrough returns verbatim) | 51/51 after impl | Part of 3-case set | Clean |
| 1.3 | `target-transform.test.js` | Unit | 47/47 | Written (fails) | 51/51 after impl | Covers all 4 fields (env/args/url/headers) | Clean |
| 1.4 | `target-transform.test.js` | Unit | N/A (guard) | Passes NOW (vscode is passthrough already) | Stays green after impl | Single scenario (vscode opt-out) | Clean |
| 2.1–2.4 | `cli.test.js` | Golden | 15/15 before | N/A (mechanical fixture update) | 15/15 after goldens | N/A (golden comparison) | N/A |
| 3.1 | `validate-github-copilot.test.js` | Unit | 9/9 existing | Written (fails, no check exists) | 10/10 after impl | Clean tree vs poisoned tree (2 cases) | Clean |
| 3.2 | `validate-opencode.test.js` | Unit | 11/11 existing | Written (fails, no check exists) | 12/12 after impl | Clean tree vs poisoned tree (2 cases) | Clean |

### Test Summary
- **Total tests written**: 6 new tests (4 transform + 2 validator)
- **Total tests passing**: 296/296 (full npm test suite)
- **Layers used**: Unit (6)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: 3 (`toEnvExpansion`, `mapVarValuesWith`, `normalizeMcpPlaceholders`)

---

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/target-transform.js` | Modified | Added `toEnvExpansion`, `mapVarValuesWith`, `normalizeMcpPlaceholders`; added `.mcp.json` interception branch in `handleFile` before passthrough |
| `scripts/lib/target-transform.test.js` | Modified | Added 4 new tests (tasks 1.1–1.4): claude rewrite, github-copilot rewrite, all-four-fields, vscode guard |
| `scripts/lib/target-profiles/claude.js` | Modified | Added `mcpPlaceholders: { style: "env-expansion" }` |
| `scripts/lib/target-profiles/github-copilot.js` | Modified | Added `mcpPlaceholders: { style: "env-expansion" }` |
| `scripts/configure/__fixtures__/source/.mcp.json` | Modified | Added `env: { CONTEXT7_API_KEY: "${input:CONTEXT7_API_KEY}" }` to context7 |
| `scripts/configure/__fixtures__/golden/claude/.mcp.json` | Modified | Expect `${CONTEXT7_API_KEY:-}` in env (normalized form) |
| `scripts/configure/__fixtures__/golden/github-copilot/.mcp.json` | Modified | Expect `${CONTEXT7_API_KEY:-}` in env (normalized form) |
| `scripts/configure/__fixtures__/golden/opencode/opencode.json` | Modified | Added `environment: { CONTEXT7_API_KEY: "{env:CONTEXT7_API_KEY}" }` to context7 |
| `scripts/configure/validate-github-copilot.js` | Modified | Added `validateMcpResidualPlaceholders`, wired into `validate()` after `validateMcp` |
| `scripts/configure/validate-github-copilot.test.js` | Modified | Added poisoned-tree test (task 3.1) |
| `scripts/configure/validate-opencode.js` | Modified | Added `validateMcpResidualPlaceholders`, wired into `validate()` after `validateConfig` |
| `scripts/configure/validate-opencode.test.js` | Modified | Added poisoned-tree test (task 3.2) |

---

## Deviations from Design

None — implementation matches design exactly:
- `toEnvExpansion` uses the identical regex name class `[A-Za-z_][A-Za-z0-9_]*` as specified in the design
- `mapVarValuesWith` added as a sibling (design's preferred option over generalizing `mapVarValues`)
- `normalizeMcpPlaceholders` matches the design's contract signature exactly
- Interception branch uses the exact guard `profile.mcpPlaceholders && path === ".mcp.json"` from design
- `command` is NOT rewritten, as specified
- `vscode.js` does NOT carry `mcpPlaceholders` — confirmed no opt-in
- Validator check uses `readUtf8` pattern mirroring `validateForbiddenText`

One minor implementation note: the golden `.mcp.json` files for claude and github-copilot needed to be written WITHOUT a trailing newline to match `JSON.stringify(obj, null, 2)` output (which produces no trailing newline). The `Edit` tool preserves file trailing newlines from the original, so `Write` was used instead.

---

## Workload / PR Boundary

- Mode: single PR
- Boundary: all 3 work units in one PR
- Estimated review budget impact: ~165 lines added — well within 400-line budget
- Commits:
  1. `feat(generator): normaliza placeholders ${input:NAME} en .mcp.json para claude y github-copilot` (work unit 1)
  2. `test(fixtures): agrega env block en source fixture y actualiza goldens claude/github-copilot/opencode` (work unit 2)
  3. `feat(validators): detecta placeholders residuales de tipo input en .mcp.json y opencode.json` (work unit 3)
