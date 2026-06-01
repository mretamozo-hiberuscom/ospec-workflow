# Metodologia SDD

Spec-Driven Development (SDD) es la capa de disciplina que este plugin pone delante de la implementacion. La idea es simple: antes de tocar codigo, el equipo acuerda el comportamiento esperado, el enfoque tecnico, las tareas y la forma de verificarlo.

Esto no va de ir mas lento. Va de no construir a ciegas. La inmediatez sin contrato parece productividad durante diez minutos y deuda tecnica durante meses. Ahi es donde hay que ponerse serio.

## Problema que resuelve

Cuando se usa IA sin estructura suelen aparecer los mismos fallos:

| Fallo | Consecuencia |
| --- | --- |
| Se implementa antes de entender el dominio. | El codigo resuelve una version inventada del problema. |
| El contexto vive solo en la conversacion. | Se pierde con compaction, sesiones nuevas o cambio de agente. |
| No hay specs testables. | Verificar se convierte en "parece que funciona". |
| Los cambios son enormes. | La review se vuelve cara, lenta y superficial. |
| Los tests se escriben al final o son humo. | Dan confianza falsa y no protegen comportamiento real. |

SDD ataca esos puntos con artefactos persistidos, fases separadas y gates explicitos.

## Roles

| Rol | Responsabilidad |
| --- | --- |
| Humano | Decide el objetivo, valida tradeoffs y acepta riesgos. La IA no lidera el producto. |
| `sdd-orchestrator` | Coordina fases, aplica guards y delega a agentes especializados. |
| Agentes de fase | Ejecutan una fase concreta: init, foundation, explore, propose, spec, design, tasks, apply, verify o archive. |
| OpenSpec | Guarda el estado compartible: config, cambios activos, specs principales y archivo. |
| Skills | Inyectan reglas compactas segun contexto: PRs, testing, commits, documentacion, etc. |

La separacion importa. Un orquestador que implementa se llena de contexto y pierde control. Un ejecutor que orquesta rompe el flujo. Cada pieza hace su trabajo.

## Principios

| Principio | Traduccion practica |
| --- | --- |
| Contrato antes que codigo | Primero propuesta, specs y diseno; despues implementacion. |
| Evidencia antes que opinion | Verify exige tests reales, comandos y matriz de cumplimiento. |
| Persistencia antes que memoria | El estado importante vive en `openspec/`, no solo en el chat. |
| Revisiones pequenas | 400 lineas cambiadas es el presupuesto base de revision. |
| TDD cuando hay runner | Si Strict TDD esta activo, se trabaja RED/GREEN/TRIANGULATE/REFACTOR. |
| Un agente, una responsabilidad | El orquestador coordina; los ejecutores ejecutan. |

## Fuente de verdad

Hay tres niveles de verdad:

| Nivel | Donde vive | Que representa |
| --- | --- | --- |
| Contexto del proyecto | `openspec/config.yaml` | Stack, comandos, testing, Strict TDD y reglas. |
| Cambio activo | `openspec/changes/{change-name}/` | Propuesta, specs delta, diseno, tareas, progreso y verificacion. |
| Comportamiento vigente | `openspec/specs/{domain}/spec.md` | Specs principales despues de archivar cambios verificados. |

La diferencia entre cambio activo y spec principal es CLAVE. El cambio activo dice "esto queremos modificar". La spec principal dice "asi funciona el sistema ahora".

## Cuando usar SDD

Usa SDD para:

- Features con comportamiento observable.
- APIs, flujos de UI, reglas de negocio o integraciones.
- Refactors con riesgo o impacto amplio.
- Cambios que necesitan acuerdo antes de implementar.
- Trabajo con IA donde quieres trazabilidad y rollback.

No hace falta SDD completo para:

- Typos.
- Cambios mecanicos muy pequenos.
- Ajustes triviales de documentacion.
- Experimentos desechables.

Para ese espacio intermedio entre "una errata" y "un cambio normal" existe `/sdd-lite`: usa `proposal-lite.md -> tasks.md -> apply -> verify` para cambios `trivial` o `small` sin abrir specs/diseno completos. Si durante el trabajo deja de ser pequeno, se escala al flujo estandar.

La regla sana: si alguien tendria que revisar el "que", el "por que" o el "como", usa SDD. Si el cambio es acotado pero aun quieres trazabilidad y gates, usa lite. Si solo hay que corregir una errata, no montes una catedral.
