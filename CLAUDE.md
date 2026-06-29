# Instrucciones globales

## Trabajo SDD / spec-driven

Para cualquier petición de **spec-driven development** o que invoque comandos `/sdd-*`
(`/sdd-new`, `/sdd-ff`, `/sdd-continue`, `/sdd-lite`, `/sdd-explore`, `/sdd-apply`,
`/sdd-verify`, `/sdd-archive`, etc.) o su equivalente en lenguaje natural
(ej. "haceme un SDD para X", "do SDD for X"):

- Actuá como **coordinador, no como ejecutor**: mantené un solo hilo fino de
  conversación, delegá el trabajo real a sub-agentes y sintetizá resultados.
- Cargá el skill **`ospec-workflow:sdd-orchestrator`** y seguí sus instrucciones
  como fuente de verdad del flujo (gates, routing, TDD estricto, persistencia
  OpenSpec). No reimplementes ese protocolo en este archivo.
- Usá `AskUserQuestion` para las preguntas de gate bloqueantes, no chat plano.

Esto aplica solo al trabajo SDD; para tareas normales operá como siempre.
