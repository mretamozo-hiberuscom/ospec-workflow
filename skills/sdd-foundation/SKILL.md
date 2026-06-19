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

## Parameters (modo federado)

Cuando opera en un espacio de trabajo federado (multirepo), la fase `sdd-foundation` acepta y utiliza los siguientes parámetros inyectados por el orquestador:

| Parámetro | Tipo | Descripción |
|---|---|---|
| `workspace_yaml` | string | Ruta física del atlas cache (`openspec/workspace.yaml`) en el coordinador |
| `parent_change` | string | Nombre del cambio activo en el coordinador |

## Markitdown Document Ingestion (Optional)

Antes de iniciar la primera pregunta de descubrimiento, se ofrece al usuario la posibilidad de ingerir documentos de contexto.

### Step 1 — Offer via vscode/askQuestions

Preguntar al usuario si tiene documentos del proyecto (PDF, especificación funcional, arquitectura, etc.) que desee aportar como contexto. Esta consulta DEBE ocurrir antes de iniciar las preguntas de descubrimiento. Usar `vscode/askQuestions` con:

- **Sí, tengo documentos** — proceder al Step 2.
- **No, omitir** — proceder directamente al descubrimiento manual (Step 3).

### Step 2 — MCP ingestion (cuando el usuario confirma disponibilidad)

Para cada documento suministrado:

1. Comprobar si el servidor MCP `mcp__microsoft_markitdown__convert_to_markdown` está disponible en el cliente actual.
2. **Si el servidor MCP NO está disponible**:
   - Detener el flujo de ingesta y presentar un gate interactivo al usuario mediante `vscode/askQuestions` con las siguientes opciones de remediación:
     - **Configurar MarkItDown automáticamente**: Permitir que el agente intente realizar la instalación/configuración del servidor MCP localmente.
     - **Configurar manualmente con guía**: El agente suspenderá la ingesta, proveerá las instrucciones paso a paso para configurar el servidor (ej. registrar `markitdown-mcp` en `.mcp.json` usando `uvx` u otros medios) y guiará al usuario interactivamente.
     - **Saltar ingesta de documentos**: Omitir la ingesta y continuar al descubrimiento manual (Step 3).
3. **Si el servidor MCP está disponible (o es configurado exitosamente)**, llamar a `mcp__microsoft_markitdown__convert_to_markdown` con la ruta o contenido del documento.
4. En caso de éxito:
   - Preservar el original en `docs/references/raw/` (nombre sin modificar).
   - Guardar el markdown convertido en `docs/references/processed/` (mismo nombre base, extensión `.md`).
   - Coleccionar todo el markdown y pasarlo como contexto adicional al lanzar `sdd-foundation`.
5. En caso de error del MCP en un documento individual, registrarlo en el contexto interno y continuar con los demás documentos. Si todos fallan, proceder a Step 3.

### Step 3 — Manual discovery fallback

Proceder con el descubrimiento guiado estándar paso a paso definido en `## Execution Steps` abajo. Este camino se utiliza si el usuario declina, si elige saltar la ingesta ante la ausencia del MCP, o si todos los documentos fallan.

## Execution Steps

1. Load shared SDD rules and project standards if provided by the orchestrator. En modo federado, recibir el parámetro `workspace_yaml` y mapear la ubicación del atlas.
2. Read `openspec/config.yaml`, existing `docs/**`, and any candidate source documents. En modo federado, leer también `openspec/workspace.yaml` para descubrir los miembros del workspace y sus relaciones de contratos.
3. Para cada miembro descubierto, si el miembro está inicializado (tiene `openspec/config.yaml`), leer sus especificaciones locales bajo `{member}/openspec/specs/**/spec.md` y su roadmap local bajo `{member}/docs/roadmap.md`, resolviendo sus rutas mediante la ruta relativa del atlas.
4. Build a gap map and check for functional gaps (capabilities defined in `functional-scope.md` not covered by any member spec/roadmap) and technical gaps (dependency deviations from `shared-baseline.md` or contract provider/consumer mismatches).
5. Persist confirmed facts, open questions, and gap analysis results into `docs/roadmap-gaps.md` before returning.
6. If active unresolved gaps exist, trigger a Q&A gate via `vscode/askQuestions` (or return `status: blocked` with `question_gate`) to ask the user how to resolve them. Options must include: assign to a member, defer capability, or create a new member directory. Record user resolutions under `approvals` in `state.yaml` and `gaps_resolutions` in `openspec/config.yaml`.
7. Create or update:
   - `docs/product/brief.md`
   - `docs/product/functional-scope.md`
   - `docs/product/glossary.md`
   - `docs/architecture/technical-baseline.md` (En modo federado, incluir obligatoriamente la sección **"Mapa de Contratos e Interacciones"** detallando de forma estructurada qué contratos `provides` y `consumers` están definidos entre los módulos del atlas).
   - `docs/architecture/decisions/README.md`
   - `docs/roadmap.md` (En modo federado, consolidar todos los hitos y metas de los roadmaps locales de los miembros en la sección del miembro correspondiente).
   - `docs/roadmap-gaps.md` (Catalogar de forma estructurada todos los gaps funcionales/técnicos y sus estados de resolución).
   - `docs/references/raw/README.md`
   - `docs/references/processed/README.md`
8. Update `openspec/config.yaml` with foundation context, selected stack, expected commands, testing intent, `rules.foundation`, and any `gaps_resolutions`.
9. Return the structured result and recommend `/sdd-new scaffold-project` or the first named capability.

## Output Contract

Return `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, `open_questions`, and `skill_resolution`. If blocked, include exactly one `next_question`.

## References

- `references/foundation-details.md` - doc layout, question order, and config update guidance.
