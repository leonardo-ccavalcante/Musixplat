# Pantalla 11 — Salud del 1:10 · Feature Breakdown

> **DRAFT generado por el Feature Breakdown Engine** a partir de `specs/00_vision_completa.md` (v1.0 · 2026-06-15 · Aprobado).
> Modo AUTÓNOMO (operador no disponible): donde la entrevista interactiva (grill) habría preguntado al operador, se registra la **mejor suposición fundamentada `[I]`** con la recomendación, y la **pregunta exacta (PT-BR)** queda en *Open Questions* al final.
> **Provenance:** `[V]` vivido/derivable del doc · `[I]` inferido / a decidir · `[C]` número de escenario (placeholder, nunca dato real).
> **Pendiente:** validación del operador a las open questions antes de pasar a build.

---

## STAGE 0 — GROUND (resumen)

**PROBLEMA (Working-Backwards).** [I]
Nadie puede afirmar que el modelo 1:10 es **económicamente sostenible** ni que la **firma humana** del fail-closed es gobierno real y no un sello automático. Sin esta pantalla, el North Star queda como teatro: se reporta "valor/esfuerzo" sin vigilar el costo por decisión que está en el denominador, ni la integridad del freno humano.

**OUTCOME / North-Star tie.** [V]
Mueve dos componentes del North Star (§3): (a) el **denominador de eficiencia** — `costo/decisión × volumen`, que convierte el cost-center en motor de receita (§8.4); (b) la **honestidad de la atribución y del freno** — si la firma humana se vuelve rubber-stamp (§10.6), el valor "confirmado" deja de ser confirmado y el North Star se infla.

**PLACEMENT.** [V]
Esta pantalla = **1 de 11** (§4). Es la pantalla **meta/observabilidad**: no ejecuta el motor, lo vigila. Co-dueña con Home (#3) de la **Aritmética del 1:10** y del **punto de quiebre manipulable en vivo** (§5). Hermanas conocidas aguas-arriba: Inbox (#5), Evals (#6), NBA (#2), Política & Tier (#10), Cerebro (#7). Aguas-abajo: North Star, alertas de gobernanza.

**COBERTURA DE LAS 11 DIMENSIONES (autónoma):** 11/11 cubiertas (doc + `[I]` recomendados). `[I]` no-bloqueantes listados en Open Questions; ninguno cambia un trigger, un umbral `min()`, un hard-no, ni una ruta de DATA-IN de forma que deje una épica no-desarrollable.

| Dim | Resolución |
|---|---|
| 1 SCOPE & ACTORS | Dashboard de observabilidad read-mostly + 1 control manipulable (break-point). IA reporta; humano vigila la firma. [V/I] |
| 2 TRIGGERS | Refresh batch programado + apertura manual + cruce de umbral (alerta) + manipulación en vivo del break-point. [I] |
| 3 DATA-IN | Costo/decisión, volumen de decisiones, X/Y/Z/N `[C]`, score de calibración bipolar, audit-trail de firmas. [V/I] |
| 4 PROCESSING | Agregación de costo, curva de margen (fine-tuning), cálculo del break-point, score de calibración, detector anti-rubber-stamp. [I] |
| 5 ROUTERS | break-point→degrade 1:10→1:6; calibración fuera de banda→alerta; firma sospechosa→alerta; `min()` sigue gobernando todo chip de autonomía. [V/I] |
| 6 DATA-OUT | Feed de eficiencia al North Star; alertas; snapshot de salud a log de gobernanza/Cerebro; **nunca acción financiera autónoma**. [V/I] |
| 7 UI / STATES | Tableros + alvo bipolar + slider de break-point en vivo; chips `[C]` en todo número de escenario; estados vacío/carga/error. [V/I] |
| 8 RULES / INVARIANTS | cross-tenant hard-no; financial-never-autonomous; `[C]` obligatorio; Y nunca sumado; anti-rubber-stamp; `min()`. [V] |
| 9 EDGE | sin decisiones aún; feed de costo caído; n<min para calibración; firmas demasiado rápidas; tenant con 3 majors (percentil quiebra). [V/I] |
| 10 METRICS | Eficiencia North Star; €3→€1; margen vía fine-tuning; independencia juez↔humano (>κ); tasa de rubber-stamp. [V/I] |
| 11 NON-FUNC & GOV | costo/decisión ES el sujeto; observabilidad/audit-trail; acceso por rol + `teto_tier`; i18n toggle Musixmatch; latencia del break-point en vivo. [V/I] |

---

## OUTPUT 1 — ÉPICAS, USER STORIES & RECORRIDO

**SÍNTESIS:** La Pantalla 11 existe para que el motor **se mire a sí mismo**: vigila la economía (costo/decisión × volumen) y la integridad del freno (firma humana ≠ sello). Sin ella se rompe el eslabón que cierra el lazo del North Star (§2 eslabón 6): el sistema podría "ganar" volumen mientras quema margen o degrada la gobernanza sin que nadie lo vea. [V]

**PROBLEMA:** nadie puede afirmar que el 1:10 es sostenible ni que la firma humana es gobierno real. · **OUTCOME:** mover/proteger el denominador de eficiencia y la honestidad del North Star (§3, §8.4, §10.6). [I]

**PLACEMENT:** esta pantalla = **1 de 11** (§4) · pantalla meta/observabilidad · co-dueña de la Aritmética del 1:10 con Home (#3) · hermanas: Inbox(#5), Evals(#6), NBA(#2), Política(#10), Cerebro(#7) — fuera de alcance construirlas aquí, solo se consumen. [V]

### Épicas (MECE; descomponen ESTA pantalla sin solape; cada una desarrollable)

---

**EPIC-1 — Unit Economics de la IA (costo/decisión × volumen)**
`alcance:` panel de economía: costo por decisión, volumen de decisiones, curva de margen vía fine-tuning (moat económico €3→€1). | `cubre dims:` 3,4,6,10 | `spec:` WHAT = todo número económico longitudinal va rotulado `[C]`; costo se reporta, **nunca** dispara acción financiera (hard-no §10.3). HOW = ingiere costo+volumen por período → agrega costo/decisión → traza curva de margen → publica al North Star.

  Features:
  - **F-1.1** Tarjeta costo/decisión (actual vs objetivo €3→€1) [V]
  - **F-1.2** Volumen de decisiones por período (segmentado Y₁ long-tail / Y₂ managed, **nunca sumados**) [V]
  - **F-1.3** Curva de margen vía fine-tuning (longitudinal, narrado `[C]`) [V]

  - **US-1.1.1** | MoSCoW: Must | Hito: H1 — Como **gestor de Customer Ops**, quiero ver el **costo por decisión actual contra el objetivo**, para saber si el moat económico avanza. [V]
    - Given que existe ≥1 período con decisiones registradas, When abro el panel de economía, Then veo costo/decisión actual, objetivo `[C]` y delta, con chip `[C]` visible. [I]
    - (edge) Given un período **sin decisiones registradas**, When abro el panel, Then veo estado vacío "sin datos de costo aún" y **no** se calcula un costo/decisión inventado (fail-closed). [I]
    - (edge) Given que el **feed de costo está caído/stale**, When abro el panel, Then la tarjeta se marca `stale` con timestamp de última actualización y **no** se publica al North Star. [I]
  - **US-1.1.2** | MoSCoW: Must | Hito: H1 — Como **gestor**, quiero el volumen de decisiones **separado en Y₁ y Y₂**, para no confundir long-tail con managed. [V]
    - Given datos de ambos segmentos, When veo el volumen, Then Y₁ y Y₂ se muestran en filas separadas y **nunca** en una suma única (§5). [V]
  - **US-1.1.3** | MoSCoW: Should | Hito: H2 — Como **gestor**, quiero la curva de margen vía fine-tuning, para mostrar el moat económico en el tiempo. [V]
    - Given una serie longitudinal, When veo la curva, Then cada punto va rotulado `[C]` y el copy aclara "el valor está en el mecanismo, no en la cifra" (§5, §8.8). [V]

---

**EPIC-2 — Punto de quiebre del 1:10 (manipulable en vivo)**
`alcance:` simulador del quiebre 1:10 → 1:6 en función de X/Y/Z/N; control manipulable en vivo. | `cubre dims:` 4,5,7,11 | `spec:` WHAT = el quiebre se calcula desde un **mecanismo** versionado, no es un número fijo; toda variable X/Y/Z/N es `[C]`. HOW = el operador mueve volumen/N% en vivo → recalcula a qué punto el 1:10 degrada → muestra el ratio resultante.

  Features:
  - **F-2.1** Slider/control de X (tickets/día), N% (escalación), Z (SLA) [V]
  - **F-2.2** Indicador de ratio efectivo (1:10 … 1:6) con umbral de degradación [I]

  - **US-2.1.1** | MoSCoW: Must | Hito: H2 — Como **operador**, quiero mover el volumen y el % de escalación en vivo, para ver a qué punto el 1:10 se degrada a 1:6. [V]
    - Given el panel de break-point cargado, When subo N% (escalación) por encima del umbral `[C]`, Then el indicador de ratio se mueve hacia 1:6 y muestra el mecanismo del cálculo, no solo el número. [I]
    - (edge) Given que las variables están sin instrumentar, When abro el panel, Then todas las cifras se muestran `[C]` con aviso "placeholder; el valor está en el mecanismo" y el control sigue operable como simulación. [V]
  - **US-2.1.2** | MoSCoW: Should | Hito: H2 — Como **operador**, quiero ver el umbral exacto de N% donde se cruza la degradación, para anticipar el quiebre. [I]
    - Given un mecanismo de break-point versionado, When alcanzo el umbral, Then se resalta el cruce y se rotula la versión de la regla aplicada. [I]

> `spec:` esta épica es **product-judgment** (no determinista): el mecanismo exacto del break-point (cómo X/Y/Z/N se combinan en el ratio) **no está derivado del doc** → `[I] needs-prototype`. Se entrega outcome + constraints (mecanismo versionado, `[C]`, Y nunca sumado); el builder define la fórmula tras checkpoint lo-fi con el operador. **No se fabrica GWT del cálculo interno.**

---

**EPIC-3 — Calibración bipolar anti-rubber-stamp**
`alcance:` alvo de calibración que penaliza **tanto el exceso de confianza como el exceso de bloqueo**, y detector de firma-sello (humano que aprueba sin revisar). | `cubre dims:` 4,5,7,8,10 | `spec:` WHAT = invariante de gobernanza §10.6 + independencia juez↔humano >κ (§6, §8.2). HOW = mide en dos polos (over-confidence / over-block), señala fuera-de-banda, detecta patrones de firma sospechosos → alerta humano, nunca auto-corrige autonomía financiera.

  Features:
  - **F-3.1** Alvo bipolar (eje exceso-de-confianza ↔ exceso-de-bloqueo) [V]
  - **F-3.2** Detector anti-rubber-stamp sobre el audit-trail de firmas [V]
  - **F-3.3** Señal de independencia juez↔humano (>κ) [I]

  - **US-3.1.1** | MoSCoW: Must | Hito: H1 — Como **operador/gobernador**, quiero ver la calibración en dos polos, para no premiar ni el exceso de confianza ni el exceso de bloqueo. [V]
    - Given métricas de decisiones revisadas, When abro el alvo, Then veo posición en ambos ejes y la banda saludable; fuera de banda → marca de atención. [V]
    - (edge) Given **n<n_min** de decisiones para calibrar, When abro el alvo, Then se oculta el score y se muestra "muestra insuficiente para calibrar" (fail-closed), sin inventar posición. [I]
  - **US-3.1.2** | MoSCoW: Must | Hito: H1 — Como **gobernador**, quiero que se detecte cuando la firma humana parece un sello automático, para que el freno siga siendo real. [V]
    - Given el audit-trail de firmas, When un patrón de aprobación es sospechoso (p. ej. tiempo-a-firma por debajo del piso `[C]`, o aprobación masiva sin variación), Then se levanta una **alerta de rubber-stamp** dirigida al gobernador y se registra en el log. [I]
    - (edge) Given que el detector no puede leer el audit-trail, When corre el chequeo, Then **fail-closed**: se asume sospecha y se alerta al humano (no se asume "todo bien"). [I]
  - **US-3.1.3** | MoSCoW: Should | Hito: H2 — Como **gobernador**, quiero ver que el juez de Evals es independiente del humano (>κ), para que un juez co-sesgado no certifique el error. [I]
    - Given señales de Evals (#6), When abro el panel de calibración, Then veo el indicador de independencia juez↔humano y un aviso si cae por debajo del umbral. [I]

---

**EPIC-4 — Salud agregada por tenant + gobernanza/provenance**
`alcance:` vista de salud del modelo 1:10 **por tenant**, con hard-nos visibles; provenance `[V]/[I]/[C]` en toda cifra; honestidad del toggle (dónde la estructura quiebra). | `cubre dims:` 1,6,8,9,11 | `spec:` WHAT = **cross-tenant hard-no** (Sony≠Warner, §10.4); todo número `[C]` rotulado (§8.8); declarar dónde el modelo quiebra (§6, p. ej. percentil con 3 majors). HOW = filtra por un tenant por sesión, agrega salud sin cruzar tenants, escribe snapshot a log de gobernanza.

  Features:
  - **F-4.1** Selector de tenant (uno por sesión; nunca agregación cross-tenant) [V]
  - **F-4.2** Capa de provenance en la UI (chips `[V]/[I]/[C]`) [V]
  - **F-4.3** Toggle Musixmatch con declaración "dónde quiebra" [V]
  - **F-4.4** Snapshot de salud → log de gobernanza / North Star [I]

  - **US-4.1.1** | MoSCoW: Must | Hito: H1 — Como **operador**, quiero ver la salud de **un** tenant a la vez, para no cruzar nunca datos entre tenants. [V]
    - Given un tenant seleccionado, When veo la salud, Then **ningún** dato de otro tenant aparece y cualquier intento de agregación cross-tenant se bloquea (hard-no §10.4). [V]
    - (edge) Given una consulta que pediría datos de otro tenant, When se ejecuta, Then **bloqueo-rojo + log + alerta** (no se devuelve nada cruzado). [V]
  - **US-4.1.2** | MoSCoW: Must | Hito: H1 — Como **evaluador/cliente**, quiero ver el provenance de cada número, para no confundir `[C]` con dato real. [V]
    - Given cualquier cifra en pantalla, When la miro, Then lleva chip `[V]/[I]/[C]`; si es `[C]`, el copy aclara "placeholder; el valor está en el mecanismo" (§8.8). [V]
  - **US-4.1.3** | MoSCoW: Should | Hito: H2 — Como **operador**, quiero activar el toggle Musixmatch, para ver la invariancia y **dónde** la estructura quiebra. [V]
    - Given el toggle activado, When cambio a vocabulario Musixmatch, Then cambian vocabulario y modelo de dinero, **nunca** los hard-nos ni el `min()`, y se declara que el percentil dentro de cohort pierde sentido con 3 majors (§6). [V]

### Recorrido (primera persona, clic por clic, estado-por-estado)

Yo, como **gestor de Customer Ops**, entro en **Salud del 1:10**. Primero veo un **estado de carga** (skeleton de tres tableros). Luego veo, arriba, el **selector de tenant** ya fijado en el tenant de mi sesión (p. ej. "Uber Eats"); confirmo que dice un solo tenant.

Miro el **panel de Unit Economics**: una tarjeta grande con **costo/decisión actual vs objetivo €3→€1**, con chip `[C]`. Debajo, el **volumen de decisiones** en dos filas separadas (**Y₁ long-tail** y **Y₂ managed**) — verifico que **no** están sumadas. A la derecha, la **curva de margen vía fine-tuning**, cada punto rotulado `[C]`.

Bajo al **panel de Punto de Quiebre**. Veo el **ratio efectivo 1:10**. Tomo el **slider de N% (escalación)** y lo subo en vivo; espero que el indicador se mueva hacia **1:6** y me muestre el **mecanismo** del cálculo (no solo el número). Si las variables no están instrumentadas, veo todo en `[C]` con el aviso "placeholder; el valor está en el mecanismo".

Voy al **alvo de calibración bipolar**. Veo un punto en un plano con dos ejes — **exceso de confianza** ↔ **exceso de bloqueo** — y una **banda saludable**. Si el punto está fuera de banda, veo una marca de atención. Al lado, una lista de **alertas anti-rubber-stamp**: si alguna firma fue demasiado rápida o masiva, aparece aquí; hago clic y espero que se abra el **detalle del audit-trail** (quién, cuándo, tiempo-a-firma). Si no hay muestra suficiente, veo "muestra insuficiente para calibrar" en vez de un score inventado.

Por último, paso el cursor sobre cualquier número y veo su **chip de provenance**. Activo el **toggle Musixmatch** una vez: el vocabulario cambia, pero confirmo que los **hard-nos y el `min()` no cambian**, y leo la nota "dónde quiebra: percentil con 3 majors". Si en cualquier momento un panel falla en cargar, veo un **estado de error** explícito con el timestamp del último dato bueno, y ese panel **no** alimenta al North Star.

---

## OUTPUT 2 — BUSINESS RULES + EDGE CASES + FAILURE HANDLING

**SÍNTESIS:** El modo de fallo que más amenaza el North Star aquí es la **firma humana convertida en rubber-stamp** (§10.6): si el freno se vuelve sello, el valor "confirmado" deja de serlo y el North Star se vuelve teatro (§10.7). Segundo: **costo/decisión publicado como dato real** cuando es `[C]`, o **fuga cross-tenant** en la agregación de salud. [V]

### A. Business Rules (invariantes)

**BR-1** | [V] | hard-no: **sí** | versionada: no
Regla: La salud se reporta **por un solo tenant por sesión**; **nunca** se agregan ni cruzan datos entre tenants (Sony ≠ Warner). · Por qué: GDPR/contrato; fuga cross-tenant (§10.4). · Disparador/Alcance: toda consulta y todo render de Pantalla 11.
SI SE VIOLA / FALLA → **bloqueo-rojo + log + alerta** al gobernador; no se devuelve dato cruzado. (se entera: gobernador/owner del tenant)

**BR-2** | [V] | hard-no: **sí** | versionada: no
Regla: Esta pantalla **reporta** costo/economía; **nunca** ejecuta ni dispara una **acción financiera autónoma**. · Por qué: acción financiera nunca autónoma (§10.3). · Disparador/Alcance: cualquier widget de economía o margen.
SI SE VIOLA / FALLA → **fail-closed + degrade-to-human**; cualquier acción con efecto monetario se bloquea y se enruta a humano. (se entera: operador + gobernador)

**BR-3** | [V] | hard-no: no | versionada: no
Regla: Todo número de **escenario de carga** (costo/decisión, X/Y/Z/N, margen, curva €3→€1) va **rotulado `[C]`** y nunca se presenta como dato real. · Por qué: provenance honesto en UI (§8.8, §8.9). · Disparador/Alcance: cada cifra longitudinal/de escenario.
SI SE VIOLA / FALLA → marca `[C]` forzada por defecto (fail-closed de provenance); si falta el rótulo, el número se oculta antes que mostrarse sin tag. (se entera: evaluador/cliente vía UI)

**BR-4** | [V] | hard-no: no | versionada: no
Regla: **Y nunca se suma:** Y₁ (long-tail) y Y₂ (managed) se reportan por separado, siempre. · Por qué: son dos lógicas distintas; sumarlas miente (§5). · Disparador/Alcance: todo display de volumen/relaciones.
SI SE VIOLA / FALLA → bloqueo del render del total combinado + aviso. (se entera: operador)

**BR-5** | [I] | hard-no: no | versionada: **sí**
Regla: La **calibración es bipolar**: penaliza **tanto** el exceso de confianza **como** el exceso de bloqueo; un polo solo no certifica salud. · Por qué: anti-rubber-stamp y anti-sobre-bloqueo (§4 P11, §10.6). · Disparador/Alcance: cómputo del alvo de calibración.
SI SE VIOLA / FALLA → degrade-to-human: se muestra "calibración incompleta" y se alerta; no se libera ninguna lectura de salud. (se entera: gobernador)

**BR-6** | [I] | hard-no: no | versionada: **sí**
Regla: Detector **anti-rubber-stamp**: una firma con **tiempo-a-firma < piso `[C]`** o aprobación masiva sin variación se marca como sospechosa. · Por qué: la firma debe ser gobierno real, no sello (§10.6). · Disparador/Alcance: audit-trail de firmas humanas.
SI SE VIOLA / FALLA → alerta de rubber-stamp al gobernador + registro en log; reincidencia → se puede **rebajar autonomía automáticamente** (rebajar = automático, §6). (se entera: gobernador)

**BR-7** | [V] | hard-no: no | versionada: no
Regla: El **chip `min(pedido_NBA, liberado_evals, teto_tier)`** se respeta en toda representación de autonomía; esta pantalla **observa** el `min()`, nunca lo eleva. · Por qué: el freno conservador siempre gana (§2). · Disparador/Alcance: cualquier indicador de nivel de autonomía mostrado.
SI SE VIOLA / FALLA → se muestra el techo más conservador conocido (fail-closed); si una fuente falta, se asume el más bajo. (se entera: operador)

**BR-8** | [I] | hard-no: no | versionada: no
Regla: El **acceso por rol** filtra qué ve cada usuario; el detalle del audit-trail de firmas solo es visible a roles de gobernanza, dentro del `teto_tier` del tenant. · Por qué: gobernanza-ops + PII en logs. · Disparador/Alcance: render del detalle de firmas.
SI SE VIOLA / FALLA → ocultar el panel y alertar; fail-closed de permiso (§2 fail-closed). (se entera: gobernador)

**BR-9** | [I] | hard-no: no | versionada: no
Regla: Un panel con **datos stale o feed caído no alimenta al North Star** ni se presenta como vivo; se marca `stale` con timestamp del último dato bueno. · Por qué: no contaminar el North Star con datos muertos. · Disparador/Alcance: ingestión de costo/volumen/calibración.
SI SE VIOLA / FALLA → no publicar al North Star + marca `stale` + aviso. (se entera: operador)

### B. Edge Cases (de la pasada pre-mortem)

**EC-1** | dim: 9/3 | [I] — Caso: **sin decisiones registradas aún** (tenant nuevo / período frío). Detección: count de decisiones = 0 al render. Comportamiento: estado vacío "sin datos de costo aún"; **no** se calcula costo/decisión inventado (fail-closed). Regla(s): BR-3, BR-9.
SI LA DETECCIÓN FALLA → mostrar `[C]` por defecto en vez de un número que parezca real + alertar.

**EC-2** | dim: 9/3 | [I] — Caso: **feed de costo caído o stale**. Detección: timestamp de ingestión por encima del umbral de frescura. Comportamiento: tarjeta `stale` + no publica al North Star (BR-9). Regla(s): BR-9.
SI LA DETECCIÓN FALLA → el dato viejo se publicaría como vivo → fallback: bloquear publicación al North Star si no hay timestamp válido.

**EC-3** | dim: 9/4 | [I] — Caso: **n<n_min para calibración** (muestra insuficiente). Detección: count de decisiones revisadas < n_min al computar el alvo. Comportamiento: ocultar score; "muestra insuficiente para calibrar" (fail-closed). Regla(s): BR-5.
SI LA DETECCIÓN FALLA → no renderizar el alvo + alertar (no mostrar posición sobre ruido).

**EC-4** | dim: 9/8 | [I] — Caso: **firmas demasiado rápidas / masivas** (señal de rubber-stamp). Detección: tiempo-a-firma < piso `[C]` o lote sin variación. Comportamiento: alerta de rubber-stamp + log; reincidencia → rebajar autonomía (BR-6). Regla(s): BR-6.
SI LA DETECCIÓN FALLA → fail-closed: ante incertidumbre del audit-trail, asumir sospecha y alertar (no asumir "todo bien").

**EC-5** | dim: 9/8 | [I] — Caso: **cross-tenant en agregación de salud** (consulta pide datos de otro tenant). Detección: tenant_id en la consulta ≠ tenant de sesión. Comportamiento: bloqueo-rojo + log + alerta (BR-1). Regla(s): BR-1.
SI LA DETECCIÓN FALLA → fail-closed duro: cortar la respuesta entera, no devolver parcial.

**EC-6** | dim: 9 | [V] — Caso: **tenant con 3 majors (toggle Musixmatch)** — el percentil dentro de cohort pierde sentido. Detección: tamaño de cohort por debajo del mínimo estructural / nº de tenants = 3. Comportamiento: declarar explícitamente "aquí la estructura quiebra" (§6), no fingir percentil. Regla(s): BR-3.
SI LA DETECCIÓN FALLA → mostrar percentil engañoso → fallback: ocultar percentil + nota de quiebre.

**EC-7** | dim: 9/6 | [I] — Caso: **widget de economía intenta una acción con efecto monetario** (p. ej. "aplicar este precio"). Detección: cualquier acción con side-effect financiero originada en P11. Comportamiento: bloqueo + degrade-to-human (BR-2). Regla(s): BR-2.
SI LA DETECCIÓN FALLA → fail-closed: ninguna acción financiera sale de P11 sin firma humana fuera de esta pantalla.

### C. Matriz de fallo (ordenada por amenaza-North-Star descendente)

| Regla/Edge | Modo de fallo | Detección | Respuesta | amenaza |
|---|---|---|---|---|
| BR-6 / EC-4 | Firma se vuelve rubber-stamp; freno = teatro | tiempo-a-firma < piso `[C]`, lotes sin variación | Alerta + log; reincidencia → rebajar autonomía (auto) | **alta** |
| BR-1 / EC-5 | Fuga cross-tenant en salud agregada | tenant_id ≠ sesión | Bloqueo-rojo + log + alerta; cortar respuesta | **alta** |
| BR-2 / EC-7 | Acción financiera autónoma desde P11 | side-effect monetario detectado | Bloqueo + degrade-to-human | **alta** |
| BR-3 / EC-1 | `[C]` presentado como dato real | falta rótulo / count=0 | Forzar `[C]` por defecto u ocultar | media |
| BR-5 / EC-3 | Calibración sobre n insuficiente | count < n_min | Ocultar score + "muestra insuficiente" | media |
| BR-9 / EC-2 | Dato stale contamina North Star | timestamp > umbral frescura | Marca `stale` + no publicar | media |
| BR-4 | Y₁+Y₂ sumados | render de total combinado | Bloquear total + aviso | media |
| BR-7 | Chip muestra autonomía > `min()` real | fuente de techo faltante | Mostrar el más conservador (fail-closed) | media |
| BR-8 | Audit-trail de firmas visible a rol sin permiso | rol fuera de gobernanza | Ocultar panel + alertar | baja |
| EC-6 | Percentil engañoso con 3 majors | cohort < mínimo estructural | Ocultar percentil + nota "dónde quiebra" | baja |

---

## OUTPUT 3 — WORKFLOW

**SÍNTESIS:** El flujo de la Pantalla 11 es un **lazo de observabilidad fail-closed**: ingiere costo + volumen + calibración + firmas de los eslabones aguas-arriba, calcula salud económica y de gobernanza, y **solo publica al North Star lo que es fresco, atribuible y honesto** — todo lo demás degrada a humano o se bloquea. [V]

Formato: `[TIPO]=nodo` | `->` = flujo | `//` = nota.

### Contrato
- **Entrada:** costo/decisión + volumen (Y₁/Y₂) desde Inbox(#5)/motor; señales de calibración + independencia juez desde Evals(#6); audit-trail de firmas desde el log de gobernanza; `teto_tier` desde Política(#10); X/Y/Z/N `[C]` de escenario.
- **Salida:** feed de eficiencia al North Star; alertas (rubber-stamp, cross-tenant, calibración fuera de banda, stale); snapshot de salud al log de gobernanza/Cerebro. **Nunca** acción financiera.
- **Actores:** IA (reporta su propio costo y calibración) · operador (vigila) · gobernador/owner (vigila la firma, recibe alertas).
- **Frontera IA/HUMANO:** la IA calcula y reporta; el **humano gobierna la integridad de la firma** y todo lo que toque dinero (fuera de esta pantalla).

### ANTES (triggers + precondiciones)
- `[TRIGGER]` Refresh batch programado (período) · apertura manual de la pantalla · cruce de umbral (alerta) · manipulación en vivo del break-point.
- `[GROUNDING]` fuentes en Cerebro/Evals/Política/log de gobernanza; **si falta cualquier fuente** → `[FAIL-CLOSED]` degrade-to-human: el panel afectado se marca `stale`/`incompleto` y **no** publica al North Star (BR-9). [V]
- `[REGLA]` BR-1 (tenant único de sesión fijado **antes** de cualquier consulta).

### DURANTE

**[Sub-proceso 11A — Ingesta y unit economics]** `[INICIO]`
  `[PASO 11A.1]` Fijar tenant de sesión
    `[ACTOR:IA]` resolver tenant_id de sesión · `[DATA-IN]` tenant_id · sesión/Política(#10) · acceso por rol [V] · `[REGLA]` BR-1 · `[FAIL-CLOSED]` si ambiguo → bloquear. // Riesgo: cross-tenant
  `[PASO 11A.2]` Ingerir costo + volumen
    `[ACTOR:IA]` · `[DATA-IN]` costo/decisión, volumen Y₁/Y₂ · motor/Inbox(#5) [I] · `[CÓMPUTO]` agregar costo/decisión por período; trazar curva de margen `[C]` · `[DATA-OUT]` panel economía
    `[DECISIÓN]` ¿feed fresco y count>0? -> `[NO]` `[FAIL-CLOSED]` marca `stale`/vacío, no publicar (EC-1, EC-2) -> `[SÍ]` continuar
    `[REGLA]` BR-3 (rotular `[C]`), BR-4 (Y nunca sumado), BR-9 (stale)
  `[FIN 11A]`

**[Sub-proceso 11B — Punto de quiebre (manipulable en vivo)]** `[INICIO]`
  `[PASO 11B.1]` Cargar mecanismo de break-point versionado
    `[ACTOR:IA|HUMANO]` el operador mueve X/N%/Z en vivo · `[DATA-IN]` X/Y/Z/N `[C]` · escenario [C] · `[CÓMPUTO]` recalcular ratio efectivo (1:10…1:6) // `[I] needs-prototype`: fórmula exacta a definir
    `[DECISIÓN]` ¿N% > umbral de degradación `[C]`? -> `[SÍ]` mostrar degradación hacia 1:6 + mecanismo -> `[NO]` mantener ratio
    `[REGLA]` BR-3, BR-4 · `[FAIL-CLOSED]` variables sin instrumentar → operar como simulación rotulada `[C]`
  `[FIN 11B]`

**[Sub-proceso 11C — Calibración bipolar + anti-rubber-stamp]** `[INICIO]`
  `[PASO 11C.1]` Computar alvo bipolar
    `[ACTOR:IA]` · `[DATA-IN]` decisiones revisadas, señales de Evals(#6) [I] · `[CÓMPUTO]` posición en ejes (exceso-confianza ↔ exceso-bloqueo)
    `[DECISIÓN]` ¿n ≥ n_min? -> `[NO]` `[FAIL-CLOSED]` ocultar score "muestra insuficiente" (EC-3) -> `[SÍ]` continuar
    `[REGLA]` BR-5
  `[PASO 11C.2]` Detectar rubber-stamp
    `[ACTOR:IA]` · `[DATA-IN]` audit-trail de firmas · log de gobernanza [I] · acceso rol gobernanza (BR-8) · `[CÓMPUTO]` tiempo-a-firma vs piso `[C]`, variación de lote
    `[DECISIÓN]` ¿firma sospechosa? -> `[SÍ]` `[DATA-OUT]` **alerta rubber-stamp** + log; reincidencia → rebajar autonomía (auto) -> `[NO]` ok
    `[AUTONOMÍA]` min(pedido_NBA, liberado_evals, teto_tier) — observada, nunca elevada (BR-7)
    `[REGLA]` BR-6, EC-4 · `[FAIL-CLOSED]` audit-trail ilegible → asumir sospecha + alertar // Riesgo: freno = teatro
  `[FIN 11C]`

**[Sub-proceso 11D — Publicación, provenance y gobernanza]** `[INICIO]`
  `[PASO 11D.1]` Verificar provenance + cross-tenant
    `[ACTOR:IA]` · `[CÓMPUTO]` chequear chips `[V/I/C]` en cada cifra; verificar tenant_id == sesión
    `[DECISIÓN]` ¿cross-tenant? -> `[SÍ]` `[FAIL-CLOSED]` bloqueo-rojo + log + alerta (EC-5) -> `[NO]` continuar
    `[REGLA]` BR-1, BR-3
  `[PASO 11D.2]` Publicar salud
    `[ACTOR:IA]` · `[DATA-OUT]` feed eficiencia → North Star (solo fresco/atribuible); snapshot salud → log gobernanza/Cerebro [I]
    `[DECISIÓN]` ¿acción con efecto monetario solicitada? -> `[SÍ]` `[FAIL-CLOSED]` bloquear + degrade-to-human (EC-7, BR-2) -> `[NO]` publicar solo lectura
    `[REGLA]` BR-2, BR-9
  `[FIN 11D]`

### Flujo (ASCII)
```
[TRIGGER refresh/manual/umbral]
   -> [11A.1 fijar tenant] -> ⟨cross-tenant?⟩ -(sí)-> [FAIL-CLOSED bloqueo-rojo]
                                              -(no)-> [11A.2 ingerir costo/vol]
   -> ⟨feed fresco & count>0?⟩ -(no)-> [stale/vacío · no North Star]
                               -(sí)-> [11B break-point en vivo]
   -> [11C.1 alvo bipolar] -> ⟨n≥n_min?⟩ -(no)-> [ocultar score]
                                          -(sí)-> [11C.2 anti-rubber-stamp]
   -> ⟨firma sospechosa?⟩ -(sí)-> [alerta + log · reincidencia→rebajar autonomía]
                          -(no)-> [11D verificar provenance]
   -> ⟨acción monetaria?⟩ -(sí)-> [FAIL-CLOSED degrade-to-human]
                          -(no)-> [DATA-OUT North Star + log gobernanza]
```

### DESPUÉS
`[DATA-OUT]` escribe en **log de gobernanza / Cerebro** (snapshot de salud) y en el **feed de eficiencia** -> Alimenta a: **North Star** (eficiencia económica + honestidad de atribución), **Evals(#6)** (rebajar autonomía ante rubber-stamp reincidente), **alertas de gobernanza**. **Nunca** alimenta una acción financiera. [V/I]

### MAPA DE SISTEMAS Y FLUJO DE DATOS
- `[SISTEMA 1]` Inbox/Motor de decisiones (#5) · `[FUNCIÓN]` produce decisiones y su costo · `[DATOS]` costo/decisión, volumen Y₁/Y₂ · `[ACCESO]` IA/operador · `[GROUNDING]` sí
  // Problema: si el costo no se instrumenta, todo `[C]` -> Alimenta a: `[SISTEMA 5]` (P11 economía)
- `[SISTEMA 2]` Evals & Fine-tuning (#6) · `[FUNCIÓN]` calibración + independencia juez · `[DATOS]` señales de calibración, κ, `liberado_evals` · `[ACCESO]` IA/gobernador · `[GROUNDING]` sí
  // Problema: juez co-sesgado -> Alimenta a: P11 calibración
- `[SISTEMA 3]` Política & Tier (#10) · `[FUNCIÓN]` define `teto_tier` y hard-no cross-tenant · `[DATOS]` `teto_tier`, tenant_id · `[ACCESO]` gobernador · `[GROUNDING]` sí
  // Problema: tier mal configurado -> Alimenta a: P11 autonomía/acceso
- `[SISTEMA 4]` Log de gobernanza / audit-trail · `[FUNCIÓN]` registra firmas humanas · `[DATOS]` firma, tiempo-a-firma, actor · `[ACCESO]` solo gobernanza (BR-8) · `[GROUNDING]` sí
  // Problema: audit-trail ilegible -> fail-closed -> Alimenta a: P11 anti-rubber-stamp
- `[SISTEMA 5]` Pantalla 11 (esta) · `[FUNCIÓN]` salud 1:10 + unit economics + calibración · `[DATOS]` salud agregada por tenant · `[ACCESO]` operador/gobernador por rol · `[GROUNDING]` sí
  // Problema: stale/cross-tenant -> Alimenta a: `[SISTEMA 6]`
- `[SISTEMA 6]` North Star · `[FUNCIÓN]` cierra el lazo (valor/esfuerzo − deflection-falla) · `[DATOS]` eficiencia económica + honestidad · `[ACCESO]` lectura ejecutiva · `[GROUNDING]` sí
  // Problema: datos stale contaminan el North Star -> mitigado por BR-9

### PUNTOS DE DOLOR / RIESGOS (rankeados por impacto)
- `[RIESGO 1]` Rubber-stamp humano (firma sin revisar) // Impacto: el freno se vuelve teatro, North Star inflado (§10.6, §10.7) // Mitigación: BR-6 detector + alerta + rebaja automática de autonomía [V]
- `[RIESGO 2]` Fuga cross-tenant en agregación de salud // Impacto: GDPR/contrato (§10.4) // Mitigación: BR-1 bloqueo-rojo + tenant único por sesión [V]
- `[RIESGO 3]` `[C]` confundido con dato real // Impacto: el evaluador cree que €3→€1 ya pasó (§10.9) // Mitigación: BR-3 chips obligatorios + copy "el valor está en el mecanismo" [V]
- `[RIESGO 4]` Datos stale alimentan el North Star // Impacto: eficiencia falsa // Mitigación: BR-9 no publicar stale [I]
- `[RIESGO 5]` Calibración sobre n insuficiente // Impacto: decisión de salud sobre ruido // Mitigación: BR-5/EC-3 ocultar score [I]
- `[RIESGO 6]` Mecanismo del break-point no derivado del doc // Impacto: número inventado en demo // Mitigación: `[I] needs-prototype` + rótulo `[C]` + checkpoint operador [I]

**SÍNTESIS DE RIESGO:** el dominante es el **rubber-stamp** porque ataca la pre-condición del North Star (valor *confirmado*): si la firma no gobierna, todo el "valor confirmado y atribuible" (§3) es ficción, y esta pantalla es el único lugar donde ese fallo se detecta.

### MODELO DE VARIABLES (entidades + campos + relaciones)

**TENANT**:
- `tenant_id` : uuid · PK [V]
- `nombre` : string [V]
- `teto_tier` : enum/int · ref Política(#10) [V]
- `vocabulario` : enum {uber_eats, musixmatch} · (toggle) [V]

**HEALTH_SNAPSHOT**:
- `snapshot_id` : uuid · PK [I]
- `tenant_id` : uuid · FK → TENANT.tenant_id [V]
- `periodo` : date_range [I]
- `costo_por_decision` : money · `[C]` [V]
- `costo_objetivo` : money · `[C]` (€3→€1) [V]
- `volumen_y1` : int · (long-tail; nunca sumado a y2) [V]
- `volumen_y2` : int · (managed; nunca sumado a y1) [V]
- `margen_finetuning` : decimal · `[C]` [V]
- `freshness_ts` : timestamp · (gate BR-9) [I]
- `is_stale` : bool [I]
- `provenance` : enum {V,I,C} [V]

**BREAKPOINT_SCENARIO**:
- `scenario_id` : uuid · PK [I]
- `tenant_id` : uuid · FK → TENANT.tenant_id [V]
- `x_tickets_dia` : int · `[C]` [V]
- `y1` : int · `[C]` · `y2` : int · `[C]` [V]
- `z_sla_horas` : int · `[C]` [V]
- `n_pct_escalacion` : decimal · `[C]` [V]
- `ratio_efectivo` : string {1:10…1:6} · `[I] needs-prototype` [I]
- `regla_version` : string · (mecanismo versionado) [I]

**CALIBRATION**:
- `calibration_id` : uuid · PK [I]
- `tenant_id` : uuid · FK → TENANT.tenant_id [V]
- `eje_exceso_confianza` : decimal [I]
- `eje_exceso_bloqueo` : decimal [I]
- `n_muestra` : int · (gate n_min, EC-3) [I]
- `independencia_juez_humano` : decimal · (>κ, ref Evals #6) [I]

**SIGNOFF_AUDIT**:
- `signoff_id` : uuid · PK [I]
- `tenant_id` : uuid · FK → TENANT.tenant_id [V]
- `actor_humano` : ref usuario [V]
- `decision_ref` : uuid · FK → decisión del motor (#5) [I]
- `tiempo_a_firma_seg` : int · (vs piso `[C]`, BR-6) [I]
- `sospecha_rubber_stamp` : bool [I]
- `firma_ts` : timestamp [V]

**ALERT**:
- `alert_id` : uuid · PK [I]
- `tenant_id` : uuid · FK → TENANT.tenant_id [V]
- `tipo` : enum {rubber_stamp, cross_tenant, calibracion_fuera_banda, stale} [I]
- `severidad` : enum {rojo, amarillo} [I]
- `destinatario_rol` : enum {operador, gobernador} [I]

Relaciones:
- TENANT 1—N HEALTH_SNAPSHOT
- TENANT 1—N BREAKPOINT_SCENARIO
- TENANT 1—N CALIBRATION
- TENANT 1—N SIGNOFF_AUDIT
- TENANT 1—N ALERT
- SIGNOFF_AUDIT N—1 (decisión del motor #5) · *cross-screen FK*
- CALIBRATION N—1 (señal de Evals #6) · *cross-screen ref*

### Gobernanza / anchor-check
`[AUTONOMÍA]` `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)` — esta pantalla **observa** el `min()`, nunca lo eleva (BR-7). · **Hard-nos:** cross-tenant prohibido (BR-1); acción financiera nunca autónoma (BR-2). · **Anti-rubber-stamp:** BR-6 (firma debe ser gobierno real). · **Provenance:** todo `[C]` rotulado (BR-3). · **Variables escenario:** X (tickets/día), Y (Y₁/Y₂ split, nunca sumado), Z (SLA h), N% (escalación) — todas `[C]`.

---

## OPEN QUESTIONS (PT-BR — para o operador resolver)

1. `[I]` **Custo por decisão e meta €3→€1**: qual é o custo/decisão real instrumentado hoje, e a meta é €1 fixa ou uma curva no tempo? *(blocker para EPIC-1; hoje tudo `[C]`.)*
2. `[I]` **Mecanismo do ponto de quebra 1:10→1:6**: como exatamente X/Y/Z/N se combinam para produzir o ratio efetivo? Qual o umbral de N% que dispara a degradação? *(needs-prototype; EPIC-2.)*
3. `[I]` **n_min para calibração**: qual o número mínimo de decisões revisadas para o alvo bipolar ser significativo? *(EC-3.)*
4. `[I]` **Piso de tempo-a-firma (anti-rubber-stamp)**: abaixo de quantos segundos uma firma é suspeita? E quantas reincidências disparam rebaixamento automático de autonomia? *(BR-6, EC-4.)*
5. `[I]` **Definição operacional da calibração bipolar**: como se mede "excesso de confiança" vs "excesso de bloqueio" em cada eixo (fórmula/fonte)? *(BR-5.)*
6. `[I]` **Independência juiz↔humano (>κ)**: qual o limiar de κ aceitável e qual fonte de Evals(#6) o alimenta? *(US-3.1.3.)*
7. `[I]` **Limiar de frescor (stale)**: a partir de quantas horas/minutos um feed de custo/calibração é considerado stale e deixa de alimentar o North Star? *(BR-9, EC-2.)*
8. `[I]` **Acesso por papel**: quem é "gobernador" vs "operador" e quem pode ver o detalhe do audit-trail de firmas dentro do `teto_tier`? *(BR-8.)*
9. `[I]` **Snapshot de saúde → onde grava**: o snapshot vai para o Cerebro(#7), para um log de governança separado, ou ambos? Qual SLA/frequência do refresh batch? *(DATA-OUT; §11.7.)*
10. `[I]` **Co-dono da Aritmética 1:10**: o ponto de quebra manipulável em vivo mora aqui (P11) ou na Home (#3)? Se em ambos, qual é fonte de verdade? *(§5 deixa em aberto Home #3 ou P11.)*
11. `[I]` **Custo da deflection-que-falha**: quanto a deflection-que-falha subtrai do North Star, e isso é exibido como linha nesta tela? *(§3, §11.8.)*
12. `[I]` **Toggle Musixmatch — onde quebra**: além do percentil com 3 majors, há outras métricas de saúde que perdem sentido no toggle e devem ser declaradas? *(§6, EC-6.)*
