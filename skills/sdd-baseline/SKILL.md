---
name: sdd-baseline
description: "Trigger: sdd baseline, brownfield baseline, seed specs, baseline.status pending or partial. Seed openspec/specs/ with baseline specs of existing behavior in resumable one-domain batches."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `sdd-baseline` sub-agent. This skill is for EXECUTORS only.

## Activation Contract

Run this phase when `openspec/config.yaml` has `baseline.status: pending` or `partial`, or when the user invokes `/sdd-baseline`. You are the executor: do the work yourself, do not delegate.

## Hard Rules

- Read `openspec/config.yaml` first; if it has no `baseline` block, stop and request `sdd-init` (brownfield detection sets the sentinel).
- Manifest and index are append-first. NEVER rewrite or remove existing rows.
- The skip rule is absolute: NEVER write `openspec/specs/{domain}/spec.md` if that file already exists (regardless of author). Record such domains as `skipped` in the manifest.
- Write manifest and index entries ONLY on domain completion (never mid-run). An interrupted batch leaves no trace — absence of a `done` entry means pending, enabling safe resume.
- Spec exactly one domain per batch after batch 0; return `partial` immediately after writing the entry.
- Always run `git rev-parse --short HEAD` to capture the commit hash before appending a manifest entry.
- On `done` + non-empty `stale_domains`: refresh ONLY the listed stale or pending baseline-owned domains; append `refreshed` rows with the new hash; never touch archive-owned specs.

## Decision Gates

| Condition | Action |
|---|---|
| No `baseline` block in config | Return `blocked`; next step `sdd-init`. |
| No `_baseline/manifest.md` (batch 0) | Scan repo → cluster capabilities → return `blocked/question_gate` with domain map for user review. |
| `_baseline/manifest.md` present, domains pending | Pick first pending domain from config `domains_pending`; skip any whose `spec.md` already exists. |
| All domains done | Set `baseline.status: done`; return `success`. |

## Execution Steps

### Batch 0 — Domain Map (first run only)

1. Check for `openspec/specs/_baseline/manifest.md`. If it exists, skip to Per-Domain Batch.
2. Scan the repository. Cluster files into capability groups (NOT directory listings). Focus on behavior surfaces: auth, billing, notifications, etc.
3. Produce a domain map: one line per domain with name, one-line scope, and source file globs.
4. Return `status: blocked` with `question_gate` containing the domain map for user review. Do NOT write any spec yet.
5. On relaunch with approved map:
   - Write `openspec/specs/_baseline/manifest.md` with the Domain Map section only (Entries table header, no rows yet).
   - Write `openspec/specs/_baseline/index.md` with `source: local` header and no domain lines.
   - Update `openspec/config.yaml`: set `baseline.status: partial`, `domains_pending` from approved map, `domains_done: []`.
   - Return `partial` with `next_recommended: sdd-baseline`.

### Per-Domain Batch N (one domain per run)

1. Read `openspec/specs/_baseline/manifest.md` to determine which domains have `done` or `skipped` entries.
2. Read `openspec/config.yaml` to get `domains_pending`.
3. Pick the first pending domain that does NOT have a `done` entry in the manifest.
4. If `openspec/specs/{domain}/spec.md` already exists, append a `skipped` entry to the manifest, move domain from `domains_pending` to `domains_done` in config. Repeat for the next pending domain or return `partial` if no more pending.
5. Explore the domain's source files. Write `openspec/specs/{domain}/spec.md` with a baseline spec of the current behavior.
6. Run `git rev-parse --short HEAD` to capture the current commit hash.
7. APPEND one row to the Entries table in `openspec/specs/_baseline/manifest.md`: `| {domain} | done | {batch} | {hash} | {UTC timestamp} |`.
8. APPEND one line to `openspec/specs/_baseline/index.md`: `- {domain}: {one-line description} → ../{domain}/spec.md`.
9. Move domain from `domains_pending` to `domains_done` in `openspec/config.yaml`.
10. If `domains_pending` is now empty, set `baseline.status: done`. Return `success`.
11. Otherwise return `partial` with `next_recommended: sdd-baseline`.

## Manifest Format

```markdown
# Baseline Manifest

## Domain Map (batch 0 — written once, user-approved)
- {domain}: {one-line scope} | sources: {path globs}

## Entries (append-only log; latest row per domain wins)
| domain | status | batch | commit | timestamp (UTC) |
|---|---|---|---|---|
| auth | done | 1 | a1b2c3d | 2026-06-10T14:00:00Z |
```

## Index Format

```markdown
# Baseline Index
source: local
<!-- append-first: one line per domain on completion; never rebuilt -->
- auth: session and token lifecycle → ../auth/spec.md
```

## Output Contract

Return `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, and `skill_resolution`. If blocked at batch 0, include `question_gate` with the proposed domain map.


## Federated Mode Invocation

When baseline is invoked in federated mode, the following parameters are supplied by the orchestrator:

| Parameter | Type | Obligatoriness | Description |
|---|---|---|---|
| `federation_member_id` | string | MUST | Activates federated mode. |
| `target_dir` | string | MUST | The root directory of the member repository to baseline. |
| `parent_change` | string | MUST | The name of the coordinator change directory. |
| `coordinator_root` | string | SHOULD (always supplied by orchestrator) | The root directory of the coordinator repository. |

### Write Targets in Federated Mode
In federated mode, all local baseline artifacts must be written under the member's `target_dir` (never infer from `cwd` or coordinator root):
- `{target_dir}/openspec/specs/_baseline/manifest.md`
- `{target_dir}/openspec/specs/_baseline/index.md`
- `{target_dir}/openspec/specs/{domain}/spec.md`
- `{target_dir}/openspec/config.yaml`

### Batch-0 Skip Condition
Skip the domain-map approval gate (batch-0 skip) if both `_baseline/manifest.md` and `_baseline/config.yaml` are already present under the member's `target_dir`.

### Coordinator Root Resolution Order
After completing a domain, the aggregated state file `{coordinator_root}/openspec/changes/{parent_change}/federation-baseline-status.yaml` must be updated. Resolve `coordinator_root` as follows:
1. Use the explicit parameter `coordinator_root` if provided.
2. If absent, perform upward traversal from `target_dir` to find a parent directory containing `openspec/changes/{parent_change}/`.
3. If still indeterminate, block and return `status: blocked` with `question_gate`.

### Minimal Delegation Example
```json
{
  "agent": "sdd-baseline",
  "task": "Perform baseline for member svc-payments",
  "parameters": {
    "federation_member_id": "svc-payments",
    "target_dir": "../svc-payments",
    "parent_change": "federated-baseline-orchestration",
    "coordinator_root": "../ospec-workflow"
  }
}
```
