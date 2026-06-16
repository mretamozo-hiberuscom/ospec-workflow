# Proposal: MCP Placeholder Normalization (per-target)

## Intent

The canonical `.mcp.json` declares its secret with VS Code-only syntax:
`"CONTEXT7_API_KEY": "${input:CONTEXT7_API_KEY}"`. For the **claude** and
**github-copilot** targets, `.mcp.json` passes through UNCHANGED (it falls into
the generic passthrough at the end of `handleFile` in `target-transform.js`).
Neither host understands `${input:NAME}`. Claude Code only expands `${VAR}` /
`${VAR:-default}`, so it looks for a var literally named `input:CONTEXT7_API_KEY`,
finds it unset with no default, and **fails to parse the config** — surfacing as
the user's reported "1 setup issue: plugins" (the server IS auto-discovered, so
it shows as an issue, not absent). Copilot CLI has the same latent bug (same
`$VAR`/`${VAR:-default}` syntax). **opencode is already correct** —
`transformMcpServers` rewrites `${input:NAME}` → `{env:NAME}` and is the
reference pattern. The golden fixtures never exercise this path because the source
fixture `.mcp.json` has no `env` block, which is why CI did not catch the bug.

## Scope

### In Scope
- `target-transform.js`: intercept `.mcp.json` for profiles that opt in, rewriting `${input:NAME}` in `env`/`args`/`url`/`headers` values to the host env-expansion form.
- `claude.js` + `github-copilot.js`: declarative opt-in config (e.g. `mcpPlaceholders`/`mcpEnv`) selecting env-expansion normalization.
- `__fixtures__/source/.mcp.json`: add the `env` block with `${input:...}` to close the coverage gap.
- Goldens: `golden/claude/.mcp.json`, `golden/github-copilot/.mcp.json` (→ `${CONTEXT7_API_KEY:-}`); regenerate `golden/opencode/opencode.json`.
- New test asserting NO `${input:` survives in any generated `.mcp.json`/`opencode.json` across all targets.
- Validators `validate-github-copilot.js` + `validate-opencode.js`: fail on residual `${input:`.

### Out of Scope
- opencode placeholder logic (already correct) — only its golden is regenerated.
- vscode output (canonical `${input:}` is its native syntax — must be preserved).
- Copilot cloud coding-agent variable renaming (see Risk B — defer to design).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `generator`: add a requirement that profiles declaring MCP placeholder normalization MUST rewrite `${input:NAME}` to the host's env-expansion form (`${NAME:-}`) across `.mcp.json` `env`/`args`/`url`/`headers` before write, and that NO `${input:` placeholder may survive in any generated `.mcp.json`/`opencode.json`. vscode passthrough is unchanged.

## Approach

Mirror the opencode pattern declaratively. claude and Copilot CLI share the safe
form `${VAR}` / `${VAR:-default}`, so one normalization branch serves both. Each
profile opts in via a config flag; `target-transform.js` reads it, intercepts
`.mcp.json` before the generic passthrough, and rewrites placeholders. The source
fixture gains the `env` block so goldens + the new no-`${input:` assertion lock
the behavior in.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/target-transform.js` | Modified | Intercept `.mcp.json`; rewrite `${input:NAME}` for opt-in profiles |
| `scripts/lib/target-profiles/claude.js` | Modified | Add env-expansion opt-in config |
| `scripts/lib/target-profiles/github-copilot.js` | Modified | Add env-expansion opt-in config |
| `scripts/configure/__fixtures__/source/.mcp.json` | Modified | Add `env` block with `${input:...}` |
| `__fixtures__/golden/{claude,github-copilot}/.mcp.json` | Modified | Expected `${CONTEXT7_API_KEY:-}` |
| `__fixtures__/golden/opencode/opencode.json` | Modified | Regenerate |
| `scripts/lib/target-transform.test.js` | Modified | No-`${input:` assertion across targets |
| `scripts/configure/validate-{github-copilot,opencode}.js` | Modified | Fail on residual `${input:` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **A. Default-empty form.** Recommend emitting `${CONTEXT7_API_KEY:-}` (empty default) so Claude never fails to parse when the key is unset and context7 falls back to keyless mode. | Med | Confirm in design that context7 treats an empty-string key as "no key" before locking the golden. |
| **B. Copilot var-name prefix.** The Copilot **cloud coding agent** only exposes secrets prefixed `COPILOT_MCP_`, so `CONTEXT7_API_KEY` would be invisible there unless renamed `COPILOT_MCP_CONTEXT7_API_KEY` — variable RENAMING, not just placeholder rewriting, and may diverge from Copilot CLI local. | Med | Open question for design phase: decide CLI-local vs cloud scope; do not silently rename. |
| vscode `${input:}` accidentally rewritten | Low | Opt-in is per-profile; vscode does not opt in — covered by its golden. |

## Rollback Plan

Change is isolated to the generator profiles/transform, fixtures, goldens, tests,
and two validators — no runtime or data impact. Rollback = `git revert` the change
commit and regenerate; opencode behavior is unchanged throughout.

## Dependencies

- Confirmation of context7 empty-key behavior (Risk A) before finalizing the claude/copilot golden.
- Decision on Copilot CLI-local vs cloud coding-agent scope (Risk B) for the design phase.

## Success Criteria

- [ ] No `${input:` survives in any generated `.mcp.json` (claude, github-copilot) or `opencode.json`.
- [ ] Source fixture `.mcp.json` includes the `env` block; goldens exercise the placeholder path.
- [ ] claude + github-copilot goldens emit `${CONTEXT7_API_KEY:-}`; opencode golden uses `{env:CONTEXT7_API_KEY}`.
- [ ] Validators fail on residual `${input:` placeholders.
- [ ] User's "1 setup issue: plugins" no longer reproduces with an unset key.
- [ ] `npm test` green.
