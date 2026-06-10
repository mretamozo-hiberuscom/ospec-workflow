# Approval Ledger

Blocking workflow decisions must be persisted.

## Valid approval sources

- `vscode/askQuestions`
- explicit approval already persisted in `openspec/changes/{change-name}/state.yaml`

## Invalid approval sources

- conversation summary
- inferred user intent
- previous assistant statement
- "the user probably wanted..."

## State shape

```yaml
approvals:
  - id: string
    gate: execution-mode | delivery-strategy | review-workload | architecture | testing | archive-warning
    decision: string
    source: vscode/askQuestions
    accepted_at: ISO-8601
    applies_to:
      - sdd-apply
```
