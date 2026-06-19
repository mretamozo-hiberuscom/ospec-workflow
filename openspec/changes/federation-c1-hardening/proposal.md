# Proposal: federation-c1-hardening (C6)

**Change**: federation-c1-hardening
**Classification**: normal
**Delivery**: single PR, exception-ok

## Problem Statement

El change C1 (`federation-distributed-markers`) fue archivado con PASS WITH WARNINGS. Quedan 5 findings accionables (W1, W2, W3, S1, S4-S6) que debilitan la calidad del mecanismo de federación: un spec gap terminológico, un false-positive en la detección de corrupción de cache, un test flaky por acoplamiento a `git` del sistema, warnings ruidosos por markers incompletos de explore, y deuda cosmética en naming/docstrings.

## Goals

1. **Alinear terminología** entre specs de `workspace-explore` y `federation-markers` (W1)
2. **Eliminar el false-positive** en `isCorruptCache` para workspaces federados legítimamente vacíos (W2)
3. **Desacoplar** `warnIfGitTracked` de `spawnSync` real mediante DI seam — eliminar flake test (W3)
4. **Completar la supresión de warnings** para markers de explore escribiendo `roster: []` explícitamente (S1)
5. **Resolver deuda cosmética** en naming/comments/docstrings de los módulos de federación (S4-S6)

## Non-Goals

- **W4 (static-proof)**: Limitación inherente del enfoque de prueba de procedimientos de agente. Se documenta como aceptada.
- **S2 (design traceability)**: El design doc de C1 está archivado; corregirlo no aporta valor.
- **S3 (transactional barrier)**: Ya resuelto en C2 (atomic-write.js).

## Proposed Solution

### Work Unit 1 — Spec alignment (W1)

Editar `openspec/specs/workspace-explore/spec.md`:
- Reemplazar cualquier frase que describa "qué se almacena en el marker" con la terminología de `federation-markers/spec.md` (que es el spec autoritativo)
- Asegurar que `workspace-explore` referencie a `federation-markers` spec como source of truth para el schema del marker

### Work Unit 2 — Fix `isCorruptCache` (W2)

En `scripts/lib/artifact-store.js`, cambiar la heurística:

**Antes**: Un workspace.yaml con contenido no-vacío pero 0 members y 0 contracts = corrupto.

**Después**: Un workspace.yaml es corrupto SOLO cuando su contenido no es parseable como YAML con la estructura esperada (no contiene ni `members:` ni `contracts:` como secciones). Un archivo que parsea correctamente pero tiene listas vacías es un workspace inicializado vacío — legítimo.

Agregar test de regresión.

### Work Unit 3 — DI seam para git (W3)

En `scripts/lib/artifact-store.js`:
- Agregar un parámetro `{ execGitSync }` al factory `createWorkspaceFederatedStore(workspace, { execGitSync } = {})`
- Default: `execGitSync = spawnSync` del import
- `warnIfGitTracked` usa `execGitSync` en lugar de `spawnSync` directamente
- Propagar el parámetro desde `createArtifactStore` y `createArtifactStoreFromConfig`

En `scripts/lib/artifact-store.test.js`:
- Refactorizar el test de git-tracked (línea 368) para inyectar un mock de `execGitSync`
- Eliminar la dependencia de `git init` / `git add` reales
- Mantener un test de integración (con `gitAvailable()` guard) como smoke test separado

### Work Unit 4 — Explore markers completos (S1)

En `scripts/lib/federation-explore.js`:
- En `buildMemberData()`, agregar `roster: []` al objeto retornado
- No agregar `member.remote` (es intencionalmente ausente en explore — la supresión de warning por origin ya existe)

Agregar test que verifique que el marker enrollado por explore tiene `roster: []`.

### Work Unit 5 — Naming/comments/docstrings (S4-S6)

Review de los módulos de federación:
- `workspace-atlas.js`: Revisar naming de funciones internas, agregar docstrings JSDoc a exports
- `federation-marker.js`: Idem
- `federation-explore.js`: Idem
- `federation-baseline-orchestrator.js`: Idem

Criteria: funciones exportadas deben tener JSDoc. Naming debe seguir el vocabulario del spec autoritativo (`federation-markers`).

## Rollback Plan

Cada WU es independiente. Si uno falla el verify, se revierte sin afectar los demás. El cambio no modifica interfaces públicas ni comportamiento de los hooks.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Cambio en `isCorruptCache` podría dejar pasar cache realmente corrupto | Test de regresión con YAML malformado |
| DI seam en factory cambia la signature | Parámetro opcional con default — backward compatible |
| Spec edits podrían driftar de la implementación | Cross-check contra el código actual durante apply |

## Estimated Changed Lines

~150-250 líneas (code + specs + tests). Single PR viable.
