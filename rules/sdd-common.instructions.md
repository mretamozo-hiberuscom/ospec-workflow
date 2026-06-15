---
description: 'Shared SDD protocol for Copilot orchestrator and phase agents.'
applyTo: 'agents/**/*.agent.md'
---

> Plugin-bundled instruction: VS Code's plugin creation flow generated `rules/` for selected instructions. Keep this file in sync with `.github/instructions/sdd-common.instructions.md`, which is the workspace mirror used while editing this repo.

# SDD Common Protocol

Use this file as a compact shared protocol. The detailed source contracts remain in `agents.md`, `AGENTS.md`, `skills/sdd-*/SKILL.md`, and `skills/_shared/*.md`.

## Boundaries

- `sdd-orchestrator` coordinates phases and may invoke allowlisted phase agents.
- Internal phase agents are executors. They do their assigned phase work themselves and do not launch subagents.
- Phase agents must not call recursive or nested subagent orchestration unless the orchestrator explicitly owns that step.
- Do not create or modify Copilot workspace folders as part of this bundle.

## Empty Project Foundation

- If `openspec/config.yaml` exists but says `project.status: empty`, stack arrays are empty, or architecture is `none-detected`, route new-project work through `sdd-foundation` before normal SDD changes.
- `sdd-foundation` may write foundation docs and update `openspec/config.yaml`; it must not create application code or scaffolds.
- When `sdd-foundation` returns `blocked` with `next_question`, surface that single question and stop.

## Skill loading compatibility

1. Use `Project Standards` already injected in the launch prompt.
2. Otherwise use the orchestrator session cache when supplied.
3. Otherwise read `.ospec/cache/skill-registry.cache.json`.
4. Otherwise load exact `SKILL.md` fallback paths when supplied.
5. If no source exists, continue with phase rules and report `skill_resolution: none`.
6. Phase agents must report `skill_resolution` in their result envelope.
7. Communication skills affect assistant replies, not persisted SDD artifacts. Task-specific variants apply only to their output type. File-transform skills require explicit user invocation.

## Communication language

- The orchestrator and every phase agent write user-facing prose in the user's language. The orchestrator detects it once per session and forwards a `Reply language: {language}` line in each sub-agent launch prompt; sub-agents otherwise default to English because they never see the user's messages.
- This governs assistant replies only — `executive_summary`, `detailed_report`, and user-facing question text. It does NOT alter persisted SDD artifacts, code, identifiers, file paths, or Conventional-Commit types.

## Review workload guard

Protect reviewer cognitive load with a 400 changed-line default budget. `sdd-tasks` must include these exact lines near the top of `tasks.md`:

```text
Decision needed before apply: Yes|No
Chained PRs recommended: Yes|No
Chain strategy: stacked-to-main|feature-branch-chain|size-exception|pending
400-line budget risk: Low|Medium|High
```

`sdd-apply` must not start oversized work unless the orchestrator provides a resolved delivery path: chained/stacked slice or accepted `size:exception`.

## Return envelope

Every phase returns:

- `status`: `success`, `partial`, or `blocked`
- `executive_summary`: 1-3 sentences
- `artifacts`: paths written or `inline`
- `next_recommended`: next phase or `none`
- `risks`: discovered risks or `None`
- `skill_resolution`: `injected`, `fallback-registry`, `fallback-path`, or `none`

`sdd-foundation` may also return `open_questions` and one `next_question` when blocked.
