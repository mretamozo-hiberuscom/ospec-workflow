# Tasks: Orchestrator lean-and-lazy (CORE + handlers circunstanciales bajo demanda)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| Orchestrator Body Partitioning — CORE vs. circunstanciales | MUST | 5 archivos `skills/_shared/` + `### Circumstantial Handler Pointer Table` en CORE | covered-by-design | Tabla único punto de resolución |
| Standard route sin handlers cargados | MUST | CORE no tiene bloques de los 5 handlers; table-only | covered-by-design | Sentinels ausentes del cuerpo verificados por test estructural |
| Brownfield handler cargado vía tabla | MUST | `skills/_shared/route-brownfield.md`, trigger `route == brownfield` | covered-by-design | |
| Pointer table es el único path de resolución | MUST | Encabezado de tabla prohíbe rutas no declaradas | covered-by-design | |
| On-Demand Handler Read-Once Caching | MUST | "read at most ONCE per route — content stays in context" en el encabezado de la tabla | covered-by-design | Cache = ventana de contexto; sin estado externo |
| Lifecycle handler no re-read across phase boundaries | MUST | Instrucción explícita en encabezado de tabla | covered-by-design | |
| Two distinct handlers each read once | MUST | Misma instrucción; sentinels en archivos independientes | covered-by-design | |
| Behavioral Parity — extracción 1:1 verbatim | MUST | Prosa extraída sin edición; payloads viajan con su handler | covered-by-design | No prose condensing |
| Route selection identical pre/post | MUST | Verbatim move, no logic change | covered-by-design | |
| Approval-ledger entries unchanged | MUST | Shapes en `_shared/` files sin modificar | covered-by-design | |
| Shared Handler Trust Boundary — sin frontmatter | MUST | Archivos `_shared/` son prosa-only, sin YAML header | covered-by-design | |
| Cross-Target Parity in Generated Dist | MUST | `loadTree`/`walk` incluye `skills/` automáticamente; 4 targets | covered-by-design | Validators confirman refs |
| All handler files present in dist after regen | MUST | `scripts/configure` propaga sin cambio de generador | covered-by-design | |
| Repeated `askQuestions` payload shapes | SHOULD | 3 payloads viajan con su handler extraído; 2 comunes (Delivery Strategy, Review Workload) permanecen inline | covered-by-design | Decisión explícita del design: extraer los 2 comunes no aligeraría el camino común y forzaría 2 reads por gate |

### Reconciliation Verdict
- MUST coverage: **complete** (0 bloqueos)
- SHOULD/MAY gaps: ninguno — el ítem "Repeated payloads" fue resuelto por el design con rationale explícito
- Ambiguities to track: ninguna

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines (source) | ~840–860 (394 added in 5 files + ~412 orchestrator edit + ~40 test) |
| Estimated changed lines (dist, generated) | ~3 200–3 500 (4 targets × orchestrator edit + 20 new _shared/ copies) |
| Estimated changed lines (total) | ~4 000–4 400 |
| 400-line budget risk | High (raw); Low (complexity — verbatim moves + mechanical regen) |
| Chained PRs recommended | No |
| Suggested split | Single PR con `size:exception` |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

> Justification: La diferencia entre riesgo raw (High) y riesgo de complejidad (Low) es deliberada. ~75 % del diff son archivos dist/ generados automáticamente por `scripts/configure`, reversibles en un solo comando. El cambio fuente es verbatim prose move sin lógica nueva. `exception-ok` fue aceptado en `state.yaml` (approval `delivery-strategy-001`).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Todo el cambio — extracción + test + dist regen | PR único con `size:exception` | Atómico: los 5 _shared/ + orchestrator edit + test + dist son inseparables funcionalmente |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Structural Test [RED — test-first]

> Este test se escribe ANTES de la extracción. Fallará en el estado actual (RED); se vuelve GREEN tras las fases 2-3.

- [x] 1.1 Agregar test `"real repo: orchestrator pointer-table refs resolve and handler sentinels absent from body"` en `scripts/configure/real-repo.test.js`.
  - Parsear `agents/sdd-orchestrator.agent.md` desde ROOT.
  - Extraer todas las referencias `` `skills/_shared/*.md` `` del cuerpo del orchestrator.
  - `assert.ok(fs.existsSync(...))` para cada ruta extraída (relativa a ROOT).
  - `assert.doesNotMatch` por cada sentinel: `_brownfield_advisory_shown` (brownfield), `findings_summary` (4R), `federation-baseline-orchestrator` (federation), `planExecution` (lifecycle), `before-task.occurrences` (lifecycle), `Two-place override` (archive), `parseQualityGates` (archive) — ninguno debe aparecer en el cuerpo del orchestrator.
  - `assert.match` de cada sentinel en su archivo `_shared/` correspondiente (verifica que migró).
  - `assert.ok(lineCount < 700)` sobre el orchestrator (lenient guard contra re-inlining accidental).
  - **Done criterion**: test existe; `npm test -- --test-name-pattern "pointer-table"` falla en estado actual (RED confirmado).

---

## Phase 2: Extract — Crear los 5 archivos `_shared/` verbatim

> Extraer bloques exactamente como están en el orchestrator. Sin edición de prosa.

- [x] 2.1 Crear `skills/_shared/route-brownfield.md` con el contenido verbatim de `agents/sdd-orchestrator.agent.md` L223-289 (`### Brownfield Route Handler` … hasta justo antes de `### 4R Review Gate Dispatch`). Sin frontmatter YAML. Sin encabezado externo nuevo.
  - **Done criterion**: archivo existe; wc -l ≈ 67; contiene `_brownfield_advisory_shown`.

- [x] 2.2 Crear `skills/_shared/gate-4r-review.md` con el contenido verbatim de L290-329 (`### 4R Review Gate Dispatch` … hasta justo antes de `### Workspace Federation`). Sin frontmatter.
  - **Done criterion**: archivo existe; wc -l ≈ 40; contiene `findings_summary`.

- [x] 2.3 Crear `skills/_shared/route-federation.md` con el contenido verbatim de L330-391 (`### Workspace Federation (optional, multi-repo)` + `### Federation Baseline Loop`). Sin frontmatter.
  - **Done criterion**: archivo existe; wc -l ≈ 62; contiene `federation-baseline-orchestrator`.

- [x] 2.4 Crear `skills/_shared/dispatch-lifecycle-hooks.md` con el contenido verbatim de L393-524 (`## Lifecycle Hook Dispatch` … incluyendo el payload `halt` hasta el cierre de `### Audit Persistence`). Sin frontmatter.
  - **Done criterion**: archivo existe; wc -l ≈ 132; contiene `planExecution` y `before-task.occurrences`.

- [x] 2.5 Crear `skills/_shared/gate-archive-quality.md` con el contenido verbatim de L662-754 (`### Archive Dispatch Guard (Quality Gates)` … hasta el final de la sección, incluyendo el bloque "Two-place override"). Sin frontmatter.
  - **Done criterion**: archivo existe; wc -l ≈ 93; contiene `Two-place override` y `parseQualityGates`.

---

## Phase 3: CORE Refactor — Adelgazar el orchestrator e insertar tabla de punteros

- [x] 3.1 Eliminar de `agents/sdd-orchestrator.agent.md` los 5 bloques extraídos: `### Brownfield Route Handler` (L223-289), `### 4R Review Gate Dispatch` (L290-329), `### Workspace Federation …` + `### Federation Baseline Loop` (L330-391), `## Lifecycle Hook Dispatch` (L393-524), `### Archive Dispatch Guard (Quality Gates)` (L662-754). Verificar que no queden líneas huérfanas de esos bloques.
  - **Done criterion**: ningún sentinel (`_brownfield_advisory_shown`, `findings_summary`, `federation-baseline-orchestrator`, `planExecution`, `before-task.occurrences`, `Two-place override`, `parseQualityGates`) aparece en el cuerpo del orchestrator.

- [x] 3.2 Insertar la sección `### Circumstantial Handler Pointer Table` en el CORE inmediatamente después del bloque "Route Selection & Dispatch" (la sección que termina con `#### Graceful Degradation`), usando el texto **exacto** definido en `design.md` § "CORE Pointer Table (formato exacto a incrustar)`. Las rutas de archivo se escriben exactamente como `` `skills/_shared/<file>.md` `` (backtick-wrapped, con `.md`).
  - **Done criterion**: sección `### Circumstantial Handler Pointer Table` presente; las 5 filas de la tabla usan las etiquetas literales de sección; `real-repo.test.js` L235 (`/Brownfield Route Handler/`) sigue pasando; el encabezado `### Baseline Advisory (optional, brownfield repos only)` NO aparece.

- [x] 3.3 Verificar que el cuerpo resultante de `agents/sdd-orchestrator.agent.md` tiene **≤640 líneas** (proyección ~590-610 + margen), equivalente a ≥35 % de reducción respecto a las 985 líneas originales. Anotar el número medido.
  - **Done criterion**: `wc -l agents/sdd-orchestrator.agent.md` ≤ 640; la reducción medida es ≥ 35 %; número registrado para `apply-progress.md`. **MEDIDO: 607 líneas (38% reducción)**

---

## Phase 4: Dist Regeneration

- [x] 4.1 Regenerar `dist/` para los 4 targets ejecutando `scripts/configure` (nunca editar `dist/` a mano). Los 5 archivos `_shared/` nuevos deben aparecer bajo `dist/<target>/skills/_shared/` para cada target; el orchestrator en cada target debe reflejar el CORE reducido.
  - **Done criterion**: `dist/github-copilot/skills/_shared/route-brownfield.md`, `dist/vscode/skills/_shared/route-brownfield.md`, `dist/opencode/skills/_shared/route-brownfield.md`, `dist/claude/skills/_shared/route-brownfield.md` (y los otros 4 archivos equivalentes) existen; el orchestrator en cada target contiene `### Circumstantial Handler Pointer Table` y NO contiene los sentinels extraídos.

---

## Phase 5: Verification

- [x] 5.1 Ejecutar `npm test`. Confirmar:
  - Test estructural 1.1 GREEN (pointer-table refs resuelven, sentinels ausentes del cuerpo, sentinels presentes en sus archivos, line count < 700).
  - `real-repo.test.js` L219-240 GREEN (`/Brownfield Route Handler/` presente; `### Baseline Advisory` ausente).
  - `validate-github-copilot.js` GREEN (refs `` `skills/...md` `` del orchestrator resuelven en el árbol generado).
  - `validate-opencode.js` GREEN (ídem).
  - `cli.test.js`, `e2e.test.js`, `claude-marketplace.test.js` GREEN.
  - **Done criterion**: `npm test` exits 0; ningún test falla. **RESULTADO: 672 tests, 0 fallos.**

- [x] 5.2 Registrar en `apply-progress.md` el número medido de líneas del CORE resultante y el porcentaje de reducción real (criterio de éxito aprobado: `strict-verbatim-parity-min35pct`, approval `success-criterion-001`).
  - **Done criterion**: `apply-progress.md` contiene "líneas medidas: N" y "reducción: X %"; X ≥ 35. **REGISTRADO: 607 líneas, 38%.**
