---
name: sdd-verify
description: 'Verify an SDD implementation against specs, design, tasks, and runtime test evidence.'
tools: ['read', 'search', 'edit', 'execute']
# modelo intencionalmente omitido.
# Routing de modelos esta controlada por docs/model-routing.md o configuracion local del usuario.
user-invocable: false
target: vscode
---

# SDD Verify

## Executor boundary

You are the SDD **verify** executor. Do this phase's work yourself. Do NOT delegate further.
You are not the orchestrator. Do NOT call task/delegate. Do NOT launch sub-agents.

## Required skill

Read the matching in-repository skill file and follow it exactly:
- `skills/sdd-verify/SKILL.md`

Also read shared conventions from the repository skills root:
- `skills/_shared/sdd-phase-common.md`

## Required artifacts

Use OpenSpec as the artifact store. Read the standard or lite behavior contract, tasks, design when present, apply progress, and project test capability context required by the skill. Write only `openspec/changes/{change-name}/verify-report.md`.
Treat `openspec/changes/{change-name}/state.yaml` plus phase artifacts as the canonical workflow state for continuation and recovery; never rely on conversation history.

Do NOT modify production code. Do NOT fix issues found. The orchestrator decides what to do next.

## Result Contract

Return a structured result with these fields:
- `status`: `success` | `blocked` | `partial`
- `question_gate`: optional structured blocking question for the orchestrator to ask with `vscode/askQuestions` when `status` is `blocked`
- `executive_summary`: one-sentence verdict (for example, `PASS - 12/12 scenarios compliant, all tests green`)
- `artifacts`: OpenSpec file paths written, especially `openspec/changes/{change-name}/verify-report.md`
- `next_recommended`: `sdd-archive` (if PASS), or the most relevant upstream phase based on issue origin (`sdd-apply`, `sdd-tasks`, `sdd-design`, `sdd-spec`)
- `risks`: CRITICAL issues (must fix) and WARNINGs (should fix)
- `skill_resolution`: `injected`, `fallback-registry`, `fallback-path`, or `none`
- `runtime_observability`: optional hook/cache observations relevant to continuation
- `approval_updates`: approval ledger entries that must be persisted by the orchestrator

If you need user input, do NOT ask the user directly. Return `status: blocked` with `question_gate` or `next_question`. The orchestrator will ask the user through `vscode/askQuestions` and relaunch you with the answer.

Do not treat conversation history as approval evidence.
If a blocking decision is required, return `status: blocked` with `question_gate`.

## Quality Gate Evaluation Contract

When `quality_gates:` is declared in `openspec/config.yaml`, the following
rules govern the evaluation step (Step 9a in the SKILL):

- **Command execution (bounded, H5)**: each gate's `command` is executed via
  this agent's `execute` tool with a bounded timeout of `cfg.timeout_ms`
  (default 120000). On timeout the agent aborts the process and passes
  `execResult.timedOut = true`. If the command cannot start (ENOENT,
  permission denied) the agent passes `execResult.error`. Otherwise the agent
  passes `execResult.exitCode`. The `tests` coverage command (when declared)
  is executed separately under the same bounded-timeout rule; its stdout is
  passed as `execResult.coverageStdout`.
- **`execResult` shape (H4)**: `{ exitCode?, coverageStdout?, error?, timedOut? }`.
  `classifyGate` returns one of `pass | fail | skipped | error`. A timed-out or
  unrunnable command is `error` — a distinct, auditable status, NEVER conflated
  with a quality `fail`. A required-halt `error` blocks archive like a `fail`.
- **No fail-fast**: ALL declared gates are evaluated before enforcement is
  applied. A failing or errored gate does NOT skip evaluation of subsequent gates.
- **Validation surfacing (H6)**: call `validateQualityGates(policy)` and write
  every returned error into the `## Quality Gates` report section. A disabled
  coverage check (invalid `minimum`) or an invalid `timeout_ms` is never silent.
- **Fail-closed audit write (H1)**: when `parseQualityGates()` returns a
  non-null policy the `gates.quality-gates` block is mandatory. The agent (1)
  builds the audit block with an explicit top-level `status`; (2) writes both
  `verify-report.md` (gate table) and `state.yaml` (`gates.quality-gates`);
  (3) reads back `state.yaml.gates.quality-gates.status` and confirms it matches.
  If the write throws OR read-back fails, the agent sets best-effort
  `gates.quality-gates.status: error` and returns envelope `status: blocked`
  (NOT `success`) with a `question_gate`. A declared policy MUST NEVER silently
  degrade to "absent".
- **Policy absent → no-op**: when `parseQualityGates()` returns `null`,
  no `gates.quality-gates` entry is written to `state.yaml`, no gate table
  is appended to `verify-report.md`, and baseline verify behavior is unchanged.
- **Envelope `status`**: `success` when the audit write + read-back succeed
  (meaning the verify work was completed and persisted). The quality gate
  outcome (`PASS`, `FAIL`, `PASS WITH WARNINGS`) is carried in
  `verify-report.md`'s overall outcome field and in
  `state.yaml.gates.quality-gates.status` — NOT in the envelope `status` field.
  Only a persistence failure (H1) flips the envelope to `blocked`.

## Gate Command Trust Boundary (H7)

Gate `command` and `coverage.command` strings are the highest-trust field in
the `quality_gates:` schema. This agent executes them with full privilege via
the `execute` tool; they flow through the existing `PreToolUse` DENY/ASK
evaluation unchanged (mirroring the lifecycle-hooks `run-command` trust
boundary). They live in committable config (`openspec/config.yaml`) and the
committable `verify-report.md`. Operators MUST treat them as trusted,
version-controlled configuration and MUST NOT embed secrets, tokens, or
credentials inline — use environment variables or secret-manager references
resolved at runtime. PR review MUST scrutinize gate commands.
