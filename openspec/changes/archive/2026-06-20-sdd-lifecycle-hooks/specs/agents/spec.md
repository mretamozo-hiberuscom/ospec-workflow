# Delta for agents

## Scope Note

This delta adds hook-injected prompt content to sub-agent launch prompt
composition. Sections 1–11 of the main agents spec
(`openspec/specs/agents/spec.md` — agent catalog, frontmatter contract, slash
commands, executor boundary, skill-loading pattern, result envelope, 4R dispatch,
target transformations, federated parameters) are **fully preserved and not
modified**. Only the orchestrator's launch-prompt composition step is extended.

---

## ADDED Requirements

### Requirement: Hook-Injected Content in Sub-Agent Launch Prompts

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

#### Scenario: `load-skill` content injected before apply

- GIVEN `hooks.before-implementation` declares `type: load-skill, skill: skills/custom/SKILL.md`
  AND that file exists
- WHEN the orchestrator dispatches `sdd-apply`
- THEN the launch prompt MUST include a `## Hook-Injected Skills and Rules` block
  containing the content of `skills/custom/SKILL.md`
- AND the `## Project Standards (auto-resolved)` block (if present) MUST appear before it

#### Scenario: `load-rules` prose appended after project standards

- GIVEN `hooks.before-verify` declares `type: load-rules, rules: "Always check coverage >= 80%"`
- WHEN the orchestrator dispatches `sdd-verify`
- THEN the launch prompt MUST include the inline text in a `## Hook-Injected Skills and Rules` block
- AND the block MUST appear after any existing `## Project Standards` section

#### Scenario: No hook actions — prompt composition unchanged

- GIVEN no `load-skill` or `load-rules` actions fire at a boundary
- WHEN the orchestrator dispatches any sub-agent
- THEN the launch prompt is identical to the pre-lifecycle-hooks baseline
- AND no `## Hook-Injected Skills and Rules` block is added

#### Scenario: `skill_resolution` unaffected by hook injection

- GIVEN a sub-agent receives hook-injected content via `load-skill`
  AND also receives `## Project Standards (auto-resolved)` via the standard skill-resolver
- WHEN the sub-agent returns its envelope
- THEN `skill_resolution` MUST be `injected` (reflecting the standard resolver path)
- AND the `## Hook-Injected Skills and Rules` block does NOT alter that value

#### Scenario: Multiple actions merged into single block

- GIVEN `hooks.before-change` declares `[load-skill A, load-rules B, load-skill C]`
- WHEN all three actions succeed and the next sub-agent is dispatched
- THEN the launch prompt MUST contain a single `## Hook-Injected Skills and Rules` block
- AND the content appears in the order A → B → C
