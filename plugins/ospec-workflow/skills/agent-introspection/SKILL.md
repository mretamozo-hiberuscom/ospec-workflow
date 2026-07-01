---
name: agent-introspection
description: "Diagnose and recover a derailed agent run. Trigger: an agent loops, drifts, loses context, repeatedly fails, or burns tokens without progress."
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
---

# Agent Introspection

Use this skill when an agent run is looping, drifting, losing context, repeatedly failing, or consuming tokens without progress.

## Symptoms

- repeated reading of the same files;
- ignored OpenSpec state;
- missing skill_resolution;
- phase agent asks user directly;
- apply modifies files outside assigned tasks;
- verify starts fixing code;
- orchestrator executes multi-file work inline.

## Recovery

1. Stop current action.
2. Read `openspec/changes/{change}/state.yaml`.
3. Read latest `.ospec/session/**/session-summary.md` if available.
4. Check `.ospec/cache/skill-registry.cache.json`.
5. Reconstruct next safe phase.
6. Continue only with explicit phase contract.