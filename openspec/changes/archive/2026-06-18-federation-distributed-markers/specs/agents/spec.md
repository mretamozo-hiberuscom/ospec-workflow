# Delta for agents

## ADDED Requirements

### Requirement: sdd-init `target_dir` Parameter

The `sdd-init` agent MUST accept an optional `target_dir` parameter specifying the
directory in which to perform initialization. When `target_dir` is present, the agent
MUST operate on that directory instead of the current working directory; all artifact
reads and writes MUST be relative to `target_dir`. When `target_dir` is absent, the
agent MUST fall back to the current working directory (backward-compatible behavior).

The orchestrator uses `target_dir` to drive per-member `sdd-init` in a federated
workspace without changing the orchestrator's own working directory (D3).

**Propagation mechanism**: `target_dir` MUST be passed to the agent as a
`## Parameters` block injected into the launch prompt, using the same pattern as
`## Project Standards`. The block MUST contain a `target_dir: <path>` line. The
skill reads this value from the prompt text; no environment variable and no dynamic
frontmatter field is used. When the `## Parameters` block is absent, `target_dir`
is considered absent and cwd fallback applies.

When `target_dir` is present but does not exist on the filesystem, the agent MUST
return `status: blocked` with a `question_gate` describing the invalid path; it
MUST NOT create files at any unintended location.

#### Scenario: `target_dir` provided — init scoped to specified directory

- GIVEN the orchestrator calls `sdd-init` with `target_dir: /workspace/services/auth`
- WHEN `sdd-init` runs
- THEN all artifact reads and writes are relative to `/workspace/services/auth`
- AND the current working directory is NOT used as the base path

#### Scenario: `target_dir` absent — backward-compatible cwd behavior

- GIVEN the orchestrator calls `sdd-init` with no `target_dir` parameter
- WHEN `sdd-init` runs
- THEN it operates on the current working directory
- AND behavior is identical to the pre-C1 baseline

#### Scenario: `target_dir` points to a non-existent path

- GIVEN the orchestrator calls `sdd-init` with `target_dir: /workspace/missing-svc`
  AND that path does not exist on the filesystem
- WHEN `sdd-init` begins execution
- THEN it MUST return `status: blocked` with a `question_gate` describing the invalid path
- AND it MUST NOT create files at an unintended location

---

## Clarifications

### Session 2026-06-17

- Q: How does the orchestrator propagate `target_dir` to the `sdd-init` agent — env var, dynamic frontmatter, or prompt injection? → A: Via a `## Parameters` block injected into the launch prompt (same pattern as `## Project Standards`), containing `target_dir: <path>`. The skill reads this value from the prompt text. No env var; no dynamic frontmatter. When the block is absent, `target_dir` is absent and cwd fallback applies. When present but pointing to a non-existent path, the agent returns `status: blocked` with a `question_gate`.
