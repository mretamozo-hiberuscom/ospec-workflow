# ospec-workflow

Plugin de agentes para VS Code que aplica Spec-Driven Development (SDD) con OpenSpec, Strict TDD, agentes especializados y cambios revisables. Está basado en [Gentle-ai de Gentleman Programming](https://github.com/Gentleman-Programming/gentle-ai).

La versión actual es **2.1.0**. El usuario trabaja con `sdd-orchestrator`; el orquestador coordina, los agentes de fase ejecutan y OpenSpec conserva el estado versionable.

## Inicio rápido

1. Instala el repositorio como VS Code Agent Plugin.
2. Revisa el manifiesto, los hooks y los servidores MCP antes de habilitarlo.
3. Inicia un cambio con `/sdd-new`.
4. Continúa el flujo con `/sdd-continue` o ejecútalo por fases.
5. Verifica con `/sdd-verify` y archiva con `/sdd-archive`.

Consulta la [guía de instalación](docs/plugin-installation.md) para instalación remota, desarrollo local y requisitos de confianza.

## Qué incluye

| Ruta | Propósito |
| --- | --- |
| `.plugin/plugin.json` | Manifiesto principal del plugin. |
| `agents/` | Orquestador y agentes especializados por fase. |
| `commands/` | Comandos visibles y routing hacia el orquestador. |
| `skills/` | Capacidades bajo demanda y contratos compartidos. |
| `rules/` | Reglas persistentes de SDD, OpenSpec y Strict TDD. |
| `hooks/` | Declaración de eventos del ciclo de vida del plugin. |
| `scripts/` | Implementación y tests del runtime de hooks. |
| `profiles/models/` | Perfiles opcionales de routing de modelos. |
| `docs/` | Documentación detallada de arquitectura y uso. |
| `.mcp.json` | Configuración MCP mínima del plugin. |
| `openspec/` | Fuente de verdad versionable de cada cambio SDD. |

## Comandos SDD

| Comando | Uso |
| --- | --- |
| `/sdd-init` | Detecta el proyecto y prepara OpenSpec, testing y registro de skills. |
| `/sdd-baseline` | Seed openspec/specs/ with baseline specs of existing behavior (brownfield repos, resumable batches). |
| `/sdd-workspace` | Gestiona la federación multi-repo: atlas (`init`), estado cross-repo (`status`), impacto por contratos (`impact`). |
| `/sdd-new` | Inicia un cambio persistido y selecciona el workflow. |
| `/sdd-lite` | Ejecuta el flujo reducido para cambios pequeños y de bajo riesgo. |
| `/sdd-ff` | Completa la planificación: propuesta, specs, diseño y tareas. |
| `/sdd-continue` | Reanuda la siguiente fase disponible desde OpenSpec. |
| `/sdd-explore` | Investiga una idea sin implementar. |
| `/sdd-propose` | Define intención, alcance, riesgos y enfoque del cambio. |
| `/sdd-spec` | Escribe requisitos y escenarios verificables. |
| `/sdd-design` | Define arquitectura, flujo de datos y estrategia de testing. |
| `/sdd-tasks` | Divide el cambio en unidades implementables y revisables. |
| `/sdd-apply` | Implementa tareas en tandas revisables. |
| `/sdd-verify` | Comprueba specs, diseño, tareas y evidencia de tests. |
| `/sdd-archive` | Consolida y archiva un cambio verificado. |
| `/sdd-onboard` | Guía un ciclo SDD real sobre el repositorio actual. |

`sdd-foundation` crea la base documental cuando el proyecto está vacío. Los agentes de fase no deben invocarse como un equipo descoordinado: el orquestador conserva el orden y los contratos.

## Flujo

```text
proposal -> specs --> tasks -> apply -> verify -> archive
             ^
             |
           design

lite: proposal-lite -> tasks -> apply -> verify
```

El modo **Interactive** pausa entre fases para revisar decisiones. El modo **Automatic** encadena las fases, pero nunca evita los gates de riesgo, arquitectura, testing o carga de revisión.

## Runtime y continuidad

Los hooks descargan del prompt tareas repetitivas del ciclo de vida:

| Evento | Responsabilidad |
| --- | --- |
| `SessionStart` | Valida OpenSpec y refresca la caché compacta de skills. |
| `PreToolUse` | Bloquea o solicita confirmación para comandos peligrosos. |
| `PreCompact` | Persiste un resumen recuperable antes de compactar contexto. |
| `SubagentStop` | Detecta degradación en la resolución de skills. |
| `Stop` | Registra la continuidad mínima de la sesión. |

Los hooks ejecutan código local con Node.js. Deben revisarse antes de instalar el plugin. `.ospec/cache` y `.ospec/session` son auxiliares; **OpenSpec sigue siendo la fuente de verdad**.

## Routing de modelos

Los agentes no fijan nombres de modelos concretos. Por defecto heredan el modelo seleccionado y pueden usar perfiles locales:

- `default`: fallback de un solo modelo;
- `cheap`: reduce coste en exploración y propuesta;
- `premium`: aumenta razonamiento en diseño y verificación.

Los perfiles viven en `profiles/models/`. Consulta [model-routing.md](docs/model-routing.md).

## Compatibilidad multi-target

El origen canónico está en formato VS Code y se carga directamente, sin transformación.
Para otros targets, un generador puro (`scripts/configure/cli.js`) produce un árbol nativo
y validado en `dist/<target>/` sin tocar el origen:

| Target | Salida |
| --- | --- |
| `vscode` | Identidad: el repositorio tal cual. |
| `claude` | Árbol `.claude-plugin`: renombra archivos, reestructura manifiesto y hooks, sustituye herramientas (context-aware), reescribe variables de comando, incorpora `rules/` y emite el orquestador como **skill**. Gate: `claude plugin validate --strict` 0/0. |
| `github-copilot` | Layout `.github/`: agentes a `.github/agents/*.agent.md` (`target: github-copilot`), comandos a `.github/prompts/*.prompt.md`, reglas a `.github/instructions/*.instructions.md` (`applyTo: "**"`). Descarta manifiesto/hooks/skills (Copilot no los usa). |

```powershell
node scripts/configure/cli.js --target claude          --out dist/claude
node scripts/configure/cli.js --target github-copilot  --out dist/github-copilot
```

La transform es pura y testeada bajo Strict TDD; el CLI es la capa de IO con un gate de
validación por target (golden fixtures, y `claude plugin validate` para `claude`). La selección de
modelo se abstrae en tiers (`models.yaml`). Consulta [model-routing.md](docs/model-routing.md) y la
[guía de instalación](docs/plugin-installation.md).

## MCP

La configuración predeterminada se mantiene deliberadamente pequeña:

- Context7 para documentación actualizada de librerías;
- MarkItDown para conversión de documentos.

Los servidores adicionales deben activarse explícitamente. Consulta [mcp-policy.md](docs/mcp-policy.md).

## Garantías del workflow

- Strict TDD cuando el proyecto dispone de runner compatible.
- Artefactos y progreso recuperables desde `openspec/changes/{change-name}/`.
- Aprobaciones bloqueantes persistidas en `state.yaml`, nunca inferidas del historial del chat.
- Prompts dinámicos delimitados para separar intención, artefactos, estándares y contexto de aprobación.
- Skills resueltas como reglas compactas para controlar el presupuesto de tokens.
- Cambios organizados en unidades revisables, con guardas cuando la carga supera el presupuesto recomendado.

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/README.md](docs/README.md) | Índice y recorrido recomendado. |
| [docs/sdd-metodologia.md](docs/sdd-metodologia.md) | Principios y modelo mental. |
| [docs/sdd-fases.md](docs/sdd-fases.md) | Contratos de cada fase. |
| [docs/sdd-workflows.md](docs/sdd-workflows.md) | Flujos estándar, lite, fast-forward y continuación. |
| [docs/openspec.md](docs/openspec.md) | Persistencia, specs delta y archivado. |
| [docs/tdd-y-revision.md](docs/tdd-y-revision.md) | Strict TDD y presupuesto de revisión. |
| [docs/harness-runtime.md](docs/harness-runtime.md) | Arquitectura del runtime de hooks. |
| [docs/plugin-installation.md](docs/plugin-installation.md) | Instalación, confianza y diagnóstico. |

## Desarrollo

La suite del runtime usa el test runner nativo de Node.js:

```powershell
node --test "scripts/**/*.test.js"
```

Antes de publicar cambios en el manifiesto, hooks o MCP, revisa expresamente la nueva superficie de ejecución y confianza.
