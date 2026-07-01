---
name: sdd-new
description: Start a new persisted SDD change through the SDD orchestrator.
arguments: changeName intent
argument-hint: changeName intent
---

Route this slash command to the `sdd-orchestrator` custom agent.

Start a new persisted SDD change for `$changeName` using the supplied user intent: `$intent`.

Do not invoke phase agents directly. Let `sdd-orchestrator` run init checks, classify the change, choose the workflow, and delegate phases as needed.