# Proposal: Project Operative Memory

## Intent

Operative knowledge is scattered and largely static: `docs/architecture` +
`docs/product` (foundation, written once) and `openspec/specs/` (normative behavior).
There is **no living repository memory that each SDD change updates**, so sub-agents
re-discover the same architecture decisions, conventions, and known issues every
cycle. ECC's project-memory (`architecture.md`, `decisions.md`, `conventions.md`,
`known-issues.md`, updated by each change) closes this. Note: this is **repo-committed
operative memory**, distinct from engram/user memory (a different layer).

## Scope

### In Scope
- A project-memory store: `decisions.md`, `conventions.md`, `known-issues.md`
  (cross-linking the existing `docs/architecture` rather than duplicating it).
- Per-phase read/write contract: `sdd-archive` appends resolved decisions (from
  `open_decisions`); `sdd-verify` appends known-issues (from findings); conventions
  captured from recurring apply patterns.
- Sub-agents READ relevant project memory at phase start (selectively) so they do not
  re-derive established decisions/conventions.
- A clear ownership table: specs = behavior, foundation = product/arch baseline,
  memory = rationale/conventions/known-issues.

### Out of Scope
- Replacing engram/user/session memory (different layer).
- Replacing `openspec/specs/` (specs stay the normative source of truth).
- Auto-summarizing the whole git history.

## Capabilities

### New Capabilities
- `project-memory`: the memory file set, the per-phase read/write contract, and the
  ownership boundaries vs specs and foundation docs.

### Modified Capabilities
- `agents`: `sdd-archive` writes decisions; `sdd-verify` writes known-issues; phase
  sub-agents read memory at start.

## Approach

Define the memory file set and an append-first per-phase contract. Archive promotes
resolved `open_decisions` into `decisions.md`; verify logs `known-issues.md`; apply
patterns feed `conventions.md`. Sub-agents read the relevant memory file at phase
start. The `sdd-lifecycle-hooks` `after-archive` event is the natural trigger for the
archive→memory update (synergy, not a hard dependency).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/memory/{decisions,conventions,known-issues}.md` | New | Memory store |
| `skills/sdd-archive/SKILL.md` | Modified | Append resolved decisions |
| `skills/sdd-verify/SKILL.md` | Modified | Append known-issues |
| `skills/_shared/sdd-phase-common.md` | Modified | Read-memory step + ownership |
| `openspec/specs/{project-memory,agents}` | New/Modified | Specs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Duplication with specs/foundation | Med | Explicit ownership table (behavior vs baseline vs rationale) |
| Unbounded growth | Med | Append-first + periodic curation pass |
| Confusion with engram memory | Med | Document the layer boundary |

## Rollback Plan

Additive: memory files are optional; their absence = current behavior. Rollback =
revert phase-agent edits + remove memory files; no data migration.

## Dependencies

- None blocking. Synergizes with `sdd-lifecycle-hooks` (`after-archive` trigger).

## Success Criteria

- [ ] Memory file set defined and documented.
- [ ] `sdd-archive` appends resolved decisions; `sdd-verify` appends known-issues.
- [ ] Sub-agents read relevant memory at phase start.
- [ ] Ownership boundary (specs vs foundation vs memory vs engram) documented.
- [ ] No-op when memory files are absent.
- [ ] `npm test` green.
