# Apply Progress: project-operative-memory

**Batch**: 1 (único — single-pr strategy, size:exception accepted)
**Mode**: Strict TDD
**Date**: 2026-06-20
**Safety net baseline**: 538 tests passing, 0 failures

---

## Completed Tasks

- [x] 1.1 Crear `openspec/memory/conventions.md`
- [x] 1.2 Crear `scripts/operative-memory-contract.test.js` (esqueleto CommonJS)
- [x] 1.3 Test RED "conventions.md existe con frontmatter requerido" — confirmado fallo antes de crear conventions.md
- [x] 2.1 `sdd-phase-common.md`: patrón de tres pasos en Section A
- [x] 2.2 `sdd-phase-common.md`: tabla de lectura por fase
- [x] 2.3 `sdd-phase-common.md`: tabla de ownership
- [x] 2.4 Tests para sdd-phase-common.md — RED antes de editar, GREEN después
- [x] 3.1 `sdd-archive/SKILL.md`: Step 5b Write Resolved Decisions to Memory
- [x] 3.2 Tests para sdd-archive/SKILL.md — RED antes de editar, GREEN después
- [x] 4.1 `sdd-verify/SKILL.md`: Step 10b Write Known Issues to Memory
- [x] 4.2 Tests para sdd-verify/SKILL.md — RED antes de editar, GREEN después
- [x] 5.1 `npm test` completo: 602/602 pass, 0 fail (post-remediación 4R rondas 2-3 + ejemplo conventions.md)
- [x] 5.2 `scripts/check.js` vía npm test: 4 targets (claude, vscode, github-copilot, opencode) regeneran sin errores
- [x] 5.3 Inspección manual conventions.md: frontmatter con `title:` y `last_updated:`, aviso curación humana presente
- [x] 5.4 Inspección manual sdd-phase-common.md: tres pasos + tabla por fase + tabla ownership verificados
- [x] 5.5 Inspección manual sdd-archive/SKILL.md: filtro `status: resolved`, prepend a decisions.md, formato documentado
- [x] 5.6 Inspección manual sdd-verify/SKILL.md: `INFO < WARNING < BLOCKER`, mapping CRITICAL/WARNING/SUGGESTION, prepend a known-issues.md
- [x] 6.1 Solo `conventions.md` en `openspec/memory/` — decisions.md y known-issues.md se crean lazily
- [x] 6.2 Commit preparado (pending-commit — el orquestador gestiona el commit)

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.2 | `scripts/operative-memory-contract.test.js` | Unit/Static-contract | N/A (new file) | N/A (skeleton only) | N/A (skeleton only) | N/A | N/A |
| 1.3 | `scripts/operative-memory-contract.test.js` | Unit/Static-contract | N/A (new file) | ✅ Written — 2 tests fail (conventions.md no existe) | ✅ Pasó tras crear conventions.md (1.1) | ✅ 2 casos: frontmatter keys + aviso curación | ✅ Clean |
| 1.1 | `openspec/memory/conventions.md` | — (prose) | N/A (new file) | ✅ Cubierto por 1.3 RED | ✅ Cubierto por 1.3 GREEN | ➖ Triangulación skipped: creación de archivo, único output posible | ➖ None needed |
| 2.4 | `scripts/operative-memory-contract.test.js` | Unit/Static-contract | ✅ 2/2 (tests 1.3 previos pasan) | ✅ Written — 3 tests fail (sdd-phase-common no editado) | ✅ Pasó tras editar sdd-phase-common.md (2.1-2.3) | ✅ 3 tests distintos: mem-read step, ownership table, per-phase table | ✅ Clean |
| 2.1-2.3 | `skills/_shared/sdd-phase-common.md` | — (prose) | N/A (new sections) | ✅ Cubierto por 2.4 RED | ✅ Cubierto por 2.4 GREEN | ➖ Skipped: edición de prosa normativa, no hay branching lógico | ➖ None needed |
| 3.2 | `scripts/operative-memory-contract.test.js` | Unit/Static-contract | ✅ 5/5 (tests previos pasan) | ✅ Written — 3 tests fail (sdd-archive no editado) | ✅ Pasó tras editar sdd-archive/SKILL.md (3.1) | ✅ 3 tests distintos: open_decisions ref, status filter, entry shape | ✅ Clean |
| 3.1 | `skills/sdd-archive/SKILL.md` | — (prose) | N/A (new step) | ✅ Cubierto por 3.2 RED | ✅ Cubierto por 3.2 GREEN | ➖ Skipped: inserción de prosa, único output posible | ➖ None needed |
| 4.2 | `scripts/operative-memory-contract.test.js` | Unit/Static-contract | ✅ 8/8 (tests previos pasan) | ✅ Written — 4 tests fail (sdd-verify no editado) | ✅ Pasó tras editar sdd-verify/SKILL.md (4.1) | ✅ 4 tests distintos: taxonomy, mapping, write step, entry shape | ✅ Clean |
| 4.1 | `skills/sdd-verify/SKILL.md` | — (prose) | N/A (new step) | ✅ Cubierto por 4.2 RED | ✅ Cubierto por 4.2 GREEN | ➖ Skipped: inserción de prosa, único output posible | ➖ None needed |

### Test Summary

- **Total tests written**: 16 (en `scripts/operative-memory-contract.test.js`; 12 iniciales + 2 (B4/B5, mapeo WARNING→WARNING, threshold Step 10b) en la ronda 2 + 1 (C1) por el ejemplo de conventions.md + 1 (Seg1) que pina las cláusulas trust-boundary / illustrative-blocks / convention-scope, más el endurecimiento del pin de silent-skip en la ronda 3)
- **Total tests passing**: 602 (suite completa, post-remediación)
- **Layers used**: Unit/Static-contract (16 tests)
- **Approval tests** (refactoring): None — no hay tareas de refactoring
- **Pure functions created**: 0 — cambio es prosa+contratos, no hay lógica de producción nueva

---

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `openspec/memory/conventions.md` | Created | Memoria operativa: frontmatter YAML, aviso de curación humana, preámbulo explicativo y un ejemplo ilustrativo marcado `[EJEMPLO]` (no es una convención real) |
| `scripts/operative-memory-contract.test.js` | Created | 15 tests de contrato estático (TDD) que pinen invariantes de prosa (12 iniciales + pins B4/B5/mapeo en remediación 4R + C1 ejemplo conventions.md) |
| `skills/_shared/sdd-phase-common.md` | Modified | Section A: patrón de tres pasos, tabla de lectura por fase, tabla de ownership |
| `skills/sdd-archive/SKILL.md` | Modified | Write Resolved Decisions to Memory; flujo reordenado en remediación 4R (Step 4: memoria → Step 5: mover carpeta como última op) |
| `skills/sdd-verify/SKILL.md` | Modified | Step 10b: Write Known Issues to Memory (10a persist / 10b memoria) |

---

## Workload / PR Boundary

- Mode: single PR (size:exception aceptado por tasks.md — 400-line budget risk: Low)
- Current work unit: Unit 1 (todos los cambios en un PR)
- Boundary: Creación de store `openspec/memory/`, contratos de lectura/escritura en skills/, test de contrato
- Estimated review budget: ~185 líneas (dentro de presupuesto)

---

## Deviations from Design

Ninguna. La implementación sigue el diseño exactamente:
- conventions.md creado sin step de escritura automática (clarify-q1)
- Schema open_decisions de-facto documentado en sdd-archive/SKILL.md (clarify-q2)
- Taxonomy INFO < WARNING < BLOCKER con mapping layer localizado (clarify-q3)
- El orden TDD fue ajustado para garantizar RED-first: tests escritos ANTES de las ediciones de prosa que pinen

## Issues Found

Ninguno.
