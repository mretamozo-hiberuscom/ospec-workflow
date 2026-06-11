# Model Routing

Los agentes incluidos deben evitar nombres de modelos locales codificados de forma rígida.

Política recomendada:

- predeterminado: heredar el modelo seleccionado;
- verificación/diseño: permitir un modelo más potente mediante el perfil local;
- implementación: modelo de programación;
- exploración/propuesta: se acepta un modelo más económico;
- todas las fases: deben poder degradarse al modo de modelo único.

## Abstracción por tiers (`models.yaml`)

El generador multi-target (`scripts/configure/cli.js`) no fija IDs de modelo en cada
agente. En su lugar usa dos tablas en `models.yaml`, ambas editables a mano:

1. `agents`: a qué **tier** pertenece cada agente (la única decisión por agente).
2. `tiers`: cómo se traduce cada tier a un **modelo concreto por target**.

Un agente sin entrada explícita cae en el tier de `_default`. Cualquier hueco
(config ausente, tier o target faltante, o `inherit`) resuelve a OMIT: el generador
no escribe la clave `model:` y el host usa el modelo de la sesión.

### Tabla `agents` → tier

| Tier | Agentes | Motivo |
| --- | --- | --- |
| `premium` | `sdd-design`, `sdd-verify`, `sdd-propose`, `sdd-orchestrator` | Decisiones arquitectónicas y de validación. |
| `default` | `sdd-apply`, `sdd-spec`, `sdd-tasks`, `sdd-init`, `sdd-foundation`, `sdd-onboard`, `sdd-workspace`, `sdd-baseline`, y cualquier agente no listado (`_default`) | Implementación y escritura estructurada. |
| `cheap` | `sdd-explore`, `sdd-archive` | Lectura estructural y cierre mecánico. |

### Tabla `tiers` → modelo por target

| Tier | `claude` (alias) | `vscode` (orden de fallback) |
| --- | --- | --- |
| `premium` | `opus` | `Claude Opus 4.8 (copilot)`, `GPT-5.5 (copilot)` |
| `default` | `sonnet` | `Claude Sonnet 4.6 (copilot)`, `GPT-5.3-Codex (copilot)` |
| `cheap` | `haiku` | `Qwen 3.6 MSC1 (customendpoint)`, `GPT-5.4-mini (copilot)` |

El target `github-copilot` no inyecta `model:` (el origen lo omite y no hay columna `github-copilot`
en `tiers`): los agentes generados heredan el modelo de la sesión de Copilot.

## Formato del modelo por target

Cada target expresa el modelo de forma distinta; el resolver
(`scripts/lib/model-resolver.js`) devuelve la forma adecuada y la transform la
serializa en el frontmatter:

- **`claude`**: un **alias** (`opus` | `sonnet` | `haiku`) como escalar. Los alias
  siguen automáticamente el modelo más reciente, así que no hay IDs que mantener.
- **`vscode`**: una lista `"Nombre (vendor)"` que actúa como **orden de preferencia**;
  VS Code usa el primero disponible. Admite vendors como `copilot` y `customendpoint`.
- **`github-copilot`**: no se escribe `model:` (OMIT); el agente hereda el modelo de la sesión de
  Copilot, evitando la sintaxis de modelo aún poco especificada de GitHub.

## Perfiles locales heredados

Para el uso directo en VS Code (sin generar) siguen disponibles los perfiles
opcionales en `profiles/models/`:

- `default`: fallback de un solo modelo;
- `cheap`: reduce coste en exploración y propuesta;
- `premium`: aumenta razonamiento en diseño y verificación.

`models.yaml` es la fuente para el generador; `profiles/models/` es la configuración
para el consumo directo del repositorio en VS Code.
