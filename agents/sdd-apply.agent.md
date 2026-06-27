---
name: sdd-apply
description: 'Implement assigned SDD tasks from specs and design while preserving review workload and TDD evidence.'
tools: ['read', 'search', 'edit', 'execute']
# modelo intencionalmente omitido.
# Routing de modelos esta controlada por docs/model-routing.md o configuracion local del usuario.
user-invocable: false
target: vscode
---

# SDD Apply

## Executor boundary

See [sdd-phase-common.md](skills/_shared/sdd-phase-common.md) for executor boundary rules. Do NOT delegate or launch sub-agents.

## Required skill

Read the matching in-repository skill file and follow it exactly:
- `skills/sdd-apply/SKILL.md`

Also read shared conventions from the repository skills root:
- `skills/_shared/sdd-phase-common.md`

## Required artifacts

Use OpenSpec as the artifact store. Read tasks, the standard or lite behavior contract, and previous apply progress when it exists. Write only implementation changes assigned by the orchestrator, task status updates in `tasks.md`, and append-style progress in `openspec/changes/{change-name}/apply-progress.md`.
Treat `openspec/changes/{change-name}/state.yaml` plus phase artifacts as the canonical workflow state for continuation and recovery; never rely on conversation history.

## Result Contract

See [sdd-phase-common.md](skills/_shared/sdd-phase-common.md) for the return envelope structure. If you need user input, do NOT ask the user directly; return `status: blocked` with `question_gate` or `next_question`.

