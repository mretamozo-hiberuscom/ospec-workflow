# Proposal: Declarative Quality Gates

## Intent

Verify is only *semi*-declarative today: `config.yaml` carries
`rules.verify.{test_command,build_command,coverage_threshold}` and
`testing.quality.{linter,type_checker,formatter}` booleans, plus the separate
`4r-review-gate`. But there is no **unified, typed quality policy** that gates
progression — Verify is still a generic phase, not a policy. ECC's principle is "do
not advance if quality is insufficient": Verify becomes a declarative policy. This
change turns scattered verify settings into a single declarative `quality_gates:`
policy that `sdd-verify` enforces and audits.

## Scope

### In Scope
- Declarative `quality_gates:` policy in `config.yaml` with typed gates:
  `tests { coverage }`, `lint { required }`, `architecture { required }`,
  `security { required }` — each with `required` and optional threshold/command.
- `sdd-verify` evaluates each gate (running its configured command/check), classifies
  pass/fail, and enforces required gates with `advisory | halt` semantics.
- Per-gate results recorded in `verify-report.md` and the `state.yaml` `gates:` block.
- A failed required `halt` gate blocks archive.
- Clean migration of the existing `coverage_threshold` into the typed policy.

### Out of Scope
- Implementing linters / architecture / security scanners themselves — the policy
  declares and invokes project-provided commands; tools stay project-owned.
- Changing the 4R review agents' internals (they remain a gate the policy can include).
- Lifecycle-hook mechanics (`sdd-lifecycle-hooks`): policy says WHAT must pass; hooks
  say WHEN actions run. They compose but stay separate.

## Capabilities

### New Capabilities
- `quality-gates`: the typed gate policy schema, evaluation semantics, and audit shape.

### Modified Capabilities
- `agents`: `sdd-verify` evaluates the policy and enforces required gates.
- `routing`: gate dispatch + `state.yaml` audit for quality gates.

## Approach

Define a typed declarative policy; `sdd-verify` reads it, runs each gate's configured
command/check, classifies results, enforces required gates per `advisory | halt`, and
writes audit entries — reusing the existing `gates:` `state.yaml` precedent and the
`verify-report.md` format. When a gate's command is unset, it is skipped with a
warning rather than failing.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/config.yaml` (schema) | Modified | Add `quality_gates:` policy |
| `skills/sdd-verify/SKILL.md` | Modified | Evaluate + enforce typed gates |
| `agents/sdd-verify.agent.md` | Modified | Gate evaluation contract |
| `skills/_shared/openspec-convention.md` | Modified | Document policy + audit |
| `openspec/specs/{quality-gates,agents,routing}` | New/Modified | Specs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| False blocking when a tool is missing | Med | `required:false` default; skip-with-warning when command unset |
| Overlap with lifecycle `before-verify` | Med | Policy = WHAT must pass; hooks = WHEN to run |
| `coverage_threshold` duplication | Low | Supersede it cleanly inside `tests` gate |

## Rollback Plan

Additive: an empty/absent `quality_gates:` policy = current verify behavior. Rollback
= revert `sdd-verify` + schema/doc edits; no data migration.

## Dependencies

- None blocking. Composes with `sdd-lifecycle-hooks` (`before-verify`/`after-verify`).

## Success Criteria

- [ ] Typed gates declarable in `config.yaml`.
- [ ] `sdd-verify` enforces required gates; archive blocked on a failed required `halt` gate.
- [ ] Per-gate results audited in `verify-report.md` + `state.yaml`.
- [ ] Existing `coverage_threshold` migrated into the `tests` gate.
- [ ] No-op when policy absent.
- [ ] `npm test` green.
