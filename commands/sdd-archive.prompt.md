---
name: sdd-archive
description: Archive a successfully verified OpenSpec change through the SDD orchestrator.
agent: sdd-orchestrator
---

Route this slash command to the `sdd-orchestrator` custom agent.

Archive `${input:changeName}` only after the orchestrator confirms successful verification.

Do not invoke the `sdd-archive` phase agent directly. The orchestrator must validate verify status and delegate archive only when safe.