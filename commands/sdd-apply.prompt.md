---
name: sdd-apply
description: Run or continue apply for an OpenSpec change through the SDD orchestrator.
agent: sdd-orchestrator
---

Route this slash command to the `sdd-orchestrator` custom agent.

Run or continue apply for `${input:changeName}` using existing OpenSpec tasks and the review workload guard.

Do not invoke the `sdd-apply` phase agent directly. The orchestrator must validate readiness and delegate apply with the resolved delivery path.