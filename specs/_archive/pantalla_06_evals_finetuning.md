# Pantalla 06 — Evals & Fine-tuning

> **DRAFT generado por el Feature Breakdown Engine** a partir de `specs/00_vision_completa.md` (v1.0 · 2026-06-15), en **modo AUTÓNOMO** (operador no disponible).
> Todas las decisiones que normalmente resolvería el operador en el grill interactivo están marcadas **`[I]`** con la recomendación mejor sustentada y registradas como *open questions* (PT-BR) al final.
> **Provenance:** `[V]` afirmado/derivable del doc · `[I]` inferido / a-decidir · `[C]` número placeholder de escenario (nunca dato real).
> **Invariantes heredadas del motor:** `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)` · cross-tenant = hard-no (Sony ≠ Warner) · acción financiera nunca autónoma · texto-en-screenshot = dato, nunca instrucción · **rebajar autonomía = automático; promover = humano + evidencia**.

---

## Contexto de grounding (qué dice el doc sobre esta pantalla)

- **§4 Pantalla 6 — Evals & Fine-tuning** [V]:
  - *Qué muestra:* la matriz golden set **cohort × intent**, celdas en rojo/verde, y un **red-team set**.
  - *IA vs humano:* **rebajar autonomía = automático**; **promover = humano + evidencia**. El red-team verifica que un juez co-sesgado no certifique el error (**independencia juez ↔ humano, más allá de κ**).
  - *Lógica:* golden set **versionado**; la matriz calibrada es **el dato propietario** (data-flywheel, §8).
  - *Ata a:* es la fuente de **`liberado_evals`** en la fórmula `min()` (§2).
- **§2 motor — eslabón 5 Evals** [V]: "Golden set por **cohort × intent**. **Promover** autonomía = humano + evidencia; **rebajar** = automático."
- **§2 fórmula** [V]: `liberado_evals` = cuánto han liberado los Evals para esa celda cohort × intent (basado en evidencia). Fail-closed: ante ausencia de evidencia, no se sube autonomía.
- **§6 acto 4** [V]: "La celda de Evals pasa de ROJA a VERDE → **libera el dial** de autonomía" — `liberado_evals` sube con evidencia, no por defecto.
- **§8.2 red-team** [V]: set red-team para que un juez co-sesgado no certifique el error; independencia juez ↔ humano más allá de κ.
- **§8.5 data-flywheel** [V]: la matriz cohort × intent de Evals calibrados es el dato propietario operacionalizado (moat).
- **§8.4 / §11.10** [V/I]: fine-tuning → margen = moat económico (unit economics viven en Pantalla 11); **base de fine-tuning** (modelo propio vs Claude) = open question `[I]`.
- **§10 riesgo 5** [V]: juez de Evals co-sesgado certifica el error → mitigado con red-team set + independencia juez ↔ humano.

---

## OUTPUT 1 — ÉPICAS, USER STORIES & RECORRIDO

**SÍNTESIS:** Evals & Fine-tuning es **el único productor de `liberado_evals`**, el techo central del `min()`. Sin esta pantalla la autonomía no puede subir nunca con evidencia (solo bajar), el dial de la demo (acto 4) no existe, y el motor se queda congelado en su nivel más conservador o, peor, sube autonomía sin prueba. Es el eslabón 5 que cierra el lazo evidencia→autonomía. [V]

**PROBLEMA:** el operador no tiene una forma versionada y auditable de decidir **cuánta autonomía es seguro liberar** para cada combinación cohort × intent, ni de detectar que un juez co-sesgado está certificando errores. [V]
**OUTCOME:** mueve el North Star de forma indirecta pero estructural — al liberar autonomía solo con evidencia, sube el **valor realizado por unidad de esfuerzo del operador** (la IA absorbe más sin que el humano apruebe caso a caso) y **protege contra la deflection-que-falla** (no se promueve una celda que resuelve mal). [V/I]
**PLACEMENT:** esta pantalla = **1 de 11**; eslabón **5 de 6** del motor. Aguas-arriba: Cohorts (#1, define cohortes), Support Inbox (#5, cada caso es señal del flywheel), Ficha/Cerebro (#7, grounding del golden set). Aguas-abajo: NBA/Playbooks (#2, consume `liberado_evals` en su chip `min()`), Política & Trinca (#10, fija `teto_tier`), Salud del 1:10 (#11, consume curva de costo/decisión y margen de fine-tuning). Hermanas conocidas: las otras 10 pantallas; fuera de alcance: no se inventan features hermanas. [V]

### Épicas (MECE; descomponen ESTA pantalla sin solape; cada una desarrollable)

---

**EPIC-1 — Matriz golden set cohort × intent (visualización + estado)**
`alcance:` render de la matriz cohort × intent con celdas rojo/verde, score por celda, n del golden set por celda, y provenance visible. **NO** decide promoción (eso es EPIC-3). `cubre dims:` 3 (DATA-IN), 7 (UI/STATES), 10 (METRICS). `spec:` WHAT = celda verde ⇔ score ≥ umbral_promoción **y** n ≥ n_min_eval; celda roja ⇔ lo contrario; gris ⇔ n insuficiente para evaluar. HOW = leer golden set versionado desde Cerebro/almacén de Evals, calcular score por celda (batch versionado), pintar.

  Features:
  - **F-1.1** Render de la matriz (filas = cohort, columnas = intent).
  - **F-1.2** Detalle de celda (score, n, versión del golden set, última corrida, juez usado).
  - **F-1.3** Estados de carga / vacío / error / n-insuficiente.

  - **US-1.1.1** | MoSCoW: Must | Hito: H1 — Como operador, quiero ver la matriz cohort × intent con celdas rojo/verde, para saber de un vistazo dónde hay evidencia para liberar autonomía. [V]
    - Given un golden set versionado con celdas evaluadas, When abro la pantalla, Then veo la matriz con cada celda coloreada rojo/verde según `score ≥ umbral_promoción`. [V]
    - Given una celda con `n_golden < n_min_eval` [I], When se renderiza, Then se pinta **gris** con aviso "evidencia insuficiente" (fail-closed: no verde). [I]
    - (edge) Given el golden set no carga (fuente caída), When abro la pantalla, Then **bloqueo + degrade-to-human**: no se pinta ninguna celda verde y se avisa "sin evidencia → autonomía no liberable". [I]
  - **US-1.2.1** | MoSCoW: Must | Hito: H1 — Como operador, quiero abrir el detalle de una celda y ver score, n, versión del golden set y juez usado, para auditar de dónde viene el color. [V]
    - Given una celda, When hago clic, Then veo `score`, `n_golden`, `version_golden_set`, `juez_id/version`, `fecha_ultima_corrida`, y el provenance `[V/I/C]`. [V/I]
  - **US-1.3.1** | MoSCoW: Should | Hito: H1 — Como operador, quiero estados claros de carga/vacío/error, para no confundir "sin datos" con "rojo". [I]
    - (edge) Given golden set vacío para un cohort nuevo, When se renderiza, Then fila completa en gris con CTA "sembrar golden set" (no rojo). [I]

---

**EPIC-2 — Red-team set e independencia juez ↔ humano (anti-juez-co-sesgado)**
`alcance:` ejecutar el red-team set contra cada celda candidata, medir independencia juez↔humano (más allá de κ), y **vetar** la promoción si el juez está co-sesgado. `cubre dims:` 4 (PROCESSING), 5 (ROUTERS), 8 (BUSINESS-RULES), 9 (EDGE). `spec:` WHAT = una celda **no** puede promoverse si falla el red-team o si la independencia juez↔humano cae bajo `umbral_independencia`; HOW = correr red-team set adversarial + calcular métrica de independencia (κ ajustado / desacuerdo correlacionado) por celda.

  Features:
  - **F-2.1** Red-team set versionado por celda (casos adversariales).
  - **F-2.2** Métrica de independencia juez ↔ humano (más allá de κ).
  - **F-2.3** Veto de promoción por fallo de red-team / co-sesgo.

  - **US-2.1.1** | MoSCoW: Must | Hito: H2 — Como operador, quiero que cada celda candidata a promoción pase un red-team set, para que un juez co-sesgado no certifique un error. [V]
    - Given una celda candidata a promover, When se evalúa, Then se corre el red-team set y se registra `red_team_pass: sí/no` por celda. [V]
    - (edge) Given el red-team falla en una celda verde-candidata, When se evalúa, Then la celda **no** se promueve (fail-closed) y queda marcada "veto red-team". [V]
  - **US-2.2.1** | MoSCoW: Must | Hito: H2 — Como operador, quiero ver la independencia juez ↔ humano por celda, para detectar co-sesgo más allá de κ. [V]
    - Given una celda con histórico de juicios juez+humano, When se evalúa, Then se calcula `independencia_score` (más allá de κ) [I] y se muestra; si `< umbral_independencia` [I], la celda **no** es promovible. [V/I]
    - (edge) Given juez y humano coinciden siempre (correlación sospechosa), When se calcula independencia, Then se marca "posible rubber-stamp / co-sesgo" y se bloquea promoción → escala a revisión (anti-rubber-stamp, lazo con Pantalla 11). [I]

---

**EPIC-3 — Liberación de autonomía: promover (humano+evidencia) vs rebajar (automático)**
`alcance:` el motor de decisión que escribe `liberado_evals` por celda. **Promover requiere humano + evidencia + firma**; **rebajar es automático** ante caída de score. Publica `liberado_evals` aguas-abajo. `cubre dims:` 2 (TRIGGERS), 5 (ROUTERS), 6 (DATA-OUT), 8 (BUSINESS-RULES). `spec:` WHAT = `liberado_evals[celda]` solo **sube** con (score≥umbral ∧ red_team_pass ∧ independencia_ok ∧ firma_humana); **baja** automáticamente si score cae bajo umbral o red-team empieza a fallar. HOW = router determinista que evalúa precondiciones y, en promoción, exige acción humana firmada antes de escribir.

  Features:
  - **F-3.1** Flujo de promoción con firma humana + adjunto de evidencia.
  - **F-3.2** Rebaja automática (degrade) ante caída de score / fallo de red-team.
  - **F-3.3** Publicación de `liberado_evals` por celda al consumidor (NBA `min()`).

  - **US-3.1.1** | MoSCoW: Must | Hito: H2 — Como operador, quiero promover la autonomía de una celda solo tras revisar evidencia y firmar, para que la autonomía nunca suba por defecto. [V]
    - Given una celda con `score ≥ umbral_promoción ∧ n ≥ n_min_eval ∧ red_team_pass ∧ independencia_ok`, When solicito promover, Then el sistema me exige **revisar la evidencia y firmar**; solo entonces `liberado_evals[celda]` sube al nuevo nivel. [V]
    - (edge) Given falta cualquiera de las precondiciones, When solicito promover, Then el botón de promover está **deshabilitado** con el motivo exacto (fail-closed). [V]
    - (edge) Given la firma humana ocurre sin abrir la evidencia (anti-rubber-stamp), When firmo, Then se registra el evento para la calibración bipolar de Pantalla 11. [I]
  - **US-3.2.1** | MoSCoW: Must | Hito: H2 — Como operador, quiero que la autonomía de una celda baje sola cuando su score cae, para no depender de que alguien actúe a tiempo. [V]
    - Given una celda verde cuyo `score` cae bajo `umbral_rebaja` [I] **o** cuyo red-team empieza a fallar, When corre la evaluación, Then `liberado_evals[celda]` **baja automáticamente** sin firma y se notifica al operador. [V]
  - **US-3.3.1** | MoSCoW: Must | Hito: H2 — Como NBA/Playbooks (consumidor), quiero leer `liberado_evals[cohort×intent]`, para alimentar el `min()` del chip de autonomía. [V]
    - Given `liberado_evals` publicado por celda, When NBA evalúa una acción, Then usa `min(pedido_NBA, liberado_evals, teto_tier)` y nunca excede `liberado_evals`. [V]

---

**EPIC-4 — Versionado del golden set + data-flywheel (ingesta de señal desde Inbox)**
`alcance:` el golden set es versionado e inmutable por versión; cada caso de la Inbox (#5) es señal candidata que enriquece el golden set (data-flywheel). **NO** decide autonomía (eso es EPIC-3). `cubre dims:` 3 (DATA-IN), 4 (PROCESSING), 6 (DATA-OUT), 11 (GOVERNANCE). `spec:` WHAT = toda corrida de Evals cita la `version_golden_set`; promociones se atan a una versión; añadir casos crea **nueva versión** (nunca muta una existente). HOW = pipeline de ingesta Inbox→candidatos→curación humana→nueva versión de golden set.

  Features:
  - **F-4.1** Versionado inmutable del golden set (snapshot por versión).
  - **F-4.2** Ingesta de candidatos desde la Inbox (cada caso = señal del flywheel).
  - **F-4.3** Curación humana de candidatos antes de promover a golden.

  - **US-4.1.1** | MoSCoW: Must | Hito: H1 — Como operador, quiero que cada corrida de Evals cite la versión del golden set, para que el resultado sea reproducible y auditable. [V]
    - Given una corrida de Evals, When se ejecuta, Then se persiste `version_golden_set` junto al score; cambiar el set crea **nueva versión**, no muta la anterior. [V]
  - **US-4.2.1** | MoSCoW: Should | Hito: H3 — Como operador, quiero que casos de la Inbox alimenten el golden set como candidatos, para construir el dato propietario (moat). [V]
    - Given un caso resuelto en la Inbox (#5), When se marca como señal, Then entra como **candidato** al golden set (no directo) con su cohort×intent. [V/I]
    - (edge) Given un candidato de un tenant, When se ingesta, Then **nunca** se mezcla con otro tenant (hard-no cross-tenant) ni arrastra PII sin redactar. [V]

---

**EPIC-5 — Fine-tuning (gancho + base) y enlace a unit economics**
`alcance:` exponer el gancho de fine-tuning sobre las celdas calibradas y enlazar su efecto (margen/moat) a Pantalla 11. **Esta pantalla NO calcula unit economics** (eso vive en #11); aquí solo se dispara/registra el fine-tuning y se enlaza. `cubre dims:` 6 (DATA-OUT), 10 (METRICS), 11 (NON-FUNCTIONAL). `spec:` WHAT = el fine-tuning se entrena sobre el dato calibrado (golden set versionado + matriz); su efecto en costo/decisión y margen se **reporta en #11**. HOW = job de fine-tuning parametrizado por base de modelo `[I]` → emite artefacto versionado + métricas a #11.

  Features:
  - **F-5.1** Disparo/registro de un job de fine-tuning sobre celdas calibradas.
  - **F-5.2** Versionado del artefacto de fine-tuning (ata a versión de golden set).
  - **F-5.3** Enlace de métricas (costo/decisión, margen) a Pantalla 11.

  - **US-5.1.1** | MoSCoW: Could | Hito: H3 — Como operador, quiero entrenar/registrar un fine-tuning sobre las celdas calibradas, para convertir el flywheel en margen (moat económico). [V/I]
    - Given un golden set versionado y celdas calibradas, When disparo un fine-tuning, Then se entrena sobre **base = `[I]` (modelo propio vs Claude — open question §11.10)** y se versiona el artefacto atado a `version_golden_set`. [I] `needs-decision`
    - (edge) Given la base de fine-tuning no está decidida, When intento disparar, Then queda en estado "pendiente de decisión de base" (no se entrena a ciegas). [I]
  - **US-5.3.1** | MoSCoW: Could | Hito: H3 — Como Salud del 1:10 (#11), quiero recibir las métricas de costo/decisión y margen del fine-tuning, para reportar las unit economics de la IA. [V]
    - Given un fine-tuning ejecutado, When termina, Then emite `costo_decision`, `delta_margen` y `version_artefacto` a Pantalla 11 (esta pantalla **no** los muestra como autoritativos). [V/I]

### Recorrido (primera persona, clic por clic, estado-por-estado)

Yo, como **operador**, entro en **Evals & Fine-tuning**. Veo la **matriz cohort × intent**: filas = cohortes, columnas = intents, cada celda coloreada **verde** (evidencia suficiente), **roja** (score bajo umbral) o **gris** (n insuficiente / sin golden set). En estado de **carga** veo skeletons de la grilla; en **error de fuente** veo un banner "sin evidencia → autonomía no liberable" y **ninguna** celda en verde (fail-closed); en **vacío** (cohort nuevo) veo la fila en gris con CTA "sembrar golden set".

Hago clic en una **celda roja** que me interesa promover. Espero que se abra el **panel de detalle**: score, `n_golden`, `version_golden_set`, juez usado, fecha de última corrida, resultado del **red-team set** y el **`independencia_score`** (juez ↔ humano), todo con su rótulo `[V/I/C]`.

Veo que el score sigue bajo umbral, así que el botón **"Promover autonomía"** está **deshabilitado** con el motivo exacto ("score < umbral" / "red-team pendiente"). Decido **disparar una corrida de Evals** con la última versión del golden set. Espero a que la celda se recalcule; pasa de **roja a verde** (acto 4 de la demo). Ahora el botón "Promover" se habilita **solo** porque se cumplen `score ≥ umbral ∧ n ≥ n_min ∧ red_team_pass ∧ independencia_ok`.

Hago clic en **"Promover"**. Espero que se abra el **modal de evidencia + firma**: reviso los casos del golden set, el resultado del red-team y la independencia; **firmo**. El sistema registra mi firma y **sube `liberado_evals` de esa celda**. Veo confirmación y el chip de autonomía aguas-abajo (NBA #2) ahora refleja el nuevo techo vía `min()`.

Más tarde, una celda que estaba verde **cae de score**; sin que yo haga nada, el sistema la **rebaja automáticamente** a un nivel inferior y me **notifica**. Por último, entro al gancho de **fine-tuning**: si la base de modelo está decidida, disparo un job sobre las celdas calibradas; si no, queda "pendiente de decisión de base" y no se entrena a ciegas. Las métricas de costo/margen **no** las leo aquí — se reportan en Salud del 1:10 (#11).

---

## OUTPUT 2 — BUSINESS RULES + EDGE CASES + FAILURE HANDLING

**SÍNTESIS:** el modo de fallo que más amenaza el North Star es **liberar autonomía sobre evidencia falsa** — un juez co-sesgado que certifica un error promueve una celda que resuelve mal, lo que dispara **deflection-que-falla** (resta directa al North Star) a escala automática. Por eso "promover = humano + evidencia + red-team + independencia" es el corazón de esta pantalla, y "rebajar = automático" es la red de seguridad. [V]

### A. Business Rules (invariantes)

**BR-1** | [V] | hard-no: sí | versionada: sí
Regla: **Rebajar autonomía es automático; promover requiere humano + evidencia + firma.** `liberado_evals[celda]` solo sube con `score ≥ umbral_promoción ∧ n ≥ n_min_eval ∧ red_team_pass ∧ independencia_ok ∧ firma_humana`; baja sin firma.
Por qué: evita que la autonomía suba por defecto o por inercia; el lado conservador siempre gana.
Disparador/Alcance: toda escritura de `liberado_evals`.
SI SE VIOLA / FALLA → **bloqueo de la escritura (fail-closed)** + log de auditoría + alerta al operador. Se entera: operador + auditoría de gobernanza.

**BR-2** | [V] | hard-no: sí | versionada: no
Regla: **Una celda no se promueve si el red-team set falla** o si `independencia_score < umbral_independencia` (juez co-sesgado).
Por qué: un juez co-sesgado certificaría el error (§10 riesgo 5); la independencia es más-allá-de-κ.
Disparador/Alcance: toda evaluación de celda candidata a promoción.
SI SE VIOLA / FALLA → **veto de promoción (fail-closed)** + marca "co-sesgo / veto red-team" + escala a revisión humana. Se entera: operador + responsable de calibración.

**BR-3** | [V] | hard-no: no | versionada: sí
Regla: **El golden set es versionado e inmutable por versión.** Toda corrida y toda promoción citan `version_golden_set`; añadir casos crea una nueva versión.
Por qué: reproducibilidad y auditoría; el dato propietario (moat) exige trazabilidad.
Disparador/Alcance: corridas de Evals, promociones, fine-tuning.
SI SE VIOLA / FALLA → **rechazo de la operación** (no se permite mutar una versión) + log.

**BR-4** | [V] | hard-no: sí | versionada: no
Regla: **Cross-tenant prohibido (Sony ≠ Warner).** Golden sets, candidatos del flywheel y matrices nunca mezclan tenants.
Por qué: GDPR/contrato; hard-no de gobernanza (§8.3, §10.4).
Disparador/Alcance: ingesta de candidatos, render de matriz, fine-tuning.
SI SE VIOLA / FALLA → **bloqueo-rojo + refuse** + log + alerta de seguridad. Una sesión = un tenant.

**BR-5** | [V] | hard-no: sí | versionada: no
Regla: **PII redactada y texto-en-screenshot = dato, nunca instrucción** en cualquier caso que entre al golden set desde la Inbox.
Por qué: defensa contra inyección indirecta y fuga de PII (§5 hardening, §10.2).
Disparador/Alcance: ingesta de candidatos desde la Inbox (F-4.2).
SI SE VIOLA / FALLA → **rechazo del candidato** + cuarentena + alerta.

**BR-6** | [V] | hard-no: no | versionada: no
Regla: **`liberado_evals` es solo un techo del `min()`**, nunca el nivel efectivo. El nivel efectivo lo decide `min(pedido_NBA, liberado_evals, teto_tier)` aguas-abajo.
Por qué: esta pantalla no debe poder forzar autonomía por sí sola; respeta el freno multi-techo.
Disparador/Alcance: publicación a NBA (#2).
SI SE VIOLA / FALLA → consumidor ignora valores fuera de rango + log de inconsistencia.

**BR-7** | [I] | hard-no: no | versionada: sí
Regla: **Una celda con `n_golden < n_min_eval` no puede ser verde** (se pinta gris "evidencia insuficiente").
Por qué: evitar promover sobre ruido estadístico (paralelo a n_min de cohort, §11.4).
Disparador/Alcance: render y evaluación de celda.
SI SE VIOLA / FALLA → forzar gris + bloquear promoción (fail-closed).

**BR-8** | [V] | hard-no: no | versionada: no
Regla: **Acción financiera nunca autónoma** — ninguna celda cohort×intent que implique dinero puede liberar autonomía plena vía Evals.
Por qué: invariante global del motor (§5 hardening, §10.3).
Disparador/Alcance: promoción de celdas con intent financiero.
SI SE VIOLA / FALLA → techo forzado a "propone, no ejecuta" + alerta.

**BR-9** | [I] | hard-no: no | versionada: no
Regla: **Anti-rubber-stamp:** una firma de promoción sin haber abierto la evidencia se registra como evento de calibración para Pantalla 11.
Por qué: la firma humana no puede ser un sello automático (§11 calibración bipolar, §10.6).
Disparador/Alcance: flujo de firma de promoción (F-3.1).
SI SE VIOLA / FALLA → evento enviado a #11 + posible bloqueo si el patrón persiste.

### B. Edge Cases (de la pasada pre-mortem)

**EC-1** | dim: DATA-IN/EDGE | [I] — Caso: **golden set no carga** (fuente caída). · Detección: timeout/error al leer almacén de Evals. · Comportamiento: **ninguna celda verde**, banner "sin evidencia → autonomía no liberable" (fail-closed). · Regla(s): BR-1, BR-3.
SI LA DETECCIÓN FALLA → degrade-to-human global de la pantalla + alerta de observabilidad.

**EC-2** | dim: EDGE | [I] — Caso: **celda con `n_golden < n_min_eval`**. · Detección: count al evaluar. · Comportamiento: gris "evidencia insuficiente", promoción deshabilitada. · Regla(s): BR-7.
SI LA DETECCIÓN FALLA → forzar no-verde por defecto (fail-closed conservador).

**EC-3** | dim: ROUTERS/EDGE | [V] — Caso: **red-team falla en celda verde-candidata**. · Detección: `red_team_pass = no`. · Comportamiento: veto de promoción, marca "veto red-team". · Regla(s): BR-2.
SI LA DETECCIÓN FALLA → no promover por defecto si el red-team no devolvió resultado (fail-closed).

**EC-4** | dim: EDGE/GOVERNANCE | [I] — Caso: **juez ↔ humano correlacionan demasiado** (posible co-sesgo/rubber-stamp). · Detección: `independencia_score < umbral_independencia`. · Comportamiento: bloquear promoción + marca "co-sesgo" + escalar. · Regla(s): BR-2, BR-9.
SI LA DETECCIÓN FALLA → tratar independencia desconocida como insuficiente (fail-closed).

**EC-5** | dim: DATA-IN/EDGE | [V] — Caso: **candidato de flywheel arrastra otro tenant o PII sin redactar**. · Detección: chequeo de tenant + escaneo PII en ingesta. · Comportamiento: rechazo + cuarentena. · Regla(s): BR-4, BR-5.
SI LA DETECCIÓN FALLA → cuarentena por defecto de todo candidato no verificado + alerta de seguridad.

**EC-6** | dim: ROUTERS/EDGE | [V] — Caso: **celda verde cae de score** (drift del modelo/datos). · Detección: `score < umbral_rebaja` en corrida periódica. · Comportamiento: **rebaja automática** sin firma + notificación. · Regla(s): BR-1.
SI LA DETECCIÓN FALLA → si no hay corrida reciente, expirar `liberado_evals` a un piso seguro (fail-closed por staleness).

**EC-7** | dim: PROCESSING/EDGE | [I] — Caso: **golden set stale** (versión sin recorrer hace > T). · Detección: edad de `fecha_ultima_corrida`. · Comportamiento: marcar celda "stale" + degradar promovibilidad. · Regla(s): BR-3.
SI LA DETECCIÓN FALLA → tratar como stale por defecto si falta timestamp.

**EC-8** | dim: METRICS/EDGE | [I] — Caso: **fine-tuning sin base de modelo decidida**. · Detección: `base_modelo = null`. · Comportamiento: job en estado "pendiente de decisión" (no entrena). · Regla(s): n/a (open §11.10).
SI LA DETECCIÓN FALLA → no entrenar a ciegas; bloquear disparo.

### C. Matriz de fallo (ordenada por amenaza-North-Star descendente)

| Regla/Edge | Modo de fallo | Detección | Respuesta | amenaza |
|---|---|---|---|---|
| BR-2 / EC-4 | Juez co-sesgado certifica error → se libera celda mala → deflection-que-falla a escala | red-team `pass=no` + `independencia_score` bajo | Veto de promoción + escalar | **alta** |
| BR-1 / EC-6 | Autonomía sube por defecto o no baja al caer score | corrida periódica de score | Promover bloqueado sin firma; rebaja automática | **alta** |
| BR-4 / EC-5 | Fuga cross-tenant en golden set / flywheel | chequeo de tenant en ingesta/render | Bloqueo-rojo + refuse + alerta | **alta** |
| BR-8 | Celda financiera libera autonomía plena | intent = financiero | Techo "propone, no ejecuta" | **alta** |
| BR-5 / EC-5 | Inyección indirecta o PII vía caso de Inbox | escaneo PII + texto-como-dato | Rechazo + cuarentena | media |
| BR-7 / EC-2 | Celda verde con n insuficiente (promoción sobre ruido) | count vs n_min_eval | Forzar gris + bloquear promoción | media |
| EC-1 | Golden set no carga | timeout de fuente | Ninguna verde + degrade-to-human | media |
| BR-3 / EC-7 | Golden set stale / mutado | edad de corrida + hash de versión | Marcar stale + rechazar mutación | media |
| BR-9 | Rubber-stamp humano (firma sin revisar) | firma sin apertura de evidencia | Evento a #11 + posible bloqueo | media |
| EC-8 | Fine-tuning sobre base no decidida | `base_modelo=null` | Estado "pendiente" (no entrena) | baja |

---

## OUTPUT 3 — WORKFLOW

**SÍNTESIS:** el flujo convierte **evidencia versionada** en un **techo de autonomía firmado** (`liberado_evals`), con un freno doble — red-team contra el juez co-sesgado y rebaja automática contra el drift — de modo que la autonomía solo sube cuando un humano firma sobre prueba que un adversario no logró romper. [V]

Formato: `[TIPO]=nodo | -> =flujo | // =nota`.

### Contrato
- **Entrada:** golden set versionado (cohort×intent) + red-team set + candidatos de la Inbox (#5) + histórico de juicios juez/humano. [V]
- **Salida:** `liberado_evals[cohort×intent]` (techo del `min()`) + matriz calibrada (dato propietario) + métricas de fine-tuning hacia #11 + eventos de calibración hacia #11. [V]
- **Actores:** IA (evalúa, corre red-team, calcula independencia, rebaja) · HUMANO (revisa evidencia, firma promoción, cura candidatos, decide base de fine-tuning). [V]
- **Frontera IA/HUMANO:** **rebajar = IA autónoma**; **promover = HUMANO obligatorio + evidencia + red-team + independencia**. Curación del golden set y decisión de base de fine-tuning = HUMANO. [V]

### ANTES (triggers + precondiciones)
- `[TRIGGER]` Operador abre la pantalla / corrida periódica programada / caso nuevo señalado en la Inbox. [V/I]
- `[GROUNDING]` golden set + red-team set viven en el almacén de Evals (ancla al Cerebro #7); si falta la fuente -> `[FAIL-CLOSED]` ninguna celda verde + degrade-to-human (EC-1). [V]
- `[PRECONDICIÓN]` `version_golden_set` presente y no stale (BR-3, EC-7); tenant único en sesión (BR-4). [V]

### DURANTE

**[Sub-proceso 6A — Evaluar matriz cohort × intent]** `[INICIO]`
  `[PASO 6A.1]` Cargar y puntuar celdas
    `[ACTOR:IA]` correr golden set por celda · `[DATA-IN]` golden set versionado · almacén de Evals · acceso IA/operador `[V]` · `[CÓMPUTO]` `score[celda]` (batch versionado) · `[DATA-OUT]` matriz coloreada
    `[DECISIÓN]` `n_golden ≥ n_min_eval`? -> `[NO]` `[FAIL-CLOSED]` pintar gris "evidencia insuficiente" -> `[SÍ]` continuar
    `[DECISIÓN]` `score ≥ umbral_promoción`? -> `[NO]` celda roja -> `[SÍ]` celda verde-candidata
    `[REGLA]` BR-3, BR-7 · EC-1, EC-2 · `[FAIL-CLOSED]` si fuente cae -> ninguna verde // Riesgo: stale engaña (EC-7)
  `[FIN 6A]`

**[Sub-proceso 6B — Red-team + independencia juez↔humano]** `[INICIO]`
  `[PASO 6B.1]` Correr red-team set
    `[ACTOR:IA]` evaluar celda verde-candidata contra casos adversariales · `[DATA-IN]` red-team set versionado · `[CÓMPUTO]` `red_team_pass: sí/no` · `[DATA-OUT]` marca por celda
    `[DECISIÓN]` `red_team_pass`? -> `[NO]` `[FAIL-CLOSED]` veto "red-team" -> `[SÍ]` continuar
  `[PASO 6B.2]` Medir independencia
    `[ACTOR:IA]` calcular `independencia_score` (más allá de κ) entre juez y humano · `[DATA-IN]` histórico juicios · `[CÓMPUTO]` desacuerdo correlacionado
    `[DECISIÓN]` `independencia_score ≥ umbral_independencia`? -> `[NO]` `[FAIL-CLOSED]` bloquear + marca "co-sesgo" + escalar -> `[SÍ]` celda promovible
    `[REGLA]` BR-2 · EC-3, EC-4 // Riesgo dominante: juez co-sesgado certifica error
  `[FIN 6B]`

**[Sub-proceso 6C — Promover (humano+evidencia+firma)]** `[INICIO]`
  `[PASO 6C.1]` Solicitar promoción
    `[ACTOR:HUMANO]` operador pide promover celda promovible · `[DATA-IN]` evidencia (golden+red-team+independencia)
    `[DECISIÓN]` precondiciones completas (`score∧n∧red_team∧independencia`)? -> `[NO]` botón deshabilitado + motivo -> `[SÍ]` abrir modal evidencia+firma
  `[PASO 6C.2]` Revisar y firmar
    `[ACTOR:HUMANO]` revisa evidencia + firma · `[CÓMPUTO]` registrar `firma_humana` + (anti-rubber-stamp) si no abrió evidencia -> evento a #11
    `[ACTOR:IA]` escribir `liberado_evals[celda]` al nuevo nivel · `[DATA-OUT]` -> NBA #2 (chip `min()`)
    `[AUTONOMÍA]` `min(pedido_NBA, liberado_evals, teto_tier)` · `[REGLA]` BR-1, BR-6, BR-8, BR-9 · `[FAIL-CLOSED]` sin firma -> no sube
  `[FIN 6C]`

**[Sub-proceso 6D — Rebaja automática (degrade)]** `[INICIO]`
  `[PASO 6D.1]` Vigilar drift
    `[ACTOR:IA]` corrida periódica recalcula score · `[DATA-IN]` golden set actual
    `[DECISIÓN]` `score < umbral_rebaja` **o** red-team empieza a fallar? -> `[SÍ]` **bajar `liberado_evals` sin firma** + notificar -> `[NO]` mantener
    `[REGLA]` BR-1 · EC-6, EC-7 · `[FAIL-CLOSED]` si no hay corrida reciente -> expirar a piso seguro
  `[FIN 6D]`

**[Sub-proceso 6E — Data-flywheel + fine-tuning]** `[INICIO]`
  `[PASO 6E.1]` Ingesta de candidatos
    `[ACTOR:IA]` recibir caso señalado desde Inbox #5 · `[DATA-IN]` caso resuelto (cohort×intent)
    `[DECISIÓN]` mismo tenant ∧ PII redactada ∧ texto-como-dato? -> `[NO]` `[FAIL-CLOSED]` rechazo + cuarentena -> `[SÍ]` candidato
    `[ACTOR:HUMANO]` curar candidato -> `[CÓMPUTO]` crear **nueva versión** de golden set (inmutable) · `[REGLA]` BR-3, BR-4, BR-5 · EC-5
  `[PASO 6E.2]` Fine-tuning (gancho)
    `[DECISIÓN]` `base_modelo` decidida? -> `[NO]` estado "pendiente de decisión" (no entrena, EC-8) -> `[SÍ]` `[ACTOR:IA]` entrenar sobre celdas calibradas · `[DATA-OUT]` artefacto versionado + `costo_decision`/`delta_margen` -> Pantalla 11
  `[FIN 6E]`

### Flujo (ASCII)
```
golden set -> [6A.1 puntuar] -> ⟨n≥n_min?⟩ -(no)-> [gris]
                                   |(sí)
                                   v
                              ⟨score≥umbral?⟩ -(no)-> [rojo]
                                   |(sí: verde-candidata)
                                   v
                       [6B.1 red-team] -> ⟨pass?⟩ -(no)-> [veto]
                                   |(sí)
                                   v
                  [6B.2 independencia] -> ⟨≥umbral?⟩ -(no)-> [co-sesgo: bloquear+escalar]
                                   |(sí: promovible)
                                   v
                    [6C.1 solicitar] -> ⟨precond?⟩ -(no)-> [botón off]
                                   |(sí)
                                   v
              [6C.2 revisar+firmar HUMANO] -> [escribir liberado_evals] -> NBA #2 (min())
                                   ^
   corrida periódica -> [6D.1] -> ⟨score<rebaja?⟩ -(sí)-> [bajar liberado_evals sin firma]
   Inbox #5 -> [6E.1 ingesta] -> ⟨tenant∧PII ok?⟩ -(no)-> [cuarentena]
                                   |(sí) -> [curar] -> nueva versión golden -> [6E.2 fine-tuning] -> #11
```

### DESPUÉS
`[DATA-OUT]` escribe `liberado_evals[cohort×intent]` en el almacén de Evals/Cerebro -> Alimenta a: **NBA/Playbooks #2** (chip `min()`), **Política & Trinca #10** (contexto de techo), **Salud del 1:10 #11** (costo/decisión, margen de fine-tuning, eventos anti-rubber-stamp). Matriz calibrada persiste como **dato propietario / moat** (§8.5). [V]

### MAPA DE SISTEMAS Y FLUJO DE DATOS
- `[SISTEMA 1]` **Almacén de Evals (golden set + red-team set)** · `[FUNCIÓN]` fuente versionada de evidencia · `[DATOS]` casos golden, casos red-team, scores, versiones · `[ACCESO]` IA (lectura/corrida), operador (lectura/curación) · `[GROUNDING]` sí (ancla a Cerebro #7)
    // Problema: stale/no-carga -> percentil de evidencia engaña -> `[FAIL-CLOSED]` -> Alimenta a: SISTEMA 2
- `[SISTEMA 2]` **Motor de calibración (score + red-team + independencia)** · `[FUNCIÓN]` decidir promovibilidad por celda · `[DATOS]` score, red_team_pass, independencia_score · `[ACCESO]` IA · `[GROUNDING]` sí
    // Problema: juez co-sesgado -> certifica error -> red-team + independencia -> Alimenta a: SISTEMA 3
- `[SISTEMA 3]` **Registro de autonomía (`liberado_evals`)** · `[FUNCIÓN]` techo del `min()` por celda, firmado · `[DATOS]` `liberado_evals[celda]`, firma_humana, versión · `[ACCESO]` operador (firma), IA (rebaja) · `[GROUNDING]` sí
    // Problema: sube por defecto -> BR-1 -> Alimenta a: NBA #2, Política #10
- `[SISTEMA 4]` **Pipeline flywheel + fine-tuning** · `[FUNCIÓN]` ingesta de candidatos Inbox + entrenamiento · `[DATOS]` candidatos, nuevas versiones golden, artefacto FT, costo/margen · `[ACCESO]` IA (ingesta/entreno), operador (curación, decisión de base) · `[GROUNDING]` sí
    // Problema: cross-tenant/PII/base no decidida -> cuarentena / pendiente -> Alimenta a: Pantalla 11

### PUNTOS DE DOLOR / RIESGOS (rankeados por impacto)
- `[RIESGO 1]` Juez co-sesgado certifica el error y se libera una celda mala. // Impacto: deflection-que-falla a escala automática (resta North Star). // Mitigación: red-team set + independencia juez↔humano más-allá-de-κ + veto fail-closed (BR-2). [V]
- `[RIESGO 2]` Autonomía sube por defecto o no baja con el drift. // Impacto: IA actúa de más sin evidencia. // Mitigación: promover=humano+firma, rebajar=automático, expiración por staleness (BR-1, EC-6/7). [V]
- `[RIESGO 3]` Fuga cross-tenant en golden set / flywheel. // Impacto: violación GDPR/contrato (Sony↔Warner). // Mitigación: hard-no, chequeo de tenant, una-sesión-un-tenant (BR-4). [V]
- `[RIESGO 4]` Rubber-stamp humano (firma sin revisar). // Impacto: la gobernanza humana se vuelve teatro. // Mitigación: registrar firma-sin-evidencia como evento de calibración a #11 (BR-9). [I]
- `[RIESGO 5]` Promover sobre n insuficiente (ruido). // Impacto: decisión de autonomía sobre azar. // Mitigación: n_min_eval, gris obligatorio (BR-7). [I]

**SÍNTESIS DE RIESGO:** el dominante es **el juez co-sesgado (RIESGO 1)** porque es el único que convierte la pantalla — diseñada para *frenar* — en un acelerador de error a escala; todo el sub-proceso 6B existe para neutralizarlo.

### MODELO DE VARIABLES (entidades + campos + relaciones)

**GOLDEN_SET_VERSION:**
- `version_id` : uuid · PK [V]
- `tenant_id` : uuid · FK -> TENANT [V]
- `created_at` : timestamp [V]
- `hash` : string · (inmutabilidad) [I]
- `parent_version_id` : uuid · FK -> GOLDEN_SET_VERSION (linaje) [I]

**GOLDEN_CASE:**
- `case_id` : uuid · PK [V]
- `version_id` : uuid · FK -> GOLDEN_SET_VERSION [V]
- `cohort_id` : uuid · FK -> COHORT (Pantalla 1) [V]
- `intent_id` : uuid · FK -> INTENT [V]
- `input` / `expected_output` : json [I]
- `source` : enum(seed, flywheel_inbox) · ref Inbox #5 [V]
- `pii_redactada` : bool [V]

**RED_TEAM_CASE:**
- `rt_case_id` : uuid · PK [V]
- `version_id` : uuid · FK -> GOLDEN_SET_VERSION [I]
- `cohort_id` / `intent_id` : uuid · FK [V]
- `adversarial_input` : json [V]

**EVAL_CELL** (la celda cohort×intent):
- `cell_id` : uuid · PK [V]
- `cohort_id` : uuid · FK -> COHORT [V]
- `intent_id` : uuid · FK -> INTENT [V]
- `version_golden_set` : uuid · FK -> GOLDEN_SET_VERSION [V]
- `score` : float [V]
- `n_golden` : int [I]
- `estado` : enum(verde, rojo, gris, stale) [V]
- `red_team_pass` : bool [V]
- `independencia_score` : float · (más allá de κ) [I]
- `juez_id` / `juez_version` : ref JUEZ [V]
- `fecha_ultima_corrida` : timestamp [V]

**AUTONOMY_RELEASE** (`liberado_evals` firmado):
- `release_id` : uuid · PK [V]
- `cell_id` : uuid · FK -> EVAL_CELL [V]
- `liberado_evals` : enum/int (nivel de autonomía) [V]
- `firma_humana` : uuid · FK -> USUARIO (null si rebaja automática) [V]
- `tipo` : enum(promocion, rebaja_automatica) [V]
- `evidencia_abierta` : bool · (anti-rubber-stamp, BR-9) [I]
- `created_at` : timestamp [V]

**FINETUNE_JOB:**
- `job_id` : uuid · PK [V]
- `version_golden_set` : uuid · FK -> GOLDEN_SET_VERSION [V]
- `base_modelo` : enum(propio, claude, null) · **open §11.10** [I]
- `estado` : enum(pendiente_decision, entrenando, listo) [I]
- `artefacto_version` : string [I]
- `costo_decision` / `delta_margen` : float · -> Pantalla 11 [V/I]

Relaciones:
- TENANT 1—N GOLDEN_SET_VERSION
- GOLDEN_SET_VERSION 1—N GOLDEN_CASE · 1—N RED_TEAM_CASE · 1—N EVAL_CELL
- COHORT 1—N EVAL_CELL · INTENT 1—N EVAL_CELL
- EVAL_CELL 1—N AUTONOMY_RELEASE (histórico de subidas/bajadas)
- GOLDEN_SET_VERSION 1—N FINETUNE_JOB
- GOLDEN_SET_VERSION 0/1—1 GOLDEN_SET_VERSION (parent → linaje versionado)

### Gobernanza / anchor-check
- `[AUTONOMÍA]` `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)` — esta pantalla **solo** produce `liberado_evals`, nunca el efectivo (BR-6). [V]
- **Hard-nos presentes:** cross-tenant prohibido (BR-4) · financial-never-autonomous (BR-8) · texto-en-screenshot=dato + PII redactada (BR-5) · promover=humano+evidencia / rebajar=automático (BR-1) · juez co-sesgado vetado (BR-2). [V]
- **Versionado:** golden set inmutable por versión (BR-3); toda promoción/corrida/FT cita versión. [V]
- **Anti-rubber-stamp:** firma sin evidencia -> evento a Pantalla 11 (BR-9). [I]
- **Variables escenario:** umbral_promoción / umbral_rebaja / n_min_eval / umbral_independencia / SLA de corrida (Z) = placeholders `[C]` — el valor está en el mecanismo, no en la cifra. [C]

---

## OPEN QUESTIONS (PT-BR) — para o operador resolver

1. `[I]` **(Dim 5/8 · promover)** Qual o **umbral_promoção** de score para uma célula virar verde, e qual o **umbral_rebaja** abaixo do qual ela é rebaixada automaticamente? São o mesmo número ou há histerese entre subir e descer?
2. `[I]` **(Dim 8 · n_min)** Qual o **n mínimo do golden set por célula** (`n_min_eval`) para que o score seja significativo e a célula possa ser verde? (paralelo ao n_min de cohort, §11.4)
3. `[I]` **(Dim 4/5 · red-team)** Como se mede a **independência juiz ↔ humano "além de κ"** exatamente — qual métrica e qual `umbral_independencia` bloqueia a promoção por co-viés?
4. `[I]` **(Dim 6/11 · fine-tuning)** **Sobre qual base** se faz o fine-tuning — modelo próprio vs Claude? (open §11.10) Sem isso o job fica "pendente de decisão".
5. `[I]` **(Dim 6 · consumo/SLA)** **Quem consome** `liberado_evals` e com que **SLA** a publicação precisa chegar ao NBA #2? (open §11.7) E com que frequência roda a corrida periódica de rebaixamento (Z)?
6. `[I]` **(Dim 11 · anti-rubber-stamp)** A assinatura de promoção exige um **gesto mínimo de revisão** (abrir a evidência, confirmar N casos) ou basta clicar "assinar"? Como definimos "evidência aberta" para BR-9?
7. `[I]` **(Dim 9 · staleness)** Qual o **T de validade** de uma versão do golden set antes de marcar a célula como `stale` e degradar a promovibilidade (EC-7)?
8. `[I]` **(Dim 3/4 · flywheel)** Todo caso da Inbox #5 entra como **candidato** ao golden set, ou só os marcados? Quem **cura** (qual papel) antes de criar nova versão, e qual o critério de aceite?
9. `[I]` **(Dim 8 · financeiro)** Quais **intents contam como "financeiros"** (BR-8) e portanto têm teto "propõe, não executa" mesmo com Evals verdes?
10. `[I]` **(Dim 7 · UI/provenance)** A matriz mostra **score numérico** nas células ou só cor (verde/vermelho/cinza)? E o selo `[V]/[I]/[C]` aparece por célula ou só no painel de detalhe?
