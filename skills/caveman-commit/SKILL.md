---
name: caveman-commit
description: "Trigger: write a commit, commit message, generate commit, /commit, /caveman-commit. Generate terse Conventional Commits messages."
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
---

## Activation Contract

Load when the user asks for a commit message or invokes `/commit` or `/caveman-commit`. Apply only to commit-message generation.

## Hard Rules

- Use Conventional Commits: `<type>(<scope>): <imperative Spanish summary>`.
- Prefer subject length <=50 chars; hard cap 72 chars.
- Write the summary in Spanish imperative: `añade`, `corrige`, `elimina`; never participles like `añadido`, gerunds like `añadiendo`, or infinitives like `añadir`.
- Do not add `Co-Authored-By`, AI attribution, emojis, "I", "we", or "this commit". NEVER name any model or tool (Claude, Claude Code, Anthropic, GPT, OpenAI, Codex, Copilot, Gemini, etc.) as author or generator. See `rules/no-model-attribution.instructions.md`.
- Add a Spanish body only for non-obvious why, breaking changes, migrations, security fixes, reverts, or linked issues.
- Wrap body at 72 chars. Use `BREAKING CHANGE:` for breaking changes.
- Do not stage, commit, amend, or modify files.

## Decision Gates

| Change | Commit shape |
| --- | --- |
| Obvious small change | Subject only. |
| Non-obvious why | Subject plus short body. |
| Breaking change | `!` in subject plus `BREAKING CHANGE:` body. |
| Security, migration, revert | Body required. |

## Execution Steps

1. Inspect the provided diff or staged changes when available.
2. Choose the narrowest correct type and optional scope.
3. Write the shortest accurate Spanish imperative subject.
4. Add body only when the future reader needs context not visible in the diff.

## Output Contract

Return only the commit message in a fenced text block.

## References

- None.
