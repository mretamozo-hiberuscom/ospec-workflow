# Domain Spec: generator

## Overview

The generator is the build pipeline that transforms the canonical source plugin tree into target-native file distributions for four supported targets: `claude`, `vscode`, `github-copilot`, and `opencode`. It is composed of a pure transform layer (`scripts/lib/target-transform.js`) and an IO shell (`scripts/configure/cli.js`) that handles filesystem reads, writes, and validation.

## Source files

- `scripts/configure/cli.js` — IO shell: loads source tree, invokes transform, writes output, runs validator
- `scripts/lib/target-transform.js` — pure transform: reshapes files according to target profile
- `scripts/lib/target-profiles/claude.js` — Claude Code target profile
- `scripts/lib/target-profiles/vscode.js` — VS Code target profile
- `scripts/lib/target-profiles/github-copilot.js` — GitHub Copilot target profile
- `scripts/lib/target-profiles/opencode.js` — opencode target profile
- `scripts/lib/target-profiles/opencode-plugin.js` — opencode JS plugin source shim
- `scripts/lib/frontmatter.js` — YAML-lite frontmatter parser / serializer
- `scripts/lib/model-resolver.js` — model resolution from models.yaml data
- `scripts/configure/validate-github-copilot.js` — GitHub Copilot output validator
- `scripts/configure/validate-opencode.js` — opencode output validator
- `scripts/configure/claude-marketplace.js` — Claude marketplace build helper

## Scenarios

### Scenario 1: Source tree loading

Given the generator is invoked with a `sourceDir` and a set of `SOURCE_ROOTS`,
When `loadTree` runs,
Then it MUST collect files from each root that exists, recursing into directories and reading file contents as UTF-8 strings into `{ path, content }` objects.
And it MUST additionally invoke `gatherRuntimeScripts` to include the runtime hook scripts and their transitive `require` dependencies (resolved statically by regex, no dynamic evaluation).
And it MUST NOT include test files (`.test.js`) or generator-only modules (`target-*`, `frontmatter`, `model-resolver`, `configure/`) in the runtime script bundle.
And it MUST silently skip any root that does not exist on disk.

The canonical `SOURCE_ROOTS` are:
`.claude-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`, `agents/`, `commands/`, `rules/`, `skills/`.

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
8. Passthrough (skills, shared docs with `.md` extension) — tool name substitution in prose applied; binary/other files copied as-is.

And synthesized files (e.g. `opencode.json`, the opencode JS plugin shim) MUST be appended after the per-file pass.
And the output file array MUST be sorted deterministically by path (lexicographic ascending) regardless of OS filesystem read order.

### Scenario 3: Rules strategy dispatch

Given a profile with a `rules.strategy` field,
When a `rules/*.md` file is processed,
Then:
- If `strategy` is `"inline-into-orchestrator"`: the file MUST be dropped from output (content is folded into the orchestrator agent/skill by a separate collector).
- If `strategy` is `"to-instructions"`: the file MUST be emitted under `profile.rules.dir/` with the target extension and an `applyTo` frontmatter key added.
- If `strategy` is `"to-instructions-config"`: the file MUST be emitted under `profile.rules.dir/` and referenced from the synthesized config file (e.g. `opencode.json`); no `applyTo` key is added.

### Scenario 4: Orchestrator skill emission (Claude target)

Given the claude profile with `orchestrator.emitAs: "skill"`,
When the agent file matching `orchestrator.agent` (i.e. `agents/sdd-orchestrator.agent.md`) is processed,
Then the generator MUST emit it at `orchestrator.skillPath` (`skills/sdd-orchestrator/SKILL.md`),
And MUST prepend the collected rules content (from all `rules/*.md` files) into that file,
And MUST NOT also emit the agent file at its default agent path.

### Scenario 5: Tool name substitution

Given a target profile with a `toolMap` (abstract-name → target-name mapping),
When any `.md` file passes through the transform (agent, command, or passthrough),
Then every occurrence of an abstract tool name (e.g. `Read`, `Edit`, `Bash`, `Grep`, `Glob`, `Agent`, `AskUserQuestion`) in the prose MUST be replaced with the target-specific name.
And when an abstract name maps to an array (e.g. `edit: ["Edit", "Write"]`), prose references MUST collapse to the primary (first) name.

### Scenario 6: Model injection from models.yaml

Given a `models.yaml` file with a two-level map (phase × target columns),
When a target profile sets `model.format`,
Then the generator MUST parse `models.yaml` without any YAML library dependency (custom parser),
And MUST inject the resolved model name into each agent's frontmatter `model:` field.
And for the `claude` target with `format: "alias"`, model values MUST be emitted as alias strings.
And for the `opencode` target with `format: "provider-slug"`, model values MUST be emitted as provider-prefixed slugs (e.g. `anthropic/claude-opus-4-5`).
And if a model resolves to the `OMIT` sentinel, the `model:` field MUST be omitted entirely from the output frontmatter.

### Scenario 7: Hooks reshaping — nested format (Claude)

Given the claude profile with `hooks.shape: "nested"`,
When `hooks/hooks.json` is processed,
Then each event's array of hook entries MUST be wrapped in `[{ hooks: [...] }]`,
So the output JSON has the shape `{ hooks: { EventName: [{ hooks: [...] }], ... } }`.

### Scenario 8: Hooks reshaping — Copilot format

Given the github-copilot profile with `hooks.format: "copilot"`,
When `hooks/hooks.json` is processed,
Then:
- The output file MUST be placed at `profile.hooks.location` (`.github/hooks/hooks.json`).
- Event names MUST be remapped using `profile.hooks.eventMap` (e.g. `SessionStart` → `sessionStart`).
- Events with no entry in the event map (e.g. `PreCompact`) MUST be dropped.
- The `${CLAUDE_PLUGIN_ROOT}/` prefix in command strings MUST be stripped.
- Timeout fields MUST be renamed from `timeout` to `timeoutSec`.

### Scenario 9: opencode synthesis

Given the opencode profile,
When `synthesizeFiles` runs after the per-file pass,
Then the generator MUST produce:
1. `opencode.json` — containing `$schema`, `mcp` (transformed from `.mcp.json` entries into the opencode `{type, command, environment, enabled}` shape), and `instructions` (glob path referencing `.opencode/instructions/*.md`).
2. `.opencode/plugins/ospec.js` — the JS hook bridge shim (verbatim from `opencode-plugin.js`).
And `.mcp.json` itself MUST be dropped from the opencode output (consumed by the config synthesizer).

### Scenario 10: Stale artifact pruning

Given a prior generation run that produced files in `outDir`,
When `writeTree` runs with a new set of desired files,
Then it MUST identify every managed root (top-level directory/file owned by the generator),
And MUST delete any file in those roots that is NOT in the desired output set,
And MUST then prune any directory left empty after deletion.
And it MUST NOT delete or touch files or directories that the generator never produces (non-managed roots).
And it MUST NOT use a whole-directory `rmSync` to avoid destructive blast radius.

### Scenario 11: Validation gate

Given a target profile with a `validate` field (argv array),
When the generator finishes writing the output tree,
Then it MUST spawn the validator as a child process with `shell: false` (no shell interpretation of arguments),
And it MUST substitute the `{out}` placeholder in validator args with the actual output path.
And if the validator exits with non-zero status OR its stdout matches `/(\d+)\s+errors?,\s*(\d+)\s+warnings?/i` with any error or warning count > 0, the validation MUST be considered failed.
And it MUST be possible to skip validation via `--no-validate` flag.

### Scenario 12: CLI entry point

Given the CLI is invoked as `node scripts/configure/cli.js --target <target> [--out dir] [--source dir] [--no-validate]`,
When arguments are parsed,
Then:
- `--target` MUST be one of `claude`, `vscode`, `github-copilot`, `opencode`; an unknown target causes exit code 2.
- `--out` defaults to `dist/<target>` relative to cwd.
- `--source` defaults to cwd.
- If `--target` is missing or invalid, the CLI MUST write a usage hint to stderr and set `process.exitCode = 2`.
- On success, the CLI MUST print a summary of generated file paths to stdout.
- On validation failure, the validator's output MUST be forwarded to stdout/stderr and the CLI exit code MUST reflect the validator's exit code (non-zero).

## Invariants

- The transform function (`transform`) MUST be pure: it MUST NOT read from the filesystem, network, or process environment; the input `files` array MUST NOT be mutated.
- Output files MUST be sorted lexicographically by path so generation is deterministic across operating systems and CI runners.
- The runtime script bundler MUST resolve `require()` paths statically (regex match only) without executing the scripts.
- The custom `models.yaml` parser MUST have zero external runtime dependencies (no `yaml` / `js-yaml` package).
- Validator commands MUST always be spawned with `shell: false` to prevent path injection.
- Stale pruning MUST be scoped to managed roots only; unrelated destination files MUST NOT be removed.
