### Brownfield Route Handler

When the routing table selects the `brownfield` route (Step 3 of Route Selection & Dispatch), execute the `brownfield-advisory` gate **before** any route phase begins.

#### Derived Signal Computation

Before evaluating brownfield conditions, the orchestrator MUST compute two derived boolean signals using its filesystem tools and pass them in the routing context (`ctx`) when `matchConditions` is called:

- `specs_empty_with_code`: `true` when `openspec/specs/` exists but contains no `*/spec.md` domain files AND application source code is present in the repo. Computed by the orchestrator via a directory scan — this is file I/O and MUST NOT be performed by `route-dispatcher.js`.
- `code_without_specs`: `true` when application source code is detected AND `openspec/specs/` is absent or empty. Computed the same way.

Both signals are boolean. The dispatcher (`matchConditions`) receives these values in `ctx` and evaluates them with strict equality — it never reads the filesystem.

The brownfield route is triggered when ANY of the following hold (matching `match: any` semantics):
- `baseline.status` is `pending` or `partial`
- `openspec/specs/` exists but contains no spec files while code is present (`specs_empty_with_code: true`)
- Application code exists while `openspec/specs/` is absent or empty (`code_without_specs: true`)

#### Session-Scoped Skip Suppression

Check the current session context for the flag `_brownfield_advisory_shown`. If it is `true`, skip the advisory entirely and proceed directly with the originally requested SDD command. The flag is session-scoped only — it is NOT persisted to `state.yaml`. The advisory reappears in a new session whenever brownfield conditions remain true.

#### Brownfield Advisory (vscode/askQuestions)

If the session flag is not set, use `vscode/askQuestions` to present the two-option advisory:

```json
{
  "questions": [
    {
      "header": "Brownfield baseline advisory",
      "question": "This repo appears brownfield (pending/partial baseline, empty specs dir with code present, or code without specs). Running sdd-baseline first captures existing architecture and reduces spec drift. Do you want to run it now?",
      "options": [
        {
          "label": "Run /sdd-baseline now",
          "description": "Capture the existing codebase as a baseline before continuing. Recommended for brownfield repos.",
          "recommended": true
        },
        {
          "label": "Skip baseline and proceed",
          "description": "Continue with the originally requested SDD command without running sdd-baseline. The advisory will not appear again this session."
        }
      ],
      "allowFreeformInput": false
    }
  ]
}
```

Do not continue until the user responds.

#### On Consent — Launch sdd-baseline Loop

If the user selects "Run /sdd-baseline now":

1. Delegate to `sdd-baseline` for the first pending domain.
2. While `sdd-baseline` returns `status: partial`, relaunch it for the next pending domain.
3. After `sdd-baseline` returns `status: success` (or all pending domains are complete), set `_brownfield_advisory_shown: true` in the session context.
4. Proceed with the originally requested SDD command.

#### On Decline — Proceed Immediately

If the user selects "Skip baseline and proceed":

1. Set `_brownfield_advisory_shown: true` in the session context.
2. Proceed with the originally requested SDD command without launching `sdd-baseline` and without emitting any error or warning.

