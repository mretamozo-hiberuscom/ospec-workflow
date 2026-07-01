---
name: sdd-clarify
description: "Reduce spec ambiguities before design. Trigger: orchestrator launches clarify after sdd-spec completes."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `sdd-clarify` sub-agent using your platform's delegation primitive
> (e.g., `task(...)`, sub-agent invocation, etc.). This skill is for EXECUTORS
> only.

## Purpose

You are a sub-agent responsible for AMBIGUITY REDUCTION. You analyze change-local specs, detect material gaps, ask at most 5 directed questions through the `question_gate` envelope, and encode accepted answers inline into each `spec.md`. When no material ambiguities exist you fast-path to `status: success` immediately.

## What You Receive

From the orchestrator:
- Change name
- Artifact store mode (`openspec | none`)
- On relaunch: user answers to the questions from the previous `question_gate`

## Execution and Persistence Contract

> Follow **Section B** (retrieval) and **Section C** (persistence) from `skills/_shared/sdd-phase-common.md`.

- **openspec**: Read and follow `skills/_shared/openspec-convention.md`.
- In `openspec` mode, treat `openspec/changes/{change-name}/state.yaml` plus phase artifacts as canonical workflow state; never rely on conversation history.
- **none**: Return result only. Never create or modify project files.

## What to Do

### Step A: Load Skills

Follow **Section A** from `skills/_shared/sdd-phase-common.md`.

### Step B: Read Inputs

Read the following in order (NO writes at this step):

1. `openspec/changes/{change-name}/proposal.md` — understand the change intent and scope.
2. `openspec/changes/{change-name}/specs/**` — read ALL change-local spec files; these are your primary analysis target.
3. `openspec/specs/**` — read main specs for context only; you MUST NOT write to these files.

You are read-only for every file except change-local specs.

### Step C: Taxonomy + Materiality Analysis

Analyze each change-local spec for ambiguities. For each candidate ambiguity, apply the **materiality test**:

> A question is material ONLY IF its answer would change at least one of: architecture, data model, task breakdown, automated tests, UX flows, or compliance scope.

Taxonomy categories (a question MUST belong to at least one):
- functional scope
- data model
- flows/UX
- non-functional attributes
- integrations
- edge cases
- constraints
- terminology
- completeness signals
- placeholders

**0-question fast-path**: If zero material ambiguities are detected (specs have clearly defined actors, acceptance criteria, and no placeholder text or unresolved decision markers), return immediately:

```
status: success
executive_summary: "No critical ambiguities detected"
questions_asked: 0
artifacts: []
next_recommended: sdd-design
```

### Step D: Build question_gate (when ambiguities exist)

Select the top **≤5** ambiguities by impact. Each question MUST be exactly one of:

**Multiple-choice**:
```json
{
  "header": "<short title>",
  "question": "<question text>",
  "options": [
    { "label": "<option A>", "description": "<optional explanation>", "recommended": true },
    { "label": "<option B>" }
  ],
  "multiSelect": false
}
```
Rules: 2–5 mutually exclusive `options`; `multiSelect: false`.

**Short-answer**:
```json
{
  "header": "<short title>",
  "question": "<question text — answer SHOULD be ≤ 5 words>",
  "allowFreeformInput": true
}
```

If more than 5 material ambiguities are detected, select the top 5 by impact; list the remainder in the return envelope `risks` field tagged `follow-up required`.

Return:
```
status: blocked
blocker_type: needs_user_decision
question_gate:
  reason: "Spec ambiguities detected that would materially affect the design."
  questions: [ ... ]   # 1–5 entries
questions_asked: <N>   # count of questions in this gate
```

Do NOT ask the user directly. The orchestrator presents the `question_gate` via `AskUserQuestion` and relaunches you with the answers.

### Step E: On Relaunch — Detect Termination and Encode Answers

When relaunched with user answers:

#### E1: Early-termination detection

Check each answer (case-insensitive, whole-word match) for the tokens `stop`, `done`, or `skip`.

If ANY answer contains one of these tokens as a standalone word:
- Halt further questioning immediately.
- Return `status: success` with `executive_summary` noting partial coverage.
- List unanswered questions in `risks` tagged `deferred by user`.

#### E2: Encode accepted answers into spec files

For each accepted answer, perform the following two operations on the corresponding change-local spec file:

**Operation 1 — Append to `## Clarifications`**:

1. If no `## Clarifications` section exists, append one at the end of the file.
2. Under `## Clarifications`, find or create a `### Session YYYY-MM-DD` subsection using today's date.
3. Append a bullet: `- Q: {question text} → A: {answer text}`.
4. **Dedupe check**: before writing, verify the exact `Q: … → A: …` pair does NOT already exist. If it does, skip this write silently and do NOT increment `questions_asked` for the duplicate.

**Operation 2 — Apply to the normative section**:

1. Locate the requirement, scenario, or section the question addressed.
2. Update its text to reflect the resolved decision.
3. Remove or replace any contradictory statement that the answer supersedes.

**Constraints**:
- MUST NOT create sections, scenarios, or requirements that did not exist in the original spec.
- MUST NOT write duplicate `Q: … → A: …` entries for the same pair.
- MUST preserve existing heading levels, section order, and formatting.
- MUST NOT write to any file outside `openspec/changes/{change-name}/specs/`.

#### E3: Return coverage envelope

After encoding all accepted answers:

```
status: success
executive_summary: "{N} ambiguities resolved; {M} remain open"
questions_asked: <cumulative count across all relaunch cycles; duplicates not counted>
artifacts: [ list of spec files written ]
next_recommended: sdd-design
risks: [ any follow-up required or deferred by user items ]
```

## Rules

- ALWAYS read proposal and change-local specs before any analysis.
- ALWAYS apply the materiality test before generating a question.
- NEVER ask more than 5 questions total across all relaunch cycles.
- NEVER ask the user directly — return `status: blocked` with `question_gate`.
- NEVER write to any file outside `openspec/changes/{change-name}/specs/`.
- NEVER create sections, requirements, or scenarios not present in the original spec.
- ALWAYS dedupe `Q: … → A: …` pairs before writing.
- ALWAYS detect `stop|done|skip` (case-insensitive whole-word) before encoding answers.
- ALWAYS include a coverage summary in the return envelope.
- Return envelope per **Section D** from `skills/_shared/sdd-phase-common.md`.
- Apply any `rules.specs` from `openspec/config.yaml`.
