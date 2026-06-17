# Design: Feature B — Diagnóstico (Orquestrador + Subagentes)

Date: 2026-06-16 · Status: **APPROVED** (Leo, 2026-06-16) · Mode: Builder (take-home demo) · Fonte: sessão /office-hours · Review: 1 round adversarial, 7/10, fixes aplicados
Companion estratégico de la spec detallada que produce el Feature Breakdown Engine (épicas/BR/workflow). Este doc fija el ENCUADRE; la spec fija el detalle.

## Problema
El operador de soporte (Uber Eats, ~5.000 restaurantes / 2 personas) está **ciego al problema que un ticket no muestra**: (a) los **silenciosos** — afectados que nunca abrieron ticket (los restaurantes NO pagados que solo aparecieron al mirar la base); (b) el **patrón** — la disputa/fraude que se concentra en una zona/tipo/comida, imposible de cruzar en tiempo real mientras se atiende. La presión del cliente se trata como costo a vaciar, no como señal. `[V]` (2 casos vividos, Leo)

## Qué lo vuelve "uau" (la cuña)
**El descubrimiento del problema silencioso, en cascada anidada — contada AL REVÉS para el golpe:**
1. **Alguien** (lo real): *"este restaurante está por irse, NUNCA abrió un ticket, el B lo pescó."*
2. **Tamaño**: *"...y no está solo — hay 47 como él, 35 jamás hablaron."*
3. **Impacto**: *"...R$ X parados en pagos que nadie veía."*
> La orquestación (abajo) es el MÍNIMO impecable, NO la manchete. El "uau" es ver lo invisible. `[V]`

## Premisas (acordadas con Leo)
1. La cuña es el problema silencioso en cascada (alguien → tamaño → impacto); la orquestación es table-stakes. `[V]`
2. El "uau" EXIGE una **fuente de población** (base de pagos / catastro) — sin ella no hay silenciosos. En el take-home ese dato es **mock/`[C]`**, pero el **mecanismo** (cruzar universo × quién reclamó) es real y demostrable. `[V]`
3. B = **orquestador + subagentes MECE** (una acción cada uno); el orquestador coordina y ensambla la caracterización completa; ningún subagente hace el trabajo de otro. `[V]`
4. Escopo take-home = **construir la espina convincente** + **describir el resto**; los subagentes no-espina van a una **fila priorizada**, se shipan incrementalmente **con traba de calidad** (nunca entregar mal hecho — Leo). `[V]`

## Arquitectura: Orquestador + Subagentes (decomposición MECE completa)
**Orquestador del B** (runtime) — decide **CUÁNDO** corre B (el gatilho), coordina la secuencia S1→S5, **COMPONE** la caracterización E2E completa (paso propio: dedup + resuelve conflicto S3-patrón ↔ S4-score, lista para la próxima feature, sin trabajo a medias), y aplica los hard-nos transversales (cross-tenant, k-anon, PII).
*(La fila/orden de build NO es función de runtime — vive en «Orden de build». Corrección del review: no confundir el backlog de qué-shipar con el coordinador en ejecución.)*

> **Contratos I/O (mínimos; el detalle fino va en la spec):** S1 `→ {conversation_id, user_id, id_restaurante, cohort, enriched_context(+montos_pago)}` · S2 `→ {affected_set, silent_subset, evidence}` · S3 consume S2 `→ {concentration(dim, valor, N), k_anon_ok}` · S4 `→ {tamaño, dinero, costo_raíz}` · S5 `→ {caso_repo_record, path}`.

| # | Subagente (una acción) | Qué hace | Build |
|---|---|---|---|
| S1 | **Enriquecedor** | junta el contexto completo de cada conversación + `user_id`, cohort, **montos de pago**, otras bases (fetch consciente de performance: inline vs disparado — decisión pendiente) | **Espina** |
| S2 | **Cazador de silenciosos** | **solo pertenencia**: población entera × quién reclamó → **QUIÉN** está afectado y callado (sin agrupar). Guarda contra conjunto silencioso casi-unitario (k-anon) | **Espina** ⭐(motor del uau) |
| S3 | **Detector de patrón** | **sobre la salida de S2** (afectados, NO la población cruda): **DÓNDE** concentra — zona/tipo/comida/grupo/faixa; **aplica k-anon en el agrupamiento** | **Espina** |
| S4 | **Puntuador de impacto** | tamaño + **dinero** (usa los montos que trae S1) + costo-de-arreglar-raíz. *El umbral arreglar-ya vs fila NO es espina → S5/fila.* | **Espina** (scoring) |
| S5 | **Enrutador** | escribe el caso en el repositorio + elige 1 de 5 caminos. **Demo: regla FIJA (stub); las 5 reglas de selección completas → fila.** | **Espina** (stub) |
| S6 | **Clasificador de raíz** | categoría del problema (bug-feature · política · proceso inexistente/quebrado · mau-uso · fraude · injection/seguridad · IA-no-sabía · falta-feature) — MECE a afinar | **Fila** |
| S7 | **Testador de hipótesis** | genera y testa hipótesis (verdadera/falsa) con `/problem-solving` + `/sat` como revisores; "lo correcto/erróneo = resultados vs hipótesis" | **Fila** |

**Los 5 caminos del enrutador (S5):** actuar-rápido · entregar-completo-al-team-dueño · prototipo+testar-hipótesis · corregir-interno (política/conocimiento) · monitorear-con-gatilho.

## Orden de build (espina primero; fila con traba de calidad)

**Eje 1 — subagentes del B (qué corre DENTRO del orquestador):**
- **AHORA (espina, Must/H1):** Orquestador + S1 + S2 + S3 + S4 + S5 → entrega el "uau" end-to-end sobre datos de escenario `[C]`.
- **FILA (Should/Could, H2/H3 — ship cuando esté de alta calidad):** S6 (clasificador completo de categorías) · S7 (máquina de hipótesis con revisores). Se DESCRIBEN completos en la spec; se construyen incrementalmente.

**Eje 2 — pantallas que el demo TOCA (el orquestador no vive solo):** `[V]` (Leo, sesión 06-16)
- **Atendimiento (`pantalla_05A`) = ENTRADA, key.** Genera los tickets que el orquestador procesa. Sin esto no hay flujo de entrada → debe existir en el demo. (Siguen creándose otras pantallas — este eje se actualiza conforme aparecen.)
- **Orquestador + espina (S1–S5) = el motor / el "uau".** Corre en vivo.
- **Cohorts (`01`) + NBA (`02`) = dependencias de CONTEXTO, mock-backed en el demo.** El orquestador las NECESITA para vivir (sin cohort no entiende usuarios/problemas similares; sin NBA no sabe cómo actuar ni en qué KPI concentrarse) — pero en el demo devuelven datos de escenario: el mecanismo se ve, el build completo viene después (de las últimas entregas).
- **KPIs (`03`) = prueba de impacto.** Muestra cómo el B mueve los casos (alimenta el 1:10, abajo).

## Demo (cascada al revés)
Empieza en **un** restaurante (alguien por irse que nunca habló) → zoom-out a los **47 afectados (35 silenciosos)** (tamaño) → **R$ X** parado (impacto). El orquestador coordinando S1→S5 es el "cómo" visible por debajo.
> **Riesgo #1 de demo (del review):** los números (alguien → 47 → R$ X) deben RECONCILIAR entre S1–S4. Autorar **UN solo fixture de escenario** como fuente de verdad, leído por TODOS los subagentes de la espina — si cada subagente tiene su mock, la cascada se desincroniza y rompe. (Empty/degraded path: S2 con 0 silenciosos o población stale → estado honesto, no número inventado.)

## Prueba 1:10 (el número que el brief EXIGE — demostrado, no afirmado) `[V]` (Leo, 06-16)
**Mecanismo del demo:** subir un **lote** de casos (un volumen) → el orquestador corre → encuentra TODOS los problemas (incluidos los silenciosos) y los resuelve/enruta → contraste explícito con el tiempo que UNA persona necesitaría para el mismo lote.
- El golpe: *"subimos N casos; corrió, encontró todos los problemas y los resolvió; una persona necesitaría mucho más tiempo."*
- Los **KPIs (`03`)** muestran el impacto sobre esos casos — no solo velocidad: **efecto** (el problema se movió).
- ✅ **Gap CERRADO (06-16) — números fijados y defendibles (mecanismo, no afirmación):**
  - **X ≈ 300 tickets/día** (equipo de 10) = 30 tickets/agente/día (benchmark IA-asistido) × 10; rango de defensa 210–500 según complejidad. `[C]` ← `[I]` ([Jitbit ~1.000 SaaS](https://www.jitbit.com/news/2266-average-customer-support-metrics-from-1000-companies/))
  - **Y baseline (equipo de 10) ≈ 1.500–2.500 relaciones** = 10 × 144–250 cuentas/CSM (benchmark **SMB tech-touch**) · split **5% managed / 95% long-tail**, nunca sumados. Origen del split vivido `[V]` (250/5.000 = 5%); el 250 = tope banda SMB tech-touch, **NO** enterprise high-touch (22). El 1:10 vive en el **long-tail** (la IA = la persona-de-contenido turbinada + absorbe tickets); el managed (1:1) **NO escala 10×**. `[C]`←`[I]` + split `[V]`
  - **Z = ≤24h managed** · long-tail: respuesta en minutos **con** calidad (la IA rompe el trade-off vivido "rápido pero peor"). `[V]`
  - **N% = 12–15% hoy → meta ~7%** (IA + Knowledge Base); el delta es **parte del** 1:10. `[C]` ← `[I]` ([Stealth Agents 2026](https://stealthagents.com/research/customer-support-escalation-statistics-2026))
  - **Delta solo-vs-IA:** 300 tickets × **5 min** de toque = **~25 h-persona (≈10 personas)** → con IA ≈ **3,4 h (1 persona)**; AHT efectivo 5 min → ~0,7 min/ticket (**~7×**). *(AHT solo `[I]` [Zendesk](https://www.zendesk.es/blog/customer-service/satisfaction/average-handle-time/), ajustado por Leo a 5 min.)*
  - **Regla de honestidad (dos capas):** el **número baseline del equipo-de-10 = BENCHMARK `[I]`** (mercado hoy); **lo vivido (5.000/2 = 250 managed + contenido) = PRUEBA-DE-CAPACIDAD `[V]`** separada, no la aritmética del número. El valor final = `[C/escenario]`; se defiende el **MECANISMO**. Las 3 alternativas por número = apéndice de defensa (no son dato de Musixmatch).

## Ronda 06-16/2 — Mecanismo · Knowledge Base · Proactivo · Handoff `[V]` (todo confirmado por Leo)

### Cómo diagnostica — NO cruza todo: type-first, issue-tree, Knowledge Base
(Occam/karpathy: foco donde está el problema; si no, alucina.) Flujo (ej. no-pago):
1. Llega el problema → **clasifica tipo/área** (finanzas? producto? performance?).
2. Abre un **issue tree**, rankea caminos por probabilidad → va por el más probable (PATH A).
3. **Fetch perezoso, dirigido por la hipótesis**: consulta SOLO la fuente de ese camino (finanzas → tabla de pagos: ¿pagó? no).
4. **Triple-check / caza silenciosos**: ¿abrió ticket? no → silencioso.
5. **Knowledge Base**: ¿ya vimos este tipo? casos parecidos, cómo se resolvieron, probabilidad → foca.
6. PATH A no resuelve → vuelve, PATH B.
7. **Impacto** (restaurantes × órdenes-medias × días → R$ + churn, double-check) → **rutea + guarda** (replicable).
→ **Reordena el diseño:** clasificar-tipo (ex-S6) + issue-tree (ex-S7) suben al FRENTE (thin en la espina; versión completa = fila). El **fetch es perezoso/dirigido** — no enriquece todo (eso mata performance).

### Knowledge Base (pieza central, nueva)
Registro de casos diagnosticados pasados: acelera y ANCLA los nuevos (anti-alucinación), promueve procesos críticos, y es el RL/continuous-improvement. **Guard:** revisión humana en lote + detección de divergencia → NO reforzar un camino equivocado (anti confirmation-bias; el miedo de Leo de "aumentar la probabilidad de estar errado").

### Monitor de procesos críticos (PROACTIVO — fortalece el uau)
B no espera el ticket: VIGILA procesos críticos y pesca el problema ANTES. Un proceso entra al registro de "vigilar" si puntúa alto en 3: **(1) impacto-si-falla · (2) falla en silencio · (3) tiene fuente-de-verdad medible.** Ejemplos `[V]`: **pagos · desconexión abrupta · cobranza incorrecta.** Se vuelve crítico por (a) política/operador que lo declara, o (b) el Knowledge Base que lo promueve (mismo tipo de alto impacto repitiéndose). Acción proactiva: resuelve + **decide si comunica** al cliente — **política configurable** (avisar = transparencia/confianza vs corregir-callado = no-alarmar). **Libro-razón de impacto:** costo-de-resolver vs satisfacción/recurrencia ganada → soporte = generador de valor, no costo (alimenta el 1:10).

### Handoff completo a la próxima feature (#8) — el "dossier del problema"
`{tipo/área + raíz(hipótesis validada + prob/confianza) · evidencia(camino issue-tree + fuente que confirmó + triple-check) · QUIÉN(reclamantes + silenciosos + IDs) · dónde-concentra(corte por tipo) · cuánto(R$ + churn) · cuántas-veces/desde-cuándo(replicable) · casos-similares(KB) · hipótesis(true/false, auditable) · ruta-sugerida(1 de 5) · datos-crudos-ya-buscados(no re-consultar) · provenance [V]/[I]/[C] por campo}`. E2E: completo, sin trabajo a medias, MECE con la próxima feature.

### Subagentes — set final (MECE)
**Orquestador** (gatilho por criticidad+impacto+leverage-agile · secuencia · compone el dossier · hard-nos cross-tenant/PII · agenda el monitor proactivo) **+ subagentes (una acción c/u):** Clasificador-de-tipo · Issue-tree/Hipótesis · Enriquecedor-perezoso · Caza-silenciosos · Detector-de-patrón(corte por tipo) · **Knowledge-Base** · Puntuador-de-impacto · Ruteador+repositorio+libro-razón · **Monitor-de-procesos-críticos (proactivo)**.
- **Espina (demo, thin sobre el fixture de pagos):** versión delgada de todo el flujo end-to-end + el monitor proactivo (= el uau "pescado antes del ticket").
- **Fila (ship con traba de calidad):** taxonomía completa de categorías · máquina de hipótesis completa (+`/problem-solving`+`/sat` revisores, backtracking multi-path) · 5 reglas de ruteo completas · RL completo.

## Hard-nos (transversales, los lleva el orquestador)
- **k-anonymity — CORRECCIÓN (Leo, 06-16):** B es **INTERNO** → DEBE resolver el caso del restaurante específico (hay que saber que es ÉSE para pagarle); **NO se suprime un caso individual**. El freno de no-dedurar aplica SOLO a la salida que **CRUZA tenants** (no filtrar el dato de un tenant a otro). Dentro del tenant, B resuelve aunque sea uno solo. `[V]`
- **Cross-tenant** sigue hard-no (Sony≠Warner). · **PII** en enriquecimiento + detección de silenciosos. · Hipótesis con provenance `[V]/[I]/[C]` (resultados vs hipótesis). `[V]`

## Open Questions (van al grill del Feature Breakdown, organizadas por subagente)
- **S1/S2 (fuente de población):** ¿de dónde viene el universo de restaurantes + su estado (pagado/no)? ¿lectura directa o consulta disparada? (la pregunta #1 del grill)
- **S3:** ¿qué cortes de cruce importan más (zona/tipo/comida/grupo/faixa)?
- **S4:** ¿cómo estima impacto/costo, y el umbral arreglar-ya vs fila?
- **S5:** ¿los 5 caminos cierran MECE? ¿qué decide cada uno?
- **S6:** ¿categorías = un rótulo o varios por problema? ¿la lista cierra?
- **S7:** ¿en qué punto entra el humano a clarear la raíz? ¿qué queda grabado (hipótesis + veredicto)?
- **Repositorio:** un caso ACUMULA en el tiempo (1ª vez, última, frecuencia creciente) — schema + quién lee.
- **Métrica "¿el B acertó?":** ¿el problema desapareció? ¿la hipótesis se confirmó? ¿el humano revisando concordó?
- **Gatilho:** ¿periódico sobre todo / al cruzar un volumen / a cada episodio nuevo?

## Edits cross-screen (a aplicar al construir B — bilateral)
- Pantalla de grupos (`01_Cohorts Explorer screen.md`): **quitar la rotulación cruda** (ticket-un-cohort→gap_conocimiento / cross-cohort→bug; F-3.4, US-3.1.2, BR-11, +5 derivadas) — B es el ÚNICO dueño de la clasificación (Corte 1). Deja solo el dato crudo + link.
- Atendimiento (`pantalla_05A`): **estampar `tenant_id` + `id_restaurante` dentro del episodio** (hoy solo en CONVERSA) con constraint k-anon; declarar que A NO cubre silenciosos (es reactiva) → B requiere fuente de población fuera de A.

## Success Criteria
- La demo aterriza el "uau" (alguien → 47 → R$ X) sobre datos de escenario `[C]`, con el mecanismo real.
- La espina (Orquestador + S1–S5) corre end-to-end.
- Cada subagente shipado es de alta calidad (traba de Leo: nunca mal hecho).

## Next Steps
**Open Questions del grill = RESUELTAS (sesión 06-16):** fuente de población (issue-tree type-first sobre la red de fuentes-de-verdad) · enriquecedor (fetch perezoso/dirigido) · k-anon (interno: NO suprime) · cortes (por tipo de problema) · impacto (R$ + churn) · repositorio (replicable + Knowledge Base) · gatilho (criticidad + impacto + monitor proactivo) · handoff (#8 dossier). → **READY-TO-SYNTH:** sintetizar la spec del B (9 subagentes; espina developable thin sobre fixture de pagos; fila `[I]`/needs-prototype) vía fan-out por subagente + ID-freeze + crítico de completud + build-readiness.

## Lo que noté de cómo pensás
- *"el (B) es el uau, lo que no se está esperando"* — separás el mínimo impecable de la sorpresa. Eso es instinto de demo, no de feature-list.
- *"no descartaría... lo dejaría en la fila, voy shipando conforme... sin entregar muy mal hecho"* — incrementalismo con traba de calidad, no scope-cut ciego.
- Tu insistencia en MECE pescó el sobrecargo del agente único antes que yo. El reframe (orquestador + subagentes) salió de vos, no de mis 3 opciones.
