# Proposal: Orchestrator lean-and-lazy (CORE + handlers circunstanciales bajo demanda)

## Intent

`agents/sdd-orchestrator.agent.md` es el system prompt del orchestrator: su cuerpo completo (985 líneas / ~58 KB / ~14-15K tokens) se carga en CADA turno. Conforme se añadieron features (lifecycle hooks, quality gates, stack skills), se anexaron inline grandes bloques de handlers circunstanciales. ~50% del cuerpo es lógica condicional que solo aplica en rutas/gates específicas pero se paga en toda corrida del camino común (single-repo, sin lifecycle hooks, a mitad de ciclo). El objetivo es dejar el orchestrator lean-and-lazy sin cambiar su comportamiento.

## Scope

### In Scope
- Mantener un CORE siempre cargado: índice + router + reglas base + protocolo de lanzamiento/contexto de sub-agentes.
- Extraer los bloques circunstanciales a archivos de referencia en `skills/_shared/`, cargados bajo demanda con el tool `read` solo cuando la ruta/gate selecciona esa rama (patrón extract-and-reference ya usado en L757/L887/L932).
- Añadir en el CORE una tabla de punteros (ruta/gate → archivo) para que el orchestrator sepa qué leer y cuándo.
- Read-once-per-route con caché de sesión (como ya hace el bloque lifecycle en L409).

### Out of Scope
- Cualquier cambio de lógica/comportamiento del orchestrator (paridad conductual obligatoria).
- Cambios en sub-agentes de fase, en `scripts/lib/*`, o en la tabla de routing de `config.yaml`.
- Edición manual de `dist/` (se regenera con `scripts/configure`).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `agents`: añadir un requisito normativo que defina la estructura del cuerpo del orchestrator como un CORE siempre cargado más handlers circunstanciales en `skills/_shared/` cargados bajo demanda (read-once-per-route, keyed por la tabla de routing), preservando comportamiento observable.

## Approach

Dividir el cuerpo en CORE inline + archivos `_shared/` referenciados:

| Bloque (líneas actuales) | Archivo `_shared/` destino | Disparador |
|--------------------------|----------------------------|-----------|
| Brownfield Route Handler (L223-289) | `route-brownfield.md` | route == brownfield |
| Workspace Federation + Baseline Loop (L330-391) | `route-federation.md` | backend == workspace-federated |
| 4R Review Gate Dispatch (L290-329) | `gate-4r-review.md` | gate 4r en tabla |
| Lifecycle Hook Dispatch (L393-524) | `dispatch-lifecycle-hooks.md` | `hooks:` declarado |
| Archive Dispatch Guard / quality gates (L662-754) | `gate-archive-quality.md` | antes de archive |
| Payloads `askQuestions` repetidos | `askquestions-payloads.md` | referenciados al construir gate |

El CORE conserva: Coordinator + Delegation Rules, User Question Gate, índice de comandos + Change Classification, SDD Init Guard, esqueleto Route Selection & Dispatch, Result Contract / Dependency Graph, Sub-Agent Launch + Context Protocol, Recovery Rule. Los archivos `_shared/` son prosa instruction-only sin semántica ejecutable (consistente con la frontera de confianza existente). Meta: cuerpo siempre cargado ~985 → ~480 líneas; el camino común deja de pagar brownfield/federation/lifecycle/archive.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `agents/sdd-orchestrator.agent.md` | Modified | Reducir a CORE + tabla de punteros |
| `skills/_shared/route-brownfield.md` | New | Handler brownfield extraído |
| `skills/_shared/route-federation.md` | New | Federation + baseline loop |
| `skills/_shared/gate-4r-review.md` | New | Dispatch 4R |
| `skills/_shared/dispatch-lifecycle-hooks.md` | New | Lifecycle hooks |
| `skills/_shared/gate-archive-quality.md` | New | Archive guard + quality gates |
| `skills/_shared/askquestions-payloads.md` | New | Shapes JSON centralizados |
| `dist/**` | Modified | Regenerado por `scripts/configure` (no manual) |
| `openspec/specs/agents/spec.md` | Modified | Delta de requisito (vía sdd-spec) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Deriva de comportamiento al mover prosa | Med | Extracción 1:1 verbatim; revisión diff por bloque; paridad como criterio de éxito |
| Over-fragmentación / lecturas repetidas | Med | Read-once-per-route + caché de sesión; tabla de punteros única en el CORE |
| Inyección desde `_shared/` tratada como instrucción confiable | Low | Mantener archivos instruction-only, sin semántica ejecutable; nota de frontera de confianza |
| Romper paridad de `dist/` | Low | Regenerar con `scripts/configure`; correr tests de paridad dist |

## Rollback Plan

Revertir `agents/sdd-orchestrator.agent.md` y borrar los nuevos `skills/_shared/route-*.md`, `gate-*.md`, `dispatch-lifecycle-hooks.md` y `askquestions-payloads.md`; regenerar `dist/`. Es puro docs/prompt, trivialmente reversible en un commit.

## Dependencies

- `scripts/configure` operativo para regenerar `dist/` y mantener verde la paridad.

## Success Criteria

- [ ] Cuerpo siempre cargado del orchestrator reducido **≥35%** bajo paridad verbatim estricta (proyección ~590-610 líneas; registrar el número medido en apply). El "~480" inicial se reformula: bajo extracción 1:1 no se borra prosa, solo se reubica — la métrica real es que el camino común (standard, sin hooks, single-repo) deja de pagar ~394 líneas circunstanciales.
- [ ] Cada bloque circunstancial vive en un archivo `_shared/` y se carga solo cuando su ruta/gate dispara.
- [ ] Paridad conductual verificada: ningún cambio en decisiones de routing, gates ni dispatch.
- [ ] `scripts/configure` regenera `dist/` y los tests de paridad dist pasan.
