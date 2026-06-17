# Pantalla 01 — Cohorts Explorer · Breakdown de Feature

> **DRAFT generado por el Feature Breakdown Engine en modo AUTÓNOMO**, anclado ÚNICAMENTE en `specs/00_vision_completa.md` (v1.0 · 2026-06-15) más el cruce con `01_e2e_process.txt` y `02_user_stories.md` (mismas v1.0/fecha). El operador NO estuvo disponible para la entrevista (live grill), por lo que cada punto donde el grill HABRÍA preguntado se resolvió con la mejor hipótesis sustentada, etiquetada `[I]`, y la pregunta exacta (PT-BR) está registrada en **OPEN QUESTIONS** al final. **Este spec queda pendiente de las respuestas del operador a esas preguntas antes de considerarse cerrado.**
>
> **Provenance:** `[V]` vivido/derivable del doc · `[I]` inferido/a-decidir · `[C]` placeholder de escenario (nunca dato real).
> **Convención:** términos canónicos en `snake_case`; thresholds numéricos siempre `[C]`.

---

## Stage 0 — GROUND (resumen)

**PROBLEMA + OUTCOME (Working-Backwards).** [I]
El operador 1:10 no sabe **a quién priorizar dentro de un cohort**: ve miles de cuentas pero no dónde está el potencial ni qué separa a los mejores de la media. Sin esa lectura, la NBA no tiene a quién mover ni hacia dónde, y el North Star no tiene línea base de percentil contra la cual medir movimiento. **OUTCOME:** convertir el Cerebro en una **cola priorizable por gap-de-percentil**, que (a) alimenta NBA (qué acción cierra el gap) y (b) da al North Star el baseline para medir **movimiento de percentil** dentro del cohort. [V: §4 Pantalla 1 "Ata a: alimenta NBA… y North Star (medir movimiento de percentil)"]

**SCOPE.** Pantalla de **lectura/exploración**: la IA segmenta y calcula percentiles (batch versionado); el humano explora y decide a quién priorizar. NO ejecuta acciones sobre cuentas (eso es NBA/Inbox/Content Studio); NO toca dinero; NO promueve autonomía. Es lectura sobre el Cerebro + handoff de intención a NBA. [V: §4 Pantalla 1 "IA vs humano"]

**DEP-MAP (dim → dims que habilita).**
- DATA-IN (fichas Cerebro + regla de cohort versionada) → habilita PROCESSING (percentil/gap/baseline) → habilita DATA-OUT (handoff a NBA + baseline North Star) y UI.
- BUSINESS-RULES (n_min, cross-tenant, versionado) y EDGE (n<min, knowledge ausente, baseline stale) cuelgan de DATA-IN y PROCESSING.
- METRICS y NON-FUNC se cierran al final.

**COBERTURA: 11/11** (resuelta por doc + `[I]` donde el doc no decide). Ningún `[I]` bloqueante (ver gate).

---

## OUTPUT 1 — ÉPICAS, USER STORIES & RECORRIDO

**SÍNTESIS:** Cohorts Explorer convierte el Cerebro del Cliente en una **cola priorizable por gap-hasta-el-tope dentro del cohort**; sin ella se rompe el eslabón 2→3 del motor — NBA no sabe a **quién** mover ni **hacia qué patrón** (el de los P90+), y el North Star pierde el baseline de percentil contra el que mide movimiento. [V: §2 eslabón 2; §4 Pantalla 1]
**PROBLEMA:** el operador no sabe a quién priorizar dentro de un cohort. **OUTCOME:** movimiento de percentil dentro del cohort (tie directo al North Star) + handoff priorizado a NBA. [V: §4 Pantalla 1]
**PLACEMENT:** esta pantalla = **1 de 11** del cockpit (área: segmentación/eslabón 2 del motor). Aguas-arriba: Ficha/Cerebro (#7, fuente de grounding) y Política/Tier (#10, fuente de `tier_base`/`teto_tier`). Aguas-abajo: NBA/Playbooks (#2), North Star, y Evals (#6, celda `cohort × intent`). Hermanas conocidas: las otras 10 pantallas; ninguna se inventa aquí. [V: §2; §4]

### Épicas (MECE; descomponen ESTA pantalla sin solape; cada una desarrollable)

---

**EPIC-1 · Segmentación y cálculo de percentiles** | alcance: agrupar cuentas por la regla de cohort versionada y calcular, por cuenta, `percentil_en_cohort`, `gap_hasta_top` y `baseline_cohort` | cubre dims: DATA-IN(3), PROCESSING(4), ROUTERS(5) | spec: **WHAT** (regla de cohort versionada; n_min para percentil significativo; cross-tenant hard-no; fail-closed si knowledge ausente) · **HOW** (job batch versionado que persiste en Cerebro; percentil por ranking dentro del cohort; gap = métrica_top − métrica_cuenta).

  **Features:**
  - **F-1.1 · Definición/versionado de la regla de cohort** — la pertenencia se determina por regla versionada (mismo `tier_base` + atributos canónicos), nunca ad-hoc. [V: §2 "regla versionada"; §4; US-M1.1 AC3/SEG-R5]
  - **F-1.2 · Cálculo batch de percentil + gap + baseline** — job versionado que persiste el resultado en el Cerebro. [I: batch vs tiempo-real → ver OQ-1]
  - **F-1.3 · Gate de significancia (n_min) y de suficiencia de datos** — no emitir score autoritativo bajo el mínimo. [V: §4 Pantalla 1 lógica + §11.4 open question n_min; US-M1.1 AC4]

  **US-1.1.1** | MoSCoW: Must | Hito: H2 — Como **operador 1:10**, quiero que el sistema **agrupe cada cuenta en su cohort por una regla versionada**, para confiar en que la comparación es estable y auditable (no ad-hoc). [V: §2; US-M1.1 AC3]
  - Given una cuenta con `tier_base` y atributos canónicos resueltos, When corre el job de segmentación, Then la cuenta queda asignada a exactamente un `cohort_id` según `cohort_rule_version` vigente. [V]
  - (edge) Given que cambia la regla de cohort, When se publica `cohort_rule_version` nueva, Then los percentiles se recalculan contra el nuevo baseline y la versión queda visible en la UI (no se mezclan baselines de versiones distintas). [I: comportamiento de re-versionado → OQ-2]

  **US-1.1.2** | MoSCoW: Must | Hito: H2 — Como **operador 1:10**, quiero ver para cada cuenta su **`percentil_en_cohort` y su `gap_hasta_top`**, para priorizar a quién mover primero. [V: §4 Pantalla 1; US-M1.1 AC2]
  - Given un cohort con `n_cuentas ≥ n_min [C: 20]`, When abro la fila de una cuenta, Then veo `percentil_en_cohort`, `gap_hasta_top` y el `baseline_cohort`, cada valor con su sello de provenance. [I: n_min=20 → OQ-3]
  - (edge) Given un cohort con `n_cuentas < n_min`, When se renderiza, Then NO se muestra percentil (se oculta + aviso "n insuficiente para percentil significativo"); fail-closed. [I: ocultar+aviso → OQ-3]

  **US-1.1.3** | MoSCoW: Must | Hito: H2 — Como **operador 1:10**, quiero que el percentil **nunca se calcule cruzando tenants**, para no violar el aislamiento Sony≠Warner. [V: §2; §8.3; §10; §4 Pantalla 5 hardening; US-M1.1 AC5/AUT-08]
  - Given cuentas de tenants distintos, When corre la segmentación, Then ninguna cuenta de un tenant entra en el baseline/benchmark de otro, salvo como **agregado de cohort anonimizado** dentro del mismo tenant. [V]
  - (edge) Given una consulta que requeriría cruzar tenants para "comparar mejor", When se evalúa, Then se BLOQUEA (hard-no absoluto) + log de evento de seguridad. [V: §10; §8.3]

---

**EPIC-2 · "Qué hacen los P90+" (patrón de los mejores)** | alcance: derivar y mostrar, por cohort, el patrón estructural de las cuentas P90+ (qué los separa de la media) | cubre dims: PROCESSING(4), DATA-OUT(6 parcial), UI(7) | spec: **WHAT** (resumen del patrón de P90+ anclado en el Cerebro; provenance visible; degradación si knowledge insuficiente) · **HOW** product-judgment: se declara el outcome (qué dimensiones describen el patrón) y se deja al builder la forma exacta del resumen — **no se sobre-especifica el render**.

  **Features:**
  - **F-2.1 · Cómputo del patrón P90+** — agrega las características de las cuentas en el percentil ≥ 90 del cohort (ej. estructura de promo, ventana, fuso/timezone). [V: §4 Pantalla 1 "qué hacen los P90+"; US-M1.1 AC2]
  - **F-2.2 · Anclaje y provenance del patrón** — cada afirmación del patrón ancla en el Cerebro y se etiqueta `[V]/[I]/[C]`. [V: §8.8 provenance en la UI]

  **US-2.1.1** | MoSCoW: Should | Hito: H2 — Como **operador 1:10**, quiero un resumen **"qué hacen los P90+"** por cohort, para anclar las NBA en el comportamiento de los mejores en vez de en intuición. [V: §4 Pantalla 1; US-M1.1]
  - Given un cohort con `n_cuentas ≥ n_min` y `knowledge_de_cohort` suficiente, When lo abro, Then veo el patrón de los P90+ descrito por dimensiones canónicas (estructura de promo, ventana, fuso), cada una con provenance. [V/I]
  - (edge) Given `knowledge_de_cohort` ausente o sesgado (pocos datos), When se intenta derivar el patrón, Then NO se emite un score que parezca autoritativo; se degrada a regla determinística mínima y se señala la laguna explícitamente. [V: US-M1.1 AC4 / SEG-R5 / DET-09]

---

**EPIC-3 · Exploración, priorización y handoff a NBA** | alcance: navegación de cohorts/cuentas, ordenamiento por gap, y emisión del **evento priorizado** que NBA consume; más el baseline que el North Star usa para medir movimiento | cubre dims: DATA-OUT(6), UI(7), TRIGGERS/ENTRY(2) | spec: **WHAT** (al priorizar, se emite intención-priorizada sin ejecutar acción; baseline de percentil disponible para North Star) · **HOW** product-judgment: el builder decide el ordenamiento/filtros exactos; el contrato de salida a NBA es fijo.

  **Features:**
  - **F-3.1 · Lista de cohorts y drill-down de cuentas** — lista cada cohort con `cohort_id`, `tier_base` y `n_cuentas`; al abrir, lista las cuentas con percentil/gap. [V: US-M1.1 AC1/AC2]
  - **F-3.2 · Ordenamiento/priorización por gap** — ordenar la cola por `gap_hasta_top` (y/o $-en-juego como prior, sin ejecutar). [I: criterio de orden exacto → OQ-4]
  - **F-3.3 · Handoff a NBA (evento priorizado)** — al marcar una cuenta/segmento como prioritario, se emite un evento que NBA consume; **la pantalla nunca ejecuta la acción**. [V: §4 Pantalla 1 "alimenta NBA"]
  - **F-3.4 · Baseline de percentil para North Star** — el percentil/baseline persistido queda disponible como medida contra la cual el North Star mide movimiento. [V: §4 Pantalla 1 "North Star (medir movimiento de percentil)"]

  **US-3.1.1** | MoSCoW: Must | Hito: H2 — Como **operador 1:10**, quiero **explorar cohorts y cuentas y priorizar por gap**, para concentrar mi atención donde hay más potencial sin esfuerzo manual. [V: §4 Pantalla 1 "el humano explora y decide a quién priorizar"]
  - Given la pantalla cargada, When entro, Then veo la lista de cohorts con `cohort_id`, `tier_base` y `n_cuentas`. [V: US-M1.1 AC1]
  - Given un cohort abierto, When ordeno por `gap_hasta_top`, Then veo las cuentas de mayor a menor gap (las de mayor potencial arriba). [I: orden por gap → OQ-4]

  **US-3.1.2** | MoSCoW: Should | Hito: H2 — Como **operador 1:10**, quiero **marcar una cuenta o segmento como prioritario y pasarlo a NBA**, para que la próxima mejor acción se calcule sobre lo que yo prioricé. [V: §4 Pantalla 1 tie a NBA]
  - Given una cuenta priorizada, When confirmo el handoff, Then se emite un evento priorizado a NBA con `{account_id, cohort_id, percentil_en_cohort, gap_hasta_top, cohort_rule_version}`; **la pantalla no ejecuta ninguna acción ni mueve autonomía**. [V/I: payload exacto → OQ-5]
  - (edge) Given que el cohort de la cuenta tenía `n < n_min` (percentil oculto), When intento priorizar por percentil, Then el handoff por percentil se bloquea y solo se permite priorización cualitativa marcada como `[I] sin-percentil`. [I: comportamiento de handoff bajo n_min → OQ-3]

  **US-3.1.3** | MoSCoW: Should | Hito: H2 — Como **responsable del North Star**, quiero que el `percentil_en_cohort` quede **persistido y versionado en el tiempo**, para medir movimiento de percentil como señal de valor. [V: §3; §4 Pantalla 1]
  - Given un recálculo batch, When persiste el resultado, Then guarda `{account_id, cohort_id, percentil_en_cohort, cohort_baseline_version, timestamp}` permitiendo serie temporal del percentil. [I: granularidad temporal → OQ-6]

### Recorrido (primera persona, clic por clic, estado por estado)

Yo, como **operador 1:10**, entro en **Cohorts Explorer**.
- **(estado: carga)** Veo un skeleton mientras el sistema lee el último snapshot batch persistido en el Cerebro. La pantalla **no recalcula en vivo**: muestra el baseline versionado vigente (`cohort_baseline_version` visible). [I: batch → OQ-1]
- **(estado: lista)** Veo la **lista de cohorts**: cada fila con `cohort_id`, `tier_base`, `n_cuentas` y el `cohort_rule_version` que la define. Los cohorts con `n_cuentas < n_min` aparecen marcados "n insuficiente — percentil no disponible". [I: n_min → OQ-3]
- Hago clic en un cohort con `n_cuentas ≥ n_min`. Espero que se abra el **drill-down de cuentas**, ordenado por `gap_hasta_top` (mayor potencial arriba). [I: orden → OQ-4]
- **(estado: drill-down)** Veo, por cuenta, `percentil_en_cohort` y `gap_hasta_top`, cada valor con su sello `[V]/[I]/[C]`. Arriba, un panel **"qué hacen los P90+"** describe el patrón de los mejores (estructura de promo, ventana, fuso) con provenance. [V]
- **(estado: degradado)** Si el cohort tiene `knowledge_de_cohort` insuficiente, en lugar del patrón P90+ veo un aviso "datos insuficientes — regla determinística mínima" y NO un score con apariencia autoritativa. [V: US-M1.1 AC4]
- Hago clic en una cuenta de alto gap y marco **"priorizar"**. Espero que se abra el confirmador de **handoff a NBA**. Confirmo. El sistema **emite un evento priorizado a NBA** y me muestra "enviado a NBA"; **no se ejecuta ninguna acción ni cambia autonomía aquí**. [V]
- **(estado: vacío)** Si no hay cohorts (tenant recién sembrado), veo un estado vacío con enlace a Onboarding (#9), no una tabla en blanco. [I: estado vacío → OQ-7]
- **(estado: error)** Si el snapshot batch falló o está stale más allá del TTL, veo un banner "baseline no fresco — percentiles pueden estar desactualizados", con el timestamp del último snapshot válido; los percentiles NO se ocultan pero se marcan `stale`. [I: política de stale → OQ-8]

---

## OUTPUT 2 — BUSINESS RULES + EDGE CASES + FAILURE HANDLING

**SÍNTESIS:** el modo de fallo que más amenaza el North Star es **decidir sobre ruido**: emitir un `percentil_en_cohort` con `n < n_min` o con un `baseline_cohort` stale/sesgado, porque entonces la priorización y el movimiento-de-percentil (la señal misma del North Star) se construyen sobre estadística no significativa — peor que no tener pantalla. La defensa es fail-closed en n_min, versionado del baseline y hard-no cross-tenant. [V/I: §2; §3; §8.3; §11.4]

### A. Business Rules (invariantes)

**BR-1** | [V] | hard-no: **sí** | versionada: no
Regla: los cohorts y baselines son **agregados dentro de un único tenant**; ningún dato de un tenant entra en el cohort/baseline/benchmark de otro, salvo como agregado de cohort anonimizado del **mismo** tenant. · Por qué: aislamiento Sony≠Warner (GDPR/contrato). · Disparador/Alcance: todo cálculo de segmentación y todo "qué hacen los P90+". [V: §8.3; §10; §4 Pantalla 5]
**SI SE VIOLA / FALLA →** bloqueo-rojo absoluto (fail-closed) + log de evento de seguridad atribuido al tenant + alerta al operador y a gobernanza. (operador + Política/#10)

**BR-2** | [I] | hard-no: no | versionada: no
Regla: no se emite `percentil_en_cohort` ni patrón P90+ si `n_cuentas < n_min [C: 20]`; por debajo se oculta + aviso de "n insuficiente". · Por qué: un percentil sobre n chico es ruido; decidir sobre él contamina el North Star. · Disparador/Alcance: en cada render y en cada handoff por percentil. [I: n_min=20 → OQ-3; ancla §11.4]
**SI SE VIOLA / FALLA →** ocultar el card + aviso (fail-closed); si la detección de n falla, NO renderizar percentil y alertar al operador. (operador)

**BR-3** | [V] | hard-no: no | versionada: **sí**
Regla: la pertenencia a cohort y el baseline se determinan por **regla versionada** (`cohort_rule_version` / `cohort_baseline_version`), nunca ad-hoc; elegir el cohort de comparación "para verse bien" es gaming auditable. · Por qué: estabilidad y auditabilidad de la comparación; un baseline movible invalida la medida de movimiento. · Disparador/Alcance: definición y recálculo de cohorts. [V: §2; US-M1.1 AC3/SEG-R5; 01_e2e PASO 1.10]
**SI SE VIOLA / FALLA →** rechazar el cálculo con versión faltante/divergente; degrade-to-human (no segmentar con regla ambigua) + alerta. (operador / Producto-Eng)

**BR-4** | [I] | hard-no: no | versionada: no
Regla: ante `knowledge_de_cohort` ausente o sesgado, NO se emite score con apariencia autoritativa; se degrada a regla determinística mínima y se señala la laguna en la UI. · Por qué: un score falso-autoritativo sobre pocos datos induce mala priorización (fail-closed sobre la confianza). · Disparador/Alcance: cómputo del patrón P90+ y del percentil. [V: US-M1.1 AC4 / SEG-R5 / DET-09]
**SI SE VIOLA / FALLA →** mostrar aviso de laguna + provenance `[I]`; si la detección de insuficiencia falla, marcar todo el cohort como `low-confidence` y no permitir handoff por percentil. (operador)

**BR-5** | [V] | hard-no: no | versionada: no
Regla: todo valor mostrado (percentil, gap, baseline, patrón P90+) lleva **provenance visible** `[V]/[I]/[C]`; los thresholds `[C]` se rotulan como placeholder. · Por qué: el número es placeholder; el valor está en el mecanismo (honestidad de escopo). · Disparador/Alcance: todo render. [V: §8.8; §10.9]
**SI SE VIOLA / FALLA →** no mostrar el valor sin sello; degrade a "valor sin provenance — no confiable". (operador)

**BR-6** | [V] | hard-no: **sí** | versionada: no
Regla: esta pantalla es **lectura/exploración**; no ejecuta acciones sobre cuentas, no toca dinero y **no eleva autonomía**. El handoff a NBA emite intención priorizada, no acción. La autonomía efectiva (cuando aplique aguas-abajo) sigue siendo `min(pedido_NBA, liberado_evals, teto_tier)`. · Por qué: acción financiera nunca autónoma; el `min()` y el fail-closed se preservan invariantes. · Disparador/Alcance: cualquier salida de la pantalla. [V: §2 fórmula; §4 Pantalla 1 frontera IA/humano; §10.3 riesgos]
**SI SE VIOLA / FALLA →** bloquear cualquier intento de ejecución desde esta pantalla + escalar a humano. (operador / gobernanza)

### B. Edge Cases (de la pasada pre-mortem)

**EC-1** | dim: EDGE/DATA-IN | [I] — Caso: cohort con `n_cuentas < n_min [C: 20]`. · Detección: `count()` al render del cohort/cuenta. · Comportamiento: ocultar percentil + aviso "n insuficiente"; permitir solo priorización cualitativa `[I] sin-percentil` (fail-closed). · Regla(s): BR-2.
**SI LA DETECCIÓN FALLA →** no renderizar el card de percentil y alertar al operador (failure-of-the-handler).

**EC-2** | dim: EDGE/BUSINESS-RULE | [V] — Caso: intento de comparar/benchmark cruzando tenants (Sony↔Warner). · Detección: chequeo de `tenant_id` antes de poblar el baseline. · Comportamiento: bloqueo-rojo absoluto + log de seguridad (fail-closed). · Regla(s): BR-1.
**SI LA DETECCIÓN FALLA →** abortar el job completo de segmentación y congelar la salida hasta revisión humana de gobernanza.

**EC-3** | dim: EDGE/PROCESSING | [V] — Caso: `knowledge_de_cohort` ausente o sesgado (pocos datos para el patrón P90+). · Detección: chequeo de suficiencia/cobertura de datos del cohort. · Comportamiento: degradar a regla determinística mínima + señalar la laguna; no emitir score autoritativo. · Regla(s): BR-4.
**SI LA DETECCIÓN FALLA →** marcar el cohort `low-confidence`, bloquear handoff por percentil y alertar.

**EC-4** | dim: EDGE/DATA-IN | [I] — Caso: `baseline_cohort` stale (snapshot batch más viejo que el TTL `[C]`). · Detección: comparar `timestamp` del snapshot vs TTL al cargar. · Comportamiento: mostrar percentiles marcados `stale` + banner con el último snapshot válido; no ocultarlos pero degradar confianza. · Regla(s): BR-3, BR-5.
**SI LA DETECCIÓN FALLA →** si el job batch no corrió, mostrar banner "baseline no disponible" y no permitir handoff. [I: política exacta de stale → OQ-8]

**EC-5** | dim: EDGE/PROCESSING | [I] — Caso: `cohort_rule_version` cambia y conviven percentiles de dos versiones. · Detección: comparar la versión del valor persistido vs la vigente. · Comportamiento: recalcular contra la versión vigente; nunca mezclar baselines de versiones distintas en la misma vista; mostrar la versión usada. · Regla(s): BR-3.
**SI LA DETECCIÓN FALLA →** mostrar la versión más antigua marcada `version-mismatch` y bloquear handoff hasta recálculo. [I → OQ-2]

**EC-6** | dim: EDGE/UI | [I] — Caso: tenant recién sembrado, cero cohorts. · Detección: `n_cohorts == 0`. · Comportamiento: estado vacío con enlace a Onboarding (#9), no tabla en blanco. · Regla(s): —.
**SI LA DETECCIÓN FALLA →** estado vacío genérico + log. [I → OQ-7]

**EC-7** | dim: EDGE/PROCESSING | [I] — Caso: toggle Musixmatch donde el cohort tiene n muy chico (ej. **3 majors**): el percentil dentro de cohort **pierde sentido**. · Detección: misma `n_min` (BR-2) lo captura. · Comportamiento: declarar explícitamente "estructura quiebra para n pequeño — se usa evidencia, no percentil"; usar la vía managed/evidencia (n=1-5), no holdout/percentil. · Regla(s): BR-2.
**SI LA DETECCIÓN FALLA →** ocultar percentil y forzar la vía cualitativa/evidencia. [V: §6 toggle "dónde la estructura quiebra"; §7]

### C. Matriz de fallo (ordenada por amenaza-North-Star descendente)

| Regla/Edge | Modo de fallo | Detección | Respuesta | amenaza |
|---|---|---|---|---|
| BR-1 / EC-2 | Fuga cross-tenant en el baseline (Sony↔Warner) | chequeo `tenant_id` pre-baseline | bloqueo-rojo + log seguridad + alerta gobernanza | **alta** |
| BR-2 / EC-1 | Percentil emitido con n<n_min (decisión sobre ruido) | `count()` al render | ocultar + aviso; si falla, no renderizar + alertar | **alta** |
| BR-3 / EC-4 / EC-5 | Baseline stale o de versión mezclada → movimiento de percentil falso | timestamp vs TTL; versión vigente | marcar `stale`/`version-mismatch`; degrade; bloquear handoff | **alta** |
| BR-4 / EC-3 | Score "qué hacen los P90+" falso-autoritativo sobre pocos datos | chequeo suficiencia knowledge | regla determinística mínima + señalar laguna | media |
| BR-6 | Ejecutar acción / elevar autonomía desde esta pantalla | guard de salida (solo handoff) | bloquear + escalar a humano | media |
| BR-5 | Valor mostrado sin provenance | validación de sello en render | no mostrar valor sin sello | media |
| EC-7 | Toggle con n diminuto (3 majors) usa percentil sin sentido | n_min (BR-2) | declarar quiebre + vía evidencia | media |
| EC-6 | Tenant sin cohorts | `n_cohorts==0` | estado vacío → Onboarding | baja |

---

## OUTPUT 3 — WORKFLOW

**SÍNTESIS:** el flujo lee el Cerebro, segmenta por **regla versionada**, calcula percentil/gap/baseline **solo cuando n≥n_min y sin cruzar tenants**, y emite una **cola priorizable** que alimenta NBA y un baseline para el North Star — sin ejecutar nunca una acción ni mover autonomía. [V: §2; §4 Pantalla 1]
Formato: `[TIPO]=nodo | -> =flujo | // =nota`.

### Contrato
- **Entrada:** fichas del Cerebro del Cliente (por cuenta, por tenant) + `cohort_rule_version` vigente + `tier_base`/`teto_tier` (de Política #10).
- **Salida:** por cuenta `{percentil_en_cohort, gap_hasta_top, baseline_cohort}` persistido; patrón "qué hacen los P90+" por cohort; **evento priorizado a NBA**; baseline de percentil para North Star.
- **Actores:** IA (segmenta + calcula, batch); Operador 1:10 (explora + prioriza + handoff).
- **Frontera IA/HUMANO:** IA computa percentiles/patrones; humano explora y decide a quién priorizar. La pantalla **no ejecuta** acciones.

### ANTES (triggers + precondiciones)
- **[TRIGGER]** job batch programado de segmentación (cadencia `[C]`) **o** apertura de la pantalla (lee el último snapshot persistido). [I: trigger batch vs on-open → OQ-1]
- **[GROUNDING]** fuente = fichas en el Cerebro (#7) + `cohort_rule_version` (regla §2); si falta la regla versionada o el grounding → **[FAIL-CLOSED]** no segmentar, degrade-to-human + alerta (BR-3, BR-4).
- **[PRECONDICIÓN]** `tenant_id` resuelto y aislado (BR-1); `tier_base` disponible (#10).

### DURANTE (sub-procesos nombrados)

**[Sub-proceso 1A — Segmentación por regla versionada]** [INICIO]
  **[PASO 1A.1]** Asignar cuentas a cohorts.
    [ACTOR:IA] agrupa por `cohort_rule_version` · [DATA-IN] fichas Cerebro · cuenta · acceso IA (read) [V] · [CÓMPUTO] match de `tier_base` + atributos canónicos · [DATA-OUT] `{account_id → cohort_id}` a Cerebro
    [DECISIÓN] ¿existe `cohort_rule_version` vigente y no-ambigua? -> [SÍ] PASO 1A.2 -> [NO] [FAIL-CLOSED] no segmentar + alerta [REGLA] BR-3,EC-5
    [DECISIÓN] ¿algún baseline cruzaría `tenant_id`? -> [SÍ] [FAIL-CLOSED] bloqueo-rojo + log seguridad [REGLA] BR-1,EC-2 -> [NO] continuar
    [AUTONOMÍA] N/A (lectura; no ejecuta) · [REGLA] BR-1,BR-3 // Riesgo: regla elegida ad-hoc = gaming
  [FIN 1A]

**[Sub-proceso 1B — Cálculo de percentil / gap / baseline]** [INICIO]
  **[PASO 1B.1]** Gate de significancia.
    [ACTOR:IA] cuenta `n_cuentas` del cohort · [CÓMPUTO] `count()` · [DECISIÓN] `n_cuentas ≥ n_min [C:20]`? -> [NO] [FAIL-CLOSED] ocultar percentil + aviso [REGLA] BR-2,EC-1 -> [SÍ] PASO 1B.2
  **[PASO 1B.2]** Calcular percentil + gap + baseline.
    [ACTOR:IA] · [CÓMPUTO] `percentil_en_cohort` (ranking dentro del cohort) · `gap_hasta_top` = métrica_top − métrica_cuenta · `baseline_cohort` (snapshot versionado) · [DATA-OUT] persiste `{account_id, cohort_id, percentil, gap, cohort_baseline_version, timestamp}` en Cerebro [I: batch → OQ-1]
    [DECISIÓN] ¿`baseline_cohort` fresco (≤ TTL `[C]`)? -> [NO] marcar `stale` + banner [REGLA] BR-3,EC-4 -> [SÍ] continuar
    [AUTONOMÍA] N/A · [REGLA] BR-2,BR-3,BR-5 // Riesgo: baseline stale → movimiento de percentil engaña al North Star
  [FIN 1B]

**[Sub-proceso 1C — Patrón "qué hacen los P90+"]** [INICIO]
  **[PASO 1C.1]** Derivar patrón de los P90+.
    [ACTOR:IA] · [DATA-IN] características de cuentas con percentil ≥ 90 (estructura promo, ventana, fuso) · [CÓMPUTO] agregación + resumen · [DATA-OUT] patrón por cohort
    [DECISIÓN] ¿`knowledge_de_cohort` suficiente y no sesgado? -> [NO] [FAIL-CLOSED] regla determinística mínima + señalar laguna [REGLA] BR-4,EC-3 -> [SÍ] emitir patrón con provenance [REGLA] BR-5
    [AUTONOMÍA] N/A · // Riesgo: score falso-autoritativo sobre pocos datos
  [FIN 1C]

**[Sub-proceso 1D — Exploración, priorización y handoff]** [INICIO]
  **[PASO 1D.1]** Operador explora y prioriza.
    [ACTOR:HUMANO] navega cohorts → drill-down → ordena por `gap_hasta_top` [I: orden → OQ-4] · [DATA-IN] snapshot persistido
  **[PASO 1D.2]** Handoff a NBA.
    [ACTOR:HUMANO] marca cuenta/segmento prioritario · [DECISIÓN] ¿cohort tenía `n ≥ n_min`? -> [NO] permitir solo handoff cualitativo `[I] sin-percentil` [REGLA] BR-2,EC-1 -> [SÍ] [DATA-OUT] **evento priorizado a NBA** `{account_id, cohort_id, percentil, gap, cohort_rule_version}` [I: payload → OQ-5]
    [AUTONOMÍA] N/A — la pantalla NO ejecuta acción ni eleva autonomía; el `min(pedido_NBA, liberado_evals, teto_tier)` se aplica aguas-abajo en NBA · [REGLA] BR-6 // Riesgo: que la pantalla intente ejecutar
  [FIN 1D]

### Flujo (ASCII)
```
[Cerebro+regla] -> [1A.1 segmentar] -⟨regla vigente?⟩-(no)-> [HUMANO/FAIL-CLOSED]
                                      -(sí)-⟨cross-tenant?⟩-(sí)-> [BLOQUEO-ROJO]
                                                            -(no)-> [1B.1 n≥n_min?]
   [1B.1] -(no)-> [ocultar+aviso]
          -(sí)-> [1B.2 percentil/gap/baseline] -> [1C.1 patrón P90+] -(knowledge insuf.)-> [regla mínima+laguna]
                                                                       -(ok)-> [1D.1 explorar] -> [1D.2 handoff a NBA]
```

### DESPUÉS
**[DATA-OUT]** escribe en **Cerebro** (`percentil_en_cohort`, `gap_hasta_top`, `baseline_cohort` versionados) -> **Alimenta a:** **NBA** (qué acción cierra el gap, vía evento priorizado), **North Star** (baseline para medir movimiento de percentil), **Evals** (define la celda `cohort × intent`), **Managed 1:1 / GTM** (P90+ listos para upsell, acto ofensivo §6). [V: §2; §4; §6 acto 6]

### MAPA DE SISTEMAS Y FLUJO DE DATOS
- **[SISTEMA 1]** Cerebro del Cliente (#7) · [FUNCIÓN] grounding/fuente única por cliente · [DATOS] fichas, episodios, percentil persistido · [ACCESO] IA (read/write batch), operador (read) · [GROUNDING] sí
    // Problema: baseline/ficha stale -> percentil engaña -> Alimenta a: este motor (entrada) y de vuelta (salida persistida)
- **[SISTEMA 2]** Motor de Segmentación / Cohorts (esta pantalla) · [FUNCIÓN] regla versionada + percentil/gap/baseline + patrón P90+ · [DATOS] `cohort_id`, `percentil_en_cohort`, `gap_hasta_top`, `baseline_cohort` · [ACCESO] IA (compute), operador (read/priorizar) · [GROUNDING] sí (lee Cerebro)
    // Problema: regla ad-hoc o cross-tenant -> Alimenta a: [SISTEMA 3] NBA
- **[SISTEMA 3]** NBA / Playbooks (#2) · [FUNCIÓN] consume evento priorizado y propone acción con chip `min()` · [DATOS] evento priorizado · [ACCESO] IA propone, humano aprueba · [GROUNDING] sí
    // Problema: si recibe percentil sobre n<min, propone sobre ruido -> mitigado por BR-2
- **[SISTEMA 4]** Política & Tier (#10) · [FUNCIÓN] fuente de `tier_base`/`teto_tier` + hard-no cross-tenant · [DATOS] tier, política versionada · [ACCESO] humano define · [GROUNDING] sí
    // Problema: tier ausente -> conservador por defecto -> Alimenta a: [SISTEMA 2]
- **[SISTEMA 5]** Evals (#6) · [FUNCIÓN] golden set `cohort × intent` (la celda la define el cohort de aquí) · [DATOS] `liberado_evals` por celda · [ACCESO] humano promueve / auto-rebaja · [GROUNDING] sí
    // Problema: celda sin eval = humano (alto) -> aplica aguas-abajo, no aquí
- **[SISTEMA 6]** North Star · [FUNCIÓN] mide movimiento de percentil como señal de valor · [DATOS] serie temporal de percentil · [ACCESO] liderazgo · [GROUNDING] sí

### PUNTOS DE DOLOR / RIESGOS (rankeados por impacto)
- **[RIESGO 1]** Fuga cross-tenant en el baseline // Impacto: violación GDPR/contrato (Sony↔Warner), hard-no // Mitigación: BR-1/EC-2 bloqueo-rojo + chequeo `tenant_id` pre-baseline [V]
- **[RIESGO 2]** Percentil sobre n<n_min o baseline stale → North Star mide ruido // Impacto: teatro de métrica, mala priorización // Mitigación: BR-2/BR-3, gate n_min + TTL + versionado [I]
- **[RIESGO 3]** "Qué hacen los P90+" falso-autoritativo sobre pocos datos // Impacto: NBA anclada en patrón espurio // Mitigación: BR-4/EC-3 regla determinística mínima + laguna señalada [V]
- **[RIESGO 4]** Toggle con n diminuto (3 majors) usa percentil sin sentido // Impacto: estructura quiebra silenciosamente // Mitigación: EC-7 declarar quiebre + vía evidencia [V: §6/§7]
- **[RIESGO 5]** La pantalla intenta ejecutar/elevar autonomía // Impacto: rompe fail-closed/`min()` // Mitigación: BR-6 solo-lectura + handoff [V]
**SÍNTESIS DE RIESGO:** el dominante es el **RIESGO 2** (ruido entrando al North Star), porque el "y qué" de esta pantalla es alimentar una medida de valor; si el baseline/percentil no es significativo y estable, toda la cadena aguas-abajo decide sobre humo.

### MODELO DE VARIABLES (entidades + campos + relaciones)

**TENANT:**
- `tenant_id` : string · PK [V]
- `nombre` : string [V]
// frontera de aislamiento; cross-tenant prohibido (BR-1)

**COHORT:**
- `cohort_id` : string · PK [V]
- `tenant_id` : string · FK → TENANT.tenant_id [V]
- `tier_base` : enum{managed_brand, managed_midmarket, long_tail} · ref Política #10 [V]
- `cohort_rule_version` : string · versionada [V: §2; SEG-R5]
- `n_cuentas` : int [V]
- `baseline_cohort` : json/blob · snapshot versionado [V]
- `cohort_baseline_version` : string [I]
- `baseline_timestamp` : timestamp · para TTL/stale (EC-4) [I]
- `patron_p90` : json · "qué hacen los P90+" (estructura promo, ventana, fuso) [V/I]
- `knowledge_de_cohort_suficiente` : bool · gate de BR-4 [V: DET-09]

**CUENTA (account):**
- `account_id` : string · PK [V]
- `tenant_id` : string · FK → TENANT.tenant_id [V]
- `cohort_id` : string · FK → COHORT.cohort_id [V]
- `tier_base` : enum · ref Política #10 [V]
// la ficha vive en Cerebro (#7); aquí se referencia

**PERCENTIL_SNAPSHOT (serie temporal para North Star):**
- `snapshot_id` : string · PK [I]
- `account_id` : string · FK → CUENTA.account_id [V]
- `cohort_id` : string · FK → COHORT.cohort_id [V]
- `percentil_en_cohort` : number [0..100] [V]
- `gap_hasta_top` : number · = métrica_top − métrica_cuenta [V]
- `cohort_baseline_version` : string · FK → COHORT.cohort_baseline_version [I]
- `timestamp` : timestamp [I]
- `provenance` : enum{V,I,C} · sello visible (BR-5) [V: §8.8]

**EVENTO_PRIORIZADO_NBA (handoff):**
- `evento_id` : string · PK [I]
- `account_id` : string · FK → CUENTA.account_id [V]
- `cohort_id` : string · FK → COHORT.cohort_id [V]
- `percentil_en_cohort` : number · null si sin-percentil [I]
- `gap_hasta_top` : number [I]
- `cohort_rule_version` : string · FK → COHORT.cohort_rule_version [I]
- `modo` : enum{percentil, cualitativo_sin_percentil} [I → OQ-3/OQ-5]
- `operador_id` : string · FK → quien priorizó (auditoría) [I]

Relaciones:
- TENANT 1—N COHORT
- TENANT 1—N CUENTA
- COHORT 1—N CUENTA
- CUENTA 1—N PERCENTIL_SNAPSHOT
- CUENTA 1—N EVENTO_PRIORIZADO_NBA
- COHORT 1—N PERCENTIL_SNAPSHOT

### Gobernanza / anchor-check
- **[AUTONOMÍA]** esta pantalla es **read-only**: no ejecuta acción, no toca dinero, no eleva autonomía. Cuando la intención llega a NBA aguas-abajo, rige `min(pedido_NBA, liberado_evals, teto_tier)` y nunca el máximo. [V: §2]
- **Hard-nos presentes:** cross-tenant (BR-1, EC-2) = bloqueo-rojo absoluto; financial-never-autonomous (BR-6) = la pantalla no toca dinero; texto-en-screenshot=dato N/A aquí (no hay intake multimodal en esta pantalla). [V: §8; §10]
- **n_min:** BR-2 (`[C: 20]`) gate de significancia, fail-closed. [I: §11.4]
- **Versionado:** `cohort_rule_version` + `cohort_baseline_version` (BR-3). [V]
- **Variables escenario [C]:** `n_min [C: 20]`, `TTL_baseline [C]`, `cadencia_batch [C]`, umbral P90 (fijo por definición = percentil 90). // el valor es placeholder; lo real es el mecanismo.

---

## OPEN QUESTIONS `[I]` (para el operador — PT-BR)

> Cada uma é o ponto onde o grill PARARIA para perguntar ao operador. A recomendação `[I]` adotada no spec está entre parênteses; o spec deve ser reconfirmado quando estas forem respondidas.

- **OQ-1 (DATA-IN/PROCESSING · não-bloqueante):** O percentil é calculado em **tempo real** ou por **job batch versionado** que persiste no Cerebro? _(Recomendo: batch versionado → Cerebro, porque a regra de cohort é versionada (§2) e o percentil precisa de baseline estável.)_
- **OQ-2 (PROCESSING · não-bloqueante):** Quando a **regra de cohort muda de versão**, o que acontece com os percentis já persistidos — recalcula tudo contra o novo baseline, ou mantém versões coexistindo? _(Recomendo: recalcular contra a versão vigente e nunca misturar baselines de versões diferentes na mesma vista.)_
- **OQ-3 (BUSINESS-RULE/EDGE · BLOQUEANTE se mudar o threshold do router):** Qual o **n mínimo** de cohort para o percentil ser significativo, e abaixo dele o que a tela mostra (e se o check de n falhar)? _(Recomendo: `n_min = 20 [C]`; abaixo → ocultar + aviso (fail-closed); se o check falhar → não renderizar card + alertar. §11.4 está aberto.)_ — **falsify:** você mediu o 20 ou está supondo?
- **OQ-4 (DATA-OUT/UI · não-bloqueante):** Qual é o **critério de ordenação** da fila no drill-down — por `gap_hasta_top`, por $-em-jogo, por tier, ou combinação? _(Recomendo: por `gap_hasta_top` como default, com $-em-jogo como prior; o builder decide a forma exata.)_
- **OQ-5 (DATA-OUT · não-bloqueante):** Qual é o **payload exato e o SLA** do evento priorizado que NBA consome (quais campos são obrigatórios)? _(Recomendo: `{account_id, cohort_id, percentil_en_cohort, gap_hasta_top, cohort_rule_version, modo, operador_id}`.)_ — liga à §11.7 (quem consome o spec e com qual SLA).
- **OQ-6 (METRICS · não-bloqueante):** Com qual **granularidade temporal** o percentil deve ser persistido para o North Star medir movimento (por batch, diário, por feature)? _(Recomendo: por batch + timestamp, permitindo série temporal.)_ — liga à §11.2 (janela de atribuição).
- **OQ-7 (UI · não-bloqueante):** Para um **tenant recém-semeado sem cohorts**, qual o estado vazio desejado? _(Recomendo: estado vazio com link para Onboarding #9, não tabela em branco.)_
- **OQ-8 (DATA-IN/EDGE · não-bloqueante):** Qual o **TTL do baseline** (a partir de quando o snapshot é "stale") e o comportamento ao expirar — ocultar, ou mostrar marcado `stale`? _(Recomendo: TTL `[C]`; ao expirar, mostrar percentis marcados `stale` + banner com último snapshot válido, sem ocultar, mas bloqueando handoff se o job não rodou.)_
- **OQ-9 (METRICS/atribuição · não-bloqueante):** O "movimento de percentil" conta como valor do North Star por si só, ou só quando **confirmado e atribuível** (holdout no long-tail / evidência no managed)? _(Recomendo: só confirmado e atribuível, coerente com §3 — atribuição é pré-condição.)_ — liga à §11.1/§11.3.
- **OQ-10 (PROCESSING/toggle · não-bloqueante):** No **toggle Musixmatch**, com cohort minúsculo (ex. 3 majors), confirma-se que o percentil é declarado como "estrutura quebra" e se usa a via de evidência (managed n=1-5) em vez de percentil/holdout? _(Recomendo: sim — declarar o quebra-cabeça explicitamente, §6/§7.)_

---

### Convergence note
- **Cobertura: 11/11.** Sem `[I]` bloqueante remanescente além de **OQ-3** (n_min), que afeta o threshold do router BR-2 — adotado `[C: 20]` com fail-closed, seguro por construção; reconfirmar com o operador.
- **Épicas MECE:** EPIC-1 (segmentar+calcular), EPIC-2 (patrão P90+), EPIC-3 (explorar+priorizar+handoff) cobrem a tela sem sobreposição; cada uma desenvolvível.
- **Invariantes honrados:** `min(pedido_NBA, liberado_evals, teto_tier)` (aplicado aguas-abajo; aqui read-only), cross-tenant hard-no (BR-1), financial-never-autonomous (BR-6), provenance visível (BR-5), versionado (BR-3), n_min fail-closed (BR-2).
