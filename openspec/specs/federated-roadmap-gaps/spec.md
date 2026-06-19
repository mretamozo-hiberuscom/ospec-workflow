# Spec: federated-roadmap-gaps

## Overview

Este dominio cubre la agregación de roadmaps miembro-locales y el análisis interactivo de brechas (gaps) funcionales y técnicos dentro de un espacio de trabajo federado. El objetivo es consolidar el roadmap global del coordinador (`docs/roadmap.md`), identificar capacidades no cubiertas, y resolverlas interactivamente con el usuario antes de iniciar la fase de implementación.

---

## 1. Requirements

### Requirement: Consolidación de Roadmaps de Miembros

La operación de foundation debe buscar y leer el roadmap (`docs/roadmap.md`) de todos los miembros inicializados y consolidar sus hitos y metas en el roadmap del coordinador.

#### Scenario: Milestones aggregated from members
- GIVEN a member repository containing a `docs/roadmap.md` with milestones
- WHEN `sdd-foundation` scans the workspace
- THEN it aggregates these milestones into the unified `docs/roadmap.md` under the respective member section

---

### Requirement: Detección de Gaps Funcionales y Técnicos

El analizador de foundation debe contrastar el alcance funcional del coordinador (`docs/product/functional-scope.md`) con las especificaciones de los miembros y su baseline general para mapear los gaps funcionales (capacidades no cubiertas) y técnicos (desalineaciones o contratos rotos).

#### Scenario: Functional and technical gaps identified
- GIVEN a coordinator specifying a capability that no member implements
- WHEN `sdd-foundation` performs the gap analysis
- THEN it identifies this capability as an active functional gap
- AND cataloges it in `docs/roadmap-gaps.md`

---

### Requirement: Resolución Interactiva de Gaps (Q&A Gate)

Si se detectan gaps activos sin resolución, el agente debe suspender el flujo de foundation y abrir una pregunta interactiva al usuario con opciones cerradas para resolver la brecha (ej. asignar a miembro, diferir, crear nuevo miembro).

#### Scenario: Q&A gate triggered on unresolved gaps
- GIVEN active gaps exist in the workspace
- WHEN `sdd-foundation` runs
- THEN the agent blocks and returns a `question_gate` via `vscode/askQuestions`
- AND upon receiving the user decision, it records the resolution in `docs/roadmap-gaps.md` and updates `openspec/config.yaml`
