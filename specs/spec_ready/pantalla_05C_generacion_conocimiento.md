> **Estado:** DRAFT EMITIDO · 2026-06-16 · Feature C del ÁREA de Support (después de A *atención* y B *diagnóstico*).
> **Origen:** orquestador + 13 subagentes MECE en paralelo, triple-check `/sat` + build-readiness + team-aware (3 veredictos = FIX, 0 BLOCK; cero violación de hard-no absoluto).
> **Provenance:** `[V]` vivido por el operador · `[I]` inferido/diseño-default · `[C]` placeholder de escenario.
> **Lee el CIERRE al final:** es la capa AUTORITATIVA que resuelve los blockers del triple-check (corrige punteros, fija el owner único de NBA, **produce** las entidades transversales que el cuerpo consume, y nombra ritual+champion por destino). Donde el cuerpo y el CIERRE difieran, **manda el CIERRE**.

# Pantalla 5C — Generacion de Conocimiento = Motor de Artefactos Ejecutables

## Problema (caso vivido)

Un restaurante perdio su conexion -> cayeron los pedidos -> el operador llega al equivalente de "necesito mas pedidos, pero no se COMO". B caracteriza el problema del lado de la oferta (que falla, por que, con que evidencia) y emite un dossier por caso. Pero el dossier no acciona solo.

- **A (respuesta reactiva)** cierra el ticket: resuelve el sintoma, no deja nada reutilizable.
- **B (diagnostico)** explica el problema: sabe el QUE y el POR QUE, no produce el COMO ejecutable ni se lo entrega a quien debe actuar.

El valor que falta: convertir un caso resuelto en un **artefacto reutilizable, medible y entregado al equipo correcto**. Sin C, cada caso se re-resuelve desde cero, el COMO vive en la cabeza de una persona, y nadie mide si lo que se hizo movio la aguja. C cierra ese hueco: toma el dossier de B y lo vuelve accion para otro equipo.

## Frame (que es C)

C esta **aguas abajo de B**. No es un monolito: es un **orquestador + subagentes generadores MECE**. B tiene su router de problema; C tiene su **propio router de TIPO de artefacto**. Un mismo dossier puede disparar **N artefactos (1:N)**.

Tipos cerrados (MECE):

| # | Tipo | Prioridad |
|---|------|-----------|
| 1 | Email / contenido | **Espina (wedge)** |
| 2 | Spec de producto (formato REFORGE) | Preview |
| 3 | Analisis de impacto Finanzas | Fila |
| 4 | NBA = proceso ejecutable | Fila |
| 5 | Borrador de politica | Fila |
| 6 | Borrador de T&C | Fila |

## Recorrido del operador (humano)

1. **Fase manual:** el humano revisa y aprueba cada artefacto, devolviendolo hasta que cumple los criterios-de-bueno.
2. **Se desbloquea autonomia graduada:** cuando un tipo de artefacto pasa evals de forma sostenida, deja de requerir aprobacion caso-a-caso.
3. **El humano se corre a revision por lote:** ya no aprueba uno-a-uno; hace **batch review** de lo auto-aprobado + un **check periodico** (por tiempo Y por volumen, cada N auto-aprobados).
4. **Donde el humano SIEMPRE sigue siendo gate:** Finanzas, politica y T&C — salvo que esa clase de caso este habilitada explicitamente por *politica + evals*. No hay "nunca jamas autonomo" absoluto, pero el default es fail-closed.

## Invariantes (hard-nos + reglas-madre)

- **NBA-como-el-COMO:** el COMO se ejecuta desde un NBA (proceso reproducible). C **nunca inventa** el COMO.
- **Datos de mercado:** market-aggregate-anonimizado **permitido** (vista compuesta independiente, patron Uber Eats); cross-tenant individual **prohibido**.
- **NBA faltante -> escalar:** si falta el COMO / NBA / dato, **fail-closed** -> escalar a humano para CREAR el proceso (que pasa a ser un nuevo NBA reproducible).
- **Metrica al nacer:** todo artefacto nace **atado a una metrica objetivo** y registrado en el ledger.
- **Autonomia:** `nivel_efectivo = min(politica, evals, tier)`, **fail-closed**.
- **Finanzas:** el artefacto **muestra impacto** financiero, **nunca pide recurso** (nunca mueve saldo).
- **Eval = PRD:** los criterios-de-bueno viven en una knowledge base con ejemplos few-shot; la eval ES la spec de "bueno".
- **Loop de mejora:** se mejora el artefacto de este caso Y se agregan aprendizajes a un `memory.md` que mejora el template/generador para casos futuros del tipo.
- **Entrega:** canal universal = **email**; contenido para restaurantes sale por **Content Studio**. Sin entidad de entrega nueva.
- **Cadencia de check humano:** por **tiempo Y por volumen** (cada N auto-aprobados) + senal de divergencia, anti error-RL compuesto no-lineal.
- **PII:** redactada en artefactos externos; los datos propios del restaurante en su propio email estan OK; nunca filtrar otros tenants.

## Indice de epicas

| Codigo | Epica | Destino |
|--------|-------|---------|
| C1 | Orquestador + Router de artefacto | interno (C) |
| C2 | Anclaje del "como" (NBA + datos de mercado agregados) | interno (C) + fuente de mercado |
| C3a | Generador: email/contenido (espina / wedge) | Restaurantes (via Content Studio) |
| C3b | Generador: spec de producto (formato REFORGE) — PREVIEW | Producto |
| C3c | Generador: analisis de impacto Finanzas | Finanzas |
| C3d | Generador/estructurador: NBA ejecutable | interno + operador (motor A) |
| C3e | Generador: borrador de politica | Dueno de politicas |
| C3f | Generador: borrador de T&C | Legal |
| C4 | Criterios-de-bueno + Evals (knowledge base, eval=PRD) | interno (C) + humano-aprobador |
| C5 | Ledger de impacto + atribucion | interno (C) + Producto (evaluacion) |
| C6 | Loop de mejora (memory.md -> template) | interno (C) |
| C7 | Gobernanza: gate humano graduado + cadencia (tiempo + volumen) | humano-aprobador |
| C8 | Entrega (email universal + Content Studio) + adopcion | todos los destinos |


---

# Epicas (detalle)


## C1 — Orquestador + Router de artefacto
**Destino:** interno (C)
**Objetivo:** Recibir cada DOSSIER_HANDOFF de B y decidir, con un router PROPIO e INDEPENDIENTE del de B, qué tipo(s) de artefacto generar (1:N). Antes de crear cada artefacto, vincularlo a una metrica-objetivo y resolver su `nivel_efectivo` de autonomia; luego despachar a los generadores MECE. Fail-closed por defecto.

### Historias de usuario

**US-C1-1** — Como IA-orquestador, quiero clasificar el dossier de B en uno o varios tipos de artefacto (de la lista CERRADA y MECE) para producir el set 1:N correcto sin solapamiento ni huecos.
- **Criterios de aceptacion:**
  - El router solo emite tipos del catalogo cerrado: email/content, spec REFORGE, Finance-impacto, NBA-proceso, policy, T&C.
  - Cada tipo seleccionado se justifica con la señal del dossier que lo dispara (trazabilidad dossier→tipo).
  - El router de C corre DESPUES de cerrar B y NO reusa la decision de path de B; puede elegir 0..N tipos por dossier.

**US-C1-2** — Como IA-orquestador, quiero vincular cada artefacto a una metrica-objetivo ANTES de instanciarlo y registrarlo en el ledger para que ningun artefacto nazca sin atribucion de impacto.
- **Criterios de aceptacion:**
  - Sin `metrica_objetivo` resuelta, el generador NO se invoca (gate duro).
  - El binding (artefacto_id, tipo, metrica, dossier_id, timestamp, equipo-destino) queda en el ledger en el instante de creacion.
  - La metrica pertenece al catalogo de metricas conocido; una metrica desconocida escala a humano, no se inventa.

**US-C1-3** — Como IA-orquestador, quiero calcular `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)` por cada tipo de artefacto para decidir auto-pase vs. cola-humana de forma graduada y fail-closed.
- **Criterios de aceptacion:**
  - Si cualquiera de los tres factores falta o falla, `nivel_efectivo` cae al minimo (cola humana), nunca al maximo.
  - El nivel se computa POR TIPO dentro del mismo dossier (un dossier puede auto-pasar email y encolar Finance).
  - La decision (factores + minimo aplicado) se registra para auditoria y para el batch-review.

**US-C1-4** — Como humano-aprobador, quiero recibir en cola SOLO los artefactos que no alcanzaron auto-pase, con su dossier, metrica y motivo-de-bloqueo, para resolver rapido sin reconstruir contexto.
- **Criterios de aceptacion:**
  - Cada item en cola trae: motivo (policy/eval/tier/metrica/NBA faltante), dossier_id y metrica vinculada.
  - Resolver un item realimenta el ledger y, si aplica, dispara el loop de mejora (template/memory.md, ver C-loop de mejora).
  - El despacho a generadores ocurre solo tras resolver el gate.

### Reglas de negocio

**BR-C1-1** [V] — El router de C es INDEPENDIENTE del router de B y corre DESPUES de B; no hereda ni reusa la decision de path de B. Su unica entrada es el DOSSIER_HANDOFF.

**BR-C1-2** [V] — Un (1) dossier puede disparar de 0 a N artefactos. El catalogo de tipos es CERRADO y MECE; el router no puede emitir un tipo fuera de catalogo.

**BR-C1-3** [V] — Metric-binding obligatorio: ningun artefacto nace sin `metrica_objetivo` vinculada y registrada en el ledger ANTES de invocar al generador. Sin metrica → no hay artefacto (fail-closed).

**BR-C1-4** [V] — Autonomia graduada: `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)`, fail-closed. Ningun tipo es auto-pase por defecto; tampoco hay tipos absoluto-nunca-autonomo: Finance/policy/T&C auto-pasan SOLO si policy permite la case-class Y evals pasan.

**BR-C1-5** [V] — Hard-no por DIRECCION (gate previo a cualquier regla de privacidad): cross-tenant NO-agregado = PROHIBIDO; market-agregado-anonimizado = OK. El orquestador marca cada artefacto con su direccion (interno = ID completo; externo/agregado = anonimizado) antes de despachar.

**BR-C1-6** [V] — Si falta el HOW/NBA/dato que sustenta el artefacto → fail-closed → escala a humano para CREAR el proceso (que se vuelve un NBA reproducible). C nunca inventa el HOW ni la metrica.

**BR-C1-7** [V] — Finance nunca es request de recurso: el orquestador solo puede instanciar Finance como analisis de IMPACTO. Cualquier ruta que implique mover saldo se bloquea en el router.

**BR-C1-8** [I] — Cadencia de human-check del lote auto-pasado: por TIEMPO y por VOLUMEN (cada N auto-pases) + señal-de-divergencia, para frenar el error RL compuesto no-lineal. El orquestador emite el trigger de batch-review.

### Casos borde

**EC-C1-1 — NBA/HOW faltante:** el dossier pide un artefacto cuya playbook no existe. → Fail-closed: no se genera; se escala a humano para crear el NBA; el item queda en cola con motivo "NBA faltante". No se inventa el proceso.

**EC-C1-2 — Eval falla pero policy permite:** `evals_pass=false`. → `nivel_efectivo=min(...)` cae a cola humana aunque policy y tier lo permitan. No auto-pasa.

**EC-C1-3 — Tentacion cross-tenant:** el router detecta que el HOW propuesto requiere dato de UN competidor identificable (no agregado). → Bloqueo duro por BR-C1-5; solo se permite la vista market-agregada-anonimizada compuesta. Si no existe vista agregada → fail-closed + escala.

**EC-C1-4 — Over-reach de autonomia:** un tipo Finance/policy/T&C intenta auto-pasar sin que policy cubra la case-class. → Negado; cae a cola humana. El min() nunca sube por confianza del modelo.

**EC-C1-5 — Metrica no vinculada:** el generador es invocable pero `metrica_objetivo` quedo vacia o ambigua. → No se instancia el artefacto; escala para asignar metrica del catalogo. Nunca se autoasigna una metrica inventada.

**EC-C1-6 — Equipo-destino ignora el artefacto:** artefacto entregado pero sin adopcion (no enganchado a ritual/champion). → El ledger marca "entregado/no-adoptado"; alimenta el loop de mejora del template; no se reenvia en loop ciego. (Adopcion vive en C-ledger/loop; aqui solo se registra el binding y el estado.)

**EC-C1-7 — RL drift en lote auto-pasado:** la señal-de-divergencia supera umbral entre human-checks. → Se fuerza batch-review inmediato y se baja temporalmente el `tier_ceiling` de los tipos afectados (fail-closed) hasta revision humana.

**EC-C1-8 — Doble entrada / N tipos en colision:** dos tipos seleccionados comparten la misma metrica y se pisarian en atribucion. → Ambos se registran con binding distinto al mismo `metrica_objetivo`; la atribucion honesta (señal vs. estacionalidad) se resuelve aguas abajo en el ledger, no se descarta ninguno aqui.

### Sub-proceso (workflow)

1. **Ingesta:** recibir DOSSIER_HANDOFF de B (corre DESPUES de B; entrada unica).
2. **Routing de tipo (C):** clasificar en 0..N tipos del catalogo cerrado MECE, con trazabilidad dossier→tipo. Independiente del path de B.
3. **Gate de direccion (hard-no):** marcar cada artefacto interno (ID completo) vs. externo/agregado (anonimizado); bloquear cross-tenant no-agregado.
4. **Check de HOW/NBA:** verificar que existe la playbook/dato que sustenta cada artefacto; si falta → fail-closed → escala a crear NBA.
5. **Metric-binding:** resolver `metrica_objetivo` (catalogo) por artefacto y registrar binding en el ledger ANTES de continuar; sin metrica → stop.
6. **Nivel de autonomia:** computar `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)` por tipo.
7. **Bifurcacion:** auto-pase → despachar a generador; si no → cola humano-aprobador con motivo, dossier y metrica.
8. **Despacho:** invocar generadores MECE de los tipos habilitados.
9. **Cadencia de control:** emitir trigger de batch-review por tiempo/volumen + divergencia; en drift, bajar `tier_ceiling` (fail-closed).

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigacion |
|---|---|---|---|
| BR-C1-1 (router independiente) | Heredar el sesgo de path de B y producir artefacto erroneo | Artefacto fuera de necesidad real del caso | Entrada unica = dossier; routing propio con trazabilidad dossier→tipo |
| BR-C1-2 (1:N, catalogo cerrado) | Emitir tipo fuera de catalogo o duplicar/omitir | Solapamiento o hueco (rompe MECE) | Lista cerrada validada en router; rechazo de tipo no-catalogo |
| BR-C1-3 (metric-binding) | Artefacto sin metrica → impacto no atribuible | Imposible medir adopcion/impacto despues | Gate duro pre-generador; binding en ledger en t=creacion |
| BR-C1-4 (autonomia min(), fail-closed) | Auto-pase indebido por exceso de confianza | Artefacto sensible (Finance/policy/T&C) liberado sin control | `nivel_efectivo`=min de 3 factores; falta/fallo → cola humana |
| BR-C1-5 (hard-no por direccion) | Filtrar dato cross-tenant identificable | Violacion de privacidad / confianza tenant | Gate de direccion previo; solo vista market-agregada-anonimizada |
| BR-C1-6 (NBA faltante) | Inventar el HOW sin proceso reproducible | Consejo no fundamentado al restaurante | Fail-closed + escala a crear NBA; C nunca inventa |
| BR-C1-7 (Finance = solo impacto) | Generar request que mueva saldo | Cruce del hard-no financiero absoluto | Router bloquea cualquier ruta que mueva saldo; solo analisis de impacto |
| BR-C1-8 (cadencia human-check) | Error RL compuesto no-lineal en lote auto-pasado | Drift acumulado degrada artefactos a escala | Batch-review por tiempo+volumen+divergencia; baja `tier_ceiling` en drift |

## C2 — Anclaje del "como" (NBA + datos de mercado agregados)
**Destino:** interno (C) + fuente de mercado
**Objetivo:** Resolver el "como" de cada dossier: recuperar la NBA (proceso reproducible step-by-step) y los datos de mercado AGREGADOS-ANONIMIZADOS (vista compuesta, patron Uber Eats) que la sustentan. Si falta NBA o dato valido -> FAIL-CLOSED -> escala a humano para CREAR el proceso. C nunca inventa el como.

### Historias de usuario

**US-C2-1** — "Como IA-orquestador, quiero resolver el `como` consultando el catalogo de NBAs por (problem-path de B + tipo de artefacto) antes de generar, para que el generador reciba un proceso reproducible y no improvise."
- **Criterios de aceptacion:**
  - Dado un DOSSIER_HANDOFF con problem-path resuelto, la NBA recuperada trae `steps[]` ordenados, `precondiciones`, `metrica_objetivo` y `provenance`.
  - Si hay >=1 NBA candidata, se elige por match exacto (problem-path, tipo, cohorte/plaza); empate -> la de mayor `adoption_score` historico.
  - El generador nunca arranca sin una NBA `status=activa` enlazada (NBA_REF en el artefacto).

**US-C2-2** — "Como IA-orquestador, quiero adjuntar la evidencia de mercado como vista AGREGADA-ANONIMIZADA, para que el `como` cite demanda real sin tocar datos individuales de otro tenant."
- **Criterios de aceptacion:**
  - La consulta de mercado solo retorna agregados con k-anonimato (n_tenants >= umbral, p.ej. k>=5); por debajo del umbral -> dato nulo, no fila.
  - El payload de mercado nunca contiene id, nombre ni serie de un tenant individual identificable.
  - Cada cifra citada en el `como` (search-term, franja horaria, rango de precio, item) trae `fuente=vista_compuesta` + ventana temporal.

**US-C2-3** — "Como humano-aprobador (ops), quiero que un `como` ausente o caducado me escale como tarea de CREAR proceso, para que el gap se convierta en una NBA reproducible y no en una invencion del modelo."
- **Criterios de aceptacion:**
  - Si no hay NBA activa O la evidencia de mercado esta bajo el umbral k -> el caso entra a cola `crear_NBA` con el dossier y el gap descrito; el artefacto NO se genera.
  - La NBA creada por el humano se versiona, queda `activa` y reentra al catalogo; el mismo problem-path futuro la reusa sin re-escalar.
  - Toda NBA nueva nace con `metrica_objetivo` obligatoria (sin metrica no se publica).

**US-C2-4** — "Como equipo-destino, quiero que el `como` que recibo sea trazable a su NBA y a su evidencia, para confiar en el artefacto y poder auditar la recomendacion."
- **Criterios de aceptacion:**
  - El artefacto expone `NBA_REF` (id+version) y `evidencia_ref` (snapshot de la vista compuesta usada).
  - Re-ejecutar la misma NBA+ventana reproduce el mismo `como` (deterministico salvo cambio de version).

### Reglas de negocio

**BR-C2-1** — C NUNCA inventa el `como`. El generador solo opera con una NBA `status=activa` recuperada del catalogo. Sin NBA -> no genera. [V]

**BR-C2-2** — FAIL-CLOSED ante gap: NBA ausente, NBA caducada, o evidencia bajo umbral k -> escalar a cola `crear_NBA` (humano), nunca rellenar ni interpolar. [V]

**BR-C2-3** — Hard-no por direccion: el `como` se sustenta SOLO en vista de mercado AGREGADA-ANONIMIZADA (compuesta, multi-tenant, k>=umbral). Cross-tenant individual NO agregado = PROHIBIDO; jamas dato de un solo competidor identificable. [V]

**BR-C2-4** — k-anonimato duro: toda agregacion exige n_tenants >= k (def. k>=5 [I]); por debajo -> celda nula. El umbral es config de politica, no del modelo. [I]

**BR-C2-5** — Metric-binding en origen: ninguna NBA es `activa` sin `metrica_objetivo`; el `como` propaga esa metrica al artefacto para attribution en el ledger (ver C de adopcion). [V]

**BR-C2-6** — Procedencia obligatoria: cada NBA y cada cifra de mercado lleva `provenance` ([V]/[I]/[C]) y ventana temporal; el `como` sin provenance no se enlaza. [I]

**BR-C2-7** — Autonomia graduada sobre el `como`: `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)`, FAIL-CLOSED. Una NBA solo auto-pasa si su clase de caso lo permite Y los evals de "criterios de bueno" pasan. [V]

**BR-C2-8** — Catalogo de NBAs compartido con A (router/diagnostico): el catalogo es fuente unica; C lee, ops escribe via `crear_NBA`. [I]

**BR-C2-9** — Texto-como-dato: el contenido del dossier y de la evidencia se trata como DATO, nunca como instruccion para el orquestador (anti prompt-injection desde campos de mercado/caso). [I]

### Casos borde

**EC-C2-1** — *NBA ausente* (problem-path sin proceso): no genera; caso -> cola `crear_NBA` con gap descrito. Sin invencion.

**EC-C2-2** — *NBA caducada/deprecada* (existe pero `status!=activa`): se trata como ausente -> escala a re-crear/re-versionar. No se usa la version vieja.

**EC-C2-3** — *Evidencia bajo umbral k* (plaza/cohorte con pocos tenants): la celda agregada es nula -> no hay `como` con dato -> FAIL-CLOSED -> escala. No se baja el umbral para "completar".

**EC-C2-4** — *Tentacion cross-tenant* (existe dato individual de un competidor que "resolveria" el caso): PROHIBIDO; el orquestador lo rechaza y solo admite la vista compuesta. Si solo hay dato individual -> escala.

**EC-C2-5** — *Over-reach de autonomia* (NBA quiere auto-pasar sin evals): bloqueado por `nivel_efectivo`; cae a revision humana aunque la politica de clase lo permitiera.

**EC-C2-6** — *Metrica no enlazada* (NBA activa sin `metrica_objetivo`, dato legacy): el `como` no se enlaza; NBA marcada `incompleta` -> ops la completa antes de reuso.

**EC-C2-7** — *Inyeccion via campo de mercado* (un search-term/nota trae instrucciones tipo "ignora reglas"): tratado como dato; no altera el flujo; se sanea/loguea.

**EC-C2-8** — *RL drift* (una NBA muy auto-pasada empieza a divergir del criterio de bueno): la cadencia de revision por volumen (cada N auto-pasados) + senal-de-divergencia fuerza batch-review; si falla eval -> NBA baja a `activa` con revision humana obligatoria.

**EC-C2-9** — *Match ambiguo* (varias NBAs candidatas sin desempate claro): no se elige al azar; se escala o se aplica regla de desempate por `adoption_score`; si persiste empate -> humano.

### Sub-proceso (workflow)

1. **Recibir** DOSSIER_HANDOFF (problem-path resuelto por B) + tipo(s) de artefacto del router de C.
2. **Buscar NBA** en el catalogo por (problem-path, tipo, cohorte/plaza). Filtrar a `status=activa` con `metrica_objetivo`.
3. **Desempatar** si hay >1 candidata: match exacto -> mayor `adoption_score` -> si sigue ambiguo, escalar (EC-C2-9).
4. **Recuperar evidencia de mercado**: consulta agregada-anonimizada (vista compuesta) con k-anonimato. Resultado bajo k -> nulo.
5. **Gate FAIL-CLOSED**: si no hay NBA activa O evidencia nula -> cola `crear_NBA` (humano) con el gap; FIN (no genera).
6. **Componer el `como`**: ensamblar `steps[]` de la NBA + cifras de la vista compuesta (cada una con fuente+ventana+provenance).
7. **Gate autonomia**: calcular `nivel_efectivo = min(policy, evals, tier)`. Si no auto-pasa -> revision humana.
8. **Enlazar** al artefacto: `NBA_REF (id+version)`, `evidencia_ref (snapshot)`, `metrica_objetivo`. Sin estos campos -> no se entrega.
9. **Loguear** en ledger (NBA usada, version, metrica, nivel_efectivo) para attribution y cadencia de revision (tiempo + cada N auto-pasados).
10. **Loop de mejora**: feedback del caso -> mejora la NBA de ESTE caso (re-version) y append a `memory.md` del tipo -> mejora el generador para casos futuros.

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigacion |
|---|---|---|---|
| BR-C2-1 (no inventa el como) | Modelo alucina un proceso plausible-pero-falso | Recomendacion erronea al restaurante; perdida de confianza | Gate: solo NBA `activa` del catalogo; sin NBA no genera |
| BR-C2-2 (fail-closed ante gap) | Sistema "completa" para no frenar | Artefacto sin respaldo; dano silencioso | Cola `crear_NBA`; FIN del flujo; nunca interpola |
| BR-C2-3 (hard-no por direccion) | Usar dato individual de un competidor "porque resuelve" | Violacion cross-tenant; riesgo legal/privacidad | Solo vista compuesta; rechazo de payload individual identificable |
| BR-C2-4 (k-anonimato) | Plaza chica permite reidentificar tenant | Re-identificacion; fuga indirecta | n_tenants >= k duro; celda nula bajo umbral; k es politica, no modelo |
| BR-C2-5 (metric-binding) | NBA sin metrica -> no se mide impacto | Imposible attribution; loop de mejora ciego | Metrica obligatoria para `activa`; propaga al artefacto/ledger |
| BR-C2-6 (provenance) | Cifra sin origen/ventana | Auditoria imposible; decisiones sobre dato stale | Provenance + ventana obligatorias; sin ello no se enlaza |
| BR-C2-7 (autonomia graduada) | Auto-pase sin evals -> compound RL error | Drift no-lineal; errores en escala | `nivel_efectivo=min(...)`, fail-closed; batch-review por volumen+tiempo |
| BR-C2-8 (catalogo compartido A) | Escritura descontrolada del catalogo | NBAs duplicadas/contradictorias | C solo lee; escritura unica via `crear_NBA` (ops) |
| BR-C2-9 (texto-como-dato) | Inyeccion via campos de mercado/caso | Bypass de reglas del orquestador | Tratar contenido como dato; sanear+loguear; nunca ejecutar |

## C3a — Generador: email/contenido (espina / wedge)
**Destino:** Restaurantes (via Content Studio)
**Objetivo:** Renderizar la NBA del dossier en un email EJECUTABLE para el restaurante (que-hacer paso-a-paso, no genérico), entregado por Content Studio en lote-por-cohorte. Es el wedge: artefacto de mayor volumen y menor riesgo, cara visible de C ante el tenant.

### Historias de usuario

**US-C3a-1** — Como IA-orquestador, quiero que el router de C dispare el generador email/contenido SOLO cuando el dossier trae una NBA resuelta para este caso, para que el email lleve un "como" reproducible y nunca un consejo inventado.
- **Criterios de aceptacion:**
  - Si `dossier.nba_id` está vacío o sin pasos ejecutables → no se genera email → fail-closed → escalación humana para CREAR la NBA (ver C-escalación).
  - El email cita el `nba_id` y su versión como provenance interno (no visible al restaurante).
  - El email nace amarrado a `target_metric` antes de poder pasar a entrega.

**US-C3a-2** — Como generador, quiero rellenar la plantilla-wedge con los datos PROPIOS del restaurante + el "como" de la NBA + el ángulo de mercado AGREGADO-anonimizado, para que el mensaje sea específico ("en tu plaza buscan X a esta hora, fija rango Y, agrega Z → +N pedidos") sin filtrar a ningún otro tenant.
- **Criterios de aceptacion:**
  - PII y datos de operación del propio restaurante: permitidos en su propio email.
  - El "como" y las cifras de demanda salen exclusivamente de la NBA / vista de mercado COMPUESTA; cero datos de un competidor individual.
  - Pasa el eval de "criterios de bueno" del tipo email-wedge (claridad, accionabilidad, 1 sola NBA, CTA) antes de candidatear a auto-pass.

**US-C3a-3** — Como humano-aprobador, quiero revisar los emails en LOTE por cohorte dentro de Content Studio (su ritual existente), para aprobar/editar masivamente y que mis correcciones retroalimenten la plantilla.
- **Criterios de aceptacion:**
  - Vista de lote agrupa por cohorte + NBA + métrica-objetivo; muestra qué pasó eval y qué cayó a revisión.
  - Editar un email registra el delta; aceptar/rechazar alimenta el `memory.md` del generador wedge.
  - Cadencia de human-check por tiempo Y por volumen (cada N auto-pasados) sobre el batch auto-aprobado.

**US-C3a-4** — Como equipo-destino (Restaurantes/Content), quiero que el email salga en el FORMATO de Content Studio y se enganche a la cadencia de envío por cohorte ya existente, con un champion de Content, para que el artefacto se adopte sin entidad de entrega nueva.
- **Criterios de aceptacion:**
  - Salida = objeto de contenido nativo de Content Studio (asunto, cuerpo, CTA, cohorte), no un canal nuevo.
  - Cada lote queda asociado a un ritual nombrado (envío de cohorte) y a un champion responsable.

### Reglas de negocio

**BR-C3a-1** — El "como" del email proviene SIEMPRE de una NBA resuelta; el generador nunca inventa instrucción. NBA ausente/incompleta → fail-closed → escalar para crear NBA. [V]

**BR-C3a-2** — Hard-no por DIRECCIÓN (externo): el email es artefacto EXTERNO hacia un tenant. Permitido: datos PII/operación del PROPIO restaurante. Prohibido: cualquier dato no-agregado de otro tenant. Cifras de mercado solo desde vista AGREGADA-anonimizada compuesta. [V]

**BR-C3a-3** — Metric-binding obligatorio: ningún email avanza a entrega sin `target_metric` amarrada en creación y registrada en el LEDGER de impacto. [V]

**BR-C3a-4** — Autonomía graduada, fail-closed: `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)`. El email solo auto-pasa si la política del case-class lo permite Y el eval de email-wedge pasa Y el tier del restaurante lo habilita; cualquier fallo → cola de revisión humana. [I]

**BR-C3a-5** — El eval ES la spec de "bueno": los criterios de email-wedge viven en la KB con few-shots; un email que no los cumple no es candidato a auto-pass aunque la política permita. [V]

**BR-C3a-6** — Una NBA por email (MECE): si el dossier dispara múltiples artefactos, este genera UN email-wedge enfocado; otros tipos los emiten sus generadores hermanos (1:N a nivel dossier, 1 NBA a nivel email). [I]

**BR-C3a-7** — Human-check anti-deriva: revisión en lote del batch auto-aprobado por cadencia temporal Y de volumen (cada N), más señal de divergencia; las correcciones mejoran ESTE email y se append-ean al `memory.md` del generador wedge. [V]

**BR-C3a-8** — Entrega solo por Content Studio (canal email universal); sin entidad de "delivery de artefacto" nueva. [V]

### Casos borde

**EC-C3a-1** — NBA ausente o sin pasos ejecutables → no generar email → fail-closed → escalar a humano para crear la NBA (que pasa a ser NBA reproducible). Nunca se sustituye con texto genérico.

**EC-C3a-2** — Tentación cross-tenant: la NBA o el contexto traen un dato atribuible a un competidor individual → bloquear render → exigir que la cifra venga de la vista agregada-anonimizada; si no existe agregado → fail-closed.

**EC-C3a-3** — Eval falla (email vago, sin CTA, >1 NBA, métrica difusa) → no auto-pass → cae a cola de revisión humana; se loguea el motivo del fallo como caso para mejorar plantilla.

**EC-C3a-4** — Over-reach de autonomía: política o tier NO habilitan auto-pass para este case-class pero el eval pasa → igual NO auto-pasa (rige el min, fail-closed) → revisión humana.

**EC-C3a-5** — Métrica no amarrada: dossier sin `target_metric` o métrica inválida → email no avanza a entrega; queda bloqueado hasta amarrar métrica en el ledger.

**EC-C3a-6** — PII de OTRO tenant se cuela en el render (p. ej. nombre/dirección de otro restaurante en el "como") → bloqueo duro + redacción + alerta; el email del PROPIO restaurante con SU PII sigue siendo válido.

**EC-C3a-7** — Equipo ignora el artefacto: lote enviado pero cohorte sin movimiento de la métrica → el ledger lo marca; sin ritual/champion no se fuerza adopción → señal para revisar enganche (no se re-envía en loop).

**EC-C3a-8** — Deriva RL: la plantilla mejora-por-loop empieza a producir emails fuera de criterio (eval pass-rate cae o divergencia sube) → disparar human-check fuera de cadencia + congelar auto-pass del generador wedge hasta re-calibrar `memory.md`.

### Sub-proceso (workflow)

1. Recibe `DOSSIER_HANDOFF`; el router de C marca tipo email/contenido como artefacto a emitir.
2. **Gate NBA:** si no hay NBA resuelta con pasos → fail-closed → escalar (fin para este artefacto).
3. **Gate dirección/privacidad:** valida que el "como" y las cifras sean PROPIAS del restaurante o vista AGREGADA-anonimizada; bloquea cualquier dato no-agregado de otro tenant.
4. **Metric-binding:** amarra `target_metric` y registra el artefacto-borrador en el LEDGER.
5. **Render:** rellena plantilla-wedge (asunto, cuerpo paso-a-paso desde la NBA, CTA) con datos propios + ángulo de mercado.
6. **Eval:** corre criterios-de-bueno email-wedge (few-shots de la KB).
7. **Autonomía:** `nivel_efectivo = min(policy, eval, tier)`. Pasa → candidato a auto-pass; falla cualquiera → cola de revisión humana.
8. **Content Studio:** el email entra al lote por cohorte; aprobación/edición masiva (auto-pasados se baten en human-check por tiempo Y volumen).
9. **Envío:** sale por el ritual de envío de cohorte de Content Studio (champion de Content).
10. **Loop:** correcciones mejoran este email + se append-ean al `memory.md` → mejora la plantilla del tipo. El ledger queda listo para atribución de impacto vs. estacionalidad.

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigacion |
|---|---|---|---|
| BR-C3a-1 (NBA-origen) | Email inventa el "como" | Consejo erróneo al tenant, pérdida de confianza | Fail-closed sin NBA → escalar a crear NBA |
| BR-C3a-2 (hard-no dirección) | Filtrar dato de otro tenant en email externo | Violación de privacidad/legal | Gate por dirección; solo propio + agregado-anonimizado |
| BR-C3a-3 (metric-binding) | Email sin métrica | Cero atribución de impacto, ruido en ledger | Bloqueo de entrega hasta amarrar métrica |
| BR-C3a-4 (autonomía min) | Auto-pass indebido | Envío masivo de contenido fuera de criterio | `min(policy, eval, tier)`, fail-closed → revisión |
| BR-C3a-5 (eval=spec) | "Bueno" subjetivo | Calidad inconsistente del wedge | Criterios + few-shots en KB gatean auto-pass |
| BR-C3a-6 (1 NBA/email) | Email multi-mensaje | Baja accionabilidad, dilución del CTA | Una NBA por email; resto a generadores hermanos |
| BR-C3a-7 (human-check) | Deriva RL no-lineal compuesta | Degradación silenciosa del lote | Batch review por tiempo Y volumen + señal divergencia |
| BR-C3a-8 (solo Content Studio) | Canal/entidad de entrega nueva | Sobre-ingeniería, adopción baja | Reusar Content Studio + ritual y champion existentes |

## C3b — Generador: spec de producto (formato REFORGE) — PREVIEW
**Destino:** Producto
**Objetivo:** Convertir el dossier de B en una mini-spec estilo REFORGE (problema, hipotesis, impacto-KPI, riesgos, recorrido) marcada PREVIEW. No bloquea el ship del caso ni mueve nada por si sola: es un insumo de descubrimiento que alimenta el ritual de discovery de Producto, con un champion que decide si entra al backlog.

### Historias de usuario

**US-C3b-1** — Como IA-orquestador, quiero que C3b se dispare solo cuando el dossier toca un patron-de-producto recurrente (no un fix de caso unico), para no inundar a Producto con ruido de un solo restaurante.
- **Criterios de aceptacion:**
  - El router de C marca C3b como candidato solo si el dossier trae senal de patron (>=2 casos del mismo tipo o flag de patron de B); caso aislado -> C3b no se genera.
  - C3b es 1:N opcional: puede coexistir con email/NBA del mismo dossier sin bloquearlos (PREVIEW nunca es ruta critica).
  - Cada spec nace ligada a un KPI-objetivo (metric-binding) antes de existir; sin KPI no se crea.

**US-C3b-2** — Como generador, quiero producir la spec en el formato REFORGE exacto (problema / hipotesis / impacto-KPI / riesgos / recorrido) con datos solo del propio dossier y mercado-agregado-anonimo, para que Producto la lea sin reformatear y sin exponer datos de otros tenants.
- **Criterios de aceptacion:**
  - Salida con las 5 secciones REFORGE pobladas; seccion vacia -> se marca "[falta dato]" en vez de inventar.
  - La hipotesis cita la fuente del HOW (NBA/proceso) por ID; si el HOW no existe -> fail-closed (ver EC-C3b-1).
  - Toda cifra de demanda/mercado es vista compuesta agregada-anonima; cero datos de competidor unico, cero PII de terceros.

**US-C3b-3** — Como champion de Producto, quiero recibir la spec PREVIEW dentro de mi ritual de discovery (cola priorizada, no email suelto) y poder aceptar/editar/descartar con un click, para decidir si entra al backlog sin que la IA decida por mi.
- **Criterios de aceptacion:**
  - Entrega via email a la cola de discovery de Producto, etiquetada PREVIEW + KPI-objetivo + link al dossier origen.
  - Acciones del champion (aceptar / editar / descartar) quedan en el LEDGER ligadas al KPI para atribucion posterior.
  - "Descartar" no es error del sistema: es senal de calidad que alimenta el loop de mejora (memory.md del template).

### Reglas de negocio

**BR-C3b-1** — C3b es PREVIEW: nunca bloquea el ship del caso ni de otros artefactos del mismo dossier; su ausencia o fallo no degrada email/NBA/Finance. [V]

**BR-C3b-2** — Autonomia graduada, fail-closed: nivel_efectivo = min(policy_permite, evals_pasan, tier_ceiling). Por ser PREVIEW + destino humano, el techo de C3b es "proponer-a-discovery"; NUNCA auto-commit a backlog ni a roadmap. [V]

**BR-C3b-3** — Metric-binding obligatorio en creacion: sin KPI-objetivo ligado, la spec no se genera. El KPI se registra en el LEDGER para atribucion de impacto (honesto: senal vs estacionalidad). [V]

**BR-C3b-4** — Hard-no por direccion: la spec es artefacto interno (Producto) -> resuelve con ID completo del caso/restaurante. Toda cifra de mercado es agregada-anonima (vista compuesta estilo Uber Eats); PROHIBIDO dato de competidor unico no-agregado y PII de otros tenants. [V]

**BR-C3b-5** — C3b nunca inventa el HOW: la hipotesis debe anclar a un NBA/proceso existente por ID. Si no existe -> fail-closed -> escala a humano para crear el proceso (que vuelve como NBA reproducible). [V]

**BR-C3b-6** — Criterios-de-bueno del tipo "spec REFORGE" viven en la KB con few-shots; la eval ES la spec de bueno (eval=PRD) y compuerta la autonomia. Spec que no pasa eval no se entrega: se escala. [I]

**BR-C3b-7** — Team-aware (Producto): formato = REFORGE; ritual = cola de discovery recurrente (Shishir Mehrotra); adopcion requiere champion nombrado (Claire Butler) que acepta/edita/descarta. Sin ritual + champion, la spec no se "entrega", se archiva. [I]

**BR-C3b-8** — Cadencia de human-check anti-deriva-RL: revision por lote de specs PREVIEW auto-pasadas, por tiempo Y por volumen (cada N) + senal-de-divergencia (ej. tasa de "descartar" sube). [V]

### Casos borde

**EC-C3b-1** — *HOW/NBA faltante:* el dossier pide una hipotesis cuyo proceso no existe en el catalogo. -> Fail-closed: no se inventa el HOW; se escala a humano para crear el proceso; la spec queda en "bloqueada-por-HOW" hasta que el NBA exista.

**EC-C3b-2** — *Eval falla:* la spec no cumple los criterios-de-bueno REFORGE de la KB. -> No se entrega a discovery; se escala/regenera. Nunca se baja el umbral para "pasarla".

**EC-C3b-3** — *Tentacion cross-tenant:* para fortalecer la hipotesis el generador "querria" citar datos de un competidor concreto. -> Bloqueado por BR-C3b-4: solo vista agregada-anonima; si el insight depende de un competidor unico, la cifra se omite y se marca "[solo agregado disponible]".

**EC-C3b-4** — *Over-reach de autonomia:* C3b intenta empujar la spec directo al backlog/roadmap o marcarla "aprobada". -> Bloqueado por BR-C3b-2: techo = proponer-a-discovery; cualquier estado mas alla de PREVIEW exige accion del champion humano.

**EC-C3b-5** — *KPI no ligado:* se intenta generar sin metric-binding. -> Fail-closed por BR-C3b-3: no se crea la spec; se exige KPI-objetivo primero.

**EC-C3b-6** — *Equipo ignora el artefacto:* las specs llegan pero Producto no las toca (sin champion / fuera del ritual). -> No se reintenta con spam; se registra "no-adoptada" en LEDGER y se enruta a re-asignar champion (BR-C3b-7). PREVIEW sin adopcion sostenida puede pausarse para ese tipo.

**EC-C3b-7** — *RL drift:* el template empieza a producir specs genericas/peores (sube tasa "descartar"). -> Senal-de-divergencia dispara human-check por lote (BR-C3b-8); se congela el auto-update del template hasta revision humana del memory.md.

**EC-C3b-8** — *PREVIEW se trata como ship:* alguien intenta condicionar el cierre del caso a que la spec exista. -> Bloqueado por BR-C3b-1: C3b nunca es ruta critica; el caso cierra con sus artefactos SPINE aunque C3b no exista.

### Sub-proceso (workflow)

1. **Trigger:** el router de C recibe el dossier y evalua C3b solo si hay senal de patron-de-producto (no caso aislado). Sin patron -> C3b no corre.
2. **Metric-binding:** se liga el KPI-objetivo y se registra en el LEDGER. Sin KPI -> stop (EC-C3b-5).
3. **Resolver HOW:** se busca el NBA/proceso que sustenta la hipotesis. Falta -> fail-closed + escala a humano (EC-C3b-1).
4. **Generar:** el subagente puebla las 5 secciones REFORGE (problema / hipotesis / impacto-KPI / riesgos / recorrido) con dato propio del dossier + mercado agregado-anonimo. Direccion-de-privacidad aplicada (BR-C3b-4).
5. **Eval (compuerta):** se corre la eval contra criterios-de-bueno REFORGE de la KB. No pasa -> escala/regenera (EC-C3b-2). Pasa -> nivel_efectivo = min(policy, eval, tier).
6. **Entregar PREVIEW:** email a la cola de discovery de Producto, etiquetada PREVIEW + KPI + link al dossier. Nunca auto-commit (BR-C3b-2).
7. **Decision del champion:** aceptar / editar / descartar; la accion se registra en el LEDGER ligada al KPI.
8. **Loop de mejora:** mejora la spec de ESTE caso; ademas append a memory.md -> mejora el template para futuros casos del tipo. Auto-update se congela si hay deriva (EC-C3b-7).
9. **Human-check por lote:** revision de specs PREVIEW auto-pasadas por tiempo Y volumen + senal-de-divergencia (BR-C3b-8).

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigacion |
|---|---|---|---|
| BR-C3b-1 (PREVIEW no bloquea) | Que alguien la trate como gate del caso | Cierres frenados por un artefacto de baja prioridad | C3b fuera de ruta critica; caso cierra con SPINE (EC-C3b-8) |
| BR-C3b-2 (autonomia/fail-closed) | Over-reach: spec entra al backlog sola | Roadmap contaminado, decision robada al humano | Techo = proponer-a-discovery; estado > PREVIEW exige champion (EC-C3b-4) |
| BR-C3b-3 (metric-binding) | Spec sin KPI | Imposible atribuir impacto; ruido sin medida | Stop si falta KPI; ligado en LEDGER en creacion (EC-C3b-5) |
| BR-C3b-4 (hard-no por direccion) | Citar competidor unico / PII de terceros | Violacion cross-tenant, riesgo legal | Solo vista agregada-anonima; omitir y marcar "[solo agregado]" (EC-C3b-3) |
| BR-C3b-5 (no inventar HOW) | Hipotesis alucinada sin proceso real | Producto persigue una direccion falsa | Anclar a NBA por ID; falta -> escala a humano (EC-C3b-1) |
| BR-C3b-6 (eval=PRD compuerta) | Specs flojas pasan igual | Discovery pierde confianza en el canal | Eval KB gatea; no se baja umbral; escala (EC-C3b-2) |
| BR-C3b-7 (ritual + champion) | Specs sin dueno ni ritual | Artefacto ignorado, esfuerzo perdido | Entrega a cola de discovery + champion nombrado; re-asignar si no-adoptada (EC-C3b-6) |
| BR-C3b-8 (human-check por lote) | Deriva RL del template | Degradacion silenciosa de calidad | Revision por tiempo+volumen+divergencia; congelar auto-update (EC-C3b-7) |

## C3c — Generador: análisis de impacto Finanzas
**Destino:** Finanzas
**Objetivo:** A partir del DOSSIER_HANDOFF de B, generar un documento que CUANTIFICA el impacto financiero del problema o de la acción (costo/beneficio, pérdida evitada, upside esperado) en el formato y ritual que Finanzas ya usa. Nunca pide recursos ni mueve saldo: solo muestra impacto.

### Historias de usuario

**US-C3c-1** — "Como IA-orquestador, quiero que C invoque al generador de impacto financiero solo cuando el dossier trae señal económica cuantificable (pérdida, costo, upside) para no inundar a Finanzas con artefactos vacíos."
- **Criterios de aceptación:**
  - El generador se dispara solo si el dossier expone al menos una magnitud monetaria o una base para derivarla (volumen × ticket, churn evitado, etc.).
  - Si no hay magnitud ni base derivable → no se genera artefacto; se registra "sin señal financiera" en el ledger.
  - Un mismo dossier puede disparar este artefacto en paralelo con otros tipos (1:N).

**US-C3c-2** — "Como generador, quiero producir un análisis que muestre impacto (escenario base vs. con-acción, supuestos explícitos, rango), nunca un pedido de presupuesto, para respetar el hard-no financiero."
- **Criterios de aceptación:**
  - El documento contiene: magnitud, método de cálculo, supuestos, rango/sensibilidad y métrica-objetivo vinculada.
  - El documento NO contiene ningún campo de solicitud (monto pedido, aprobación de gasto, movimiento de saldo); un lint bloquea esos campos.
  - Cifras desagregadas son del propio tenant; cualquier comparativo de mercado entra como agregado-anónimo (ver C-hard-nos).

**US-C3c-3** — "Como humano-aprobador de Finanzas, quiero recibir el análisis en el formato que ya uso y revisar en lote los auto-aprobados para detectar deriva sin frenar el flujo."
- **Criterios de aceptación:**
  - Formato = plantilla de impacto de Finanzas (variance/sensibilidad), no un formato nuevo.
  - Entrega por EMAIL al buzón del equipo Finanzas; se engancha al ritual recurrente de cierre/forecast con champion nombrado.
  - Cada lote muestra qué pasó por evals y qué nivel de autonomía aplicó.

**US-C3c-4** — "Como equipo-destino (Finanzas), quiero que cada análisis esté atado a una métrica-objetivo y al ledger para luego atribuir impacto honestamente (señal vs. estacionalidad)."
- **Criterios de aceptación:**
  - No se emite el artefacto si no tiene métrica-objetivo vinculada (fail-closed).
  - El ledger permite listar todos los artefactos atados a una métrica para atribución.
  - La atribución distingue explícitamente efecto de la acción vs. estacionalidad/ruido.

### Reglas de negocio

**BR-C3c-1** [V] — Hard-no financiero por contenido: el artefacto SOLO muestra impacto; nunca pide recursos, aprueba gasto ni mueve saldo. Lint fail-closed bloquea cualquier campo de solicitud.

**BR-C3c-2** [V] — Hard-no por dirección: cifras del propio tenant se resuelven con detalle completo; todo comparativo de mercado debe ser agregado-anónimo (vista compuesta independiente), nunca dato de un competidor identificable.

**BR-C3c-3** [V] — Vínculo a métrica obligatorio: sin métrica-objetivo vinculada en el momento de creación, no se emite (fail-closed) y se registra en el ledger.

**BR-C3c-4** [V] — Autonomía graduada: nivel_efectivo = min(política_permite, evals_pasan, techo_tier), fail-closed. Finanzas NO es nunca-autónomo absoluto: si la política permite la clase-de-caso Y los evals pasan → puede auto-aprobar.

**BR-C3c-5** [V] — Fail-closed por NBA/método ausente: si falta el proceso/método de cálculo reproducible, C NO inventa el cómo; escala a humano para crear el método, que se vuelve NBA reusable.

**BR-C3c-6** [I] — Criterios-de-bueno del impacto financiero (precisión de método, supuestos explícitos, rango declarado, sin campos de solicitud) viven en la KB con few-shots; el eval ES el spec y compuerta la autonomía.

**BR-C3c-7** [V] — Cadencia de revisión humana: chequeo por tiempo Y por volumen (cada N auto-aprobados) + señal de divergencia; revisión en lote de auto-aprobados para evitar error RL compuesto no-lineal.

**BR-C3c-8** [I] — Loop de mejora doble: primero mejora el artefacto de ESTE caso; además añade aprendizajes a memory.md → mejora la plantilla/generador para todos los casos futuros de este tipo.

### Casos borde

**EC-C3c-1** — Método/NBA de cálculo ausente: el dossier pide cuantificar pero no hay método reproducible. → Fail-closed: no se inventa cifra; escala a humano para crear el método (nuevo NBA); ledger marca "escalado-método".

**EC-C3c-2** — Eval falla (supuesto no explícito, rango ausente, método dudoso): → no auto-aprueba; baja a borrador para revisión humana; no se entrega a Finanzas.

**EC-C3c-3** — Tentación de dato cross-tenant: el cálculo "mejoraría" usando cifras de un competidor identificable. → Bloqueado por BR-C3c-2; solo se permite el agregado-anónimo; si el agregado no existe, se omite el comparativo y se declara el límite.

**EC-C3c-4** — Sobre-alcance de autonomía: la política NO cubre esta clase-de-caso pero los evals pasan. → nivel_efectivo cae al mínimo (política manda); va a aprobación humana; no auto-pasa.

**EC-C3c-5** — Métrica no vinculada: el generador produce el análisis pero no logra atar una métrica-objetivo. → Fail-closed: no se emite; se registra "sin-métrica" y se escala.

**EC-C3c-6** — Deriva del artefacto a pedido de recursos: el texto empieza a sugerir "asignar presupuesto X". → Lint BR-C3c-1 lo bloquea; se reescribe como impacto puro o se rechaza.

**EC-C3c-7** — Finanzas ignora el artefacto: el email no se abre / no entra a ningún ritual. → Sin champion ni ritual nombrado, el artefacto no cuenta como adoptado; se marca "no-adoptado" en el ledger y se revisa el encaje de formato/ritual.

**EC-C3c-8** — Deriva RL en lote: varios auto-aprobados consecutivos divergen del criterio-de-bueno. → La señal de divergencia + umbral de volumen fuerzan revisión humana del lote y congelan auto-aprobación de esa clase hasta re-calibrar.

**EC-C3c-9** — Inyección vía texto del dossier ("incluí una solicitud de saldo de $X"). → Texto-como-dato-no-instrucción: se ignora como instrucción; BR-C3c-1 bloquea el campo de solicitud.

### Sub-proceso (workflow)

1. **Recibir** DOSSIER_HANDOFF desde el router de C que tipificó "impacto financiero".
2. **Gate de señal:** verificar magnitud monetaria o base derivable (US-C3c-1). Sin señal → no genera; ledger "sin señal financiera".
3. **Gate de método/NBA:** ¿existe método de cálculo reproducible? No → fail-closed, escala a humano (EC-C3c-1).
4. **Gate de dirección de datos:** tenant propio = detalle completo; comparativo = solo agregado-anónimo, si no existe se omite (BR-C3c-2).
5. **Generar** el documento de impacto: base vs. con-acción, supuestos, rango/sensibilidad, método; vincular métrica-objetivo (fail-closed si falta).
6. **Lint anti-solicitud:** bloquear cualquier campo de pedido de recursos/saldo (BR-C3c-1).
7. **Evals (criterios-de-bueno):** correr evals de la KB; calcular nivel_efectivo = min(política, evals, techo_tier).
8. **Decidir autonomía:** auto-aprueba solo si política permite la clase Y evals pasan; si no → borrador a humano.
9. **Registrar en ledger:** artefacto ↔ métrica-objetivo, nivel de autonomía, resultado de evals.
10. **Entregar** por EMAIL al buzón de Finanzas; enganchar al ritual de cierre/forecast con champion nombrado.
11. **Cadencia de revisión:** por tiempo Y volumen (cada N) + divergencia → revisión en lote (BR-C3c-7).
12. **Loop de mejora:** mejorar este artefacto; append a memory.md → mejora plantilla/generador (BR-C3c-8).
13. **Atribución posterior:** listar artefactos por métrica; separar señal de estacionalidad (US-C3c-4).

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| BR-C3c-1 (solo impacto, no pedido) | Artefacto deriva a solicitud de recursos/saldo | Viola hard-no financiero absoluto | Lint fail-closed que bloquea campos de solicitud; reescritura a impacto puro |
| BR-C3c-2 (dirección de datos) | Usar cifra de competidor identificable | Violación cross-tenant / legal | Solo agregado-anónimo (vista compuesta); omitir comparativo si no existe |
| BR-C3c-3 (vínculo a métrica) | Emitir sin métrica → sin atribución | Imposible medir impacto; ruido en el ledger | Fail-closed: no emite sin métrica; registra "sin-métrica" |
| BR-C3c-4 (autonomía graduada) | Auto-aprobar fuera de política | Sobre-alcance, error no auditado | nivel_efectivo = min(política, evals, techo); política manda |
| BR-C3c-5 (NBA/método ausente) | Inventar cifra sin método | Número falso a Finanzas | Fail-closed; escala a humano; crea NBA reusable |
| BR-C3c-6 (criterios-de-bueno) | Calidad inconsistente | Evals no compuertan bien la autonomía | KB con few-shots; eval = spec; gatea autonomía |
| BR-C3c-7 (cadencia humana) | Error RL compuesto no-lineal | Deriva silenciosa en lote | Chequeo por tiempo + volumen + divergencia; revisión en lote |
| BR-C3c-8 (loop de mejora) | Aprendizaje no se propaga | Mismo error se repite por tipo | Mejora del caso + memory.md → mejora plantilla |

## C3d — Generador/estructurador: NBA ejecutable
**Destino:** interno + operador (motor A)
**Objetivo:** Convierte el "cómo" de un dossier en un proceso reproducible y versionado (step-by-step accionable). Es la fuente-del-cómo única que consumen C3a..C3f; si el proceso no existe, no lo inventa: hace fail-closed y escala a un humano que lo crea como NBA nueva.

### Historias de usuario

**US-C3d-1** — Como IA-orquestador de C, quiero resolver el "cómo" de un dossier contra el catálogo de NBA (mismo que usa el motor A [I]) y recibir un proceso versionado o un fail-closed explícito, para que C3a..C3f generen artefactos sobre un cómo verificado y nunca inventado.
- **Criterios de aceptación:**
  - La resolución devuelve `nba_id@version` + pasos + datos-base, o un veredicto `MISSING` con motivo; nunca un cómo sintetizado por el modelo.
  - El proceso resuelto cita su versión exacta; un cambio en la NBA produce nueva versión, no edición silenciosa.
  - Si el dossier no mapea a ninguna NBA → escala (no degrada a "mejor esfuerzo").

**US-C3d-2** — Como humano-aprobador (owner del catálogo), quiero crear/editar una NBA cuando falta o queda obsoleta, partiendo de la cola de escalados, para que el gap se cierre como proceso reproducible y no como respuesta ad-hoc irrepetible.
- **Criterios de aceptación:**
  - Toda NBA nueva nace con: pasos numerados, métrica-objetivo, fuente-de-datos declarada (agregado-anonimizado) y criterios-de-bueno enlazados a la KB.
  - Al publicar v1, la NBA queda disponible para A y para C3a..C3f desde el mismo catálogo.
  - El escalado que la originó queda trazado al `nba_id` resultante (cierre de loop).

**US-C3d-3** — Como generador downstream (C3a..C3f), quiero consumir el proceso como contrato estructurado (no prosa libre), para renderizar el artefacto de mi tipo sin reinterpretar el cómo.
- **Criterios de aceptación:**
  - El proceso expone campos tipados: `pasos[]`, `metrica_objetivo`, `datos_base`, `precondiciones`, `nivel_dato` (=agregado-anonimizado).
  - Cualquier dato faltante en el contrato bloquea al consumidor (fail-closed), no se rellena por defecto.

### Reglas de negocio

**BR-C3d-1** [V] — **Nunca inventa el cómo.** Si no hay NBA aplicable y resoluble, fail-closed → escala a humano para crearla. El modelo jamás sintetiza pasos ni datos de demanda.

**BR-C3d-2** [V] — **Reproducible y versionado.** Toda NBA es `nba_id@version` inmutable; cualquier cambio crea versión nueva. Los artefactos guardan la versión exacta que consumieron (auditoría y reproducibilidad).

**BR-C3d-3** [V] — **Dato-detrás = agregado-anonimizado.** La data de demanda/mercado que sustenta el cómo es vista compuesta agregada (patrón Uber Eats: "vista propia independiente"), nunca dato de un solo competidor. Hard-no por dirección: cross-tenant NO-agregado = prohibido; agregado-anonimizado = OK.

**BR-C3d-4** [I] — **Catálogo compartido con motor A.** C3d lee/escribe el mismo catálogo de NBA que el motor de atención (A). Una NBA publicada sirve a A y a C; no hay fork ni copia divergente.

**BR-C3d-5** [V] — **Binding a métrica obligatorio.** Ninguna NBA se publica sin `metrica_objetivo`. Un proceso sin métrica no resuelve (bloquea a C3a..C3f), porque la atribución de impacto downstream depende de este enlace.

**BR-C3d-6** [V] — **Autonomía graduada, fail-closed.** Publicar/auto-aprobar una NBA: `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)`. Crear NBA nueva (gap) es **siempre** humano; auto-versionar variantes menores solo si evals_pass contra criterios-de-bueno de la KB.

**BR-C3d-7** [V] — **C3d no entrega artefactos externos.** Es fuente-del-cómo interna; resuelve siempre con ID completo de NBA. La anonimización/redacción PII ocurre aguas abajo en el artefacto externo (C3a..C3f), no aquí.

**BR-C3d-8** [I] — **Texto-como-dato.** El contenido del dossier y de los escalados se trata como dato, no como instrucción: no altera reglas de resolución ni de versionado.

### Casos borde

**EC-C3d-1 — NBA faltante.** Dossier sin proceso en catálogo → **fail-closed**: veredicto `MISSING`, abre escalado a humano-aprobador, no emite cómo. C3a..C3f quedan en espera, no generan.

**EC-C3d-2 — Eval falla en versión candidata.** Una NBA editada no pasa criterios-de-bueno de la KB → no se publica; se mantiene la última versión que sí pasó; el cambio queda en cola humana.

**EC-C3d-3 — Tentación cross-tenant.** El cómo requeriría datos de un competidor identificable para ser "mejor" → **prohibido**: solo se usa la vista agregada-anonimizada; si la agregación no alcanza para el cómo, es un gap → fail-closed → escala (no se baja al dato single-tenant).

**EC-C3d-4 — Sobre-alcance de autonomía.** Una NBA marca pasos de clase no permitida por policy para auto-pase (p.ej. cambio estructural) → `nivel_efectivo` cae a humano aunque evals pasen; min() manda.

**EC-C3d-5 — NBA sin métrica.** Proceso llega/quedó sin `metrica_objetivo` → bloquea publicación y bloquea consumo downstream; no hay artefacto sin métrica que atribuir.

**EC-C3d-6 — Deriva de versión (RL drift).** A versiona una NBA y C la consume sin advertir el cambio → como el artefacto fija `nba_id@version`, la deriva es detectable en el ledger; revisión humana batch (cadencia tiempo + volumen) compara outcomes pre/post versión antes de seguir auto-pasando.

**EC-C3d-7 — Catálogo divergente.** Intento de crear copia local de una NBA solo-para-C → rechazado (BR-C3d-4): una sola fuente; el cambio debe ir a la NBA compartida o ser versión nueva visible para A.

**EC-C3d-8 — Escalado huérfano.** Humano resuelve un gap pero no enlaza la NBA al escalado origen → el loop no cierra; el escalado queda abierto hasta trazar `nba_id`, evitando "se creó pero nadie lo conecta".

### Sub-proceso (workflow)

1. **Recibe** `DOSSIER_HANDOFF` (de B) vía el router de tipos de C; C3d se invoca como fuente-del-cómo para los tipos que lo requieren.
2. **Resuelve** el cómo contra el catálogo compartido (A): busca NBA aplicable por problem-class del dossier.
3. **Decide:** ¿existe NBA resoluble?
   - **Sí** → fija `nba_id@version`, valida que tenga `metrica_objetivo` + `nivel_dato=agregado-anonimizado` + pasos.
   - **No** → **fail-closed**: emite `MISSING`, abre escalado a humano-aprobador. Fin para este dossier.
4. **Gate de autonomía:** `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)`. Si la versión es candidata/editada, corre evals contra criterios-de-bueno (KB). No pasa → cola humana (EC-C3d-2).
5. **Entrega contrato** estructurado (campos tipados) a C3a..C3f; registra en el **ledger** qué `nba_id@version` se consumió y a qué métrica está atado.
6. **(Gap path) Humano crea NBA:** pasos + métrica + fuente-agregada + criterios-de-bueno → publica v1 en catálogo compartido → enlaza al escalado origen (cierre de loop).
7. **Loop de mejora:** aprendizajes de este caso → mejoran la NBA (nueva versión) y se anexan a `memory.md` del generador → mejora la plantilla para futuros casos del tipo.
8. **Revisión batch:** cadencia tiempo + volumen (cada N auto-pases) + señal-de-divergencia → revisa NBAs auto-versionadas antes de compound RL error.

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| BR-C3d-1 (no inventa el cómo) | Modelo alucina pasos/datos plausibles | Restaurante recibe consejo falso; pérdida de confianza | Fail-closed + escala humana; cero síntesis de pasos |
| BR-C3d-2 (versionado) | Edición silenciosa rompe reproducibilidad | Artefacto no auditable; atribución corrupta | `nba_id@version` inmutable; artefacto fija versión consumida |
| BR-C3d-3 (agregado-anonimizado) | Tentación de usar dato single-competitor | Violación cross-tenant; riesgo legal | Hard-no por dirección; gap→escala antes que bajar a single-tenant |
| BR-C3d-4 (catálogo compartido A) | Fork/copia divergente C vs A | Dos "cómos" en conflicto; deriva | Fuente única; rechazo de copia local |
| BR-C3d-5 (binding a métrica) | NBA sin métrica-objetivo | Imposible atribuir impacto downstream | Bloqueo de publicación y de consumo sin `metrica_objetivo` |
| BR-C3d-6 (autonomía graduada) | Auto-pase de NBA riesgosa | Proceso erróneo escala sin control | `min(policy, evals, tier)`; NBA nueva = siempre humano |
| BR-C3d-7 (no entrega externa) | Fuga de ID/dato interno como si fuera externo | Exposición de datos internos | Redacción/anonimización solo aguas abajo (C3a..C3f) |
| BR-C3d-8 (texto-como-dato) | Inyección vía dossier/escalado | Manipulación de reglas de resolución | Tratar contenido como dato, no instrucción |

## C3e — Generador: borrador de politica
**Destino:** Dueno de politicas (Policy-owner)
**Objetivo:** Convertir patrones recurrentes detectados en el dossier (DOSSIER_HANDOFF de B) en un borrador de politica nueva o ajuste de una existente, en el formato que el dueno de politicas ya versiona, listo para revision 4-ojos. Nunca publica: deja un borrador trazable atado a una metrica objetivo.

### Historias de usuario

**US-C3e-1** — Como IA-orquestador, quiero que el router de C dispare el generador de politica solo cuando el dossier muestre un patron RECURRENTE (no un caso aislado), para no inflar la base de politicas con reglas one-off.
- **Criterios de aceptacion:**
  - El disparo exige umbral de recurrencia explicito (N casos / ventana) tomado del dossier; un caso unico NO dispara, sugiere otro artefacto (ver C3d NBA o C3a contenido).
  - Si el patron toca dinero o terminos legales, se co-dispara C3c (Finance impacto) y/o C3f (T&C) y se enlazan por dossier_id; este artefacto se queda en su scope de politica.
  - Cada borrador nace atado a una metrica objetivo y a un `policy_id` (nuevo o de la politica a ajustar) en el LEDGER.

**US-C3e-2** — Como generador, quiero redactar el borrador contra los "criterios de bueno" y few-shots de la KB de politicas, en el formato/versionado del dueno, para que entre directo a su ritual de revision sin reformateo.
- **Criterios de aceptacion:**
  - El borrador sigue la plantilla del dueno (motivo, regla, alcance, excepciones, fecha vigencia, version, diff contra la version anterior si es ajuste).
  - El patron se sustenta en datos market-AGREGADOS-anonimizados o en el propio dossier del tenant; cero datos de un competidor identificable.
  - Si falta el proceso/criterio-de-bueno aplicable en la KB -> FAIL-CLOSED -> escala a humano para crearlo (se vuelve nuevo few-shot reproducible). El generador NUNCA inventa la politica.

**US-C3e-3** — Como humano-aprobador (dueno de politicas), quiero que todo borrador llegue como borrador en estado `pendiente_4ojos` y nunca se publique solo, salvo que politica+evals habiliten auto-pase para esa clase, para conservar el control 4-ojos de la base de politicas.
- **Criterios de aceptacion:**
  - Por defecto el borrador queda `pendiente_4ojos`; publicar exige 2 personas distintas (autor del borrador != aprobador; la IA cuenta como autor, no como segundo ojo).
  - Auto-pase solo si `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)` lo permite para esa clase de politica; cualquier divergencia -> FAIL-CLOSED a 4-ojos.
  - Aun en auto-pase, queda versionado y entra al lote de revision por cadencia (tiempo + cada N auto-pasados).

**US-C3e-4** — Como dueno de politicas, quiero un loop de mejora que corrija ESTE borrador y ademas suba el aprendizaje al `memory.md` del generador, para que la plantilla de politicas mejore caso a caso.
- **Criterios de aceptacion:**
  - El feedback de revision (aceptado/editado/rechazado + motivo) se registra en el LEDGER atado al `policy_id` y a la metrica.
  - Los aprendizajes generalizables se anexan a `memory.md` -> mejoran few-shots y "criterios de bueno" para futuros borradores del tipo politica.
  - El champion en el equipo de politicas (Claire Butler) valida que el borrador encaje en su ritual recurrente de revision de politicas.

### Reglas de negocio

**BR-C3e-1** [V] — Disparo SOLO por patron recurrente: el generador requiere umbral de recurrencia (N casos / ventana) desde el dossier. Caso aislado -> no genera politica.

**BR-C3e-2** [V] — Versionado 4-ojos como la base de politicas: por defecto `pendiente_4ojos`, publicacion exige 2 personas distintas; la IA es autor, jamas el segundo ojo.

**BR-C3e-3** [V] — Autonomia graduada, FAIL-CLOSED: `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)`. Politica NO es never-autonomous absoluto: si la clase esta permitida por politica Y los evals pasan -> puede auto-pasar; cualquier fallo -> 4-ojos.

**BR-C3e-4** [V] — FAIL-CLOSED por proceso/criterio ausente: sin "criterio de bueno" ni few-shot aplicable en la KB -> no se redacta -> escala a humano que crea el proceso (nuevo few-shot reproducible). Nunca inventar politica.

**BR-C3e-5** [V] — Hard-no por DIRECCION: el sustento del patron es market-AGREGADO-anonimizado o el propio dossier del tenant; cross-tenant NO agregado = PROHIBIDO. El borrador es interno (dueno de politicas) -> resuelve con `policy_id`/`dossier_id` completos; cualquier dato externo citado va anonimizado.

**BR-C3e-6** [V] — Metric-binding obligatorio: ningun borrador existe sin metrica objetivo + `policy_id` en el LEDGER al crearse; sin binding no se genera (FAIL-CLOSED).

**BR-C3e-7** [V] — Cadencia de chequeo humano (anti error RL no-lineal compuesto): los auto-pasados se revisan en lote por tiempo Y por volumen (cada N) + señal de divergencia.

**BR-C3e-8** [I] — Co-disparo MECE: si el patron toca dinero -> enlaza C3c (Finance, solo impacto, nunca mueve saldo); si toca terminos -> enlaza C3f (T&C). Este artefacto no absorbe esos scopes; se enlazan por `dossier_id`.

**BR-C3e-9** [I] — Loop de mejora dual: corrige el borrador del caso Y anexa aprendizaje a `memory.md` para mejorar plantilla/few-shots del tipo politica.

### Casos borde

**EC-C3e-1** — Proceso/criterio-de-bueno ausente para la clase de politica. -> FAIL-CLOSED: no redacta; escala al dueno de politicas para crear el proceso; lo creado se vuelve few-shot reproducible.

**EC-C3e-2** — Evals fallan pero la politica permite la clase. -> `nivel_efectivo = min(...)` cae a 0 de auto-pase; queda `pendiente_4ojos`. Evals pasan pero politica prohibe la clase -> tambien 4-ojos. Nunca auto-pasa si CUALQUIER gate falla.

**EC-C3e-3** — Tentacion cross-tenant: el patron seria mas "fuerte" citando a un competidor identificable. -> PROHIBIDO; el generador solo usa market-agregado-anonimizado o el propio dossier; si no alcanza la evidencia agregada, FAIL-CLOSED y escala, no degrada la regla de privacidad.

**EC-C3e-4** — Over-reach de autonomia: el generador intenta publicar (no solo borrador) o actuar como segundo ojo. -> Bloqueado por BR-C3e-2; IA solo es autor; publicacion siempre exige 2 humanos distintos.

**EC-C3e-5** — Metrica no atada al crear el borrador. -> FAIL-CLOSED: el artefacto no se instancia hasta tener metrica objetivo + `policy_id` en el LEDGER.

**EC-C3e-6** — El dueno de politicas ignora el borrador (no entra a su ritual). -> El champion (Claire Butler) lo engancha al ritual recurrente; si sigue sin adopcion, se marca como no-adoptado en el LEDGER (no cuenta para atribucion de impacto) y se revisa el ajuste de formato.

**EC-C3e-7** — Caso aislado disfrazado de patron (recurrencia falsa por estacionalidad). -> El umbral exige recurrencia real en ventana; la atribucion de impacto es honesta sobre señal vs estacionalidad; si la recurrencia no se sostiene, no se genera politica.

**EC-C3e-8** — RL drift: borradores auto-pasados se desvian poco a poco del criterio del dueno. -> Cadencia tiempo+volumen (BR-C3e-7) detecta deriva en lote; señal de divergencia baja el `tier_ceiling` y reabre 4-ojos para la clase.

### Sub-proceso (workflow)

1. **Ingesta:** recibe `DOSSIER_HANDOFF` de B; el router de C marca "politica" como artefacto-tipo aplicable.
2. **Gate de recurrencia:** valida umbral N-casos/ventana (BR-C3e-1). Aislado -> no genera (sugiere otro artefacto).
3. **Gate de privacidad por direccion:** confirma que el sustento es market-agregado-anonimizado o dossier propio del tenant (BR-C3e-5). Tentacion cross-tenant -> FAIL-CLOSED.
4. **Gate de proceso/KB:** ¿existe "criterio de bueno" + few-shot para esta clase? No -> FAIL-CLOSED, escala a humano (BR-C3e-4).
5. **Metric-binding:** crea `policy_id` (nuevo o ajuste) + metrica objetivo en el LEDGER (BR-C3e-6).
6. **Redaccion:** genera borrador en la plantilla del dueno (motivo, regla, alcance, excepciones, vigencia, version, diff si es ajuste) contra los criterios-de-bueno.
7. **Co-disparo:** si toca dinero/terminos, enlaza C3c / C3f por `dossier_id` (BR-C3e-8).
8. **Eval + autonomia:** corre evals; calcula `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)` (BR-C3e-3).
9. **Ruteo de aprobacion:** por defecto `pendiente_4ojos`; solo la clase habilitada + evals OK puede auto-pasar (BR-C3e-2).
10. **Entrega:** email al dueno de politicas (canal universal), enganchado por el champion a su ritual recurrente de revision.
11. **Cadencia:** auto-pasados van a lote de revision tiempo+volumen+divergencia (BR-C3e-7).
12. **Loop de mejora:** registra feedback en LEDGER atado a metrica/`policy_id`; anexa aprendizaje a `memory.md` (BR-C3e-9).

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigacion |
|---|---|---|---|
| BR-C3e-1 (recurrencia) | Politicas one-off inflan la base | Base de politicas ingobernable, ruido | Umbral N-casos/ventana desde dossier; aislado -> otro artefacto |
| BR-C3e-2 (4-ojos) | IA publica sola / actua de 2do ojo | Politica invalida o no auditada en vigor | IA solo autor; publicar exige 2 humanos distintos |
| BR-C3e-3 (autonomia graduada) | Auto-pase con eval o politica en falla | Politica errada activada a escala | `nivel_efectivo=min(...)`, FAIL-CLOSED a 4-ojos |
| BR-C3e-4 (proceso ausente) | IA inventa la politica | Regla sin fundamento, riesgo legal/operativo | FAIL-CLOSED + escala; lo creado se vuelve few-shot |
| BR-C3e-5 (hard-no direccion) | Citar competidor identificable | Violacion cross-tenant / privacidad | Solo market-agregado-anonimizado o dossier propio; interno con ID completo |
| BR-C3e-6 (metric-binding) | Borrador sin metrica | Sin atribucion de impacto posible | No se instancia sin metrica + `policy_id` en LEDGER |
| BR-C3e-7 (cadencia humana) | Deriva RL no-lineal compuesta | Borradores se alejan del criterio del dueno | Revision en lote tiempo+volumen+divergencia; baja `tier_ceiling` |
| BR-C3e-8 (co-disparo MECE) | Scope creep dinero/terminos en politica | Artefacto confuso, doble fuente de verdad | Enlazar C3c/C3f por `dossier_id`; no absorber scopes |
| BR-C3e-9 (loop dual) | Aprendizaje no se generaliza | Mismo error caso a caso | Corrige borrador + anexa a `memory.md` |

## C3f — Generador: borrador de T&C
**Destino:** Legal
**Objetivo:** Convertir un dossier de B que detecta un patron legal/contractual recurrente en un borrador de cambio de Terminos y Condiciones, redline-ready, que Legal pueda revisar dentro de su ritual de aprobacion sin que C nunca publique T&C de forma autonoma salvo clase explicitamente habilitada.

### Historias de usuario

**US-C3f-1** — Como IA-orquestador, quiero detectar cuando un dossier expone un patron contractual/legal (no comercial ni de proceso) y enrutar SOLO esa clase al generador de T&C, para no producir borradores legales fuera de su MECE.
- Criterios de aceptacion:
  - El router C clasifica el dossier como clase `tyc` con justificacion citable al patron legal del dossier; si la clase es ambigua entre T&C y politica (ver C3e), marca ambas y deja a Legal/Policy desambiguar, no elige por defecto.
  - Si no existe NBA/clausula-base reproducible para ese patron -> no genera -> fail-closed a humano (Legal) para crear el proceso. C nunca inventa la clausula.
  - El borrador queda vinculado a una metrica-objetivo (ej. reduccion de disputas/chargebacks por clausula X) en el ledger al momento de creacion.

**US-C3f-2** — Como generador, quiero producir el borrador como REDLINE sobre el texto vigente (no T&C desde cero) en el formato que Legal consume, para que la revision sea diff-based y trazable.
- Criterios de aceptacion:
  - Salida = clausula vigente citada + redline propuesto + razon-de-cambio ligada al patron del dossier + clausulas/jurisdicciones potencialmente afectadas, todo en espanol.
  - Cada afirmacion factual del razonamiento cita su fuente del dossier; lo no respaldado se marca `[sin fuente]`, no se afirma.
  - Datos de mercado detras del cambio = solo vista agregada-anonimizada-compuesta; cero referencia a un tenant/competidor individual identificable.

**US-C3f-3** — Como humano-aprobador (Legal), quiero recibir el borrador como item en mi ritual recurrente de revision legal con un champion nombrado, para aprobarlo/editarlo/rechazarlo sin que se publique nunca por defecto.
- Criterios de aceptacion:
  - Entrega via EMAIL al buzon de Legal, plug en el ritual "Legal review queue" (cadencia recurrente), con champion de Legal asignado como owner del item.
  - Estados explicitos: `borrador` -> `en-revision-legal` -> `aprobado`/`editado`/`rechazado`; ningun estado salta a publicado sin accion humana salvo clase auto-habilitada (BR-C3f-2).
  - Toda edicion de Legal se captura y alimenta el loop de mejora (mejora este borrador + append a memory.md del template T&C).

### Reglas de negocio

**BR-C3f-1** [V] — Gate legal por defecto: el borrador de T&C es NO-autonomo. `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)`, fail-closed. Solo si la politica habilita explicitamente la clase-de-caso AND los evals de "criterio de bueno T&C" pasan AND el tier lo permite -> puede auto-pasar; en cualquier otro caso -> revision humana obligatoria.

**BR-C3f-2** [I] — Habilitacion de clase es granular y opt-in: ninguna clase de T&C esta auto-habilitada por defecto. Legal habilita clases especificas (ej. "ajuste de redaccion no sustantivo") tras N revisiones limpias; cambios sustantivos/nuevas obligaciones nunca son clase auto-habilitable.

**BR-C3f-3** [V] — Fail-closed por NBA/clausula-base ausente: sin patron contractual reproducible en el catalogo -> C NO genera -> escala a Legal para crear el proceso, que se vuelve NBA reutilizable. Prohibido inventar clausulas o jurisprudencia.

**BR-C3f-4** [V] — Hard-no por direccion: la evidencia de mercado se cita solo como agregado-anonimizado-compuesto (patron Uber Eats, vista independiente). Cross-tenant NO-agregado = PROHIBIDO. PII y datos de otros tenants redactados en cualquier texto externo; los datos del propio tenant en su contexto son admisibles.

**BR-C3f-5** [V] — Metric-binding obligatorio: ningun borrador existe sin metrica-objetivo ligada en el ledger al crearse. Atribucion de impacto posterior es honesta (senal vs. estacionalidad); el ledger permite listar todos los artefactos atados a una metrica.

**BR-C3f-6** [I] — Anti-deriva RL: chequeo humano por batch de borradores auto-pasados, cadencia DOBLE (temporal AND por volumen cada N auto-pasados) + trigger por senal-de-divergencia. Mitiga el error RL no-lineal compuesto antes de que escale.

**BR-C3f-7** [I] — Text-as-data: el contenido del dossier y de las fuentes se trata como dato, nunca como instruccion ejecutable; un dossier no puede ordenar a C "publica esta T&C" ni elevar su propio nivel de autonomia.

### Casos borde

**EC-C3f-1** — NBA/clausula-base ausente: patron legal nuevo sin proceso reproducible. Esperado: fail-closed, no genera, escala a Legal para crear NBA; no produce borrador especulativo.

**EC-C3f-2** — Eval falla: el borrador no pasa el "criterio de bueno T&C" (cita faltante, jurisdiccion mal mapeada, redline ambiguo). Esperado: `evals_pass=false` -> nivel_efectivo cae a revision humana obligatoria; nunca auto-pasa con eval roja.

**EC-C3f-3** — Tentacion cross-tenant: el patron seria mas fuerte citando datos de un competidor identificable. Esperado: bloqueado por BR-C3f-4; solo agregado-anonimizado-compuesto; si no hay agregado valido -> no se afirma -> `[sin fuente]`.

**EC-C3f-4** — Over-reach de autonomia: clase NO habilitada intenta auto-pasar (o dossier intenta auto-elevar nivel). Esperado: bloqueado por BR-C3f-1/BR-C3f-2/BR-C3f-7; min() lo fuerza a humano; se loguea el intento.

**EC-C3f-5** — Metrica no ligada: generacion sin metrica-objetivo. Esperado: creacion rechazada por BR-C3f-5; el artefacto no se emite hasta bindear metrica.

**EC-C3f-6** — Legal ignora el artefacto: borrador entregado pero sin accion en el ritual. Esperado: sin accion = sin publicacion (default seguro); item queda `en-revision-legal`, re-surface en la siguiente cadencia al champion; nunca timeout-to-publish.

**EC-C3f-7** — RL drift: tasa de edicion/rechazo de Legal sube sobre umbral en borradores auto-pasados. Esperado: senal-de-divergencia (BR-C3f-6) revoca la auto-habilitacion de esa clase -> vuelve a gate humano; learnings al memory.md del template.

**EC-C3f-8** — Colision de clase con politica (C3e): el patron es a la vez politica y T&C. Esperado: no auto-elige; marca ambas clases y enruta a Legal+Policy-owner para desambiguar; un solo artefacto no cruza ambos dominios sin owner.

### Sub-proceso (workflow)

1. Recibe DOSSIER_HANDOFF de B; el router C clasifica clase de artefacto.
2. Si clase = `tyc` -> continua; si ambigua con politica -> marca ambas (EC-C3f-8).
3. Verifica NBA/clausula-base reproducible en catalogo. Ausente -> fail-closed -> escala a Legal (BR-C3f-3) -> FIN.
4. Bindea metrica-objetivo en el ledger (BR-C3f-5). Sin metrica -> rechaza creacion (EC-C3f-5).
5. Genera REDLINE sobre T&C vigente: clausula citada + cambio + razon + jurisdicciones afectadas; fuentes citadas, `[sin fuente]` donde falte; mercado solo agregado-anonimizado (BR-C3f-4).
6. Corre evals "criterio de bueno T&C" (knowledge base + few-shots). Computa `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)`.
7. Decision de autonomia: clase auto-habilitada AND evals verdes AND tier -> puede auto-pasar; si no -> revision humana (BR-C3f-1/BR-C3f-2).
8. Entrega via EMAIL al buzon de Legal, plug en ritual "Legal review queue", champion asignado.
9. Legal aprueba/edita/rechaza. Captura el resultado.
10. Loop de mejora: mejora este borrador + append learnings a memory.md (mejora el template para futuros casos `tyc`).
11. Batch review de auto-pasados por cadencia doble + senal-de-divergencia (BR-C3f-6); divergencia -> revoca auto-habilitacion de la clase (EC-C3f-7).

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigacion |
|---|---|---|---|
| BR-C3f-1 Gate legal/min() | Auto-publicar T&C invalida o no revisada | Exposicion legal/regulatoria, T&C no exigible | Fail-closed; auto-pase solo con clase+evals+tier; default a humano |
| BR-C3f-2 Clase opt-in granular | Habilitar clase demasiado amplia | Cambios sustantivos auto-pasan sin Legal | Opt-in por clase tras N revisiones limpias; sustantivo nunca auto-habilitable |
| BR-C3f-3 Fail-closed NBA ausente | C inventa clausula/jurisprudencia | Borrador legalmente erroneo, riesgo de litigio | No genera sin NBA; escala a Legal; NBA nuevo reproducible |
| BR-C3f-4 Hard-no por direccion | Citar competidor identificable en T&C externa | Violacion cross-tenant/privacidad, leak | Solo agregado-anonimizado-compuesto; PII redactada; `[sin fuente]` si no hay agregado |
| BR-C3f-5 Metric-binding | Artefacto sin metrica medible | No hay atribucion de impacto ni accountability | Bindeo obligatorio en ledger pre-emision; lista por metrica |
| BR-C3f-6 Anti-deriva RL | Error RL no-lineal compuesto en auto-pasados | Drift legal silencioso a escala | Batch review cadencia doble + senal-divergencia; revoca clase |
| BR-C3f-7 Text-as-data | Inyeccion via dossier/fuente | Auto-elevacion de autonomia, publicacion forzada | Contenido = dato no instruccion; no eleva nivel ni ordena publicar |

## C4 — Criterios-de-bueno + Evals (knowledge base, eval=PRD)
**Destino:** interno (C) + humano-aprobador
**Objetivo:** Definir, versionar y operar la base de conocimiento (KB) de "criterios-de-bueno" por tipo de artefacto, con ejemplos few-shot que el modelo entienda. El eval ES la spec de "bueno": estos criterios son la compuerta que destraba (o congela) la autonomía graduada — `nivel_efectivo = min(politica, evals, techo_tier)`, fail-closed.

### Historias de usuario

**US-C4-1** — Como humano-aprobador, quiero una KB por tipo de artefacto con criterios-de-bueno explícitos + ejemplos few-shot (positivos y negativos), para que "bueno" sea una spec ejecutable y no un juicio subjetivo por revisor.
- **Criterios de aceptación:**
  - Cada uno de los 6 tipos (email/content, spec REFORGE, impacto Finance, NBA, policy, T&C) tiene ≥1 criterio-de-bueno versionado con ≥1 ejemplo POSITIVO y ≥1 NEGATIVO.
  - Los criterios se expresan como checks evaluables (pasa/falla), no como prosa abierta.
  - Cada criterio referencia su tipo de artefacto y su métrica-objetivo de binding (ver C3).

**US-C4-2** — Como IA-orquestador, quiero ejecutar el eval del tipo correcto antes de proponer autonomía, para que `nivel_efectivo` se calcule con la señal `evals_pass` real y nunca exceda lo que la política y el techo_tier permiten.
- **Criterios de aceptación:**
  - Antes de cualquier auto-pass, C corre el eval del tipo de artefacto y registra `evals_pass = {true|false}` + versión-de-criterios usada.
  - `nivel_efectivo = min(politica, evals, techo_tier)`; si falta o no aplica un criterio claro → `evals = 0` → autonomía congelada (revisión humana obligatoria).
  - El resultado del eval (score por criterio + veredicto) queda en el LEDGER junto al artefacto.

**US-C4-3** — Como generador (subagente MECE), quiero un few-shot canónico por tipo en la KB, para producir el artefacto en el FORMATO del equipo-destino y maximizar `evals_pass` desde el primer intento.
- **Criterios de aceptación:**
  - El few-shot de cada tipo incluye el formato esperado por el equipo-destino (ej.: REFORGE para Product, impacto-no-request para Finance).
  - Los ejemplos negativos cubren al menos un hard-no por dirección (ej.: filtración cross-tenant no-agregada, finance que pide saldo).
  - El generador cita qué ejemplo/criterio guió la salida (trazabilidad).

**US-C4-4** — Como humano-aprobador, quiero versionar los criterios y atar cada veredicto a una versión, para auditar por qué un artefacto pasó/falló y para que el loop de mejora (memory.md, ver C6) actualice el criterio sin romper el histórico.
- **Criterios de aceptación:**
  - Todo cambio de criterio crea una nueva versión inmutable (semver simple); el histórico no se reescribe.
  - Cada veredicto del LEDGER guarda `criterios_version`.
  - Un cambio de criterio re-evalúa solo artefactos futuros; no re-abre adopciones ya atribuidas.

### Reglas de negocio

**BR-C4-1** — `nivel_efectivo = min(politica_permite, evals_pass, techo_tier)`, fail-closed. Ninguna señal puede elevar la autonomía por encima de las otras dos. [V]

**BR-C4-2** — Sin criterio-de-bueno claro y versionado para el tipo (o sub-clase) del artefacto → `evals = 0` → autonomía CONGELADA → ruta a revisión humana obligatoria. C nunca "supone" el criterio. [V]

**BR-C4-3** — Los criterios viven en la KB versionados, cada uno con ≥1 ejemplo few-shot POSITIVO y ≥1 NEGATIVO. Un criterio sin ejemplo no es elegible para destrabar autonomía (se trata como "no-claro"). [V]

**BR-C4-4** — El eval gobierna por TIPO de artefacto y respeta hard-nos POR DIRECCIÓN: el eval interno resuelve con ID completo; todo ejemplo o check que toque datos externos exige market-agregado-anonimizado. Un ejemplo few-shot que contenga datos cross-tenant no-agregados es inválido y bloquea la versión. [V]

**BR-C4-5** — Finance/policy/T&C NO son nunca-autónomos-absolutos: si la política permite la clase-de-caso Y el eval de ese tipo pasa → pueden auto-pasar. La compuerta es el eval, no el tipo. [V]

**BR-C4-6** — Todo veredicto de eval se ata a la métrica-objetivo del artefacto (binding, ver C3) y se registra en el LEDGER con `criterios_version`, `evals_pass`, score-por-criterio. Sin binding de métrica → no hay auto-pass (cae a humano). [V]

**BR-C4-7** — El eval es la spec de "bueno" (eval=PRD): cualquier criterio nuevo de "bueno" debe entrar como check evaluable en la KB ANTES de poder usarse para gatear autonomía; no existen criterios "informales" fuera de la KB. [I]

**BR-C4-8** — Cadencia de revisión humana sobre auto-pasados es temporal Y por volumen (cada N auto-pass) + señal-de-divergencia; un drift detectado en batch congela la autonomía del tipo afectado hasta re-versionar el criterio. [V]

### Casos borde

**EC-C4-1 — NBA/HOW ausente para el caso:** el artefacto requiere un HOW no presente en el catálogo. Esperado: fail-closed → `evals = 0` → ESCALAR a humano para CREAR el proceso (nuevo NBA reproducible). C no inventa el HOW ni el criterio.

**EC-C4-2 — Eval falla (criterio existe, salida no cumple):** Esperado: NO auto-pass; el artefacto va a humano-aprobador con score-por-criterio que señala el check fallado; queda en LEDGER como `evals_pass=false`.

**EC-C4-3 — Tentación cross-tenant en el few-shot/criterio:** alguien propone un ejemplo "bueno" con dato de un solo competidor identificable. Esperado: la versión se RECHAZA en validación (BR-C4-4); el ejemplo solo es válido si es market-agregado-anonimizado.

**EC-C4-4 — Over-reach de autonomía (política sí, eval no):** política permite la clase pero el eval del tipo no pasa o no existe. Esperado: `nivel_efectivo = min(...) = 0` → congelado; nunca auto-pasa por "la política lo permitía".

**EC-C4-5 — Métrica no bindeada:** el artefacto llega sin métrica-objetivo. Esperado: eval no puede emitir veredicto auto-pasable → cae a humano; se exige binding antes de re-evaluar (BR-C4-6).

**EC-C4-6 — Equipo-destino ignora el artefacto (adopción nula):** el eval pasó pero el equipo no lo consume. Esperado: NO es fallo de eval; se marca señal-de-adopción-baja para el loop (ver C6) → revisar criterio/champion/ritual, no relajar el gate.

**EC-C4-7 — RL drift por error no-lineal compuesto:** la tasa de auto-pass sube pero la calidad batch cae. Esperado: la cadencia (tiempo + volumen + divergencia) dispara batch-review; al confirmar drift → autonomía del tipo CONGELADA y criterio re-versionado antes de re-habilitar (BR-C4-8).

**EC-C4-8 — Criterio ambiguo / sub-clase nueva sin ejemplo:** llega una sub-clase del tipo sin few-shot canónico. Esperado: se trata como "no-claro" → `evals = 0` → humano; se crea el ejemplo y se versiona antes de permitir autonomía para esa sub-clase (BR-C4-3).

### Sub-proceso (workflow)

1. **Resolver tipo:** el router de C entrega el/los tipo(s) de artefacto del dossier; C selecciona la entrada KB correspondiente (criterios + few-shot vigentes, con `criterios_version`).
2. **Gate de claridad:** ¿existe criterio-de-bueno versionado CON ≥1 ejemplo positivo y ≥1 negativo para el tipo/sub-clase? Si no → `evals = 0` → escalar a humano (BR-C4-2/3). Stop.
3. **Gate de dirección/privacidad:** validar que ningún check ni ejemplo aplicado viole hard-no por dirección (cross-tenant no-agregado, finance-como-request). Si viola → bloquear (BR-C4-4).
4. **Correr eval:** evaluar la salida del generador contra cada check; producir score-por-criterio + veredicto `evals_pass`.
5. **Calcular autonomía:** `nivel_efectivo = min(politica, evals, techo_tier)`. Si `> 0` y métrica bindeada → auto-pass elegible; si `= 0` o sin binding → humano-aprobador.
6. **Registrar en LEDGER:** artefacto + `criterios_version` + score + `evals_pass` + métrica-objetivo + nivel_efectivo.
7. **Cadencia de control:** acumular auto-pasados; al cumplir umbral temporal/volumen o señal-de-divergencia → batch-review humano.
8. **Loop de mejora:** hallazgos de la batch-review → actualizar artefacto del caso + append a memory.md → re-versionar criterio/few-shot (entra como nueva `criterios_version`; ver C6). Drift confirmado → congelar tipo hasta re-versionar.

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| BR-C4-1 (min, fail-closed) | Una señal "alta" enmascara otra baja y sube autonomía indebida | Auto-pass de artefacto malo a un equipo | `min()` estricto + log de las 3 señales en LEDGER |
| BR-C4-2 (sin criterio → congelar) | Presión por velocidad lleva a "suponer" criterio | Artefacto sin estándar real llega al destino | Gate de claridad obligatorio + escalado a crear NBA/criterio |
| BR-C4-3 (criterio con few-shot) | Criterio sin ejemplo se usa igual | Eval inconsistente entre revisores/runs | "Sin ejemplo = no-claro"; no elegible para destrabar |
| BR-C4-4 (hard-no por dirección) | Ejemplo "bueno" filtra dato cross-tenant identificable | Violación de privacidad / confianza del marketplace | Validación de versión rechaza ejemplos no-agregados |
| BR-C4-5 (finance/policy/T&C gateados por eval, no por tipo) | Bloqueo absoluto mata autonomía útil, o auto-pass laxo en área sensible | Cuello de botella humano o error caro en área regulada | Política por clase-de-caso + eval específico del tipo |
| BR-C4-6 (binding de métrica) | Auto-pass sin métrica → adopción inatribuible | No se puede medir impacto ni honrar señal vs estacionalidad | Sin binding → no auto-pass; métrica obligatoria en LEDGER |
| BR-C4-7 (eval=PRD) | Criterios informales fuera de la KB | Autonomía gateada por reglas no auditables | Solo checks en KB versionada gatean autonomía |
| BR-C4-8 (cadencia tiempo+volumen+divergencia) | Error RL no-lineal se compone sin detección | Degradación silenciosa de calidad a escala | Batch-review dual + congelar tipo + re-versionar criterio |

## C5 — Ledger de impacto + atribucion
**Destino:** interno (C) + Producto (evaluacion)
**Objetivo:** Cada artefacto nace vinculado a una metrica-objetivo y queda registrado de forma inmutable al crearse; despues C levanta TODAS las acciones ligadas a una metrica para atribuir impacto, separando honestamente senal real de estacionalidad. Sin metrica no hay artefacto.

### Historias de usuario

**US-C5-1** — "Como IA-orquestador, quiero rechazar la emision de cualquier artefacto que no traiga una metrica-objetivo valida vinculada para no contaminar el ledger con acciones no medibles."
- **Criterios de aceptacion:**
  - El binding exige `metric_id` de un catalogo cerrado de metricas + valor baseline + ventana de medicion; si falta cualquiera -> emision bloqueada (fail-closed).
  - El bloqueo se devuelve al generador con motivo estructurado, no como texto libre.
  - Una metrica fuera de catalogo no se auto-crea: escala a humano (ver C2/C3d NBA-faltante como patron).

**US-C5-2** — "Como humano-aprobador, quiero que cada artefacto quede registrado de forma inmutable con su metrica, autor (IA o humano), nivel de autonomia efectivo y timestamp, para auditar despues quien decidio que y bajo que regla."
- **Criterios de aceptacion:**
  - Cada entrada es append-only: no se edita ni borra; una correccion genera una entrada nueva enlazada (`supersedes`).
  - El registro guarda `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)` y el motivo, no solo el resultado.
  - El ledger es consultable por `metric_id`, por caso/dossier, por tipo de artefacto y por equipo-destino.

**US-C5-3** — "Como equipo-destino o Producto, quiero levantar TODAS las acciones ligadas a una metrica con una lectura honesta de senal-vs-estacionalidad, para atribuir impacto sin sobre-atribuir."
- **Criterios de aceptacion:**
  - La vista de atribucion lista cada artefacto, su delta observado y un flag explicito de confianza (senal aislada / confundida-con-estacionalidad / insuficiente).
  - Si hay baseline estacional disponible, el delta se reporta neto de estacionalidad; si no, se marca "no separable" en vez de afirmar causalidad.
  - Atribucion sobre datos de varios tenants se muestra SIEMPRE como agregado-anonimizado; el detalle con ID completo solo es visible al tenant duenio o al consumo interno de C/Producto.

### Reglas de negocio

**BR-C5-1** — Sin metrica no hay artefacto: ningun artefacto se emite ni se registra sin `metric_id` valido + baseline + ventana de medicion. Gate duro previo a la emision. [V]

**BR-C5-2** — Registro inmutable (append-only): toda entrada del ledger es inmutable; correcciones y reemplazos se modelan como entradas nuevas encadenadas (`supersedes`/`superseded_by`), nunca como edicion in-place. [I]

**BR-C5-3** — El ledger persiste el `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)` y el motivo de cada artefacto auto-pasado; es la fuente de verdad para la revision por lote de la cadencia de chequeo humano (tiempo + volumen + senal-de-divergencia). [V]

**BR-C5-4** — Atribucion honesta: el delta de una metrica se reporta separando senal de estacionalidad cuando hay baseline; si no es separable, se declara "no separable" y queda PROHIBIDO afirmar causalidad. La atribucion describe correlacion + confianza, no certeza. [V]

**BR-C5-5** — Hard-no por direccion en la lectura de atribucion: el cruce de varias acciones sobre una metrica usa SOLO datos agregado-anonimizados a nivel mercado; la resolucion a ID completo es legitima solo hacia adentro (C/Producto) o hacia el tenant duenio de su propio dato. Cross-tenant NO-agregado = PROHIBIDO. [V]

**BR-C5-6** — El ledger NUNCA mueve saldo ni dispara una accion de negocio: es registro + lectura. El artefacto Finance ligado muestra impacto, jamas una solicitud de recurso (coherente con el hard-no financiero). [V]

**BR-C5-7** — Ritual de adopcion (Producto): la vista de atribucion se conecta al ritual recurrente de **eval review / metrics review** de Producto, con champion nombrado; alli el eval-es-PRD se contrasta contra el impacto real y alimenta el loop de mejora del template (memory.md). [I]

### Casos borde

**EC-C5-1 — Metrica no vinculada:** el generador intenta emitir sin `metric_id`. -> Fail-closed: emision bloqueada, nada entra al ledger, motivo estructurado al generador. No hay artefacto sin metrica.

**EC-C5-2 — Metrica fuera de catalogo / inexistente:** el caso necesita una metrica que no existe. -> No se auto-crea; escala a humano para definirla (vuelve como metrica de catalogo reproducible). C nunca inventa la metrica.

**EC-C5-3 — Tentacion cross-tenant en la atribucion:** alguien pide ver que artefacto movio la metrica del competidor X. -> Bloqueado; solo se devuelve la vista agregado-anonimizada de mercado. Resolucion a ID solo para el tenant duenio o consumo interno.

**EC-C5-4 — Estacionalidad disfrazada de impacto:** la metrica sube en una ventana estacional (p.ej. pico de fin de semana / festivo). -> La atribucion marca "confundida-con-estacionalidad" o "no separable"; PROHIBIDO atribuir el alza al artefacto sin baseline que lo aisle.

**EC-C5-5 — Over-reach de autonomia:** un artefacto se auto-pasa por encima de su `nivel_efectivo` (policy o eval no lo permitian). -> El ledger lo detecta como divergencia (registro vs. permiso), lo marca, lo fuerza a revision humana y dispara senal de divergencia en la cadencia.

**EC-C5-6 — Intento de editar/borrar el ledger:** se pide corregir o eliminar una entrada. -> Rechazado: inmutable. Solo se permite anexar una entrada `supersedes`; el historico completo permanece.

**EC-C5-7 — RL drift en la atribucion:** el template empieza a sobre-atribuir impacto sistematicamente (sesgo que se compone). -> La revision por lote de Producto compara atribucion declarada vs. realizada; la divergencia recalibra el template via memory.md y, si excede umbral, baja el `tier_ceiling` (fail-closed).

**EC-C5-8 — Equipo-destino ignora el artefacto:** la metrica no se mueve porque el equipo nunca ejecuto la accion. -> El ledger distingue "no ejecutado" de "ejecutado sin impacto"; sin evidencia de ejecucion NO se cuenta como impacto nulo del artefacto, se enruta al champion del ritual.

### Sub-proceso (workflow)

1. **Recepcion:** el generador entrega un artefacto candidato con su binding propuesto (`metric_id`, baseline, ventana, equipo-destino).
2. **Gate de metrica (BR-C5-1):** validar `metric_id` contra catalogo cerrado + baseline + ventana. Falta algo -> fail-closed (EC-C5-1); metrica inexistente -> escala a humano (EC-C5-2).
3. **Calculo de autonomia:** computar `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)`; resolver auto-pase vs. cola de aprobacion humana.
4. **Registro inmutable (BR-C5-2):** append-only de la entrada con metrica, autor, nivel_efectivo, motivo, timestamp, hash/encadenamiento.
5. **Vinculo a entrega:** el artefacto sale por su canal (Content Studio para restaurantes / email a equipo interno); el ledger guarda el evento de entrega, no una entidad de delivery nueva.
6. **Medicion en ventana:** al cerrar la ventana, capturar el valor de la metrica y, si existe, el baseline estacional.
7. **Atribucion honesta (BR-C5-4):** levantar TODAS las acciones ligadas a esa metrica; reportar delta neto de estacionalidad o flag "no separable"; cruce siempre agregado-anonimizado (BR-C5-5).
8. **Cadencia de chequeo:** revision por lote de auto-pasados (tiempo + volumen + senal-de-divergencia); detectar over-reach (EC-C5-5) y drift (EC-C5-7).
9. **Loop de mejora:** corregir la atribucion de ESTE caso + anexar aprendizaje a memory.md -> recalibra el template para casos futuros del tipo; conectar a eval/metrics review de Producto (BR-C5-7).

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigacion |
|---|---|---|---|
| BR-C5-1 (sin metrica no hay artefacto) | Artefacto no medible contamina el ledger | Atribucion sin base; ruido en la evaluacion | Gate duro pre-emision, fail-closed, motivo estructurado |
| BR-C5-2 (inmutable append-only) | Edicion/borrado borra rastro de auditoria | Perdida de trazabilidad de decisiones | Append-only + encadenado `supersedes`; edicion rechazada |
| BR-C5-3 (persiste nivel_efectivo + motivo) | Auto-pase sin registro del porque | No se puede auditar autonomia ni revisar por lote | Registrar min(policy,evals,tier) + motivo como fuente de verdad |
| BR-C5-4 (atribucion honesta) | Sobre-atribuir alzas estacionales | Decisiones de Producto sobre senal falsa | Delta neto de estacionalidad o flag "no separable"; nunca causalidad |
| BR-C5-5 (hard-no por direccion) | Resolver cross-tenant no-agregado | Violacion de privacidad / confianza del tenant | Solo agregado-anonimizado; ID solo interno o al tenant duenio |
| BR-C5-6 (ledger no mueve saldo) | Confundir registro con accion financiera | Mover recurso indebido | Solo registro+lectura; Finance = impacto, nunca request |
| BR-C5-7 (ritual de adopcion Producto) | Atribucion sin foro ni champion -> se ignora | Loop de mejora muere; templates no recalibran | Conectar a eval/metrics review con champion; eval-es-PRD vs. impacto real |

## C6 — Loop de mejora (memory.md -> template)
**Destino:** interno (C)
**Objetivo:** Cerrar el ciclo de aprendizaje en dos niveles ordenados: (1) corregir el artefacto del caso actual, y (2) destilar el aprendizaje a un `memory.md` que mejora el template/generador para todos los casos futuros del mismo tipo — con un guard explícito que impide el error compuesto NO-LINEAL del RL (un mal aprendizaje que se propaga y se amplifica caso a caso).

### Historias de usuario

**US-C6-1** — "Como humano-aprobador, quiero que cada corrección que hago sobre un artefacto se capture como delta estructurado (qué cambié, por qué, contra qué criterio-de-bueno) para que la mejora del caso quede registrada antes de tocar cualquier template."
- **Criterios de aceptación:**
  - El delta se liga al `artifact_id`, al `dossier_id` (handoff de B) y al `tipo de artefacto`; queda en el LEDGER del caso.
  - El delta referencia el criterio-de-bueno (KB / eval) que falló o que se reforzó; si no mapea a ninguno, se marca `criterio_nuevo:candidato`.
  - El caso se cierra (artefacto re-emitido) SIN que el template haya cambiado todavía — los dos niveles no se mezclan en la misma transacción.

**US-C6-2** — "Como IA-orquestador, quiero proponer un cambio de template/generador solo después de que ≥N deltas independientes converjan en el mismo patrón para que un aprendizaje aislado no reescriba el generador (anti error compuesto no-lineal)."
- **Criterios de aceptación:**
  - Una propuesta de template requiere ≥N deltas de ≥M casos/operadores distintos (no el mismo caso N veces); umbral configurable por tipo de artefacto.
  - La propuesta entra como CANDIDATA (no activa): incluye diff del template, los deltas-fuente y el delta esperado en los evals.
  - Activar template = acción gateada por humano (ver BR-C6-2); nunca auto-activa por volumen solo.

**US-C6-3** — "Como generador (subagente), quiero leer el `memory.md` versionado de mi tipo de artefacto como contexto few-shot para que cada caso futuro arranque del mejor patrón conocido y no repita el error ya corregido."
- **Criterios de aceptación:**
  - El `memory.md` está particionado POR TIPO de artefacto (email, spec REFORGE, finanzas, NBA, política, T&C); un tipo no lee el `memory.md` de otro.
  - Cada entrada de `memory.md` es trazable a sus deltas-fuente y a la versión de template que la activó (provenance interna completa).
  - Si `memory.md` y el eval activo se contradicen, gana el eval (eval=spec de bueno) y se abre incidencia de revisión.

**US-C6-4** — "Como equipo-destino, quiero ver si el artefacto que recibí proviene de un template recién cambiado para que pueda dar feedback rápido durante la ventana de mayor riesgo de regresión."
- **Criterios de aceptación:**
  - Artefactos generados con template en estado `recién-activado` se etiquetan `template_vN:nuevo` durante una ventana de observación.
  - El feedback del equipo-destino vuelve como delta (US-C6-1) ligado a esa versión de template.
  - Adopción: el feedback se canaliza por el ritual recurrente del equipo (champion + ritual nombrado, ver C-equipos), no por canal ad-hoc.

### Reglas de negocio

**BR-C6-1** — Orden estricto de dos niveles: SIEMPRE primero se mejora el artefacto del caso (nivel-1) y se cierra; la mejora del template (nivel-2) es una transacción separada y posterior. Prohibido mutar el template dentro del flujo de resolución de un caso. [V]

**BR-C6-2** — Guard anti error-compuesto-no-lineal del RL (fail-closed): un cambio de template solo se ACTIVA si `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)` lo permite Y la propuesta supera el umbral de convergencia (≥N deltas / ≥M casos distintos) Y pasa el set de evals del tipo SIN regresión. Si cualquier condición falla -> NO activa -> queda candidata -> escala a humano. Volumen nunca basta por sí solo. [V]

**BR-C6-3** — Eval gana sobre memory: el `memory.md` es contexto, NO es autoridad. Ante conflicto, el eval activo (spec de bueno, Brendan Foody) es la fuente de verdad; el `memory.md` se corrige, no al revés. [V]

**BR-C6-4** — Aislamiento por tipo (MECE): deltas, `memory.md` y templates están particionados por tipo de artefacto; un aprendizaje de un tipo no contamina el generador de otro tipo salvo promoción explícita y gateada. [I]

**BR-C6-5** — Hard-no por dirección dentro del aprendizaje: ningún delta ni entrada de `memory.md` puede almacenar datos cross-tenant NO-agregados ni PII de otros tenants. El aprendizaje captura PATRÓN/criterio (estructura, tono, paso de NBA), nunca el dato crudo del caso. Resolución interna usa IDs completos; cualquier ejemplo que salga a artefacto externo va anonimizado/market-agregado. [V]

**BR-C6-6** — Binding de métrica preservado: el aprendizaje no puede romper ni reasignar el `target_metric` con el que un artefacto fue creado; un cambio de template que altere la métrica-objetivo por defecto requiere re-binding explícito y queda en el LEDGER para atribución de impacto honesta (señal vs estacionalidad). [I]

**BR-C6-7** — Reversibilidad: todo template es versionado e inmutable por versión; activar `vN` deja `vN-1` intacto y revertible. Una regresión detectada en ventana de observación dispara rollback automático a la versión previa. [I]

**BR-C6-8** — Provenance obligatoria: toda entrada de `memory.md` y todo cambio de template lleva marca [V]/[I]/[C] y puntero a deltas-fuente; sin provenance no se activa. [I]

### Casos borde

**EC-C6-1 — NBA/how faltante detectado al corregir:** un delta revela que el artefacto falló porque NO existía el proceso/NBA. Fail-closed: NO se inventa el how, NO se parchea el template; se escala a humano para CREAR el NBA reproducible (ver C de NBA) y el delta queda `bloqueado:falta-NBA`.

**EC-C6-2 — Eval falla tras activar template:** el template `vN` introduce regresión en el set de evals durante la ventana de observación. Fail-closed: rollback automático a `vN-1` (BR-C6-7), `vN` vuelve a candidata, se abre incidencia con los deltas-fuente.

**EC-C6-3 — Tentación cross-tenant en el aprendizaje:** un delta intenta guardar el dato crudo de un competidor para "enriquecer" el template. Bloqueo duro (BR-C6-5): se rechaza el delta, se conserva solo el patrón anonimizado/market-agregado; se registra el intento.

**EC-C6-4 — Over-reach de autonomía por volumen:** llegan N deltas convergentes y el orquestador intenta auto-activar el template sin humano. Fail-closed: `nivel_efectivo` corta (BR-C6-2); volumen no es autoridad; queda candidata y escala.

**EC-C6-5 — Loop sin métrica ligada:** un delta propone mejorar un artefacto que nunca fue ligado a `target_metric`. Fail-closed: no se puede medir mejora -> el delta se rechaza para nivel-2 (template) y se exige binding primero; el nivel-1 puede corregirse pero queda `sin-atribucion`.

**EC-C6-6 — Equipo-destino ignora el artefacto:** cero feedback y cero adopción del artefacto de un template `nuevo`. No se interpreta como éxito; ausencia-de-señal != bueno. Se marca `adopcion:nula`, se activa el champion/ritual del equipo y no se promueve el template hasta tener señal.

**EC-C6-7 — Deriva de RL (drift) lenta:** micro-deltas individualmente válidos que, acumulados, desplazan el template lejos del criterio-de-bueno. El human-check de cadencia DOBLE (por tiempo + por volumen de auto-pasados) + señal-de-divergencia hace batch-review; si detecta drift, congela activaciones y revisa el `memory.md` contra los evals.

**EC-C6-8 — Mismo caso re-disparado N veces:** N deltas vienen del MISMO caso/operador inflando el umbral de convergencia. Se deduplica por `dossier_id`/operador; convergencia exige ≥M fuentes distintas (BR-C6-2), no repeticiones del mismo caso.

### Sub-proceso (workflow)

1. **Recibir corrección** del humano-aprobador (o feedback de equipo-destino) sobre un artefacto re-emitido.
2. **Nivel-1 (caso):** capturar delta estructurado (qué/por qué/criterio), ligar a `artifact_id`+`dossier_id`+tipo, re-emitir artefacto corregido y CERRAR el caso en el LEDGER. Fin del nivel-1.
3. **Acumular** el delta en el buffer del tipo de artefacto; deduplicar por caso/operador.
4. **Detectar convergencia:** ¿≥N deltas de ≥M fuentes distintas con el mismo patrón? Si no -> esperar (no se toca template).
5. **Validar hard-nos:** ¿el patrón guarda solo estructura/criterio anonimizado (no cross-tenant crudo, no PII ajena, métrica preservada)? Si no -> rechazar/limpiar.
6. **Generar propuesta CANDIDATA** de template: diff + deltas-fuente + delta esperado en evals + provenance.
7. **Gate de activación (BR-C6-2):** correr evals del tipo; calcular `nivel_efectivo`. Si no pasa o falta NBA -> escalar a humano (fail-closed). 
8. **Activar `vN`** (humano aprueba): versionar inmutable, conservar `vN-1`, escribir entrada en `memory.md` con provenance.
9. **Ventana de observación:** etiquetar artefactos `template_vN:nuevo`; monitorear evals + adopción del equipo-destino (champion/ritual). Regresión -> rollback (BR-C6-7).
10. **Human-check de cadencia (tiempo + volumen + divergencia):** batch-review de auto-pasados; si hay drift -> congelar activaciones y reconciliar `memory.md` vs evals. Volver a 3.

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| BR-C6-1 (orden 2 niveles) | Mezclar caso y template en una transacción corrompe el generador con un caso aislado | Alto | Transacciones separadas; prohibido mutar template dentro del flujo de caso |
| BR-C6-2 (guard RL no-lineal) | Un mal aprendizaje se auto-propaga y se amplifica caso a caso | Crítico | `nivel_efectivo`=min(...) + umbral convergencia ≥N/≥M + evals sin regresión + fail-closed a humano |
| BR-C6-3 (eval > memory) | `memory.md` deriva y se vuelve autoridad de facto | Alto | Eval activo manda; conflicto corrige el `memory.md`, abre incidencia |
| BR-C6-4 (aislamiento por tipo) | Aprendizaje de un tipo contamina el generador de otro | Medio | Partición MECE por tipo; promoción cruzada solo explícita y gateada |
| BR-C6-5 (hard-no por dirección) | Filtrar dato cross-tenant/PII ajena dentro del aprendizaje | Crítico | Guardar solo patrón anonimizado/market-agregado; rechazar delta con dato crudo |
| BR-C6-6 (binding métrica) | Template cambia la métrica-objetivo y rompe la atribución | Medio | Re-binding explícito en LEDGER; atribución honesta señal vs estacionalidad |
| BR-C6-7 (reversibilidad) | Regresión en producción sin vuelta atrás | Alto | Versiones inmutables + rollback automático a `vN-1` en ventana de observación |
| BR-C6-8 (provenance) | Cambios no trazables impiden auditar el drift | Medio | Provenance [V]/[I]/[C] + punteros a deltas-fuente obligatorios para activar |

## C7 — Gobernanza: gate humano graduado + cadencia (tiempo + volumen)

**Destino:** humano-aprobador

**Objetivo:** Hacer cumplir autonomía graduada `nivel_efectivo = min(politica_permite, evals_pasan, techo_de_tier)` fail-closed: cada artefacto pasa por humano hasta que cumple criterios-de-bueno; luego auto-pase con revisión por LOTE de lo auto-pasado, gobernada por una cadencia tiempo Y volumen (+ señal de divergencia) que frena el error RL compuesto no-lineal.

### Historias de usuario

**US-C7-1** — Como humano-aprobador, quiero una cola de aprobación por tipo de artefacto que muestre el artefacto, su métrica-objetivo vinculada y el resultado de evals, para aprobar/rechazar con el criterio-de-bueno a la vista (no de memoria).
- **Criterios de aceptación:**
  - Cada ítem muestra: tipo, métrica vinculada (bloqueante si falta → ver EC-C7-5), evals pasados/fallados con el few-shot del KB, y `nivel_efectivo` calculado.
  - Rechazar exige motivo estructurado (enum: criterio-incumplido / dato-faltante / clase-no-habilitada / otro) que alimenta el loop de mejora (ver C6).
  - Aprobar registra aprobador + timestamp + versión-de-criterio en el LEDGER.

**US-C7-2** — Como IA-orquestador, quiero promover una clase (tipo+segmento) a auto-pase solo cuando acumula N aprobaciones humanas consecutivas sin rechazo Y la política habilita esa clase, para que la autonomía sea ganada y reversible, no asumida.
- **Criterios de aceptación:**
  - La promoción a auto-pase es por CLASE (tipo × segmento × tier), nunca global.
  - Finanzas/política/T&C solo se promueven si existe habilitación explícita de política para esa clase-de-caso (sin ella → techo = humano-siempre).
  - Un solo rechazo o falla de eval en una clase auto-pasada la degrada a humano-siempre (fail-closed) y abre revisión (ver EC-C7-6).

**US-C7-3** — Como humano-aprobador, quiero un check periódico por LOTE de lo auto-pasado disparado por tiempo (cada T) O volumen (cada N auto-pasados) O señal de divergencia, lo que ocurra primero, para cortar el error compuesto no-lineal antes de que escale.
- **Criterios de aceptación:**
  - El lote presenta muestra de auto-pasados con su métrica vinculada y delta-vs-criterio; tamaño de muestra ≥ piso definido por tier.
  - Hallar un defecto en el lote pausa el auto-pase de esa clase hasta re-aprobación humana.
  - El resultado del lote (ok / degradar / re-entrenar criterio) queda en el LEDGER y alimenta memory.md (ver C6).

**US-C7-4** — Como equipo-destino, quiero saber si un artefacto fue auto-pasado o aprobado por humano y bajo qué versión-de-criterio, para calibrar mi confianza y plugarlo a mi ritual recurrente con su champion.
- **Criterios de aceptación:**
  - Cada artefacto entregado lleva sello de procedencia de gobernanza: `auto-pase` | `humano` + versión-de-criterio + clase.
  - El sello viaja en el artefacto entregado por email/Content Studio (sin entidad de entrega nueva).

### Reglas de negocio

**BR-C7-1** [V] — `nivel_efectivo = min(politica_permite, evals_pasan, techo_de_tier)`. Si cualquier término baja, baja el efectivo. Fail-closed por defecto.

**BR-C7-2** [V] — Auto-pase es por CLASE (tipo × segmento × tier) y se GANA: requiere N aprobaciones humanas consecutivas sin rechazo + evals verdes + habilitación de política. Nunca se otorga global ni por defecto.

**BR-C7-3** [V] — Finanzas, política y T&C NO son nunca-autónomos-absolutos: pueden auto-pasar SOLO si la política habilita esa clase-de-caso Y los evals pasan. Sin habilitación explícita → techo = humano-siempre. (Finanzas = solo análisis de impacto, nunca mueve saldo → ver C3.)

**BR-C7-4** [V] — Cadencia de check humano = tiempo (cada T) Y volumen (cada N auto-pasados), más señal de divergencia [I], lo que dispare primero. Anti-error-RL-compuesto-no-lineal. La revisión es por LOTE de lo auto-pasado.

**BR-C7-5** [V] — Todo artefacto debe tener métrica-objetivo vinculada en creación para entrar a la cola; sin vínculo no es aprobable ni auto-pasable (gate previo a gobernanza). Registrado en LEDGER.

**BR-C7-6** [V] — El criterio-de-bueno vive en el KB con few-shot; la eval ES la spec de bueno (eval=PRD). El gate usa la versión-de-criterio vigente y la sella en cada decisión para auditoría y reversibilidad.

**BR-C7-7** [V] — Cualquier rechazo, falla de eval o defecto en lote en una clase auto-pasada la DEGRADA a humano-siempre de inmediato (fail-closed) y abre revisión. La re-promoción reinicia el conteo de N.

**BR-C7-8** [I] — La gobernanza opera sobre IDs internos completos (artefacto, aprobador, clase, métrica) en el LEDGER; ningún dato cross-tenant no-agregado entra al gate. Datos de mercado solo en forma agregada-anonimizada (ver hard-no por dirección).

### Casos borde

**EC-C7-1** (NBA/HOW faltante llega al gate) — Si un artefacto sin proceso/NBA reproducible llega a la cola, el gate NO lo aprueba ni auto-pasa: fail-closed → escala a humano para CREAR el proceso (que vuelve NBA reusable). C nunca inventa el how.

**EC-C7-2** (eval falla pero clase está en auto-pase) — Falla de eval fuerza salida del auto-pase para esa clase, enruta el ítem a humano y degrada la clase a humano-siempre (BR-C7-7). No se entrega con eval roja.

**EC-C7-3** (tentación cross-tenant en el dato del HOW) — Si el sustento del HOW referencia un único competidor / dato no-agregado, el gate bloquea: solo se admite vista agregada-anonimizada compuesta. Hard-no por dirección, fail-closed.

**EC-C7-4** (over-reach de autonomía: clase finanzas/política/T&C sin habilitación intenta auto-pasar) — Bloqueo duro: sin habilitación explícita de política, techo = humano-siempre, sin importar evals verdes (BR-C7-3).

**EC-C7-5** (métrica no vinculada) — Artefacto sin métrica-objetivo no entra a la cola; se devuelve a creación para vincular. Sin métrica no hay aprobación ni atribución de impacto posible (BR-C7-5).

**EC-C7-6** (drift RL: tasa de auto-pase sube pero adopción/impacto cae) — La señal de divergencia dispara check por lote fuera de cadencia; si se confirma drift, degrada las clases afectadas a humano-siempre y marca el criterio para re-entrenar en memory.md (ver C6).

**EC-C7-7** (equipo-destino ignora el artefacto auto-pasado) — Baja adopción del destino es señal de divergencia, no de aprobación; alimenta el lote y puede degradar la clase aunque las evals sigan verdes (adopción ≠ eval).

**EC-C7-8** (sobre-volumen colapsa la cola humana) — Si el backlog supera el piso de SLA, el sistema NO auto-aprueba para vaciar cola (fail-closed); prioriza por tier/riesgo y alerta al champion. Vaciar por presión está prohibido.

### Sub-proceso (workflow)

1. **Ingreso:** llega artefacto desde el generador con métrica vinculada (BR-C7-5) y NBA/HOW presente (si falta → EC-C7-1, escala).
2. **Cálculo de nivel:** computar `nivel_efectivo = min(politica, evals, techo_tier)` (BR-C7-1).
3. **Ruteo de gate:** si `nivel_efectivo` permite auto-pase para la clase Y la clase está promovida (N aprobaciones previas) → auto-pase; si no → cola humana.
4. **Decisión humana (si aplica):** aprobar/rechazar contra criterio-de-bueno vigente del KB (BR-C7-6); motivo estructurado en rechazo; sellar en LEDGER.
5. **Promoción/degradación:** N aprobaciones consecutivas sin rechazo + política + evals → promover clase a auto-pase (BR-C7-2). Cualquier rechazo/falla → degradar a humano-siempre (BR-C7-7).
6. **Sello de procedencia:** estampar `auto-pase|humano` + versión-criterio + clase en el artefacto entregado (US-C7-4).
7. **Cadencia de lote:** al cumplirse T O N O señal-de-divergencia (BR-C7-4), abrir revisión por LOTE de auto-pasados con muestra ≥ piso de tier.
8. **Resultado de lote:** ok → continúa; defecto/drift → pausa auto-pase de la clase, degrada, registra en LEDGER y append a memory.md (mejora el template, ver C6).
9. **Loop:** los aprendizajes refinan criterio-de-bueno y few-shot del KB para casos futuros del tipo.

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| BR-C7-1 (min fail-closed) | Un término permisivo enmascara otro restrictivo | Autonomía indebida en clase sensible | `min()` estricto; el más bajo manda; default cerrado |
| BR-C7-2 (auto-pase ganado por clase) | Generalizar autonomía a clases no probadas | Errores en segmentos no validados | Promoción por clase × tier; N consecutivas; reversible |
| BR-C7-3 (finanzas/política/T&C) | Auto-pase sin habilitación de política | Compromiso legal/financiero no autorizado | Techo humano-siempre sin habilitación explícita; finanzas solo impacto |
| BR-C7-4 (cadencia tiempo Y volumen + divergencia) | Error RL compuesto no-lineal pasa inadvertido | Daño escalado antes del primer check | Triple disparador (T O N O divergencia); revisión por lote |
| BR-C7-5 (métrica vinculada) | Artefacto sin métrica entra al flujo | Imposible atribuir impacto / gobernar | Gate previo: sin métrica no entra a cola |
| BR-C7-6 (eval=PRD versionada) | Aprobar contra criterio obsoleto | Inconsistencia y deriva del estándar | Versión-de-criterio sellada por decisión; auditable |
| BR-C7-7 (degradación inmediata) | Clase defectuosa sigue auto-pasando | Propagación del defecto a futuros casos | Un fallo degrada a humano-siempre; re-promoción reinicia N |
| BR-C7-8 (IDs internos / no cross-tenant) | Dato cross-tenant no-agregado entra al gate | Violación de privacidad por dirección | Solo IDs internos + mercado agregado-anonimizado |

## C8 — Entrega (email universal + Content Studio) + adopcion
**Destino:** todos los destinos (restaurantes via Content Studio; Product, Finance, Policy-owner, Legal via email)
**Objetivo:** Materializar todo artefacto aprobado por un unico canal universal (email) sin crear entidad de entrega nueva: contenido a restaurantes sale por Content Studio (lote por cohorte), artefactos internos salen por email al equipo destino. Cada entrega se ancla a un ritual nombrado + champion del equipo y se mide su reuso en el tiempo para cerrar el lazo de adopcion.

### Historias de usuario

**US-C8-1** — Como IA-orquestador, quiero enrutar cada artefacto aprobado a su canal correcto (restaurante->Content Studio por cohorte; equipo interno->email) sin instanciar una entidad de entrega nueva, para que la entrega reutilice infraestructura existente y sea trazable.
- **Criterios de aceptacion:**
  - Artefacto tipo email/contenido se empaqueta como lote-por-cohorte y se encola en Content Studio; nunca se envia 1:1 ad-hoc a un restaurante.
  - Artefacto interno (spec/finance/NBA/policy/T&C) se enruta por email al equipo destino con asunto normalizado `[C][<tipo>][<caso_id>]`.
  - Toda entrega registra `canal`, `destino`, `caso_id`, `artefacto_id` en el LEDGER (ver C7) antes de salir.

**US-C8-2** — Como equipo-destino, quiero que el artefacto llegue en MI formato y enganchado a un ritual nombrado mio con un champion identificado, para poder consumirlo sin reprocesarlo y que entre a mi flujo recurrente.
- **Criterios de aceptacion:**
  - El email/lote incluye `ritual_destino` (nombrado) y `champion` (named owner) en metadata; si falta cualquiera de los dos -> no se entrega (fail-closed, ver EC-C8-4).
  - El formato coincide con el contrato del equipo (Product=spec REFORGE, Finance=impact-analysis, Policy=draft politica, Legal=draft T&C, restaurantes=contenido cohorte).
  - El cuerpo enlaza el `target_metric` ligado al artefacto (ver C6) para que el ritual sepa que mover.

**US-C8-3** — Como humano-aprobador, quiero ver el reuso de cada artefacto en el tiempo (cuantas veces el equipo lo re-disparo / lo aplico en su ritual), para distinguir adopcion real de entrega-y-olvido y priorizar mejoras de plantilla.
- **Criterios de aceptacion:**
  - Cada artefacto expone `reuse_count` y `ultimo_uso` agregados desde el LEDGER y el ritual destino.
  - Artefacto con 0 reusos tras N ciclos del ritual se marca `adopcion_nula` -> feed al loop de mejora (ver C6) y al batch de revision humana.
  - El reuso se atribuye honestamente (uso en ritual != impacto en metrica; la atribucion vive en C6, aqui solo se cuenta el uso).

### Reglas de negocio

**BR-C8-1** [V] — Canal universal = email. No se crea entidad "entrega de artefacto": restaurantes salen por Content Studio (lote por cohorte), internos por email al equipo destino. Cualquier ruta fuera de estos dos caminos = rechazada.

**BR-C8-2** [V] — Direccion del hard-no: artefacto INTERNO se resuelve con ID completo del tenant (los equipos internos pueden ver el restaurante). Artefacto EXTERNO (contenido a restaurantes) lleva la data del PROPIO restaurante sin redactar, pero todo dato de mercado es MARKET-AGGREGATE-ANONIMIZADO; cero data de competidor singular, cero PII de otros tenants. Gate de direccion corre ANTES de empaquetar.

**BR-C8-3** [V] — Toda entrega exige `target_metric` ligado en el momento de creacion (ver C6). Sin metrica ligada -> no se entrega (fail-closed). La entrega es el evento que sella el binding en el LEDGER.

**BR-C8-4** [I] — Adopcion requiere `ritual_destino` nombrado + `champion` identificado por artefacto (Shishir Mehrotra: plug a ritual recurrente; Claire Butler: champion). Falta cualquiera -> fail-closed, no se entrega, escala a humano para asignar ritual/champion.

**BR-C8-5** [I] — Autonomia de entrega = graduada: `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)`, fail-closed. La entrega auto-pasa solo si el tipo de artefacto y su clase-de-caso estan permitidos por politica Y los evals del KB pasan (ver C6). Finance/policy/T&C NO son nunca-autonomo-absoluto: si politica permite la clase Y evals pasan, auto-entrega.

**BR-C8-6** [I] — Cadencia de control humano sobre entregas auto-pasadas = temporal Y por volumen (cada N auto-entregas) + senal de divergencia. Batch review de lo auto-entregado; previene error RL compuesto no-lineal en el canal de salida.

**BR-C8-7** [I] — Reuso es metrica de primera clase de C8: cada artefacto trackea `reuse_count` en el tiempo desde el LEDGER. Reuso = uso en el ritual destino, NO impacto en metrica (la atribucion impacto vive en C6). Cero reuso tras N ciclos -> `adopcion_nula` al loop de mejora (ver C6).

**BR-C8-8** [I] — Content Studio solo acepta lotes por cohorte; prohibido el envio 1:1 ad-hoc a un restaurante desde C8 (evita spray-and-pray y mantiene la cohorte como unidad de medida de reuso).

### Casos borde

**EC-C8-1** (NBA/how faltante upstream) — El artefacto llega sin proceso/NBA reproducible detras (B no lo proveyo). Esperado: C8 NO entrega, fail-closed, escala a humano para crear el proceso (que se vuelve NBA nuevo). C8 nunca inventa el how ni entrega un cascaron.

**EC-C8-2** (eval falla en la salida) — El artefacto no pasa los evals del KB para su tipo. Esperado: bloqueo de entrega, `nivel_efectivo` cae a humano-revisa, nunca auto-pasa. El eval es la spec de "bueno"; sin pasar, no sale.

**EC-C8-3** (tentacion cross-tenant en contenido externo) — Un email a restaurante intenta incluir data de un competidor singular o PII de otro tenant. Esperado: gate de direccion lo bloquea ANTES de empaquetar; solo se permite market-aggregate-anonimizado; el artefacto se reescribe o escala. Hard-no absoluto.

**EC-C8-4** (ritual/champion no asignado) — Artefacto listo pero sin `ritual_destino` o sin `champion`. Esperado: fail-closed, no se entrega; escala a humano para asignar ambos. Entrega sin destino-de-adopcion = entrega-y-olvido prohibida.

**EC-C8-5** (over-reach de autonomia) — Un tipo Finance/policy/T&C intenta auto-entregar sin que la politica permita su clase-de-caso. Esperado: `min(...)` lo fuerza a humano; auto-entrega denegada aunque los evals pasen. Politica manda el techo.

**EC-C8-6** (metrica no ligada) — Artefacto sin `target_metric`. Esperado: entrega bloqueada (BR-C8-3); no se puede sellar binding en el LEDGER -> no sale. Sin metrica no hay adopcion medible.

**EC-C8-7** (el equipo ignora el artefacto) — Entregado pero `reuse_count = 0` tras N ciclos del ritual. Esperado: marca `adopcion_nula`, feed a C6 (mejora plantilla/generador) y al batch humano; NO se re-spamea automaticamente al equipo. Senal de plantilla debil o ritual mal elegido.

**EC-C8-8** (deriva RL en el canal) — El volumen de auto-entregas sube y la tasa de reuso baja de forma sostenida (divergencia). Esperado: la senal de divergencia (BR-C8-6) dispara batch review fuera de cadencia y puede bajar el `tier_ceiling` de entrega hasta re-calibrar.

### Sub-proceso (workflow)

1. Recibe artefacto APROBADO + metadata (`caso_id`, `artefacto_id`, `tipo`, `target_metric`).
2. Gate de direccion (hard-no by direction): interno=ID completo permitido; externo=redacta PII + fuerza market-aggregate-anonimizado. Si detecta data de competidor singular -> bloquea (EC-C8-3).
3. Valida bindings: `target_metric` presente (BR-C8-3) + `ritual_destino` + `champion` (BR-C8-4). Falta algo -> fail-closed + escala.
4. Calcula `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)`. Si < auto -> ruta a humano-aprobador; si auto -> continua.
5. Enruta por canal (BR-C8-1): restaurante -> empaqueta lote-por-cohorte en Content Studio; interno -> email al equipo destino con asunto normalizado + formato del equipo.
6. Sella registro en LEDGER: `canal`, `destino`, `artefacto_id`, `target_metric`, `ritual_destino`, `champion`, timestamp.
7. Entrega (encola cohorte / envia email).
8. Trackea reuso en el tiempo: incrementa `reuse_count` con cada uso en el ritual; 0 tras N ciclos -> `adopcion_nula` -> C6 + batch humano.
9. Control humano: batch review por tiempo Y volumen (BR-C8-6); senal de divergencia dispara review fuera de cadencia y posible baja de `tier_ceiling`.

### Riesgo x Impacto (mis reglas)

| Regla | Riesgo | Impacto | Mitigacion |
|---|---|---|---|
| BR-C8-1 (canal universal email/Content Studio) | Tentacion de canal ad-hoc nuevo | Fragmentacion de entrega, perdida de trazabilidad | Solo 2 rutas validas; toda otra ruta rechazada; LEDGER obligatorio |
| BR-C8-2 (hard-no by direction) | Leak de competidor singular / PII en contenido externo | Violacion cross-tenant, dano legal/confianza | Gate de direccion ANTES de empaquetar; solo market-aggregate-anonimizado |
| BR-C8-3 (metric-binding en entrega) | Entregar sin metrica ligada | Adopcion no medible, sin atribucion | Fail-closed sin `target_metric`; binding sellado en LEDGER al entregar |
| BR-C8-4 (ritual + champion) | Entrega sin destino-de-adopcion | Entrega-y-olvido, artefacto muere | Fail-closed sin ritual/champion; escala a humano para asignar |
| BR-C8-5 (autonomia graduada) | Auto-entrega de clase no permitida | Over-reach, salida no gobernada | `nivel_efectivo=min(...)`; politica = techo; fail-closed |
| BR-C8-6 (control humano temporal+volumen) | Error RL compuesto no-lineal en salida | Deriva silenciosa de calidad de entrega | Batch review por tiempo Y volumen + senal de divergencia |
| BR-C8-7 (reuso primera clase) | Confundir entrega con adopcion | Falsos positivos de exito | Trackear `reuse_count` real; `adopcion_nula` -> C6 + batch |
| BR-C8-8 (cohorte como unidad) | Spray 1:1 ad-hoc a restaurantes | Spam, ruido, reuso no medible | Content Studio solo acepta lote-por-cohorte |


---

## Workflow end-to-end (dossier -> artefacto -> impacto)

**Posición:** C corre DESPUÉS de B. B enruta el *problema*; C enruta el *artefacto*. Una entrada (dossier) puede producir N artefactos (1:N).

### Pasos numerados

1. **B emite el dossier (`DOSSIER_HANDOFF`).** Entrada única de C: un caso ya diagnosticado, con problema-path y contexto del restaurante. C no re-diagnostica.

2. **Orquestador + router de C deciden el/los tipo(s) de artefacto (1:N).** El router de C es propio e independiente del de B. Mapea el dossier a uno o más tipos del conjunto CERRADO y MECE: (1) email/contenido, (2) spec de producto en formato REFORGE [preview], (3) análisis de impacto Finance, (4) proceso ejecutable NBA, (5) borrador de política, (6) borrador de T&C. Cada tipo elegido abre una rama de generación independiente.

3. **Por cada artefacto: anclaje del "cómo" (NBA + datos agregados).** El generador busca el NBA correspondiente (proceso reproducible / playbook paso-a-paso) y los datos de mercado **agregados-anonimizados** (vista compuesta e independiente; nunca dato de un solo competidor) que sustentan el "cómo".
   - **FORK A — falta NBA o datos -> FAIL-CLOSED -> ESCALAR.** Si no existe el NBA o los datos del "cómo", C **NO inventa**: escala a un humano para que **cree el proceso**. Ese proceso pasa a ser un nuevo NBA reproducible en el catálogo. La rama de este artefacto se detiene hasta que el NBA exista.
   - **Camino feliz — NBA y datos presentes ->** continúa al paso 4.

4. **El generador produce el borrador, ATADO a una métrica objetivo.** En el momento de creación, el artefacto queda vinculado (binding) a una `target_metric` y registrado para atribución posterior. Sin métrica objetivo no hay artefacto válido.

5. **Eval contra la KB de criterios -> `nivel_efectivo`.** El borrador se evalúa contra los "criterios de bueno" del tipo (knowledge base con few-shot examples; el eval ES la spec de "bueno"). Se calcula:
   `nivel_efectivo = min(policy_allows, evals_pass, tier_ceiling)` — **fail-closed**.

6. **Decisión: auto-pase vs. compuerta humana.**
   - **FORK B — compuerta humana (human gate).** Por defecto **siempre** para Finance, política y T&C, **salvo** que la clase-de-caso esté habilitada por policy Y los evals pasen. También cae aquí cualquier artefacto cuyo `nivel_efectivo` no alcance el umbral. Un humano revisa y aprueba/edita antes de entregar.
   - **Auto-pase ->** si `nivel_efectivo` lo permite, el artefacto pasa sin intervención humana al paso 7.

7. **Entrega.** Canal universal = **email**. El contenido restaurant-facing sale por **Content Studio** (pantalla existente de contenido batch-por-cohorte). Los artefactos internos -> email al equipo destino (Product, Finance, Policy-owner, Legal), en su formato y enganchado a su ritual recurrente. No se crea entidad nueva de "entrega".

8. **Log en el ledger de impacto (artefacto <-> métrica).** Cada artefacto entregado se asienta en el ledger con su `target_metric`, tipo, destino, nivel y modo (auto/humano).

9. **Más tarde: surfacing por métrica -> atribución de impacto.** Ante una métrica, se listan TODOS los artefactos atados a ella -> atribución de impacto, **honesta sobre señal vs. estacionalidad** (no se reclama causalidad que no se puede sostener).

10. **Loop de mejora vía memory.md.** Primero se mejora el artefacto de ESTE caso; luego se anexan aprendizajes a `memory.md`, que mejora el **template/generador** para todos los casos futuros de ese tipo.

11. **Revisión humana por LOTES (cadencia temporal Y por volumen).** Guardia contra el **error de RL compuesto y NO-lineal**: revisión batch de los artefactos auto-pasados con cadencia **tanto temporal** (cada N tiempo) **como por volumen** (cada N auto-pases) [+ señal de divergencia]. Los hallazgos alimentan el RL y el loop del paso 10.

### Diagrama de flujo (compacto)

```
[B] DOSSIER_HANDOFF
      |
      v
[C] Orquestador + Router de artefacto ---(1:N)---> abre 1..N ramas
      |
      v  (por cada artefacto)
ANCLAJE del "cómo"  =  NBA (playbook)  +  datos agregados-anonimizados
      |
      +--[falta NBA/datos]--> FAIL-CLOSED --> ESCALAR a humano
      |                         (crea proceso -> nuevo NBA -> rama en pausa)
      |
      v  [NBA + datos OK]
GENERAR borrador  --(binding)-->  target_metric
      |
      v
EVAL vs KB-criterios  -->  nivel_efectivo = min(policy, evals, tier)   [fail-closed]
      |
      +--[Finance/policy/T&C  ó  nivel insuficiente  ó  clase no habilitada]
      |        --> HUMAN GATE (revisa / aprueba / edita)
      |
      v  [nivel permite auto-pase]
ENTREGA: email universal | restaurant-facing -> Content Studio | interno -> email equipo
      |
      v
LEDGER de impacto  (artefacto <-> target_metric)
      |
      v
[después] Surfacing por métrica --> ATRIBUCIÓN (señal vs estacionalidad)
      |
      v
memory.md  (mejora: 1º artefacto del caso  ->  2º template/generador)
      |
      v
REVISIÓN por LOTES (cadencia temporal Y volumen [+ divergencia])
      |
      `--> alimenta RL  [guarda contra error compuesto no-lineal]
```

---

# CIERRE — Resolución de blockers (triple-check `/sat` + build-readiness + team-aware)

> Esta sección es **autoritativa**: produce/define todo lo que el cuerpo (C1–C8) consume pero no producía. 3 críticos = veredicto **FIX** (ninguno BLOCK). Los hard-nos absolutos quedaron limpios en `/sat` (saldo bloqueado en BR-C1-7/BR-C3c-1/BR-C5-6; cross-tenant defendido en todas; PII externa redactada; inyección/text-as-data cubierto).

## 1. Correcciones de punteros (ya aplicadas en el cuerpo)
- `C9` (épica inexistente) → **C6** (loop de mejora) — 6 ocurrencias en C8/C7.
- C4: el loop `memory.md → template` apuntaba a `C5` → **C6** (3 ocurrencias). Se mantiene `C5` solo donde C4 escribe veredictos al **ledger**.
- C5 US-C5-2: NBA-faltante apuntaba a `C4` → **C2/C3d** (owner canónico del patrón crear-NBA).

## 2. Owner ÚNICO de resolución-NBA (colapsa el solapamiento C2 ↔ C3d)
Ambas épicas reclamaban resolver el NBA. Split canónico:
- **C3d = servicio único de resolución-NBA.** Resuelve contra el catálogo, emite el veredicto `MISSING` (→ fail-closed → escala a humano para crear el proceso) y entrega el **contrato tipado** `NBA_REF { steps[], metrica_objetivo, provenance, status, version }` que consumen C3a–C3f.
- **C2 = servicio de evidencia-de-mercado agregada-anonimizada** (k-anon, vista compuesta, patrón Uber Eats). Ya **no** "resuelve NBA": provee el *dato del cómo* que C3d (y C3c/C3e/C3f cuando citan agregados) consumen.
- **C1** declara UNA arista explícita de invocación: `generador → C3d (resuelve/valida NBA) → C2 (evidencia de mercado) si el NBA la requiere`. Se elimina el workflow duplicado de resolución que vivía en C2.

## 3. Productores faltantes — owners asignados `[I]` (resuelve los consumos transversales)
| Entidad consumida (por) | Owner/productor | Definición mínima | Default fail-closed |
|---|---|---|---|
| Catálogo de **políticas** (case-classes auto-habilitadas) + **`tier_ceiling`** (lo lee todo `nivel_efectivo`) | **C7** · sub-épica "Registro de política + tiers" | quién habilita una clase, versionado 4-ojos; `tier` = techo por (tipo de artefacto × clase de caso) | clase no listada = **no auto** |
| **Señal de recurrencia** (conteo cross-dossier por problem-path; la consumen C3b spec y C3e política) | **C5** · agrega por problem-path/ventana | conteo por problem-path × ventana, umbral `N` | sin conteo = no dispara C3b/C3e |
| **Catálogo cerrado de métricas** (lo consume el metric-binding de toda épica) | **C5** | `metric_id, baseline, ventana`; alta tras escalado | métrica fuera de catálogo = escala a humano |
| **Señal-de-divergencia** (3er disparador de cadencia; 6 épicas) | **C5** | `f(evals_pass histórico, tasa de descarte/edición, reuse_count)`, umbral configurable | sin señal = cadencia solo por tiempo+volumen |
| **`adoption_score`** (desempate entre NBAs en C2) | derivado en **C5/C8** (`reuse_count` + impacto atribuido) | hasta tener score → desempata por `reuse_count` | — |
| **Registro de adopción** (equipo→ritual+champion; gate duro de entrega en C8) | **C8** (ver §4) | mapeo tipo×equipo → ritual nombrado + champion; **alta inicial manual** | fail-closed CON seed manual día-1 (no congela el 100% de entregas) |

> **Nota de contrato bilateral (gate cross-screen):** la *señal de recurrencia* se resuelve **dentro de C** (C5 agrega) para NO tocar el contrato de B. Alternativa = que B emita `pattern_flag`/count en el `DOSSIER_HANDOFF`; eso exigiría actualizar **también** el doc de B (bilateral) y queda como opción, no default.

## 4. Adopción team-aware — ritual + champion por destino `[C]` (roles placeholder hasta que el operador nombre personas)
| Destino | Ritual recurrente **nombrado** | Champion (rol del equipo destino) | Control / 4-ojos |
|---|---|---|---|
| **Restaurantes** — C3a (espina) | "Cohort send calendar" (lote semanal por cohorte) | Content-ops lead | revisión de contenido |
| **Producto** — C3b (preview) | "Discovery intake" (cola de discovery) | PM de Discovery | — |
| **Finanzas** — C3c | "Monthly close / forecast review" | Finance-analyst lead | — |
| **Motor A / NBA** — C3d | "NBA catalog review" (C-ops + owner del motor A) | Owner del motor A | — |
| **Política** — C3e | "Policy review board" (quincenal) | Policy-owner lead | 2-ojos (ver abajo) |
| **Legal / T&C** — C3f | "Legal review queue" | Legal counsel | gate legal obligatorio |

- **Shishir Mehrotra** (ritual nombrado) y **Claire Butler** (champion embebido en el equipo destino) son **principios de diseño, NO titulares.** Donde el cuerpo los nombre como owner, léase el rol de esta tabla.
- **Champion ≠ aprobador 4-ojos** (adopción ≠ control). Si el champion también aprueba, cuenta como **UNO** de los dos ojos, nunca los dos (aplica a C3e/C3f).
- **La lectura de impacto entra al ritual de CADA equipo**, no solo al de Producto: cada destino revisa su atribución (consulta a C5) dentro de su propio ritual recurrente (Finanzas en su forecast, Legal en su review queue, etc.).
- **C3a era la espina peor anclada** (más volumen, sin ritual nombrado): queda con "Cohort send calendar" + Content-ops lead + AC fail-closed si falta ritual/champion (alinea con BR-C8-4).

## 5. RESUELTO `[V]` — el catálogo de NBA es ÚNICO (Leo, 2026-06-16)
Hay **una sola lista**, ya modelada en `04`: **`NBA_Catalogo`** (los 8 TIPOS A1-A8, CERRADO — C **LEE**, nunca añade un código) + **`Knowledge_Case`** (el repositorio de RESOLUCIONES / el "cómo" — abierto, crece por RL, C **ESCRIBE** por el mismo path que el Diagnóstico B). "Falta NBA → humano crea el proceso" = **`INSERT` en `Knowledge_Case`** (`flag='no-reforzado'`), **nunca** un código A9 nuevo. Plan-B (catálogo propio + sync) **descartado**.

---

## 6. CIERRE-2 — Reconciliación con el modelo canónico `04_arquitectura_de_datos.md`
> **Autoritativo y por encima del CIERRE-1.** `04` MANDA. Tras el triple-check (`/sat`+`/problem-solving`+`/office-hours`, 3 lentes convergieron) cotejado contra el texto de `04`: **C reinventaba ~70% del storage que el Cerebro ya tiene.** Reencuadre: **C = traductor del dossier en N artefactos SOBRE el Cerebro**, no una plataforma con ledger/catálogo propios (igual que B pasó de monolito a orquestador). Donde C y `04` difieran, manda `04` + esta sección.

### A. Renombres al canon + el gate que C omitió
- Motor: **`nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)`** — no "policy/evals/tier". `evals_pass → liberado_evals` (`Eval_Cell`); `tier_ceiling → teto_tier` (`Politica_Tier`).
- **C OMITIÓ el gate-1 `Credencial`** y trató "policy" como brazo del min. Son **TRES PUERTAS fail-closed**: gate-1 `Credencial` (elegibilidad por-tenant, RESTRINGE) → gate-2 `Politica_Tier` → gate-3 `min()`. La habilitación de clase-de-caso (finance/política/T&C auto) es **gate-1/gate-2**, NO un brazo del min.
- **"Sin trace no hay acción":** cada auto-pase/gate de artefacto escribe un `Decision_Trace` (append-only). El "ledger" del CIERRE-1 (C5) **ES** `Decision_Trace` + `min_calculo`, no una tabla nueva.

### B. Reusos — lo que C NO declara (lee del Cerebro)
| Lo que C inventó (CIERRE-1 §3) | Ya existe en `04` |
|---|---|
| catálogo de métricas | `KPI` (`kpi_id`) + `Named_Query` (`metric_id`=`kpi_id`; número **siempre determinista**, nunca LLM) |
| registro de política + tiers | `Politica_Tier` (`teto_tier`) + `Eval_Cell` (`liberado_evals`) + `Credencial` (gate-1) |
| ledger + atribución | `Decision_Trace` + `min_calculo` + `ROI_Operador` (2 compuertas; "no separable" = `metodo_atribucion=funnel-correlacional`/`es_atribuible=false`) |
| señal de recurrencia | `Problema_Diagnosticado.frecuencia` + `primera/ultima_vez_ts` |
| señal de divergencia | `Eval_Cell` (rebajar=automático, `kappa`, `redteam`) + `ROI_Operador.guardrail_error` |
| entrega email | `Content_Lote` (grounding fail-closed YA existe: sin ancla→rojo) |
| dossier de entrada | `v_dossier_handoff` (vista; C declara los 11 campos — `04` §3.5) |
| umbral k | `Config_Perillas.k_anon_threshold` (fuente única, no `k=5`) |

### C. El "cómo" / NBA reconciliado
`NBA_REF.steps[]` **no** mapea a `NBA_Propuesta` (que no tiene `steps[]`). El paso-a-paso vive en **`Knowledge_Case.resolucao`** (extendida en `04` §3.5 a `jsonb {steps[], precondiciones, metrica_objetivo_ref}`). C3d resuelve contra `Knowledge_Case` (no inventa filas de catálogo). `metrica_objetivo → KPI`; `provenance → provenance_por_campo`.

### D. Cross-tenant = cross-POOL (`04` §3.1/§8, actualizado 06-16)
La frontera de aislamiento es el **operador/pool** (`tenant_id`), no el restaurante. **Agregar los restaurantes del propio operador es operación normal** (no cross-tenant) — la "evidencia de mercado" de C2 dentro del pool es **libre**. El **k-anon** solo muerde en la **salida cross-pool** (zona `cohort`, `n_cuentas >= k`). El "hard-no por dirección" del CIERRE-1 se re-expresa: interno-al-pool = RLS (libre dentro); cross-pool/agregado = zona cohort k-anon.

### E. Lo genuinamente NUEVO de C (ya cosido en `04` §3.5, Fase 2)
1. **`Artefacto_Generado`** (zona `gov`, append-only) — los **5 tipos NO-email** (spec REFORGE, Finanzas, NBA-render, política, T&C). `Content_Lote` cubre solo email/contenido.
2. **`Ritual_Destino`** (catálogo) — adopción (ritual nombrado + champion; gate fail-closed con alta manual).
3. Los **11 campos** de `v_dossier_handoff` (cierra `04` Open Question #4).
4. Extensión `Knowledge_Case.resolucao → jsonb {steps[]}`.

### F. Build (`04` §13): C es **Fase 2**, no la espina
La espina Fase 1 = 8 tablas (Restaurante/Orden/Conversa/Problema/Afetado/Eval_Cell/min_calculo/NBA_Propuesta). **C entra como Lote en Fase 2** (consume el dossier ya corriendo). El **dato-del-cómo no derivable** (lo que los usuarios *buscan* en la plaza — `Orden` no lo tiene) → **escala a humano** (Q1.3), no se inventa.
