# Pantalla 02 — NBA / Playbooks · Breakdown de Feature

> **DRAFT generado por el Feature Breakdown Engine** a partir de `specs/00_vision_completa.md` (v1.0 · 2026-06-15 · Estado: Aprobado).
> **Modo:** AUTÓNOMO (el operador humano no está disponible; no se corrió el grill en vivo).
> **Pendiente:** este borrador queda sujeto a las respuestas del operador a las *open questions* (sección final, PT-BR). Cada suposición no derivable del doc está tagueada `[I]` y su pregunta exacta está registrada en OPEN-QUESTIONS.
> **Provenance:** `[V]` vivido/derivable del doc · `[I]` inferido / a decidir · `[C]` número de escenario (placeholder, nunca dato real).
> **Grounding pin:** todas las afirmaciones se anclan a `00_vision_completa.md` §2 (motor + `min()`), §3 (North Star), §4 Pantalla 2, §4 Pantallas 1/3/6/8/10 (contratos cross-pantalla), §8/§10 (gobernanza/riesgos), §11 (open questions).

---

## STAGE 0 — GROUND

### PROBLEMA + OUTCOME (Working-Backwards)
- **PROBLEMA** `[V]` (§1, §4-P2): el operador ve *a quién* priorizar (Pantalla 1: percentil + gap) pero no *qué hacer* para cerrar el gap, ni *hasta qué punto la IA puede hacerlo sola*. Sin una capa de acción gobernada, el cockpit vuelve a ser reactivo (síntoma a síntoma) y la autonomía sería un dial sin freno visible.
- **OUTCOME** `[V]` (§3, §4-P2 "Ata a"): mueve el **North Star** midiendo **efecto, no actividad** — usando el contrafactual **"no actuar"** para confirmar valor *atribuible*; y alimenta **Evals** marcando qué celda `cohort × intent` debe liberar la acción.

### Restate del alcance (confirmar)
Pantalla 02 = **capa de decisión-acción** del motor. Recibe un gap priorizado (de Pantalla 1 / Cerebro), propone la **próxima mejor acción** desde un **catálogo cerrado** (ej. *"P40→P70: haga X"*), expone el **chip `min()`** con el techo de autonomía efectivo, deja al humano **aprobar/ajustar/rechazar**, ejecuta (o degrada a humano) según `min()`, registra el contrafactual y emite señales a Evals y North Star. **No** define la regla de cohort (Pantalla 1), **no** define `teto_tier` (Pantalla 10), **no** calibra las celdas de Evals (Pantalla 6), **no** ejecuta acciones financieras de forma autónoma (hard-no §10.3).

### Issue tree — 11 dims MECE (cobertura 11/11; resuelta desde doc + `[I]` recomendados)

1. **SCOPE & ACTORS** `[V]` — Actores: IA (propone del catálogo + ejecuta hasta `nivel_efectivo`), operador humano (aprueba/ajusta/rechaza/firma). Frontera IA/humano (§4-P2): "la IA propone del catálogo cerrado; el humano aprueba o ajusta". Contratos cross-pantalla: **upstream** Pantalla 1 (gap/percentil) + Pantalla 7 Cerebro (grounding) + Pantalla 6 Evals (`liberado_evals`) + Pantalla 10 Política (`teto_tier`); **downstream** Evals (señal por celda), North Star (efecto), Pantalla 8 Managed 1:1 (ruteo P90+ upsell, §6 acto 6).
2. **TRIGGERS / ENTRY** `[I]` — Doc no fija el disparador exacto. Recomendado `[I]`: (a) navegación desde Pantalla 1 sobre un cliente/gap; (b) señal upstream (un gap cruza umbral) que encola una NBA candidata. Ambos producen una **NBA propuesta** para revisión.
3. **DATA-IN** `[V]` parcial / `[I]` shapes — fuentes: gap+percentil+cohort (Pantalla 1/Cerebro), ficha del cliente (Cerebro §4-P7, grounding obligatorio), catálogo de NBA (cerrado §2-eslabón3), `liberado_evals[cohort×intent]` (Pantalla 6), `teto_tier[tenant/cliente]` (Pantalla 10). Schemas exactos = `[I]`.
4. **PROCESSING / LOGIC** `[V]` — selección de NBA del catálogo cerrado anclada al Cerebro + cálculo del contrafactual "no actuar" + cómputo de `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)`. Catálogo y reglas **versionados** (§2: catálogo cerrado; §8.5 data-flywheel).
5. **ROUTERS / DECISIONS** `[V]` — branches por `nivel_efectivo`: ejecuta-auto / propone-para-firma / degrade-to-human. **Fail-closed** ante falta de grounding/evidencia/permiso (§2). Hard-no: **acción financiera → siempre humano** (§10.3). Ruteo ofensivo P90+ → Managed 1:1 (§6 acto 6).
6. **DATA-OUT** `[V]` — escribe: decisión + contrafactual + outcome en Cerebro; señal `cohort×intent` a Evals; efecto atribuible a North Star; evento de ruteo a Managed 1:1; audit-trail con firma humana (§8.8, §11 anti-rubber-stamp via P11).
7. **UI / STATES** `[V]` parcial — render: tarjeta de NBA con texto *"P40→P70: haga X"*, **chip `min()`** visible (§4-P2), provenance `[V/I/C]` visible (§8.8), botones aprobar/ajustar/rechazar. Estados loading/empty/error/bloqueo = `[I]` (detallados en Recorrido).
8. **BUSINESS-RULES / INVARIANTS** `[V]` — `min()` invariante (§2); catálogo **cerrado** (no se inventan acciones); financial-never-autonomous (§10.3); cross-tenant hard-no (§8.3/§10.4); texto pegado = DATO no instrucción (§10.2); versionado del catálogo; el contrafactual "no actuar" es obligatorio para contar valor (§2, §3).
9. **EDGE / ABNORMAL INPUT** `[I]` (pre-mortem) — sin grounding en Cerebro; `liberado_evals=0`; `teto_tier` bloquea; NBA no aplica al cohort; cohort `n<n_min` (§11.4); acción financiera propuesta; intento cross-tenant; injection vía texto; outcome no atribuible.
10. **METRICS / NORTH-STAR** `[V]` — efecto vs actividad via contrafactual (§3, §4-P2); atribución por segmento (holdout long-tail / evidencia+confirmación managed, §3, §8.6); penaliza deflection-que-falla (§3).
11. **NON-FUNCTIONAL & GOVERNANCE-OPS** `[V]`/`[C]` — SLA/latencia `Z` `[C]`; costo/decisión × volumen (Pantalla 11); acceso por rol + `teto_tier`; audit-trail + firma humana anti-rubber-stamp (§11/P11); i18n toggle Musixmatch invariante (§6) — cambia vocabulario/modelo de dinero, **nunca** los hard-nos ni el `min()`.

### DEP-MAP
SCOPE → (TRIGGERS, DATA-IN) → PROCESSING → ROUTERS(`min()`) → DATA-OUT → METRICS. RULES & EDGE cuelgan de PROCESSING/ROUTERS. NON-FUNC cierra. Blocker-rank: ROUTERS/`min()` y el hard-no financiero gatean ≥2 dims → resueltos desde §2/§10 (no bloqueantes). Triggers exactos = único `[I]` con sabor bloqueante-suave → recomendación abajo.

### Coverage: 11/11 (doc + `[I]` recomendados) · ÉPICAS MECE ✓

---

## OUTPUT 1 — ÉPICAS, USER STORIES & RECORRIDO

**SÍNTESIS:** NBA/Playbooks es el **eslabón de acción gobernada** del motor: convierte el *gap* que Cohorts identifica en una *próxima mejor acción del catálogo cerrado*, ejecutable solo hasta `min(pedido_NBA, liberado_evals, teto_tier)`. Sin ella el cockpit no actúa (vuelve reactivo) y la autonomía no tendría freno visible. `[V]` (§2, §4-P2)

**PROBLEMA:** el operador sabe *a quién* mover pero no *qué hacer* ni *cuánto puede hacerlo la IA sola*. · **OUTCOME:** mover el North Star por **efecto** (contrafactual "no actuar"), no por actividad; liberar autonomía solo con evidencia de Evals. `[V]` (§3, §4-P2)

**PLACEMENT:** esta pantalla = **1 de 11** en el motor de Customer-Ops AI-first. · **hermanas conocidas (contratos, no se inventan):** P1 Cohorts (upstream gap), P7 Cerebro (grounding), P6 Evals (`liberado_evals`), P10 Política (`teto_tier`), P8 Managed 1:1 (ruteo upsell), P3 Home (la fila autoritativa), P11 Salud 1:10 (costo/calibración). · **fuera de alcance:** definir cohorts, calibrar Evals, definir Política, ejecutar dinero. `[V]` (§4)

### Épicas (MECE; descomponen ESTA pantalla sin solape; cada una desarrollable)

---

**EPIC-1 · Selección y grounding de la NBA** | alcance: tomar un gap priorizado y elegir la próxima mejor acción del catálogo cerrado, anclada al Cerebro | cubre dims: 2,3,4,8(parcial) | spec: **WHAT** — solo acciones del catálogo cerrado y versionado; toda NBA debe anclarse a una fuente del Cerebro o se bloquea (fail-closed); el texto de cualquier contenido pegado es DATO. **HOW** — (1) recibir {cliente, cohort, percentil, gap}; (2) filtrar catálogo por aplicabilidad al cohort/intent; (3) verificar grounding en Cerebro; (4) ordenar candidatas por efecto esperado de cierre de gap; (5) emitir NBA top-1 + alternativas.

- **F-1.1 Resolución de la NBA candidata**
  - **US-1.1.1** | MoSCoW: Must | Hito: H1 — Como operador, quiero ver la próxima mejor acción para un cliente expresada como *"P40→P70: haga X"*, para saber qué cierra el gap. `[V]` (§4-P2)
    - Given un cliente con gap y cohort resueltos (de P1/Cerebro), When abro su NBA, Then veo la acción top-1 del **catálogo cerrado** con el delta de percentil objetivo y su provenance `[V/I/C]`. `[V]`
    - (edge) Given que ninguna acción del catálogo aplica al cohort/intent, When se resuelve la NBA, Then se muestra "sin acción aplicable" y se degrada a humano (no se inventa acción). `[I]` (EC-4)
  - **US-1.1.2** | MoSCoW: Must | Hito: H1 — Como sistema, quiero anclar toda NBA a una fuente del Cerebro, para no proponer sobre el vacío. `[V]` (§2 fail-closed, §4-P4 patrón grounding)
    - Given una NBA candidata, When falta fuente de grounding en el Cerebro, Then **bloqueo rojo / fail-closed** y degrade-to-human, sin proponer. `[V]` (BR-2, EC-1)
  - **US-1.1.3** | MoSCoW: Should | Hito: H2 — Como operador, quiero ver 1-2 alternativas además de la top-1, para ajustar el juicio sin salir del catálogo. `[I]`
    - Given una NBA top-1 resuelta, When la abro, Then veo alternativas ordenadas, todas del catálogo cerrado. `[I]`

---

**EPIC-2 · Contrafactual "no actuar" y efecto** | alcance: registrar el costo/beneficio esperado de NO actuar y preparar la medición de efecto atribuible | cubre dims: 4,6,10 | spec: **WHAT** — toda NBA lleva su contrafactual "no actuar"; el valor que cuenta al North Star es *efecto* (acción vs no-acción), no actividad; la atribución se mide distinto por segmento. **HOW** (product-judgment, no sobre-especificar) — registrar el baseline esperado sin acción; al cerrar el lazo, comparar resultado real contra ese contrafactual; aplicar método de atribución por segmento (holdout long-tail / evidencia+confirmación managed).

- **F-2.1 Registro del contrafactual**
  - **US-2.1.1** | MoSCoW: Must | Hito: H1 — Como sistema, quiero registrar el contrafactual "no actuar" junto a cada NBA, para medir efecto real y no actividad. `[V]` (§2 eslabón3, §3, §4-P2)
    - Given una NBA propuesta, When se crea, Then se persiste su contrafactual "no actuar" (resultado esperado sin acción) con provenance. `[V]`
- **F-2.2 Atribución por segmento**
  - **US-2.2.1** | MoSCoW: Must | Hito: H2 — Como sistema, quiero atribuir el efecto por segmento (holdout en long-tail; evidencia+confirmación humana en managed n=1-5), para que el valor sea confirmado y atribuible. `[V]` (§3, §8.6) — *flag `[I]` needs-prototype para el umbral de cambio de método (§11.3)*
    - Given una NBA ejecutada, When el segmento es long-tail, Then el efecto se mide por holdout. `[V]`
    - Given una NBA ejecutada, When el segmento es managed (n=1-5), Then el efecto requiere evidencia + confirmación humana. `[V]`
    - (edge) Given que el outcome no es atribuible a la acción, When se cierra el lazo, Then **no** se cuenta valor y se marca "no atribuible". `[I]` (EC-9)

---

**EPIC-3 · Cómputo y visualización del `min()` de autonomía** | alcance: calcular y exponer el techo efectivo de autonomía de cada NBA | cubre dims: 4,5,7,8,11 | spec: **WHAT (determinista)** — `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)`; el chip `min()` siempre visible; nunca se sube autonomía por defecto. **HOW** — leer los tres techos; tomar el mínimo; mostrar el chip con el techo dominante y por qué.

- **F-3.1 Cálculo del techo efectivo**
  - **US-3.1.1** | MoSCoW: Must | Hito: H1 — Como sistema, quiero calcular `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)`, para que el eslabón más conservador siempre gane. `[V]` (§2)
    - Given los tres techos disponibles, When se resuelve la NBA, Then `nivel_efectivo` = el mínimo de los tres. `[V]`
    - (edge) Given que falta cualquiera de los tres techos, When se computa, Then se asume el más conservador (fail-closed → humano). `[V]` (BR-1, EC-2)
- **F-3.2 Chip `min()` visible**
  - **US-3.2.1** | MoSCoW: Must | Hito: H1 — Como operador, quiero ver un chip con el `min()` de autonomía y cuál de los tres techos manda, para entender el techo efectivo antes de aprobar. `[V]` (§4-P2 "Chip visible con el min()")
    - Given una NBA con `nivel_efectivo` calculado, When la veo, Then el chip muestra el nivel efectivo + el techo dominante (NBA / Evals / tier). `[V]`

---

**EPIC-4 · Aprobación, ejecución gobernada y ruteo** | alcance: el ciclo humano (aprobar/ajustar/rechazar/firmar) + ejecución hasta `nivel_efectivo` + ruteo ofensivo | cubre dims: 1,5,6,11 | spec: **WHAT** — el humano gobierna; financial-never-autonomous; ejecución solo hasta `nivel_efectivo`; toda firma queda en audit-trail anti-rubber-stamp; P90+ listos para upsell se rutean a Managed 1:1. **HOW** — branch por `nivel_efectivo` y por tipo de acción; registrar firma; emitir efectos.

- **F-4.1 Ciclo de gobierno humano**
  - **US-4.1.1** | MoSCoW: Must | Hito: H1 — Como operador, quiero aprobar, ajustar o rechazar la NBA, para gobernar la acción de la IA. `[V]` (§4-P2)
    - Given una NBA propuesta, When la apruebo/ajusto/rechazo, Then la decisión + mi firma quedan en el audit-trail con provenance. `[V]` (BR-6)
    - (edge) Given una acción **financiera**, When llega a ejecución, Then **siempre** requiere humano, nunca autónoma. `[V]` (BR-3, hard-no §10.3)
  - **US-4.1.2** | MoSCoW: Must | Hito: H2 — Como sistema, quiero que la firma humana no sea un sello automático, para evitar rubber-stamp. `[V]` (§10.6, P11 calibración bipolar)
    - Given firmas repetidas sin revisión efectiva, When se detecta el patrón, Then se señala a Salud 1:10 (P11) para calibración. `[I]`
- **F-4.2 Ejecución gobernada**
  - **US-4.2.1** | MoSCoW: Must | Hito: H1 — Como sistema, quiero ejecutar la NBA solo hasta `nivel_efectivo`, para no actuar de más. `[V]` (§2)
    - Given `nivel_efectivo` permite auto-ejecución y la acción no es financiera, When se aprueba (o auto-aprueba según política), Then se ejecuta y se registra el resultado. `[I]`
    - Given `nivel_efectivo` < lo pedido, When se resuelve, Then degrade-to-human para la parte no liberada. `[V]` (BR-1)
- **F-4.3 Ruteo ofensivo a Managed 1:1**
  - **US-4.3.1** | MoSCoW: Should | Hito: H2 — Como operador, quiero que los clientes P90+ listos para upsell se ruteen a Managed 1:1, para capturar expansión. `[V]` (§6 acto 6)
    - Given un cliente del cohort en P90+ con señal de upsell, When se resuelve su NBA, Then se emite un evento de ruteo a Managed 1:1 (P8). `[V]`

---

**EPIC-5 · Señal a Evals + provenance + toggle** | alcance: cerrar el lazo de aprendizaje y mantener invariantes de UI/i18n | cubre dims: 6,7,8,10,11 | spec: **WHAT** — cada NBA emite una señal a la celda `cohort×intent` de Evals; provenance visible en UI; toggle Musixmatch invariante (cambia vocabulario/dinero, nunca hard-nos ni `min()`); cross-tenant hard-no. **HOW** — mapear cada NBA a su celda; emitir resultado como evidencia; renderizar provenance; aplicar diccionario de toggle sin tocar reglas.

- **F-5.1 Señal `cohort × intent` a Evals**
  - **US-5.1.1** | MoSCoW: Must | Hito: H2 — Como sistema, quiero mandar el resultado de cada NBA como señal a la celda `cohort×intent` de Evals, para que `liberado_evals` suba solo con evidencia. `[V]` (§2 eslabón5/6, §4-P2 "Ata a")
    - Given una NBA cerrada con resultado, When se cierra el lazo, Then se emite evidencia a la celda `cohort×intent` correspondiente en Evals (P6). `[V]`
- **F-5.2 Provenance e invariancia de toggle**
  - **US-5.2.1** | MoSCoW: Must | Hito: H1 — Como operador, quiero ver el provenance `[V/I/C]` de cada NBA y de los números de su chip, para no confundir placeholder con dato real. `[V]` (§8.8, §10.9)
    - Given un número `[C]` en la NBA o chip, When lo veo, Then está rotulado `[C]` con "placeholder; el valor está en el mecanismo". `[V]` (BR-7)
  - **US-5.2.2** | MoSCoW: Must | Hito: H3 — Como operador, quiero activar el toggle Musixmatch y que cambie solo vocabulario/modelo de dinero, para probar transferencia sin tocar reglas. `[V]` (§6, §7)
    - Given el toggle Musixmatch activo, When veo la NBA, Then el vocabulario cambia (restaurantes→artistas/publishers) pero los hard-nos y el `min()` permanecen idénticos. `[V]` (BR-8)
    - (edge) Given un cohort con muy pocos miembros (ej. 3 majors), When la estructura de percentil-en-cohort pierde sentido, Then se declara explícitamente "aquí la estructura quiebra". `[V]` (§6, EC-5)

### Recorrido (primera persona, clic por clic, estado-por-estado)

Yo, como **operador**, entro en **Pantalla 02 — NBA / Playbooks** llegando desde un cliente seleccionado en **Cohorts Explorer** (o desde una señal encolada). `[I]` (trigger)

1. **Estado carga:** veo un skeleton de la tarjeta de NBA mientras el sistema resuelve la acción (lee gap+cohort, filtra catálogo, verifica grounding, computa `min()`). `[I]`
2. **Estado normal:** veo la tarjeta *"P40→P70: haga X"* con: descripción de la acción del **catálogo cerrado**, el **chip `min()`** (nivel efectivo + techo dominante), el provenance `[V/I/C]`, el contrafactual "no actuar" y botones **Aprobar / Ajustar / Rechazar**. `[V]`
3. Hago clic en **Ajustar**. Espero que se abra el selector de **alternativas** (todas del catálogo). Elijo otra. El chip `min()` se recalcula. `[I]`
4. Hago clic en **Aprobar**. Espero que: si la acción es **financiera**, el sistema me obligue a ejecutarla yo (nunca autónoma); si no, ejecute hasta `nivel_efectivo` y degrade a humano lo no liberado. Mi **firma** queda en el audit-trail. `[V]`
5. **Estado bloqueo rojo (fail-closed):** si la NBA no tenía fuente en el Cerebro, en vez de tarjeta veo un **bloqueo rojo** con motivo "sin grounding → humano". No puedo publicar; el caso pasa a mi cola. `[V]`
6. **Estado vacío:** si ninguna acción del catálogo aplica al cohort, veo "sin acción aplicable" y la opción de manejarlo 1:1. `[I]`
7. **Estado error:** si falta un techo (`liberado_evals`/`teto_tier`/`pedido_NBA`) o un servicio cae, veo un aviso y el sistema asume el techo **más conservador** (degrade-to-human). `[V]`
8. Si el cliente está en **P90+ con señal de upsell**, veo un CTA "Rutear a Managed 1:1". Hago clic y espero que se emita el evento a Pantalla 8. `[V]`
9. Activo el **toggle Musixmatch**: el vocabulario cambia (restaurantes→artistas/publishers), pero el chip `min()` y los hard-nos no se mueven. Si el cohort tiene 3 majors, veo el aviso "aquí la estructura quiebra". `[V]`

> WHAT-vs-HOW: EPIC-3 (cómputo `min()`) y EPIC-1 grounding = camino determinista → GWT exhaustivo. EPIC-2 atribución por segmento y EPIC-4 ejecución/auto-aprobación = product-judgment → se fija outcome+constraints y se deja margen al builder. **`needs-prototype`:** umbral de cambio de método de atribución (§11.3) y la UI de auto-aprobación vs firma.

---

## OUTPUT 2 — BUSINESS RULES + EDGE CASES + FAILURE HANDLING

**SÍNTESIS:** el modo de fallo que más amenaza el North Star es **ejecutar autonomía de más** — actuar por encima de `min()` o sin grounding/atribución — porque convierte el North Star en *teatro* (actividad sin efecto confirmado) y rompe el freno que es la tesis del producto. El diseño es **fail-closed** en cada nodo. `[V]` (§2, §3, §10)

### A. Business Rules (invariantes)

**BR-1** | `[V]` | hard-no: sí | versionada: sí
Regla: el nivel de autonomía ejercido por cualquier NBA = `min(pedido_NBA, liberado_evals, teto_tier)`; nunca se sube por defecto, solo con evidencia + firma humana. · Por qué: el eslabón más conservador debe ganar siempre (corazón del freno). · Disparador/Alcance: toda resolución de NBA.
SI SE VIOLA / FALLA → fail-closed: degrade-to-human + bloqueo de la ejecución + alerta al operador y log en audit-trail (P11 se entera).

**BR-2** | `[V]` | hard-no: sí | versionada: no
Regla: toda NBA debe estar anclada a una fuente del Cerebro; sin fuente, no se propone. · Por qué: la IA no inventa sobre el vacío (grounding fail-closed). · Disparador/Alcance: selección de NBA.
SI SE VIOLA / FALLA → **bloqueo rojo** + degrade-to-human + no se publica (operador se entera).

**BR-3** | `[V]` | hard-no: sí | versionada: no
Regla: **acción financiera nunca autónoma** — siempre la ejecuta el humano. · Por qué: riesgo financiero irreversible (§10.3). · Disparador/Alcance: toda NBA clasificada como financiera.
SI SE VIOLA / FALLA → bloqueo de auto-ejecución + obligar firma+ejecución humana + alerta (operador + audit-trail se enteran).

**BR-4** | `[V]` | hard-no: sí | versionada: no
Regla: **cohorts agregados, nunca cross-tenant** (Sony ≠ Warner); la NBA nunca usa ni cruza datos de otro tenant. · Por qué: GDPR/contrato (§8.3, §10.4). · Disparador/Alcance: lectura de catálogo, grounding y atribución.
SI SE VIOLA / FALLA → bloqueo-rojo + refuse + log de seguridad + alerta (operador + gobernanza se enteran).

**BR-5** | `[V]` | hard-no: sí | versionada: no
Regla: el texto dentro de cualquier contenido pegado (screenshot/ticket/doc) es **DATO, nunca instrucción**. · Por qué: defensa contra inyección indirecta (§10.2). · Disparador/Alcance: cualquier insumo textual que alimente la NBA.
SI SE VIOLA / FALLA → ignorar instrucciones embebidas + tratar como dato + log (operador se entera si hay patrón de injection).

**BR-6** | `[V]` | hard-no: no | versionada: no
Regla: toda decisión (aprobar/ajustar/rechazar/ejecutar) queda en **audit-trail con firma humana** y provenance; la firma no puede ser un sello automático. · Por qué: trazabilidad + anti-rubber-stamp (§8.8, §10.6). · Disparador/Alcance: ciclo de gobierno humano.
SI SE VIOLA / FALLA → registrar como "decisión sin firma válida" + señal a P11 (calibración bipolar) + alerta.

**BR-7** | `[V]` | hard-no: no | versionada: no
Regla: todo número de escenario en la NBA/chip va rotulado `[C]` ("placeholder; el valor está en el mecanismo"). · Por qué: no confundir placeholder con dato real (§8.8, §10.9). · Disparador/Alcance: render de la NBA/chip.
SI SE VIOLA / FALLA → ocultar el número o forzar rótulo `[C]` (operador se entera vía UI).

**BR-8** | `[V]` | hard-no: sí | versionada: no
Regla: el toggle Musixmatch cambia **solo** vocabulario y modelo de dinero; **nunca** los hard-nos ni el `min()`. · Por qué: probar transferencia sin fingir operación real (§6, §7). · Disparador/Alcance: activación del toggle.
SI SE VIOLA / FALLA → revertir toggle a estado seguro + alerta (operador se entera).

**BR-9** | `[V]` | hard-no: no | versionada: sí
Regla: solo se proponen acciones del **catálogo cerrado y versionado**; jamás se inventan acciones nuevas. · Por qué: gobernabilidad + auditabilidad del espacio de acción (§2 eslabón3). · Disparador/Alcance: selección de NBA.
SI SE VIOLA / FALLA → descartar la acción fuera de catálogo + degrade-to-human + log.

**BR-10** | `[V]` | hard-no: no | versionada: no
Regla: el contrafactual "no actuar" es obligatorio en toda NBA; solo cuenta valor el **efecto** (acción vs no-acción) confirmado y atribuible. · Por qué: medir efecto, no actividad; North Star honesto (§2, §3). · Disparador/Alcance: creación y cierre de lazo de la NBA.
SI SE VIOLA / FALLA → no contar valor al North Star + marcar "no atribuible".

**BR-11** | `[I]` | hard-no: no | versionada: sí
Regla: si el cohort tiene `n < n_min`, el percentil/gap que alimenta la NBA no es significativo → la NBA se degrada a humano o se suprime. · Por qué: decisión sobre ruido (§11.4, espejo de Pantalla 1). · Disparador/Alcance: ingreso de gap/percentil.
SI SE VIOLA / FALLA → suprimir NBA automática + aviso + degrade-to-human.

### B. Edge Cases (de la pasada pre-mortem)

**EC-1** | dim: DATA-IN/grounding | `[V]` — Caso: NBA sin fuente en el Cerebro. · Detección: verificación de grounding al resolver. · Comportamiento: **bloqueo rojo**, no propone, degrade-to-human (fail-closed). · Regla(s): BR-2.
SI LA DETECCIÓN FALLA → no ejecutar ninguna acción + congelar la tarjeta + alertar al operador.

**EC-2** | dim: ROUTERS/`min()` | `[V]` — Caso: falta uno de los tres techos (`pedido_NBA`/`liberado_evals`/`teto_tier`). · Detección: chequeo de disponibilidad de los tres. · Comportamiento: asumir el más conservador → degrade-to-human (fail-closed). · Regla(s): BR-1.
SI LA DETECCIÓN FALLA → bloquear auto-ejecución por defecto + alertar.

**EC-3** | dim: ROUTERS/hard-no | `[V]` — Caso: la NBA propuesta es una acción financiera. · Detección: clasificación de tipo de acción del catálogo. · Comportamiento: nunca autónoma; obligar firma+ejecución humana. · Regla(s): BR-3.
SI LA DETECCIÓN FALLA → bloquear cualquier ejecución automática + alerta de seguridad financiera.

**EC-4** | dim: PROCESSING | `[I]` — Caso: ninguna acción del catálogo aplica al cohort/intent. · Detección: filtro de aplicabilidad vacío. · Comportamiento: mostrar "sin acción aplicable" + degrade-to-human; no inventar acción. · Regla(s): BR-9.
SI LA DETECCIÓN FALLA → no proponer + degrade-to-human.

**EC-5** | dim: i18n/toggle | `[V]` — Caso: cohort con muy pocos miembros (ej. 3 majors en Musixmatch) → percentil-en-cohort pierde sentido. · Detección: `n < n_min` + toggle. · Comportamiento: declarar explícitamente "la estructura quiebra aquí"; no forzar percentil. · Regla(s): BR-8, BR-11.
SI LA DETECCIÓN FALLA → suprimir la NBA basada en percentil + aviso.

**EC-6** | dim: EDGE/seguridad | `[V]` — Caso: texto embebido en insumo intenta instruir a la IA (injection indirecta). · Detección: el pipeline trata texto pegado como dato por diseño. · Comportamiento: ignorar instrucciones embebidas; procesar como dato. · Regla(s): BR-5.
SI LA DETECCIÓN FALLA → cuarentena del insumo + log + alerta.

**EC-7** | dim: EDGE/seguridad | `[V]` — Caso: intento de usar datos de otro tenant para la NBA. · Detección: aislamiento por tenant en lectura. · Comportamiento: refuse + bloqueo-rojo. · Regla(s): BR-4.
SI LA DETECCIÓN FALLA → log de seguridad + escalar a gobernanza.

**EC-8** | dim: METRICS | `[I]` — Caso: `liberado_evals = 0` para la celda `cohort×intent`. · Detección: lectura de Evals (P6). · Comportamiento: `nivel_efectivo` cae a 0 autonomía → propuesta solo informativa para firma humana. · Regla(s): BR-1.
SI LA DETECCIÓN FALLA → asumir 0 (más conservador).

**EC-9** | dim: METRICS | `[I]` — Caso: outcome no atribuible a la acción al cerrar el lazo. · Detección: método de atribución por segmento. · Comportamiento: no contar valor + marcar "no atribuible". · Regla(s): BR-10.
SI LA DETECCIÓN FALLA → excluir del North Star por seguridad.

**EC-10** | dim: NON-FUNC | `[I]` — Caso: firma humana repetida sin revisión efectiva (rubber-stamp). · Detección: patrón de firmas (P11 calibración bipolar). · Comportamiento: señalar a P11; penalizar exceso de sello. · Regla(s): BR-6.
SI LA DETECCIÓN FALLA → muestreo manual de auditoría.

### C. Matriz de fallo (ordenada por amenaza-North-Star descendente)

| Regla/Edge | Modo de fallo | Detección | Respuesta | Amenaza |
|---|---|---|---|---|
| BR-1 / EC-2 | autonomía ejecutada > `min()` | chequeo de 3 techos | fail-closed → humano + alerta | alta |
| BR-3 / EC-3 | acción financiera ejecutada sola | clasificación de tipo | bloqueo + firma humana | alta |
| BR-2 / EC-1 | NBA sin grounding | verificación Cerebro | bloqueo rojo → humano | alta |
| BR-10 / EC-9 | valor contado sin atribución | atribución por segmento | no contar + "no atribuible" | alta |
| BR-4 / EC-7 | fuga cross-tenant | aislamiento por tenant | refuse + bloqueo-rojo | alta |
| BR-5 / EC-6 | injection vía texto embebido | texto=dato por diseño | ignorar + log | media |
| BR-9 / EC-4 | acción fuera de catálogo | filtro de catálogo | descartar → humano | media |
| BR-11 / EC-5 | NBA sobre cohort n<n_min | conteo n | suprimir + aviso | media |
| BR-6 / EC-10 | rubber-stamp humano | patrón de firmas (P11) | señal a P11 + penalizar | media |
| BR-8 | toggle altera reglas | invariante de toggle | revertir a estado seguro | media |
| BR-7 | `[C]` confundido con dato real | render con rótulo | forzar rótulo `[C]` | baja |

---

## OUTPUT 3 — WORKFLOW

**SÍNTESIS:** el flujo toma un gap priorizado, elige la acción correcta del catálogo cerrado **solo si está anclada al Cerebro**, la deja ejecutar **solo hasta `min()`**, deja al humano gobernar (y nunca el dinero), y cierra el lazo emitiendo *efecto* a Evals y North Star — "y qué": la pantalla es donde la inteligencia del Cerebro se vuelve **acción gobernada y medible**. `[V]` (§2, §3, §4-P2)

Formato: `[TIPO]=nodo | -> =flujo | // =nota`.

### Contrato
- **Entrada:** {cliente, cohort, percentil, gap} (P1/Cerebro) + catálogo de NBA (cerrado/versionado) + `liberado_evals[cohort×intent]` (P6) + `teto_tier[tenant/cliente]` (P10) + ficha del cliente (P7 Cerebro).
- **Salida:** NBA decidida + contrafactual + `nivel_efectivo` + firma humana → escritura en Cerebro + señal a Evals + efecto a North Star + (opcional) evento de ruteo a Managed 1:1.
- **Actores:** IA (propone/ancla/computa/ejecuta hasta `min()`) · HUMANO (aprueba/ajusta/rechaza/firma; ejecuta todo lo financiero).
- **Frontera IA/HUMANO:** la IA propone del catálogo cerrado y ejecuta solo lo liberado; el humano gobierna lo no liberado, lo no-anclado y todo lo que toca dinero.

### ANTES (triggers + precondiciones)
- `[TRIGGER]` navegación desde P1 sobre un cliente/gap **O** señal upstream (gap cruza umbral) que encola una NBA candidata. `[I]`
- `[GROUNDING]` fuente del cliente debe existir en el Cerebro (P7); si falta -> `[FAIL-CLOSED]` degrade-to-human (BR-2).
- `[PRECOND]` los tres techos (`pedido_NBA`, `liberado_evals`, `teto_tier`) deben ser legibles; si falta uno -> asumir el más conservador (BR-1, EC-2).
- `[PRECOND]` tenant aislado; nunca cross-tenant (BR-4).

### DURANTE

**[Sub-proceso 2A — Selección y grounding de la NBA] [INICIO]**
- `[PASO 2A.1]` Resolver candidatas
  - `[ACTOR:IA]` filtrar catálogo cerrado por cohort/intent · `[DATA-IN]` catálogo NBA · gap/cohort (P1/Cerebro) · acceso por rol+tenant `[I]` · `[CÓMPUTO]` ordenar por efecto esperado de cierre de gap · `[DATA-OUT]` set de candidatas
  - `[DECISIÓN]` ¿hay candidata aplicable? -> `[NO]` `[FAIL-CLOSED]` "sin acción aplicable" + humano (BR-9, EC-4) -> `[FIN 2A]`
  - `[REGLA]` BR-9 // Riesgo: inventar acción fuera de catálogo
- `[PASO 2A.2]` Verificar grounding
  - `[ACTOR:IA]` anclar candidata top-1 a fuente del Cerebro · `[DATA-IN]` ficha (P7) · `[DATA-OUT]` NBA anclada
  - `[DECISIÓN]` ¿anclada? -> `[NO]` `[FAIL-CLOSED]` **bloqueo rojo** → humano (BR-2, EC-1) -> `[FIN 2A]`
  - `[REGLA]` BR-2, BR-5 // Riesgo: proponer sobre el vacío / injection
- **[FIN 2A]**

**[Sub-proceso 2B — Contrafactual + cómputo del `min()`] [INICIO]**
- `[PASO 2B.1]` Registrar contrafactual
  - `[ACTOR:IA]` calcular y persistir "no actuar" · `[DATA-OUT]` contrafactual en Cerebro · `[REGLA]` BR-10
- `[PASO 2B.2]` Computar techo efectivo
  - `[ACTOR:IA]` `[CÓMPUTO]` `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)` · `[DATA-IN]` Evals (P6), Política (P10)
  - `[AUTONOMÍA]` `min(pedido_NBA, liberado_evals, teto_tier)`
  - `[DECISIÓN]` ¿falta algún techo? -> `[SÍ]` asumir más conservador (BR-1, EC-2) -> `[NO]` continuar
  - `[DATA-OUT]` chip `min()` (techo dominante visible) · `[REGLA]` BR-1, BR-7
- **[FIN 2B]**

**[Sub-proceso 2C — Gobierno humano + ejecución] [INICIO]**
- `[PASO 2C.1]` Presentar y gobernar
  - `[ACTOR:HUMANO]` aprobar/ajustar/rechazar · `[CANAL]` UI tarjeta NBA + chip `min()` + provenance
  - `[DECISIÓN]` ¿es acción financiera? -> `[SÍ]` `[FAIL-CLOSED]` nunca autónoma → ejecución+firma humana (BR-3, EC-3) -> `[NO]` continuar
  - `[REGLA]` BR-3, BR-6
- `[PASO 2C.2]` Ejecutar hasta `nivel_efectivo`
  - `[ACTOR:IA|HUMANO]` ejecutar lo liberado; degradar a humano lo no liberado
  - `[DECISIÓN]` ¿`nivel_efectivo` cubre lo pedido? -> `[NO]` degrade-to-human (BR-1) -> `[SÍ]` ejecutar
  - `[DATA-OUT]` resultado + firma → audit-trail · `[REGLA]` BR-1, BR-6 // Riesgo: rubber-stamp (EC-10 → P11)
- **[FIN 2C]**

**[Sub-proceso 2D — Cierre de lazo + ruteo] [INICIO]**
- `[PASO 2D.1]` Medir efecto (atribución por segmento)
  - `[ACTOR:IA]` long-tail=holdout · managed n=1-5=evidencia+confirmación humana · `[REGLA]` BR-10
  - `[DECISIÓN]` ¿atribuible? -> `[NO]` "no atribuible" (no cuenta) (EC-9) -> `[SÍ]` contar efecto
- `[PASO 2D.2]` Emitir señales
  - `[DATA-OUT]` señal `cohort×intent` → Evals (P6) · efecto → North Star · escritura → Cerebro
  - `[DECISIÓN]` ¿cliente P90+ con upsell? -> `[SÍ]` `[DATA-OUT]` evento ruteo → Managed 1:1 (P8) -> `[NO]` `[FIN]`
- **[FIN 2D]**

### Flujo (ASCII)
```
[gap+cohort] -> [2A.1 candidatas] -⟨aplica?⟩-(no)-> [HUMANO "sin acción"]
                                    -(sí)-> [2A.2 grounding] -⟨anclada?⟩-(no)-> [BLOQUEO ROJO→HUMANO]
                                                                  -(sí)-> [2B.1 contrafactual] -> [2B.2 min()]
   -> [2C.1 gobierno] -⟨financiera?⟩-(sí)-> [HUMANO ejecuta+firma]
                       -(no)-> [2C.2 ejecuta≤nivel_efectivo] -⟨cubre?⟩-(no)-> [HUMANO]
   -> [2D.1 atribución] -⟨atribuible?⟩-(no)-> [no cuenta]
                         -(sí)-> [2D.2 señales→Evals/NorthStar/Cerebro] -⟨P90+upsell?⟩-(sí)-> [Managed 1:1]
```

### DESPUÉS
`[DATA-OUT]` escribe en **Cerebro** (decisión + contrafactual + outcome + firma) -> Alimenta a: **Evals** (señal `cohort×intent` → `liberado_evals`), **North Star** (efecto atribuible − deflection-que-falla), **Managed 1:1** (ruteo P90+), **Salud 1:10/P11** (costo-decisión + calibración anti-rubber-stamp).

### MAPA DE SISTEMAS Y FLUJO DE DATOS
- `[SISTEMA 1]` **Cerebro (P7)** · `[FUNCIÓN]` grounding + escritura de decisión/outcome · `[DATOS]` ficha, fuentes, contrafactual · `[ACCESO]` IA/operador (por tenant) · `[GROUNDING]` sí // Problema: ficha stale → NBA engaña -> Alimenta a: `[SISTEMA 2]`
- `[SISTEMA 2]` **Cohorts (P1)** · `[FUNCIÓN]` provee gap/percentil/cohort · `[DATOS]` percentil, gap, baseline · `[ACCESO]` IA/operador · `[GROUNDING]` sí // Problema: n<n_min → percentil ruido (BR-11) -> Alimenta a: NBA
- `[SISTEMA 3]` **Catálogo NBA** · `[FUNCIÓN]` espacio de acción cerrado/versionado · `[DATOS]` acciones, `pedido_NBA`, tipo (financiera?), intent · `[ACCESO]` IA · `[GROUNDING]` n/a // Problema: catálogo desactualizado → acción inválida -> Alimenta a: `min()`
- `[SISTEMA 4]` **Evals (P6)** · `[FUNCIÓN]` provee `liberado_evals[cohort×intent]`; recibe evidencia · `[DATOS]` matriz cohort×intent · `[ACCESO]` IA (lee), humano (promueve) · `[GROUNDING]` sí // Problema: juez co-sesgado certifica error (§10.5) -> Alimenta a: `min()` y data-flywheel
- `[SISTEMA 5]` **Política & Tier (P10)** · `[FUNCIÓN]` provee `teto_tier`; hard-no cross-tenant · `[DATOS]` tiers, política, límites · `[ACCESO]` humano define, IA opera · `[GROUNDING]` sí // Problema: tier mal mapeado → autonomía indebida -> Alimenta a: `min()`
- `[SISTEMA 6]` **North Star (§3)** · `[FUNCIÓN]` mide valor confirmado/atribuible − deflection-que-falla · `[DATOS]` efecto, esfuerzo, atribución por segmento · `[ACCESO]` IA reporta · `[GROUNDING]` sí // Problema: atribución débil → teatro -> Alimenta a: P11
- `[SISTEMA 7]` **Managed 1:1 (P8)** · `[FUNCIÓN]` recibe ruteo P90+ upsell · `[DATOS]` evento de expansión · `[ACCESO]` operador · `[GROUNDING]` sí // Problema: ruteo sin señal real → ruido comercial -> Alimenta a: receita atribuible
- `[SISTEMA 8]` **Salud 1:10 (P11)** · `[FUNCIÓN]` costo/decisión + calibración anti-rubber-stamp · `[DATOS]` costo, firmas, calibración · `[ACCESO]` IA reporta, humano vigila · `[GROUNDING]` n/a // Problema: rubber-stamp invisible -> Alimenta a: sostenibilidad del modelo

### PUNTOS DE DOLOR / RIESGOS (rankeados por impacto)
- `[RIESGO 1]` Autonomía ejecutada por encima de `min()` // Impacto: rompe el freno, North Star = teatro // Mitigación: BR-1 fail-closed + chip `min()` + auditoría. `[V]`
- `[RIESGO 2]` Acción financiera autónoma // Impacto: pérdida irreversible // Mitigación: BR-3 nunca autónoma (§10.3). `[V]`
- `[RIESGO 3]` NBA sin grounding // Impacto: IA inventa // Mitigación: BR-2 bloqueo rojo. `[V]`
- `[RIESGO 4]` Fuga cross-tenant // Impacto: GDPR/contrato // Mitigación: BR-4 refuse (§10.4). `[V]`
- `[RIESGO 5]` Valor sin atribución // Impacto: North Star deshonesto // Mitigación: BR-10 + atribución por segmento (§3). `[V]`
- `[RIESGO 6]` Rubber-stamp humano // Impacto: firma sin gobierno // Mitigación: BR-6 + P11 bipolar (§10.6). `[V]`
- `[RIESGO 7]` Injection vía texto // Impacto: control de la IA // Mitigación: BR-5 texto=dato (§10.2). `[V]`

**SÍNTESIS DE RIESGO:** el dominante es **autonomía por encima de `min()`** porque desactiva simultáneamente el freno (tesis del producto) y la honestidad del North Star — todo lo demás es contención de ese eje. `[V]`

### MODELO DE VARIABLES (entidades + campos + relaciones)

**NBA_PROPOSAL:**
- `id` : uuid · PK `[I]`
- `cliente_id` : uuid · FK → CLIENTE(Cerebro/P7) `[V]`
- `cohort_id` : uuid · FK → COHORT(P1) `[V]`
- `tenant_id` : uuid · FK → TENANT(P10) — aislamiento cross-tenant `[V]`
- `catalog_action_id` : uuid · FK → NBA_CATALOG `[V]`
- `percentil_origen` / `percentil_objetivo` : int `[V]` (ej. P40→P70)
- `gap` : num `[V]`
- `pedido_NBA` : enum(nivel) `[V]`
- `liberado_evals` : enum(nivel) · FK-deriv → EVAL_CELL `[V]`
- `teto_tier` : enum(nivel) · FK-deriv → TIER `[V]`
- `nivel_efectivo` : enum(nivel) = `min(pedido_NBA, liberado_evals, teto_tier)` `[V]`
- `estado` : enum(propuesta/aprobada/ajustada/rechazada/ejecutada/bloqueada/no_atribuible) `[I]`
- `es_financiera` : bool `[V]` (gobierna BR-3)
- `grounding_ref` : uuid · FK → CEREBRO_FUENTE (null ⇒ bloqueo rojo) `[V]`
- `provenance` : enum([V]/[I]/[C]) `[V]`
- `created_at` : ts `[I]`

**CONTRAFACTUAL:**
- `id` : uuid · PK `[I]`
- `nba_id` : uuid · FK → NBA_PROPOSAL `[V]`
- `resultado_esperado_sin_accion` : num/text `[V]`
- `metodo_atribucion` : enum(holdout/evidencia_confirmada) `[V]` (segmento)

**DECISION_AUDIT:**
- `id` : uuid · PK `[I]`
- `nba_id` : uuid · FK → NBA_PROPOSAL `[V]`
- `operador_id` : uuid · FK → USUARIO `[I]`
- `accion` : enum(aprobar/ajustar/rechazar) `[V]`
- `firma_valida` : bool `[V]` (anti-rubber-stamp, BR-6)
- `timestamp` : ts `[I]`

**EVAL_SIGNAL:**
- `id` : uuid · PK `[I]`
- `nba_id` : uuid · FK → NBA_PROPOSAL `[V]`
- `cohort_id` × `intent` : compuesto · FK → EVAL_CELL(P6) `[V]`
- `resultado` / `atribuible` : bool `[V]`

**NBA_CATALOG (referencia, propiedad de P-catálogo):**
- `action_id` : uuid · PK `[V]`
- `intent` : enum `[V]` · `version` : str `[V]` · `es_financiera` : bool `[V]` · `cohort_aplicable` : ref `[I]`

Relaciones:
- CLIENTE 1—N NBA_PROPOSAL
- COHORT 1—N NBA_PROPOSAL
- NBA_PROPOSAL 1—1 CONTRAFACTUAL
- NBA_PROPOSAL 1—N DECISION_AUDIT
- NBA_PROPOSAL 1—N EVAL_SIGNAL
- NBA_CATALOG 1—N NBA_PROPOSAL
- TENANT 1—N {CLIENTE, COHORT, NBA_PROPOSAL} (frontera dura cross-tenant)

### Gobernanza / anchor-check
`[AUTONOMÍA]` `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)` — nunca subir por defecto. · **Hard-nos:** cross-tenant (Sony≠Warner) · financial-never-autonomous · grounding-or-fail-closed · texto-pegado=dato · catálogo-cerrado · toggle-invariante. · **Variables escenario:** X (tickets/día), Y (Y₁ long-tail / Y₂ managed, nunca sumados), Z (SLA h), N% (escalación) — todas `[C]` placeholder, el valor está en el mecanismo.

---

## OPEN QUESTIONS (PT-BR) — exactamente lo que el grill preguntaría al operador

1. `[I]` **[Dim 2 · TRIGGERS]** O que dispara a NBA — navegação a partir do Cohorts Explorer sobre um cliente, um sinal upstream (gap cruza um limiar que enfileira a NBA), ou ambos? → *Recomendo: ambos (navegação manual + fila por sinal), pois cobre exploração e proatividade.*
2. `[I]` **[Dim 3 · DATA-IN]** Qual o schema exato de cada ação do catálogo cerrado (campos: intent, `pedido_NBA`, `es_financiera`, cohort aplicável, versão)? E o catálogo é por-tenant ou global?
3. `[I]` **[Dim 4/5 · PROCESSING]** A IA pode AUTO-EXECUTAR uma NBA não-financeira quando `nivel_efectivo` libera, ou toda execução exige clique humano mesmo quando liberada pelos Evals?
4. `[I]` **[Dim 5 · ROUTERS]** Como exatamente se classifica uma ação como "financeira" (BR-3) — flag no catálogo, classificador, ou ambos com fail-closed para humano em caso de dúvida?
5. `[I]` **[Dim 10 · METRICS]** Qual é o limiar (segmento/n) que muda o método de atribução de holdout (long-tail) para evidência+confirmação humana (managed n=1-5)? (§11.3)
6. `[I]` **[Dim 8/9 · RULES/EDGE]** Qual o `n_min` de cohort para que o percentil/gap que alimenta a NBA seja significativo? Abaixo disso, suprime a NBA ou degrada a humano? (§11.4)
7. `[I]` **[Dim 10 · METRICS]** Qual a janela de atribução por KPI (quanto tempo uma NBA conta como causadora do efeito)? (§11.2)
8. `[I]` **[Dim 6 · DATA-OUT]** Quem consome o "spec" / sinal gerado pela NBA e com qual SLA? (§11.7)
9. `[I]` **[Dim 10 · METRICS]** Qual o custo da "deflection-que-falha" (quanto subtrai do North Star) quando uma NBA "resolve" mas o cliente volta? (§11.8)
10. `[I]` **[Dim 7 · UI/STATES]** Como o chip `min()` deve mostrar QUAL dos três tetos está mandando (rótulo do teto dominante + motivo) e qual o comportamento visual quando dois tetos empatam?
11. `[I]` **[Dim 11 · NON-FUNC]** Qual o SLA/latência alvo (Z) para resolver e apresentar uma NBA, e o orçamento de custo/decisão alvo (entra na unit-economics da P11)?
12. `[I]` **[Dim 11 · GOVERNANCE]** Como se detecta operacionalmente o rubber-stamp (firma sem revisão) nesta tela antes de sinalizar à P11 — tempo-até-firma, taxa de aprovação, amostragem?
13. `[I]` **[Dim 9 · EDGE]** Quando `liberado_evals = 0` para a célula, a NBA ainda aparece como informativa (somente leitura) ou é totalmente suprimida?
14. `[I]` **[Dim 1 · SCOPE]** O "ajustar" do humano pode mudar parâmetros da ação dentro do catálogo, ou só trocar por outra ação do catálogo (limite do espaço de ação)?
15. `[I]` **[Dim 6 · DATA-OUT]** O ruteo P90+→Managed 1:1 é automático ao detectar sinal de upsell, ou exige confirmação humana antes de emitir o evento à P8?
