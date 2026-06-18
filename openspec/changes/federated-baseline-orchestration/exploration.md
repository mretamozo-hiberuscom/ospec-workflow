# Exploración: Orquestación Resumible de Baseline Federado

## Contexto

**C2 objetivo**: El orquestador debe delegar `sdd-baseline` a cada miembro brownfield de un workspace federado, de forma resumible. Depende de C1 (federation-distributed-markers), que entregó:

- Esquema de marcador canónico (`openspec/federation.member.yaml` por miembro)
- Atlas invertido (workspace.yaml → caché derivada gitignored)
- Fase `workspace-explore/classify` (descubrimiento, clasificación, enrollamiento)
- Capacidad `target_dir` en `sdd-init` (para init por miembro)

**Ruta**: standard (artifact_store.backend es `openspec`, no `workspace-federated`). La exploración desarrolla la lógica de orquestación que en una ruta federated posterior consumirá el backend federado.

---

## Estado Actual — Baseline Monorepo

### Mecanismo Single-Repo

El flujo actual está en `agents/sdd-baseline.agent.md` y `skills/sdd-baseline/SKILL.md`:

1. **Batch 0** (domain map approval):
   - Escanea el repo, agrupa en dominios.
   - Bloquea con `question_gate` para aprobación del usuario.
   - Escribe `openspec/specs/_baseline/manifest.md` (manifest + domain map).
   - Escribe `openspec/specs/_baseline/index.md`.
   - Actualiza `openspec/config.yaml`: `baseline.status: partial`, `domains_pending/domains_done`.

2. **Batches N** (resumible, un dominio por batch):
   - Lee manifest → identifica dominios done/skipped.
   - Lee config → obtiene `domains_pending`.
   - Pick first pending + que no esté skipped.
   - Explora fuentes, escribe spec.
   - Appends manifest entry (append-only, nunca rewrite).
   - Move dominio a `domains_done`.
   - Si quedan pending: return `partial` + `next_recommended: sdd-baseline` (relaunch).
   - Si no: return `success`.

3. **Persistencia de estado**:
   - `openspec/config.yaml`: `baseline.status`, `domains_pending[]`, `domains_done[]`.
   - `openspec/specs/_baseline/manifest.md`: append-only, latest row per dominio.
   - Ausencia de entry = pending (derivada).

### Flujo Orquestador Actual

En `agents/sdd-orchestrator.agent.md`:

```
Brownfield Advisory Gate
  ├─ specs_empty_with_code OR code_without_specs?
  └─ User: "run baseline now" vs "skip"

If yes:
  Loop {
    Delegate sdd-baseline
    If partial: relaunch
    If success: exit loop
  }

Proceed with next phase
```

---

## Herencia de C1 — Capacidades Disponibles

### Descubrimiento y Clasificación de Miembros

**Función**: `workspace-explore/classify` (C1, spec `workspace-explore/spec.md`):
- Escanea hijos a depth-1 (`stat .git` directory OR file).
- Clasifica cada miembro: `type` ∈ {microservicio, microfrontal, nuget}, `layer` ∈ {dominio, common}.
- **Derivadas**: `brownfield` = ¿hay código? (filesystem probe), `initDone` = ¿existe openspec/config.yaml?
- Escribe marcador por miembro vía `enroll` (idempotente).
- Produce `workspace-map.md` (map legible de miembros + warnings).

**Límite read-and-link**: 
- Lee markers, config, código → clasifica.
- Escribe SOLO markers (en los miembros).
- NO escribe SDD artifacts en miembros (eso es v2 / read-and-link puro).

### Marcadores Federados

`openspec/federation.member.yaml` en cada miembro:
```yaml
federation:
  id: fed-001
member:
  id: svc-payments
  role: primary
  type: microservicio
  layer: dominio
  remote: https://github.com/...
  provides:
    - id: payments-api
      consumers: [svc-checkout]
      surface: openapi
roster:
  - id: svc-payments
    remote: ...
updated_at: 2026-06-18T...
```

**Estado derivado** (NO almacenado en marcador):
- `initialized`: ¿existe {member}/openspec/config.yaml?
- `pending`: ¿marker presente, config absent?
- `brownfield`: ¿código presente?

---

## Brecha Analítica para C2

### 1. Descubrimiento de Miembros Baseline

**Pregunta**: ¿Qué miembros necesitan baseline?

**Respuesta candidata**: `brownfield: true AND initDone: false`
- Si brownfield=true y no inició: hay código sin specs → candidato baseline.
- Si brownfield=false (greenfield): marca y omite por ahora.
- Si initDone=true: baseline ya corrió en ese miembro (o no aplica).

**Fuente de verdad**: En C1, esto viene de `workspace-map.md` (clasificación post-explore) y del propio marker (quien tiene `initDone`).

**Desafío**: El orquestador (en repo coordinador) necesita:
- Leer `workspace.yaml` (atlas derivada) OR
- Recorrer miembros y leer sus markers.
¿Cuál es más resiliente a fallos parciales?

### 2. Persistencia del Estado Baseline por Miembro

**Pregunta**: ¿Dónde se persiste `baseline.status` y `domains_pending/done` de cada miembro?

**Opciones**:

**Opción 2a: En el config.yaml de cada miembro**
- Cada miembro tiene su propio `{member}/openspec/config.yaml` después de `sdd-init` per-member.
- Baseline lee/escribe su propio config.
- El orquestador agrega estado de todos los miembros.
- **Ventaja**: Cada miembro es autónomo; specs y baseline viven en el miembro.
- **Desventaja**: Orquestador debe abrir N repos para preguntar estado. Red I/O multiplicada. Si un miembro falla, complica retry.

**Opción 2b: En una coordina de estado agregado en el repo coordinador**
- Nuevo archivo: `openspec/changes/{change-name}/federation-baseline-status.yaml` (o similar).
- Contiene `members: [{id, baseline.status, domains_pending, domains_done}]`.
- Orquestador lee/escribe un único archivo.
- Baseline lo lee cuando se lanza en un miembro (la orquestación le pasa qué miembro/dominios).
- **Ventaja**: Una única fuente de verdad por cambio; resume más seguro.
- **Desventaja**: Nuevo artefacto; si el cambio es puramente local a un miembro (v1 read-and-link), ¿dónde persiste? Acoplamiento con coordinador.

**Opción 2c: Lectura dinámica del marker + config de cada miembro (sin caché separado)**
- El orquestador infiere `brownfield` del marker (o rescannea).
- Lee cada {member}/openspec/config.yaml para ver baseline.status/domains_pending.
- Si no existe config (no inició): marked como `pending`.
- Si config existe: consulta baseline.status.
- **Ventaja**: Sincronización garantizada (no hay caché desfasado).
- **Desventaja**: N roundtrips de I/O; más lento; más fallos de sincronización si un miembro offline.

**Recomendación preliminar**: Opción 2b (coordina agregada) es más resiliente para un orquestador de flujo cross-repo; Opción 2a si los miembros son muy autónomos.

### 3. Resumibilidad: Estados y Transiciones

**Escenario 1**: Dos miembros brownfield (svc-api, svc-web), ambos sin init.

1. Explore clasifica ambos (initDone=false, brownfield=true).
2. Baseline batch-0 en svc-api: user approves domain map.
3. Baseline batch-1 en svc-api: especifica dominio A. ← Status partial.
4. **Interrupción**: Falla network.
5. **Resume**: ¿Qué debe pasar?
   - Opción: Continúa svc-api, siguiente dominio (batch-2).
   - Opción: Pasa a svc-web (otros miembros primero).
   - Opción: Pregunta al usuario.

**Escenario 2**: Baseline de svc-api completo (status: done). Luego usuario agrega un 4º dominio.

- ¿Rescannea manifest? ¿Pregunta por dominio nuevo?
- C1 precedente: `stale_domains` en config permite refresh.

**Granularidad**: 
- **Miembro-level**: Resumir por "miembro siguiente" (secuencial).
- **Dominio-level**: Resumir por "dominio siguiente en ese miembro".
- **Ambos**: Miembro A dominio 1, Miembro B batch-0, Miembro A dominio 2, ...

La opción más simple es **secuencial por miembro, paralelo en dominios** (finish one member fully, move to next).

### 4. Contrato de Invocación: Cómo el Orquestador Delega

**Estado actual (single-repo)**:
```
Orchestrator → sdd-baseline (agent launch)
              {implicit: work in cwd}
```

**Necesidad para federated**:
```
Orchestrator → sdd-baseline (agent launch)
            + {param: target_dir = /path/to/member}
            + {param: federation_member_id = svc-api}
            + {param: federation_baseline_status = <member state>}
```

**Pregunta**: ¿Pasa el orquestador la información de miembro al agente, o el agente la infiere?

C1 modelo `target_dir`: El orquestador inyecta `## Parameters` en el prompt, sdd-init lo lee. ¿Podemos reutilizar este patrón?

- sdd-baseline `## Parameters`:
  ```
  federation_member_id: svc-api
  target_dir: /path/to/workspace/svc-api
  parent_change: federated-baseline-orchestration  # para encontrar estado agregado
  ```

### 5. Sincronización Cross-Repo Loop

**Actual**: Un loop + relaunch inline en el orquestador.
```
While (sdd-baseline returns partial):
  Relaunch sdd-baseline
```

**Necesario para federated**:
```
For each member in members_pending:
  If member.baseline.status == done: skip
  If member.baseline.status == pending: gate batch-0 (domain map)
  While (sdd-baseline returns partial):
    Relaunch sdd-baseline for same member
  Mark member.baseline.status = done

Proceed with next phase
```

**Preguntas abierta**: 
- ¿Parelizar across miembros? (3 membres, 3 delegates en paralelo, cada uno hace sus batches).
  - **Pro**: Más rápido.
  - **Con**: Compleja contabilidad de estado; si uno falla, ¿retryear solo ese?
- ¿Secuencial? (member 1 completo, member 2 completo).
  - **Pro**: Simpler lógica; resume claro.
  - **Con**: Más lento.

**Recomendación preliminar**: Secuencial en v1 (miembro a miembro), con possibilidad de paralelizar en v2 si batch-0 gates se unifican.

### 6. Límite Read-and-Link y Artifacts

**Restricción C1**: Orquestador MUST NOT escribir artefactos SDD en miembros.

**Interpretación para C2**:
- Specs baseline por miembro: ¿dónde viven?
  - **Opción A**: {member}/openspec/specs/ (en el miembro, escrito por sdd-baseline delegado).
    - Requiere que sdd-baseline escriba en el miembro.
    - Viola "read-and-link" (escribe en miembro).
    - Pero es el lugar natural.
  - **Opción B**: {coordinator}/openspec/changes/{change}/specs/{member}/ (specs agregadas).
    - Respeta read-and-link (specs en coordinador).
    - Pero es extraño: specs baseline "son del miembro" pero viven en coordinador.
    - Acoplamiento stronger.

**Decisión de C1 (Decisión D10)**: "Scope v1 = read-and-link. Autoría de cambios cross-cutting FUERA."

**Interpretación estricta**: Baseline per-miembro es CAMBIO LOCAL (dentro del miembro), no cross-cutting. Cada miembro tiene su own baseline. Pero escalable → lo orquesta el coordinador.

**Recomendación**: Las specs baseline escriben en {member}/openspec/specs/ (donde pertenecen). El write path es: coordinador → sdd-baseline delegado → member-local writes. Es aceptable siempre que el coordinador NO escriba directamente; solo delega.

### 7. Gaos Abiertos de C1 Que Afectan C2

Del archivo program.md, advisories heredados:

| Id | Tipo | Resumen | Impacto en C2 |
|---|---|---|---|
| W1 | spec-gap | Inconsistencia redacción: ¿brownfield/initDone en marker o derivadas? Spec autorizado: derivadas. Implementación coherente. | C2 DEBE derivar brownfield/initDone del sistema (marker + config), no almacenar. |
| S1 | suggestion | Markers escritos por explore omiten `roster`/`remote`. | C2: ¿baseline escribe markers mejorados? O dejado para hardening. |
| S3 | suggestion | explore sin barrera transaccional (crash → caché parcial, auto-sanada). | C2: Similar riesgo en loop orquestador. Considerar transacción per-miembro o rollback-safe gates. |

---

## Área Afectada

| Área | Impacto | Descripción |
|---|---|---|
| `agents/sdd-orchestrator.agent.md` | Modificado | Brownfield route handler: agregar lógica per-member baseline loop; compute per-member brownfield signal; iterate members; gate batch-0 unificado o per-member; handle partial/success/fail per member. |
| `agents/sdd-baseline.agent.md` | Modificado | Accept federation parámetros (`federation_member_id`, `target_dir`, parent change); adapt batch-0 gate si es shared across members. |
| `skills/sdd-baseline/SKILL.md` | Modificado | Document nueva invocación federada; parámetros federation; cómo encuentra estado agregado; write target in member vs coordinator. |
| `openspec/changes/{change}/federation-baseline-status.yaml` | Nuevo (Opción 2b) | Per-member baseline state: id, status, domains_pending, domains_done, warnings. |
| `.gitignore` | Posible | Si workspace.yaml ya está ignored (C1), probablemente ok. Si C2 introduce caché coordinator, añadir. |

---

## Opciones Arquitectónicas

### Opción 1: Orquestación Per-Miembro Secuencial, Estado Agregado

**Resumen**: Coordinador mantiene `federation-baseline-status.yaml` (artefacto nuevo). Iteración secuencial por miembro. Batch-0 gate compartida (user approves domain map una sola vez para todos) o per-member.

**Flujo**:

1. **Pre-loop**: Explore + classify miembros. Compute brownfield set.
2. **Initialization state**: Create `federation-baseline-status.yaml`:
   ```yaml
   change: federated-baseline-orchestration
   members:
     - id: svc-api
       baseline_status: pending
       domains_pending: []
       domains_done: []
       warnings: []
     - id: svc-web
       baseline_status: pending
   ```
3. **Shared domain-map approval (Opción A: una sola gate)**:
   - First member baseline batch-0 → asks user to approve domain maps for ALL brownfield members together.
   - Write aggregated map (e.g., `federation-baseline-maps.md`: svc-api domains, svc-web domains).
   - Update state: ALL members → `domains_pending` populated, `baseline_status: partial`.
4. **Per-member loop**:
   ```
   for member in brownfield_members:
     if member.baseline_status == done: continue
     while true:
       delegate sdd-baseline {member, federation_member_id, parent_change}
       read federation-baseline-status.yaml
       if status == success:
         mark member done
         break
       if status == partial:
         continue loop (relaunch)
       if status == blocked:
         surface question, wait user, relaunch
   ```
5. **Post-loop**: All members done → proceed next phase.

**Pros**:
- Lógica orquestador simple (secuencial).
- Un único state file por cambio (sincronización clara).
- Read-and-link: coordinador no escribe en miembros directamente (solo delega).
- Resume: rescan config + state → retoma el miembro/dominio correcto.

**Contras**:
- Nuevo artefacto (`federation-baseline-status.yaml`); acoplamiento con coordinator.
- Batch-0 gate unificada puede ser pesada (user ve domain maps de 10 miembros).
- Sequential es lento (N miembros = N launches mínimo).
- Overhead: estado sync multi-fichero (miembro config + coordinator status).

**Testabilidad (strict TDD)**:
- Mock filesystem para federation-baseline-status.yaml.
- Test per-member loop: state transitions (pending → partial → done).
- Test batch-0 gate: domain map unificada.
- Test resume: lee status, retoma.
- Todos testeable con `node --test` (no runtime, mock I/O).

---

### Opción 2: Orquestación Per-Miembro, Estado Local + Agregación Dinámica

**Resumen**: NO crear `federation-baseline-status.yaml`. El orquestador infiere estado leyendo cada {member}/openspec/config.yaml (baseline.status, domains) + {member}/openspec/federation.member.yaml (brownfield, initDone). Caché negado: consulta dinámica.

**Flujo**:

1. **Discover** miembros (workspace-explore ya hecho).
2. **For each member**:
   - Read marker → infer brownfield/initDone.
   - If brownfield and not initDone:
     - Read {member}/openspec/config.yaml (if exists) → get baseline.status/domains.
     - If not exists: infer status = pending.
     - If status == done: skip.
     - If status == pending: launch batch-0.
     - If status == partial: launch next batch.
     - While partial: relaunch.
3. **No central state file**.

**Pros**:
- Minimal newcomer state (usa config existentes).
- Members fully autonomous (no dependency on coordinator state).
- Sincronización garantizada (siempre leo lo fresh).

**Contras**:
- N × M I/O (N miembros, M lecturas per member).
- Lógica orquestador más compleja (parse + infer + navigate 多 config files).
- Resume fragilidad: si un miembro config corrupto, ¿qué?
- Batch-0 unificada imposible (cada member su domain map).

**Testabilidad**:
- Setup fixture con N miembros en tmpdir.
- Test I/O path: read config, infer state.
- Test loop lógic.
- Más test-doubles necesarios.

---

### Opción 3: Orquestación Híbrida — Per-Miembro + Cache Local

**Resumen**: Coordinador mantiene lightweight aggregate cache (`federation-baseline-status.yaml`), pero es regenerable desde {member}/config + markers. No es fuente de verdad; es optimización.

**Flujo**:

1. Before loop: Regenerate cache from members (si ausente o stale).
2. Use cache para decisiones rápidas (¿cuál es next member?).
3. Per-member delegation → miembro updates su config.
4. After delegation: Invalidate cache (regenerar en próximo loop tick).

**Pros**:
- Performance (1 cache file vs N member files).
- Resilencia: cache inválido → regenera.
- Semi-autonomous miembros (config locales + cache para orquestación).

**Contras**:
- Complejidad (validación de cache, invalidación).
- Dos fuentes de verdad en tensión.

---

## Recomendación: Opción 1 (Estado Agregado)

**Rationale**:
1. **Claridad**: Una única fuente de verdad por cambio (estado agregado).
2. **Resume seguro**: Leer estado → saber exactamente dónde estamos (qué miembro, qué batch, qué dominio).
3. **Escalabilidad**: Si en C3+ hay múltiples cambios federados, el patrón de estado agregado es probado.
4. **TDD friendly**: Lógica de orquestador testeable con mocks simples.
5. **Aceptación C1 D10**: No viola read-and-link (escritas en miembros a través de delegación, no directas desde coordinador).

**Costo**: 
- Nuevo artefacto.
- Sync overhead (manageable: 1 file per change, updated after each delegation).

---

## Riesgos Identificados

### Seguridad y Consistencia

| Riesgo | Severity | Mitigación |
|---|---|---|
| **Fallos parciales cross-repo** | HIGH | Transacción-like per miembro: si falla mid-batch, mark pending. Resume ignora partial, relanza desde batch-0 o siguiente. Idempotencia en sdd-baseline requiere revisión. |
| **Sync state multi-file** | MEDIUM | Atomic writes (temp+rename) en federation-baseline-status.yaml + member configs. Lógica orquestador es-agnostic a order (re-scan siempre). |
| **Batch-0 gate unificada O per-member?** | MEDIUM | User experience: 1 gate approval vs N. Spec cost: 1 unified domain map vs N. Recomendación: unificada si N < 5 miembros; per-member si N > 5 (gate de confirmación per-member sobre demanda). |
| **Recuperación de fallo de miembro** | MEDIUM | Miembro offline/corrupto: baseline falla, marked pending. Reintento automático or manual? Policy: mark pending, log warning, continue others. User puede retry después. |
| **Idempotencia sdd-baseline multi-run** | HIGH | sdd-baseline bash-0 con domain map ya aprobada: ¿re-pregunta o reusa? Recomendación: manifest.md + config presentes → relaunch batch-N (nunca re-batch-0). Test required. |

### Especificación y Diseño

| Riesgo | Severity | Mitigación |
|---|---|---|
| **W1 (brownfield/initDone derivadas vs almacenadas)** | MEDIUM | C2 DEBE derivar cleanly. Spec: brownfield = hasSourceFiles(member) on-demand o cached en marker? Marker NO almacena; federation-baseline-status.yaml SÍ (derived → copied de classifier). Reconciliar. |
| **Batch-0 gate scope** | MEDIUM | User approves domain map para svc-api, luego falla. Retry relanza batch-0 o batch-N? Si batch-0 ya aprobada (manifest presente), descartar gate. Spec: si manifest + config presentes, skip batch-0. |
| **S3 (transacción explore)** | LOW | Similar en orchestrator loop: crash a mitad de delegation → state inconsistente. Mitigación: federation-baseline-status.yaml update DESPUÉS de delegación exitosa (no antes). Atomic. |

### Testabilidad (Strict TDD)

| Riesgo | Severity | Mitigación |
|---|---|---|
| **Mock federated filesystem** | MEDIUM | Tests requieren fixture con multi-member layout. `fs.mkdtemp` + temp files per test. Helpers reutilizable (federation-explore.test.js ya lo hace). |
| **Orchestrator loop no tiene unit test** | MEDIUM | Orquestador es executor (agents/sdd-orchestrator.agent.md es prompt template), no módulo testeable. Lógica per-member loop DEBE extraerse a lib (e.g., `scripts/lib/federation-baseline-orchestrator.js` = puro, testeable). |
| **Delegation mock** | MEDIUM | Test no puede delegar realmente. Mock: fixture state + simulate delegation returns (return `{status: partial, ...}` etc.). Integ test: un miembro real en tmpdir, minimal delegation. |

---

## Preguntas Bloqueantes Abiertas

1. **¿Batch-0 gate unificada o per-member?**
   - Unificada: 1 domain map para todos.
   - Per-member: N approvals, pero transparente.
   - Recomendación: Unificada (less friction) si N < 5, else per-member con default "approve all".

2. **¿Paralelizar members o secuencial?**
   - V1 secuencial (simplicidad).
   - V2+ paralelizar si hay many members.

3. **Si un miembro baseline falla, ¿bloquear el cambio o continue?**
   - Continue (other members) + log pending, allow manual retry.
   - Permite partial delivery.

4. **¿Dónde viven specs baseline en C2?**
   - {member}/openspec/specs (sdd-baseline escribe en miembro).
   - {coordinator}/openspec/changes/{change}/specs/ (coordinador agrega).
   - Recomendación: Miembro (C1 D10 read-and-link lo permite; specs son locales).

---

## Artifact Ready for Proposal

Sí. 

**Información necesaria para la propuesta**:
1. Seleccionar Opción 1 (estado agregado) o confirmar alternativa.
2. Decidir: batch-0 gate unificada vs per-member.
3. Validar: dónde escriben specs baseline (member vs coordinator).
4. Scope: ¿C2 solo orchestration, o incluye hardening (S1/S3 de C1)?

**Próximos pasos recomendados**:
1. `/sdd-propose` con la opción recomendada + decisiones.
2. `/sdd-spec` de cada componente (orchestrator loop, federation-baseline-status.yaml, estado derivado).
3. `/sdd-design` con secuencias multi-miembro, transaccionalidad.
4. `/sdd-tasks` con WUs (lib, skill, agents, tests).

---

## Resumen de Hallazgos

| Componente | Hallazgo Clave |
|---|---|
| **Descubrimiento baseline** | Derivar `brownfield ∧ ¬initDone` de marker + filesystem. C1 ya proporciona classification; C2 consume. |
| **Estado per-miembro** | Nueva `federation-baseline-status.yaml` (agregada, opción recomendada) vs lectura dinámica config + marker. Agregada más segura para resume cross-repo. |
| **Persistencia** | Append-only manifest + config baseline (existentes) + estado agregado nuevo. Sincronización vía atomic writes. |
| **Resumibilidad** | Secuencial por miembro (v1) × dominio. Estado captura {member, status, domains_pending/done}. Resume = re-scan state, retoma exacto. |
| **Limits read-and-link** | Specs viven en {member}/openspec/specs (local). Orchestrator delega (no escribe direct). Aceptable bajo D10. |
| **Herencia C1** | Markers (brownfield), workspace-map (init-done), target_dir (delegación sdd-init). Gaos W1/S1/S3 a reconciliar. |
| **Riesgos** | Fallos parciales (mitigación: mark pending, continue). Sync multi-file (mitigación: atomic + re-scan). Batch-0 unificada vs per-member (decisión abierta). Idempotencia sdd-baseline multi-run (test required). |
| **Testabilidad** | Library logic (per-miembro loop, state machine) separada de prompt orchestrator. Mock filesystem + simulate delegations. 100% cobertura con node --test. |

---

## Referencias Consulta

- `openspec/changes/archive/2026-06-18-federation-distributed-markers/design.md` (C1 mechanism).
- `openspec/changes/archive/2026-06-18-federation-distributed-markers/program.md` (C1 decisiones D1–D11, gaos W1–S6).
- `agents/sdd-orchestrator.agent.md` (brownfield-advisory gate actual, futura federation section).
- `agents/sdd-baseline.agent.md` (batch 0, batch N, resumibility single-repo).
- `skills/sdd-baseline/SKILL.md` (mecanismo, manifest append-only, domains_pending/done).
- `scripts/lib/federation-explore.js` + `federation-marker.js` (C1 implementation).
- `scripts/lib/workspace-atlas.js` (classify, marker readers).
