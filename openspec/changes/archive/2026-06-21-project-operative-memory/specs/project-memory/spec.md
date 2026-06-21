# project-memory Specification

## Purpose

Defines the repo-committed operative memory store: a set of living Markdown files under `openspec/memory/` that accumulate resolved decisions, adopted conventions, and known issues across SDD changes. This store is distinct from `openspec/specs/` (normative behavior) and from `engram` (user/session memory). Sub-agents read relevant files at phase start to avoid re-deriving established decisions.

## Ownership Boundary

| Store | Path | Owner | Contains |
|-------|------|-------|----------|
| Behavior specs | `openspec/specs/{domain}/spec.md` | SDD workflow | Normative requirements and scenarios |
| Foundation docs | `docs/architecture/`, `docs/product/` | Human / foundation phase | Product and architecture baseline |
| Operative memory | `openspec/memory/*.md` | SDD phases (prepend, newest-first) | Rationale, conventions, known issues |
| Session memory | engram plugin | Runtime | Cross-session user/agent memory |

Memory files MUST NOT restate content that belongs in foundation docs or specs. Memory entries MUST cross-link to the authoritative source rather than duplicating it.

---

## Requirements

### Requirement: Memory Store Layout

The memory store MUST consist of exactly three Markdown files under `openspec/memory/`:

| File | Purpose |
|------|---------|
| `openspec/memory/decisions.md` | Resolved architecture and design decisions with rationale |
| `openspec/memory/conventions.md` | Adopted coding and workflow conventions derived from recurring patterns |
| `openspec/memory/known-issues.md` | Verified known issues, workarounds, and resolution status |

Each file MUST begin with a YAML frontmatter block declaring at least `title` and `last_updated`. Entries MUST be prepended in reverse-chronological order (newest first). `openspec/memory/decisions.md` and `openspec/memory/known-issues.md` are created on first write by the relevant phase agent; they need not be pre-created.

`openspec/memory/conventions.md` MUST be created as part of this change's initial setup. It MUST contain: (a) the YAML frontmatter; (b) a human-curation notice stating that SDD agents only read the file; (c) a short explanatory preamble describing what a convention entry is and when a human should add one; and (d) exactly one clearly-marked **illustrative example** entry that demonstrates the entry format. The example MUST be visibly delimited (an `[EXAMPLE]` / `[EJEMPLO]` heading marker plus surrounding HTML comments) and MUST carry an explicit notice that it is NOT a real convention of this project, that agents MUST ignore it, and that the human curator should replace or remove it. For this change, `conventions.md` is read-only for agents: no SDD phase agent — including `sdd-apply` — has a normative write obligation for it. The sole write mechanism is manual human curation or a periodic curation step. A future change MAY introduce an automated write contract for `conventions.md`; that is out of scope here.

#### Scenario: First write creates the store

- GIVEN `openspec/memory/` does not exist
- WHEN the first write phase (sdd-archive or sdd-verify) prepends a memory entry
- THEN the directory and the relevant file are created automatically
- AND the file begins with the required YAML frontmatter block

#### Scenario: New entry is prepended to existing entries

- GIVEN `openspec/memory/decisions.md` has existing entries
- WHEN sdd-archive prepends a new resolved decision
- THEN the new entry appears above all previous entries in the entries section
- AND existing entries are not modified

#### Scenario: Illustrative example is not treated as a convention

- GIVEN `openspec/memory/conventions.md` ships with an `[EXAMPLE]`/`[EJEMPLO]`-marked illustrative block carrying a "not a real convention" notice
- WHEN a phase agent (e.g. `sdd-spec` or `sdd-design`) reads `conventions.md`
- THEN it treats the example block as illustrative documentation only
- AND it MUST NOT adopt the example as an actual project convention

---

### Requirement: Graceful Absence

When any memory file or the `openspec/memory/` directory is absent, all phase agent behavior MUST be identical to the pre-memory baseline. Absence MUST NOT raise an error.

#### Scenario: Absent file — phase-start read skipped silently

- GIVEN `openspec/memory/known-issues.md` does not exist
- WHEN a phase agent performs its phase-start memory read
- THEN the agent skips that file without error
- AND execution continues normally

#### Scenario: Absent directory — writes create it on demand

- GIVEN `openspec/memory/` does not exist
- WHEN sdd-verify attempts to prepend a known issue
- THEN the directory and file are created and the entry is written
- AND no error is raised

---

### Requirement: sdd-archive Decisions Write Contract

After successfully completing the archive phase, sdd-archive MUST inspect `open_decisions` in `openspec/changes/{change-name}/state.yaml`. For each entry whose `status` is `resolved`, the agent MUST prepend one entry to `openspec/memory/decisions.md`. Entries with status other than `resolved` MUST NOT be written.

The de-facto `open_decisions` schema is the authoritative reference: `id` (string), `status` (`resolved` | `open`), `summary` (string), `resolution` (string), `phase` (string), `applies_to` (string array). The `status: resolved` field is the condition that promotes a decision into `decisions.md`. No separate normative data-model section is defined.

Each prepended entry MUST include: decision title, change name, date, rationale summary, and a cross-link to the relevant spec or architecture doc when applicable.

#### Scenario: Resolved decisions prepended

- GIVEN `state.yaml` contains `open_decisions` entries with `status: resolved`
- WHEN sdd-archive completes the archive phase
- THEN each resolved entry is prepended to `openspec/memory/decisions.md`
- AND `openspec/memory/decisions.md` is included in the archive phase `artifacts`

#### Scenario: Empty or open-only decisions — write skipped

- GIVEN `state.yaml` has no `open_decisions` entries, or all entries have `status: open`
- WHEN sdd-archive processes decisions
- THEN no write to `openspec/memory/decisions.md` occurs
- AND the archive phase completes normally without error

---

### Requirement: sdd-verify Known-Issues Write Contract

The official sdd-verify severity taxonomy is `INFO < WARNING < BLOCKER` (ascending). When sdd-verify produces findings with severity `WARNING` or `BLOCKER`, it MUST prepend each qualifying finding to `openspec/memory/known-issues.md` after the verify phase completes. Findings at `INFO` severity MUST NOT be written. Each entry MUST include: finding summary, severity, affected area, workaround (if known), and change name.

#### Scenario: WARNING findings prepended after verify

- GIVEN sdd-verify produces one or more findings with severity `WARNING` or `BLOCKER`
- WHEN the verify phase completes
- THEN each qualifying finding is prepended to `openspec/memory/known-issues.md`
- AND `openspec/memory/known-issues.md` is listed in the verify phase `artifacts`

#### Scenario: Clean verify or INFO-only — no write

- GIVEN sdd-verify produces no findings, or only `INFO`-severity findings
- WHEN the verify phase completes
- THEN no write to `openspec/memory/known-issues.md` occurs

---

### Requirement: Phase-Start Selective Read

At the start of its execution, each SDD phase agent SHOULD read the memory files relevant to its work. The read MUST be selective per the table below. Files absent from `openspec/memory/` MUST be silently skipped.

| Phase | Read files |
|-------|-----------|
| `sdd-spec` | `decisions.md`, `conventions.md` |
| `sdd-design` | `decisions.md`, `conventions.md` |
| `sdd-tasks` | `conventions.md` |
| `sdd-apply` | `conventions.md`, `known-issues.md` |
| `sdd-verify` | `known-issues.md` |
| `sdd-archive` | `decisions.md` |

Phases not listed (sdd-propose, sdd-init, sdd-baseline, sdd-explore) MAY read memory files but have no normative obligation to do so.

#### Scenario: Relevant memory read before phase work

- GIVEN `openspec/memory/decisions.md` and `openspec/memory/conventions.md` exist
- WHEN `sdd-spec` begins execution
- THEN it reads `decisions.md` and `conventions.md` before producing any spec output
- AND it does NOT load `known-issues.md`

#### Scenario: Agent reads only its designated files

- GIVEN all three memory files exist
- WHEN `sdd-archive` begins execution
- THEN it reads only `decisions.md`
- AND does not read `conventions.md` or `known-issues.md`

---

## Cross-References

- `agents` domain spec: agent-side obligations for memory read/write
- `skills/_shared/sdd-phase-common.md`: shared executor protocol (artifact retrieval, persistence)
- `openspec/specs/agents/spec.md`: sdd-archive and sdd-verify phase catalog

## Clarifications

### Session 2026-06-20

- Q: Who updates `conventions.md`? Do agents write to it automatically or is it manual curation? → A: Manual / human curation. Agents ONLY read `openspec/memory/conventions.md`. A human or a periodic curation step updates it manually. `sdd-apply` adds NO new write step for `conventions.md`. In this change `conventions.md` is created (may be empty or with an initial template) and is read-only for agents. The spec MUST NOT impose an automatic write contract on `conventions.md` (at most a future MAY; the normative write contract is out of scope for this change).
- Q: What is the authoritative schema for `open_decisions` entries? → A: Accept the de-facto schema as-is. The existing schema (id, status [resolved|open], summary, resolution, phase, applies_to) is the authoritative definition referenced by the sdd-archive write contract. No new normative `## Data Model` section is added to the spec. The sdd-archive contract assumes `status: resolved` to promote a decision into `decisions.md`.
