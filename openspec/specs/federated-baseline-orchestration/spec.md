# Federated Baseline Orchestration Specification

## Purpose

Defines the resumable, fault-tolerant orchestration loop that selects brownfield-pending
federation members and delegates `sdd-baseline` to each sequentially. Covers: member
selection criterion, aggregated state file schema and lifecycle, sequential per-member
iteration, resume semantics, idempotency rule, member-failure policy, and the
read-and-link delegation boundary.

Depends on C1 (`federation-distributed-markers`): canonical markers, derived
`brownfield`/`initDone`, `target_dir`, and `workspace-explore/classify` are treated
as given (read-only inputs to C2).

---

## Requirements

### Requirement: Member Selection

The orchestrator MUST derive the set of baseline-candidate members at runtime by
probing the filesystem. A member MUST be selected if and only if:

1. `brownfield` = true — at least one non-scaffolding source file exists in the
   member directory (filesystem probe, NOT read from marker).
2. `initDone` = false — `{member-dir}/openspec/config.yaml` is absent (filesystem
   probe, NOT read from marker).

The orchestrator MUST NOT read or write `brownfield` or `initDone` into any marker
or aggregated state file. These values MUST be re-derived each time the orchestrator
scans members (idempotent derivation, W1 constraint). Members with `brownfield = false`
(greenfield) MUST be skipped and logged as `skipped-greenfield`. Members with
`initDone = true` MUST be skipped and logged as `skipped-initialized`.

#### Scenario: Brownfield-pending member is selected

- GIVEN a federation member directory with non-scaffolding source files (brownfield)
  AND no `openspec/config.yaml` in that member directory (not initialized)
- WHEN the orchestrator derives the baseline candidate set
- THEN that member is included in the candidate set

#### Scenario: Greenfield member is excluded

- GIVEN a federation member directory with only scaffolding files (greenfield)
  AND no `openspec/config.yaml`
- WHEN the orchestrator derives the baseline candidate set
- THEN that member is NOT included in the candidate set
- AND a `skipped-greenfield` log entry is emitted for that member

#### Scenario: Already-initialized member is excluded

- GIVEN a federation member directory with source files (brownfield)
  AND `openspec/config.yaml` exists in that member directory (already initialized)
- WHEN the orchestrator derives the baseline candidate set
- THEN that member is NOT included in the candidate set
- AND a `skipped-initialized` log entry is emitted for that member

#### Scenario: brownfield and initDone are never read from the marker

- GIVEN a marker at `{member}/openspec/federation.member.yaml`
- WHEN the orchestrator reads it
- THEN the orchestrator MUST NOT read `brownfield` or `initDone` from any marker
  field (W1: these fields MUST NOT be stored in the marker)
- AND the orchestrator MUST probe the filesystem independently to derive both values

---

### Requirement: Aggregated State File

The orchestrator MUST persist per-member baseline progress in a single aggregated
state file located at:

```
openspec/changes/{change-name}/federation-baseline-status.yaml
```

in the coordinator repository. The file MUST conform to the following schema:

```yaml
change: <string>                  # Change name (e.g., "federated-baseline-orchestration")
generated_at: <ISO 8601>          # Timestamp of last write
unified_gate:
  status: pending | approved      # Unified batch-0 gate status
  approved_at: <ISO 8601 | null>  # When approval was recorded; null if not yet approved
  approver: <string | null>       # Source of approval (e.g., "orchestrator/askQuestions")
members:
  - id: <string>                  # member.id from the canonical marker
    target_dir: <string>          # Path to the member repository root
    baseline_status: pending | partial | done | failed
    domains_pending: [<string>]   # Domain names not yet specced
    domains_done: [<string>]      # Domain names whose spec has been written
    warnings: [<string>]          # Accumulated warnings for this member
    updated_at: <ISO 8601>        # Timestamp of the last status update for this member
```

All writes to `federation-baseline-status.yaml` MUST be atomic using the
temp+rename pattern (see `explore-transactional-barrier` spec for the canonical
definition). The file MUST NOT be committed as a canonical artifact; it MUST be
listed in `.gitignore` for the coordinator repo OR treated as a change-scoped
working file not subject to version control.

#### Scenario: State file created on first run

- GIVEN no `federation-baseline-status.yaml` exists for the change
- WHEN the orchestrator begins the baseline loop
- THEN it creates `federation-baseline-status.yaml` with:
  - all candidate members set to `baseline_status: pending`
  - `unified_gate.status: pending`
  - `domains_pending` populated from the fresh domain-map scan
  - `domains_done: []` and `warnings: []` for each member

#### Scenario: State file updated after member success

- GIVEN `federation-baseline-status.yaml` with member `svc-payments` at
  `baseline_status: partial`, `domains_pending: [domain-A]`, `domains_done: [domain-B]`
- WHEN the delegated `sdd-baseline` for `svc-payments` returns `success`
- THEN `baseline_status` is set to `done`, `domains_pending` is cleared,
  `domains_done` includes all domains, and `updated_at` is refreshed
- AND the write is performed atomically (temp+rename)

#### Scenario: State file survives a mid-write crash

- GIVEN the orchestrator is about to write an updated `federation-baseline-status.yaml`
- WHEN a crash occurs after `federation-baseline-status.yaml.tmp` is written but
  before rename completes
- THEN on restart the orchestrator finds either the previous state file intact or
  the stale `.tmp`, re-derives member state from filesystem probes, and proceeds
  without data corruption for already-completed members

---

### Requirement: Sequential Per-Member Loop

The orchestrator MUST iterate baseline-candidate members one at a time (sequentially)
in v1. For each candidate the orchestrator MUST:

1. Check aggregated state: if `baseline_status` is `done`, skip.
2. Delegate `sdd-baseline` with federation parameters (see
   `sdd-baseline-federation-contract` spec).
3. If the delegated agent returns `partial`: re-delegate while it makes forward
   progress — i.e., while at least one domain moved from `domains_pending` to
   `domains_done` since the previous delegation. A `partial` return that makes
   ZERO forward progress (no pending domain advanced) MUST be treated as a
   terminal failure for that member (stuck-partial guard). This bounds the
   re-delegation count by the number of pending domains and prevents an
   unbounded re-delegation loop.
4. After `success`: update aggregated state to `done` atomically.
5. After terminal failure: apply the `continue-log-retry` policy (see
   Member Failure Policy requirement).

The orchestrator MUST NOT start processing the next member until the current
member reaches `done`, `failed`, or `pending` (retry-deferred). Parallel
execution of members is explicitly out of scope in v1.

Member order MUST be deterministic: it MUST follow the order in which members
appear in `openspec/workspace.yaml` (atlas). Where atlas order is undefined,
ties are resolved by `member.id` lexicographic ascending.

#### Scenario: Single-member sequential baseline

- GIVEN a candidate set with one member `svc-auth`
- WHEN the orchestrator starts the loop
- THEN it delegates `sdd-baseline` for `svc-auth` exclusively
- AND does NOT start any other member delegation before `svc-auth` reaches `done`
  or is marked `failed`

#### Scenario: Multi-member sequential baseline — order preserved

- GIVEN a candidate set `[svc-api, svc-payments, svc-reporting]` (atlas order)
- WHEN the orchestrator runs the loop
- THEN `svc-api` baseline MUST complete (success or failed) before `svc-payments`
  is delegated
- AND `svc-payments` MUST complete before `svc-reporting` is delegated

---

### Requirement: Resume Semantics

The orchestrator MUST resume from exactly the last persisted state when relaunched
after an interruption. Resume procedure:

1. Attempt to load `federation-baseline-status.yaml`; if absent or corrupt,
   regenerate from filesystem probes (all members set to `pending`).
2. Re-derive the candidate set via fresh filesystem probes.
3. For each candidate in order:
   - `baseline_status: done` → skip.
   - `baseline_status: partial` → delegate `sdd-baseline` supplying current
     `domains_pending` (agent resumes at the exact first pending domain).
   - `baseline_status: pending` AND `unified_gate.status: approved` → delegate.
   - `baseline_status: pending` AND `unified_gate.status: pending` → blocked by
     gate (see `unified-baseline-gate` spec).
   - `baseline_status: failed` → skip until explicit `--retry-failed`.

The orchestrator MUST NOT re-run batch-0 (domain-map gate) for any member whose
`manifest.md` AND `config.yaml` already exist under
`{member}/openspec/specs/_baseline/` (idempotency rule — see Idempotency requirement).

#### Scenario: Resume after mid-loop interruption

- GIVEN a run that completed `svc-api` (`done`) and partially completed
  `svc-payments` (`partial`, `domains_pending: [domain-B, domain-C]`,
  `domains_done: [domain-A]`) before crashing
- WHEN the orchestrator is relaunched
- THEN `svc-api` is skipped (already `done`)
- AND `svc-payments` is delegated with `domains_pending: [domain-B, domain-C]`,
  resuming from `domain-B`
- AND the `domain-A` spec is NOT re-written

#### Scenario: Resume after full crash — no state file

- GIVEN the orchestrator crashed before any state file was written
- WHEN it is relaunched
- THEN it reconstructs the candidate set from fresh filesystem probes
- AND all candidates are treated as `pending`
- AND if the unified gate approval is not recorded, the gate is presented again

---

### Requirement: Idempotency

If `{member-dir}/openspec/specs/_baseline/manifest.md` AND
`{member-dir}/openspec/specs/_baseline/config.yaml` both exist for a member,
the orchestrator MUST instruct the delegated `sdd-baseline` to skip batch-0 and
resume from the first pending domain in batch-N. These two files are the
canonical idempotency signal; the orchestrator MUST NOT rely on `baseline_status`
alone to determine whether batch-0 can be skipped.

The orchestrator MUST NOT present any domain-map gate for a member where batch-0
artifacts are already present.

#### Scenario: Idempotent re-run — manifest and config present

- GIVEN member `svc-auth` with both `openspec/specs/_baseline/manifest.md` AND
  `openspec/specs/_baseline/config.yaml` present
  AND `baseline_status: partial` (some domains still pending)
- WHEN the orchestrator processes this member
- THEN batch-0 is skipped (no domain-map gate presented for this member)
- AND `sdd-baseline` is delegated starting at the first pending domain
- AND no new manifest or config file is created

#### Scenario: Idempotent re-run — member fully done

- GIVEN member `svc-auth` with `baseline_status: done`
- WHEN the orchestrator scans the candidate list
- THEN `svc-auth` is skipped entirely with no delegation and no filesystem writes

---

### Requirement: Member Failure Policy (continue-log-retry)

When the delegated `sdd-baseline` for a member returns a terminal failure, the
orchestrator MUST:

1. Set `baseline_status: failed` for that member in the aggregated state file.
2. Append a descriptive warning to `members[].warnings` including: member id,
   batch or domain at failure, and the verbatim error description.
3. Continue the loop with the next candidate member (MUST NOT abort the entire run).
4. MUST NOT invalidate or clear `unified_gate` approval (approval persists across
   retries and subsequent runs).

Manual retry: when an operator re-runs the orchestrator with an explicit
`--retry-failed` flag (or equivalent mechanism), the orchestrator MUST:

- Re-include members with `baseline_status: failed` in the candidate set.
- Apply idempotency check before delegating (skip batch-0 if artifacts present).
- NOT re-request unified gate approval if `unified_gate.status: approved` is
  already recorded.

#### Scenario: One member fails — others continue uninterrupted

- GIVEN a candidate set `[svc-api, svc-payments, svc-reporting]`
  AND delegation of `svc-payments` returns terminal failure
- WHEN the orchestrator processes the failure
- THEN `svc-payments` is marked `baseline_status: failed` with a warning entry
- AND the orchestrator continues to delegate `svc-reporting` without interruption
- AND `svc-api` and `svc-reporting` reach `done` independently of `svc-payments`

#### Scenario: Manual retry re-includes failed member without re-gating

- GIVEN `federation-baseline-status.yaml` with `svc-payments: failed`
  AND `unified_gate.status: approved`
- WHEN the orchestrator is re-run with `--retry-failed`
- THEN `svc-payments` is re-added to the iteration
- AND the unified gate is NOT re-presented (already approved)
- AND batch-0 for `svc-payments` is skipped if `manifest.md` and `config.yaml`
  are already present

#### Scenario: Failure warning is descriptive and verbatim

- GIVEN `svc-payments` fails during domain `domain-payments-core` with error
  message "write permission denied on /path/to/spec.md"
- WHEN the orchestrator records the failure
- THEN `members[].warnings` for `svc-payments` includes the member id,
  the failing domain name, and the exact error message

---

### Requirement: Read-and-Link Delegation Boundary

The coordinator orchestrator MUST NOT write SDD artifacts (specs, config, manifest)
directly into any member repository. All SDD artifact writes MUST be performed
exclusively by the delegated `sdd-baseline` agent operating in the context of
the target member (`target_dir`). This boundary enforces the read-and-link
principle (D10) inherited from C1.

The coordinator IS permitted to:

- Read member markers (`{member}/openspec/federation.member.yaml`) for member
  identity and classification.
- Read `{member}/openspec/config.yaml` as a filesystem probe (idempotency check,
  read-only).
- Read `{member}/openspec/specs/_baseline/manifest.md` and
  `{member}/openspec/specs/_baseline/config.yaml` as filesystem probes (idempotency
  check, read-only).
- Write `federation-baseline-status.yaml` in the coordinator's own change directory.
- Pass invocation parameters to the delegated `sdd-baseline` agent.

The coordinator MUST NOT:

- Write to `{member}/openspec/specs/` directly.
- Modify `{member}/openspec/config.yaml` directly.
- Write or modify member markers (`{member}/openspec/federation.member.yaml`) as
  part of the baseline flow (marker writes are exclusively via `enroll` in
  `workspace-explore`).

#### Scenario: Coordinator probes member filesystem read-only

- GIVEN the orchestrator needing to check idempotency for `svc-auth`
- WHEN it probes `{svc-auth}/openspec/specs/_baseline/manifest.md`
- THEN it reads (or notes the absence of) the file without creating or modifying it
- AND any spec write for `svc-auth` is deferred to the delegated `sdd-baseline`

#### Scenario: Coordinator does not write member specs

- GIVEN the coordinator completing domain-map analysis for all members
- WHEN it transitions from analysis to writing specs
- THEN the coordinator delegates to `sdd-baseline` per member
- AND the coordinator MUST NOT write any `.md` spec file under
  `{member}/openspec/specs/`

## Clarifications

### Session 2026-06-18

- Q: ¿Cómo se acota el reintento de delegación cuando `sdd-baseline` devuelve `partial` de forma repetida (guardia anti-bucle)? → A: Reintentar mientras haya progreso (al menos un dominio pasa de `domains_pending` a `domains_done` respecto a la delegación anterior); un `partial` sin progreso se trata como fallo terminal del miembro (continue-log-retry), acotando los reintentos por el número de dominios pendientes. Default seguro, sin número mágico de reintentos.
