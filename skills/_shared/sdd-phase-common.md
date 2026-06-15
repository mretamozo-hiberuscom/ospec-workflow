# SDD Phase — Common Protocol

Boilerplate identical across all SDD phase skills. Sub-agents MUST load this alongside their phase-specific SKILL.md.

Executor boundary: every SDD phase agent is an EXECUTOR, not an orchestrator. Do the phase work yourself. Do NOT launch sub-agents, do NOT call `delegate`/`task`, and do NOT bounce work back unless the phase skill explicitly says to stop and report a blocker.

## A. Skill Loading

Two distinct layers — do not conflate them:

- **Your phase procedure** — your phase-specific `SKILL.md` plus this common protocol. This is your actual instruction set; **always read both**, regardless of anything below. Without them you have no procedure.
- **Project standards** — project-specific coding/convention rules resolved from the skill registry. The steps below decide only how you pick these up; they never tell you to skip your phase procedure.

How to load project standards:

1. Check if the orchestrator injected a `## Project Standards (auto-resolved)` block in your launch prompt. If yes, follow those rules — they are pre-digested compact rules from the skill registry cache. **Do NOT additionally read the registry or other skills' `SKILL.md` files** (your own phase skill is still required, per above).
2. If no Project Standards block was provided, use the orchestrator session cache when explicitly supplied in the launch prompt.
3. If no session cache was supplied, read `.ospec/cache/skill-registry.cache.json` from the project root if it exists and apply compact rules whose triggers match your current task.
4. If no compact-rule source exists, check for exact `SKILL: Load` instructions. If present, load those exact skill files.
5. If no source exists, proceed with your phase skill only and report `skill_resolution: none`.

NOTE: the preferred path is (1) — compact rules pre-injected by the orchestrator. If `## Project Standards` is present, IGNORE any `SKILL: Load` instructions — they are redundant. This never overrides loading your own phase skill.

## B. Artifact Retrieval (OpenSpec Mode)

If `artifact_store.mode` is `openspec`, read the phase-specific dependencies from `openspec/` before producing output.

OpenSpec files on disk are the canonical workflow state. Do not treat chat memory or conversation history as authoritative when the artifacts exist.

Typical paths:
- `openspec/config.yaml`
- `openspec/specs/**/spec.md`
- `openspec/changes/{change-name}/proposal.md`
- `openspec/changes/{change-name}/specs/**/spec.md`
- `openspec/changes/{change-name}/design.md`
- `openspec/changes/{change-name}/tasks.md`
- `openspec/changes/{change-name}/apply-progress.md`
- `openspec/changes/{change-name}/verify-report.md`
- `openspec/changes/{change-name}/state.yaml`

If `artifact_store.mode` is `none`, use only the context passed by the orchestrator and return the artifact inline.

## C. Artifact Persistence

Every phase that produces an artifact MUST persist it when mode is `openspec`. Skipping this BREAKS the pipeline — downstream phases will not find your output.

### OpenSpec mode

Write the phase artifact to the path defined by the phase skill and `openspec-convention.md`. If the file already exists, read it first and update it instead of blindly overwriting.

After persisting the phase artifact, you MUST also read-merge-update `openspec/changes/{change-name}/state.yaml` so recovery can resume from the filesystem without relying on chat history.

Minimum state shape:

```yaml
change: "{change-name}"
status: "planning | ready-for-apply | applying | ready-for-verify | verified | archived | blocked"
last_updated: 2026-06-01T19:12:00Z
blocking_questions: []
phases:
  proposal:
    status: "done | pending"
    artifact: "openspec/changes/{change-name}/proposal.md"
  spec:
    status: "done | pending"
    artifacts:
      - "openspec/changes/{change-name}/specs/{domain}/spec.md"
  design:
    status: "done | pending"
    artifact: "openspec/changes/{change-name}/design.md"
  tasks:
    status: "done | pending"
    artifact: "openspec/changes/{change-name}/tasks.md"
  apply:
    status: "pending | partial | done"
    artifact: "openspec/changes/{change-name}/apply-progress.md"
  verify:
    status: "pending | done"
    artifact: "openspec/changes/{change-name}/verify-report.md"
  archive:
    status: "pending | done"
    artifact: "openspec/changes/{change-name}/archive-report.md"
```

State update rules:
- Preserve existing phase entries and artifact paths; update only the phase you just executed plus any top-level status that changes because of it.
- Update `last_updated` with the current UTC timestamp every time you write a phase artifact or return `blocked`.
- On `blocked`, set top-level `status: blocked` and record the blocking question(s) or reason in `blocking_questions`.
- On successful `proposal`, `spec`, or `design`, keep top-level `status: planning` unless a later phase already advanced it.
- On successful `tasks`, set `phases.tasks.status: done` and top-level `status: ready-for-apply`.
- On `apply`, set `phases.apply.status: partial` for incomplete batches and `done` for a fully implemented batch. Top-level status becomes `applying` for partial progress or `ready-for-verify` when apply is complete.
- On successful `verify`, set `phases.verify.status: done`. Use top-level `status: verified` for `PASS` and `PASS WITH WARNINGS`; stay `blocked` for `FAIL`.
- On successful `archive`, set `phases.archive.status: done` and top-level `status: archived` before moving the folder.
- Clear resolved entries from `blocking_questions` when the phase succeeds.

### None mode

Return result inline only. Do not write project files.

## D. Return Envelope

Every phase MUST return a structured envelope to the orchestrator:

- `status`: `success`, `partial`, or `blocked`
- `executive_summary`: 1-3 sentence summary of what was done
- `detailed_report`: (optional) full phase output, or omit if already inline
- `artifacts`: list of artifact paths written, or `inline` for `none`
- `next_recommended`: the next SDD phase to run, or "none"
- `risks`: risks discovered, or "None"
- `skill_resolution`: how skills were loaded — `injected` (received Project Standards in the launch prompt, including orchestrator cached rules), `fallback-registry` (loaded from `.ospec/cache/skill-registry.cache.json`), `fallback-path` (loaded exact `SKILL.md` fallback paths), or `none` (no skills loaded)

Example:

```markdown
**Status**: success
**Summary**: Proposal created for `{change-name}`. Defined scope, approach, and rollback plan.
**Artifacts**: `openspec/changes/{change-name}/proposal.md` | inline (none)
**Next**: sdd-spec or sdd-design
**Risks**: None
**Skill Resolution**: injected — 3 skills (react-19, typescript, tailwind-4)
(other values: `fallback-registry`, `fallback-path`, or `none — no source found`)
```

### Blocking Question Envelope

When a phase cannot safely continue without user input, return `status: blocked`.

Do not ask the user directly. The orchestrator owns user interaction.

Use this shape when the question benefits from options, multi-select, or recommendation metadata:

```json
{
  "status": "blocked",
  "blocker_type": "needs_user_decision",
  "executive_summary": "Why the phase is blocked.",
  "question_gate": {
    "reason": "Why this answer is required before continuing.",
    "questions": [
      {
        "header": "Short title",
        "question": "Concrete user-facing question.",
        "options": [
          {
            "label": "Recommended option",
            "description": "Why this is recommended.",
            "recommended": true
          },
          {
            "label": "Alternative option"
          }
        ],
        "multiSelect": false,
        "allowFreeformInput": true
      }
    ]
  },
  "artifacts": [],
  "next_recommended": "Ask user, then rerun this phase.",
  "risks": ["Risk if the decision is guessed."],
  "skill_resolution": "injected"
}
```

If the phase skill has a legacy `next_question` field, it may return `next_question` as plain text. Prefer `question_gate` when structured options are useful.

On `blocked`, update `openspec/changes/{change-name}/state.yaml` with `status: blocked` and record the question or blocker in `blocking_questions`.

## E. Review Workload Guard

SDD must protect reviewer cognitive load, not only generate tasks.

- The default PR review budget is **400 changed lines** (`additions + deletions`).
- The orchestrator MUST cache a delivery strategy at session start: `ask-on-risk` (default), `auto-chain`, `single-pr`, or `exception-ok`.
- The orchestrator MUST pass `delivery_strategy` to `sdd-tasks` and the resolved decision to `sdd-apply`.
- `sdd-tasks` MUST forecast whether the planned work may exceed that budget.
- The forecast MUST include exact plain-text guard lines: `Decision needed before apply: Yes|No`, `Chained PRs recommended: Yes|No`, and `400-line budget risk: Low|Medium|High`.
- If the forecast is high, `sdd-tasks` MUST recommend chained or stacked PRs using deliverable work units.
- `sdd-apply` MUST NOT start oversized work unless the delivery strategy resolves to chained/stacked PR slices or explicitly accepted `size:exception`.
- Each chained PR slice must have a clear start, clear finish, autonomous scope, verification, and reasonable rollback.
- In a Feature Branch Chain, PR #1 targets the feature/tracker branch and later child PRs target the immediate previous PR branch; if GitHub shows previous slices in a child diff, retarget/rebase until the diff is clean.

This guard exists to reduce reviewer burnout and keep implementation delivery safe. Do not treat it as optional process noise.

## F. Communication Language

Sub-agents have no memory of the conversation and never see the user's messages, so they default to English unless told otherwise.

- Write all user-facing prose — `executive_summary`, `detailed_report`, and any `question_gate` / `next_question` text — in the language the orchestrator passes as a `Reply language: {language}` line in your launch prompt.
- If no `Reply language` line is present, mirror the language of the task and context you were given; if still ambiguous, use the repository's prevailing prose language.
- This applies ONLY to conversational output returned to the user. Do NOT translate persisted OpenSpec artifacts (`spec.md`, `design.md`, `tasks.md`, `state.yaml`, reports), code, identifiers, file paths, YAML keys, status enum values, or Conventional-Commit types — keep those exactly as the phase skill defines them.

## Runtime continuation

Every phase that writes artifacts must preserve resumability:

- update `openspec/changes/{change-name}/state.yaml`;
- append, do not overwrite, historical progress where applicable;
- include `skill_resolution`;
- include any `approval_updates`;
- include any `runtime_observability` warnings.

Conversation history is non-canonical.
