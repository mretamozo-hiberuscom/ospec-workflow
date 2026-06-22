# Unified Baseline Gate Specification

## Purpose

Defines the single domain-map approval gate (batch-0) that covers ALL brownfield
federation members simultaneously. A single approval replaces the N per-member
batch-0 prompts that would occur in isolated (non-federated) baseline runs. Covers:
what is presented to the user, how approval is recorded, and re-launch behavior
after approval.

---

## Requirements

### Requirement: Unified Domain-Map Presentation

Before delegating `sdd-baseline` to any brownfield member, the orchestrator MUST
collect the domain-map analysis for ALL baseline-candidate members and present
them as a single unified summary to the user.

The presentation MUST include, per member:

- Member id and `target_dir`
- Discovered domains (names and representative file count or paths)
- Member-level classification (`type`, `layer`) as derived from the C1 marker
- Any per-member scan warnings (e.g., `type: null`, domain scan failure)

The orchestrator MUST NOT present per-member batch-0 gates individually. One
user response covers all members; no per-member re-presentation is permitted
once the unified gate has been answered. If the user requests adjustments (e.g.,
merging or splitting domains for a specific member), those MUST be applied before
recording approval, but the interaction remains a single gate event.

#### Scenario: Unified gate presents all members in one prompt

- GIVEN candidate set `[svc-api, svc-payments, svc-reporting]` with domain maps
  computed for each
- WHEN the orchestrator reaches the domain-map gate
- THEN a single question is presented with domain-map summaries for all three members
- AND the user answers once (approve or request adjustments)
- AND that answer covers all three members simultaneously

#### Scenario: Single member — unified gate semantics preserved

- GIVEN exactly one baseline-candidate member (`svc-auth`)
- WHEN the orchestrator reaches the gate
- THEN the gate is still presented once as a unified gate (not a per-member prompt)
- AND the single answer covers that member

#### Scenario: User requests adjustment — gate remains a single event

- GIVEN the orchestrator presents the unified domain map
  AND the user requests merging two domains in `svc-payments`
- WHEN the orchestrator applies the adjustment
- THEN the revised domain map is re-confirmed within the same gate interaction
- AND only one `approved` record is written to the state file

---

### Requirement: Gate Approval Recording

When the user approves the unified gate, the orchestrator MUST record the approval
atomically in `openspec/changes/{change-name}/federation-baseline-status.yaml`:

```yaml
unified_gate:
  status: approved
  approved_at: <ISO 8601 UTC>
  approver: orchestrator/askQuestions
```

The `approver` field MUST be set to the target-agnostic value
`orchestrator/askQuestions`. The recorded value MUST NOT contain any per-target
namespace prefix; specifically, it MUST NOT contain the substrings `vscode/`,
`copilot/`, `opencode/`, or `claude/`.

The write MUST use the temp+rename pattern (see `explore-transactional-barrier`
spec). The gate record is the canonical evidence of approval. Conversation
history alone MUST NOT be treated as approval evidence for any downstream phase
or re-launch.

(Previously: `approver` was normatively pinned to `vscode/askQuestions`, a
per-target namespace prefix rejected by the per-target validators for
`github-copilot` and `opencode` (`/vscode\//i` residue check), causing
`npm run build:copilot` and `npm run build:opencode` to exit 1 after
`federation-baseline-orchestrator.js` was added to `SKILL_ENTRY_SCRIPTS`.)

#### Scenario: Approval written to state file atomically

- GIVEN the user has approved the unified domain-map gate
- WHEN the orchestrator records the approval
- THEN `unified_gate.status` is set to `approved`, `approved_at` is set to the
  current UTC timestamp, and `approver` is set to `orchestrator/askQuestions`
- AND the write is atomic (temp+rename)
- AND subsequent reads of the state file confirm `status: approved`

#### Scenario: Approver value is target-agnostic across all build targets

- GIVEN a unified gate approval being recorded for any of the four build targets
  (`claude`, `vscode`, `github-copilot`, `opencode`)
- WHEN the orchestrator writes the approval record to
  `federation-baseline-status.yaml`
- THEN `unified_gate.approver` MUST equal exactly `orchestrator/askQuestions`
- AND the value MUST NOT contain any of the substrings `vscode/`, `copilot/`,
  `opencode/`, or `claude/`

#### Scenario: Approval record missing — gate must be re-presented

- GIVEN the orchestrator is relaunched
  AND `federation-baseline-status.yaml` is absent OR `unified_gate.status` is
  absent or `pending`
- WHEN the orchestrator evaluates whether to skip the gate
- THEN the gate IS presented again (no skip without an explicit `approved` record)
- AND a new approval is recorded after the user responds

#### Scenario: Partial state file (gate field absent) — gate re-presented

- GIVEN `federation-baseline-status.yaml` exists with `members` entries
  but no `unified_gate` key
- WHEN the orchestrator reads the state file
- THEN it treats the gate as `pending`
- AND presents the gate before any member delegation

---

### Requirement: Gate Skip on Re-launch

When `federation-baseline-status.yaml` already records `unified_gate.status: approved`,
the orchestrator MUST skip the unified gate presentation entirely and proceed
directly to member delegation (or resume at the current member's state). The
gate skip MUST apply globally across all subsequent re-launches, including
`--retry-failed` retries.

The orchestrator MUST NOT re-present the gate for any member that is `done`,
`partial`, or `failed`; the gate is a once-per-run-series event, not a
once-per-member event.

#### Scenario: Re-launch after approved gate — gate skipped

- GIVEN `federation-baseline-status.yaml` with `unified_gate.status: approved`
  AND members `svc-api: done`, `svc-payments: partial`
- WHEN the orchestrator is relaunched
- THEN the unified gate is NOT presented
- AND the orchestrator resumes directly with `svc-payments` delegation

#### Scenario: Retry failed member — gate still skipped

- GIVEN `unified_gate.status: approved` AND `svc-payments: failed`
  AND the operator runs the orchestrator with `--retry-failed`
- WHEN the orchestrator begins the retry loop
- THEN the gate is NOT re-presented for `svc-payments`
- AND `svc-payments` delegation starts at the idempotency-checked first
  pending domain

---

### Requirement: Gate Content — Domain-Map Accuracy

The domain map presented at the unified gate MUST be derived from a fresh
filesystem scan performed immediately before the gate, NOT from any previously
cached domain list. If a member's filesystem cannot be read at gate time, the
orchestrator MUST include that member in the gate presentation with a warning
and an empty domain list. The orchestrator MUST NOT silently omit unreachable
members from the gate.

#### Scenario: Member filesystem unreachable at gate time

- GIVEN member `svc-auth` whose directory is temporarily unmounted or
  permission-denied
- WHEN the orchestrator collects domain maps for the unified gate
- THEN `svc-auth` is included in the gate presentation with a warning
  ("domain scan failed: <reason>") and an empty domain list
- AND the gate is still presented for the user to approve or abort
- AND the user may choose to proceed (acknowledging the empty domain list)
  or abort the run

#### Scenario: All members reachable — accurate domain map presented

- GIVEN all candidate members have readable source files
- WHEN the orchestrator performs the fresh domain scan before the gate
- THEN each member's domain list reflects the current filesystem state
- AND the user sees an up-to-date combined domain map for all candidates
