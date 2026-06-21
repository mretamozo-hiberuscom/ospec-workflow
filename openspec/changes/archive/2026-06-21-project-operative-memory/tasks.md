# Tasks: Project Operative Memory

## Spec/Design Reconciliation

| Requisito / Escenario | Prioridad | Allocación en diseño | Estado |
|---|---|---|---|
| Layout del store: 3 archivos bajo `openspec/memory/`, frontmatter YAML, orden newest-first | MUST | `openspec/memory/conventions.md` (crear), contratos de escritura en `sdd-archive`/`sdd-verify` | covered-by-design |
| `conventions.md` creado como stub read-only en este cambio | MUST | Tarea explícita de creación con frontmatter + aviso de curación | covered-by-design |
| Ausencia graceful — lectura silenciosa si falta archivo o directorio | MUST | Prosa extendida en `sdd-phase-common.md` Section A | covered-by-design |
| Ausencia graceful — escritura crea dir/archivo bajo demanda | MUST | Step de escritura en `skills/sdd-archive/SKILL.md` y `skills/sdd-verify/SKILL.md` | covered-by-design |
| Contrato de escritura `sdd-archive` → `decisions.md` (solo `status: resolved`) | MUST | Nuevo paso en `skills/sdd-archive/SKILL.md` post-archivo-artifacts | covered-by-design |
| Contrato de escritura `sdd-verify` → `known-issues.md` (solo WARNING/BLOCKER) | MUST | Nuevo paso en `skills/sdd-verify/SKILL.md` post-report + mapping layer | covered-by-design |
| Mapeo de severidades: CRITICAL→BLOCKER, WARNING→WARNING, SUGGESTION→INFO; INFO nunca se escribe | MUST | Documentado en el paso de escritura de `sdd-verify/SKILL.md` | covered-by-design |
| Patrón de carga de 3 pasos (skill → common protocol → memory read) | MUST | Extensión de Section A en `sdd-phase-common.md` | covered-by-design |
| Tabla de lectura por fase (6 fases, archivos designados) | SHOULD | Tabla nueva en `sdd-phase-common.md` Section A | covered-by-design |
| Tabla de ownership (behavior/foundation/memory/session) | MUST | Tabla nueva en `sdd-phase-common.md` | covered-by-design |
| Test de contrato estático que pina invariantes de prosa | MUST (TDD) | `scripts/operative-memory-contract.test.js` (nuevo) | covered-by-design |
| Los tres archivos editados de `skills/` regeneran limpiamente vía `scripts/check.js` | MUST | Integración existente; no cambia el generador | covered-by-design |
| Entradas no duplican foundation docs; usan cross-links | MUST | Shape de entradas en los dos SKILL.md writers | covered-by-design |

### Reconciliation Verdict

- MUST coverage: **complete**
- SHOULD/MAY gaps: ninguno
- Ambiguities to track: ninguna

---

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Estimated changed lines | ~185 (conventions.md ~10, sdd-phase-common.md ~40, sdd-archive/SKILL.md ~25, sdd-verify/SKILL.md ~30, test ~80) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Todos los cambios en un único PR | PR 1 | Scope bajo 400 líneas; single-pr strategy del session |

### Checklist Status Legend

- `[ ]` No implementado aún
- `[~]` Implementado pero verificación local pendiente
- `[x]` Implementado y verificado localmente

---

## Phase 1: Foundation — Stub de memoria y test en rojo (TDD RED)

- [x] 1.1 Crear `openspec/memory/conventions.md` con frontmatter YAML (`title: Conventions`, `last_updated: YYYY-MM-DD`) y un aviso de curación humana (`> Este archivo es mantenido por curación humana. Los agentes SDD SOLO lo leen.`); no agregar secciones de contenido.
- [x] 1.2 Crear `scripts/operative-memory-contract.test.js` con estructura CommonJS (`"use strict"`, `require("node:test")`, `require("node:assert/strict")`), constante `ROOT = path.resolve(__dirname, "..")`, e importaciones `node:fs` / `node:path`; el archivo debe existir y `npm test` debe recogerlo.
- [x] 1.3 En `scripts/operative-memory-contract.test.js` agregar test `"conventions.md existe con frontmatter requerido"`: leer `openspec/memory/conventions.md`, afirmar que contiene `title:` y `last_updated:`. Ejecutar `npm test` y confirmar que **falla** (RED) porque el archivo aún no tiene el formato completo o las aserciones no se satisfacen — ajustar el orden si el archivo ya existe para que al menos un assert falle antes de editar los SKILL files.

---

## Phase 2: Core — Editar `sdd-phase-common.md` (TDD RED continúa)

- [x] 2.1 En `skills/_shared/sdd-phase-common.md` Section A, reemplazar el texto que describe el patrón de dos pasos por el **patrón de tres pasos** explícito:
  1. Cargar `skills/{phase-name}/SKILL.md`
  2. Cargar `skills/_shared/sdd-phase-common.md`
  3. Leer archivos `openspec/memory/` designados (según tabla por fase); ausencia = skip silencioso.
- [x] 2.2 En `skills/_shared/sdd-phase-common.md` Section A agregar la **tabla de lectura por fase**:

  | Phase | Read files |
  |---|---|
  | sdd-spec | `decisions.md`, `conventions.md` |
  | sdd-design | `decisions.md`, `conventions.md` |
  | sdd-tasks | `conventions.md` |
  | sdd-apply | `conventions.md`, `known-issues.md` |
  | sdd-verify | `known-issues.md` |
  | sdd-archive | `decisions.md` |

  Incluir nota: fases no listadas (sdd-propose, sdd-init, sdd-baseline, sdd-explore) MAY leer pero sin obligación normativa.
- [x] 2.3 En `skills/_shared/sdd-phase-common.md` agregar la **tabla de ownership** de stores (cuatro filas: behavior specs / foundation docs / operative memory / session memory) con columnas `Store | Path | Owner | Contains`, reflejando exactamente la tabla del spec `project-memory`.
- [x] 2.4 En el test (`scripts/operative-memory-contract.test.js`) agregar tests que afirmen la presencia del patrón de tres pasos en `sdd-phase-common.md`:
  - Test `"sdd-phase-common.md contiene el paso de lectura de memoria"`: verificar que el contenido del archivo incluye texto inequívoco sobre el tercer paso de lectura de `openspec/memory/`.
  - Test `"sdd-phase-common.md contiene la tabla de ownership"`: verificar que el archivo contiene las cuatro etiquetas de store (`operative memory`, `session memory`, `foundation docs`, `behavior specs`).
  - Test `"sdd-phase-common.md contiene la tabla de lectura por fase"`: verificar presencia de `sdd-archive` y `sdd-verify` como readers en la tabla.

  Ejecutar `npm test` — deben fallar (RED) hasta completar la fase 2.1–2.3.

---

## Phase 3: Core — Editar `sdd-archive/SKILL.md` (TDD RED → GREEN)

- [x] 3.1 En `skills/sdd-archive/SKILL.md`, después del Step 5 (Persist Archive Report) y antes del Step 6 (Return Summary), insertar **Step 5b: Write Resolved Decisions to Memory**:
  - Leer `open_decisions` de `openspec/changes/{change-name}/state.yaml`.
  - Filtrar entradas con `status: resolved`.
  - Si ninguna coincide: skip; el archivo `decisions.md` NO es tocado.
  - Si hay entradas: asegurar `openspec/memory/` + crear `decisions.md` si no existe con frontmatter YAML (`title: Decisions`, `last_updated: YYYY-MM-DD`); **prepend** (insertar antes de las entradas existentes, después del frontmatter) un bloque por cada decisión con la forma: `## {summary}`, `- change:`, `- date:`, `- rationale:`, `- source:`, `- link:`.
  - Agregar `openspec/memory/decisions.md` a `artifacts[]` solo cuando se escribió al menos una entrada.
- [x] 3.2 En el test agregar tests para `sdd-archive/SKILL.md`:
  - Test `"sdd-archive/SKILL.md contiene el paso de escritura a decisions.md"`: verificar que el contenido incluye referencia a `open_decisions` y `decisions.md`.
  - Test `"sdd-archive/SKILL.md documenta el filtro status: resolved"`: verificar que el texto menciona `status: resolved` como condición de promoción.
  - Test `"sdd-archive/SKILL.md documenta el shape de entrada de decisions.md"`: verificar presencia de `change:`, `date:`, `rationale:`, `source:` en el archivo.

  Ejecutar `npm test` — los tests de archive deben pasar (GREEN) tras 3.1.

---

## Phase 4: Core — Editar `sdd-verify/SKILL.md` (TDD RED → GREEN)

- [x] 4.1 En `skills/sdd-verify/SKILL.md`, después del Step 10 (Persist and return verification report), insertar **Step 10b: Write Known Issues to Memory**:
  - Documentar la taxonomía oficial de severidades: `{INFO < WARNING < BLOCKER}`.
  - Documentar el mapping desde el reporte: `CRITICAL → BLOCKER`, `WARNING → WARNING`, `SUGGESTION → INFO`.
  - Filtrar el reporte: conservar solo hallazgos mapeados a `WARNING` o `BLOCKER`; `INFO` NUNCA se escribe.
  - Si ningún hallazgo califica: skip; `known-issues.md` no es tocado.
  - Si hay hallazgos: asegurar `openspec/memory/` + crear `known-issues.md` si no existe con frontmatter (`title: Known Issues`, `last_updated: YYYY-MM-DD`); **prepend** un bloque por hallazgo con la forma: `## {finding summary}`, `- severity:`, `- area:`, `- workaround:`, `- change:`, `- date:`.
  - Agregar `openspec/memory/known-issues.md` a `artifacts[]` solo cuando se escribió al menos una entrada.
- [x] 4.2 En el test agregar tests para `sdd-verify/SKILL.md`:
  - Test `"sdd-verify/SKILL.md documenta la taxonomía INFO < WARNING < BLOCKER"`: verificar que el texto contiene la expresión `INFO < WARNING < BLOCKER`.
  - Test `"sdd-verify/SKILL.md documenta el mapping de severidades"`: verificar que el archivo menciona `CRITICAL` y `BLOCKER` en contexto de mapping.
  - Test `"sdd-verify/SKILL.md documenta el paso de escritura a known-issues.md"`: verificar referencia a `known-issues.md` y al threshold `WARNING`.
  - Test `"sdd-verify/SKILL.md documenta el shape de entrada de known-issues.md"`: verificar presencia de `severity:`, `area:`, `workaround:`, `change:` en el archivo.

  Ejecutar `npm test` — los tests de verify deben pasar (GREEN) tras 4.1.

---

## Phase 5: Verification — Suite completa verde y regeneración limpia

- [x] 5.1 Ejecutar `npm test` completo; confirmar que todos los tests pasan incluyendo los nuevos en `scripts/operative-memory-contract.test.js`.
- [x] 5.2 Ejecutar `node scripts/check.js` (o el equivalente disponible: `npm test` si check.js no expone CLI directo) para confirmar que los tres archivos de `skills/` editados regeneran los cuatro targets (claude, vscode, github-copilot, opencode) sin errores — esta es la cobertura de integración del cambio.
- [x] 5.3 Inspección manual: verificar que `openspec/memory/conventions.md` contiene frontmatter válido con `title:` y `last_updated:`, y que el cuerpo incluye el aviso de curación humana (lectura ocular, no hay runtime para prosa de agentes).
- [x] 5.4 Inspección manual: verificar que `skills/_shared/sdd-phase-common.md` contiene el patrón de tres pasos, la tabla de lectura por fase, y la tabla de ownership tal como especificadas en los escenarios del spec.
- [x] 5.5 Inspección manual: verificar que `sdd-archive/SKILL.md` describe el filtro `status: resolved`, el prepend a `decisions.md`, y el formato de entrada.
- [x] 5.6 Inspección manual: verificar que `sdd-verify/SKILL.md` describe la taxonomía `INFO < WARNING < BLOCKER`, el mapping CRITICAL/WARNING/SUGGESTION, y el prepend a `known-issues.md`.

---

## Phase 6: Cleanup — Commit preparado

- [x] 6.1 Verificar que ningún archivo nuevo bajo `openspec/memory/` (salvo `conventions.md`) fue creado durante la implementación — `decisions.md` y `known-issues.md` se crean lazily en tiempo de ejecución de los agentes, no en el apply.
- [x] 6.2 Preparar el commit con mensaje Conventional Commit en imperativo español, sin líneas de atribución de IA:
  ```
  feat(memory): agrega memoria operativa de proyecto con contratos de lectura/escritura por fase
  ```
  Incluir en el cuerpo: archivos creados/modificados, spec scenarios cubiertos, referencia a las decisiones `clarify-q1/q2/q3`.
