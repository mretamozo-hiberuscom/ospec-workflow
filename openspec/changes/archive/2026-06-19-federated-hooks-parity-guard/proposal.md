# Proposal: federated-hooks-parity-guard

**Change**: federated-hooks-parity-guard
**Classification**: normal
**Delivery**: single PR, exception-ok

## Problem Statement

El arnés runtime tiene implementaciones de hooks en Go (camino rápido) y en JS (fallback de compatibilidad). Los hooks JS son capaces de manejar federación (por ejemplo, `session-start` escribe el bloque `workspace` en la caché v2, y `pre-compact` y `stop` agregan los cambios activos de los repositorios miembros de la federación).

Sin embargo, los hooks compilados en Go (`store.go`) no implementan la federación (son single-repo only). Esto provoca que en un repositorio configurado con `workspace-federated` donde exista el binario Go, los hooks se comporten de forma distinta que con el fallback de JS, ignorando el estado federado.

Para resolver esta brecha de paridad sin duplicar la compleja lógica de federación en Go (Option B), implementamos la **Opción A1** del documento de paridad: el launcher de hooks detecta si el backend es federado y desvía la ejecución al hook JS correspondiente para los eventos que necesitan agregación federada.

## Goals

1. **Detectar el backend** de almacenamiento (`workspace-federated` o `openspec`) de forma síncrona en el launcher `ospec-hooks-launch.js` a partir de `openspec/config.yaml`.
2. **Desviar la ejecución** al hook JS correspondiente si se dan estas condiciones simultáneamente:
   - El backend es `workspace-federated`.
   - El evento/subcomando es uno de los afectados: `session-start`, `pre-compact`, o `stop`.
3. **Optimizar la ruta crítica**: Evitar leer o parsear el archivo `config.yaml` si el subcomando es `pre-tool-use` o `subagent-stop`, manteniendo la latencia al mínimo para el camino caliente.
4. **Validar la lógica** con pruebas unitarias exhaustivas en `ospec-hooks-launch.test.js` mockeando el acceso a `config.yaml` y verificando la resolución de invocación correcta.

## Non-Goals

- Migrar o reescribir lógica de federación (`workspace-atlas.js`, `federation-marker.js`, etc.) a Go (Opción B), ya que duplicaría código mantenido en JS para la CLI y el orquestador.
- Desviar hooks no afectados por la agregación federada (`pre-tool-use` y `subagent-stop`) que deben seguir ejecutándose en Go si hay binario disponible.

## Proposed Solution

### Work Unit 1: Lógica de detección de backend síncrona en el launcher
- Agregar una función `readBackendModeSync(configPath, readFileSync)` en `scripts/hooks/ospec-hooks-launch.js`.
- Utilizar una expresión regular simple para extraer `backend` dentro de la sección `artifact_store` de `openspec/config.yaml` sin añadir dependencias pesadas de terceros.
- Resolver el backend por defecto como `openspec` si el archivo no existe o no se puede leer.

### Work Unit 2: Capability-aware routing en la resolución del hook
- Actualizar `resolveInvocation(sub, scriptDir, suffix, exists, readFileSync)` para aceptar un callback de lectura opcional.
- Si `sub` es `session-start`, `pre-compact` o `stop`:
  - Buscar `openspec/config.yaml` en el directorio de trabajo (o subiendo al directorio del plugin si aplica, aunque el arnés de pruebas define la raíz).
  - Si el backend resuelto es `workspace-federated`, retornar la invocación Node.js directamente (bypasseando el binario Go).
- Si el subcomando es `pre-tool-use` o `subagent-stop`, saltar la lectura de la configuración por completo y resolver la invocación usando el binario Go directamente (si existe).

### Work Unit 3: Cobertura de tests unitarios
- Agregar casos de prueba en `scripts/hooks/ospec-hooks-launch.test.js` que simulen la presencia del binario y fuercen:
  - Backend `openspec` -> Resuelve binario.
  - Backend `workspace-federated` + subcomando `pre-tool-use` -> Resuelve binario.
  - Backend `workspace-federated` + subcomando `session-start` -> Resuelve Node fallback.
  - Ausencia de archivo de configuración -> Cae a `openspec` (resuelve binario).

## Rollback Plan

Dado que es un desvío puro a nivel de launcher, revertir los cambios en `scripts/hooks/ospec-hooks-launch.js` y restaurar la lógica anterior recuperará de inmediato la resolución basada puramente en la disponibilidad del binario Go por plataforma.

## Risk Assessment

| Riesgo | Mitigación |
| --- | --- |
| Penalización de rendimiento en el launcher al leer `config.yaml` | Solo se lee `config.yaml` para subcomandos fríos (`session-start`, `pre-compact`, `stop`). El hot path `pre-tool-use` se salta esta lógica completamente y no tiene penalización. |
| Inconsistencias en el parseo del YAML | Se utilizará una heurística de regex robusta y probada (espejo de `readBackendMode` en `ospec-state.js`) para evitar fallos de parseo. |

## Estimated Changed Lines

~30-50 líneas de código en el launcher y ~30 líneas de pruebas unitarias.
