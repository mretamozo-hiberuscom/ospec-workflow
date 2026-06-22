# Design: Fidelidad del tooling de federación (dist runtime + surface en el cache)

## Technical Approach

Dos defectos verificados, dos funciones, dos work units independientes:

1. **Bundler** — `gatherRuntimeScripts` (`scripts/configure/cli.js:72`) siembra su BFS solo
   con `scripts/hooks/*.js`. Añadimos una allowlist explícita de cuatro entry scripts de
   skill como roots adicionales del MISMO walker estático de `require()`, más un guard de
   exclusión explícito para módulos generator-only y `*.test.js`. Cubre la spec delta
   `generator` (Scenario 1 + 3 escenarios nuevos).
2. **Merge/surface** — `mergeMarkersIntoAtlas` (`scripts/lib/workspace-atlas.js:746`)
   construye cada contrato solo con `{id, provider, consumers}`. Copiamos al objeto contrato
   todo campo no reservado del `provides[]` (passthrough genérico), simétrico con el loop ya
   presente en `serializeAtlas` (`:865`). Cubre la spec delta `federation-markers` (Atlas
   Merge Semantics + 2 escenarios nuevos de surface).

### Descubrimiento clave: ruta única de bundling para los cuatro targets

`runConfigure` (`cli.js:292`) llama a `loadTree` (`:298`), que invoca
`gatherRuntimeScripts` (`:61`) UNA sola vez por target ANTES de `transform`. `transform`
reescribe `rules/`, `agents/`, `commands/`, `.mcp.json`; los ficheros bajo `scripts/**`
pasan sin tocar. Por tanto el fix en `gatherRuntimeScripts` se propaga a los cuatro targets
(`claude`, `vscode`, `github-copilot`, `opencode`) por una sola vía — NO divergen. No hace
falta tocar ningún profile.

## Architecture Decisions

### Decision: Roots adicionales en el BFS existente (no bundle en bloque)

**Choice**: Constante `SKILL_ENTRY_SCRIPTS` con las cuatro rutas, encolada junto a los hooks.
**Alternatives**: empaquetar `scripts/lib/*` en bloque (rompe "self-contained dist y nada
más", arrastra generator-only); hardcodear rutas sin walker (pierde cierre transitivo).
**Rationale**: determinista, mínimo blast radius, reutiliza el walker probado.

### Decision: Guard de exclusión explícito (no implícito por alcanzabilidad)

**Choice**: Predicado `isExcludedRuntimeScript(rel)` aplicado tanto al sembrar como dentro
del bucle BFS, rechazando `*.test.js`, `scripts/configure/**`, `scripts/lib/target-*`
(incluye `target-profiles/`), `frontmatter.js`, `model-resolver.js`.
**Alternatives**: seguir confiando en la no-alcanzabilidad (estado actual).
**Rationale**: la spec exige excluir generator-only "regardless of whether those modules are
transitively required by any non-excluded script" (generator Scenario 2). Con nuevos roots
el cierre transitivo podría alcanzar un módulo generator-only; la exclusión implícita ya no
es suficiente. El guard la hace incondicional.

### Decision: Passthrough genérico de campos no reservados (no allowlist de `surface`)

**Choice**: En el build del contrato, copiar `Object.entries(provided)` excluyendo
`id`/`consumers`/`provider`. Reservados posicionales: `id`, `provider` (sintetizado del
`member.id` ganador), `consumers`.
**Alternatives**: allowlist de un único campo `surface` (frágil ante campos futuros).
**Rationale**: simétrico con el loop genérico de `serializeAtlas`; a prueba de campos
futuros; idempotencia trivial porque el copiado es determinista y respeta orden de inserción.

## Data Flow

    npm run build:<target>
        └─ runConfigure(target)            cli.js:292
             └─ loadTree(sourceDir)        cli.js:47
                  ├─ walk(SOURCE_ROOTS)    -> rules/agents/commands/...
                  └─ gatherRuntimeScripts  cli.js:72  ← FIX 1
                        roots = hooks/*.js  ∪  SKILL_ENTRY_SCRIPTS
                        BFS require() closure, isExcludedRuntimeScript guard
             └─ transform({files, profile})   (scripts/** passthrough)
             └─ writeTree(dist/<target>)

    /sdd-workspace explore
        └─ mergeMarkersIntoAtlas(markers)  workspace-atlas.js:746  ← FIX 2
             contract = {id, provider, consumers, ...non-reserved provides fields}
        └─ serializeAtlas(atlas)           :835  (generic loop ya emite surface)
        └─ openspec/workspace.yaml

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/configure/cli.js` | Modify | Añadir `SKILL_ENTRY_SCRIPTS` + `isExcludedRuntimeScript`; sembrar entry scripts como roots; aplicar guard en seed y en bucle BFS; no abortar si falta `hooks/` mientras existan entry scripts |
| `scripts/lib/workspace-atlas.js` | Modify | En el build del contrato (`:801`), copiar campos no reservados de `provided` excepto `id`/`provider`/`consumers` y valores nulos |
| `scripts/configure/cli.test.js` | Modify | 3 tests nuevos (presencia entry scripts, exclusión generator-only transitiva, dep transitiva) |
| `scripts/lib/workspace-atlas.test.js` | Modify | Actualizar 2 tests existentes (surface esperado) + 3 tests nuevos (surface, idempotencia, sin-surface) |

## Interfaces / Contracts

Sin cambios de firma pública. `gatherRuntimeScripts(sourceDir)` y
`mergeMarkersIntoAtlas(markers)` mantienen su contrato; cambia solo el contenido emitido.

Predicado nuevo (privado al módulo, no exportado):

    function isExcludedRuntimeScript(rel) {
      if (rel.endsWith(".test.js")) return true;
      if (rel.startsWith("scripts/configure/")) return true;
      if (rel.startsWith("scripts/lib/")) {
        const base = rel.slice("scripts/lib/".length);
        if (base.startsWith("target-")) return true;   // target-transform.js + target-profiles/*
        if (base === "frontmatter.js" || base === "model-resolver.js") return true;
      }
      return false;
    }

Build del contrato (passthrough genérico):

    const contract = { id: provided.id, provider: id,
      consumers: Array.isArray(provided.consumers) ? provided.consumers : [] };
    for (const [key, value] of Object.entries(provided)) {
      if (key === "id" || key === "consumers" || key === "provider") continue;
      if (value === undefined || value === null) continue;
      contract[key] = value;
    }

## Testing Strategy

STRICT TDD (`npm test`, Node `--test`). Cada escenario de spec mapea a un test concreto.

| # | Spec scenario | Test file | RED→GREEN |
|---|---------------|-----------|-----------|
| G1 | Skill entry-point scripts present in dist | `cli.test.js` | RED: assert los 4 entry scripts en `gatherRuntimeScripts(dir)` (no seedeados) → GREEN: añadir `SKILL_ENTRY_SCRIPTS` |
| G2 | Generator-only modules excluded from dist | `cli.test.js` | RED: entry script con `require('./target-foo')`; assert excluido → GREEN: guard `isExcludedRuntimeScript` en BFS |
| G3 | Transitive dependency of an entry script included | `cli.test.js` | RED: `federation-marker.js` requiere `./dep`; assert `dep.js` presente → GREEN: roots + walker |
| F1 | surface preserved through merge into contract | `workspace-atlas.test.js` | RED: assert contrato incluye `surface` → GREEN: passthrough |
| F2 | Merge→serialize round-trip idempotent | `workspace-atlas.test.js` | RED: serializar dos veces, assert byte-identical con `surface` presente → GREEN: passthrough determinista |
| F3 | provides entry without surface serializes correctly | `workspace-atlas.test.js` | RED: assert contrato SIN clave `surface`, reservados OK → GREEN: guard de `null/undefined` no inyecta clave |

**Tests existentes que rompen (RED natural — actualizar, no son escenarios nuevos):**
- `workspace-atlas.test.js:461` "unions member entries" — `deepEqual` de contratos sin
  `surface`. Pasa `surface: "openapi"` en input; tras el fix el contrato lo incluirá.
  Actualizar la expectativa para incluir `surface: "openapi"`.
- `workspace-atlas.test.js:551` "maps provides to contracts" — mismo caso; añadir
  `surface: "openapi"` al `deepEqual` esperado.
  Ambos se convierten en parte del RED→GREEN de F1.

`parseAtlas` ya soporta `surface` (test `:180`, expectativa `:35`), así que el round-trip
parse no requiere cambios; la idempotencia F2 es merge+serialize, no parse.

## Migration / Rollout

No migration. Dos work units independientes y reviewables por separado:
- **WU-1 (packaging)**: `cli.js` + `cli.test.js`. `npm run build:*` regenera dist.
- **WU-2 (merge)**: `workspace-atlas.js` + su test. `workspace.yaml` se reconstruye desde
  los markers (fuente de verdad) con `/sdd-workspace explore`.

Rollback = `git revert` del work unit; sin estado persistente huérfano.

## Open Questions

- Riesgo de validación OpenSpec en archive: la spec delta `generator` envuelve el requisito
  como `### Requirement: Scenario 1 — Source tree loading` (mezcla "Scenario N" en el nombre
  del requisito) en vez del patrón `### Requirement:` + `#### Scenario:`. No bloquea diseño
  ni apply, pero `sdd-archive`/validador estricto podría objetarlo. Resolver en spec antes de
  archive, no en design.
