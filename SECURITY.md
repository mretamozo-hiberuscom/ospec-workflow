# Security Policy

## Trust surface

This project is a VS Code Agent Plugin that ships **locally executing code**:

- **Hooks** (`hooks/hooks.json` → `scripts/hooks/*.js`) run Node.js on session
  lifecycle events.
- **MCP servers** (`.mcp.json`) launch local processes (`npx` for Context7,
  `uvx` for MarkItDown).

Review these before enabling the plugin. The installation guide
([`docs/plugin-installation.md`](docs/plugin-installation.md)) documents how to
run in a no-hooks / inspection-only mode.

## Supported versions

Only the latest released `2.x` version receives fixes. The version tracks
`.plugin/plugin.json`.

## Reporting a vulnerability

Do **not** open a public issue for security problems. Report privately via
GitHub Security Advisories ("Report a vulnerability" on the repository's
Security tab), or by email to the maintainer listed in `.plugin/plugin.json`.

Please include:

- Affected version and component (hook script, MCP config, manifest, or prompt).
- Reproduction steps and impact (e.g., local code execution, data exposure).
- Any suggested remediation.

You can expect an acknowledgement within a reasonable timeframe. Coordinated
disclosure is appreciated: give us a chance to ship a fix before publishing.

## Scope notes

- Never put secrets, API keys, or credentials into prompts or
  `vscode/askQuestions` answers — they enter model context.
- `CONTEXT7_API_KEY` should be provided only through the secure VS Code input
  prompt, never in chat text or committed files.
