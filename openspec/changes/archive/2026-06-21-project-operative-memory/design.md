# Design: Project Operative Memory

## Technical Approach

This change is a **prose/contract change**, not application code. It introduces a
repo-committed operative-memory store under `openspec/memory/` and an append-first
per-phase read/write contract enforced through the SDD skill prompts. There are no
new runtime modules: the "executors" are the phase sub-agents, and their behavior is
governed by the Markdown instructions in `skills/`. The work therefore lands in three
edited skill files, one new memory file (`conventions.md`), and one new Node contract
test that pins the prose invariants so they cannot silently drift.

Mapping to specs: `specs/project-memory/spec.md` defines the store layout, graceful
absence, the two write contracts, and the phase-read table; `specs/agents/spec.md`
extends the existing two-step skill-loading pattern to three steps (load phase skill →
load common protocol → read designated memory). Every MUST scenario is allocated below
in File Changes and Testing Strategy.

The `openspec/` tree is **not** a generator input (verified: `scripts/check.js` never
reads `openspec/`, and the libs that touch it — `ospec-state.js`, `workspace-atlas.js` —
address `openspec/changes/` and `openspec/specs/` by explicit name and do not reject
unknown sibling dirs), so the memory store does not propagate into the four plugin
targets. Only the `skills/` edits propagate; multi-target risk is confined to those
three files regenerating cleanly via `scripts/check.js`.

## Architecture Decisions

### Decision: Store location — `openspec/memory/` (not `docs/`)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `docs/memory/` | `docs/` is documentation **about** the harness (e.g. `harness-runtime.md`, `sdd-fases.md`); a runtime operative-memory store there conflates documentation with workflow state | Rejected |
| `.sdd/memory/` or root `memory/` | Introduces a new top-level dir; root `memory/` also collides conceptually with engram/session memory | Rejected |
| `openspec/memory/` | Sits beside `openspec/specs/` (behavior, source of truth) and `openspec/changes/` (in-flight) under the canonical SDD-state root; clean separation from documentation, no new top-level | **Accepted** |

Rationale: `openspec/` is already the canonical SDD workflow-state root. Operative
memory (rationale / conventions / known-issues) is workflow state, so it belongs there
next to specs and changes — not in the documentation tree.

### Decision: Severity taxonomy reconciliation for sdd-verify

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Rename verify's existing CRITICAL/WARNING/SUGGESTION to INFO/WARNING/BLOCKER | Large blast radius across `references/report-format.md` and decision-gate tables | Rejected |
| Add a thin mapping layer at the write step only | Keeps the report contract intact; localizes the new enum | **Chosen** |

**Rationale**: The locked clarify decision fixes the *memory* severity enum at
`{INFO < WARNING < BLOCKER}`, but `sdd-verify` already classifies report issues as
CRITICAL/WARNING/SUGGESTION. We keep the report contract untouched and define a write
mapping: `CRITICAL → BLOCKER`, `WARNING → WARNING`, `SUGGESTION → INFO`. Only
`BLOCKER` and `WARNING` are written to `known-issues.md`; `INFO` (SUGGESTION) is never
written. This satisfies the spec's "WARNING-or-above is written" threshold without
restructuring the report format.

### Decision: conventions.md is created but agent-read-only

**Choice**: `conventions.md` ships with a frontmatter stub and a short human-curation
notice; no SDD phase (including `sdd-apply`) gets a write step for it.
**Alternatives considered**: Auto-deriving conventions from recurring apply patterns.
**Rationale**: Locked clarify decision (`clarify-q1-conventions-write`). Automatic
convention extraction is heuristic and noisy; manual/periodic curation is authoritative
for this change. A future change MAY add an automated writer.

### Decision: open_decisions de-facto schema is authoritative

**Choice**: Reference the existing `state.yaml` shape (`id`, `status`,
`summary`, `resolution`, `phase`, `applies_to`) directly; no new normative data-model.
**Rationale**: Locked clarify decision (`clarify-q2-open-decisions-schema`).
`sdd-archive` promotes only entries with `status: resolved`.

### Decision: Append-first with prepend (newest-first) and graceful absence

**Choice**: Each file starts with YAML frontmatter (`title`, `last_updated`); new
entries are prepended above existing ones. Reads on absent files/dir are silent no-ops;
writes create the dir/file on demand. `decisions.md` and `known-issues.md` are created
lazily on first write; only `conventions.md` is pre-created.
**Rationale**: Matches spec scenarios; preserves the additive rollback story (absence =
pre-memory baseline).

### Decision: The memory-read step lives in the shared protocol

**Choice**: Insert the three-step skill-loading pattern into
`skills/_shared/sdd-phase-common.md` Section A, plus a per-phase read table and the
ownership boundary table. Individual phase skills inherit it; only the two *writer*
phases (`sdd-archive`, `sdd-verify`) get explicit write steps.
**Rationale**: Single source of truth for the read contract avoids drift across the
six reader phases; writers are special-cased because their write obligation is unique.

## Data Flow

Reads (phase start) and writes (phase end) against the same store:

```
                         openspec/memory/
                ┌──────────────┬───────────────┬──────────────────┐
                │ decisions.md │ conventions.md│ known-issues.md   │
                └──────┬───────┴───────┬───────┴────────┬─────────┘
        read   ┌───────┘   read ───────┘   read ────────┘
   sdd-spec    ● decisions + conventions
   sdd-design  ● decisions + conventions
   sdd-tasks   ●               conventions
   sdd-apply   ●               conventions + known-issues
   sdd-verify  ●                            known-issues ──write──▶ known-issues.md
   sdd-archive ● decisions ──write──▶ decisions.md
```

### Write sequence: archive → decisions.md

```
sdd-archive            state.yaml             openspec/memory/decisions.md
    │  (standard archive steps complete)            │
    │  read open_decisions ─────────▶ │             │
    │  filter status == resolved      │             │
    │  for each resolved: build entry │             │
    │  ensure dir + frontmatter ──────────────────▶ │ create if absent
    │  prepend entries ───────────────────────────▶ │ newest-first
    │  add decisions.md to artifacts[]              │
```

### Write sequence: verify → known-issues.md

```
sdd-verify             verify-report          openspec/memory/known-issues.md
    │  report finalized               │            │
    │  collect issues (CRIT/WARN/SUG) │            │
    │  map → {BLOCKER,WARNING,INFO}   │            │
    │  keep BLOCKER + WARNING         │            │
    │  ensure dir + frontmatter ───────────────▶  │ create if absent
    │  prepend entries ────────────────────────▶  │ newest-first
    │  add known-issues.md to artifacts[]         │
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `openspec/memory/conventions.md` | Create | Frontmatter stub (`title`, `last_updated`) + human-curation notice; agent-read-only |
| `skills/_shared/sdd-phase-common.md` | Modify | Section A → three-step loading (add memory-read step); add per-phase read table + ownership boundary table |
| `skills/sdd-archive/SKILL.md` | Modify | New step after archive persistence: promote `open_decisions` with `status: resolved` into `decisions.md`; list it in `artifacts` when written |
| `skills/sdd-verify/SKILL.md` | Modify | New step after report finalization: map severities, write `WARNING`/`BLOCKER` to `known-issues.md`; document the enum + mapping |
| `scripts/operative-memory-contract.test.js` | Create | Static contract test pinning the prose invariants (see Testing) |
| `openspec/memory/decisions.md`, `openspec/memory/known-issues.md` | (not created) | Created lazily on first write by the respective phase |

## Interfaces / Contracts

**Memory entry shape (decisions.md)** — appended block per resolved decision:

```markdown
## {decision title}
- change: {change-name}
- date: {YYYY-MM-DD}
- rationale: {summary}
- source: {open_decisions.id}
- link: {spec/architecture cross-link when applicable}
```

**Memory entry shape (known-issues.md)** — appended block per WARNING/BLOCKER finding:

```markdown
## {finding summary}
- severity: {WARNING|BLOCKER}
- area: {affected area}
- workaround: {if known}
- change: {change-name}
- date: {YYYY-MM-DD}
```

**File frontmatter** (all three files):

```yaml
---
title: {Decisions | Conventions | Known Issues}
last_updated: {YYYY-MM-DD}
---
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (contract) | `conventions.md` exists with required frontmatter keys (`title`, `last_updated`); the three-step loading pattern, read table, and ownership table are present in `sdd-phase-common.md` | New `scripts/operative-memory-contract.test.js` using `node:test` + `node:assert/strict`, reading files relative to `ROOT` (pattern from `manifest-sync.test.js`) |
| Unit (contract) | `sdd-archive/SKILL.md` contains the resolved-decisions write step + `decisions.md` artifact; `sdd-verify/SKILL.md` contains the severity enum `{INFO < WARNING < BLOCKER}`, the mapping, and the `known-issues.md` write step | Same test file, string/section assertions on skill prose |
| Integration | All three edited `skills/` files regenerate cleanly into claude, vscode, github-copilot, opencode | Already covered by `scripts/check.js`, which runs every `*.test.js` then generates + validates all four targets |
| Behavioral (manual/inspection) | Graceful-absence and prepend semantics | Verified at apply/verify time against spec scenarios; no runtime harness exists for sub-agent prose execution |

The contract test is the project's mechanism for keeping a prose change enforceable:
because nothing executes the skill prompts in CI, the test asserts the load-bearing
strings exist, mirroring how `manifest-sync.test.js` pins cross-file invariants.

**Security enforcement model (B4 / trust boundary).** The prompt-injection guard (B4
`#`-stripping), the trust-boundary clause, and the illustrative-block / convention-scope
rules are **instruction-enforced**: an LLM phase agent is told to apply them, but no
runtime code strips characters or filters directives. The contract test pins that these
clauses *exist* in the prose; it cannot prove an agent *applies* them. The compensating
control is committed-file transparency — `state.yaml`, the verify report, and the memory
files are all in git, so any injected content is visible in the diff at write time and
again when the memory file is committed. Code review is therefore the backstop for B4,
and this is an accepted limitation of a prose/contract change (no executable harness for
sub-agent behavior).

## Migration / Rollout

No data migration. Purely additive: absence of `openspec/memory/` reproduces current
behavior. Rollback = revert the three skill edits + the test, and delete
`openspec/memory/`. No state-shape changes (`open_decisions` schema is reused as-is).

## Open Questions

- [ ] None blocking. The three clarify decisions are locked and honored above.
