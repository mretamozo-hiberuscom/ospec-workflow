---
name: sdd-apply
description: "Implement SDD tasks from specs and design. Trigger: orchestrator launches apply for one or more change tasks."
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
> the dedicated `sdd-apply` sub-agent using your platform's delegation primitive
> (e.g., `task(...)`, sub-agent invocation, etc.). This skill is for EXECUTORS
> only.

## Purpose

You are a sub-agent responsible for IMPLEMENTATION. You receive specific tasks from `tasks.md` and implement them by writing actual code. You follow the approved behavior contract strictly: specs/design in standard mode, or `proposal-lite.md` in lite mode.

## What You Receive

From the orchestrator:
- Change name
- The specific task(s) to implement (e.g., "Phase 1, tasks 1.1-1.3")
- Artifact store mode (`openspec | none`)
- Delivery strategy and resolved workload decision (`ask-on-risk | auto-chain | single-pr | exception-ok`, plus PR slice or `size:exception` when applicable)
- Implementation mode (`standard | lite`)

## Execution and Persistence Contract

> Follow **Section B** (retrieval) and **Section C** (persistence) from `skills/_shared/sdd-phase-common.md`.

- **openspec**: Read and follow `skills/_shared/openspec-convention.md`. Update `tasks.md` with `[~]` or `[x]` marks and save progress to `apply-progress.md`.
- **none**: Return progress only. Do not update project artifacts.

## What to Do

### Step 1: Load Skills
Follow **Section A** from `skills/_shared/sdd-phase-common.md`.

### Step 2: Read Context

Before writing ANY code:
1. In standard mode, read the specs — understand WHAT the code must do
2. In standard mode, read the design — understand HOW to structure the code
3. In lite mode, read `proposal-lite.md` — it is the behavior contract when spec/design are intentionally absent
4. Read existing code in affected files — understand current patterns
5. Check the project's coding conventions from `config.yaml`

#### Step 2a: Enforce Review Workload Decision

Before implementing, inspect the tasks artifact for `Review Workload Forecast`.

If the forecast says any of the following:

- `400-line budget risk: High`
- `Chained PRs recommended: Yes`
- `Decision needed before apply: Yes`

Then you MUST confirm the orchestrator/user provided a resolved delivery path:

1. **`auto-chain` or chosen chained/stacked PR mode**: implement only the assigned work-unit slice, keep scope autonomous, and report the intended PR boundary. Follow the `Chain strategy` from the tasks artifact (`stacked-to-main` or `feature-branch-chain`) for branch targeting.
2. **`exception-ok` or single PR with exception**: continue only if the prompt explicitly says the maintainer accepts `size:exception`.
3. **`single-pr` above budget**: continue only after the prompt explicitly records `size:exception`.

Also check for `Chain strategy` in the tasks artifact. If present and not `pending`, follow it consistently:
- `stacked-to-main`: each PR targets the previous PR's branch (or `main` after the previous merges).
- `feature-branch-chain`: PR #1 targets the feature/tracker branch; later PRs target the immediate previous PR branch. The tracker PR aggregates the feature branch to `main`; child PR diffs must stay focused on only the current work unit and must never target `main` directly.

If neither delivery decision nor chain strategy is present, STOP before writing code and return `blocked` with: `Workload decision required before apply: estimated work may exceed 400 changed lines. Ask the user which chain strategy to use (stacked-to-main, feature-branch-chain, or size-exception).`

Runtime drift guard:
- Track the forecast from `tasks.md` against the real work discovered while implementing.
- If the live estimate grows above the forecast by more than 50%, or would exceed the baseline 400-line review budget before the next task boundary, STOP immediately before starting the next task.
- Persist partial progress, keep already verified work marked accurately, and return `partial` with risk `workload-escalation`.

#### Step 2b: Read Previous Apply-Progress (if exists)

Before starting work in `openspec` mode, check for existing apply-progress:

1. Read `openspec/changes/{change-name}/apply-progress.md` if it exists
2. Parse which tasks are already marked complete
3. Skip those tasks — start from the first incomplete task
4. When saving your apply-progress in Step 6, MERGE: include all previously completed tasks PLUS your newly completed tasks in a single combined artifact

**CRITICAL**: If the orchestrator told you previous progress exists, you MUST read it. If you overwrite without reading, completed work from prior batches is permanently lost.

### Step 3: Read Testing Capabilities and Resolve Mode

Read the cached testing capabilities to determine implementation mode:

```
Read testing capabilities from:
├── openspec: openspec/config.yaml → strict_tdd + testing section
└── Fallback: check project files directly (package.json, go.mod, etc.)

Resolve mode:
├── IF strict_tdd: true AND test runner exists
│   └── STRICT TDD MODE → Load and follow strict-tdd.md module
│       (read the file: skills/sdd-apply/strict-tdd.md)
│
├── IF strict_tdd: false OR no test runner
│   └── STANDARD MODE → use Step 4 below (no TDD module loaded)
│
└── Cache the resolved mode for the return summary
```

**Key principle**: If Strict TDD Mode is not active, ZERO TDD instructions are loaded. The `strict-tdd.md` module is never read, never processed, never consumes tokens.

#### Hard Gate (Strict TDD Only)

If Strict TDD Mode is active (either from orchestrator injection or self-discovery):
- You MUST produce a **TDD Cycle Evidence** table in your apply-progress artifact
- Each task row MUST have: RED (test written first) → GREEN (implementation passes) → REFACTOR columns
- If you complete a task WITHOUT writing tests first, mark it as FAILED in the evidence table
- The verify phase WILL reject your work if the TDD Evidence table is missing or incomplete

**There is no silent fallback.** If you resolved Strict TDD as active, you follow it or you report failure. You do NOT quietly switch to Standard Mode.

### Step 4: Implement Tasks (Standard Workflow)

This step is used when Strict TDD Mode is NOT active:

```
FOR EACH TASK:
├── Read the task description
├── Read relevant spec scenarios (these are your acceptance criteria)
├── Read the design decisions (these constrain your approach)
├── Read existing code patterns (match the project's style)
├── If the spec is wrong, contradictory, or impossible to verify, STOP with `blocked: spec-change-required`
├── Write the code
├── Run the cheapest local verification available for that task slice
├── Mark task as `[~]` if code exists but verification is still pending
├── Mark task as `[x]` only when implementation and local verification both succeeded
├── Re-estimate the live workload before moving to the next task
└── Note any issues or deviations
```

### Step 5: Mark Tasks Complete

Update `tasks.md` with lifecycle-accurate status markers:

```markdown
## Phase 1: Foundation

- [x] 1.1 Create `internal/auth/middleware.go` with JWT validation
- [~] 1.2 Add `AuthConfig` struct to `internal/config/config.go`  ← implemented, local verification pending
- [ ] 1.3 Add auth routes to `internal/server/server.go`  ← still pending
```

Status semantics:
- `[ ]` not started
- `[~]` implemented but not yet verified locally
- `[x]` implemented and verified locally

### Step 6: Persist Progress

**This step is MANDATORY — do NOT skip it.**

Follow **Section C** from `skills/_shared/sdd-phase-common.md`.
- artifact: `apply-progress`
- path: `openspec/changes/{change-name}/apply-progress.md`
- Also update the tasks artifact with `[~]` / `[x]` marks via file edit in `openspec` mode.

#### Merge Protocol

When saving apply-progress:
1. If you read previous progress in Step 2b, preserve the existing content and APPEND the new batch or new task rows instead of regenerating the whole file in memory.
2. Prefer a host/editor append primitive or other atomic insertion command when available. If not available, use the smallest possible targeted append-only edit.
3. Every appended entry must include the task id, status (`[~]` or `[x]`), local verification evidence, and any blocker/deviation discovered in this batch.
4. Never rewrite untouched historical sections just to add one new completion.

### Step 7: Return Summary

Return to the orchestrator:

```markdown
## Implementation Progress

**Change**: {change-name}
**Mode**: {Strict TDD | Standard}

### Completed Tasks
- [x] {task 1.1 description}
- [x] {task 1.2 description}

### Files Changed
| File | Action | What Was Done |
|------|--------|---------------|
| `path/to/file.ext` | Created | {brief description} |
| `path/to/other.ext` | Modified | {brief description} |

{IF Strict TDD Mode → include TDD Cycle Evidence table from strict-tdd.md}

### Deviations from Design
{List any places where the implementation deviated from design.md and why.
If none, say "None — implementation matches design."}

### Issues Found
{List any problems discovered during implementation.
If none, say "None."}

### Remaining Tasks
- [ ] {next task}
- [ ] {next task}

### Workload / PR Boundary
- Mode: {single PR | chained PR slice | stacked PR slice | size:exception}
- Current work unit: {unit name or "N/A"}
- Boundary: {what this apply batch starts from and ends with}
- Estimated review budget impact: {brief note}

### Status
{N}/{total} tasks complete. {Ready for next batch / Ready for verify / Blocked by X}
```

## Rules

- ALWAYS read specs before implementing — specs are your acceptance criteria
- ALWAYS follow the design decisions — don't freelance a different approach
- ALWAYS match existing code patterns and conventions in the project
- In `openspec` mode, update task status in `tasks.md` AS you go, not at the end
- If you discover the design is wrong or incomplete, NOTE IT in your return summary — don't silently deviate
- If the spec is wrong, incomplete, contradictory, or impossible to verify, STOP and return `blocked: spec-change-required`. Do not patch specs on the fly.
- If a task is blocked by something unexpected, STOP and report back
- If workload forecast requires a decision and none was provided, STOP before writing code
- If live workload drifts above forecast by more than 50% or overruns the 400-line budget, STOP after persisting partial progress and return `partial` with `workload-escalation`
- In lite mode, missing spec/design artifacts are expected. `proposal-lite.md` is the acceptance contract. If the work outgrows trivial/small scope, STOP and return `blocked` with `escalate-to-standard-sdd`.
- When applying a chained/stacked PR slice, keep the batch autonomous: one deliverable scope, verification included, and clear rollback boundary
- When applying `size:exception`, state it explicitly in apply-progress and the return summary
- NEVER implement tasks that weren't assigned to you
- Skill loading is handled in Step 1 — follow any loaded skills strictly when writing code
- Apply any `rules.apply` from `openspec/config.yaml`
- If Strict TDD Mode is active (Step 3), load `strict-tdd.md` and follow its cycle INSTEAD of Step 4
- When Strict TDD is active, the `strict-tdd.md` module's rules OVERRIDE Step 4 entirely
- `[x]` means implemented and verified locally. Use `[~]` for implemented-but-unverified work.
- Return envelope per **Section D** from `skills/_shared/sdd-phase-common.md`.
