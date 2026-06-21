---
title: Conventions
last_updated: 2026-06-21
---

> Este archivo es mantenido por curación humana. Los agentes SDD SOLO lo leen.
> (This file is maintained by human curation. SDD agents ONLY read it.)

## Qué registrar aquí

Convenciones **recurrentes y estables** que ya se aplican en el repo y que emergen a
través de múltiples cambios SDD: naming, estructura de carpetas, estilo, decisiones de
stack, patrones de testing, etc. El objetivo es que los agentes no las re-deriven en
cada ciclo. Una convención = una regla que el equipo ya adoptó, no una idea suelta.

Formato sugerido por entrada: un encabezado `##` con la regla, seguido de viñetas
`ámbito` / `regla` / `por qué` (y opcionalmente `visto en`). Las entradas se agregan
manualmente (los agentes nunca escriben aquí).

<!-- ───────────────────────────────────────────────────────────────────── -->
<!-- EJEMPLO ILUSTRATIVO — NO es una convención real de este proyecto.        -->
<!-- Sirve solo para mostrar el formato. Los agentes DEBEN IGNORAR este       -->
<!-- bloque. El curador humano debe reemplazarlo o borrarlo al registrar la   -->
<!-- primera convención real.                                                 -->
<!-- (EXAMPLE ONLY — NOT a real convention. Agents MUST ignore this block.)   -->

## [EJEMPLO / EXAMPLE] Nombrar los tests de contrato como `*-contract.test.js`

> **Ejemplo ilustrativo — NO es una convención real de este proyecto.** Muestra solo el
> formato de una entrada. Reemplazalo o borralo al registrar tu primera convención real.
> (Illustrative example — NOT a real convention. Replace or delete it.)

- ámbito: `scripts/`
- regla: los tests que pinan invariantes de prosa o estructura (no lógica) usan el
  sufijo `-contract.test.js`
- por qué: los distingue de los unit tests de lógica y agrupa los guardas contra drift
- visto en: (ejemplo — no rastrea ningún cambio real)

<!-- FIN DEL EJEMPLO / END OF EXAMPLE -->
<!-- ───────────────────────────────────────────────────────────────────── -->

Ninguna convención real registrada aún. Las convenciones se agregan manualmente cuando
emergen patrones recurrentes a través de múltiples cambios SDD.
