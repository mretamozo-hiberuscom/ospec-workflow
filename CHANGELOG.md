# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Plugin version tracks `.plugin.json` and `.claude-plugin/plugin.json`.

## [Unreleased]

## [2.4.4] - 2026-06-19

### Added
- Soporte para instalación global en `opencode`: añadido el script `npm run install:global:opencode` que compila el target, copia binarios, agentes, comandos, skills, instrucciones y plugins directamente en `~/.config/opencode/` e integra de forma automática los servidores MCP y reglas en `opencode.json`.
- Renombrado del agente en `opencode`: se traduce automáticamente `sdd-orchestrator` a `ospec-workflow` para mejorar la integración visual y el autocompletado con Tab en el cliente de OpenCode.
- Documentación detallada en el `README.md` y en `docs/plugin-installation.md` explicando las dos modalidades de instalación (local y global).

## [2.4.3] - 2026-06-19

### Fixed
- Claude agent visibility in VS Code: preserved `user-invocable: false` in the generated Claude agent frontmatter (previously stripped), preventing duplicate agent entries in VS Code and direct user-invocation in Claude Code.
- Setup tool resilience: updated `install-claude.js` and `cli.js` to fallback to Microsoft WinGet local package directories to find `claude.exe` when it is not present in the system PATH.
- Validator CLI compatibility: removed the unsupported `--strict` flag from the `claude plugin validate` command execution in `claude.js` profile, avoiding validation failures on standard installations.

## [2.4.2] - 2026-06-19

### Added
- Capability routing at launcher level (`ospec-hooks-launch.js`): Bypasses the Go binary and delegates to Node.js JS fallbacks for `session-start`, `pre-compact`, and `stop` hooks when running in `workspace-federated` backend mode.
- Hot path performance protection: skips configuration checks entirely for `pre-tool-use` and `subagent-stop` to avoid any I/O latency.
- Full unit test coverage in `ospec-hooks-launch.test.js` validating the routing logic and edge cases.

## [2.4.1] - 2026-06-16

### Fixed
- Hook runtime delivery: `hooks.json` invoked the compiled `ospec-hooks` binary
  directly, but that binary is gitignored and the publish workflow never built or
  bundled it, so it never reached the `release` branch — every install from
  `release` got a `hooks.json` pointing at a missing binary and all five hooks
  failed (`ospec-hooks: No such file or directory`). Hooks now run through
  `scripts/hooks/ospec-hooks-launch.js`, a Node launcher that prefers the
  per-platform Go binary and falls back to the Node hooks when none ships for the
  host. `publish-marketplace.yml` cross-compiles all four platform binaries
  (windows/amd64, darwin/arm64, darwin/amd64, linux/amd64) into the published tree.

## [2.4.0] - 2026-06-15

### Added
- `opencode` (opencode.ai / SST) target for the multi-target generator. Transforms
  the canonical source into opencode's native layout, verified against the official
  docs: agents to `.opencode/agents/*.md` (`mode: primary|subagent`, `tools:` as a
  map, `provider/model` slugs), commands to `.opencode/commands/*.md` (keep `agent:`
  routing; `${input:name}` → positional `$1`/`$2`, `${input}` → `$ARGUMENTS`), rules
  to `.opencode/instructions/*.md` referenced from `opencode.json`, and MCP folded
  into `opencode.json` (`mcp` with `type: local|remote`; VS Code `${input:NAME}`/
  `${NAME}` placeholders in env/header values rewritten to opencode's `{env:NAME}`).
  Because opencode has no
  shell-command hooks, the SDD runtime (`session-start` / `pre-tool-use`) is bridged
  through a JS plugin at `.opencode/plugins/ospec.js`. Gated by a dedicated Node
  validator (`scripts/configure/validate-opencode.js`) plus golden fixtures, wired
  into `node scripts/check.js`. Adds the `opencode` column to `models.yaml`.
- Phase `sdd-clarify` between `spec` and `design` to resolve design decisions early.
- GPT model routing tiers for `opencode` target in `models.yaml`.

### Changed
- Migrated the 5 hooks from JavaScript to a compiled Go binary (`ospec-hooks`), enhancing hook performance and robustness.
- Added path traversal validation for `transcript_path` and `cwd` inside the hooks runner.
- Handled hook event concurrency with file-based locking.
- Simplified installation with single commands per target (e.g. `npm run setup:claude`).
- Hardened multi-OS validation and workflow concurrency in CI.
- Unified routing dispatcher with intent-based routing and 4R review gate.

## [2.3.0] - 2026-06-12

### Fixed
- Claude target tool grants now match the official Claude Code tools reference.
  The `edit` abstract tool mapped only to `Edit` (modify-existing), so every phase
  agent was granted a toolset that could not create the artifacts its own prose
  tells it to `Write` (`proposal.md`, `design.md`, `tasks.md`, spec deltas, source
  and test files). `edit` now expands to `["Edit", "Write"]`, mirroring the existing
  `search → ["Grep", "Glob"]` one-to-many mapping.

### Changed
- `execute` maps to `["Bash", "PowerShell"]` for the Claude target so test and build
  commands run cross-OS: on Windows without Git Bash the `Bash` tool is unavailable
  and `PowerShell` is the native shell tool. Where one shell tool is absent it is
  simply not loaded, so the grant is harmless. Aligns the agent toolsets with the
  existing multi-OS validation workflow.

## [2.2.0] - 2026-06-12

### Added
- Multi-target plugin compatibility: a dependency-free generator
  (`scripts/configure/cli.js`) that transforms the canonical VS Code source into
  native trees for three targets — `claude` (a `.claude-plugin` bundle, gated by
  `claude plugin validate --strict`), `github-copilot` (the `.github/` layout:
  `agents/`, `prompts/`, `instructions/`), and `vscode` (identity). Includes a
  pure `target-transform` with declarative per-target profiles, context-aware
  tool-name substitution, path remapping and artifact drops, a tier-based
  `models.yaml` resolver, frontmatter helpers, the Claude orchestrator delivered
  as a skill, and committed golden fixtures. The source is never mutated; VS Code
  keeps loading it directly.
- YAML frontmatter (`name`, `description`) on the `agent-introspection` and
  `harness-audit` skills so the plugin validator stops warning.
- Brownfield bootstrap path: `sdd-baseline` agent, command, and skill to seed
  `openspec/specs/` with current-behavior specs in resumable per-domain batches.
- Baseline Advisory gate in the orchestrator for brownfield repos.
- Validation harness hardening: `node scripts/check.js` is now the single local
  and CI verification entry point, running native tests and generating GitHub
  Copilot output through the profile-level validator.
- GitHub Copilot distribution validator for required `.github/` layout, hook
  schema, frontmatter semantics, forbidden plugin residue, placeholder leaks,
  local absolute paths, and unexpected Markdown suffixes.
- Multi-OS GitHub Actions workflow (`validate-harness.yml`) covering Ubuntu,
  Windows, and macOS with Node.js 22.
- Canonical OSS files: `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, and this changelog.

### Fixed
- Installation docs drift: hooks are Node.js (not PowerShell) and the MCP
  surface documents both Context7 and MarkItDown.
- P0 harness safety: removed legacy `.atl` registry inheritance from runtime
  guidance, unified skill registry cache resolution, and hardened PreToolUse
  command inspection for unknown tools carrying command payloads.
- GitHub Copilot validation robustness: required paths now check file vs
  directory type before traversal, and residue checks catch case-insensitive
  `vscode` references.

## [2.1.0] - 2026-06-11

### Added
- Configurable model routing via `profiles/models/{default,cheap,premium}.yaml`;
  agents no longer hardcode a model name.
- Runtime lifecycle hooks (`SessionStart`, `PreToolUse`, `PreCompact`,
  `SubagentStop`, `Stop`) with a Node.js runtime under `scripts/hooks/` and a
  native `node --test` suite.
- Governance: blocking approvals persisted in `state.yaml` and delimited prompt
  boundaries separating intent, artifacts, standards, and approval context.
- Minimal default MCP policy (Context7 + MarkItDown), documented in
  `docs/mcp-policy.md`.

### Changed
- README documents the plugin runtime and standard/lite/fast-forward workflows.

## [2.0.0] - 2026-06-10

### Added
- Spec-Driven Development workflow as a VS Code Agent Plugin: `sdd-orchestrator`
  coordinator plus phase agents (`explore`, `propose`, `spec`, `design`, `tasks`,
  `apply`, `verify`, `archive`) and `sdd-foundation` for greenfield discovery.
- OpenSpec as the versionable source of truth for each change.
- Interactive workflow gates through `vscode/askQuestions`.
- Strict TDD mode when the project exposes a compatible test runner.

[Unreleased]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.4...HEAD
[2.4.4]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.3...v2.4.4
[2.4.3]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.2...v2.4.3
[2.4.2]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.1...v2.4.2
[2.4.1]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/releases/tag/v2.0.0
