---
name: sdd-new
description: Start a new persisted SDD change through the SDD orchestrator.
agent: sdd-orchestrator
---

Route this slash command to the `sdd-orchestrator` custom agent.

Start a new persisted SDD change for `${input:changeName}` using the supplied user intent: `${input:intent}`.

Do not invoke phase agents directly. Let `sdd-orchestrator` run init checks, classify the change, choose the workflow, and delegate phases as needed.