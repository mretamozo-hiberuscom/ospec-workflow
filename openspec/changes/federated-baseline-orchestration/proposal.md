# Proposal: Orquestación Resumible de Baseline Federado (C2)

## Intent

C2 entrega la capacidad del orquestador para **delegar `sdd-baseline` a cada miembro brownfield** de un workspace federado de forma **resumible y tolerante a fallos parciales**. C1 (`federation-distributed-markers`) ya provee descubrimiento, clasificación (`brownfield`/`initDone` derivados), markers canónicos y `target_dir` en `sdd-init`; lo que falta es el **bucle de orquestación cross-repo** que consuma esa clasificación, persista estado agregado y reanude exactamente donde se interrumpió. C2 depende de C1 porque toda la selección de miembros y el límite read-and-link (D10) nacen de sus markers y de la fase `workspace-explore`.

## Scope

### In Scope
- **Bucle de baseline per-miembro resumible**: estado agregado en `federation-baseline-status.yaml` (coordinador), iteración **secuencial**, selección derivada `brownfield ∧ ¬initDone`.
- **Gate batch-0 unificada**: una sola aprobación de domain-map que cubre TODOS los miembros brownfield.
- **Specs member-local**: el `sdd-baseline` delegado escribe en `{member}/openspec/specs/`; el coordinador **delega, nunca escribe en los miembros** (preserva read-and-link / D10).
- **Política de fallo `continue-log-retry`**: ante fallo de un miembro → marcar `pending`, emitir warning, continuar con los demás, permitir reintento manual (delivery parcial aceptable).
- **Extracción a lib testeable**: la lógica del bucle/máquina de estados se aísla en `scripts/lib/federation-baseline-orchestrator.js` (puro, cubierto por `node --test`), porque el prompt del agente orquestador no es unit-testable.
- **Hardening C1 absorbido (S1, S3)**:
  - **S1**: markers escritos por `explore` omiten `roster`/`member.remote` y disparan warnings ruidosos fail-open "no remote" — etiquetar/suprimir markers de origen `explore`.
  - **S3**: `explore` escribe `workspace.yaml` + `workspace-map.md` sin barrera transaccional — añadir barrera crash-safe/atómica.

### Out of Scope
- Autoría de cambios cross-cutting multi-repo (v2 / C1 D10).
- Ejecución **paralela** de miembros (diferida a v2).
- Bootstrap greenfield más allá de marcarlo `pending`.
- Advisories C1 restantes **W2/W3/W4/S2/S4–S6** (permanecen en C6).
- Reconciliación W1 (derivar `brownfield`/`initDone`, nunca almacenarlos en el marker) se trata como **restricción de corrección**, no como ítem de scope separado.

## Capabilities

> Contrato con `sdd-spec`. Nombres existentes verificados en `openspec/specs/`.

### New Capabilities
- `federation-baseline-orchestration`: bucle secuencial per-miembro, estado agregado `federation-baseline-status.yaml`, gate batch-0 unificada, política `continue-log-retry`, contrato de delegación a `sdd-baseline` con parámetros de federación.

### Modified Capabilities
- `workspace-explore`: S1 (higiene de markers de origen explore, supresión de warnings fail-open) + S3 (barrera transaccional atómica al escribir `workspace.yaml` + `workspace-map.md`).
- `agents`: contrato de delegación de `agents/sdd-orchestrator.agent.md` → `agents/sdd-baseline.agent.md` con nuevos parámetros de federación (`federation_member_id`, `target_dir`, `parent_change`).

## Approach

Bucle **secuencial per-miembro** gobernado por `federation-baseline-status.yaml` (fuente de verdad única por cambio). Pre-bucle: derivar el conjunto brownfield de markers + filesystem (nunca almacenado en marker, W1). Una **gate batch-0 unificada** aprueba el domain-map de todos los miembros; tras ello se delega `sdd-baseline` por miembro (relanzando mientras devuelva `partial`) con el patrón **read-and-link** (coordinador delega, miembro escribe sus specs). El estado agregado se actualiza **después** de cada delegación exitosa, con **escrituras atómicas (temp + rename)** — misma barrera que cierra S3. Idempotencia: si `manifest.md` + `config.yaml` del miembro ya existen ⇒ **omitir batch-0**, reanudar en batch-N. La lógica de transición vive en `scripts/lib/federation-baseline-orchestrator.js` para cobertura TDD.

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `scripts/lib/federation-baseline-orchestrator.js` | Nuevo | Lógica pura del bucle per-miembro y máquina de estados (selección, transición `pending→partial→done`, idempotencia, retry). Cubierta por `node --test`. |
| `openspec/changes/{change}/federation-baseline-status.yaml` | Nuevo | Estado agregado per-miembro: `id`, `baseline_status`, `domains_pending`, `domains_done`, `warnings`. Escritura atómica. |
| `agents/sdd-orchestrator.agent.md` | Modificado | Brownfield/federation handler: derivar set brownfield, iterar miembros, gate batch-0 unificada, manejar `partial/success/fail`, política `continue-log-retry`. |
| `agents/sdd-baseline.agent.md` | Modificado | Aceptar parámetros de federación (`federation_member_id`, `target_dir`, `parent_change`); adaptar batch-0 a gate compartida; skip batch-0 si manifest+config presentes. |
| `skills/sdd-baseline/SKILL.md` | Modificado | Documentar invocación federada, parámetros, localización de estado agregado y write-target member-local. |
| `scripts/lib/federation-explore.js` / `workspace-atlas.js` | Modificado (S1) | Etiquetar markers de origen `explore`; suprimir warnings fail-open "no remote" para roster/remote ausentes. |
| `scripts/lib/federation-explore.js` (write path) | Modificado (S3) | Barrera transaccional atómica (temp+rename) para `workspace.yaml` + `workspace-map.md`. |
| `scripts/**/*.test.js` | Nuevo/Modificado | Tests del orquestador lib (state machine, resume, retry, idempotencia) + S1/S3 (markers limpios, barrera atómica). |

## Risks

| Riesgo | Likelihood | Mitigación |
|--------|------------|------------|
| Fallo parcial cross-repo | High | Política `continue-log-retry`: marcar miembro `pending`, warning, continuar resto, retry manual. Estado se actualiza solo tras delegación exitosa. |
| Idempotencia `sdd-baseline` en re-run | High | Si `manifest.md` + `config.yaml` presentes ⇒ omitir batch-0, reanudar batch-N. Test obligatorio (nunca re-batch-0). |
| Sync de estado multi-fichero | Medium | Escrituras atómicas (temp+rename) en `federation-baseline-status.yaml` y configs de miembro; orquestador re-escanea, agnóstico al orden. |
| Peso de la gate unificada con muchos miembros | Medium | Domain-map único agregado; aceptable en v1. Si N crece, evaluar confirmación per-member on-demand (diferido). |
| Crash a mitad del bucle (S3) | Low | Barrera transaccional atómica; estado actualizado post-delegación, nunca antes. |

## Rollback Plan

Cambio high-risk; rollback completo requerido:
1. Revertir el commit (o feature branch `feat/federated-baseline-orchestration`) que introduce `federation-baseline-orchestrator.js`, las ediciones de `sdd-orchestrator`/`sdd-baseline` y los cambios S1/S3.
2. Eliminar el artefacto `federation-baseline-status.yaml` generado (estado de coordinación; no afecta specs de miembros, que son append-only y locales).
3. Las specs baseline ya escritas en `{member}/openspec/specs/` permanecen válidas e independientes (no se revierten salvo solicitud explícita del miembro).
4. Sin el lib, el orquestador vuelve al gate brownfield single-repo de C1 — sin pérdida de capacidad heredada.

## Dependencies

- **C1 `federation-distributed-markers`** (archivado 2026-06-18): markers canónicos, `workspace-explore/classify`, derivados `brownfield`/`initDone`, `target_dir` en `sdd-init`.

## Success Criteria

- [ ] El orquestador itera secuencialmente los miembros `brownfield ∧ ¬initDone` y reanuda exactamente tras una interrupción usando `federation-baseline-status.yaml`.
- [ ] Una única gate batch-0 unificada aprueba el domain-map de todos los miembros brownfield.
- [ ] El `sdd-baseline` delegado escribe specs en `{member}/openspec/specs/`; el coordinador nunca escribe en miembros.
- [ ] Un fallo de miembro marca `pending`, registra warning y NO bloquea al resto (`continue-log-retry`); el retry manual reanuda sin re-batch-0.
- [ ] S1: markers de origen `explore` no disparan warnings fail-open "no remote".
- [ ] S3: escritura de `workspace.yaml` + `workspace-map.md` es atómica/crash-safe.
- [ ] `scripts/lib/federation-baseline-orchestrator.js` con cobertura `node --test` (state machine, resume, retry, idempotencia).
