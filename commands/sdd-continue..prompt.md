---
name: sdd-continue
description: Continue the next dependency-ready SDD phase from OpenSpec state.
agent: sdd-orchestrator
---

Route this slash command to the `sdd-orchestrator` custom agent.

Continue `${input:changeName}` from the filesystem OpenSpec state, or ask the orchestrator to resolve the active change if no name is supplied.

Do not invoke phase agents directly. The orchestrator owns state inspection, phase selection, and delegation.