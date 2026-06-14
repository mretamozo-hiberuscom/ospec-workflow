---
name: sdd-foundation
description: "Trigger: sdd foundation, new project, empty workspace, project from scratch. Build project foundation docs and config."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR - STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `sdd-foundation` sub-agent. This skill is for EXECUTORS only.

## Activation Contract

Run this phase when a project has `openspec/config.yaml` but little or no detected stack, docs, commands, or product context; or when the user asks to define a project from scratch before normal SDD changes.

## Hard Rules

- Treat this as pre-SDD foundation work, not implementation. Do not create application code.
- Read `openspec/config.yaml` first. If it is missing, stop and request `sdd-init`.
- In persisted mode, treat OpenSpec files on disk as canonical workflow state for continuation and recovery; never rely on conversation history.
- Ask at most one blocking question at a time; after asking it, stop.
- Persist only confirmed or document-backed facts. Mark unknowns explicitly; never invent product, stack, commands, or architecture.
- Persist confirmed partial answers before returning `blocked`; foundation discovery must survive context loss.
- Preserve raw user documents under `docs/references/raw/`; write LLM-first processed summaries under `docs/references/processed/`.
- If existing foundation docs exist, read them first and update them instead of overwriting.
- Keep docs concise, scan-friendly, and reviewable.

## Decision Gates

| Condition | Action |
|---|---|
| No `openspec/config.yaml` | Return `blocked`; next step `sdd-init`. |
| Empty/missing product context | Ask the next highest-value foundation question. |
| No stack selected | Ask for stack constraints or target stack before commands. |
| No raw docs | Create foundation docs from guided answers only. |
| Noisy docs present | Normalize into processed references with traceability to raw files. |
| Enough foundation facts | Update docs and `openspec/config.yaml`; recommend first SDD change. |

## Markitdown Document Ingestion (Optional)

Before launching the first discovery question, offer document ingestion to the user.

### Step 1 — Offer via vscode/askQuestions

Ask the user whether they have project documents (PDF, functional spec, architecture doc, etc.)
they want to contribute as foundation context. This call MUST happen before any discovery
question is asked. Use `vscode/askQuestions` with two options:

- **Yes, I have documents** — proceed to Step 2.
- **No, skip** — proceed directly to manual discovery (Step 3).

If the user declines or provides no documents, proceed to Step 3 immediately.

### Step 2 — MCP ingestion (when user confirms documents available)

For each document the user supplies:

1. Check whether `mcp__microsoft_markitdown__convert_to_markdown` is available on the current
   target. If it is NOT available, skip to Step 3 (silent fallback — do not tell the user).
2. Call `mcp__microsoft_markitdown__convert_to_markdown` with the document path or content.
3. On success:
   - Preserve the raw source under `docs/references/raw/` (filename unchanged).
   - Write the converted markdown to `docs/references/processed/` (same base name, `.md`
     extension).
   - Collect all converted content; pass it as additional context when launching `sdd-foundation`
     for the first discovery cycle.
4. On MCP error for any single document:
   - Log the error internally (e.g., a note in the agent's working context).
   - Do **NOT** surface the error to the user as a workflow blocker or warning.
   - Treat the document as if it were not supplied; continue with any remaining documents.
   - If all documents fail, proceed to Step 3.

### Step 3 — Manual discovery fallback

Proceed with the standard one-question-at-a-time guided discovery defined in `## Execution Steps`
below. This path is always safe and is the default when:

- The user declines the ingestion offer.
- `mcp__microsoft_markitdown__convert_to_markdown` is unavailable on the active target.
- The MCP tool returns an error for every supplied document.
- The target is `github-copilot` or `opencode` and does not have the MCP configured.

**NEVER** surface MCP absence or MCP errors as workflow blockers. The foundation route MUST
proceed regardless of MCP availability.

## Execution Steps

1. Load shared SDD rules and project standards if provided by the orchestrator.
2. Read `openspec/config.yaml`, existing `docs/**`, and any candidate source documents.
3. Build a gap map: product, users, capabilities, non-functional constraints, stack, architecture, commands, testing, deployment, roadmap.
4. Persist confirmed facts and open questions into docs/config before returning, even when discovery is incomplete.
5. If a blocking gap remains, ask exactly one question and return `blocked`.
6. Create or update:
   - `docs/product/brief.md`
   - `docs/product/functional-scope.md`
   - `docs/product/glossary.md`
   - `docs/architecture/technical-baseline.md`
   - `docs/architecture/decisions/README.md`
   - `docs/roadmap.md`
   - `docs/references/raw/README.md`
   - `docs/references/processed/README.md`
7. Update `openspec/config.yaml` with foundation context, selected stack, expected commands, testing intent, and `rules.foundation`.
8. Return the structured result and recommend `/sdd-new scaffold-project` or the first named capability.

## Output Contract

Return `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, `open_questions`, and `skill_resolution`. If blocked, include exactly one `next_question`.

## References

- `references/foundation-details.md` - doc layout, question order, and config update guidance.
