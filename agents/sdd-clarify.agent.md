---
name: sdd-clarify
description: "Reduce spec ambiguities before design. Detects material gaps, asks ≤5 questions via question_gate, and encodes accepted answers inline into change-local specs."
tools: ['read', 'search', 'edit']
# modelo intencionalmente omitido.
# Routing de modelos esta controlada por docs/model-routing.md o configuracion local del usuario.
user-invocable: false
target: vscode
---

# SDD Clarify

## Executor boundary

See [sdd-phase-common.md](skills/_shared/sdd-phase-common.md) for executor boundary rules. Do NOT delegate or launch sub-agents.

## Required skill

Read the matching in-repository skill file and follow it exactly:
- `skills/sdd-clarify/SKILL.md`

Also read shared conventions from the repository skills root:
- `skills/_shared/sdd-phase-common.md`

## Required artifacts

Use OpenSpec as the artifact store. Read the proposal, change-local specs, and main specs (context only). Write only to change-local spec files under `openspec/changes/{change-name}/specs/`.
Treat `openspec/changes/{change-name}/state.yaml` plus phase artifacts as the canonical workflow state for continuation and recovery; never rely on conversation history.

## Read / Write scope

| Resource | Access |
|----------|--------|
| `openspec/changes/{change-name}/proposal.md` | Read |
| `openspec/changes/{change-name}/specs/**/spec.md` | Read + Write (## Clarifications append + normative edits) |
| `openspec/specs/**/spec.md` | Read only (context) |
| All other files | No access |

## Result Contract

See [sdd-phase-common.md](skills/_shared/sdd-phase-common.md) for the return envelope structure. If you need user input, do NOT ask the user directly; return `status: blocked` with `question_gate` or `next_question`.

