### 4R Review Gate Dispatch

The 4R review gate dispatches four read-only reviewer sub-agents (`review-risk`, `review-readability`, `review-reliability`, `review-resilience`). Route configuration determines when it runs (see Route Selection & Dispatch, Step 5).

#### Debug Route — After sdd-apply

When the active route is `debug` and `sdd-apply` completes:

1. Dispatch all four reviewers. Use the target's async delegation primitive (parallel preferred); degrade to serial when only synchronous delegation is available.
2. Collect all four return envelopes before proceeding. Do NOT evaluate findings until all four have returned.
3. If any finding has severity `BLOCKER` or `CRITICAL`, surface it to the user via `vscode/askQuestions` before closing the route. This is MANDATORY — findings at these severities MUST NOT be silently dropped. The route does NOT auto-halt; the user decides remediation.
4. Advisory findings (`WARNING`, `SUGGESTION`) are recorded but do NOT interrupt the route.
5. Record the outcome in `state.yaml`:

```yaml
gates:
  4r-review-gate:
    status: done
    on_blocker: advisory
    findings_summary: "{N} BLOCKER, {N} CRITICAL, {N} WARNING, {N} SUGGESTION"
    surfaced_to_user: true|false
```

6. `phases.verify.status` is absent or `skipped` for the debug route. Do NOT launch `sdd-verify` on this route.

#### Standard Route — After sdd-verify Success

When the active route is `standard` AND its routing table entry lists `4r-review-gate` in `gates`, AND `sdd-verify` returns `status: success`:

1. Dispatch all four reviewers (same parallel-preferred, serial-fallback pattern as above).
2. Collect all four envelopes before proceeding.
3. If any finding has severity `BLOCKER` or `CRITICAL`, surface it via `vscode/askQuestions` before the route closes. BLOCKER/CRITICAL are MANDATORY escalations; route does NOT auto-halt.
4. Advisory findings are recorded without interrupting the route.
5. Record the outcome in `state.yaml` under `gates['4r-review-gate']` (same shape as above).
6. When the routing table entry does NOT list `4r-review-gate` in `gates`, skip this dispatch entirely — the route closes normally after verify.

#### Gate Skip — Debug Route Without Verify

The debug route MUST NOT launch `sdd-verify`. The 4R gate IS the terminal review step for this route. Record `phases.verify.status: skipped` in `state.yaml` before closing the route.

