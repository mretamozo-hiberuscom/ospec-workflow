---
name: sdd-init
description: "Initialize SDD context for the current project."
agent: sdd-orchestrator
argument-hint: "<artifact-store mode or project notes>"
tools: ['agent', 'read', 'search', 'edit']
---

Run the SDD init guard for this project. Detect stack, testing capabilities, Strict TDD status, and skill registry state. Do not modify workspace Copilot folders.

User input: `${input}`
