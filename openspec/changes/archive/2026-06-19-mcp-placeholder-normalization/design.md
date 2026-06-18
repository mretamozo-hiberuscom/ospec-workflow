# Design: MCP Placeholder Normalization (per-target)

## Technical Approach

Mirror the proven opencode MCP-rewrite pattern (`transformMcpServers` /
`toOpencodeVars` / `mapVarValues`) for the two hosts whose `.mcp.json` currently
passes through untouched. We add ONE declarative opt-in flag to the `claude` and
`github-copilot` profiles, ONE interception branch in `handleFile` that fires
before the generic passthrough, and ONE rewrite helper that emits the
host-native `${NAME:-}` form. `opencode` and `vscode` are deliberately untouched:
opencode `drop`s `.mcp.json` (folded into `opencode.json` already correctly), and
vscode never opts in. A residual-placeholder guard in the two validators closes
the gate so a future profile that forgets the flag fails CI instead of shipping
broken config.

This satisfies the modified `generator` spec step ordering (new step 8 for
`.mcp.json`, passthrough renumbered to step 9) and all ADDED requirements
(per-profile opt-in, no-residual invariant, validator detection, fixture
coverage).

## Architecture Decisions

### Decision: Declarative per-profile opt-in via `mcpPlaceholders`

**Choice**: Add `mcpPlaceholders: { style: "env-expansion" }` to `claude.js` and
`github-copilot.js`. `handleFile` guards the new branch with `profile.mcpPlaceholders`
truthy. `style` is reserved for future host dialects; only `"env-expansion"` is
implemented now.
**Alternatives considered**: hard-coding `path === ".mcp.json"` rewrite for all
non-opencode profiles; a per-profile boolean.
**Rationale**: The codebase drives ALL per-target knowledge from the declarative
profile object (see `claude.js` header comment). An opt-in object keeps vscode
safe by omission and leaves room for a future `style` without touching the
transform — consistent with how `commandVars.style`, `hooks.shape`, and
`rules.strategy` already work.

### Decision: Rewrite helper mirrors `toOpencodeVars`/`mapVarValues`

**Choice**: Add `toEnvExpansion(value)` (string → string) and reuse a
`mapVarValues`-style object mapper, plus a `normalizeMcpPlaceholders(file)` that
parses the JSON, recurses into `env`, `args`, `url`, and `headers` string values
only, and re-serializes with `JSON.stringify(obj, null, 2)`.
**Alternatives considered**: a global string `.replace` over the raw file text.
**Rationale**: Structured rewrite (parse → walk specific fields → serialize)
matches `transformMcpServers` and avoids corrupting `command` or any non-target
string. The pure-transform contract is preserved because `JSON.parse` yields a
fresh object — the input `files` array is never mutated.

### Decision: Interception point — dedicated branch BEFORE passthrough

**Choice**: Insert the `.mcp.json` branch in `handleFile` immediately before the
`profile.toolMap && path.endsWith(".md")` passthrough block (current lines
83-87):

```js
if (profile.mcpPlaceholders && path === ".mcp.json") {
  return normalizeMcpPlaceholders(file);
}
```

**Alternatives considered**: handling it inside `synthesizeFiles`; placing it
earlier (before agents/commands).
**Rationale**: `.mcp.json` is a 1:1 file (not synthesized), is neither `.md` nor
an agent/command, so today it lands in the final generic `return`. The branch
must sit just before passthrough so opencode's `drop` (handled first via
`isDropped`) and vscode's opt-out (flag absent) both short-circuit correctly.
This realizes spec step 8 → step 9 ordering exactly.

## Data Flow

```
.mcp.json ──> handleFile
                 │
   isDropped? ───┼── yes (opencode) ─────────────> null  (folded into opencode.json)
                 │
   mcpPlaceholders? ─ yes (claude, copilot) ─────> normalizeMcpPlaceholders
                 │                                     │ env/args/url/headers
                 │                                     │ ${input:NAME} -> ${NAME:-}
                 │                                     ▼
                 │                                  { path, content }  (step 8)
                 │
                 └─ no (vscode) ────> generic passthrough (step 9, verbatim)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/target-transform.js` | Modify | Add `.mcp.json` branch in `handleFile` before passthrough; add `toEnvExpansion` + `normalizeMcpPlaceholders` helpers near `toOpencodeVars` |
| `scripts/lib/target-profiles/claude.js` | Modify | Add `mcpPlaceholders: { style: "env-expansion" }` |
| `scripts/lib/target-profiles/github-copilot.js` | Modify | Add `mcpPlaceholders: { style: "env-expansion" }` |
| `scripts/configure/__fixtures__/source/.mcp.json` | Modify | Add `env` block with `${input:CONTEXT7_API_KEY}` to context7 |
| `scripts/configure/__fixtures__/golden/claude/.mcp.json` | Modify | Expect `${CONTEXT7_API_KEY:-}` |
| `scripts/configure/__fixtures__/golden/github-copilot/.mcp.json` | Modify | Expect `${CONTEXT7_API_KEY:-}` |
| `scripts/configure/__fixtures__/golden/opencode/opencode.json` | Modify | Regenerate: context7 gains `environment: { CONTEXT7_API_KEY: "{env:CONTEXT7_API_KEY}" }` |
| `scripts/configure/validate-github-copilot.js` | Modify | Add residual `${input:` check (error + non-zero exit) |
| `scripts/configure/validate-opencode.js` | Modify | Add residual `${input:` check (error + non-zero exit) |
| `scripts/lib/target-transform.test.js` | Modify | New unit tests: rewrite for claude/copilot, opencode unchanged, vscode preserved |
| `scripts/configure/validate-github-copilot.test.js` | Modify | New test: residual placeholder fails |
| `scripts/configure/validate-opencode.test.js` | Modify | New test: residual placeholder fails |

## Interfaces / Contracts

```js
// Rewrite VS Code input placeholders to the env-expansion form Claude Code and
// Copilot CLI both understand: ${input:NAME} -> ${NAME:-} (empty default keeps
// host config parseable when NAME is unset). Mirrors toOpencodeVars.
function toEnvExpansion(value) {
  if (typeof value !== "string") return value;
  // Function replacer avoids any $-token ambiguity in the replacement string.
  return value.replace(/\$\{input:([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (_m, name) => "${" + name + ":-}");
}

// Parse .mcp.json, rewrite only env/args/url/headers string values, reserialize.
function normalizeMcpPlaceholders(file) {
  const obj = JSON.parse(file.content);          // fresh object: input not mutated
  for (const server of Object.values(obj.mcpServers || {})) {
    if (!server || typeof server !== "object") continue;
    if (server.env)     server.env = mapVarValuesWith(server.env, toEnvExpansion);
    if (Array.isArray(server.args)) server.args = server.args.map(toEnvExpansion);
    if (typeof server.url === "string") server.url = toEnvExpansion(server.url);
    if (server.headers) server.headers = mapVarValuesWith(server.headers, toEnvExpansion);
  }
  return { path: file.path, content: JSON.stringify(obj, null, 2) };
}
```

`command` is intentionally NOT rewritten. The regex name class
`[A-Za-z_][A-Za-z0-9_]*` is identical to `toOpencodeVars` and matches
`CONTEXT7_API_KEY`. Existing `mapVarValues` may be generalized to accept the
mapper fn, or a sibling `mapVarValuesWith` added — apply's choice.

## Testing Strategy

Strict TDD. Order: RED test → minimal GREEN implementation → fixture/golden lock.

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (transform) | claude & github-copilot rewrite `${input:NAME}` → `${NAME:-}` across env/args/url/headers; no `${input:` survives; opencode → `{env:NAME}`; vscode preserves `${input:NAME}` | `node:test` cases in `target-transform.test.js`, inline `.mcp.json` fixtures like the existing opencode env/header test (lines 525-544) |
| Golden (e2e) | Full-tree snapshot picks up the new `env` block for all three targets | Source-fixture `env` block + regenerated goldens; existing loop in `cli.test.js` (lines 173-186) exercises automatically |
| Validator | Residual `${input:` in output tree → ≥1 error + non-zero exit; clean tree passes | New cases in `validate-github-copilot.test.js` / `validate-opencode.test.js` writing a poisoned `.mcp.json`/`opencode.json`, asserting `result.errors` non-empty |

Exact RED-first sequence:
1. Add failing unit test asserting claude `.mcp.json` contains `${CONTEXT7_API_KEY:-}` and no `${input:` — fails against current passthrough.
2. Implement `toEnvExpansion` + branch + both profile flags → GREEN.
3. Add `env` block to `__fixtures__/source/.mcp.json`; regenerate and commit
   `golden/claude/.mcp.json`, `golden/github-copilot/.mcp.json`,
   `golden/opencode/opencode.json`; golden loop locks behavior.
4. Add failing validator tests (poisoned tree) → implement residual `${input:`
   check in both validators → GREEN.

Validator check shape (mirrors `FORBIDDEN_TEXT` walk already present): scan
`walkFiles` content for `/\$\{input:/` and `addError` on hit. github-copilot
scopes to `.mcp.json`; opencode scopes to `opencode.json` (its `.mcp.json` is a
forbidden path already).

## Migration / Rollout

No migration. Generator-only change; runtime/data unaffected. Rollback =
`git revert` the change commit and regenerate; opencode output is byte-identical
before and after except the regenerated golden reflecting the new fixture `env`
block.

## Decisions

### Decision A — Emit `${NAME:-}` (empty default), not bare `${NAME}`

**Choice**: Rewrite to `${CONTEXT7_API_KEY:-}` (empty-string default).
**Rationale**: Claude Code expands only `${VAR}` / `${VAR:-default}`; a bare
`${VAR}` referencing an UNSET variable makes Claude fail to parse the ENTIRE
config (the originally reported "1 setup issue: plugins"). The `:-` empty default
guarantees the value always resolves, so startup stays robust whether or not the
user has exported the key. context7 then receives an empty string and is expected
to fall back to keyless mode. Copilot CLI shares the same `${VAR:-default}`
syntax, so one form serves both hosts.
**Residual risk (not a blocker)**: confirm context7 treats an empty-string
`CONTEXT7_API_KEY` as "no key" (keyless), not as a malformed credential. If it
rejects empty strings, the alternative is to omit the `env` entry entirely when
unset — but that is a larger behavioral change and is out of scope here. Lock the
golden as `${CONTEXT7_API_KEY:-}`; revisit only if keyless fallback is disproven.

### Decision B — Scope to Copilot CLI (local) only; defer cloud renaming

**Choice**: Implement placeholder REWRITING for Copilot CLI local `.mcp.json`
only. Do NOT implement variable RENAMING.
**Rationale**: The Copilot cloud coding agent only exposes secrets prefixed
`COPILOT_MCP_`, which would require renaming `CONTEXT7_API_KEY` →
`COPILOT_MCP_CONTEXT7_API_KEY`. That is a distinct concern (identifier renaming,
not syntax normalization), may diverge from CLI-local behavior, and risks
silently breaking the local path. This change only normalizes `${input:NAME}`
syntax; the variable name is preserved verbatim.
**Out-of-scope follow-up**: a future change MAY add a profile option (e.g.
`mcpEnv.rename` / `prefix: "COPILOT_MCP_"`) to target the cloud coding agent.
Tracked as an explicit deferral, not implemented here.
**Residual risk**: users running context7 under the Copilot CLOUD coding agent
will still not see the key until renaming lands; documented as a known
limitation, acceptable because the reported bug is the CLI-local parse failure.

## Open Questions

- [ ] Confirm context7 keyless fallback on empty `CONTEXT7_API_KEY` (Decision A
  residual). Non-blocking — golden is locked on the recommended `${NAME:-}` form.
