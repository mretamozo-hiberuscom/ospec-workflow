# Delta for routing

## Scope Note

This delta adds lifecycle-hook dispatch to the orchestrator's route execution
behavior. Sections 1–11 of the main routing spec
(`openspec/specs/routing/spec.md` — route table, condition evaluation, validation
functions, gate hook points, module purity contract) are **fully preserved and not
modified**. Only the orchestrator's execution responsibilities at phase boundaries
change.

---

## ADDED Requirements

### Requirement: Lifecycle Hook Dispatch at Phase Boundaries

The orchestrator MUST read the `hooks:` block from `openspec/config.yaml` before
beginning route execution and MUST dispatch matching lifecycle hook actions at each
phase boundary during the selected route's execution.

Dispatch rules:

- The orchestrator MUST evaluate the `hooks:` block once per change session (at
  route start). Subsequent per-boundary evaluations use the cached block.
- For each phase boundary reached, the orchestrator MUST run all declared actions
  for the matching event key in declaration order, applying the `on_failure` policy
  per the `lifecycle-hooks` spec.
- `run-command` actions MUST be issued as ordinary orchestrator tool calls and MUST
  receive the existing PreToolUse DENY/ASK evaluation. The orchestrator MUST NOT
  issue them through any bypass channel.
- A `halt` action failure at any boundary MUST prevent the orchestrator from
  dispatching the phase or crossing that boundary. The orchestrator MUST surface
  the failure to the user.
- When the `hooks:` block is absent, the orchestrator MUST proceed without firing
  any actions; no change to existing route execution behavior.

#### Scenario: Hook fires before apply dispatch

- GIVEN the active route includes `sdd-apply` and `hooks.before-implementation` declares one action
- WHEN the orchestrator reaches the `sdd-apply` dispatch point
- THEN it MUST run the `before-implementation` action(s) to completion before dispatching `sdd-apply`
- AND the action outcome MUST be recorded in `lifecycle_hooks:` before dispatch

#### Scenario: `halt` failure blocks phase dispatch

- GIVEN `hooks.before-verify` declares an action with `on_failure: halt` that fails
- WHEN the orchestrator reaches the `sdd-verify` dispatch point
- THEN it MUST NOT dispatch `sdd-verify`
- AND MUST surface the failure to the user via the standard question gate

#### Scenario: No `hooks:` block — route unchanged

- GIVEN `openspec/config.yaml` has no `hooks:` key
- WHEN the orchestrator executes any route
- THEN route execution is identical to the pre-lifecycle-hooks baseline
- AND the `lifecycle_hooks:` audit block MAY be absent from `state.yaml`

---

### Requirement: `lifecycle_hooks:` Audit Persistence

The orchestrator MUST persist a `lifecycle_hooks:` block to
`openspec/changes/{change-name}/state.yaml` recording the outcome of every
lifecycle event encountered during route execution. The block shape and field
semantics are defined in the `lifecycle-hooks` spec.

The audit block MUST be written (or merged) into `state.yaml` at the same time
the orchestrator updates any other phase status field — it MUST NOT be deferred
to route end. Each event entry MUST be written immediately after that event's
actions complete.

#### Scenario: Audit block written incrementally

- GIVEN `before-change` fires and completes before any other phase
- WHEN the orchestrator writes the state after `before-change`
- THEN `state.yaml` MUST contain `lifecycle_hooks.before-change` with correct status
- AND the remaining event entries MUST be absent (not yet written) until those events fire

#### Scenario: Skipped events are recorded

- GIVEN the active route is `debug` (no `sdd-verify`) and `hooks.before-verify` is declared
- WHEN the route completes
- THEN `state.yaml` MUST contain `lifecycle_hooks.before-verify.status: skipped`
