# OpenSpec y artefactos

OpenSpec es la memoria compartible del workflow. Sin OpenSpec, todo depende de la conversacion; con OpenSpec, el estado vive en archivos versionables.

El orquestador actual usa `openspec` como modo operativo para cambios SDD. Algunos skills conservan compatibilidad con modo `none`, pero este bundle esta pensado para persistir artefactos en el repo.

## Estructura

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

## `openspec/config.yaml`

Guarda contexto del proyecto:

| Area | Ejemplos |
| --- | --- |
| Stack | Lenguajes, frameworks, package managers, arquitectura detectada. |
| Comandos | Install, build, test, lint, format, typecheck. |
| Testing | Runner, capas disponibles, coverage, Strict TDD. |
| Reglas | Normas por fase: proposal, specs, design, tasks, apply, verify, archive. |
| Foundation | Docs de producto, baseline tecnico, roadmap y preguntas abiertas. |

`sdd-init` lo crea. `sdd-foundation` lo completa cuando el proyecto esta vacio.

## Specs principales vs specs delta

| Tipo | Ruta | Que significa |
| --- | --- | --- |
| Spec principal | `openspec/specs/{domain}/spec.md` | Comportamiento vigente del sistema. |
| Spec delta | `openspec/changes/{change-name}/specs/{domain}/spec.md` | Cambio propuesto sobre ese comportamiento. |

Durante `sdd-spec` no se escribe directamente en `openspec/specs/`. Tanto las modificaciones sobre dominios existentes como las capacidades nuevas viven primero en `openspec/changes/{change-name}/specs/...`. Para capacidades nuevas, esa spec change-local es temporal por diseno: `sdd-archive` es la unica fase que la promociona a `openspec/specs/{domain}/spec.md`.

## Formato de delta

Una delta spec usa tres secciones:

```markdown
## ADDED Requirements

## MODIFIED Requirements

## REMOVED Requirements
```

La regla critica esta en MODIFIED: copiar el requisito completo desde la spec principal, con todos sus escenarios, y despues editar. Si solo copias el escenario cambiado, al archivar puedes perder el resto. Esto no es un detalle menor: es una fuga de contrato.

## Ciclo de artefactos

| Fase | Artefacto |
| --- | --- |
| Explore | `exploration.md` |
| Propose | `proposal.md` o `proposal-lite.md` (solo en lite mode) |
| Spec | `specs/{domain}/spec.md` dentro del cambio |
| Design | `design.md` |
| Tasks | `tasks.md` |
| Apply | `apply-progress.md` y estados `[ ]` / `[~]` / `[x]` en `tasks.md` |
| Verify | `verify-report.md` |
| Archive | `archive-report.md`, specs principales actualizadas y carpeta movida |

Ademas, cada fase que persiste artefactos debe leer, fusionar y actualizar `openspec/changes/{change-name}/state.yaml`. La recuperacion depende de ese archivo; no es un detalle opcional.

## Archivo

Al cerrar un cambio:

```text
openspec/changes/{change-name}/
  -> openspec/changes/archive/YYYY-MM-DD-{change-name}/
```

Antes de mover, `sdd-archive` debe validar el cierre:

- `FAIL` bloquea el archive.
- `PASS WITH WARNINGS` solo puede pasar si los riesgos quedan aceptados de forma explicita o convertidos en follow-up.

Si el cambio tiene delta specs, despues sincroniza specs:

| Delta | Accion sobre spec principal |
| --- | --- |
| ADDED | Anadir requisito. |
| MODIFIED | Reemplazar requisito completo por la version nueva. |
| REMOVED | Eliminar requisito indicado con motivo. |

El archivo es auditoria. No se borra y no se reescribe a ciegas.

## Foundation docs

Para proyectos desde cero, el contexto que todavia no existe en codigo vive en:

```text
docs/
  product/
    brief.md
    functional-scope.md
    glossary.md
  architecture/
    technical-baseline.md
    decisions/
      README.md
  roadmap.md
  references/
    raw/
      README.md
    processed/
      README.md
```

La regla es sencilla: fuentes crudas en `raw/`, resumen util y trazable en `processed/`. No enterramos incertidumbre. Si algo no se sabe, se marca como `Unknown` o `TBD` y se formula la siguiente pregunta.

## Recuperacion

Si una conversacion se pierde o se compacta, se recupera leyendo:

```text
openspec/config.yaml
openspec/changes/*/state.yaml
openspec/changes/{change-name}/proposal.md o proposal-lite.md
openspec/changes/{change-name}/specs/**
openspec/changes/{change-name}/design.md
openspec/changes/{change-name}/tasks.md
openspec/changes/{change-name}/apply-progress.md
```

Este es el punto: el proceso no depende de que el modelo "recuerde". Depende de archivos.
