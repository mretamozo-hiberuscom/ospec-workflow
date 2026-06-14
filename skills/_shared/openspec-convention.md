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
        ├── specs/           <- from sdd-spec; updated by sdd-clarify (## Clarifications)
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
| sdd-clarify | Updates | `openspec/changes/{change-name}/specs/{domain}/spec.md` (appends `## Clarifications` + normative edits) |
| sdd-design | Creates | `openspec/changes/{change-name}/design.md` |
| sdd-tasks | Creates | `openspec/changes/{change-name}/tasks.md` |
| every phase executor | Updates | `openspec/changes/{change-name}/state.yaml` |
| sdd-apply | Updates | `openspec/changes/{change-name}/tasks.md` (marks `[~]` or `[x]`) |
| sdd-apply | Creates/Updates | `openspec/changes/{change-name}/apply-progress.md` |
| sdd-verify | Creates | `openspec/changes/{change-name}/verify-report.md` |
| sdd-archive | Creates | `openspec/changes/{change-name}/archive-report.md` |
| sdd-archive | Moves | `openspec/changes/{change-name}/` → `openspec/changes/archive/YYYY-MM-DD-{change-name}/` |
| sdd-archive | Updates | `openspec/specs/{domain}/spec.md` (merges deltas into main specs) |
| sdd-baseline | Creates | `openspec/specs/_baseline/manifest.md` (append-first batch-progress log) |
| sdd-baseline | Creates | `openspec/specs/_baseline/index.md` (append-first lazy domain index) |
| sdd-baseline | Creates | `openspec/specs/{domain}/spec.md` for empty domains only (NEVER overwrites existing files) |

**Spec ownership rule**: `sdd-baseline` seeds empty domains — it writes `openspec/specs/{domain}/spec.md` only when that file does not yet exist. `sdd-archive` owns evolving specs — it merges delta specs into `openspec/specs/{domain}/spec.md` for domains that already have baseline or prior specs. `sdd-baseline` MUST NEVER write where `openspec/specs/{domain}/spec.md` already exists, regardless of whether the file was created by baseline or by archive.

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

## Route and Gate Audit Fields in `state.yaml`

The orchestrator writes route and gate audit fields to `state.yaml` as part of the routing dispatch (see `agents/sdd-orchestrator.agent.md §Route Selection & Dispatch`).

### `route:` block

Written **before** the first phase of the selected route executes.

```yaml
route:
  intended_route: standard          # route name selected by condition evaluation
  actual_route: standard            # differs from intended only on explicit user override
  route_rationale: "classification=normal; project.status=active -> standard"
  validated: true                   # result of validateRouteTable(routes).valid
  validation_errors: []             # non-empty when validateRouteTable returned errors
```

| Field | Type | Description |
|-------|------|-------------|
| `intended_route` | string | Route name selected by top-to-bottom condition evaluation |
| `actual_route` | string | Route actually executed; differs from `intended_route` only when the user manually overrides after route selection |
| `route_rationale` | string | Non-empty prose explaining which condition matched and why |
| `validated` | boolean | `true` when `validateRouteTable` returned `valid: true` for the parsed table |
| `validation_errors` | string[] | Errors returned by `validateRouteTable`; empty array on clean table |

### `gates:` block

Written at each gate's hook point during route execution.

```yaml
gates:
  clarify:
    status: done           # pending | blocked | done | skipped
    questions_asked: 2
  4r-review-gate:
    status: done
    on_blocker: advisory   # advisory (default) | halt
    findings_summary: "0 BLOCKER, 1 WARNING"
    surfaced_to_user: true
```

Gate `status` values:

| Value | Meaning |
|-------|---------|
| `pending` | Gate has not yet run for this change |
| `blocked` | Gate returned `status: blocked`; waiting for user input |
| `done` | Gate completed successfully |
| `skipped` | Gate was explicitly skipped (e.g. clarify skipped for lite+trivial) |

Gate-specific fields (optional, vary by gate):

| Gate | Field | Description |
|------|-------|-------------|
| `clarify` | `questions_asked` | Number of clarification questions answered |
| `4r-review-gate` | `on_blocker` | Policy applied to BLOCKER findings (`advisory` default) |
| `4r-review-gate` | `findings_summary` | Human-readable count of findings by severity |
| `4r-review-gate` | `surfaced_to_user` | `true` when BLOCKER/CRITICAL findings were shown via `vscode/askQuestions` |
