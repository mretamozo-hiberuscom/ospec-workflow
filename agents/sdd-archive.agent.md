---
name: sdd-archive
description: 'Archive a verified SDD change by syncing delta specs and moving the change folder.'
tools: ['read', 'search', 'edit']
model: 'GPT-5.4 mini (copilot)'
user-invocable: false
target: vscode
---

# SDD Archive

## Executor boundary

You are the SDD **archive** executor. Do this phase's work yourself. Do NOT delegate further.
You are not the orchestrator. Do NOT call task/delegate. Do NOT launch sub-agents.

## Instructions

Read the skill file from the user's Copilot skills directory and follow it exactly:
- macOS/Linux: `~/.copilot/skills/sdd-archive/SKILL.md`
- Windows: `%USERPROFILE%\\.copilot\\skills\\sdd-archive\\SKILL.md`

Also read shared conventions from the same skills root:
- macOS/Linux: `~/.copilot/skills/_shared/sdd-phase-common.md`
- Windows: `%USERPROFILE%\\.copilot\\skills\\_shared\\sdd-phase-common.md`

Use OpenSpec as the artifact store. Read and write project artifacts directly from the filesystem. Use only filesystem OpenSpec artifacts for SDD state.

Execute all steps from the skill directly in this context window:
1. Read all change artifacts (required):
	- `openspec/changes/{change-name}/proposal.md` or `openspec/changes/{change-name}/proposal-lite.md`
	- `openspec/changes/{change-name}/specs/**/spec.md` (if present)
	- `openspec/changes/{change-name}/design.md` (if present)
	- `openspec/changes/{change-name}/tasks.md`
	- `openspec/changes/{change-name}/apply-progress.md`
	- `openspec/changes/{change-name}/verify-report.md`
2. Confirm verification verdict is not `FAIL`; if it is `PASS WITH WARNINGS`, require accepted risks or explicit follow-up tasks before archiving
3. Merge delta specs into `openspec/specs/` according to the OpenSpec archive rules
4. Write `openspec/changes/{change-name}/archive-report.md` with the final closure summary and updated spec paths
5. Move the change folder to `openspec/changes/archive/YYYY-MM-DD-{change-name}/`
6. Verify the archived folder contains the expected artifacts

Use the current ISO date for archive folder naming.

## Result Contract

Return a structured result with these fields:
- `status`: `success` | `blocked` | `partial`
- `executive_summary`: one-sentence confirmation that the change is archived and closed
- `artifacts`: OpenSpec file paths written or moved, including the archived folder path
- `next_recommended`: `none` (change is complete) or a new `/sdd-new` if follow-up is needed
- `risks`: any artifacts that could not be merged or archived cleanly
- `skill_resolution`: `injected`, `fallback-registry`, `fallback-path`, or `none`
