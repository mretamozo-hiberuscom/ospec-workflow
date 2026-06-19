# Tasks: Roadmap y Gaps en Workspace Federado (C5)

- [x] **Fase 1: Pruebas Unitarias RED (Content Assertions)**
  - [x] 1.1 Modificar `scripts/sdd-foundation-federated.test.js` para añadir test RED que valide que `SKILL.md` describe el escaneo y la consolidación de roadmaps miembro-locales.
  - [x] 1.2 Modificar `scripts/sdd-foundation-federated.test.js` para añadir test RED que valide que `SKILL.md` describe la clasificación de gaps funcionales/técnicos y la generación de `docs/roadmap-gaps.md`.
  - [x] 1.3 Modificar `scripts/sdd-foundation-federated.test.js` para añadir test RED que valide que `SKILL.md` describe el flujo Q&A gate de resolución de gaps mediante `vscode/askQuestions`.
  - [x] 1.4 Modificar `scripts/sdd-foundation-federated.test.js` para añadir test RED que valide que los prompts del agente (`sdd-foundation.agent.md`) y del orquestador (`sdd-orchestrator.agent.md`) documentan sus roles en C5.
- [x] **Fase 2: Implementación de Especificaciones en Habilidades y Agentes**
  - [x] 2.1 Modificar `skills/sdd-foundation/SKILL.md` para incluir el escaneo de roadmaps, la categorización y reporte de gaps, y el Q&A gate de resolución.
  - [x] 2.2 Modificar `agents/sdd-foundation.agent.md` para guiar al agente en la consolidación de hitos, análisis de brechas y emisión de bloqueos por gaps.
  - [x] 2.3 Modificar `agents/sdd-orchestrator.agent.md` para gestionar la inyección de respuestas de gaps y el registro del ledger de approvals.
- [x] **Fase 3: Ejecución de Tests y Verificación en GREEN**
  - [x] 3.1 Correr la suite de pruebas unitarias locales y verificar que pasen en verde (`node --test scripts/sdd-foundation-federated.test.js`).
  - [x] 3.2 Compilar y validar todos los targets del proyecto sin regresiones (`node scripts/check.js`).
