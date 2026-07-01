---
name: caveman-review
description: "Trigger: review this PR, code review, review the diff, /review, /caveman-review. Write terse actionable review comments."
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
---

## Activation Contract

Load when reviewing a PR, diff, patch, or explicit `/caveman-review` request. Apply only to review comments and review summaries.

## Hard Rules

- Lead with findings, ordered by severity.
- Use exact file paths, line numbers, symbols, and concrete fixes.
- Keep each inline finding one line when the issue is simple.
- Do not praise, restate the diff, hedge, or write "consider" when the fix is required.
- Use `q:` only for genuine uncertainty; otherwise state the defect.
- Do not write code fixes, approve, request changes, stage files, or run linters unless separately asked.
- Use normal prose for security findings, architectural disputes, or onboarding explanations where the why matters.

## Decision Gates

| Finding | Prefix |
| --- | --- |
| Broken behavior | `bug:` |
| Fragile or risky behavior | `risk:` |
| Optional cleanup | `nit:` |
| Real question | `q:` |

## Execution Steps

1. Inspect the target diff or PR context.
2. Identify behavioral bugs first, then risks, then nits.
3. Format inline comments as `<file>:L<line>: <prefix> <problem>. <fix>.`
4. Add a short summary only when it helps the reviewer act.

## Output Contract

Return comments ready to paste into the PR. If no issues are found, say that clearly and mention remaining test risk.

## References

- None.
