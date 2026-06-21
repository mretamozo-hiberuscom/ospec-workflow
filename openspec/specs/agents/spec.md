# Spec: agents

## Overview

The `agents/` directory contains the executable agent definition files for all SDD workflow participants. Each file is a `*.agent.md` document whose YAML frontmatter declares the agent contract and whose Markdown body provides behavioral instructions loaded at invocation time. The `commands/` directory contains companion slash-command prompt files (`*.prompt.md`) that route user-typed commands to the orchestrator.

All agent files are source artifacts for the generator. The generator transforms them into target-native layouts (claude, vscode, github-copilot, opencode) as documented in the `generator` domain spec.

---

## 1. Agent Catalog

The catalog contains 19 agent definitions in three structural roles.

### 1.1 Orchestrator

| File | Name | `user-invocable` |
|------|------|-----------------|
| `agents/sdd-orchestrator.agent.md` | `sdd-orchestrator` | `true` |

The orchestrator is the single COORDINATOR in the system. It does not execute SDD phase work directly; it delegates ALL real work to phase sub-agents and synthesizes results. It is the only agent that holds the `agent` tool grant (enabling sub-agent delegation). See Section 4 for the executor-vs-coordinator boundary.

On the **claude** target the orchestrator is emitted as a SKILL (`skills/sdd-orchestrator/SKILL.md`) rather than a sub-agent, because the claude runtime exposes it through the rules/skill mechanism. On all other targets it is a normal agent file.

### 1.2 SDD Phase Executors

All files below have `user-invocable: false` and `tools: ['read', 'search', 'edit', 'execute']`.

| File | Phase purpose |
|------|--------------|
| `agents/sdd-init.agent.md` | Initialize OpenSpec context, detect stack, bootstrap persistence |
| `agents/sdd-foundation.agent.md` | Guide new-project discovery, foundation docs, config completion |
| `agents/sdd-baseline.agent.md` | Seed baseline specs for brownfield repos, one domain per batch |
| `agents/sdd-workspace.agent.md` | Federated multi-repo workspace operations |
| `agents/sdd-explore.agent.md` | Codebase investigation; reads only, no spec files created |
| `agents/sdd-onboard.agent.md` | Guided end-to-end SDD walkthrough using the real codebase |
| `agents/sdd-propose.agent.md` | Produce proposal or proposal-lite artifact |
| `agents/sdd-spec.agent.md` | Translate proposal into domain spec(s) |
| `agents/sdd-clarify.agent.md` | Resolve residual ambiguities between spec and design |
| `agents/sdd-design.agent.md` | Produce design artifact from proposal + specs |
| `agents/sdd-tasks.agent.md` | Break design into implementable tasks with review-workload forecast |
| `agents/sdd-apply.agent.md` | Implement assigned tasks in resumable batches |
| `agents/sdd-verify.agent.md` | Validate implementation against specs; reports findings |
| `agents/sdd-archive.agent.md` | Close a change and persist final state |

### 1.3 4R Reviewers

All four files have `user-invocable: false` and `tools: ['read', 'search']` (read-only).

| File | Reviewer purpose |
|------|----------------|
| `agents/review-risk.agent.md` | Security and risk: privilege scope, PII exposure, injection, auth bypass |
| `agents/review-readability.agent.md` | Readability: ambiguous names, deep nesting, unexplained decisions |
| `agents/review-reliability.agent.md` | Reliability: missing error-path tests, non-determinism, absent validation |
| `agents/review-resilience.agent.md` | Resilience: missing I/O error handling, incomplete recovery, swallowed exceptions |

---

## 2. Agent Frontmatter Contract

Every `*.agent.md` file MUST include a YAML frontmatter block. The canonical source format targets the vscode runtime.

### 2.1 Required Fields

| Field | Type | Requirement | Notes |
|-------|------|-------------|-------|
| `name` | string | MUST be present | Unique identifier; matches the filename stem (e.g., `sdd-apply`) |
| `description` | string | MUST be present | One-line purpose statement used by the orchestrator's delegation table |
| `tools` | YAML array | MUST be present | Abstract tool grant; see Section 2.3 |
| `user-invocable` | boolean | MUST be present | `true` only for the orchestrator; `false` for all phase agents and reviewers |
| `target` | string | MUST be `vscode` in source | Generator strips or replaces this field per target |

### 2.2 Optional / Derived Fields

| Field | Scope | Notes |
|-------|-------|-------|
| `agents` | Orchestrator only | Lists all sub-agents the orchestrator may delegate to |
| `model` | Injected by generator | Intentionally absent from source files; generator adds the resolved model alias or provider/tier slug per target |

The comment `# modelo intencionalmente omitido.` appears in all phase agent sources to document the deliberate absence of a model field. The generator resolves models from `docs/model-routing.md` or local user configuration.

### 2.3 Abstract Tool Names

Source files use abstract tool names. The generator expands them to target-native equivalents.

| Abstract | Claude expansion | Opencode expansion | Copilot mapping |
|----------|------------------|--------------------|-----------------|
| `read` | `Read` | `read: true` | `read` |
| `search` | `Grep`, `Glob` | `grep: true`, `glob: true` | `search` |
| `edit` | `Edit`, `Write` | `edit: true`, `write: true` | `edit` |
| `execute` | `Bash` | (varies) | `execute` |
| `agent` | `Task` | (varies) | `agent` |
| `vscode/askQuestions` | `AskUserQuestion` | `question: true` | `ask_user` |

No `vscode/`-namespaced strings SHALL remain in any generated claude tree.

---

## 3. Slash-Command Prompt Files

The `commands/` directory contains `*.prompt.md` files. These are not agent executors; they are lightweight routing entries that activate the orchestrator through a slash command.

### 3.1 Command Frontmatter

| Field | Requirement | Notes |
|-------|-------------|-------|
| `name` | MUST be present in source | Stripped in opencode (filename is the ID) |
| `description` | MUST be present | One-line label shown in autocomplete |
| `agent` | MUST be `sdd-orchestrator` | Routes to the orchestrator, never to a phase agent directly |
| `argument-hint` | OPTIONAL | Human hint for expected arguments |
| `tools` | OPTIONAL | Tool grant override for the command context |

Input placeholders in the body use VS Code syntax: `${input}` (bare, positional) or `${input:fieldName}` (named). The generator transforms these per target (opencode uses `$ARGUMENTS` / `$1`, `$2` positional; claude uses `$name`).

### 3.2 Command Roster

| File | Slash command | Routes to |
|------|--------------|-----------|
| `commands/sdd-init.prompt.md` | `/sdd-init` | sdd-orchestrator → sdd-init |
| `commands/sdd-new.prompt.md` | `/sdd-new` | sdd-orchestrator |
| `commands/sdd-continue.prompt.md` | `/sdd-continue` | sdd-orchestrator |
| `commands/sdd-ff.prompt.md` | `/sdd-ff` | sdd-orchestrator |
| `commands/sdd-lite.prompt.md` | `/sdd-lite` | sdd-orchestrator |
| `commands/sdd-baseline.prompt.md` | `/sdd-baseline` | sdd-orchestrator → sdd-baseline |
| `commands/sdd-explore.prompt.md` | `/sdd-explore` | sdd-orchestrator → sdd-explore |
| `commands/sdd-propose.prompt.md` | `/sdd-propose` | sdd-orchestrator |
| `commands/sdd-spec.prompt.md` | `/sdd-spec` | sdd-orchestrator |
| `commands/sdd-clarify.prompt.md` | `/sdd-clarify` | sdd-orchestrator |
| `commands/sdd-design.prompt.md` | `/sdd-design` | sdd-orchestrator |
| `commands/sdd-tasks.prompt.md` | `/sdd-tasks` | sdd-orchestrator |
| `commands/sdd-apply.prompt.md` | `/sdd-apply` | sdd-orchestrator |
| `commands/sdd-verify.prompt.md` | `/sdd-verify` | sdd-orchestrator |
| `commands/sdd-archive.prompt.md` | `/sdd-archive` | sdd-orchestrator |
| `commands/sdd-onboard.prompt.md` | `/sdd-onboard` | sdd-orchestrator |
| `commands/sdd-workspace.prompt.md` | `/sdd-workspace` | sdd-orchestrator |

---

## 4. Executor-vs-Coordinator Boundary

This is the primary architectural invariant for the agent system.

### 4.1 Coordinator (Orchestrator)

Given the `sdd-orchestrator` agent receives a user request,
When the request requires reading 4+ files, writing across multiple files, or running tests/builds,
Then it MUST delegate to a phase sub-agent via the `agent` / `Task` tool and MUST NOT perform that work inline.

The orchestrator MAY perform inline: reads of 1-3 files to verify state, atomic single-file writes of known content, and git/gh bash commands for state queries.

The orchestrator MUST NOT be loaded as an executor phase agent. It MUST NOT perform phase work itself.

### 4.2 Executor (Phase Agents and Reviewers)

Given any phase agent receives a delegated task,
When it begins execution,
Then it MUST do the work itself and MUST NOT call `delegate`, `task`, or launch sub-agents.

Every phase agent file's body opens with an `## Executor boundary` section that enforces this invariant explicitly. Phase agents that need user input MUST return `status: blocked` with `question_gate`; they MUST NOT ask the user directly.

### 4.3 Blocking Question Flow

Given a phase agent cannot safely continue without user input,
When it reaches a blocking decision point,
Then it MUST return `status: blocked` with a structured `question_gate` payload.

The orchestrator receives the blocked envelope, extracts `question_gate`, and MUST call `vscode/askQuestions` (target-specific equivalent) to relay the question. The orchestrator MUST NOT continue downstream phases until the answer is available. It relaunches the phase agent with the answer.

Conversation history MUST NOT be treated as approval evidence. Persisted approval entries in `openspec/changes/{change-name}/state.yaml` are the canonical approval record.

---

## 5. Skill-Loading Pattern

Every phase agent body instructs loading two files before work begins:

1. `skills/{phase-name}/SKILL.md` — phase-specific procedure and decision gates
2. `skills/_shared/sdd-phase-common.md` — shared executor protocol (artifact retrieval, persistence, return envelope shape)

Agents do NOT reload their own `*.agent.md` frontmatter at runtime; the frontmatter is consumed by the target runtime. The body text is the actual instruction set.

See the `skills` domain spec for the frontmatter contract and registry inclusion rules.

---

## 6. Result Envelope Contract

### 6.1 SDD Phase Agent Envelope

All SDD phase agents (Section 1.2) MUST return the following fields:

| Field | Type | Requirement |
|-------|------|-------------|
| `status` | `success` \| `partial` \| `blocked` | MUST be present |
| `executive_summary` | string | MUST be present; one sentence |
| `artifacts` | list of paths | MUST be present; paths written this batch |
| `next_recommended` | string | MUST be present; next phase or action |
| `risks` | string or list | MUST be present; deviations, blockers, or "None" |
| `skill_resolution` | enum | MUST be present; see Section 6.3 |
| `question_gate` | object | MUST be present when `status: blocked` |
| `runtime_observability` | object | OPTIONAL; hook/cache observations relevant to continuation |
| `approval_updates` | list | OPTIONAL; approval ledger entries for the orchestrator to persist |

`status: partial` indicates work completed for this batch with more batches remaining. The orchestrator relaunches the same phase.

`status: blocked` halts the pipeline until the orchestrator resolves the blocking question through user interaction.

### 6.2 4R Reviewer Envelope

All four reviewer agents (Section 1.3) MUST return:

| Field | Type | Requirement |
|-------|------|-------------|
| `status` | `success` | MUST always be `success` |
| `executive_summary` | string | MUST be finding count by severity, or exactly `"No findings."` |
| `findings` | list | MUST be present; empty list when clean |
| `artifacts` | `[]` | MUST be empty; reviewers NEVER write files |
| `next_recommended` | `none` | MUST be `none`; orchestrator decides routing |
| `risks` | string | SHOULD note scan scope limitations |
| `skill_resolution` | enum | MUST be present |

When a reviewer has no findings, its output body MUST be exactly `No findings.` with no additional prose.

### 6.3 skill_resolution Values

| Value | Meaning |
|-------|---------|
| `injected` | Orchestrator injected compact rules in the launch prompt (preferred path) |
| `fallback-registry` | Agent loaded rules from `.ospec/cache/skill-registry.cache.json` |
| `fallback-path` | Agent loaded exact `SKILL.md` fallback paths |
| `none` | No skill source was available |

The `SubagentStop` hook reads this field from each returning agent envelope. Any value other than `injected` triggers an observability warning, prompting the orchestrator to re-read the registry cache and inject compact rules in subsequent delegations.

---

## 7. 4R Review Gate Dispatch

### 7.1 Parallel Dispatch

Given the active route reaches the 4R review gate hook point,
When the orchestrator dispatches the gate,
Then it MUST launch all four reviewers (risk, readability, reliability, resilience) as parallel sub-agents when the target runtime supports async delegation, degrading to serial dispatch only when parallel delegation is unavailable.

The orchestrator MUST collect all four envelopes before evaluating findings.

### 7.2 Finding Severity Escalation

Given the orchestrator has collected all four reviewer envelopes,
When any finding has severity `BLOCKER` or `CRITICAL`,
Then the orchestrator MUST surface it to the user via `vscode/askQuestions` before the route closes. The route MUST NOT auto-halt on these severities; the user decides remediation.

`WARNING` and `SUGGESTION` findings are recorded in `state.yaml` but MUST NOT interrupt the route.

### 7.3 Gate Hook Points

| Route | Gate hook point |
|-------|----------------|
| `debug` | After `sdd-apply` completes; `sdd-verify` is skipped on this route |
| `standard` | After `sdd-verify` returns `status: success` (only when `gates` lists `4r-review-gate`) |

---

## 8. Target-Specific Transformations

### 8.1 Per-Target Summary

| Aspect | vscode (source) | claude | github-copilot | opencode |
|--------|----------------|--------|----------------|----------|
| Agent path | `agents/*.agent.md` | `agents/*.md` | `.github/agents/*.agent.md` | `.opencode/agents/*.md` |
| Suffix | `.agent.md` | `.md` | `.agent.md` | `.md` |
| `target` field | `vscode` | stripped | `github-copilot` | stripped |
| `user-invocable` | present | stripped | present | stripped (→ `mode`) |
| `model` | absent | added (alias) | absent | added (provider/slug) |
| `tools` format | YAML array | array (expanded) | array (mapped) | YAML boolean map |
| Orchestrator | agent file | SKILL file | agent file | agent file |
| `mode` field | absent | absent | absent | `primary` or `subagent` |

### 8.2 Opencode `mode` Derivation

The opencode target derives the `mode` field from `user-invocable`:
- `user-invocable: true` → `mode: primary`
- `user-invocable: false` → `mode: subagent`

This field is required by the opencode runtime for every agent and MUST NOT be present in the vscode source.

### 8.3 Claude Orchestrator Promotion

On the claude target the orchestrator MUST be emitted as `skills/sdd-orchestrator/SKILL.md` and MUST NOT appear as `agents/sdd-orchestrator.md`. The skill carries `name` and `description` from the frontmatter, the inlined rules content, and applies all tool substitutions. It MUST NOT carry `model`, `tools`, or `target` fields.

---

## 9. Scenarios

### Scenario 9.1 — Phase agent completes successfully

Given `sdd-apply` receives a task batch from the orchestrator,
When it implements all assigned tasks,
Then it MUST return `status: success` with all written file paths in `artifacts`, `next_recommended: sdd-verify`, and `skill_resolution` reflecting how skills were loaded.

### Scenario 9.2 — Phase agent blocked on user input

Given `sdd-tasks` encounters a review-workload decision that exceeds the 400-line budget,
When it cannot resolve the delivery strategy autonomously,
Then it MUST return `status: blocked` with a `question_gate` object containing at least one question with options, and MUST NOT ask the user directly.

### Scenario 9.3 — Reviewer finds no issues

Given `review-resilience` scans the applied change,
When it detects no missing error handling, recovery paths, or swallowed exceptions,
Then its output body MUST be exactly `No findings.` and `findings` MUST be an empty list.

### Scenario 9.4 — Reviewer finds a BLOCKER

Given `review-risk` detects an auth bypass with a specific file and line reference,
When it returns its envelope with severity `BLOCKER`,
Then the orchestrator MUST call `vscode/askQuestions` to surface the finding before the route closes and MUST record the outcome in `state.yaml` under `gates['4r-review-gate']`.

### Scenario 9.5 — SubagentStop detects degraded skill resolution

Given a phase agent returns `skill_resolution: fallback-registry`,
When the `SubagentStop` hook processes the envelope,
Then it MUST emit an observability warning, and the orchestrator MUST re-read the registry cache and inject compact rules into all subsequent sub-agent launch prompts.

---

## 10. Federated `target_dir` Parameter

> Promoted from change `federation-distributed-markers` (C1) on 2026-06-18.

### Requirement: sdd-init `target_dir` Parameter

The `sdd-init` agent MUST accept an optional `target_dir` parameter specifying the
directory in which to perform initialization. When `target_dir` is present, the agent
MUST operate on that directory instead of the current working directory; all artifact
reads and writes MUST be relative to `target_dir`. When `target_dir` is absent, the
agent MUST fall back to the current working directory (backward-compatible behavior).

The orchestrator uses `target_dir` to drive per-member `sdd-init` in a federated
workspace without changing the orchestrator's own working directory (D3).

**Propagation mechanism**: `target_dir` MUST be passed to the agent as a
`## Parameters` block injected into the launch prompt, using the same pattern as
`## Project Standards`. The block MUST contain a `target_dir: <path>` line. The
skill reads this value from the prompt text; no environment variable and no dynamic
frontmatter field is used. When the `## Parameters` block is absent, `target_dir`
is considered absent and cwd fallback applies.

When `target_dir` is present but does not exist on the filesystem, the agent MUST
return `status: blocked` with a `question_gate` describing the invalid path; it
MUST NOT create files at any unintended location.

#### Scenario: `target_dir` provided — init scoped to specified directory

- GIVEN the orchestrator calls `sdd-init` with `target_dir: /workspace/services/auth`
- WHEN `sdd-init` runs
- THEN all artifact reads and writes are relative to `/workspace/services/auth`
- AND the current working directory is NOT used as the base path

#### Scenario: `target_dir` absent — backward-compatible cwd behavior

- GIVEN the orchestrator calls `sdd-init` with no `target_dir` parameter
- WHEN `sdd-init` runs
- THEN it operates on the current working directory
- AND behavior is identical to the pre-C1 baseline

#### Scenario: `target_dir` points to a non-existent path

- GIVEN the orchestrator calls `sdd-init` with `target_dir: /workspace/missing-svc`
  AND that path does not exist on the filesystem
- WHEN `sdd-init` begins execution
- THEN it MUST return `status: blocked` with a `question_gate` describing the invalid path
- AND it MUST NOT create files at an unintended location

---

## 11. Federated Foundation

> Promoted from change `federated-foundation-orchestration` (C3) on 2026-06-19.

### Requirement: sdd-orchestrator Federated Foundation Delegation

Cuando el backend de almacenamiento es `workspace-federated` y se inicia la fase de foundation, el orquestador delegará en `sdd-foundation` pasando `workspace_yaml` apuntando a `workspace.yaml` y `parent_change` conteniendo el nombre del cambio activo.

#### Scenario: Delegating with workspace_yaml
- GIVEN the workspace-federated backend is active and the foundation phase is triggered
- WHEN the orchestrator delegates to `sdd-foundation`
- THEN it passes `workspace_yaml` pointing to the physical atlas cache and `parent_change` containing the active change name

---

### Requirement: sdd-foundation Federated Scans

El agente `sdd-foundation` en modo federado aceptará y procesará `workspace_yaml` y `parent_change` para escanear las especificaciones miembro locales (`{member}/openspec/specs/**/spec.md`) e integrarlas en la síntesis del baseline técnico del coordinador.

#### Scenario: Scanning member specs
- GIVEN the foundation agent runs in federated mode with `workspace_yaml`
- WHEN the execution steps run
- THEN the agent scans `{member}/openspec/specs/**/spec.md` locales
- AND synthesizes provides/consumers dependencies into `Mapa de Contratos e Interacciones`

---

### Requirement: sdd-foundation Interactive Fallback Loop

El agente `sdd-foundation` iniciará un bucle interactivo de remediación si el servidor MCP de MarkItDown no está configurado, deteniendo la ingesta y preguntando al usuario vía `vscode/askQuestions` antes de continuar con el descubrimiento manual.

#### Scenario: Interactive fallback loop executed
- GIVEN the MarkItDown MCP server is not available during document ingestion
- WHEN the agent executes the fallback check
- THEN it presents the interactive gate via `vscode/askQuestions`
- AND acts according to the selected option (automatic setup, manual guided configuration, or skip)

---

## 12. Hook-Injected Content in Sub-Agent Launch Prompts

When `load-skill` or `load-rules` actions fire at a lifecycle event boundary
immediately before a sub-agent is dispatched, the orchestrator MAY inject the
resolved content into that sub-agent's launch prompt as a `## Hook-Injected Skills
and Rules` block.

Composition rules:

- Hook-injected content MUST be appended **after** the `## Project Standards
  (auto-resolved)` block (or equivalent skill-resolver injection), never before it
  and never replacing it.
- `load-skill`: the orchestrator MUST read the file at `skill: <path>` relative to
  the repo root and include its textual content in the injected block.
- `load-rules`: the orchestrator MUST include the `rules:` inline text verbatim in
  the injected block.
- When multiple `load-skill` and `load-rules` actions fire at the same boundary,
  their content MUST be appended in declaration order within the single
  `## Hook-Injected Skills and Rules` block.
- The `skill_resolution` field in the sub-agent's return envelope continues to
  reflect the standard skill-resolver resolution path (Section A of
  `sdd-phase-common.md`). Hook injection does NOT change `skill_resolution`
  semantics and MUST NOT be reported as `injected` unless the standard resolver
  also injected Project Standards.
- `before-task` hook injections apply to each individual task invocation within
  `sdd-apply`; each task invocation receives a fresh injection based on actions
  that fired for that task boundary.

### Scenario: `load-skill` content injected before apply

- GIVEN `hooks.before-implementation` declares `type: load-skill, skill: skills/custom/SKILL.md`
  AND that file exists
- WHEN the orchestrator dispatches `sdd-apply`
- THEN the launch prompt MUST include a `## Hook-Injected Skills and Rules` block
  containing the content of `skills/custom/SKILL.md`
- AND the `## Project Standards (auto-resolved)` block (if present) MUST appear before it

### Scenario: `load-rules` prose appended after project standards

- GIVEN `hooks.before-verify` declares `type: load-rules, rules: "Always check coverage >= 80%"`
- WHEN the orchestrator dispatches `sdd-verify`
- THEN the launch prompt MUST include the inline text in a `## Hook-Injected Skills and Rules` block
- AND the block MUST appear after any existing `## Project Standards` section

### Scenario: No hook actions — prompt composition unchanged

- GIVEN no `load-skill` or `load-rules` actions fire at a boundary
- WHEN the orchestrator dispatches any sub-agent
- THEN the launch prompt is identical to the pre-lifecycle-hooks baseline
- AND no `## Hook-Injected Skills and Rules` block is added

### Scenario: `skill_resolution` unaffected by hook injection

- GIVEN a sub-agent receives hook-injected content via `load-skill`
  AND also receives `## Project Standards (auto-resolved)` via the standard skill-resolver
- WHEN the sub-agent returns its envelope
- THEN `skill_resolution` MUST be `injected` (reflecting the standard resolver path)
- AND the `## Hook-Injected Skills and Rules` block does NOT alter that value

### Scenario: Multiple actions merged into single block

- GIVEN `hooks.before-change` declares `[load-skill A, load-rules B, load-skill C]`
- WHEN all three actions succeed and the next sub-agent is dispatched
- THEN the launch prompt MUST contain a single `## Hook-Injected Skills and Rules` block
- AND the content appears in the order A → B → C


---

## 13. Capability-Aware Stack-Skill Injection

Before dispatching any SDD phase sub-agent that reads, writes, or reviews code
(i.e., `sdd-apply`, `sdd-design`, `sdd-tasks`, `sdd-spec`, `sdd-verify`, and the
4R reviewers), the orchestrator MUST perform capability-aware stack-skill injection
as an additional step within the existing `## Project Standards (auto-resolved)`
composition:

1. **Candidate resolution**: read the active capability list from the session cache
   (as surfaced by `runSessionStart`) and intersect it with the `capabilities` arrays
   of all registry skill entries. The result is the capability-matched candidate set.

2. **Task-domain filtering (judgment-based)**: from the capability-matched candidate
   set, the orchestrator MUST apply semantic judgment to select only the stack skills
   relevant to the current sub-agent's task. The orchestrator reads each candidate
   skill's `description` and `capabilities` frontmatter and weighs them against the
   content and intent of the current task (e.g., a task such as "crear formulario
   reactivo" targets the frontend domain; the orchestrator selects `stack-angular`
   and does NOT inject `stack-postgres` whose description covers a backend database
   runtime). There is NO explicit `domain:` field on task entries and NO `domain:`
   field on skill frontmatter; selection is entirely by orchestrator judgment over the
   semantic match between skill descriptions and task intent.

3. **Injection**: inject the compact rules of the filtered stack skills into the
   sub-agent launch prompt inside the existing `## Project Standards (auto-resolved)`
   block, appended after utility-skill compact rules. The injection MUST respect the
   existing five-skill cap defined in `skills/_shared/skill-resolver.md`; across the
   combined set (utility + stack) at most five skill blocks MUST be included.

4. **No-op path**: when the active capability list is empty (no `capabilities:` block
   in `config.yaml`) OR when the candidate set is empty (no registry entries match),
   the orchestrator MUST NOT add any stack-skill content and MUST NOT error. Prompt
   composition is identical to the pre-capabilities baseline.

The orchestrator MUST NOT inject stack skills into sub-agents that perform purely
mechanical or meta operations where technology-specific knowledge is irrelevant
(e.g., `sdd-archive`, `sdd-init`).

> **Resolution (AMBIGUITY-A2 — task-domain filtering)**: Selection from the
> capability-matched candidate set is by orchestrator judgment and semantic
> relevance. The orchestrator reads each candidate skill's `description` and
> `capabilities` frontmatter and weighs them against the task content and intent.
> There is NO explicit `domain:` field on task entries and NO `domain:` field on
> skill frontmatter. This mirrors ECC's model: skills are framework/domain-named
> and selection is semantic, not a centralized capability→task map. Stack skills
> MUST carry a meaningful `description` (see skills delta spec) so that
> judgment-based selection is reliable.

> **Resolution (AMBIGUITY-A3 — multi-skill precedence)**: When a single capability
> name resolves to more than one stack-skill entry, the default tie-breaking order
> is deterministic registry order (alphabetical by skill `id`). With the 2–3 seed
> stack skills shipped in v1 (one per technology), this case never occurs in
> practice. A future change that adds multiple skills per capability MUST specify
> an explicit precedence rule at that time.

### Scenario: Capability-matched skills injected for frontend apply task

- GIVEN `config.yaml` declares capabilities `angular` and `postgres`
  AND the registry has `stack-angular` (capabilities: ["angular"]) and `stack-postgres` (capabilities: ["postgres"])
  AND the orchestrator reads `stack-angular`'s description (Angular frontend framework) and `stack-postgres`'s description (PostgreSQL backend runtime) and judges by semantic match that the task intent targets the frontend domain
- WHEN the orchestrator composes the sub-agent launch prompt
- THEN `stack-angular` compact rules are included in `## Project Standards (auto-resolved)`
- AND `stack-postgres` compact rules are NOT included (domain mismatch)

### Scenario: No capabilities declared — baseline prompt, no stack skills

- GIVEN `config.yaml` has no `capabilities:` key
- WHEN the orchestrator dispatches `sdd-apply`
- THEN no stack-skill content is added to the launch prompt
- AND prompt composition is identical to the pre-capabilities baseline

### Scenario: Capability declared but no registry entry matches — silent no-op

- GIVEN `config.yaml` declares capability `vue`
  AND no registry skill entry has `vue` in its `capabilities` array
- WHEN the orchestrator resolves stack skills
- THEN no stack-skill content is injected and no error is raised

### Scenario: Five-skill cap respected across utility and stack skills

- GIVEN the orchestrator has already selected three utility skills by code-context matching
  AND two capability-matched stack skills are in the filtered candidate set
- WHEN the orchestrator composes the launch prompt
- THEN the combined injection contains exactly five skill blocks (three utility + two stack)
- AND no additional skills are added beyond the cap

### Scenario: Stack skills not injected into sdd-archive

- GIVEN `config.yaml` declares active capabilities with matching registry entries
- WHEN the orchestrator dispatches `sdd-archive`
- THEN no stack-skill content is added to that sub-agent's launch prompt

---

## 14. Operative Memory Integration

### Requirement: Phase-Start Operative Memory Read

All SDD phase agents listed in the `project-memory` spec phase-read table SHOULD read the designated `openspec/memory/` files at phase start, before beginning any phase work. This step MUST be performed after the skill-loading step described in Section 5 of the agents spec. Files absent from `openspec/memory/` MUST be silently skipped; absence is not an error.

The memory-read step extends the existing two-step skill-loading pattern to three steps:
1. Load `skills/{phase-name}/SKILL.md`
2. Load `skills/_shared/sdd-phase-common.md`
3. Read designated `openspec/memory/` files (per the `project-memory` spec phase-read table)

#### Scenario: Memory read performed before phase work

- GIVEN `openspec/memory/decisions.md` exists and `sdd-design` is dispatched
- WHEN sdd-design starts execution after loading its skills
- THEN it reads `decisions.md` and `conventions.md` before producing any design output
- AND the memory content informs the design without re-deriving established decisions

#### Scenario: Memory absent — phase proceeds without error

- GIVEN `openspec/memory/` does not exist
- WHEN any phase agent reaches the memory-read step
- THEN it skips all memory reads silently
- AND executes phase work as in the pre-memory baseline

---

### Requirement: sdd-archive Operative Memory Write

After a successful archive, `sdd-archive` MUST execute the decisions-write contract defined in the `project-memory` spec: inspect `open_decisions` in `state.yaml` and prepend all entries with `status: resolved` to `openspec/memory/decisions.md`. This write occurs after the standard archive artifacts are persisted and the `state.yaml` is updated.

`openspec/memory/decisions.md` MUST be listed in the archive phase `artifacts` when at least one entry is written. When no resolved decisions exist, the write is skipped and `artifacts` is unchanged.

#### Scenario: Resolved decisions written as archive artifact

- GIVEN `state.yaml.open_decisions` contains entries with `status: resolved`
- WHEN sdd-archive completes all standard archive steps
- THEN it prepends the resolved entries to `openspec/memory/decisions.md`
- AND `openspec/memory/decisions.md` appears in the returned `artifacts` list

#### Scenario: No resolved decisions — archive unaffected

- GIVEN `state.yaml.open_decisions` is empty or contains only open entries
- WHEN sdd-archive completes
- THEN no write to `openspec/memory/decisions.md` occurs
- AND the archive phase `status` remains `success`

---

### Requirement: sdd-verify Operative Memory Write

After producing its verify report, `sdd-verify` MUST execute the known-issues-write contract defined in the `project-memory` spec: prepend all findings with severity `WARNING` or `BLOCKER` to `openspec/memory/known-issues.md`. The official sdd-verify severity taxonomy is `INFO < WARNING < BLOCKER` (ascending); only `WARNING` and `BLOCKER` qualify for write. This write occurs after the verify report is finalized. Findings at `INFO` severity MUST NOT be written.

`openspec/memory/known-issues.md` MUST be listed in the verify phase `artifacts` when at least one entry is written. A clean verify (no qualifying findings) MUST NOT trigger a write.

#### Scenario: WARNING findings written as verify artifact

- GIVEN sdd-verify produces findings with severity `WARNING` or `BLOCKER`
- WHEN the verify report is finalized
- THEN each qualifying finding is prepended to `openspec/memory/known-issues.md`
- AND `openspec/memory/known-issues.md` appears in the returned `artifacts` list

#### Scenario: Clean verify — known-issues unchanged

- GIVEN sdd-verify produces no findings at WARNING or above
- WHEN the verify phase completes
- THEN no write to `openspec/memory/known-issues.md` occurs
- AND `status` is `success` with no memory-file entry in `artifacts`

---

## Cross-References

- `skills` domain spec: SKILL.md frontmatter contract, trigger/compact-rule extraction, registry inclusion
- `routing` domain spec: route table, gate hook points, 4R gate dispatch conditions
- `generator` domain spec: per-target transformation pipeline, tool-name expansion, model injection
- `hooks` domain spec: `SubagentStop` hook behavior, `skill_resolution` observability
- `skills/_shared/sdd-phase-common.md`: shared executor protocol (artifact retrieval, persistence, return envelope)
- `capability-registry` domain spec — active capability list schema and resolution contract
- `skill-registry` domain spec — `capabilities` field on cache entries
- `skills` domain spec — stack-skill tier definition; `capabilities:` frontmatter
- `skills/_shared/skill-resolver.md` — five-skill cap; injection order; `## Project Standards` block
- `project-memory` spec: canonical file-format contract, ownership table, entry structure, graceful-absence rules
- `openspec/specs/agents/spec.md` Section 5: existing two-step skill-loading pattern extended here to three steps

---

## Clarifications

### Session 2026-06-20

- Q: How does the orchestrator determine which stack skills are relevant to a given task — is there an explicit domain field on task entries or skill frontmatter? → A: No explicit `domain:` field on task entries or skill frontmatter. The orchestrator applies semantic judgment using each candidate skill's `description` and `capabilities` frontmatter weighed against the content and intent of the current task, faithful to ECC's model. The concrete example: a task "crear formulario reactivo" leads the orchestrator to select `stack-angular` and ignore `stack-postgres` by reading their descriptions, not by a domain-field lookup.
- Q: When a single capability name resolves to more than one stack-skill entry, what is the priority order for the five-skill cap? → A: Default to deterministic registry/alphabetical order by skill `id`. With the 2–3 seed skills in v1 (one per technology) this case never occurs. A future change adding multiple skills per capability will specify an explicit precedence rule.
- Q: What is the official sdd-verify severity taxonomy and which levels are written to `known-issues.md`? → A: INFO < WARNING < BLOCKER. The official sdd-verify severity enum is {INFO, WARNING, BLOCKER} in that order. INFO is NEVER written to `known-issues.md`; only WARNING and BLOCKER are promoted. The sdd-verify contract uses the "WARNING-or-above is written" threshold.

