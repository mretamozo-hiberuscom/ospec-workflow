---
description: 'OpenSpec persistence and artifact paths for SDD Copilot agents.'
applyTo: 'openspec/**'
---

> Plugin-bundled instruction: VS Code's plugin creation flow generated `rules/` for selected instructions. Keep this file in sync with `.github/instructions/sdd-openspec.instructions.md`, which is the workspace mirror used while editing this repo.

# OpenSpec Persistence Protocol

Use the repository's OpenSpec convention unchanged. Do not invent Copilot-specific artifact paths.

## Modes

| Mode       | Read from                   | Write to             |
| ---------- | --------------------------- | -------------------- |
| `openspec` | Filesystem artifacts        | Filesystem artifacts |
| `none`     | Prompt/orchestrator context | Inline response only |

Default to `openspec` only when the orchestrator/user selected persisted artifacts. In `none` mode, do not create or modify project files.

## Artifact paths

| Artifact                | Path                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| Project context/testing | `openspec/config.yaml`                                           |
| Foundation docs         | `docs/product/brief.md`, `docs/product/functional-scope.md`, `docs/architecture/technical-baseline.md`, `docs/roadmap.md` |
| Exploration             | `openspec/changes/{change-name}/exploration.md`                  |
| Proposal                | `openspec/changes/{change-name}/proposal.md`                     |
| Lite proposal           | `openspec/changes/{change-name}/proposal-lite.md`                |
| Spec delta              | `openspec/changes/{change-name}/specs/{domain}/spec.md`          |
| Design                  | `openspec/changes/{change-name}/design.md`                       |
| Tasks                   | `openspec/changes/{change-name}/tasks.md`                        |
| Apply progress          | `openspec/changes/{change-name}/apply-progress.md`               |
| Verify report           | `openspec/changes/{change-name}/verify-report.md`                |
| Archive report          | `openspec/changes/{change-name}/archive-report.md` before moving |
| DAG state               | `openspec/changes/{change-name}/state.yaml`                      |
| Archived change         | `openspec/changes/archive/YYYY-MM-DD-{change-name}/`             |

## Write rules

- Create the change directory before writing artifacts.
- If a target artifact already exists, read it first and update it; do not blindly overwrite.
- Preserve raw project/source documents under `docs/references/raw/` before writing processed summaries under `docs/references/processed/`.
- If `apply-progress.md` exists, merge previous progress with new progress.
- `proposal-lite.md` is valid only for lite-mode changes. If the change escalates, keep it and create `proposal.md` for the full workflow.
- Archive only after verification has no CRITICAL issues and any `PASS WITH WARNINGS` risks are explicitly accepted or converted into follow-up work.
- The archive is an audit trail. Never delete archived changes.

## Runtime hooks

Plugin hooks may maintain cache, observability, session summaries, and tool safety checks.

Hooks are support infrastructure. They must not replace OpenSpec as the canonical workflow state.

## Prompt boundaries

Dynamic payloads passed to agents must be clearly delimited:

- `<user-intent>`
- `<artifact-paths>`
- `<project-standards>`
- `<approval-context>`
- `<runtime-hints>`

Durable instructions must not be mixed with user-provided or generated payloads.

## Approval evidence

Blocking workflow decisions are valid only when they come from:

1. `vscode/askQuestions` result in the current orchestration step; or
2. an explicit approval entry persisted in `openspec/changes/{change-name}/state.yaml`.

Do not infer approvals from plain chat summaries.
