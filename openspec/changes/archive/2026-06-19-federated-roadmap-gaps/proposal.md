# Proposal: Roadmap y Gaps en Workspace Federado (C5)

## Intent

C5 completa el pipeline de la ruta federada mediante la agregación de roadmaps miembro-locales y el análisis interactivo de brechas (gaps) funcionales y técnicos. Permite unificar hitos en `docs/roadmap.md` y resolver de forma iterativa y estructurada (vía Q&A) los gaps detectados, registrándolos en `docs/roadmap-gaps.md` y en la configuración del coordinador.

## Scope

### In Scope
- **Agregación de Roadmaps**: Escaneo y consolidación de `{member}/docs/roadmap.md` en el `docs/roadmap.md` del coordinador.
- **Análisis de Gaps**: Clasificación de gaps funcionales (capacidades deseadas no implementadas) y técnicos (desalineaciones de dependencias, stack o contratos).
- **Q&A interactivo de Gaps**: Gate interactivo que detiene foundation para resolver gaps activos mediante `vscode/askQuestions`, asignándolos a miembros específicos, difiriéndolos o creando nuevos miembros.
- **Registro persistente**: Escritura de `docs/roadmap-gaps.md` con el estado de resolución de brechas.

### Out of Scope
- Autoría de código de miembros para cerrar los gaps.
- Modificación directa de los roadmaps de miembros desde el coordinador.

## Approach
`sdd-foundation` en modo federado expandirá su escaneo para leer los roadmaps de miembros inicializados. Mapeará las diferencias entre la meta funcional de la fundación y el estado actual de los miembros para derivar los gaps funcionales y técnicos. El Q&A gate interrumpirá el flujo si existen gaps no asignados, y tras su resolución, generará `docs/roadmap-gaps.md` actualizando `docs/roadmap.md` y `openspec/config.yaml`.

## Affected Areas
- `skills/sdd-foundation/SKILL.md` (Modificado)
- `agents/sdd-foundation.agent.md` (Modificado)
- `agents/sdd-orchestrator.agent.md` (Modificado)
- `scripts/sdd-foundation-federated.test.js` (Modificado)

## Risks and Mitigations
- **Deriva y persistencia de Q&A**: Las respuestas a preguntas de gaps deben persistir de forma atómica para no perderse ante compactaciones. Mitigación: registro inmediato en `state.yaml` de approvals y en la configuración del coordinador.

## Success Criteria
- [ ] `sdd-foundation` consolida hitos de miembros en el `docs/roadmap.md` del coordinador.
- [ ] Se identifican y catalogan los gaps funcionales y técnicos en `docs/roadmap-gaps.md`.
- [ ] Gaps no resueltos bloquean foundation y abren un Q&A interactivo.
- [ ] El test suite compila y pasa todas las aserciones de contenido de C5 en verde.
