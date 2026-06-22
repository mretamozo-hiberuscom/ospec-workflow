# Proposal: Fidelidad del tooling de federación (dist runtime + surface en el cache)

## Intent

El plugin empaquetado no entrega el runtime completo de federación y el cache derivado pierde metadata. Dos defectos verificados sobre el código de este repo:

1. **Bundler gap.** `gatherRuntimeScripts` (`scripts/configure/cli.js`, líneas ~72-112) parte EXCLUSIVAMENTE de `scripts/hooks/*.js` y empaqueta solo el cierre transitivo de `require()`. Los entry points que invocan la skill/agente `sdd-workspace` (`scripts/lib/federation-marker.js`, `federation-explore.js`, `workspace-general-baseline.js`, `federation-baseline-orchestrator.js`) no son requeridos por ningún hook, así que el walker nunca los alcanza. Resultado: enroll/explore/general-baseline NO tienen runtime en el plugin v2.6.0.
2. **Merge/surface gap.** `mergeMarkersIntoAtlas` (`scripts/lib/workspace-atlas.js`, líneas ~796-806) construye cada contrato solo con `{id, provider, consumers}`, descartando `provides[].surface`. `serializeAtlas` (líneas ~865-877) ya tiene un loop genérico que emitiría claves extra, pero el merge nunca las coloca. El `surface` no sobrevive a la regeneración de `openspec/workspace.yaml`.

## Scope

### In Scope
- Que `gatherRuntimeScripts` incluya también los entry scripts de skills (además del cierre de hooks), para que enroll/explore/general-baseline tengan runtime en el dist de los cuatro targets (claude, vscode, github-copilot, opencode).
- Que `mergeMarkersIntoAtlas` preserve `surface` en el contrato del cache derivado, manteniendo idempotencia: un `/sdd-workspace explore` oficial reproduce el estado regenerado hoy a mano.
- Plan de rollback (exigido por `rules.proposal`).

### Out of Scope
- Especificaciones y diseño detallado (fases `sdd-spec` / `sdd-design`).
- Empaquetar módulos generator-only (`target-*`, `frontmatter`, `model-resolver`, `configure/`) o test files: el contrato "self-contained dist y nada más" se mantiene.
- Cambios en el esquema del marker o en `workspace-map.md`.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `generator`: el requisito de runtime bundling (spec líneas 29-30) se amplía para incluir los entry scripts de skills y su cierre `require`, además del de hooks.
- `federation-markers`: la semántica de merge (spec líneas 128-132) debe preservar `surface` (y campos extra no reservados de `provides[]`) en el contrato del cache derivado.

## Approach

**Bundler (recomendado: roots adicionales).** Añadir una allowlist explícita de entry points de skills como roots adicionales del BFS existente en `gatherRuntimeScripts`, reutilizando el mismo walker estático de `require`. Determinista y de mínimo blast radius. Alternativas descartadas: empaquetar `scripts/lib/*` en bloque (rompe el contrato "nada más" y arrastra generator-only); hardcodear las cuatro rutas sin walker (pierde deps transitivas).

**Merge (recomendado: passthrough genérico).** En `mergeMarkersIntoAtlas`, copiar al objeto contrato los campos no reservados de `provided` (excluir `id`/`consumers`, ya tratados; `provider` es sintetizado), de modo que el loop genérico ya presente en `serializeAtlas` los emita. Simétrico y a prueba de futuros campos. Alternativa descartada: allowlist de un solo campo `surface` (frágil ante nuevos campos).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/configure/cli.js` | Modified | `gatherRuntimeScripts` añade entry points de skills como roots |
| `scripts/lib/workspace-atlas.js` | Modified | `mergeMarkersIntoAtlas` preserva campos no reservados de `provides[]` |
| `scripts/configure/*.test.js` | Modified | Cobertura de presencia de scripts en dist (TDD) |
| `scripts/lib/workspace-atlas.test.js` | Modified | Cobertura de `surface` round-trip e idempotencia |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sobre-empaquetado arrastra módulos generator-only | Low | Allowlist acotada; aserción de exclusión de `target-*`/test files |
| Drift de la allowlist al añadir nuevas skills | Med | Test que valida presencia de los entry points conocidos en dist |
| `surface` colisiona con clave reservada del contrato | Low | Excluir explícitamente `id`/`provider`/`consumers` en el passthrough |
| Pérdida de idempotencia del cache | Med | Test de round-trip merge→serialize sobre marker con `surface` |

## Rollback Plan

Cambio aislado en dos funciones puras-ish sin migración de datos ni efectos persistentes irreversibles. Rollback = `git revert` del/los commits del work unit; el dist se regenera con `npm run build:*`. El `workspace.yaml` derivado se reconstruye desde los markers (fuente de verdad), por lo que revertir no deja estado huérfano: basta volver a ejecutar `/sdd-workspace explore`.

## Dependencies

- Ninguna externa. Node.js nativo; sin nuevas dependencias de runtime.

## Success Criteria

- [ ] El dist de los cuatro targets incluye `federation-marker.js`, `federation-explore.js`, `workspace-general-baseline.js`, `federation-baseline-orchestrator.js` y su cierre `require`.
- [ ] El dist sigue excluyendo test files y módulos generator-only.
- [ ] `mergeMarkersIntoAtlas` emite `surface` en el contrato y sobrevive a `serializeAtlas`.
- [ ] Un `/sdd-workspace explore` reproduce el `workspace.yaml` que hoy se regenera a mano (idempotencia).
- [ ] `npm test` en verde (TDD estricto: RED→GREEN→REFACTOR).
