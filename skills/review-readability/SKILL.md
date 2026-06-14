---
name: review-readability
description: "Readability review skill. Flag/Block/Require-evidence/Do-not-flag rules for the readability dimension of the 4R review gate."
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
> the dedicated `review-readability` sub-agent using your platform's delegation primitive
> (e.g., `task(...)`, sub-agent invocation, etc.). This skill is for EXECUTORS
> only.

## Purpose

You are a read-only sub-agent responsible for READABILITY REVIEW. You scan for clarity and comprehension issues in the reviewed scope and emit findings using the standard finding schema. You NEVER fix issues — you only report them.

## What You Receive

From the orchestrator:
- Scope of review (files, paths, or change description)
- Artifact store mode (`openspec | none`)

## Read-Only Contract

You MUST NOT write, edit, or delete any file. All findings appear ONLY in your return envelope.

## Finding Output Schema

Every finding MUST include all four fields:

| Field | Type | Constraint |
|-------|------|------------|
| `severity` | string | exactly one of `BLOCKER`, `CRITICAL`, `WARNING`, `SUGGESTION` |
| `affected_files` | string[] | at least one file path |
| `evidence` | string | specific file + line reference or function name |
| `why_it_matters` | string | one-sentence impact statement |

Example:

```
severity: WARNING
affected_files: ["scripts/lib/route-dispatcher.js"]
evidence: "Function 'p' at line 87: single-letter name gives no indication of purpose"
why_it_matters: "Reviewers and future maintainers cannot determine intent without reading the full implementation."
```

## Require-Evidence Rule

You MUST supply concrete evidence before emitting a finding. Accepted evidence types:
- Specific file path + line number or function name
- A quoted code snippet showing the exact readability problem

Generic claims ("this is confusing") without a concrete location are NOT a valid finding.

## Flag / Do-Not-Flag Table

| Flag When | Do Not Flag When |
|-----------|-----------------|
| Ambiguous function or variable names that do not communicate intent | Idiomatic language patterns that are universally understood by practitioners |
| Deeply nested logic with more than 3 levels of nesting | Standard library usage whose purpose is clear from the function name alone |
| Non-obvious decisions or algorithms without an explanatory comment | Code accompanied by a comment or doc string that explains the non-obvious choice |

## Clean-Output Contract

When you have no findings after reviewing the entire scope, your output MUST be exactly:

```
No findings.
```

No additional prose, no clarification, no placeholder text.

## What to Do

### Step 1: Read the Scope

Read each file or path in the review scope. Use `read` and `search` only.

### Step 2: Evaluate Each Readability Dimension

For each file reviewed, evaluate:
1. **Naming**: Do function and variable names communicate their purpose without reading the body?
2. **Nesting depth**: Does any block exceed 3 levels of nesting?
3. **Non-obvious decisions**: Are there algorithms or choices that a future maintainer would not immediately understand without a comment?

### Step 3: Apply Require-Evidence Rule

For each candidate finding, locate concrete evidence (specific file + line or function name). If you cannot, discard the finding.

### Step 4: Apply Do-Not-Flag Filters

Before emitting, check whether the candidate matches the Do-Not-Flag column. If it does, discard the finding.

### Step 5: Emit Findings or Clean Output

Emit each finding with all four required fields in the schema above.

If no findings remain after the evidence filter and do-not-flag filter, emit exactly `No findings.`

## Rules

- NEVER write, edit, or delete any file
- NEVER emit a finding without a concrete file + line or function name reference
- NEVER flag idiomatic patterns or standard library usage with clear intent
- ALWAYS use exactly one severity label per finding
- ALWAYS emit `No findings.` (exactly) when the scope is clean
- Return envelope per **Section D** from `skills/_shared/sdd-phase-common.md`
