# Instalacion del plugin de agentes de VS Code

Este repositorio se instala como un VS Code Agent Plugin. No es un flujo de extension de VS Code.

Los Agent Plugins estan en vista previa. Antes de instalar, revisa el contenido del plugin porque puede incluir hooks y servidores MCP que ejecutan codigo localmente.

## Que proporciona este plugin

El manifiesto del plugin es `.plugin/plugin.json`. Declara el paquete de trabajo que VS Code carga cuando el plugin esta habilitado.

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

- Confirma que `.plugin/plugin.json` apunta solo a los activos esperados del plugin.
- Revisa `hooks.json` porque inicia scripts locales de PowerShell.
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

## Como verificar que cargaron los agentes y los skills

Empieza por los puntos de entrada visibles y luego inspecciona mas detalle solo si falta algo.

| Comprobacion | Resultado esperado |
| --- | --- |
| Vista de Agent Plugins | `ospec-workflow` aparece en la lista y esta habilitado. |
| Selector de agente en Chat | `sdd-orchestrator` esta disponible como agente SDD para el usuario. |
| Puntos de entrada de archivos prompt | `/sdd-new`, `/sdd-lite`, `/sdd-continue`, `/sdd-apply`, `/sdd-verify` y `/sdd-archive` estan disponibles. |
| Detalles del plugin | Los agentes, comandos, skills, servidores MCP y hooks aparecen desde `.plugin/plugin.json`. |

Prueba rapida:

```text
Pregunta al orquestador SDD: resume los comandos SDD disponibles sin crear archivos.
```

Comportamiento esperado:

- El orquestador explica el flujo SDD.
- No expone los agentes de fase como comandos normales de usuario.
- Puede referenciar skills y reglas compartidas cuando haga falta.
- No crea artefactos OpenSpec para una peticion de resumen en solo lectura.

Si los skills no parecen cargarse, confirma que el plugin esta habilitado y que el repositorio contiene `skills/`. Este repositorio no incluye un archivo de registro de skills especifico del proyecto, y eso no deberia bloquear la carga del plugin.

## Como verificar la disponibilidad del servidor MCP

El plugin declara la configuracion MCP en `.mcp.json`.

| Servidor MCP | Proposito | Entrada requerida |
| --- | --- | --- |
| `io.github.upstash/context7` | Busqueda de documentacion de librerias con Context7. | `CONTEXT7_API_KEY` |
| `microsoft/markitdown` | Conversion de documentos (PDF/Office) a Markdown. | Ninguna (usa `uvx markitdown-mcp`). |

Pasos de verificacion:

1. Confirma que el plugin esta habilitado.
2. Abre la seccion de MCP o herramientas que exponga tu version de VS Code.
3. Confirma que `io.github.upstash/context7` aparece como servidor disponible.
4. Inicia un chat que necesite documentacion de librerias y permite el servidor MCP de Context7 cuando se solicite.
5. Proporciona `CONTEXT7_API_KEY` solo a traves del prompt seguro de VS Code, no en el texto del chat.

Comportamiento esperado:

- VS Code inicia el comando MCP configurado cuando se usa el servidor.
- El servidor solicita `CONTEXT7_API_KEY` si todavia no esta disponible.
- El chat puede recuperar documentacion de librerias a traves de Context7.

Si el servidor no esta disponible, comprueba que Node.js y `npx` estan en `PATH`, que tu organizacion permite el uso de MCP y que el prompt de la clave API se completo correctamente.

## Como desactivar los hooks si hace falta

Los hooks pueden ejecutar comandos locales. Desactivalos si necesitas inspeccionar el plugin en un modo sin ejecucion, depurar fallos de hooks o cumplir una restriccion de entorno.

Opciones seguras recomendadas:

| Opcion | Cuando usarla | Resultado |
| --- | --- | --- |
| Desactivar el plugin | Quieres detener todo el comportamiento del plugin. | Los agentes, comandos, skills, MCP y hooks dejan de cargarse desde este plugin. |
| Usar una copia local sin hooks | Quieres agentes y skills pero sin ejecucion de hooks mientras pruebas. | La copia local puede omitir la entrada `hooks` del manifiesto antes de registrarla con `chat.pluginLocations`. |
| Denegar los prompts de confianza o politica | Todavia no quieres permitir ejecucion local de codigo. | VS Code no deberia ejecutar los comandos locales proporcionados por el plugin. |

No borres los scripts de hooks solo para desactivar su ejecucion. Es preferible desactivar el plugin o usar una copia separada para que las actualizaciones desde el repositorio sigan siendo revisables.

## Solucion de problemas

| Sintoma | Causa probable | Que revisar |
| --- | --- | --- |
| Faltan la UI de Agent Plugins | La vista previa de Agent Plugins no esta disponible o la politica la deshabilita. | Confirma que tu version de VS Code soporta Agent Plugins y revisa la politica de tu organizacion. |
| El plugin no aparece desde `chat.pluginLocations` | La ruta apunta a la carpeta equivocada o VS Code no se ha recargado. | Apunta a la raiz del repositorio que contiene `.plugin/plugin.json` y luego recarga VS Code. |
| Faltan los archivos prompt | El plugin esta deshabilitado o no se cargaron los activos prompt. | Confirma que `.plugin/plugin.json` referencia `commands/` y que el plugin esta habilitado. |
| Falta `sdd-orchestrator` | No se cargaron los activos de agentes. | Confirma que `.plugin/plugin.json` referencia `agents/` y que la vista de Agent Plugins no muestra errores. |
| Los skills parecen no estar disponibles | No se cargaron los activos de skills o la peticion no activo un skill. | Confirma que `.plugin/plugin.json` referencia `skills/` y vuelve a probar con una peticion SDD. |
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

1. Revisa el changelog o el diff antes de actualizar, especialmente si cambian `.plugin/plugin.json`, `.mcp.json`, `hooks.json` o `scripts/hooks/`.
2. Haz pull o reinstala desde la URL del repositorio Git.
3. Recarga VS Code.
4. Vuelve a ejecutar las comprobaciones de agente, comandos, MCP y hooks de este documento.

Cuando una version cambie hooks o servidores MCP, indicalo de forma explicita porque cambia la superficie local de ejecucion y confianza.
