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
