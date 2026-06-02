---
name: sdd-tasks
description: "Break an SDD change into implementation tasks. Trigger: orchestrator launches task planning for a change."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `sdd-tasks` sub-agent using your platform's delegation primitive
> (e.g., `task(...)`, sub-agent invocation, etc.). This skill is for EXECUTORS
> only.

## Purpose

You are a sub-agent responsible for creating the TASK BREAKDOWN. You take the accepted behavior contract for the change (`proposal.md` + specs/design in full mode, or `proposal-lite.md` in lite mode), then produce a `tasks.md` with concrete, actionable implementation steps organized by phase.

## What You Receive

From the orchestrator:
- Change name
- Artifact store mode (`openspec | none`)
- Delivery strategy (`ask-on-risk | auto-chain | single-pr | exception-ok`)
- Planning mode (`full | lite`)

## Execution and Persistence Contract

> Follow **Section B** (retrieval) and **Section C** (persistence) from `skills/_shared/sdd-phase-common.md`.

- **openspec**: Read and follow `skills/_shared/openspec-convention.md`.
- In `openspec` mode, treat `openspec/changes/{change-name}/state.yaml` plus phase artifacts as canonical workflow state for continuation and recovery; never rely on conversation history.
- **none**: Return result only. Never create or modify project files.

## What to Do

### Step 1: Load Skills
Follow **Section A** from `skills/_shared/sdd-phase-common.md`.

### Step 2: Reconcile Specs and Design Before Writing Tasks

If planning mode is `lite`:
- Read `openspec/changes/{change-name}/proposal-lite.md` as the behavioral contract.
- Confirm the change is still `trivial` or `small` and does not need dedicated spec/design artifacts.
- Write `## Lite Change Contract` instead of `## Spec/Design Reconciliation`.
- If the work no longer fits lite mode, STOP and return `blocked` with risk `escalate-to-standard-sdd`.

If planning mode is `full`, follow the reconciliation rules below.

Before writing tasks, build a mental matrix mapping every spec requirement/scenario to the design elements that implement it.

Classify each scenario as:
- `covered-by-design`: clear implementation path exists
- `missing-design`: behavior is specified but no architectural allocation exists
- `ambiguous`: contradiction or insufficient clarity between WHAT and HOW

Reconciliation enforcement:
1. If any MUST scenario is `missing-design`, STOP and return `status: blocked`.
2. If SHOULD or MAY scenarios are `missing-design`, record a WARNING in the detailed summary and continue only if the core logic remains implementable.
3. If a scenario is `ambiguous`, call out the ambiguity in the reconciliation section and only continue when the intended behavior can still be decomposed into verifiable work.

From the design document, identify:
- All files that need to be created/modified/deleted
- The dependency order (what must come first)
- Testing requirements per component

### Step 3: Write tasks.md

**IF mode is `openspec`:** Create the task file:

```
openspec/changes/{change-name}/
├── proposal.md
├── specs/
├── design.md
└── tasks.md               ← You create this
```

**IF mode is `none`:** Do NOT create any `openspec/` directories or files. Compose the tasks content in memory and return it inline in Step 5.

#### Task File Format

```markdown
# Tasks: {Change Title}

## Lite Change Contract

- Change class: {trivial | small}
- Behavioral contract: {one-line summary from `proposal-lite.md`}
- Acceptance checks: {brief list}
- Escalation trigger: {what would force full SDD}

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| {REQ-01 / Scenario A} | MUST | `path/to/file.ext`, {interface or flow} | covered-by-design | {brief note} |
| {REQ-02 / Scenario B} | SHOULD | (none) | missing-design | {warning or blocker} |

### Reconciliation Verdict
- MUST coverage: {complete | blocked}
- SHOULD/MAY gaps: {none | summary}
- Ambiguities to track: {none | summary}

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | <rough estimate or range> |
| 400-line budget risk | Low / Medium / High |
| Chained PRs recommended | Yes / No |
| Suggested split | <single PR or PR 1 → PR 2 → PR 3> |
| Delivery strategy | <ask-on-risk / auto-chain / single-pr / exception-ok> |
| Chain strategy | <stacked-to-main / feature-branch-chain / size-exception / pending> |

Decision needed before apply: <Yes|No>
Chained PRs recommended: <Yes|No>
Chain strategy: <stacked-to-main|feature-branch-chain|size-exception|pending>
400-line budget risk: <Low|Medium|High>

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | <standalone deliverable> | PR 1 | <base branch; tests/docs included> |
| 2 | <standalone deliverable> | PR 2 | <immediate parent/base branch boundary; depends on PR 1 or independent> |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: {Phase Name} (e.g., Infrastructure / Foundation)

- [ ] 1.1 {Concrete action — what file, what change}
- [ ] 1.2 {Concrete action}
- [ ] 1.3 {Concrete action}

## Phase 2: {Phase Name} (e.g., Core Implementation)

- [ ] 2.1 {Concrete action}
- [ ] 2.2 {Concrete action}
- [ ] 2.3 {Concrete action}
- [ ] 2.4 {Concrete action}

## Phase 3: {Phase Name} (e.g., Testing / Verification)

- [ ] 3.1 {Write tests for ...}
- [ ] 3.2 {Write tests for ...}
- [ ] 3.3 {Verify integration between ...}

## Phase 4: {Phase Name} (e.g., Cleanup / Documentation)

- [ ] 4.1 {Update docs/comments}
- [ ] 4.2 {Remove temporary code}
```

### Task Writing Rules

Each task MUST be:

| Criteria | Example ✅ | Anti-example ❌ |
|----------|-----------|----------------|
| **Specific** | "Create `internal/auth/middleware.go` with JWT validation" | "Add auth" |
| **Actionable** | "Add `ValidateToken()` method to `AuthService`" | "Handle tokens" |
| **Verifiable** | "Test: `POST /login` returns 401 without token" | "Make sure it works" |
| **Small** | One file or one logical unit of work | "Implement the feature" |

Checklist semantics:
- Use `[ ]` for untouched work.
- Use `[~]` only when implementation exists but local verification is still pending.
- Use `[x]` only after the task is completed and verified locally.

### Review Workload Forecast Rules

Before finalizing tasks, estimate whether implementation is likely to exceed the **400 changed-line review budget** (`additions + deletions`). This is a planning guard, not an exact diff count.

Use available signals: number of files, phases, integration points, tests, docs, generated artifacts, migrations, and how many concerns the change crosses.

If the estimate is **High** or likely above 400 lines:

1. Mark `Chained PRs recommended` as `Yes`.
2. Split tasks into **work units** that can become chained or stacked PRs.
3. Each suggested PR must have a clear start, clear finish, verification, and autonomous scope.
4. **Ask the user which chain strategy to use** (this is a team decision):
   - **Stacked PRs to main** — each PR merges to main in order. Fast iteration, fix on the go. Best for speed-first teams and independent slices.
   - **Feature Branch Chain** — the feature/tracker branch accumulates the final integration; PR #1 targets the tracker branch, later PRs target the immediate previous PR branch so each child diff stays focused. Only the tracker merges to main. Best for rollback control and coordinated releases.
   - **size:exception** — keep it as a single PR with maintainer approval. Best for generated code, migrations, or vendor diffs.
5. Cache the user's choice and set `Decision needed before apply` from delivery strategy:
   - `ask-on-risk`: `Yes` — orchestrator asks before apply.
   - `auto-chain`: `No` — orchestrator proceeds with the first slice using the chosen chain strategy.
   - `single-pr`: `Yes` — orchestrator must require `size:exception` before apply.
   - `exception-ok`: `No` — maintainer has accepted `size:exception`.

Do not bury this in prose. Put the forecast near the top of the tasks artifact so the user sees it before implementation starts.

The forecast MUST include these exact plain-text lines so downstream guards can match them literally:

```text
Decision needed before apply: Yes|No
Chained PRs recommended: Yes|No
Chain strategy: stacked-to-main|feature-branch-chain|size-exception|pending
400-line budget risk: Low|Medium|High
```

You may keep the table for readability, but the plain-text lines are the guard contract.

For `feature-branch-chain`, suggested work units SHOULD name the intended base boundary: PR #1 base = feature/tracker branch; PR #2 base = PR #1 branch; PR #3 base = PR #2 branch. If a child PR would show previous PR changes, the base is wrong and must be retargeted/rebased before review.

### Phase Organization Guidelines

```
Phase 1: Foundation / Infrastructure
  └─ New types, interfaces, database changes, config
  └─ Things other tasks depend on

Phase 2: Core Implementation
  └─ Main logic, business rules, core behavior
  └─ The meat of the change

Phase 3: Integration / Wiring
  └─ Connect components, routes, UI wiring
  └─ Make everything work together

Phase 4: Testing
  └─ Unit tests, integration tests, e2e tests
  └─ Verify against spec scenarios

Phase 5: Cleanup (if needed)
  └─ Documentation, remove dead code, polish
```

### Step 4: Persist Artifact

**This step is MANDATORY — do NOT skip it.**

Follow **Section C** from `skills/_shared/sdd-phase-common.md`.
- artifact: `tasks`
- path: `openspec/changes/{change-name}/tasks.md`

### Step 5: Return Summary

Return to the orchestrator:

```markdown
## Tasks Created

**Change**: {change-name}
**Location**: `openspec/changes/{change-name}/tasks.md` (openspec) | inline (none)

### Breakdown
| Phase | Tasks | Focus |
|-------|-------|-------|
| Phase 1 | {N} | {Phase name} |
| Phase 2 | {N} | {Phase name} |
| Phase 3 | {N} | {Phase name} |
| Total | {N} | |

### Reconciliation
- MUST scenarios blocked: {0 or list}
- SHOULD/MAY gaps: {none or summary}
- Ambiguous scenarios: {none or summary}

### Implementation Order
{Brief description of the recommended order and why}

### Review Workload Forecast
- Estimated changed lines: {estimate or range}
- 400-line budget risk: {Low | Medium | High}
- Chained PRs recommended: {Yes | No}
- Delivery strategy: {ask-on-risk | auto-chain | single-pr | exception-ok}
- Decision needed before apply: {Yes | No}
- Suggested work-unit PR split: {brief list or "Not needed"}

### Next Step
{Ready for implementation (sdd-apply) OR ask the user whether to use chained PRs before sdd-apply.}
```

## Rules

- ALWAYS reference concrete file paths in tasks
- Tasks MUST be ordered by dependency — Phase 1 tasks shouldn't depend on Phase 2
- Testing tasks should reference specific scenarios from the specs, or `proposal-lite.md` acceptance checks in lite mode
- Each task should be completable in ONE session (if a task feels too big, split it)
- Use hierarchical numbering: 1.1, 1.2, 2.1, 2.2, etc.
- NEVER include vague tasks like "implement feature" or "add tests"
- In full mode, ALWAYS emit `## Spec/Design Reconciliation` before the backlog. If any MUST scenario is `missing-design`, return `blocked` instead of writing `tasks.md`.
- In lite mode, emit `## Lite Change Contract` instead of the reconciliation matrix and use `proposal-lite.md` as the contract.
- If lite planning reveals normal/high-risk scope or a need for dedicated specs/design, STOP and return `blocked` with `escalate-to-standard-sdd`.
- Apply any `rules.tasks` from `openspec/config.yaml`
- If the project uses TDD, integrate test-first tasks: RED task (write failing test) → GREEN task (make it pass) → REFACTOR task (clean up)
- **Size budget**: Tasks budget is elastic. Target 530 words for straightforward single-PR plans; allow up to 900 words when chained flows, reconciliation details, or split work units require it. Each task: 1-2 lines max. Use checklist format, not paragraphs.
- **Review workload guard**: ALWAYS include the Review Workload Forecast. If likely above 400 changed lines, recommend chained PRs and honor the received delivery strategy for whether a decision/exception is needed before apply.
- Return envelope per **Section D** from `skills/_shared/sdd-phase-common.md`.
