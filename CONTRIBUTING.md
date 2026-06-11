# Contributing to ospec-workflow

Thanks for your interest in improving this plugin. This project is itself a
Spec-Driven Development (SDD) workflow, and contributions are expected to use
that workflow for anything beyond trivial fixes.

## Ground rules

- **Trust surface first.** Any change to `.plugin/plugin.json`, `.mcp.json`,
  `hooks/hooks.json`, or `scripts/hooks/` changes the local execution and trust
  surface. Call it out explicitly in the PR description.
- **Single source of truth.** The README, the manifest, and the actual repo
  structure must agree. If you add a command, agent, hook, or MCP server,
  update the README and the relevant `docs/` page in the same PR.
- **OpenSpec is canonical.** Workflow state lives in `openspec/`. `.ospec/cache`
  and `.ospec/session` are auxiliary hints, never the source of truth.

## Workflow

- **Trivial / small** (docs, typos, one-file guards): a direct PR is fine.
- **Normal / high-risk** (new phase contracts, hook behavior, MCP changes,
  multi-repo or routing changes): start a change with `/sdd-new` and let the
  artifacts (`proposal`, `specs`, `design`, `tasks`) drive the PR.

## Tests

The runtime suite uses the native Node.js test runner:

```powershell
node --test "scripts/**/*.test.js"
```

Add or update tests for any change to `scripts/`. Hook scripts use CommonJS
`require` and `node:*` builtins only — no third-party runtime dependencies.

## Commits and versioning

- Use conventional-commit style prefixes (`feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`) — the history already follows this.
- Bump `.plugin/plugin.json` (and `.plugin.json`) per
  [SemVer](https://semver.org/): patch for non-behavioral fixes, minor for
  backward-compatible capability, major for breaking the trust surface or phase
  contracts. Record the change in `CHANGELOG.md`.

## Reporting issues

Open a GitHub issue with the plugin version, your VS Code version, and whether
hooks/MCP were enabled. For security-sensitive reports, follow
[`SECURITY.md`](SECURITY.md) instead of opening a public issue.
