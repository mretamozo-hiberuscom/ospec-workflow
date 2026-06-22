# Apply Progress: federation-tooling-fidelity

**Batch**: 1 (único — todos los tasks del change)
**Mode**: Strict TDD
**Delivery**: size:exception (Low risk, ~212 lines changed efectivos)
**Commits**: WU-1 `e9836dc`, WU-2 `bd9e382`

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 G1 | `scripts/configure/cli.test.js` | Unit | ✅ 15/15 | ✅ Written | ✅ Passed (test 16) | ✅ 4 assertions (4 entry scripts) | ➖ None needed — pure function |
| 1.2 G2 | `scripts/configure/cli.test.js` | Unit | ✅ 15/15 | ✅ Written — hook→federation-marker→target-foo transitively included before guard | ✅ Passed (test 17) | ✅ Triangulated via G1 + hook chain setup | ➖ None needed |
| 1.3 G3 | `scripts/configure/cli.test.js` | Unit | ✅ 15/15 | ✅ Written — empty hooks, some-dep unreachable without SKILL_ENTRY_SCRIPTS | ✅ Passed (test 18) | ✅ Triangulated by distinct setup (no hooks path, only entry script path) | ➖ None needed |
| 2.1–2.3 impl | `scripts/configure/cli.js` | — | — | — | ✅ All 18/18 pass after impl | — | ✅ Constants extracted, guard pure function, comments updated |
| 3.1 :461 update | `scripts/lib/workspace-atlas.test.js` | Unit | ✅ 34/34 | ✅ deepEqual updated — fails before passthrough | ✅ Passed (test 20) | ✅ Part of F1 triangulation | ➖ None needed |
| 3.2 :551 update | `scripts/lib/workspace-atlas.test.js` | Unit | ✅ 34/34 | ✅ deepEqual updated — fails before passthrough | ✅ Passed (test 25) | ✅ Part of F1 triangulation | ➖ None needed |
| 3.3 F1 | `scripts/lib/workspace-atlas.test.js` | Unit | ✅ 34/34 | ✅ Written — surface absent from contract before fix | ✅ Passed (test 35) | ✅ Combined with :461/:551 updates for triangulation | ➖ None needed |
| 3.4 F2 | `scripts/lib/workspace-atlas.test.js` | Unit | ✅ 34/34 | ✅ Written — surface absent from YAML output before fix | ✅ Passed (test 36) | ✅ 2 assertions: byte-identical AND surface present in output | ➖ None needed |
| 3.5 F3 | `scripts/lib/workspace-atlas.test.js` | Unit | ✅ 34/34 | ➖ Trivially green (no-op guard test — absence of surface) | ✅ Passed (test 37) | ✅ Negative-case paired with F1 positive case | ➖ None needed |
| 4.1–4.2 impl | `scripts/lib/workspace-atlas.js` | — | — | — | ✅ All 37/37 pass after impl | — | ✅ Passthrough loop matches design spec verbatim |
| 5.1 spec fix | `openspec/changes/federation-tooling-fidelity/specs/generator/spec.md` | — | N/A | N/A | N/A | N/A | ✅ Header normalizado; inline GWT promovido a `#### Scenario:` |

### Test Summary

- **Total tests written (new)**: 8 (G1, G2, G3 en cli.test.js + F1, F2, F3, :461 update, :551 update en workspace-atlas.test.js)
- **Total tests passing after apply**: cli.test.js 18/18, workspace-atlas.test.js 37/37
- **Suite completa**: 676/678 (2 fallos preexistentes — `real repo: github-copilot/opencode validator` — presentes antes del change, sin relación con esta implementación)
- **Layers used**: Unit (8 tests)
- **Approval tests (refactoring)**: None — no refactoring tasks
- **Pure functions created**: `isExcludedRuntimeScript` (privada, no exportada)

---

## Tasks Completed

### Phase 1: WU-1 RED

- [x] 1.1 Test G1 escrito y RED confirmado — federation-marker.js ausente del resultado
- [x] 1.2 Test G2 escrito y RED confirmado — target-foo.js presente vía hook→marker antes del guard
- [x] 1.3 Test G3 escrito y RED confirmado — some-dep.js ausente sin SKILL_ENTRY_SCRIPTS
- [x] 1.4 Ejecutado: 15 pass + 3 fail (G1, G2, G3) ✓

### Phase 2: WU-1 GREEN

- [x] 2.1 `SKILL_ENTRY_SCRIPTS` constante añadida a `cli.js` antes de `gatherRuntimeScripts`
- [x] 2.2 `isExcludedRuntimeScript(rel)` implementada (privada) con todos los predicados del diseño
- [x] 2.3 `gatherRuntimeScripts` modificada: hooksDir condicional, SKILL_ENTRY_SCRIPTS seeded, guard en BFS
- [x] 2.4 18/18 verde; commit `e9836dc` — WU-1 entregado

### Phase 3: WU-2 RED

- [x] 3.1 Test :461 actualizado — surface: "openapi" en deepEqual → RED confirmado
- [x] 3.2 Test :551 actualizado — surface: "openapi" en deepEqual → RED confirmado
- [x] 3.3 Test F1 escrito → RED confirmado (surface ausente en contrato)
- [x] 3.4 Test F2 escrito → RED confirmado (surface ausente en YAML serializado)
- [x] 3.5 Test F3 escrito → verde trivial (test de ausencia correcto por diseño)
- [x] 3.6 Ejecutado: 33 pass + 4 fail (tests 20, 25, 35, 36) ✓

### Phase 4: WU-2 GREEN

- [x] 4.1 `mergeMarkersIntoAtlas` modificada: passthrough genérico de campos no reservados con guard null/undefined
- [x] 4.2 37/37 verde; commit `bd9e382` — WU-2 entregado

### Phase 5: Spec cleanup

- [x] 5.1 Header renombrado a `### Requirement: Source tree loading ampliado`; inline GWT promovido a `#### Scenario: Carga del árbol fuente con entry scripts de skill`

---

## Deviations from Design

- **G2 test setup**: El diseño documenta el test como "entry script con require('./target-foo')" sin hook intermediario. Para que G2 sea genuinamente RED en el estado inicial (antes de cualquier implementación), se añadió un hook que requiere `federation-marker.js`, haciendo target-foo transitivamente alcanzable antes del guard. El comportamiento verificado es idéntico al especificado.
- **F3 trivialmente verde**: El test que verifica ausencia de `surface` pasa trivialmente antes del fix porque el contrato nunca tuvo campos extra. Es un test de regresión post-fix válido, no un test de RED/GREEN. Documentado explícitamente en la evidencia TDD.

## Issues Found

- **2 fallos preexistentes en suite completa**: `real repo: github-copilot output passes its own validator` y `real repo: opencode output passes its own validator` — confirmados preexistentes mediante `git stash` + `npm test`. Sin relación con este change. No se corrigen aquí.
