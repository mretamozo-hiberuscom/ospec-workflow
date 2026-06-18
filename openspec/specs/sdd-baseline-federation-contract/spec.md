# sdd-baseline Federation Delegation Contract Specification

## Purpose

Defines the invocation interface and behavioral adaptations for
`agents/sdd-baseline.agent.md` when operating in federated mode. Covers: new
invocation parameters, member-local spec write target, aggregated state location
and update protocol, and batch-0 skip logic.

In standard (non-federated) mode the agent is unchanged; federation behavior
is activated exclusively by the presence of `federation_member_id`.

---

## Requirements

### Requirement: Federation Invocation Parameters

When the orchestrator delegates `sdd-baseline` for a federation member, it MUST
supply the following parameters in addition to any standard baseline parameters:

| Parameter | Type | Required in federation mode | Description |
|---|---|---|---|
| `federation_member_id` | string | MUST | `member.id` from the canonical marker |
| `target_dir` | string | MUST | Path to the member repository root (absolute or coordinator-relative) |
| `parent_change` | string | MUST | The coordinator change name (e.g., `federated-baseline-orchestration`) |
| `coordinator_root` | string | SHOULD | Absolute (or member-relative) path to the coordinator repository root that contains `openspec/changes/{parent_change}/`. The orchestrator always knows its own root and MUST supply this value. When absent, the agent falls back to upward traversal from `target_dir` (see Aggregated State Update Protocol). |

The `coordinator_root` parameter is injected through the SAME `## Parameters`
injection mechanism used for `target_dir`. Because the orchestrator always knows
its own root, it MUST pass `coordinator_root` on every federated delegation; the
upward-traversal fallback exists only for resilience when the value is absent.
Providing `coordinator_root` explicitly makes the contract layout-agnostic: it
works identically for sibling layouts (e.g., `target_dir: ../svc-payments`) and
for nested layouts where the member lives under the coordinator root.

When `federation_member_id` is present, `sdd-baseline` MUST activate federation
mode and apply all requirements in this spec. In standard single-repo invocations
where `federation_member_id` is absent, these federation parameters (including
`coordinator_root`) MUST NOT be present and MUST NOT be required; all
federation-mode requirements are non-applicable.

#### Scenario: Federation parameters supplied — federation mode activated

- GIVEN the orchestrator delegates `sdd-baseline` with
  `federation_member_id: svc-payments`, `target_dir: ../svc-payments`,
  `parent_change: federated-baseline-orchestration`,
  `coordinator_root: ../federated-coordinator`
- WHEN `sdd-baseline` receives the invocation
- THEN it activates federation mode and uses `../svc-payments` as the working root
- AND it resolves the aggregated state file under `coordinator_root` rather than by
  traversing upward from `target_dir`
- AND it associates all state updates with `federation_member_id: svc-payments`

#### Scenario: Federation parameters absent — standard mode unchanged

- GIVEN `sdd-baseline` is invoked without `federation_member_id`
- WHEN it initializes
- THEN it operates in standard single-repo mode
- AND no federation behavior (aggregated state updates, target_dir routing) is applied

#### Scenario: Partial federation parameters — error

- GIVEN `sdd-baseline` is invoked with `federation_member_id` but without `target_dir`
- WHEN it initializes
- THEN it returns `status: blocked` with a `question_gate` requesting the missing
  `target_dir` value
- AND MUST NOT proceed with any filesystem writes

---

### Requirement: Member-Local Spec Write Target

In federation mode, `sdd-baseline` MUST write ALL spec artifacts under
`{target_dir}/openspec/specs/`. The write target MUST be derived solely from the
`target_dir` parameter. The agent MUST NOT infer the write target from the
coordinator's working directory, `process.cwd()`, or any other heuristic.

Write targets in federation mode:

| Artifact | Path |
|---|---|
| Baseline manifest | `{target_dir}/openspec/specs/_baseline/manifest.md` |
| Baseline index | `{target_dir}/openspec/specs/_baseline/index.md` |
| Domain spec | `{target_dir}/openspec/specs/{domain-name}/spec.md` |
| Member config | `{target_dir}/openspec/config.yaml` |

If `target_dir` is absent (standard mode fallback), the agent MUST use the local
working directory as the root (existing behavior preserved).

The coordinator MUST NOT write to any of the paths above. Any write to a member's
`openspec/` directory from outside the delegated `sdd-baseline` agent violates the
read-and-link boundary (D10).

#### Scenario: Domain spec written to member directory

- GIVEN federation mode with `target_dir: ../svc-payments`
- WHEN `sdd-baseline` writes the `domain-payments-core` spec
- THEN the file is created at
  `../svc-payments/openspec/specs/domain-payments-core/spec.md`
- AND no file is written under the coordinator's `openspec/specs/` directory

#### Scenario: Member config updated in member directory

- GIVEN federation mode with `target_dir: ../svc-payments`
- WHEN `sdd-baseline` completes domain `domain-payments-core`
- THEN `../svc-payments/openspec/config.yaml` is updated to reflect the completed domain
- AND the coordinator's own `openspec/config.yaml` is NOT modified

---

### Requirement: Aggregated State Update Protocol

After completing a domain (or encountering a failure), the delegated `sdd-baseline`
in federation mode MUST update the aggregated state file at:

```
{coordinator-root}/openspec/changes/{parent_change}/federation-baseline-status.yaml
```

The coordinator root MUST be resolved in the following order:

1. **Explicit parameter (primary).** If `coordinator_root` is supplied, the agent
   MUST use it directly as `{coordinator-root}` and MUST NOT perform upward
   traversal. This path is layout-agnostic and works for sibling layouts where the
   coordinator is NOT an ancestor of `target_dir`.
2. **Upward traversal (fallback).** If `coordinator_root` is absent, the agent
   MUST fall back to traversing upward from `target_dir` to locate a directory
   containing `openspec/changes/{parent_change}/`.

If neither resolution succeeds — `coordinator_root` is absent AND upward traversal
from `target_dir` cannot locate `openspec/changes/{parent_change}/` — the agent
MUST return `status: blocked` with a `question_gate` requesting the coordinator
root path; it MUST NOT proceed with domain-spec writes until the state update path
is confirmed.

Aggregated state updates MUST be atomic (temp+rename). The update procedure MUST be:

1. Read the current `federation-baseline-status.yaml`.
2. Locate the entry whose `id` matches `federation_member_id`.
3. Move the completed domain from `domains_pending` to `domains_done`.
4. Set `baseline_status: partial` if `domains_pending` is non-empty, or
   `baseline_status: done` if `domains_pending` is now empty.
5. Refresh `updated_at` for this member entry.
6. Write the updated file atomically (temp+rename).

The agent MUST NOT overwrite or blank out entries for other members when updating
its own entry.

#### Scenario: Domain completion updates aggregated state

- GIVEN federation state with `svc-payments: partial`,
  `domains_pending: [domain-B, domain-C]`, `domains_done: [domain-A]`
- WHEN `sdd-baseline` completes `domain-B` for `svc-payments`
- THEN `domains_pending` becomes `[domain-C]` and `domains_done` becomes
  `[domain-A, domain-B]`
- AND `baseline_status` remains `partial`
- AND `updated_at` is refreshed for `svc-payments`
- AND other member entries in the state file are unchanged

#### Scenario: Last domain completion sets status to done

- GIVEN `svc-payments: partial`, `domains_pending: [domain-C]`,
  `domains_done: [domain-A, domain-B]`
- WHEN `sdd-baseline` completes `domain-C` for `svc-payments`
- THEN `domains_pending` is empty and `domains_done` is `[domain-A, domain-B, domain-C]`
- AND `baseline_status` is set to `done`
- AND the write is atomic

#### Scenario: Coordinator root resolved from explicit parameter — sibling layout

- GIVEN federation mode with `target_dir: ../svc-payments` (sibling layout)
  AND `coordinator_root: ../federated-coordinator`
  AND `parent_change: federated-baseline-orchestration`
- WHEN `sdd-baseline` resolves the aggregated state file path
- THEN it uses
  `../federated-coordinator/openspec/changes/federated-baseline-orchestration/federation-baseline-status.yaml`
  without performing upward traversal
- AND the resolution succeeds even though the coordinator is NOT an ancestor of
  `target_dir`

#### Scenario: Coordinator root resolved by upward-traversal fallback

- GIVEN federation mode where `coordinator_root` is absent
  AND `target_dir` is nested under a directory containing
  `openspec/changes/{parent_change}/`
- WHEN `sdd-baseline` resolves the aggregated state file path
- THEN it falls back to upward traversal from `target_dir`
- AND locates the coordinator root containing `openspec/changes/{parent_change}/`
- AND proceeds with the aggregated state update

#### Scenario: Sibling-layout resume — explicit coordinator_root succeeds

- GIVEN a resumed federation run in sibling layout with
  `target_dir: ../svc-payments` and `coordinator_root: ../federated-coordinator`
- WHEN `sdd-baseline` reopens the aggregated state file to update a completed domain
- THEN it locates `federation-baseline-status.yaml` via `coordinator_root`
- AND the update succeeds despite upward traversal being impossible in a sibling layout

#### Scenario: Coordinator root indeterminate — blocked with question_gate

- GIVEN `sdd-baseline` in federation mode where `coordinator_root` is absent
  AND upward traversal from `target_dir` cannot locate
  `openspec/changes/{parent_change}/`
- WHEN it attempts to resolve the aggregated state file path
- THEN it returns `status: blocked` with a `question_gate` asking for the
  coordinator root path
- AND it MUST NOT proceed with any domain-spec writes until state can be persisted

---

### Requirement: Batch-0 Skip in Federation Mode

In federation mode, `sdd-baseline` MUST skip batch-0 (domain-map gate) if and
only if BOTH of the following files are present:

- `{target_dir}/openspec/specs/_baseline/manifest.md`
- `{target_dir}/openspec/specs/_baseline/config.yaml`

When batch-0 is skipped, the agent MUST read domain state from the existing
manifest and load `domains_pending` from the aggregated state file (supplied by
the orchestrator as initial context or read via `parent_change` resolution).
The agent MUST NOT ask the user for domain-map approval again when batch-0 is
skipped.

When batch-0 is NOT skipped (one or both files absent), the agent collects the
domain map for this member; however, it MUST NOT present a standalone per-member
gate. The domain map data is surfaced through the unified gate controlled by
the orchestrator (see `unified-baseline-gate` spec).

#### Scenario: Batch-0 skipped when both artifacts present

- GIVEN `svc-payments` in federation mode
  AND `{target_dir}/openspec/specs/_baseline/manifest.md` exists
  AND `{target_dir}/openspec/specs/_baseline/config.yaml` exists
- WHEN `sdd-baseline` initializes for `svc-payments`
- THEN it skips batch-0 without presenting any domain-map gate
- AND it reads `domains_pending` from the aggregated state
- AND proceeds directly to the first pending domain

#### Scenario: Batch-0 not skipped — manifest absent

- GIVEN `svc-auth` in federation mode
  AND `{target_dir}/openspec/specs/_baseline/manifest.md` is absent
- WHEN `sdd-baseline` initializes for `svc-auth`
- THEN it performs domain-map analysis (batch-0 collection)
- AND returns the domain map to the orchestrator for inclusion in the unified gate
- AND does NOT present a standalone per-member batch-0 gate to the user

#### Scenario: Config absent but manifest present — batch-0 not skipped

- GIVEN `{target_dir}/openspec/specs/_baseline/manifest.md` exists
  AND `{target_dir}/openspec/specs/_baseline/config.yaml` is absent
- WHEN `sdd-baseline` evaluates the idempotency signal
- THEN batch-0 is NOT skipped (both files MUST be present to skip)
- AND domain-map analysis is performed from scratch
