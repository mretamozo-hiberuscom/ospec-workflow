# ospec-workflow

Spec-Driven Development (SDD) llave en mano: OpenSpec como fuente de verdad, Strict TDD, un orquestador
que coordina agentes de fase, y cambios revisables de principio a fin. Está basado en
[Gentle-ai de Gentleman Programming](https://github.com/Gentleman-Programming/gentle-ai).

El **formato canónico es un plugin de agentes para VS Code**: VS Code carga este repositorio tal cual,
sin compilar nada. Para llevar el mismo workflow a **Claude Code** o **GitHub Copilot CLI**, un
generador (`scripts/configure/cli.js`) produce un árbol nativo y validado de cada herramienta en
`dist/<target>/` sin tocar el origen. Un solo source, tres destinos. Ver
[Compatibilidad multi-target](#compatibilidad-multi-target).

La versión actual es **2.4.8**. El usuario trabaja con `sdd-orchestrator`; el orquestador coordina, los
agentes de fase ejecutan y OpenSpec conserva el estado versionable.

## Inicio rápido

- **Opción A (Uso directo del source - sin ruteo de modelos)**:
  1. Agrega la raíz de este repositorio clonado a `chat.pluginLocations` en tu `settings.json` de VS Code.
- **Opción B (Compilado con ruteo de modelos de `models.yaml` - Recomendado)**:
  1. Ejecuta el script de configuración automática:
     ```powershell
     npm run setup:vscode
     ```
     *(Esto compila el target VS Code a `dist/vscode` y lo añade automáticamente a `chat.pluginLocations` de tus editores VS Code/Insiders).*
  2. Si deseas realizar cambios futuros e inyectarlos de nuevo:
     ```powershell
     npm run reload:vscode
     ```

En ambos casos:
1. Revisa el manifiesto, los hooks y los servidores MCP antes de habilitarlo.
2. Instala el hook pre-commit de Git para validar tus cambios locales automáticamente:
   ```powershell
   npm run setup:git-hooks
   ```
3. Inicia un cambio con `/sdd-new` (o `/sdd-ff`, `/sdd-lite`, `/sdd-baseline` según el caso).
4. Continúa el flujo con `/sdd-continue` o ejecútalo por fases.
5. Verifica con `/sdd-verify` y archiva con `/sdd-archive`.

### Claude Code

#### Para usuarios finales (sin clonar el repo ni Node)

El repositorio no se instala directo: la fuente canónica está en formato VS Code y
el target `claude` requiere una transformación obligatoria. El artefacto ya
construido se publica en la branch `release` (vía CI), así que basta con:

```powershell
claude plugin marketplace add https://github.com/mretamozo-hiberuscom/ospec-workflow.git#release
claude plugin install ospec-workflow@ospec-tools
```

La branch `release` es un canal "latest" continuo: CI la republica cada vez que
publicas un GitHub Release. Si ya lo tienes instalado, Claude Code cachea el
marketplace, así que para recibir la última versión actualiza explícitamente:

```powershell
claude plugin marketplace update ospec-tools
claude plugin update ospec-workflow@ospec-tools
```

Para equipos, puedes versionar esto en `.claude/settings.json` y que a cada
miembro se le ofrezca instalarlo al confiar la carpeta del proyecto:

```json
{
  "extraKnownMarketplaces": {
    "ospec-tools": {
      "source": { "source": "github", "repo": "mretamozo-hiberuscom/ospec-workflow", "ref": "release" }
    }
  },
  "enabledPlugins": ["ospec-workflow@ospec-tools"]
}
```

#### Para desarrollo del plugin (un solo comando)

Probar solo durante la sesión actual, sin instalar:

```powershell
node scripts/configure/cli.js --target claude --out dist/claude
claude --plugin-dir dist/claude
```

Instalación persistente desde el marketplace local. El comando es **idempotente**:
la primera vez registra e instala, y en cada cambio reconstruye y actualiza.

```powershell
npm run setup:claude
```

Después abrí Claude Code normalmente (`claude`) y, dentro de la sesión, `/reload-plugins`.

Mientras iterás con una sesión abierta, lo más rápido es solo reconstruir y recargar:

```powershell
npm run reload:claude   # build (con validación strict) — luego /reload-plugins en la sesión
```

> `npm run setup:claude` reemplaza el flujo manual de cinco pasos. El build ya corre
> `claude plugin validate --strict`, y el registro del marketplace + install solo
> hacen falta una vez (después se hace `update`). Si preferís el flujo crudo, sigue
> disponible en [docs/plugin-installation.md](docs/plugin-installation.md).

### GitHub Copilot CLI

El target `github-copilot` permite dos modalidades de uso.

**Opción A: Local / Proyecto específico**

Copia el árbol de agentes y configuración en la raíz del repositorio de destino (`.github/`, `.mcp.json`, `skills/`, `scripts/`):

```powershell
npm run install:copilot -- ../mi-proyecto   # build + copia el árbol
npm run build:copilot                        # solo build a dist/github-copilot
```

Agregá `--dry-run` para ver qué copiaría sin escribir:
`node scripts/configure/install-target.js github-copilot ../mi-proyecto --dry-run`.

**Opción B: Global**

Registra todos los agentes, comandos, instrucciones y plugins de manera global en el directorio de configuración del usuario (`~/.copilot/`) y fusiona la configuración MCP en `mcp-config.json` de forma automática. De esta forma, el agente `sdd-orchestrator` y sus comandos estarán disponibles en cualquier proyecto abierto:

```powershell
npm run setup:copilot              # build + copia global + merge config (idempotente)
npm run reload:copilot             # reconstruye y actualiza la instalación global
```

### opencode

El target `opencode` permite dos modalidades de uso. En ambas modalidades, el agente principal `sdd-orchestrator` se renombra automáticamente a `ospec-workflow` para integrarse de forma nativa con la interfaz de OpenCode.

**Opción A: Local / Proyecto específico**

Copia el árbol de agentes y configuración en la raíz del repositorio de destino (`.opencode/`, `opencode.json`, `skills/`, `scripts/`):

```powershell
npm run install:opencode -- ../mi-proyecto   # build + copia el árbol
npm run build:opencode                        # solo build a dist/opencode
```

**Opción B: Global**

Registra todos los agentes, comandos, instrucciones y plugins de manera global en el directorio de configuración del usuario (`~/.config/opencode/`) y fusiona el archivo `opencode.json` (MCP y configs) de forma automática. De esta forma, el agente `ospec-workflow` (accesible presionando Tab o escribiendo su nombre) estará disponible en cualquier proyecto abierto:

```powershell
npm run setup:opencode             # build + copia global + merge config (idempotente)
npm run reload:opencode            # reconstruye y actualiza la instalación global
```

Consulta la [guía de instalación](docs/plugin-installation.md) para instalación remota, desarrollo local, marketplace local de Claude Code y requisitos de confianza.

## Qué incluye

| Ruta | Propósito |
| --- | --- |
| `.plugin.json` | Manifiesto **canónico** (VS Code/direct-load). Editá este primero. |
| `.claude-plugin/plugin.json` | Copia de compatibilidad para la distribución Claude; también es la fuente que lee el generador (`scripts/configure/cli.js`). Debe reflejar el canónico — `scripts/manifest-sync.test.js` lo verifica en CI. |
| `agents/` | Orquestador y agentes especializados por fase. |
| `commands/` | Comandos visibles y routing hacia el orquestador. |
| `skills/` | Capacidades bajo demanda y contratos compartidos. |
| `rules/` | Reglas persistentes de SDD, OpenSpec y Strict TDD. |
| `hooks/` | Declaración de eventos del ciclo de vida del plugin. |
| `scripts/hooks/` | Runtime de los hooks (Node.js) y sus tests. |
| `scripts/lib/` | Librerías compartidas: estado OpenSpec, artifact-store y el núcleo del generador (`frontmatter`, `model-resolver`, `target-transform`, perfiles). |
| `scripts/configure/` | CLI del generador multi-target (`cli.js`), validadores por perfil y fixtures golden. |
| `models.yaml` | Tablas tier→modelo por target para el generador. |
| `profiles/models/` | Perfiles opcionales de routing de modelos (uso directo en VS Code). |
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

## Flujos

El ciclo completo estándar es:

```text
proposal -> specs --> tasks -> apply -> verify -> archive
             ^
             |
           design
```

Pero no todo cambio recorre el ciclo entero. El orquestador elige la línea según el contexto:

| Línea | Cuándo | Recorrido |
| --- | --- | --- |
| **Estándar** | Repo con código existente | `/sdd-new` → `/sdd-continue` (o por fases) → `/sdd-apply` → `/sdd-verify` → `/sdd-archive` |
| **Fast-forward** | El cambio está claro; quieres llegar a tareas rápido | `/sdd-ff` = proposal → specs → design → tasks (no implementa) |
| **Lite** | Cambio trivial o pequeño | `/sdd-lite` = proposal-lite → tasks → apply → verify |
| **Proyecto nuevo/vacío** | No hay producto, stack ni arquitectura | `/sdd-foundation` fija cimientos antes de `/sdd-new` o `/sdd-ff` |
| **Baseline brownfield** | Hay código pero `openspec/specs/` está vacío | `/sdd-baseline` siembra specs de comportamiento actual por dominios (en tandas) |
| **Continuación** | Retomar un cambio a medias | `/sdd-continue` recupera estado desde `state.yaml`, sin depender del chat |
| **Workspace multi-repo** | Federación de varios repos | `/sdd-workspace` para atlas, estado e impacto cross-repo |
| **Onboarding** | Aprender la metodología sobre un caso real | `/sdd-onboard` guía un ciclo completo |

`/sdd-apply` trabaja por tandas revisables (fusiona `apply-progress.md`); cuando el cambio supera el
presupuesto de ~400 líneas, el orquestador propone PRs encadenadas (`stacked-to-main` o
`feature-branch-chain`) o exige una `size:exception` consciente. El modo **Interactive** pausa entre
fases para revisar decisiones; el **Automatic** las encadena, pero nunca evita los gates de riesgo,
arquitectura, testing o carga de revisión. Detalle completo en
[docs/sdd-workflows.md](docs/sdd-workflows.md).

## Runtime y continuidad

Los hooks descargan del prompt tareas repetitivas del ciclo de vida y aplican políticas de seguridad y control:

| Evento | Responsabilidad |
| --- | --- |
| `SessionStart` | Valida OpenSpec, refresca la caché compacta de skills y ejecuta escaneos de seguridad de **AgentShield** (alertas por archivos `.env` expuestos o credenciales en `.git/config`). |
| `PreToolUse` | Bloquea o solicita confirmación para comandos peligrosos, evalúa límites de **Token Budget Advisor** (límite de 20k tokens por archivo, 90k tokens acumulados por sesión) e implementa **AgentShield** (bloqueo de claves SSH, `.npmrc`, `.git/config`, y prompts interactivos ante secretos). |
| `PreCompact` | Persiste un resumen recuperable antes de compactar contexto. |
| `SubagentStop` | Detecta degradación en la resolución de skills. |
| `Stop` | Registra la continuidad mínima de la sesión. |

### Variables de Entorno de Bypass (Harness Gates)

Puedes omitir temporalmente las distintas comprobaciones de seguridad, presupuestos y validadores utilizando las siguientes variables de entorno:

- `DISABLE_AGENT_SHIELD=true`: Desactiva el escaneo y los bloqueos/preguntas de archivos sensibles y credenciales (AgentShield).
- `DISABLE_TOKEN_ADVISOR=true`: Desactiva la comprobación del tamaño de tokens estimados en lecturas de archivos de la sesión (Token Budget Advisor).
- `DISABLE_OSPEC_PRECOMMIT=true`: Desactiva la ejecución local de la validación del espacio de trabajo y Strict TDD en el hook pre-commit de Git.

Los hooks ejecutan código nativo (Node.js o ejecutables Go optimizados). `.ospec/cache` y `.ospec/session` son auxiliares; **OpenSpec sigue siendo la fuente de verdad**.

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
| `vscode` | Identidad canónica: VS Code carga el repositorio tal cual, sin generar `dist/`. |
| `claude` | Árbol `.claude-plugin`: renombra archivos, reestructura manifiesto y hooks, sustituye herramientas (context-aware), reescribe variables de comando, incorpora `rules/` y emite el orquestador como **skill**. Gate: `claude plugin validate --strict` 0/0. |
| `github-copilot` | Layout `.github/`: agentes a `.github/agents/*.agent.md` (`target: github-copilot`, `vscode/askQuestions`→`ask_user`), comandos a `.github/prompts/*.prompt.md`, reglas a `.github/instructions/*.instructions.md` (`applyTo: "**"`), hooks a `.github/hooks/hooks.json` (schema Copilot) y `.mcp.json` tal cual. Validado por `scripts/configure/validate-github-copilot.js` dentro del flujo de perfiles. |
| `opencode` | Layout `.opencode/` + `opencode.json`: agentes a `.opencode/agents/*.md` (`mode: primary\|subagent`, `tools:` como **mapa**, modelo `provider/model`), comandos a `.opencode/commands/*.md` (conserva `agent:`, args `$1`/`$ARGUMENTS`), reglas a `.opencode/instructions/*.md` referenciadas por `instructions` en `opencode.json`, MCP plegado dentro de `opencode.json` (`mcp` con `type: local\|remote`) y, como opencode no tiene hooks de shell, el runtime se puentea con un plugin JS en `.opencode/plugins/ospec.js`. Validado por `scripts/configure/validate-opencode.js`. |

```powershell
node scripts/configure/cli.js --target claude          --out dist/claude
node scripts/configure/cli.js --target github-copilot  --out dist/github-copilot
node scripts/configure/cli.js --target opencode        --out dist/opencode
```

La transform es pura y testeada bajo Strict TDD; el CLI es la capa de IO con un gate de
validación por target (golden fixtures, `claude plugin validate` para `claude` y validadores Node para GitHub Copilot y opencode). La selección de
modelo se abstrae en tiers (`models.yaml`). Cada árbol generado es **autocontenido**: el generador
sigue los `require` desde los hooks e incluye su runtime (`scripts/hooks/` + sus dependencias de
`scripts/lib/`), sin tests ni el propio generador. Consulta [model-routing.md](docs/model-routing.md)
y la [guía de instalación](docs/plugin-installation.md).

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
| [docs/sdd-workflows.md](docs/sdd-workflows.md) | Líneas de trabajo: estándar, lite, fast-forward, foundation, baseline brownfield, continuación, workspace y onboarding. |
| [docs/openspec.md](docs/openspec.md) | Persistencia, specs delta y archivado. |
| [docs/tdd-y-revision.md](docs/tdd-y-revision.md) | Strict TDD y presupuesto de revisión. |
| [docs/harness-runtime.md](docs/harness-runtime.md) | Arquitectura del runtime de hooks. |
| [docs/model-routing.md](docs/model-routing.md) | Tiers de modelo y formato por target (`models.yaml`). |
| [docs/mcp-policy.md](docs/mcp-policy.md) | Política y configuración de servidores MCP. |
| [docs/plugin-installation.md](docs/plugin-installation.md) | Instalación, generación por target, confianza y diagnóstico. |

## Validación

Un solo comando cubre la verificación local y de CI del runtime de hooks, generador multi-target,
validadores de perfiles y artefactos esperados:

```powershell
node scripts/check.js
```

CI ejecuta el mismo gate en `.github/workflows/validate-harness.yml` con Node 22 y matriz multi-OS.

Antes de publicar cambios en el manifiesto, hooks, MCP o el generador, revisa expresamente la nueva
superficie de ejecución y confianza.
