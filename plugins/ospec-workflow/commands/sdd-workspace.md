---
name: sdd-workspace
description: "Manage the workspace-federated atlas: scaffold (init), enroll members (enroll), classify repos (explore), report active changes (status), analyze impact (impact), or generate baselines (general-baseline)."
argument-hint: "<init|enroll|explore|status|impact <change>|general-baseline>"
tools: ['Agent', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'PowerShell']
---

Route this slash command to the `sdd-workspace` executor via the SDD orchestrator.

Launch the `sdd-workspace` phase. The first token of the input selects the subcommand
(`init`, `enroll`, `explore`, `status`, `impact`, or `general-baseline`); default to
`status`. `init` writes `openspec/workspace.yaml` only after explicit confirmation;
`enroll` writes `federation.member.yaml` in member repos (the only sanctioned member
write); `explore` calls `enroll` per discovered member, then regenerates
`workspace.yaml` and `workspace-map.md`; `general-baseline` writes
`docs/architecture/shared-baseline.md` in the coordinator; `status` and `impact` are
read-only.

User input: `$ARGUMENTS`
