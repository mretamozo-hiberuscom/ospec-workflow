# Proposal: SDD Lifecycle Hooks

## Intent

The SDD workflow has fixed phase transitions driven by the orchestrator. The only
extension point today is `openspec/config.yaml` `rules.{phase}` — **passive prose**
injected into sub-agent prompts. There is no declarative, *executable* way to bind
actions to phase boundaries (load a skill, run a check, gate progression) without
editing the orchestrator or phase-agent core. ECC's lifecycle hooks solve exactly
this. This change adds a standardized intervention layer at SDD phase boundaries so
OSpec can be extended without touching core agents.

> Disambiguation (intentional): this is a THIRD, distinct hook concept. It is NOT
> the harness hooks (`hooks-runtime`, the Go binary firing on Claude Code events
> SessionStart/PreToolUse/…), and it is NOT passive `rules.{phase}` prose. Naming
> and docs MUST keep the three separate.

## Scope

### In Scope
- New `lifecycle-hooks` capability: a declarative `hooks:` block in
  `openspec/config.yaml` mapping lifecycle events to ordered actions.
- Lifecycle events bound to SDD phase boundaries: `before-change`,
  `before-implementation`, `before-commit`, `before-verify`, `after-verify`,
  `after-archive`, plus per-task `before-task` during apply.
- Action types (initial set): `load-skill`, `load-rules`, `run-command`
  (run-command routes through the existing PreToolUse DENY/ASK policy).
- Per-hook failure policy `advisory | halt`, mirroring the `4r-review-gate`
  `on_blocker` precedent.
- Orchestrator dispatch: orchestrator reads the `hooks:` block and runs matching
  actions at each boundary, recording outcomes in `state.yaml` under a new
  `lifecycle_hooks:` audit block (mirroring the existing `gates:` block).

### Out of Scope
- Replacing `rules.{phase}` (they coexist; rules stay prose guidance).
- Any new harness/Go-binary hooks.
- Third-party/plugin hook packages or an execution sandbox.
- Quality-gate POLICY semantics (coverage/lint/architecture/security) — that is the
  separate `declarative-quality-gates` change.

## Capabilities

### New Capabilities
- `lifecycle-hooks`: declarative phase-boundary hook block, event taxonomy, action
  types, failure policy, and `state.yaml` audit shape.

### Modified Capabilities
- `routing`: orchestrator MUST dispatch lifecycle hooks at phase boundaries and
  persist a `lifecycle_hooks:` audit block to `state.yaml`.
- `agents`: sub-agent prompt composition MAY receive hook-injected skills/rules.

> Exact modified-capability set finalized in the spec phase after reading
> `openspec/specs/routing` and `openspec/specs/agents`.

## Approach

Declarative config block + orchestrator dispatch at boundaries, reusing two existing
patterns: skill injection (`skill-resolver`) and the `state.yaml` audit precedent
(`gates:` block). Actions run in declared order; a `halt` hook that fails blocks the
boundary, an `advisory` hook only records and continues. `run-command` actions are
issued as normal tool calls so the existing PreToolUse DENY/ASK guard still applies.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/config.yaml` (schema) | Modified | Add `hooks:` block |
| `agents/sdd-orchestrator.agent.md` | Modified | Dispatch hooks at boundaries |
| `skills/_shared/openspec-convention.md` | Modified | Document `hooks:` + `lifecycle_hooks:` audit |
| `openspec/specs/{lifecycle-hooks,routing,agents}` | New/Modified | Specs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Conceptual confusion with harness hooks | High | "Lifecycle" naming + explicit 3-concept disambiguation in docs |
| `run-command` bypassing safety | Med | Route through existing PreToolUse DENY/ASK |
| Scope creep into quality gates | Med | Gate policy stays in `declarative-quality-gates` |

## Rollback Plan

Additive and opt-in: absence of a `hooks:` block = current behavior. Rollback =
revert orchestrator dispatch + schema/doc edits; no data migration, no `.ospec/`
changes.

## Dependencies

- None blocking. Coordinates conceptually with `declarative-quality-gates` (boundary
  vs policy split).

## Success Criteria

- [ ] `config.yaml` can declare lifecycle hooks per event with ordered actions.
- [ ] Orchestrator runs hooks at the correct phase boundaries.
- [ ] Outcomes are audited in `state.yaml` `lifecycle_hooks:`.
- [ ] No-op when the `hooks:` block is absent (zero behavior change).
- [ ] Docs disambiguate the three hook concepts.
- [ ] `npm test` green.
