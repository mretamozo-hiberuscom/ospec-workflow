# Tasks: Orquestación Resumible de Baseline Federado (C2)

`change: federated-baseline-orchestration` · `branch: feat/federated-baseline-orchestration`

> Orden de ejecución estricto TDD: **RED → GREEN → REFACTOR** por cada unidad de comportamiento.
> Cada tarea indica el fichero de test y el escenario de spec que cubre.
> `npm test` = `node --test scripts/**/*.test.js`

---

## Review Workload Forecast

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

| Métrica | Valor |
|---------|-------|
| Líneas estimadas totales | ~1 720 |
| WU-1 atomic-write | ~320 líneas |
| WU-2 S1 marker-hygiene | ~210 líneas |
| WU-3 S3 explore-barrier | ~110 líneas |
| WU-4 orchestrator lib | ~770 líneas |
| WU-5 agents + content-contract | ~275 líneas |
| WU-6 multi-target, docs, .gitignore | ~35 líneas |

**Estrategia de entrega elegida**: `exception-ok` — un único PR con etiqueta `size:exception`
es aceptable según la decisión del usuario. Las WUs están definidas de forma que TAMBIÉN
podrían entregarse en cadena de 5 PRs feature-branch si el reviewer lo solicita.

**Decision needed before apply**: confirmar si el warning de roster `"roster entry has no
remote"` debe **añadirse** (no existe hoy en `mergeMarkersIntoAtlas`) o si S1 sólo suprime
el warning de miembro existente. La pregunta abierta del diseño debe resolverse antes de
escribir la tarea 2.4. Ver §2.4 abajo.

---

## Fase 1 — WU-1: Helper atómico `atomic-write.js`

> **Base de toda escritura C2.** Sin este módulo ningún otro WU puede avanzar.

### 1.1 · RED — Crear `scripts/lib/atomic-write.test.js`

Crear el fichero de test con todos los escenarios antes de crear la implementación.
Usar `fs.mkdtemp` en `tmp` de sistema para aislar cada test.

**1.1.1** · Test: escritura normal — temp file creado primero, rename atómico, destino
consistente.
- Spec: `explore-transactional-barrier` §Atomic Write of workspace.yaml > "Normal write"
- Test file: `scripts/lib/atomic-write.test.js`

**1.1.2** · Test: stale `.tmp` existente al inicio → sobrescrito incondicionalmente, no falla.
- Spec: `explore-transactional-barrier` §Stale Temp File Detection > "Stale .tmp overwritten"
- Test file: `scripts/lib/atomic-write.test.js`

**1.1.3** · Test: write failure del temp (simular EPERM/ENOSPC) → fichero original intacto,
error retornado, no quedan restos de `.tmp`.
- Spec: `explore-transactional-barrier` §Atomic Write > "Write failure — original preserved"
- Test file: `scripts/lib/atomic-write.test.js`

**1.1.4** · Test: fallback Windows — rename falla con EEXIST/EPERM sobre destino existente
→ `target.bak` creado, tmp renombrado a target, `.bak` borrado; destino contiene nuevo
contenido, no corrupción.
- Spec: `explore-transactional-barrier` §Atomic Write > "Windows rename fallback"
- Test file: `scripts/lib/atomic-write.test.js`

**1.1.5** · Test: recuperación `.bak` huérfano — destino AUSENTE, `.bak` presente → `recoverOrphanBak` restaura `.bak → destino` antes de continuar; posterior `writeFileAtomic` opera sobre destino restaurado.
- Spec: `explore-transactional-barrier` §Stale Temp File Detection > clarification "bak huérfano"
- Test file: `scripts/lib/atomic-write.test.js`

**1.1.6** · Test: crash post-tmp antes de rename → en re-ejecución el stale `.tmp` se
sobrescribe y el rename completa; fichero final consistente.
- Spec: `explore-transactional-barrier` §Atomic Write > "Crash after temp write, before rename"
- Test file: `scripts/lib/atomic-write.test.js`

**1.1.7** · Test: `writeFileAtomic` aplicado a `federation-baseline-status.yaml` — mismo
comportamiento que `workspace.yaml` (patrón reusado).
- Spec: `explore-transactional-barrier` §Canonical Temp+Rename > "federation-baseline-status.yaml written atomically"
- Test file: `scripts/lib/atomic-write.test.js`

### 1.2 · GREEN — Crear `scripts/lib/atomic-write.js`

Implementar:
- `writeFileAtomic(targetPath, content)` — temp+rename; fallback `.bak` en Windows
  (detectar `EEXIST`/`EPERM` en rename sobre destino existente); limpiar `.tmp` stale al inicio.
- `recoverOrphanBak(targetPath)` — si destino ausente y `.bak` presente → rename `.bak → target`.
- Exportar: `{ writeFileAtomic, recoverOrphanBak }`.
- Sin dependencias externas (solo `node:fs/promises`, `node:path`).

### 1.3 · VERIFY — Suite WU-1 en verde

```bash
node --test scripts/lib/atomic-write.test.js
```

Todos los tests 1.1.1–1.1.7 pasan.

---

## Fase 2 — WU-2: S1 Marker Hygiene

> Hardening C1: etiqueta `origin` en markers de `enroll` + supresión selectiva de warnings
> "no remote" en `workspace-atlas.js`.

### 2.1 · RED — Extender `scripts/lib/federation-marker.test.js`

Añadir los siguientes tests (no modificar tests existentes):

**2.1.1** · Test: `enroll` escrito por `workspace-explore` (origen = `'explore'`) en marker
nuevo → marker resultante contiene `origin: explore`.
- Spec: `marker-hygiene` §Explore-Origin Marker Tag > "Explore enroll sets origin: explore"
- Test file: `scripts/lib/federation-marker.test.js`

**2.1.2** · Test: `enroll` con `origin: 'explore'` llamado sobre marker que ya tiene
`origin: init` → campo `origin` permanece `init`; `updated_at` NO se refresca (byte-stable).
- Spec: `marker-hygiene` §Explore-Origin > "Explore enroll does not downgrade origin: init"
- Test file: `scripts/lib/federation-marker.test.js`

**2.1.3** · Test: mismo caso con `origin: manual` → campo permanece `manual`, byte-stable.
- Spec: `marker-hygiene` §Explore-Origin > "Explore enroll does not downgrade origin: manual"
- Test file: `scripts/lib/federation-marker.test.js`

**2.1.4** · Test: `enroll` con `origin: 'init'` sobre marker que tiene `origin: explore` →
campo actualizado a `init`, `updated_at` refrescado (contenido cambió).
- Spec: `marker-hygiene` §Explore-Origin > "sdd-init enroll upgrades origin: explore to init"
- Test file: `scripts/lib/federation-marker.test.js`

**2.1.5** · Test: `serializeMarker`/`parseMarker` round-trip con campo `origin` presente →
campo preservado verbatim.
- Spec: `marker-hygiene` §Non-Breaking for C1 Consumers (backward-compat serialization)
- Test file: `scripts/lib/federation-marker.test.js`

### 2.2 · RED — Extender `scripts/lib/workspace-atlas.test.js`

**2.2.1** · Test: `loadMarkerFromMember` — marker con `origin: explore` y `member.remote`
ausente → `{ ok: true, marker }` retornado **sin** warning (warning suprimido).
- Spec: `marker-hygiene` §Suppression > "Explore-origin marker — no remote warning suppressed"
- Test file: `scripts/lib/workspace-atlas.test.js`

**2.2.2** · Test: `loadMarkerFromMember` — marker con `origin: init` y `member.remote`
ausente → `{ ok: true, marker, warning: "... not remotely reconstructible" }`.
- Spec: `marker-hygiene` §Suppression > "Init-origin marker — no remote warning emitted"
- Test file: `scripts/lib/workspace-atlas.test.js`

**2.2.3** · Test: marker sin campo `origin` (legado) y `member.remote` ausente → warning
emitido (comportamiento C1 preservado).
- Spec: `marker-hygiene` §Suppression > "Legacy marker (origin absent)"
- Test file: `scripts/lib/workspace-atlas.test.js`

**2.2.4** · Test: `mergeMarkersIntoAtlas` con 2 markers `origin: explore` + 1 `origin: init`
(todos sin `member.remote`) → los 3 aparecen en el atlas; warning sólo para el de `init`.
- Spec: `marker-hygiene` §Suppression > "Explore-origin member always included in atlas"
- Test file: `scripts/lib/workspace-atlas.test.js`

**2.2.5** · Test: supresión de warning roster — entrada de roster proveniente de marker con
`origin: explore` y sin campo `remote` → ningún warning de roster emitido.
- Spec: `marker-hygiene` §Suppression of Roster > "Roster no remote suppressed for explore-origin"
- Test file: `scripts/lib/workspace-atlas.test.js`

**2.2.6** · Test: warning roster preservado para fuente `origin: init` sin `remote`.
- Spec: `marker-hygiene` §Suppression of Roster > "Roster no remote preserved for init-origin"
- Test file: `scripts/lib/workspace-atlas.test.js`

**2.2.7** · Test: consumer C1 que no lee `origin` → marker con `origin: explore` parseado
e incluido sin error; comportamiento idéntico a marker sin `origin`.
- Spec: `marker-hygiene` §Non-Breaking > "Old consumer ignores origin field"
- Test file: `scripts/lib/workspace-atlas.test.js`

### 2.3 · GREEN — Modificar `scripts/lib/federation-marker.js`

- En `enroll`: aceptar `data.origin` como campo opcional.
- Precedencia `explore < init < manual`: si el marker existente tiene `origin` de mayor
  precedencia, preservar el existente y no refrescar `updated_at` (byte-stable).
- Si no hay marker existente o el existente tiene menor/igual precedencia: escribir `data.origin`.
- `serializeMarker`: incluir `origin` como campo de primer nivel si está presente (antes de
  `updated_at`).
- `parseMarker`: leer `origin` como scalar de primer nivel.

### 2.4 · GREEN — Modificar `scripts/lib/workspace-atlas.js`

> **⚠ Decisión pendiente (abierta en el design):** antes de aplicar esta tarea, confirmar si
> el warning de roster `"roster entry has no remote"` EXISTE hoy o debe AÑADIRSE. La
> supresión sólo puede implementarse si el emisor existe. Si no existe, la tarea 2.4 solo
> añade supresión en `loadMarkerFromMember` y deja la tarea de roster como noop con un
> comentario `TODO: roster-warning-not-yet-emitted`. Esta decisión debe resolverse antes del
> inicio de apply.

- En `loadMarkerFromMember`: si `!marker.member.remote` Y `marker.origin === 'explore'` →
  retornar `{ ok: true, marker }` sin warning (suprimir).
- En `mergeMarkersIntoAtlas` (y roster merge si aplica): propagar `origin` desde el marker
  fuente; suprimir warning de roster si `origin === 'explore'`.
- Mantener `origin` en el marker procesado para que las capas superiores puedan inspeccionarlo.

### 2.5 · VERIFY — Suite WU-2 en verde

```bash
node --test scripts/lib/federation-marker.test.js
node --test scripts/lib/workspace-atlas.test.js
```

---

## Fase 3 — WU-3: S3 Barrera Transaccional para `federation-explore.js`

> Reemplazar las dos llamadas directas a `fs.writeFile` (líneas 258-259) por
> `writeFileAtomic` del helper WU-1.

### 3.1 · RED — Extender `scripts/lib/federation-explore.test.js`

**3.1.1** · Test: `workspace.yaml` escrito mediante temp+rename — verificar que
`workspace.yaml.tmp` no persiste y el fichero final es consistente.
- Spec: `explore-transactional-barrier` §Atomic Write of workspace.yaml > "Normal write"
- Test file: `scripts/lib/federation-explore.test.js`

**3.1.2** · Test: `workspace-map.md` escrito mediante temp+rename — mismo criterio.
- Spec: `explore-transactional-barrier` §Atomic Write of workspace-map.md > "Both files written atomically"
- Test file: `scripts/lib/federation-explore.test.js`

**3.1.3** · Test: fallo de escritura de `workspace-map.md.tmp` después de que
`workspace.yaml` haya sido escrito con éxito → `workspace.yaml` NO revertido; warning de
escritura parcial emitido; `workspace-map.md` original preservado.
- Spec: `explore-transactional-barrier` §Atomic Write of workspace-map.md > "workspace-map.md write fails after workspace.yaml succeeds"
- Test file: `scripts/lib/federation-explore.test.js`

**3.1.4** · Test: stale `workspace-map.md.tmp` detectado al inicio → sobrescrito, flujo
normal continúa sin error.
- Spec: `explore-transactional-barrier` §Atomic Write of workspace-map.md > "Stale workspace-map.md.tmp detected"
- Test file: `scripts/lib/federation-explore.test.js`

**3.1.5** · Test (integración S1+S3): `explore` completo con miembro brownfield → marker
resultante contiene `origin: explore`; `workspace.yaml` y `workspace-map.md` escritos
atómicamente.
- Specs: `marker-hygiene` + `explore-transactional-barrier`
- Test file: `scripts/lib/federation-explore.test.js`

### 3.2 · GREEN — Modificar `scripts/lib/federation-explore.js`

- Añadir `require('./atomic-write.js')` en el header.
- Reemplazar `await fs.writeFile(atlasPath, ...)` → `await writeFileAtomic(atlasPath, ...)`.
- Reemplazar `await fs.writeFile(mapPath, ...)` → `await writeFileAtomic(mapPath, ...)`.
- Envolver en try/catch independientes: fallo de `mapPath` → warning en `warnings[]` +
  continuar (no lanzar); los artifacts retornados listan sólo los escritos con éxito.
- En `enroll` call dentro de `explore`: pasar `origin: 'explore'` en el objeto `data`.

### 3.3 · VERIFY — Suite WU-3 en verde

```bash
node --test scripts/lib/federation-explore.test.js
```

---

## Fase 4 — WU-4: Lib pura `federation-baseline-orchestrator.js`

> La pieza central de C2. Toda la lógica de selección, transición de estado, idempotencia,
> guardia stuck-partial, resolución de coordinator_root y política de fallo. I/O inyectado
> mediante un objeto `probe` para testabilidad total.

### 4.1 · RED — Crear `scripts/lib/federation-baseline-orchestrator.test.js`

Organizar en bloques `describe` por función. Usar `fs.mkdtemp` para pruebas de filesystem.

#### Bloque: `selectCandidates`

**4.1.1** · Test: miembro con ficheros fuente reales (brownfield=true) y sin
`openspec/config.yaml` (initDone=false) → incluido en candidatos.
- Spec: `federated-baseline-orchestration` §Member Selection > "Brownfield-pending member is selected"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.2** · Test: miembro sólo con ficheros de scaffolding (greenfield) → excluido;
log `skipped-greenfield` emitido.
- Spec: `federated-baseline-orchestration` §Member Selection > "Greenfield member is excluded"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.3** · Test: miembro brownfield con `openspec/config.yaml` presente (initDone=true) →
excluido; log `skipped-initialized` emitido.
- Spec: `federated-baseline-orchestration` §Member Selection > "Already-initialized member is excluded"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.4** · Test: el probe de `brownfield`/`initDone` usa el filesystem directamente —
simular marker que contiene los campos `brownfield: false` e `initDone: true` pero el
filesystem dice lo contrario → el resultado sigue al filesystem, nunca al marker.
- Spec: `federated-baseline-orchestration` §Member Selection > "brownfield and initDone never read from marker"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

#### Bloque: `nextMember` / orden de iteración

**4.1.5** · Test: candidatos `[svc-api, svc-payments, svc-reporting]` (orden atlas) →
`nextMember` retorna `svc-api` primero; `svc-payments` sólo después de que `svc-api` sea
`done` o `failed`.
- Spec: `federated-baseline-orchestration` §Sequential Per-Member Loop > "Multi-member sequential — order preserved"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.6** · Test: miembro con `baseline_status: done` → `nextMember` lo omite, pasa al siguiente.
- Spec: `federated-baseline-orchestration` §Resume Semantics > "Resume after mid-loop interruption"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.7** · Test: miembro con `baseline_status: partial` → `nextMember` lo retorna para
re-delegación con `domains_pending` actuales.
- Spec: `federated-baseline-orchestration` §Resume Semantics
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.8** · Test: miembro `pending` + `unified_gate.status: approved` → `nextMember`
lo retorna para delegación.
- Spec: `federated-baseline-orchestration` §Resume Semantics > "pending AND gate approved → delegate"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.9** · Test: miembro `pending` + `unified_gate.status: pending` → `nextMember` retorna
sentinel `{ blockedByGate: true }` (no delegar hasta gate aprobada).
- Spec: `unified-baseline-gate` §Gate Skip on Re-launch (contrapositivo)
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.10** · Test: miembro `failed` sin flag `--retry-failed` → `nextMember` lo omite.
- Spec: `federated-baseline-orchestration` §Member Failure Policy > "failed → skip until retry-failed"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.11** · Test: miembro `failed` + flag `--retry-failed` activado → `nextMember` lo
re-incluye en la iteración.
- Spec: `federated-baseline-orchestration` §Member Failure Policy > "Manual retry re-includes failed member"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

#### Bloque: `hasForwardProgress` (stuck-partial guard)

**4.1.12** · Test: `domains_pending` anterior `[A, B, C]`; estado actual `domains_pending: [B, C]`
→ `hasForwardProgress` retorna `true` (un dominio avanzó).
- Spec: `federated-baseline-orchestration` §Sequential Per-Member Loop (stuck-partial guard)
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.13** · Test: `domains_pending` anterior `[A, B]`; estado actual `domains_pending: [A, B]`
(cero dominios avanzados) → `hasForwardProgress` retorna `false` → fallo terminal activado.
- Spec: `federated-baseline-orchestration` §Sequential Per-Member Loop > "partial with ZERO forward progress"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

#### Bloque: `shouldSkipBatch0`

**4.1.14** · Test: ambos ficheros `_baseline/manifest.md` y `_baseline/config.yaml` presentes
bajo `target_dir` → retorna `true`.
- Spec: `sdd-baseline-federation-contract` §Batch-0 Skip > "Batch-0 skipped when both artifacts present"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.15** · Test: sólo `manifest.md` presente, `config.yaml` ausente → retorna `false`.
- Spec: `sdd-baseline-federation-contract` §Batch-0 Skip > "Config absent but manifest present — not skipped"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.16** · Test: ambos ausentes → retorna `false`.
- Spec: `sdd-baseline-federation-contract` §Batch-0 Skip > "Batch-0 not skipped — manifest absent"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

#### Bloque: `resolveCoordinatorRoot`

**4.1.17** · Test: `coordinator_root` explícito provisto (layout sibling:
`target_dir: ../svc-payments`, `coordinator_root: ../federated-coordinator`) → resuelto
directamente sin traversal; no se busca `openspec/changes/` en `target_dir`.
- Spec: `sdd-baseline-federation-contract` §Aggregated State Update Protocol > "Coordinator root resolved from explicit parameter — sibling layout"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.18** · Test: `coordinator_root` ausente, `target_dir` es descendiente de un directorio
que contiene `openspec/changes/{parent_change}/` → traversal ascendente localiza el
coordinator root; retorna la ruta correcta.
- Spec: `sdd-baseline-federation-contract` §Aggregated State Update Protocol > "Coordinator root resolved by upward-traversal fallback"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.19** · Test: `coordinator_root` ausente Y traversal no localiza `openspec/changes/{parent_change}/`
→ retorna `{ blocked: true, question_gate: { ... } }` sin ningún write.
- Spec: `sdd-baseline-federation-contract` §Aggregated State Update Protocol > "Coordinator root indeterminate — blocked"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

#### Bloque: `applyFailurePolicy`

**4.1.20** · Test: `applyFailurePolicy` con miembro `svc-payments`, dominio `domain-core`,
error `"write permission denied on /path/to/spec.md"` → `baseline_status: failed`;
`warnings[]` contiene member id, dominio, error verbatim; `unified_gate` NO modificada.
- Spec: `federated-baseline-orchestration` §Member Failure Policy > "Failure warning is descriptive and verbatim"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.21** · Test: tras fallo de `svc-payments`, `nextMember` retorna `svc-reporting` (loop
continúa); `svc-api` y `svc-reporting` no bloqueados.
- Spec: `federated-baseline-orchestration` §Member Failure Policy > "One member fails — others continue"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

#### Bloque: `recordGateApproval`

**4.1.22** · Test: `recordGateApproval(state)` → `unified_gate.status: 'approved'`;
`approved_at` ISO 8601 UTC presente; `approver: 'vscode/askQuestions'`; estado escrito
atómicamente (via `writeFileAtomic`).
- Spec: `unified-baseline-gate` §Gate Approval Recording > "Approval written to state file atomically"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.23** · Test: gate ya `approved` → `nextMember` omite presentar la gate (re-lanzamiento);
gate NOT re-presentada incluso con `--retry-failed`.
- Spec: `unified-baseline-gate` §Gate Skip on Re-launch > "Re-launch after approved gate"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

#### Bloque: `parseStatus` / `serializeStatus`

**4.1.24** · Test: `parseStatus` con fichero ausente → todos los miembros del atlas quedan
`pending`; `unified_gate.status: 'pending'`.
- Spec: `federated-baseline-orchestration` §Aggregated State File > "State file created on first run"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.25** · Test: `parseStatus` con YAML corrupto (truncado/inválido) → misma regeneración
que fichero ausente; no lanza error.
- Spec: `federated-baseline-orchestration` §Resume Semantics > "Resume after full crash — no state file"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.26** · Test: `parseStatus` cuando el destino está ausente y existe `.bak` huérfano →
`recoverOrphanBak` llamado antes del parseo; estado recuperado del `.bak`.
- Spec: `explore-transactional-barrier` §Stale Temp File Detection (recuperación `.bak`)
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.27** · Test: `serializeStatus` + `parseStatus` round-trip completo → estado idéntico
(gate, members, timestamps).
- Spec: `federated-baseline-orchestration` §Aggregated State File (schema)
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.28** · Test: `parseStatus` con `unified_gate` ausente del fichero (parcial) → tratado
como `pending`.
- Spec: `unified-baseline-gate` §Approval Recording > "Partial state file — gate re-presented"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

#### Bloque: `transition`

**4.1.29** · Test: `transition(state, member, 'success')` → `baseline_status: 'done'`;
`domains_pending: []`; `domains_done` incluye todos los dominios; `updated_at` refrescado;
write atómico.
- Spec: `federated-baseline-orchestration` §Aggregated State File > "State file updated after member success"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.30** · Test: `transition` con `partial` y progreso (dominio A avanzó) → `baseline_status`
permanece `'partial'`; `domains_pending` y `domains_done` actualizados; otras entradas de
miembros sin modificar (no-clobber).
- Spec: `sdd-baseline-federation-contract` §Aggregated State Update > "Domain completion updates aggregated state"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.31** · Test: `transition` con `partial` sin progreso (stuck-guard) → `baseline_status: 'failed'`;
warning añadido; `unified_gate` preservada.
- Spec: `federated-baseline-orchestration` §Sequential Per-Member Loop (stuck-partial guard)
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.32** · Test: `transition` + idempotencia completa — miembro ya `done` →
`nextMember` lo omite sin ninguna delegación ni write.
- Spec: `federated-baseline-orchestration` §Idempotency > "Idempotent re-run — member fully done"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

#### Bloque: integración multi-miembro (filesystem real, delegación mockeada)

**4.1.33** · Test de integración: layout sibling con N=3 miembros — candidatos derivados del
filesystem, gate aprobada, delegación secuencial hasta `done` para todos; `federation-baseline-status.yaml`
final refleja los 3 como `done`.
- Specs: `federated-baseline-orchestration` + `unified-baseline-gate`
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.34** · Test de integración: resume mid-loop — pre-estado con `svc-api: done`,
`svc-payments: partial [dom-B, dom-C]` → relanzamiento salta `svc-api`; delega `svc-payments`
con `domains_pending: [dom-B, dom-C]`; `dom-A` no reescrito.
- Spec: `federated-baseline-orchestration` §Resume Semantics > "Resume after mid-loop interruption"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.35** · Test de integración: fallo de un miembro → continúa con siguiente; estado final
muestra `svc-payments: failed` + warning; `svc-reporting: done`.
- Spec: `federated-baseline-orchestration` §Member Failure Policy > "One member fails — others continue"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

**4.1.36** · Test de integración: coordinador NO escribe bajo `{member}/openspec/specs/` —
verificar que ningún path bajo `target_dir` de miembro es escrito por la lib (read-and-link
boundary D10).
- Spec: `federated-baseline-orchestration` §Read-and-Link > "Coordinator does not write member specs"
- Test file: `scripts/lib/federation-baseline-orchestrator.test.js`

### 4.2 · GREEN — Crear `scripts/lib/federation-baseline-orchestrator.js`

Implementar con I/O inyectado (probe object):

```
selectCandidates(atlas, probe)
nextMember(state, options)          // options: { retryFailed }
hasForwardProgress(prevPending, currentPending)
shouldSkipBatch0(targetDir, probe)
resolveCoordinatorRoot(targetDir, parentChange, options)  // options: { coordinatorRoot? }
applyFailurePolicy(state, memberId, domain, errorMsg)
recordGateApproval(state, statusPath)
transition(state, memberId, result, statusPath)
parseStatus(yamlContent, atlas)     // regenerar si corrupto/ausente
serializeStatus(state)
loadStatus(statusPath, atlas)       // recupera .bak, luego parsea
```

- Toda escritura de estado usa `writeFileAtomic` de WU-1.
- `loadStatus` llama `recoverOrphanBak` antes de leer.
- Exportar todas las funciones nombradas.
- Sin side-effects globales; sin `process.exit`.

### 4.3 · VERIFY — Suite WU-4 en verde

```bash
node --test scripts/lib/federation-baseline-orchestrator.test.js
```

---

## Fase 5 — WU-5: Content-contract + Prosa de agentes y skills

> La lógica de delegación vive en el agente (Markdown), no en código testeable en runtime.
> Los content-contract tests son la única cobertura posible (limitación heredada de C1).

### 5.1 · RED — Crear `scripts/federation-baseline-contract.test.js`

**5.1.1** · Test: `agents/sdd-orchestrator.agent.md` contiene sección con `federation baseline
loop` o `federation-baseline` (identifica el bucle).
- Spec: `federated-baseline-orchestration` (bucle del orquestador)
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.2** · Test: `agents/sdd-orchestrator.agent.md` contiene `vscode/askQuestions` en el
contexto de gate unificada (gate unificada presentada como única pregunta).
- Spec: `unified-baseline-gate` §Unified Domain-Map Presentation
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.3** · Test: `agents/sdd-orchestrator.agent.md` contiene `continue-log-retry` o texto
equivalente (no abortar tras fallo de miembro).
- Spec: `federated-baseline-orchestration` §Member Failure Policy
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.4** · Test: `agents/sdd-orchestrator.agent.md` contiene `retry-failed` o `--retry-failed`
(mecanismo de reintento explícito).
- Spec: `federated-baseline-orchestration` §Member Failure Policy > "Manual retry"
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.5** · Test: `agents/sdd-orchestrator.agent.md` referencia `federation-baseline-orchestrator`
(la lib es la fuente de decisión; el agente es sólo capa de efectos).
- Spec: diseño (frontera lib↔agente)
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.6** · Test: `agents/sdd-baseline.agent.md` contiene `## Parameters` con los cuatro
campos federados: `federation_member_id`, `target_dir`, `parent_change`, `coordinator_root`.
- Spec: `sdd-baseline-federation-contract` §Federation Invocation Parameters
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.7** · Test: `agents/sdd-baseline.agent.md` indica que el write target en modo federado
es `target_dir` (no el directorio de trabajo del coordinador).
- Spec: `sdd-baseline-federation-contract` §Member-Local Spec Write Target
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.8** · Test: `agents/sdd-baseline.agent.md` documenta la condición de skip de batch-0
(`manifest.md` + `config.yaml` bajo `_baseline/`).
- Spec: `sdd-baseline-federation-contract` §Batch-0 Skip in Federation Mode
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.9** · Test: `agents/sdd-baseline.agent.md` describe el protocolo de actualización del
estado agregado (`federation-baseline-status.yaml`).
- Spec: `sdd-baseline-federation-contract` §Aggregated State Update Protocol
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.10** · Test: `skills/sdd-baseline/SKILL.md` contiene los cuatro parámetros de
invocación federada.
- Spec: `sdd-baseline-federation-contract` §Federation Invocation Parameters
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.11** · Test: `skills/sdd-baseline/SKILL.md` documenta la resolución de
`coordinator_root` (explícito primero, traversal como fallback).
- Spec: `sdd-baseline-federation-contract` §Aggregated State Update Protocol > coordinator_root resolution
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.12** · Test: `skills/sdd-baseline/SKILL.md` menciona el write target member-local
bajo `target_dir`.
- Spec: `sdd-baseline-federation-contract` §Member-Local Spec Write Target
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.13** · Test: `agents/sdd-orchestrator.agent.md` menciona la frontera `read-and-link`
(el coordinador no escribe en `{member}/openspec/specs/`).
- Spec: `federated-baseline-orchestration` §Read-and-Link Delegation Boundary
- Test file: `scripts/federation-baseline-contract.test.js`

**5.1.14** · Test: `agents/sdd-baseline.agent.md` documenta el caso de error
`federation_member_id` presente + `target_dir` ausente → `status: blocked`.
- Spec: `sdd-baseline-federation-contract` §Federation Invocation Parameters > "Partial federation parameters — error"
- Test file: `scripts/federation-baseline-contract.test.js`

### 5.2 · GREEN — Modificar `agents/sdd-orchestrator.agent.md`

Añadir sección `## Federation Baseline Loop` (después de la sección de Delegation Rules o
donde el coordinador describe comportamiento por fase). Contenido mínimo:

- Derivar candidatos con `selectCandidates` (probe `brownfield ∧ ¬initDone` del filesystem;
  nunca del marker).
- Escanear domain-maps frescos de todos los candidatos y presentar **una** gate unificada
  con `vscode/askQuestions` (si `unified_gate.status != approved`).
- Registrar aprobación atómicamente en `federation-baseline-status.yaml`.
- Iterar candidatos en orden determinista (atlas order, tie por `member.id` asc):
  `done`→skip, `partial`→re-delegar si hay progreso, `pending`+gate→delegar,
  `failed`→skip salvo `--retry-failed`.
- Delegar `sdd-baseline` con `{ federation_member_id, target_dir, parent_change, coordinator_root }`.
- Política continue-log-retry: fallo terminal → `baseline_status: failed` + warning verbatim +
  continuar; `unified_gate` NOT invalidada.
- `--retry-failed`: re-incluir miembros `failed`; NO re-presentar gate; idempotency check.
- Referencia explícita: la lógica de selección/transición vive en
  `scripts/lib/federation-baseline-orchestrator.js` (lib pura); el agente es la capa de efectos.
- Frontera read-and-link (D10): el coordinador SÓLO lee markers/config como probes; NUNCA
  escribe en `{member}/openspec/specs/`.

### 5.3 · GREEN — Modificar `agents/sdd-baseline.agent.md`

Añadir sección `## Parameters (modo federado)` con tabla:

| Parámetro | Tipo | Obligatoriedad en modo federado | Descripción |
|---|---|---|---|
| `federation_member_id` | string | MUST | Activa modo federado |
| `target_dir` | string | MUST | Raíz del repo miembro |
| `parent_change` | string | MUST | Nombre del cambio coordinador |
| `coordinator_root` | string | SHOULD (siempre provisto por el orquestador) | Raíz del coordinador |

Añadir subsecciones:
- **Write target**: en modo federado todos los artefactos bajo `{target_dir}/openspec/specs/`;
  NUNCA inferir ruta desde `cwd` o coordinador.
- **Batch-0 skip**: omitir gate de domain-map si `_baseline/manifest.md` Y `_baseline/config.yaml`
  presentes bajo `target_dir`.
- **Estado agregado**: tras completar un dominio, leer-modificar-escribir atómicamente
  `{coordinator_root}/openspec/changes/{parent_change}/federation-baseline-status.yaml`;
  resolución de `coordinator_root`: explícito → traversal → blocked con `question_gate`.
- **Error path**: `federation_member_id` presente SIN `target_dir` → `status: blocked`
  con `question_gate`; ningún write.

Actualizar `## Required artifacts` para reflejar que en modo federado el write target es
`target_dir`, no el directorio local del agente.

### 5.4 · GREEN — Modificar `skills/sdd-baseline/SKILL.md`

Añadir o extender sección de invocación federada con:
- Los cuatro parámetros de invocación federada.
- Tabla de write targets en modo federado.
- Regla de resolución de `coordinator_root` (orden explícito → traversal → blocked).
- Condición de skip de batch-0 (ambos ficheros `_baseline/`).
- Ejemplo mínimo de delegación federada con los cuatro parámetros.

### 5.5 · VERIFY — Suite WU-5 en verde

```bash
node --test scripts/federation-baseline-contract.test.js
```

---

## Fase 6 — WU-6: Multi-target, docs y `.gitignore`

### 6.1 · Modificar `.gitignore`

Añadir la entrada:

```gitignore
# federation baseline working state — change-scoped, not a canonical artifact
openspec/changes/*/federation-baseline-status.yaml
openspec/changes/*/federation-baseline-status.yaml.tmp
openspec/changes/*/federation-baseline-status.yaml.bak
```

Spec: `federated-baseline-orchestration` §Aggregated State File (gitignore / change-scoped).

### 6.2 · Verificar `manifest-sync.test.js`

```bash
node --test scripts/manifest-sync.test.js
```

Si el generador multi-target (`commands/*.prompt.md` / multi-target generator) enumera
parámetros de delegación de `sdd-baseline`, actualizar los targets afectados para incluir
los cuatro parámetros federados. Sólo modificar si `manifest-sync.test.js` detecta drift.

### 6.3 · Verificar `sdd-init-federation.test.js`

```bash
node --test scripts/sdd-init-federation.test.js
```

Sin cambios esperados; esta tarea confirma que WU-2 (origin field) no rompe el contrato
de init-federation existente.

### 6.4 · Verificar `federation-derived-cache.test.js`

```bash
node --test scripts/federation-derived-cache.test.js
```

Confirmar que `.gitignore` actualizado (6.1) no rompe el test de cache derivada.

---

## Fase 7 — Verificación Final

### 7.1 · Ejecutar suite completa

```bash
npm test
```

(`node --test scripts/**/*.test.js`) — todos los tests en verde, ninguna regresión.

### 7.2 · Trazar cobertura MUST/SHALL

Verificar que cada `MUST`/`SHALL` de los 5 specs tiene al menos un test unitario o
content-contract en verde:

| Spec | MUST/SHALL | Cubierto por |
|------|-----------|-------------|
| `federated-baseline-orchestration` | Selección brownfield+initDone | 4.1.1–4.1.4 |
| `federated-baseline-orchestration` | Bucle secuencial + orden | 4.1.5–4.1.11, 4.1.33 |
| `federated-baseline-orchestration` | Resume semantics | 4.1.6–4.1.9, 4.1.34 |
| `federated-baseline-orchestration` | Idempotencia (manifest+config) | 4.1.14–4.1.16, 4.1.32 |
| `federated-baseline-orchestration` | Failure policy (continue-log-retry) | 4.1.20–4.1.21, 4.1.35 |
| `federated-baseline-orchestration` | Read-and-link boundary D10 | 4.1.36, 5.1.13 |
| `unified-baseline-gate` | Gate unificada (una sola; single-member también) | 5.1.1–5.1.2, 4.1.22 |
| `unified-baseline-gate` | Gate approval recording atómica | 4.1.22 |
| `unified-baseline-gate` | Gate skip si aprobada | 4.1.23, 5.1.2 |
| `unified-baseline-gate` | Gate re-presentada si falta record | 4.1.25, 4.1.28 |
| `unified-baseline-gate` | Domain-map fresco (no caché) | 5.1.2 (content-contract) |
| `sdd-baseline-federation-contract` | Parámetros federados + activación | 5.1.6, 5.1.14 |
| `sdd-baseline-federation-contract` | Write target member-local | 5.1.7, 4.1.36 |
| `sdd-baseline-federation-contract` | Aggregated state update protocol | 4.1.29–4.1.31, 5.1.9 |
| `sdd-baseline-federation-contract` | coordinator_root (explícito/traversal/blocked) | 4.1.17–4.1.19, 5.1.11 |
| `sdd-baseline-federation-contract` | Batch-0 skip (ambos ficheros) | 4.1.14–4.1.16, 5.1.8 |
| `marker-hygiene` | Tag origin: explore en enroll | 2.1.1–2.1.4 |
| `marker-hygiene` | Supresión warning "no remote" por origin | 2.2.1–2.2.4 |
| `marker-hygiene` | Supresión roster warning | 2.2.5–2.2.6 |
| `marker-hygiene` | Non-breaking C1 | 2.2.7 |
| `explore-transactional-barrier` | Escritura atómica workspace.yaml | 1.1.1, 3.1.1 |
| `explore-transactional-barrier` | Escritura atómica workspace-map.md | 1.1.1, 3.1.2 |
| `explore-transactional-barrier` | Crash + stale .tmp | 1.1.2, 1.1.6 |
| `explore-transactional-barrier` | Write failure preserva original | 1.1.3 |
| `explore-transactional-barrier` | Fallback .bak Windows | 1.1.4 |
| `explore-transactional-barrier` | Recuperación .bak huérfano | 1.1.5, 4.1.26 |
| `explore-transactional-barrier` | Parcial-success con warning | 3.1.3 |

---

## Resumen de Work Units y ficheros afectados

| WU | Tipo | Ficheros | ~Líneas |
|----|------|---------|---------|
| WU-1 | Create | `scripts/lib/atomic-write.js`, `scripts/lib/atomic-write.test.js` | ~320 |
| WU-2 | Modify | `scripts/lib/federation-marker.js`, `scripts/lib/federation-marker.test.js`, `scripts/lib/workspace-atlas.js`, `scripts/lib/workspace-atlas.test.js` | ~210 |
| WU-3 | Modify | `scripts/lib/federation-explore.js`, `scripts/lib/federation-explore.test.js` | ~110 |
| WU-4 | Create | `scripts/lib/federation-baseline-orchestrator.js`, `scripts/lib/federation-baseline-orchestrator.test.js` | ~770 |
| WU-5 | Create+Modify | `scripts/federation-baseline-contract.test.js`, `agents/sdd-orchestrator.agent.md`, `agents/sdd-baseline.agent.md`, `skills/sdd-baseline/SKILL.md` | ~275 |
| WU-6 | Modify | `.gitignore` + verificación multi-target | ~35 |
| **Total** | | **10 ficheros creados/modificados** | **~1 720** |
