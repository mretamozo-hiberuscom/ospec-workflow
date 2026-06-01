# Documentacion de ospec-workflow

Esta carpeta explica la metodologia SDD de este plugin para VS Code/Copilot. El README principal debe seguir siendo corto; aqui vive el detalle que necesitas para entender y mantener el sistema.

## Lectura recomendada

| Documento | Para que sirve |
| --- | --- |
| [sdd-metodologia.md](sdd-metodologia.md) | Modelo mental: problema, roles, principios y cuando usar SDD. |
| [sdd-fases.md](sdd-fases.md) | Explicacion fase por fase: entrada, salida, reglas y errores que evita. |
| [sdd-workflows.md](sdd-workflows.md) | Lineas de trabajo reales: proyecto nuevo, cambio normal, lite, fast-forward, continuacion y onboarding. |
| [openspec.md](openspec.md) | Como se persisten artefactos, specs delta, specs principales y archivo. |
| [tdd-y-revision.md](tdd-y-revision.md) | Strict TDD, evidencia, verificacion y presupuesto de revision. |

## Idea central

SDD no existe para meter burocracia. Existe para no confundir velocidad con avance. Primero se fija el contrato de comportamiento, despues el diseno, despues las tareas, despues el codigo y al final la evidencia.

Cuando se usa bien, Copilot deja de ser "un chat que escribe codigo" y pasa a ser un equipo de agentes con responsabilidades claras.
