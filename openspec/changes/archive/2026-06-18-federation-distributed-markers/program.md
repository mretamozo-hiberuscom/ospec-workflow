# Programa: Federación multirepo v1 (onboarding/foundation federado)

> Documento ancla de un **programa de 5 cambios encadenados**. Define la visión, las
> decisiones arquitectónicas cerradas con el usuario, y el desglose en cambios trazables.
> Cada cambio se planifica y aplica en orden de dependencia; este documento NO sustituye
> las propuestas/specs/diseños individuales.

## Contexto

El harness construye TOOLING. Lo descrito aquí es cómo la **ruta federada** del harness
debe orquestar el onboarding de un workspace multirepo del usuario final (microservicios,
microfrontales, nugets). No se inicializa nada en este repo más allá de las capacidades.

Detonante: `sdd-init` no detecta multirepo y nunca puentea hacia `sdd-workspace`; la ruta
`federated` solo se activa si `artifact_store.backend: workspace-federated` ya está puesto,
y nada lo pone automáticamente. Además el atlas centralizado actual no encaja con un modelo
de trazabilidad distribuida.

## Pipeline objetivo de la ruta federada

1. **workspace-explore** — mapear el proyecto: detectar `.git` por carpeta (¿repo?),
   clasificar cada repo por **tipo** (microservicio / microfrontal / nuget), **capa**
   (dominio / common), **estado** (brownfield / greenfield) y si tiene **sdd-init hecho**.
   Artefactos: marcadores (clasificación canónica), atlas-caché, y un markdown legible del mapa.
2. **baseline por repo** — `sdd-baseline` en cada repo brownfield con init hecho (resumable).
   Greenfield → marcado y omitido de momento.
3. **foundation general** — dos caminos: (a) preguntas al usuario, o (b) el usuario deja
   documentación en `docs/references/raw/` y avisa → markitdown la convierte a
   `docs/references/processed/` → con esos markdown + las baselines per-repo se sintetizan
   `docs/architecture`, `docs/product`, etc.
4. **baseline general** — exploración cross-repo: qué base comparten varios repos.
5. **roadmap + gaps** — `docs/roadmap` + artefacto de gaps resuelto por Q&A (funcional/técnico).

## Decisiones arquitectónicas cerradas

- **D1 — Unidad de federación = repo git.** Detección por `.git` en hijos inmediatos
  (directorio O fichero/submódulo); `.gitmodules` autoritativo; manifiesto secundario para
  detectar stack. Profundidad 1.
- **D2 — `sdd-init` = puente.** Detecta "contenedor de repos" (raíz sin `.git` propio + ≥2
  hijos con `.git`) → `status: blocked` + `question_gate` (federado-vs-normal). No decide solo.
- **D3 — Init de miembros lo conduce el ORQUESTADOR** delegando `sdd-init` por miembro
  (workspace read-only a miembros). Requiere capacidad NUEVA `target_dir` en `sdd-init`.
- **D4 — Fuente de verdad = marcadores distribuidos canónicos** (`openspec/federation.member.yaml`
  versionado por repo). El atlas `workspace.yaml` pasa a **caché derivada, gitignored,
  regenerable**. Esto INVIERTE el contrato actual (atlas canónico).
- **D5 — Esquema del marcador:** `federation`, `member{id, role, type, layer, remote,
  provides[contratos]}`, `roster[{id, remote}]`, `updated_at`. `type` ∈ {microservicio,
  microfrontal, nuget}; `layer` ∈ {dominio, common}.
- **D6 — Reconstrucción:** desde un repo clonado → roster → clonar el resto. Merge = unión +
  latest-wins por `updated_at` + fail-open warnings.
- **D7 — Escritura en miembros:** SOLO el marcador, SOLO al `enroll`, owned por el orquestador
  (relajación CONTROLADA del read-only).
- **D8 — Estado derivado:** `initialized` si tiene `openspec/config.yaml`; `pending` si tiene
  marcador sin init; brownfield/greenfield derivado al escanear.
- **D9 — Bootstrap = lote resumable** (done/pending), sin orden topológico.
- **D10 — Scope v1 de CAMBIOS = read-and-link.** La autoría de cambios cross-cutting que
  tocan varios repos queda FUERA (v2).
- **D11 — Modelo híbrido de hogar de artefactos.** Discovery/membresía → marcadores
  distribuidos. Conocimiento sintetizado cross-repo (docs/architecture, docs/product,
  references/processed, roadmap, gaps, baseline general) → **REPO COORDINADOR DEDICADO**
  versionado. No es reconstruible desde marcadores.

## Dependencias externas y gates

- **MCP markitdown** para `raw → processed`. Requiere fallback si no está disponible.
- **Gate humano** "avísame cuando copies las docs": modelado como espera explícita (`blocked`),
  no polling.

## Desglose en cambios (orden de dependencia)

| Cambio | Capa / fase | Depende de |
|---|---|---|
| **C1 — `federation-distributed-markers`** (este, reducido) | Mecanismo: `.git` discovery, esquema de marcador (con `type`/`layer`), atlas-como-caché, `enroll`, `target_dir` en init, + fase **workspace-explore/classify** | — |
| C2 — `federated-baseline-orchestration` | Orquestador delega `sdd-baseline` por repo brownfield (resumable) | C1 |
| C3 — `federated-foundation` | Foundation general: ask-or-docs + markitdown + síntesis de docs + repo coordinador | C1, C2 |
| C4 — `federated-general-baseline` | Detección de base compartida cross-repo | C2 |
| C5 — `federated-roadmap-gaps` | Roadmap + artefacto de gaps con Q&A | C3, C4 |

Solo C1 se planifica en detalle ahora. C2–C5 quedan registrados para trazabilidad y se
planifican al llegar a ellos (evitar diseñar sobre supuestos de fases previas).

## Fuera de alcance (explícito)

- Autoría de cambios cross-cutting multi-repo (v2).
- Greenfield: bootstrap más allá de marcarlos (se aborda cuando exista demanda real).
- Renombrado de variables por target (heredado de otros follow-ups del harness).

## Hallazgos no bloqueantes heredados de C1 (registro de follow-up)

> Registrado por `sdd-archive` el 2026-06-18 al cerrar C1 (`federation-distributed-markers`).
> El veredicto final de `sdd-verify` fue **PASS WITH WARNINGS** (362/362 tests, `stale: false`).
> Todos los hallazgos CRITICAL/bloqueantes se cerraron en WU6 (`risk-critical-001`) y WU7
> (`resilience-warning-001` / `reliability-warning-002` / `risk-warning-symlink-001`). Los
> ítems de abajo son advisories ABIERTOS — NO regresiones — que NO deben perderse.

Se propone un cambio dedicado de endurecimiento **C6 — `federation-c1-hardening`** (no
bloqueante, planificable en paralelo a C2–C5) que agrupe estos follow-ups:

| Id | Tipo | Resumen | Destino sugerido |
|---|---|---|---|
| W1 | spec-gap | Inconsistencia de redacción entre `workspace-explore` › *Member Classification* ("las 4 dimensiones se registran en el marcador vía `enroll`") y `federation-markers` › *Derived Member State* (brownfield/init-done NO se almacenan en el marcador). La implementación es coherente con el spec autoritativo (`federation-markers`); reconciliar la prosa. | C6 (reconciliación de spec) |
| W2 | design-gap | `isCorruptCache` es heurístico: marca como corrupta toda caché no vacía que parsea a 0 members y 0 contracts → un workspace federado legítimamente vacío dispararía una regeneración innecesaria (idempotente, bajo impacto). | C6 |
| W3 / `reliability-warning-001` | code-bug / known-flake | Test de integración `git` (`artifact-store.test.js > warns but keeps loading when workspace.yaml is git-tracked`) intermitentemente flaky (sin seam de DI sobre `spawnSync`). NO reprodujo en verify (362/362 + 17/17 aislado). De-flake o seam sobre `spawnSync`. | C6 |
| W4 | design-gap (inherente) | Escenarios de procedimiento de agente para `sdd-init` (`target_dir`, ENOENT→blocked, gate de contenedor) sólo verificados por `static-proof` content-contract, no por ejecución runtime del agente. Limitación inherente a entregables markdown-agente. Aceptado. | C6 (o aceptación permanente) |
| S1 | suggestion | Marcadores escritos por explore omiten `roster` y `member.remote` → `loadMarkerFromMember` emite warning fail-open "no remote" por cada miembro. Inofensivo pero ruidoso; suprimir/etiquetar marcadores origen-explore. | C6 |
| S2 | suggestion | `federation-explore.js` es un módulo lib nuevo no enumerado en la tabla *File Changes* del diseño (el diseño realizaba explore como subcomando `SKILL.md`). Actualizar el diseño retroactivamente para trazabilidad. | C6 |
| S3 | suggestion | `explore` escribe `workspace.yaml` + `workspace-map.md` sin barrera transaccional; un crash a mitad de run puede dejar una caché parcialmente regenerada (auto-sanada en el siguiente run; bajo impacto). | C6 |
| S4–S6 / readability ×2 | suggestion / readability | SUGGESTIONs 4R restantes + dos advisories de `review-readability` (densidad de nombres/comentarios en los módulos lib nuevos). Cosméticos, no afectan comportamiento ni tests. | C6 |

Trazabilidad de origen: ver `openspec/changes/archive/2026-06-18-federation-distributed-markers/verify-report.md`
(secciones *Issues Found* y *Verdict*) y `state.yaml` › `gates.4r-review-gate.findings`.

