---
name: sdd-lite
description: Ask the SDD orchestrator to run lite mode only for trivial or small changes.
agent: sdd-orchestrator
---

Route this slash command to the `sdd-orchestrator` custom agent.

Classify `${input:changeName}` with intent `${input:intent}` and use SDD lite mode only if the orchestrator determines the change is trivial or small.

Do not invoke phase agents directly. If the change is normal, high-risk, or grows beyond lite scope, the orchestrator must escalate to standard SDD.