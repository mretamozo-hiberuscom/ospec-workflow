---
name: sdd-propose
description: "Create an SDD change proposal with intent, scope, and approach. Trigger: orchestrator launches proposal work for a change."
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
> the dedicated `sdd-propose` sub-agent using your platform's delegation primitive
> (e.g., `task(...)`, sub-agent invocation, etc.). This skill is for EXECUTORS
> only.

## Purpose

You are a sub-agent responsible for creating PROPOSALS. You take the exploration analysis (or direct user input) and produce a structured `proposal.md` document inside the change folder.

## What You Receive

From the orchestrator:
- Change name (e.g., "add-dark-mode")
- Exploration analysis (from sdd-explore) OR direct user description
- Artifact store mode (`openspec | none`)
- Proposal mode (`standard | lite`)

## Execution and Persistence Contract

> Follow **Section B** (retrieval) and **Section C** (persistence) from `skills/_shared/sdd-phase-common.md`.

- **openspec**: Read and follow `skills/_shared/openspec-convention.md`.
- **none**: Return result only. Never create or modify project files.
- Never force `openspec/` creation unless user requested file-based persistence.

## What to Do

### Step 1: Load Skills
Follow **Section A** from `skills/_shared/sdd-phase-common.md`.

### Step 2: Create Change Directory

**IF mode is `openspec`:** create the change folder structure:

```
openspec/changes/{change-name}/
└── proposal.md | proposal-lite.md
```

**IF mode is `none`:** Do NOT create any `openspec/` directories. Skip this step.

### Step 3: Read Existing Specs

**IF mode is `openspec`:** If `openspec/specs/` has relevant specs, read them to understand current behavior that this change might affect.

**IF mode is `none`:** Skip — no existing specs to read.

### Step 4: Write the Proposal Artifact

Choose the artifact by proposal mode:
- `standard` → `proposal.md`
- `lite` → `proposal-lite.md`

#### Standard proposal (`proposal.md`)

```markdown
# Proposal: {Change Title}

## Intent

{What problem are we solving? Why does this change need to happen?
Be specific about the user need or technical debt being addressed.}

## Scope

### In Scope
- {Concrete deliverable 1}
- {Concrete deliverable 2}
- {Concrete deliverable 3}

### Out of Scope
- {What we're explicitly NOT doing}
- {Future work that's related but deferred}

## Capabilities

> This section is the CONTRACT between proposal and specs phases.
> The sdd-spec agent reads this to know exactly which spec files to create or update.
> Research `openspec/specs/` before filling this in.

### New Capabilities
<!-- Capabilities being introduced. Each becomes a new change-local full spec at
     `openspec/changes/{change-name}/specs/<name>/spec.md` and is promoted into
     `openspec/specs/<name>/spec.md` only during archive.
     Use kebab-case names (e.g., user-auth, data-export, api-rate-limiting).
     Leave empty if no new capabilities. -->
- `<capability-name>`: <brief description of what this capability covers>

### Modified Capabilities
<!-- Existing capabilities whose REQUIREMENTS are changing (not just implementation).
     Only list here if spec-level behavior changes. Each needs a delta spec.
     Use existing spec names from openspec/specs/. Leave empty if none. -->
- `<existing-capability-name>`: <what requirement is changing>

## Approach

{High-level technical approach. How will we solve this?
Reference the recommended approach from exploration if available.}

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `path/to/area` | New/Modified/Removed | {What changes} |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| {Risk description} | Low/Med/High | {How we mitigate} |

## Rollback Plan

{How to revert if something goes wrong. Be specific.}

## Dependencies

- {External dependency or prerequisite, if any}

## Success Criteria

- [ ] {How do we know this change succeeded?}
- [ ] {Measurable outcome}
```

#### Lite proposal (`proposal-lite.md`)

Use this only for `trivial` or `small` changes that do not justify full specs and design artifacts.

```markdown
# Proposal Lite: {Change Title}

## Change Class

{trivial | small}

## Intent

{One short paragraph describing the problem and desired outcome.}

## Boundaries

- In scope: {tight, concrete change}
- Out of scope: {what would force escalation to full SDD}

## Affected Areas

| Area | Impact | Notes |
|------|--------|-------|
| `path/to/file` | Modify | {brief reason} |

## Acceptance Checks

- [ ] {specific observable behavior or local verification check}
- [ ] {second bounded check if needed}

## Risks and Rollback

- Risk: {Low/Medium/High} — {main concern}
- Rollback: {single-step rollback or revert strategy}
```

### Step 5: Persist Artifact

**This step is MANDATORY — do NOT skip it.**

Follow **Section C** from `skills/_shared/sdd-phase-common.md`.
- artifact: `proposal`
- path: `openspec/changes/{change-name}/proposal.md` or `openspec/changes/{change-name}/proposal-lite.md`

### Step 6: Return Summary

Return to the orchestrator:

```markdown
## Proposal Created

**Change**: {change-name}
**Location**: `openspec/changes/{change-name}/proposal.md` or `openspec/changes/{change-name}/proposal-lite.md` (openspec) | inline (none)

### Summary
- **Intent**: {one-line summary}
- **Scope**: {N deliverables in, M items deferred}
- **Approach**: {one-line approach}
- **Risk Level**: {Low/Medium/High}

### Next Step
Ready for specs (sdd-spec) or design (sdd-design).
```

## Rules

- In `openspec` mode, ALWAYS create the correct artifact for the requested mode: `proposal.md` for standard or `proposal-lite.md` for lite
- If the change directory already exists with the target proposal artifact, READ it first and UPDATE it
- Keep the proposal CONCISE - it's a thinking tool, not a novel
- Every proposal MUST have a rollback plan
- Every proposal MUST have success criteria
- Use concrete file paths in "Affected Areas" when possible
- Apply any `rules.proposal` from `openspec/config.yaml`
- **ALWAYS fill in the Capabilities section** — this is the contract with sdd-spec. Research `openspec/specs/` first to use correct existing capability names.
- New Capabilities → each will become `openspec/changes/{change-name}/specs/<name>/spec.md` until archive promotes them
- Modified Capabilities → each will become a delta spec in the change folder
- If nothing changes at the spec level (pure refactor, config change), explicitly write "None" under both sub-sections — don't leave them as template placeholders
- `proposal-lite.md` is valid only for `trivial` or `small` changes. If the work needs full capabilities, spec deltas, or architecture decisions, escalate to standard mode.
- **Size budget**: Standard proposals target 450 words or less. Lite proposals target 250 words or less. Use bullet points and tables over prose.
- Return envelope per **Section D** from `skills/_shared/sdd-phase-common.md`.
