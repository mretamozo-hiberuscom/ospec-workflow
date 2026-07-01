### Archive Dispatch Guard (Quality Gates)

Before dispatching `sdd-archive`, the guard MUST read BOTH sources (H2 —
policy-aware, defense-in-depth independent of sdd-verify):

1. `openspec/config.yaml` `quality_gates:` → `policyDeclared = parseQualityGates(...) !== null`.
2. `state.yaml.gates.quality-gates` (the audit block + its `status`).
3. The envelope `status` returned by the last `sdd-verify` run.

Apply the following decision logic:

#### PROCEED with archive dispatch — only when ALL hold

- `policyDeclared` is `false` (`parseQualityGates(...) === null` — a true no-op), OR
  the block `status` is `pass` or `skipped`; AND
- the last `sdd-verify` envelope `status` was `success`.

No gate intervention; dispatch normally.

#### BLOCK archive dispatch — when ANY hold

- The block is present with `status` ∈ {`fail`, `error`}; OR
- `policyDeclared` is `true` but the `gates.quality-gates` block is **absent or
  unparseable** (anomaly — a write failure or verify bug; "absent + declared
  policy" is NOT a legitimate no-op); OR
- the last `sdd-verify` envelope `status` was non-`success` (e.g. `blocked`).

On BLOCK, do NOT dispatch `sdd-archive`. Surface the blocking details to the
user via `AskUserQuestion`:

```json
{
  "questions": [{
    "header": "Quality gate blocker",
    "question": "Archive is blocked: a required quality gate failed or errored, the verify envelope was non-success, or a declared policy has no audit block (anomaly). How do you want to proceed?",
    "options": [
      {
        "label": "Fix and re-run verify",
        "description": "Fix the failing gate(s), then re-run sdd-verify. Archive will be dispatched automatically on a passing verify.",
        "recommended": true
      },
      {
        "label": "Override with written justification",
        "description": "Force archive past the failed gate. Requires a written justification that is recorded in state.yaml and verify-report.md."
      }
    ],
    "allowFreeformInput": true
  }]
}
```

**Resolution — Fix and re-run**: route back to the appropriate upstream phase
(see Verification Failure Routing above). Do NOT dispatch `sdd-archive`. If the
block was BLOCKED on an anomaly (declared policy but absent/unparseable block,
or non-success envelope), re-running `sdd-verify` re-builds the audit and is
the correct path — never dispatch archive on the anomaly.

**Resolution — Override with written justification**:

1. Require the user to provide a written justification text (use a follow-up
   `AskUserQuestion` with `allowFreeformInput: true` if the initial
   response did not include the text).
2. Write the override record to `state.yaml` under
   `gates.quality-gates.override`:
   ```yaml
   gates:
     quality-gates:
       override:
         timestamp: <ISO 8601 UTC timestamp of the override decision>
         justification: "<verbatim user text>"
   ```
3. Append an `## Override` section to `verify-report.md` containing the same
   `timestamp` and `justification` text.
4. Record an approval entry in `state.yaml.approvals`:
   ```yaml
   - id: quality-gate-override-<timestamp>
     gate: quality-gates
     decision: forced-archive
     detail: "<verbatim justification>"
     source: AskUserQuestion
     accepted_at: <ISO 8601 UTC>
     applies_to: [sdd-archive]
   ```
5. **Two-place override confirmation (H3)**. Re-read BOTH destinations:
   `state.yaml.gates.quality-gates.override {timestamp, justification}` AND the
   `## Override` section in `verify-report.md`.
   - Both present and consistent → dispatch `sdd-archive`.
   - Only one present (half-written override) → the override is **incomplete**;
     do NOT dispatch. Repair the missing destination (re-write step 2 or 3) or
     re-prompt, then re-confirm. A blocking gate may be crossed ONLY when both
     audit destinations are confirmed — this preserves the
     `clarify-archive-override` two-place guarantee under partial-write conditions.

