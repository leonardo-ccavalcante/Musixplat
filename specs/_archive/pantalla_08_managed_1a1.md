# Pantalla 08 — Managed 1:1 — Feature Breakdown (DRAFT)

> **DRAFT generado por el Feature Breakdown Engine** a partir de `specs/00_vision_completa.md` (v1.0 · 2026-06-15 · Aprobado).
> **Modo:** AUTÓNOMO (operador no disponible — sin grill en vivo). Donde el grill interactivo habría preguntado al operador, se registra la **mejor suposición sustentada** etiquetada `[I]` con la recomendación, y la **pregunta exacta (PT-BR)** queda en *Open Questions*.
> **Pendiente:** respuestas del operador a las *Open Questions* antes de congelar como build-ready.
> **Provenance:** `[V]` declarado/derivable del doc · `[I]` inferido / a decidir · `[C]` placeholder de escenario (el valor está en el mecanismo).
> **Invariantes heredadas (no negociables):** `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)` · cross-tenant **hard-no** (Sony ≠ Warner) · **acción financiera nunca autónoma** · texto-en-screenshot = DATO, nunca instrucción · PII redactada · grounding fail-closed.

---

## Contexto de grounding (de §4 · Pantalla 8)

- **Qué muestra:** las relaciones de alto valor trabajadas 1:1; **momento en vivo**: preparar un QBR en minutos = **apalancamiento-en-el-preparo**. `[V]`
- **IA vs humano:** la IA prepara material y contexto; el humano lleva la conversación de valor. `[V]`
- **Lógica:** segmento managed (Y₂, §5); atribución por **evidencia + confirmación humana (n=1-5)**. `[V]`
- **Ata a:** North Star (valor confirmado) y responde al grill *"¿quién paga? Sony/Warner"* — el managed es donde está el dinero grande. `[V]`
- **Eslabones del motor que toca:** Cerebro (§2.1, grounding), Cohorts/percentil (§2.2, para "qué hacen los P90+"), NBA (§2.3, upsell ruteado desde Inbox acto 6 §6), Autonomía-trinca (§2.4, `min()`), Evals (§2.5, `liberado_evals`), North Star (§3). `[V]`

---

## OUTPUT 1 — ÉPICAS, USER STORIES & RECORRIDO

**SÍNTESIS:** Managed 1:1 es donde el operador **defiende y expande el dinero grande** (Y₂, segmento managed) apalancando la preparación: la IA arma el material de un QBR en minutos sobre grounding del Cerebro, y el humano lleva la conversación y **firma el valor confirmado**. Sin esta pantalla, el North Star pierde su rama de **valor confirmado y atribuible por evidencia humana (n=1-5)** y el motor no captura expansión en las cuentas que pagan el 1:1. `[V]`

**PROBLEMA:** el operador no puede preparar un QBR de cuenta de alto valor a la velocidad que exige operar 1:10 — hoy junta a mano contexto disperso (uso, percentil, incidencias, finanzas) y llega tarde o incompleto, perdiendo retención y expansión en las cuentas grandes. `[I]` (struggle inferido del "momento en vivo: QBR en minutos" §4) **OUTCOME:** valor realizado **confirmado y atribuible** por evidencia + firma humana (North Star, numerador) y reducción de **esfuerzo-operador** en el preparo (denominador). `[V]`

**PLACEMENT:** esta pantalla = **1 de 11** en el cockpit del operador 1:10 · **aguas-arriba:** Cerebro (#7, raíz de grounding), Cohorts (#1, percentil P90+), Inbox (#5, rutea P90+ a Managed en acto 6 §6), Política/Tier (#10, `teto_tier`), Evals (#6, `liberado_evals`) · **aguas-abajo:** North Star (#3/#11, valor confirmado), GTM/expansión (receita capturada atribuible §8.7) · **hermanas conocidas:** las otras 10 pantallas · **fuera de alcance:** definición de la regla de cohort (Pantalla 1), edición de Política/tier (Pantalla 10), calibración de celdas de Evals (Pantalla 6). `[V]`

### Épicas (MECE; descomponen ESTA pantalla sin solape; cada una desarrollable)

---

**EPIC-1 — Cartera Managed (lista priorizable de cuentas Y₂)** | alcance: render de la cartera de cuentas managed del operador con su salud, percentil/gap, próximo hito (QBR/renovación) y señal de prioridad; **sin sumar Y₁+Y₂** | cubre dims: 1 (scope/actores), 3 (data-in), 6 (data-out a selección), 7 (UI/estados) | spec: **WHAT** = solo cuentas del tenant activo y del segmento managed; nunca cross-tenant; provenance visible por dato · **HOW** = tabla/lista ordenable por riesgo y por proximidad de hito; estado vacío y error explícitos.

  Features:
  - **F-1.1** Tabla de cartera managed (cuenta · percentil-en-cohort · gap-al-topo · próximo hito · señal de prioridad)
  - **F-1.2** Filtros/orden (por riesgo de churn, por proximidad de QBR/renovación, por oportunidad de upsell P90+)
  - **F-1.3** Entrada desde ruteo Inbox (acto 6 §6): cuentas P90+ marcadas "listas para upsell"

  - **US-1.1.1** | MoSCoW: Must | Hito: H1 — Como operador managed, quiero ver mi cartera de cuentas de alto valor con percentil, gap y próximo hito, para decidir a quién preparar primero. `[I]`
    - Given que tengo cuentas managed en el tenant activo, When abro la pantalla, Then veo una fila por cuenta con percentil-en-cohort, gap-al-topo, próximo hito y sello de provenance por dato. `[I]`
    - (edge) Given una cuenta cuyo cohort tiene n < n_min, When se renderiza el percentil, Then se oculta el percentil y se muestra aviso "muestra insuficiente" (fail-closed), sin bloquear el resto de la fila. `[I]` (BR-7, EC-1)
    - (edge) Given que el Cerebro de una cuenta no devuelve datos, When se renderiza, Then la fila aparece en estado degradado con CTA "completar ficha" y nunca se inventan valores. `[V]` (BR-1, EC-2)

  - **US-1.1.2** | MoSCoW: Must | Hito: H1 — Como operador, quiero que la cartera nunca mezcle cuentas de otro tenant, para no violar el hard-no cross-tenant. `[V]`
    - Given que el tenant activo es Warner, When cargo la cartera, Then solo veo cuentas de Warner y ningún dato agregado que provenga de Sony. `[V]` (BR-2)
    - (edge) Given que el filtro de tenant falla o devuelve mezcla, When se detecta, Then bloqueo-rojo de la pantalla + log + alerta (no render parcial). `[V]` (BR-2, EC-3)

  - **US-1.1.3** | MoSCoW: Should | Hito: H2 — Como operador, quiero ver marcadas las cuentas P90+ ruteadas desde la Inbox como "listas para upsell", para priorizar expansión. `[V]`
    - Given que la Inbox roteó una cuenta P90+ a Managed (acto 6 §6), When abro la cartera, Then esa cuenta muestra una insignia "oportunidad de upsell" con su NBA de origen. `[V]`

---

**EPIC-2 — Dossier de cuenta + Preparación de QBR (apalancamiento-en-el-preparo)** | alcance: ensamblar, con grounding obligatorio en el Cerebro, el material de QBR de UNA cuenta (resumen de salud, uso, percentil, incidencias de Inbox, NBA propuestas, finanzas como contexto **no autónomo**) en minutos | cubre dims: 2 (trigger), 3 (data-in), 4 (processing/IA), 5 (routers/min()), 7 (UI/estados) | spec: **WHAT** = toda afirmación del dossier anclada a una fuente del Cerebro; sin fuente → no se afirma (fail-closed); narrativa **no** puede "envolver el dato para que encaje" (anti-favorable-anecdote); finanzas presentadas como lectura, nunca como acción ejecutada · **HOW** = pipeline: trigger → grounding → ensamblar secciones → marcar provenance por línea → presentar borrador editable al humano.

  Features:
  - **F-2.1** Generación del dossier de QBR (secciones: salud/uso, percentil+gap, incidencias recientes de Inbox, NBA de cierre de gap, contexto financiero)
  - **F-2.2** Provenance por línea (cada afirmación lleva `[V]/[I]/[C]` + enlace a fuente del Cerebro)
  - **F-2.3** Borrador editable por el humano (la IA propone, el humano ajusta antes de la conversación)
  - **F-2.4** Chip de autonomía `min(pedido_NBA, liberado_evals, teto_tier)` visible en cada NBA propuesta dentro del dossier

  - **US-2.1.1** | MoSCoW: Must | Hito: H1 — Como operador, quiero generar el dossier de QBR de una cuenta en minutos a partir del Cerebro, para llegar preparado a la conversación de valor. `[V]`
    - Given una cuenta con Cerebro poblado y fuentes disponibles, When pido "preparar QBR", Then en segundos recibo un borrador con salud/uso, percentil+gap, incidencias, NBA y contexto financiero, cada línea con provenance y enlace a fuente. `[I]`
    - (edge) Given que falta la fuente de una sección (p.ej. no hay datos de uso anclados), When se ensambla el dossier, Then esa sección se marca "sin fuente — degradado a humano" y **no** se redacta afirmación inventada (fail-closed). `[V]` (BR-1, EC-2)
    - (edge) Given que la IA tiende a redactar una narrativa más favorable que el dato, When se genera el resumen, Then cada conclusión debe citar la métrica que la respalda o degradarse a "[I] a confirmar por el operador" (anti-favorable-anecdote). `[I]` (BR-8, EC-6)

  - **US-2.1.2** | MoSCoW: Must | Hito: H1 — Como operador, quiero que ninguna acción financiera del dossier se ejecute sola, para respetar el hard-no financiero. `[V]`
    - Given que el dossier incluye contexto financiero (descuento, crédito, renovación, precio), When se presenta, Then se muestra como **lectura/sugerencia** con etiqueta "requiere acción humana" y **nunca** dispara una operación de dinero. `[V]` (BR-3)
    - (edge) Given una NBA del catálogo que implica dinero, When se evalúa su autonomía, Then `pedido_NBA` financiero fuerza degrade-to-human aunque `liberado_evals` y `teto_tier` lo permitieran. `[V]` (BR-3, BR-5)

  - **US-2.1.3** | MoSCoW: Must | Hito: H1 — Como operador, quiero ver el chip `min()` de autonomía en cada NBA del dossier, para saber qué puede hacer la IA sola y qué necesita mi firma. `[V]`
    - Given una NBA propuesta en el dossier, When la veo, Then aparece el chip con `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)` y el techo que está limitando. `[V]` (BR-5)
    - (edge) Given que falta `liberado_evals` para esa celda cohort×intent, When se calcula el `min()`, Then el nivel efectivo cae al más conservador (degrade-to-human), nunca se asume liberado. `[V]` (BR-5, BR-6)

  - **US-2.1.4** | MoSCoW: Should | Hito: H2 — Como operador, quiero editar el borrador del dossier antes de la conversación, para corregir lo que la IA no captó. `[V]`
    - Given un borrador generado, When edito una sección, Then mis cambios se guardan como aporte humano (provenance pasa a aporte-humano) y quedan en el audit-trail. `[I]`

  > **Nota WHAT-vs-HOW:** la generación del dossier es **product-judgment** (qué resaltar para un QBR varía por cuenta) → se fija outcome + constraints (grounding, provenance, anti-favorable-anecdote, financiero no autónomo) y se deja margen al builder en el formato de las secciones. El **grounding gate** y el **`min()`** son deterministas → GWT exhaustivo.

---

**EPIC-3 — Atribución de valor confirmado + firma humana (n=1-5)** | alcance: tras (o durante) la conversación, registrar el **valor realizado** de la cuenta, vincularlo a la(s) acción(es) que lo causaron, y exigir **confirmación/firma humana** como método de atribución del segmento managed (no holdout) | cubre dims: 4 (processing), 6 (data-out a North Star/GTM), 8 (business-rules), 11 (governance/anti-rubber-stamp) | spec: **WHAT** = en managed la atribución = evidencia + confirmación humana; ventana de atribución por KPI; firma humana con anti-rubber-stamp; valor confirmado escribe en North Star y receita-expansión en GTM · **HOW** = formulario de confirmación con evidencia obligatoria, vínculo acción→valor, sello de segmento "managed/confirmado", write-back a Cerebro + North Star + GTM.

  Features:
  - **F-3.1** Registro de valor realizado (monto/KPI · acción atribuida · evidencia · ventana)
  - **F-3.2** Confirmación/firma humana con evidencia obligatoria (anti-rubber-stamp)
  - **F-3.3** Sello de método por segmento en la UI ("managed — evidencia + confirmación humana", distinto del sello holdout de long-tail, §8.6)
  - **F-3.4** Write-back: North Star (numerador), GTM (receita de expansión atribuible), Cerebro (historia de la cuenta), Evals (señal del flywheel)

  - **US-3.1.1** | MoSCoW: Must | Hito: H2 — Como operador, quiero confirmar el valor realizado de una cuenta vinculándolo a la acción que lo causó con evidencia, para que cuente en el North Star como valor atribuible. `[V]`
    - Given una acción ejecutada sobre la cuenta y un resultado de valor, When confirmo el valor, Then debo adjuntar evidencia y vincular la acción; recién entonces el valor se marca "confirmado-managed" y se escribe al North Star. `[V]` (BR-4, BR-9)
    - (edge) Given que confirmo sin adjuntar evidencia, When intento firmar, Then el sistema bloquea la firma y exige evidencia (anti-rubber-stamp). `[V]` (BR-9, EC-4)
    - (edge) Given que el valor cae fuera de la ventana de atribución del KPI, When lo registro, Then se marca "fuera de ventana — no atribuible" y no suma al North Star. `[I]` (BR-10, EC-5)

  - **US-3.1.2** | MoSCoW: Must | Hito: H2 — Como operador, quiero ver el sello de método de atribución (managed = evidencia+humano), para no confundirlo con el holdout del long-tail. `[V]`
    - Given una cuenta managed, When veo su valor confirmado, Then aparece el sello "atribución: evidencia + confirmación humana (n=1-5)" distinto del sello holdout. `[V]` (§8.6)

  - **US-3.1.3** | MoSCoW: Should | Hito: H3 — Como operador, quiero que el valor confirmado de expansión alimente la línea de receita capturada (GTM), para mostrar el motor de receita. `[V]`
    - Given un upsell confirmado en una cuenta P90+, When firmo el valor, Then la receita de expansión atribuible se escribe en la línea GTM y el sello indica "expansión-managed". `[V]` (§8.7)

  > **Nota WHAT-vs-HOW:** la **regla de atribución** (evidencia + confirmación humana, ventana por KPI, anti-rubber-stamp) es determinista → GWT exhaustivo. La **redacción de la evidencia** es product-judgment → outcome + constraint (debe existir y ser adjuntable).

---

### Recorrido (primera persona, clic por clic, estado-por-estado, incl. vacío/carga/error)

Yo, como **operador managed**, entro en **Managed 1:1**. Veo mi **cartera de cuentas de alto valor** (solo del tenant activo, p.ej. Warner): una fila por cuenta con percentil-en-cohort, gap-al-topo, próximo hito (QBR/renovación) y una señal de prioridad; cada dato lleva su sello `[V]/[I]/[C]`.

- **Estado de carga:** mientras se consulta el Cerebro veo skeletons por fila, nunca valores provisionales que parezcan reales.
- **Estado vacío:** si no tengo cuentas managed, veo "Sin cuentas managed en este tenant" + CTA para revisar segmentación (no se inventa contenido).
- **Estado degradado (cohort n<n_min):** la fila muestra todo menos el percentil, con aviso "muestra insuficiente".

Hago clic en una cuenta P90+ marcada **"oportunidad de upsell"** (ruteada desde la Inbox). Espero que se abra el **Dossier de cuenta**. Hago clic en **"Preparar QBR"**. Espero que en segundos aparezca un **borrador** con: salud/uso, percentil+gap, incidencias recientes de la Inbox, **NBA** con su **chip `min()`**, y **contexto financiero** etiquetado "requiere acción humana".

- **Si falta una fuente** (p.ej. no hay datos de uso anclados): esa sección aparece "sin fuente — degradado a humano", en rojo, **sin texto inventado**.
- **Si la narrativa sale más favorable que el dato:** cada conclusión muestra la métrica que la respalda o se degrada a "[I] a confirmar".

Edito lo que haga falta (mis cambios quedan como aporte humano en el audit-trail). Llevo la conversación de valor (eso lo hago yo, fuera del sistema). Vuelvo y hago clic en **"Confirmar valor realizado"**: el sistema me pide **adjuntar evidencia** y **vincular la acción** que causó el valor; **no me deja firmar sin evidencia** (anti-rubber-stamp). Al firmar, veo el sello **"managed — evidencia + confirmación humana"** y el valor se escribe al **North Star** (y, si fue upsell, a la línea **GTM de expansión**). Si el valor cayó fuera de la ventana de atribución, lo veo marcado "fuera de ventana — no atribuible".

---

## OUTPUT 2 — BUSINESS RULES + EDGE CASES + FAILURE HANDLING

**SÍNTESIS:** el modo de fallo que más amenaza el North Star en esta pantalla es **valor "confirmado" sin evidencia real (rubber-stamp) o atribuido a la acción equivocada** — porque convierte el numerador del North Star en teatro y, en el segmento que paga el dinero grande, propaga decisiones de retención/expansión sobre datos falsos. El segundo es la **fuga cross-tenant** al preparar QBR (usar patrones de Sony para Warner), que es un hard-no legal/contractual. `[V]`

### A. Business Rules (invariantes)

**BR-1** | `[V]` | hard-no: no | versionada: sí
Regla: toda afirmación del dossier/cartera debe estar **anclada a una fuente del Cerebro**; sin fuente, no se afirma. · Por qué: la confianza de la UI debe igualar la calidad del dato (anti-hallucinación); grounding fail-closed del motor (§2.4). · Disparador/Alcance: render de cartera y generación de dossier.
SI SE VIOLA / FALLA → la sección/fila se marca "sin fuente — degradado a humano" (fail-closed); **no** se redacta texto inventado + se notifica al operador.

**BR-2** | `[V]` | hard-no: **sí** | versionada: sí
Regla: **nunca** mostrar ni mezclar datos de otro tenant; cohorts agregados nunca cross-tenant (Sony ≠ Warner). · Por qué: GDPR/contrato (§8.3, §10 riesgo 4). · Disparador/Alcance: carga de cartera, agregados de percentil, ensamblado de dossier.
SI SE VIOLA / FALLA → **bloqueo-rojo** de la pantalla + log + alerta de seguridad; nunca render parcial. Se entera el operador y el dueño de gobernanza (Pantalla 10).

**BR-3** | `[V]` | hard-no: **sí** | versionada: sí
Regla: **acción financiera nunca autónoma** — descuentos, créditos, renovaciones, cambios de precio se presentan como lectura/sugerencia "requiere acción humana"; jamás se ejecutan por IA. · Por qué: §5 hardening, §10 riesgo 3. · Disparador/Alcance: contexto financiero del dossier, NBA con impacto monetario.
SI SE VIOLA / FALLA → degrade-to-human forzado + bloqueo de ejecución + alerta. Se entera el operador.

**BR-4** | `[V]` | hard-no: no | versionada: sí
Regla: en el segmento managed la **atribución = evidencia + confirmación humana (n=1-5)**, nunca holdout. · Por qué: §3.1, §4 (Pantalla 8), §8.6. · Disparador/Alcance: registro/confirmación de valor.
SI SE VIOLA / FALLA → el valor queda "no atribuible" y no suma al North Star.

**BR-5** | `[V]` | hard-no: no | versionada: sí
Regla: la autonomía de cualquier NBA en el dossier = `min(pedido_NBA, liberado_evals, teto_tier)`; el chip muestra el techo limitante. · Por qué: corazón del freno (§2). · Disparador/Alcance: cada NBA propuesta.
SI SE VIOLA / FALLA → se asume el nivel más conservador (degrade-to-human); nunca se sube autonomía por defecto.

**BR-6** | `[V]` | hard-no: no | versionada: sí
Regla: **fail-closed por ausencia** — si falta fuente, evidencia o permiso (incl. `liberado_evals` indefinido o `teto_tier` desconocido), el sistema no actúa de más: degrada a humano. · Por qué: §2 fail-closed. · Disparador/Alcance: todo el pipeline.
SI SE VIOLA / FALLA → degrade-to-human + log.

**BR-7** | `[I]` | hard-no: no | versionada: sí
Regla: el **percentil** solo se muestra si el cohort tiene **n ≥ n_min**; por debajo se oculta con aviso (consistente con Pantalla 1, open question §11.4). · Por qué: percentil con muestra chica = decisión sobre ruido. · Disparador/Alcance: render de percentil en cartera/dossier. · **[I] recomendado:** n_min = 20 (heredado del few-shot/Pantalla 1, a confirmar por operador).
SI SE VIOLA / FALLA → ocultar percentil + aviso "muestra insuficiente" (fail-closed); el resto de la fila sigue visible.

**BR-8** | `[I]` | hard-no: no | versionada: sí
Regla: **anti-favorable-anecdote** — el dossier no puede presentar una conclusión más optimista que el dato; cada conclusión cita la métrica que la respalda o se degrada a "[I] a confirmar por el operador". · Por qué: las narrativas de QBR tienden a "envolver el dato para que encaje" (blindspot experto: PMs usan anécdotas favorables cuando no hay datos; UIs confiadas sobre datos malos). · Disparador/Alcance: redacción del resumen del dossier.
SI SE VIOLA / FALLA → marcar la conclusión `[I]` + exigir revisión humana antes de usar en QBR.

**BR-9** | `[V]` | hard-no: no | versionada: sí
Regla: **firma humana con evidencia obligatoria (anti-rubber-stamp)** — no se puede confirmar valor sin adjuntar evidencia y vincular la acción causal; la firma queda en audit-trail. · Por qué: §10 riesgo 6 (rubber-stamp), §11 atribución como pre-condición. · Disparador/Alcance: confirmación de valor.
SI SE VIOLA / FALLA → bloquear la firma; el valor no se escribe al North Star; alerta a calibración (Pantalla 11).

**BR-10** | `[I]` | hard-no: no | versionada: sí
Regla: el valor solo cuenta si cae dentro de la **ventana de atribución del KPI**. · Por qué: open question §11.2 (ventana por KPI). · Disparador/Alcance: registro de valor. · **[I] recomendado:** ventana configurable por KPI; default 90 días (placeholder `[C]`), a definir por operador.
SI SE VIOLA / FALLA → marcar "fuera de ventana — no atribuible"; no suma.

**BR-11** | `[V]` | hard-no: no | versionada: no
Regla: **provenance visible** por dato/línea (`[V]/[I]/[C]`); los números `[C]` rotulados como placeholder. · Por qué: §8.8. · Disparador/Alcance: toda la UI.
SI SE VIOLA / FALLA → no renderizar el dato sin su sello.

**BR-12** | `[V]` | hard-no: no | versionada: no
Regla: **Y₁ (long-tail) y Y₂ (managed) nunca se suman**; esta pantalla reporta solo Y₂. · Por qué: §5 regla de honestidad. · Disparador/Alcance: cualquier conteo/agregado de relaciones.
SI SE VIOLA / FALLA → bloquear el agregado mezclado + corregir a reporte separado.

### B. Edge Cases (de la pasada pre-mortem)

**EC-1** | dim: 9 EDGE / DATA-IN | `[I]` — Caso: cohort de la cuenta con **n < n_min**. · Detección: count del cohort al render. · Comportamiento: ocultar percentil + aviso (fail-closed); fila visible. · Regla(s): BR-7.
SI LA DETECCIÓN FALLA → no renderizar el percentil de esa fila + alertar (mejor ocultar que mostrar ruido).

**EC-2** | dim: 9 EDGE / GROUNDING | `[V]` — Caso: **falta fuente** en el Cerebro para una sección del dossier (o cuenta sin ficha poblada). · Detección: grounding gate al ensamblar. · Comportamiento: sección "sin fuente — degradado a humano", sin texto inventado. · Regla(s): BR-1, BR-6.
SI LA DETECCIÓN FALLA → no publicar el dossier completo; degradar todo a humano + alerta.

**EC-3** | dim: 8 BUSINESS-RULE (hard-no) | `[V]` — Caso: el filtro de tenant devuelve o agrega **datos cross-tenant**. · Detección: chequeo de tenant en cada query y en agregados. · Comportamiento: **bloqueo-rojo** total + log + alerta de seguridad. · Regla(s): BR-2.
SI LA DETECCIÓN FALLA → fail-closed a nivel de capa de datos (deny-by-default por tenant) + auditoría inmediata. // failure-of-the-handler: el chequeo de tenant debe vivir en la capa de datos, no solo en la UI.

**EC-4** | dim: 11 GOVERNANCE | `[V]` — Caso: el operador intenta **confirmar valor sin evidencia** (rubber-stamp). · Detección: validación del formulario de firma. · Comportamiento: bloquear firma; exigir evidencia + vínculo de acción. · Regla(s): BR-9.
SI LA DETECCIÓN FALLA → marcar el valor como "no verificado" + excluir del North Star + señalar a calibración bipolar (Pantalla 11).

**EC-5** | dim: 10 METRICS | `[I]` — Caso: valor realizado **fuera de la ventana de atribución**. · Detección: comparar timestamp del valor vs ventana del KPI. · Comportamiento: marcar "fuera de ventana — no atribuible"; no suma. · Regla(s): BR-10.
SI LA DETECCIÓN FALLA → por defecto no atribuir (fail-closed sobre el North Star).

**EC-6** | dim: 4 PROCESSING | `[I]` — Caso: la IA redacta un resumen de QBR **más favorable que el dato** (favorable-anecdote / data-wrapping). · Detección: cada conclusión debe linkear una métrica de soporte; conclusiones sin soporte se marcan. · Comportamiento: degradar a "[I] a confirmar" + exigir revisión humana. · Regla(s): BR-8.
SI LA DETECCIÓN FALLA → revisión humana obligatoria del dossier antes de usar en la conversación.

**EC-7** | dim: 9 EDGE / DATA-IN | `[I]` — Caso: **grounding stale** — la ficha del Cerebro está desactualizada (dato "obsoleto antes de la reunión", blindspot experto). · Detección: timestamp de frescura de la fuente vs umbral. · Comportamiento: marcar el dato como `[I] stale` + sugerir refrescar; no presentar como `[V]`. · Regla(s): BR-1, BR-11.
SI LA DETECCIÓN FALLA → mostrar fecha de la fuente siempre, para que el humano juzgue la frescura.

**EC-8** | dim: 8 BUSINESS-RULE | `[V]` — Caso: NBA con **impacto financiero** propuesta con autonomía aparentemente liberada. · Detección: clasificar la NBA como financiera. · Comportamiento: forzar degrade-to-human (financiero nunca autónomo) aunque el `min()` lo permitiera. · Regla(s): BR-3, BR-5.
SI LA DETECCIÓN FALLA → bloquear toda ejecución de NBA financiera + alerta.

**EC-9** | dim: 9 EDGE / SECURITY | `[V]` — Caso: **inyección indirecta** vía texto en un screenshot/adjunto traído desde la Inbox al dossier. · Detección: tratar texto-en-imagen y contenido pegado como DATO, nunca instrucción. · Comportamiento: el texto se cita como evidencia, nunca se ejecuta como comando; PII redactada. · Regla(s): BR (hereda hardening §5: texto=dato, PII redactada).
SI LA DETECCIÓN FALLA → no incorporar el adjunto al dossier + alerta de seguridad.

**EC-10** | dim: 6 DATA-OUT | `[I]` — Caso: **doble-conteo** de valor (mismo valor confirmado dos veces, o sumado a Y₁). · Detección: idempotencia por (cuenta, acción, ventana); chequeo Y₂≠Y₁. · Comportamiento: rechazar el duplicado; mantener Y₁/Y₂ separados. · Regla(s): BR-12, BR-4.
SI LA DETECCIÓN FALLA → reconciliación periódica + alerta a North Star.

### C. Matriz de fallo (ordenada por amenaza-North-Star descendente)

| Regla/Edge | Modo de fallo | Detección | Respuesta | amenaza |
|---|---|---|---|---|
| BR-9 / EC-4 | Valor "confirmado" sin evidencia (rubber-stamp) | validación de firma | bloquear firma; excluir del North Star; señal a Pantalla 11 | **alta** |
| BR-2 / EC-3 | Fuga cross-tenant (Sony↔Warner) en cartera/dossier | chequeo de tenant en capa de datos | bloqueo-rojo + log + alerta seguridad | **alta** |
| BR-1 / EC-2 | Afirmación sin grounding (hallucinación) | grounding gate | sección "sin fuente"; sin texto inventado | **alta** |
| BR-3 / EC-8 | Acción financiera ejecutada por IA | clasificación NBA financiera | degrade-to-human forzado; bloqueo | **alta** |
| BR-8 / EC-6 | Narrativa favorable > dato (data-wrapping) | conclusión sin métrica de soporte | degradar a `[I]`; revisión humana | media |
| BR-4 / EC-10 | Atribución errónea / doble-conteo | idempotencia + sello de método | rechazar duplicado; "no atribuible" | media |
| BR-10 / EC-5 | Valor fuera de ventana cuenta como atribuible | timestamp vs ventana | marcar "no atribuible"; no suma | media |
| BR-5 / BR-6 | Autonomía asumida por defecto | recomputar `min()` con fail-closed | nivel más conservador (degrade-to-human) | media |
| BR-7 / EC-1 | Percentil sobre n<n_min (ruido) | count del cohort | ocultar + aviso | media |
| EC-9 | Inyección indirecta vía screenshot | texto=dato, no instrucción | citar como evidencia; nunca ejecutar | media |
| EC-7 | Grounding stale en QBR | timestamp de frescura | marcar `[I] stale`; mostrar fecha | baja |
| BR-12 | Y₁ sumado con Y₂ | chequeo de segmento | reporte separado | baja |

---

## OUTPUT 3 — WORKFLOW

**SÍNTESIS:** el "y qué" del flujo: convertir el **Cerebro de una cuenta de alto valor** en un **dossier de QBR confiable en minutos** (apalancamiento-en-el-preparo), dejar que el humano lleve la conversación, y **cerrar con firma humana + evidencia** que escribe **valor confirmado y atribuible** al North Star y la **receita de expansión** al GTM — todo bajo `min()`, fail-closed y hard-nos. `[V]`

Formato: `[TIPO]=nodo` · `->`=flujo · `//`=nota. Tipos: `[INICIO][FIN][PASO X.Y][TRIGGER][CANAL][ACTOR:IA|HUMANO][ACCIÓN][GROUNDING][CÓMPUTO][VARIABLE][DECISIÓN]->[SÍ]/[NO]/[rama][AUTONOMÍA min()][DATA-IN][DATA-OUT][REGLA BR-x][FAIL-CLOSED]`

### Contrato
- **Entrada:** tenant activo + identidad del operador managed + (opcional) cuenta seleccionada o ruteo P90+ desde Inbox (acto 6 §6).
- **Salida:** dossier de QBR con provenance + valor confirmado firmado → North Star, GTM-expansión, Cerebro (historia), Evals (señal).
- **Actores:** **IA** = segmenta/ancla/ensambla/propone; **HUMANO** (operador managed) = audita, edita, conversa, **firma valor**.
- **Frontera IA/HUMANO:** la IA prepara material y propone NBA bajo `min()`; el humano gobierna todo lo sin-fuente, todo lo financiero, y la **confirmación de valor** (la firma nunca es automática).

### ANTES (triggers + precondiciones)
- `[TRIGGER]` el operador abre Managed 1:1 · o `[TRIGGER]` Inbox rutea cuenta P90+ "lista para upsell" (§6 acto 6) · o `[TRIGGER]` próximo hito de QBR/renovación se acerca.
- `[GROUNDING]` fuente = Cerebro del Cliente (#7); cohort/percentil de Cohorts (#1); `liberado_evals` de Evals (#6); `teto_tier` de Política (#10). Si falta cualquiera → `[FAIL-CLOSED]` degrade-to-human (BR-6).
- `[PRECONDICIÓN]` tenant resuelto y aislado (BR-2); operador con rol managed y `teto_tier` conocido.

### DURANTE

**[Sub-proceso 1A — Cartera Managed]** `[INICIO]`
  **[PASO 1A.1]** Cargar cuentas del tenant
    `[ACTOR:IA]` consultar cuentas managed · `[DATA-IN]` cuentas·Cerebro·rol-managed `[V]` · `[CÓMPUTO]` filtrar por tenant + segmento Y₂ · `[DATA-OUT]` lista en memoria
    `[DECISIÓN]` ¿query aislada por tenant? -> `[SÍ]` 1A.2 -> `[NO]` `[FAIL-CLOSED]` bloqueo-rojo+log `[REGLA]` BR-2, EC-3
  **[PASO 1A.2]** Render de percentil/gap/hito
    `[ACTOR:IA]` `[DATA-IN]` percentil·Cohorts `[I]` · `[CÓMPUTO]` percentil+gap si n≥n_min · `[VARIABLE]` n_min `[I]`=20
    `[DECISIÓN]` ¿n≥n_min? -> `[SÍ]` mostrar percentil -> `[NO]` `[FAIL-CLOSED]` ocultar+aviso `[REGLA]` BR-7, EC-1
  `[FIN 1A]`

**[Sub-proceso 1B — Dossier + Preparación de QBR]** `[INICIO]`
  **[PASO 1B.1]** Grounding gate
    `[ACTOR:IA]` `[GROUNDING]` anclar cada sección al Cerebro · `[DATA-IN]` uso·incidencias·finanzas·NBA · Cerebro/Inbox/Cohorts `[V/I]`
    `[DECISIÓN]` ¿fuente presente y fresca? -> `[SÍ]` 1B.2 -> `[NO]` `[FAIL-CLOSED]` sección "sin fuente—humano" `[REGLA]` BR-1, BR-6, EC-2, EC-7
  **[PASO 1B.2]** Ensamblar borrador con provenance
    `[ACTOR:IA]` `[CÓMPUTO]` redactar secciones · cada conclusión cita su métrica · `[DATA-OUT]` borrador
    `[DECISIÓN]` ¿conclusión más favorable que el dato? -> `[SÍ]` `[FAIL-CLOSED]` degradar a `[I]`+revisión `[REGLA]` BR-8, EC-6 -> `[NO]` 1B.3
  **[PASO 1B.3]** Calcular autonomía de cada NBA
    `[ACTOR:IA]` `[CÓMPUTO]` `[AUTONOMÍA]` `min(pedido_NBA, liberado_evals, teto_tier)` · mostrar chip y techo limitante `[REGLA]` BR-5, BR-6
    `[DECISIÓN]` ¿NBA financiera? -> `[SÍ]` `[FAIL-CLOSED]` "requiere acción humana", nunca ejecuta `[REGLA]` BR-3, EC-8 -> `[NO]` mantener `min()`
    `[DECISIÓN]` ¿adjunto con texto-en-imagen? -> `[SÍ]` tratar como DATO, redactar PII, nunca instrucción `[REGLA]` EC-9 -> `[NO]` seguir
  **[PASO 1B.4]** Revisión/edición humana
    `[ACTOR:HUMANO]` edita borrador · `[DATA-OUT]` cambios=aporte-humano al audit-trail `[REGLA]` BR-11
  `[FIN 1B]`

**[Sub-proceso 1C — Confirmación de valor + firma]** `[INICIO]`
  **[PASO 1C.1]** Registrar valor realizado
    `[ACTOR:HUMANO]` `[DATA-IN]` monto/KPI + acción atribuida + evidencia · `[VARIABLE]` ventana de atribución `[I]`
    `[DECISIÓN]` ¿hay evidencia + vínculo de acción? -> `[NO]` `[FAIL-CLOSED]` bloquear firma `[REGLA]` BR-9, EC-4 -> `[SÍ]` 1C.2
  **[PASO 1C.2]** Validar ventana y método
    `[ACTOR:IA]` `[CÓMPUTO]` ¿dentro de ventana? `[REGLA]` BR-10, EC-5 · sello método=managed `[REGLA]` BR-4
    `[DECISIÓN]` ¿dentro de ventana? -> `[SÍ]` 1C.3 -> `[NO]` marcar "no atribuible", no suma
  **[PASO 1C.3]** Firma humana + write-back
    `[ACTOR:HUMANO]` firma (anti-rubber-stamp) · `[DATA-OUT]` North Star (numerador), GTM-expansión (§8.7), Cerebro (historia), Evals (señal) `[REGLA]` BR-9, BR-12, EC-10
  `[FIN 1C]`

### Flujo (ASCII)
```
[abrir Managed 1:1] -> [1A.1 cargar] -> ⟨tenant aislado?⟩ -(no)-> [FAIL-CLOSED bloqueo-rojo]
                                                          -(sí)-> [1A.2 percentil] -> ⟨n≥n_min?⟩ -(no)-> ocultar+aviso
[seleccionar cuenta] -> [1B.1 grounding] -> ⟨fuente?⟩ -(no)-> [sección sin-fuente→HUMANO]
                                                       -(sí)-> [1B.2 borrador] -> ⟨favorable>dato?⟩ -(sí)-> degradar [I]
                                                                                 -(no)-> [1B.3 min()] -> ⟨financiera?⟩ -(sí)-> [HUMANO]
                                                                                                       -(no)-> [1B.4 edición HUMANO]
[confirmar valor] -> [1C.1] -> ⟨evidencia?⟩ -(no)-> [FAIL-CLOSED bloquear firma]
                                            -(sí)-> [1C.2 ventana] -> ⟨en ventana?⟩ -(no)-> "no atribuible"
                                                                                    -(sí)-> [1C.3 firma+write-back]
```

### DESPUÉS
`[DATA-OUT]` escribe en **Cerebro** (historia de la cuenta + provenance del aporte humano) -> Alimenta a: **North Star** (#3/#11, valor confirmado-managed, numerador), **GTM** (línea de receita de expansión atribuible §8.7), **Evals** (#6, cada confirmación = señal del flywheel cohort×intent), **Pantalla 11** (firma alimenta la calibración bipolar anti-rubber-stamp).

### MAPA DE SISTEMAS Y FLUJO DE DATOS
`[SISTEMA 1]` **Cerebro del Cliente (#7)** · `[FUNCIÓN]` grounding raíz; ficha viva por cuenta · `[DATOS]` uso, incidencias, historia, finanzas-contexto · `[ACCESO]` IA (lectura) / operador (lectura+audita) · `[GROUNDING]` sí
    // Problema: ficha stale → QBR engaña (EC-7) -> Alimenta a: `[SISTEMA 4]`

`[SISTEMA 2]` **Cohorts (#1)** · `[FUNCIÓN]` percentil-en-cohort + gap + baseline · `[DATOS]` regla de cohort versionada, n del cohort · `[ACCESO]` IA / operador · `[GROUNDING]` sí
    // Problema: n<n_min → percentil ruidoso (EC-1) -> Alimenta a: `[SISTEMA 4]`

`[SISTEMA 3]` **Inbox (#5)** · `[FUNCIÓN]` rutea P90+ "listo para upsell" (§6 acto 6) + incidencias recientes · `[DATOS]` casos clasificados, screenshots (PII redactada, texto=dato) · `[ACCESO]` IA / operador · `[GROUNDING]` sí
    // Problema: inyección indirecta vía screenshot (EC-9) -> Alimenta a: `[SISTEMA 4]`

`[SISTEMA 4]` **Managed 1:1 (#8 — ESTA)** · `[FUNCIÓN]` cartera + dossier QBR + confirmación de valor · `[DATOS]` dossier, NBA con `min()`, valor confirmado · `[ACCESO]` operador managed (rol) · `[GROUNDING]` sí (fail-closed)
    // Problema: rubber-stamp / favorable-anecdote / cross-tenant -> Alimenta a: `[SISTEMA 5]`,`[SISTEMA 6]`,`[SISTEMA 7]`

`[SISTEMA 5]` **Evals (#6)** · `[FUNCIÓN]` fuente de `liberado_evals` + recibe señal de cada confirmación · `[DATOS]` matriz cohort×intent · `[ACCESO]` humano promueve / auto rebaja · `[GROUNDING]` sí
    // Problema: juez co-sesgado certifica error (red-team, §8.2)

`[SISTEMA 6]` **Política/Tier (#10)** · `[FUNCIÓN]` fuente de `teto_tier` + hard-no cross-tenant · `[DATOS]` mapa de tiers, tenant boundaries · `[ACCESO]` humano define / IA opera dentro · `[GROUNDING]` sí
    // Problema: si `teto_tier` desconocido → fail-closed (BR-6)

`[SISTEMA 7]` **North Star / GTM (#3,#11)** · `[FUNCIÓN]` numerador de valor confirmado + receita de expansión · `[DATOS]` valor atribuible-managed, receita-expansión · `[ACCESO]` operador (vía firma) · `[GROUNDING]` n/a (consume)
    // Problema: doble-conteo o Y₁+Y₂ sumados (EC-10, BR-12)

### PUNTOS DE DOLOR / RIESGOS (rankeados por impacto)
`[RIESGO 1]` **Rubber-stamp** — el operador firma valor sin revisar la evidencia. // Impacto: corrompe el numerador del North Star en el segmento del dinero grande. // Mitigación: evidencia obligatoria + audit-trail + calibración bipolar (Pantalla 11). `[V]`
`[RIESGO 2]` **Fuga cross-tenant** al preparar QBR (patrones de Sony en dossier de Warner). // Impacto: hard-no legal/contractual (GDPR). // Mitigación: deny-by-default por tenant en capa de datos; bloqueo-rojo. `[V]`
`[RIESGO 3]` **Hallucinación / favorable-anecdote** — dossier más optimista que el dato. // Impacto: decisiones de retención/expansión sobre narrativa falsa; el evaluador detecta la "UI confiada sobre dato malo". // Mitigación: grounding gate + cada conclusión cita su métrica + degradar a `[I]`. `[I]`
`[RIESGO 4]` **Acción financiera autónoma** colada vía NBA. // Impacto: dinero movido sin humano. // Mitigación: clasificación financiera → degrade-to-human forzado. `[V]`
`[RIESGO 5]` **Grounding stale** — ficha obsoleta antes de la reunión. // Impacto: QBR sobre datos viejos. // Mitigación: mostrar fecha de fuente; marcar `[I] stale`. `[I]`
`[RIESGO 6]` **Atribución errónea / ventana mal definida** — valor atribuido a la acción equivocada o fuera de ventana. // Impacto: North Star inflado/deflactado. // Mitigación: vínculo acción→valor + ventana por KPI + idempotencia. `[I]`

**SÍNTESIS DE RIESGO:** el dominante es el **rubber-stamp (RIESGO 1)** porque en el managed la atribución *es* la confirmación humana — si la firma no es honesta, el North Star se vuelve teatro justo donde está el dinero grande; el segundo, cross-tenant, es categórico (hard-no) pero más fácil de blindar en la capa de datos. `[V]`

### MODELO DE VARIABLES (entidades + campos + relaciones)

**TENANT**:
- `tenant_id` : uuid · PK `[V]`
- `nombre` : string `[V]`
- `teto_tier_default` : enum · ref Política(#10) `[V]`

**CUENTA_MANAGED**:
- `cuenta_id` : uuid · PK `[V]`
- `tenant_id` : uuid · FK → TENANT `[V]`
- `cerebro_ref` : uuid · FK → CEREBRO_FICHA `[V]`
- `cohort_id` : uuid · FK → COHORT `[V]`
- `segmento` : enum {managed_Y2} `[V]`
- `teto_tier` : enum · ref Política(#10) `[V]`
- `proximo_hito` : {tipo: enum[QBR,renovación], fecha} `[I]`
- `flag_upsell_p90` : bool · origen Inbox(#5) `[V]`

**CEREBRO_FICHA**:
- `ficha_id` : uuid · PK `[V]`
- `cuenta_id` : uuid · FK → CUENTA_MANAGED `[V]`
- `uso` / `incidencias` / `finanzas_contexto` : json · cada campo con `provenance` y `fecha_fuente` `[V]`
- `frescura_ts` : timestamp (para detección stale, EC-7) `[I]`

**COHORT**:
- `cohort_id` : uuid · PK `[V]`
- `regla_version` : string (versionada) `[V]`
- `n` : int (para n_min, BR-7) `[V]`
- `baseline` : json `[V]`

**PERCENTIL** (derivado, no se muestra si n<n_min):
- `cuenta_id` : uuid · FK → CUENTA_MANAGED `[V]`
- `cohort_id` : uuid · FK → COHORT `[V]`
- `percentil` : numeric · nullable si n<n_min `[I]`
- `gap_al_topo` : numeric `[V]`

**DOSSIER_QBR**:
- `dossier_id` : uuid · PK `[I]`
- `cuenta_id` : uuid · FK → CUENTA_MANAGED `[I]`
- `secciones` : json[{tipo, contenido, provenance, fuente_ref, soporte_metrica}] `[I]`
- `estado` : enum {borrador, editado, degradado_humano} `[I]`
- `aportes_humanos` : json (audit-trail) `[V]`

**NBA_PROPUESTA** (dentro del dossier):
- `nba_id` : uuid · PK `[V]`
- `dossier_id` : uuid · FK → DOSSIER_QBR `[I]`
- `intent` : enum (catálogo cerrado) `[V]`
- `es_financiera` : bool (fuerza humano, BR-3) `[V]`
- `pedido_NBA` : enum-nivel `[V]`
- `liberado_evals` : enum-nivel · FK → EVAL_CELDA `[V]`
- `teto_tier` : enum-nivel · ref Política `[V]`
- `nivel_efectivo` : enum-nivel = `min(pedido_NBA, liberado_evals, teto_tier)` `[V]`

**EVAL_CELDA**:
- `celda_id` : uuid · PK · (cohort_id, intent) `[V]`
- `liberado_evals` : enum-nivel `[V]`

**VALOR_CONFIRMADO**:
- `valor_id` : uuid · PK `[V]`
- `cuenta_id` : uuid · FK → CUENTA_MANAGED `[V]`
- `accion_atribuida_id` : uuid · FK → NBA_PROPUESTA (o acción registrada) `[V]`
- `monto_o_kpi` : numeric/json `[V]`
- `evidencia_ref` : uuid · NOT NULL (BR-9) `[V]`
- `metodo_atribucion` : enum {managed_evidencia_humana} (≠ holdout) `[V]`
- `ventana_kpi` : {inicio, fin} · BR-10 `[I]`
- `dentro_de_ventana` : bool `[I]`
- `firma_humano_id` : uuid · NOT NULL · audit-trail (anti-rubber-stamp) `[V]`
- `provenance` : enum `[V]`

**Relaciones:**
- TENANT 1—N CUENTA_MANAGED
- CUENTA_MANAGED 1—1 CEREBRO_FICHA
- COHORT 1—N CUENTA_MANAGED
- CUENTA_MANAGED 1—N PERCENTIL (por cohort) / 1—N DOSSIER_QBR / 1—N VALOR_CONFIRMADO
- DOSSIER_QBR 1—N NBA_PROPUESTA
- EVAL_CELDA 1—N NBA_PROPUESTA (provee `liberado_evals`)
- VALOR_CONFIRMADO N—1 NBA_PROPUESTA (acción atribuida)

### Gobernanza / anchor-check
`[AUTONOMÍA]` `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)` en cada NBA del dossier · **Hard-nos:** cross-tenant (Sony≠Warner, BR-2) · financiero nunca autónomo (BR-3) · texto-en-screenshot=DATO + PII redactada (EC-9) · grounding fail-closed (BR-1/BR-6) · firma humana con evidencia anti-rubber-stamp (BR-9) · Y₁≠Y₂ no sumar (BR-12) · provenance visible (BR-11). · **Variables escenario:** n_min `[I]`=20 · ventana_kpi `[I/C]` default 90d · segmento Y₂ (managed n=1-5) `[V]` · X/Y/Z/N de la aritmética 1:10 son `[C]` y viven en Pantallas 3/11, aquí solo se consume Y₂.

---

## OPEN QUESTIONS (PT-BR — para o operador resolver)

Estas são as perguntas que o grill interativo faria. Cada uma tem a suposição `[I]` já adotada no spec acima; o operador confirma ou corrige.

1. `[I]` **Definição de "valor realizado" no managed:** o que conta como valor realizado de uma conta managed para o North Star — receita de expansão, renovação, redução de churn, ou um KPI por conta? (liga a §11.1) — *suposição adotada: monto/KPI atribuível com evidência, expansão escreve em GTM.*
2. `[I]` **Janela de atribuição por KPI:** quanto tempo após a ação um valor ainda conta como atribuível, e isso varia por KPI? (liga a §11.2) — *suposição: configurável por KPI, default 90 dias `[C]`.*
3. `[I]` **n mínimo do cohort** para o percentil ser exibido nesta tela (consistência com Pantalla 1). (liga a §11.4) — *suposição: n_min=20.*
4. `[I]` **O que exatamente o dossier de QBR deve conter** e em que ordem (seções obrigatórias vs opcionais)? — *suposição: saúde/uso, percentil+gap, incidências da Inbox, NBA, contexto financeiro.*
5. `[I]` **Como deve ser a "evidência" obrigatória da firma** (link a documento, screenshot, métrica do Cerebro, confirmação do cliente)? É anti-rubber-stamp suficiente exigir um anexo, ou precisa de dupla checagem? (liga a §10 risco 6)
6. `[I]` **Quem é o "operador managed" e qual seu papel/permissão** distinta do operador long-tail? Há mais de um operador por conta? (dim SCOPE/ACTORS)
7. `[I]` **Como o managed recebe o ruteamento P90+ da Inbox** (evento, fila, push) e qual SLA para preparar o QBR a partir do trigger? (liga a §11.7 — quem consome o spec e com que SLA)
8. `[I]` **A ação financeira no dossier** é só leitura/contexto, ou o humano pode disparar a operação financeira a partir desta tela (com outra confirmação)? — *suposição: só leitura; execução financeira fica fora desta tela (hard-no autônomo + humano executa noutro lugar).*
9. `[I]` **Selo de método de atribuição na UI** do managed precisa ser visualmente distinto do holdout do long-tail — qual o texto/sinal exato? (liga a §8.6)
10. `[I]` **Umbral de frescura (stale)** do Cerebro para marcar um dado como `[I] stale` no dossier — quantos dias? (liga a EC-7)
11. `[I]` **Latência aceitável** para "QBR em minutos" — qual o teto Z de tempo de geração do dossier que ainda conta como apalancamento-no-preparo? (dim NON-FUNCTIONAL)
12. `[I]` **Custo por decisão** desta tela (geração de dossier por IA) e seu volume — alimenta as unit economics da Pantalla 11? (dim NON-FUNCTIONAL / §8.4)
