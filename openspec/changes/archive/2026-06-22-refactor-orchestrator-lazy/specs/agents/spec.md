# Delta for agents

> Change: `refactor-orchestrator-lazy`
> Type: ADDED requirements (new normative section on orchestrator body structure)
> Archive target: new section to be appended to `openspec/specs/agents/spec.md`

---

## ADDED Requirements

### Requirement: Orchestrator Body Partitioning

The body of `agents/sdd-orchestrator.agent.md` MUST be divided into two non-overlapping
zones:

**CORE (always-loaded inline)**: coordinator identity, delegation rules, user question
gate, command index, change classification, SDD Init Guard, route selection skeleton,
result contract, sub-agent launch and context protocol, recovery rule, and the handler
pointer table defined below.

**Circumstantial handlers (on-demand)**: the following logical blocks MUST NOT be
inlined in the always-loaded body and MUST each reside in a dedicated
`skills/_shared/` reference file:

| Handler | Trigger |
|---|---|
| Brownfield route handler | route == brownfield |
| Workspace federation handler + baseline loop | backend == workspace-federated |
| 4R review gate dispatch | 4r-review-gate in active gates |
| Lifecycle hook dispatch | `hooks:` declared in `config.yaml` |
| Archive / quality-gate guard | before archive phase |
| Repeated `askQuestions` payload shapes | referenced when constructing gate payloads |

Each handler file MUST be loaded via the orchestrator's `read` tool ONLY when its
designated trigger fires. The CORE MUST include a pointer table mapping every
route/gate trigger to its `_shared/` reference file path. No circumstantial handler
MUST be resolved by a file path not declared in this pointer table.

#### Scenario: Standard route — no circumstantial handlers loaded

- GIVEN the orchestrator is dispatched on the standard route with no brownfield
  condition, no lifecycle hooks declared, and no workspace-federated backend
- WHEN route selection completes and the standard phase loop begins
- THEN no `skills/_shared/` handler file is read
- AND only the CORE body is active for that dispatch

#### Scenario: Brownfield condition — handler loaded via pointer table

- GIVEN the route classification resolves to `brownfield`
- WHEN the orchestrator resolves the handler using the CORE pointer table
- THEN it reads the designated `skills/_shared/` brownfield handler file exactly once
- AND no other circumstantial handler file is read unless its own trigger also fires

#### Scenario: Pointer table is the sole resolution path

- GIVEN any route or gate fires during a session
- WHEN the orchestrator selects a circumstantial handler
- THEN the handler file path MUST be resolved exclusively from the CORE pointer table
- AND no circumstantial handler is loaded by a path not listed in that table

---

### Requirement: On-Demand Handler Read-Once Caching

Each circumstantial handler file MUST be read at most once per route execution via the
`read` tool. The orchestrator MUST cache handler content in-session after the first
read. Subsequent phases or gate firings within the same route MUST reuse the cached
content and MUST NOT issue additional `read` calls for already-loaded handler files.

#### Scenario: Lifecycle handler not re-read across phase boundaries

- GIVEN `hooks:` is declared in `config.yaml` and the lifecycle handler file was read
  when the first hook boundary fired
- WHEN a subsequent hook boundary fires within the same session
- THEN the orchestrator reuses the in-session cached content
- AND no additional `read` call is issued for the same file

#### Scenario: Two distinct handlers each read exactly once

- GIVEN the standard route fires both the 4R review gate and the archive/quality-gate
  guard during a single route execution
- WHEN both gates execute
- THEN the 4R handler file is read once AND the archive handler file is read once
- AND neither file is read a second time within the same session

---

### Requirement: Behavioral Parity

Restructuring the orchestrator body into CORE + on-demand handlers MUST NOT alter any
observable behavior. The refactor changes only WHERE instructions live and WHEN they
are loaded, never WHAT the orchestrator does. The following MUST produce identical
outcomes before and after the refactor:

| Observable | Parity requirement |
|---|---|
| Route classification and selection | Same route for the same project inputs |
| Gate firing order and conditions | Same gates fire at the same hook points |
| Sub-agent dispatch order | Same phase sequence for the same route |
| Launch-prompt composition | Same prompt content delivered to each sub-agent |
| Approval-ledger writes | Same `state.yaml` approval entries (all fields) |
| `state.yaml` schema and field values | No field added, removed, or renamed |

#### Scenario: Route selection identical pre- and post-refactor

- GIVEN the orchestrator evaluates identical project state and inputs before and after
  the refactor
- WHEN route-selection logic executes
- THEN `state.yaml.route.actual_route` records the same value in both cases
- AND the dispatched phase sequence is unchanged

#### Scenario: Approval-ledger entries unchanged

- GIVEN a change that produces a delivery-strategy approval-ledger entry
- WHEN the refactored orchestrator processes the same inputs
- THEN all approval entry fields (id, gate, decision, source, accepted_at, applies_to)
  are identical to the pre-refactor output
- AND no new or missing fields appear under `state.yaml.approvals`

---

### Requirement: Shared Handler Trust Boundary

Every `skills/_shared/` handler file produced by this refactor MUST contain
instruction-only prose with no executable semantics. These files extend the existing
trust-boundary treatment applied to injected skill content (see Section 12, agents
spec). Handler files MUST NOT carry YAML frontmatter with tool grants, model fields,
or agent-contract declarations. The orchestrator MUST treat their content as reference
data, not as independently executable agents or skills with runtime authority.

#### Scenario: Handler file contains only prose instructions

- GIVEN the orchestrator reads a `skills/_shared/` handler file via the `read` tool
- WHEN the file is loaded
- THEN it contains only prose instructions with no YAML frontmatter, tool grants, or
  model declarations
- AND the orchestrator treats the content as reference data with no runtime authority

---

### Requirement: Cross-Target Parity in Generated Dist

The orchestrator generated into `dist/` by `scripts/configure` MUST resolve
`skills/_shared/` handler references and produce observable behavior identical to
the agent source form. All `skills/_shared/` handler files registered in the CORE
pointer table MUST be included in the generated output tree for every supported target
(claude, github-copilot, opencode, vscode). On the claude target the orchestrator MUST
be emitted as `skills/sdd-orchestrator/SKILL.md` per Section 8.3; the `_shared/`
handler files MUST be co-located in the same generated tree so the generated skill
can read them at runtime.

#### Scenario: Generated target resolves handler file at runtime

- GIVEN `scripts/configure` has regenerated `dist/` after the refactor
- WHEN a circumstantial gate fires in a session using the generated target
- THEN the generated orchestrator reads the handler file from the generated output tree
- AND the behavioral outcome (route, phase sequence, approvals, `state.yaml` fields)
  is identical to the agent source form

#### Scenario: All handler files present in dist after regeneration

- GIVEN the refactor has been applied to source files
- WHEN `scripts/configure` runs to regenerate `dist/`
- THEN every `skills/_shared/` handler file declared in the CORE pointer table appears
  in the dist output tree
- AND no parity test comparing source behavior to generated behavior fails
