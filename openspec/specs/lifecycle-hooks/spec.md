# Lifecycle Hooks Specification

## Purpose

The `lifecycle-hooks` domain defines a declarative, **executable** extension layer
that binds actions to SDD orchestrator phase boundaries. Projects use it to load
skills, inject rules, or run commands at specific points in the SDD workflow without
modifying core agents.

### Disambiguation

| Concept | What it is | What it is NOT |
|---------|-----------|----------------|
| **lifecycle-hooks** (this spec) | Declarative `hooks:` block in `config.yaml`; orchestrator executes actions at SDD phase boundaries | Not a harness hook; not passive rules prose |
| **harness hooks** (`hooks-runtime`) | Go binary fired by the Claude Code platform on runtime events (`SessionStart`, `PreToolUse`, …) | Not SDD-aware; not declarative config |
| **passive rules** (`rules.{phase}`) | Prose guidance in `config.yaml` injected into sub-agent prompts; non-executable | Not actions; not gated by failure policy |

These three concepts MUST be named and documented distinctly. Implementation and
documentation MUST NOT conflate them.

---

## Requirements

### Requirement: `hooks:` Block Schema

`openspec/config.yaml` MAY contain a top-level `hooks:` block. When present, it
MUST be a map whose keys are lifecycle event names (see Event Taxonomy) and whose
values are ordered lists of action objects.

**Action object fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | `load-skill` \| `load-rules` \| `run-command` | REQUIRED | — | Action kind |
| `on_failure` | `advisory` \| `halt` | OPTIONAL | `advisory` | Failure policy |
| `skill` | string (path) | REQUIRED for `load-skill` | — | Path to a SKILL.md file relative to repo root |
| `rules` | string | REQUIRED for `load-rules` | — | Inline prose rules text |
| `command` | string | REQUIRED for `run-command` | — | Shell command string |

**`run-command` MUST NOT bypass PreToolUse.** A `run-command` action is issued as
a normal orchestrator tool call and MUST receive the same PreToolUse DENY/ASK
policy evaluation as any other tool call. It MUST NOT be issued through a bypass
channel.

#### Scenario: Absent `hooks:` block — no-op

- GIVEN `openspec/config.yaml` does not contain a `hooks:` block
- WHEN the orchestrator reaches any phase boundary
- THEN zero hook actions fire and behavior is identical to the pre-hooks baseline

#### Scenario: Well-formed block is parsed

- GIVEN a `hooks:` block with valid event keys and action lists
- WHEN the orchestrator loads the config
- THEN every action list is parsed and stored for dispatch at the matching boundary

#### Scenario: Unknown event key — silently ignored

- GIVEN the `hooks:` block contains a key that is not in the recognized event taxonomy
- WHEN the orchestrator loads the config
- THEN it MUST silently ignore that key and MUST NOT fail or block

---

### Requirement: Lifecycle Event Taxonomy

The orchestrator MUST recognize the seven lifecycle events below and fire them at
the specified boundaries. The SDD orchestrator dependency graph is:
`before-change` → proposal → specs → clarify → design → tasks →
`before-implementation` → apply (`before-task` per task) → `before-commit` →
`before-verify` → verify → `after-verify` → archive → `after-archive`.

| Event | Phase boundary | Fires at |
|-------|---------------|----------|
| `before-change` | Change start | Before the first phase of the selected route begins |
| `before-implementation` | Apply start | Before `sdd-apply` is dispatched |
| `before-task` | Per-task | Before each individual task sub-invocation within `sdd-apply` |
| `before-commit` | Commit boundary | After `sdd-apply` completes all task batches and before any git commit is made for the change; if the active route has no explicit commit step, fires at the apply→verify transition |
| `before-verify` | Verify start | Before `sdd-verify` is dispatched |
| `after-verify` | Verify end | After `sdd-verify` returns any status |
| `after-archive` | Archive end | After `sdd-archive` completes successfully |

Events whose corresponding phase is absent from the active route MUST be silently
skipped. The orchestrator MUST record them as `status: skipped` in the audit block.

#### Scenario: `before-implementation` fires before apply

- GIVEN the active route includes `sdd-apply` and `hooks.before-implementation` is declared
- WHEN the orchestrator reaches the `sdd-apply` dispatch point
- THEN all `before-implementation` actions MUST complete before `sdd-apply` is dispatched

#### Scenario: `before-task` fires once per task

- GIVEN `hooks.before-task` is declared and `sdd-apply` processes N tasks
- WHEN `sdd-apply` begins each individual task
- THEN `before-task` actions MUST fire once per task, before that task executes

#### Scenario: Absent-phase event is skipped

- GIVEN the active route is `foundation` (no `sdd-verify` phase)
  AND `hooks.before-verify` is declared
- WHEN the route executes
- THEN `before-verify` MUST NOT fire and MUST be recorded as `skipped`

---

### Requirement: Action Execution Order

Actions within a single event's list MUST execute in declaration order (index 0
first). A `halt` action that fails MUST stop execution of all remaining actions in
that event list without running them.

#### Scenario: Declaration order preserved

- GIVEN an event declares actions `[A, B, C]`
- WHEN the event fires
- THEN A executes first, then B, then C in that order

#### Scenario: `halt` failure stops remaining actions

- GIVEN an event declares `[A, B, C]` where B has `on_failure: halt` and B fails
- WHEN the event fires
- THEN A runs; B fails; C MUST NOT execute

---

### Requirement: Failure Policy

The `on_failure` field (default `advisory`) governs orchestrator behavior when an
action fails.

| Policy | Behavior |
|--------|----------|
| `advisory` | Failure is recorded in `lifecycle_hooks:` audit; remaining actions in the event continue; the orchestrator MUST cross the phase boundary normally |
| `halt` | Failure is recorded; remaining actions in the event are skipped; the orchestrator MUST NOT cross the boundary; it MUST surface the failure to the user |

When a `halt` failure blocks a boundary, the orchestrator MUST surface the failure
via `vscode/askQuestions` (or target equivalent) and MUST record the blocking
reason in `state.yaml`.

#### Scenario: `advisory` failure — boundary proceeds

- GIVEN `before-implementation` has an action with `on_failure: advisory` that fails
- WHEN the hook fires
- THEN the failure is recorded in the audit block
- AND `sdd-apply` is dispatched normally

#### Scenario: `halt` failure — boundary blocked

- GIVEN `before-verify` has an action with `on_failure: halt` that fails
- WHEN the hook fires
- THEN `sdd-verify` MUST NOT be dispatched
- AND the orchestrator MUST surface the failure to the user before continuing

---

### Requirement: `lifecycle_hooks:` Audit Block

The orchestrator MUST write a `lifecycle_hooks:` block to
`openspec/changes/{change-name}/state.yaml` recording the outcome of every
encountered event. Shape mirrors the existing `gates:` block.

```yaml
lifecycle_hooks:
  before-change:
    status: done          # pending | done | skipped | failed
    actions:
      - type: load-skill
        skill: "skills/foo/SKILL.md"
        outcome: success  # success | failed | skipped
        policy: advisory
      - type: run-command
        command: "npm run preflight"
        outcome: failed
        policy: halt
        message: "exit code 1"
  before-verify:
    status: skipped
    actions: []
```

| Field | Values | Description |
|-------|--------|-------------|
| `status` | `pending` \| `done` \| `skipped` \| `failed` | Overall event outcome |
| `action.outcome` | `success` \| `failed` \| `skipped` | Per-action result (`skipped` when a prior `halt` stopped execution) |
| `action.policy` | `advisory` \| `halt` | Policy that was applied |
| `action.message` | string (optional) | Error detail when `outcome: failed` |

#### Scenario: Audit block written on event completion

- GIVEN `before-change` fires with one `load-skill` action that succeeds
- WHEN the orchestrator persists state after the event
- THEN `lifecycle_hooks.before-change.status` MUST be `done`
- AND the action entry MUST have `outcome: success`

#### Scenario: Skipped event recorded in audit

- GIVEN the active route has no `sdd-verify` phase and `hooks.before-verify` is declared
- WHEN the route completes
- THEN `lifecycle_hooks.before-verify.status` MUST be `skipped`

---

## ADDED Requirements — 4R Remediation (2026-06-20)

These requirements were added during the 4R verify-gate remediation pass. They extend and sharpen the base spec above; the base spec is otherwise unchanged.

### Requirement: `validateHooksBlock` MUST NEVER throw

The `validateHooksBlock` function MUST be safe to call with arbitrarily malformed input. It MUST NOT throw a `TypeError` or any other exception regardless of what is stored under an event's action list.

**Malformed element handling:**

| Input element | Required behaviour |
|---------------|--------------------|
| `null` | Push `{event}[{i}]: action must be an object`; continue without dereferencing |
| `undefined` | Same as null |
| Primitive (string, number, boolean) | Same as null |
| Array | Same as null (nested arrays are invalid) |
| Plain object | Process normally (existing behaviour) |

**Non-array event value handling:**

| Event value type | Required behaviour |
|------------------|--------------------|
| Array | Process actions normally |
| `null` or `undefined` | Skip silently (event absent) |
| Any other value (object, string, number…) | Push `{event}: actions must be a list`; continue |

#### Scenario: null action element — no throw, descriptive error

- GIVEN a `hooks:` block where an event's action list contains a `null` element (e.g. YAML `- ~`)
- WHEN `validateHooksBlock` is called
- THEN it MUST NOT throw
- AND it MUST return `{valid: false, errors: [...]}`
- AND the errors array MUST contain a message referencing the element index and "action must be an object"

#### Scenario: primitive action element — no throw, descriptive error

- GIVEN a `hooks:` block where an action list element is a string (e.g. YAML `- foo`)
- WHEN `validateHooksBlock` is called
- THEN it MUST NOT throw
- AND it MUST return `{valid: false}` with a descriptive error

#### Scenario: non-array event value — produces error

- GIVEN a `hooks:` block where an event's value is a plain object rather than a list
- WHEN `validateHooksBlock` is called
- THEN `valid` MUST be `false`
- AND errors MUST contain a message including "actions must be a list"

---

### Requirement: `load-skill` Path Confinement

The `skill` value in a `load-skill` action MUST be a relative path under the `skills/` directory tree. Paths that could exfiltrate files outside the repository or escape the skills tree MUST be rejected at validation time (string-only check; no filesystem access).

**Rejection criteria (any one is sufficient):**

| Pattern | Reason |
|---------|--------|
| Starts with `/` or `\` | Absolute Unix/Windows path |
| Matches `/^[a-zA-Z]:/` | Windows drive-letter path |
| Contains `..` | Directory traversal |
| Does not start with `skills/` | Outside the skills tree |

**Error message**: `{prefix}: load-skill 'skill' must be a relative path under skills/ without '..'`

#### Scenario: path traversal is rejected

- GIVEN a `load-skill` action with `skill: "../../.env"`
- WHEN `validateHooksBlock` is called
- THEN `valid` MUST be `false`
- AND errors MUST reference path confinement

#### Scenario: absolute path is rejected

- GIVEN a `load-skill` action with `skill: "/etc/passwd"` or `skill: "C:\\Windows\\..."`
- WHEN `validateHooksBlock` is called
- THEN `valid` MUST be `false`

#### Scenario: valid `skills/` path is accepted

- GIVEN a `load-skill` action with `skill: "skills/sec/SKILL.md"`
- WHEN `validateHooksBlock` is called with no other errors
- THEN `valid` MUST be `true`

---

### Requirement: `load-rules` Length Cap

The `rules` text in a `load-rules` action MUST NOT exceed 4000 characters. Longer values MUST be rejected at validation time.

**Error message**: `{prefix}: load-rules 'rules' exceeds maximum length of 4000 characters`

#### Scenario: rules text over 4000 chars is rejected

- GIVEN a `load-rules` action where `rules` has length 4001 or more
- WHEN `validateHooksBlock` is called
- THEN `valid` MUST be `false`
- AND errors MUST reference the length limit

#### Scenario: rules text at exactly 4000 chars is accepted

- GIVEN a `load-rules` action where `rules` has length exactly 4000
- WHEN `validateHooksBlock` is called with no other errors
- THEN `valid` MUST be `true`

---

### Requirement: Trust Boundary for Hook-Injected Content

Hook-injected content (`load-skill` file content, `load-rules` text) is UNTRUSTED operator-supplied input. The orchestrator MUST enforce these constraints when injecting content into sub-agent prompts:

1. Content MUST be wrapped in a clearly delimited block so the sub-agent can distinguish it from core instructions.
2. Injected content MUST NOT alter gate verdicts, override core instructions, or claim elevated authority.
3. Injected content is prose guidance only — it carries no executable semantics.
4. `after-archive` injected content MUST be discarded after that single dispatch and MUST have no persistence side effects.

**`run-command` trust note**: `run-command` is the highest-trust action type. `PreToolUse` enforces a limited DENY/ASK pattern set; commands not matching a configured rule pass through. Operators MUST treat hook commands as equivalent to trusted repository scripts.

**`load-skill` failure path**: if the skill file is not found or fails path-confinement validation, the action outcome is `failed` and the `on_failure` policy applies. A missing file is not unconditionally fatal.

#### Scenario: load-rules injected in delimited block

- GIVEN a `load-rules` action with valid rules text fires before a sub-agent dispatch
- WHEN the orchestrator builds the sub-agent prompt
- THEN the rules text MUST appear inside a delimited block, separated from core instructions
- AND the injected text MUST NOT contain directives that claim to override gate verdicts or core agent rules

#### Scenario: after-archive content not persisted

- GIVEN a `load-rules` or `load-skill` action fires at the `after-archive` boundary
- WHEN the dispatch completes
- THEN the accumulated content MUST be discarded
- AND no hook-injected content from this boundary MUST appear in any subsequent sub-agent prompt or persisted artifact

---

## ADDED Requirements — Remediation Pass #2 (2026-06-20)

These requirements extend and sharpen the 4R Remediation section above; earlier sections are otherwise unchanged.

### Requirement: Non-string `skill` field MUST be rejected without throwing

When `skill` is present on a `load-skill` action but is not a string (e.g. YAML integer `42`, boolean `true`, object `{}`, or array `[1]`), `validateHooksBlock` MUST:

1. NOT throw a `TypeError` or any other exception.
2. Push an error of the form `{prefix}: load-skill 'skill' must be a string`.
3. Return `{valid: false}`.

The function MUST NOT call `_isConfinedSkillPath` when `skill` is a non-string truthy value.

`_isConfinedSkillPath` MUST also return `false` (not throw) when called directly with a non-string argument (defense-in-depth).

#### Scenario: integer skill — no throw, type error

- GIVEN a `load-skill` action with `skill: 42`
- WHEN `validateHooksBlock` is called
- THEN it MUST NOT throw
- AND `valid` MUST be `false`
- AND errors MUST contain a message matching `skill.*must be a string`

#### Scenario: boolean skill — no throw, type error

- GIVEN a `load-skill` action with `skill: true`
- WHEN `validateHooksBlock` is called
- THEN it MUST NOT throw AND `valid` MUST be `false`

#### Scenario: object skill — no throw, type error

- GIVEN a `load-skill` action with `skill: {}`
- WHEN `validateHooksBlock` is called
- THEN it MUST NOT throw AND `valid` MUST be `false`

#### Scenario: array skill — no throw, type error

- GIVEN a `load-skill` action with `skill: [1]`
- WHEN `validateHooksBlock` is called
- THEN it MUST NOT throw AND `valid` MUST be `false`

---

### Requirement: Non-string `rules` field MUST be rejected

When `rules` is present on a `load-rules` action but is not a string (e.g. number `42`, object `{}`), `validateHooksBlock` MUST:

1. Push an error of the form `{prefix}: load-rules 'rules' must be a string`.
2. Return `{valid: false}`.

It MUST NOT silently pass (a non-string value's `.length` property is `undefined`, which evaluates `undefined > 4000` as `false`, bypassing the length cap check entirely).

#### Scenario: number rules — rejected as non-string

- GIVEN a `load-rules` action with `rules: 42`
- WHEN `validateHooksBlock` is called
- THEN `valid` MUST be `false`
- AND errors MUST contain a message matching `rules.*must be a string`

#### Scenario: object rules — rejected as non-string

- GIVEN a `load-rules` action with `rules: {}`
- WHEN `validateHooksBlock` is called
- THEN `valid` MUST be `false`
- AND errors MUST contain a message matching `rules.*must be a string`

---

### Requirement: Symlink-Escape Guard for `load-skill`

String-only path confinement (`_isConfinedSkillPath`) cannot detect a symlink under `skills/` that points outside the repository root. The orchestrator MUST implement a symlink-escape guard as a mandatory pre-read step:

1. After `_isConfinedSkillPath` accepts the string path, resolve the real filesystem path of `action.skill` relative to the repository root.
2. Verify the resolved real path is still within the repository root directory.
3. If the resolved path escapes (e.g. a symlink target outside the repo), treat the action as `outcome: failed` and apply the `on_failure` policy. Do NOT read the file.

This guard is an orchestrator-level runtime requirement and is NOT testable by the pure helper module (which is string-only, zero fs access).

#### Scenario: symlink escaping repo root — rejected at runtime

- GIVEN a `load-skill` path that passes string validation (`skills/evil-link.md`)
  AND `skills/evil-link.md` is a symlink pointing to a path outside the repository root
- WHEN the orchestrator processes the `load-skill` action
- THEN the orchestrator MUST NOT read the symlink target
- AND the action outcome MUST be `failed`
- AND the `on_failure` policy MUST be applied

---

### Requirement: Credential Hygiene for `run-command` Audit

`action.command` strings are written verbatim into `state.yaml` via the `lifecycle_hooks:` audit block. Because `state.yaml` is a committable VCS artifact, operators MUST NOT embed secrets, tokens, passwords, or any credentials directly in hook `command` fields. Use environment variable references (e.g. `$MY_TOKEN`) or secret-manager resolution at runtime — never inline credential literals.

#### Scenario: command string persisted into state.yaml

- GIVEN a `run-command` hook fires and its command is `npm run preflight`
- WHEN the orchestrator writes the audit entry
- THEN `lifecycle_hooks.{event}.actions[N].command` in `state.yaml` MUST equal `"npm run preflight"` verbatim
- AND if the command string contained a secret, it would be exposed in the committed artifact — therefore operators MUST NOT use inline secrets in `command` fields
