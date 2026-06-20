# Design: SDD Lifecycle Hooks

## Technical Approach

Add a declarative `hooks:` block to `openspec/config.yaml` and a thin
orchestrator dispatch layer that fires ordered actions at SDD phase boundaries.
The design splits the work the same way routing already does: a **pure,
unit-testable helper** (`scripts/lib/lifecycle-hooks.js`, mirroring
`route-dispatcher.js`) owns parsing/validation/ordering/policy decisions, while
the **orchestrator agent markdown** owns all effects (file reads, tool calls,
`state.yaml` writes, `vscode/askQuestions`). This satisfies every MUST scenario
in `specs/lifecycle-hooks`, `specs/routing`, and `specs/agents` while reusing two
existing patterns: skill injection (`skill-resolver`) and the `gates:` audit
precedent. The three hook concepts stay distinct in naming: this change only ever
says **lifecycle hooks** (config-declarative, orchestrator-dispatched), never
*harness hooks* (`hooks-runtime`, the Go/JS PreToolUse binary) and never
*passive rules* (`rules.{phase}` prose).

## Architecture Decisions

### Decision 1: `before-commit` fires at the apply→verify transition

**Choice**: Fire `before-commit` once, after the last `sdd-apply` batch returns
`done` and before the next boundary (`before-verify`/`sdd-verify`, or the `4r`
gate on the debug route). Do **not** introduce a git-commit phase.

**Alternatives considered**: (a) define an explicit commit step in the route
table; (b) intercept each per-work-unit commit inside `sdd-apply`.

**Rationale**: The standard route delegates commits *inside* the `sdd-apply`
sub-agent's opaque context; the orchestrator has no hook point on those
individual commits and cannot intercept them without restructuring the route —
explicitly out of scope. The apply-complete boundary is the closest
deterministic, orchestrator-observable point and is exactly the fallback the spec
sanctions ("if the active route has no explicit commit step, fires at the
apply→verify transition"). Lowest friction, zero route restructuring. Skipped
(audited `skipped`) when the route has no `sdd-apply` phase.

### Decision 2: `before-task` fires per `sdd-apply` invocation (batch), audited as an indexed array

**Choice**: `before-task` fires once per orchestrator-dispatched `sdd-apply`
invocation. A route with one apply call fires it once; a chained/continuation run
with N apply dispatches fires it N times. Repeated firings are recorded under
`lifecycle_hooks.before-task.occurrences[]` (indexed array), never aggregated
into one entry.

**Alternatives considered**: (a) fire literally once per task line in
`tasks.md`; (b) aggregate all firings into a single audit entry with counters.

**Rationale**: The orchestrator is a coordinator — individual task execution
happens inside `sdd-apply`'s sub-agent context, which the orchestrator cannot
observe or interpose on. The only orchestrator-dispatchable "task boundary" is
each apply invocation, so per-invocation is the faithful realization of "before
each task" at the dispatch layer. An indexed `occurrences[]` array preserves
per-batch failure fidelity and honors the append-not-overwrite continuity rule;
aggregation would lose which batch failed. **Spec reconciliation note**: the
literal `before-task fires once per task` scenario is realized as
once-per-apply-invocation; flag for `sdd-archive` when promoting the delta.

### Decision 3: `run-command` binds to the orchestrator's granted execute tool and flows through PreToolUse

**Choice**: A `run-command` action issues its `command` string through the
orchestrator's already-granted shell/execute tool (`execute` in the agent
frontmatter `tools:` list; `Bash`/terminal on other targets). No new tool grant,
no bypass channel. PreToolUse normalizes these tool names
(`runcommand`/`shell`/`terminal`/…) and applies its DENY/ASK policy unchanged.

**Behavior when the tool is absent from the grant**: the action cannot be issued
— treat it as an action **failure** and apply `on_failure`: `advisory` records
`outcome: failed` and crosses the boundary; `halt` records it and blocks
(Decision 4).

**Alternatives considered**: an abstract "run" primitive that the orchestrator
routes itself (re-implements safety, risks bypass); a dedicated privileged
channel (explicitly forbidden by spec).

**Rationale**: Reusing the granted tool is the only way to guarantee the existing
PreToolUse DENY/ASK guard still fires, satisfying the "MUST NOT bypass" MUST.

### Decision 4: `halt`-failure surfaces a 3-option question gate (Retry / Override / Abort)

**Choice**: When a `halt` action fails, the orchestrator stops the remaining
actions in that event, writes `lifecycle_hooks.{event}.status: failed` plus the
blocking reason to `state.yaml`, and calls `vscode/askQuestions` with this shape:

```json
{
  "questions": [{
    "header": "Lifecycle hook blocked",
    "question": "A halt hook failed at {event}: {message}. How do you want to proceed?",
    "options": [
      { "label": "Retry", "description": "Re-run the failed action and continue if it passes.", "recommended": true },
      { "label": "Override and continue", "description": "Cross the boundary anyway; recorded as overridden." },
      { "label": "Abort", "description": "Stop the route at this boundary." }
    ],
    "allowFreeformInput": true
  }]
}
```

`Retry` re-issues the action; `Override` records an `approvals` ledger entry and
crosses the boundary; `Abort` leaves `status: blocked`. The boundary phase MUST
NOT be dispatched until the answer resolves.

**Alternatives considered**: auto-abort with no prompt (too rigid); plain-chat
question (violates the question-gate protocol).

**Rationale**: Mirrors the `4r-review-gate` "surface, user decides" precedent and
the orchestrator's User Question Gate Protocol.

### Decision 5: Pure helper in `scripts/lib/` + effectful dispatch in the orchestrator md

**Choice**: Create `scripts/lib/lifecycle-hooks.js` (pure, no I/O) for parsing,
advisory validation, event taxonomy, action ordering, halt-stop computation,
route-applicability (skipped detection), and audit-entry shaping. The
orchestrator agent markdown holds the effects: reading the config, resolving
`load-skill` file contents, issuing `run-command` tool calls, composing
`## Hook-Injected Skills and Rules`, writing `state.yaml`, and asking questions.

**Alternatives considered**: pure-markdown dispatch (not unit-testable — violates
`strict_tdd`); a helper that also reads files (breaks the module-purity contract
that `route-dispatcher.js` establishes).

**Rationale**: Exactly how routing is implemented today — `route-dispatcher.js`
parses/validates/matches with zero side effects and the orchestrator does file
I/O + delegation. Consistency + testability under `strict_tdd`.

## Data Flow

```
config.yaml ──parseHooksBlock()──▶ cached hooks map (once, at route start)
                                        │
   each phase boundary reached ────────┤
                                        ▼
                          eventAppliesToRoute(event, routePhases)?
                            │ no → audit status: skipped
                            │ yes
                            ▼
              planExecution(actions)  (ordered; index 0 first)
                            ▼
   per action ── load-skill ─▶ orchestrator reads file ─▶ inject block
              ── load-rules ─▶ inject verbatim
              ── run-command ▶ execute tool ─▶ PreToolUse DENY/ASK
                            ▼
              outcome success|failed ─▶ buildAuditEntry()
                            ▼
   advisory-fail → record + continue + cross boundary
   halt-fail     → record + skip remaining + block (Decision 4)
                            ▼
        write lifecycle_hooks.{event} to state.yaml (immediately)
```

### Sequence: `halt`-failure flow

```
Orchestrator        Helper            ExecuteTool/PreToolUse      state.yaml      User
     │  planExecution([A,B,C]) │                │                    │             │
     │◀──ordered, B is halt────│                │                    │             │
     │  run A ──────────────────────────────────▶ allow → success    │             │
     │  run B (run-command) ────────────────────▶ runs → exit 1      │             │
     │◀──────────────── outcome: failed ─────────│                    │             │
     │  buildAuditEntry(failed, halt)            │                    │             │
     │  mark C outcome: skipped                  │                    │             │
     │  write before-X.status: failed ───────────────────────────────▶             │
     │  vscode/askQuestions(Retry/Override/Abort) ─────────────────────────────────▶
     │◀──────────────────────────── answer ────────────────────────────────────────│
     │  Retry→re-run B │ Override→approvals+cross │ Abort→status: blocked           │
```

## Interfaces / Contracts

### `hooks:` config schema (in `openspec/config.yaml`)

```yaml
hooks:                              # OPTIONAL top-level map; absent = no-op
  before-change:                    # event key ∈ taxonomy; unknown keys ignored
    - type: load-skill              # load-skill | load-rules | run-command
      skill: skills/sec/SKILL.md    # REQUIRED for load-skill (path from repo root)
      on_failure: advisory          # advisory (default) | halt
  before-implementation:
    - type: run-command
      command: npm run preflight    # REQUIRED for run-command
      on_failure: halt
  before-verify:
    - type: load-rules
      rules: "Coverage must be >= 80% before sign-off."  # REQUIRED for load-rules
```

Events: `before-change`, `before-implementation`, `before-task`,
`before-commit`, `before-verify`, `after-verify`, `after-archive`.

### `lifecycle_hooks:` audit schema (in `state.yaml`, sibling of `gates:`)

```yaml
lifecycle_hooks:
  before-change:
    status: done                    # pending | done | skipped | failed
    actions:
      - type: load-skill
        skill: skills/sec/SKILL.md
        outcome: success            # success | failed | skipped
        policy: advisory
  before-task:                      # repeated event → indexed occurrences[]
    status: done
    occurrences:
      - index: 0
        batch: 1
        status: done
        actions:
          - type: run-command
            command: npm run lint
            outcome: success
            policy: advisory
  before-verify:
    status: failed
    actions:
      - type: run-command
        command: npm run preflight
        outcome: failed
        policy: halt
        message: "exit code 1"
```

Single-fire events use `actions:`; repeated events (`before-task`) use
`occurrences[]` with per-firing `actions:`. Skipped events: `status: skipped`,
`actions: []`. Written/merged incrementally, immediately after each event.

### Helper exports (`scripts/lib/lifecycle-hooks.js`, all pure)

`KNOWN_EVENTS`, `KNOWN_ACTION_TYPES`, `KNOWN_POLICIES`, `parseHooksBlock(content)`,
`validateHooksBlock(hooks)` → `{valid, errors}` (advisory-only),
`eventAppliesToRoute(event, routePhases)` → boolean, `planExecution(actions)`
→ ordered list with halt-stop boundaries, `computeEventStatus(actionOutcomes)`,
`buildAuditEntry(event, results)`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-hooks.js` | Create | Pure helper: parse/validate/order/policy/audit-shape; module-purity contract, no I/O |
| `scripts/lib/lifecycle-hooks.test.js` | Create | Unit tests (RED-first under `strict_tdd`) |
| `agents/sdd-orchestrator.agent.md` | Modify | New "Lifecycle Hook Dispatch" section: boundary firing, Decisions 1-4, prompt injection, `lifecycle_hooks:` writes. `tools:` already grants `execute` — no frontmatter change |
| `skills/_shared/openspec-convention.md` | Modify | Document `hooks:` config block + `lifecycle_hooks:` audit block beside `gates:` |
| `openspec/config.yaml` | Modify (optional) | Commented `hooks:` example; remains absent = no-op |
| `docs/sdd-lifecycle-hooks.md` | Create (recommended) | Concept doc + 3-hook disambiguation, mirroring `docs/sdd-routing.md` |
| `dist/**/agents/sdd-orchestrator.agent.md` | Regenerate | Generated targets (vscode, github-copilot, claude, opencode) — **do NOT hand-edit**; run `npm run build:*` so all targets stay in parity |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `parseHooksBlock` (valid block, absent→`{}`, unknown event keys ignored, per-action fields), `validateHooksBlock` advisory errors (missing `type`, missing `skill`/`rules`/`command`, bad `on_failure`), `planExecution` ordering + halt-stop (B halt fails → C skipped), `eventAppliesToRoute` skipped detection, `computeEventStatus`, `buildAuditEntry` incl. `occurrences[]` indexing | `node --test scripts/lib/lifecycle-hooks.test.js`, pure functions, RED-first |
| Integration / parity | Orchestrator md edits propagate identically to all 4 dist targets | Existing parity/golden suites (`manifest-sync.test.js`, `scripts/configure/validate-*.test.js`) |
| Agent-instruction-only | Boundary firing, `load-skill` file read, `run-command` through PreToolUse, `## Hook-Injected Skills and Rules` composition, `vscode/askQuestions` halt gate, `state.yaml` writes | Not unit-testable (orchestrator-runtime behavior); verified by review against scenarios + the pure helper's tested decision core |

PreToolUse routing itself is already covered by `scripts/hooks/pre-tool-use.test.js`;
`run-command` reuses it, so no new hook tests are required.

## Migration / Rollout

No migration. Purely additive and opt-in: absence of a `hooks:` block is a
verbatim no-op (zero behavior change). Rollback = revert the orchestrator/helper/
doc edits and regenerate `dist/`; no `.ospec/` or data changes.

## Open Questions

- [ ] `before-task` per-invocation vs literal per-task line is a spec
  reconciliation (Decision 2) — confirm at `sdd-archive` when merging the delta.
- [ ] Whether `docs/sdd-lifecycle-hooks.md` is in this change's scope or deferred
  (proposal Affected Areas lists docs only via `openspec-convention.md`).
