# Exploración: Federation Distributed Markers (v1 → Objetivo)

## Resumen Ejecutivo

La arquitectura actual persiste el atlas de federación (`openspec/workspace.yaml`) de forma **centralizada y canónica** en el coordinador, con miembros read-only. La arquitectura objetivo **invierte completamente este contrato**: la FUENTE DE VERDAD pasa a ser un **marcador canónico distribuido** (`openspec/federation.member.yaml`) versionado en **cada miembro**, mientras que el atlas pasa a ser una **caché derivada gitignored**. Esta exploración mapea el delta de implementación, identifica dónde el código actual asume el atlas como canónico, y cataloga los riesgos de invertir ese contrato sobre código con cobertura de tests.

---

## 1. Estado Actual (Arquitectura v1)

### 1.1 Flujo de Federación Actual

| Componente | Responsabilidad | Ubicación | Versionado |
|---|---|---|---|
| **Atlas (workspace.yaml)** | Declaración canónica de miembros y contratos | `openspec/workspace.yaml` (coordinador) | ✅ Sí (git) |
| **Artifact-store backend** | Resuelve layout federated, agrega cambios | `scripts/lib/artifact-store.js` | - |
| **Workspace-atlas parser** | Lee/parsea atlas limitado (subset YAML) | `scripts/lib/workspace-atlas.js` | - |
| **sdd-workspace skill** | Init (propone miembros), status (agrega), impact (afecta) | `skills/sdd-workspace/SKILL.md` | - |
| **sdd-init skill** | Inicializa SDD; NO detecta multirepo hoy | `skills/sdd-init/SKILL.md` | - |
| **Routing (federated route)** | Activa `sdd-workspace` en primer lugar si backend=federated | `openspec/config.yaml`, `route-dispatcher.js` | - |

### 1.2 Código Crítico — Dónde Vive la Centralización

#### `scripts/lib/workspace-atlas.js`
**Qué hace hoy:**
- Parser manual (sin deps npm) para subset YAML muy limitado
- Soporta: scalars top-level, `members[]`, `contracts[]` con inline `consumers: [a, b]`
- Ignora nesting más profundo que 1 nivel
- Exporta: `parseAtlas(content)`, `resolveMembers(workspace, atlas)`, `computeImpact(atlas, memberId)`

**Asumible CRÍTICO:**
- Asume que el atlas es **una sola fuente canónica** (LÍNEA 9: "constrained workspace.yaml subset")
- No tiene noción de "regeneración desde marcadores distribuidos"
- Tests (16 casos) validan lectura/parsing del atlas como si fuera inalienable

#### `scripts/lib/artifact-store.js` (Mode: workspace-federated)
**Qué hace hoy:**
- `createWorkspaceFederatedStore(workspace)` (línea 132)
- Lee atlas desde `path.join(workspace, "openspec", "workspace.yaml")` **directamente** (línea 134)
- `isInitialized()` (línea 151): chequea si atlas tiene `members.length > 0`
- `findActiveChanges()` (línea 178): escanea coordinador + TODOS los miembros resolubles, agrega warnings
- **Nunca escribe en miembros** (read-only)

**Asumible CRÍTICO:**
- Línea 134: `atlasPath = path.join(workspace, "openspec", "workspace.yaml")` está hardcoded
- Asume que el atlas es el punto de entrada único para descubrir miembros
- No hay integración con marcadores distribuidos

#### `skills/sdd-workspace/SKILL.md`
**Qué hace hoy (read-and-link v1):**
- `init`: escanea hermanos DIRECTOS (profundidad 1), propone lista de miembros, escribe `openspec/workspace.yaml` (VERSIONADO)
- `status`: agrega cambios de todos los miembros reachables
- `impact`: camina el grafo de contratos (provider → consumers)
- **Nunca escribe nada en miembros**

**Asumible CRÍTICO:**
- "Hard Rules" línea 29-31: "Read-only to members: NEVER create or modify any file inside a member repo"
- "Confirm before writing the atlas" (línea 33): el atlas es el destino principal de escritura
- No existe detección de `.git` en hermanos; solo busca `openspec/` (línea 56)

#### `skills/sdd-init/SKILL.md`
**Qué hace hoy (AUSENCIA TOTAL):**
- NO detecta multi-repo (sin búsqueda de `.git`)
- NO pregunta "¿deseas federado o single-repo?"
- NO tiene parámetro `target_dir` para operar en directorio diferente del cwd
- Workflow actual: single-repo per proyecto, o multi-repo delegado a `sdd-workspace`

**Asumible CRÍTICO:**
- Línea 48: "Inspect project files" — asume lectura de cwd
- Línea 25-26: "Hard Rules" no mencionan multi-repo
- Si había multi-repo, el usuario debe invocar `/sdd-workspace init` PRIMERO, luego SDD normal

### 1.3 Routing y Persistence Contract

**Routing (federated route):**
```yaml
- name: federated
  conditions: artifact_store.backend: workspace-federated
  phases: [sdd-workspace, sdd-propose, sdd-spec, ...]
  gates: [impact, clarify]
```
- Solo se activa si ALGUIEN ya escribió `artifact_store.backend: workspace-federated` en `openspec/config.yaml`
- Es un workflow de OPT-IN: requiere que el usuario ejecute `/sdd-workspace init` primero

**Persistence Contract (`skills/_shared/persistence-contract.md`):**
- "v1 boundary (read-and-link)" (línea 49): el harness agrega cambios pero **NUNCA escribe en miembros**
- "El coordinador change folder holds cross-cutting proposal/design plus federation.yaml linking" (línea 37)
- "Slices are authored inside each member with the normal single-repo workflow" (línea 52)
- **v1 NO permite escritura de artefactos SDD en miembros**

---

## 2. Arquitectura Objetivo (11 Decisiones)

### 2.1 Inversion del Contrato de Canónico

| Aspecto | v1 (Actual) | Objetivo |
|---|---|---|
| **FUENTE DE VERDAD** | `openspec/workspace.yaml` (coordinador, versionado) | `openspec/federation.member.yaml` (cada miembro, versionado) |
| **Atlas workspace.yaml** | Canónico | Caché derivada (gitignored, regenerable) |
| **Descubrimiento de miembros** | Lectura del atlas centralizado | Roster → clonar → leer marcadores |
| **Persistencia en miembros** | Read-only total | Solo marcador, al `enroll`, owned por orquestador |
| **Reconciliación** | N/A | Merge por `updated_at` (latest-wins) + fail-open |

### 2.2 Las 11 Decisiones Clave

1. **Unidad federada = repo git directo**: detectado por `.git` (directorio o submódulo) en hermanos inmediatos, no nested
2. **sdd-init es el puente**: detecta "contenedor de repos" (raíz sin `.git` + ≥2 hijos con `.git`) → **bloquea preguntando federado-vs-normal**
3. **Init por miembro**: orquestador delega `sdd-init` a CADA miembro con nuevo parámetro `target_dir`
4. **Marcador distribuido = FUENTE DE VERDAD**: `openspec/federation.member.yaml` en cada repo, versionado
5. **Atlas = caché derivada**: gitignored, regenerado desde marcadores
6. **Estructura del marcador**: `federation`, `member{id, role, remote, provides[contracts]}`, `roster[{id, remote}]`, `updated_at`
7. **Reconstrucción**: clonado → roster → clonar rest; reconciliación latest-wins por `updated_at` + fail-open
8. **Escritura en miembros**: SOLO marcador, SOLO al `enroll`, owned orquestador (relajación controlada)
9. **Status es derivado**: teniendo `openspec/config.yaml` → initialized; marcador sin init → pending
10. **Bootstrap resumable**: lote done/pending, sin orden topológico
11. **Scope v1 = read-and-link + derivado**: discovery + atlas derivado + status + impact; cambios cross-cutting → v2

### 2.3 Marcador Distribuido Schema (Hipotético)

```yaml
schema: federation-member
version: 1
federation:
  id: workspace-id
  created_at: 2026-06-17T00:00:00Z

member:
  id: api                          # nombre del miembro en la federación
  role: backend                    # rol (backend, frontend, infra, etc.)
  remote: git@github.com:org/api   # URL cloneable del propio repo
  provides:
    - id: api-public-v1
      consumers: [web, mobile]
      surface: openapi             # dónde está documentado

roster:                            # otros miembros conocidos
  - id: web
    remote: git@github.com:org/web
  - id: mobile
    remote: git@github.com:org/mobile

updated_at: 2026-06-17T10:30:00Z   # para reconciliación y detección de cambios
```

---

## 3. Análisis de Delta — Código que Cambia

### 3.1 workspace-atlas.js — Refactoring Crítico

**Hoy:**
- Lee y parsea `workspace.yaml` como la ÚNICA fuente
- `parseAtlas()` asume archivo centralizado

**Objetivo:**
- Debe **REGENERARSE** desde marcadores distribuidos
- Lógica nueva: `loadMarkerFromMember(memberPath)` → parsea marcador
- Lógica nueva: `mergeMarkersIntoAtlas(markers[])` → lógica latest-wins
- `parseAtlas()` sigue siendo útil como **caché deserialization**, no source of truth

**Riesgo:**
- **Tests actuales rompen** (16 casos asumen lectura de atlas centralizado)
- Necesitaría refactor: "given markers in members, reconstruct atlas" tests
- Inversión del modelo: el parser era reader único, ahora es consumer de derivativo

### 3.2 artifact-store.js — Cambio de Backend Logic

**Hoy (línea 134):**
```javascript
const atlasPath = path.join(workspace, "openspec", "workspace.yaml");
async function loadAtlas() { /* read from atlasPath */ }
```

**Objetivo:**
- `loadAtlas()` → busca marcadores en miembros, no en workspace.yaml
- Si miembros tienen marcador → regenera atlas
- Si miembros no tienen marcador (bootstrap incompleto) → retorna atlas parcial + warnings
- **Pero aún escribe atlas a `workspace.yaml`** (caché) para velocidad en subsecuentes

**Riesgo:**
- La cascada de lecturas se vuelve más lenta: markers → reconstructed atlas
- Necesitaría caching/invalidation: ¿cuándo regenerar?
- Tests actuales (8 casos federated) asumen lectura de atlas versionado

### 3.3 sdd-init.js — NUEVA Capacidad: Detección Multirepo

**Hoy:**
- No detecta `.git` en hermanos
- No pregunta "federado-vs-normal"
- No tiene `target_dir`

**Objetivo:**
- **Detección**: busca `.git` en hermanos inmediatos
- **Decision gate**: si ≥2 hermanos con `.git` → bloquea preguntando federado-vs-normal
- **target_dir capability**: acepta parámetro para operar en directorio != cwd
- **Member init flow**: si federado, el orquestador relanza init por CADA miembro con `target_dir`

**Riesgo:**
- Es un CAMBIO de flujo completamente nuevo
- Rompe suposición "init siempre es en cwd"
- Parámetro `target_dir` es **NEW en la API de agentes**. ¿Cómo se propaga?
- Ordenamiento: ¿bootstrap de miembros es en orden topológico o ad-hoc?

### 3.4 sdd-workspace.js — NUEVA Capacidad: Enroll (Escritura en Miembros)

**Hoy:**
- Skill read-only; nunca escribe en miembros

**Objetivo:**
- **enroll**: nueva operación que escribe `openspec/federation.member.yaml` en un miembro
- Escrito solo por orquestador, al final del init del miembro
- Contiene: member metadata, roster, updated_at
- Recuperable si falla mid-init

**Riesgo:**
- Invierte "read-only" hard rule (línea 29 de skill actual)
- Cuándo se escribe: ¿al final de init del miembro? ¿sincronizado con el coordinador?
- ¿Qué pasa si member-1 se escribe pero member-2 falla? ¿Rollback?

### 3.5 Routing — NO Cambia (por ahora)

- La ruta `federated` sigue existiendo
- La pregunta de "federado-vs-normal" sale de `sdd-init`, no del routing
- Pero el flujo es distinto: init por miembro en lugar de escaneado centralizado

### 3.6 Specs Afectadas

**openspec/specs/agents/spec.md** (sección 1.2):
- `sdd-init` ahora tiene capacidad `target_dir`
- Necesita documentación sobre flujo multirepo

**openspec/specs/skills/spec.md** (si existe):
- `sdd-init` tiene nueva decision gate (federado-vs-normal)
- `sdd-workspace` tiene nueva operación (enroll)

---

## 4. Análisis de Riesgos

### 4.1 Riesgos Altos (Potential show-stoppers)

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Inversión de contrato con tests existentes** | Tests de `workspace-atlas.js` (16) y `artifact-store.js` (8) asumen atlas centralizado. Refactor complejo. | Escribir tests de regeneración primero (TDD). Bifurcar atlas-reader y atlas-writer. |
| **`target_dir` es NEW en API de agentes** | No existe mecanismo para pasar target_dir al agente. Requiere cambio en `sdd-orchestrator` y agente API. | Diseñar cómo se propaga target_dir: ¿en prompt? ¿env var? ¿artifact-store? |
| **Race conditions en marcador distribuido** | Si dos miembros escriben `updated_at` simultáneamente, ¿merge determinístico? | Definir timestamp resolution (seconds vs ms), fail-open policy, eventual consistency. |
| **Bootstrap parcial no recoverable** | Si init en member-1 escribe marcador pero member-2 falla, ¿estado inconsistente? | Lote resumable (decision 10) + marcar member-2 como "pending" en coordinador. |
| **Gitignore del atlas cambia visibility** | Cambio histórico: atlas era versionado, ahora gitignored. ¿Cómo migrar repos existentes? | Add `.gitignore` rule durante init. Documentar migración. |

### 4.2 Riesgos Medios

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Lentitud de regeneración** | Cada lectura de changes federated requiere leer N marcadores. Caché es crítica. | Implementar `invalidation_hash` en workspace.yaml. Solo regenerar si markers más recientes. |
| **Detección de `.git` en hermanos** | ¿Es suficiente buscar `.git`? ¿Y submódulos? ¿Profundidad 1 es suficiente? | Spec con decisión explícita: profundidad 1, `.git` directorio O archivo (submódulo). Tests. |
| **Roster stale** | Si alguien borra un miembro, ¿todos los roster quedan obsoletos? | Reconciliación: roster de cada miembro es fuente local. En merge, fail-open si remote muere. |
| **Falta de integración en docs** | Documentación actual asume read-and-link, no enroll. | Actualizar `docs/sdd-routing.md`, `persistence-contract.md`, specs. |

### 4.3 Riesgos Bajos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Compatibilidad backward con v0** | Repos viejos tienen workspace.yaml versionado. ¿Seguirá siendo válida? | Marcar workspace.yaml como deprecated en docs. Soporte legacy por 1-2 releases. |
| **Error handling en fail-open** | Qué hace el usuario si marker en member-3 es corrupto/viejo? | Warnings en status. Sugerir `sdd-workspace status` para diagnosticar. |

---

## 5. Gaps en el Código Actual Que Requieren Investigación

1. **¿Dónde vive la lógica de regeneración?**
   - ¿En `workspace-atlas.js` con nuevas funciones?
   - ¿En `artifact-store.js` como parte de `loadAtlas()`?
   - ¿Nueva skill `sdd-federation-rebuild`?

2. **¿Cómo se propaga `target_dir` a los agentes?**
   - ¿Variable de entorno?
   - ¿Parte del prompt del agente?
   - ¿Nueva API en `artifact-store.createArtifactStore()`?

3. **¿Cuál es el contract de `updated_at` para merge?**
   - ¿Segundos o milisegundos?
   - ¿UTC o local?
   - ¿Qué pasa si dos markers tienen el MISMO `updated_at`?

4. **¿Cómo se bootstrapea el roster inicial?**
   - ¿El coordinador lo propone?
   - ¿Cada miembro lo averigua dinámicamente?
   - ¿O sdd-workspace lo provee en primer lugar?

5. **¿El marcador va a `openspec/` o a la raíz del repo?**
   - Si va a `openspec/`, ¿qué pasa con repos sin `openspec/` aún?
   - Si va a raíz, choca con `federation.yaml` (cross-cutting link)

6. **¿Cómo maneja artifact-store las migraciones?**
   - ¿Detecta atlas antiguo + no markers, automigra a gitignore?
   - ¿O requiere manual init de cada miembro?

---

## 6. Piezas de Código Críticas (Resumen)

| Archivo | Líneas clave | Acción requerida |
|---|---|---|
| `scripts/lib/workspace-atlas.js` | parseAtlas (122), resolveMembers (152), computeImpact (173) | Refactor: agregar loadMarkerFromMember, mergeMarkersIntoAtlas |
| `scripts/lib/artifact-store.js` | 134 (atlasPath hardcoded), 136-146 (loadAtlas), 178-214 (findActiveChanges) | Refactor: loadAtlas() lee markers distribuidos, fallback a workspace.yaml caché |
| `scripts/lib/artifact-store.test.js` | Tests workspace-federated (líneas 153-287) | Reescribir: dado markers en miembros, atlas regenerado correctamente |
| `scripts/lib/workspace-atlas.test.js` | 16 test cases | Refactor: agregar test de regeneración desde markers |
| `skills/sdd-init/SKILL.md` | Líneas 46-56 (execution steps) | Agregar: detección multirepo, decision gate, target_dir capability |
| `skills/sdd-workspace/SKILL.md` | Líneas 29-31 (hard rules), 43-68 (init steps) | Agregar: operación enroll, escribir marker en miembros |
| `agents/sdd-init.agent.md` | Ejecución y tools | Agregar: parámetro target_dir al frontmatter |
| `openspec/config.yaml::routing` | federated route | Documentar nuevo flujo: init por miembro precede a propuesta |

---

## 7. Impacto en la Entrega (Single-PR Constraint)

### 7.1 Size Forecast

**Cambios estimados:**
- `workspace-atlas.js`: +200 líneas (regeneración, merge)
- `workspace-atlas.test.js`: +150 líneas (nuevos tests)
- `artifact-store.js`: +150 líneas (loadAtlas refactor)
- `artifact-store.test.js`: +100 líneas (nuevos tests federated)
- `sdd-init/SKILL.md`: +80 líneas (multirepo detection)
- `sdd-workspace/SKILL.md`: +100 líneas (enroll operation)
- `sdd-init.agent.md`: +20 líneas (target_dir param)
- `docs/sdd-routing.md`: +50 líneas (federation updated flow)
- `persistence-contract.md`: +30 líneas (markers + atlas caché)
- **Total estimado: 880 líneas de cambio neto**
- **Tests impactados: 24 casos existentes a refactor + 20 nuevos**

### 7.2 Recomendación de Troceo

Dado que la entrega es **single-PR** y el cambio es **high-risk**, se recomienda:

**Batch 1 (sdd-apply — Fase 1: Infra de markers + regeneración)**
- Nueva función `loadMarkerFromMember()` en `workspace-atlas.js`
- Nueva función `mergeMarkersIntoAtlas()` en `workspace-atlas.js`
- Refactor de `loadAtlas()` en `artifact-store.js` para leer markers como fallback
- Gitignore nueva entrada
- Tests de regeneración
- **Risk: MEDIUM** (toca código con cobertura, pero segregado)
- **Lines: ~350**

**Batch 2 (sdd-apply — Fase 2: sdd-init multirepo)**
- Detección de `.git` en hermanos en `sdd-init`
- Decision gate (federado-vs-normal) + question_gate
- Parámetro `target_dir` en agente
- Tests de detección
- **Risk: HIGH** (cambio de flujo radical, NEW en API)
- **Lines: ~200**

**Batch 3 (sdd-apply — Fase 3: sdd-workspace enroll)**
- Nueva operación `enroll` en skill
- Escritura de marker en miembros
- Tests de enroll
- **Risk: HIGH** (invierte read-only hard rule)
- **Lines: ~150**

**Batch 4 (sdd-apply — Fase 4: Docs + Migration)**
- Actualizar `docs/sdd-routing.md`
- Actualizar `persistence-contract.md`
- Specs updates
- Migration guide
- **Risk: LOW**
- **Lines: ~180**

**Total effort: 4 batches, ~880 líneas, 24 tests refactored, 20 tests nuevos**
**Recommendation: size:exception + `Chained PRs` siguiendo work units above**

---

## 8. Tests Que Rompen y Necesitan Refactor

### workspace-atlas.test.js (16 casos)
- ✅ `parseAtlas`: Sigue siendo válido (caché deserialization)
- ❌ `resolveMembers`: Asume miembros del atlas, no de markers
- ❌ `computeImpact`: Asume contracts del atlas centralizado
- **Refactor needed**: Agregar tests "given markers in members, atlas regenerated"

### artifact-store.test.js (8 casos federated)
- ❌ `workspace-federated: isInitialized reflects atlas presence` — atlas no es la fuente
- ❌ `workspace-federated: unions coordinator and member changes` — assumes atlas read
- ❌ `workspace-federated: orders aggregated changes` — assumes atlas read
- ❌ `workspace-federated: skips unreachable member` — depends on atlas resolution
- **Refactor needed**: Reescribir para usar markers en lugar de atlas

---

## Conclusión

El cambio a **federación con marcadores distribuidos** es **arquitectónicamente limpio** pero **implementativamente de alto riesgo** porque invierte el contrato de dos componentes críticos (`workspace-atlas.js`, `artifact-store.js`) que tienen cobertura de tests. La inversión es necesaria para alcanzar el objetivo de "fuente de verdad distribuida", pero requiere:

1. **Refactor cuidadoso** de lectura de atlas → regeneración desde markers
2. **NEW en API de agentes** (`target_dir`) que requiere coordinación orquestador-init
3. **Inversión de hard rule** (read-only → enroll) que cambia el contrato de persistencia
4. **Tests comprehensivos** de regeneración, merge, y casos edge (markers stale, borrados, etc.)
5. **Documentación completa** del nuevo flujo y migration path

**Recomendación de entrega: Chained PRs por work unit** (4 batches como arriba) con tamaño individual <400 líneas, testeo exhaustivo en cada batch, y una propuesta que explique bien el delta.

