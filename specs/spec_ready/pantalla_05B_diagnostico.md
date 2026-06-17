# Pantalla 05 · Support (ÁREA) — Feature B: Diagnóstico (Orquestrador + Subagentes)
## Feature Breakdown

> **EMIT — grill COLABORATIVO con el operador (Leo) · 2026-06-16.** Companion estratégico: `specs/_design_B_office_hours.md` (APPROVED). **Support es un ÁREA**; ésta es la **Feature B** — 1 de: **A** atendimiento (emitido, `pantalla_05A`) · **B** diagnóstico (esta) · **C** generación de conocimiento (consume el dossier de B) · **D+E** dashboard.
> **Grounding pin:** `specs/00_vision_completa.md` **v1.2 · 2026-06-15**.
> **Provenance:** `[V]` vivido (Leo, esta sesión) · `[I]` inferido / doc-derivado / Leo-acordó-mi-reco · `[C]` placeholder de escenario.
> **Operador = IA `[V]`:** un **orquestador + subagentes MECE** (una acción c/u). El humano es **meta-capa**: revisa en lote, clarea la raíz, hace RLHF.
> **Invariantes (decididas con Leo):** B **NO cruza todo** — **type-first → issue-tree → Knowledge Base** (Occam; si no, alucina) · **fetch perezoso** dirigido por la hipótesis · **caza-silenciosos obligatoria** (el silencioso cuenta igual que el que reclamó) · **k-anon INTERNO = resuelve el caso específico** (no suprime 1 caso; no-dedurar solo cross-tenant) · cross-tenant + PII = hard-no · provenance **resultados-vs-hipótesis** · **monitor proactivo** de procesos críticos · **handoff #8 E2E completo** · **B no cierra el caso**.
> **Arquitectura:** orquestador + 9 subagentes (clasificador-tipo · issue-tree · enriquecedor-perezoso · caza-silenciosos · detector-patrón · knowledge-base · puntuador-impacto · ruteador+repositorio · monitor-proactivo). **ESPINA** (build ahora; demo thin sobre fixture de pagos): EPIC-B1..B6. **FILA** (ship con traba de calidad): EPIC-B7 (máquina de hipótesis completa + `/problem-solving`+`/sat` revisores) · EPIC-B8 (taxonomía completa de categorías).
> **Cuña/uau:** revelar el problema silencioso en **cascada AL REVÉS** (alguien → 47/35-silenciosos → R$ X); el monitor proactivo lo **pesca ANTES del ticket**.
> **Estado:** gate **11/11 · épicas MECE · ID-freeze PASS (cero dangling/colisión) · build-readiness cerrado** (ver `## CIERRE`).

---


## OUTPUT 1 — ÉPICAS, USER STORIES & RECORRIDO

### SÍNTESIS (governing thought)
**B existe para convertir la presión-del-cliente en inteligencia: halla el problema que el ticket esconde — los SILENCIOSOS y el PATRÓN — antes de que se vuelvan churn.** [V] En el motor (Cerebro→Cohorts→NBA→Autonomía→Evals→North Star), A produce el episodio (síntoma uno-a-uno, reactivo); B es el eslabón que **diagnostica cross-conversación**: clasifica el tipo, baja un issue-tree rankeado, hace fetch perezoso de la fuente-de-verdad del camino, cruza población×quién-reclamó para descubrir a quién nadie veía, mide el impacto en R$+churn y rutea+entrega un dossier completo a la próxima feature. [V] El operador es la IA; el humano es meta-capa (revisa en lote, corrige política/eval, hace RLHF). [V] **Lo que vuelve a B distinto de "una bandeja más rápida" es que no trata el síntoma — encuentra lo invisible y prueba su tamaño.** [V]

### PROBLEMA + OUTCOME
- **Problema (2 casos vividos, Leo):** (a) restaurantes **NO pagados silenciosos** — afectados que nunca abrieron ticket, solo aparecieron al mirar la base; (b) **fraude de reembolso por patrón** — disputa que se concentra en una zona/tipo/comida, imposible de cruzar en tiempo real mientras se atiende. La presión del cliente hoy se trata como costo a vaciar, no como señal. [V]
- **Outcome / North-Star:** prevención **atribuible** (pescar ANTES del ticket), costo-de-resolver-vs-valor-ganado registrado por caso (soporte = generador de valor, no costo). North Star del producto = valor_confirmado_atribuible / esfuerzo − deflection_que_falla; B alimenta el numerador (problema movido) sin cerrar el caso él mismo (BR-B18). [V]/[I]

### PLACEMENT
- B es **1 feature del área Support** (área, no pantalla): A=atendimiento (produce el episodio) · **B=diagnóstico (ESTA)** · C=generación-de-conocimiento (consume el dossier de B) · D+E=dashboard. [V]
- **CONSUME:** el episodio 3-capas de atendimiento (05A) · datos crudos cohort/percentil/concentración de la pantalla-de-grupos (01) · la red de fuentes-de-verdad (S1) bajo demanda · eval cohort×intent (P6) para la hipótesis IA-no-sabía. [I]
- **PRODUCE:** el **dossier #8** → próxima feature (C); comunicación proactiva → vía atendimiento; señal de impacto → KPIs (03). [I]
- **Edits cross-screen a aplicar (bilateral [I]):** a 05A — estampar `tenant_id`+`id_restaurante` DENTRO del episodio + declarar que A NO cubre silenciosos (es reactiva) → B requiere fuente de población externa. A 01 (Corte 1) — quitar la rotulación cruda `root_cause_heuristico` (F-3.4, US-3.1.2, BR-11 + derivadas): **B es el ÚNICO dueño de la clasificación**.
- **Siblings (A, C, D, E) NO se diseñan acá** — solo sus contratos.

---

### EPIC-B1 — Orquestación + gatilho + composición del dossier + hard-nos `ESPINA`
**Alcance:** decide CUÁNDO corre B (reactivo: episodio de A · proactivo: monitor de procesos críticos), prioriza (criticidad+impacto+lente-agile), coordina la secuencia B.1→B.8, COMPONE el dossier E2E (paso propio: dedup + resuelve conflicto patrón↔score, listo para la próxima feature, sin trabajo a medias) y aplica los hard-nos transversales (cross-tenant, k-anon interno, PII). **Cubre dims:** 1, 2, 5, 11.
**Spec WHAT | HOW:** WHAT = un coordinador que nunca deja trabajo a medias y nunca viola un hard-no. HOW = gatilho→prioridad→secuencia subagentes→compone DOSSIER_HANDOFF→aplica BR-B5/B6/B7 antes de emitir.

- **F-B1.1 — Gatilho reactivo (episodio de A) [I]**
  - **US-B1.1.1 | MoSCoW:Must | Hito:H1** — Como orquestador de B, quiero disparar un diagnóstico cuando llega un episodio de atendimiento (05A), para no perder ninguna señal de cliente. [V]
    - Given un episodio 3-capas con `tenant_id`+`id_restaurante` estampados, When entra al orquestador, Then se crea un `PROBLEMA_DIAGNOSTICADO{estado=abierto, primera_vez_ts}` y arranca B.1. [I]
    - (edge) Given un episodio SIN `tenant_id` o SIN `id_restaurante`, When entra, Then **fail-closed**: no diagnostica, marca `degrade-to-human` con motivo "episodio sin clave-de-tenant/restaurante" y notifica al humano de meta-capa. [I] (BR-B6)
- **F-B1.2 — Prioridad (criticidad+impacto+lente-agile) [V]**
  - **US-B1.2.1 | MoSCoW:Must | Hito:H1** — Como orquestador, quiero ordenar los problemas por criticidad + impacto-estimado + leverage-agile, para atacar primero lo grave y lo que destraba más. [V] (BR-B11)
    - Given un problema con criticidad=grave, When se prioriza, Then va a "ahora" (no a la fila). [V]
    - Given un problema no-grave, When se prioriza, Then se estima impacto→fila; si es chico pero destraba ≥1 problema grande, la lente-agile lo sube. [V]
    - (edge) Given empate de prioridad y recurso saturado, When se desempata, Then gana criticidad>impacto>agile en ese orden, fijo y auditable. [I]
- **F-B1.3 — Composición del dossier + dedup + hard-nos [V]/[I]**
  - **US-B1.3.1 | MoSCoW:Must | Hito:H1** — Como orquestador, quiero ensamblar el `DOSSIER_HANDOFF` (los 11 campos del #8) resolviendo el conflicto patrón↔score, para entregar completo y MECE a la próxima feature. [V] (BR-B17)
    - Given las salidas de B.2..B.7 completas, When compongo, Then dedup + reconcilio (el N de patrón de B.5 cuadra con el tamaño de impacto de B.7) y emito el dossier con provenance por campo. [V] (BR-B8)
    - (edge) Given que cualquier hard-no se gatilla (cross-tenant, PII no-redactada), When compongo, Then **fail-closed**: el dossier NO se emite, queda `estado=bloqueado` y se entera el humano de meta-capa. [I] (BR-B6, BR-B7)

---

### EPIC-B2 — Diagnóstico type-first (clasificar → issue-tree → fetch perezoso) `ESPINA`
**Alcance:** clasifica tipo/área → abre issue-tree rankeado por probabilidad, va por el más probable, backtrack si no resuelve → fetch perezoso dirigido por la hipótesis sobre la red de fuentes-de-verdad (S1). **NUNCA barre todas las fuentes** (Occam→anti-alucinación). **Cubre dims:** 3, 4, 5.
**Spec WHAT | HOW:** WHAT = foco donde está el problema, no cruzar-todo. HOW = clasificar-tipo (thin) → `ISSUE_TREE{paths rankeados}` → consulta SOLO la fuente del path activo → resultado(true/false/abierto) → backtrack PATH A→B.

- **F-B2.1 — Clasificar tipo/área (thin) [V]**
  - **US-B2.1.1 | MoSCoW:Must | Hito:H1** — Como motor de diagnóstico, quiero clasificar el tipo/área (finanzas/producto/performance…) ANTES de buscar, para no barrer todas las fuentes. [V] (BR-B1)
    - Given un problema abierto, When clasifico, Then escribo `tipo_area` en `PROBLEMA_DIAGNOSTICADO` con provenance. [V]
    - (edge) Given confianza de clasificación baja y sin caso en KB, When clasifico, Then **fail-closed**: `degrade-to-human`, no inventa tipo. [V]/[I] (BR-B3)
- **F-B2.2 — Issue-tree rankeado + backtrack [V]**
  - **US-B2.2.1 | MoSCoW:Must | Hito:H1** — Como motor, quiero abrir un `ISSUE_TREE` con caminos rankeados por probabilidad e ir por el más probable, para resolver con el mínimo de consultas. [V] (BR-B1)
    - Given un `tipo_area`, When abro el árbol, Then genero `paths:[{path_id, hipotese, probabilidad[C], resultado=abierto}]` ordenados por probabilidad. [V]
    - Given PATH A devuelve `false`, When backtrack, Then voy a PATH B (siguiente probabilidad) sin re-consultar lo ya buscado. [V]
    - (edge) Given todos los paths agotados sin `true`, When cierro el árbol, Then **fail-closed**: `degrade-to-human` con el árbol auditable adjunto. [I]
- **F-B2.3 — Fetch perezoso dirigido por hipótesis [V]**
  - **US-B2.3.1 | MoSCoW:Must | Hito:H1** — Como motor, quiero consultar SOLO la fuente del camino actual (finanzas→tabla de pagos), para proteger performance y no enriquecer todo. [V] (BR-B2)
    - Given PATH activo = finanzas, When hago fetch, Then consulto únicamente la fuente de pagos y escribo `fonte_consultada` + `resultado` en ese path. [V]
    - (edge) Given una fuente cara solicitada en bulk por-caso, When se intenta, Then **fail-closed**: se bloquea el bulk, se consulta dirigido o se degrada. [V] (BR-B2)

---

### EPIC-B3 — Caza-silenciosos + detector de patrón `ESPINA` ⭐
**Alcance:** triple-check (población × quién-reclamó → afectados que NO abrieron ticket); detector de patrón con corte de similaridad DIRIGIDO POR EL TIPO; k-anon **interno** = resuelve el caso (no suprime), cross-tenant = hard-no. **Cubre dims:** 3, 4, 8. **(motor del uau)**
**Spec WHAT | HOW:** WHAT = QUIÉN está afectado y callado + DÓNDE concentra. HOW = cruzar universo×reclamantes → `AFETADO{silencioso=true}`; sobre los afectados (no la población cruda) aplicar el corte del tipo → concentración con k-anon en el agrupamiento.

- **F-B3.1 — Caza-silenciosos (triple-check) [V] ⭐**
  - **US-B3.1.1 | MoSCoW:Must | Hito:H1** — Como caza-silenciosos, quiero cruzar la población entera contra quién reclamó, para encontrar a los afectados que nunca abrieron ticket — el silencioso cuenta igual. [V] (BR-B4)
    - Given la fuente de población + el conjunto de reclamantes, When cruzo, Then por cada afectado sin ticket escribo `AFETADO{reclamou=false, silencioso=true, evidencia}`. [V]
    - Given un afectado que sí reclamó, When cruzo, Then `AFETADO{reclamou=true, silencioso=false}`. [V]
    - (edge) Given la fuente de población vacía o stale, When cruzo, Then **fail-closed**: estado honesto "0 silenciosos / población no disponible", NUNCA número inventado. [V]/[C]
- **F-B3.2 — Detector de patrón (corte por tipo) [V]**
  - **US-B3.2.1 | MoSCoW:Must | Hito:H1** — Como detector de patrón, quiero usar el corte de similaridad RELEVANTE al tipo (finanzas→día/país de pago; producto→tipo de producto), para hallar dónde concentra sin un corte fijo. [V] (BR-B9)
    - Given el conjunto de `AFETADO` y el `tipo_area`, When agrupo, Then reporto `concentration{dim, valor, N}` usando el corte del tipo. [V]
    - (edge) Given un subgrupo con `N<k`, When agrupo, Then aplico **k-anon en el agrupamiento** (no expongo el subgrupo casi-unitario en la salida que cruza tenants), pero **internamente resuelvo el caso del restaurante específico** (no lo suprimo). [V] (BR-B5)
- **F-B3.3 — Frontera k-anon interno vs cross-tenant [V]/[I]**
  - **US-B3.3.1 | MoSCoW:Must | Hito:H1** — Como caza-silenciosos, quiero resolver el caso del restaurante individual aunque sea uno solo, para poder pagarle/corregirle (B es interno). [V] (BR-B5)
    - (edge) Given que la salida cruzaría a otro tenant (Sony→Warner), When emito, Then **fail-closed**: hard-no, no se filtra el dato entre tenants. [I] (BR-B6)

---

### EPIC-B4 — Knowledge Base + RL con guard anti-refuerzo `ESPINA` (KB thin) / `FILA` (RL completo)
**Alcance:** casos similares (anti-alucinación + grounding de hipótesis + promueve procesos críticos); RL que guarda el camino para acelerar PERO con revisión humana en lote + detección de divergencia. **Cubre dims:** 4, 6, 11.
**Spec WHAT | HOW:** WHAT = anclar lo nuevo en lo ya visto, no inventar raíz. HOW = `KNOWLEDGE_CASE{tipo_area, padrao, resolucao, probabilidad[C], caminho_usado, links}`; toda hipótesis se chequea contra KB; sin casos+baja confianza→degrade-to-human; el camino se guarda con guard.

- **F-B4.1 — Grounding en KB (anti-alucinación) [V]/[I]**
  - **US-B4.1.1 | MoSCoW:Must | Hito:H1** — Como Knowledge Base, quiero chequear toda hipótesis de raíz contra casos similares, para anclar el diagnóstico y no alucinar. [V] (BR-B3)
    - Given una hipótesis de raíz, When la chequeo, Then devuelvo casos similares con `probabilidad[C]` y cómo se resolvieron. [V]
    - (edge) Given sin casos similares + baja confianza, When chequeo, Then **fail-closed**: `degrade-to-human`, no se declara raíz. [V]/[I] (BR-B3)
- **F-B4.2 — Promoción de procesos críticos vía KB [V]**
  - **US-B4.2.1 | MoSCoW:Should | Hito:H2** — Como Knowledge Base, quiero promover un proceso a "crítico" cuando un tipo de alto impacto se repite, para que el monitor proactivo lo vigile. [V] (BR-B12)
    - Given el mismo `tipo_area` de alto impacto repitiéndose, When evalúo, Then creo/actualizo `PROCESSO_CRITICO{origem=kb_promovido}`. [V]
- **F-B4.3 — RL guard anti-refuerzo `FILA` [V]**
  - **US-B4.3.1 | MoSCoW:Should | Hito:H2 — outcome+constraints (needs-prototype)** — Como sistema de RL, quiero guardar el camino usado para acelerar futuros, SIN reforzar un camino equivocado. [V] (BR-B16)
    - **Outcome:** el camino acelera casos futuros del mismo tipo. **Constraints:** revisión humana en lote obligatoria + detección de divergencia → un camino marcado divergente NO se refuerza (anti confirmation-bias). [V]
    - (edge) Given divergencia detectada en un camino, When se cerraría el loop de RL, Then **fail-closed**: el refuerzo se suspende hasta revisión humana. [V]

---

### EPIC-B5 — Puntuador de impacto + priorización + libro-razón `ESPINA`
**Alcance:** impacto = f(restaurantes × órdenes-medias × días) → R$ perdido + churn-risk (double-check); riesgo×impacto×costo → ahora/fila; libro-razón costo-de-resolver vs valor-ganado. **Cubre dims:** 4, 5, 10.
**Spec WHAT | HOW:** WHAT = cuánto duele y cuánto cuesta arreglarlo. HOW = `IMPACTO{restaurantes_afetados, ordens_media, dias, rs_perdido, churn_risk, custo_resolver, valor_ganho}` con double-check antes de declarar.

- **F-B5.1 — Puntuador de impacto (R$+churn, double-check) [V]**
  - **US-B5.1.1 | MoSCoW:Must | Hito:H1** — Como puntuador, quiero calcular R$ perdido + churn-risk desde restaurantes×órdenes-medias×días, para dimensionar el problema antes de rutear. [V] (BR-B10)
    - Given el conjunto de afectados + órdenes-medias + días, When calculo, Then escribo `IMPACTO{rs_perdido, churn_risk}` con double-check explícito. [V]
    - (edge) Given que el double-check no reconcilia con el N de patrón (B.5), When declaro, Then **fail-closed**: no emito el número, marca conflicto, vuelve al orquestador (B1.3). [V]/[I]
- **F-B5.2 — Priorización riesgo×impacto×costo [V]**
  - **US-B5.2.1 | MoSCoW:Must | Hito:H1** — Como puntuador, quiero decidir ahora-vs-fila por riesgo×impacto×costo, para que lo grave salte la fila. [V] (BR-B11)
    - Given `rs_perdido`+`churn_risk`+`custo_resolver`, When priorizo, Then emito la decisión ahora/fila con su justificación. [V]
- **F-B5.3 — Libro-razón de impacto [V]**
  - **US-B5.3.1 | MoSCoW:Should | Hito:H2** — Como libro-razón, quiero registrar costo-de-resolver vs satisfacción/recurrencia ganada por caso, para probar que soporte es generador de valor, no costo. [V] (BR-B14)
    - Given un caso resuelto, When lo registro, Then escribo `custo_resolver` y `valor_ganho` en `IMPACTO` (alimenta el 1:10). [V]

---

### EPIC-B6 — Ruteador + repositorio + handoff #8 + comunicación proactiva `ESPINA`
**Alcance:** elige 1 de 5 caminos (demo=regla FIJA stub) + escribe el caso replicable en el repositorio + emite el handoff #8 + decide comunicación proactiva (política configurable). **Cubre dims:** 5, 6.
**Spec WHAT | HOW:** WHAT = entregar completo y dejar el caso replicable. HOW = `CASO_REPO` (replicable) + `DOSSIER_HANDOFF` (11 campos) + decisión avisar-vs-corregir-callado (política).

- **F-B6.1 — Ruteador 5-caminos (stub fijo en demo) [V]**
  - **US-B6.1.1 | MoSCoW:Must | Hito:H1** — Como ruteador, quiero elegir 1 de 5 caminos (actuar-rápido · entregar-al-team-dueño · prototipo+testar-hipótesis · corregir-interno · monitorear-con-gatilho), para que el problema vaya a su destino correcto. [V]
    - Given un `PROBLEMA_DIAGNOSTICADO` con impacto, When ruteo, Then escribo `ruta_sugerida(1 de 5)`. En la demo la selección es **regla FIJA (stub)**; las 5 reglas completas = fila. [V]
    - (edge) Given ninguna regla aplica, When ruteo, Then **fail-closed**: default a `entregar-completo-al-team-dueño` con flag de revisión humana. [I]
- **F-B6.2 — Repositorio (caso replicable) [V]**
  - **US-B6.2.1 | MoSCoW:Must | Hito:H1** — Como repositorio, quiero guardar {cliente, día, frecuencia/veces-actuó, screenshots, programas-levantados, links-replicables}, para que un caso inconstante se vuelva replicable. [V] (BR-B15)
    - Given un caso ruteado, When lo guardo, Then escribo/actualizo `CASO_REPO` y, si ya existía, incremento `frecuencia` + actualizo `ultima_vez_ts` en `PROBLEMA_DIAGNOSTICADO`. [V]
- **F-B6.3 — Handoff #8 (dossier completo) [V]**
  - **US-B6.3.1 | MoSCoW:Must | Hito:H1** — Como ruteador, quiero emitir el `DOSSIER_HANDOFF` con los 11 campos (tipo/raíz+prob · evidencia · QUIÉN+IDs · dónde-concentra · cuánto · cuántas-veces/desde-cuándo · casos-similares · hipótesis-auditable · ruta-sugerida · datos-crudos-ya-buscados · provenance), para que la próxima feature no re-consulte ni reciba trabajo a medias. [V] (BR-B17, BR-B18)
    - Given un caso completo, When emito, Then la próxima feature (C) recibe el dossier E2E; B no cierra el caso (el cierre/confirmación de valor lo da el loop downstream). [V]/[I]
    - (edge) Given un campo del #8 vacío, When emito, Then **fail-closed**: no se emite incompleto; vuelve al orquestador. [I] (BR-B17)
- **F-B6.4 — Comunicación proactiva (política configurable) [V]**
  - **US-B6.4.1 | MoSCoW:Should | Hito:H2** — Como ruteador, quiero decidir si comunico al cliente según política (avisar=transparencia vs corregir-callado=no-alarmar), para no exponer internals ni alarmar de más. [V] (BR-B13)
    - Given la política del tenant=avisar, When resuelvo proactivamente, Then notifico al cliente vía atendimiento (05A) sin exponer internals. [V]
    - (edge) Given la política=corregir-callado, When resuelvo, Then corrijo sin notificar y registro la decisión en el libro-razón. [V]

---

### EPIC-B7 — Máquina de hipótesis completa `FILA` [I] (needs-prototype)
**Alcance:** genera/testa hipótesis true/false; `/problem-solving` + `/sat` como **REVISORES adversariales** (juez≠proponente); "lo correcto/erróneo = resultados vs hipótesis". **Cubre dims:** 4, 11.
**Spec WHAT | HOW:** WHAT = hipótesis auditables, revisadas por un juez independiente (anti-rubber-stamp). HOW = generador propone → revisores adversariales challengean → veredicto true/false grabado con provenance.

- **F-B7.1 — Generación/testeo true/false [I]**
  - **US-B7.1.1 | MoSCoW:Could | Hito:H3 — outcome+constraints** — Como máquina de hipótesis, quiero generar y testar hipótesis con veredicto true/false auditable, para que la señal nunca se vuelva "hecho" downstream. [I] (BR-B8, BR-B19)
    - **Outcome:** cada hipótesis lleva veredicto + provenance [V]/[I]/[C]; resultados-vs-hipótesis grabados. **Constraints:** el revisor (`/problem-solving`+`/sat`) es ADVERSARIAL e independiente del proponente; backtracking multi-path. [V]
    - (edge) Given revisor y proponente coinciden por co-sesgo, When se certifica, Then **fail-closed**: se exige independencia juez↔proponente; si no hay, degrade-to-human. [V] (BR-B19)

---

### EPIC-B8 — Clasificador de categorías completo `FILA` [I] (needs-prototype)
**Alcance:** taxonomía MECE de categorías (bug-feature · política · proceso-inexistente/quebrado · mau-uso · fraude · injection/seguridad · IA-no-sabía · falta-feature). **Cubre dims:** 4.
**Spec WHAT | HOW:** WHAT = la lista cerrada y MECE de tipos de problema, dueña única de la clasificación (Corte 1 vs pantalla 01). HOW = clasificador completo que reemplaza al thin de B2; uno o varios rótulos por problema = open question a afinar.

- **F-B8.1 — Taxonomía MECE de categorías [I]**
  - **US-B8.1.1 | MoSCoW:Could | Hito:H3 — outcome+constraints** — Como clasificador completo, quiero asignar la categoría MECE del problema, para que el ruteo y el grounding partan de un tipo confiable. [I]
    - **Outcome:** todo problema cae en exactamente una categoría de la lista (o multi-rótulo si se decide), sin solape. **Constraints:** B es el ÚNICO dueño de la clasificación; la pantalla 01 solo aporta dato crudo + link (no rotula). [I]
    - (edge) Given un problema que no cae en ninguna categoría, When clasifico, Then **fail-closed**: categoría "no-clasificable" → degrade-to-human, no se fuerza un rótulo. [I]

---

### Recorrido

#### (A) Caso REACTIVO — llega un problema (no-pago)
1. **Llega el episodio.** Recibo de atendimiento (05A) un episodio 3-capas con `tenant_id`+`id_restaurante` estampados: un restaurante reclama que no le cayó el pago. Disparo el diagnóstico y creo el `PROBLEMA_DIAGNOSTICADO` (EPIC-B1, B.1). *Loading:* "Diagnosticando… abriendo el caso." Si el episodio viene sin clave-de-tenant, no diagnostico — degrade-to-human (fail-closed).
2. **Clasifico el tipo, no cruzo todo.** Clasifico `tipo_area=finanzas` ANTES de buscar (EPIC-B2, B.2). No barro todas las fuentes — Occam, si no alucino.
3. **Bajo el issue-tree.** Abro el `ISSUE_TREE`, rankeo los caminos por probabilidad y voy por PATH A = "el pago no se ejecutó" (EPIC-B2, B.3).
4. **Fetch perezoso.** Consulto SOLO la tabla de pagos del camino activo: ¿pagó? No (EPIC-B2, B.4). Si PATH A no resolviera, backtrack a PATH B sin re-consultar.
5. **Triple-check / cazo silenciosos.** ¿Este restaurante abrió ticket? Sí, reclamó. Pero cruzo la población entera × quién-reclamó (EPIC-B3, B.5): aparecen **otros afectados que NUNCA hablaron** — los silenciosos. El silencioso cuenta igual (BR-B4). *Empty:* si la base de población está stale, digo "0 silenciosos / población no disponible" — nunca invento.
6. **Anclo en el Knowledge Base.** Chequeo la hipótesis de raíz contra casos similares (EPIC-B4, B.6): ya vimos este patrón, así se resolvió, esta es la probabilidad. Sin casos + baja confianza → degrade-to-human.
7. **Detecto el patrón.** Sobre los afectados (no la población cruda) aplico el corte del tipo finanzas → día/país de pago: el no-pago **concentra** en un corte (EPIC-B3, B.5). Aplico k-anon en el agrupamiento de la salida que cruza tenants, pero internamente resuelvo el caso del restaurante específico (BR-B5).
8. **Mido el impacto.** restaurantes × órdenes-medias × días → **R$ parado + churn-risk**, con double-check (EPIC-B5, B.7). Si el número no reconcilia con el N del patrón, fail-closed: vuelve al orquestador.
9. **Priorizo.** riesgo×impacto×costo → si es grave, ahora; si no, fila; lente-agile si destraba más (EPIC-B1/B5).
10. **Ruteo + guardo + handoff.** Elijo 1 de 5 caminos (demo=stub fijo), guardo el `CASO_REPO` replicable, registro costo-vs-valor en el libro-razón y emito el `DOSSIER_HANDOFF` #8 a la próxima feature (EPIC-B6, B.8). Yo no cierro el caso — el cierre lo da el loop downstream. *Error:* si un campo del #8 está vacío, no emito incompleto.

#### (B) Caso PROACTIVO — el monitor pesca el no-pago ANTES del ticket (la cascada del uau)
1. **Vigilo sin esperar el ticket.** El monitor de procesos críticos vigila "pagos" — entró al registro porque puntúa alto en impacto-si-falla × falla-en-silencio × fuente-medible (EPIC-B1, B.1; BR-B12). Corre por schedule.
2. **Alguien.** El monitor pesca **1 restaurante que está por irse y NUNCA abrió un ticket** — el B lo vio antes que el churn (EPIC-B3, B.5). *Este es el golpe de la cascada, contado al revés.*
3. **Tamaño.** Zoom-out: no está solo — hay **47 afectados, 35 jamás hablaron** (cruce población×reclamantes, EPIC-B3). Los números reconcilian con un único fixture de escenario `[C]`.
4. **Impacto.** **R$ X parados** en pagos que nadie veía (EPIC-B5, B.7) — el libro-razón registra costo-de-resolver vs valor-ganado.
5. **Resuelvo + decido comunicar.** Corrijo proactivamente y decido según política: avisar (transparencia) o corregir-callado (no-alarmar), sin exponer internals (EPIC-B6, B.8; BR-B13).
6. **El uau:** "lo pescamos ANTES del ticket" — la presión del cliente se volvió inteligencia, no costo. *Loading:* "Monitoreando procesos críticos…". *Empty:* "Nada que reportar — todos los procesos en verde."

#### Estados (transversales)
- **Loading:** "Diagnosticando…" / "Monitoreando procesos críticos…" / "Cazando silenciosos…" — siempre con el paso B.x visible.
- **Empty:** "0 silenciosos / población no disponible" · "Nada que reportar — procesos en verde" — estado honesto, jamás número inventado.
- **Error / fail-closed:** episodio sin clave → degrade-to-human · hard-no gatillado (cross-tenant/PII) → dossier bloqueado · double-check no reconcilia → conflicto al orquestador · campo #8 vacío → no se emite incompleto. En todos: se entera el humano de meta-capa.


## OUTPUT 2 — BUSINESS RULES + EDGE CASES + FAILURE HANDLING

**SÍNTESIS — el modo de fallo que más amenaza el North Star.** El North Star = valor_confirmado_atribuible / esfuerzo − deflection_que_falla. B vive entre dos abismos simétricos y ambos lo destruyen por igual: **(1) ALUCINA un problema falso** — porque cruza-todo (viola BR-B1), porque el RL refuerza un camino equivocado por confirmation-bias (viola BR-B16), o porque toma una correlación/estacionalidad como raíz (viola BR-B3/BR-B8); el downstream actúa sobre RUIDO, gasta esfuerzo en algo inexistente, y el numerador no sube mientras el denominador sí → North Star cae. **(2) MISSA al silencioso** — el caza-silenciosos no corre o corre con el corte equivocado (viola BR-B4/BR-B9); B reporta "47 afectados" cuando eran 82, el dossier subdimensiona impacto (viola BR-B10), el ruteador desprioriza un problema grave (viola BR-B11) y el North Star sangra por CEGUERA: churn que nunca se atribuyó. Entre los dos, **la alucinación es la amenaza primaria** porque es activa (induce acción dañina + envenena el KB + se auto-refuerza por RL), mientras la ceguera es pasiva (pierde valor pero no daña lo existente). El diseño es **fail-closed hacia degrade-to-human**: ante baja confianza, falta de grounding en KB, o detección que no se puede verificar, B NO inventa raíz, NO rutea autónomo, NO refuerza el camino — escala al humano-meta-capa. Los hard-nos (BR-B6 cross-tenant, BR-B7 PII) son innegociables y cortan ANTES que cualquier diagnóstico; la provenance (BR-B8) impide que una señal [C]/[I] se disfrace de hecho [V] aguas abajo; el guard RL (BR-B16) impide que un acierto-aparente se vuelva dogma.

---

### A. Business Rules

**BR-B1 | [type-first/occam] | hard-no:no | versionada:no**
- **Regla:** B clasifica el tipo/área ANTES de buscar; abre un issue-tree rankeado por probabilidad y recorre el camino MÁS probable primero; NUNCA barre todas las fuentes-de-verdad en un solo caso.
- **Por qué:** cruzar-todo es el primer generador de alucinaciones (Occam) y de muerte por performance; sin foco de tipo, el motor encuentra correlaciones espurias en cualquier tabla.
- **Disparador/Alcance:** todo diagnóstico nuevo (B.2→B.3); aplica antes de cualquier fetch (B.4).
- **SI SE VIOLA/FALLA → fail-closed:** si no se logra clasificar tipo con confianza mínima → NO se abre fetch amplio; se marca `tipo_area=indeterminado` y degrade-to-human. Se entera: orquestador (B.1) + humano-meta-capa en revisión-en-lote.

**BR-B2 | [fetch-perezoso] | hard-no:no | versionada:no**
- **Regla:** el enriquecedor consulta SOLO la fuente del camino-de-hipótesis actual; las fuentes caras nunca se piden en bulk por caso.
- **Por qué:** performance y costo; el fetch dirigido por hipótesis es lo que hace a B escalable y evita el barrido que aluciná.
- **Disparador/Alcance:** B.4, cada vez que un path del issue-tree exige evidencia.
- **SI SE VIOLA/FALLA → fail-closed:** si la fuente del camino no responde / excede presupuesto de consulta → el path se marca `resultado=abierto`, NO se sustituye por un barrido; backtrack a siguiente path (BR-B1) o degrade-to-human. Se entera: S1 (telemetría de fuentes) + orquestador.

**BR-B3 | [grounding-kb/anti-alucinación] | hard-no:no | versionada:sí**
- **Regla:** toda hipótesis de raíz se chequea contra casos similares del Knowledge Base; si NO hay casos análogos Y la confianza es baja → degrade-to-human, B no declara raíz.
- **Por qué:** el grounding en historia real es el ancla anti-alucinación; sin él, B inventa una raíz plausible-pero-falsa.
- **Disparador/Alcance:** B.6, antes de fijar `raiz_hipotese` en PROBLEMA_DIAGNOSTICADO.
- **SI SE VIOLA/FALLA → fail-closed:** sin grounding + baja confianza → `estado=degrade_humano`, `confianza[C]` explícita, raíz NO se propaga al dossier #8. Se entera: humano-meta-capa (cola de degrade) + KB (caso marcado como "sin precedente, candidato a aprender").

**BR-B4 | [caza-silenciosos/triple-check] ⭐ | hard-no:no | versionada:no**
- **Regla:** obligatorio cruzar población × quién-reclamó para hallar afectados que NO abrieron ticket; el silencioso cuenta IGUAL que el reclamante.
- **Por qué:** los silenciosos son la cuña/uau de B y la mayor fuente de churn invisible; A es reactiva y por definición NO los ve.
- **Disparador/Alcance:** B.5, en todo problema con población-base medible.
- **SI SE VIOLA/FALLA → fail-closed:** si la fuente de población no existe/no se puede cruzar → el problema se reporta con flag `silenciosos=no_evaluable` (NO se asume cero) + degrade-to-human para decidir si se rutea con cobertura parcial. Se entera: orquestador + dossier (campo QUIÉN marca incompletitud).

**BR-B5 | [k-anon-interno] | hard-no:no | versionada:sí**
- **Regla:** B es INTERNO → resuelve el caso del restaurante específico y NO suprime un caso por ser único; el freno de no-dedurar aplica SOLO a salida que cruza tenants.
- **Por qué:** suprimir 1 caso internamente rompería el caza-silenciosos (un silencioso suele ser n=1); la k-anon solo protege exposición cross-tenant.
- **Disparador/Alcance:** todo el pipeline interno de B; el freno se activa únicamente en frontera de salida cross-tenant (ver BR-B6).
- **SI SE VIOLA/FALLA → fail-closed:** si un componente intenta suprimir un caso interno por low-k → se ignora la supresión interna PERO se verifica que la frontera de salida sigue cumpliendo BR-B6. Se entera: auditoría de privacidad.

**BR-B6 | [cross-tenant] | hard-no:sí | versionada:sí**
- **Regla:** ningún dato/insight/patrón cruza de un tenant a otro (Sony≠Warner); todo el cruce de B ocurre DENTRO de un único tenant.
- **Por qué:** hard-no absoluto del producto; un patrón filtrado entre tenants es brecha contractual y legal.
- **Disparador/Alcance:** toda consulta de fuentes (B.4), todo detector de patrón (B.5), KB (B.6), repositorio y handoff (B.8).
- **SI SE VIOLA/FALLA → fail-closed (HARD):** cualquier consulta o agregación que toque >1 tenant_id se BLOQUEA y aborta el caso; nada se escribe ni se rutea. Se entera: seguridad + humano-meta-capa con incidente de alta severidad.

**BR-B7 | [pii-redactada] | hard-no:sí | versionada:sí**
- **Regla:** PII redactada en enriquecimiento (B.4), en detección de silenciosos (B.5) y en el repositorio/handoff (B.8); IDs se manejan como referencias, no como datos personales expuestos.
- **Por qué:** hard-no de privacidad; el caza-silenciosos toca población real y es el punto de mayor riesgo de fuga de PII.
- **Disparador/Alcance:** todo punto donde B lee/escribe datos de afectados o produce el dossier.
- **SI SE VIOLA/FALLA → fail-closed (HARD):** si se detecta PII sin redactar en un campo de salida → el campo se bloquea/redacta y el handoff #8 no se emite hasta sanear. Se entera: seguridad + auditoría de privacidad.

**BR-B8 | [provenance/resultados-vs-hipótesis] | hard-no:no | versionada:sí**
- **Regla:** cada hipótesis y cada campo cargan provenance [V]/[I]/[C]; una señal nunca se convierte en "hecho" aguas abajo; lo correcto/erróneo se mide como resultados-vs-hipótesis, no por afirmación.
- **Por qué:** sin provenance, una conjetura [C] se disfraza de evidencia y contamina el dossier, el KB y el RL.
- **Disparador/Alcance:** todo campo de PROBLEMA_DIAGNOSTICADO, ISSUE_TREE, IMPACTO, DOSSIER_HANDOFF.
- **SI SE VIOLA/FALLA → fail-closed:** campo sin provenance → tratado como [C] (no confiable), NO usado para ruteo autónomo ni para refuerzo RL. Se entera: el dossier muestra el gap; humano-meta-capa en revisión.

**BR-B9 | [corte-por-tipo] | hard-no:no | versionada:sí**
- **Regla:** el detector de patrón usa el corte de similaridad RELEVANTE AL TIPO (finanzas→día/país de pago; producto→tipo de producto; performance→ventana temporal), nunca un corte fijo.
- **Por qué:** un corte fijo inventa patrones falsos en una dimensión irrelevante o pierde el patrón real; el tipo determina el eje correcto.
- **Disparador/Alcance:** B.5, al agrupar afectados para buscar concentración.
- **SI SE VIOLA/FALLA → fail-closed:** si no hay corte definido para el tipo → NO se declara patrón (solo se reportan afectados individuales) + degrade-to-human para definir corte. Se entera: KB (candidato a aprender corte) + humano.

**BR-B10 | [impacto-medible/double-check] | hard-no:no | versionada:sí**
- **Regla:** impacto = f(restaurantes × órdenes-medias × días) → R$ perdido + churn-risk, con double-check antes de declarar la cifra.
- **Por qué:** un impacto sin verificar prioriza mal (BR-B11) y rompe la atribución del North Star.
- **Disparador/Alcance:** B.7, antes de escribir IMPACTO y de priorizar.
- **SI SE VIOLA/FALLA → fail-closed:** si el double-check diverge >umbral o falta un factor (p.ej. silenciosos no_evaluable) → la cifra se marca `[C] rango`, NO un punto; ruteo no la trata como confirmada. Se entera: dossier (campo cuánto con banda de incertidumbre) + humano.

**BR-B11 | [priorización] | hard-no:no | versionada:sí**
- **Regla:** prioriza por criticidad + impacto-estimado + lente agile (grave→ahora; si no, estima impacto→fila; problema chico que destraba 3 grandes→prioriza).
- **Por qué:** sin esta regla, B trata todo igual y satura la fila o ignora lo crítico.
- **Disparador/Alcance:** B.1 (al entrar) y B.7 (tras impacto).
- **SI SE VIOLA/FALLA → fail-closed:** si criticidad o impacto son indeterminados → se asume prioridad CONSERVADORA (no se desprioriza algo potencialmente grave) + se marca para revisión. Se entera: orquestador + humano.

**BR-B12 | [monitor-proactivo] | hard-no:no | versionada:sí**
- **Regla:** B vigila un registro de procesos críticos; un proceso entra si cumple impacto-alto × falla-en-silencio × fuente-medible (pagos, desconexión abrupta, cobranza incorrecta); pesca el problema ANTES del ticket.
- **Por qué:** los problemas más caros fallan en silencio; esperar al ticket es esperar al churn.
- **Disparador/Alcance:** B.1 (rama proactiva), según `schedule` de PROCESSO_CRITICO.
- **SI SE VIOLA/FALLA → fail-closed:** si la fuente-de-verdad del monitor cae o el schedule no corre → el proceso se marca `monitoreo_degradado` y NO se asume "todo bien" (ausencia de señal ≠ ausencia de problema). Se entera: orquestador + humano (riesgo de ceguera).

**BR-B13 | [comunicación-proactiva] | hard-no:no | versionada:sí**
- **Regla:** comunicar al cliente es una POLÍTICA configurable: avisar (transparencia) vs corregir-callado (no-alarmar); B nunca expone internals en ninguna de las dos.
- **Por qué:** comunicar de más alarma al cliente y daña confianza; comunicar de menos rompe transparencia; la decisión es de política, no del modelo.
- **Disparador/Alcance:** B.8, cuando un caso proactivo se resuelve y toca al cliente.
- **SI SE VIOLA/FALLA → fail-closed:** sin política explícita para el caso → DEFAULT = no comunicar + escalar la decisión al humano; nunca comunicar por defecto. Se entera: humano-meta-capa (owner de política).

**BR-B14 | [libro-razón] | hard-no:no | versionada:sí**
- **Regla:** cada caso resuelto registra costo-de-resolver vs satisfacción/recurrencia ganada en el libro-razón de impacto.
- **Por qué:** sin libro-razón no se puede saber si resolver valió la pena ni alimentar la priorización futura.
- **Disparador/Alcance:** B.8, al cerrar el ruteo de un caso.
- **SI SE VIOLA/FALLA → fail-closed:** si faltan costo o valor → el registro queda `incompleto` y NO se usa como evidencia de ROI hasta completarse. Se entera: humano (KPIs).

**BR-B15 | [caso-replicable] | hard-no:no | versionada:no**
- **Regla:** el repositorio guarda {cliente, día, frecuencia/veces-actuó, screenshots, programas-levantados} + links a casos iguales, convirtiendo lo inconstante en replicable.
- **Por qué:** un diagnóstico que no se guarda replicable se re-trabaja desde cero cada vez.
- **Disparador/Alcance:** B.8, al persistir CASO_REPO.
- **SI SE VIOLA/FALLA → fail-closed:** si no se puede armar el caso replicable (faltan artefactos) → se guarda parcial con flag y NO se promueve a KB como patrón confirmado. Se entera: KB + humano.

**BR-B16 | [rl-guard/anti-refuerzo] | hard-no:no | versionada:sí**
- **Regla:** el camino usado se guarda para acelerar futuros, PERO la revisión humana en lote + la detección de divergencia impiden reforzar un camino equivocado.
- **Por qué:** sin guard, el RL refuerza por confirmation-bias y un acierto-aparente se vuelve dogma que aluciná sistemáticamente.
- **Disparador/Alcance:** B.6, cada vez que un camino se considera para refuerzo.
- **SI SE VIOLA/FALLA → fail-closed:** si la divergencia (resultado real vs hipótesis) supera umbral, o si falta confirmación downstream → el camino NO se refuerza (peso congelado) y entra a cola de revisión humana. Se entera: humano-meta-capa (RLHF en lote).

**BR-B17 | [handoff-e2e] | hard-no:no | versionada:sí**
- **Regla:** B entrega el dossier #8 COMPLETO (los 11 campos); nunca pasa trabajo a medias; MECE con la próxima feature, sin duplicar proceso.
- **Por qué:** un handoff parcial obliga a la feature siguiente a re-diagnosticar y rompe el principio E2E.
- **Disparador/Alcance:** B.8, frontera de salida hacia la próxima feature.
- **SI SE VIOLA/FALLA → fail-closed:** si falta cualquiera de los 11 campos (o un campo viene sin provenance) → el dossier NO se emite como "completo"; se emite como `parcial` con los gaps explícitos + degrade-to-human. Se entera: feature downstream (recibe el flag) + humano.

**BR-B18 | [b-no-cierra] | hard-no:no | versionada:no**
- **Regla:** B diagnostica y rutea, pero NO cierra el caso; la confirmación de valor (confirmado + permanente + atribuible) la otorga el loop downstream, no B.
- **Por qué:** si B se auto-acreditara el cierre, el North Star contaría valor no confirmado (alucinación de impacto).
- **Disparador/Alcance:** B.8 y todo cómputo de "B acertó".
- **SI SE VIOLA/FALLA → fail-closed:** si algún componente marca un caso como "valor confirmado" sin señal downstream → la marca se revierte a `pendiente_confirmación` y NO alimenta el RL ni el North Star. Se entera: loop downstream + humano.

**BR-B19 | [hipótesis-revisadas-indep] | hard-no:no | versionada:sí**
- **Regla (fila):** la máquina de hipótesis usa /problem-solving + /sat como REVISORES adversariales independientes (el juez ≠ el proponente), anti-rubber-stamp.
- **Por qué:** si el mismo agente propone y aprueba, el RL se auto-confirma; la independencia del revisor es lo que rompe el confirmation-bias en origen.
- **Disparador/Alcance:** EPIC-B7 (fila), generación/testeo de hipótesis true/false.
- **SI SE VIOLA/FALLA → fail-closed:** si el revisor comparte estado/contexto con el proponente (rubber-stamp detectable) → la aprobación se invalida y la hipótesis queda `no_revisada` → no se rutea autónoma. Se entera: humano-meta-capa.

---

### B. Edge Cases

**EC-B1 | dim:3 | [patrón-falso/correlación] — Patrón espurio por correlación≠causa.**
- **Caso:** B agrupa afectados y "ve" concentración en una dimensión que en realidad es solo correlación (ambos suben juntos sin causa común).
- **Detección:** el corte por tipo (BR-B9) produce concentración pero el grounding KB (BR-B3) no halla mecanismo causal análogo; confianza baja.
- **Comportamiento (fail-closed):** NO se declara patrón; se reporta como "señal correlacional sin raíz confirmada" + degrade-to-human.
- **Regla(s):** BR-B3, BR-B8, BR-B9.
- **SI LA DETECCIÓN FALLA →** el dossier marca raíz como `[C] hipótesis no validada`; el ruteador exige confirmación downstream antes de actuar (BR-B18) y el RL no refuerza (BR-B16).

**EC-B2 | dim:3 | [patrón-falso/estacionalidad] — Estacionalidad confundida con problema.**
- **Caso:** un pico (p.ej. caída de pagos un feriado) se lee como falla cuando es estacional/esperado.
- **Detección:** el corte temporal por tipo (BR-B9) + KB con casos estacionales previos marca el período como recurrente-esperado.
- **Comportamiento (fail-closed):** se suprime la alerta como "variación estacional conocida"; no genera PROBLEMA nuevo.
- **Regla(s):** BR-B9, BR-B3.
- **SI LA DETECCIÓN FALLA →** se crea el problema pero con `confianza[C] baja` y flag estacional-posible; impacto se reporta como rango (BR-B10), no punto; humano valida en lote.

**EC-B3 | dim:8 | [missa-silencioso/sin-fuente] — No hay fuente de población para cruzar.**
- **Caso:** el tenant no expone base de población → el caza-silenciosos no puede correr.
- **Detección:** B.5 detecta ausencia de fuente-de-población cruzable (BR-B4).
- **Comportamiento (fail-closed):** `silenciosos=no_evaluable` (NO cero); el dossier declara cobertura parcial; impacto subdimensionado se marca explícito.
- **Regla(s):** BR-B4, BR-B10, BR-B17.
- **SI LA DETECCIÓN FALLA →** B asumiría cero silenciosos → ceguera; mitigación: el puntuador de impacto exige el campo silenciosos y bloquea "completo" sin él (BR-B17).

**EC-B4 | dim:8 | [missa-silencioso/corte-malo] — Corte equivocado oculta silenciosos.**
- **Caso:** se usa un corte que no es el del tipo → los silenciosos quedan fuera del grupo y no se detectan.
- **Detección:** validación de que el corte aplicado = corte-de-tipo esperado (BR-B9); discrepancia detectable.
- **Comportamiento (fail-closed):** se re-corre el caza-silenciosos con el corte correcto; si no hay corte de tipo → degrade-to-human (BR-B9).
- **Regla(s):** BR-B9, BR-B4.
- **SI LA DETECCIÓN FALLA →** conteo de afectados queda bajo; el double-check de impacto (BR-B10) compara contra población esperada y dispara revisión por divergencia.

**EC-B5 | dim:8 | [cross-tenant/cruce] — Cruce de patrón roza dos tenants.**
- **Caso:** un detector de patrón intenta agregar afectados de >1 tenant_id (p.ej. join mal acotado).
- **Detección:** guard de frontera cuenta tenant_id distintos en cualquier agregación (BR-B6).
- **Comportamiento (fail-closed, HARD):** se ABORTA la agregación y el caso; nada se escribe ni rutea; incidente de seguridad.
- **Regla(s):** BR-B6 (hard-no), BR-B5.
- **SI LA DETECCIÓN FALLA →** brecha contractual; mitigación defensa-en-profundidad: toda consulta lleva tenant_id obligatorio en el predicado (no opcional), y el handoff revalida tenant único antes de emitir.

**EC-B6 | dim:8 | [pii/enriquecimiento] — PII sin redactar en enriquecimiento o silenciosos.**
- **Caso:** el fetch (B.4) o el caza-silenciosos (B.5) traen campos con PII cruda.
- **Detección:** scanner de PII en la frontera de cada lectura/escritura (BR-B7).
- **Comportamiento (fail-closed, HARD):** el campo se redacta/bloquea; el dossier no se emite hasta sanear.
- **Regla(s):** BR-B7 (hard-no).
- **SI LA DETECCIÓN FALLA →** fuga de PII; mitigación: repositorio (BR-B15) y handoff (BR-B17) re-escanean en escritura; auditoría de privacidad muestrea en lote.

**EC-B7 | dim:11 | [rl-confirmation-bias] — RL refuerza un camino equivocado.**
- **Caso:** un camino "aciertó" en apariencia (caso pareció resolverse) pero la raíz era falsa; el RL lo refuerza.
- **Detección:** divergencia resultado-real vs hipótesis (BR-B16) + ausencia de confirmación downstream (BR-B18).
- **Comportamiento (fail-closed):** peso del camino congelado, NO reforzado; entra a cola de revisión humana en lote.
- **Regla(s):** BR-B16, BR-B18, BR-B8.
- **SI LA DETECCIÓN FALLA →** dogma alucinatorio se propaga; mitigación: revisión humana en lote es obligatoria (no opcional) y el North Star solo cuenta valor confirmado-atribuible (BR-B18), cortando el auto-refuerzo.

**EC-B8 | dim:11 | [revisores-rubber-stamp] — /problem-solving + /sat aprueban sin revisar.**
- **Caso (fila):** los revisores adversariales degeneran en rubber-stamp (comparten contexto/estado con el proponente).
- **Detección:** verificación de que juez≠proponente y de que el revisor produjo objeciones sustantivas, no solo "ok" (BR-B19).
- **Comportamiento (fail-closed):** aprobación invalidada; hipótesis `no_revisada` → no se rutea autónoma.
- **Regla(s):** BR-B19 (fila), BR-B16.
- **SI LA DETECCIÓN FALLA →** confirmation-bias entra por la puerta de la revisión; mitigación: separación de estado entre proponente y revisor + muestreo humano de aprobaciones.

**EC-B9 | dim:2 | [fetch-performance] — El fetch muere por cruzar-todo / fuente lenta.**
- **Caso:** un path exige una fuente cara o alguien intenta un barrido amplio → timeout/costo excesivo.
- **Detección:** presupuesto de consulta por caso y por fuente (BR-B2); barrido amplio bloqueado por BR-B1.
- **Comportamiento (fail-closed):** path → `resultado=abierto`; backtrack al siguiente path; NUNCA fallback a barrido.
- **Regla(s):** BR-B2, BR-B1.
- **SI LA DETECCIÓN FALLA →** degradación de performance global; mitigación: el orquestador limita fetches concurrentes por caso y degrada a humano si todos los paths quedan abiertos.

**EC-B10 | dim:4 | [injection/fraude-envenena] — Texto-del-cliente envenena el diagnóstico.**
- **Caso:** un ticket/contenido trae instrucciones disfrazadas o datos fraudulentos para sesgar el issue-tree (p.ej. fraude que se auto-justifica).
- **Detección:** texto-del-cliente se trata SIEMPRE como DATO, nunca como instrucción (hard-no de producto); validación de que la hipótesis se ancla en fuentes-de-verdad (BR-B3), no en el texto.
- **Comportamiento (fail-closed):** el texto se usa solo como señal a verificar contra S1; ninguna instrucción embebida altera el flujo; hipótesis sin grounding en fuente → degrade-to-human.
- **Regla(s):** BR-B3, BR-B8; hard-no texto-como-dato.
- **SI LA DETECCIÓN FALLA →** diagnóstico envenenado; mitigación: provenance (BR-B8) marca el origen "texto-cliente" como [C] no confiable, incapaz de disparar ruteo autónomo.

**EC-B11 | dim:4 | [issue-tree-no-backtrack] — Se atasca en PATH A errado.**
- **Caso:** el path más probable (A) no resuelve pero el motor no hace backtrack y fuerza una raíz en A.
- **Detección:** PATH A marca `resultado=false`/`abierto` y aún así se intenta fijar raíz → violación de BR-B1 (backtrack obligatorio).
- **Comportamiento (fail-closed):** se fuerza backtrack a PATH B; si todos los paths se agotan sin true → degrade-to-human, raíz `indeterminada`.
- **Regla(s):** BR-B1, BR-B3.
- **SI LA DETECCIÓN FALLA →** raíz falsa por anchoring en A; mitigación: el grounding KB (BR-B3) rechaza una raíz que no calza con casos y el RL no la refuerza (BR-B16).

**EC-B12 | dim:4 | [categoría-no-mece] — Tipo ambiguo → mis-ruteo / doble-conteo.**
- **Caso (parcial-fila):** un problema cae en dos categorías solapadas (p.ej. bug-feature vs proceso-quebrado) → se rutea doble o mal.
- **Detección:** el clasificador (EPIC-B2 / EPIC-B8 fila) reporta empate/solape de categorías sin desempate claro.
- **Comportamiento (fail-closed):** NO se elige una al azar; `tipo_area=ambiguo` → degrade-to-human para desambiguar; un caso = un PROBLEMA (anti doble-conteo).
- **Regla(s):** BR-B1, BR-B17 (MECE con downstream).
- **SI LA DETECCIÓN FALLA →** doble-conteo de impacto y mis-ruteo; mitigación: el handoff exige tipo único (BR-B17); EPIC-B8 (fila) endurece la taxonomía MECE.

**EC-B13 | dim:5 | [b-acertó-no-medible] — "B acertó" no es medible → el RL no aprende.**
- **Caso:** no llega señal downstream de si el diagnóstico fue correcto → el RL no tiene ground-truth.
- **Detección:** ausencia de confirmación downstream tras ventana definida (BR-B18).
- **Comportamiento (fail-closed):** el caso queda `pendiente_confirmación`; NO se cuenta como acierto ni alimenta el refuerzo (peso neutro).
- **Regla(s):** BR-B18, BR-B16.
- **SI LA DETECCIÓN FALLA →** el RL aprende de ruido (acierto asumido); mitigación: solo valor confirmado-atribuible refuerza (BR-B18) y la revisión en lote audita la cola de pendientes.

**EC-B14 | dim:5 | [monitor-comunica-de-más] — Proactivo alarma al cliente.**
- **Caso:** el monitor resuelve y comunica al cliente algo que no requería aviso → alarma innecesaria.
- **Detección:** falta de política explícita "avisar" para el caso, o comunicación que excede lo que la política permite (BR-B13).
- **Comportamiento (fail-closed):** DEFAULT = no comunicar + escalar la decisión a humano; nunca comunicar por defecto.
- **Regla(s):** BR-B13.
- **SI LA DETECCIÓN FALLA →** daño de confianza con el cliente; mitigación: toda comunicación proactiva pasa por owner de política; B nunca expone internals (BR-B13).

**EC-B15 | dim:10 | [impacto-sin-double-check] — Cifra de impacto declarada sin verificar.**
- **Caso:** se reporta R$/churn como punto firme sin double-check, o falta un factor (p.ej. silenciosos no_evaluable).
- **Detección:** el double-check de BR-B10 no corrió o divergió >umbral; o el campo silenciosos vino incompleto (EC-B3).
- **Comportamiento (fail-closed):** la cifra se reporta como `[C] rango`, no punto; la priorización (BR-B11) no la trata como confirmada.
- **Regla(s):** BR-B10, BR-B11, BR-B4.
- **SI LA DETECCIÓN FALLA →** mis-priorización por impacto inflado/desinflado; mitigación: el dossier (BR-B17) exige banda de incertidumbre y el humano valida las cifras altas en lote.

**EC-B16 | dim:11 | [monitor-ciego/ausencia-señal] — Fuente del monitor cae → ceguera silenciosa.**
- **Caso:** la fuente-de-verdad de un proceso crítico no responde / el schedule no corre → no llegan señales y B "no ve" problemas.
- **Detección:** heartbeat de fuente + verificación de ejecución del schedule (BR-B12).
- **Comportamiento (fail-closed):** proceso marcado `monitoreo_degradado`; ausencia de señal NO se interpreta como "todo bien".
- **Regla(s):** BR-B12.
- **SI LA DETECCIÓN FALLA →** churn invisible por ceguera del monitor; mitigación: el orquestador alerta al humano ante gap de heartbeat y prioriza re-conectar la fuente (BR-B11 conservador).

---

### C. Matriz de fallo (ordenada por amenaza al North Star, desc.)

| # | Modo de fallo | EC | BR que protegen | Hard-no | Fail-closed | Quién se entera |
|---|---|---|---|---|---|---|
| 1 | **Cross-tenant** (dato/patrón cruza tenants) | EC-B5 | BR-B6, BR-B5 | **SÍ** | Aborta caso, nada se escribe | Seguridad + humano (incidente alto) |
| 2 | **PII sin redactar** (enriquecimiento/silenciosos) | EC-B6 | BR-B7, BR-B15, BR-B17 | **SÍ** | Bloquea/redacta campo, no emite handoff | Seguridad + auditoría privacidad |
| 3 | **RL refuerza camino equivocado** (confirmation-bias) | EC-B7, EC-B8 | BR-B16, BR-B18, BR-B19, BR-B8 | no | Congela peso, cola revisión humana | Humano-meta-capa (RLHF lote) |
| 4 | **Injection/fraude envenena diagnóstico** | EC-B10 | BR-B3, BR-B8 (texto=dato) | no | Texto solo como señal a verificar; no rutea | Seguridad + humano |
| 5 | **Patrón falso** (correlación≠causa / estacionalidad) | EC-B1, EC-B2 | BR-B3, BR-B9, BR-B8 | no | No declara patrón; degrade-to-human | KB + humano (lote) |
| 6 | **Missa al silencioso** (sin fuente / corte malo) | EC-B3, EC-B4 | BR-B4, BR-B9, BR-B10 | no | `no_evaluable` (≠cero); cobertura parcial | Orquestador + humano |
| 7 | **Issue-tree no backtrack** (anchoring en PATH A) | EC-B11 | BR-B1, BR-B3 | no | Fuerza backtrack; raíz indeterminada | Humano (degrade) |
| 8 | **Categoría no-MECE** (mis-ruteo / doble-conteo) | EC-B12 | BR-B1, BR-B17 | no | `tipo_area=ambiguo` → desambigua humano | Downstream + humano |
| 9 | **Impacto sin double-check** | EC-B15 | BR-B10, BR-B11, BR-B4 | no | Cifra como rango [C], no punto | Dossier + humano |
| 10 | **"B acertó" no medible** (RL sin ground-truth) | EC-B13 | BR-B18, BR-B16 | no | `pendiente_confirmación`; peso neutro | Downstream + humano |
| 11 | **Monitor ciego** (fuente cae → ausencia de señal) | EC-B16 | BR-B12, BR-B11 | no | `monitoreo_degradado` (≠"todo bien") | Orquestador + humano |
| 12 | **Fetch muere por performance** (cruzar-todo / fuente lenta) | EC-B9 | BR-B2, BR-B1 | no | Path abierto + backtrack; nunca barrido | S1 + orquestador |
| 13 | **Monitor comunica de más** (alarma al cliente) | EC-B14 | BR-B13 | no | DEFAULT no comunicar + escala a humano | Humano (owner política) |

**Lectura de la matriz:** los dos hard-nos (1, 2) encabezan porque su violación es catastrófica e irreversible (legal/contractual), por encima incluso del daño al North Star. Le siguen los fallos que **inducen acción dañina o auto-refuerzo** (3–8: alucinación activa) por encima de los que **pierden valor sin dañar lo existente** (9–13: ceguera/ineficiencia pasiva). Todo el sistema colapsa hacia **degrade-to-human** como estado seguro: ante hard-no se aborta; ante incertidumbre se marca [C] y no se rutea autónomo ni se refuerza; ante ausencia de señal NO se asume "todo bien". El humano-meta-capa cierra el loop en lote (RLHF, política, eval), nunca caso-a-caso.


## OUTPUT 3 — WORKFLOW

**SÍNTESIS (el "y qué"):** un episodio de atendimiento (A) o un scan del monitor proactivo dispara a B; B **clasifica el tipo/área** ANTES de buscar (BR-B1, EPIC-B2), abre un **issue-tree rankeado por probabilidad** y va por el camino más probable con backtrack (B.3), hace **fetch perezoso** consultando SOLO la fuente de ese camino (BR-B2, B.4), corre la **caza-silenciosos + detector de patrón** dirigido por el tipo (BR-B4/BR-B9, EPIC-B3), **fundamenta la raíz contra la Knowledge Base** (BR-B3, EPIC-B4), **puntúa impacto** restaurantes×órdenes×días→R$+churn con double-check (BR-B10, EPIC-B5) y **rutea + arma el dossier #8** hacia la próxima feature (BR-B17, EPIC-B6). NUNCA cruza-todo (Occam, anti-alucinación); es **type-first**; ante baja confianza sin casos similares → **degrade-a-humano** (BR-B3). El operador es la IA; el humano es meta-capa (revisión en lote, clarear raíz). [V]/[I]

**Formato:** [TIPO]=nodo · ->=flujo · //=nota · provenance por línea ([V]/[I]/[C]).

### Contrato
- **Entrada:** episodio de atendimiento (05A, 3-capas {transcripción · estructurada · métricas}) con tenant_id + id_restaurante estampados [I] · O scan del monitor de procesos críticos (PROCESSO_CRITICO) [V]. [I]
- **Salida:** DOSSIER_HANDOFF #8 (11 campos) + ruta sugerida (1 de 5) + CASO_REPO (caso replicable) + libro-razón de impacto (costo-resolver vs valor-ganado). [V]
- **Actores:** [ACTOR:IA] orquestador (EPIC-B1) + subagentes MECE (B.2..B.8) — diagnostica, cruza, puntúa, rutea · [ACTOR:HUMANO] revisión en lote + clarear/confirmar raíz + mejora política/eval (RLHF), nunca operador de línea. [V]
- **Frontera:** B **diagnostica y rutea, NO cierra** (BR-B18) — el cierre/confirmación de valor (confirmado+permanente+atribuible) lo otorga el loop downstream, no B. B vive DENTRO del tenant (BR-B6); su cruce es intra-tenant. [I]

### ANTES (triggers + precondiciones)
- [TRIGGER] **Episodio nuevo de atendimiento** (reactivo) -> B.1 // A produce el episodio que B consume; A es reactiva → NO cubre silenciosos, por eso B requiere fuente de población [I]
- [TRIGGER] **Scan del monitor de procesos críticos** (proactivo) -> B.1 // PROCESSO_CRITICO entra si impacto-alto × falla-silenciosa × fuente-medible (pagos/desconexión/cobranza); pesca ANTES del ticket [V] BR-B12
- [TRIGGER] **Criticidad/volumen** (prioridad) -> B.1 // grave→ahora; si no, estima impacto→fila; lente agile (chico que destraba grandes→prioriza) [V] BR-B11
- [GROUNDING] **Knowledge Base** (KNOWLEDGE_CASE) disponible // casos similares + grounding de hipótesis (anti-alucinación) [V]/[I] BR-B3
- [GROUNDING] **Red de fuentes-de-verdad (S1)** alcanzable bajo demanda // pagos · campañas · product-logs · tickets — consultadas SOLO en B.4, nunca en bulk [V] BR-B2
- [GROUNDING] **Eval cohort×intent (P6)** alcanzable // para la hipótesis "IA-no-sabía" [I]
- [REGLA BR-B1] **type-first** // clasifica el tipo ANTES de buscar; issue-tree rankeado; va por el más probable; NUNCA barre todas las fuentes (Occam→anti-alucinación) [V]
- [REGLA BR-B6] **tenant aislado** // hard-no: ningún dato/insight cruza tenant (Sony≠Warner); el cruce de B es DENTRO del tenant [I]
- [FAIL-CLOSED] sin tenant_id/id_restaurante en la entrada O fuente de población ausente -> NO arranca diagnóstico; degrade-a-humano + se entera el orquestador // sin población no hay caza-silenciosos confiable [I] //Riesgo [hard-no]



### DURANTE (sub-procesos nombrados)

> Cada sub-proceso = mini-flujo `[INICIO]…[FIN]`. Mapeo a épicas: B.1→EPIC-B1 · B.2/B.3/B.4→EPIC-B2 · B.5→EPIC-B3 · B.6→EPIC-B4 · B.7→EPIC-B5 · B.8→EPIC-B6. (La máquina de hipótesis completa EPIC-B7 y la taxonomía EPIC-B8 = fila; aquí corren en versión thin.)



[Sub-proceso B.1 — Gatilho + prioridad]

[INICIO]
-> [TRIGGER] dos vías de entrada al orquestador (S3) // el orquestador decide CUÁNDO corre, no la fuente

-> [DECISIÓN] ¿origen del gatilho? -> [SÍ:reactivo] B.1.1 / [SÍ:proactivo] B.1.2

[PASO B.1.1 — Ingesta reactiva (episodio de A)]
[ACTOR:IA]
[DATA-IN episodio 3-capas {transcripción · estructurada(intent,causa_hipotesis+confianza,cohort+percentil,nba_usada,resultado,policy_version,provenance) · métricas} · de Atendimiento(05A)=S2] [V]
[DATA-IN tenant_id + id_restaurante estampados DENTRO del episodio · de S2 (EDIT bilateral a 05A)] [I]
[CÓMPUTO] valida que el episodio trae tenant_id + id_restaurante; normaliza a un disparo-candidato {origen=reactivo, tenant_id, id_restaurante, señal_inicial}
[DATA-OUT disparo-candidato · a B.1.3] [I]
[DECISIÓN] ¿episodio sin tenant_id o sin id_restaurante? -> [SÍ] [FAIL-CLOSED] rechaza el episodio, NO corre B, devuelve a 05A con motivo "falta scope-de-tenant"; se entera el orquestador(S3) + cola de A //Riesgo: cross-tenant si corriéramos sin tenant_id [BR-B6 hard-no] [seguridad] -> [NO] continúa
[REGLA BR-B6] cross-tenant hard-no: el disparo SIEMPRE queda anclado a un único tenant_id
[REGLA BR-B7] PII redactada antes de enriquecer //Riesgo: PII cruda en pipeline [seguridad]

[PASO B.1.2 — Monitor proactivo de procesos críticos]
[ACTOR:IA]
[DATA-IN registro PROCESSO_CRITICO{processo_id, nome, score_impacto, falha_silenciosa, fonte_verdade_ref, origem(politica|kb_promovido), schedule} · de S3] [V]
[DATA-IN promociones desde Knowledge Base · de S6 (origem=kb_promovido)] [I]
[CÓMPUTO] al disparar el schedule, evalúa criterio-de-admisión del proceso: impacto-alto × falla-en-silencio × fuente-medible (ej. pagos · desconexión abrupta · cobranza incorrecta)
[DATA-OUT disparo-candidato {origen=proactivo, tenant_id, processo_id, fonte_verdade_ref} · a B.1.3] [V]
[DECISIÓN] ¿el proceso cumple impacto-alto × falla_silenciosa × fonte_verdade_ref medible? -> [SÍ] emite disparo-candidato (pesca ANTES del ticket) -> [NO] no dispara este ciclo, espera próximo schedule
[REGLA BR-B12] monitor proactivo: solo entran al registro procesos con impacto-alto × falla-silenciosa × fuente-medible //Riesgo: vigilar todo = costo+ruido [V]
[DECISIÓN] (edge) ¿fonte_verdade_ref no resuelve / fuente caída? -> [SÍ] [FAIL-CLOSED] marca el proceso "no-medible-ahora", NO levanta caso falso, alerta al orquestador(S3) para revisión //Riesgo: falso-negativo silencioso por fuente muerta [V] -> [NO] continúa

[PASO B.1.3 — De-duplicación + anclaje a problema]
[ACTOR:IA]
[DATA-IN disparo-candidato (de B.1.1 ó B.1.2) · de S3] [I]
[CÓMPUTO] busca PROBLEMA_DIAGNOSTICADO abierto con mismo tenant_id + tipo_area/processo_id; si existe -> incrementa frecuencia + actualiza ultima_vez_ts; si no -> crea PROBLEMA_DIAGNOSTICADO{problema_id, tenant_id, estado=nuevo, primera_vez_ts, ultima_vez_ts, frecuencia=1, provenance_por_campo}
[DATA-OUT problema_id (nuevo o reabierto) · a B.1.4] [I]
[DECISIÓN] ¿ya existe problema abierto que matchea? -> [SÍ] consolida (no duplica caso) -> [NO] crea nuevo
[REGLA BR-B5] k-anon INTERNO: B resuelve el caso del restaurante específico; NO se suprime 1 caso aquí //el freno no-dedurar es solo salida cross-tenant [V]
[REGLA BR-B8] provenance por campo: cada campo del problema nace con [V]/[I]/[C]; la señal inicial NO se vuelve "hecho"

[PASO B.1.4 — Puntuación de prioridad (criticidad + impacto + agile)]
[ACTOR:IA]
[DATA-IN problema_id + señal_inicial (criticidad del episodio / score_impacto del proceso) · de B.1.3] [I]
[DATA-IN estimación-impacto temprana (restaurantes×órdenes-medias×días, si disponible) · de S7 placeholder] [C]
[CÓMPUTO] prioridad = f(criticidad, impacto_estimado, lente_agile): (a) si criticidad=grave -> AHORA; (b) si no -> estima impacto -> FILA ordenada por R$+churn-risk; (c) lente agile: problema chico que destraba 3 grandes -> sube prioridad
[DATA-OUT prioridad {ahora | fila(rank)} + provenance · a B.1.5] [V]
[DECISIÓN] ¿criticidad=grave? -> [SÍ] marca AHORA (salta la fila) -> [NO] calcula rank de FILA
[DECISIÓN] ¿problema chico que destraba 3 grandes (lente agile)? -> [SÍ] eleva rank -> [NO] mantiene rank por impacto
[REGLA BR-B11] priorización criticidad+impacto+agile: grave->ahora; si no, impacto->fila; agile destraba-grandes->prioriza [V]
[REGLA BR-B10] impacto medible con double-check antes de declarar (la estimación temprana es [C], se confirma en B.7) //Riesgo: priorizar por impacto inventado [V]
[DECISIÓN] (edge) ¿sin criticidad y sin impacto estimable? -> [SÍ] [FAIL-CLOSED] no asume grave ni descarta; encola en FILA con rank-mínimo + flag "impacto-pendiente", se entera el orquestador(S3) //Riesgo: cola ciega [I]

[PASO B.1.5 — Decisión de despacho (el orquestador decide CUÁNDO corre)]
[ACTOR:IA]
[DATA-IN problema_id + prioridad{ahora|fila(rank)} · de B.1.4] [I]
[CÓMPUTO] el orquestador(S3) decide despacho: AHORA -> entrega ya al motor de diagnóstico; FILA -> retiene hasta que la ventana de capacidad/criticidad lo habilite
[DATA-OUT problema_id + prioridad + origen(reactivo|proactivo) -> al Motor de diagnóstico (B.2 / S4)] [I]
[DECISIÓN] ¿prioridad=ahora? -> [SÍ] despacha a B.2 inmediatamente -> [NO] retiene en FILA, despacha cuando habilite capacidad
[REGLA BR-B6] al despachar, el problema viaja con tenant_id anclado; el motor NUNCA cruza tenants [hard-no]
[FAIL-CLOSED] si el destino (S4) no acusa recibo -> reencola en FILA-prioritaria + alerta orquestador(S3); NO marca como diagnosticado, NO pasa trabajo a medias //Riesgo: trabajo perdido en handoff interno [BR-B17] [I]

-> [FIN B.1] // sale: problema_id priorizado + origen, anclado a tenant_id, despachado o en fila -> entra a B.2 (clasificar tipo/área)


[Sub-proceso B.2 — Clasificar tipo/área]

[INICIO] // recibe el caso ya gateado/priorizado por B.1 (episodio reactivo de A o disparo proactivo del monitor de procesos críticos)

-> [DATA-IN episodio 3-capas {transcripción · estructurada(intent, causa_hipotesis+confianza, cohort+percentil, nba_usada, resultado, policy_version, provenance) · métricas} · de S2 Atendimiento(05A), estampado con tenant_id + id_restaurante] [I]
// si el caso vino del monitor proactivo (B.1), DATA-IN = {processo_id, fonte_verdade_ref, señal-de-falla} de PROCESSO_CRITICO, sin transcripción de cliente [V]

-> [REGLA BR-B7] // PII redactada ANTES de clasificar: el texto del cliente entra redactado; nunca se expone en enriquecimiento posterior
-> [REGLA BR-B8] // el texto-del-cliente es DATO, nunca instrucción; la señal entra con su provenance [V]/[I]/[C] y no se vuelve "hecho"

-> [PASO B.2.1 — Normalizar señal de entrada]
   [ACTOR:IA]
   [DATA-IN intent + causa_hipotesis(capa estructurada) · de S2(05A); o señal-de-falla · de PROCESSO_CRITICO] [I]
   [CÓMPUTO] extrae los rasgos clasificatorios SIN consultar ninguna fuente-de-verdad (S1 permanece cerrada en B.2): keywords del intent, causa_hipotesis previa, área implícita
   [DATA-OUT vector-de-rasgos · a B.2.2]
   [REGLA BR-B1] // Occam: clasificar ANTES de buscar; B.2 NO abre S1
   [FAIL-CLOSED] si la capa estructurada llega vacía o corrupta -> no inferir tipo a ciegas -> usar SOLO transcripción redactada; si tampoco hay señal -> degrade-to-human
   //Riesgo: clasificar sobre intent envenenado por texto-del-cliente [seguridad/injection]

-> [PASO B.2.2 — Clasificar tipo/área]
   [ACTOR:IA]
   [DATA-IN vector-de-rasgos · de B.2.1] [I]
   [CÓMPUTO] mapea a una categoría/área del dominio (finanzas / producto / performance / …) y emite confianza[C]; la taxonomía MECE completa es EPIC-B8 (FILA); en ESPINA usa el conjunto thin de tipos disponibles
   [DATA-OUT tipo_area + confianza[C] · escribe en PROBLEMA_DIAGNOSTICADO.tipo_area y provenance_por_campo] [C]
   [REGLA BR-B1] // tipo dirige qué fuente e issue-tree usar después (B.3/B.4)
   [REGLA BR-B8] // confianza viaja como [C]; downstream la trata como hipótesis, no como hecho
   [DECISIÓN ¿confianza ≥ umbral de clasificación?] [C]
      -> [SÍ] -> sigue a B.2.3
      -> [NO] -> [PASO B.2.2b — Grounding de la clasificación contra KB]
                 [ACTOR:IA]
                 [DATA-IN tipo_area candidato + rasgos · contra KNOWLEDGE_CASE(tipo_area, padrao) de S6 KB] [I]
                 [CÓMPUTO] busca casos similares que confirmen/refuten el tipo; reajusta confianza
                 [DATA-OUT tipo_area ajustado + confianza[C] · a la decisión de salida]
                 [REGLA BR-B3] // sin casos + baja confianza -> NO inventar tipo
                 [DECISIÓN ¿KB confirma un tipo con confianza ≥ umbral?]
                    -> [SÍ] -> sigue a B.2.3
                    -> [NO] -> [FAIL-CLOSED degrade-to-human] // no clasifica a ciegas; se entera el revisor humano (meta-capa, revisión en lote) + se marca el caso como tipo_area=indeterminado en PROBLEMA_DIAGNOSTICADO
   [FAIL-CLOSED] si el clasificador devuelve >1 tipo de alta confianza (ambigüedad MECE rota) -> NO elegir arbitrario -> degrade-to-human con ambos candidatos
   //Riesgo: tipo errado dispara el árbol e issue-tree equivocados aguas abajo (B.3) [anti-alucinación]

-> [PASO B.2.3 — Sellar tipo + ruta de fuente para B.3/B.4]
   [ACTOR:IA]
   [DATA-IN tipo_area + confianza[C] · de B.2.2] [C]
   [CÓMPUTO] resuelve, a partir del tipo_area, CUÁL nodo de S1 (Red de fuentes-de-verdad) será candidato del primer camino del issue-tree (ej.: finanzas -> tabla de pagos) — SIN consultarlo todavía; declara el corte de similaridad relevante al tipo para B.3
   [DATA-OUT {tipo_area, confianza[C], fonte_verdade candidata, corte_por_tipo} · a B.3 (issue-tree) y registrado en PROBLEMA_DIAGNOSTICADO.provenance_por_campo] [C]
   [REGLA BR-B2] // fetch perezoso: B.2.3 SOLO marca la fuente del camino; NO la abre ni la barre en bulk
   [REGLA BR-B9] // el corte de similaridad lo fija el tipo (finanzas->día/país de pago; producto->tipo de producto), no fijo
   [FAIL-CLOSED] si el tipo no resuelve ninguna fuente candidata (gap de mapeo tipo->fuente) -> NO abrir S1 al azar -> degrade-to-human

-> [FIN B.2] // entrega tipo_area sellado + fuente candidata + corte_por_tipo; el issue-tree rankeado y el fetch dirigido ocurren en B.3/B.4


[Sub-proceso B.3 — Issue-tree]

[INICIO] // entra el resultado de B.2: tipo_area clasificado del PROBLEMA_DIAGNOSTICADO

-> [TRIGGER] B.2 entregó tipo_area + confianza[C] del PROBLEMA_DIAGNOSTICADO // dispara construcción del árbol

-> [PASO B.3.1] Construir issue-tree del tipo_area
   [ACTOR:IA]
   [DATA-IN] tipo_area · de PROBLEMA_DIAGNOSTICADO (output B.2) [V]
   [DATA-IN] padrón + caminho_usado de casos similares · de KNOWLEDGE_CASE (S6, lazy ref, no fetch caro aún) [I]
   [CÓMPUTO] genera ISSUE_TREE{tree_id, problema_id} con paths:[{path_id, hipotese, probabilidad[C], fonte_consultada=null, resultado=abierto}] acotados AL tipo_area (Occam: NO ramifica fuera del tipo)
   [DATA-OUT] ISSUE_TREE con N paths en estado resultado=abierto · a S4 (motor de diagnóstico) [I]
   [DECISIÓN] ¿se generó ≥1 path con hipotese?
      -> [SÍ] continúa B.3.2
      -> [NO] [FAIL-CLOSED] sin paths → no inventar raíz → degrade-to-human; marca PROBLEMA_DIAGNOSTICADO.estado=needs_human, provenance_por_campo=[C]
   [REGLA BR-B1] type-first/no-cross-everything: el árbol se abre SOLO dentro del tipo, nunca barre todas las fuentes
   [REGLA BR-B3] grounding en KB: las hipótesis se anclan en KNOWLEDGE_CASE; sin casos + baja confianza → degrade
   [FAIL-CLOSED] si el tipo_area no resuelve a ningún árbol conocido → degrade-to-human + se entera el revisor humano en lote
   // Riesgo: árbol mal poblado por tipo errado de B.2 [hallucination-guard]

-> [PASO B.3.2] Rankear paths por probabilidad
   [ACTOR:IA]
   [DATA-IN] paths[].hipotese del ISSUE_TREE · de S4 [I]
   [DATA-IN] probabilidad histórica del padrón · de KNOWLEDGE_CASE (S6) [I]
   [CÓMPUTO] asigna probabilidad[C] a cada path y ordena descendente → secuencia PATH A (más probable), PATH B, PATH C…
   [DATA-OUT] ISSUE_TREE.paths ordenado por probabilidad[C] · a S4 [C]
   [DECISIÓN] ¿hay un PATH A con probabilidad[C] dominante por encima del umbral mínimo de confianza?
      -> [SÍ] selecciona PATH A → continúa B.3.3
      -> [NO] [FAIL-CLOSED] ranking plano/empate sin señal → no adivinar → degrade-to-human; estado=needs_human
   [REGLA BR-B1] va por el más probable primero; jamás barre en paralelo todas las fuentes
   [REGLA BR-B8] provenance por campo: la probabilidad nace [C] (placeholder de escenario), nunca se promueve a hecho downstream
   [FAIL-CLOSED] si todas las probabilidades vienen vacías/null → degrade-to-human + se entera el revisor humano en lote
   // Riesgo: anclaje en el primer path por probabilidad ruidosa [no-anchoring]

-> [PASO B.3.3] Ejecutar PATH A (fetch perezoso dirigido por la hipótesis)
   [ACTOR:IA]
   [DATA-IN] PATH A.hipotese + PATH A.fonte (1 sola fuente del camino) · de ISSUE_TREE [C]
   [CÓMPUTO] delega a B.4 (enriquecedor perezoso): consulta SOLO la fonte_consultada de PATH A en la red de fuentes-de-verdad (S1); contrasta evidencia vs hipotese
   [DATA-OUT] PATH A.fonte_consultada + PATH A.resultado(true|false) · a ISSUE_TREE [C]
   [DECISIÓN] ¿PATH A.resultado == true (la hipótesis se sostiene contra la fuente)?
      -> [SÍ] raíz candidata confirmada → continúa B.3.5
      -> [NO] resultado=false → continúa B.3.4 (backtrack)
   [REGLA BR-B2] fetch perezoso: consulta SOLO la fuente del camino actual; fuentes caras nunca en bulk
   [REGLA BR-B8] resultados-vs-hipótesis: lo correcto/erróneo se mide por resultado(true|false), la señal no se vuelve hecho
   [FAIL-CLOSED] si la fuente de S1 no responde / inaccesible → marca PATH A.resultado=abierto, NO lo declara false; pasa a B.3.4 con flag de evidencia-faltante + se entera el revisor humano en lote
   // Riesgo: fuente cara consultada de más rompe performance [performance]

-> [PASO B.3.4] Backtrack al siguiente path (PATH A -> PATH B)
   [ACTOR:IA]
   [DATA-IN] PATH A.resultado=false + lista de paths restantes ordenada · de ISSUE_TREE [C]
   [CÓMPUTO] descarta PATH A, toma el siguiente path por probabilidad[C] como nuevo path activo (PATH B)
   [DATA-OUT] path activo = PATH B (resultado=abierto) · a ISSUE_TREE [C]
   [DECISIÓN] ¿queda algún path con resultado=abierto en el ISSUE_TREE?
      -> [SÍ] vuelve a [PASO B.3.3] ejecutando PATH B (luego C…)
      -> [NO] [FAIL-CLOSED] árbol agotado sin raíz → no fabricar raíz → degrade-to-human; PROBLEMA_DIAGNOSTICADO.estado=needs_human, raiz_hipotese=null
   [REGLA BR-B1] backtrack PATH A→B: si el más probable no resuelve, baja al siguiente; sin barrido total
   [REGLA BR-B3] sin casos + baja confianza tras agotar paths → degrade-to-human, no inventa raíz
   [FAIL-CLOSED] todos los paths false/abiertos → degrade-to-human + se entera el revisor humano en lote (insumo RL para no reforzar árbol malo, BR-B16)
   // Riesgo: bucle de backtrack sin corte → cap de profundidad del árbol [perf-guard]

-> [PASO B.3.5] Fijar raíz-hipótesis validada del path ganador
   [ACTOR:IA]
   [DATA-IN] path ganador {hipotese, probabilidad[C], fonte_consultada, resultado=true} · de ISSUE_TREE [C]
   [CÓMPUTO] escribe raiz_hipotese + ruta del path en PROBLEMA_DIAGNOSTICADO; sella el ISSUE_TREE como evidencia auditable (camino recorrido + fuente que confirmó)
   [DATA-OUT] PROBLEMA_DIAGNOSTICADO.raiz_hipotese + confianza[C] + provenance_por_campo · a B.5 (caza-silenciosos/patrón) y a S4 [C]
   [DECISIÓN] ¿la confianza[C] de la raíz supera el umbral para avanzar a B.5?
      -> [SÍ] continúa [FIN B.3]
      -> [NO] [FAIL-CLOSED] raíz débil → marca para revisión humana antes de propagar; no avanza como hecho
   [REGLA BR-B8] provenance por campo: raiz_hipotese carga su tag; la hipótesis nunca se vuelve "hecho" en B.5+ sin el resultado que la sostiene
   [FAIL-CLOSED] si falta evidencia (PATH quedó abierto por fuente caída) → raíz marcada provisional + se entera el revisor humano en lote
   // Riesgo: raíz validada con evidencia parcial se trata como definitiva [provenance]

-> [FIN B.3] // entrega: ISSUE_TREE sellado (camino + fonte_consultada + resultado true/false por path) + PROBLEMA_DIAGNOSTICADO.raiz_hipotese[C] → consumido por B.5 (caza-silenciosos + detector de patrón)


[Sub-proceso B.4 — Enriquecedor perezoso] [INICIO]

-> [TRIGGER] B.3 entregó el ISSUE_TREE con el `path_id` más probable seleccionado (PATH actual, estado=abierto) y su `hipotese` rankeada
   // El enriquecedor NO se dispara solo: siempre nace de un camino del issue-tree (Occam → BR-B1) [I]

-> [PASO B.4.1] Recibir el camino activo y derivar la fuente-de-verdad objetivo
   [ACTOR:IA]
   [DATA-IN] ISSUE_TREE.paths[path_id activo]{hipotese, probabilidad[C], fonte_consultada=null} · de S4 (Motor de diagnóstico) [I] · PROBLEMA_DIAGNOSTICADO{tipo_area} · de S4 [V]
   [CÓMPUTO] mapear (tipo_area + hipotese del camino) → UNA sola fuente de S1 (finanzas → tabla de pagos; producto → product-logs; campaña → campañas; tickets → tickets). Construir la consulta dirigida: ej. finanzas = "¿este id_restaurante recibió el pago del período? si no → ¿por qué (estado/motivo de fallo)?"
   [DATA-OUT] plan de fetch dirigido {fuente_unica_ref, query_acotada, claves=id_restaurante/cliente_id del período} · a B.4.2 [I]
   [DECISIÓN] ¿el camino resuelve a exactamente UNA fuente de S1? -> [SÍ] seguir a B.4.2 / -> [NO] no se puede acotar
      -> [NO] [FAIL-CLOSED] no fanout a múltiples fuentes; marcar path resultado=abierto, devolver a B.3 para re-rankear o backtrack PATH A→B // Riesgo: barrer todo = alucinación + costo [perf]
   [REGLA BR-B1] (type-first / no-cross-everything) · [REGLA BR-B2] (fetch perezoso dirigido por hipótesis)

-> [DECISIÓN] ¿la fuente objetivo es cara y la consulta es por-caso (no bulk)? -> [SÍ] continuar / -> [NO] intento de bulk
   -> [NO] [FAIL-CLOSED] BLOQUEAR el fetch bulk; degradar a consulta single-key por `id_restaurante`; registrar violación // Riesgo: una fuente cara en bulk por caso revienta performance [perf]
   [REGLA BR-B2] (fuentes caras nunca en bulk por caso)
   SI SE VIOLA → fetch abortado + el orquestador (S3) y revisión-humana-en-lote se enteran

-> [PASO B.4.2] Ejecutar el fetch dirigido contra la ÚNICA fuente del camino
   [ACTOR:IA]
   [DATA-IN] plan de fetch dirigido {fuente_unica_ref, query_acotada} · de B.4.1 [I] · datos crudos de la fuente-de-verdad del camino · de S1 (consultada SOLO bajo demanda) [V]
   [CÓMPUTO] correr SOLO la query acotada (ej. lookup de pago del id_restaurante: pagó=true/false + motivo si false). Cero consultas a otras fuentes de S1 en este paso
   [DATA-OUT] resultado_crudo_dirigido {pagó?/motivo · campos del camino} · a B.4.3 [I]
   [DECISIÓN] ¿la fuente respondió dentro de timeout/disponible? -> [SÍ] B.4.3 / -> [NO] fuente caída o vacía
      -> [NO] [FAIL-CLOSED] marcar path_id resultado=abierto + confianza no se eleva; devolver a B.3 (re-rankear / probar PATH B); NUNCA inventar el dato faltante // Riesgo: fuente caída tratada como "negativo" = falso silencioso [data]
   [REGLA BR-B2]

-> [PASO B.4.3] Redacción de PII sobre lo recién traído
   [ACTOR:IA]
   [DATA-IN] resultado_crudo_dirigido (puede traer datos personales/cuenta/contacto) · de B.4.2 [I]
   [CÓMPUTO] redactar PII en el enriquecimiento ANTES de persistir o pasar downstream; conservar SOLO claves operativas no-identificantes (id_restaurante, cliente_id como referencia, montos, estado, fechas)
   [DATA-OUT] resultado_redactado · a B.4.4 [I]
   [DECISIÓN] ¿quedó PII sin redactar en el payload? -> [NO redactada-ok] B.4.4 / -> [SÍ queda-PII]
      -> [SÍ queda-PII] [FAIL-CLOSED] no propagar; descartar el campo con PII residual y registrar; el dato NO entra al ISSUE_TREE ni a B.5 // Riesgo: PII filtrada a repositorio/handoff [seguridad]
   [REGLA BR-B7] (PII redactada en enriquecimiento + detección de silenciosos + repositorio) · hard-no:sí
   SI SE VIOLA → payload bloqueado + revisión-humana-en-lote (S6) se entera

-> [DECISIÓN] ¿el dato cruza tenant? -> [NO mismo-tenant] continuar / -> [SÍ cruza-tenant]
   -> [SÍ cruza-tenant] [FAIL-CLOSED] abortar; ningún dato/insight cruza tenant; el fetch de B opera DENTRO del tenant (S1 filtrada por tenant_id) // Riesgo: Sony≠Warner [seguridad]
   [REGLA BR-B6] (cross-tenant hard-no) · hard-no:sí
   SI SE VIOLA → fetch abortado + orquestador (S3) bloquea el caso

-> [PASO B.4.4] Estampar resultado-vs-hipótesis en el camino (con provenance)
   [ACTOR:IA]
   [DATA-IN] resultado_redactado · de B.4.3 [I] · ISSUE_TREE.paths[path_id activo]{hipotese, probabilidad[C]} · de S4 [I]
   [CÓMPUTO] comparar dato traído contra la hipótesis del camino → setear `resultado` = true|false|abierto; escribir `fonte_consultada` = la única fuente usada; la señal queda como hipótesis-evaluada, NUNCA como "hecho" downstream
   [DATA-OUT] ISSUE_TREE.paths[path_id]{fonte_consultada, resultado} actualizado + datos-crudos-ya-buscados (cacheados para el dossier #8) · a S4 / a B.5 (caza-silenciosos) [I]
   [DECISIÓN] ¿el dato CONFIRMA la hipótesis del camino (resultado=true)? -> [SÍ] B.5 / -> [NO]
      -> [NO resultado=false] devolver a B.3 → backtrack PATH A→B (probar el siguiente camino más probable); NO se fuerza una raíz sin grounding // Riesgo: rubber-stamp de hipótesis equivocada [perf]
   [REGLA BR-B8] (provenance por campo / resultados-vs-hipótesis; la señal nunca se vuelve hecho)

-> [FIN B.4] // Salida = el camino activo del ISSUE_TREE enriquecido con UNA fuente dirigida, PII redactada, dentro de tenant, marcado true|false|abierto con provenance. Si true → pasa a B.5 (caza-silenciosos + patrón). Si false/abierto → vuelve a B.3 (re-rankeo/backtrack). Jamás barrió todas las fuentes (BR-B1/BR-B2). [I]


[Sub-proceso B.5 — Caza-silenciosos + patrón] [INICIO]

-> [TRIGGER] B.4 entregó la fuente confirmada del camino más probable (resultado=true en un path del ISSUE_TREE) // disparo: hay raíz validada con población medible [I:doc-derivado]

-> [PASO B.5.1 — Establecer población-de-verdad del tipo] [ACTOR:IA]
   [DATA-IN universo de afectados potenciales · de la fuente del camino confirmado en S1 (ej. finanzas→PROCESSO_CRITICO.fonte_verdade_ref tabla de pagos) [I:doc-derivado]]
   [DATA-IN PROBLEMA_DIAGNOSTICADO{tipo_area, raiz_hipotese} · de B.2/B.3 [I:doc-derivado]]
   [CÓMPUTO delimita la población-de-verdad SOLO sobre la fuente del camino (fetch perezoso, no barre todo); redacta PII al enriquecer]
   [DATA-OUT lista cruda de id_restaurante afectados · a B.5.2 buffer interno]
   [REGLA BR-B2] [REGLA BR-B7]
   [DECISIÓN ¿la fuente devolvió población medible?]->[NO] [FAIL-CLOSED] no fabrica universo; degrade-to-human con "población no medible"; NO declara silenciosos // Riesgo: inventar afectados [seguridad-dato]
   ->[SÍ] continúa

-> [PASO B.5.2 — Triple-check: cruzar población × quién-reclamó] [ACTOR:IA]
   [DATA-IN población-de-verdad (B.5.1) [I:doc-derivado]]
   [DATA-IN quién-reclamó = AFETADO.reclamou desde episodios de A (S2) + tickets de S1 [I:doc-derivado]]
   [CÓMPUTO triple-check = para cada afectado pregunta «¿abrió ticket?»; cruza universo MENOS reclamantes; un afectado sin ticket = silencioso (cuenta igual que el que reclamó)]
   [DATA-OUT AFETADO{problema_id, cliente_id, id_restaurante, reclamou, silencioso, evidencia} · a entidad AFETADO]
   [REGLA BR-B4 ⭐] [REGLA BR-B8 // provenance por campo: silencioso=[C] hasta cierre del caso downstream]
   [DECISIÓN ¿cruce población×reclamantes resolvió sin ambigüedad?]->[NO] [FAIL-CLOSED] marca afectados ambiguos como reclamou=desconocido (NO los descarta como no-afectados); rebaja confianza; sigue con los ciertos // Riesgo: perder un silencioso por dato sucio [silenciosos]
   ->[SÍ] continúa

-> [PASO B.5.3 — Detector de patrón con corte DIRIGIDO POR EL TIPO] [ACTOR:IA]
   [DATA-IN AFETADO[] (silenciosos + reclamantes) (B.5.2) [I:doc-derivado]]
   [DATA-IN tipo_area de PROBLEMA_DIAGNOSTICADO [I:doc-derivado]]
   [CÓMPUTO elige el corte de similaridad RELEVANTE AL TIPO (finanzas→día/país de pago; producto→tipo de producto; fraude→zona/tipo/comida); NO usa corte fijo; agrupa para hallar dónde-concentra]
   [DATA-OUT corte-de-concentración (dónde se concentra el patrón) · a B.7 puntuador de impacto y al campo dónde-concentra del DOSSIER_HANDOFF (#8)]
   [REGLA BR-B9]
   [DECISIÓN ¿emerge un corte con concentración significativa?]->[NO] [FAIL-CLOSED] reporta «sin patrón»; mantiene caso individual sin afirmar patrón inexistente // Riesgo: alucinar un patrón [anti-alucinacion]
   ->[SÍ] continúa

-> [PASO B.5.4 — k-anon INTERNO: resolver caso específico vs. freno cross-tenant] [ACTOR:IA]
   [DATA-IN AFETADO[] con id_restaurante específicos + corte de patrón [I:doc-derivado]]
   [DATA-IN destino de la salida (¿interno a B / cruza tenant?) [I:doc-derivado]]
   [CÓMPUTO B es INTERNO → resuelve el caso del restaurante específico SIN suprimir el caso de 1 (k-anon NO aplica adentro); el freno no-dedurar SOLO se evalúa si la salida cruza tenant]
   [DECISIÓN ¿la salida cruza tenant (Sony≠Warner)?]
     ->[SÍ] [FAIL-CLOSED] BLOQUEA el cruce cross-tenant; ningún dato/insight sale del tenant; aborta esa salida y alerta política // Riesgo: fuga cross-tenant [hard-no:cross-tenant]
     ->[NO] resuelve el caso específico con id_restaurante (cruce DENTRO del tenant permitido)
   [REGLA BR-B5] [REGLA BR-B6 hard-no] [REGLA BR-B7 // PII redactada en la salida]
   [DATA-OUT lista de afectados (reclamantes+silenciosos con IDs) DENTRO del tenant · al campo QUIÉN del DOSSIER_HANDOFF (#8) y a B.6 Knowledge Base]

-> [FIN B.5] //entrega a B.7 (impacto: restaurantes×órdenes×días) y a DOSSIER_HANDOFF: QUIÉN (reclamantes+silenciosos+IDs) + dónde-concentra (corte por tipo) [I:doc-derivado]


[Sub-proceso B.6 — Knowledge Base + RL] [INICIO]

[DATA-IN] hipótesis-de-raíz priorizada del camino más probable (con tipo_area + raiz_hipotese provisoria) · de S4 / B.3-B.4 (ISSUE_TREE.paths[más-probable]) [I]
-> // B.6 entra DESPUÉS de que el issue-tree eligió camino y el fetch perezoso (B.4) trajo la fuente de ese camino; ancla la hipótesis antes de declararla [V]

[PASO B.6.1 — Consulta de casos similares en Knowledge Base]
[ACTOR:IA]
[DATA-IN tipo_area + raiz_hipotese provisoria + corte/patrón del tipo · de S4 (PROBLEMA_DIAGNOSTICADO.tipo_area, .raiz_hipotese)] [I]
[CÓMPUTO] busca en KNOWLEDGE_CASE por tipo_area+padrao → recupera {resolucao, probabilidad[C], caminho_usado, links_similares} de casos pasados con el mismo tipo/patrón
[DATA-OUT lista de KNOWLEDGE_CASE candidatos + su probabilidad · a B.6.2 (S6→S4)] [I]
[DECISIÓN ¿hay casos similares con padrao coincidente? -> [SÍ] B.6.2 / [NO] B.6.4-degrade] [I]
[REGLA BR-B3] [REGLA BR-B7]
[FAIL-CLOSED] si la consulta a KNOWLEDGE_CASE falla/timeout → trata como SIN casos → NO inventa raíz → va a degrade-to-human (B.6.4); registra fallo de fuente
//Riesgo: KB vacía o tipo_area mal clasificado → falso "sin similares"; mitiga BR-B8 (la señal no se vuelve hecho) [seguridad/anti-alucinación]

[PASO B.6.2 — Anclaje (grounding) de la hipótesis contra la KB]
[ACTOR:IA]
[DATA-IN KNOWLEDGE_CASE candidatos {resolucao, probabilidad[C], caminho_usado} · de B.6.1] [I] · hipótesis-de-raíz actual [C]
[CÓMPUTO] confronta raiz_hipotese contra padrao+resolucao de los casos; ajusta confianza con la probabilidad[C] del caso; marca resultado-vs-hipótesis sin convertir señal en hecho
[DATA-OUT raiz_hipotese ANCLADA + confianza ajustada + provenance_por_campo · a S4 (PROBLEMA_DIAGNOSTICADO.confianza, .raiz_hipotese, .provenance_por_campo)] [I]
[DECISIÓN ¿confianza ≥ umbral con respaldo de ≥1 KNOWLEDGE_CASE? -> [SÍ] B.6.3 / [NO] B.6.4-degrade] [I]
[REGLA BR-B3] [REGLA BR-B8]
[FAIL-CLOSED] sin caso de respaldo Y confianza baja → NO declara raíz → degrade-to-human (B.6.4); la hipótesis queda abierta, nunca "confirmada" por B
//Riesgo: rubber-stamp por caso parecido pero no igual → la confianza hereda probabilidad[C] del caso, nunca la sube sola [anti-alucinación]

[PASO B.6.3 — Guardado del camino usado (RL: acelerar futuros)]
[ACTOR:IA]
[DATA-IN camino del issue-tree que resolvió (path_id, fonte_consultada, resultado) + raiz_hipotese anclada · de S4 (ISSUE_TREE.paths)] [I]
[CÓMPUTO] escribe/actualiza KNOWLEDGE_CASE{tipo_area, padrao, resolucao, probabilidad[C], caminho_usado, links_similares} → el camino queda disponible para acelerar diagnósticos futuros del mismo tipo
[DATA-OUT KNOWLEDGE_CASE nuevo/actualizado marcado "pendiente-de-revisión" · a S6] [I]
[DECISIÓN ¿el caso ya existía? -> [SÍ] actualiza frecuencia/links_similares / [NO] crea KNOWLEDGE_CASE] [I]
[REGLA BR-B16] [REGLA BR-B7] [REGLA BR-B8]
[FAIL-CLOSED] el camino guardado NO se auto-refuerza ni se aplica como verdad hasta pasar la guard (B.6.5); nace con flag "no-reforzado"; PII redactada antes de persistir
//Riesgo: reforzar un camino equivocado si se aplicara directo → bloqueado por la guard B.6.5 [RL-guard]

[PASO B.6.4 — Degrade-to-human (sin casos / baja confianza)]
[ACTOR:IA]
[DATA-IN raiz_hipotese SIN respaldo de KB o bajo umbral · de B.6.1[NO]/B.6.2[NO]] [I]
[CÓMPUTO] marca el PROBLEMA_DIAGNOSTICADO como "raíz-no-anclada"; no escribe KNOWLEDGE_CASE de resolución; deja la hipótesis abierta con provenance [C]/[I]
[DATA-OUT problema enrutable a revisión humana, hipótesis-abierta auditable · a S4 / handoff downstream (sin cerrar)] [I]
[DECISIÓN — (terminal de esta rama, no refuerza KB)]
[REGLA BR-B3] [REGLA BR-B18]
[FAIL-CLOSED] B nunca rellena la raíz por defecto: ausencia de evidencia → escala, no inventa; quién se entera: revisor humano en lote
//Riesgo: degradar de más por KB inmadura → aceptable (fail-closed); se corrige al poblar KB [anti-alucinación]

[PASO B.6.5 — Guard anti-refuerzo: revisión humana en lote + detección de divergencia]
[ACTOR:IA] (detección de divergencia) + [ACTOR:HUMANO] (revisión en lote)
[DATA-IN KNOWLEDGE_CASE "pendientes-de-revisión" + resultados-reales-vs-hipótesis downstream · de S6 + loop downstream (BR-B18)] [I]
[CÓMPUTO] la IA compara resultado real vs caminho_usado/resolucao guardados → calcula divergencia; el HUMANO revisa en lote y aprueba/rechaza el refuerzo del camino
[DATA-OUT KNOWLEDGE_CASE aprobado (reforzable) | marcado divergente (NO reforzar / corregir) · a S6] [I]
[DECISIÓN ¿el resultado real confirmó el camino Y el humano aprobó? -> [SÍ] el camino se refuerza (acelera futuros) / [NO] se marca divergente, NO se refuerza, se corrige el probabilidad[C]] [I]
[REGLA BR-B16] [REGLA BR-B19]
[FAIL-CLOSED] ante divergencia detectada o sin aprobación humana → el camino NO se refuerza; default = no-reforzar; quién se entera: revisor humano en lote
//Riesgo: groupthink/refuerzo de camino malo → juez≠proponente + detección automática de divergencia + revisión en lote [RL-guard/anti-rubber-stamp]

[PASO B.6.6 — Promoción de procesos críticos desde la KB]
[ACTOR:IA] propone + [ACTOR:HUMANO] confirma (política)
[DATA-IN KNOWLEDGE_CASE recurrentes con {impacto-alto × falla-silenciosa × fonte-medible} · de S6 + señal de impacto de B.7 (IMPACTO.rs_perdido, churn_risk)] [I]
[CÓMPUTO] evalúa si un patrón de la KB merece vigilancia continua → crea/actualiza PROCESSO_CRITICO{nome, score_impacto, falha_silenciosa, fonte_verdade_ref, origem=kb_promovido, schedule}
[DATA-OUT PROCESSO_CRITICO nuevo/actualizado con origem=kb_promovido · a S3 (monitor proactivo, alimenta B.1)] [I]
[DECISIÓN ¿el patrón cumple impacto-alto × falla-en-silencio × fuente-medible? -> [SÍ] promueve a PROCESSO_CRITICO / [NO] queda solo como KNOWLEDGE_CASE] [I]
[REGLA BR-B12] [REGLA BR-B16]
[FAIL-CLOSED] promoción a monitoreo requiere los 3 gatillos + confirmación de política/humano; sin ellos NO se crea schedule (evita vigilar ruido); cross-tenant nunca se promueve
//Riesgo: promover un proceso ruidoso → triple-gatillo + confirmación humana; queda auditable por origem [proactivo]

[DATA-OUT] hipótesis-de-raíz ANCLADA + confianza con provenance + KNOWLEDGE_CASE actualizado (con/ sin refuerzo según guard) + PROCESSO_CRITICO promovido si aplica · a B.7 (puntuador de impacto) y a S3 (monitor) [I]

[FIN B.6]


[Sub-proceso B.7 — Puntuador de impacto + priorización] [INICIO]

[INICIO] -> [TRIGGER] B.5 entregó {AFETADO (reclamantes + silenciosos + IDs), corte-por-tipo, raíz-hipótesis validada} para PROBLEMA_DIAGNOSTICADO //arranca con población consolidada, no antes [I]

[TRIGGER] -> [PASO B.7.1 Reunir insumos del impacto]
[ACTOR:IA]
[DATA-IN restaurantes_afetados (reclamantes + silenciosos) ·de AFETADO/B.5] [I]
[DATA-IN ordens_media por restaurante ·de S1 red de fuentes-de-verdad, fetch perezoso dirigido por el tipo] [I]
[DATA-IN dias (ventana primera_vez_ts→ultima_vez_ts) ·de PROBLEMA_DIAGNOSTICADO] [I]
[CÓMPUTO] normaliza unidades (restaurantes únicos sin doble-conteo reclamante/silencioso; ordens_media por día; dias = ventana del PROBLEMA) // el silencioso cuenta igual que el reclamante [V]
[DATA-OUT insumos_normalizados ·a B.7.2]
[REGLA BR-B4] el silencioso entra en restaurantes_afetados; suprimirlo subestima impacto
[REGLA BR-B2] ordens_media se consulta SOLO de la fuente del camino (no bulk)
[FAIL-CLOSED] si falta cualquiera de los 3 factores (restaurantes / ordens_media / dias) o llega vacío -> NO computa impacto, marca confianza=insuficiente, degrade-to-human //Riesgo: estimar con factor faltante infla/desinfla [seguridad]

[PASO B.7.1] -> [PASO B.7.2 Computar impacto bruto]
[ACTOR:IA]
[DATA-IN insumos_normalizados ·de B.7.1]
[CÓMPUTO] rs_perdido = restaurantes_afetados × ordens_media × dias (× ticket-medio del tenant); churn_risk = f(restaurantes_afetados, dias-sin-resolver, silenciosos-por-irse) //fórmula medible, no opinión [V]
[DATA-OUT {rs_perdido, churn_risk} provisional ·a B.7.3]
[REGLA BR-B10] impacto = f(restaurantes × órdenes-medias × días) → R$ + churn
[REGLA BR-B8] cada factor carga su provenance [V]/[I]/[C]; rs_perdido hereda la peor provenance de sus insumos (un [C] lo vuelve estimado) // la señal no se vuelve "hecho"
[REGLA BR-B6] el cómputo es DENTRO del tenant; ningún factor cruza Sony≠Warner
[FAIL-CLOSED] si algún factor es [C] placeholder sin respaldo -> rs_perdido sale rotulado ESTIMADO, nunca "confirmado" //Riesgo: número falso-preciso rutea mal en B.8 [seguridad]

[PASO B.7.2] -> [PASO B.7.3 DOUBLE-CHECK del impacto]
[ACTOR:IA]
[DATA-IN {rs_perdido, churn_risk} provisional ·de B.7.2]
[DATA-IN caso(s) similar(es) {rs_perdido histórico} ·de KNOWLEDGE_CASE/B.6] [I]
[CÓMPUTO] recomputa por vía independiente (orden-de-magnitud vs. agregado fila-por-fila) + contrasta contra rango de KNOWLEDGE_CASE del mismo tipo_area; calcula desvío
[DECISIÓN ¿las dos vías concuerdan dentro de tolerancia y caen en rango KB? ]
   -> [SÍ] confirma {rs_perdido, churn_risk}, escribe en IMPACTO [I]
   -> [NO] [FAIL-CLOSED] NO declara impacto; baja confianza, rotula DISCREPANTE, degrade-to-human para revisión //Riesgo: declarar impacto no verificado [seguridad]
[REGLA BR-B10] double-check obligatorio ANTES de declarar
[REGLA BR-B3] grounding del rango contra KNOWLEDGE_CASE; sin casos + desvío alto → no inventa magnitud, degrade-to-human

[PASO B.7.3] -> [DATA-OUT] escribe IMPACTO{impacto_id, problema_id FK, restaurantes_afetados, ordens_media, dias, rs_perdido, churn_risk} ·a entidad IMPACTO (relación PROBLEMA 1—1 IMPACTO) [I]

[DATA-OUT IMPACTO] -> [PASO B.7.4 Estimar costo-de-arreglar-raíz]
[ACTOR:IA]
[DATA-IN raiz_hipotese (validada true) + ruta candidata ·de PROBLEMA_DIAGNOSTICADO/B.3] [I]
[DATA-IN custo_resolver de casos análogos ·de KNOWLEDGE_CASE/B.6] [I]
[CÓMPUTO] estima custo_resolver de la raíz (esfuerzo team-dueño / política / prototipo) desde precedentes KB del mismo tipo_area
[DATA-OUT custo_resolver ·a IMPACTO + a B.7.5] [I]
[REGLA BR-B3] custo_resolver se ancla en KB; sin precedente → custo_resolver=[C] desconocido, no cero
[FAIL-CLOSED] si no hay precedente y la raíz es nueva -> custo_resolver=desconocido, fuerza la prioridad a NO-autónomo (revisión humana decide) //Riesgo: arreglar caro un problema barato [agile]

[PASO B.7.4] -> [PASO B.7.5 Priorizar riesgo×impacto×costo + lente agile]
[ACTOR:IA]
[DATA-IN criticidad/riesgo del PROBLEMA ·de B.1] [I]
[DATA-IN {rs_perdido, churn_risk} ·de IMPACTO/B.7.3] [I]
[DATA-IN custo_resolver ·de B.7.4] [I]
[DATA-IN señal agile (¿este problema chico destraba 3 grandes?) ·de issue-tree/KB] [I]
[CÓMPUTO] prioridad = g(riesgo, impacto, custo_resolver) con override agile (chico-que-destraba-grandes → sube)
[DECISIÓN ¿criticidad grave (ej. pagos en falla-silenciosa) o impacto≫costo? ]
   -> [SÍ] prioridad = ARREGLAR-AHORA, sella en PROBLEMA_DIAGNOSTICADO.estado
   -> [NO] [DECISIÓN ¿impacto justifica vs. costo? ]
        -> [SÍ] prioridad = FILA (con score para ordenar)
        -> [NO] prioridad = FILA-baja / monitorear-con-gatilho (rutea a B.8 como monitor, no acción ya)
[REGLA BR-B11] grave→ahora; si no, impacto→fila; lente agile prioriza el chico que destraba grandes
[REGLA BR-B18] la prioridad NO cierra el caso; solo ordena el ruteo a B.8
[FAIL-CLOSED] si impacto=ESTIMADO/DISCREPANTE (de B.7.3) -> NO puede salir ARREGLAR-AHORA autónomo; cae a fila-con-revisión-humana //Riesgo: acción autónoma sobre número no verificado [seguridad]

[PASO B.7.5] -> [PASO B.7.6 Libro-razón costo-vs-valor]
[ACTOR:IA] (revisión en lote: [ACTOR:HUMANO] meta-capa)
[DATA-IN custo_resolver ·de B.7.4] [I]
[DATA-IN valor_ganho esperado (satisfacción/recurrencia/churn-evitado) ·derivado de IMPACTO] [I]
[CÓMPUTO] registra par {custo_resolver, valor_ganho} del caso → asiento del libro-razón
[DATA-OUT {custo_resolver, valor_ganho} ·a IMPACTO (campos custo_resolver, valor_ganho)] [I]
[REGLA BR-B14] cada caso registra costo-de-resolver vs satisfacción/recurrencia ganada
[REGLA BR-B16] el asiento alimenta revisión humana en lote; divergencia (costo≫valor repetido) NO refuerza el camino
[FAIL-CLOSED] si valor_ganho no es estimable -> asienta solo custo_resolver, marca valor=[C] pendiente, no fabrica ROI //Riesgo: justificar acción con valor inventado [seguridad]

[PASO B.7.6] -> [DATA-OUT entrega a B.8] {IMPACTO completo (rs_perdido, churn_risk, custo_resolver, valor_ganho, todos double-checked o rotulados) + prioridad (ARREGLAR-AHORA / FILA / monitorear) + provenance_por_campo} ·a B.8 Ruteador/handoff #8 [I]

[DATA-OUT] -> [FIN B.7]


[Sub-proceso B.8 — Ruteador + repositorio + handoff]

[INICIO]
-> // entra solo si B.7 cerró con problema priorizado (ahora|fila) + PROBLEMA_DIAGNOSTICADO con raiz_hipotese validada [I]

[PASO B.8.1 — Ruteo a 1 de 5 caminos]
[ACTOR:IA]
[DATA-IN PROBLEMA_DIAGNOSTICADO{tipo_area, raiz_hipotese, confianza, estado} · de B.7 vía S8] [I]
[DATA-IN IMPACTO{rs_perdido, churn_risk, custo_resolver, valor_ganho} · de IMPACTO (B.7)] [I]
[DATA-IN prioridad{ahora|fila} · de B.7 puntuador] [I]
[CÓMPUTO] selecciona ruta entre las 5: actuar-rápido · entregar-completo-al-team-dueño · prototipo+testar-hipótesis · corregir-interno(política/conocimiento) · monitorear-con-gatilho // DEMO = regla FIJA stub (ruta determinista por tipo_area); 5 reglas completas = FILA [C]
[DATA-OUT PROBLEMA_DIAGNOSTICADO.ruta_sugerida (1de5) · a PROBLEMA_DIAGNOSTICADO] [I]
[DECISIÓN ¿confianza ≥ umbral Y ruta resuelve dentro de hard-nos?-> [SÍ] sigue B.8.2 / [NO] degrade-to-human (humano elige ruta en lote)] [I]
[REGLA BR-B11] // prioridad criticidad+impacto+agile ya fijó ahora|fila aguas arriba
[FAIL-CLOSED] sin regla de ruteo aplicable o ruta ambigua -> NO rutea autónomo; marca estado=pendiente-revisión + entra a cola de revisión humana en lote; se entera el meta-capa (RLHF) //Riesgo: ruteo equivocado refuerza camino malo [V]

[REGLA BR-B18] // B NO cierra: solo diagnostica y rutea; el cierre/valor-confirmado lo da el loop downstream

[DECISIÓN ¿ruta toca movimiento financiero (mueve saldo)?-> [SÍ] [FAIL-CLOSED] nunca autónomo: rutea a humano obligatorio / [NO] continúa] [I]
[REGLA BR-B5] // k-anon INTERNO: B resuelve el caso del restaurante específico; el freno no-dedurar NO aplica aquí (salida interna)

[PASO B.8.2 — Escribe CASO_REPO replicable]
[ACTOR:IA]
[DATA-IN PROBLEMA_DIAGNOSTICADO{problema_id, primera_vez_ts, ultima_vez_ts, frecuencia} + AFETADO{cliente_id, id_restaurante} + ISSUE_TREE{caminho_usado} · de B.2–B.5] [I]
[CÓMPUTO] arma {cliente_id, dia, frecuencia_atuacao, screenshots[], programas_levantados[], links_replicaveis[]} + enlaza a KNOWLEDGE_CASE{links_similares} de B.6 // inconstante -> replicable
[DATA-OUT CASO_REPO · a CASO_REPO (repositorio)] [I]
[REGLA BR-B15] // caso replicable: registra screenshots + programas-levantados + links a casos iguales
[REGLA BR-B7] // PII redactada en el repositorio
[FAIL-CLOSED] si falla redacción PII o escritura del repo -> NO persiste el caso; bloquea handoff hasta sanear; se entera el meta-capa //Riesgo: PII filtrada en repositorio replicable [I]

[PASO B.8.3 — Libro-razón de impacto]
[ACTOR:IA]
[DATA-IN IMPACTO{custo_resolver, valor_ganho} · de IMPACTO (B.7)] [I]
[CÓMPUTO] registra costo-de-resolver vs satisfacción/recurrencia-ganada para este caso resuelto
[DATA-OUT entrada libro-razón · a S7 (puntuador de impacto + libro-razón)] [I]
[REGLA BR-B14] // libro-razón: cada caso resuelto registra costo vs valor ganado
[FAIL-CLOSED] sin custo_resolver o valor_ganho medibles -> registra entrada como [C] placeholder + marca incompleta; no bloquea handoff //Riesgo: libro-razón sesgado si valor no es atribuible [I]

[PASO B.8.4 — Compone DOSSIER_HANDOFF #8 completo]
[ACTOR:IA]
[DATA-IN los 11 campos del #8 · de B.2–B.7 (PROBLEMA_DIAGNOSTICADO, ISSUE_TREE, AFETADO, IMPACTO, KNOWLEDGE_CASE, CASO_REPO)] [I]
[CÓMPUTO] ensambla {tipo/área+raíz(hipótesis validada+prob) · evidencia(camino issue-tree+fuente confirmó+triple-check) · QUIÉN(reclamantes+silenciosos+IDs) · dónde-concentra(corte por tipo) · cuánto(R$+churn) · cuántas-veces/desde-cuándo · casos-similares(KB) · hipótesis(true/false auditable) · ruta-sugerida(1de5) · datos-crudos-ya-buscados · provenance por campo}
[DATA-OUT DOSSIER_HANDOFF · a DOSSIER_HANDOFF (entidad)] [I]
[DECISIÓN ¿los 11 campos presentes Y cada uno con provenance?-> [SÍ] sigue B.8.5 / [NO] NO entrega a medias] [V]
[REGLA BR-B17] // handoff E2E completo: nunca pasa trabajo a medias; MECE con próxima feature, sin proceso duplicado
[REGLA BR-B8] // provenance por campo: la señal nunca se vuelve "hecho" downstream; hipótesis carga [V]/[I]/[C]
[FAIL-CLOSED] dossier con campo faltante o sin provenance -> NO entrega; estado=pendiente-completar; se entera el meta-capa //Riesgo: feature siguiente recibe raíz como hecho sin auditoría [V]

[PASO B.8.5 — Entrega handoff a la próxima feature]
[ACTOR:IA]
[DATA-IN DOSSIER_HANDOFF completo · de B.8.4] [I]
[DATA-OUT DOSSIER_HANDOFF · a próxima feature (C generación de conocimiento) vía S8] [I]
[REGLA BR-B6] // cross-tenant hard-no: el dossier NO cruza tenant; el cruce de B fue DENTRO del tenant
[FAIL-CLOSED] si el destino exige dato cross-tenant -> bloquea entrega; descarta el cruce; se entera el meta-capa //Riesgo: fuga Sony↔Warner [I]

[PASO B.8.6 — Comunicación proactiva al cliente = POLÍTICA configurable]
[ACTOR:IA]
[DATA-IN PROBLEMA_DIAGNOSTICADO{tipo_area, estado} + política-de-comunicación{avisar|corregir-callado} · de S3 (config)] [I]
[CÓMPUTO] evalúa política: avisar(transparencia) genera mensaje al cliente vía atendimiento(05A); corregir-callado no comunica // nunca expone internals
[DATA-OUT mensaje proactivo · a S2 atendimiento(05A) -> cliente (solo si política=avisar)] [I]
[DECISIÓN ¿política=avisar?-> [SÍ] emite comunicación sin internals / [NO] corrige-callado, no comunica] [V]
[REGLA BR-B13] // comunicación proactiva = POLÍTICA configurable; nunca expone internals
[FAIL-CLOSED] política no resuelta o mensaje arriesga exponer internals/PII -> NO comunica autónomo; rutea a humano; se entera el meta-capa //Riesgo: alarmar cliente o filtrar internals [V]

[PASO B.8.7 — Guarda camino usado con RL guard]
[ACTOR:IA]
[DATA-IN ruta_sugerida + ISSUE_TREE.caminho_usado · de B.8.1 / B.8.2] [I]
[CÓMPUTO] persiste el camino usado para acelerar futuros; NO refuerza todavía
[DATA-OUT camino candidato · a S6 (Knowledge Base + RL)] [I]
[DECISIÓN ¿revisión humana en lote OK Y sin divergencia detectada?-> [SÍ] refuerza camino / [NO] NO refuerza] [V]
[REGLA BR-B16] // RL guard anti-refuerzo: revisión humana en lote + detección de divergencia impiden reforzar camino equivocado
[FAIL-CLOSED] divergencia detectada -> NO refuerza; marca camino como dudoso para auditoría del meta-capa //Riesgo: RL refuerza diagnóstico erróneo [V]

[FIN B.8]
-> // B entregó dossier #8 + escribió CASO_REPO + libro-razón + (opcional) comunicó al cliente + guardó camino bajo guard; el CIERRE/valor-confirmado-atribuible queda al loop downstream, NO a B [I] (BR-B18)


### Flujo (ASCII)

```
[TRIGGER reactivo] episodio de A (S2)                 // [V] A produce, B consume
[TRIGGER proactivo] monitor de procesos críticos      // [V] BR-B12 pesca ANTES del ticket
        |                                             // [I] dos entradas, mismo orquestador
        v
[PASO B.1] gatilho + prioridad (criticidad+impacto+agile)  // [V] BR-B11
        -> [DECISIÓN] ¿grave?
              -[SÍ]-> atender ahora                   // [V] grave→ahora BR-B11
              -[NO]-> estimar impacto -> fila         // [V] →fila BR-B11
        |
        v
[PASO B.2] clasifica tipo/área (finanzas/producto/perf…)   // [V] BR-B1 type-first
        -> [REGLA BR-B1] NUNCA barre todas las fuentes (Occam)  // [V] anti-alucinación
        |
        v
[PASO B.3] issue-tree: rankea caminos por probabilidad     // [V] BR-B1
        -(PATH A: el más probable)->
        |
        v
[PASO B.4] fetch perezoso dirigido por hipótesis           // [V] BR-B2
        -> [DATA-IN] SOLO la fuente del camino (finanzas→tabla de pagos)  // [V] BR-B2
        -> [REGLA BR-B2] fuentes caras nunca en bulk        // [V] performance
        |
        v
[PASO B.5] caza-silenciosos (triple-check) + detector de patrón  // [V] BR-B4 ⭐
        -> [CÓMPUTO] población × quién-reclamó -> ¿abrió ticket? no -> silencioso  // [V] BR-B4
        -> [REGLA BR-B9] corte de similaridad DIRIGIDO POR EL TIPO  // [V]
        -> [REGLA BR-B5] k-anon INTERNO: resuelve el caso, NO suprime  // [V]
        -> [FAIL-CLOSED BR-B6] si el cruce tocaría otro tenant -> abortar cruce  // [I] hard-no
        |
        v
[PASO B.6] Knowledge Base: casos similares (grounding)     // [V] BR-B3
        -> [REGLA BR-B3] sin casos + baja confianza -> degrade-to-human  // [V]/[I]
        -> [RL/divergence-guard BR-B16] guarda camino, no refuerza el equivocado  // [V]
        |
        v
[DECISIÓN] ¿el camino actual resuelve / valida la raíz?
        -[NO]-> backtrack a [PASO B.3] PATH B (siguiente más probable)  // [V] backtrack PATH A→B
        -[SÍ]-> continúa
        |
        v
[PASO B.7] puntuador de impacto + priorización            // [V] BR-B10
        -> [CÓMPUTO] restaurantes × órdenes-medias × días -> R$ + churn-risk  // [V] BR-B10
        -> [REGLA BR-B10] double-check antes de declarar    // [V]
        -> [REGLA BR-B11] riesgo×impacto×costo -> ahora/fila  // [V]
        |
        v
[PASO B.8] ruteador + repositorio + handoff #8            // [V] BR-B17
        -> [DECISIÓN] ruta (1 de 5): actuar-rápido / entregar-al-team / prototipo+testar / corregir-interno / monitorear-con-gatilho  // [V] 5 caminos
        -> [REGLA BR-B13] comunicación proactiva = política configurable (avisar vs corregir-callado)  // [V]
        -> [REGLA BR-B14] libro-razón: costo-de-resolver vs satisfacción ganada  // [V]
        -> [REGLA BR-B15] CASO_REPO replicable                // [V]
        |
        v
[FIN B] B NO cierra (BR-B18); rutea y entrega dossier      // [I] cierre = loop downstream

// ramas de degrade-a-humano:
//   B.2 tipo ambiguo / categoría no-MECE -> degrade-to-human        // [I] EPIC-B8 fila
//   B.3/B.4 todos los PATH agotados sin validar -> degrade-to-human  // [I]
//   B.6 sin casos similares + baja confianza -> degrade-to-human     // [V]/[I] BR-B3
//   B.7 impacto no medible (sin fuente) -> degrade-to-human          // [I] BR-B10
```

### DESPUÉS

```
[DATA-OUT] dossier #8 (11 campos) -> próxima feature = C generación de conocimiento  // [V] BR-B17 handoff E2E
[DATA-OUT] ruta sugerida (1 de 5) -> ruteador ejecuta el camino elegido              // [V] 5 caminos
[DATA-OUT] CASO_REPO {cliente, día, frecuencia, screenshots, programas-levantados, links}  // [V] BR-B15 replicable
[DATA-OUT] libro-razón (costo-de-resolver vs satisfacción/recurrencia) -> KPIs / North Star  // [V] BR-B14
[DATA-OUT] comunicación proactiva -> vía atendimiento (05A), nunca expone internals   // [V] BR-B13
[DATA-OUT] señal de impacto (R$+churn) -> KPIs                                        // [I] contrato cross-screen
[REGLA BR-B18] B NO cierra el caso: el cierre/confirmación de valor (confirmado+permanente+atribuible) lo otorga el loop downstream, no B  // [I]
[REGLA BR-B8] provenance por campo viaja en el dossier; la señal nunca se vuelve "hecho" downstream  // [V]
```

### MAPA DE SISTEMAS Y FLUJO DE DATOS

```
[SISTEMA S1] Red de fuentes-de-verdad
 [FUNCIÓN] pagos, campañas, product-logs, tickets — verdad operativa por tipo  // [V] tabla de pagos vivida
 [DATOS] tablas crudas por dominio                                             // [I]
 [ACCESO] SOLO bajo demanda, dirigido por hipótesis (B.4)                      // [V] BR-B2 fetch perezoso
 [GROUNDING] la fuente confirma/refuta el camino del issue-tree               // [V]
 // Problema: fuentes caras en bulk matan performance -> Alimenta a: S4, S5

[SISTEMA S2] Atendimiento (05A)
 [FUNCIÓN] entrada reactiva: produce el episodio que B consume                // [V] A produce, B consume
 [DATOS] episodio 3-capas {transcripción · estructurada · métricas}          // [I] contrato cross-screen
 [ACCESO] push de episodio al orquestador                                     // [I]
 [GROUNDING] estructurada trae intent/causa-hipótesis+confianza+cohort        // [I]
 // Problema: A es reactiva, NO cubre silenciosos -> Alimenta a: S3

[SISTEMA S3] Orquestador + gatilho + monitor proactivo
 [FUNCIÓN] recibe reactivo (S2) / dispara proactivo (procesos críticos); prioriza  // [V] BR-B11, BR-B12
 [DATOS] cola priorizada (criticidad+impacto+agile); registro de procesos críticos  // [V]
 [ACCESO] orquesta; aplica hard-nos antes de componer dossier                 // [I] EPIC-B1
 [GROUNDING] PROCESSO_CRITICO entra si impacto-alto × falla-silenciosa × fuente-medible  // [V] BR-B12
 // Problema: monitor que alarma de más erosiona confianza -> Alimenta a: S4

[SISTEMA S4] Motor de diagnóstico (type-first)
 [FUNCIÓN] clasifica tipo -> issue-tree rankeado/backtrack -> fetch perezoso  // [V] BR-B1, BR-B2
 [DATOS] PROBLEMA_DIAGNOSTICADO, ISSUE_TREE                                    // [I] entidades frozen
 [ACCESO] consulta S1 SOLO la fuente del camino actual                        // [V] BR-B2
 [GROUNDING] Occam: el más probable primero; backtrack PATH A→B               // [V] BR-B1
 // Problema: no-backtrack se queda en raíz falsa -> Alimenta a: S5

[SISTEMA S5] Caza-silenciosos + patrón
 [FUNCIÓN] triple-check población × reclamantes; detecta concentración        // [V] BR-B4 ⭐
 [DATOS] AFETADO {reclamou, silencioso, evidencia}                            // [I] entidad frozen
 [ACCESO] cruce DENTRO del tenant; corte dirigido por el tipo                 // [V] BR-B9, BR-B5
 [GROUNDING] el silencioso cuenta igual; k-anon interno resuelve, no suprime  // [V] BR-B4, BR-B5
 // Problema: missar un silencioso = subestimar tamaño/impacto -> Alimenta a: S6, S7

[SISTEMA S6] Knowledge Base + RL
 [FUNCIÓN] casos similares (anti-alucinación, grounding) + promueve procesos críticos  // [V] BR-B3, BR-B12
 [DATOS] KNOWLEDGE_CASE {padrao, resolucao, probabilidad[C], caminho_usado}   // [I] entidad frozen
 [ACCESO] lectura para grounding; escritura con divergence-guard              // [V] BR-B16
 [GROUNDING] sin casos + baja confianza -> degrade-to-human                   // [V]/[I] BR-B3
 // Problema: RL refuerza un camino equivocado -> Alimenta a: S4 (acelera), S7

[SISTEMA S7] Puntuador de impacto + libro-razón
 [FUNCIÓN] restaurantes × órdenes-medias × días -> R$ + churn; costo-vs-valor  // [V] BR-B10, BR-B14
 [DATOS] IMPACTO {rs_perdido, churn_risk, custo_resolver, valor_ganho}        // [I] entidad frozen
 [ACCESO] double-check antes de declarar; riesgo×impacto×costo -> prioriza    // [V] BR-B10, BR-B11
 [GROUNDING] impacto medible o degrade; libro-razón audita cada caso          // [V] BR-B14
 // Problema: R$ inflado sin double-check = mala priorización -> Alimenta a: S8

[SISTEMA S8] Ruteador + repositorio + handoff
 [FUNCIÓN] elige ruta (1 de 5); guarda CASO_REPO; compone dossier #8          // [V] BR-B15, BR-B17
 [DATOS] CASO_REPO, DOSSIER_HANDOFF (11 campos)                               // [I] entidades frozen
 [ACCESO] handoff a próxima feature; comunicación vía atendimiento; señal a KPIs  // [V] BR-B13, [I]
 [GROUNDING] MECE con la próxima feature; B no cierra (BR-B18)                // [V]/[I]
 // Problema: pasar trabajo a medias rompe E2E -> Alimenta a: feature C / 5 rutas / KPIs / cliente
```

### PUNTOS DE DOLOR / RIESGOS (rankeados)

```
[RIESGO 1] Alucinar un problema falso (raíz inventada)
 //Impacto: rutea trabajo inexistente, quema confianza del operador     // [V] "si no, alucina"
 //Mitigación: type-first + Occam (BR-B1) + grounding en KB (BR-B3) -> sin casos+baja confianza = degrade-to-human  // [V]/[I]

[RIESGO 2] Missar un silencioso (subestimar el problema)
 //Impacto: tamaño/impacto subestimados, el problema vivido (no-pagados) se escapa  // [V] caso vivido ⭐
 //Mitigación: caza-silenciosos obligatoria triple-check (BR-B4); el silencioso cuenta igual  // [V]

[RIESGO 3] Cross-tenant en el cruce (Sony≠Warner)
 //Impacto: fuga de dato/insight entre tenants = HARD-NO violado            // [I] hard-no
 //Mitigación: cruce SOLO dentro del tenant (BR-B6); fail-closed aborta el cruce; auditoría  // [I]

[RIESGO 4] PII expuesta en enriquecimiento/silenciosos/repositorio
 //Impacto: dato personal filtra a dossier o CASO_REPO = HARD-NO violado    // [I] hard-no
 //Mitigación: PII redactada en las 3 etapas (BR-B7); fail-closed bloquea persistencia  // [I]

[RIESGO 5] RL refuerza un camino equivocado
 //Impacto: acelera futuros diagnósticos hacia la raíz errada               // [V] guard vivido
 //Mitigación: revisión humana en lote + detección de divergencia (BR-B16) impiden el refuerzo  // [V]

[RIESGO 6] Performance: tentación de cruzar-todo / fuentes caras en bulk
 //Impacto: costo y latencia explotan por caso                              // [V] BR-B2 por qué
 //Mitigación: fetch perezoso dirigido por hipótesis (BR-B2); solo la fuente del camino  // [V]

[RIESGO 7] Fraude/injection envenena el diagnóstico
 //Impacto: texto-del-cliente tratado como instrucción tuerce la raíz       // [V] HARD-NO producto
 //Mitigación: texto-del-cliente = DATO nunca instrucción; categoría injection/seguridad (EPIC-B8); provenance [C] no asciende a hecho (BR-B8)  // [V]/[I]

[RIESGO 8] No-backtrack: quedarse en la primera raíz
 //Impacto: cierra en PATH A falso sin probar PATH B                        // [V] backtrack vivido
 //Mitigación: issue-tree con backtrack PATH A→B (BR-B1); degrade si se agotan los PATH  // [V]

[RIESGO 9] Categoría no-MECE (clasificación ambigua)
 //Impacto: el caso cae en dos categorías o en ninguna -> ruteo errado      // [I] EPIC-B8 fila
 //Mitigación: taxonomía MECE completa (EPIC-B8, fila); tipo ambiguo -> degrade-to-human  // [I]

[RIESGO 10] Monitor proactivo que alarma de más
 //Impacto: ruido erosiona confianza; o corrige-callado donde debía avisar  // [V] BR-B12, BR-B13
 //Mitigación: registro con gate (impacto-alto × falla-silenciosa × fuente-medible) BR-B12; comunicación = política configurable BR-B13  // [V]

SÍNTESIS DE RIESGO: el núcleo de B es epistémico — su mayor riesgo es declarar una raíz que no existe (alucinar) o no ver a quien nunca habló (silencioso); todo lo demás (cross-tenant, PII, RL, performance, injection) son fail-closed con dueño y auditoría. La defensa es estructural: type-first + Occam + grounding en KB + triple-check + degrade-to-human cuando la confianza no alcanza, con provenance que impide que una señal [C]/[I] se vuelva hecho downstream.  // [V]/[I]
```

### MODELO DE VARIABLES

```
PROBLEMA_DIAGNOSTICADO{problema_id PK, tenant_id FK, tipo_area, raiz_hipotese, confianza[C], estado, primera_vez_ts, ultima_vez_ts, frecuencia, ruta_sugerida(1de5), provenance_por_campo}  // [I] frozen
ISSUE_TREE{tree_id PK, problema_id FK, paths:[{path_id, hipotese, probabilidad[C], fonte_consultada, resultado(true|false|abierto)}]}  // [I] frozen
AFETADO{afetado_id PK, problema_id FK, cliente_id, id_restaurante, reclamou(bool), silencioso(bool), evidencia}  // [I] frozen
PROCESSO_CRITICO{processo_id PK, nome, score_impacto, falha_silenciosa(bool), fonte_verdade_ref, origem(politica|kb_promovido), schedule}  // [I] frozen
KNOWLEDGE_CASE{kb_case_id PK, tipo_area, padrao, resolucao, probabilidad[C], caminho_usado, links_similares}  // [I] frozen
IMPACTO{impacto_id PK, problema_id FK, restaurantes_afetados, ordens_media, dias, rs_perdido, churn_risk, custo_resolver, valor_ganho}  // [I] frozen
CASO_REPO{caso_id PK, problema_id FK, cliente_id, dia, frecuencia_atuacao, screenshots[], programas_levantados[], links_replicaveis[]}  // [I] frozen
DOSSIER_HANDOFF{dossier_id PK, problema_id FK, los 11 campos del #8}  // [I] frozen

Relaciones:  // [I] frozen
 TENANT 1—N PROBLEMA
 PROBLEMA 1—1 ISSUE_TREE
 PROBLEMA 1—N AFETADO
 PROBLEMA 1—1 IMPACTO
 PROBLEMA 1—1 CASO_REPO
 PROBLEMA N—N KNOWLEDGE_CASE
 PROCESSO_CRITICO 1—N PROBLEMA
 PROBLEMA 1—1 DOSSIER_HANDOFF
```

### Gobernanza / anchor-check

- Type-first (BR-B1): clasifica tipo ANTES de buscar; issue-tree rankeado; NUNCA barre todas las fuentes (Occam → anti-alucinación). // [V]
- Hard-no cross-tenant (BR-B6): ningún dato/insight cruza tenant; el cruce de B es DENTRO del tenant; fail-closed aborta. // [I] hard-no:sí
- Hard-no PII (BR-B7): PII redactada en enriquecimiento + caza-silenciosos + repositorio; fail-closed bloquea persistencia. // [I] hard-no:sí
- k-anon INTERNO (BR-B5): B resuelve el caso del restaurante específico (NO suprime 1 caso); el freno no-dedurar SOLO aplica a salida que cruza tenants. // [V]
- RL guard (BR-B16): el camino usado se guarda para acelerar; revisión humana en lote + detección de divergencia impiden reforzar el camino equivocado. // [V]
- Provenance (BR-B8): cada hipótesis carga [V]/[I]/[C]; la señal nunca se vuelve "hecho" downstream; lo correcto/erróneo = resultados vs hipótesis. // [V]
- B no cierra (BR-B18): diagnostica y rutea; el cierre/confirmación de valor (confirmado+permanente+atribuible) lo otorga el loop downstream. // [I]
- Variables de escenario marcadas [C]: confianza (PROBLEMA_DIAGNOSTICADO, KNOWLEDGE_CASE), probabilidad (ISSUE_TREE.paths), R$ perdido y el X/Y/Z/N de la cascada 1:10 (47/35 silenciosos, R$ X parado) son placeholders de escenario, NO hechos. // [C]
- Espina developable (EPIC-B1..B6) vs fila con traba de calidad (EPIC-B7 máquina de hipótesis + /problem-solving+/sat revisores BR-B19; EPIC-B8 taxonomía MECE): los IDs de fila se describen completos pero NO se buildean en la demo. // [I]
- ID-check: todos los IDs referenciados (EPIC-B1..B8, BR-B1..BR-B19, B.1..B.8, S1..S8, entidades) resuelven al registro canónico; NO se creó ni renumeró ninguno. // [I]



---

## CIERRE — Resolución de build-readiness (blockers · `[C]` · cross-screen)

> Cierra los follow-ups del crítico para que un code-agent no quede con preguntas BLOQUEANTES. Los `[C]` son perillas, no datos faltantes.

### Blockers resueltos (del crítico)
- **B-block-1 — Reconciliación patrón↔score (owner: orquestador, EPIC-B1, ANTES de componer el dossier en B.8):** el `N` del corte de patrón (B.5.3) y `restaurantes_afetados` del impacto (B.7.1) se **deduplican contra el set `AFETADO`** (fuente única de quién-está-afectado, key = `id_restaurante`). Si divergen más allá de `tolerancia_reconciliacion [C]` → **FAIL-CLOSED**: flag `inconsistencia` + degrade-to-human; NO se compone un dossier contradictorio. (Convierte el gancho de F-B1.3 / F-B5.1-edge en un paso ejecutable con dueño.) `[I]`
- **B-block-2 — Universo de población del caza-silenciosos (B.5.1) — excepción explícita a BR-B2:** BR-B2 (fetch perezoso / no-bulk) aplica a las consultas del **camino de diagnóstico** (single-key dirigido por hipótesis). La detección de silenciosos es distinta y legítima: usa una fuente tipo **"población-de-verdad"** que permite un **barrido ACOTADO por `tenant` + `tipo` + `ventana`** (ej.: "todos los restaurantes de este tenant que DEBÍAN cobrar esta semana"). **No es bulk global** — está acotado por tenant (BR-B6) + por el tipo del problema (BR-B9) + por ventana temporal. Sin esa fuente no hay caza-silenciosos (el contrato con `pantalla_05A` lo declara: A reactiva no la cubre). `[I]`

### Minores resueltos
- **Autoridad de prioridad (B.1 vs B.7):** B.1.4 fija prioridad de DESPACHO/cola con impacto **estimado `[C]`**; **B.7.5 es la AUTORIDAD FINAL** del `{ahora|fila}` que va a la ruta (impacto double-checked + `custo_resolver`; last-writer sobre `PROBLEMA_DIAGNOSTICADO.estado` para la ruta). B.1 solo ordena la cola de entrada. `[I]`
- **Owner único del libro-razón:** B.7.6 **calcula/estima** los campos (`custo_resolver`, `valor_ganho`); **B.8.3 es el ÚNICO que PERSISTE el asiento** al cerrar el ruteo — sin doble-escritura. `[I]`
- **Tabla stub del ruteador (demo):** mapeo determinista mínimo `tipo_area → ruta`: finanzas/no-pago + impacto-alto-ahora → **actuar-rápido**; finanzas/no-pago normal → **corregir-interno**; default → **monitorear-con-gatilho**. (Las 5 reglas completas = fila, EPIC-B6.) `[I]`

### Tabla de placeholders `[C]` (perillas — fuente única)
| Símbolo | Gobierna | `[C]` | Dónde |
|---|---|---|---|
| `umbral_clasificacion` | confianza mínima del tipo/área | `[C]` | B.2 |
| `piso_confianza_path` | confianza mínima de PATH A antes de actuar | `[C]` | B.3 |
| `cap_profundidad_arbol` | máx. niveles del issue-tree antes de degrade | `[C]` | B.3 |
| `tolerancia_doublecheck` | banda del double-check de impacto | `[C]` | B.7 |
| `tolerancia_reconciliacion` | divergencia patrón↔score antes de fail-closed | `[C]` | B-block-1 |
| `ventana_silenciosos` | ventana del barrido de población | `[C]` | B.5 |
| `X / Y / Z / N%` (1:10) | tickets/día · relaciones · SLA horas · %escalación (brief) | `[C]` **a definir + defender** | Prueba 1:10 |
| `probabilidad / confianza` | scores del issue-tree / Knowledge Base | `[C]` | B.3 / B.6 |

### Contratos cross-screen + EDITS (se aplican al construir B — bilateral)
- **Atendimiento (`pantalla_05A`):** estampar `tenant_id` + `id_restaurante` DENTRO del episodio (hoy solo en `CONVERSA`); declarar que A es reactiva y NO cubre silenciosos → B requiere la fuente "población-de-verdad". `[I]` bilateral.
- **Pantalla-de-grupos (`01_Cohorts Explorer screen.md`):** **Corte 1** — quitar la rotulación cruda `root_cause_heuristico` (F-3.4, US-3.1.2, BR-11 + derivadas); B es el ÚNICO dueño de la clasificación; la pantalla deja el dato crudo + link. `[I]` bilateral.
- **Eval (P6, no specada):** forward-assert — B consume `cohort×intent` acierto/error para la hipótesis "IA-no-sabía". `[I]`
- **Próxima feature (generación de conocimiento):** recibe el `DOSSIER_HANDOFF` #8 completo (E2E, sin re-trabajo). `[I]`

### OPEN `[I]` no-bloqueantes
- Valores concretos de las perillas `[C]`; los números `X/Y/Z/N` del 1:10 (brief — a definir + defender; "el valor está en el mecanismo").
- Taxonomía completa de categorías (EPIC-B8) y máquina de hipótesis completa con `/problem-solving`+`/sat` (EPIC-B7) = **fila**, descritas; ship incremental con traba de calidad.
- Schema concreto de la celda eval (P6) y de la red de fuentes-de-verdad = a ratificar cuando se especifiquen.


