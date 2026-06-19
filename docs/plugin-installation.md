# Instalacion del plugin de agentes de VS Code

Este repositorio se instala como un VS Code Agent Plugin. No es un flujo de extension de VS Code.

Los Agent Plugins estan en vista previa. Antes de instalar, revisa el contenido del plugin porque puede incluir hooks y servidores MCP que ejecutan codigo localmente.

## Que proporciona este plugin

El repositorio mantiene dos manifiestos sincronizados: `.plugin.json` es el manifiesto canonico para VS Code/direct-load y `.claude-plugin/plugin.json` conserva la forma esperada por la distribucion Claude generada (y es la fuente que lee el generador). Edita siempre el canonico primero; ambos deben coincidir y `scripts/manifest-sync.test.js` lo verifica en CI.

| Area | Fuente | Que proporciona |
| --- | --- | --- |
| Agentes | `agents/` | Orquestacion SDD y agentes de fase. |
| Archivos prompt | `commands/*.prompt.md` | Archivos prompt visibles para el usuario, como `/sdd-new`, `/sdd-apply` y `/sdd-verify`. |
| Skills | `skills/` | Reglas reutilizables para fases SDD, revisiones, commits, documentacion y flujos relacionados. |
| Instrucciones | `rules/` | Archivos de instrucciones incluidos en el plugin y generados por el flujo de creacion de plugins de VS Code. |
| Servidores MCP | `.mcp.json` | Configuracion de los servidores MCP: Context7 (docs de librerias, usa `CONTEXT7_API_KEY`) y MarkItDown (conversion de documentos). |
| Hooks | `hooks/hooks.json` y `scripts/hooks/` | Scripts locales de Node.js para persistencia de sesion, validacion de uso de herramientas y comprobaciones de artefactos OpenSpec. |

El directorio `.github/instructions/` es solo un espejo del workspace para archivos de instruccion. Las reglas incluidas en el plugin viven en `rules/`.

## Como instalar desde el origen

Usa esta via cuando quieras que VS Code gestione el plugin desde un repositorio fuente.

1. Abre una version de VS Code que soporte la vista previa de Agent Plugins.
2. Abre el flujo de instalacion de Agent Plugins.
3. Elige la opcion de instalar desde una URL de repositorio Git.
4. Introduce la URL del repositorio de este proyecto.
5. Revisa el manifiesto del plugin, los hooks, la configuracion del servidor MCP y los scripts antes de aceptar la instalacion.
6. Habilita el plugin cuando VS Code lo pida.
7. Recarga VS Code si el plugin no aparece de inmediato.

Lista de comprobacion de confianza antes de aceptar:

- Confirma que `.plugin.json` y `.claude-plugin/plugin.json` apuntan solo a los activos esperados del plugin.
- Revisa `hooks/hooks.json` porque inicia scripts locales de Node.js.
- Revisa `scripts/hooks/` porque esos scripts se ejecutan en eventos de hook.
- Revisa `.mcp.json` porque puede iniciar procesos locales para servidores MCP.
- Confirma que estas comodo proporcionando `CONTEXT7_API_KEY` cuando necesites acceso a MCP.

El soporte de plugins puede estar deshabilitado por la politica de la organizacion. Si la UI de Agent Plugins o los ajustes no aparecen, revisa tu version de VS Code y la configuracion administrada por tu organizacion.

## Como habilitarlo localmente con `chat.pluginLocations`

Usa esta via cuando estes desarrollando o probando este repositorio directamente desde disco.

1. Clona el repositorio en local.
2. Abre la configuracion de VS Code en formato JSON.
3. Agrega la raiz de este repositorio a `chat.pluginLocations`.
4. Recarga VS Code.
5. Abre la vista de Agent Plugins y confirma que `ospec-workflow` esta habilitado.

Ejemplo minimo de `settings.json`:

```json
{
  "chat.pluginLocations": [
    "C:\\dev\\Hiberus\\ospec-workflow"
  ]
}
```

Si guardas el repositorio en otra ruta, sustituye el valor por la ruta local de tu clon.


## Generar para otros targets con configure

El repositorio usa VS Code Agent Plugin como formato canonico. El target `vscode` es identidad: VS Code puede cargar el repositorio directamente, sin generar `dist/`. Para Claude Code y GitHub Copilot CLI, el generador produce arboles nativos en `dist/` sin modificar el origen.

```powershell
# Claude Code: carga temporal de una sesion
node scripts/configure/cli.js --target claude --out dist/claude

# Claude Code: instalacion persistente con marketplace local
node scripts/configure/claude-marketplace.js

# GitHub Copilot CLI / coding agent
node scripts/configure/cli.js --target github-copilot --out dist/github-copilot

# opencode (construcción local)
node scripts/configure/cli.js --target opencode --out dist/opencode

# opencode (instalación global)
npm run install:global:opencode

# Omitir validacion para inspeccion rapida
node scripts/configure/cli.js --target claude --out dist/claude --no-validate
```

| Target | Salida | Validacion |
| --- | --- | --- |
| `vscode` | Carga directa del repositorio fuente con `.plugin.json`; no genera salida. | `node scripts/check.js` |
| `claude` | Renombra `*.agent.md`/`*.prompt.md` a `*.md`, reestructura el manifiesto y los hooks, sustituye nombres de herramientas, reescribe variables de comando (`${input}` -> `$ARGUMENTS`; `${input:name}` -> `$name` + `arguments:`), incorpora `rules/` y emite el orquestador como **skill** (`skills/sdd-orchestrator/SKILL.md`). Genera `dist/claude/`, pensado para carga temporal con `claude --plugin-dir`. | `claude plugin validate --strict dist/claude` |
| `claude-marketplace` | Envuelve el arbol Claude en un marketplace local instalable. Genera `dist/claude-marketplace/.claude-plugin/marketplace.json` y coloca el plugin en `dist/claude-marketplace/plugins/ospec-workflow/`. | `claude plugin validate dist/claude-marketplace` y `claude plugin validate --strict dist/claude-marketplace/plugins/ospec-workflow` |
| `github-copilot` | Genera layout `.github/` con instrucciones, prompts, chatmodes, MCP y runtime de hooks para GitHub Copilot CLI / coding agent. | `scripts/configure/validate-github-copilot.js`, ejecutado por la validacion de perfiles y por `node scripts/check.js`. |
| `opencode` | Genera layout `.opencode/` (`agents/`, `commands/`, `instructions/`, `plugins/ospec.js`) mas `opencode.json` (schema + `mcp` + `instructions`) para opencode. Renombra el agente principal `sdd-orchestrator` a `ospec-workflow` para su visualización nativa. Sin hooks de shell: el runtime se puentea con un plugin JS. | `scripts/configure/validate-opencode.js`, ejecutado por la validacion de perfiles y por `node scripts/check.js`. |

Cada arbol generado es **autocontenido**: el generador sigue los `require` desde los hooks e incluye su runtime (`scripts/hooks/` + sus dependencias de `scripts/lib/`), sin tests ni el propio generador.

Validacion local recomendada antes de publicar cambios:

```powershell
node scripts/check.js
```

En Claude Code hay dos salidas distintas:

- `dist/claude`: sirve para carga temporal con `--plugin-dir`.
- `dist/claude-marketplace`: envuelve el plugin Claude en un marketplace local para instalacion persistente entre sesiones.

## Instalar el arbol generado por herramienta

- **VS Code**: usa el repositorio directamente (`chat.pluginLocations`), sin generar.
- **Claude Code temporal**: genera `dist/claude/` y cargalo con `claude --plugin-dir dist/claude`. Esta via solo aplica a la sesion actual.
- **Claude Code persistente**: genera `dist/claude-marketplace/`, registra ese marketplace local y despues instala `ospec-workflow@ospec-tools`.
- **GitHub Copilot CLI / coding agent**: genera `dist/github-copilot/` y copia su contenido (`.github/`, `.mcp.json` y `scripts/`) en la raiz del repo destino.
- **opencode (Local/Proyecto)**: genera `dist/opencode/` y copia su contenido (`.opencode/`, `opencode.json`, `skills/` y `scripts/`) en la raiz del repo destino. opencode descubre agentes/comandos/instrucciones bajo `.opencode/` y lee `opencode.json` (MCP + instructions); el plugin `.opencode/plugins/ospec.js` puentea el runtime de hooks.
- **opencode (Global)**: compila, copia y registra todos los agentes, comandos, instrucciones y plugins en el directorio global del usuario (`~/.config/opencode/`), fusionando la configuración de MCP en `opencode.json` de manera automática y permanente para cualquier proyecto. En ambos casos de opencode, el agente principal es renombrado a `ospec-workflow`.

### Claude Code: prueba temporal de una sesion

Usa esta via para validar el plugin generado sin tocar la configuracion global de Claude Code:

```powershell
node scripts/configure/cli.js --target claude --out dist/claude
claude plugin validate --strict dist/claude
claude --plugin-dir dist/claude
```

Verificacion dentro de Claude Code:

```text
/plugin
/sdd-new
/sdd-verify
```

Resultado esperado:

- `ospec-workflow` aparece habilitado durante esa sesion.
- Los comandos `/sdd-new`, `/sdd-lite`, `/sdd-continue`, `/sdd-apply`, `/sdd-verify` y `/sdd-archive` estan disponibles.
- El orquestador aparece como skill namespaced del plugin.

### Claude Code: instalacion persistente con marketplace local

Usa esta via cuando quieras que Claude Code recuerde el plugin entre sesiones.

Primero genera el marketplace local:

```powershell
node scripts/configure/claude-marketplace.js
```

Valida el marketplace y el plugin incluido:

```powershell
claude plugin validate dist/claude-marketplace
claude plugin validate --strict dist/claude-marketplace/plugins/ospec-workflow
```

Añade el marketplace con una ruta local explicita:

```powershell
$marketplace = (Resolve-Path ".\dist\claude-marketplace").ProviderPath
claude plugin marketplace add "$marketplace" --scope user
```

Instala el plugin desde ese marketplace:

```powershell
claude plugin install ospec-workflow@ospec-tools
```

Abre Claude Code normalmente:

```powershell
claude
```

Verifica dentro de la sesion:

```text
/plugin
/reload-plugins
```

Resultado esperado:

- El marketplace `ospec-tools` aparece registrado.
- El plugin `ospec-workflow@ospec-tools` aparece instalado y habilitado.
- Los comandos SDD y el skill del orquestador estan disponibles sin usar `--plugin-dir`.

#### Nota para PowerShell

No uses esta forma:

```powershell
claude plugin marketplace add dist/claude-marketplace --scope user
```

En Windows/PowerShell puede interpretarse como un origen Git/GitHub en lugar de como una ruta local, provocando errores de clonacion SSH como:

```text
Failed to clone marketplace repository
SSH host key is not in your known_hosts file
```

Usa una ruta local explicita:

```powershell
claude plugin marketplace add .\dist\claude-marketplace --scope user
```

O, preferiblemente:

```powershell
$marketplace = (Resolve-Path ".\dist\claude-marketplace").ProviderPath
claude plugin marketplace add "$marketplace" --scope user
```

La estructura esperada del marketplace generado es:

```text
dist/claude-marketplace/
  .claude-plugin/
    marketplace.json
  plugins/
    ospec-workflow/
      .claude-plugin/
        plugin.json
      agents/
      commands/
      skills/
      hooks/
      scripts/
      .mcp.json
```

### GitHub Copilot CLI / coding agent

Genera el arbol nativo:

```powershell
node scripts/configure/cli.js --target github-copilot --out dist/github-copilot
```

Copia el contenido generado en la raiz del repositorio destino:

```text
dist/github-copilot/
  .github/
  .mcp.json
  scripts/
```

Verifica que los archivos `.github/` generados quedan en la raiz del repo destino y que los scripts de hooks viajan junto al runtime necesario.

### opencode

El target `opencode` permite dos modalidades de instalación: local (por proyecto) y global (para toda la máquina del usuario). En ambas modalidades, el agente principal `sdd-orchestrator` se renombra automáticamente a `ospec-workflow` para integrarse con la interfaz de OpenCode y permitir el autocompletado con la tecla Tab.

#### Instalación local (por proyecto)

Construye y sincroniza la carpeta del plugin directamente en la raíz de tu proyecto de destino:

```powershell
npm run install:opencode -- ../mi-proyecto
```

Esto copiará el árbol `.opencode/`, `opencode.json`, `skills/` y `scripts/` (incluyendo los scripts de los hooks y el binario compiler hook `ospec-hooks.exe` o `ospec-hooks` si estuviera compilado en `release/dist/`).

#### Instalación global (para cualquier proyecto)

Instala el plugin de forma permanente a nivel de usuario:

```powershell
npm run install:global:opencode
```

Este instalador idempotente realiza los siguientes pasos:
1. Compila el target `opencode` en `dist/opencode/`.
2. Copia el binario compiler hook `ospec-hooks` apropiado para la arquitectura en `release/dist/` (si existe).
3. Copia todas las carpetas generadas (`agents/`, `commands/`, `instructions/`, `plugins/`, `skills/`, `scripts/`, y `release/`) al directorio global de configuración de OpenCode:
   - **Windows**: `C:\Users\<Usuario>\.config\opencode\`
   - **Linux/macOS**: `~/.config/opencode/`
4. Fusiona dinámicamente las configuraciones del archivo `opencode.json` (incluyendo servidores MCP como `context7` y `markitdown`) con el archivo `opencode.json` global ya existente, y añade el patrón global `instructions/*.md` para registrar las instrucciones.

Esto permite que `ospec-workflow` y todos sus comandos/skills estén disponibles al presionar **Tab** en cualquier repositorio abierto en OpenCode.

## Como verificar que cargaron los agentes y los skills

Empieza por los puntos de entrada visibles y luego inspecciona mas detalle solo si falta algo.

| Entorno | Comprobacion |
| --- | --- |
| VS Code | El plugin aparece en la vista de Agent Plugins y expone los comandos/chatmodes esperados. |
| Claude Code temporal | Al lanzar con `claude --plugin-dir dist/claude`, `ospec-workflow` aparece en `/plugin` durante esa sesion. |
| Claude Code persistente | Al instalar desde `ospec-workflow@ospec-tools`, el plugin aparece en `/plugin` sin usar `--plugin-dir`. |
| GitHub Copilot CLI / coding agent | El repo destino contiene `.github/`, `.mcp.json` y `scripts/` generados. |
| opencode (Local) | El repo destino contiene `.opencode/`, `opencode.json`, `skills/` y `scripts/`. Al presionar Tab o escribir su nombre, el agente `ospec-workflow` aparece en la interfaz. |
| opencode (Global) | La carpeta global (`~/.config/opencode/`) contiene `agents/`, `commands/`, `instructions/`, `plugins/`, `skills/` y `scripts/`, y `opencode.json` tiene la configuración fusionada. En cualquier repo, al presionar Tab, el agente `ospec-workflow` aparece en la interfaz. |

En Claude Code, si algo no aparece despues de instalar el plugin persistente, ejecuta:

```text
/reload-plugins
```

Y vuelve a revisar:

```text
/plugin
```

## Solucion de problemas

| Sintoma | Causa probable | Que revisar |
| --- | --- | --- |
| Faltan la UI de Agent Plugins | La vista previa de Agent Plugins no esta disponible o la politica la deshabilita. | Confirma que tu version de VS Code soporta Agent Plugins y revisa la politica de tu organizacion. |
| El plugin no aparece desde `chat.pluginLocations` | La ruta apunta a la carpeta equivocada o VS Code no se ha recargado. | Apunta a la raiz del repositorio que contiene `.plugin.json` y luego recarga VS Code. |
| Faltan los archivos prompt | El plugin esta deshabilitado o no se cargaron los activos prompt. | Confirma que `.plugin.json` referencia `commands/` y que el plugin esta habilitado. |
| Falta `sdd-orchestrator` | No se cargaron los activos de agentes. | Confirma que `.plugin.json` referencia `agents/` y que la vista de Agent Plugins no muestra errores. |
| Los skills parecen no estar disponibles | No se cargaron los activos de skills o la peticion no activo un skill. | Confirma que `.plugin.json` referencia `skills/` y vuelve a probar con una peticion SDD. |
| Falta el servidor MCP | MCP esta deshabilitado, bloqueado por la politica o no esta disponible en la version actual. | Revisa los ajustes de MCP/herramientas, la politica de la organizacion, Node.js/`npx` (Context7) y `uv`/`uvx` (MarkItDown). |
| Context7 pide una clave | Hace falta `CONTEXT7_API_KEY`. | Proporcionala desde el prompt de VS Code cuando confies en la ejecucion del servidor. |
| Falla la ejecucion del hook | Problema con Node.js, resolucion de rutas o politica de scripts. | Confirma que Node.js esta en `PATH`, revisa `hooks/hooks.json`, la resolucion de `${PLUGIN_ROOT}` y los scripts de `scripts/hooks/`. |
| No deben ejecutarse hooks | No se permite ejecucion local de codigo en este entorno. | Desactiva el plugin o usa una copia local sin hooks. |

## Politica de versionado

Trata la version del manifiesto del plugin como la version del paquete instalado.

| Tipo de cambio | Guia de version | Ejemplos |
| --- | --- | --- |
| Patch | Correcciones o docs que no cambian el comportamiento del plugin. | Aclarar la instalacion, corregir erratas, mejorar la solucion de problemas. |
| Minor | Cambios de capacidad del plugin compatibles hacia atras. | Agregar un comando, agregar un skill, agregar un hook nuevo con valores seguros por defecto, actualizar la configuracion MCP sin romper el uso existente. |
| Major | Cambios que rompen el comportamiento o la superficie de confianza. | Renombrar comandos, eliminar agentes, cambiar entradas MCP requeridas, sustituir el comportamiento de hooks o cambiar contratos de fases SDD de forma incompatible. |

Flujo de actualizacion para usuarios ya instalados:

1. Revisa el changelog o el diff antes de actualizar, especialmente si cambian `.plugin.json`, `.claude-plugin/plugin.json`, `.mcp.json`, `hooks/hooks.json` o `scripts/hooks/`.
2. Haz pull o reinstala desde la URL del repositorio Git.
3. Recarga VS Code.
4. Vuelve a ejecutar las comprobaciones de agente, comandos, MCP y hooks de este documento.

Cuando una version cambie hooks o servidores MCP, indicalo de forma explicita porque cambia la superficie local de ejecucion y confianza.
