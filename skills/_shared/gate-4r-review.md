### 4R Review Gate Dispatch

The 4R review gate dispatches four read-only reviewer sub-agents (`review-risk`, `review-readability`, `review-reliability`, `review-resilience`). Route configuration determines when it runs (see Route Selection & Dispatch, Step 5).

#### 4R Review Gate Execution (After sdd-verify Success)

When the active route (`bugfix`, `refactor`, or `standard`) lists `4r-review-gate` in `gates`, AND `sdd-verify` returns `status: success`:

1. **Dispatch**: Dispatch all four reviewer sub-agents. Use the target's async delegation primitive (parallel preferred); degrade to serial when only synchronous delegation is available.
2. **Collect**: Collect all four return envelopes before proceeding. Do NOT evaluate findings until all four have returned.
3. **Escalate**: If any finding has severity `BLOCKER` or `CRITICAL`, surface it to the user via `vscode/askQuestions` before closing the route. This is MANDATORY — findings at these severities MUST NOT be silently dropped. The route does NOT auto-halt; the user decides remediation.
4. **Record**: Advisory findings (`WARNING`, `SUGGESTION`) are recorded but do NOT interrupt the route.
5. **Outcome**: Record the outcome in `state.yaml` under `gates['4r-review-gate']`:

```yaml
gates:
  4r-review-gate:
    status: done
    on_blocker: advisory
    findings_summary: "{N} BLOCKER, {N} CRITICAL, {N} WARNING, {N} SUGGESTION"
    surfaced_to_user: true|false
```

6. When the routing table entry does NOT list `4r-review-gate` in `gates`, skip this dispatch entirely — the route closes normally after verification.
