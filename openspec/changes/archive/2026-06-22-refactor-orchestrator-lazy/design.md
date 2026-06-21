# Design: Orchestrator lean-and-lazy (CORE + handlers circunstanciales bajo demanda)

## Technical Approach

`agents/sdd-orchestrator.agent.md` (985 líneas) se reparticiona en un **CORE** siempre
cargado y un conjunto de **handlers circunstanciales** que viven en `skills/_shared/` y
se leen con el tool `read` solo cuando su ruta/gate dispara. La extracción es **1:1
verbatim**: cada bloque se mueve sin editar su prosa para preservar paridad conductual
(spec § Behavioral Parity). El CORE no conserva un stub por bloque; en su lugar incorpora
una **tabla de punteros única** (trigger → archivo `_shared/` → cuándo leer) que es la
sola vía de resolución (spec § "Pointer table is the sole resolution path"). El patrón
extract-and-reference ya existe en el orchestrator (L757 → `_shared/skill-resolver.md`,
L887/L932 → `_shared/*.md`); esto lo generaliza a los handlers pesados.

Cubre las 5 requirements del delta: Body Partitioning, On-Demand Read-Once Caching,
Behavioral Parity, Shared Handler Trust Boundary y Cross-Target Parity in Generated Dist.

## Architecture Decisions

### Decision: Cinco archivos `_shared/`, sin `askquestions-payloads.md`

**Choice**: extraer 5 handlers; descartar el sexto candidato (`askquestions-payloads.md`).

| Archivo `_shared/` nuevo | Absorbe (líneas actuales) | Trigger | Tamaño aprox |
|---|---|---|---|
| `route-brownfield.md` | L223-289 (Brownfield Route Handler, incl. payload advisory L249-270) | route == `brownfield` | ~67 |
| `gate-4r-review.md` | L290-329 (4R Review Gate Dispatch) | `4r-review-gate` en gates activos | ~40 |
| `route-federation.md` | L330-391 (Workspace Federation + Federation Baseline Loop) | `backend == workspace-federated` | ~62 |
| `dispatch-lifecycle-hooks.md` | L393-524 (Lifecycle Hook Dispatch, incl. payload halt L491-503) | `hooks:` declarado | ~132 |
| `gate-archive-quality.md` | L662-754 (Archive Dispatch Guard / Quality Gates, incl. payload L692-710) | antes de `sdd-archive` | ~93 |

**Alternatives considered**: un `askquestions-payloads.md` centralizando los 5 payloads
JSON (Brownfield advisory, Lifecycle halt, Quality gate, Delivery strategy, Review
workload).

**Rationale**: 3 de los 5 payloads ya viven *dentro* de un bloque que se extrae
(advisory→brownfield, halt→lifecycle, quality→archive), así que viajan verbatim con su
handler y conservan localidad. Los 2 restantes (Delivery Strategy L563-592, Review
Workload L615-639) son **camino común**: el Review Workload Guard es MANDATORY tras
`sdd-tasks` y la selección de estrategia ocurre en la primera invocación de sesión;
extraerlos no aligera el camino común y obligaría a leer un segundo archivo por gate.
Centralizar fragmentaría payloads lejos de su contexto y forzaría 2 lecturas por una sola
gate (rompe la economía read-once). Por eso los payloads quedan **inline en su handler**
(o en el CORE para delivery/review-workload). Esto realiza la mitigación
"Over-fragmentación" del proposal.

### Decision: La tabla de punteros conserva las etiquetas literales de las secciones

**Choice**: las filas de la tabla usan el título exacto de la sección original
("Brownfield Route Handler", "4R Review Gate Dispatch", "Workspace Federation",
"Federation Baseline Loop", "Lifecycle Hook Dispatch", "Archive Dispatch Guard (Quality
Gates)").

**Alternatives considered**: reescribir las filas con etiquetas nuevas más cortas.

**Rationale**: `scripts/configure/real-repo.test.js` (L235) ya asserta
`assert.match(text, /Brownfield Route Handler/)` sobre el cuerpo del orchestrator.
Conservar la frase literal mantiene ese test verde sin cambios (paridad gratuita) y la
tabla queda autodescriptiva. El mismo test (L230) exige que NO reaparezca el encabezado
`### Baseline Advisory (optional, brownfield repos only)` — no se reintroduce.

### Decision: Read-once = "no re-leer lo que ya está en mi ventana de contexto"

**Choice**: la caché es la propia ventana de contexto del orchestrator; el CORE instruye
explícitamente a no emitir un segundo `read` de un handler ya cargado en la sesión/ruta.

**Alternatives considered**: un mecanismo de caché externo o un registro de archivos
leídos en `state.yaml`.

**Rationale**: un agente LLM no tiene store de caché separado — el contenido que devuelve
`read` aterriza en su ventana de contexto, que **es** la caché. Persistir "ya leído" en
`state.yaml` sería estado redundante sin valor conductual. Esto refleja el patrón vigente
en L409 ("Cache the result for the remainder of the route — do NOT re-read config.yaml
per phase").

## CORE Pointer Table (formato exacto a incrustar)

El CORE reemplaza las 5 secciones extraídas por esta tabla (sección nueva
`### Circumstantial Handler Pointer Table`, ubicada justo después de "Route Selection &
Dispatch"):

```markdown
### Circumstantial Handler Pointer Table

These handlers are NOT inlined. Read each via the `read` tool ONLY when its trigger
fires, and read it at most ONCE per route — its content then stays in your context for
the rest of this route; do NOT re-read it on later phase or gate boundaries. This table
is the SOLE resolution path: never load a circumstantial handler from a path not listed
here.

| Handler | Trigger condition | `_shared/` file | Read at (hook point) |
|---|---|---|---|
| Brownfield Route Handler | route classification == `brownfield` | `skills/_shared/route-brownfield.md` | At route dispatch, before the first brownfield phase (brownfield-advisory gate) |
| 4R Review Gate Dispatch | `4r-review-gate` listed in the active route `gates` | `skills/_shared/gate-4r-review.md` | When the 4R hook point is reached (after `sdd-apply` on debug; after `sdd-verify` success on standard) |
| Workspace Federation / Federation Baseline Loop | `artifact_store.backend == workspace-federated` | `skills/_shared/route-federation.md` | At route start when the backend is federated, before federated foundation / baseline loop |
| Lifecycle Hook Dispatch | `hooks:` present and non-empty in `config.yaml` | `skills/_shared/dispatch-lifecycle-hooks.md` | At route start (setup/cache), before the first phase dispatch |
| Archive Dispatch Guard (Quality Gates) | before dispatching `sdd-archive` | `skills/_shared/gate-archive-quality.md` | At the archive guard, before dispatching `sdd-archive` |
```

Cada ruta de archivo se escribe **exactamente** como `` `skills/_shared/<file>.md` ``
(backtick-wrapped, con `.md`) — requisito de los validadores (ver § Dist).

### Lista final de secciones del CORE (siempre cargado)

Frontmatter + binding note · Agent Teams Orchestrator (coordinator) · User Question Gate
Protocol · Delegation Rules · Artifact Store Policy · Commands · Change Classification ·
Runtime Harness Policy · Approval Ledger Protocol · SDD Init Guard · Route Selection &
Dispatch (Steps 1-5 + Graceful Degradation) · **Circumstantial Handler Pointer Table
(NEW)** · Execution Mode · Artifact Store Mode · Delivery Strategy (+payload) · Dependency
Graph · Result Contract · Review Workload Guard (+payload) · Verification Failure Routing
· Sub-Agent Launch Pattern · Capability-Aware Stack-Skill Injection · Communication Skill
Routing · Skill Resolution Feedback · Sub-Agent Context Protocol (+ clarify routing, TDD
forwarding, reply language, apply-progress continuity, gaps resolution, artifact paths) ·
State and Conventions · Sub-Agent Clarification Contract · Recovery Rule · Strict TDD
footer.

**Removidas del camino común** (ahora bajo demanda): Brownfield Route Handler, 4R Review
Gate Dispatch, Workspace Federation + Federation Baseline Loop, Lifecycle Hook Dispatch,
Archive Dispatch Guard.

### Tamaño objetivo del cuerpo — número honesto

Se extraen ≈394 líneas; el CORE aterriza en **≈590-610 líneas** (985 − 394 + ~18 de la
tabla), ≈38-40 % de reducción del cuerpo siempre cargado. El "~480" del proposal es
aspiracional: bajo paridad estricta no se puede borrar contenido, solo reubicarlo, así que
**480 no es alcanzable sin recortar prosa**. La métrica real de éxito es: el camino común
(standard, sin hooks, single-repo) deja de pagar ~394 líneas (lifecycle 132 + archive 93 +
brownfield 67 + federation 62 + 4R 40). Recomendación: registrar el número medido en
`apply` y tratar el criterio "~480" como objetivo blando, no como gate. (Ver Open
Questions.)

## On-Demand Load + Caching — instrucción CORE

El texto normativo del encabezado de la tabla (arriba) ya codifica las tres reglas que
exige el spec § On-Demand Handler Read-Once Caching:

1. **Resolución por tabla**: ante un trigger, consultar la tabla y leer la ruta listada;
   nunca una ruta no listada.
2. **Read-once**: un solo `read` por handler por ejecución de ruta. Antes de emitir un
   `read`, comprobar si el contenido ya está en contexto esta sesión; si sí, reutilizar.
3. **No re-lectura cross-boundary**: lifecycle (multi-boundary) y los gates que disparan
   varias veces reutilizan el contenido ya cargado; sin `read` adicional para el mismo
   archivo (cubre los escenarios "Lifecycle handler not re-read" y "Two distinct handlers
   each read once").

## Dist / Generator Integration (verificado)

- **Inclusión automática, sin cambio de generador**: `cli.js` carga todo el árbol
  `skills/` vía `loadTree`/`walk` (`SOURCE_ROOTS` incluye `"skills"`, L23-31) y lo pasa por
  `transform({ files, profile, models })` (L302). Los nuevos `skills/_shared/*.md` se
  recogen y emiten a `dist/<target>/skills/_shared/` para los 4 targets sin tocar código.
  Confirmado en disco: `dist/{github-copilot,vscode,opencode}/skills/_shared/` ya existe
  (claude se regenera on-demand a `skills/sdd-orchestrator/SKILL.md` + `skills/_shared/`
  co-localizado, per spec § Cross-Target Parity).
- **Paridad cross-target de transforms (hallazgo clave)**: como los archivos `_shared/`
  pasan por el **mismo** `transform()` puro que el cuerpo inline, tokens como
  `vscode/askQuestions` dentro de un payload extraído reciben la transformación por target
  idéntica a la que recibían inline. Mover los payloads verbatim NO rompe paridad
  cross-target. (Riesgo descartado.)
- **Validadores como chequeo de paridad gratuito (DESIGN RULE)**:
  `validate-github-copilot.js` (L231-241) escanea `.github/agents/*.agent.md` y
  `validate-opencode.js` (L276-286) escanea `.opencode/agents/*.md` buscando referencias
  `` `skills/...md` `` y asertan que cada ruta EXISTE en el árbol generado. El orchestrator
  está en alcance de ambos (github-copilot: `.github/agents/sdd-orchestrator.agent.md`;
  opencode: `.opencode/agents/ospec-workflow.md`). Por tanto:
  **toda referencia de la tabla de punteros DEBE escribirse como
  `` `skills/_shared/<file>.md` `` y el archivo DEBE existir, o la validación falla.** Esto
  valida automáticamente la inclusión de los 5 archivos (paridad gratis).

## Shared Handler Trust Boundary

Los 5 archivos son **prosa instruction-only, sin frontmatter YAML**, sin tool grants,
model fields ni declaraciones de agent-contract (spec § Shared Handler Trust Boundary).
A diferencia de un `SKILL.md`, no llevan frontmatter; son datos de referencia que el
orchestrator lee con `read`, no agentes/skills con autoridad runtime. Extienden la frontera
de confianza de Section 12 del spec de agents.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `skills/_shared/route-brownfield.md` | Create | Verbatim L223-289 (sin el encabezado `###` de sección, con título interno) |
| `skills/_shared/gate-4r-review.md` | Create | Verbatim L290-329 |
| `skills/_shared/route-federation.md` | Create | Verbatim L330-391 |
| `skills/_shared/dispatch-lifecycle-hooks.md` | Create | Verbatim L393-524 |
| `skills/_shared/gate-archive-quality.md` | Create | Verbatim L662-754 |
| `agents/sdd-orchestrator.agent.md` | Modify | Eliminar los 5 bloques; insertar tabla de punteros tras "Route Selection & Dispatch" |
| `scripts/configure/real-repo.test.js` | Modify (opcional) | Añadir test de extracción/punteros (ver Testing) |
| `dist/**` | Modify | Regenerado por `scripts/configure` (NUNCA a mano) |
| `openspec/specs/agents/spec.md` | Modify | Promovido por `sdd-archive`, no en este apply |

## Interfaces / Contracts

Ninguna interfaz de código nueva. Contratos preservados verbatim: payloads
`vscode/askQuestions`, llamadas a `scripts/lib/route-dispatcher.js`,
`scripts/lib/lifecycle-hooks.js` (`parseHooksBlock`, `planExecution`, `buildAuditEntry`,
`eventAppliesToRoute`), `federation-baseline-orchestrator`, `parseQualityGates`, y los
shapes de `state.yaml` (`gates`, `lifecycle_hooks`, `approvals`, `route`). El refactor solo
cambia DÓNDE vive la prosa y CUÁNDO se carga, nunca QUÉ hace.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Estructural (NEW) | Cada ruta de la tabla de punteros del orchestrator resuelve a un `skills/_shared/*.md` existente; ningún cuerpo de handler queda inline | Test nativo en `scripts/configure/real-repo.test.js`: parsear `agents/sdd-orchestrator.agent.md`, extraer refs `` `skills/_shared/...md` ``, asertar `fs.existsSync`; y asertar que sentinels de cada handler NO aparecen en el cuerpo del orchestrator pero SÍ en su archivo |
| Dist parity | Los 5 archivos llegan a los 4 targets; refs del orchestrator resuelven | Tests existentes: `real-repo.test.js` L97-124 (ship every skill / refs resolve), `validate-github-copilot`, `validate-opencode` |
| Regresión texto | "Brownfield Route Handler" presente; encabezado Baseline Advisory ausente | `real-repo.test.js` L219-240 (sin cambios — pasa por conservar la etiqueta) |
| E2E/CLI | Generación de los 4 targets sin error | `cli.test.js`, `e2e.test.js`, `claude-marketplace.test.js` |

**Sentinels propuestos** (frase única del cuerpo, debe migrar al archivo y desaparecer del
orchestrator): brownfield → `_brownfield_advisory_shown`; 4R → `findings_summary`;
federation → `federation-baseline-orchestrator`; lifecycle → `planExecution` /
`before-task.occurrences`; archive → `Two-place override` / `parseQualityGates`.

**Line-count guard (opcional, recomendado lenient)**: assert cuerpo del orchestrator
`< 700` líneas — atrapa re-inlining accidental sin fijar el frágil 480.

## Migration / Rollout

No requiere migración de datos. Orden seguro de aplicación:

1. Crear los 5 `skills/_shared/*.md` con el contenido verbatim de cada rango.
2. Editar `agents/sdd-orchestrator.agent.md`: borrar los 5 bloques e insertar la tabla de
   punteros (conservando las etiquetas literales).
3. Añadir el test estructural nuevo en `scripts/configure/real-repo.test.js`.
4. Regenerar `dist/` con `scripts/configure` para los 4 targets (nunca a mano).
5. Correr `npm test` (incluye `cli`, `e2e`, `real-repo`, `validate-github-copilot`,
   `validate-opencode`, `claude-marketplace`).

**Rollback**: revertir `agents/sdd-orchestrator.agent.md`, borrar los 5 archivos nuevos y
el test añadido, regenerar `dist/`. Es puro docs/prompt, reversible en un commit.

## Open Questions

- [ ] El criterio de éxito "cuerpo ~480 líneas" del proposal no es alcanzable bajo paridad
  estricta; la proyección honesta es ~590-610. Decisión recomendada: aceptar el número
  medido y reformular el criterio como "reducción ≥35 % del cuerpo siempre cargado". No
  bloquea el diseño.
- [ ] ¿Vale la pena el line-count guard `< 700`? Recomendado sí (lenient), pero opcional.
