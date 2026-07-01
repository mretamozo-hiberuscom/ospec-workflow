---
name: sdd-verify
description: Verify an OpenSpec change through the SDD orchestrator.
arguments: changeName
argument-hint: changeName
---

Route this slash command to the `sdd-orchestrator` custom agent.

Run verify for `$changeName` against the persisted OpenSpec specs, tasks, and apply evidence.

Do not invoke the `sdd-verify` phase agent directly. The orchestrator must confirm the change is ready and delegate verification.