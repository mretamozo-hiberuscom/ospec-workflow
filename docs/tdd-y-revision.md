# Strict TDD y revision

Este workflow protege dos cosas que se rompen enseguida con IA: calidad de tests y carga de review.

La IA puede escribir mucho codigo rapido. Precisamente por eso necesita frenos. No por miedo, sino porque queremos que el resultado se pueda verificar, revisar y mantener.

## Strict TDD

Strict TDD se activa cuando el contexto del proyecto indica `strict_tdd: true` y hay un test runner disponible. `sdd-init` detecta y persiste esa capacidad en `openspec/config.yaml`.

Cuando esta activo, `sdd-apply` debe seguir este ciclo por tarea:

```text
SAFETY NET -> RED -> GREEN -> TRIANGULATE -> REFACTOR
```

| Paso | Que exige |
| --- | --- |
| Safety Net | Ejecutar tests existentes relevantes antes de tocar codigo existente. |
| RED | Escribir primero un test que falle o que apunte a codigo aun inexistente. |
| GREEN | Implementar lo minimo para que el test pase y ejecutar el test. |
| TRIANGULATE | Anadir casos distintos para forzar logica real, no hardcode. |
| REFACTOR | Mejorar el codigo manteniendo tests verdes. |

TDD no es "hacer tests". TDD es disenar desde comportamiento. Si escribes el codigo primero y luego un test que lo acompana, eso puede ser testing, pero no es TDD.

## Evidencia obligatoria

`sdd-apply` debe guardar una tabla de evidencia en `apply-progress.md`:

```markdown
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
```

`sdd-verify` despues comprueba esa evidencia contra archivos y ejecuciones reales. Si falta o no se puede probar, es CRITICAL.

En paralelo, `tasks.md` refleja el estado real del trabajo:

- `[ ]` no empezado
- `[~]` implementado pero con verificacion local pendiente
- `[x]` implementado y verificado localmente

`apply-progress.md` ya no se trata como snapshot descartable. `sdd-apply` debe leer el progreso previo y hacer merge append-first para no perder evidencia historica.

## Niveles de evidencia en verify

`sdd-verify` clasifica cada escenario con la evidencia mas fuerte que puede probar:

| Nivel | Que demuestra |
| --- | --- |
| `runtime-test` | Un test automatizado se ejecuto y paso. |
| `static-proof` | Build, typecheck, schema validation o equivalente prueba el comportamiento. |
| `inspection-proof` | La inspeccion del codigo vincula el escenario con rutas concretas y una justificacion tecnica. |
| `manual-proof` | Hubo verificacion manual registrada. |
| `no-proof` | No hay evidencia creible. |

Regla dura:

- Un MUST necesita `runtime-test` o un `static-proof` aceptado.
- Un SHOULD puede pasar con `inspection-proof`, pero deja WARNING.
- Un MAY puede vivir con evidencia mas debil si la limitacion queda documentada.
- `no-proof` es CRITICAL para MUST y WARNING para SHOULD/MAY.

## Veredictos y routing

El cierre de verify es uno de estos:

| Veredicto | Uso |
| --- | --- |
| `PASS` | No hay hallazgos que bloqueen y la evidencia cumple el nivel exigido. |
| `PASS WITH WARNINGS` | El cambio es aceptable, pero quedan riesgos o pruebas mas debiles de lo ideal. |
| `FAIL` | Hay CRITICAL, tareas core incompletas o falta evidencia obligatoria. |

Cada CRITICAL o WARNING debe salir con pista de origen: `code-bug`, `tasks-gap`, `design-gap` o `spec-gap`. Eso evita el antipatron de "arreglar cualquier cosa" sin tocar la fuente real del problema.

`sdd-archive` solo puede cerrar cambios con `PASS` o con `PASS WITH WARNINGS` cuando esos riesgos quedan aceptados o convertidos en follow-up. `FAIL` bloquea archive.

## Calidad de aserciones

No todo test cuenta. Un test malo es peor que nada porque da confianza falsa.

Patrones prohibidos:

| Patron | Por que no vale |
| --- | --- |
| `expect(true).toBe(true)` | No ejecuta codigo de produccion. |
| Render sin assert de comportamiento | Solo prueba que no explota. |
| Assert solo de tipo o existencia | No verifica salida concreta. |
| Loop que puede iterar cero veces | La asercion puede no ejecutarse nunca. |
| Assert de clases CSS | Acopla a implementacion visual, no a comportamiento. |

Un test valido llama codigo de produccion, verifica una salida especifica y fallaria si la logica estuviera mal.

## Capas de test

La capa se elige por el comportamiento:

| Comportamiento | Capa preferida |
| --- | --- |
| Calculo, transformacion, regla pura | Unit |
| Render, interaccion de componente, estado local | Integration o unit con mocks pequenos |
| Flujo entre componentes, API, provider, router | Integration |
| Journey critico de usuario | E2E si existe; si no, integration |

Si una capa no existe, se degrada a la siguiente disponible. Lo que no se permite es saltarse la prueba.

## Presupuesto de revision

El presupuesto base es:

```text
400 changed lines = additions + deletions
```

No es una ley fisica, es una barrera contra reviews imposibles. Una PR enorme fuerza al reviewer a elegir entre bloquear todo o mirar por encima. Eso no es colaboracion tecnica seria.

`sdd-tasks` debe incluir cerca del principio:

```text
Decision needed before apply: Yes|No
Chained PRs recommended: Yes|No
Chain strategy: stacked-to-main|feature-branch-chain|size-exception|pending
400-line budget risk: Low|Medium|High
```

## Estrategias de entrega

| Estrategia | Uso |
| --- | --- |
| `ask-on-risk` | Default seguro: si hay riesgo alto, pregunta antes de aplicar. |
| `auto-chain` | Divide automaticamente en slices revisables. |
| `single-pr` | Obliga a aceptar `size:exception` si se supera presupuesto. |
| `exception-ok` | Continua porque la excepcion ya esta aceptada. |

## Tipos de cadena

| Tipo | Como funciona |
| --- | --- |
| `stacked-to-main` | PRs pequenas que entran a `main` en orden. |
| `feature-branch-chain` | Una rama tracker acumula la feature; cada PR hija apunta a la anterior para mantener diff limpio. |
| `size:exception` | Una sola PR grande con aprobacion consciente. |

La decision buena depende del riesgo. Si los slices son independientes, `stacked-to-main` suele ser mas simple. Si necesitas integrar antes de tocar `main`, `feature-branch-chain` da mas control. Si el diff es generado o indivisible, `size:exception` puede ser razonable.
