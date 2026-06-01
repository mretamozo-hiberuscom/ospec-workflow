# SDD Verify Report Format

## Evidence Levels

- `runtime-test`: automated test executed and passed.
- `static-proof`: build, type-check, schema validation, or equivalent static command proves the behavior.
- `inspection-proof`: code inspection ties the scenario to exact files/functions with a technical rationale.
- `manual-proof`: manual verification was executed and recorded.
- `no-proof`: no credible evidence found.

## Compliance Results

- `PASS`: evidence level satisfies the scenario's requirement strength.
- `WARNING`: implementation appears acceptable, but evidence is weaker than ideal or a non-MUST scenario has lower-tier proof.
- `FAIL`: evidence is missing, failing, or too weak for the scenario's required strength.

## Report Template

~~~markdown
## Verification Report

**Change**: {change-name}
**Version**: {spec version or N/A}
**Mode**: {Strict TDD | Standard}

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | {N} |
| Tasks complete | {N} |
| Tasks incomplete | {N} |

### Build & Tests Execution
**Build**: ✅ Passed / ❌ Failed
```text
{build command and relevant output}
```

**Tests**: ✅ {N} passed / ❌ {N} failed / ⚠️ {N} skipped
```text
{test command and failure details}
```

**Manual verification**: {performed / not performed}
```text
{manual verification steps and results, if any}
```

**Coverage**: {N}% / threshold: {N}% → ✅ Above / ⚠️ Below / ➖ Not available

### Spec Compliance Matrix
| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| {REQ-01} | {Scenario} | `runtime-test` | `{file} > {test}` | PASS | |
| {REQ-02} | {Scenario} | `inspection-proof` | `{file}#{function}` | WARNING | SHOULD scenario; runtime test unavailable |
| {REQ-03} | {Scenario} | `no-proof` | (none found) | FAIL | MUST scenario lacks credible evidence |

**Compliance summary**: {N}/{total} scenarios satisfied at acceptable evidence levels

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| {Req name} | ✅ Implemented | {brief note} |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| {Decision} | ✅ Yes | |

### Issues Found
**CRITICAL**: {list or None, tagged with origin `code-bug|tasks-gap|design-gap|spec-gap`}
**WARNING**: {list or None, tagged with origin `code-bug|tasks-gap|design-gap|spec-gap`}
**SUGGESTION**: {list or None}

### Verdict
{PASS / PASS WITH WARNINGS / FAIL}
{one-line reason}
~~~

When Strict TDD is active, insert the TDD compliance, test layer distribution, changed-file coverage, and quality metrics sections from `strict-tdd-verify.md`.
