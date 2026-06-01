# ospec-workflow

Configuracion personal para GitHub Copilot en VS Code basada en Spec-Driven Development (SDD), OpenSpec, Strict TDD y revisiones pequenas. No es una coleccion de prompts sueltos: es un workflow donde el humano dirige, el orquestador coordina y los agentes de fase ejecutan con contratos verificables.

El plugin actual se declara en `.plugin/plugin.json` como `ospec-workflow` version `1.0.0`.

## Origen y adaptacion

Este workflow esta basado en dos piezas:

| Base | Como se usa aqui |
| --- | --- |
| SDD con OpenSpec | OpenSpec actua como memoria versionable: `openspec/config.yaml`, specs principales, cambios activos y archivo. |
| [`gentle-ai`](https://github.com/Gentleman-Programming/gentle-ai) de Gentleman-Programming | Se toma como referencia para el modelo de ecosistema con agentes, skills, SDD y delegacion; aqui se adapta a VS Code como plugin/bundle. |

La diferencia importante es el destino: este repo no intenta instalar todo un ecosistema global. Empaqueta el workflow para VS Code, con agentes Copilot, subagentes de fase, reglas compartidas y una configuracion pensada para GitHub Copilot o para otros agentes/proveedores cuando el entorno permite conectar modelos mediante API key.

## Vista rapida

| Ruta | Proposito |
| --- | --- |
| `.plugin/` | Metadatos del plugin/bundle para VS Code. |
| `agents/` | Agentes Copilot para orquestacion y fases SDD. |
| `rules/` | Instrucciones compartidas: protocolo comun, OpenSpec y Strict TDD. |
| `skills/` | Skills reutilizables que definen como trabajar en cada contexto. |
| `.atl/skill-registry.md` | Registro compacto para resolver skills antes de delegar trabajo. |
| `docs/` | Documentacion en espanol sobre metodologia, fases y workflows. |

## Flujo SDD

El ciclo principal es:

```text
proposal -> specs --> tasks -> apply -> verify -> archive
             ^
             |
           design

lite: proposal-lite -> tasks -> apply -> verify
```

Antes de ese ciclo hay dos puertas importantes:

| Puerta | Cuando aparece | Para que sirve |
| --- | --- | --- |
| `sdd-init` | Antes de cualquier trabajo SDD si falta `openspec/config.yaml`. | Detecta stack, testing, Strict TDD, convenciones y prepara OpenSpec. |
| `sdd-foundation` | En proyectos vacios o desde cero. | Define producto, usuarios, stack, arquitectura, tooling y roadmap antes de generar cambios normales. |

Esto importa porque la IA ejecuta muy rapido, pero si no hay contexto ni contrato acaba improvisando. SDD fuerza primero el acuerdo: que problema resolvemos, que comportamiento cambia, como lo vamos a construir y como lo vamos a verificar.

## Comandos principales

| Comando | Resultado |
| --- | --- |
| `/sdd-init` | Inicializa contexto, testing, OpenSpec y registro de skills. |
| `/sdd-foundation` | Completa la base de producto, arquitectura, stack, tooling y roadmap. |
| `/sdd-explore <tema>` | Investiga una idea antes de comprometerse con una solucion. |
| `/sdd-new <cambio>` | Arranca un cambio con exploracion y propuesta. |
| `/sdd-ff <nombre>` | Avanza rapido por propuesta, specs, diseno y tareas. |
| `/sdd-lite <nombre>` | Usa el flujo reducido `proposal-lite -> tasks -> apply -> verify` para cambios `trivial` o `small`. |
| `/sdd-continue [cambio]` | Continua la siguiente fase pendiente segun el estado OpenSpec. |
| `/sdd-apply [cambio]` | Implementa tareas planificadas y guarda progreso. |
| `/sdd-verify [cambio]` | Verifica implementacion contra specs, diseno, tareas y tests reales. |
| `/sdd-archive [cambio]` | Fusiona specs delta en specs principales y archiva el cambio. |
| `/sdd-onboard` | Guia una vuelta completa del workflow sobre un cambio real pequeno. |

## Documentacion

Lee en este orden:

1. [Metodologia SDD](docs/sdd-metodologia.md) - el modelo mental, roles y principios.
2. [Fases SDD](docs/sdd-fases.md) - que hace cada fase, que lee, que escribe y que evita.
3. [Lineas de workflow](docs/sdd-workflows.md) - proyecto nuevo, cambio normal, fast-forward, continuacion, apply, verify y archive.
4. [OpenSpec y artefactos](docs/openspec.md) - estructura de carpetas, specs delta, specs principales y archivo.
5. [Strict TDD y revision](docs/tdd-y-revision.md) - RED/GREEN/TRIANGULATE/REFACTOR, evidencia y presupuesto de 400 lineas.

## Agentes

`sdd-orchestrator` es el unico agente SDD invocable directamente por el usuario. Su trabajo es coordinar y delegar. Los agentes de fase son ejecutores: hacen su fase, persisten artefactos y devuelven un contrato de resultado.

| Agente | Responsabilidad |
| --- | --- |
| `sdd-orchestrator` | Coordina el flujo, aplica guards y delega fases. |
| `sdd-init` | Detecta contexto real del proyecto y prepara OpenSpec. |
| `sdd-foundation` | Construye la base funcional y tecnica de proyectos vacios. |
| `sdd-explore` | Investiga estado actual, opciones, riesgos y recomendacion. |
| `sdd-propose` | Define intencion, alcance, capacidades, riesgos y rollback. |
| `sdd-spec` | Escribe requisitos y escenarios OpenSpec testables. |
| `sdd-design` | Decide arquitectura, contratos, archivos y estrategia de pruebas. |
| `sdd-tasks` | Divide el cambio en tareas y calcula carga de revision. |
| `sdd-apply` | Implementa tareas desde specs y diseno. |
| `sdd-verify` | Prueba y juzga cumplimiento real. |
| `sdd-archive` | Sincroniza specs principales y cierra el cambio. |
| `sdd-onboard` | Ensenanza guiada del ciclo completo sobre un caso real. |

## Reglas que protegen el workflow

- `sdd-init` solo se autoejecuta antes de solicitudes SDD persistidas explicitas; ante preguntas vagas, el orquestador debe pedir permiso antes de crear `openspec/`.
- En proyectos vacios, `sdd-foundation` va antes de planificar cambios normales.
- El orquestador pasa reglas compactas desde `.atl/skill-registry.md`; los subagentes no dependen de memoria implicita.
- `sdd-init` y `skill-registry` degradan roots externos faltantes, rotos o sin permisos a warnings; no deben abortar el bootstrap por eso.
- El modo operativo actual del orquestador usa OpenSpec persistido en `openspec/`.
- Cada fase persistida debe actualizar `openspec/changes/{change-name}/state.yaml`; la recuperacion depende de ese estado.
- `sdd-tasks` debe incluir forecast de revision y presupuesto base de 400 lineas cambiadas.
- `sdd-apply` no debe empezar trabajo sobredimensionado sin decision de entrega: cadena de PRs o `size:exception`.
- Si Strict TDD esta activo, `sdd-apply` debe guardar evidencia RED/GREEN/TRIANGULATE/REFACTOR.
- `sdd-verify` comprueba tests reales y calidad de aserciones; no acepta humo como verificacion.
- `sdd-archive` no archiva cambios con issues CRITICAL.

## Estructura OpenSpec

El workflow persistido usa esta forma:

```text
openspec/
  config.yaml
  specs/
    {domain}/
      spec.md
  changes/
    archive/
    {change-name}/
      state.yaml
      exploration.md
      proposal.md
      proposal-lite.md
      design.md
      tasks.md
      apply-progress.md
      verify-report.md
      archive-report.md
      specs/
        {domain}/
          spec.md
```

Para proyectos desde cero, `sdd-foundation` tambien mantiene:

```text
docs/
  product/
  architecture/
  references/
    raw/
    processed/
  roadmap.md
```

## Uso esperado

Esta configuracion esta pensada para vivir como contenido de `.copilot` o como bundle/plugin de VS Code que expone agentes, reglas y skills. El valor esta en combinarla con el contexto real del repositorio: specs, tests, convenciones, issues, ramas y criterios de revision.

Para cambiar el workflow, modifica primero los contratos compartidos en `rules/` y `skills/_shared/`. Cambiar solo un agente rompe la arquitectura del proceso: es como reformar una planta del edificio con otro plano. Se puede hacer, pero luego no pidas estabilidad.
