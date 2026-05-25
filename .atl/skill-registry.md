# Skill Registry

**Delegator use only.** Agents that launch sub-agents read this registry to resolve matching skills, then inject compact rules directly into sub-agent prompts. Sub-agents do not read this registry or individual `SKILL.md` files unless their launch prompt explicitly says to.

See `skills/_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
| --- | --- | --- |
| Angular code, components, services, signals, forms, DI, routing, SSR, accessibility, animations, styling, testing, CLI tooling | angular-developer | `%USERPROFILE%/.copilot/skills/angular-developer/SKILL.md` |
| New Angular app, Angular CLI project creation | angular-new-app | `%USERPROFILE%/.copilot/skills/angular-new-app/SKILL.md` |
| Creating, opening, or preparing PRs for review | branch-pr | `skills/branch-pr/SKILL.md` |
| Caveman mode, talk like caveman, use caveman, less tokens, be brief, /caveman | caveman | `skills/caveman/SKILL.md` |
| Write a commit, commit message, generate commit, /commit, /caveman-commit | caveman-commit | `skills/caveman-commit/SKILL.md` |
| /caveman:compress <filepath>, compress memory file | caveman-compress | `skills/caveman-compress/SKILL.md` |
| /caveman-help, caveman help, what caveman commands, how do I use caveman | caveman-help | `skills/caveman-help/SKILL.md` |
| Review this PR, code review, review the diff, /review, /caveman-review | caveman-review | `skills/caveman-review/SKILL.md` |
| PRs over 400 lines, stacked PRs, review slices | chained-pr | `skills/chained-pr/SKILL.md` |
| Writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs | cognitive-doc-design | `skills/cognitive-doc-design/SKILL.md` |
| PR feedback, issue replies, reviews, Slack messages, or GitHub comments | comment-writer | `skills/comment-writer/SKILL.md` |
| Go tests, go test coverage, Bubbletea teatest, golden files | go-testing | `skills/go-testing/SKILL.md` |
| Creating GitHub issues, bug reports, or feature requests | issue-creation | `skills/issue-creation/SKILL.md` |
| Judgment day, dual review, adversarial review, juzgar | judgment-day | `skills/judgment-day/SKILL.md` |
| New skills, agent instructions, documenting AI usage patterns | skill-creator | `skills/skill-creator/SKILL.md` |
| Implementation, commit splitting, chained PRs, keeping tests and docs with code | work-unit-commits | `skills/work-unit-commits/SKILL.md` |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### angular-developer
- Check the project's Angular version before giving version-sensitive guidance.
- Use Angular CLI for scaffolding components, services, directives, pipes, routes, guards, resolvers, and similar artifacts.
- Prefer modern Angular patterns: signals, signal inputs/outputs, `inject()`, standalone APIs, and version-appropriate forms.
- For Angular v21+ new forms, prefer Signal Forms unless project context says otherwise.
- Run `ng build` after generated Angular code and fix build errors before finishing.
- Consult local Angular references for components, routing, DI, forms, styling, testing, and CLI details.

### angular-new-app
- Confirm Angular CLI availability first; if absent, ask before global install.
- Create apps with `npx ng new <app-name> ... --interactive=false --ai-config=<agent>`.
- Choose flags from user requirements: routing, SSR, style format, prefix, and tests.
- Prefer `--ai-config` matching the active environment; use `copilot` here unless context says otherwise.
- Do not start the app immediately; build features first, then ask before serving.
- Use Angular CLI generators for new artifacts and record generated paths.

### branch-pr
- Every PR must link an approved issue with `Closes/Fixes/Resolves #N`.
- The linked issue must have `status:approved` before PR creation.
- Every PR must have exactly one `type:*` label matching the PR type.
- Branch names must match `type/description` with lowercase `a-z0-9._-`.
- Use Conventional Commits with English `type` and Spanish imperative description; never add `Co-Authored-By` trailers.
- Run required checks, including shellcheck for changed shell scripts, before merge readiness.

### caveman
- Apply only when the user activates caveman mode, asks for fewer tokens, or invokes `/caveman`.
- Preserve technical accuracy, exact symbols, errors, code blocks, commands, paths, and inline code.
- Remove filler, pleasantries, hedging, redundant phrasing, and long setup.
- Use `Thing. Cause. Fix.` style; fragments are fine when clear.
- Do not caveman-compress specs, designs, PR text, commits, or persisted artifacts unless explicitly asked.
- Use normal precise prose for security warnings, irreversible actions, or ambiguous multi-step instructions.

### caveman-commit
- Generate only the commit message; do not stage, commit, amend, or edit files.
- Use Conventional Commits: `<type>(<scope>): <imperative Spanish summary>`.
- Prefer subject <=50 chars, hard cap 72 chars.
- Write subject and body in Spanish; use imperative verbs like `añade`, `corrige`, `elimina`.
- Never add `Co-Authored-By`, AI attribution, emojis, `I`, `we`, or `this commit`.
- Add body only for non-obvious why, breaking changes, migrations, security fixes, reverts, or linked issues.
- Return only the commit message in a fenced text block.

### caveman-compress
- Require explicit `/caveman:compress <filepath>` or equivalent user request.
- Compress only prose files: `.md`, `.txt`, or extensionless memory files.
- Never compress source, config, lock, env, SQL, shell, HTML, XML, JSON, YAML, TOML, CSS, or generated files.
- Preserve code blocks, inline code, URLs, markdown links, paths, commands, proper nouns, dates, versions, numbers, and frontmatter exactly.
- Back up the original as `<filename>.original.md` before overwrite; never compress `.original.md`.
- Prefer running `python -m scripts <absolute_filepath>` from `skills/caveman-compress`.
- Stop if validation fails or protected regions changed.

### caveman-help
- One-shot help only; do not activate, deactivate, or persist caveman mode.
- Keep output compact and command-focused.
- Show exact commands: `/caveman`, `/caveman lite`, `/caveman ultra`, `/caveman wenyan`, `/caveman-review`, `/caveman-commit`, `/caveman:compress <file>`.
- Mention deactivation with `stop caveman` or `normal mode`.
- State default precedence when relevant: `CAVEMAN_DEFAULT_MODE` > `~/.config/caveman/config.json` > `full`.
- Do not write files, flags, config, or run compression scripts.

### caveman-review
- Apply only to PR, diff, patch, or explicit `/caveman-review` review output.
- Lead with findings ordered by severity.
- Format simple findings as `<file>:L<line>: <prefix> <problem>. <fix>.`
- Use prefixes `bug:`, `risk:`, `nit:`, and `q:`.
- Do not praise, restate the diff, hedge, or use `consider` for required fixes.
- Use normal prose for security findings, architecture disputes, or onboarding explanations.

### chained-pr
- Split PRs over 400 changed lines unless a maintainer accepts `size:exception`.
- Keep each PR to one deliverable work unit with its tests/docs.
- State start, end, dependencies, follow-up work, and out-of-scope items in every chained PR.
- Use stacked-to-main when slices can land independently.
- Use feature-branch chain when integration must happen before main.
- Treat polluted diffs as base bugs; retarget or rebase until the diff is clean.

### cognitive-doc-design
- Lead with the answer, decision, or action; put context after.
- Use progressive disclosure: happy path first, details and edge cases later.
- Chunk related information into short sections with clear headings.
- Prefer tables, checklists, and examples over dense prose.
- For PR docs, state review order, out-of-scope items, and previous/next PR links when chained.
- Optimize docs for reviewer verification, not narrative completeness.

### comment-writer
- Start with the actionable point; skip long recap.
- Write like a thoughtful teammate: warm, direct, short.
- Include technical why when asking for a change.
- Comment on the highest-value issue, not every tiny preference.
- Match the thread language.
- Do not use em dashes.

### go-testing
- Prefer table-driven tests with `t.Run(tt.name, ...)` for multiple cases.
- Test behavior and state transitions, not implementation trivia.
- Use `t.TempDir()` for filesystem tests.
- Skip slow or external integration tests under `testing.Short()`.
- For Bubbletea, test `Model.Update()` directly; use `teatest` only for interactive flows.
- Golden files must be deterministic; update only through the repo `-update` path and rerun without `-update`.

### issue-creation
- Search existing issues before creating a new one.
- Use the correct GitHub issue template; blank issues are not allowed.
- New issues get `status:needs-review`; PRs require maintainer-added `status:approved`.
- Questions go to Discussions, not issues.
- Fill all required template fields and pre-flight checkboxes.
- Use bug report for defects and feature request for enhancements.

### judgment-day
- Use only when explicitly asked for Judgment Day, dual review, adversarial review, or `juzgar`.
- Resolve and inject matching project standards before launching judges.
- Launch two blind judges in parallel with identical target and criteria; wait for both.
- Confirm only overlapping CRITICAL or real WARNING findings; one-judge findings are suspect.
- Ask before fixing Round 1 confirmed issues.
- Re-judge with both judges after fixes; terminal states are only `JUDGMENT: APPROVED` or `JUDGMENT: ESCALATED`.

### skill-creator
- Create a skill only for reusable LLM behavior, project-specific conventions, complex workflows, or real decision trees.
- Follow `skills/skill-creator/references/skill-style-guide.md` before fallback rules.
- Frontmatter needs one-line quoted trigger-first `description`, `license`, `metadata.author`, and `metadata.version`.
- Keep body concise: target 180-450 tokens, recommended max 700, hard max 1000.
- Use required section order: Activation Contract, Hard Rules, Decision Gates, Execution Steps, Output Contract, References.
- Put templates in `assets/`, conceptual detail in `references/`, and do not add a `Keywords` section.

### work-unit-commits
- Commit by deliverable behavior, fix, migration, or docs unit, not by file type.
- Keep tests with the behavior they verify.
- Keep docs with the user-visible change they explain.
- Keep the Conventional Commit type in English, but write subject and body in Spanish imperative prose.
- Each commit should be understandable, independently reviewable, and reasonably rollbackable.
- If a PR approaches 400 changed lines, promote work units into chained PR slices.
- Use SDD workload forecast and cached delivery strategy before oversized implementation.

## Project Conventions

| File | Path | Notes |
| --- | --- | --- |
| README.md | `README.md` | Repository overview and maintenance rules. |
| sdd-common.instructions.md | `instructions/sdd-common.instructions.md` | Shared SDD protocol and skill-loading compatibility. |
| sdd-openspec.instructions.md | `instructions/sdd-openspec.instructions.md` | OpenSpec persistence and artifact paths. |
| sdd-strict-tdd.instructions.md | `instructions/sdd-strict-tdd.instructions.md` | Strict TDD rules for apply and verify phases. |

Read the convention files listed above for project-specific patterns and rules.
