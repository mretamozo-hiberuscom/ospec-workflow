# OpenSpec File Convention (shared across all SDD skills)

## Directory Structure

```
openspec/
├── config.yaml              <- Project-specific SDD config
├── specs/                   <- Source of truth (main specs)
│   └── {domain}/
│       └── spec.md
└── changes/                 <- Active changes
    ├── archive/             <- Completed changes (YYYY-MM-DD-{change-name}/)
    └── {change-name}/       <- Active change folder
        ├── state.yaml       <- DAG state (survives compaction)
        ├── exploration.md   <- (optional) from sdd-explore
        ├── proposal.md      <- from sdd-propose
        ├── proposal-lite.md <- optional from lite mode
        ├── specs/           <- from sdd-spec
        │   └── {domain}/
        │       └── spec.md  <- Change-local spec (delta for existing domains, full spec for new domains)
        ├── design.md        <- from sdd-design
        ├── tasks.md         <- from sdd-tasks (updated by sdd-apply)
        ├── apply-progress.md <- from sdd-apply
        ├── archive-report.md <- from sdd-archive (written before archive move)
        └── verify-report.md <- from sdd-verify
```

Foundation docs for empty projects live beside OpenSpec:

```text
docs/
├── product/
├── architecture/
├── roadmap.md
└── references/
    ├── raw/
    └── processed/
```

## Artifact File Paths

| Skill | Creates / Reads | Path |
|-------|----------------|------|
| orchestrator | Creates/Updates/Repairs | `openspec/changes/{change-name}/state.yaml` |
| sdd-init | Creates | `openspec/config.yaml`, `openspec/specs/`, `openspec/changes/`, `openspec/changes/archive/` |
| sdd-foundation | Creates/Updates | `docs/product/**`, `docs/architecture/**`, `docs/references/**`, `docs/roadmap.md`, `openspec/config.yaml` |
| sdd-explore | Creates (optional) | `openspec/changes/{change-name}/exploration.md` |
| sdd-propose | Creates | `openspec/changes/{change-name}/proposal.md` |
| sdd-propose (lite mode) | Creates | `openspec/changes/{change-name}/proposal-lite.md` |
| sdd-spec | Creates | `openspec/changes/{change-name}/specs/{domain}/spec.md` |
| sdd-design | Creates | `openspec/changes/{change-name}/design.md` |
| sdd-tasks | Creates | `openspec/changes/{change-name}/tasks.md` |
| every phase executor | Updates | `openspec/changes/{change-name}/state.yaml` |
| sdd-apply | Updates | `openspec/changes/{change-name}/tasks.md` (marks `[~]` or `[x]`) |
| sdd-apply | Creates/Updates | `openspec/changes/{change-name}/apply-progress.md` |
| sdd-verify | Creates | `openspec/changes/{change-name}/verify-report.md` |
| sdd-archive | Creates | `openspec/changes/{change-name}/archive-report.md` |
| sdd-archive | Moves | `openspec/changes/{change-name}/` → `openspec/changes/archive/YYYY-MM-DD-{change-name}/` |
| sdd-archive | Updates | `openspec/specs/{domain}/spec.md` (merges deltas into main specs) |

## Reading Artifacts

```
Proposal:   openspec/changes/{change-name}/proposal.md
Proposal Lite: openspec/changes/{change-name}/proposal-lite.md
Specs:      openspec/changes/{change-name}/specs/  (all domain subdirectories)
Design:     openspec/changes/{change-name}/design.md
Tasks:      openspec/changes/{change-name}/tasks.md
Apply:      openspec/changes/{change-name}/apply-progress.md
Verify:     openspec/changes/{change-name}/verify-report.md
State:      openspec/changes/{change-name}/state.yaml
Config:     openspec/config.yaml
Main specs: openspec/specs/{domain}/spec.md
Foundation: docs/product/brief.md, docs/architecture/technical-baseline.md, docs/roadmap.md
```

## Writing Rules

- Always create the change directory before writing artifacts
- If a file already exists, READ it first and UPDATE it (don't overwrite blindly)
- If the change directory already exists with artifacts, the change is being CONTINUED
- Use `openspec/config.yaml` `rules` section for project-specific constraints per phase
- New capabilities stay change-local in `openspec/changes/{change-name}/specs/{domain}/spec.md` until `sdd-archive` promotes them into `openspec/specs/{domain}/spec.md`
- Every phase that writes an artifact must also read-merge-update `state.yaml` with phase status, top-level status, and a fresh UTC timestamp
- `proposal-lite.md` is valid only for lite-mode changes. If the work escalates to standard SDD, preserve `proposal-lite.md` as audit context and create `proposal.md` for the full workflow.

## Config File Reference

```yaml
# openspec/config.yaml
schema: spec-driven

context: |
  Tech stack: {detected}
  Architecture: {detected}
  Testing: {detected}
  Style: {detected}

rules:
  foundation:
    - Ask one blocking question at a time
    - Do not generate application code before scaffold/project setup is approved
  proposal:
    - Include rollback plan for risky changes
  specs:
    - Use Given/When/Then for scenarios
    - Use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY)
  design:
    - Include sequence diagrams for complex flows
    - Document architecture decisions with rationale
  tasks:
    - Group by phase, use hierarchical numbering
    - Keep tasks completable in one session
  apply:
    - Follow existing code patterns
    tdd: false           # Set to true to enable RED-GREEN-REFACTOR
    test_command: ""
  verify:
    test_command: ""
    build_command: ""
    coverage_threshold: 0
  archive:
    - Warn before merging destructive deltas
```

## Archive Structure

When archiving, the change folder moves to:
```
openspec/changes/archive/YYYY-MM-DD-{change-name}/
```

Use today's date in ISO format. The archive is an AUDIT TRAIL — never delete or modify archived changes.
