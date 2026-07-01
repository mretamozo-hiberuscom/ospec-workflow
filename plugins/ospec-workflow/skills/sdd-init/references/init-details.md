# SDD Init Details

## Brownfield Detection Checklist

A project is **brownfield** when BOTH conditions hold; absence of either means the brownfield branch does NOT activate.

**Condition 1 — Existing application code detected** (at least one of):
- Source files in recognized language extensions (`.js`, `.ts`, `.py`, `.rb`, `.go`, `.rs`, `.java`, `.cs`, `.php`, `.swift`, `.kt`) exist outside `openspec/`, `docs/`, and dotfiles/dot-directories.
- A `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, or `build.gradle` is present at the repo root.
- A non-empty `src/`, `lib/`, `app/`, or `pkg/` directory exists.

**Condition 2 — `openspec/specs/` is empty** (all of):
- `openspec/specs/` does not contain any `{domain}/spec.md` file.
- No archive-owned spec has been promoted yet.

**Exclusions — brownfield branch does NOT activate when**:
- The repo has no detectable code or stack (foundation flow owns that case).
- `openspec/config.yaml` already contains a `baseline` block (preserve it unchanged).
- `baseline.status: done` (all domains already specced; skip advisory).

## Testing Capability Checklist

- Test runner: `package.json` scripts/deps, `pyproject.toml`, `pytest.ini`, `go.mod`, `Cargo.toml`, `Makefile`.
- Test layers: unit runner; integration libraries (`testing-library`, `httpx`, `httptest`, `WebApplicationFactory`); E2E tools (`playwright`, `cypress`, `selenium`, `chromedp`).
- Coverage: `vitest --coverage`, `jest --coverage`, `c8`, `pytest-cov`, `go test -cover`, `coverlet`.
- Quality: linter, type checker, formatter commands.

## Skill Registry Scan Rules

- Scan user skills: `~/.claude/skills/`, `~/.config/opencode/skills/`, `~/.gemini/skills/`, `~/.cursor/skills/`, `~/.copilot/skills/`, and the parent directory of this skill file.
- Scan project skills: `{project-root}/.claude/skills/`, `{project-root}/.gemini/skills/`, `{project-root}/.agent/skills/`, and `{project-root}/skills/`.
- Skip `sdd-*`, `_shared`, and `skill-registry`; deduplicate by skill name, preferring project-level skills over user-level skills.
- Read each selected `SKILL.md`; if it exceeds 200 lines, focus on frontmatter plus Critical Patterns / Rules sections.
- Extract `name`, trigger text from `description`, full `SKILL.md` path, and compact rules.
- Generate compact rules as 5-15 actionable lines per skill: constraints, key patterns, breaking changes, and gotchas only. Do not include purpose, motivation, installation steps, full examples, or fluff.
- Scan project convention files: `agents.md`, `AGENTS.md`, project-level `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, and `copilot-instructions.md`.
- For index files such as `AGENTS.md`, extract referenced file paths and include both the index and referenced files in the registry.

## Skill registry responsibility

`sdd-init` creates the initial project skill registry when missing.

Normal registry freshness is handled by the `SessionStart` hook. Do not make every SDD command pay full registry discovery cost unless:

- registry is missing;
- fingerprint is stale;
- user explicitly requests reindex;
- project stack/config changed.

## LLM-First Skill Criteria

- Treat skills as runtime instruction contracts, not human documentation.
- Required structure: frontmatter, Activation Contract, Hard Rules, Decision Gates, Execution Steps, Output Contract, References.
- Keep `description` quoted, one physical line, trigger-first, and no longer than 250 characters.
- Target 180-450 body tokens; move examples, schemas, edge cases, and background into local `references/` or `assets/`.
- References must be local files and stable relative to the skill directory when possible.
- Quality gates: hard rules are observable, decision gates cover real forks, output contract states exactly what to return, and references resolve locally.

## OpenSpec Saves

```text
openspec/config.yaml
  context: detected project context summary
  strict_tdd: true|false
  testing: detected testing capabilities
  rules: phase-specific defaults

.ospec/cache/skill-registry.cache.json
  compact skill registry JSON cache
```

## OpenSpec Skeleton

```text
openspec/
├── config.yaml
├── specs/
└── changes/
    └── archive/
```

`config.yaml` should include concise context, `strict_tdd`, testing capabilities, and phase rules for proposal/spec/design/tasks/apply/verify/archive. Keep `context:` under 10 lines.

## Testing Capabilities Format

```markdown
## Testing Capabilities

**Strict TDD Mode**: {enabled/disabled}
**Detected**: {date}

### Test Runner
- Command: `{command}`
- Framework: {name}

### Test Layers
| Layer | Available | Tool |
|-------|-----------|------|
| Unit | ✅ / ❌ | {tool or —} |
| Integration | ✅ / ❌ | {tool or —} |
| E2E | ✅ / ❌ | {tool or —} |

### Coverage
- Available: ✅ / ❌
- Command: `{command or —}`

### Quality Tools
| Tool | Available | Command |
|------|-----------|---------|
| Linter | ✅ / ❌ | {command or —} |
| Type checker | ✅ / ❌ | {command or —} |
| Formatter | ✅ / ❌ | {command or —} |
```

## Output Templates

For each mode, include project, stack, persistence, Strict TDD Mode, Testing Capabilities table, artifacts created/saved, limitations where relevant, and next steps. Empty projects must recommend `sdd-foundation`; `none` mode must recommend enabling `openspec` persistence for multi-phase SDD work.
