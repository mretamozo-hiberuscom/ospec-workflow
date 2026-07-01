---
name: harness-audit
description: "Inspect, debug, optimize, or harden the ospec workflow harness. Trigger: auditing the plugin manifest, agent boundaries, hooks, skills, or token efficiency."
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
---

# Harness Audit

Use this skill when the user asks to inspect, debug, optimize, or harden the ospec workflow harness.

## Audit checklist

1. Plugin manifest
   - `plugin.json` exists.
   - hooks are declared.
   - agents/commands/skills/rules paths resolve.

2. Agent boundaries
   - orchestrator coordinates only.
   - phase agents execute only.
   - no recursive delegation from phase agents.

3. Skill registry
   - cache exists.
   - fingerprint is fresh.
   - compact rules are available.

4. Token discipline
   - prompts pass paths, not full artifacts.
   - compact rules are injected.
   - full SKILL.md is fallback only.

5. Approval safety
   - blocking decisions use `AskUserQuestion`.
   - approvals are persisted in `state.yaml`.

6. Runtime hooks
   - SessionStart refreshes registry.
   - PreCompact writes summary.
   - PreToolUse protects dangerous commands.
   - SubagentStop records skill resolution.