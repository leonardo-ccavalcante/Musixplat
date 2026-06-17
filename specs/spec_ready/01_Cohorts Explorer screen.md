# Cohorts Explorer — Feature Breakdown (versión final · sesión Leo)
> Salida del Feature Breakdown Engine sobre el STARTING POINT validado con Leo (cohort = MATRIZ tenure×tier). Reusa+extiende el draft `pantalla_01_cohorts_explorer.md` (que queda SUPERADO por este). ES; provenance por línea `[V]/[I]/[C]`. 3 features validadas por Leo ("de acuerdo"): **A** perfil+topo-vs-base+upside · **B** agente periódico+log con el porqué · **C** simular-ahora. Contrato NBA(P2)/Goals(P3) **asertado en P1** (`[I]` bilateral — pendiente de ratificar en los docs consumidores; ver Decisiones).

## Decisiones validadas (sesión)
- Operador = **agent-manager**; esta pantalla = **read-only** (observa y apunta, NUNCA ejecuta / no toca dinero / no eleva autonomía).
- Cohort = **MATRIZ (tenure_bucket × tier_base)** + **SUBGRUPOS** (2 niveles). [V Leo]
- 3 features: **A** perfil del cohort (síntesis visual+escrita) + topo-vs-base + **upside** ("si la base operara como el tope, ¿cuánto más?"); **B** agente periódico de re-segmentación + **log de movimientos con QUÉ variables lo causaron**; **C** botón **simular-ahora** (sandbox preview, no-commit). [V Leo "de acuerdo"]
- `at_risk` = bajó de percentil/cohort o patrón pre-churn · `risk_class` nace en **NBA/Política**, no aquí · números (`n_min`,`k`,`TTL`,bordes tenure-bucket) = `[C]` placeholder. [V Leo]
- **FUERA DE ALCANCE** (cohort explorer only): autonomía/pausar-liberar (= `02_NBA`); ejecución de acciones; intake real de tickets (P5); motor de atribución de dinero (P3/P11). Aquí se **LEE/LINKA**, no se posee.
- **Contrato cross-screen = `[I]` BILATERAL** (no `[V]`): los campos que P1 produce para NBA/Goals (`scope_owner_ref`, `n_cohort_x_intent`, `n_min_ok`, `freshness_ts`, `baseline_atribucion_segmento`, payload de handoff con `tenant_id`/`subgrupo_id`) están **asertados aquí**; los docs consumidores (`02_NBA`, `03_Goals`) aún NO los nombran → open item en LOS DOS docs; solo pasa a `[V]` cuando ambos lados lo ratifican. `[I]`

## Registro canónico de IDs (BR / EC) + crosswalk
> OUTPUT 2 es el registro canónico de Business Rules y Edge Cases. Numeración alineada (BR-7=colapso / BR-15=k-anonymity; refs `EC-<n>` de OUTPUT 1/3 → tabla de OUTPUT 2) **salvo 1 residual documentado abajo** (EC-4 en el Recorrido = stale-baseline, sin fila EC dedicada → regido por BR-12).
> - **BR (significancia vs re-identificación):** son DOS reglas distintas. **BR-7 = colapso de celda `n<n_min`** (significancia estadística — "la matriz no explota la tela"). **BR-15 = k-anonymity (`N<k`)** (anti-re-identificación, aguas-arriba en P1). En todo el documento BR-7 = colapso y BR-15 = k-anonymity; ya no hay ocurrencia de BR-7 usada para k-anonymity.
> - **EC:** toda referencia `EC-<n>` en OUTPUT 1 y 3 apunta a la fila `EC-<n>` de la tabla canónica de OUTPUT 2 (p. ej. anti-mezcla/delta-cross-versión = EC-3; tenant sin cohorts/estado vacío = EC-8; ticket sin cohort = EC-5).
> - **Residual:** el estado "baseline/snapshot de percentil stale" (Recorrido, estado error/stale) referencia EC-4, pero OUTPUT 2 no tiene una fila EC dedicada a ese estado (EC-9 cubre stale de dinero/tickets, EC-12 stale de simulación); la regla dura aplicable es BR-12 (baseline/snapshot stale por TTL).
> Toda referencia `[V·EC-x]` / `[V·BR-x]` resuelve contra la tabla canónica de OUTPUT 2.

# OUTPUT 1 — ÉPICAS, USER STORIES & RECORRIDO · Cohorts Explorer (matriz tenure×tier)

**SÍNTESIS:** el Cohorts Explorer es UNA sola pantalla de comando — enxuta, opinativa, calma — que responde dos preguntas a la vez: *¿cómo está el negocio por cohort?* y *¿dónde actúo?*, organizada en 4 camadas (semáforo → fila → panorama → drill) y responsiva. El cohort deja de ser solo `tier` y pasa a ser una **CELDA de la matriz `tenure_bucket × tier_base`**, ahora con **SUBGRUPOS** (cohort → subgrupo, 2 niveles), lo que multiplica las celdas y vuelve crítico el gate `n_min` POR CELDA Y POR SUBGRUPO: las celdas/subgrupos con `n < n_min` se **COLAPSAN** (agregan/atenúan), nunca explotan la tela; y el gate **k-anonymity** (`N < k`, distinto de `n_min`) **SUPRIME** insight/P90+/subgrupo aguas-arriba en P1 para no re-identificar. Se reusa íntegro el núcleo del draft autónomo (segmentación por regla versionada, `percentil_en_cohort`, `gap_hasta_top`, `baseline_cohort`, patrón P90+, gate `n_min` fail-closed, cross-tenant hard-no, handoff read-only a NBA, baseline para North Star) y se EXTIENDE con: **(A)** PERFIL del cohort (síntesis gráfica+escrita de "quién es") + vista **TOPO-vs-BASE** del subgrupo (qué hacen los P90+ distinto de los P-bajos) + cálculo de **UPSIDE** ("si los de abajo operaran como los de arriba, ¿cuánto más?", `[C]` mientras no haya telemetría, lectura no acción); **(B)** dashboard de status (semáforo + DELTAS con el PORQUÉ/feature-attribution) + **LOG de movimientos** alimentado por un **AGENTE periódico de re-segmentación**; **(C)** botón **"correr ahora"** (simular/mock sandbox read-only, no-commit); más vistas de negocio EXIBIDAS/linkadas (dinero pos-NBA, tickets señal-cruda — conteo+distribución, clasificación = Feature B) y modales de info + changelog del ML. Sin esta pantalla, el motor pierde el eslabón 2→3: NBA no sabe a quién mover ni hacia qué patrón, y el North Star pierde el baseline contra el que mide movimiento de percentil + valor atribuible. [V: STARTING POINT Leo · §4 Pantalla 1] [I: matriz tenure×tier como extensión del draft solo-tier] [V: 3 features A/B/C validadas por Leo "de acuerdo"] [V: subgrupo confirmado por uso]

**PROBLEMA:** en una ÚNICA tela, el operador necesita noción clara del STATUS del negocio por cohort + saber DÓNDE actuar + entender QUIÉN es cada cohort y QUÉ separa a los mejores de la base + POR QUÉ alguien se movió, SIN overthinking ni overload — hoy ve miles de cuentas pero no dónde está el potencial, qué separa a los mejores de la media, ni qué cohorts se degradan ni por qué. El riesgo es DOBLE: exceso de información (un BI) Y exceso de telas. La matriz tenure×tier + subgrupos agrava el overload (más celdas) si no se colapsan las no-significativas y no se suprime lo no-anonimizable. [V: STARTING POINT Leo] [V: Feature A "quién son" + topo-vs-base; Feature B "por qué"]
**OUTCOME:** mover el North Star = movimiento de percentil dentro del cohort + valor atribuible, y alimentar la NBA con intención priorizada. La pantalla da (a) el baseline de percentil versionado contra el que el North Star mide movimiento, (b) el handoff read-only que NBA consume (payload ampliado, ver EPIC-5), (c) la lectura de OPORTUNIDAD (upside dimensionado, atribuible, `[C]` sin telemetría) y (d) la explicación CAUSAL de cada movimiento (feature-attribution en el log). El movimiento de percentil solo cuenta como valor cuando es confirmado/atribuible. [V: STARTING POINT · §3 atribución pre-condición] [V: Feature A upside como lectura/proyección, no acción]

**PLACEMENT:** esta pantalla = **1 de 11** del cockpit (área: segmentación / eslabón 2 del motor). Aguas-arriba: Ficha/Cerebro (#7, grounding) y Política/Tier (#10, `tier_base`/`teto_tier`). Aguas-abajo: NBA/Playbooks (#2, consume el evento priorizado), North Star/Goals (#3, baseline de movimiento, cadencia SEMANAL), Evals (#6, celda `cohort × intent`). VISTAS EXIBIDAS/LINKADAS (no poseídas): dinero pos-NBA → fuente P3 (#3 Goals/KPIs) + P11 (#11 Salud); tickets (conteo+distribución, señal cruda — la CLASIFICACIÓN/diagnóstico de la causa es de la Feature B / diagnóstico del área Support, NO de esta pantalla; Corte 1, MECE) → fuente Support (#5); changelog del ML = versionado de `cohort_rule_version` (BR-3). **FUERA DE ALCANCE** [V, Leo "cohort explorer ONLY"]: el control de autonomía / pausar-liberar (= 02_NBA cockpit); ejecutar acciones; el intake real de tickets (P5); **la CLASIFICACIÓN/diagnóstico de la causa del ticket (= Feature B diagnóstico del área Support, dueña única — Corte 1; la pantalla solo expone el conteo crudo + distribución + link, no rotula)**; el motor de atribución de dinero (P3/P11); **el `risk_class` (reversible/financiero/cross-tenant) NACE EN NBA/Política, NO en P1** — P1 es read-only, solo observa y apunta; **simular (Feature C) es sandbox preview no-commit** — no cambia cohorts persistidos ni toca dinero. El Cohorts Explorer LEE/LINKA esos, no los posee. [V: STARTING POINT FORA DE ESCOPO] [V: risk_class nace en NBA/Política; simular=sandbox]

---

## Épicas (MECE; descomponen ESTA pantalla sin solape; cada una desarrollable)

> EPIC-1..5 conservadas del build previo y EXTENDIDAS; EPIC-6 nueva (Feature C). Feature A integrada en EPIC-1 (perfil + subgrupo topo-vs-base + upside) y EPIC-2 (síntesis en semáforo) y EPIC-4 (modal síntesis). Feature B integrada en EPIC-2 (deltas con porqué) + nueva sub-capa log+agente dentro de EPIC-2. Numeración US consistente: `US-<epic>.<feature>.<n>`. [V: NUMBERING-FIX exigido por el crítico] [V: EPIC nuevas Leo]

---

### EPIC-1 · Segmentación matriz tenure×tier + SUBGRUPOS + percentil / gap / P90+ + PERFIL + UPSIDE  *(mixto: reuso+extensión; integra Feature A)*

**Alcance:** agrupar cada cuenta en una CELDA de la matriz `cohort = (tenure_bucket: 0-3m / 3-6m / 6-12m / 12m+ [C]) × (tier_base: managed_brand / managed_midmarket / long_tail)` y, dentro de cada celda, en un **SUBGRUPO** (2 niveles: cohort → subgrupo, con `N_subgrupo`), por regla versionada, y calcular por cuenta `percentil_en_cohort`, `gap_hasta_top`, `baseline_cohort` y el patrón "qué hacen los P90+". EXTIENDE con Feature A: **PERFIL del cohort** (síntesis de características de "quién es ese cohort"), vista **TOPO-vs-BASE** (características P90+ vs P-bajos lado a lado) y cálculo de **UPSIDE** ("si la base operara como el tope, ¿cuánto más?"). Reusa F-1.1/F-1.2/F-1.3 + P90+ y los extiende al eje matriz + subgrupo. Gate `n_min` POR CELDA Y POR SUBGRUPO con COLAPSO; gate **k-anonymity** (`N < k`) con SUPRESIÓN aguas-arriba (gate DISTINTO de `n_min`). [V: reuso draft EPIC-1/EPIC-2] [I: eje matriz] [V: subgrupo + topo-vs-base + upside Leo] [V: k-anonymity gate distinto de n_min, anotar `supresion_k_aplicada`]
**Cubre dims:** DATA-IN(3), PROCESSING(4), ROUTERS(5), BUSINESS-RULES(8 parcial).
**WHAT/HOW:** cohort = celda `(tenure_bucket × tier_base)` por `cohort_rule_version`; subgrupo = partición de 2º nivel dentro de la celda con `N_subgrupo`; `n_min` POR CELDA Y POR SUBGRUPO (fail-closed: `n < n_min` → COLAPSA/agrega u oculta+aviso, NUNCA explota la matriz); `k-anonymity` (`N < k`) → SUPRIME insight/P90+/subgrupo (re-identificación), aplicado AGUAS-ARRIBA en P1, anotado `supresion_k_aplicada`; cross-tenant hard-no; degradación a regla determinística mínima si `knowledge_de_cohort` ausente; provenance visible POR CAMPO. HOW: job batch versionado que persiste en Cerebro; percentil por ranking dentro de la celda/subgrupo; gap = `métrica_top − métrica_cuenta`; patrón P90+ por dimensiones canónicas (estructura promo, ventana, fuso) ancladas. **PERFIL**: síntesis descriptiva de atributos canónicos del cohort (tenure medio, mix de tier, intents dominantes, conexión/recurrencia) — dataviz honesta (Cairo) + 1 mensaje (Knaflic). **TOPO-vs-BASE**: comparación de características de P90+ vs P-bajos (P10/P25 `[C]`) en las mismas dimensiones canónicas. **UPSIDE**: `upside = f(brecha_base_vs_tope × n_base)`, dimensionado en dinero/impacto, **atribuible** y **marcado `[C]` mientras no haya telemetría** (nunca estimado vendido como real); usa el `baseline_descriptivo` (qué hacen los P90+, aspiracional), NO el `baseline_atribucion_segmento`. La **regla de colapso de celdas/subgrupos** (umbral, jerarquía de agregación), la **definición de la partición de subgrupo** y los **bordes de P-bajos para topo-vs-base** = juicio de producto → outcome+constraint, [I] needs-prototype.

**Features:**
- **F-1.1 · Definición/versionado de la regla de cohort-celda + subgrupo** — la pertenencia se determina por regla versionada `(tier_base + tenure_bucket + atributos canónicos)` + partición de subgrupo de 2º nivel con `N_subgrupo`; nunca ad-hoc; el `cohort_id` identifica una CELDA, el `subgrupo_id` el 2º nivel. [V: reuso draft F-1.1 · §2 regla versionada] [I: extensión a celda] [V: entidad subgrupo Leo]
- **F-1.2 · Cálculo batch de percentil + gap + baseline POR CELDA Y SUBGRUPO** — job versionado que persiste el resultado de cada celda/subgrupo en el Cerebro; **DOS baselines distintos**: `baseline_descriptivo` (P90+, aspiracional, para upside Feature-A) y `baseline_atribucion_segmento` (contrafactual/holdout, para Goals/North Star — incremento vs gross). [V: reuso draft F-1.2] [I: batch vs tiempo-real adoptado batch] [V: dos baselines Leo]
- **F-1.3 · Gate `n_min` POR CELDA Y SUBGRUPO con COLAPSO (no explosión)** — celda/subgrupo `n < n_min` se agrega/atenúa u oculta+aviso; nunca se emite percentil sobre ruido ni se multiplica la tela. [V: reuso draft F-1.3 / BR-2] [I: regla de colapso → needs-prototype]
- **F-1.3b · Gate `k-anonymity` con SUPRESIÓN aguas-arriba (gate DISTINTO de `n_min`)** — si `N < k` se SUPRIME insight/P90+/subgrupo en P1 (riesgo de re-identificación, distinto de significancia estadística), anotando `supresion_k_aplicada`. [V: k-anonymity aguas-arriba en P1, gate distinto Leo]
- **F-1.4 · Patrón "qué hacen los P90+" por celda/subgrupo** — agrega características de las cuentas con percentil ≥ 90 DENTRO de la celda/subgrupo; degrada si knowledge insuficiente; poblará el `baseline_descriptivo`. [V: reuso draft EPIC-2]
- **F-1.5 · PERFIL del cohort (síntesis gráfica + escrita de "quién es")** *(Feature A)* — resumen descriptivo de las características del cohort (tenure medio, mix tier, intents dominantes, KPIs de `baseline_cohort`: conexión / tickets / recurrencia / cross_sell + ventana), una vista = una mensagem, dataviz honesta. [V: Feature A perfil visual+escrito; Cairo+Knaflic]
- **F-1.6 · Vista TOPO-vs-BASE del subgrupo** *(Feature A)* — al entrar a un subgrupo, características de P90+ vs P-bajos lado a lado, en dimensiones canónicas, para ver qué hace distinto el tope. [V: Feature A topo-vs-base]
- **F-1.7 · Cálculo de UPSIDE ("si la base = el tope, ¿cuánto más?")** *(Feature A)* — dimensiona la OPORTUNIDAD en dinero/impacto, **atribuible**, usando `baseline_descriptivo`; marcado **`[C]` mientras no haya telemetría** (nunca estimado-vendido-como-real); es lectura/proyección, NO acción. [V: Feature A upside; provenance [C] sin telemetría; lectura no acción]
- **F-1.8 · `baseline_cohort` poblado con `valor_actual_kpi` por KPI** — por `{conexion, tickets, recurrencia, cross_sell}` + ventana; provenance `[V]` cuando hay telemetría, si no `[C]`. [V: folrar baseline_cohort con valor_actual_kpi Leo]

**US-1.1.1** | MoSCoW: **Must** | Hito: H2 — Como **agent-manager 1:10**, quiero que el sistema **asigne cada cuenta a una celda `(tenure_bucket × tier_base)` y a un SUBGRUPO por regla versionada**, para confiar en que la comparación es estable, auditable y refleja tiempo-de-casa, tier y partición fina. [V: reuso draft US-1.1.1 extendido + subgrupo]
- Given una cuenta con `tier_base`, `tenure_actual` y atributos canónicos resueltos, When corre el job de segmentación, Then la cuenta queda asignada a exactamente una celda `cohort_id = (tenure_bucket × tier_base)` y a un `subgrupo_id` según `cohort_rule_version` vigente, con `tenure_bucket` derivado de `tenure_actual`. [V/I]
- (edge) Given que cambia la regla de cohort, When se publica `cohort_rule_version` nueva, Then los percentiles se recalculan contra el nuevo baseline y la versión queda **estampada POR FILA/EVENTO** (`def_version`); no se mezclan baselines de versiones distintas en una misma vista, y una serie que cruza un cambio de regla se MARCA (no presenta movimiento falso → garantiza A=B). [I: re-versionado — coherente con EC-3] [V: cohort_rule_version estampada por fila/evento; A=B]
- (edge) Given una celda o subgrupo con `N < k`, When se renderiza, Then se SUPRIME el insight/P90+/subgrupo (k-anonymity, aguas-arriba) y se anota `supresion_k_aplicada`; este gate es DISTINTO de `n_min`. [V: k-anonymity gate distinto]

**US-1.1.2** | MoSCoW: **Must** | Hito: H2 — Como **agent-manager 1:10**, quiero ver para cada cuenta su `percentil_en_cohort` y `gap_hasta_top` **dentro de su celda Y de su subgrupo**, para priorizar a quién mover primero. [V: reuso draft US-1.1.2]
- Given una celda/subgrupo con `n_cuentas ≥ n_min [C: 20]` y `N ≥ k [C]`, When abro la fila de una cuenta, Then veo `percentil_en_cohort`, `gap_hasta_top` y `baseline_cohort`, cada valor con su sello de provenance POR CAMPO. [I: n_min=20 placeholder, k=[C], falsify-probe "¿mediste o supusiste?"]
- (edge) Given una celda/subgrupo con `n_cuentas < n_min`, When se renderiza, Then NO se muestra percentil: se COLAPSA (se agrega a un nivel superior o se atenúa con aviso "n insuficiente para percentil significativo"); fail-closed. [I: colapso vs ocultar → needs-prototype]

**US-1.1.3** | MoSCoW: **Must** | Hito: H2 — Como **responsable de gobernanza**, quiero que el percentil **nunca se calcule cruzando tenants**, para no violar el aislamiento Sony≠Warner. [V: reuso draft US-1.1.3 · §8.3/§10]
- Given cuentas de tenants distintos, When corre la segmentación, Then ninguna cuenta de un tenant entra en el baseline/benchmark/subgrupo de otro, salvo como agregado anonimizado dentro del mismo tenant. [V]
- (edge) Given una consulta que requeriría cruzar tenants para "comparar mejor", When se evalúa, Then se BLOQUEA (hard-no absoluto) + log de evento de seguridad. [V: §10/§8.3]

**US-1.1.4** | MoSCoW: **Should** | Hito: H2 — Como **agent-manager 1:10**, quiero un resumen **"qué hacen los P90+" de la celda/subgrupo**, para anclar la NBA en el comportamiento de los mejores en vez de en intuición. [V: reuso draft US-2.1.1]
- Given una celda/subgrupo con `n_cuentas ≥ n_min`, `N ≥ k` y `knowledge_de_cohort` suficiente, When la abro, Then veo el patrón de los P90+ descrito por dimensiones canónicas (estructura promo, ventana, fuso), cada una con provenance, poblando el `baseline_descriptivo`. [V/I]
- (edge) Given `knowledge_de_cohort` ausente o sesgado, When se intenta derivar el patrón, Then NO se emite un score con apariencia autoritativa; se degrada a regla determinística mínima y se señala la laguna. [V: reuso draft AC4 / DET-09]

**US-1.1.5** | MoSCoW: **Must** | Hito: H2 — Como **agent-manager 1:10**, quiero un **PERFIL del cohort (síntesis gráfica + escrita de "quién es")**, para entender de un vistazo a qué tipo de usuarios estoy mirando antes de actuar. *(Feature A)* [V: Feature A perfil]
- Given una celda con `n ≥ n_min` y `N ≥ k`, When abro su perfil, Then veo una síntesis ESCRITA (1 mensagem) + GRÁFICA (dataviz honesta, sin escalas engañosas) de sus características: tenure medio, mix de tier, intents dominantes y `valor_actual_kpi` por `{conexion, tickets, recurrencia, cross_sell}` + ventana, cada uno con provenance POR CAMPO (`[V]` si telemetría, si no `[C]`). [V/I]
- (edge) Given una celda con `N < k`, When se intenta mostrar el perfil, Then se SUPRIME (no se puede caracterizar sin re-identificar) y se anota `supresion_k_aplicada`. [V: k-anonymity]

**US-1.1.6** | MoSCoW: **Must** | Hito: H2 — Como **agent-manager 1:10**, quiero ver **lado a lado las características de los percentiles ALTOS (P90+) vs los BAJOS** al entrar a un subgrupo, para saber QUÉ hacen distinto los de arriba. *(Feature A)* [V: Feature A topo-vs-base]
- Given un subgrupo con `n ≥ n_min` y `N ≥ k`, When entro, Then veo dos columnas comparables (P90+ vs P-bajos `[C: P10/P25]`) en las mismas dimensiones canónicas, con la diferencia destacada (atributo preatentivo, 1 mensagem), provenance por campo. [V/I]
- (edge) Given P-bajos o P90+ con `N < k` dentro del subgrupo, When se renderiza, Then la columna afectada se SUPRIME (k-anonymity), no se infiere. [V: k-anonymity]

**US-1.1.7** | MoSCoW: **Should** | Hito: H3 — Como **agent-manager 1:10**, quiero ver el **UPSIDE dimensionado** ("si la base operara como el tope, ¿cuánto generaríamos de más?"), para dimensionar la OPORTUNIDAD en dinero/impacto — sabiendo que es una lectura, no una acción. *(Feature A)* [V: Feature A upside; lectura no acción]
- Given un subgrupo con topo-vs-base disponible y `baseline_descriptivo` poblado, When abro el upside, Then veo la oportunidad dimensionada `= f(brecha_base_vs_tope × n_base)` en dinero/impacto, **atribuible**, marcada **`[C]` mientras no haya telemetría** (proyección, NUNCA estimado-vendido-como-real), usando el `baseline_descriptivo` (no el `baseline_atribucion_segmento`). [V: provenance [C]; usa baseline descriptivo]
- (edge) Given que no hay telemetría que confirme la brecha, When se muestra el upside, Then permanece `[C]` (proyección) y NUNCA se promueve a `[V]`; no dispara acción aquí (read-only). [V: nunca estimado vendido como real; read-only]

---

### EPIC-2 · Dashboard de status enxuto: semáforo + síntesis de perfil + DELTAS CON EL PORQUÉ + LOG + AGENTE periódico  *(nuevo; integra Feature A síntesis y Feature B completa)*

**Alcance:** la capa de RELANCE + la capa de MOVIMIENTO. (1) Semáforo de salud de la matriz (verde/ámbar/rojo por celda, atributos preatentivos, una mensagem por vista) con **síntesis del perfil** del cohort embebida (Feature A en relance). (2) Panel de DELTAS desde el último snapshot: quién cambió de cohort, subió/bajó de percentil, está at-risk, es nuevo, churnó — **CON EL PORQUÉ**: qué variables causaron cada movimiento (explainability / feature-attribution), no solo "qué" sino "por qué" (Feature B). (3) Nueva **sub-capa LOG + AGENTE**: un agente corre PERIÓDICAMENTE (batch versionado), re-segmenta y mantiene un LOG CLARO de movimientos con explicación causal embebida, anclado a `cohort_rule_version`. Lectura, no acción. [V: STARTING POINT VISTAS (a)(b)] [V: Feature B agente periódico + log con porqué; Feature A síntesis en semáforo] [I: render del semáforo y orden de deltas → needs-prototype]
**Cubre dims:** PROCESSING(4), DATA-OUT(6 parcial), UI/STATES(7), METRICS(10 parcial).
**WHAT/HOW:** el semáforo y los deltas se computan comparando el snapshot vigente vs el anterior, siempre dentro del mismo tenant y respetando `n_min` por celda/subgrupo y `k` (delta sobre celda colapsada/no-significativa no se emite como movimiento de percentil, solo cualitativo; delta sobre celda con `N < k` se suprime). **DELTA promovido de UI a EVENTO consumible**: `percentil_delta{sentido(subio|bajo|igual), magnitud, ventana, n_min_ok}` + `delta_status{mudou_cohort | melhorou_percentil | baixou_percentil | at_risk | novo | churn}`. Cada entrada del log lleva **feature-attribution** (qué variables movieron a la cuenta) y ancla a `cohort_rule_version`. El **AGENTE** corre periódicamente (batch versionado): re-segmenta, calcula deltas, escribe el log; es read-only (no ejecuta, no mueve dinero, no eleva autonomía). Honestidad dataviz (Cairo + Knaflic). El render exacto del semáforo, el orden de los deltas, la cadencia del agente y la regla de `at_risk` (= bajó de percentil/cohort O entra en patrón pre-churn) = juicio de producto → outcome+constraint, [I] needs-prototype.

**Features:**
- **F-2.1 · Semáforo de salud de la matriz + síntesis de perfil** — estado verde/ámbar/rojo por celda + síntesis escrita/gráfica del perfil del cohort (Feature A) en el relance; celdas colapsadas se agregan/atenúan, las de `N<k` se suprimen; una sola mensagem. [V: STARTING POINT CAMADA 1 + Feature A síntesis] [I: heatmap vs chips → needs-prototype]
- **F-2.2 · Cómputo de DELTAS entre snapshots (evento consumible)** — diff `snapshot_to` vs `snapshot_from` que emite `percentil_delta{sentido, magnitud, ventana, n_min_ok}` + `delta_status{mudou_cohort|melhorou_percentil|baixou_percentil|at_risk|novo|churn}`. [V: STARTING POINT VISTA (b) + DELTA promovido a evento Leo]
- **F-2.3 · Panel de DELTAS priorizado** — render de los deltas con `at_risk`/`precisa-acción` arriba; `percentil_delta` null si la celda era no-significativa. [I: orden y regla `at_risk` → needs-prototype]
- **F-2.4 · DELTAS CON EL PORQUÉ (feature-attribution / explainability)** *(Feature B)* — cada movimiento muestra QUÉ VARIABLES lo causaron (no solo qué cambió), embebido en el delta y en el log. [V: Feature B explainability]
- **F-2.5 · AGENTE periódico de re-segmentación** *(Feature B)* — agente batch versionado que corre periódicamente, re-segmenta y emite deltas + log; read-only (no ejecuta/no dinero/no autonomía). [V: Feature B agente periódico]
- **F-2.6 · LOG de movimientos con el porqué (anclado a versión)** *(Feature B)* — log claro: quién subió/bajó de cohort, quién subió/bajó de percentil, con la explicación causal; cada entrada ancla a `cohort_rule_version`. [V: Feature B log + porqué + ancla a versión]
- **F-2.7 · `gap_hasta_top` como leading-indicator consumible** — expone `{valor, unidad, cohort_rule_version}` aguas-abajo (no solo UI). [V: folrar gap_hasta_top leading-indicator consumible Leo]

**US-2.2.1** | MoSCoW: **Must** | Hito: H2 — Como **agent-manager 1:10**, quiero un **semáforo de salud de la matriz tenure×tier con la síntesis del perfil de cada cohort de un vistazo**, para tener noción del STATUS y de QUIÉN es cada cohort sin leer una tabla. [V: STARTING POINT CAMADA 1 + Feature A síntesis]
- Given el snapshot vigente cargado, When entro a la pantalla, Then veo la matriz con un estado verde/ámbar/rojo por celda + una síntesis breve del perfil del cohort, y una sola mensagem de cabecera (no múltiples métricas compitiendo). [V/I]
- (edge) Given celdas con `n < n_min`, When se renderiza el semáforo, Then esas celdas se COLAPSAN/atenúan ("n insuficiente") y nunca multiplican la tela; Given `N < k`, Then se SUPRIME el perfil/síntesis (k-anonymity). [I: colapso → needs-prototype] [V: k-anonymity]

**US-2.2.2** | MoSCoW: **Must** | Hito: H2 — Como **agent-manager 1:10**, quiero un **panel de DELTAS desde el último snapshot** (quién cambió de cohort, subió/bajó de percentil, está at-risk, es nuevo, churnó), para saber DÓNDE actuar sin escarbar. [V: STARTING POINT VISTA (b)]
- Given dos snapshots consecutivos del mismo tenant, When se computa el diff, Then cada movimiento emite `percentil_delta{sentido(subio|bajo|igual), magnitud, ventana, n_min_ok}` + `delta_status{mudou_cohort|melhorou_percentil|baixou_percentil|at_risk|novo|churn}` (MECE) con su provenance por campo. [V/I: DELTA evento]
- Given el panel de deltas, When lo leo, Then los `at_risk` / `precisa-acción` aparecen priorizados arriba (atributo preatentivo), una mensagem por vista. [I: orden exacto → needs-prototype]
- (edge) Given una celda colapsada (`n < n_min`), When se genera un delta, Then `percentil_delta = null` (`n_min_ok=false`) y el delta se emite solo cualitativo (nunca alimenta el North Star como "movimiento de percentil"); Given `N < k`, Then el delta se SUPRIME. [I: coherente con BR-2] [V: k-anonymity]

**US-2.2.3** | MoSCoW: **Should** | Hito: H2 — Como **agent-manager 1:10**, quiero que el semáforo y los deltas **respeten la honestidad de dataviz** (forma sigue función, no engañar), para confiar en lo que veo y no ser inducido a una falsa urgencia. [V: STARTING POINT dataviz Cairo+Knaflic]
- Given cualquier vista del dashboard, When se renderiza, Then no se usan escalas truncadas/engañosas ni se mezclan unidades incomparables; cada vista transmite una sola mensagem. [I: especificación visual → needs-prototype]

**US-2.2.4** | MoSCoW: **Must** | Hito: H3 — Como **agent-manager 1:10**, quiero ver **POR QUÉ se movió cada cuenta** (qué variables causaron el movimiento), para no solo saber QUÉ cambió sino entender la causa y decidir mejor. *(Feature B)* [V: Feature B explainability / feature-attribution]
- Given un movimiento en el log/panel de deltas, When lo abro, Then veo la feature-attribution: qué variables (p.ej. caída de conexión, alza de tickets, cambio de tenure_bucket) explican el `delta_status`, ordenadas por contribución, con provenance. [V/I]
- (edge) Given que la explicación no es atribuible con confianza, When se muestra, Then se marca `[C]`/`[I]` (no se presenta una causa fabricada como `[V]`). [V: no inventar; provenance]

**US-2.2.5** | MoSCoW: **Must** | Hito: H3 — Como **agent-manager 1:10 / gobernanza**, quiero un **LOG claro de movimientos** (quién subió/bajó de cohort y de percentil) **con su porqué y anclado a la versión de regla**, para auditar la evolución de la cartera en el tiempo. *(Feature B)* [V: Feature B log + porqué + ancla a versión]
- Given el log de movimientos, When lo abro, Then veo entradas `{account_id, de→a (cohort/percentil), delta_status, feature_attribution, cohort_rule_version, timestamp}`, cada una con su explicación causal embebida. [V/I]
- (edge) Given una entrada cuyo movimiento cruza un cambio de `cohort_rule_version`, When se muestra, Then se MARCA el cruce de versión (no se presenta como movimiento real falso → A=B). [V: cohort_rule_version estampada; A=B]

**US-2.2.6** | MoSCoW: **Should** | Hito: H3 — Como **responsable del motor**, quiero un **AGENTE que corra periódicamente, re-segmente y mantenga el log**, para que los deltas y el log se generen solos en cada batch versionado — sin que ejecute ni mueva dinero. *(Feature B)* [V: Feature B agente periódico; read-only]
- Given la cadencia configurada `[C]` (alineable a la cadencia SEMANAL de Goals), When dispara el agente, Then re-segmenta, calcula deltas, escribe el log y persiste un nuevo `PERCENTIL_SNAPSHOT` versionado; NO ejecuta acción, NO mueve dinero, NO eleva autonomía. [V: read-only invariante; cadencia [C]]
- (edge) Given que el agente corre cruzando un cambio de regla, When escribe el log, Then ancla cada entrada a `cohort_rule_version` y marca las series que cruzan el cambio. [V: A=B]

---

### EPIC-3 · Vistas de negocio EXIBIDAS (dinero pos-NBA + tickets señal-cruda), read-only/linkadas  *(reuso; folrar contrato)*

**Alcance:** exhibir POR COHORT, sin poseerlos, dos lentes de negocio: (a) **DINERO** generado pos-NBA (cross/up-sell) = `valor_confirmado_atribuible` + `estado_confirmacion{confirmado_sostenido|pendiente}` + `atribuible:bool`, fuente P3/P11, NUNCA gross ni estimado, sin señal = 0; (b) **TICKETS** por tipo/cohort = SEÑAL CRUDA: `conteo` `ticket_type × cohort` + `distribución`{único|cross} (un solo cohort vs varios) + `freshness_ts`, fuente Support; **sin clasificar la causa** — la clasificación es de la **Feature B (diagnóstico)**, dueña única (Corte 1). Ambas LINKAN a la pantalla/feature dueña (drill profundo allí), no duplican el dato ni recalculan. Hard read-only. [V: STARTING POINT VISTAS (c)(d) + FORA DE ESCOPO] [V: folrar dinero exhibido = confirmado_atribuible + estado_confirmacion + atribuible:bool; tickets link a P5]
**Cubre dims:** DATA-IN(3, vía link), DATA-OUT(6), UI/STATES(7), METRICS(10).
**WHAT/HOW:** el dinero EXHIBIDO = `valor_confirmado_atribuible` + `estado_confirmacion{confirmado_sostenido|pendiente}` + `atribuible:bool`; NUNCA gross ni estimado; sin señal = 0; linkado a P3/P11 (no recalcula). Los tickets se EXHIBEN como SEÑAL CRUDA — `conteo` `ticket_type × cohort` + `distribución`{único|cross} + `freshness_ts` — que LINKA a Support; **nunca clasifica la causa**, diagnostica ni cierra el ticket aquí (diagnóstico = Feature B; intake/cierre en Support). Provenance del origen `[V]/[I]/[C]` POR CAMPO visible; el link preserva tenant (cross-tenant hard-no). El **contrato de lectura** (qué campos trae el link, SLA de frescura `freshness_ts`) = juicio de producto → outcome+constraint; la **distribución `{único|cross}`** es un conteo determinístico (GWT), **NO un rótulo de causa** — la clasificación es de la Feature B (Corte 1 bilateral).

**Features:**
- **F-3.1 · Panel DINERO pos-NBA por cohort (link a P3/P11)** — muestra `valor_confirmado_atribuible` + `estado_confirmacion` + `atribuible:bool` por celda con `freshness_ts` + link al dueño; NUNCA recalcula ni muestra gross. [V: STARTING POINT VISTA (c) + folrar dinero exhibido]
- **F-3.2 · Invariante `valor_confirmado_atribuible`: sin señal = 0, jamás gross/estimado** — honestidad de dinero; linkado a P3/P11, no recalcula. [V: STARTING POINT INVARIANTES dinero; nunca gross ni estimado]
- **F-3.3 · Panel TICKETS por tipo/cohort (link a P5)** — conteo por `ticket_type` y celda con `freshness_ts` + link al dueño; NUNCA hace intake ni cierra. [V: STARTING POINT VISTA (d) + tickets link a P5, no intake aquí]
- **F-3.4 · Conteo crudo `ticket_type × cohort` + distribución (único|cross), SIN clasificar** — expone el `conteo` por `ticket_type × cohort` y su `distribución`{único|cross} (`único` = un solo cohort / `cross` = varios cohorts) como SEÑAL CRUDA + `freshness_ts` + link a Support; **NO rotula la causa** — la CLASIFICACIÓN del problema es de la **Feature B (diagnóstico)**, dueña única (Corte 1, MECE: la causa no vive en dos lugares). [V: STARTING POINT VISTA (d) señal cruda] [I: Corte 1 bilateral — B dueña de la clasificación]

**US-3.1.1** | MoSCoW: **Must** | Hito: H3 — Como **agent-manager 1:10**, quiero ver el **dinero confirmado-atribuible generado pos-NBA por cohort**, para leer el impacto de negocio de cada celda sin abrir otra herramienta — sabiendo que el dato lo posee P3/P11. [V: STARTING POINT VISTA (c)]
- Given una celda con señal de resultado de vuelta al CRM, When abro su panorama, Then veo `valor_confirmado_atribuible` + `estado_confirmacion{confirmado_sostenido|pendiente}` + `atribuible:bool` con `freshness_ts`, provenance por campo y link a P3/P11 (drill allí). [V/I: folrar campos]
- (edge) Given una celda **sin señal** de resultado, When se renderiza el dinero, Then muestra `0` (NUNCA un estimado ni gross). [V: invariante dinero]
- (edge) Given el panel de dinero, When se carga, Then NUNCA recalcula la atribución localmente: solo lee/linka; si la fuente P3/P11 no responde, muestra "dato no disponible — ver P3/P11", no un número fabricado. [V: read-only / FORA DE ESCOPO]

**US-3.1.2** | MoSCoW: **Should** | Hito: H3 — Como **agent-manager 1:10**, quiero ver **tickets por tipo y cohort con su conteo y su distribución (un solo cohort vs cross-cohort)**, para tener la SEÑAL CRUDA de dónde se concentran los tickets — y saltar a Support para que la **Feature B (diagnóstico)** clasifique/diagnostique la causa. [V: STARTING POINT VISTA (d) señal cruda] [I: Corte 1 bilateral — B dueña de la clasificación]
- Given un `ticket_type` por cohort, When se renderiza el panel, Then veo el `conteo` de `ticket_type × cohort` + la `distribución`{único|cross} (`único` = aparece en un solo cohort / `cross` = en varios) + `freshness_ts`, como dato CRUDO **sin rótulo de causa**. [V: señal cruda]
- Given cualquier ticket o señal mostrada, When lo abro, Then se LINKA a Support (la **Feature B / diagnóstico** hace la clasificación/diagnóstico real; intake/cierre allí); esta pantalla NUNCA clasifica la causa, hace intake ni cierra — solo expone conteo + distribución + link. [V: read-only / FORA DE ESCOPO] [I: Corte 1 bilateral]

**US-3.1.3** | MoSCoW: **Must** | Hito: H3 — Como **responsable de gobernanza**, quiero que **todo link de negocio preserve el tenant**, para que exhibir dinero/tickets jamás abra una fuga cross-tenant. [V: STARTING POINT INVARIANTES cross-tenant]
- Given un link de dinero o de tickets, When se navega, Then el destino se resuelve dentro del mismo `tenant_id`; cualquier resolución que cruzaría tenant se BLOQUEA (hard-no) + log. [V: BR-1]

---

### EPIC-4 · Modales de info-de-cohort + PERFIL/síntesis + histórico de iteración del ML (changelog de la regla)  *(mixto; integra Feature A modal síntesis)*

**Alcance:** el drill de CONTEXTO (no de cuenta): un **modal de síntesis** por celda/subgrupo que explica qué define ese cohort (regla, `tenure_bucket`, `tier_base`, `n_cuentas`/`N_subgrupo`, `baseline`, `cohort_rule_version` vigente) Y presenta el **PERFIL completo** (síntesis gráfica+escrita de "quién es", Feature A) + **topo-vs-base** + **upside** accesibles desde aquí; más el HISTÓRICO/changelog de cómo la regla de generación de cohorts (el "ML") iteró: qué versión, qué cambió, cuándo, y el efecto en los percentiles persistidos. Vuelve auditable el "por qué esta cuenta cae aquí" y honesto el versionado (BR-3). [V: STARTING POINT VISTA (e)] [V: reuso versionado BR-3/EC-3] [V: Feature A modal síntesis]
**Cubre dims:** DATA-IN(3), PROCESSING(4 parcial), UI/STATES(7), BUSINESS-RULES(8 versionado).
**WHAT/HOW:** cada modal muestra la definición vigente con `cohort_rule_version` + el perfil (Feature A); el changelog lista versiones de la regla con `{version, fecha, qué_cambió, efecto_en_baseline}` y nunca mezcla baselines de versiones distintas en la misma vista (BR-3/EC-3). Provenance POR CAMPO; thresholds `[C]`. El contenido del modal y la presentación del timeline = juicio de producto → outcome+constraint; el invariante anti-mezcla-de-versiones es determinístico (GWT).

**Features:**
- **F-4.1 · Modal de síntesis de cohort por celda/subgrupo (info + PERFIL)** — define la celda/subgrupo vigente (regla, `tenure_bucket`, `tier_base`, `n_cuentas`/`N_subgrupo`, `baseline`, `cohort_rule_version`) y abre el PERFIL completo (síntesis gráfica+escrita), con accesos a topo-vs-base y upside. [V: STARTING POINT VISTA (e) + Feature A modal síntesis]
- **F-4.2 · Changelog del ML (histórico de la regla)** — timeline `{version, fecha, qué_cambió, efecto_en_baseline}` de cómo iteró la regla de generación de cohorts. [V: STARTING POINT VISTA (e) · BR-3]
- **F-4.3 · Invariante anti-mezcla-de-versiones** — nunca mezclar baselines de `cohort_rule_version` distintas en una misma vista. [V: reuso BR-3 / EC-3]

**US-4.1.1** | MoSCoW: **Should** | Hito: H2 — Como **agent-manager 1:10**, quiero un **modal de síntesis que explique por qué una celda/subgrupo es lo que es Y muestre su perfil** (regla, tenure_bucket, tier, n/N, baseline, versión + quién-es), para auditar "por qué esta cuenta cae aquí" y conocer al cohort sin adivinar. [V: STARTING POINT VISTA (e) + Feature A modal síntesis]
- Given una celda/subgrupo, When abro su modal de síntesis, Then veo `{definicion, tenure_bucket, tier_base, n_cuentas/N_subgrupo, baseline, cohort_rule_version vigente}` + el PERFIL (síntesis gráfica+escrita) con accesos a topo-vs-base y upside, cada uno con provenance por campo. [V/I]
- (edge) Given `N < k`, When se abre el modal, Then el perfil se SUPRIME (k-anonymity); la definición de regla puede mostrarse pero sin caracterización re-identificable. [V: k-anonymity]

**US-4.1.2** | MoSCoW: **Should** | Hito: H2 — Como **agent-manager 1:10 / gobernanza**, quiero el **changelog de cómo iteró la regla de cohorts (el ML)**, para entender por qué un baseline o un percentil cambió en el tiempo (honestidad del versionado). [V: STARTING POINT VISTA (e) · BR-3]
- Given el changelog del ML, When lo abro, Then veo una lista cronológica de `{version, fecha, qué_cambió, efecto_en_baseline, provenance}`. [V/I]
- (edge) Given que conviven percentiles de dos `cohort_rule_version`, When se muestra el modal/changelog, Then NUNCA se mezclan baselines de versiones distintas en la misma vista; se rotula la versión usada y, ante mismatch, se bloquea el handoff hasta recálculo. [V: reuso EC-3 / BR-3]

---

### EPIC-5 · Explorar + priorizar + handoff a NBA + baseline Goals (reuso draft, eje matriz/subgrupo; folrar contrato handoff)  *(reuso-pantalla01)*

**Alcance:** la capa de DRILL accionable reusada del draft: navegar matriz → celda → subgrupo → drill de cuentas ordenado por gap; marcar cuenta/segmento como prioritario; emitir el evento priorizado read-only que NBA consume (payload AMPLIADO con `tenant_id, subgrupo_id, n_min_ok, freshness_ts, provenance`); y persistir el percentil/baseline como serie temporal para el North Star (alineada a la cadencia SEMANAL de Goals). El `cohort_id` referencia una CELDA; ahora también `subgrupo_id`. La pantalla NUNCA ejecuta acción ni eleva autonomía; el `min(pedido_NBA, liberado_evals, teto_tier)` aplica aguas-abajo en NBA; `risk_class` NACE EN NBA/Política, no aquí. [V: reuso draft EPIC-3 · §4 Pantalla 1 / §2 fórmula] [V: folrar payload handoff += tenant_id, subgrupo_id, n_min_ok, freshness_ts, provenance; risk_class nace en NBA]
**Cubre dims:** DATA-OUT(6), UI/STATES(7), TRIGGERS/ENTRY(2).
**WHAT/HOW:** al priorizar se emite intención (no acción); handoff por percentil bloqueado si la celda/subgrupo tenía `n < n_min` (`n_min_ok=false` → solo cualitativo sin-percentil); contrato de salida a NBA FIJO y AMPLIADO `{account_id, cohort_id(=celda), subgrupo_id, percentil_en_cohort, gap_hasta_top, cohort_rule_version, tenant_id, n_min_ok, freshness_ts, provenance, modo, operador_id}`; **`freshness_ts` + `n_min_ok` propagados como CAMPOS aguas-abajo** (no solo lógica interna); **`scope_owner_ref{dueno_id, nivel}`** para que Goals recorte role-scoped sin re-agregar (evita cross-tenant + A≠B); `n` por celda `cohort × INTENT` (`n_cohort_x_intent`) además de `n` por `(tenure × tier)` — NBA/Evals aplican el gate de muestra por celda cohort×intent; baseline de percentil persistido y versionado como serie temporal (`percentil_snapshot` alineado a la cadencia SEMANAL de Goals, no derivar histórico aguas-abajo); DOS baselines (`baseline_descriptivo` para Feature-A upside; `baseline_atribucion_segmento` para Goals/North Star). El ordenamiento/filtros del drill = juicio de producto (default por `gap_hasta_top`, $-en-juego como prior); el contrato del evento es fijo (GWT).

**Features:**
- **F-5.1 · Drill matriz → celda → subgrupo → cuentas ordenadas por gap** — abre la celda/subgrupo y lista cuentas con percentil/gap, ordenadas por `gap_hasta_top`. [V: reuso draft F-3.1/F-3.2 + subgrupo] [I: criterio de orden exacto]
- **F-5.2 · Handoff a NBA (evento priorizado read-only, payload AMPLIADO)** — al priorizar emite intención con `{account_id, cohort_id, subgrupo_id, percentil_en_cohort, gap_hasta_top, cohort_rule_version, tenant_id, n_min_ok, freshness_ts, provenance, modo, operador_id}`; la pantalla nunca ejecuta. [V: reuso draft F-3.3 + folrar payload]
- **F-5.3 · Baseline de percentil para North Star/Goals (serie temporal, cadencia SEMANAL)** — persiste `percentil_snapshot` versionado alineado a la cadencia SEMANAL de Goals (no derivar histórico aguas-abajo); usa `baseline_atribucion_segmento`. [V: reuso draft F-3.4 + folrar cadencia semanal + dos baselines]
- **F-5.4 · `n_cohort_x_intent` (muestra por celda cohort×intent)** — expone `n` por celda `cohort × intent` además de por `(tenure × tier)` para el gate de muestra aguas-abajo. [V: folrar n_cohort_x_intent Leo]
- **F-5.5 · `scope_owner_ref{dueno_id, nivel}`** — anota dueño/nivel para que Goals recorte role-scoped sin re-agregar (evita cross-tenant + A≠B). [V: folrar scope_owner_ref Leo]

**US-5.1.1** | MoSCoW: **Must** | Hito: H2 — Como **agent-manager 1:10**, quiero **drillear de la matriz a una celda/subgrupo y ver sus cuentas ordenadas por gap**, para concentrar la atención donde hay más potencial sin esfuerzo manual. [V: reuso draft US-3.1.1]
- Given la matriz cargada, When toco una celda/subgrupo con `n ≥ n_min` y `N ≥ k`, Then veo sus cuentas con `percentil_en_cohort` y `gap_hasta_top`, ordenadas de mayor a menor gap (mayor potencial arriba). [V/I: orden default por gap]
- (edge) Given una celda/subgrupo colapsado (`n < n_min`), When intento drillear por percentil, Then no se muestra percentil; solo vista/priorización cualitativa marcada `[I] sin-percentil`. [I: coherente con BR-2]

**US-5.1.2** | MoSCoW: **Should** | Hito: H2 — Como **agent-manager 1:10**, quiero **marcar una cuenta o segmento como prioritario y pasarlo a NBA**, para que la próxima mejor acción se calcule sobre lo que prioricé — sin ejecutar nada aquí. [V: reuso draft US-3.1.2]
- Given una cuenta priorizada, When confirmo el handoff, Then se emite a NBA `{account_id, cohort_id(=celda), subgrupo_id, percentil_en_cohort, gap_hasta_top, cohort_rule_version, tenant_id, n_min_ok, freshness_ts, provenance, modo, operador_id}`; la pantalla NO ejecuta acción ni mueve autonomía; `risk_class` lo decide NBA/Política. [V/I: payload fijo ampliado; risk_class nace en NBA]
- (edge) Given que la celda/subgrupo tenía `n < n_min` (percentil oculto/colapsado), When prioriza, Then `modo = cualitativo_sin_percentil`, `percentil_en_cohort = null`, `n_min_ok = false`, y el handoff por percentil se bloquea. [I: coherente con BR-2]

**US-5.1.3** | MoSCoW: **Should** | Hito: H2 — Como **responsable del North Star/Goals**, quiero que el `percentil_en_cohort` quede **persistido y versionado en el tiempo por celda/subgrupo, en cadencia SEMANAL**, para medir movimiento de percentil como señal de valor (solo confirmado/atribuible) sin derivar histórico aguas-abajo. [V: reuso draft US-3.1.3 · §3 + folrar cadencia semanal]
- Given un recálculo batch, When persiste, Then guarda `percentil_snapshot {account_id, cohort_id(=celda), subgrupo_id, percentil_en_cohort, gap_hasta_top, cohort_baseline_version, scope_owner_ref, timestamp, provenance}` alineado a la cadencia SEMANAL de Goals, habilitando la serie temporal. [V/I]
- (edge) Given movimiento de percentil sin confirmación/atribución, When se reporta al North Star, Then NO cuenta como valor hasta ser confirmado/atribuible; Goals usa `baseline_atribucion_segmento` (contrafactual/holdout), no el descriptivo. [V: STARTING POINT · §3 + dos baselines]

**US-5.1.4** | MoSCoW: **Should** | Hito: H3 — Como **responsable de Goals/Evals**, quiero que se exponga **`n_cohort_x_intent` y `scope_owner_ref`**, para aplicar el gate de muestra por celda cohort×intent y recortar role-scoped sin re-agregar (evita cross-tenant + A≠B). [V: folrar n_cohort_x_intent + scope_owner_ref]
- Given el snapshot, When se publica aguas-abajo, Then incluye `n_cohort_x_intent` (además de `n` por `(tenure×tier)`) y `scope_owner_ref{dueno_id, nivel}`; NBA/Evals aplican el gate por celda cohort×intent. [V/I]
- (edge) Given un recorte role-scoped, When Goals consume, Then usa `scope_owner_ref` sin re-agregar; cualquier agregación que cruzaría tenant o rompería A=B se BLOQUEA. [V: cross-tenant hard-no; A=B]

---

### EPIC-6 · "CORRER AHORA": simular/mock on-demand (sandbox read-only, no-commit)  *(nuevo; Feature C)*

**Alcance:** un botón **"correr ahora"** para ejecutar un TEST/MOCK on-demand: cómo quedarían los cohorts si se corriera la segmentación AHORA, en este período, para ver cómo evolucionarían los clientes. Es **PREVIEW read-only / sandbox**: NO commitea, NO cambia los cohorts reales persistidos, NO toca dinero. Muestra el "cómo quedaría" vs el snapshot vigente (diff simulado). Respeta `n_min` / `k` / cross-tenant igual que el batch real. [V: Feature C botón simular; sandbox preview no-commit; no toca dinero; respeta n_min/k/cross-tenant]
**Cubre dims:** TRIGGERS/ENTRY(2), PROCESSING(4), DATA-OUT(6 efímero), UI/STATES(7).
**WHAT/HOW:** al apretar "correr ahora" se dispara una re-segmentación EFÍMERA en sandbox sobre los datos del período actual; el resultado se muestra como **diff simulado** contra el snapshot vigente (qué celdas/percentiles/deltas cambiarían), claramente rotulado **"SIMULACIÓN — no comprometida"**. NO escribe `PERCENTIL_SNAPSHOT` real, NO emite handoff a NBA, NO modifica `cohort_rule_version` vigente, NO mueve dinero. Aplica los mismos gates (`n_min`, `k`, cross-tenant hard-no) que el batch real. El alcance de la simulación, su TTL efímero y la presentación del diff = juicio de producto → outcome+constraint, [I] needs-prototype. Invariante: simular = sandbox, no-commit.

**Features:**
- **F-6.1 · Botón "correr ahora" (trigger de simulación on-demand)** — dispara una re-segmentación efímera del período actual en sandbox. [V: Feature C botón]
- **F-6.2 · Diff simulado vs snapshot vigente** — muestra el "cómo quedaría" (celdas/percentiles/deltas que cambiarían) contra el snapshot persistido, rotulado "SIMULACIÓN — no comprometida". [V: Feature C diff simulado]
- **F-6.3 · Invariante sandbox no-commit** — NO persiste cohorts reales, NO emite handoff, NO cambia `cohort_rule_version`, NO toca dinero; mismos gates `n_min`/`k`/cross-tenant. [V: Feature C no-commit; respeta gates]

**US-6.1.1** | MoSCoW: **Should** | Hito: H3 — Como **agent-manager 1:10**, quiero un **botón "correr ahora"** que simule cómo quedarían los cohorts si se segmentara AHORA en este período, para ver cómo evolucionarían los clientes antes del próximo batch — sin comprometer nada. *(Feature C)* [V: Feature C botón simular]
- Given el snapshot vigente, When aprieto "correr ahora", Then el sistema corre una re-segmentación EFÍMERA del período actual en sandbox y me muestra el resultado claramente rotulado "SIMULACIÓN — no comprometida". [V/I]
- (edge) Given la simulación corriendo, When termina, Then NO escribe `PERCENTIL_SNAPSHOT` real, NO emite handoff a NBA, NO cambia `cohort_rule_version` vigente y NO toca dinero. [V: sandbox no-commit]

**US-6.1.2** | MoSCoW: **Should** | Hito: H3 — Como **agent-manager 1:10**, quiero ver el **diff de la simulación vs el snapshot vigente**, para entender qué celdas/percentiles/deltas cambiarían si corriera ahora. *(Feature C)* [V: Feature C diff simulado]
- Given una simulación completada, When veo el resultado, Then se presenta como diff contra el snapshot vigente (celdas/percentiles/deltas que cambiarían), una mensagem por vista, dataviz honesta. [V/I: presentación → needs-prototype]
- (edge) Given celdas/subgrupos con `n < n_min` o `N < k` en la simulación, When se renderiza el diff, Then se COLAPSAN/SUPRIMEN igual que en el batch real (mismos gates); cross-tenant hard-no. [V: respeta n_min/k/cross-tenant]

**US-6.1.3** | MoSCoW: **Must** | Hito: H3 — Como **responsable de gobernanza**, quiero garantía de que **simular es sandbox read-only**, para que un preview nunca altere cohorts reales, handoffs, versión de regla ni dinero. *(Feature C)* [V: Feature C invariante]
- Given cualquier simulación, When corre, Then es read-only: no commitea cohorts persistidos, no emite eventos consumibles aguas-abajo, no mueve dinero; el snapshot vigente permanece intacto. [V: sandbox no-commit / INVARIANTES]
- (edge) Given que el usuario quisiera "promover" la simulación a real, When lo intenta, Then NO hay tal acción en P1 (promover/correr el batch real vive en el motor/orquestación, fuera de alcance de esta pantalla). [V: read-only / FORA DE ESCOPO]

---

## Recorrido (primera persona, clic por clic, 4 CAMADAS, estado por estado)

> Las 4 camadas validadas por Leo (semáforo → fila → panorama → drill) organizan las vistas sin overload, híbridas y responsivas, con dataviz honesto. Se extiende el recorrido con: ver PERFIL del cohort, entrar al SUBGRUPO (topo-vs-base + upside), ver el LOG de movimientos con su porqué, apretar "correr ahora" y ver el mock. [V: STARTING POINT ESSENCIA + extensiones A/B/C]

### Recorrido DESKTOP

Yo, como **agent-manager 1:10**, entro en **Cohorts Explorer**.

- **(estado: carga)** Veo un skeleton mientras el sistema lee el último snapshot batch persistido en el Cerebro. La pantalla **no recalcula en vivo**: muestra el baseline versionado vigente (`cohort_baseline_version` visible). [I: batch adoptado]

- **CAMADA 1 — SEMÁFORO + SÍNTESIS DE PERFIL (relance, 0 toques).** Veo la **matriz tenure×tier** como semáforo verde/ámbar/rojo por celda (filas = `tenure_bucket` 0-3m / 3-6m / 6-12m / 12m+; columnas = `tier_base`), con UNA sola mensagem de cabecera ("¿cómo está el negocio por cohort?") y, por celda, una **síntesis breve del perfil** ("quién es ese cohort"). Las celdas con `n < n_min` aparecen **atenuadas/colapsadas** con "n insuficiente"; las de `N < k` **suprimen** el perfil (k-anonymity). Atributos preatentivos (color/intensidad) dirigen mi ojo a las celdas rojas. [V: CAMADA 1 + Feature A síntesis] [I: heatmap vs chips → needs-prototype]

- **CAMADA 2 — FILA/DELTAS + LOG (corpo, lectura).** Debajo del semáforo veo la **cola de DELTAS** desde el último snapshot: `at_risk`/`precisa-acción` arriba (= bajó de percentil/cohort O entró en patrón pre-churn), luego `melhorou_percentil`, `mudou_cohort`, `novo`, `churn` — cada delta como `percentil_delta{sentido, magnitud, ventana, n_min_ok}` + `delta_status`. Cada movimiento muestra **el PORQUÉ** (feature-attribution: qué variables lo causaron). Junto a la cola, accedo al **LOG de movimientos** (quién subió/bajó de cohort y de percentil, con su explicación causal, anclado a `cohort_rule_version`), generado por el **AGENTE periódico**. Responde "¿dónde actúo y por qué?". Comando opinativo, "poucos toques certeiros", no un BI. [V: CAMADA 2 + Feature B deltas-con-porqué + log + agente]
  - **(estado: deltas vacíos)** Si entre snapshots no hubo movimiento, veo "sin cambios desde el último snapshot ({freshness_ts})", no una lista vacía ambigua. [I: estado vacío de deltas]

- Hago clic en una **celda con `n ≥ n_min` y `N ≥ k`** del semáforo. Espero abrir el **panorama** de esa celda.

- **CAMADA 3 — PANORAMA + PERFIL (1 toque).** Veo el panorama del cohort-celda:
  - el **PERFIL del cohort** (síntesis gráfica+escrita de "quién es": tenure medio, mix de tier, intents dominantes, `valor_actual_kpi` por `{conexion, tickets, recurrencia, cross_sell}` + ventana), una mensagem, dataviz honesta [V: Feature A perfil];
  - panel **"qué hacen los P90+"** (patrón por estructura promo / ventana / fuso, con provenance; puebla el `baseline_descriptivo`) [V: EPIC-1];
  - panel **DINERO pos-NBA** = `valor_confirmado_atribuible` + `estado_confirmacion{confirmado_sostenido|pendiente}` + `atribuible:bool` con `freshness_ts` + **link a P3/P11** (drill profundo allí); si no hay señal veo `0` (nunca estimado ni gross). [V: EPIC-3];
  - panel **TICKETS por tipo** = señal cruda: `conteo` `ticket_type × cohort` + `distribución`{único|cross} + `freshness_ts` + **link a Support** (la clasificación de la causa la hace la Feature B / diagnóstico, no esta pantalla). [V: EPIC-3 señal cruda] [I: Corte 1].
  - Cada panel LINKA a su dueño, **no duplica** el dato; una mensagem por vista. [V: CAMADA 3]
  - **(estado: degradado)** Si la celda tiene `knowledge_de_cohort` insuficiente, en lugar del patrón P90+ veo "datos insuficientes — regla determinística mínima", no un score autoritativo. [V: reuso BR-4]

- Desde el panorama **entro a un SUBGRUPO** (2º nivel). Veo la vista **TOPO-vs-BASE**: dos columnas comparables (P90+ vs P-bajos `[C: P10/P25]`) en las mismas dimensiones canónicas, con la diferencia destacada — "qué hace distinto el tope". Abro el **UPSIDE**: "si la base operara como el tope, ¿cuánto más generaríamos?", dimensionado en dinero/impacto, **atribuible**, marcado **`[C]`** (proyección, no acción) mientras no haya telemetría, usando el `baseline_descriptivo`. Si el subgrupo o alguna columna tiene `N < k`, se **suprime** (k-anonymity). [V: Feature A subgrupo topo-vs-base + upside; provenance [C]; lectura no acción]

- Desde el panorama/subgrupo abro el **modal de síntesis de cohort** (CAMADA 4 contexto): veo `{regla, tenure_bucket, tier_base, n_cuentas/N_subgrupo, baseline, cohort_rule_version}` + el **PERFIL completo** + el **changelog del ML** (`{version, fecha, qué_cambió, efecto_en_baseline}`) — nunca mezclando baselines de versiones distintas. Audito "por qué esta celda". [V: EPIC-4 + Feature A modal síntesis]

- **CAMADA 4 — DRILL (detalle accionable).** Vuelvo al panorama/subgrupo y entro al **drill de cuentas**, ordenado por `gap_hasta_top` (mayor potencial arriba). Por cuenta veo `percentil_en_cohort` y `gap_hasta_top`, cada valor con sello `[V]/[I]/[C]` POR CAMPO. Marco una cuenta de alto gap como **"priorizar"** → confirmador de **handoff a NBA** → confirmo. El sistema **emite el evento priorizado** `{account_id, cohort_id, subgrupo_id, percentil_en_cohort, gap_hasta_top, cohort_rule_version, tenant_id, n_min_ok, freshness_ts, provenance, modo, operador_id}` y me muestra "enviado a NBA"; **no se ejecuta ninguna acción ni cambia autonomía aquí** (el `risk_class` lo decide NBA/Política). El drill profundo de dinero/tickets ocurre en la pantalla dueña (link), no aquí. [V: EPIC-5 / CAMADA 4 + payload ampliado + risk_class nace en NBA]
  - **(estado: celda/subgrupo colapsado)** Si tenía `n < n_min`, el handoff por percentil se bloquea (`n_min_ok=false`); solo priorización cualitativa `modo = cualitativo_sin_percentil`. [I: coherente con BR-2]

- **"CORRER AHORA" (Feature C, on-demand desde cualquier camada).** Aprieto el botón **"correr ahora"**. El sistema corre una re-segmentación **EFÍMERA** del período actual en **sandbox** y me muestra un **diff simulado** vs el snapshot vigente (qué celdas/percentiles/deltas cambiarían), rotulado **"SIMULACIÓN — no comprometida"**, respetando los mismos gates `n_min`/`k`/cross-tenant. **No commitea**: no escribe el snapshot real, no emite handoff, no cambia `cohort_rule_version`, no toca dinero. Veo "cómo quedaría" para anticipar la evolución de los clientes; cierro el preview y el estado vigente queda intacto. [V: EPIC-6 / Feature C sandbox no-commit]
  - **(estado: simulación con celdas no-significativas)** Las celdas/subgrupos `n < n_min` o `N < k` se COLAPSAN/SUPRIMEN igual que en el batch real. [V: respeta gates]

- **(estado: vacío)** Si no hay cohorts (tenant recién sembrado), veo un estado vacío con enlace a Onboarding (#9), no una tabla en blanco. [I: reuso EC-8]
- **(estado: error/stale)** Si el snapshot batch falló o está stale más allá del TTL `[C]`, veo un banner "baseline no fresco — percentiles pueden estar desactualizados" con el `freshness_ts` del último snapshot válido; los percentiles NO se ocultan pero se marcan `stale`. Si el job no corrió, "baseline no disponible" y se bloquea el handoff. [I: reuso EC-4]
- **(estado: fuente de negocio caída)** Si P3/P11 o P5 no responden, los paneles de dinero/tickets muestran "dato no disponible — ver pantalla dueña", nunca un número fabricado. [V: EPIC-3 read-only]

### Recorrido MÓVIL  **[I] needs-prototype**

> El recorrido móvil NO es cristalizable por Q&A (recorrido táctil/responsivo): la jerarquía visual exacta de la matriz colapsada + el subgrupo topo-vs-base + el upside + el log + el botón "correr ahora" en móvil quedan como **[I] needs-prototype**. Outcome + constraints abajo; la forma exacta la valida un prototipo. [V: STARTING POINT responsivo + flow Apple]

- **Constraint de transformación:** en móvil la matriz **colapsa a una lista jerárquica `tier → tenure`** (o `tenure → tier`, a definir en prototipo), preservando el **semáforo + síntesis de perfil** (CAMADA 1) y los **deltas con porqué + acceso al log** (CAMADA 2) arriba. [I: jerarquía de colapso → needs-prototype]
- **Constraint anti-doble-riesgo:** debe evitar a la vez **exceso de info** (no un BI en una pantalla chica) Y **exceso de telas** (no enterrar el handoff bajo 6 toques), manteniendo el flow Apple (confiable, previsible). [V: STARTING POINT]
- **Camadas en móvil (outcome):** CAMADA 1 semáforo+síntesis como lista jerárquica con color preatentivo → CAMADA 2 deltas priorizados (`at_risk` arriba) con porqué + log → CAMADA 3 panorama de celda (PERFIL, P90+, dinero-link, tickets-link, cada uno una vista) → entrada a SUBGRUPO (topo-vs-base + upside, cada uno una vista) → CAMADA 4 drill de cuentas + handoff read-only. Modal síntesis+changelog y botón "correr ahora" accesibles desde la celda. [V: 4 camadas + extensiones A/B/C] [I: layout exacto → needs-prototype]
- **Invariantes preservados en móvil (no [I]):** `n_min` por celda/subgrupo con colapso; `k-anonymity` con supresión aguas-arriba; cross-tenant hard-no en links; dinero = `valor_confirmado_atribuible` (sin señal = 0, nunca gross/estimado); upside `[C]` sin telemetría; read-only (handoff = intención, no acción; simular = sandbox no-commit); provenance por campo visible; contrato del evento a NBA fijo/ampliado; agente periódico y log read-only. [V: reuso INVARIANTES + folrar]
- **(estados móvil)** carga/skeleton, deltas-vacíos, degradado (knowledge insuf.), vacío (→ Onboarding #9), stale (banner con `freshness_ts`), fuente-de-negocio-caída, simulación-con-celdas-no-significativas — mismos comportamientos que desktop; su disposición exacta = [I] needs-prototype.

---

**Notas de cierre del OUTPUT 1**
- **MECE:** EPIC-1 (segmentar matriz + subgrupo + percentil/gap/P90+ + perfil + topo-vs-base + upside), EPIC-2 (semáforo+síntesis + deltas-con-porqué + log + agente), EPIC-3 (vistas negocio linkadas), EPIC-4 (modales síntesis + changelog ML), EPIC-5 (explorar+priorizar+handoff+baseline Goals), EPIC-6 (correr ahora / simular sandbox) cubren la pantalla sin solape; cada una desarrollable. [V/I]
- **Reuso explícito:** EPIC-1/EPIC-3/EPIC-5 reaprovechan el núcleo del draft (F-1.x, P90+, EPIC-3 original) extendidos al eje celda/subgrupo; EPIC-2 y EPIC-4 absorben Feature A (síntesis/perfil) y Feature B (deltas-con-porqué + log + agente); EPIC-6 es nuevo (Feature C). [V: reuso draft + 3 features validadas]
- **Invariantes honrados:** cross-tenant hard-no (BR-1), `n_min` fail-closed con colapso de celda/subgrupo (BR-2), `k-anonymity` con supresión aguas-arriba en P1 (gate DISTINTO de n_min), regla versionada estampada por fila/evento + anti-mezcla + A=B (BR-3/EC-3), degradación si knowledge ausente (BR-4), provenance POR CAMPO visible (BR-5), read-only / no ejecuta / no eleva autonomía / handoff=intención / simular=sandbox-no-commit / dinero nunca gross-ni-estimado / `risk_class` nace en NBA-Política / min() aguas-abajo (BR-6 + invariantes). [V: STARTING POINT INVARIANTES + folrar]
- **Contrato folrado (mecánico, incorporado sin preguntar):** payload handoff += `tenant_id, subgrupo_id, n_min_ok, freshness_ts, provenance`; `freshness_ts`+`n_min_ok` propagados como campos aguas-abajo; `cohort_rule_version` estampada por fila/evento; DELTA promovido a evento (`percentil_delta` + `delta_status`); dos baselines (`baseline_descriptivo` para upside / `baseline_atribucion_segmento` para Goals); `baseline_cohort` con `valor_actual_kpi` por KPI; `percentil_snapshot` cadencia SEMANAL; `n_cohort_x_intent`; dinero exhibido = `valor_confirmado_atribuible`+`estado_confirmacion`+`atribuible:bool`; tickets señal-cruda (conteo+distribución) link a Support — clasificación de causa = Feature B (Corte 1); `scope_owner_ref{dueno_id,nivel}`; `gap_hasta_top` leading-indicator consumible; entidad SUBGRUPO con `N_subgrupo`; `supresion_k_aplicada`. [V: CONTRATO folrar Leo] [I: campos abiertos donde no cristaliza]
- **Numeración (NUMBERING-FIX):** EPIC-1..6 consistentes; US como `US-<epic>.<feature>.<n>` sin drift; IDs de modos de falla reservados como **MF-x** para la matriz de fallo (distintos de `F-x.y` de Features) — los `F-x.y` aquí son SOLO Features. [V: NUMBERING-FIX exigido por el crítico]
- **Juicio de producto dejado al builder ([I] needs-prototype):** regla de colapso de celdas/subgrupos (umbral + jerarquía), definición de la partición de subgrupo, bordes de P-bajos para topo-vs-base, render del semáforo (heatmap vs chips), orden de deltas y regla `at_risk`, cadencia del agente, presentación del log/feature-attribution, presentación del diff simulado y su TTL, contrato de lectura/SLA de los links de negocio, y todo el recorrido MÓVIL. Números (`n_min`, `k`, TTL, bordes de tenure-buckets) = `[C]` placeholder + falsify-probe ("¿mediste o supusiste?"), no chumbados. [V: defaults Leo]

Archivo fuente reusado: `/Users/familiagirardicavalcante/Desktop/Musixmatch/specs/pantalla_01_cohorts_explorer.md`

---

## OUTPUT 2 — BUSINESS RULES + EDGE CASES + MANEJO DE FALLO (FALLO)

**SÍNTESIS:** el modo de falla que MÁS amenaza el North Star no es el dato ausente — es el **percentil/delta/dinero/upside mostrado como verdadero cuando es ruido**, porque alimenta a NBA con intención priorizada falsa y mueve el North Star sobre evidencia inexistente. Las 3 features nuevas suben la apuesta: (A) el **upside** ("si los de abajo operaran como los de arriba, cuánto generaríamos de más") es una proyección — vendida como real, fabrica un número de negocio inexistente; (B) el **log de re-segmentación** sin variables atribuibles es un "subió/bajó" sin porqué — invita a actuar a ciegas; (C) el botón **correr ahora** es sandbox — si commitea o toca dinero/cohorts reales, deja de ser preview y se vuelve acción no-autorizada en una pantalla read-only. La matriz tenure×tier agrava todo: multiplica las celdas, así que muchas caerán bajo n_min/k y el riesgo no es "no mostrar", es "mostrar el percentil/upside de una celda de 4 cuentas como si separase a los mejores de la media — o peor, re-identificar a esas 4". Por eso el principio rector de toda esta capa es **fail-closed con honestidad de provenance**: ante duda (n bajo, N<k, baseline de otra versión, sin señal de dinero, log sin variable, simulación stale, ticket sin cohort) la pantalla COLAPSA / SUPRIME / pone en 0-con-flag / degrada a cualitativo — nunca rellena, nunca estima, nunca cruza tenant, nunca commitea. Las vistas de dinero y tickets son EXIBIDAS/linkadas: un error que duplique o recalcule rompe la fuente autoritativa (P3/P11/P5) y contamina la atribución. `[V: STARTING POINT INVARIANTES + n_min fail-closed + dinero=confirmado_atribuible + read-only + simular=sandbox no-commit]` `[I: jerarquía del modo de falla por amenaza-North-Star]`

---

### A. Business Rules

#### A.1 Reusadas del draft (núcleo, eje extendido a matriz)

| ID | Regla | Cambio vs draft | Prov |
|----|-------|-----------------|------|
| **BR-1** | **Cross-tenant = bloqueo rojo absoluto.** Ninguna segmentación, delta, semáforo, percentil, perfil de cohort, upside, log de movimiento, simulación, vista de dinero/tickets ni link puede cruzar `tenant_id`. El link a P3/P11/P5 preserva el tenant del origen; si no lo puede garantizar, no se emite el link. | Igual; ahora también cubre perfil, upside, log, simulación y links de negocio | `[V]` |
| **BR-2** | **n_min para percentil significativo, POR CELDA.** Una celda con `n_cuentas < n_min` no produce `percentil_en_cohort`, `gap_hasta_top` ni upside: se **colapsa** (agrega a un nivel superior de la jerarquía) o se **oculta+aviso**. Fail-closed. n_min es gate de SIGNIFICANCIA estadística, distinto del gate de re-identificación (ver BR-15). | EXTENDIDO: antes por tier; ahora por celda de la matriz → muchas más celdas afectadas; explicitado distinto de k | `[V]` |
| **BR-3** | **Regla de cohort versionada (`cohort_rule_version`), ESTAMPADA POR FILA/EVENTO.** Toda fila, celda, baseline, percentil, delta, entrada de log y simulación lleva la versión de la regla que la generó (`def_version`). Prohibido mezclar versiones en una vista o cálculo. Garantiza **A=B**: una serie que cruza un cambio de regla se marca, no presenta movimiento falso. | EXTENDIDO: de versión-por-vista a versión-por-fila/evento; base del log (EPIC-2) y del agente (EPIC-2 sub-capa) | `[V]` |
| **BR-4** | **Knowledge de cohort ausente → regla determinística mínima.** Si no hay `knowledge_de_cohort_suficiente` para una celda, no se inventa patrón P90+; se cae a una regla determinística mínima (segmentar por `tier_base`+`tenure_bucket` sin patrón cualitativo) y se marca el estado. | Igual | `[V]` |
| **BR-5** | **Provenance `[V/I/C]` por CAMPO en cada dato exportado y mostrado.** Todo valor (percentil, delta, baseline, dinero, upside, variable del log, resultado de simulación, ticket) lleva `[V]`/`[I]`/`[C]` por campo, visible al operador y presente en el payload exportado. Sin provenance no se renderiza como dato duro ni se exporta como tal. | EXTENDIDO: de "visible" a "por campo en todo dato exportado", cubre upside/log/simulación | `[V]` |
| **BR-6** | **Read-only absoluto.** La pantalla no ejecuta acción, no toca dinero, no eleva autonomía, no hace intake ni cierra tickets. El handoff es INTENCIÓN, no acción; la simulación es PREVIEW sandbox, no commit. El único output mutante real es el `EVENTO_PRIORIZADO_NBA`. El `min(pedido_NBA, liberado_evals, teto_tier)` se aplica aguas-abajo en NBA, no aquí. `risk_class` NACE en NBA/Política, NO en P1 (ver BR-22). | EXTENDIDO: explicita simular=sandbox y que risk_class no nace aquí | `[V]` |

#### A.2 Nuevas — matriz, dashboard, vistas exibidas, changelog

| ID | Regla | Outcome / constraint | Prov |
|----|-------|----------------------|------|
| **BR-7** | **Celda n<n_min COLAPSA, no explota la tela.** Al colapsar, agrega hacia un nivel superior de la jerarquía (orden de agregación = juicio de producto). La matriz NUNCA muestra más celdas activas de las que superan n_min. | Outcome: el operador nunca ve una grilla de celdas vacías/ruidosas. Constraint: orden de agregación y umbral de colapso = `[I]` needs-prototype; el invariante "n<n_min ⇒ sin percentil" es duro `[V/BR-2]` | `[I]` |
| **BR-8** | **Delta solo válido con 2 snapshots versionados comparables.** Un `percentil_delta` numérico exige `snapshot_from` y `snapshot_to` bajo la MISMA `cohort_rule_version`. Si difieren, o falta un snapshot, el delta NO es numérico: se emite solo `delta_status` cualitativo (`mudou_cohort`/`novo`/`churn`) o no se emite. | Outcome: ningún movimiento de percentil que alimente al North Star compara peras con manzanas. Constraint: regla determinística, GWT-able | `[V]` |
| **BR-9** | **Dinero exibido = `valor_confirmado_atribuible` + `estado_confirmacion`, NUNCA estimado ni gross.** Solo el confirmado con señal de resultado de vuelta al CRM, con `estado_confirmacion{confirmado_sostenido\|pendiente}` y `atribuible:bool`. Sin señal = **0**. La pantalla muestra y LINKA a P3/P11; jamás recalcula ni agrega su propia atribución. | Outcome: el dinero por cohort es honesto o es cero — nunca optimista, nunca gross. Constraint: contrato de lectura (campos + SLA de frescura) = `[I]`; el invariante "sin señal ⇒ 0" es duro `[V]` | `[V]` |
| **BR-10** | **Vistas de dinero y tickets = read-only linkado, no duplican fila autoritativa.** La pantalla EXIBE un snapshot referenciado (con `freshness_ts`) y LINKA al dueño (P3/P11/P5). Nunca persiste como verdad propia, nunca hace intake, nunca cierra. | Outcome: cero divergencia entre lo que muestra el Explorer y la fuente. Constraint: si la frescura excede TTL, se marca stale (BR-12) y se prioriza el link sobre el número | `[V]` |
| **BR-11** | **Tickets = SEÑAL CRUDA, sin clasificar (la clasificación es de Feature B).** La pantalla expone el `conteo` crudo `ticket_type × cohort` + la `distribución`{único|cross} (un solo cohort vs varios) + `freshness_ts` + link a Support; **NO rotula la causa** — la CLASIFICACIÓN del problema (gap de conocimiento / bug / etc.) es de la **Feature B (diagnóstico)**, dueña única (Corte 1; MECE: la causa no vive en dos lugares). Si el ticket no resuelve a un cohort, no se expone el cruce (EC-5). | Outcome: el operador ve dónde se concentran los tickets (conteo + distribución) y salta a B para el diagnóstico; cero clasificación de causa aquí. Constraint: contrato bilateral con Feature B; esta pantalla solo aporta dato crudo + link | `[I]` |
| **BR-12** | **Baseline/snapshot stale por TTL.** Todo baseline/snapshot tiene TTL `[C]`. Vencido ⇒ se marca stale visible y no se usa para emitir delta numérico, upside ni dinero como dato fresco (degrada a cualitativo / a link). Aplica también a la simulación (BR-19). | Outcome: nunca se decide sobre datos viejos sin avisar. Constraint: valor del TTL = `[C]` (pendiente Leo) | `[C]` |
| **BR-13** | **`ml_changelog` = changelog versionado de la regla de cohort.** El histórico de iteración del ML lista `{version, fecha, qué_cambió, efecto_en_baseline, provenance}` por `cohort_rule_version`. Una vista del changelog NUNCA mezcla baselines de versiones distintas (refuerza BR-3). | Outcome: "por qué esta cuenta cae aquí" es auditable y honesto. Constraint: presentación del timeline = `[I]`; el anti-mezcla-de-versiones es duro `[V/BR-3]` | `[I]` |
| **BR-14** | **Handoff a NBA bloqueado-por-percentil si la celda era n<n_min.** El `EVENTO_PRIORIZADO_NBA` solo lleva `percentil_en_cohort` numérico si la celda superó n_min; si no, `modo = cualitativo_sin_percentil` y `percentil_en_cohort = null`. El payload propaga `tenant_id`, `subgrupo_id`, `n_min_ok`, `freshness_ts` y `provenance` (hoy ausentes). | Outcome: NBA nunca recibe un percentil fabricado; recibe el contexto para aplicar sus gates. Constraint: contrato fijo, GWT-able | `[V]` |

#### A.3 Nuevas — Feature A (perfil + topo-vs-base + upside), Feature B (log + agente), Feature C (simular)

| ID | Regla | Outcome / constraint | Prov |
|----|-------|----------------------|------|
| **BR-15** | **k-anonimato aguas-arriba en P1, gate DISTINTO de n_min.** Si `N < k` para un insight, perfil de cohort, característica P90+ o subgrupo, se **SUPRIME** (no se muestra, no se exporta) y se anota `supresion_k_aplicada`. Aplicado en P1, aguas-arriba. k protege RE-IDENTIFICACIÓN; n_min protege SIGNIFICANCIA — son gates separados y ambos deben pasar. | Outcome: nunca se expone un perfil que identifique a un puñado de cuentas. Constraint: valor de k = `[C]` placeholder + falsify-probe; el invariante "N<k ⇒ suprimir + anotar" es duro `[V]` | `[V]` |
| **BR-16** | **Upside SIEMPRE `[C]` y atribuible — nunca estimado vendido como real.** El cálculo "si los de abajo operaran como los de arriba, cuánto generaríamos de más" es **lectura/proyección, NO acción**. Se marca `[C]` mientras no haya telemetría; es atribuible y trazable al `baseline_descriptivo` (P90+). NUNCA se presenta como dinero real ni se suma al North Star. Sin telemetría no asciende a `[V]`. | Outcome: la oportunidad se dimensiona honestamente, etiquetada como proyección. Constraint: fórmula y unidad = `[I]`; el invariante "upside=[C] proyección, no real" es duro `[V]` | `[C]` |
| **BR-17** | **DOS baselines distintos, no intercambiables.** `baseline_descriptivo` (qué hacen los P90+, aspiracional) alimenta el upside de Feature-A. `baseline_atribucion_segmento` (contrafactual/holdout, incremento vs gross) alimenta Goals/North Star. Prohibido usar el descriptivo para reclamar incremento, o el de atribución para describir patrón aspiracional. | Outcome: no se confunde "aspiración" con "incremento causado". Constraint: cómo se construye el holdout = `[I]`; la separación de los dos baselines es dura `[V]` | `[V]` |
| **BR-18** | **Cada entrada del log de movimiento ancla VARIABLES atribuibles + `cohort_rule_version`.** El log de re-segmentación no muestra solo QUÉ cambió (subió/bajó cohort, subió/bajó percentil) sino POR QUÉ: feature-attribution con las variables que causaron el movimiento. Una entrada sin variables atribuibles NO se emite como "movimiento explicado" — se degrada a "movimiento sin explicación" marcado, o no se emite. | Outcome: el operador nunca ve un "bajó de percentil" sin saber por qué. Constraint: qué variables y cómo se atribuyen = `[I]` needs-prototype; el invariante "sin variable ⇒ no es movimiento explicado" es duro `[V]` | `[V]` |
| **BR-19** | **Simular = sandbox PREVIEW read-only, NO commit.** El botón "correr ahora" calcula cómo quedarían los cohorts si la segmentación corriera AHORA y muestra el diff vs el snapshot vigente. NO commitea, NO cambia cohorts reales persistidos, NO toca dinero, NO emite `EVENTO_PRIORIZADO_NBA`. Respeta n_min, k y cross-tenant igual que la corrida real. Su resultado se marca `simulado` por campo (provenance). | Outcome: el operador previsualiza la evolución sin efectos colaterales. Constraint: alcance del diff y persistencia efímera = `[I]`; los invariantes "no-commit / no-dinero / respeta gates" son duros `[V]` | `[V]` |
| **BR-20** | **Agente periódico = batch versionado; cada corrida sella `cohort_rule_version` y produce el log de deltas.** El agente re-segmenta periódicamente (cadencia `[C]`), versiona la corrida, y emite el log (BR-18) y los `delta_status` (BR-21). No corre dentro de la sesión del operador; "correr ahora" (BR-19) es su contraparte sandbox on-demand. | Outcome: la re-segmentación es trazable y reproducible. Constraint: cadencia y disparador = `[C]`; el invariante "batch versionado + log" es duro `[V]` | `[C]` |
| **BR-21** | **DELTA promovido de UI a EVENTO consumible.** Se emite `percentil_delta{sentido(subio\|bajo\|igual), magnitud, ventana, n_min_ok}` + `delta_status{mudou_cohort\|melhorou_percentil\|baixou_percentil\|at_risk\|novo\|churn}`. `at_risk` = bajó de percentil/cohort O entró en patrón de pre-churn. `percentil_snapshot` alineado a la cadencia SEMANAL de Goals (no derivar histórico aguas-abajo). | Outcome: el delta es consumible por NBA/Goals con su sentido y validez de muestra embebidos. Constraint: contrato del evento fijo; definición de pre-churn = `[I]` | `[V]` |
| **BR-22** | **`risk_class` NACE en NBA/Política, NO en P1.** P1 es read-only: observa y apunta (`at_risk`, `gap_hasta_top`), pero NO clasifica reversible/financiero/cross-tenant. Esa clasificación de riesgo de acción nace aguas-abajo en NBA/Política. | Outcome: P1 no se arroga juicio de acción; mantiene el invariante read-only. Constraint: contrato fijo `[V]` | `[V]` |
| **BR-23** | **Campos aguas-abajo propagados, no solo lógica interna.** `freshness_ts`, `n_min_ok`, `provenance`, `tenant_id`, `subgrupo_id`, `scope_owner_ref{dueno_id, nivel}`, `gap_hasta_top{valor, unidad, cohort_rule_version}` y `n_cohort_x_intent` se exponen como CAMPOS consumibles aguas-abajo. `scope_owner_ref` permite a Goals recortar role-scoped sin re-agregar (evita cross-tenant + A≠B). | Outcome: NBA/Goals/Evals aplican sus gates sin re-derivar ni re-agregar. Constraint: contrato de campos fijo; algunos valores `[I]` | `[V]` |
| **BR-24** | **Gate de muestra por celda `cohort × intent`.** Además de n por (`tenure × tier`), se calcula `n_cohort_x_intent`. NBA/Evals aplican el gate de muestra POR CELDA cohort×intent: si la celda cohort×intent está bajo n_min, no se emite percentil/priorización para esa intención. | Outcome: ninguna intención se prioriza sobre una celda cohort×intent vacía o ruidosa. Constraint: el gate por celda cohort×intent es duro `[V]`; n_min valor `[C]` | `[V]` |
| **BR-25** | **`baseline_cohort` poblado con `valor_actual_kpi` por KPI + ventana.** Por KPI (`conexion\|tickets\|recurrencia\|cross_sell`) se puebla `valor_actual_kpi` + `ventana`, con provenance `[V]` cuando hay telemetría, `[C]` cuando no. Alimenta perfil de cohort y `gap_hasta_top`. | Outcome: el perfil del cohort se ancla en KPIs con ventana y provenance explícitos. Constraint: lista de KPIs fija; valores `[V/C]` según telemetría | `[V]` |

---

### B. Edge Cases

| ID | Caso | Manejo esperado | Prov |
|----|------|-----------------|------|
| **EC-1** | **Matriz con muchas celdas vacías / n-bajo** (lo normal al multiplicar tenure×tier en un tenant chico). | Colapso jerárquico (BR-7): agregar celdas ruidosas hacia arriba hasta superar n_min; la tela muestra solo celdas significativas + indicador agregado de "resto colapsado". No explotar la grilla. | `[I]` |
| **EC-2** | **Cuenta que cruza `tenure_bucket` entre snapshots** (3m→6m). | Es una transición legítima (`delta_status = mudou_cohort`): cambia de celda destino. El `percentil_delta` numérico NO se emite si origen/destino no son comparables bajo misma `cohort_rule_version` (BR-8) — se reporta cualitativo. La fila conserva su `cohort_rule_version` estampada (BR-3, A=B). | `[I]` |
| **EC-3** | **Delta calculado sobre baseline de versión distinta** (la regla iteró entre los dos snapshots). | BR-8 + BR-3: delta numérico bloqueado; se muestra `delta_status` cualitativo y el changelog (EPIC-4) explica el cambio de versión. Nunca se reporta movimiento de percentil cross-versión al North Star. | `[V]` |
| **EC-4** | **Dinero sin `signal_de_resultado`** (NBA actuó pero no volvió confirmación al CRM). | `valor_confirmado_atribuible = 0`, `estado_confirmacion = pendiente` (BR-9). No se estima. Se muestra "0 confirmado" + link a P3/P11; jamás un número optimista ni gross. | `[V]` |
| **EC-5** | **Ticket sin cohort resuelto** (cuenta sin celda asignada, o tenant sin cohorts aún). | No se expone el cruce `ticket_type × cohort` (BR-11 no aplica: sin cohort no hay distribución que mostrar). Se muestra como "sin cohort" + link a Support; no se fuerza celda ni causa (la clasificación es de Feature B). | `[I]` |
| **EC-6** | **Toggle tenant chico: n diminuto / pocos majors** (tenant con muy pocas cuentas, ej. 3 grandes). | Casi todo cae bajo n_min y/o N<k ⇒ percentil quebrado Y riesgo de re-identificación. Fail-closed doble: suprimir por k (BR-15) + ocultar percentil por n_min (BR-2); operar en modo evidencia/cualitativo. La pantalla sigue útil con deltas cualitativos + vistas linkadas, sin fabricar ranking ni exponer perfil. | `[V]` |
| **EC-7** | **`cohort_rule_version` cambia mientras hay un handoff/serie/simulación en vuelo.** | El evento ya emitido conserva su versión (BR-3, A=B); los nuevos snapshots usan la nueva versión y NO se comparan con los viejos (BR-8). El changelog registra el salto (BR-13). | `[I]` |
| **EC-8** | **Tenant sin cohorts generados todavía** (regla aún no corrió / knowledge ausente). | Degradación a regla determinística mínima (BR-4); estado vacío honesto con aviso, sin semáforo falso ni deltas inventados. | `[V]` |
| **EC-9** | **Vista de dinero/tickets stale** (el link trae `freshness_ts` > TTL). | BR-12 + BR-10: marcar stale, degradar el número a no-fresco y empujar al operador al link (dato autoritativo en la pantalla dueña). | `[C]` |
| **EC-10** | **Upside sin telemetría** (no hay datos reales de outcome para validar la proyección topo-vs-base). | BR-16: el upside se calcula desde `baseline_descriptivo` y se marca `[C]` proyección. Nunca asciende a `[V]`, nunca se suma al North Star, nunca se presenta como dinero real. Si ni el baseline descriptivo es fiable, se suprime el número y se deja solo la lectura cualitativa "los de arriba hacen X". | `[C]` |
| **EC-11** | **Log de movimiento sin variables atribuibles** (el agente detectó subió/bajó pero no pudo atribuir la causa). | BR-18: la entrada NO se emite como "movimiento explicado". Se degrada a "movimiento sin explicación" marcado (provenance `[I]`/`[C]`), o no se emite. Nunca se infiere una causa falsa para llenar el campo. | `[V]` |
| **EC-12** | **Simular con datos stale** (el operador pulsa "correr ahora" pero los inputs vencieron TTL). | BR-19 + BR-12: la simulación corre pero su resultado se marca `simulado` + `stale`; se prioriza avisar que el preview se basa en datos vencidos. Nunca se presenta el diff como representativo del estado fresco; sigue sin commitear. | `[C]` |
| **EC-13** | **Subgrupo con N<k** (al entrar a un subgrupo P90+ vs P10-, el subgrupo es demasiado chico para mostrar sin re-identificar). | BR-15: SUPRIMIR el subgrupo (no mostrar perfil ni características topo-vs-base), anotar `supresion_k_aplicada`. Gate distinto de n_min: aunque hubiera significancia, k manda aguas-arriba. Subir un nivel de la jerarquía si ahí N≥k. | `[V]` |
| **EC-14** | **Celda `cohort × intent` vacía** (cohort existe, pero ninguna cuenta con esa intención, o muy pocas). | BR-24: `n_cohort_x_intent < n_min` ⇒ no se emite percentil ni priorización para esa intención en ese cohort. NBA/Evals aplican el gate por celda; la intención queda sin priorizar, no priorizada-sobre-ruido. | `[V]` |
| **EC-15** | **Cuenta que cruza `tenure_bucket` entre dos snapshots y además la regla cambió** (combinación EC-2 + EC-3). | A=B doble: la fila conserva la `cohort_rule_version` de cada snapshot (BR-3); el delta numérico se bloquea por ambas razones (BR-8); se reporta `delta_status = mudou_cohort` cualitativo y el changelog explica el cambio de regla (BR-13). Nunca se presenta movimiento de percentil. | `[I]` |

---

### C. Matriz de fallo (MF-x) — ordenada por amenaza al North Star, de mayor a menor

> IDs `MF-x` para no chocar con los `F-x.y` de las Features.

| # | Modo de falla | Por qué amenaza el North Star | Detección | Respuesta (fail-closed) | Prov |
|---|---------------|-------------------------------|-----------|-------------------------|------|
| **MF-1** | **Percentil/delta sobre celda n<n_min mostrado como verdadero** | Alimenta a NBA con prioridad falsa y mueve el North Star sobre ruido — el peor caso. | gate n_min por celda (BR-2) al computar el snapshot | Colapsar/ocultar la celda; handoff en `modo cualitativo_sin_percentil` (BR-7/BR-14); aviso visible. | `[V]` |
| **MF-2** | **Upside / dinero estimado mostrado como confirmado o real** | El upside es proyección y el dinero sin señal es cero; mostrarlos como reales atribuye valor inexistente al North Star y contamina P3/P11. | upside sin `[C]` (BR-16); dinero sin `signal_de_resultado` (BR-9) | Upside → `[C]` proyección, nunca `[V]`, nunca al North Star; dinero → 0 / 0-con-flag, `estado=pendiente`, priorizar link (BR-10). | `[V]` |
| **MF-3** | **Delta cross-versión reportado como movimiento real** | Cuenta "mejora de percentil" inexistente como valor → North Star inflado; rompe A=B. | comparar `cohort_rule_version` de los 2 snapshots (BR-8/BR-3) | Bloquear delta numérico; degradar a `delta_status` cualitativo; changelog explica (BR-13). | `[V]` |
| **MF-4** | **Cruce cross-tenant** (segmentación, delta, semáforo, perfil, upside, log, simulación o link filtra otro tenant) | Rompe aislamiento — falla de confianza catastrófica, invalida toda métrica. | check `tenant_id` en cada query/link/simulación (BR-1) | Bloqueo rojo absoluto; no renderizar; no emitir link; la simulación también respeta el bloqueo. | `[V]` |
| **MF-5** | **Subgrupo / perfil P90+ con N<k expuesto (re-identificación)** | Expone a un puñado de cuentas identificables; daño de privacidad/confianza que invalida el uso del producto. | gate k aguas-arriba en P1 (BR-15), distinto de n_min | SUPRIMIR insight/perfil/subgrupo; anotar `supresion_k_aplicada`; subir un nivel si ahí N≥k. | `[V]` |
| **MF-6** | **Simular que commitea / toca dinero / cambia cohorts reales** | Convierte una pantalla read-only en acción no autorizada; rompe el invariante read-only y puede mover dinero/estado real. | la simulación es sandbox; no debe persistir ni emitir evento (BR-19) | No-commit; resultado efímero marcado `simulado`; no emite `EVENTO_PRIORIZADO_NBA`; respeta n_min/k/cross-tenant. | `[V]` |
| **MF-7** | **Log de movimiento sin variables atribuibles tomado como explicado** | Induce acción a ciegas vía NBA ("bajó de percentil" sin porqué) → priorización equivocada del North Star. | entrada de log sin feature-attribution (BR-18) | No emitir como "movimiento explicado"; degradar a "sin explicación" marcado o no emitir; nunca inferir causa falsa. | `[V]` |
| **MF-8** | **Vista de dinero/tickets duplicada o recalculada localmente** | Diverge de la fuente autoritativa → decisiones y North Star sobre dato fantasma. | la pantalla solo referencia, nunca persiste valor propio (BR-10) | Solo exhibir snapshot referenciado + link; si stale, degradar (BR-12). | `[V]` |
| **MF-9** | **Handoff a NBA con percentil fabricado o payload incompleto** | NBA prioriza la cuenta equivocada; el eslabón 2→3 propaga el error; sin `n_min_ok`/`provenance` NBA no puede aplicar sus gates. | `modo` del evento + n_min de la celda + completitud del payload (BR-14/BR-23) | `percentil=null`, `modo=cualitativo`; propagar `tenant_id`/`subgrupo_id`/`n_min_ok`/`freshness_ts`/`provenance`; contrato fijo. | `[V]` |
| **MF-10** | **Confusión de baselines** (usar `baseline_descriptivo` para reclamar incremento, o el de atribución para describir aspiración) | Vende "aspiración" como "incremento causado" → el North Star (que usa atribución) se infla con números descriptivos. | separación de los dos baselines (BR-17) | Upside usa solo descriptivo `[C]`; Goals/North Star usa solo atribución/holdout; prohibido cruzarlos. | `[V]` |
| **MF-11** | **Matriz explota la tela** (todas las celdas tenure×tier renderizadas) | Overload → el operador no ve dónde actuar; mata el "comando enxuto" (riesgo gemelo). | conteo de celdas activas vs n_min (BR-7) | Colapso jerárquico; mostrar solo significativas + resto agregado. | `[I]` |
| **MF-12** | **Celda `cohort × intent` vacía priorizada** | NBA prioriza una intención sobre una celda cohort×intent ruidosa/vacía → acción sobre ruido. | gate `n_cohort_x_intent` por celda (BR-24) | No emitir percentil/priorización para esa intención; gate por celda en NBA/Evals. | `[V]` |
| **MF-13** | **Baseline/snapshot/simulación stale usado como fresco** | Decisión sobre realidad vieja → percentil/dinero/upside/preview desactualizado mueve el North Star erróneamente. | TTL vencido (BR-12), incl. inputs de simulación (BR-19) | Marcar stale; degradar a cualitativo/link; no emitir delta numérico ni upside; preview marcado `stale`. | `[C]` |
| **MF-14** | **Cuenta que cruza `tenure_bucket` genera movimiento de percentil falso** | Un cambio de celda por tenure se lee como "mejoró/empeoró" → ruido al North Star; rompe A=B si no se versiona la fila. | celda destino ≠ origen + comparabilidad de versión (BR-8/BR-3) | `delta_status = mudou_cohort` cualitativo; bloquear `percentil_delta` numérico; fila conserva su `cohort_rule_version`. | `[I]` |
| **MF-15** | **La pantalla rotula la causa (invade el dominio de Feature B) o el conteo crudo se toma como diagnóstico** | No mueve el North Star directo, pero induce acción equivocada vía NBA y rompe el MECE (causa clasificada en dos lugares). | exponer solo `conteo` + `distribución`{único\|cross}, nunca rótulo de causa (BR-11; Corte 1) | Mostrar conteo `ticket_type × cohort` + distribución + link a Support; la clasificación la hace SOLO Feature B; nunca rotular/cerrar/diagnosticar aquí. | `[I]` |
| **MF-16** | **Patrón P90+ inventado sin knowledge suficiente** | Falsa "receta de los mejores" desvía la priorización y el upside. | `knowledge_de_cohort_suficiente` falso (BR-4) | Regla determinística mínima; no mostrar patrón cualitativo; marcar estado. | `[V]` |

**Nota de no-cristalizable `[I]`:** la jerarquía visual de la matriz colapsada en móvil, el umbral exacto de colapso, el orden de agregación (tenure-luego-tier vs tier-luego-tenure), la presentación del timeline del changelog, la fórmula/unidad del upside, qué variables atribuye el log y cómo, la definición operativa de pre-churn, el alcance del diff de la simulación y cómo se construye el holdout del `baseline_atribucion_segmento` son recorrido/juicio de producto → **needs-prototype**, no GWT fabricable por Q&A. Los invariantes duros (n_min, k aguas-arriba, cross-tenant, sin-señal⇒0, upside=[C]-proyección, anti-mezcla-de-versiones/A=B, read-only, simular=sandbox-no-commit, dos-baselines-separados, log-sin-variable⇒no-explicado) sí son determinísticos y especificables. `[C]` valores numéricos (n_min, k, TTL, cadencia del agente, bordes de tenure-buckets) = placeholder + falsify-probe ("¿mediste o supusiste?").

---

## OUTPUT 3 — WORKFLOW + MODELO DE DATOS: Cohorts Explorer (dashboard de status + exploración cohort→subgrupo sobre matriz tenure×tier)

**SÍNTESIS:** el Cohorts Explorer es un pipeline **batch versionado + read-only** que convierte cuentas crudas en una pantalla de comando de 4 camadas y termina en un **handoff de intención** (no de acción) a NBA. Ahora tiene **10 sub-procesos MECE** (1A→1J): segmenta la matriz tenure×tier por regla versionada con **entidad SUBGRUPO de 2 niveles** y gate k-anonymity aguas-arriba (1A); calcula percentil/gap/baseline con **gate n_min por celda y por celda cohort×intent** (1B); deriva los deltas como **EVENTO consumible** comparando snapshots versionados (1C); pinta el semáforo + agregados (1D); exhibe/linka —sin poseer— **dinero pos-NBA atribuible** (P3/P11), **tickets (conteo+distribución, señal cruda; clasificación = Feature B)** (Support) y **scope-owner** para Goals (1E); abre modales + changelog del ML (1F); explora→prioriza→emite el **payload de handoff enriquecido** (tenant_id/subgrupo_id/n_min_ok/freshness_ts/provenance) + persiste el snapshot semanal del North Star (1G); **[NUEVO 1H]** construye el **perfil del cohort/subgrupo** (síntesis gráfica+escrita) con vista **topo-vs-base** (P90+ vs percentiles bajos) y el cálculo de **UPSIDE** ("si los de abajo operaran como los de arriba, ¿cuánto generaríamos de más?", `[C]` proyección read-only, nunca estimado-vendido-como-real); **[NUEVO 1I]** corre el **agente periódico de re-segmentación** que mantiene el **LOG DE MOVIMIENTOS con variables-causa** (feature-attribution: el porqué, no solo el qué) anclado a `cohort_rule_version`; **[NUEVO 1J]** ejecuta **"correr ahora"** como **sandbox preview no-commit** que muestra el diff simulado vs el snapshot vigente sin tocar cohorts reales ni dinero. Todo es **AUTONOMÍA N/A (read-only)**: muestra, enlaza, proyecta y emite intención; jamás ejecuta, recalcula dinero, hace intake ni commitea simulaciones. [V: STARTING POINT Leo · espina §epicas/layered_ui · 3 features validadas "de acuerdo"] [I: descomposición en 10 sub-procesos como granularidad de workflow]

---

### Contrato

| Campo | Valor | Prov. |
|---|---|---|
| **Entrada** | `tenant_id` activo (operador autenticado); `CUENTA` del tenant con `tenure_actual` + `tier_base`; `cohort_rule_version` vigente; snapshot anterior persistido; grounding de Cerebro (#7); `tier_base`/`teto_tier` de Política/Tier (#10); `intent` por celda desde Evals (#6) | [V] |
| **Salida primaria** | `EVENTO_PRIORIZADO_NBA` read-only — payload enriquecido `{account_id, tenant_id, cohort_id(celda), subgrupo_id, percentil_en_cohort(null si sin-percentil), gap_hasta_top, n_min_ok, freshness_ts, cohort_rule_version, modo, provenance, operador_id}` | [V] |
| **Salidas secundarias** | `PERCENTIL_SNAPSHOT` semanal (serie → baseline North Star); `PERFIL_COHORT` + `UPSIDE` (1H); `MOVIMIENTO_LOG` con variables-causa (1I); `SIMULACION` no-commit (1J); render de las 4 camadas + modal de síntesis | [V] |
| **Invariante de frontera** | Cross-tenant = bloqueo-rojo absoluto en TODO sub-proceso (segmentación, subgrupos, deltas, semáforo, links, perfil, log, simulación) | [V] |
| **Invariante de autonomía** | Read-only en todo el flujo; no ejecuta / no toca dinero / no eleva autonomía / no commitea; `min(pedido_NBA, liberado_evals, teto_tier)` aplica **aguas-abajo** en NBA; simular = sandbox preview no-commit | [V] |
| **Invariante de re-identificación** | k-anonymity: suprimir insight/P90+/subgrupo/perfil si `N<k`, **aplicado aguas-arriba en P1**; anotar `supresion_k_aplicada` (gate DISTINTO de n_min) | [V] |
| **Modo de fallo global** | Fail-closed: ante `n<n_min`, `N<k`, knowledge ausente, baseline stale, término no modelado, o versión no conciliable → ocultar/colapsar/suprimir/0-con-flag + aviso; nunca inventar percentil/dinero/upside | [V] |
| **No-posesión** | Dinero pos-NBA (P3/P11), intake de tickets (P5), control de autonomía (02_NBA), atribución/contrafactual (P3/P11) se **LEEN/LINKAN**, no se poseen | [V] |

---

### ANTES (pre-condiciones)

- **A1** — Operador autenticado y `tenant_id` resuelto; sesión anclada a un único tenant (frontera BR-1). [V]
- **A2** — Existe `cohort_rule_version` vigente publicada; si no hay, no se computa matriz ni subgrupos (no se inventan celdas). [V·BR-3]
- **A3** — Grounding desde Cerebro (#7) y `tier_base`/`teto_tier` desde Política/Tier (#10); si falta `knowledge_de_cohort` se degrada a regla determinística mínima (BR-4), no se aborta. [V·BR-4]
- **A4** — Existe (o no) snapshot anterior: primer corte → deltas 1C vacíos/`nuevo`, log 1I sin movimiento, semáforo sin comparación. [I: comportamiento de primer-corte]
- **A5** — `TTL_baseline` definido [C]; baseline stale → se marca y se bloquea la lectura de movimiento como "valor" hasta refrescar. [V·EC] [C: valor TTL]
- **A6 [NUEVO]** — Gate **k-anonymity** parametrizado `k` [C]; se aplica **aguas-arriba en P1** antes de exponer cualquier insight/P90+/subgrupo/perfil; distinto del gate n_min. [V·BR-15] [C: valor k]
- **A7 [NUEVO]** — Cadencia del agente periódico 1I definida (batch versionado) [C]; alineada a la cadencia **semanal** del North Star/Goals para el snapshot. [V] [C: período exacto]

---

### DURANTE (sub-procesos)

#### Sub-proceso 1A — Segmentación matriz tenure×tier + SUBGRUPO (2 niveles) + `cohort_rule_version` + gate k
`[INICIO 1A]`
- **[ACTOR: IA]** job batch de segmentación.
- **[DATA-IN]** `CUENTA{account_id, tenant_id, tier_base, tenure_actual}`; `cohort_rule_version` vigente; enum `tenure_bucket{0-3m,3-6m,6-12m,12m+}` [C]; `k` [C]. [V/C]
- **[CÓMPUTO]** derivar `tenure_bucket`; asignar cuenta a la **celda** `cohort_id = (tenure_bucket × tier_base)`; **derivar `subgrupo_id` (nivel-2 dentro del cohort)** y poblar `N_subgrupo`; sellar `cohort_rule_version`, `n_cuentas` por celda y `freshness_ts`. **Gate k aguas-arriba**: si `N_subgrupo < k` (o `n_cuentas < k`) → suprimir la entidad expuesta y marcar `supresion_k_aplicada=true` (anti-re-identificación, distinto de n_min). Si `knowledge_de_cohort` ausente → regla determinística mínima (BR-4). [V·BR-3·BR-4·BR-15] [I: derivación exacta tenure→bucket y regla de derivación de subgrupo → outcome+constraint, needs-prototype]
- **[DATA-OUT]** `COHORT(celda)` + `SUBGRUPO{subgrupo_id, cohort_id, tenant_id, N_subgrupo, cohort_rule_version, supresion_k_aplicada}` pobladas (sin percentil aún). [V]
- **[DECISIÓN]** ¿la cuenta cae en exactamente una celda/subgrupo del mismo tenant **y** `N≥k`? sí→continúa; cross-tenant→descartar+alerta; `N<k`→suprimir+anotar. [V]
- **[AUTONOMÍA]** N/A read-only. [V]
- **[REGLA]** BR-1, BR-3, BR-4, BR-5, BR-15 (k-anonymity). [V]
- **[FAIL-CLOSED]** sin `cohort_rule_version` → no segmenta; `N<k` → suprime entidad + `supresion_k_aplicada`; tenant sin cuentas → matriz vacía con aviso. [V·EC]
`[FIN 1A]`

#### Sub-proceso 1B — Percentil / gap / baseline + gate n_min (por celda y por celda cohort×intent)
`[INICIO 1B]`
- **[ACTOR: IA]** job batch de ranking + gate.
- **[DATA-IN]** celdas/subgrupos de 1A; métricas canónicas por cuenta (Cerebro #7); `intent` por celda (Evals #6); `n_min` [C]. [V/C]
- **[CÓMPUTO]** por celda/subgrupo: ranking interno → `percentil_en_cohort`; `gap_hasta_top = métrica_top − métrica_cuenta`; poblar **dos baselines**: `baseline_descriptivo` (qué hacen los P90+, aspiracional — alimenta UPSIDE 1H) y `baseline_atribucion_segmento` (contrafactual/holdout — para incremento vs gross, lo consume Goals/North Star); `baseline_cohort` con `valor_actual_kpi` por KPI {conexion|tickets|recurrencia|cross_sell} + ventana (`[V]` con telemetría, si no `[C]`); `cohort_baseline_version` + `baseline_timestamp`; `patron_p90`. **Gate n_min POR CELDA y POR celda cohort×intent**: poblar `n_cohort_x_intent`; si `n_cuentas < n_min` o `n_cohort_x_intent < n_min` → `colapsada=true`, `n_min_ok=false`, agregar/ocultar (NBA/Evals aplican el gate por celda cohort×intent). [V·BR-2] [I: regla de colapso/jerarquía de agregación → outcome+constraint, needs-prototype]
- **[DATA-OUT]** `PERCENTIL_SNAPSHOT{snapshot_id, account_id, cohort_id, subgrupo_id, percentil_en_cohort, gap_hasta_top, baseline_descriptivo, baseline_atribucion_segmento, baseline_cohort{valor_actual_kpi,ventana}, cohort_baseline_version, n_cohort_x_intent, n_min_ok, freshness_ts, timestamp, provenance}`; celdas colapsadas marcadas. [V]
- **[DECISIÓN]** `n_celda ≥ n_min` **y** `n_cohort_x_intent ≥ n_min`? sí→percentil; no→colapsar+modo cualitativo+`n_min_ok=false`. [V]
- **[AUTONOMÍA]** N/A read-only. [V]
- **[REGLA]** BR-2 (n_min fail-closed), BR-5 (provenance). [V]
- **[FAIL-CLOSED]** `n<n_min` → ocultar/agregar, NUNCA explotar la matriz; baseline stale (TTL) → percentil no cuenta como valor hasta refrescar; sin telemetría para `baseline_cohort` → `[C]`, nunca `[V]`. [V·EC]
`[FIN 1B]`

#### Sub-proceso 1C — Deltas como EVENTO consumible (comparar 2 snapshots versionados)
`[INICIO 1C]`
- **[ACTOR: IA]** job de diff entre snapshots.
- **[DATA-IN]** `PERCENTIL_SNAPSHOT` vigente (1B) + snapshot anterior, **del mismo tenant y conciliables por `cohort_rule_version`**. [V]
- **[CÓMPUTO]** por cuenta, derivar `delta_status` MECE: `mudou_cohort` (celda_origen≠destino), `melhorou_percentil` (Δ>0 en celda significativa), `baixou_percentil` (Δ<0), `at_risk` (baja de percentil/cohort O entra en patrón de pre-churn), `novo` (sin snapshot anterior), `churn` (ausente en vigente). **Promover DELTA de UI a EVENTO**: emitir `percentil_delta{sentido(subio|bajo|igual), magnitud, ventana, n_min_ok}`. `magnitud=null` si alguna celda involucrada es colapsada. **A=B**: si la serie cruza un cambio de `cohort_rule_version`, marcar y NO presentar movimiento falso. [V] [I: umbral exacto de `at_risk`/`pre-churn` → outcome+constraint, needs-prototype]
- **[DATA-OUT]** `TRANSICION_DE_COHORT(DELTA-EVENTO){delta_id, account_id, cohort_id_origen, cohort_id_destino, delta_status, percentil_delta{sentido,magnitud,ventana,n_min_ok}, cohort_rule_version, snapshot_from, snapshot_to, provenance}`. [V]
- **[DECISIÓN]** ¿celdas conciliables (mismo tenant, misma versión)? sí→emitir Δ; versión distinta→marcar A=B, solo cualitativo (EC-3). [V]
- **[AUTONOMÍA]** N/A read-only. [V]
- **[REGLA]** BR-1, BR-2 (no movimiento sobre celda colapsada), BR-3 (no mezclar versiones / A=B), BR-5. [V]
- **[FAIL-CLOSED]** sin snapshot anterior → todos `novo`; cambio de versión entre snapshots → delta cualitativo marcado, no `magnitud`. [V·EC-3]
`[FIN 1C]`

#### Sub-proceso 1D — Semáforo de salud + agregados por cohort/subgrupo
`[INICIO 1D]`
- **[ACTOR: IA]** capa de render camada-1 (relance).
- **[DATA-IN]** celdas/subgrupos significativos/colapsados (1B) + delta-eventos (1C). [V]
- **[CÓMPUTO]** estado verde/ámbar/rojo por celda/subgrupo con atributos preatentivos (Knaflic: 1 mensaje por vista, desentulhar); colapsadas/suprimidas-por-k se atenúan/agregan, no explotan la tela; honestidad dataviz (Cairo). Mensaje único: *¿cómo está el negocio por cohort?* [V] [I: heatmap vs chips, jerarquía móvil → needs-prototype]
- **[DATA-OUT]** render del semáforo (matriz desktop / lista jerárquica tier→tenure móvil) + agregados. [V]
- **[DECISIÓN]** celda significativa→color por estado; colapsada/suprimida→atenuada/agregada. [V]
- **[AUTONOMÍA]** N/A read-only. [V]
- **[REGLA]** BR-1, BR-2, BR-5, BR-15. [V]
- **[FAIL-CLOSED]** matriz vacía o todo colapsado/suprimido → estado neutro + aviso, sin falso verde. [V·EC]
`[FIN 1D]`

#### Sub-proceso 1E — Vistas linkadas (dinero pos-NBA + tickets señal-cruda + scope-owner, READ)
`[INICIO 1E]`
- **[ACTOR: IA]** capa de exhibición camada-3 (panorama), **read-only / linkada**.
- **[DATA-IN]** por celda/subgrupo: referencia a `valor_confirmado_atribuible` (P3/P11), tickets (P5), `scope_owner_ref`; `freshness_ts`; link a `gap_hasta_top` como leading-indicator. [V]
- **[CÓMPUTO]** **(a) Dinero (EXHIBIDO):** `valor_confirmado_atribuible` + `estado_confirmacion{confirmado_sostenido|pendiente}` + `atribuible:bool`; sin señal → `0`; término no modelado → `0-con-flag`; NUNCA gross ni estimado; **LINKA** a P3/P11, no recalcula. **(b) Tickets — SEÑAL CRUDA (EXHIBIDO):** **LINKA** a Support (no intake ni clasificación aquí); expone el `conteo` `ticket_type × cohort` + la `distribución`{único|cross} (un solo cohort vs varios) + `freshness_ts`; **NO rotula la causa** — la clasificación es de Feature B (diagnóstico), dueña única (Corte 1). **(c) Scope-owner:** exponer `scope_owner_ref{dueno_id, nivel}` para que Goals recorte role-scoped **sin re-agregar** (evita cross-tenant + A≠B). **(d) Leading-indicator:** exponer `gap_hasta_top{valor, unidad, cohort_rule_version}` consumible. Todo link **preserva tenant** (BR-1). [V] [I: contrato de lectura + SLA de frescura → outcome+constraint]
- **[DATA-OUT]** `VISTA_DINERO_LINK`, `VISTA_TICKETS_LINK`, `scope_owner_ref`, `gap_hasta_top`(leading-indicator) — todos con `fuente`, `link_destino`, `freshness_ts`, `provenance`. [V]
- **[DECISIÓN]** ¿señal confirmada/atribuible? sí→valor+estado; no→`0`/`0-con-flag`. ¿el `ticket_type` aparece en un solo cohort o en varios? → marcar `distribución`{único|cross} (conteo crudo, **NO** clasificación de causa — eso es de Feature B). [V]
- **[AUTONOMÍA]** N/A read-only (exhibe/linka, jamás recalcula dinero ni hace intake). [V]
- **[REGLA]** BR-1, BR-5, BR-6 (read-only no execute/money). [V]
- **[FAIL-CLOSED]** sin señal → `0`; no modelado → `0-con-flag`; link stale → mostrar `freshness_ts` + aviso, no duplicar. [V·EC]
`[FIN 1E]`

#### Sub-proceso 1F — Modales de info-de-cohort + histórico del ML (changelog)
`[INICIO 1F]`
- **[ACTOR: IA]** capa de drill-de-contexto camada-4 (modal).
- **[DATA-IN]** `COHORT_INFO{cohort_id, subgrupo_id, definicion, tenure_bucket, tier_base, n_cuentas, N_subgrupo, cohort_rule_version}`; `ML_CHANGELOG{version_id, cohort_rule_version, fecha, que_cambio, efecto_en_baseline, provenance}`. [V]
- **[CÓMPUTO]** renderizar definición vigente + timeline del changelog de la regla; **nunca mezclar baselines de versiones distintas** (BR-3/EC-3/A=B). Auditable: *"¿por qué esta cuenta cae aquí?"*. [V] [I: presentación del timeline → outcome+constraint]
- **[DATA-OUT]** modal de contexto + timeline auditable. [V]
- **[DECISIÓN]** ¿versiones del baseline = vigente? sí→junto; no→separar por versión, no mezclar. [V·EC-3]
- **[AUTONOMÍA]** N/A read-only. [V]
- **[REGLA]** BR-3, BR-5. [V]
- **[FAIL-CLOSED]** changelog ausente → solo versión vigente con aviso; mezcla detectada → bloquear vista combinada. [V·EC-3]
`[FIN 1F]`

#### Sub-proceso 1G — Explorar + priorizar + handoff a NBA (payload enriquecido) + snapshot semanal
`[INICIO 1G]`
- **[ACTOR: HUMANO]** operador explora; **[ACTOR: IA]** emite el evento.
- **[DATA-IN]** celda/subgrupo activo + drill de cuentas ordenado por `gap_hasta_top` (default; `$-en-juego` como prior); selección del operador. [V] [I: orden/filtros exactos → juicio de producto, default por gap]
- **[CÓMPUTO]** al marcar cuenta/segmento prioritario, emitir **intención** (no acción): `modo=percentil` si la celda tenía `n_min_ok=true`; `modo=cualitativo_sin_percentil` si fue colapsada (handoff por percentil **bloqueado**). **Payload de handoff += `tenant_id`, `subgrupo_id`, `n_min_ok`, `freshness_ts`, `provenance`** (hoy ausentes); propagar `freshness_ts` + `n_min_ok` como **campos aguas-abajo**, no solo lógica interna. Persistir `PERCENTIL_SNAPSHOT` **alineado a la cadencia SEMANAL de Goals** (no derivar histórico aguas-abajo). `risk_class` **NO nace aquí** (P1 read-only solo observa y apunta `at_risk`; el risk_class reversible/financiero/cross-tenant nace en NBA/Política). [V·BR-2·BR-6]
- **[DATA-OUT]** `EVENTO_PRIORIZADO_NBA{evento_id, account_id, tenant_id, cohort_id, subgrupo_id, percentil_en_cohort(null si sin-percentil), gap_hasta_top, n_min_ok, freshness_ts, cohort_rule_version, modo{percentil,cualitativo_sin_percentil}, provenance, operador_id}` → NBA (#2). [V]
- **[DECISIÓN]** ¿`n_min_ok=true`? sí→handoff con percentil; no→handoff cualitativo sin percentil. [V·BR-2]
- **[AUTONOMÍA]** N/A read-only — emite intención; NUNCA ejecuta ni eleva autonomía; `min(pedido_NBA, liberado_evals, teto_tier)` aplica aguas-abajo en NBA. [V·BR-6]
- **[REGLA]** BR-1, BR-2, BR-6. [V]
- **[FAIL-CLOSED]** celda colapsada → bloquear percentil en handoff; cross-tenant en selección → bloqueo-rojo. [V]
`[FIN 1G]`

#### Sub-proceso 1H — Perfil del cohort/subgrupo (síntesis gráfica+escrita) + topo-vs-base + UPSIDE  **[NUEVO — Feature A]**
`[INICIO 1H]`
- **[ACTOR: IA]** capa de síntesis (alimenta EPIC-1/EPIC-2 perfil + EPIC-4 modal síntesis).
- **[DATA-IN]** `PERCENTIL_SNAPSHOT` (1B) con `baseline_descriptivo`; `patron_p90`; métricas canónicas por percentil dentro de la celda/subgrupo; `N_subgrupo`/`supresion_k_aplicada` (1A). [V]
- **[CÓMPUTO]** **(a) Perfil:** generar un **resumen gráfico Y escrito** de "quién es este cohort/subgrupo" (características) — dataviz honesta (Cairo) + **1 mensaje por vista** (Knaflic). **(b) Topo-vs-base:** al entrar a un subgrupo, computar lado a lado las características de los **percentiles ALTOS (P90+)** vs las de los **percentiles BAJOS** — qué hacen distinto los de arriba (usa `baseline_descriptivo`, aspiracional). **(c) UPSIDE:** calcular *"si los de abajo operaran como los de arriba, ¿cuánto generaríamos de más?"* — dimensionar la **OPORTUNIDAD** (dinero/impacto), **atribuible y marcada `[C]` mientras no haya telemetría** (nunca estimado vendido como real); es **lectura/proyección, no acción**. Si `N<k` → suprimir perfil/P90+/upside + `supresion_k_aplicada`. [V·BR-5·BR-15] [I: forma exacta del perfil escrito/gráfico + fórmula de upside → outcome+constraint, needs-prototype]
- **[DATA-OUT]** `PERFIL_COHORT{cohort_id, subgrupo_id, sintesis_escrita, sintesis_grafica_ref, caracteristicas_top(P90+), caracteristicas_base, provenance}`; `UPSIDE{cohort_id, subgrupo_id, oportunidad_valor, unidad, base_calculo=baseline_descriptivo, atribuible:bool, estado='proyeccion_lectura', provenance=[C]_sin_telemetria, cohort_rule_version}`. [V/C]
- **[DECISIÓN]** ¿`N≥k` y celda significativa? sí→perfil+topo-vs-base+upside; `N<k`→suprimir; sin telemetría→upside `[C]` proyección, no `[V]`. [V]
- **[AUTONOMÍA]** N/A read-only — proyecta/lee, **no acciona ni promete dinero**. [V]
- **[REGLA]** BR-1, BR-2, BR-5, BR-15; dinero/upside = atribuible-nunca-estimado-como-real. [V]
- **[FAIL-CLOSED]** `N<k` → suprimir; sin telemetría → `[C]` y rotular "proyección/lectura"; celda colapsada → solo síntesis cualitativa sin upside numérico. [V·EC]
`[FIN 1H]`

#### Sub-proceso 1I — Agente periódico de re-segmentación + LOG de movimientos con variables-causa  **[NUEVO — Feature B]**
`[INICIO 1I]`
- **[ACTOR: IA]** agente batch versionado (nueva sub-capa de log+agente en EPIC-2).
- **[DATA-IN]** snapshots `PERCENTIL_SNAPSHOT` consecutivos (1B); delta-eventos (1C); `cohort_rule_version` de cada snapshot; cadencia A7 [C]. [V/C]
- **[CÓMPUTO]** correr **periódicamente** (batch versionado), re-segmentar, y mantener un **LOG CLARO de movimientos**: quién **subió/bajó de cohort**, quién **subió/bajó de percentil**. **CRÍTICO (explainability / feature-attribution):** cada entrada registra **QUÉ VARIABLES causaron el movimiento** (el porqué, no solo el qué). Cada entrada **ancla a `cohort_rule_version`** (A=B: si el movimiento cruza un cambio de regla, se marca y no se presenta como movimiento real). Es el **motor de los DELTAS** (1C) con explicación causal embebida. [V·BR-3] [I: método de feature-attribution → outcome+constraint, needs-prototype]
- **[DATA-OUT]** `MOVIMIENTO_LOG{log_id, cuenta(account_id), tipo{subio_cohort,bajo_cohort,subio_percentil,bajo_percentil}, variables_causa[], cohort_rule_version, ts, provenance}`. [V]
- **[DECISIÓN]** ¿el movimiento es intra-versión? sí→registrar con variables-causa; cruza versión→marcar A=B, no presentar como movimiento real. [V·BR-3]
- **[AUTONOMÍA]** N/A read-only — observa, registra y explica; **no re-asigna cohorts reales fuera del batch versionado** ni acciona. [V]
- **[REGLA]** BR-1, BR-2 (no log de movimiento sobre celda colapsada como cuantitativo), BR-3 (ancla versión / A=B), BR-5. [V]
- **[FAIL-CLOSED]** sin snapshot previo → log vacío; movimiento que cruza `cohort_rule_version` → marcado, no presentado como real; `N<k` en la celda destino → suprimir la entrada expuesta. [V·EC-3]
`[FIN 1I]`

#### Sub-proceso 1J — Simular-ahora: sandbox preview no-commit  **[NUEVO — Feature C → EPIC-6]**
`[INICIO 1J]`
- **[ACTOR: HUMANO]** operador pulsa "correr ahora"; **[ACTOR: IA]** corre el mock.
- **[DATA-IN]** snapshot vigente (1B); `CUENTA` actuales del tenant; `cohort_rule_version` vigente; `n_min`/`k` [C]. [V/C]
- **[CÓMPUTO]** correr un **TEST/MOCK on-demand**: cómo quedarían los cohorts si se corriera la segmentación **AHORA**, en este período, para ver cómo evolucionan los clientes. Es **PREVIEW read-only / sandbox**: **NO commitea, NO cambia los cohorts reales persistidos, NO toca dinero**. Mostrar el "cómo quedaría" vs el snapshot vigente (**diff simulado**). **Respeta `n_min`/`k`/cross-tenant igual** que el pipeline real. [V·BR-6·BR-2·BR-15] [I: presentación del diff simulado → outcome+constraint, needs-prototype]
- **[DATA-OUT]** `SIMULACION{sim_id, tenant_id, snapshot_mock, diff_vs_vigente, cohort_rule_version, no_commit=true, ts, provenance}` (efímero/sandbox, no persiste como cohort real). [V]
- **[DECISIÓN]** ¿es preview? sí siempre → mostrar diff, NUNCA persistir cohorts reales ni emitir handoff con dinero. [V]
- **[AUTONOMÍA]** N/A read-only — sandbox preview no-commit; no cambia estado real, no toca dinero, no eleva autonomía. [V·BR-6]
- **[REGLA]** BR-1 (cross-tenant igual), BR-2 (n_min igual), BR-6 (no-commit/no-money), BR-15 (k igual). [V]
- **[FAIL-CLOSED]** intento de commit → bloqueado por diseño; `n<n_min`/`N<k` en el mock → colapsar/suprimir igual que el real; cross-tenant en el mock → bloqueo-rojo. [V·EC]
`[FIN 1J]`

---

### Flujo ASCII

```
[ANTES: tenant + cohort_rule_version + grounding(#7) + tier(#10) + intent(#6) + snapshot anterior + k[C] + TTL[C]]
                                          │
                                          ▼
                ┌──────────────────────────────────────────────────┐
                │ 1A Segmentación tenure×tier + SUBGRUPO (2 niveles)  │  BR-1/3/4/5/7
                │    cuenta → celda + subgrupo_id (N_subgrupo)        │  k aguas-arriba: N<k → suprimir
                │    GATE k-anonymity (≠ n_min)                       │  fail-closed: sin versión → stop
                └──────────────────────────────────────────────────┘
                                          │  celdas/subgrupos + n_cuentas + freshness_ts
                                          ▼
                ┌──────────────────────────────────────────────────┐
                │ 1B Percentil/gap + GATE n_min (celda Y cohort×intent)│  BR-2  ◄── n_min[C]
                │    2 baselines: descriptivo + atribucion_segmento    │  n<n_min → COLAPSAR (n_min_ok=false)
                │    baseline_cohort{valor_actual_kpi,ventana}         │
                └──────────────────────────────────────────────────┘
                         │ snapshot_vigente (SEMANAL)
          ┌───────────────┼──────────────────────────────────────────────┐
          ▼               ▼                                                ▼
┌───────────────────┐  ┌──────────────────────────┐      (snapshot persistido SEMANAL) ──► North Star
│ 1C Delta-EVENTO    │  │ 1I Agente periódico +      │                                       (baseline_atribucion)
│  delta_status +    │◄─┤    MOVIMIENTO_LOG          │   ║ motor causal de los deltas ║
│  percentil_delta   │  │    variables_causa[] (el   │   ancla cohort_rule_version (A=B)
│  {sentido,magnitud,│  │    PORQUÉ) + versión       │
│   ventana,n_min_ok}│  └──────────────────────────┘
│  A=B si cruza ver. │
└───────────────────┘
          │ delta-eventos
          ▼
┌───────────────────┐
│ 1D Semáforo +      │  CAMADA 1 (relance)  Cairo+Knaflic
│  agregados/celda   │  colapsadas/suprimidas atenuadas
└───────────────────┘
          │ (1 toque)
          ▼
┌───────────────────────────────────────────────────────────────┐
│ 1E Vistas linkadas (CAMADA 3, READ-ONLY)                         │
│   $ pos-NBA: valor_confirmado_atribuible + estado_confirmacion ──┼─► P3/P11
│              + atribuible:bool (sin señal=0 · no modelado=0-flag) │
│   tickets: conteo ticket_type×cohort + distr.{único|cross} ──────┼─► Support(B)
│   scope_owner_ref{dueno_id,nivel} (Goals role-scoped, no re-agg) │
│   gap_hasta_top (leading-indicator consumible)                   │
└───────────────────────────────────────────────────────────────┘
          │ (drill de contexto)
          ▼
┌───────────────────┐        ┌──────────────────────────────┐
│ 1F Modal info + ML │◄───────┤ ML_CHANGELOG (anti-mezcla EC5) │
│    changelog  BR-3 │        └──────────────────────────────┘
└───────────────────┘
          │ (entrar a subgrupo / drill de cuenta)
          ▼
┌───────────────────────────────────────────────────────────────┐
│ 1H Perfil cohort/subgrupo (síntesis gráfica+escrita)  [Feat A]   │  EPIC-1/2 + EPIC-4 modal
│   TOPO-vs-BASE: características P90+ vs percentiles bajos         │  usa baseline_descriptivo
│   UPSIDE: "si los de abajo operaran como arriba, ¿cuánto +?"     │  [C] sin telemetría · lectura/proyección
│   N<k → suprimir perfil/P90+/upside                              │  nunca estimado-como-real
└───────────────────────────────────────────────────────────────┘
          │ (priorizar)
          ▼
┌───────────────────────────────────────────────────────────────┐
│ 1G Explorar(orden gap) → priorizar → HANDOFF read-only           │
│   EVENTO_PRIORIZADO_NBA += tenant_id, subgrupo_id, n_min_ok,     │──► NBA (#2)
│   freshness_ts, provenance  {modo: percentil|cualitativo}        │   (min() aguas-abajo · risk_class nace en NBA)
│   celda colapsada ⇒ bloquea percentil                            │
└───────────────────────────────────────────────────────────────┘

                ┌──────────────────────────────────────────────────┐
   (on-demand)  │ 1J SIMULAR-AHORA: sandbox preview NO-COMMIT [FeatC]│  EPIC-6
   botón ──────►│   "¿cómo quedarían los cohorts si corro AHORA?"     │  NO commitea · NO cambia reales · NO dinero
                │   diff simulado vs snapshot vigente                 │  respeta n_min/k/cross-tenant igual
                └──────────────────────────────────────────────────┘
                                          │
                                          ▼
                                 [DESPUÉS: NBA consume · North Star mide movimiento semanal]

  ║ INVARIANTE TRANSVERSAL (todo 1A–1J): tenant-único (BR-1) · read-only/no-commit (BR-6) · k-anonymity (BR-15) ║
```

---

### DESPUÉS (post-condiciones)

- **D1** — `EVENTO_PRIORIZADO_NBA` (payload enriquecido con tenant_id/subgrupo_id/n_min_ok/freshness_ts/provenance) entregado a NBA (#2) como intención; NBA aplica `min(pedido_NBA, liberado_evals, teto_tier)` y **ahí nace `risk_class`** — fuera de esta pantalla. [V·BR-6]
- **D2** — `PERCENTIL_SNAPSHOT` persistido **semanal** (alineado a Goals) → North Star mide movimiento de percentil contra `baseline_atribucion_segmento`; el movimiento solo cuenta como **valor** cuando es confirmado/atribuible (coherente con P3). [V]
- **D3** — Vistas linkadas no alteran datos de P3/P11/P5; drill profundo de dinero/tickets ocurre en la pantalla dueña vía link; `scope_owner_ref` deja a Goals recortar role-scoped sin re-agregar. [V]
- **D4** — `ML_CHANGELOG` + `MOVIMIENTO_LOG` (con variables-causa) dejan rastro auditable del versionado y del **porqué** de cada movimiento; ningún baseline de versiones distintas se mezcló (A=B). [V]
- **D5** — `PERFIL_COHORT` + `UPSIDE` quedan como **lectura/proyección** (`[C]` sin telemetría), nunca como dinero prometido. [V/C]
- **D6** — `SIMULACION` queda como sandbox efímero no-commit: ningún cohort real cambió, ningún dinero se tocó. [V]
- **D7** — Ninguna acción se ejecutó, ningún dinero se recalculó, ninguna autonomía se elevó, nada se commiteó: la pantalla cerró read-only. [V·BR-6]

---

### MAPA DE SISTEMAS

| Sistema | Rol | Dirección | Posesión | Prov. |
|---|---|---|---|---|
| Cerebro / Ficha (#7) | Grounding + métricas canónicas; persistencia de segmentación/percentil/snapshot | aguas-arriba (lee) + persiste | externo (lee) | [V] |
| Política / Tier (#10) | Fuente de `tier_base`/`teto_tier`; **`risk_class` nace aquí + en NBA** | aguas-arriba (lee) | externo (lee) | [V] |
| Evals (#6) | Define la celda **cohort×intent**; aplica gate de muestra por celda cohort×intent | lateral | externo | [V] |
| NBA / Playbooks (#2) | Consume payload enriquecido; aplica `min()`; **origina `risk_class`** | aguas-abajo (emite) | externo | [V] |
| North Star | Mide movimiento de percentil **semanal** vs `baseline_atribucion_segmento` | aguas-abajo (alimenta) | externo | [V] |
| **Goals/KPIs (#3)** | **Dueño del dinero pos-NBA** (link); consume `scope_owner_ref` (role-scoped, no re-agrega) y `gap_hasta_top` (leading-indicator) | lateral (LINKA, no posee) | externo | [V] |
| **Salud (#11)** | **Co-dueño del `valor_confirmado_atribuible`** (link, no recalcula aquí) | lateral (LINKA, no posee) | externo | [V] |
| **Support (#5) — Feature B diagnóstico** | **Dueño del intake de tickets Y de la CLASIFICACIÓN/diagnóstico de la causa** (link, no intake ni clasificación aquí) | lateral (LINKA, no posee) | externo | [V] |
| 02_NBA cockpit | Control de autonomía / pausar-liberar | **FUERA DE ALCANCE** | no | [V] |

---

### PUNTOS DE DOLOR / RIESGOS

| # | Dolor/Riesgo | Mitigación en el workflow | Prov. |
|---|---|---|---|
| P1 | Matriz tenure×tier + **subgrupos** → más celdas → overload de la tela | Gate n_min por celda (1B) + colapso/atenuación (1D); gate k para subgrupos (1A); móvil → lista jerárquica | [V] |
| P2 | Percentil sobre **ruido** (celda diminuta) | `n<n_min` → no percentil; handoff cualitativo (1B/1G); gate **por celda cohort×intent** también | [V·BR-2] |
| P3 | **Mezcla de versiones** → baselines/movimientos incomparables (A≠B) | Diff/log solo entre snapshots conciliables; A=B marcada (1C/1F/1I) | [V·BR-3·EC-3] |
| P4 | Mostrar **dinero/upside estimado** como real (engaño) | Solo `valor_confirmado_atribuible`+estado; upside `[C]` lectura/proyección; sin señal=0 (1E/1H) | [V] |
| P5 | **Duplicar** datos de P3/P5/P11 → doble fuente de verdad | Vistas linkadas read-only; drill profundo en pantalla dueña (1E) | [V·BR-6] |
| P6 | **Cross-tenant** leak (deltas/links/perfil/log/simulación) | BR-1 transversal en 1A–1J; link/sim/log preservan tenant | [V·BR-1] |
| P7 | Baseline **stale** → North Star mide contra ruido | TTL [C]; baseline stale → movimiento no cuenta como valor (A5/1B) | [V·EC] [C] |
| P8 | Confundir intención/proyección con **acción** | Handoff = intención; upside = lectura; simular = no-commit; `min()` aguas-abajo; risk_class fuera de P1 (1G/1H/1J) | [V·BR-6] |
| P9 | **Re-identificación** de cuentas en subgrupos/P90+/perfil | Gate k aguas-arriba en P1 + `supresion_k_aplicada` (1A/1H), distinto de n_min | [V·BR-15] |
| P10 | Log que dice **qué** cambió pero no **por qué** | `variables_causa[]` (feature-attribution) obligatorio por entrada (1I) | [V] |
| P11 | Simulación que **contamina** cohorts reales o dinero | Sandbox no-commit por diseño; commit bloqueado; respeta n_min/k/cross-tenant (1J) | [V·BR-6] |
| P12 | Recorrido móvil de matriz/perfil/diff no cristalizable por Q&A | `[I]` needs-prototype: jerarquía móvil, heatmap-vs-chips, forma del perfil/upside, presentación del diff y del timeline | [I] |

---

### MODELO DE VARIABLES

**Reuso (del draft / espina):**

| Entidad/variable | Campos clave | Prov. |
|---|---|---|
| `TENANT` | `tenant_id` PK, nombre — frontera BR-1 | [V] |
| `COHORT (celda)` | `cohort_id` PK = `tenure_bucket × tier_base`, `tenant_id`, `tier_base`, `tenure_bucket`{0-3m,3-6m,6-12m,12m+}[C], `cohort_rule_version`, `n_cuentas`, `baseline_cohort`, `cohort_baseline_version`, `baseline_timestamp`, `patron_p90`, `knowledge_de_cohort_suficiente`, `colapsada`bool | [V/C] |
| `CUENTA` | `account_id` PK, `tenant_id`, `cohort_id`(celda), `subgrupo_id`, `tier_base`, `tenure_actual`→`tenure_bucket` | [V] |
| `PERCENTIL_SNAPSHOT` | `snapshot_id`, `account_id`, `cohort_id`, `subgrupo_id`, `percentil_en_cohort`, `gap_hasta_top`, `cohort_baseline_version`, `timestamp`, `provenance` | [V] |
| `EVENTO_PRIORIZADO_NBA` | (ver "campos += abajo") | [V] |

**Nuevas / extendidas:**

| Entidad/variable | Campos clave | Prov. |
|---|---|---|
| `SUBGRUPO` **[NUEVO]** | `subgrupo_id` PK, `cohort_id`, `tenant_id`, `N_subgrupo`, `cohort_rule_version`, `supresion_k_aplicada`bool (cohort→subgrupo, **2 niveles**) | [V] |
| `MOVIMIENTO_LOG` **[NUEVO·Feat B]** | `log_id` PK, `cuenta`(account_id), `tipo`{subio_cohort,bajo_cohort,subio_percentil,bajo_percentil}, `variables_causa[]` (feature-attribution, el PORQUÉ), `cohort_rule_version`, `ts`, `provenance` | [V] |
| `SIMULACION` **[NUEVO·Feat C]** | `sim_id` PK, `tenant_id`, `snapshot_mock`, `diff_vs_vigente`, `cohort_rule_version`, `no_commit`=true, `ts`, `provenance` (sandbox efímero) | [V] |
| `PERFIL_COHORT` **[NUEVO·Feat A]** | `cohort_id`, `subgrupo_id`, `sintesis_escrita`, `sintesis_grafica_ref`, `caracteristicas_top`(P90+), `caracteristicas_base`, `provenance` | [V] |
| `UPSIDE` **[NUEVO·Feat A]** | `cohort_id`, `subgrupo_id`, `oportunidad_valor`, `unidad`, `base_calculo`=`baseline_descriptivo`, `atribuible`:bool, `estado`='proyeccion_lectura', `cohort_rule_version`, `provenance`=[C]_sin_telemetria | [V/C] |
| `TRANSICION_DE_COHORT (DELTA-EVENTO)` **[extendida]** | `delta_id`, `account_id`, `cohort_id_origen`, `cohort_id_destino`, `delta_status`{mudou_cohort,melhorou_percentil,baixou_percentil,at_risk,novo,churn}, `percentil_delta`{sentido(subio\|bajo\|igual),magnitud(null si no-signif.),ventana,n_min_ok}, `cohort_rule_version`, `snapshot_from`, `snapshot_to`, `provenance` | [V] |
| `VISTA_DINERO_LINK` **[extendida]** | `cohort_id`, `valor_confirmado_atribuible` money (0 sin señal; 0-con-flag si no modelado), `estado_confirmacion`{confirmado_sostenido,pendiente}, `atribuible`:bool, `fuente`{P3,P11}, `link_destino`, `freshness_ts`, `provenance` (NUNCA gross/estimado) | [V] |
| `VISTA_TICKETS_LINK` **[señal cruda]** | `cohort_id`, `ticket_type`, `conteo`, `distribucion`{único(un solo cohort)\|cross(varios cohorts)}, `fuente`=Support, `link_destino`, `freshness_ts`, `provenance` — **SIN** `root_cause` (la clasificación es de Feature B, Corte 1) | [V] |
| `COHORT_INFO + ML_CHANGELOG` **[extendida]** | `cohort_info{cohort_id, subgrupo_id, definicion, tenure_bucket, tier_base, n_cuentas, N_subgrupo, cohort_rule_version}`; `ml_changelog{version_id PK, cohort_rule_version, fecha, que_cambio, efecto_en_baseline, provenance}` | [V] |
| **Campos agregados a `PERCENTIL_SNAPSHOT`** | `+ baseline_descriptivo`, `+ baseline_atribucion_segmento`, `+ baseline_cohort{valor_actual_kpi por KPI{conexion,tickets,recurrencia,cross_sell}, ventana}`, `+ n_cohort_x_intent`, `+ n_min_ok`, `+ freshness_ts` | [V/C] |
| **Campos agregados a `EVENTO_PRIORIZADO_NBA` (payload handoff +=)** | `evento_id, account_id, cohort_id, percentil_en_cohort(null si sin-percentil), gap_hasta_top, cohort_rule_version, modo{percentil,cualitativo_sin_percentil}, operador_id` **+ `tenant_id` + `subgrupo_id` + `n_min_ok` + `freshness_ts` + `provenance`** | [V] |
| `scope_owner_ref` **[NUEVO]** | `{dueno_id, nivel}` — Goals recorta role-scoped sin re-agregar | [V] |
| `gap_hasta_top` (leading-indicator) **[promovido]** | `{valor, unidad, cohort_rule_version}` consumible aguas-abajo | [V] |
| `n_min` | umbral de significancia por celda **y por celda cohort×intent** (gate fail-closed) | [C] |
| `k` **[NUEVO]** | umbral k-anonymity (gate re-identificación, aguas-arriba en P1, **distinto de n_min**) | [C] |
| `TTL_baseline` | ventana de frescura del baseline | [C] |
| `supresion_k_aplicada` **[NUEVO]** | flag de supresión por k en subgrupo/insight/P90+/perfil | [V] |

---

### GOBERNANZA

- **G1 — Frontera (BR-1):** cross-tenant = bloqueo-rojo absoluto en segmentación, subgrupos, deltas, semáforo, links, perfil, log y simulación. Sin excepción. [V·BR-1]
- **G2 — Significancia (BR-2):** n_min POR CELDA **y POR celda cohort×intent**, fail-closed: no-significativa → colapsa/oculta + `n_min_ok=false`; nunca percentil/movimiento/upside numérico sobre ruido; handoff cae a cualitativo. [V·BR-2]
- **G3 — Versionado / A=B (BR-3 / EC-3):** toda celda/subgrupo/log/snapshot sella `cohort_rule_version`; deltas/log solo entre snapshots conciliables; una serie que cruza un cambio de regla se **marca**, no presenta movimiento falso; modal/changelog jamás mezcla baselines de versiones distintas. [V·BR-3]
- **G4 — Degradación (BR-4):** `knowledge_de_cohort` ausente → regla determinística mínima, no aborto, marcada en provenance. [V·BR-4]
- **G5 — Provenance (BR-5):** cada línea/dato muestra `[V]/[I]/[C]` + fuente; los datos linkados muestran `freshness_ts`; upside/baseline_cohort sin telemetría = `[C]`. [V·BR-5]
- **G6 — Read-only / no-commit (BR-6):** todo el pipeline es AUTONOMÍA N/A: no ejecuta, no recalcula dinero, no hace intake, no eleva autonomía, **no commitea simulaciones**; emite intención; upside = lectura/proyección; `min(pedido_NBA, liberado_evals, teto_tier)` aguas-abajo; **`risk_class` nace en NBA/Política, no en P1**. [V·BR-6]
- **G7 — k-anonymity (BR-15) [NUEVO]:** suprimir insight/P90+/subgrupo/perfil si `N<k`, **aplicado aguas-arriba en P1**; anotar `supresion_k_aplicada`; gate **distinto** de n_min (re-identificación vs significancia). [V·BR-15]
- **G8 — Honestidad dataviz (Cairo/Knaflic):** forma sigue función, no engañar; **1 mensaje por vista**; atributos preatentivos; sin falso-verde cuando todo está colapsado/suprimido; perfil/topo-vs-base con síntesis gráfica honesta. [V]
- **G9 — Dinero honesto:** solo `valor_confirmado_atribuible` + `estado_confirmacion` + `atribuible:bool`; sin señal=0; no modelado=0-con-flag; NUNCA gross ni estimado; nunca recalculado aquí; **upside atribuible-nunca-estimado-como-real, marcado `[C]` sin telemetría**. [V]
- **G10 — No-posesión / no-duplicación:** dinero (P3/P11), tickets (P5), control de autonomía (02_NBA), atribución/contrafactual (P3/P11) se LEEN/LINKAN; el drill profundo ocurre en la pantalla dueña; `scope_owner_ref` evita re-agregación cross-tenant. [V]
- **G11 — Explainability (Feat B):** cada entrada del `MOVIMIENTO_LOG` registra `variables_causa[]` (el **porqué**, feature-attribution), no solo el qué; anclada a `cohort_rule_version`. [V]
- **G12 — Sandbox (Feat C):** "correr ahora" es preview no-commit; commit bloqueado por diseño; respeta n_min/k/cross-tenant igual que el pipeline real; no toca dinero ni cohorts persistidos. [V·BR-6]
- **G13 — Auditabilidad:** snapshot semanal persistido + `ML_CHANGELOG` + `MOVIMIENTO_LOG` dejan rastro reproducible del "por qué esta cuenta cae aquí", del porqué de cada movimiento, y del movimiento que alimenta el North Star. [V]

---

**Nota de provenance del proceso (no parte del entregable):** la base recuperada vía `jq` venía con un preámbulo del build previo donde el agente se negó a leer archivos y generó el out3 de memoria; lo removí por no ser parte del out3. El cuerpo 1A-1G se conservó íntegro y se corrigió la numeración EC (sin drift EC-5/6/7); los modos de fallo quedan como FAIL-CLOSED por sub-proceso (la matriz MF-x vive en OUTPUT 2, no aquí). Las 3 features nuevas entran como 1H (A), 1I (B), 1J (C) y se integran a EPIC-1/2/4/6 según tu NUMBERING-FIX. Archivo base leído (absoluto): `/private/tmp/claude-501/-Users-familiagirardicavalcante-Desktop-Musixmatch/d65250c1-0d3d-4323-9335-e766358d0788/tasks/w1181d5xl.output`.

---

## Build-readiness (pre-emit)
**Veredicto:** EMITIR con 1 pendiente de PULIDO (no de contenido). Estructuralmente completo: **10 sub-procesos (1A–1J)**, **3 features presentes**, invariantes OK, no truncado.
**Pendiente único:** limpieza de numeración inline de IDs EC/BR entre OUTPUT 1/2/3 — resuelto provisionalmente por el §Registro canónico de IDs (crosswalk); el renumber inline limpio queda como pulido (no bloquea la lectura ni la auditoría vía crosswalk).
**`[C]` placeholders (el valor está en el mecanismo; falsify: ¿medido o supuesto?):** `n_min`, `k`, `TTL_baseline`, cadencia batch, bordes de tenure-bucket.
**`[I]` needs-prototype:** render del semáforo (heatmap vs chips), orden de los deltas, regla exacta `at_risk`/pre-churn, jerarquía de colapso de celdas, partición de subgrupo, fórmula del upside, presentación del diff/log/timeline, recorrido **MÓVIL**, SLA de los links P3/P11/P5.
**`[I]` a confirmar:** dónde nace `risk_class` (adoptado: NBA/Política).

## Log de iteraciones (RL — sin datos sintéticos)
- Construido a partir del STARTING POINT validado con Leo (no del draft autónomo ni del desvío NBA). Reuso+extensión del núcleo de `pantalla_01`. 3 features folradas. Contrato NBA/Goals incorporado. Único pendiente = renumber inline de IDs (crosswalk lo cubre). Ver `memory/rl-iteration-log.md`.
