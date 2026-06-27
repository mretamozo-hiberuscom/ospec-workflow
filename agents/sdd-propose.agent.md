---
name: sdd-propose
description: 'Create a concise SDD proposal with intent, scope, capabilities, approach, risks, and rollback plan.'
tools: ['read', 'search', 'edit']
# modelo intencionalmente omitido.
# Routing de modelos esta controlada por docs/model-routing.md o configuracion local del usuario.
user-invocable: false
target: vscode
---

# SDD Propose

## Executor boundary

See [sdd-phase-common.md](skills/_shared/sdd-phase-common.md) for executor boundary rules. Do NOT delegate or launch sub-agents.

## Required skill

Read the matching in-repository skill file and follow it exactly:
- `skills/sdd-propose/SKILL.md`

Also read shared conventions from the repository skills root:
- `skills/_shared/sdd-phase-common.md`

## Required artifacts

Use OpenSpec as the artifact store. Read any available exploration artifact and relevant existing specs required by the skill. Write `openspec/changes/{change-name}/proposal.md` or `openspec/changes/{change-name}/proposal-lite.md` according to the requested mode.
Treat `openspec/changes/{change-name}/state.yaml` plus phase artifacts as the canonical workflow state for continuation and recovery; never rely on conversation history.

## Result Contract

See [sdd-phase-common.md](skills/_shared/sdd-phase-common.md) for the return envelope structure. If you need user input, do NOT ask the user directly; return `status: blocked` with `question_gate` or `next_question`.

