# Delta for generator — mcp-placeholder-normalization

## MODIFIED Requirements

### Scenario 2: Pure transform — file routing

Given a loaded file collection, a target profile, and models data,
When `transform` is called,
Then each file MUST be routed through exactly one handler in this priority order:
1. Dropped files (profile `drop` list) — removed from output.
2. Plugin manifest (`profile.manifest.location`) — field-stripped via `reshapeManifest`.
3. Hooks file with `shape: "nested"` — wrapped in an outer group array via `nestHooks`.
4. Hooks file with `format: "copilot"` — reshaped to Copilot schema via `copilotHooks`.
5. Rules files (`rules/` prefix) — either inlined into the orchestrator agent, emitted as instruction files, or passed through, depending on `profile.rules.strategy`.
6. Agent files (matching `profile.agentFile.from`) — handled via `handleAgent` (frontmatter strip, model injection, tool name substitution); or emitted as an orchestrator skill when the profile sets `orchestrator.emitAs: "skill"`.
7. Command files (matching `profile.commandFile.from`) — handled via `handleCommand` (frontmatter strip, variable substitution).
8. **`.mcp.json` for profiles with MCP placeholder normalization enabled** (`profile.mcpPlaceholders` truthy) — every `${input:NAME}` occurrence in `env`, `args`, `url`, and `headers` string values MUST be rewritten to `${NAME:-}` before the file is added to the output tree; intercepted here and MUST NOT reach step 9.
9. Passthrough (skills, shared docs with `.md` extension) — tool name substitution in prose applied; binary/other files copied as-is.

And synthesized files (e.g. `opencode.json`, the opencode JS plugin shim) MUST be appended after the per-file pass.
And the output file array MUST be sorted deterministically by path (lexicographic ascending) regardless of OS filesystem read order.

(Previously: `.mcp.json` fell through to step 8 (passthrough) for all profiles including claude and github-copilot, leaving `${input:NAME}` placeholders unresolved in those outputs. Step count was 8; it is now 9.)

#### Scenario: claude — .mcp.json intercepted before passthrough

- GIVEN the claude profile has MCP placeholder normalization enabled (`mcpPlaceholders` truthy)
- AND the source `.mcp.json` contains `${input:CONTEXT7_API_KEY}` in an `env` value
- WHEN `transform` processes `.mcp.json` for the claude target
- THEN the file MUST be routed to step 8 (MCP normalization), NOT to step 9 (passthrough)
- AND the output `.mcp.json` MUST contain `${CONTEXT7_API_KEY:-}` in place of the original placeholder

#### Scenario: vscode — .mcp.json reaches passthrough unchanged

- GIVEN the vscode profile does NOT declare MCP placeholder normalization (`mcpPlaceholders` absent or falsy)
- AND the source `.mcp.json` contains `${input:CONTEXT7_API_KEY}` in an `env` value
- WHEN `transform` processes `.mcp.json` for the vscode target
- THEN the file MUST pass through step 9 (passthrough) without modification
- AND the output `.mcp.json` MUST preserve `${input:CONTEXT7_API_KEY}` verbatim

---

## ADDED Requirements

### Requirement: MCP Placeholder Normalization (Per-Profile Opt-In)

A target profile MAY declare MCP placeholder normalization by setting `mcpPlaceholders` (or an equivalent profile config key) to a truthy value. When a profile opts in, the transform MUST rewrite every `${input:NAME}` substring found in `.mcp.json` `env`, `args`, `url`, and `headers` string values to `${NAME:-}` before adding the file to the output tree. Profiles that do not opt in — notably `vscode` — MUST NOT have their `.mcp.json` modified.

#### Scenario: All four string fields normalized

- GIVEN a profile opts in and the source `.mcp.json` has `${input:KEY}` in `env`, `args`, `url`, and `headers` values
- WHEN `transform` rewrites `.mcp.json`
- THEN every occurrence in all four fields MUST be rewritten to `${KEY:-}`
- AND no `${input:` substring MUST remain in any of those fields

#### Scenario: github-copilot profile opts in

- GIVEN the github-copilot profile has MCP placeholder normalization enabled
- AND the source `.mcp.json` contains `${input:CONTEXT7_API_KEY}` in an `env` block
- WHEN the generator produces the github-copilot output
- THEN the output `.mcp.json` MUST contain `${CONTEXT7_API_KEY:-}` and MUST NOT contain `${input:`

#### Scenario: No input placeholders in source — output unchanged

- GIVEN a profile opts in but the source `.mcp.json` contains no `${input:` occurrences
- WHEN `transform` processes `.mcp.json`
- THEN the output MUST be identical to the source (no spurious mutations)

#### Scenario: vscode profile does not opt in — source preserved

- GIVEN the vscode profile does NOT declare MCP placeholder normalization
- WHEN the generator produces the vscode output
- THEN the output `.mcp.json` MUST preserve every `${input:NAME}` occurrence verbatim

---

### Requirement: No Residual Input Placeholders (Post-Generation Invariant)

After the generator writes the output tree, no `${input:` substring MUST remain in any generated `.mcp.json` for `claude` or `github-copilot`, nor in any `opencode.json` for `opencode`. The `opencode` guarantee is provided by the existing `${input:NAME}` → `{env:NAME}` transform in `transformMcpServers` and MUST remain intact. The `vscode` output is exempt — `${input:}` is its native syntax and MUST be preserved.

| Target | File | Invariant |
|---|---|---|
| `claude` | `.mcp.json` | No `${input:` substring |
| `github-copilot` | `.mcp.json` | No `${input:` substring |
| `opencode` | `opencode.json` | No `${input:` substring (guaranteed by `{env:NAME}` transform) |
| `vscode` | `.mcp.json` | `${input:NAME}` PRESERVED |

#### Scenario: claude output contains no residual placeholders

- GIVEN the source `.mcp.json` contains one or more `${input:NAME}` values
- WHEN the generator produces the claude output
- THEN the generated `.mcp.json` MUST NOT contain any `${input:` substring

#### Scenario: github-copilot output contains no residual placeholders

- GIVEN the source `.mcp.json` contains one or more `${input:NAME}` values
- WHEN the generator produces the github-copilot output
- THEN the generated `.mcp.json` MUST NOT contain any `${input:` substring

#### Scenario: opencode output — existing transform remains correct

- GIVEN the source `.mcp.json` contains `${input:NAME}` in an `env` block
- WHEN the generator produces the opencode `opencode.json`
- THEN all MCP server `environment` values MUST use `{env:NAME}` form
- AND the `opencode.json` MUST NOT contain any `${input:` substring

#### Scenario: vscode output — input placeholders preserved

- GIVEN the source `.mcp.json` contains `${input:CONTEXT7_API_KEY}` in an `env` block
- WHEN the generator produces the vscode output
- THEN the output `.mcp.json` MUST retain `${input:CONTEXT7_API_KEY}` unchanged

---

### Requirement: Validator MCP Residual Placeholder Detection

`validate-github-copilot.js` and `validate-opencode.js` MUST each include a check that fails — emitting at least one error and exiting with non-zero status — when any `${input:` substring is found in the validated output tree. This catch ensures that a misconfigured or new profile that omits the opt-in flag is detected at the validation gate rather than silently shipping broken config to users.

#### Scenario: validate-github-copilot fails on residual placeholder

- GIVEN the github-copilot output tree contains a `.mcp.json` with a `${input:KEY}` value
- WHEN `validate-github-copilot.js` runs against that output
- THEN the validator MUST emit at least one error and MUST exit with non-zero status

#### Scenario: validate-opencode fails on residual placeholder

- GIVEN the opencode output tree contains an `opencode.json` with a `${input:KEY}` value
- WHEN `validate-opencode.js` runs against that output
- THEN the validator MUST emit at least one error and MUST exit with non-zero status

#### Scenario: clean output passes the placeholder check

- GIVEN the output tree contains no `${input:` substrings
- WHEN the relevant validator runs
- THEN the validator MUST NOT report an error from the MCP residual placeholder check

---

### Requirement: Source Fixture MCP Env Block (Test Coverage)

The source test fixture `__fixtures__/source/.mcp.json` MUST contain at least one MCP server entry with an `env` block whose values use `${input:NAME}` syntax. This ensures that golden-comparison tests and transform-unit tests exercise the placeholder normalization path; without this fixture entry, CI passes even when normalization is missing because the path is never triggered.

#### Scenario: Fixture triggers placeholder rewrite in transform tests

- GIVEN `__fixtures__/source/.mcp.json` contains an `env` block with a `${input:NAME}` value
- WHEN the transform test runs for the claude or github-copilot target
- THEN the test MUST assert the generated `.mcp.json` contains `${NAME:-}` and no `${input:` substring

#### Scenario: Fixture triggers {env:NAME} rewrite in opencode tests

- GIVEN `__fixtures__/source/.mcp.json` contains an `env` block with a `${input:NAME}` value
- WHEN the transform test runs for the opencode target
- THEN the test MUST assert `opencode.json` contains `{env:NAME}` and no `${input:` substring
