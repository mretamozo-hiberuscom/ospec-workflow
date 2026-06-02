---
name: sdd-init
description: "Trigger: sdd init, iniciar sdd, openspec init. Initialize SDD context, testing capabilities, registry, and persistence."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "3.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `sdd-init` sub-agent using your platform's delegation primitive
> (e.g., `task(...)`, sub-agent invocation, etc.). This skill is for EXECUTORS
> only.

## Activation Contract

Run this phase when the orchestrator/user asks to initialize SDD in a project. You are the phase executor: do the work yourself, do not delegate, and do not behave like the orchestrator.

## Hard Rules

- Detect the real stack, conventions, architecture, testing tools, and persistence mode; never guess.
- In `openspec` mode, follow `../_shared/openspec-convention.md` and write file artifacts.
- In `openspec` mode, treat OpenSpec files on disk as canonical workflow state for continuation and recovery; never rely on conversation history.
- In `none` mode, return detected context only; write no SDD artifacts except the registry if required.
- Always persist testing capabilities in `openspec/config.yaml` `testing:` when mode is `openspec`.
- Always build `.atl/skill-registry.md`.
- If `openspec/` already exists, report what exists and ask before updating it.

## Decision Gates

| Input | Action |
|---|---|
| `mode=openspec` | Create/update openspec bootstrap files only. |
| `mode=none` | Return detected context only; write no SDD artifacts except registry if required. |
| strict TDD marker/config found | Use that value. |
| no marker/config but test runner exists | Default `strict_tdd: true`. |
| no test runner | Set `strict_tdd: false` and explain unavailable. |

## Execution Steps

1. Inspect project files (`package.json`, `go.mod`, `pyproject.toml`, CI, lint/test config) and summarize stack/conventions.
2. Detect test runner, test layers, coverage, linter, type checker, and formatter.
3. Resolve Strict TDD from agent marker, `openspec/config.yaml`, detected runner fallback, or no-runner fallback.
4. Initialize persistence for the resolved mode.
5. Build `.atl/skill-registry.md` using the skill-registry scan rules.
6. Persist testing capabilities and project context.
7. Return the structured initialization envelope.

## Output Contract

Return a structured result with these fields:
- `status`: `success` | `blocked` | `partial`
- `executive_summary`: one-sentence description of what was initialized
- `artifacts`: OpenSpec paths and registry paths written
- `next_recommended`: `sdd-foundation` for empty projects, otherwise `sdd-explore` or `sdd-new`
- `risks`: warnings about detected stack, Strict TDD status, or persistence setup
- `skill_resolution`: `injected`, `fallback-registry`, `fallback-path`, or `none`

Include project, stack, persistence mode, Strict TDD status, testing capability table, and saved paths in the detailed body.

## References

- [references/init-details.md](references/init-details.md) — detection checklist, config skeleton, and output templates.
- `../_shared/openspec-convention.md` — openspec layout and rules.
