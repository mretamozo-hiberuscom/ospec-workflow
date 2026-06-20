# SDD Lifecycle Hooks

Lifecycle hooks fire at defined SDD phase boundaries and execute declarative actions such as loading extra skills, injecting rules, or running shell commands.

## Hook Kinds — Three Distinct Concepts

This project uses the word "hook" for three distinct mechanisms.  Do not conflate them:

| Kind | Config location | Executor | Purpose |
|------|----------------|----------|---------|
| **Lifecycle hooks** (this doc) | `openspec/config.yaml::hooks:` | Orchestrator | Fire ordered actions at 7 SDD phase boundaries. Config-declarative, orchestrator-dispatched. |
| **Harness hooks** | `hooks/hooks.json` + `hooks-runtime` | PreToolUse binary | Intercept tool calls at runtime (SessionStart, PreToolUse, PreCompact, Stop, etc.). |
| **Passive rules** | `openspec/config.yaml::rules.{phase}` | Injected as prompt text | Phase-scoped prose rules injected into sub-agent launch prompts. No executable actions. |

## The 7 Lifecycle Events

Events fire in this conceptual order during a standard route:

| # | Event | Fires when | Route phases required |
|---|-------|-----------|----------------------|
| 1 | `before-change` | Before the first phase of any route | Always fires |
| 2 | `before-implementation` | Before `sdd-apply` is dispatched | `sdd-apply` in route |
| 3 | `before-task` | Once per `sdd-apply` invocation (batch) | `sdd-apply` in route |
| 4 | `before-commit` | After the last apply batch returns `done`, before verify | `sdd-apply` in route |
| 5 | `before-verify` | Before `sdd-verify` is dispatched | `sdd-verify` in route |
| 6 | `after-verify` | After `sdd-verify` completes | `sdd-verify` in route |
| 7 | `after-archive` | After `sdd-archive` completes | `sdd-archive` in route |

Events whose required phase is absent from the active route are recorded as `status: skipped` in the `lifecycle_hooks:` block of `state.yaml` at route start.

**`before-task` note**: the orchestrator cannot observe individual task lines inside a sub-agent.  One orchestrator dispatch of `sdd-apply` = one firing of `before-task`.  Chained or multi-batch apply runs fire it once per dispatch.  Repeated firings are indexed under `lifecycle_hooks.before-task.occurrences[]`.

## Action Types

Each event declares an ordered list of actions:

### `load-skill`

Reads the file at `skill:` (relative to repo root) and accumulates its content.

```yaml
- type: load-skill
  skill: skills/sec/SKILL.md
  on_failure: advisory          # default
```

### `load-rules`

Accumulates the `rules:` text verbatim.

```yaml
- type: load-rules
  rules: "Coverage must be >= 80% before sign-off."
  on_failure: advisory
```

### `run-command`

Issues `command:` through the orchestrator's granted execute tool (`execute`/`Bash`). Flows through the existing `PreToolUse` DENY/ASK policy — never bypassed.

```yaml
- type: run-command
  command: npm run preflight
  on_failure: halt              # Retry/Override/Abort gate on failure
```

### Skill and Rules Injection

After all `load-skill` and `load-rules` actions at a boundary complete, if any content was accumulated, the orchestrator appends a `## Hook-Injected Skills and Rules` block to the **next sub-agent's** launch prompt, placed after `## Project Standards (auto-resolved)`.  Multiple actions are merged into one block in declaration order.

## Failure Policy

Each action carries an `on_failure` value (`advisory` by default):

| Policy | Behavior on failure |
|--------|-------------------|
| `advisory` | Record `outcome: failed, policy: advisory` in the audit; continue to next action; cross the boundary normally. |
| `halt` | Record `outcome: failed, policy: halt`; mark remaining actions as `outcome: skipped`; write `lifecycle_hooks.{event}.status: failed` to `state.yaml`; call `vscode/askQuestions` with a **Retry / Override and continue / Abort** gate before crossing the boundary. |

`halt` mirrors the `4r-review-gate` "surface, user decides" precedent.  The boundary phase is NOT dispatched until the user resolves the gate.

## Audit Shape (`lifecycle_hooks:` in `state.yaml`)

Written incrementally after each event, as a sibling of `gates:`:

```yaml
lifecycle_hooks:
  before-change:
    status: done                # done | failed | skipped
    actions:
      - type: load-skill
        skill: skills/sec/SKILL.md
        outcome: success        # success | failed | skipped
        policy: advisory        # on_failure mapped to policy in audit
  before-task:                  # repeated event → indexed array
    status: done
    occurrences:
      - index: 0
        batch: 1
        status: done
        actions: [...]
  before-verify:
    status: failed
    actions:
      - type: run-command
        command: npm run preflight
        outcome: failed
        policy: halt
        message: "exit code 1"  # present only on failed actions
```

## Pure Helper (`scripts/lib/lifecycle-hooks.js`)

All parsing, validation, ordering, and audit-shape logic lives in a pure, unit-tested helper module (zero I/O, mirroring `route-dispatcher.js`):

| Export | Purpose |
|--------|---------|
| `KNOWN_EVENTS` | Array of 7 event name strings |
| `KNOWN_ACTION_TYPES` | `['load-skill', 'load-rules', 'run-command']` |
| `KNOWN_POLICIES` | `['advisory', 'halt']` |
| `parseHooksBlock(rawHooks)` | Filter `hooks:` value to known events; absent → `{}` |
| `validateHooksBlock(hooks)` | Advisory validation → `{valid, errors}` |
| `eventAppliesToRoute(event, phases)` | Returns `false` when the required phase is absent |
| `planExecution(actions)` | Returns actions in order; applies halt-stop skipping |
| `computeEventStatus(outcomes)` | `done | failed | skipped` from action outcome array |
| `buildAuditEntry(event, results, opts)` | Builds the `lifecycle_hooks.{event}` audit shape |

## Rollout / Opt-in

Lifecycle hooks are **purely additive and opt-in**.  Removing the `hooks:` block (or never adding it) produces zero behavioral change.  Rollback = revert orchestrator/helper/doc edits and regenerate `dist/`.
