# Apply Progress: refactor-orchestrator-lazy

## Metadata

- **Delivery mode**: `size:exception` (approval `delivery-strategy-001`, `exception-ok`)
- **Strict TDD**: activo (`openspec/config.yaml strict_tdd: true`)
- **Fecha**: 2026-06-22

---

## Líneas medidas y reducción

| Métrica | Valor |
|---------|-------|
| Líneas originales (`agents/sdd-orchestrator.agent.md`) | 986 (normalizado a LF) |
| Líneas resultantes (CORE reducido) | 607 |
| Líneas eliminadas | 379 |
| **Reducción medida** | **38 %** |
| Criterio de éxito (`strict-verbatim-parity-min35pct`) | **CUMPLIDO** (38 % ≥ 35 %) |
| Límite de líneas (≤ 640) | **CUMPLIDO** (607 ≤ 640) |

---

## TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 (structural test) | `scripts/configure/real-repo.test.js` | Integration (real repo) | ✅ 19/19 pass antes de escribir el test | ✅ Escrito; falla con "986 líneas" | ✅ Pasa tras fases 2-3 | ➖ Un solo comportamiento estructural a verificar | ➖ No aplicable (test, no código de producción) |
| 2.1-2.5 + 3.1-3.2 | — | — | ✅ Confirmado con el test de fase 1 | — | ✅ 20/20 tests pasan tras extracción | — | — |
| 4.1 + 5.1 | — | E2E (npm test) | ✅ | — | ✅ 672/672 tests pasan | — | — |

### Test Summary
- **Tests escritos**: 1 test estructural nuevo
- **Tests pasando**: 672 / 672 (npm test completo)
- **Layers**: Integration real-repo (structural), E2E (npm test completo)
- **Approval tests (refactoring)**: N/A — la extracción es verbatim move sin lógica nueva

---

## Tareas completadas

### Phase 1: Structural Test [RED → GREEN]

- [x] **1.1** Test `"real repo: orchestrator pointer-table refs resolve and handler sentinels absent from body"` agregado a `scripts/configure/real-repo.test.js`.
  - Verifica: line count < 700, sentinels ausentes del cuerpo, sentinels presentes en `_shared/` files, refs de la pointer table resuelven.
  - RED confirmado: falla con "orchestrator body must be < 700 lines; got 986".
  - GREEN tras fases 2-3: todos los assertions pasan.

### Phase 2: Extract — 5 archivos `_shared/` creados verbatim

- [x] **2.1** `skills/_shared/route-brownfield.md` — 67 líneas, contiene `_brownfield_advisory_shown`.
- [x] **2.2** `skills/_shared/gate-4r-review.md` — 40 líneas, contiene `findings_summary`.
- [x] **2.3** `skills/_shared/route-federation.md` — 62 líneas, contiene `federation-baseline-orchestrator`.
- [x] **2.4** `skills/_shared/dispatch-lifecycle-hooks.md` — 132 líneas, contiene `planExecution` y `before-task.occurrences`.
- [x] **2.5** `skills/_shared/gate-archive-quality.md` — 93 líneas, contiene `Two-place override` y `parseQualityGates`.

### Phase 3: CORE Refactor

- [x] **3.1** Eliminados los 5 bloques de `agents/sdd-orchestrator.agent.md`. Ningún sentinel aparece en el cuerpo del orchestrator.
- [x] **3.2** `### Circumstantial Handler Pointer Table` insertada inmediatamente después de `#### Graceful Degradation`. Las 5 filas usan las etiquetas literales de sección. Test `L235 /Brownfield Route Handler/` sigue pasando.
- [x] **3.3** Líneas resultantes: **607** (≤ 640). Reducción: **38 %** (≥ 35 %).

### Phase 4: Dist Regeneration

- [x] **4.1** Regenerados los 4 targets:
  - `dist/github-copilot/skills/_shared/` — 5 archivos nuevos presentes.
  - `dist/opencode/skills/_shared/` — 5 archivos nuevos presentes.
  - `dist/vscode/skills/_shared/` — 5 archivos nuevos presentes.
  - `dist/claude-marketplace/plugins/ospec-workflow/skills/_shared/` — 5 archivos nuevos presentes.
  - Todos los orchestrators dist/ contienen `### Circumstantial Handler Pointer Table` y NO contienen los sentinels extraídos.

### Phase 5: Verification

- [x] **5.1** `npm test` → **672 tests, 0 fallos**. Exit code 0.
- [x] **5.2** Métricas registradas: **607 líneas**, **38 % reducción** (cumple `strict-verbatim-parity-min35pct`).

---

## Desviaciones del diseño

### Desviación: Tests de contrato pre-existentes para federation no contemplados

**Archivo afectado**: `scripts/federation-baseline-contract.test.js` (tests 5.1.3, 5.1.4, 5.1.5, 5.1.13), `scripts/sdd-foundation-federated.test.js` (test "routing to sdd-foundation with federated parameters").

**Descripción**: Estos tests pre-existentes verificaban que ciertos strings (e.g., `continue-log-retry`, `federation-baseline-orchestrator`, `read-and-link D10`) aparecen en `agents/sdd-orchestrator.agent.md`. El refactor los movió a `skills/_shared/route-federation.md`. El diseño no mencionó la necesidad de actualizar estos tests.

**Resolución**: Los tests se actualizaron para buscar el contenido en el orchestrator OR en `skills/_shared/route-federation.md`. Esto es correcto porque el contrato conductual se sigue cumpliendo: el orchestrator accede a esa lógica via la tabla de punteros + read on-demand. Los tests ahora verifican que la lógica EXISTE en alguno de los dos sitios, reflejando la arquitectura post-refactor.

**Scope**: No amplía el alcance del cambio; es una actualización necesaria de tests que verifican contratos conductuales ahora distribuidos entre el CORE y el handler `_shared/`.

---

## Archivos cambiados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `agents/sdd-orchestrator.agent.md` | Modificado | Eliminados 5 bloques (379 líneas), insertada `### Circumstantial Handler Pointer Table` |
| `skills/_shared/route-brownfield.md` | Creado | Handler Brownfield verbatim (67 líneas) |
| `skills/_shared/gate-4r-review.md` | Creado | Handler 4R Review Gate verbatim (40 líneas) |
| `skills/_shared/route-federation.md` | Creado | Handler Workspace Federation + Baseline Loop verbatim (62 líneas) |
| `skills/_shared/dispatch-lifecycle-hooks.md` | Creado | Handler Lifecycle Hook Dispatch verbatim (132 líneas) |
| `skills/_shared/gate-archive-quality.md` | Creado | Handler Archive Dispatch Guard verbatim (93 líneas) |
| `scripts/configure/real-repo.test.js` | Modificado | Test estructural agregado (pointer-table refs + sentinel checks) |
| `scripts/federation-baseline-contract.test.js` | Modificado | Tests 5.1.3/5.1.4/5.1.5/5.1.13 actualizados para buscar en orchestrator OR `_shared/` |
| `scripts/sdd-foundation-federated.test.js` | Modificado | Test "routing to sdd-foundation" actualizado para buscar en orchestrator OR `_shared/` |
| `dist/github-copilot/**` | Regenerado | 5 archivos `_shared/` nuevos + orchestrator thinned |
| `dist/opencode/**` | Regenerado | ídem |
| `dist/vscode/**` | Regenerado | ídem |
| `dist/claude-marketplace/**` | Regenerado | ídem |

---

## Estado final

**Status**: done — todos los tasks completados, `npm test` exits 0.
**Next**: sdd-verify
