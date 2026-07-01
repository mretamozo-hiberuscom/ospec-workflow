---
name: sdd-clarify
description: Re-run or manually trigger the sdd-clarify phase for an existing change.
argument-hint: "<change-name>"
tools: ['Agent', 'Read', 'Grep', 'Glob', 'Edit', 'Write']
---

Run the clarify phase through the orchestrator. Analyzes change-local specs for material ambiguities, asks ≤5 questions via question_gate, and encodes accepted answers inline into the specs.

User input: `$ARGUMENTS`
