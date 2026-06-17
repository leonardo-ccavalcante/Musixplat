# breakdown_CODE_AGENT.md — Piezas CÓDIGO (build-ready, ES)

> DOMAIN = uber_eats. Vocabulario de superficie canónico: `Restaurante` / `Orden` / `pedido` (sin swap).
> El **registro congelado** es la única fuente de verdad. Ninguna pieza introduce bucket/campo/entidad fuera del registro.
> Cada `piece_id` se cita por su identificador estable spec-qualified, nunca por número de línea.
> Convención transversal `[STACK-TUNE]`: los comandos reales de build/lint/type-check/test/a11y/security y sus umbrales viven en `AGENTS.md` / `CLAUDE.md` del repo. Cada pieza los **referencia** (placeholder `<cmd:...>`), no los reinventa. Reemplazar el placeholder por el comando real del repo antes de ejecutar.
> Contrato de calidad por pieza (aplica a TODAS): reusar antes de crear · unidad ≈ ≤100 líneas · production-ready (error-handling + casos borde + a11y donde haya UI + seguridad/RLS + observabilidad/log estructurado; cero dead-code; cualquier `TODO` es un follow-up rastreado) · los tests son parte del Done · referenciar patrones/versiones existentes (no inventar APIs) · secretos por NOMBRE de env-var, nunca el valor · PROHIBIDO hard-codear un valor-resultado o tocar el test para que pase (espeja la invariante §14 "resultado siempre computado / NULL pre-corrida").

---

## SPEC 01 — Cohorts Explorer (piezas CÓDIGO)

### `01:F-1.1` — Asignación versionada cuenta → celda + subgrupo

**Goal.** Cada `Restaurante` queda asignado de forma determinista a su `cohort.Cohort` (tenure_bucket × tier_base) y a su `cohort.Subgrupo`, sellando la `cohort_rule_version` aplicada — sin juicio LLM.

**Context.** Job batch invocado out-of-band (paso de `01:F-2.5`). Entradas: `tenant.Restaurante.restaurante_id`, `.tier_base`, `.tenure_actual`, `catalog.Cohort_Rule_Version.version_id`. Salidas: `cohort.Cohort` (`cohort_id = tenure_bucket × tier_base`), `cohort.Subgrupo` (`subgrupo_id`, `cohort_id`), `cohort.Pertenencia_Cohort_Snapshot.cohort_rule_version`. Reusar la regla versionada existente (`catalog.Cohort_Rule_Version`); no crear una segunda fuente de reglas.

**Constraints.** La regla es versionada y determinista (BR-3): la misma `version_id` + las mismas métricas ⇒ misma celda/subgrupo. Anti-mezcla-de-versiones: nunca combinar entradas de dos `cohort_rule_version`. `cohort_rule_version` se sella en el snapshot, no se infiere después. Sin escritura de números computados aquí (eso es `01:F-1.2`). Observabilidad: log estructurado `{restaurante_id, cohort_id, subgrupo_id, cohort_rule_version}`.

**Done-when.**
- **Given** un `Restaurante` con `tier_base` y `tenure_actual` válidos y una `cohort_rule_version` vigente, **When** corre la asignación, **Then** existe exactamente una fila `Cohort` para `(tenure_bucket × tier_base)` y una `Subgrupo` ligada, con `cohort_rule_version` sellada idéntica a la entrada.
- **Given** dos corridas con la misma `version_id` y mismas métricas, **When** ambas terminan, **Then** producen el mismo `cohort_id`/`subgrupo_id` (determinismo reproducible).
- **Check ejecutable:** test unitario de asignación + property test de determinismo (misma entrada → misma salida) — `[STACK-TUNE] <cmd:test>` filtrando `F-1.1`. Type-check `[STACK-TUNE] <cmd:typecheck>`.

---

### `01:F-1.2` — Ranking batch: percentil, gap y baseline

**Goal.** Computar y persistir `percentil_en_cohort`, `gap_hasta_top` y los baselines de cohorte vía `Named_Query` determinista (golden CÓDIGO#1 percentil), sin LLM.

**Context.** Job batch P01 §14. Entradas: `cohort.Cohort`, `cohort.Subgrupo`, `tenant.Restaurante` (métricas canónicas), `catalog.Intent_Catalog.intent_id`. Salidas: `cohort.Pertenencia_Cohort_Snapshot.percentil_en_cohort`, `.gap_hasta_top` (ranking job P01); `cohort.Cohort.baseline_descriptivo`, `.baseline_atribucion_segmento`. Reusar el ejecutor `Named_Query` existente; no escribir SQL ad-hoc fuera del registro de queries.

**Constraints.** Todos los valores son COMPUTED-at-run / NULL pre-corrida (§14): prohibido sembrar percentil/gap/baseline. Determinista (BR-2, BR-17). Sin cruzar `tenant_id` (RLS). Observabilidad: registrar `def_version` de la `Named_Query` usada y conteo de filas.

**Done-when.**
- **Given** una cohorte poblada, **When** corre el ranking, **Then** cada `Pertenencia_Cohort_Snapshot` tiene `percentil_en_cohort` ∈ [0,100] y `gap_hasta_top` ≥ 0 consistentes con el orden de la métrica.
- **Given** estado pre-corrida, **When** se lee el snapshot, **Then** los campos son NULL (no hay valor sembrado).
- **Check ejecutable:** test de la `Named_Query` contra fixture de entrada con percentil esperado **computado por el test**, no hard-codeado; assert de monotonía percentil↔métrica — `[STACK-TUNE] <cmd:test>` filtro `F-1.2`.

---

### `01:F-1.3` — Gate n_min: colapso de cohorte

**Goal.** Cuando `n_cuentas < n_min`, colapsar la cohorte y marcar `n_min_ok=false` mediante conteo + comparación deterministas, sin LLM.

**Context.** Entradas: `cohort.Cohort.n_cuentas`, `cohort.Pertenencia_Cohort_Snapshot.n_cohort_x_intent` (vía `min_calculo.n_cohort`), `Config_Perillas.key` (`n_min_threshold`). Salidas: `cohort.Pertenencia_Cohort_Snapshot.n_min_ok`, `cohort.Cohort.colapsada`. Reusar `Config_Perillas` para el umbral (no hard-codear el número).

**Constraints.** `n_min_threshold` se lee de `Config_Perillas`, nunca embebido. `n_min_ok` / `colapsada` son COMPUTED-at-run / NULL pre-corrida (§14). Fail-closed: si falta el conteo, tratar como colapsada (conservador). Hard-no de re-identificación coordinado con el gate-k (`01:F-1.3b`). Observabilidad: log `{cohort_id, n_cuentas, n_min_threshold, n_min_ok, colapsada}`.

**Done-when.**
- **Given** `n_cuentas < n_min_threshold`, **When** corre el gate, **Then** `colapsada=true` y `n_min_ok=false`.
- **Given** `n_cuentas ≥ n_min_threshold`, **When** corre el gate, **Then** `n_min_ok=true` y `colapsada=false`.
- **Given** umbral cambiado en `Config_Perillas`, **When** se re-corre, **Then** el resultado refleja el nuevo umbral sin cambio de código.
- **Check ejecutable:** tests de borde `n = n_min-1`, `= n_min`, `= n_min+1` con umbral inyectado por config — `[STACK-TUNE] <cmd:test>` filtro `F-1.3`.

---

### `01:F-1.3b` — Gate k-anonymity: supresión por re-identificación

**Goal.** Cuando `N < k`, suprimir la entidad expuesta (predicado k-anon determinista), surfaciar el hard-no de re-identificación competitiva.

**Context.** Entradas: `cohort.Cohort.n_cuentas`, `cohort.Subgrupo` (`N_subgrupo` vía count). Salida: marca de supresión sobre el render de `cohort.Subgrupo`. **Nota de vocab (confianza baja):** `supresion_k_aplicada` NO está en el allowlist y no tiene columna canónica; resolver como **flag derivada render-only sobre `cohort.Subgrupo`** (análogo a `02:WF-1B/BR-12-kanon`, que no persiste columna), no como entidad/columna nueva. Reusar el umbral `k_anon_threshold` de `Config_Perillas`.

**Constraints.** `k_anon_threshold` desde `Config_Perillas`. Resultado render-only (no persistir columna nueva). Fail-closed: ante duda, suprimir. Hard-no surfaced (no silencioso): el motivo "cohorte demasiado pequeña — re-identificación" debe quedar en el log/UI. Coordinar con `01:F-1.3` (gate distinto: n_min ≠ k).

**Done-when.**
- **Given** `N < k_anon_threshold`, **When** se intenta renderizar el subgrupo, **Then** el contenido se suprime y se expone el motivo k-anon.
- **Given** `N ≥ k`, **When** se renderiza, **Then** el subgrupo es visible.
- **Check ejecutable:** test de predicado con `N` paramétrico cruzando el umbral inyectado, assert "render suprimido / motivo presente" — `[STACK-TUNE] <cmd:test>` filtro `F-1.3b`.

---

### `01:F-1.4` — Agregación de patrón P90+ en baseline_descriptivo

**Goal.** Agregar atributos canónicos de las cuentas con `percentil ≥ 90` dentro de `cohort.Cohort.baseline_descriptivo`, degradando explícitamente si falta conocimiento; sin juicio LLM.

**Context.** Entradas: `cohort.Pertenencia_Cohort_Snapshot.percentil_en_cohort`, `tenant.Restaurante.atributos_vivos` (`estructura_promo`, `ventana`, `fuso`). Salida: `cohort.Cohort.baseline_descriptivo` (job P01). Reusar la agregación determinista existente.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14). Degradación explícita: si `atributos_vivos` ausentes, marcar el campo como incompleto (no fabricar valores). Sin cruzar `tenant_id`. Observabilidad: contar cuántas cuentas P90+ alimentaron el baseline.

**Done-when.**
- **Given** cuentas con `percentil ≥ 90` y `atributos_vivos` presentes, **When** corre la agregación, **Then** `baseline_descriptivo` refleja la distribución agregada de esos atributos.
- **Given** `atributos_vivos` ausentes, **When** corre, **Then** el baseline queda marcado incompleto (degradado), nunca con valores inventados.
- **Check ejecutable:** test sobre fixture P90+ con baseline esperado computado por el test + caso "knowledge ausente → degradado" — `[STACK-TUNE] <cmd:test>` filtro `F-1.4`.

---

### `01:F-1.6` — Render topo-vs-base (P90+ vs P-bajos)

**Goal.** Renderizar dos columnas comparables (P90+ vs P-bajos) sobre dimensiones canónicas; superficie UI determinista read-only sobre métricas ya computadas, acción síncrona del usuario.

**Context.** Entradas: `cohort.Cohort.baseline_descriptivo` (características P90+), `cohort.Pertenencia_Cohort_Snapshot.percentil_en_cohort` (slice P-bajos). Salida: render UI read-only (las características top/base son derivadas de UI, no entidad nueva). Reusar componentes de tabla/columna existentes.

**Constraints.** Read-only, sin escritura persistida. Respeta supresión k-anon (`01:F-1.3b`) y colapso (`01:F-1.3`): si la cohorte está colapsada/suprimida, mostrar solo cualitativo sin percentil. a11y: columnas con encabezados asociados, contraste, navegación por teclado. Sin LLM.

**Done-when.**
- **Given** una cohorte no colapsada con baseline, **When** el usuario abre topo-vs-base, **Then** ve dos columnas alineadas por dimensión canónica sin escribir en DB.
- **Given** cohorte suprimida por k-anon, **When** abre, **Then** ve cualitativo sin percentil (no se expone dato re-identificable).
- **Check ejecutable:** test de componente (render con fixture) + auditoría a11y — `[STACK-TUNE] <cmd:test>` filtro `F-1.6` y `[STACK-TUNE] <cmd:a11y>`.

---

### `01:F-1.7` — UPSIDE: proyección oportunidad = f(brecha × n_base)

**Goal.** Computar `upside = f(brecha × n_base)` con fórmula determinista sobre el baseline, marcada `[C]` (proyección NO medida); sin juicio LLM, lectura síncrona.

**Context.** Entradas: `cohort.Cohort.baseline_descriptivo` (`base_calculo`), `cohort.Cohort.n_cuentas` (`n_base`). Salida: proyección read-only `oportunidad_valor` (no entidad persistida; análogo a `NBA_Propuesta.before_after_esperado` `[C]`). Reusar la fórmula/utilidad de proyección existente.

**Constraints.** COMPUTED-at-run / NULL pre-corrida; **nunca `[V]`** (jamás presentar como medido). Etiqueta visible `[C] proyección`. Read-only, sin persistir valor propio. Sin cruzar `tenant_id`. Sin hard-codear coeficientes — leerlos de config/fórmula registrada.

**Done-when.**
- **Given** `base_calculo` y `n_base`, **When** corre el cálculo, **Then** `oportunidad_valor` = `f(brecha × n_base)` con etiqueta `[C]`.
- **Given** la salida, **When** se inspecciona, **Then** nunca está marcada `[V]` ni persistida como número de negocio.
- **Check ejecutable:** test de fórmula con valor esperado **computado por el test** desde inputs + assert "etiqueta = [C], no persiste" — `[STACK-TUNE] <cmd:test>` filtro `F-1.7`.

---

### `01:F-1.8` — baseline_cohort: valor_actual_kpi por KPI

**Goal.** Poblar `baseline_cohort` con `valor_actual_kpi` por KPI vía `Named_Query` determinista (golden CÓDIGO#2 KPI); sin LLM.

**Context.** Entradas: `tenant.KPI.kpi_def_version`, `catalog.Named_Query.def_version`, `tenant.KPI` (conexión/tickets/recurrencia/cross_sell). Salida: `tenant.KPI.valor_hoy` (Named_Query / agente determinista §14) que alimenta `cohort.Cohort.baseline_descriptivo`. Reusar el ejecutor `Named_Query` y el contrato `run()` existentes.

**Constraints.** `valor_hoy` COMPUTED-at-run / NULL pre-corrida (§14). `kpi_def_version` debe coincidir con `def_version` (BR-25); si no, fail-closed "KPI no unificado". Sin cruzar `tenant_id`. Observabilidad: `{kpi_id, def_version, valor_hoy.unit}`.

**Done-when.**
- **Given** `kpi_def_version` que coincide con `Named_Query.def_version`, **When** corre, **Then** `valor_hoy = {value, unit}` poblado y enlazado al baseline.
- **Given** versiones divergentes, **When** corre, **Then** fail-closed "no unificado", sin número mostrado.
- **Check ejecutable:** test de `Named_Query` con fixture + caso de versión divergente → fail-closed — `[STACK-TUNE] <cmd:test>` filtro `F-1.8`.

---

### `01:F-2.1` — Render semáforo de la matriz

**Goal.** Renderizar estados verde/ámbar/rojo por celda con señales pre-atentivas; render UI determinista sobre el snapshot, carga síncrona; sin LLM.

**Context.** Entradas: `cohort.Cohort.colapsada`, `cohort.Pertenencia_Cohort_Snapshot.n_min_ok`, `cohort.Cohort.baseline_descriptivo`. Salida: render UI read-only del semáforo + síntesis embebida; sin escritura. Reusar el sistema de tokens de color/estado existente.

**Constraints.** Read-only. Mapeo color↔estado determinista y documentado. a11y: el color nunca es el único portador de significado (texto/ícono redundante), contraste AA. Respeta colapso/k-anon. Sin LLM.

**Done-when.**
- **Given** una celda con `colapsada=true`, **When** se renderiza, **Then** muestra el estado correspondiente con etiqueta textual (no solo color).
- **Given** `n_min_ok=false`, **When** se renderiza, **Then** el estado refleja muestra insuficiente.
- **Check ejecutable:** snapshot test del mapeo estado→color/etiqueta + a11y contrast check — `[STACK-TUNE] <cmd:test>` filtro `F-2.1` y `[STACK-TUNE] <cmd:a11y>`.

---

### `01:F-2.2` — Diff de delta-evento (snapshot vigente vs anterior)

**Goal.** Diferenciar `snapshot_to` vs `snapshot_from` y emitir `percentil_delta` + `delta_status`; comparación determinista sobre snapshots versionados, sin LLM.

**Context.** Entradas: `cohort.Pertenencia_Cohort_Snapshot` (vigente + anterior, mismo `tenant_id` + `cohort_rule_version`). Salida: `cohort.Evento_Priorizado_NBA.delta_status` ∈ `{mudou_cohort | melhorou_percentil | baixou_percentil | at_risk | novo | churn}`. Reusar la utilidad de diff de snapshots; no comparar entre `cohort_rule_version` distintas.

**Constraints.** Anti-mezcla-de-versiones (BR-3, BR-8, BR-21): solo comparar snapshots con la misma `cohort_rule_version`. `delta_status` COMPUTED-at-run / NULL pre-corrida (§14). Sin cruzar `tenant_id`. `percentil_delta` NULL si no significativo. Observabilidad: log de transiciones.

**Done-when.**
- **Given** dos snapshots consecutivos del mismo tenant y misma `cohort_rule_version`, **When** corre el diff, **Then** `delta_status` ∈ del enum cerrado y `percentil_delta` consistente con el cambio.
- **Given** snapshots de versiones distintas, **When** corre, **Then** se rechaza la comparación (no se mezcla).
- **Check ejecutable:** tests por cada `delta_status` con fixtures + caso "versión cruzada → rechazo" — `[STACK-TUNE] <cmd:test>` filtro `F-2.2`.

---

### `01:F-2.3` — Render panel de deltas priorizado

**Goal.** Renderizar deltas con `at_risk` arriba y `percentil_delta` nulo si no significativo; orden UI determinista, lectura síncrona; sin LLM.

**Context.** Entradas: `cohort.Evento_Priorizado_NBA.delta_status`, `.percentil_en_cohort`, `.n_min_ok`. Salida: render UI read-only del panel; sin escritura. Reusar el componente de lista priorizada existente.

**Constraints.** Read-only. Orden determinista (regla fija de prioridad, `at_risk` primero). a11y: orden de foco coherente con el orden visual. Respeta `n_min_ok` (oculta percentil cuando corresponde). Sin LLM.

**Done-when.**
- **Given** filas con varios `delta_status`, **When** se renderiza, **Then** las `at_risk` aparecen primero y el orden es estable/determinista.
- **Given** `percentil_delta` no significativo, **When** se renderiza, **Then** se muestra nulo (no se inventa valor).
- **Check ejecutable:** test del comparador de orden + snapshot del panel — `[STACK-TUNE] <cmd:test>` filtro `F-2.3`.

---

### `01:F-2.6` — LOG check + persist (verifica propuesta de atribución)

**Goal.** CHECK determinista: emitir entrada de log solo si `variables_causa` presentes, anclar `cohort_rule_version`, marcar cruce de versión (A=B); sin LLM — code verifica la propuesta del AGENTE (leaf split de `01:F-2.4`).

**Context.** Entradas: `variables_causa[]` (propuesta de `01:F-2.4`), `cohort.Pertenencia_Cohort_Snapshot.cohort_rule_version`. Salida: `cohort.Evento_Priorizado_NBA.delta_status` + sello `cohort_rule_version` (entrada persistida solo si atribuible). Reusar el almacén de eventos `Evento_Priorizado_NBA`.

**Constraints.** Persistir solo si `variables_causa` presentes (si no, no-op auditable). Anclar `cohort_rule_version` (BR-18, BR-3). COMPUTED-at-run / NULL pre-corrida. Sin cruzar `tenant_id`. El code nunca fabrica `variables_causa` — solo verifica/persiste lo propuesto.

**Done-when.**
- **Given** una propuesta con `variables_causa` no vacías, **When** corre el CHECK, **Then** se persiste la entrada con `cohort_rule_version` sellada.
- **Given** propuesta sin `variables_causa`, **When** corre, **Then** no se persiste (no-op) y queda auditable.
- **Check ejecutable:** tests "atribuible → persiste" / "no atribuible → no-op" + assert de sello de versión — `[STACK-TUNE] <cmd:test>` filtro `F-2.6`.

---

### `01:F-2.7` — Exposición de gap_hasta_top (leading-indicator)

**Goal.** Exponer `gap_hasta_top {valor, unidad, cohort_rule_version}` como campo consumible aguas abajo; proyección de campo determinista, sin LLM.

**Context.** Entradas: `cohort.Pertenencia_Cohort_Snapshot.gap_hasta_top`, `.cohort_rule_version`. Salida: `gap_hasta_top` expuesto downstream. Reusar el snapshot existente (no recomputar).

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14): expone lo ya computado, no recalcula. Lleva siempre `cohort_rule_version` para evitar mezcla. Sin cruzar `tenant_id` (BR-23).

**Done-when.**
- **Given** un snapshot con `gap_hasta_top`, **When** se consume el campo, **Then** llega con `{valor, unidad, cohort_rule_version}` íntegro.
- **Given** estado pre-corrida, **When** se lee, **Then** NULL.
- **Check ejecutable:** test de contrato del campo expuesto (forma + presencia de versión) — `[STACK-TUNE] <cmd:test>` filtro `F-2.7`.

---

### `01:F-3.1` — Panel DINERO (link a P3/P11, nunca recalcula)

**Goal.** Panel read-only que exhibe `valor_confirmado_atribuible` y enlaza a P3/P11, sin recalcular ni persistir valor propio; superficie UI determinista, lectura síncrona.

**Context.** Entradas: `gov.ROI_Operador` (`valor_confirmado_atribuible` vía link P3/P11) — referencia read-only; `stream/credit → Orden` normalizado. Salida: render UI read-only del panel + link; sin señal ⇒ 0; nunca recalcula ni persiste. Reusar el patrón de "panel que linkea a la fuente autoritativa".

**Constraints.** Nunca recalcula ni persiste valor de negocio (BR-9, BR-10). Sin señal ⇒ muestra 0 (no inventa). Link preserva `tenant_id` (coordinado con `01:US-3.1.3`): cross-tenant ⇒ bloqueo. a11y en el link (foco/etiqueta). Observabilidad: log de aperturas de panel.

**Done-when.**
- **Given** `ROI_Operador` con `valor_confirmado_atribuible`, **When** se abre el panel, **Then** se muestra el valor por referencia y el link resuelve dentro del mismo `tenant_id`.
- **Given** sin señal, **When** se abre, **Then** muestra 0 sin persistir.
- **Check ejecutable:** test "no escribe en DB" (espía de escritura) + caso "sin señal → 0" — `[STACK-TUNE] <cmd:test>` filtro `F-3.1`.

---

### `01:F-3.3` — Panel TICKETS (conteo + distribución, sin causa)

**Goal.** Exponer conteo crudo `ticket_type × cohort` + distribución `{único | cross}` + link a Support; conteo determinista, **sin** clasificación de causa (eso es Feature B).

**Context.** Entradas: `tenant.Conversa_Episodio` (ticket → `Conversa_Episodio` normalizado), `cohort.Cohort.cohort_id`. Salida: render UI read-only conteo + distribución + `freshness_ts` + link Support; nunca rotula causa (sin `root_cause`). Reusar el agregador de conteos existente.

**Constraints.** Nunca rotula causa (BR-11): cero `root_cause` en esta pieza. Read-only. Muestra `freshness_ts`. Sin cruzar `tenant_id`. a11y en tabla y link. Observabilidad: `{cohort_id, n_tickets, freshness_ts}`.

**Done-when.**
- **Given** episodios de un cohort, **When** se renderiza, **Then** muestra conteo `ticket_type × cohort`, distribución `{único|cross}` y `freshness_ts`, sin etiqueta de causa.
- **Given** intento de derivar causa, **When** se revisa la salida, **Then** no existe campo de causa.
- **Check ejecutable:** test de agregación con conteo esperado **computado por el test** + assert "sin campo causa" — `[STACK-TUNE] <cmd:test>` filtro `F-3.3`.

---

### `01:F-4.1` — Modal síntesis de cohorte

**Goal.** Modal que renderiza definición de cohorte + perfil + acceso a topo/upside; superficie UI determinista sobre campos computados, apertura síncrona; sin LLM.

**Context.** Entradas: `cohort.Cohort` (`cohort_id`, `tenure_bucket`, `tier_base`, `n_cuentas`, `cohort_rule_version`), `cohort.Subgrupo.N_subgrupo`, `cohort.Cohort.baseline_descriptivo`. Salida: render UI read-only del modal; `N < k` ⇒ perfil suprimido. Reusar el componente modal existente.

**Constraints.** Read-only. `N < k` ⇒ perfil suprimido (k-anon, coordinado con `01:F-1.3b`). a11y de modal: foco atrapado, cierre por Esc, `aria-modal`. Sin LLM.

**Done-when.**
- **Given** una cohorte con `N ≥ k`, **When** se abre el modal, **Then** muestra definición + perfil + accesos a topo/upside.
- **Given** `N < k`, **When** se abre, **Then** el perfil aparece suprimido.
- **Check ejecutable:** test de componente + a11y de modal (foco/Esc) — `[STACK-TUNE] <cmd:test>` filtro `F-4.1` y `[STACK-TUNE] <cmd:a11y>`.

---

### `01:F-4.2` — Changelog de cohort_rule_version (timeline ML)

**Goal.** Timeline de `cohort_rule_version {version, fecha, qué_cambió, efecto_en_baseline}`, sin mezclar baselines de versiones distintas; lectura determinista del catálogo versionado, sin LLM.

**Context.** Entradas: `catalog.Cohort_Rule_Version.version_id`, `.fecha`, `.que_cambio`, `.efecto_en_baseline`. Salida: render UI read-only del timeline; invariante anti-mezcla-de-versiones (BR-3). Reusar el catálogo `Cohort_Rule_Version`.

**Constraints.** Read-only. Nunca mezcla baselines de dos versiones (BR-3, BR-13). Orden cronológico determinista. a11y de timeline (estructura semántica/lista). Sin LLM.

**Done-when.**
- **Given** varias `cohort_rule_version`, **When** se renderiza el changelog, **Then** cada entrada muestra `{version, fecha, qué_cambió, efecto_en_baseline}` sin combinar baselines.
- **Check ejecutable:** snapshot test del timeline + assert "no se cruzan baselines entre versiones" — `[STACK-TUNE] <cmd:test>` filtro `F-4.2`.

---

### `01:F-5.1` — Drill ordenado por gap

**Goal.** Drill matriz → celda → subgrupo → cuentas, ordenado por `gap_hasta_top`; orden UI determinista sobre campos computados, navegación síncrona; sin LLM.

**Context.** Entradas: `cohort.Pertenencia_Cohort_Snapshot.percentil_en_cohort`, `.gap_hasta_top`. Salida: render UI read-only del drill ordenado; cohorte colapsada ⇒ solo cualitativo sin percentil. Reusar el componente de tabla con sort existente.

**Constraints.** Read-only. Orden determinista por `gap_hasta_top`. Colapsada ⇒ cualitativo sin percentil (coordinado con `01:F-1.3`). a11y de tabla ordenable (anuncio de orden). Sin LLM.

**Done-when.**
- **Given** un subgrupo no colapsado, **When** se hace drill a cuentas, **Then** las filas se ordenan por `gap_hasta_top` de forma estable.
- **Given** cohorte colapsada, **When** se hace drill, **Then** se muestra cualitativo sin percentil.
- **Check ejecutable:** test del comparador de orden + caso colapsada — `[STACK-TUNE] <cmd:test>` filtro `F-5.1`.

---

### `01:F-5.2` — Handoff priorizar → emite Evento_Priorizado_NBA

**Goal.** El operador prioriza (acción humana síncrona in-app) y se emite un evento de intención read-only; emisión determinista, sin LLM (HUMAN-gate).

**Context.** Trigger: acción in-app "priorizar + confirmar handoff" con payload `{restaurante_id, cohort_id, subgrupo_id}`. Entradas: `cohort.Pertenencia_Cohort_Snapshot.percentil_en_cohort`, `.gap_hasta_top`, `.n_min_ok`, `.freshness_ts`, `tenant.Restaurante.tenant_id`, `.scope_owner_ref`. Salida (único output mutante): `cohort.Evento_Priorizado_NBA {restaurante_id, cohort_id, subgrupo_id, percentil_en_cohort (null si sin-percentil), gap_hasta_top, cohort_rule_version, modo, operador_id, n_min_ok, freshness_ts}`. **Edge de handoff (recon COL-13, confianza baja):** el receptor `02:WF-1A` consume `cohort_id`, no la forma completa de `Evento_Priorizado_NBA` — el evento escribe la forma completa, el consumidor lee lo que necesita; no estrechar el output a `cohort_id`.

**Constraints.** `Evento_Priorizado_NBA` es el único output mutante; COMPUTED-at-run / NULL pre-corrida. `risk_class` **NO nace aquí** (nace en NBA, BR-22). HUMAN-gate: requiere acción del operador (`operador_id`). Sin cruzar `tenant_id` (BR-1, BR-14). `min(pedido_NBA, liberado_evals, teto_tier)` se aplica aguas abajo (no aquí). Observabilidad: log del evento emitido.

**Done-when.**
- **Given** el operador confirma handoff sobre un subgrupo válido, **When** se emite, **Then** existe una fila `Evento_Priorizado_NBA` con todos los campos del contrato y `operador_id` presente.
- **Given** cohorte sin percentil, **When** se emite, **Then** `percentil_en_cohort = null` (no se inventa).
- **Given** la salida, **When** se inspecciona, **Then** `risk_class` no está presente (no nace aquí).
- **Check ejecutable:** test de emisión con assert de forma del evento + "sin risk_class" + "HUMAN-gate requerido" — `[STACK-TUNE] <cmd:test>` filtro `F-5.2`.

---

### `01:F-5.3` — Snapshot semanal North Star

**Goal.** Persistir `Pertenencia_Cohort_Snapshot` semanal versionado para la serie de North Star; persistencia determinista del snapshot computado, sin LLM (invocado por batch).

**Context.** Paso del job batch (`01:F-2.5`). Entradas: `cohort.Pertenencia_Cohort_Snapshot` (recálculo batch), `cohort.Cohort.baseline_atribucion_segmento`. Salida: `cohort.Pertenencia_Cohort_Snapshot {snapshot_id, restaurante_id, cohort_id, subgrupo_id, percentil_en_cohort, gap_hasta_top, semana, cohort_rule_version, scope_owner_ref, freshness_ts, provenance}`. Reusar el escritor de snapshots existente.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14). Versionado por `cohort_rule_version` + `semana` (BR-17, BR-21). Sin cruzar `tenant_id`. Idempotente por `(restaurante_id, cohort_id, semana, cohort_rule_version)`. Observabilidad: conteo de filas persistidas por corrida.

**Done-when.**
- **Given** un recálculo batch, **When** corre la persistencia, **Then** existe un snapshot versionado por `semana` + `cohort_rule_version` con `provenance` poblada.
- **Given** la misma corrida repetida, **When** re-corre, **Then** no duplica (idempotente).
- **Check ejecutable:** test de persistencia + property test de idempotencia — `[STACK-TUNE] <cmd:test>` filtro `F-5.3`.

---

### `01:F-5.4` — n_cohort_x_intent (conteo para gate downstream)

**Goal.** Computar `n` por celda `cohort × intent` para el gate aguas abajo; conteo determinista, sin LLM.

**Context.** Entradas: `cohort.Cohort.cohort_id`, `catalog.Intent_Catalog.intent_id`, `gov.min_calculo.n_cohort`. Salida: `cohort.Pertenencia_Cohort_Snapshot.n_cohort_x_intent` (RESULTADO §14 count). Reusar el contador existente.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14). Sin cruzar `tenant_id` (BR-24). El gate per `cohort × intent` lo aplican NBA/Evals (no aquí). Observabilidad: `{cohort_id, intent_id, n}`.

**Done-when.**
- **Given** cuentas en una celda `cohort × intent`, **When** corre el conteo, **Then** `n_cohort_x_intent` = conteo correcto y disponible para el gate.
- **Check ejecutable:** test de conteo con valor esperado computado por el test — `[STACK-TUNE] <cmd:test>` filtro `F-5.4`.

---

### `01:F-5.5` — scope_owner_ref embebido (role-scoping sin re-agregar)

**Goal.** Exponer `scope_owner_ref {dueno_id, nivel}` como jsonb embebido para que Goals haga role-scoping sin re-agregar; campo determinista, sin LLM.

**Context.** Entradas: `gov.Usuario.usuario_id`, `.nivel_org`. Salida: `cohort.Pertenencia_Cohort_Snapshot.scope_owner_ref {dueno_id, nivel}` (jsonb embebido). Reusar el grafo org (`Usuario.nivel_org`).

**Constraints.** COMPUTED-at-run / NULL pre-corrida. Previene re-agregación cross-tenant y A≠B (BR-23). Sin cruzar `tenant_id`. Forma jsonb estable y validada.

**Done-when.**
- **Given** un `Usuario` con `nivel_org`, **When** se sella el snapshot, **Then** `scope_owner_ref = {dueno_id, nivel}` válido y embebido.
- **Given** Goals lee el snapshot, **When** aplica scope, **Then** no necesita re-agregar (usa el ref).
- **Check ejecutable:** test de forma jsonb + assert "no re-agrega cross-tenant" — `[STACK-TUNE] <cmd:test>` filtro `F-5.5`.

---

### `01:F-6.1` — Botón "correr ahora" (simulación efímera)

**Goal.** Click del usuario "correr ahora" (síncrono in-app) ⇒ re-segmentación en sandbox efímero, respetando gates, read-only sin commit; sin LLM.

**Context.** Trigger: click in-app con payload `{tenant_id, cohort_rule_version}`. Entradas: `cohort.Pertenencia_Cohort_Snapshot` (vigente), `tenant.Restaurante` (actuales), `catalog.Cohort_Rule_Version.version_id`, `Config_Perillas.key` (`n_min_threshold`, `k_anon_threshold`). Salida: `SIMULACION {snapshot_mock, diff_vs_vigente, no_commit=true}` — **sandbox efímero, no entidad persistida** (denylist). Reusar el motor de segmentación de `01:F-1.x` en modo sandbox.

**Constraints.** **NUNCA** escribe `Pertenencia_Cohort_Snapshot` real ni `Evento_Priorizado_NBA` (BR-19). Efímero, COMPUTED-at-run. Respeta `n_min`/`k_anon` igual que producción. Sin cruzar `tenant_id`. Observabilidad: log "simulación corrida, no-commit".

**Done-when.**
- **Given** click "correr ahora", **When** corre la simulación, **Then** produce `snapshot_mock` + `diff_vs_vigente` con `no_commit=true` y cero escrituras reales.
- **Given** la corrida, **When** se inspecciona la DB, **Then** no hay filas nuevas en `Pertenencia_Cohort_Snapshot`/`Evento_Priorizado_NBA`.
- **Check ejecutable:** test con espía de escritura que falla si toca tablas reales + caso de gates respetados — `[STACK-TUNE] <cmd:test>` filtro `F-6.1`.

---

### `01:F-6.2` — Render diff simulado ("SIMULACIÓN — no comprometida")

**Goal.** Renderizar el diff simulado vs snapshot vigente, rotulado "SIMULACIÓN — no comprometida"; diff UI determinista sobre el mock efímero, síncrono; sin LLM.

**Context.** Entradas: `SIMULACION.snapshot_mock` (efímero, de `01:F-6.1`), `cohort.Pertenencia_Cohort_Snapshot` (vigente). Salida: render UI read-only del diff rotulado "simulado"; `n < n_min` / `N < k` colapsa/suprime igual; sin escritura. Reusar el componente de diff existente.

**Constraints.** Read-only, rotulado "simulado" siempre visible (BR-19). Aplica colapso/supresión igual que producción (EC-12). a11y: el rótulo "simulado" no es solo color. Sin LLM.

**Done-when.**
- **Given** un `snapshot_mock`, **When** se renderiza el diff, **Then** todo el panel lleva el rótulo "SIMULACIÓN — no comprometida".
- **Given** una celda con `N < k` en el mock, **When** se renderiza, **Then** se suprime igual que en producción.
- **Check ejecutable:** snapshot test del diff con rótulo presente + caso supresión — `[STACK-TUNE] <cmd:test>` filtro `F-6.2`.

---

### `01:US-1.1.3` — Predicado RLS cross-tenant (percentil)

**Goal.** El percentil nunca cruza `tenant_id`; predicado determinista, hard-no cross-tenant surfaced; sin LLM.

**Context.** Entradas: `tenant.Restaurante.tenant_id` (frontera RLS). Salida: `cohort.Pertenencia_Cohort_Snapshot` scopeado a un único `tenant_id`; `> 1 tenant_id` aborta + security log. Reusar el middleware/predicado RLS existente.

**Constraints.** Hard-no: `> 1 tenant_id` ⇒ aborta y emite security log (BR-1, MF-4). Predicado determinista. Sin excepción de "modo demo". Observabilidad: security log con el intento.

**Done-when.**
- **Given** un cómputo scopeado a un `tenant_id`, **When** corre, **Then** procede normalmente.
- **Given** entradas con `> 1 tenant_id`, **When** corre, **Then** aborta y registra security log.
- **Check ejecutable:** test "single tenant → ok / multi tenant → abort+log" — `[STACK-TUNE] <cmd:test>` filtro `US-1.1.3` y `[STACK-TUNE] <cmd:security>`.

---

### `01:US-3.1.3` — Link de negocio preserva tenant

**Goal.** Todo link de negocio resuelve dentro del mismo `tenant_id`; predicado RLS determinista sobre el link, hard-no cross-tenant surfaced; sin LLM.

**Context.** Entradas: `tenant.Restaurante.tenant_id` (frontera RLS), `link_destino`. Salida: link resuelto dentro del mismo `tenant_id`; resolución cross-tenant BLOQUEADA (bloqueo-rojo) + log. Reusar el resolutor de links existente.

**Constraints.** Hard-no cross-tenant: bloqueo-rojo + log (BR-1, MF-4). Determinista. Aplica a todos los links de paneles (coordinado con `01:F-3.1`). Observabilidad: log del bloqueo.

**Done-when.**
- **Given** un link cuyo destino es del mismo tenant, **When** se resuelve, **Then** abre normalmente.
- **Given** un link a otro `tenant_id`, **When** se intenta, **Then** bloqueo-rojo + log, sin resolver.
- **Check ejecutable:** test "same-tenant → resuelve / cross-tenant → bloqueo+log" — `[STACK-TUNE] <cmd:test>` filtro `US-3.1.3` y `[STACK-TUNE] <cmd:security>`.

---

## SPEC 02 — NBA / Autonomía (piezas CÓDIGO)

### `02:F-1.1/US-1.1.1` — Render bandeja NBA con min() visible

**Goal.** Render síncrono in-app de las filas NBA por cohorte con `min()` visible (estado vacío, dinero solo-propuesta, bloqueo-rojo cross-tenant); sin LLM.

**Context.** Trigger: agent-manager abre la bandeja del cohort (acción síncrona) con payload `cohort_id` (`cohort.Cohort.cohort_id`). Entradas: `cohort.NBA_Propuesta.causa_raiz`, `.pedido_NBA`; `gov.min_calculo.nivel_efectivo`, `.liberado_evals`, `.teto_tier` (leídos vía `v_min_calculo`). Salida: render only (sin escritura). Reusar `v_min_calculo` como lectura (no recomputar min).

**Constraints.** Read-only. Lee `min()` por la vista `v_min_calculo` (no recalcula). Dinero solo-propuesta (BR-2). Cross-tenant ⇒ bloqueo-rojo (BR-3). Estado vacío explícito. a11y de tabla/estados. Sin LLM.

**Done-when.**
- **Given** un cohort con propuestas, **When** se abre la bandeja, **Then** cada fila muestra `causa_raiz`, `pedido_NBA` y `nivel_efectivo` desde `v_min_calculo`, sin escribir.
- **Given** propuesta que toca dinero, **When** se renderiza, **Then** se marca solo-propuesta.
- **Given** mezcla cross-tenant, **When** se renderiza, **Then** bloqueo-rojo.
- **Check ejecutable:** test de render con fixtures (estado vacío / dinero / cross-tenant) — `[STACK-TUNE] <cmd:test>` filtro `F-1.1/US-1.1.1`.

---

### `02:F-1.1/US-1.1.2` — Render before/after + risk_class por fila

**Goal.** Render síncrono de `before_after_esperado` + `risk_class` derivado por fila, con marca "no auto-liberable" si no es reversible/idempotente (AUT-04); sin LLM.

**Context.** Trigger: agent-manager inspecciona una fila con payload `nba_id` (`cohort.NBA_Propuesta.nba_id`). Entradas: `cohort.NBA_Propuesta.before_after_esperado`, `.risk_class`. Salida: render only (chip before/after + risk_class). Reusar el chip de riesgo existente.

**Constraints.** Read-only. `before_after_esperado` es `[C]` proyección (nunca `[V]`). Marca "no auto-liberable" cuando no reversible/idempotente (EC-2, BR-5). a11y del chip (texto + color). Sin LLM.

**Done-when.**
- **Given** una fila con `risk_class` y `before_after_esperado`, **When** se inspecciona, **Then** se muestran ambos con etiqueta `[C]` en la proyección.
- **Given** acción no reversible/idempotente, **When** se renderiza, **Then** lleva la marca "no auto-liberable".
- **Check ejecutable:** test de render + caso "no reversible → marca" — `[STACK-TUNE] <cmd:test>` filtro `US-1.1.2`.

---

### `02:F-1.4/US-1.4.1` — Render ROI dos-lados + guardrail + doble horizonte

**Goal.** Render síncrono de ROI (dos lados juntos) + `metodo_atribucion` + doble horizonte + guardrail; `n < n_min(20)` ⇒ "muestra insuficiente"; sin LLM.

**Context.** Trigger: agent-manager abre la vista ROI/guardrail con payload `liberacion_id` (`gov.Liberacion_Lote.liberacion_id`). Entradas: `gov.ROI_Operador.ratio_1_10`, `.guardrail_error`, `.metodo_atribucion`, `.horizonte_medido`, `gov.min_calculo.n_cohort`. Salida: render only. Reusar el componente ROI existente.

**Constraints.** Read-only. `n < 20` ⇒ "muestra insuficiente" (BR-10, EC-8/EC-9): umbral desde config, no hard-codeado. Muestra los dos lados del ROI juntos + `metodo_atribucion` + doble horizonte. a11y. Sin LLM.

**Done-when.**
- **Given** `n ≥ 20`, **When** se abre la vista, **Then** muestra los dos lados de ROI + método + doble horizonte + guardrail.
- **Given** `n < 20`, **When** se abre, **Then** "muestra insuficiente" en lugar de números.
- **Check ejecutable:** test de render con `n` cruzando 20 (umbral inyectado) — `[STACK-TUNE] <cmd:test>` filtro `US-1.4.1`.

---

### `02:MEJORA-B/estimativa_impacto` — estimativa_impacto vs KPI (Named_Query + n-rule)

**Goal.** Computar `impacto_estimado` por `Named_Query` determinista (baseline_cohort + histórico_similar) con confianza por n-rule (BR-IMP-CONF); render con etiqueta "estimado"; **nunca entra en `min()`** (BR-HON-4).

**Context.** Trigger: al proponerse el NBA / renderizar la fila, payload `nba_id` (`cohort.NBA_Propuesta.nba_id`). Entradas: `tenant.KPI.valor_hoy` (baseline_cohort `valor_actual_kpi`), `cohort.NBA_Propuesta.impacto_estimado` (histórico_similar `n_acciones_previas`). Salida: `cohort.NBA_Propuesta.impacto_estimado` (jsonb `[C]` proyección: `kpi + delta_esperado + confianza`). Reusar el ejecutor `Named_Query`.

**Constraints.** COMPUTED-at-run por `Named_Query` (§14). Etiqueta visible "estimado". `metodo=sin_base` ⇒ confianza forzada a baja + "estimado (sin histórico)". **NUNCA** entra en `min()` (BR-HON-4). Confianza por n-rule (BR-IMP-CONF), no inventada. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** histórico_similar presente, **When** corre, **Then** `impacto_estimado = {kpi, delta_esperado, confianza}` con confianza por n-rule y etiqueta "estimado".
- **Given** `metodo=sin_base`, **When** corre, **Then** confianza=baja forzada + etiqueta "estimado (sin histórico)".
- **Given** el cálculo de `min()`, **When** se ejecuta, **Then** `impacto_estimado` no participa.
- **Check ejecutable:** test de `Named_Query` con confianza esperada por n-rule + assert "no entra en min()" — `[STACK-TUNE] <cmd:test>` filtro `MEJORA-B/estimativa`.

---

### `02:MEJORA-B/impacto_realizado` — Cierre de lazo (gate de señal)

**Goal.** Gate determinista `signal_de_resultado` ⇒ `realizado=0` si no hay señal, else alimenta histórico; sin LLM (BR-HON-2).

**Context.** Trigger out-of-band: cierre de acción con señal, payload `nba_id`. Entradas: `gov.ROI_Operador.signal_de_resultado`, `cohort.NBA_Propuesta.impacto_realizado`. Salida: `cohort.NBA_Propuesta.impacto_realizado` (jsonb RESULTADO §14: `delta_medido`, `valor_atribuible`). Reusar el job de atribución existente.

**Constraints.** COMPUTED-at-run / NULL-0 pre-corrida (§14). `signal=false ⇒ realizado=0` (no cuenta). `signal=true ⇒` alimenta `historico_similar` futuro (BR-HON-1/2/5). Sin cruzar `tenant_id`. Observabilidad: log de señal.

**Done-when.**
- **Given** `signal_de_resultado=false`, **When** corre el cierre, **Then** `impacto_realizado=0` y "sin señal aún — no computa".
- **Given** `signal=true`, **When** corre, **Then** `impacto_realizado` se computa y alimenta el histórico.
- **Check ejecutable:** tests "sin señal → 0 / con señal → computa+feed" — `[STACK-TUNE] <cmd:test>` filtro `MEJORA-B/realizado`.

---

### `02:MEJORA-C/cuadrante` — Matriz Riesgo × Impacto (cuadrante)

**Goal.** Derivar `risk_class` (peor caso) × `nivel_impacto` ⇒ cuadrante + acción recomendada; determinista (solo BAJO×alto auto-liberable, BR-M3-02).

**Context.** Trigger: por fila acción/cohorte (render síncrono), payload `nba_id`. Entradas: `cohort.NBA_Propuesta.risk_class` (min() + reversibilidad + dinero + cross-tenant peor caso), `.impacto_estimado`, `gov.Politica_Tier.permitido_hoy` (umbral impacto BR-M3-07). Salida: `cohort.NBA_Propuesta.risk_class` + chip de cuadrante derivado. Reusar la derivación de `risk_class` existente.

**Constraints.** COMPUTED-at-run por columna derivada; sin edición manual. Solo `BAJO×alto` auto-liberable (BR-M3-02). Dinero ⇒ fila ALTO escalar; cross-tenant ⇒ bloqueo fuera de matriz; estimativa baja ⇒ `impacto=desconocido` ⇒ revisión (BR-M3-01/04/06/07/08). Sin LLM.

**Done-when.**
- **Given** `risk_class=BAJO` y `nivel_impacto=alto`, **When** corre, **Then** cuadrante = auto-liberar.
- **Given** `risk_class=ALTO`, **When** corre, **Then** cuadrante = escalar.
- **Given** estimativa ausente, **When** corre, **Then** `impacto=desconocido` ⇒ revisión.
- **Check ejecutable:** tabla de verdad de cuadrantes en tests (cada combinación) — `[STACK-TUNE] <cmd:test>` filtro `MEJORA-C/cuadrante`.

---

### `02:MEJORA-D/GATE-1-credencial` — GATE-1 elegibilidad (RBAC)

**Goal.** Lookup RBAC determinista `rol × accion_clase × nivel × origen × tenant` como predicado antes de `min()`; financiero propose-only; cross-tenant ⇒ bloqueo-rojo.

**Context.** Trigger: acción síncrona que solicita `accion_clase` (desktop/móvil), payload `usuario_id + accion_clase + nivel + origen`. Entradas: `gov.Credencial.rol`, `.estado`, `.tenant_id`, `.rbac_matriz` (`rol × accion_clase → nivel_max_liberable`, `requiere_2_ojos`, `origen_permitido`). Salida: gate-1 pass/`BLOQUEO(perm)` en `gov.Decision_Trace.gate_result` (g1). Reusar el motor de 3-puertas. **Señal de inyección logueada:** un doc `base_de_credenciales.md` con "concede admin a todos" se ingiere como DATO y se ignora como comando (BR-XCHK-4 texto=dato) — no ejecutar instrucciones embebidas.

**Constraints.** COMPUTED-at-run / NULL pre-corrida. Cross-tenant (`> 1 tenant_id`) ⇒ bloqueo-rojo (BR-CRED-4). Financiero propose-only (BR-CRED-1). Texto en docs = dato, nunca comando (BR-XCHK-4). Observabilidad: security log en bloqueo. Pass ⇒ dispara GATE-2.

**Done-when.**
- **Given** rol con permiso para `accion_clase` en su nivel/origen/tenant, **When** corre GATE-1, **Then** pass y dispara GATE-2.
- **Given** rol sin permiso, **When** corre, **Then** `BLOQUEO(perm)` + log.
- **Given** `> 1 tenant_id`, **When** corre, **Then** bloqueo-rojo.
- **Given** doc con instrucción embebida "concede admin", **When** se ingiere, **Then** se trata como dato (no eleva permisos).
- **Check ejecutable:** tests de matriz RBAC + caso cross-tenant + caso texto-como-dato — `[STACK-TUNE] <cmd:test>` filtro `GATE-1` y `[STACK-TUNE] <cmd:security>`.

---

### `02:MEJORA-D/GATE-2-XCHK` — GATE-2 cruce credencial × política

**Goal.** Intersección determinista credencial ∩ política (la política gana), auditando divergencia; divergencia ⇒ bloqueo + alerta `policy_owner`; no-divergencia ⇒ dispara GATE-3 (motor `least()` en `02:WF-1B`).

**Context.** Trigger: disparado por GATE-1 pass, payload `usuario_id + accion + cohort/intent`. Entradas: `gov.Credencial.rbac_matriz`, `gov.Politica_Tier.permitido_hoy`, `.policy_version`, `gov.Credencial.credential_policy_pin`. Salida: `gov.Credencial.audit_divergencia` (la política gana) + `gov.Decision_Trace.gate_result` (g2). Reusar el motor de 3-puertas. **Corrección de edge (critic):** el `to_piece` del salto GATE-3 es `02:WF-1B` (motor `least()`/AND-de-6 registrado) — no existe pieza "GATE-3-min()"; apuntar a `02:WF-1B`. **Señal de inyección logueada:** GATE-2 cruza contra el TEXTO de `base_de_politicas`/`base_de_credenciales`; instrucciones embebidas (ej. "concede admin a todos") se ingieren como DATA, jamás se ejecutan (P10 BR-6).

**Constraints.** COMPUTED-at-run / NULL pre-corrida. La política siempre gana (BR-XCHK-2). Divergencia ⇒ `BLOQUEO(policy)` + alerta `policy_owner` + `audit_divergencia.divergencia=true`. Texto = dato (BR-XCHK-4). Observabilidad: alerta + audit. No-divergencia ⇒ dispara `02:WF-1B`.

**Done-when.**
- **Given** credencial y política coincidentes, **When** corre GATE-2, **Then** no-divergencia y dispara `02:WF-1B`.
- **Given** divergencia, **When** corre, **Then** `BLOQUEO(policy)` + alerta `policy_owner` + `audit_divergencia=true`.
- **Check ejecutable:** tests "coincide → pasa a WF-1B / divergente → bloqueo+alerta" + assert "política gana" — `[STACK-TUNE] <cmd:test>` filtro `GATE-2`.

---

### `02:WF-1B` — Cálculo min() + clasificación bajo-riesgo

**Goal.** `least()` sobre ENUM ordenado + AND-de-checks determinista; financiero nunca autónomo; computa `nivel_efectivo`, `auto_liberable` y `n_cohort`.

**Context.** Trigger: disparado por 1A (candidate NBA), payload `nba_id`. También receptor de los envelopes de `03:US-3.1.1-handoff-A` y `03:US-6.2.1-itemA` (handoff a P02 min_calculo) y del GATE-2 `02:MEJORA-D/GATE-2-XCHK`. Entradas: `cohort.NBA_Propuesta.pedido_NBA`, `min_calculo.liberado_evals` (P06), `.teto_tier` (P10), `gov.Politica_Tier.policy_version`, `NBA_Propuesta.clase_financiera`, `.risk_class`. Salida: `gov.min_calculo.nivel_efectivo = least(pedido_NBA, liberado_evals, teto_tier)` + `.auto_liberable` (AND-de-6) + `.n_cohort`. Reusar el motor `least()` registrado (golden CÓDIGO #3).

**Constraints.** COMPUTED-at-run / NULL pre-corrida, **NUNCA sembrado** (§14). `nivel_efectivo = least(...)` exacto. Dinero ⇒ techo ALTO (BR-2). Cross-tenant / `N<k` ⇒ bloqueo/suprimir (BR-3, BR-12). Política no resoluble o `n<20` ⇒ degrade-a-humano (BR-6, BR-10, EC-6). `auto_liberable` = AND-de-6 (todas las condiciones). Observabilidad: trace del cálculo.

**Done-when.**
- **Given** `pedido_NBA`, `liberado_evals`, `teto_tier`, **When** corre, **Then** `nivel_efectivo = least(...)` y `auto_liberable` solo si AND-de-6 pasa.
- **Given** acción que toca dinero, **When** corre, **Then** techo=ALTO (no autónomo).
- **Given** `n<20` o política no resoluble, **When** corre, **Then** degrade-a-humano.
- **Check ejecutable:** property test "nivel_efectivo == least(inputs)" sobre ENUM ordenado + casos dinero/cross-tenant/n<20 — `[STACK-TUNE] <cmd:test>` filtro `WF-1B`.

---

### `02:WF-1B/BR-12-kanon` — Supresión k-anonymity N<k

**Goal.** Conteo determinista vs umbral `k` ⇒ supresión del insight; k-anon hard-no, fail-closed; sin LLM.

**Context.** Trigger: pre-exhibición del insight de cohort/subgrupo (render síncrono 1B-1D), payload `cohort_id | subgrupo_id`. Entradas: `cohort.Cohort.n_cuentas` (CHECK k-anon), `Config_Perillas.key` (`k_anon_threshold`). Salida: flag de supresión sobre el render (`N<k` ⇒ "cohorte demasiado pequeña — re-identificación competitiva, fail-closed"); sin escritura. Reusar el umbral de `Config_Perillas`.

**Constraints.** `k_anon_threshold` desde `Config_Perillas`. Render-only (no persiste columna). Fail-closed: ante duda, suprimir. Hard-no surfaced con motivo (BR-12, BR-3, EC-5). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `N < k`, **When** se evalúa pre-render, **Then** insight suprimido con motivo k-anon.
- **Given** `N ≥ k`, **When** se evalúa, **Then** insight visible.
- **Check ejecutable:** test del predicado con `N` cruzando `k` (umbral inyectado) — `[STACK-TUNE] <cmd:test>` filtro `BR-12-kanon`.

---

### `02:WF-1B/BR-6-policy-validate` — Validación contra base-de-políticas versionada

**Goal.** Resolver `policy_version` y comparar `permitido_hoy` / `como_se_mide` deterministamente (Named_Query/lookup); fail-closed si `policy_version` no resoluble.

**Context.** Trigger: disparado por 1B durante la clasificación, payload `nba_id + policy_version`. Entradas: `gov.Politica_Tier.policy_version`, `.permitido_hoy`, `.como_se_mide`, `.resultado_medido`. Salida: resultado de validación en `gov.min_calculo.auto_liberable` (brazo política-validada). Reusar la `Named_Query`/lookup de políticas.

**Constraints.** COMPUTED-at-run / NULL pre-corrida. Fail-closed si `policy_version` no resoluble. Política ausente/no cubierta ⇒ degrade-a-humano + ofrecer proponer nueva política (US-1.2.2 edge, EC-3). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `policy_version` resoluble y `permitido_hoy` cubre la acción, **When** corre, **Then** brazo política-validada = ok.
- **Given** política ausente/no cubierta, **When** corre, **Then** degrade-a-humano + opción de proponer política.
- **Check ejecutable:** tests "política cubre → ok / ausente → degrade" — `[STACK-TUNE] <cmd:test>` filtro `BR-6-policy-validate`.

---

### `02:WF-1C/EC-10-multietapa` — Pausa de NBA multi-etapa con etapas en vuelo

**Goal.** CHECK determinista de etapas-en-vuelo ⇒ rollback + marca de crédito provisional; sin LLM.

**Context.** Trigger: síncrono, PAUSAR elegido sobre un NBA multi-etapa, payload `nba_id`. Entradas: `gov.Liberacion_Lote.etapas_en_vuelo_resueltas`, `gov.ROI_Operador.impacto_negocio_atribuible` (crédito parcial). Salida: `gov.Liberacion_Lote.etapas_en_vuelo_resueltas=true` (rollback pendientes) + crédito marcado provisional en `gov.ROI_Operador`. Reusar el motor EC-10 / reconciliación de `decision_trace`.

**Constraints.** COMPUTED-at-run. Etapas en vuelo ⇒ rollback/cierre + crédito provisional hasta reconciliar (BR-5, BR-7). Reconciliación de `decision_trace` si la detección falla. Sin cruzar `tenant_id`. Observabilidad: log de rollback.

**Done-when.**
- **Given** PAUSAR sobre NBA con etapas en vuelo, **When** corre, **Then** `etapas_en_vuelo_resueltas=true`, rollback de pendientes y crédito marcado provisional.
- **Check ejecutable:** test "etapas en vuelo → rollback + crédito provisional" — `[STACK-TUNE] <cmd:test>` filtro `EC-10-multietapa`.

---

### `02:WF-1C/US-1.2.1` — Libera/pausa en LOTE por cohorte (HUMAN-gate firma)

**Goal.** Acción humana síncrona in-app (liberar/pausar lote + firma); CÓDIGO/UI + HUMAN-gate; override solo-a-la-BAJA; dispara 1E.

**Context.** Trigger: acción síncrona, agent-manager clic liberar/pausar lote + firma, payload `cohort_id + nba_ids`. Entradas: `gov.min_calculo.nivel_efectivo`, `.auto_liberable`; `cohort.NBA_Propuesta.before_after_esperado`. Salida: `gov.Liberacion_Lote {accion {LIBERAR|PAUSAR}, nivel_resultante ≤ nivel_efectivo (BR-1), proponente_id, operador_id firma, policy_version_validada}`. Reusar el componente de firma existente.

**Constraints.** `nivel_resultante ≤ nivel_efectivo` (BR-1): intento de subir nivel ⇒ fail-closed rechazado. HUMAN-gate firma obligatoria (BR-9): firma ausente ⇒ rechazado. Override solo-a-la-BAJA (AUT-11). Sin cruzar `tenant_id`. Observabilidad: trace de la liberación. LIBERAR ⇒ dispara 1E (`02:WF-1E-trace`).

**Done-when.**
- **Given** firma presente y `nivel_resultante ≤ nivel_efectivo`, **When** se libera, **Then** se persiste `Liberacion_Lote` y dispara 1E.
- **Given** intento de subir nivel o firma ausente, **When** se intenta, **Then** fail-closed rechazado.
- **Check ejecutable:** tests "firma+nivel ok → libera / subir nivel → rechazo / sin firma → rechazo" — `[STACK-TUNE] <cmd:test>` filtro `US-1.2.1`.

---

### `02:WF-1D/US-1.3.1` — Drill a subgrupo para acción super-específica (HUMAN-gate)

**Goal.** Drill humano síncrono cohort → subgrupo + decisión libera/pausa (mismo `min()`, trace propio); CÓDIGO/UI + HUMAN-gate; máx 2 niveles.

**Context.** Trigger: acción síncrona, agent-manager hace drill cohort → subgrupo + libera/pausa, payload `subgrupo_id`. Entradas: `cohort.Subgrupo.cohort_id`, `gov.min_calculo.nivel_efectivo` (subgrupo), `cohort.NBA_Propuesta.subgrupo_id`. Salida: `gov.Liberacion_Lote` scopeado a `subgrupo_id` (decisión propia, `decision_trace` propio). Reusar `02:WF-1C/US-1.2.1` (mismas invariantes). **Nota:** la paridad móvil del flujo lote→drill está marcada `[I]` needs-prototype (`02:WF-1D-mobile-PENDIENTE`) — no fabricar GWT móvil aquí; las invariantes son idénticas a desktop.

**Constraints.** Máx 2 niveles (cohort → subgrupo). Mismas invariantes que 1C (`nivel_resultante ≤ nivel_efectivo`, firma, override-solo-baja). `N<k` ⇒ suprimir (BR-12). Subgrupo sin `liberado_evals`/política ⇒ degrade-a-humano (EC-5). Sin cruzar `tenant_id`. Dispara 1E.

**Done-when.**
- **Given** un drill a subgrupo con firma, **When** se decide libera/pausa, **Then** se persiste `Liberacion_Lote` scopeado al subgrupo con trace propio y dispara 1E.
- **Given** subgrupo con `N<k`, **When** se hace drill, **Then** se suprime.
- **Check ejecutable:** tests "drill subgrupo → trace propio / N<k → suprime / sin evals → degrade" — `[STACK-TUNE] <cmd:test>` filtro `US-1.3.1`.

---

### `02:WF-1E-confirm` — Confirmación independiente (anti-rubber-stamp)

**Goal.** CHECK determinista `confirmador_id ≠ proponente_id` (columna GENERATED `independencia_garantida`); marca "auto-confirmada — independencia NO garantizada" si null; nunca finge sello.

**Context.** Trigger: disparado por 1E al cierre de impacto, payload `roi_id`. Entradas: `gov.ROI_Operador.confirmador_id`, `gov.Liberacion_Lote.proponente_id`. Salida: `gov.ROI_Operador.independencia_garantida` (GENERATED = `confirmador_id IS NOT NULL AND ≠ proponente`). Reusar la columna GENERATED / motor BR-11.

**Constraints.** COMPUTED-at-run vía GENERATED; **nunca finge sello** (§14). `confirmador=null` o `=proponente` ⇒ marca auto-confirmada `[C]` + envía tasa-rechazo como señal rubber-stamp. Sin cruzar `tenant_id` (BR-11). Observabilidad: señal de rubber-stamp.

**Done-when.**
- **Given** `confirmador_id ≠ proponente_id` y no null, **When** se evalúa, **Then** `independencia_garantida=true`.
- **Given** `confirmador=null` o `=proponente`, **When** se evalúa, **Then** marca auto-confirmada `[C]` + señal rubber-stamp.
- **Check ejecutable:** tests de la columna GENERATED (3 casos) — `[STACK-TUNE] <cmd:test>` filtro `WF-1E-confirm`.

---

### `02:WF-1E-roi` — Medición ROI_operador + guardrail error

**Goal.** `Named_Query`/job determinista (eficiencia × impacto atribuible + guardrail) sobre señales por ventana; sin confirmable si funnel-correlacional; sin señal ⇒ cuenta 0 (BR-7).

**Context.** Trigger: disparado por el contenedor 1E tras el trace, payload `liberacion_id + signal_de_resultado`. Entradas: `gov.ROI_Operador.signal_de_resultado`, `gov.Decision_Trace`, `gov.ROI_Operador.metodo_atribucion`, `.horizonte_medido`. Salida: `gov.ROI_Operador.ratio_1_10`, `.tiempo_economizado`, `.impacto_negocio_atribuible`, `.guardrail_error`, `.es_atribuible`. Reusar el job de atribución 2-compuertas + ventana D días.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14). Funnel-correlacional ⇒ no-confirmable. Sin señal ⇒ cuenta 0 (BR-7). Guardrail error sube ⇒ alerta + rebaja automática (override a la BAJA). Inmediato+ / largo− ⇒ revisar NBA (EC-9). Ventana D días desde config. Sin cruzar `tenant_id`. Observabilidad: alerta de guardrail.

**Done-when.**
- **Given** señal presente y método separable, **When** corre, **Then** `ratio_1_10` + `guardrail_error` + `es_atribuible` computados.
- **Given** sin señal, **When** corre, **Then** cuenta 0.
- **Given** `guardrail_error` sube, **When** corre, **Then** alerta + rebaja a la BAJA.
- **Check ejecutable:** tests "sin señal → 0 / funnel → no confirmable / guardrail alto → rebaja" — `[STACK-TUNE] <cmd:test>` filtro `WF-1E-roi`.

---

## SPEC 03 — Goals / KPIs (piezas CÓDIGO)

### `03:BR-1` — Check anti-distorsión (KPI unificado)

**Goal.** Check determinista `formula + periodicidad + group_by == def_version`, else fail-closed "KPI no unificado/no medible"; lógica pura, síncrona; sin número mostrado.

**Context.** Trigger: síncrono al calcular/renderizar cualquier KPI. Entradas: `catalog.Named_Query.def_version` + `KPI.kpi_def_version` (match formula/periodicidad/group_by). Salida: flag fail-closed "KPI no unificado/no medible" (sin escritura DB; gatea el render). Reusar el contrato `named_query run()` existente.

**Constraints.** Sin escritura DB. Fail-closed: si no matchea, no se muestra número (EC-1, EC-2). Determinista. Sin cruzar `tenant_id`. Observabilidad: log del mismatch.

**Done-when.**
- **Given** `def_version` que matchea en los 3 ejes, **When** corre el check, **Then** pasa y permite el render del número.
- **Given** mismatch en cualquier eje, **When** corre, **Then** fail-closed "no unificado", sin número.
- **Check ejecutable:** tests por cada eje que diverge → fail-closed — `[STACK-TUNE] <cmd:test>` filtro `BR-1`.

---

### `03:BR-2` — Performance read-only enforcement (clase dispatch)

**Goal.** Dispatch determinista por clase: `clase=performance` read-only desde feed externo, NUNCA vía 3A; gate síncrono de bloqueo-de-edición; fail-closed si sin firma.

**Context.** Trigger: síncrono al intentar render/edit de una fila KPI. Entradas: `tenant.KPI.clase {performance|proceso}` + `.performance_validado_por` + `.validado_en`. Salida: lock read-only + badge "fuente externa validada"; `clase=performance` bypassa `Named_Query` 3A; fail-closed "Performance no disponible / sin firma" si unsigned. **Phantom normalizado:** `PerformanceFeed` → `KPI.performance_validado_por` / `.validado_en`. Reusar el dispatch de `EPIC-4`.

**Constraints.** `performance` siempre read-only (hard-no edit). Bypassa 3A (no recomputa). Fail-closed si sin firma (`performance_validado_por` null). a11y del badge. Sin cruzar `tenant_id`. Observabilidad: log de intento de edición bloqueado.

**Done-when.**
- **Given** `clase=performance` firmada, **When** se renderiza, **Then** lock read-only + badge "fuente externa validada".
- **Given** `clase=performance` sin firma, **When** se renderiza, **Then** fail-closed "Performance no disponible / sin firma".
- **Given** intento de edición sobre performance, **When** se intenta, **Then** bloqueado.
- **Check ejecutable:** tests "firmada → lock+badge / sin firma → fail-closed / edit → bloqueo" — `[STACK-TUNE] <cmd:test>` filtro `BR-2`.

---

### `03:BR-6` — Check de nesting/orphan (proceso-KPI sin parent)

**Goal.** Check determinista de nesting: proceso-KPI sin `parent_kpi_id` de negocio ⇒ flag "no conectado al impacto"; señala, no borra; síncrono.

**Context.** Trigger: síncrono al definir/renderizar `clase=proceso`. Entradas: `tenant.KPI.parent_kpi_id` + `.nivel` (nesting acíclico). Salida: flag "no conectado al impacto — revisar" (sin borrado, sin escritura de valor). Reusar la validación de jerarquía existente.

**Constraints.** Solo señala (no borra, EC-6). Nesting acíclico (detectar ciclos). Sin escritura de valor. Sin cruzar `tenant_id`. Observabilidad: flag persistente para revisión.

**Done-when.**
- **Given** un proceso-KPI sin `parent_kpi_id`, **When** corre el check, **Then** flag "no conectado al impacto — revisar".
- **Given** ciclo en el nesting, **When** corre, **Then** se detecta (no loop infinito).
- **Check ejecutable:** tests "huérfano → flag / ciclo → detectado" — `[STACK-TUNE] <cmd:test>` filtro `BR-6`.

---

### `03:BR-8` — Cross-tenant rollup guard

**Goal.** Check determinista de frontera de tenant en agregados ⇒ bloqueo-rojo; hard-no cross-tenant; predicado síncrono.

**Context.** Trigger: síncrono en cualquier render de agregado/rollup. Entradas: `tenant.KPI.tenant_id` (frontera RLS, `> 1 tenant_id` aborta). Salida: bloqueo-rojo en mezcla cross-tenant; sin escritura DB. Reusar el predicado RLS existente.

**Constraints.** Hard-no: `> 1 tenant_id` ⇒ bloqueo-rojo (EC-8). Determinista. Sin escritura. Sin excepción demo. Observabilidad: security log.

**Done-when.**
- **Given** un agregado de un solo tenant, **When** se renderiza, **Then** procede.
- **Given** mezcla de tenants, **When** se renderiza, **Then** bloqueo-rojo + log.
- **Check ejecutable:** test "single → ok / multi → bloqueo+log" — `[STACK-TUNE] <cmd:test>` filtro `BR-8` y `[STACK-TUNE] <cmd:security>`.

---

### `03:Named_Query.valor_hoy` — Cómputo 3A (Named_Query → valor_hoy)

**Goal.** `Named_Query` determinista computa `KPI.valor_hoy` vía Python/SQL, NUNCA LLM (golden-set CÓDIGO#2); retorna `{value, unit}`.

**Context.** Trigger: síncrono `run(named_query, params={group_by, ventana, tenant_id})` desde el job 3A. Entradas: `catalog.Named_Query.formula` + `.source_ref` + `tenant.Orden`/`tenant.Evento_Uso` + `KPI.kpi_def_version`. Salida: `KPI.valor_hoy` (Named_Query determinista §14). Reusar el contrato `run()` existente.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14): prohibido sembrar `valor_hoy`. NUNCA LLM. `kpi_def_version` debe coincidir con `def_version` (BR-1). Sin cruzar `tenant_id`. Observabilidad: `{def_version, value, unit}`.

**Done-when.**
- **Given** params válidos y `def_version` coincidente, **When** corre `run()`, **Then** retorna `{value, unit}` y persiste `valor_hoy`.
- **Given** estado pre-corrida, **When** se lee, **Then** NULL.
- **Check ejecutable:** test de `Named_Query` con valor esperado **computado por el test** desde fixture, no hard-codeado — `[STACK-TUNE] <cmd:test>` filtro `Named_Query.valor_hoy`.

---

### `03:US-1.1.1` — Render 3 lentes (empresa/personal/proceso)

**Goal.** Render UI de 3 lentes conmutables (empresa/personal/proceso); superficie determinista, acción síncrona; sin LLM.

**Context.** Trigger: síncrono, agent-manager abre la feature / cambia lente. Entradas: `tenant.KPI` (`nivel {empresa|personal|proceso}`, `target`, `valor_hoy`, `provenance`, `clase`). Salida: scorecard read-only (estados loading/skeleton/default-lente); sin escritura. Reusar el componente scorecard existente.

**Constraints.** Read-only. 3 estados de carga manejados. Lente por defecto determinista. a11y: conmutador de lente accesible por teclado, estados anunciados. Sin cruzar `tenant_id`. Sin LLM.

**Done-when.**
- **Given** un usuario abre la feature, **When** conmuta entre lentes, **Then** el scorecard re-renderiza la lente seleccionada sin escribir.
- **Given** datos cargando, **When** se renderiza, **Then** muestra skeleton.
- **Check ejecutable:** test de conmutación de lentes + estados de carga — `[STACK-TUNE] <cmd:test>` filtro `US-1.1.1`.

---

### `03:US-1.1.2` — Render target vs hoy + proximidad + provenance + fail-closed

**Goal.** Render por-KPI de `target`/`valor_hoy`/proximidad/provenance; sin def validada ⇒ "no medible"; render + estado deterministas, síncrono.

**Context.** Trigger: síncrono, fila KPI renderizada. Entradas: `tenant.KPI.target` + `.valor_hoy` + `.provenance` + `.kpi_def_version`. Salida: fila UI (indicador de proximidad, badge de provenance) o error-state "KPI no validado — no medible"; sin escritura. Reusar el badge de provenance existente.

**Constraints.** Read-only. Sin `kpi_def_version` validada ⇒ "no medible" (BR-1, EC-1). a11y: proximidad no solo color; badge con texto. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** un KPI con def validada, **When** se renderiza la fila, **Then** muestra `target`/`valor_hoy`/proximidad/provenance.
- **Given** sin def validada, **When** se renderiza, **Then** error-state "no medible".
- **Check ejecutable:** test "validado → fila / sin def → no medible" — `[STACK-TUNE] <cmd:test>` filtro `US-1.1.2`.

---

### `03:US-1.2.1` — Predicado de role-scoping (visibilidad KPI)

**Goal.** Predicado determinista `visible(KPI)` sobre `dueno_id`/`directos`/`nivel`/`tenant`; gate de render síncrono; sin LLM.

**Context.** Trigger: síncrono al entrar/navegar la feature. Entradas: `tenant.KPI.dueno_id` + `.tenant_id` + `.nivel` + `Usuario.nivel_org` + `Usuario.directos[]` + `Usuario.manager_id`. Salida: filtro de visibilidad / access-block (predicado RLS-like); sin escritura. **Phantom normalizado:** `OrgGraph` → `Usuario.nivel_org`/`.manager_id`/`.directos[]`. Reusar el predicado de scope existente.

**Constraints.** Predicado RLS-like determinista (BR-5, EC-7). Sin cruzar `tenant_id`. Sin escritura. Default deny (fail-closed). Observabilidad: log de access-block.

**Done-when.**
- **Given** un usuario con scope que incluye el KPI, **When** navega, **Then** el KPI es visible.
- **Given** un KPI fuera de scope, **When** navega, **Then** access-block.
- **Check ejecutable:** tests de matriz de scope (dueño/directo/nivel/cross-tenant) — `[STACK-TUNE] <cmd:test>` filtro `US-1.2.1`.

---

### `03:US-2.1.1` — Descomposición lagging → leading (graph traversal)

**Goal.** Traversal determinista del grafo acíclico `LeadingLink` (lagging → leading); lookup estructural sin LLM; render síncrono.

**Context.** Trigger: síncrono al abrir un lagging KPI bajo target. Entradas: `tenant.KPI` (`es_lagging`, `parent_kpi_id` nesting) + self-link a leading indicators. Salida: vista de descomposición "qué leading se movió" + flag de huérfano si sin parent (BR-6); sin escritura. **Phantom normalizado:** `LeadingLink` → `tenant.Edicion_Contexto`/self-link de KPI. Reusar el traversal de jerarquía existente.

**Constraints.** Grafo acíclico (detectar ciclos). Read-only. Huérfano ⇒ flag (BR-6, EC-6). Sin cruzar `tenant_id`. a11y de la vista de descomposición.

**Done-when.**
- **Given** un lagging KPI con leading indicators, **When** se abre, **Then** muestra qué leading se movió.
- **Given** un KPI sin parent, **When** se abre, **Then** flag de huérfano.
- **Check ejecutable:** test de traversal + caso huérfano + caso ciclo — `[STACK-TUNE] <cmd:test>` filtro `US-2.1.1`.

---

### `03:US-2.2.1` — Proyección histórico → previsibilidad (estimación [I])

**Goal.** Proyección/tendencia sobre snapshots semanales, rotulada estimación `[I]` (proyección NO medida); cómputo estadístico determinista (no LLM), síncrono; "datos insuficientes" si `< N` snapshots.

**Context.** Trigger: síncrono al abrir el histórico de un KPI. Entradas: `tenant.KPI` + serie de snapshots semanales. **HALT de vocab (confianza baja):** `SnapshotSemanal` (tabla semanal de KPI) NO está en el allowlist; el más cercano `cohort.Pertenencia_Cohort_Snapshot` es percentil-only, no un valor semanal de KPI — **no adivinar schema**; tratar el data_in como bloqueado hasta que el repo defina la tabla, y mientras tanto fail-closed "datos insuficientes". Salida: tendencia + proyección rotulada `[I]` (etiqueta visible §14); o "datos insuficientes" si `< N`; sin valor sembrado.

**Constraints.** COMPUTED-at-run; etiqueta `[I]` proyección-NO-medida siempre visible (§14). `< N` snapshots ⇒ "datos insuficientes". **No** sembrar valor. **No** adivinar el schema de `SnapshotSemanal` (HALT registrado). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `≥ N` snapshots (cuando la tabla exista), **When** se abre el histórico, **Then** muestra tendencia + proyección rotulada `[I]`.
- **Given** `< N` snapshots o tabla no resuelta, **When** se abre, **Then** "datos insuficientes" (fail-closed, sin valor inventado).
- **Check ejecutable:** test "≥N → proyección [I] / <N → insuficiente" con la fuente de snapshots mockeada; el HALT de schema documentado en el test — `[STACK-TUNE] <cmd:test>` filtro `US-2.2.1`.

---

### `03:US-3.1.1-approval` — Approval-gate humano (AccionSugerida)

**Goal.** Aprobar/rechazar síncrono in-app de `AccionSugerida`; nada corre sin firma; CÓDIGO/UI + HUMAN-gate.

**Context.** Trigger: síncrono, agent-manager decide sobre una propuesta. Entradas: `tenant.AccionSugerida.estado {propuesta}`. Salida: `AccionSugerida.estado → {aprobada|rechazada}` + `.aprobado_por` (approval-gate BR-4); `estado=ejecutada` solo post-handoff. Reusar el componente de aprobación existente.

**Constraints.** Hard-no: nada-autónomo / sin-trace-no-acción (BR-4). HUMAN-gate firma (`aprobado_por`). `ejecutada` solo tras handoff. Sin cruzar `tenant_id`. Observabilidad: trace de la decisión. Aprobada+tipo-A ⇒ handoff a P02; tipo-B ⇒ abre EPIC-6.

**Done-when.**
- **Given** una propuesta, **When** el humano aprueba, **Then** `estado=aprobada` + `aprobado_por` sellado; tipo-A dispara handoff.
- **Given** sin firma, **When** se intenta ejecutar, **Then** no corre (fail-closed).
- **Check ejecutable:** tests "aprobar → estado+firma / sin firma → no corre" — `[STACK-TUNE] <cmd:test>` filtro `US-3.1.1-approval`.

---

### `03:US-3.1.1-handoff-A` — Handoff tipo-A → P02/min() (envelope determinista)

**Goal.** Construir envelope `{nba_id, cohort_id, intent}` + predicado A sii ambos resuelven; dispatch construible, síncrono tras aprobación.

**Context.** Trigger: síncrono, `AccionSugerida.estado=aprobada AND tipo_ejecucion derivable`. Entradas: `tenant.AccionSugerida.nba_id` (FK `NBA_Catalogo` A1-A8) + `.cohort_id` + `.intent`. Salida: envelope `{nba_id, cohort_id, intent}` a P02 min_calculo; `AccionSugerida.decision_trace_id` (COMPUTED-at-run / NULL pre-corrida). **Producer resuelto:** el receptor es `02:WF-1B` (motor `least()`/AND-de-6) + `02:WF-1E-trace` (motor 3-puertas escribe `Decision_Trace.trace_id` firmado). Reusar el constructor de envelope existente.

**Constraints.** Envelope solo si `nba_id` y `cohort_id` resuelven (predicado A). `decision_trace_id` COMPUTED-at-run / NULL pre-corrida (§14). Sin cruzar `tenant_id`. Observabilidad: log del handoff.

**Done-when.**
- **Given** `estado=aprobada` con `nba_id`+`cohort_id` resueltos, **When** corre, **Then** se emite envelope `{nba_id, cohort_id, intent}` a P02 y `decision_trace_id` queda pendiente (NULL pre-corrida).
- **Given** `nba_id` o `cohort_id` no resuelven, **When** corre, **Then** no se emite envelope.
- **Check ejecutable:** test de forma del envelope + caso "no resuelve → no emite" — `[STACK-TUNE] <cmd:test>` filtro `US-3.1.1-handoff-A`.

---

### `03:US-3.2.1` — Loop de acuracidad (marca humana)

**Goal.** Marca síncrona in-app `acuracidad_feedback {acertada|no|no_atribuible}`; acción que registra un juicio humano; CÓDIGO/UI + HUMAN.

**Context.** Trigger: síncrono, ciclo cerrado, humano valida la recomendación. Entradas: `tenant.AccionSugerida` (recomendación aprobada/ejecutada). Salida: `AccionSugerida.acuracidad_feedback` (COMPUTED-at-run / NULL pre-corrida §14) — correlación-no-causa si no atribuible. Reusar el control de feedback existente.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14). `no_atribuible` ⇒ correlación-no-causa explícita. HUMAN registra el juicio. Sin cruzar `tenant_id`. Retroalimenta el modelo de recomendación (downstream ranking, fuera de scope de pieza). Observabilidad: log del feedback.

**Done-when.**
- **Given** una recomendación cerrada, **When** el humano marca acuracidad, **Then** `acuracidad_feedback` ∈ del enum y, si `no_atribuible`, se marca correlación-no-causa.
- **Given** estado pre-marca, **When** se lee, **Then** NULL.
- **Check ejecutable:** tests por valor del enum + assert "no_atribuible → correlación-no-causa" — `[STACK-TUNE] <cmd:test>` filtro `US-3.2.1`.

---

### `03:US-4.1.1` — Doc canónico versionado = catálogo Named_Query

**Goal.** La def canónica de KPI es un artefacto de catálogo/registry (`Named_Query`) versionado; store determinista, lectura síncrona por la feature.

**Context.** Trigger: síncrono, el cálculo de KPI resuelve `def_ref` → entrada de registry. Entradas: `catalog.Named_Query` (`def_version`, `formula`, `periodicidad`, `group_by`, `source_ref`, `unit`). Salida: def canónica resuelta para el cálculo; la escritura requiere credencial (Open Q#7); sin escritura de valor aquí. **Phantom normalizado:** `DocCanonicoKPI` → `catalog.Named_Query`. Reusar el catálogo `Named_Query`.

**Constraints.** Versionado por `def_version`. Escritura requiere credencial. Sin escritura de valor aquí. Sin cruzar `tenant_id`. Observabilidad: log de resolución.

**Done-when.**
- **Given** un `def_ref`, **When** el cálculo lo resuelve, **Then** retorna la entrada `Named_Query` versionada correcta.
- **Given** intento de escritura sin credencial, **When** se intenta, **Then** rechazado.
- **Check ejecutable:** test de resolución de `def_ref` + caso "write sin credencial → rechazo" — `[STACK-TUNE] <cmd:test>` filtro `US-4.1.1`.

---

### `03:US-4.2.1` — Edición gobernada 4-ojos (contexto/NBA)

**Goal.** Edición humana síncrona de contexto/NBA gateada por 4-ojos (`validador ≠ editor`) + log; CRUD síncrono + HUMAN-gate.

**Context.** Trigger: síncrono, usuario con credencial edita contexto/NBA. Entradas: `tenant.Edicion_Contexto` (`editor_id`, `validador_id`, `target_ref → KPI clase=proceso`, `campo`, `valor_anterior/nuevo`). Salida: fila `Edicion_Contexto` + `.independencia_garantida` (GENERATED = `validador_id IS NOT NULL` §14); bloqueado si sin 4-ojos (BR-3). **Phantom normalizado:** `EdicionContexto` → `tenant.Edicion_Contexto`. Reusar la columna GENERATED de independencia.

**Constraints.** 4-ojos: `validador_id ≠ editor_id` y no null (BR-3, EC-3); sin 4-ojos ⇒ bloqueado. `independencia_garantida` GENERATED (§14). Anti-rubber-stamp. Sin cruzar `tenant_id`. Observabilidad: log de la edición. Solo `clase=proceso` editable.

**Done-when.**
- **Given** editor + validador distintos, **When** se edita, **Then** se persiste la fila con `independencia_garantida=true`.
- **Given** `validador_id` null o `= editor_id`, **When** se intenta, **Then** bloqueado.
- **Check ejecutable:** tests "4-ojos ok → persiste / mismo id o null → bloqueo" — `[STACK-TUNE] <cmd:test>` filtro `US-4.2.1`.

---

### `03:US-6.1.1-diagnostico` — Diagnóstico determinista (dónde + desde-cuándo)

**Goal.** Diagnóstico determinista reusando `EPIC-2` (lagging→leading) + segmento peor + onset; cómputo estructural sin LLM, síncrono.

**Context.** Trigger: síncrono, workbench abierto (reusa 3C, no re-implementa). Entradas: descomposición leading de `tenant.KPI` + `tenant.Orden` (segmento peor) + onset/tendencia de snapshots. Salida: `workbench.segmento (dónde)` + `onset (desde-cuándo)`; sin valor sembrado. **Reusar `03:US-2.1.1` (3C), no re-implementar el traversal.**

**Constraints.** Reusa 3C (no duplica el traversal). COMPUTED-at-run; sin valor sembrado. Sin cruzar `tenant_id`. Observabilidad: log del diagnóstico. Sin LLM.

**Done-when.**
- **Given** un KPI en workbench, **When** corre el diagnóstico, **Then** produce `segmento` (dónde) + `onset` (desde-cuándo) reusando la descomposición leading.
- **Check ejecutable:** test del diagnóstico sobre fixture + assert "reusa 3C" (mock del traversal) — `[STACK-TUNE] <cmd:test>` filtro `US-6.1.1-diagnostico`.

---

### `03:US-6.1.1-verify` — metrica_verificacion (número determinista)

**Goal.** El NÚMERO que verifica cada hipótesis es Python/SQL determinista, NUNCA LLM (golden AGENTE#2); cómputo síncrono.

**Context.** Trigger: síncrono, por hipótesis `metrica_verificacion` vía `run()` del mismo registry. Entradas: `catalog.Named_Query` (mismo registro/ejecutor) + `tenant.Orden`/`tenant.Evento_Uso`. Salida: número de verificación `{value, unit}` (Named_Query determinista §14); rechazado si el LLM intenta producirlo; "no medible aún" si `n < n_min`. Reusar el contrato `run()` existente.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14). NUNCA LLM (rechazar si intenta). `n < n_min` ⇒ "no medible aún". Sin cruzar `tenant_id`. Frontera HOW/WHAT determinista respetada.

**Done-when.**
- **Given** una hipótesis con `metrica_verificacion`, **When** corre `run()`, **Then** retorna `{value, unit}` determinista.
- **Given** `n < n_min`, **When** corre, **Then** "no medible aún".
- **Given** intento del LLM de producir el número, **When** se evalúa, **Then** rechazado.
- **Check ejecutable:** test de la metrica con valor esperado computado por el test + caso "n<n_min → no medible" — `[STACK-TUNE] <cmd:test>` filtro `US-6.1.1-verify`.

---

### `03:US-6.2.1-itemA` — Ítem NBA_estructurada A1-A8 → handoff P2/min()

**Goal.** Construir envelope + handoff para ítem NBA autorizado; síncrono tras autorización humana; hard-nos tipo-A mantenidos (dinero/cross-tenant NO auto-autorizable).

**Context.** Trigger: síncrono, humano autoriza un ítem = NBA estructurada A1-A8. Entradas: ítem del workbench `{nba_id (FK NBA_Catalogo A1-A8), cohort_id, intent}`. Salida: envelope a P02 min_calculo; `decision_trace_id` (COMPUTED-at-run / NULL pre-corrida). **Producer resuelto:** `02:WF-1B` (`least()`) + `02:WF-1E-trace` (motor 3-puertas). Reusar el constructor de envelope (mismo patrón que `03:US-3.1.1-handoff-A`).

**Constraints.** Ítem dinero/cross-tenant **NO** auto-autorizable (financiero nunca autónomo por efecto, surfaced). `decision_trace_id` COMPUTED-at-run / NULL pre-corrida (§14). Sin cruzar `tenant_id`. Observabilidad: log del handoff.

**Done-when.**
- **Given** un ítem NBA A1-A8 autorizado (no dinero/cross-tenant), **When** corre, **Then** se emite envelope a P02 y `decision_trace_id` queda pendiente.
- **Given** ítem que toca dinero o cross-tenant, **When** se intenta, **Then** no auto-autorizable (escala a humano).
- **Check ejecutable:** test de envelope + caso "dinero/cross-tenant → no auto-autorizable" — `[STACK-TUNE] <cmd:test>` filtro `US-6.2.1-itemA`.

---

### `03:US-6.2.1-plan` — Humano decide → plan de ítems

**Goal.** Humano construye plan de ítems + autoriza por ítem; acción síncrona que persiste el plan del workbench; CÓDIGO/UI + HUMAN-gate.

**Context.** Trigger: síncrono, humano convierte hipótesis elegidas en ítems de plan. Entradas: `tenant.AccionSugerida.workbench` (governing_thoughts elegidos). Salida: `AccionSugerida.workbench.plan` + ítems `{tipo: NBA_estructurada|accion_mundo, estado: propuesto|autorizado|hecho}`. Reusar el workbench existente.

**Constraints.** HUMAN decide por ítem. Estados de ítem deterministas. Sin cruzar `tenant_id`. Observabilidad: log de autorización por ítem. Ítem `NBA_estructurada` ⇒ handoff P2/min() (`03:US-6.2.1-itemA`); `accion_mundo` ⇒ humano marca hecho.

**Done-when.**
- **Given** governing_thoughts elegidos, **When** el humano arma el plan, **Then** se persiste `workbench.plan` con ítems en estado correcto.
- **Given** un ítem `NBA_estructurada` autorizado, **When** se autoriza, **Then** dispara handoff a `03:US-6.2.1-itemA`.
- **Check ejecutable:** test de persistencia del plan + transición de estados de ítem — `[STACK-TUNE] <cmd:test>` filtro `US-6.2.1-plan`.

---

### `03:US-6.2.1-tracking` — Registro qué/quién/resultado (2 compuertas)

**Goal.** Registro determinista de qué/quién/resultado que alimenta el valor de dos-compuertas (BR-10); escritura síncrona del record de ejecución.

**Context.** Trigger: síncrono, por ítem marcado hecho / retorno de resultado. Entradas: `tenant.AccionSugerida.workbench` ítems + ref de resultado. Salida: `workbench.resultado` (qué/quién/cuándo); el valor cuenta solo si pasa 2 compuertas (job atribución 2 compuertas + ventana D §14). Reusar el job de atribución existente.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14). El valor cuenta solo si pasa BR-10 (2 compuertas). Apertura/correlación = señal débil, no confirma (surfaced). Sin cruzar `tenant_id`. Observabilidad: log del tracking.

**Done-when.**
- **Given** un ítem hecho con resultado, **When** se registra, **Then** `workbench.resultado` captura qué/quién/cuándo.
- **Given** el valor, **When** se evalúa para North Star, **Then** solo cuenta si pasa las 2 compuertas (no por apertura/correlación).
- **Check ejecutable:** test "pasa 2 compuertas → cuenta / solo apertura → no cuenta" — `[STACK-TUNE] <cmd:test>` filtro `US-6.2.1-tracking`.

---

## SPEC 05A — Atendimiento (piezas CÓDIGO)

### `05A:PASO-A.1.1` — Intake: resolver tenant + crear Conversa_Episodio + turno

**Goal.** Intake determinista: resolver `tenant_id` server-side, crear fila `Conversa_Episodio` + turno; síncrono in-app, sin juicio LLM.

**Context.** Trigger: evento `inbound_recibido` + payload `{canal {whatsapp|email|in_app}, tenant_id (server-side credencial), restaurante_id}`. Entradas: `tenant.Conversa_Episodio` (lookup/create); credencial del canal. Salida: `tenant.Conversa_Episodio {estado_conversa=abierta, canal, conversa_id}` + `.turnos {autor=cliente, tratado_como_dato=true}` (jsonb sub-registro). Reusar el repositorio `Conversa_Episodio`.

**Constraints.** `tenant_id` resuelto server-side (nunca del cliente). `tratado_como_dato=true` en el turno (anti-injection, BR-A2/A4). Idempotencia por `conversa_id`. Sin cruzar `tenant_id`. Observabilidad: log del intake. _Recon `[I]` COL-1 (alta): contrato de capas/episodio — mantener `tenant_id`+`restaurante_id` estampados._

**Done-when.**
- **Given** un `inbound_recibido` con `tenant_id` válido, **When** corre el intake, **Then** existe `Conversa_Episodio` `abierta` con el primer turno `autor=cliente, tratado_como_dato=true`.
- **Given** el mismo inbound repetido, **When** re-corre, **Then** no duplica (idempotente).
- **Check ejecutable:** test de creación + idempotencia + assert "tenant server-side" — `[STACK-TUNE] <cmd:test>` filtro `A.1.1`.

---

### `05A:PASO-A.1.2` — Redacción PII (detect/redact determinista)

**Goal.** Pipeline determinista de detección/redacción PII por clases nombradas, persiste `texto_redactado`; fail-closed, sin LLM judgment-heavy.

**Context.** Trigger: síncrono de A.1.1 (turno crudo presente). Entradas: `Conversa_Episodio.turnos[].texto_crudo` + adjuntos. Salida: `Conversa_Episodio.capa_transcripcion` (jsonb PII redactada) + `turnos[].texto_redactado`. Reusar el redactor PII existente.

**Constraints.** Clases PII nombradas (no heurística libre). Fail-closed: si la redacción falla, no avanza con PII (EC-A14). `tratado_como_dato` preservado. Sin cruzar `tenant_id`. Observabilidad: conteo de redacciones.

**Done-when.**
- **Given** un turno con PII conocida, **When** corre la redacción, **Then** `texto_redactado` no contiene la PII y `capa_transcripcion` queda poblada.
- **Given** fallo de redacción, **When** corre, **Then** fail-closed (no avanza con PII).
- **Check ejecutable:** test con strings PII por clase + assert "no residual" + caso fail-closed — `[STACK-TUNE] <cmd:test>` filtro `A.1.2` y `[STACK-TUNE] <cmd:security>`.

---

### `05A:PASO-A.1.3` — Branch determinista: ¿adjunto contiene imagen?

**Goal.** Ruteo booleano determinista (imagen sí/no) hacia A.1.4 o A.1.5; síncrono, sin LLM.

**Context.** Trigger: síncrono de A.1.2. Entradas: `Conversa_Episodio.turnos[].adjuntos` (jsonb). Salida: decisión de branch (sin persistencia). Reusar el detector de tipo de adjunto existente.

**Constraints.** Determinista. Sin persistencia. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** un adjunto con imagen, **When** corre el branch, **Then** rutea a A.1.4.
- **Given** sin imagen, **When** corre, **Then** rutea a A.1.5.
- **Check ejecutable:** tests de branch (con/sin imagen) — `[STACK-TUNE] <cmd:test>` filtro `A.1.3`.

---

### `05A:PASO-A.1.6` — Sellado del turno + provenance + esfuerzo_cliente

**Goal.** Sellado determinista: consolidar turno, fijar `provenance_por_campo`, incrementar contador `esfuerzo_cliente`; síncrono, sin juicio.

**Context.** Trigger: síncrono de A.1.5. Entradas: `Conversa_Episodio.turnos[].texto_redactado (fenced)` + `señal_inyeccion` + confianza. Salida: `Conversa_Episodio.turnos (sealed)` + `provenance_por_campo` + incremento de `esfuerzo_cliente` (`capa_metricas.esfuerzo_cliente` o `no_instrumentado`, count()). Reusar el contador de esfuerzo existente.

**Constraints.** `esfuerzo_cliente` COMPUTED-at-run vía count() (§14, BR-A15/A16). `provenance_por_campo` poblada. Texto del cliente sigue siendo dato (fenced). Sin cruzar `tenant_id`. Observabilidad: log del sellado.

**Done-when.**
- **Given** un turno con `texto_redactado` fenced + señal, **When** corre el sellado, **Then** el turno queda sealed con `provenance_por_campo` y `esfuerzo_cliente` incrementado.
- **Check ejecutable:** test de sellado + assert "esfuerzo_cliente count() correcto" — `[STACK-TUNE] <cmd:test>` filtro `A.1.6`.

---

### `05A:PASO-A.2.0` — Resolver tier + scope_de_acceso (allowlist RLS)

**Goal.** Resolución determinista de tier de tenant + construcción de `scope_de_acceso` (allowlist RLS); síncrono, sin LLM.

**Context.** Trigger: síncrono de A.1.6. Entradas: `Conversa_Episodio.tenant_id`, `.restaurante_id`; `gov.Politica_Tier.teto_tier` (`Restaurante.tier_base → Politica_Tier.tier_id`). Salida: `scope_de_acceso` + `teto_tier` llevado a `CONTEXTO_MONTADO.acceso_filtrado` (pending); sin escritura de entidad. Reusar el resolutor de permisos existente.

**Constraints.** Allowlist (default deny). Sin escritura de entidad. Sin cruzar `tenant_id` (BR-A4). FC-1 degrade si no resuelve (EC-A18). Observabilidad: log de resolución de scope.

**Done-when.**
- **Given** un `restaurante_id` con `tier_base`, **When** corre, **Then** `scope_de_acceso` + `teto_tier` resueltos y listos para `acceso_filtrado`.
- **Given** scope no resoluble, **When** corre, **Then** FC-1 degrade.
- **Check ejecutable:** test "scope ok / no resoluble → FC-1" — `[STACK-TUNE] <cmd:test>` filtro `A.2.0`.

---

### `05A:PASO-A.2.1` — Filtro de acceso (tier allowlist + k-anon)

**Goal.** Filtro de acceso duro (allowlist de tier + predicado k-anon `N ≥ k`); gate RLS/k-anon determinista, síncrono.

**Context.** Trigger: síncrono de A.2.0. Entradas: `scope_de_acceso`; `cohort.Cohort.n_cuentas` (CHECK k-anon `n ≥ k`). Salida: predicado `acceso_filtrado=true` aplicado a todas las lecturas A.2.2-A.2.5; sin entidad nueva. Reusar el predicado k-anon existente.

**Constraints.** `n ≥ k` (k-anon, EC-A4/A18). Allowlist de tier. Fail-closed: FC-1 degrade si no pasa. Sin cruzar `tenant_id`. El predicado aplica a TODAS las lecturas downstream.

**Done-when.**
- **Given** scope con `n ≥ k`, **When** corre, **Then** `acceso_filtrado=true` aplicado downstream.
- **Given** `n < k` o fuera de allowlist, **When** corre, **Then** FC-1 degrade.
- **Check ejecutable:** test "n≥k → filtrado / n<k → FC-1" — `[STACK-TUNE] <cmd:test>` filtro `A.2.1`.

---

### `05A:PASO-A.2.2` — Gate de calidad de grounding (4 booleanos)

**Goal.** Gate determinista de calidad-de-info (4 condiciones: `ttl ≤ TTL`, fuente respondió, payload no-ambiguo, tenant correcto); síncrono.

**Context.** Trigger: síncrono de A.2.1 dentro de `scope_de_acceso`. Entradas: `tenant.Restaurante.fontes_grounding` (Cerebro P7 `historico_ref` + `estado_autoritativo`), filtrado. Salida: `CONTEXTO_MONTADO.grounding_estado {verificado|no_verificable}` + `ttl_ok` bool → `Conversa_Episodio.capa_estructurada.grounding_estado`. Reusar el gate de calidad-de-info existente.

**Constraints.** Los 4 booleanos deben pasar para `verificado`. COMPUTED-at-run / NULL pre-corrida. `ttl` desde config. Sin cruzar `tenant_id` (BR-A1, EC-A2). FC-2 degrade si no pasa.

**Done-when.**
- **Given** las 4 condiciones verdaderas, **When** corre el gate, **Then** `grounding_estado=verificado` y `ttl_ok=true`.
- **Given** cualquier condición falsa, **When** corre, **Then** `no_verificable` ⇒ FC-2 degrade.
- **Check ejecutable:** tabla de verdad de las 4 condiciones en tests — `[STACK-TUNE] <cmd:test>` filtro `A.2.2`.

---

### `05A:PASO-A.2.3` — Resolver política versionada (tenant × intent)

**Goal.** Resolver el set de política versionada por `(tenant × intent)`, sellar `policy_version`, confirmar `teto_tier`; lookup versionado determinista, síncrono.

**Context.** Trigger: síncrono de A.2.2 (intent resuelto). Entradas: `Conversa_Episodio.intent`; `gov.Politica_Tier` (`policy_version`, `teto_tier`, `permitido_hoy`, `regra_cross_tenant`). Salida: `politicas_resueltas` + `Politica_Tier.policy_version` sellada → `capa_estructurada.policy_version` + `CONTEXTO_MONTADO`. Reusar el lookup de política versionada.

**Constraints.** `policy_version` sellada (no inferida después). COMPUTED-at-run. Sin cruzar `tenant_id` (BR-A4, EC-A20). FC-3 degrade si no resuelve.

**Done-when.**
- **Given** `(tenant × intent)` con política vigente, **When** corre, **Then** `politicas_resueltas` + `policy_version` sellada.
- **Given** política no resoluble, **When** corre, **Then** FC-3 degrade.
- **Check ejecutable:** test "resuelve+sella / no resuelve → FC-3" — `[STACK-TUNE] <cmd:test>` filtro `A.2.3`.

---

### `05A:PASO-A.2.4` — Leer cohort/percentil (read-only, n_min + k-anon)

**Goal.** Lectura read-only de cohort/percentil respetando `n_min` + k-anon; lookup de snapshot precomputado, síncrono.

**Context.** Trigger: síncrono de A.2.3. Entradas: `cohort.Pertenencia_Cohort_Snapshot.cohort_id` + `.percentil_en_cohort` (read-only, `n_min_ok`, k-anon `N ≥ k` vía `Cohort.n_cuentas`). Salida: `cohort_id`, `percentil_en_cohort` → `CONTEXTO_MONTADO` (context-only; rama sin-cohort fija null). Reusar el snapshot existente (no recomputa).

**Constraints.** Read-only (no recomputa percentil). Respeta `n_min_ok` + k-anon (BR-A7, BR-A4). Context-only (no dispara tratamiento diferenciado). Sin cruzar `tenant_id`. Rama sin-cohort ⇒ null (no inventa).

**Done-when.**
- **Given** un snapshot con `n_min_ok` y `N ≥ k`, **When** corre, **Then** `cohort_id` + `percentil_en_cohort` en contexto.
- **Given** sin cohort, **When** corre, **Then** null (no fabrica).
- **Check ejecutable:** test "con cohort / sin cohort → null" + assert read-only — `[STACK-TUNE] <cmd:test>` filtro `A.2.4`.

---

### `05A:PASO-A.2.5` — Leer mejor-acción + WHY desde P2

**Goal.** Leer best-action + WHY de P2 (read-only de `NBA_Propuesta`) + cálculo agregado de confianza; lectura síncrona, sin LLM aquí.

**Context.** Trigger: síncrono de A.2.4. Entradas: `cohort.NBA_Propuesta` (`tipo_accion A1-A8|no-act` vía `NBA_Catalogo`, `causa_raiz`, `before_after_esperado [C]`, `pedido_NBA`; `why {raíz, KPI, metodo_atribucion}`). Salida: `nba_recomendada + why` + `CONTEXTO_MONTADO.confianza` float `[C]`. Reusar el lector de `NBA_Propuesta`.

**Constraints.** Read-only. `confianza` COMPUTED-at-run / NULL pre-corrida `[C]` (agregado grounding+policy+nba). `before_after_esperado` es `[C]` (nunca `[V]`). Sin cruzar `tenant_id` (BR-A9, BR-A12). FC-4 degrade-to A.4 con flag de confianza.

**Done-when.**
- **Given** una `NBA_Propuesta` válida, **When** corre, **Then** `nba_recomendada + why` + `confianza [C]` en contexto.
- **Given** sin NBA / confianza baja, **When** corre, **Then** FC-4 degrade con flag.
- **Check ejecutable:** test de lectura + cálculo de confianza esperado por el test + caso FC-4 — `[STACK-TUNE] <cmd:test>` filtro `A.2.5`.

---

### `05A:PASO-A.2.6` — Ensamblar + sellar CONTEXTO_MONTADO

**Goal.** Ensamblar y sellar `CONTEXTO_MONTADO` con `provenance_por_campo`; build de struct determinista, síncrono.

**Context.** Trigger: síncrono de A.2.5. Entradas: todos los campos A.2.1-A.2.5 (filtrados). Salida: `Conversa_Episodio.capa_estructurada` (`causa_hipótesis`, `percentil-solo-contexto`, `policy_version`, `provenance_por_campo`) sellada; `acceso_filtrado=true`; `grounding_estado`. Reusar el ensamblador de contexto existente.

**Constraints.** `provenance_por_campo` completa. COMPUTED-at-run. Causa como HIPÓTESIS (provenance `[I]`). Sin cruzar `tenant_id` (BR-A2, BR-A15). Sellado inmutable post-A.2.

**Done-when.**
- **Given** los campos A.2.1-A.2.5, **When** corre el ensamblado, **Then** `capa_estructurada` sellada con `provenance_por_campo` completa y `acceso_filtrado=true`.
- **Check ejecutable:** test de ensamblado + assert "provenance por campo presente" — `[STACK-TUNE] <cmd:test>` filtro `A.2.6`.

---

### `05A:PASO-A.2.7-degrade` — Degrade-to-human determinista

**Goal.** Degrade-to-human determinista: componer "qué pasó + sugerencia", fijar `estado=escalada`; síncrono, HUMAN-gate, sin LLM core.

**Context.** Trigger: síncrono de FC-1..FC-4 (cualquier ancla faltante). Entradas: `CONTEXTO_MONTADO` parcial + razón de ancla faltante. Salida: `Conversa_Episodio.estado_conversa=escalada`; señal de escalación (qué pasó + sugerencia) a A.7. Reusar el empaquetador de escalación.

**Constraints.** Fail-closed: la escalación nunca dropa (BR-A1, BR-A11, BR-A14). `estado=escalada`. HUMAN-gate downstream. Sin cruzar `tenant_id`. Observabilidad: log de la escalación con razón.

**Done-when.**
- **Given** un FC-x con ancla faltante, **When** corre, **Then** `estado=escalada` + señal "qué pasó + sugerencia" a A.7.
- **Given** timeout, **When** ocurre, **Then** nada se dropa (escala).
- **Check ejecutable:** test "FC-x → escalada + señal" + caso "no dropa" — `[STACK-TUNE] <cmd:test>` filtro `A.2.7-degrade`.

---

### `05A:PASO-A.3.0` — Validar pre-condiciones duras de respuesta

**Goal.** Validar pre-condiciones duras (grounding verificado, `ttl_ok`, `acceso_filtrado`, `nba != null`, policy no stale); gate booleano síncrono.

**Context.** Trigger: síncrono cuando A.2 emitió `CONTEXTO_MONTADO.contexto_id`. Entradas: `CONTEXTO_MONTADO {grounding_estado, ttl_ok, acceso_filtrado, nba_recomendada, policy_version}`; `Conversa_Episodio {intent, policy_version, tono_version, estado_conversa}`. Salida: branch pass/fail; sin persistencia. Reusar el gate de pre-condiciones.

**Constraints.** Todas las condiciones deben pasar. Sin persistencia. Sin cruzar `tenant_id` (BR-A1, BR-A15). Fail ⇒ A.3.7-ESCALA.

**Done-when.**
- **Given** todas las pre-condiciones verdaderas, **When** corre, **Then** branch a A.3.1.
- **Given** cualquiera falsa, **When** corre, **Then** branch a A.3.7-ESCALA.
- **Check ejecutable:** tabla de verdad de pre-condiciones en tests — `[STACK-TUNE] <cmd:test>` filtro `A.3.0`.

---

### `05A:PASO-A.3.6-check` — Gate determinista post-crítica

**Goal.** Leaf split CÓDIGO: CHECK determinista que marca pass/fail (scan de no-exposición, bloqueo de efecto financiero, retry acotado) y rutea; síncrono + HUMAN-gate en fail financiero.

**Context.** Trigger: síncrono del veredicto de A.3.6-critique. Entradas: items del veredicto de auto-crítica (exposición/tono/dato/financiero). Salida: respuesta-coach validada → A.4 (en pass); fail de efecto financiero → A.3.7-ESCALA `eje=efecto` (sin retry); otros fail → retry acotado luego `eje=auto_flag`. Reusar el gate de validación existente.

**Constraints.** Efecto financiero ⇒ escala sin retry (BR-A3, hard-no financiero). Retry acotado (no infinito, EC-A8). Scan de no-exposición. Sin cruzar `tenant_id` (BR-A6, BR-A17). Observabilidad: log del veredicto y ruta.

**Done-when.**
- **Given** veredicto pass, **When** corre, **Then** respuesta validada → A.4.
- **Given** fail de efecto financiero, **When** corre, **Then** A.3.7-ESCALA `eje=efecto` sin retry.
- **Given** otro fail, **When** corre, **Then** retry acotado luego `eje=auto_flag`.
- **Check ejecutable:** tests por cada ruta (pass / financiero / otro) + assert "retry acotado" — `[STACK-TUNE] <cmd:test>` filtro `A.3.6-check`.

---

### `05A:PASO-A.3.7-ESCALA` — Empaquetar escalación + Decision_Trace(alto)

**Goal.** Empaquetar "qué pasó + sugerencia" + registrar `Decision_Trace(alto)`; write de trace determinista + `estado=escalada`, síncrono.

**Context.** Trigger: síncrono de A.3.0/A.3.1/A.3.2/A.3.4/A.3.6 fail. Entradas: borrador parcial + motivo + `eje_escalacion` (confianza/efecto/auto_flag/none). Salida: `gov.Decision_Trace` (`accion`, `eje_escalacion`, `nivel_efectivo_aplicado=alto`, `gate_result` COMPUTED-at-run NULL pre-corrida); `Conversa_Episodio.estado_conversa=escalada`. Reusar el escritor de `Decision_Trace`. _Recon `[I]` COL-8 (alta): forma de `Decision_Trace`._

**Constraints.** `gate_result` COMPUTED-at-run / NULL pre-corrida (§14). Nada dropa por timeout (BR-A11/A12). `nivel_efectivo_aplicado=alto`. Sin cruzar `tenant_id` (BR-A3, BR-A15). Observabilidad: trace firmado.

**Done-when.**
- **Given** un fail con `eje_escalacion`, **When** corre, **Then** `Decision_Trace(alto)` escrito y `estado=escalada`.
- **Given** timeout, **When** ocurre, **Then** nada se dropa.
- **Check ejecutable:** test de escritura de trace + assert "estado=escalada, nivel=alto" — `[STACK-TUNE] <cmd:test>` filtro `A.3.7-ESCALA`.

---

### `05A:PASO-A.4.1` — Cargar + normalizar 3 brazos de autonomía

**Goal.** Cargar y normalizar a bandas los 3 brazos (`pedido_NBA`, `liberado_evals`, `teto_tier`); ausencia = más-conservador; determinista, síncrono.

**Context.** Trigger: síncrono del candidato respuesta-coach de A.3. Entradas: `NBA_Propuesta.pedido_NBA`; `cohort.Eval_Cell.liberado_evals` (celda `cohort_id × intent`, ausencia=no-verde); `gov.Politica_Tier.teto_tier`; `CONTEXTO_MONTADO` grounding/confianza. Salida: `tripleta_normalizada` → `gov.Decision_Trace.calculo_id` par `(pedido_NBA, liberado_evals, teto_tier)`. Reusar el normalizador de bandas.

**Constraints.** Ausencia ⇒ más-conservador (BR-A5). Determinista. Sin cruzar `tenant_id`. Observabilidad: log de la tripleta.

**Done-when.**
- **Given** los 3 brazos presentes, **When** corre, **Then** `tripleta_normalizada` a bandas.
- **Given** `liberado_evals` ausente, **When** corre, **Then** se normaliza a no-verde (conservador).
- **Check ejecutable:** tests de normalización + caso "ausencia → conservador" — `[STACK-TUNE] <cmd:test>` filtro `A.4.1`.

---

### `05A:PASO-A.4.2` — Gate de pre-condición de grounding

**Goal.** Gate booleano duro (verificado AND `ttl_ok` AND `acceso_filtrado`); síncrono.

**Context.** Trigger: síncrono de A.4.1. Entradas: `CONTEXTO_MONTADO grounding_estado, ttl_ok, acceso_filtrado`. Salida: `gov.Decision_Trace.eje_escalacion=confianza` (si NO). Reusar el gate de grounding.

**Constraints.** AND de las 3 condiciones (BR-A1, BR-A4). Sin cruzar `tenant_id`. NO ⇒ A.4.9.

**Done-when.**
- **Given** las 3 verdaderas, **When** corre, **Then** branch a A.4.3.
- **Given** cualquiera falsa, **When** corre, **Then** `eje_escalacion=confianza` ⇒ A.4.9.
- **Check ejecutable:** tabla de verdad en tests — `[STACK-TUNE] <cmd:test>` filtro `A.4.2`.

---

### `05A:PASO-A.4.4` — Comparar confianza vs piso

**Goal.** Comparar `confianza` vs `piso [C:0.7]` + branch de dato-preguntable; threshold compare determinista, síncrono.

**Context.** Trigger: síncrono de A.4.3. Entradas: `CONTEXTO_MONTADO.confianza` float; `dato_faltante_preguntable` flag de A.3; `piso_confianza [C:0.7]`. Salida: `gov.Decision_Trace.eje_escalacion=confianza` (si non-resoluble). Reusar el comparador de umbral.

**Constraints.** `piso` desde config (`[C:0.7]`, no hard-codeado). Determinista. Sin cruzar `tenant_id` (BR-A12). Branch: `≥ piso` → A.4.5; one-question → FIN4-B; `< piso` non-resoluble → A.4.9.

**Done-when.**
- **Given** `confianza ≥ piso`, **When** corre, **Then** branch a A.4.5.
- **Given** `< piso` con dato preguntable, **When** corre, **Then** FIN4-B one-question.
- **Given** `< piso` non-resoluble, **When** corre, **Then** A.4.9.
- **Check ejecutable:** tests de las 3 ramas con piso inyectado — `[STACK-TUNE] <cmd:test>` filtro `A.4.4`.

---

### `05A:PASO-A.4.6` — nivel_efectivo = min(pedido_nba, liberado_evals, teto_tier)

**Goal.** `nivel_efectivo = least()` sobre ENUM ordenado, determinista; financiero nunca autónomo; golden #3.

**Context.** Trigger: síncrono de A.4.5 (sin eje disparado). Entradas: `tripleta_normalizada` de A.4.1 (`gov.min_calculo`: `pedido_NBA`, `liberado_evals`, `teto_tier`). Salida: `gov.min_calculo.nivel_efectivo = least(pedido_NBA, liberado_evals, teto_tier)` + `auto_liberable` (motor `least()`, NUNCA sembrado). Reusar el motor `least()` registrado. _Recon `[I]` COL-2 (alta): contrato de `min_calculo`._

**Constraints.** COMPUTED-at-run / NULL pre-corrida, **NUNCA sembrado** (§14). `nivel_efectivo = least(...)` exacto. Financiero ⇒ ALTO (no autónomo). Sin cruzar `tenant_id` (BR-A5). Observabilidad: trace del cálculo.

**Done-when.**
- **Given** la tripleta, **When** corre, **Then** `nivel_efectivo == least(inputs)` exacto.
- **Given** `nivel_efectivo=bajo`, **When** corre, **Then** branch a A.4.7; `alto` ⇒ A.4.9.
- **Check ejecutable:** property test "nivel_efectivo == least(inputs)" sobre ENUM ordenado — `[STACK-TUNE] <cmd:test>` filtro `A.4.6`.

---

### `05A:PASO-A.4.7` — Presión de tiempo → prioridad_cola (nunca tier)

**Goal.** La presión de tiempo solo fija `prioridad_cola`, nunca el tier; cálculo de prioridad determinista, síncrono.

**Context.** Trigger: síncrono de A.4.6 (bajo). Entradas: señal pico/carga (wait time, SLA `Z [C]`, queue depth) del monitor. Salida: `prioridad_cola {alta|normal}`; tier/`nivel_efectivo` sin cambios. Reusar el calculador de prioridad de cola.

**Constraints.** **Nunca** toca tier/`nivel_efectivo` (BR-A13, BR-A16). Determinista. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** señal de pico, **When** corre, **Then** `prioridad_cola=alta` y `nivel_efectivo` inalterado.
- **Check ejecutable:** test "pico → prioridad cambia, tier inalterado" — `[STACK-TUNE] <cmd:test>` filtro `A.4.7`.

---

### `05A:PASO-A.4.8` — Sellar banda BAJO → Decision_Trace(bajo)

**Goal.** Sellar la banda BAJO → `Decision_Trace(bajo)` + rutear a ejecución; write de trace determinista, síncrono.

**Context.** Trigger: síncrono de A.4.7. Entradas: `nivel_efectivo=bajo`, `policy_version`, `tono_version`, `prioridad_cola`. Salida: `gov.Decision_Trace (par, nivel_efectivo_aplicado=bajo, eje_escalacion=none, gate_result COMPUTED-at-run NULL pre-corrida)`; `Conversa_Episodio.estado_conversa=abierta`. Reusar el escritor de trace. _Recon `[I]` COL-8 (alta)._

**Constraints.** `gate_result` COMPUTED-at-run / NULL pre-corrida (§14). `nivel_efectivo_aplicado=bajo`. Sin cruzar `tenant_id` (BR-A9). Observabilidad: trace.

**Done-when.**
- **Given** banda bajo, **When** corre, **Then** `Decision_Trace(bajo)` sellado y branch a A.5.
- **Check ejecutable:** test de sellado de trace bajo — `[STACK-TUNE] <cmd:test>` filtro `A.4.8`.

---

### `05A:PASO-A.4.9` — Empaquetar escalación ALTO + Decision_Trace(alto)

**Goal.** Ensamblar paquete de escalación ALTO + `Decision_Trace(alto)`; write de trace + `estado=escalada`, síncrono; HUMAN-gate downstream.

**Context.** Trigger: síncrono de A.4.2/A.4.3/A.4.4/A.4.5/A.4.6 fail. Entradas: `eje_escalacion`, `confianza`, `par`, respuesta-coach candidata (sugerencia). Salida: `gov.Decision_Trace (nivel_efectivo_aplicado=alto, eje_escalacion, gate_result COMPUTED-at-run NULL pre-corrida)`; `Conversa_Episodio.estado_conversa=escalada`, `lock_posesion=null`. Reusar el escritor de trace.

**Constraints.** `gate_result` COMPUTED-at-run / NULL pre-corrida. La sugerencia NO se envía al cliente. Sin cruzar `tenant_id` (BR-A11, BR-A3, BR-A1). Observabilidad: trace alto.

**Done-when.**
- **Given** un fail de A.4.x, **When** corre, **Then** `Decision_Trace(alto)` + `estado=escalada` + `lock_posesion=null` y la sugerencia no se envía.
- **Check ejecutable:** test "fail → trace alto + escalada + sugerencia no enviada" — `[STACK-TUNE] <cmd:test>` filtro `A.4.9`.

---
### `05A:PASO-A.5.0` — Consumir nivel_efectivo (no recomputa min)

**Goal.** Consumir `nivel_efectivo` (NO recomputa min); gate de ruteo `bajo → ejecuta` else exit; síncrono.

**Context.** Trigger: síncrono de `A.4 Decision_Trace.nivel_efectivo`. Entradas: `gov.Decision_Trace.nivel_efectivo_aplicado`; `gov.min_calculo` par. Salida: branch A.5.1 (bajo) o FIN5b (alto/illegible → tratar como alto). Reusar el lector de `Decision_Trace`.

**Constraints.** **No** recomputa min (consume). Illegible ⇒ tratar como alto (fail-closed). Sin cruzar `tenant_id` (BR-A5, BR-A9).

**Done-when.**
- **Given** `nivel_efectivo=bajo`, **When** corre, **Then** branch a A.5.1.
- **Given** alto o illegible, **When** corre, **Then** FIN5b (a A.7).
- **Check ejecutable:** tests "bajo → ejecuta / alto/illegible → exit" — `[STACK-TUNE] <cmd:test>` filtro `A.5.0`.

---

### `05A:PASO-A.5.1` — Originar pedido_ejecucion (idempotency_key)

**Goal.** Originar `pedido_ejecucion` (build payload + `idempotency_key` + sellar policy/tono version); determinista, A no ejecuta; síncrono.

**Context.** Trigger: síncrono de A.5.0 (bajo). Entradas: `Conversa_Episodio.conversa_id/tenant_id/restaurante_id`; `NBA_Propuesta (A1-A8)`; `Politica_Tier.policy_version`. Salida: `pedido_ejecucion {accion, policy_version, idempotency_key=hash(...)}` → substrato P2. Reusar el constructor de pedido.

**Constraints.** `idempotency_key=hash(...)` determinista. A no ejecuta (solo origina). Versiones selladas (BR-A9, BR-A15). Sin cruzar `tenant_id`. Degrade a A.7 si ancla stale.

**Done-when.**
- **Given** contexto bajo, **When** corre, **Then** `pedido_ejecucion` con `idempotency_key` estable y versiones selladas.
- **Given** ancla stale, **When** corre, **Then** degrade a A.7.
- **Check ejecutable:** test "idempotency_key estable para misma entrada" + caso stale — `[STACK-TUNE] <cmd:test>` filtro `A.5.1`.

---

### `05A:PASO-A.5.2` — Adquirir lock idempotente + handoff a P2

**Goal.** Adquirir lock idempotente + handoff autónomo a P2 (`lock_posesion` queda null en BAJO); lógica de lock determinista, síncrono sin cuello de botella.

**Context.** Trigger: síncrono de A.5.1. Entradas: `pedido_ejecucion.idempotency_key`; `Conversa_Episodio.lock_posesion`. Salida: lock adquirido (TTL `lock_TTL [C]`); `pedido_ejecucion` (con lock) → P2. Reusar el gestor de locks idempotentes.

**Constraints.** Lock con TTL desde config. `lock_posesion=null` en BAJO (BR-A9, BR-A10). Idempotente (key usado → leer existente). Sin cruzar `tenant_id`. Contención ⇒ A.7.

**Done-when.**
- **Given** lock nuevo, **When** corre, **Then** lock adquirido y branch a A.5.3.
- **Given** key ya usado, **When** corre, **Then** lee existente (A.5.5).
- **Given** contención, **When** corre, **Then** A.7.
- **Check ejecutable:** tests "lock nuevo / key usado / contención" — `[STACK-TUNE] <cmd:test>` filtro `A.5.2`.

---

### `05A:PASO-A.5.3` — P2 ejecuta bajo min() (re-check financiero)

**Goal.** P2 ejecuta bajo min(): re-check financiero-por-efecto + re-aplicar `least()` en el borde de ejecución; freno determinista, financiero nunca autónomo; síncrono.

**Context.** Trigger: síncrono de A.5.2. Entradas: `pedido_ejecucion`; `gov.Decision_Trace.nivel_efectivo=bajo`; `gov.min_calculo` re-check `least()`. Salida: `resultado_ejecucion_p2 {ok|rechazo|requiere_humano}`; financiero/min→alto ⇒ abort autónomo. Reusar el motor `least()` en el borde.

**Constraints.** Re-aplica `least()` en el borde (no confía en el cálculo previo). Financiero-por-efecto ⇒ abort autónomo (BR-A3, hard-no). Sin cruzar `tenant_id` (BR-A9). Observabilidad: log del resultado.

**Done-when.**
- **Given** acción bajo confirmada no-financiera, **When** corre, **Then** `resultado_ejecucion_p2=ok`.
- **Given** efecto financiero / min→alto en el borde, **When** corre, **Then** abort autónomo → A.7.
- **Check ejecutable:** test "ok / efecto financiero → abort" + assert "re-aplica least()" — `[STACK-TUNE] <cmd:test>` filtro `A.5.3`.

---

### `05A:PASO-A.5.4` — Read-back desde fuente independiente

**Goal.** Read-back desde fuente INDEPENDIENTE + gate de calidad-de-info (observado vs esperado); verificación determinista, síncrono.

**Context.** Trigger: síncrono de A.5.3 (ok). Entradas: `id_restaurante`, acción ejecutada; fuente autoritativa independiente (`Restaurante.fontes_grounding`, NO config recién-escrito). Salida: `gov.Decision_Trace` read-back resultado (motivo) COMPUTED-at-run / NULL pre-corrida. Reusar el gate de read-back.

**Constraints.** Fuente **independiente** (no la config recién escrita, BR-A10, BR-A1, EC-A1). COMPUTED-at-run. Sin cruzar `tenant_id`. Divergencia ⇒ A.5.6 degrade.

**Done-when.**
- **Given** read-back que confirma, **When** corre, **Then** branch a A.5.5.
- **Given** divergencia, **When** corre, **Then** A.5.6 degrade.
- **Check ejecutable:** test "confirma → A.5.5 / diverge → A.5.6" + assert "fuente independiente" — `[STACK-TUNE] <cmd:test>` filtro `A.5.4`.

---

### `05A:PASO-A.5.5` — Sellar estado=live_aguardando_permanencia

**Goal.** Sellar `estado=live_aguardando_permanencia` (nunca resuelto) + `Decision_Trace`; write de estado determinista, síncrono.

**Context.** Trigger: síncrono de A.5.4 (read_back ok). Entradas: read_back resultado=ok. Salida: `Conversa_Episodio.estado_conversa=live_aguardando_permanencia` (RESULTADO §14 cae del flujo); `gov.Decision_Trace` sellado (cierre = P3, no la conversa). Reusar el escritor de estado. _Recon `[I]` COL-11 y COL-25 (alta): estado nunca "resuelto", cierre en P3._

**Constraints.** **Nunca** marca `resuelto` (cierre = P3, BR-A10, BR-A16). `estado` RESULTADO §14 (cae del flujo, no sembrado). Sin cruzar `tenant_id`. Dispara A.6 + P7 write-back.

**Done-when.**
- **Given** read_back ok, **When** corre, **Then** `estado=live_aguardando_permanencia` y trace sellado; nunca `resuelto`.
- **Check ejecutable:** test "sella live_aguardando_permanencia, no resuelto" — `[STACK-TUNE] <cmd:test>` filtro `A.5.5`.

---

### `05A:PASO-A.5.6` — Degrade-to-human (read-back no confirmable)

**Goal.** Degrade-to-human ante read-back no confirmable: no afirma estado, empaqueta "qué pasó + sugerencia", `Decision_Trace(alto degradado)`; determinista, HUMAN-gate; síncrono.

**Context.** Trigger: síncrono de A.5.4 (read_back no confirmado). Entradas: read_back resultado=no_confirmado. Salida: `gov.Decision_Trace (nivel_efectivo_aplicado=alto, eje_escalacion=confianza, motivo=read_back_no_confirmado)`; `idempotency_key` mantenido vivo. Reusar el empaquetador de degrade.

**Constraints.** No afirma estado (no inventa éxito). `idempotency_key` vivo (para retry humano). Escala nunca dropa (BR-A1, BR-A11, BR-A14). Sin cruzar `tenant_id`. Observabilidad: trace.

**Done-when.**
- **Given** read_back no confirmado, **When** corre, **Then** `Decision_Trace(alto)` con `motivo=read_back_no_confirmado` y `idempotency_key` vivo, sin afirmar estado.
- **Check ejecutable:** test "no confirmado → trace alto + key vivo + no afirma" — `[STACK-TUNE] <cmd:test>` filtro `A.5.6`.

---

### `05A:PASO-A.6.1` — Sellar versión policy/tono + freeze traces

**Goal.** Sellar policy/tono version + freeze traces, chequear stale/divergente; version check determinista; nodo CÓDIGO dentro de A.6.

**Context.** Trigger: nodo del contenedor A.6. Entradas: `Conversa_Episodio.policy_version/tono_version/intent`; `gov.Decision_Trace[*]`. Salida: `version_sellada_ok`; `capa_estructurada.policy_version='ANCLA_AUSENTE'` + provenance `[I-degradado]` si stale (episodio aún emitido, flagged). Reusar el verificador de versiones.

**Constraints.** Stale ⇒ `ANCLA_AUSENTE` + `[I-degradado]` (episodio emitido igual, no dropado, EC-A20). Sin cruzar `tenant_id` (BR-A15). Observabilidad: aviso S8.

**Done-when.**
- **Given** versiones vigentes, **When** corre, **Then** `version_sellada_ok`.
- **Given** versión stale, **When** corre, **Then** `ANCLA_AUSENTE` + `[I-degradado]`, episodio aún emitido.
- **Check ejecutable:** tests "vigente → ok / stale → ANCLA_AUSENTE flagged" — `[STACK-TUNE] <cmd:test>` filtro `A.6.1`.

---

### `05A:PASO-A.6.2` — Capa de transcripción redactada (2da pasada PII)

**Goal.** Construir capa de transcripción redactada (2da pasada PII + retención limitada); redacción determinista; nodo CÓDIGO.

**Context.** Trigger: nodo de A.6.1. Entradas: `Conversa_Episodio.turnos[].texto_redactado/autor/ts/tratado_como_dato`. Salida: `Conversa_Episodio.capa_transcripcion` (redactada, `retencion_limitada` vía `Config_Perillas.retencion_PII`). Reusar el redactor PII (segunda pasada).

**Constraints.** 2da pasada PII (defensa en profundidad, BR-A2, EC-A14). Retención limitada desde config. Sin cruzar `tenant_id` (BR-A15). PII residual ⇒ flag a S8.

**Done-when.**
- **Given** turnos redactados, **When** corre, **Then** `capa_transcripcion` con retención limitada y sin PII residual.
- **Given** PII residual detectada, **When** corre, **Then** flag a S8.
- **Check ejecutable:** test "2da pasada sin residual" + caso "residual → flag" — `[STACK-TUNE] <cmd:test>` filtro `A.6.2` y `[STACK-TUNE] <cmd:security>`.

---

### `05A:PASO-A.6.3` — Capa estructurada + stamp tenant/restaurante (k-anon con B)

**Goal.** Construir capa estructurada con incertidumbre + estampar `tenant_id/restaurante_id` (contrato k-anon con B); populate de struct determinista; nodo CÓDIGO.

**Context.** Trigger: nodo de A.6.2. Entradas: `CONTEXTO_MONTADO.causa_hipótesis/confianza [C]/cohort/percentil/nba`; resultado A.4/A.5 (absorbido|escalado); `Conversa_Episodio.tenant_id/restaurante_id`. Salida: `Conversa_Episodio.capa_estructurada` (`tenant_id`, `restaurante_id` estampados, causa como HIPÓTESIS provenance `[I]`, `nba_usada`, `resultado`, `provenance_por_campo`). Reusar el populate de capa estructurada. _Recon `[I]` COL-1 (alta)._

**Constraints.** Causa como HIPÓTESIS provenance `[I]` (nunca afirmada). `tenant_id`+`restaurante_id` estampados (scope key para 05B). Sin cruzar `tenant_id` (BR-A15, BR-A7). Observabilidad: provenance por campo.

**Done-when.**
- **Given** contexto + resultado, **When** corre, **Then** `capa_estructurada` con causa `[I]` y `tenant_id`+`restaurante_id` estampados.
- **Check ejecutable:** test de populate + assert "causa provenance=[I], stamps presentes" — `[STACK-TUNE] <cmd:test>` filtro `A.6.3`.

---

### `05A:PASO-A.6.4` — Computar esfuerzo_cliente + detector deflection-mala

**Goal.** Computar `esfuerzo_cliente` (count de interacciones) + detector deflection-mala; count()/rule determinista; nodo CÓDIGO.

**Context.** Trigger: nodo de A.6.3. Entradas: `Conversa_Episodio.turnos[]` (count por autor); `estado_conversa`; historial de re-contacto de `Restaurante.fontes_grounding` (P7). Salida: `Conversa_Episodio.capa_metricas {n_turnos, n_re_contactos, esfuerzo_cliente, absorbido|escalado, snowball, csat}` COMPUTED-at-run (count()/derivado §14 fail-closed). Reusar el contador de métricas. _Recon `[I]` COL-6 (alta)._

**Constraints.** COMPUTED-at-run / NULL pre-corrida vía count() (§14 fail-closed). Detector deflection-mala determinista. Sin cruzar `tenant_id` (BR-A16). Deflection_mala ⇒ A.6.7.

**Done-when.**
- **Given** turnos + estado, **When** corre, **Then** `capa_metricas` con `esfuerzo_cliente` = count correcto.
- **Given** deflection-mala detectada, **When** corre, **Then** branch a A.6.7.
- **Check ejecutable:** test "esfuerzo_cliente count() correcto" + caso deflection-mala — `[STACK-TUNE] <cmd:test>` filtro `A.6.4`.

---

### `05A:PASO-A.6.5` — Asignar episodio_id + upsert write-back a P7

**Goal.** Asignar `episodio_id` idempotente + upsert write-back a P7 (anti-doble-conteo); upsert idempotente determinista; nodo CÓDIGO.

**Context.** Trigger: nodo de A.6.4. Entradas: `SINAL_EPISODIO (3 capas)`; `Conversa_Episodio.conversa_id/episodio_id`. Salida: write-back episodio (3 capas) → `Restaurante.fontes_grounding` (P7) keyed by `episodio_id` (idempotente, sin duplicado). Reusar el upsert idempotente.

**Constraints.** Idempotente por `episodio_id` (anti-doble-conteo, BR-A15). Sin cruzar `tenant_id`. Fallo ⇒ outbox + flag S8. Observabilidad: log del write-back.

**Done-when.**
- **Given** un episodio, **When** corre, **Then** write-back a P7 keyed by `episodio_id` sin duplicar.
- **Given** el mismo episodio repetido, **When** re-corre, **Then** no duplica.
- **Given** fallo de write, **When** ocurre, **Then** outbox + flag S8.
- **Check ejecutable:** property test de idempotencia del upsert + caso fallo→outbox — `[STACK-TUNE] <cmd:test>` filtro `A.6.5`.

---

### `05A:PASO-A.6.6` — Actualizar contador 1:10 + fan-out a B/C/D+E

**Goal.** Actualizar contador 1:10 (X absorbido provisional / Y escalado / N%) + fan-out a B/C/D+E; count + emit determinista; nodo CÓDIGO; `Salud_1a10` es vista read-only (derivar, no sembrar).

**Context.** Trigger: nodo de A.6.5. Entradas: episodio persistido (absorbido|escalado); contadores históricos de P7; `Conversa_Episodio.capa_metricas`. Salida: `contador {X_absorbido_provisional, Y_escalado, N_pct [C]}` COMPUTED-at-run (vista derivada `Salud_1a10` / `ROI_Operador.ratio_1_10` §14, NUNCA fixture); crédito final = P3. Reusar la vista `Salud_1a10`. _Recon `[I]` COL-6 (alta)._

**Constraints.** COMPUTED-at-run / NULL pre-corrida, **NUNCA fixture** (§14). Crédito final = P3 (aquí provisional). Fan-out con `tenant_id`+`restaurante_id` estampados. Sin cruzar `tenant_id` (BR-A16, BR-A10). Observabilidad: log del fan-out.

**Done-when.**
- **Given** un episodio persistido, **When** corre, **Then** contador 1:10 actualizado (provisional) y fan-out señal-episodio a 05B/05C/05DE estampado.
- **Given** estado pre-corrida, **When** se lee el contador, **Then** derivado (no fixture).
- **Check ejecutable:** test "contador derivado correcto + fan-out estampado" — `[STACK-TUNE] <cmd:test>` filtro `A.6.6`.

---

### `05A:PASO-A.6.7` — Emitir señal de gobernanza a S8

**Goal.** Emitir señal de gobernanza (deflection-mala/anomalía/baja-confianza) a batch S8 sin volcar trabajo; packaging determinista; nodo CÓDIGO.

**Context.** Trigger: nodo de A.6.4 (deflection_mala). Entradas: `deflection_mala`, `confianza < piso [C:0.7]`, `pii_residual`, `version=ANCLA_AUSENTE`, `snowball`. Salida: señal de gobernanza → A.7/S8 (RLHF-router/tono-lote/comunicado); flag persistida en `capa_estructurada` si el envío S8 falla. Reusar el empaquetador de señales.

**Constraints.** No vuelca trabajo (solo señal). Fallo de envío ⇒ flag persistida (no se pierde, BR-A16, BR-A14). Sin cruzar `tenant_id`. Observabilidad: log de la señal.

**Done-when.**
- **Given** deflection-mala / baja-confianza, **When** corre, **Then** señal de gobernanza a S8 y vuelta a A.6.5 para sellar.
- **Given** fallo de envío S8, **When** ocurre, **Then** flag persistida en `capa_estructurada`.
- **Check ejecutable:** test "emite señal + caso fallo→flag persistida" — `[STACK-TUNE] <cmd:test>` filtro `A.6.7`.

---

### `05A:PASO-A.7.1` — Build PAQUETE_ESCALACION (provenance per field)

**Goal.** Construir `PAQUETE_ESCALACION` (qué pasó + sugerencia, provenance por campo); packaging determinista del trace existente; nodo CÓDIGO.

**Context.** Trigger: nodo del contenedor A.7 (eje alto). Entradas: `gov.Decision_Trace {eje_escalacion, motivo}`; `CONTEXTO_MONTADO {nba_recomendada+why, confianza, grounding_estado, politicas}`; `Conversa_Episodio {intent, policy_version, tono_version}` + `turnos[].texto_redactado`. Salida: `PAQUETE_ESCALACION` (derivado de `Decision_Trace`; `provenance_por_campo`) → cola gov priorizada por A.4 cola (no por presión de tiempo). Reusar el empaquetador de escalación.

**Constraints.** Derivado del trace (no re-deriva decisiones). `provenance_por_campo`. Priorización por cola A.4, no por tiempo (BR-A13). Sin cruzar `tenant_id` (BR-A11, BR-A6). `eje=estado` ⇒ A.7.6.

**Done-when.**
- **Given** un trace con `eje` alto, **When** corre, **Then** `PAQUETE_ESCALACION` con `provenance_por_campo` a la cola gov.
- **Given** `eje=estado`, **When** corre, **Then** branch a A.7.6.
- **Check ejecutable:** test de build del paquete + assert "priorizado por cola A.4" — `[STACK-TUNE] <cmd:test>` filtro `A.7.1`.

---

### `05A:PASO-A.7.4-route` — Rutear corrección etiquetada al artefacto

**Goal.** Leaf split: ruteo determinista de la corrección etiquetada al destino-artefacto + versionarlo; ambiguo ⇒ bandeja sin-clasificar; nodo CÓDIGO.

**Context.** Trigger: nodo del label de A.7.4-router. Entradas: tipo label + `delta-sugerido`. Salida: artefacto versionado: `cohort.Eval_Cell` (golden-set, hecho) | `gov.Politica_Tier` borrador (política) | doc-tono (tono) | formato plantilla; fine-tuning batch encolado (no por-corrección). Reusar el ruteador de artefactos.

**Constraints.** Ruteo determinista por tipo (BR-A17, BR-A4, BR-A5). Ambiguo ⇒ bandeja sin-clasificar (no fuerza). Fine-tuning batch (no por-corrección). Sin cruzar `tenant_id`. Observabilidad: log del ruteo.

**Done-when.**
- **Given** una corrección con tipo `hecho`, **When** corre, **Then** versiona `Eval_Cell`.
- **Given** tipo `política`, **When** corre, **Then** versiona `Politica_Tier` borrador.
- **Given** ambiguo, **When** corre, **Then** bandeja sin-clasificar.
- **Check ejecutable:** tests por cada destino + caso ambiguo — `[STACK-TUNE] <cmd:test>` filtro `A.7.4-route`.

---

### `05A:PASO-A.7.4b` — Anti-rubber-stamp (confirmador independiente)

**Goal.** Anti-rubber-stamp: exigir confirmador independiente (`≠ proponente`), bridging, alarma rechazo→0; check 4-ojos determinista; nodo CÓDIGO + HUMAN-gate.

**Context.** Trigger: nodo de A.7.4-route. Entradas: artefacto-propuesto + `proponente_id` (`gov.Usuario`). Salida: `gov.Decision_Trace.confirmador_id` (`≠ proponente`, `independencia_garantida` GENERATED); artefacto `{PROMOVIDO|RETENIDO}` + `tasa_rechazo`/`bridging_score` COMPUTED-at-run; alarma si rechazo→0. Reusar la columna GENERATED de independencia.

**Constraints.** `confirmador_id ≠ proponente` (BR-A17, EC-A7). `independencia_garantida` GENERATED. Rechazo→0 ⇒ alarma (rubber-stamp). COMPUTED-at-run / NULL pre-corrida. Sin cruzar `tenant_id`. Observabilidad: alarma a gobernanza.

**Done-when.**
- **Given** confirmador `≠ proponente`, **When** corre, **Then** artefacto PROMOVIDO con `independencia_garantida=true`.
- **Given** confirmador `= proponente`, **When** corre, **Then** RETENIDO.
- **Given** tasa rechazo→0, **When** corre, **Then** alarma.
- **Check ejecutable:** tests "independiente → promovido / mismo → retenido / rechazo→0 → alarma" — `[STACK-TUNE] <cmd:test>` filtro `A.7.4b`.

---

### `05A:PASO-A.7.7` — Sellar gobernanza + write-back de aprendizaje

**Goal.** Sellar gobernanza + write-back de aprendizaje (update provenance, incrementar 1:10, sellar versiones, nunca marcar resuelto); seal + upsert idempotente determinista; nodo CÓDIGO.

**Context.** Trigger: nodo de A.7.4b/A.7.5/A.7.6. Entradas: veredictos A.7.2/A.7.3 + artefactos-promovidos A.7.4b + comunicados A.7.5 + decisiones-crisis A.7.6. Salida: `Conversa_Episodio.capa_estructurada.provenance_por_campo` actualizada; contador 1:10 (`ROI_Operador.ratio_1_10` §14) COMPUTED-at-run; write-back a `Restaurante.fontes_grounding` (P7) keyed by `episodio_id`; artefactos versionados. Reusar el sellador idempotente.

**Constraints.** **Nunca** marca resuelto (cierre = P3, BR-A15, BR-A10, BR-A16). Contador 1:10 COMPUTED-at-run (§14). Idempotente por `episodio_id`. Sin cruzar `tenant_id`. Nada dropado. Observabilidad: fan-out a 05B/05C/05DE.

**Done-when.**
- **Given** veredictos + artefactos, **When** corre, **Then** provenance actualizada, 1:10 incrementado, versiones selladas, write-back idempotente; nunca resuelto.
- **Check ejecutable:** test "sella + write-back idempotente + no resuelto" — `[STACK-TUNE] <cmd:test>` filtro `A.7.7`.

---

## SPEC 05B — Diagnóstico (piezas CÓDIGO)

### `05B:B.1.1` — Validar/normalizar episodio (entrada reactiva)

**Goal.** Validación/normalización determinista del episodio reactivo (field check); invocada dentro del contenedor N8N.

**Context.** Trigger: evento episodio 3-capas de Atendimiento(05A)/S2 llega al orquestador. Entradas: `tenant.Conversa_Episodio` (`capa_estructurada`, `capa_transcripcion`, `capa_metricas`, `tenant_id`, `restaurante_id`). Salida: `disparo-candidato {origen=reactivo, tenant_id, restaurante_id, señal_inicial}` a B.1.3 (in-memory, sin write de tabla); fail-closed fija `Problema_Diagnosticado.estado=degrade_humano`. Reusar el orquestador 05B.

**Constraints.** COMPUTED-at-run / NULL pre-corrida. Falta `tenant_id`/`restaurante_id` ⇒ retorna a 05A + notifica S3 (BR-B6, BR-B7). In-memory (no escribe tabla aquí). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** un episodio con `tenant_id`+`restaurante_id`, **When** corre, **Then** `disparo-candidato` reactivo a B.1.3.
- **Given** falta `tenant_id`/`restaurante_id`, **When** corre, **Then** retorna a 05A + notifica S3.
- **Check ejecutable:** test "válido → candidato / falta stamp → retorna+notifica" — `[STACK-TUNE] <cmd:test>` filtro `B.1.1`.

---

### `05B:B.1.2` — Gate de admisión proactivo (scan programado)

**Goal.** Gate de admisión determinista (impacto-alto × falla-silenciosa × fuente-medible) sobre scan programado; out-of-band, paso del contenedor N8N.

**Context.** Trigger: schedule `Processo_Critico.schedule` dispara el scan proactivo. Entradas: `tenant.Processo_Critico` (`processo_id`, `nome`, `score_impacto`, `falha_silenciosa`, `fonte_verdade_ref`, `origem`, `schedule`). Salida: `disparo-candidato {origen=proactivo, tenant_id, processo_id, fonte_verdade_ref}` a B.1.3 (in-memory); fail-closed fija `Processo_Critico.estado=no-medible-ahora`. Reusar el monitor 05B.

**Constraints.** Los 3 gatillos deben darse (BR-B12, EC-B16). Fuente muerta ⇒ alerta S3. COMPUTED-at-run / NULL pre-corrida. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** un `Processo_Critico` con los 3 gatillos, **When** corre el scan, **Then** `disparo-candidato` proactivo a B.1.3.
- **Given** fuente muerta, **When** corre, **Then** `estado=no-medible-ahora` + alerta S3.
- **Check ejecutable:** test "3 gatillos → candidato / fuente muerta → no-medible+alerta" — `[STACK-TUNE] <cmd:test>` filtro `B.1.2`.

---

### `05B:B.1.3` — Dedup + create/consolidate Problema_Diagnosticado

**Goal.** Lookup de dedup determinista + create/consolidate fila por `tenant_id + tipo_area/processo_id`; síncrono en el contenedor.

**Context.** Trigger: `disparo-candidato` de B.1.1 o B.1.2 vía S3. Entradas: `tenant.Problema_Diagnosticado` (`problema_id`, `tenant_id`, `tipo_area`, `processo_id`, `estado`, `frecuencia`). Salida: `Problema_Diagnosticado` creado `{estado=nuevo, primera_vez_ts, frecuencia=1}` O `frecuencia`+`ultima_vez_ts` incrementados. Reusar el upsert con dedup.

**Constraints.** Dedup por `tenant_id + tipo_area/processo_id` (BR-B5, BR-B8). `frecuencia` COMPUTED-at-run vía count()/trigger. Sin cruzar `tenant_id`. Observabilidad: log de consolidación.

**Done-when.**
- **Given** un candidato nuevo, **When** corre, **Then** `Problema_Diagnosticado {estado=nuevo, frecuencia=1}`.
- **Given** un candidato duplicado, **When** corre, **Then** `frecuencia` incrementada + `ultima_vez_ts`.
- **Check ejecutable:** tests "nuevo → crea / dup → incrementa" — `[STACK-TUNE] <cmd:test>` filtro `B.1.3`.

---

### `05B:B.1.4` — Prioridad de entrada f(criticidad, impacto, lente_agile)

**Goal.** Fórmula de prioridad determinista `f(criticidad, impacto_estimado, lente_agile)` con tie-break fijo; rule-based, no LLM.

**Context.** Trigger: `problema_id` + `señal_inicial` de B.1.3. Entradas: `tenant.Problema_Diagnosticado` (`criticidad`/`señal_inicial`); estimación temprana de impacto del placeholder S7 `[C]`. Salida: `prioridad {ahora|fila(rank)}` en cola (B.1 solo ordena entrada; B.7.5 es autoridad final sobre `estado`). Reusar el orquestador 05B.

**Constraints.** Tie-break order fijo (BR-B11, BR-B10). B.1.4 solo ordena entrada (no fija `estado` final). COMPUTED-at-run / NULL pre-corrida. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** criticidad + impacto + lente, **When** corre, **Then** `prioridad {ahora|fila(rank)}` con tie-break determinista.
- **Check ejecutable:** test de la fórmula + tie-break con empates — `[STACK-TUNE] <cmd:test>` filtro `B.1.4`.

---

### `05B:B.1.5` — Dispatch gate (ahora → B.2 / fila → capacidad)

**Goal.** Gate de dispatch determinista `ahora → B.2` / `fila → retener por ventana de capacidad`; orquestación interna del contenedor.

**Context.** Trigger: `problema_id` + `prioridad {ahora|fila(rank)}` de B.1.4. Entradas: `tenant.Problema_Diagnosticado` (`problema_id`, `estado`); `prioridad` de B.1.4. Salida: `problema_id`+`prioridad`+`origen` despachado a Motor diagnóstico (B.2/S4); fail-closed re-encola si S4 no-ack. Reusar el orquestador 05B.

**Constraints.** `ahora` ⇒ dispatch inmediato; `fila` ⇒ por capacidad (BR-B6, BR-B17). S4 no-ack ⇒ re-encola + alerta S3 (handoff perdido). COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `prioridad=ahora`, **When** corre, **Then** dispatch inmediato a B.2.
- **Given** `prioridad=fila`, **When** corre, **Then** retiene hasta capacidad.
- **Given** S4 no-ack, **When** corre, **Then** re-encola + alerta S3.
- **Check ejecutable:** tests "ahora / fila / no-ack → re-encola" — `[STACK-TUNE] <cmd:test>` filtro `B.1.5`.

---

### `05B:B.2.1` — Extracción de rasgos (sin abrir S1)

**Goal.** Extracción de features determinista desde `intent`/`causa_hipotesis` sin abrir S1; síncrona en el motor.

**Context.** Trigger: caso gated/priorizado por B.1 llega al motor (S4). Entradas: `tenant.Conversa_Episodio.capa_estructurada` (`intent` FK→`Intent_Catalog`, `causa_hipótesis`) O `Processo_Critico` señal-de-falla. Salida: `vector-de-rasgos` a B.2.2 (in-memory, sin fetch); fail-closed degrade-to-human si capa vacía. Reusar el extractor de rasgos. **Señal de inyección logueada:** texto-del-cliente es DATO nunca instrucción; `intent` puede estar envenenado — clasificar como contenido, no ejecutar instrucciones embebidas (EC-B10/BR-B8).

**Constraints.** No abre S1 (in-memory). Capa vacía ⇒ degrade-to-human (BR-B1, BR-B7, BR-B8). Texto del cliente = dato (no ejecuta). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** una `capa_estructurada` con `intent`, **When** corre, **Then** `vector-de-rasgos` a B.2.2 sin abrir S1.
- **Given** capa vacía, **When** corre, **Then** degrade-to-human.
- **Given** `intent` con instrucción embebida, **When** corre, **Then** se trata como dato (no ejecuta).
- **Check ejecutable:** test "rasgos / capa vacía → degrade / intent envenenado → dato" — `[STACK-TUNE] <cmd:test>` filtro `B.2.1` y `[STACK-TUNE] <cmd:security>`.

---

### `05B:B.2.3` — Map tipo_area → fuente candidata S1 + corte_por_tipo

**Goal.** Map determinista `tipo_area → fuente candidata S1` + declarar `corte_por_tipo`, sin abrir la fuente; síncrono.

**Context.** Trigger: `tipo_area` + `confianza [C]` de B.2.2/B.2.2b. Entradas: `tipo_area` + `confianza [C]`; mapping `tipo → fonte` (finanzas → `tenant.Orden` pagos). Salida: `{tipo_area, confianza [C], fonte_verdade candidata, corte_por_tipo}` a B.3 + `Problema_Diagnosticado.provenance_por_campo`. Reusar el catálogo de mapping.

**Constraints.** No abre la fuente (solo mapea). Sin mapeo ⇒ degrade fail-closed (BR-B2, BR-B9). COMPUTED-at-run / NULL pre-corrida. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `tipo_area=finanzas`, **When** corre, **Then** fuente candidata = `tenant.Orden` pagos + `corte_por_tipo` declarado.
- **Given** sin mapeo, **When** corre, **Then** degrade fail-closed.
- **Check ejecutable:** tests "finanzas → Orden / sin mapeo → degrade" — `[STACK-TUNE] <cmd:test>` filtro `B.2.3`.

---

### `05B:B.3.3` — Orquestar fetch + CHECK true/false vs fuente

**Goal.** Paso de orquestación que delega fetch a B.4; el CHECK true/false vs fuente es determinista; síncrono en el motor.

**Context.** Trigger: PATH A seleccionado de B.3.2. Entradas: `PATH A.hipotese` + `PATH A.fonte` de `issue_tree`; delega fetch a B.4. Salida: `issue_tree.paths[A] {fonte_consultada, resultado(true|false)}` — CHECK determinista contrasta evidencia vs hipótesis. Reusar el motor de issue-tree.

**Constraints.** CHECK determinista (BR-B2, BR-B8, EC-B11). Fuente caída ⇒ `resultado=abierto` (no inventa). COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** PATH A con evidencia que confirma, **When** corre, **Then** `resultado=true` → B.3.5.
- **Given** evidencia que refuta, **When** corre, **Then** `resultado=false` → B.3.4.
- **Given** fuente caída, **When** corre, **Then** `resultado=abierto`.
- **Check ejecutable:** tests "true / false / fuente caída → abierto" — `[STACK-TUNE] <cmd:test>` filtro `B.3.3`.

---

### `05B:B.3.4` — Backtrack determinista (pop PATH A, siguiente)

**Goal.** Backtrack determinista — pop PATH A, seleccionar siguiente por orden de probabilidad; control-flow síncrono.

**Context.** Trigger: `PATH A.resultado=false` + paths restantes de `issue_tree`. Entradas: `Problema_Diagnosticado.issue_tree.paths` (ordenados, estados de resultado). Salida: active path = PATH B (`resultado=abierto`) en `issue_tree`. Reusar el control-flow del motor.

**Constraints.** Orden por probabilidad (BR-B1, BR-B3, BR-B16, EC-B11). Sin más paths abiertos ⇒ degrade-to-human, `estado=needs_human`, `raiz_hipotese=null`. COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** PATH A false con paths restantes, **When** corre, **Then** active path = PATH B abierto.
- **Given** sin paths abiertos, **When** corre, **Then** degrade-to-human, `raiz_hipotese=null`.
- **Check ejecutable:** tests "pop → siguiente / sin paths → degrade" — `[STACK-TUNE] <cmd:test>` filtro `B.3.4`.

---

### `05B:B.3.5` — Escribir raiz_hipotese ganadora + sellar issue_tree

**Goal.** Write determinista de la `raiz_hipotese` del path ganador + sellar `issue_tree` como evidencia de auditoría; persistencia síncrona.

**Context.** Trigger: path ganador `{resultado=true}` de B.3.3. Entradas: `issue_tree` path ganador `{hipotese, probabilidad [C], fonte_consultada, resultado=true}`. Salida: `tenant.Problema_Diagnosticado.raiz_hipotese` + `confianza [C]` + `provenance_por_campo`; `issue_tree` sellado. Reusar el escritor de raíz.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (BR-B8). `confianza < umbral` ⇒ marca provisional para revisión humana. Sin cruzar `tenant_id`. Observabilidad: issue_tree sellado auditable.

**Done-when.**
- **Given** path ganador con `confianza ≥ umbral`, **When** corre, **Then** `raiz_hipotese` + `confianza` escritos, `issue_tree` sellado → B.5.
- **Given** `confianza < umbral`, **When** corre, **Then** marca provisional para revisión.
- **Check ejecutable:** tests "≥umbral → escribe / <umbral → provisional" — `[STACK-TUNE] <cmd:test>` filtro `B.3.5`.

---

### `05B:B.4.1` — Map (tipo_area+hipotese) → UNA fuente S1 + query dirigida

**Goal.** Map determinista `(tipo_area + hipotese) → exactamente UNA fuente S1` + build de query dirigida; síncrono; fail-closed ante fanout.

**Context.** Trigger: B.3 entregó `path_id` activo (`estado=abierto`) + hipótesis rankeada. Entradas: `Problema_Diagnosticado.issue_tree.paths[active] {hipotese, fonte_consultada=null}`; `.tipo_area`. Salida: `plan de fetch dirigido {fuente_unica_ref, query_acotada, claves=restaurante_id}` a B.4.2. Reusar el enriquecedor 05B.

**Constraints.** Exactamente UNA fuente (no fanout, BR-B1, BR-B2, EC-B9). No resuelve a una ⇒ fail-closed, `resultado=abierto`, backtrack B.3. COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** path activo que resuelve a una fuente, **When** corre, **Then** `plan de fetch dirigido` a B.4.2.
- **Given** resuelve a >1 fuente, **When** corre, **Then** fail-closed no-fanout, backtrack.
- **Check ejecutable:** tests "1 fuente → plan / >1 → no-fanout backtrack" — `[STACK-TUNE] <cmd:test>` filtro `B.4.1`.

---

### `05B:B.4.2` — Query dirigida single-key contra la fuente del path

**Goal.** Query dirigida single-key determinista contra la ÚNICA fuente del path (Named-query); bloquea bulk.

**Context.** Trigger: `plan de fetch dirigido` de B.4.1. Entradas: `tenant.Orden` (`status_pago`, `motivo_fallo`, `valor_neto` para `restaurante_id`/periodo) — fuente única del path activo de S1, RLS por `tenant_id`. Salida: `resultado_crudo_dirigido {pagó?/motivo}` a B.4.3. Reusar el ejecutor `Named_Query` dirigido.

**Constraints.** Single-key dirigido (bulk bloqueado, BR-B2, EC-B9). Fuente caída/vacía ⇒ fail-closed `resultado=abierto`, nunca inventa dato. COMPUTED-at-run. Sin cruzar `tenant_id` (RLS).

**Done-when.**
- **Given** un plan dirigido, **When** corre, **Then** `resultado_crudo_dirigido` de la fuente única.
- **Given** fuente caída/vacía, **When** corre, **Then** `resultado=abierto` (no inventa).
- **Given** intento bulk, **When** corre, **Then** bloqueado.
- **Check ejecutable:** tests "dirigido → resultado / caída → abierto / bulk → bloqueo" — `[STACK-TUNE] <cmd:test>` filtro `B.4.2`.

---

### `05B:B.4.3` — Scanner PII-redaction antes de persist

**Goal.** Scanner determinista de redacción PII sobre el payload fetched antes de persistir (hard-no BR-B7); code-guard síncrono.

**Context.** Trigger: `resultado_crudo_dirigido` de B.4.2. Entradas: `resultado_crudo_dirigido` (puede traer PII). Salida: `resultado_redactado` (mantiene claves no-identificadoras: `restaurante_id`, montos, estado, fechas) a B.4.4. Reusar el scanner PII.

**Constraints.** Hard-no PII en persist (BR-B7, EC-B6). PII residual ⇒ fail-closed drop field, dato NO entra a `issue_tree`/B.5, S6 notificado. COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** payload con PII, **When** corre, **Then** `resultado_redactado` sin PII identificadora → B.4.4.
- **Given** PII residual, **When** corre, **Then** drop field + S6 notificado.
- **Check ejecutable:** test "redacta ok / residual → drop+notifica" — `[STACK-TUNE] <cmd:test>` filtro `B.4.3` y `[STACK-TUNE] <cmd:security>`.

---

### `05B:B.4.4` — Compare dato vs hipotese + cross-tenant guard

**Goal.** Compare determinista dato vs hipótesis ⇒ `resultado true|false|abierto` + cross-tenant guard; persistencia síncrona.

**Context.** Trigger: `resultado_redactado` de B.4.3 (+ cross-tenant check). Entradas: `resultado_redactado`; `issue_tree.paths[active] {hipotese, probabilidad [C]}`; conteo de frontera `tenant_id`. Salida: `Problema_Diagnosticado.issue_tree.paths[id] {fonte_consultada, resultado}` + `datos-crudos-ya-buscados` cacheados para el dossier. Reusar el comparador del enriquecedor.

**Constraints.** Compare determinista (BR-B6, BR-B8, EC-B5). Cross-tenant detectado ⇒ fail-closed abort, S3 bloquea caso. COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** dato que confirma, **When** corre, **Then** `resultado=true` → B.5.
- **Given** dato que refuta, **When** corre, **Then** `resultado=false` → backtrack B.3.
- **Given** cross-tenant detectado, **When** corre, **Then** abort + S3 bloquea.
- **Check ejecutable:** tests "true / false / cross-tenant → abort" — `[STACK-TUNE] <cmd:test>` filtro `B.4.4` y `[STACK-TUNE] <cmd:security>`.

---

### `05B:B.5.1` — Query acotada de población-de-verdad + PII redact

**Goal.** Query acotada determinista (tenant + tipo + ventana, excepción B-block-2 a BR-B2) + PII redact; síncrono.

**Context.** Trigger: B.4 entregó fuente confirmada (`path resultado=true`). Entradas: `tenant.Orden` población-de-verdad (`status_pago`, `restaurante_id`; scope tenant + tipo + `ventana_silenciosos`) de S1; `Problema_Diagnosticado {tipo_area, raiz_hipotese}`. Salida: lista cruda de `restaurante_id` afectados a buffer B.5.2. Reusar el caza-silenciosos 05B.

**Constraints.** Acotada por tenant + tipo + ventana (excepción B-block-2, BR-B2). PII redact (BR-B7, EC-B3). Población no medible ⇒ degrade-to-human, NO declara silenciosos. COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** fuente confirmada, **When** corre, **Then** lista cruda de afectados a B.5.2.
- **Given** población no medible, **When** corre, **Then** degrade-to-human (no declara silenciosos).
- **Check ejecutable:** test "medible → lista / no medible → degrade" — `[STACK-TUNE] <cmd:test>` filtro `B.5.1`.

---

### `05B:B.5.2-anti-join` — Anti-join Orden × reclamantes (caza silenciosos)

**Goal.** Anti-join determinista `Orden(status_pago=fallido) × reclamantes` que produce las filas `Afetado`; golden AGENTE#3 (mitad CÓDIGO); seed NO inserta filas.

**Context.** Trigger: output de razonamiento de B.5.2-reasoning. Entradas: `tenant.Orden` (`status_pago='fallido'`); reclamantes de `tenant.Conversa_Episodio`; population set de B.5.1. Salida: `tenant.Afetado` rows `{problema_id, restaurante_id, reclamou, silencioso, evidencia → Orden.orden_id}`; `impacto.restaurantes_afetados=count(Afetado)` trigger. Reusar el anti-join 05B.

**Constraints.** Seed NO inserta filas, COMPUTED-at-run / NULL pre-corrida (§14). `silencioso` derivado del anti-join. Sin cruzar `tenant_id` (BR-B4, BR-B8). Observabilidad: count de afectados.

**Done-when.**
- **Given** Orden fallidas + reclamantes, **When** corre, **Then** filas `Afetado` con `silencioso` derivado y `count` correcto → B.5.3.
- **Given** estado pre-corrida, **When** se lee `Afetado`, **Then** sin filas sembradas.
- **Check ejecutable:** test del anti-join con `count(Afetado)` esperado computado por el test + assert "no seed" — `[STACK-TUNE] <cmd:test>` filtro `B.5.2-anti-join`.

---

### `05B:B.5.4` — k-anon-interno + cross-tenant guard sobre output

**Goal.** Boundary k-anon-interno determinista + cross-tenant guard (count distinct `tenant_id`) sobre el output; enforcement de hard-no = code.

**Context.** Trigger: `Afetado[]` + corte de patrón de B.5.3. Entradas: `tenant.Afetado[]` (`restaurante_id` específicos); destino de output (interno vs cross-tenant). Salida: lista de afetados (reclamantes + silenciosos, IDs) WITHIN tenant al campo QUIÉN de `v_dossier_handoff` + B.6; `Afetado.silencioso` COMPUTED-at-run. Reusar el guard k-anon.

**Constraints.** Output cruza tenant ⇒ fail-closed HARD abort + alerta política (BR-B5, BR-B6, BR-B7, EC-B5). k-anon-interno. COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** output dentro del tenant, **When** corre, **Then** lista de afetados al campo QUIÉN del dossier.
- **Given** output que cruza tenant, **When** corre, **Then** HARD abort + alerta.
- **Check ejecutable:** tests "interno → resuelve / cross-tenant → abort+alerta" — `[STACK-TUNE] <cmd:test>` filtro `B.5.4` y `[STACK-TUNE] <cmd:security>`.

---
### `05B:B.6.1` — Lookup KB por tipo_area + padrao

**Goal.** Lookup KB determinista por `tipo_area + padrao` que retorna `Knowledge_Case` candidatos; retrieval síncrono.

**Context.** Trigger: `raiz_hipotese` priorizada de S4/B.3-B.4. Entradas: `tenant.Knowledge_Case` (`tipo_area`, `padrao`, `resolucao`, `probabilidad [C]`, `caminho_usado`, `links_similares`). Salida: lista de `Knowledge_Case` candidatos + `probabilidad` a B.6.2. Reusar la query KB.

**Constraints.** Lookup determinista (BR-B3, BR-B7). Sin match ⇒ B.6.4 degrade. KB timeout ⇒ tratar como sin-casos → B.6.4. COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `padrao` con match en KB, **When** corre, **Then** candidatos a B.6.2.
- **Given** sin match o timeout, **When** corre, **Then** B.6.4 degrade.
- **Check ejecutable:** tests "match → candidatos / sin match/timeout → degrade" — `[STACK-TUNE] <cmd:test>` filtro `B.6.1`.

---

### `05B:B.6.3` — Write/update Knowledge_Case (no-reforzado) + PII redact

**Goal.** Write/update determinista de `Knowledge_Case` con `caminho_usado`, flag no-reforzado + PII redact; persistencia síncrona.

**Context.** Trigger: `raiz_hipotese` grounded de B.6.2. Entradas: `issue_tree` resolving path `{path_id, fonte_consultada, resultado}` + `raiz_hipotese` anclada. Salida: `tenant.Knowledge_Case {tipo_area, padrao, resolucao, probabilidad [C], caminho_usado, links_similares}` flag=no-reforzado. Reusar el escritor KB. **El path NO se auto-refuerza hasta que pase el guard B.6.5.**

**Constraints.** Flag no-reforzado hasta guard (BR-B16, BR-B7, BR-B8). `probabilidad` COMPUTED-at-run vía agregado RL (§14). PII redact. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `raiz_hipotese` grounded, **When** corre, **Then** `Knowledge_Case` escrito con flag=no-reforzado → guard B.6.5.
- **Check ejecutable:** test de write KB + assert "flag=no-reforzado, no auto-refuerza" — `[STACK-TUNE] <cmd:test>` filtro `B.6.3`.

---

### `05B:B.6.4` — Marcar 'raíz-no-anclada' + route a cola humana

**Goal.** Marca terminal determinista 'raíz-no-anclada' + route a cola humana; no escribe resolución KB; síncrono.

**Context.** Trigger: `raiz_hipotese` sin KB backing / bajo umbral de B.6.1[NO]/B.6.2[NO]. Entradas: `tenant.Problema_Diagnosticado.raiz_hipotese` (sin respaldo). Salida: `tenant.Problema_Diagnosticado.estado=degrade_humano`, hipótesis-abierta auditable; sin `Knowledge_Case` resolution escrita. Reusar el motor 05B.

**Constraints.** Terminal (no refuerza KB, BR-B3, BR-B18). Auditable. COMPUTED-at-run. Sin cruzar `tenant_id`. Route a human-meta-capa batch review.

**Done-when.**
- **Given** `raiz_hipotese` sin respaldo KB, **When** corre, **Then** `estado=degrade_humano`, hipótesis auditable, sin write KB.
- **Check ejecutable:** test "sin respaldo → degrade_humano + no write KB" — `[STACK-TUNE] <cmd:test>` filtro `B.6.4`.

---

### `05B:B.7.1` — Gather/normalize 3 factores de impacto

**Goal.** Gather/normalize determinista de 3 factores (restaurantes únicos sin doble-conteo, `ordens_media`, `dias`); síncrono.

**Context.** Trigger: B.5 entregó `Afetado` + corte-por-tipo + raíz validada. Entradas: `tenant.Afetado` (`restaurantes_afetados`); `tenant.Orden` `ordens_media` (directed fetch); `Problema_Diagnosticado.dias` (`primera_vez_ts → ultima_vez_ts`). Salida: `insumos_normalizados` a B.7.2. Reusar el normalizador.

**Constraints.** Restaurantes únicos (sin doble-conteo, BR-B4, BR-B2). `ordens_media`/`dias` COMPUTED-at-run vía `Named_Query` (§14). Cualquier factor vacío ⇒ degrade-to-human. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** los 3 factores presentes, **When** corre, **Then** `insumos_normalizados` a B.7.2.
- **Given** un factor vacío, **When** corre, **Then** degrade-to-human.
- **Check ejecutable:** test "3 factores → normaliza / vacío → degrade" + assert "sin doble-conteo" — `[STACK-TUNE] <cmd:test>` filtro `B.7.1`.

---

### `05B:B.7.2` — Fórmula rs_perdido + churn_risk (Named_Query)

**Goal.** Fórmula determinista `rs_perdido = restaurantes × ordens_media × dias`, `churn_risk=f()`; `Named_Query` persiste número; golden CÓDIGO#1/#2.

**Context.** Trigger: `insumos_normalizados` de B.7.1. Entradas: `insumos_normalizados` (dentro del tenant, BR-B6). Salida: `Problema_Diagnosticado.rs_perdido` (= `sum(Orden.valor_neto WHERE status_pago=fallido)`) + `churn_risk` provisional. Reusar el ejecutor `Named_Query` + job pre-churn. **Provenance del vocab:** `royalty/pago fallido → Orden (status_pago='fallido')`, `rs_perdido = sum(Orden.valor_neto fallido)`.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14): prohibido sembrar. Factor `[C]` ⇒ rotulado ESTIMADO. Sin cruzar `tenant_id` (BR-B10, BR-B8). Observabilidad: log del cálculo.

**Done-when.**
- **Given** insumos normalizados, **When** corre, **Then** `rs_perdido = sum(Orden.valor_neto fallido)` + `churn_risk` provisional → B.7.3.
- **Given** factor `[C]`, **When** corre, **Then** rotulado ESTIMADO.
- **Check ejecutable:** test de fórmula con `rs_perdido` esperado **computado por el test** desde inputs — `[STACK-TUNE] <cmd:test>` filtro `B.7.2`.

---

### `05B:B.7.3` — Double-check independiente vs rango KB

**Goal.** Double-check determinista — recomputar por path independiente + comparar vs rango KB, computar desvío; verificación de code.

**Context.** Trigger: provisional `{rs_perdido, churn_risk}` de B.7.2. Entradas: provisional `{rs_perdido, churn_risk}`; `tenant.Knowledge_Case` (`rs_perdido` histórico) de B.6. Salida: `tenant.Problema_Diagnosticado.rs_perdido, churn_risk` confirmados (o flag DISCREPANTE). Reusar la `Named_Query` double-check.

**Constraints.** Dos paths concuerdan dentro de tolerancia + en rango KB ⇒ write IMPACTO; else fail-closed degrade-to-human (BR-B10, BR-B3, EC-B15). COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** dos paths concordantes en rango, **When** corre, **Then** IMPACTO escrito → B.7.4.
- **Given** discrepancia, **When** corre, **Then** flag DISCREPANTE + degrade-to-human.
- **Check ejecutable:** tests "concuerda → IMPACTO / discrepa → degrade" — `[STACK-TUNE] <cmd:test>` filtro `B.7.3`.

---

### `05B:B.7.4` — Estimar custo_resolver desde precedentes KB

**Goal.** Estimar `custo_resolver` desde precedentes KB; `Named_Query` anclada en `Knowledge_Case`, no juicio LLM libre (confianza baja por borderline).

**Context.** Trigger: IMPACTO escrito de B.7.3. Entradas: `Problema_Diagnosticado.raiz_hipotese` (validada) + ruta candidata; `tenant.Knowledge_Case.custo_resolver_historico`. Salida: `tenant.Problema_Diagnosticado.custo_resolver` (sin precedente → `[C]` desconocido, no zero). Reusar la `Named_Query` anclada en KB.

**Constraints.** Anclada en `Knowledge_Case` (no LLM, BR-B3). Sin precedente ⇒ `[C]` desconocido (no zero). COMPUTED-at-run / NULL pre-corrida (§14). Raíz nueva sin precedente ⇒ fuerza NO-autónomo (humano decide). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** precedente KB, **When** corre, **Then** `custo_resolver` estimado anclado.
- **Given** sin precedente, **When** corre, **Then** `[C]` desconocido (no zero) + fuerza NO-autónomo.
- **Check ejecutable:** tests "con precedente → estima / sin precedente → [C] desconocido" — `[STACK-TUNE] <cmd:test>` filtro `B.7.4`.

---

### `05B:B.7.5` — Prioridad g(riesgo, impacto, custo) + autoridad estado

**Goal.** Prioridad determinista `g(riesgo, impacto, custo_resolver)` con agile override fijo; autoridad final sobre `estado`; golden motor min-style.

**Context.** Trigger: `custo_resolver` de B.7.4. Entradas: `Problema_Diagnosticado` `criticidad` (B.1); `rs_perdido, churn_risk`; `custo_resolver`; señal agile. Salida: `tenant.Problema_Diagnosticado.estado {ARREGLAR-AHORA|FILA|monitorear}` (B.7.5 autoridad final). Reusar el motor de priorización 05B.

**Constraints.** Autoridad final sobre `estado` (BR-B11, BR-B18). Agile override fijo. COMPUTED-at-run / NULL pre-corrida. Impacto ESTIMADO/DISCREPANTE ⇒ no autónomo ahora, fila-con-revisión. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** riesgo + impacto + custo, **When** corre, **Then** `estado` ∈ del enum con override agile determinista.
- **Given** impacto ESTIMADO/DISCREPANTE, **When** corre, **Then** fila-con-revisión (no autónomo).
- **Check ejecutable:** tabla de verdad de prioridad + caso ESTIMADO → fila-con-revisión — `[STACK-TUNE] <cmd:test>` filtro `B.7.5`.

---

### `05B:B.7.6` — Compute custo_resolver/valor_ganho (libro-razón)

**Goal.** Compute/estimate determinista de `{custo_resolver, valor_ganho}` entrada libro-razón; HUMAN batch review como atributo de gate; cálculo síncrono.

**Context.** Trigger: `prioridad` de B.7.5. Entradas: `Problema_Diagnosticado.custo_resolver`; `valor_ganho` esperado derivado de IMPACTO. Salida: `tenant.Problema_Diagnosticado.custo_resolver, valor_ganho` computados (B.8.3 es el único persister del asiento). Reusar la `Named_Query`.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14). B.8.3 es el único persister del asiento (aquí solo computa). Valor no estimable ⇒ `[C]` pendiente, no fabrica ROI. Sin cruzar `tenant_id` (BR-B14, BR-B16).

**Done-when.**
- **Given** `custo_resolver` + IMPACTO, **When** corre, **Then** `{custo_resolver, valor_ganho}` computados → B.8.
- **Given** valor no estimable, **When** corre, **Then** `[C]` pendiente (no fabrica ROI).
- **Check ejecutable:** test "computa / no estimable → [C] pendiente" — `[STACK-TUNE] <cmd:test>` filtro `B.7.6`.

---

### `05B:B.8.1` — Route selection (stub fijo tipo_area → ruta)

**Goal.** Selección de ruta determinista (stub FIJO `tipo_area → ruta`); 5 reglas completas = FILA; rule síncrona.

**Context.** Trigger: B.7 cerrado con problema priorizado + `raiz_hipotese` validada. Entradas: `tenant.Problema_Diagnosticado {tipo_area, raiz_hipotese, confianza, estado}`; `rs_perdido, churn_risk, custo_resolver, valor_ganho`; `prioridad`. Salida: `tenant.Problema_Diagnosticado.ruta_sugerida` (1 de 5, stub: finanzas/no-pago+alto → actuar-rápido; normal → corregir-interno; default → monitorear). Reusar el ruteador stub. _Recon `[I]` COL-18 (alta)._

**Constraints.** Stub fijo (5 reglas completas = FILA, BR-B11, BR-B5, BR-B18). `confianza < umbral` ⇒ degrade-to-human. Ruta que toca movimiento financiero ⇒ fail-closed humano obligatorio (financiero nunca autónomo por efecto). COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `tipo_area=finanzas/no-pago` + alto, **When** corre, **Then** `ruta_sugerida=actuar-rápido`.
- **Given** ruta que toca dinero, **When** corre, **Then** humano obligatorio (no autónomo).
- **Check ejecutable:** tabla de ruteo stub + caso "financiero → humano obligatorio" — `[STACK-TUNE] <cmd:test>` filtro `B.8.1`.

---

### `05B:B.8.2` — Write caso replicable (CASO_REPO) + PII redact

**Goal.** Write determinista del caso replicable (CASO_REPO) + PII redact; persiste a `dossier_emitido` jsonb; CRUD síncrono.

**Context.** Trigger: ruta seleccionada de B.8.1. Entradas: `Problema_Diagnosticado {problema_id, primera_vez_ts, ultima_vez_ts, frecuencia}`; `tenant.Afetado {restaurante_id}`; `issue_tree {caminho_usado}`. Salida: `tenant.Problema_Diagnosticado.dossier_emitido` jsonb `{restaurante_id, dia, frecuencia_atuacao, screenshots[], programas[], links_replicaveis[]}`. Reusar el repositorio 05B.

**Constraints.** PII redact (BR-B15, BR-B7). Fallo de redacción/write ⇒ no persist, bloquea handoff. COMPUTED-at-run / NULL pre-corrida. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** caso replicable, **When** corre, **Then** `dossier_emitido` jsonb escrito → B.8.3.
- **Given** fallo PII/write, **When** corre, **Then** no persist + bloquea handoff.
- **Check ejecutable:** test de write + caso "fallo PII → no persist" — `[STACK-TUNE] <cmd:test>` filtro `B.8.2` y `[STACK-TUNE] <cmd:security>`.

---

### `05B:B.8.3` — Persist asiento libro-razón (único persister)

**Goal.** Persist determinista del asiento libro-razón (único persister); write síncrono.

**Context.** Trigger: CASO_REPO de B.8.2. Entradas: `tenant.Problema_Diagnosticado.custo_resolver, valor_ganho` de B.7. Salida: entrada libro-razón persistida vía S7 (`Problema_Diagnosticado.custo_resolver, valor_ganho` columnas top-level). Reusar la `Named_Query`/escritor S7.

**Constraints.** Único persister del asiento (BR-B14). COMPUTED-at-run / NULL pre-corrida (§14). `custo`/`valor` no medibles ⇒ `[C]` placeholder incompleta, no bloquea handoff. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `custo_resolver` + `valor_ganho`, **When** corre, **Then** asiento libro-razón persistido (columnas top-level).
- **Given** no medibles, **When** corre, **Then** `[C]` placeholder (no bloquea).
- **Check ejecutable:** test "persiste asiento / no medible → [C] placeholder" — `[STACK-TUNE] <cmd:test>` filtro `B.8.3`.

---

### `05B:B.8.4` — Ensamblar dossier 11 campos + completeness check

**Goal.** Assembly determinista del dossier de 11 campos + completeness/provenance check; compose síncrono; el output es vista derivada.

**Context.** Trigger: libro-razón de B.8.3. Entradas: `tenant.Problema_Diagnosticado`, `issue_tree`, `tenant.Afetado`, columnas impacto, `tenant.Knowledge_Case`, `dossier_emitido` (11 campos). Salida — **corregido (critic vocab):** el **DATA-OUT persistido es `tenant.Problema_Diagnosticado.dossier_emitido` (jsonb snapshot auditado)**; `v_dossier_handoff` se nombra **solo** como proyección read-only derivada consumida downstream, **no** como sink de escritura (el oracle prohíbe DATA-OUT a la vista). Reusar el compositor 05B.

**Constraints.** 11 campos presentes + cada uno con provenance ⇒ B.8.5; else fail-closed no entrega a medias, `estado=pendiente-completar` (BR-B17, BR-B8, EC-B12, B-block-1). El write persistido va a `dossier_emitido` jsonb; **ningún write aterriza en la vista**. COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** 11 campos con provenance, **When** corre, **Then** `dossier_emitido` jsonb (snapshot auditado) escrito y `v_dossier_handoff` expuesto read-only → B.8.5.
- **Given** campo faltante, **When** corre, **Then** `estado=pendiente-completar` (no entrega a medias).
- **Given** la corrida, **When** se inspecciona, **Then** ningún write aterriza en `v_dossier_handoff`.
- **Check ejecutable:** test "11 completos → persiste dossier_emitido / falta → pendiente" + assert "no write a la vista" — `[STACK-TUNE] <cmd:test>` filtro `B.8.4`.

---

### `05B:B.8.5` — Emit dossier completo a feature C + revalidación cross-tenant

**Goal.** Emit determinista del dossier completo a feature C + revalidación cross-tenant; handoff síncrono.

**Context.** Trigger: DOSSIER_HANDOFF completo de B.8.4. Entradas: `v_dossier_handoff` completo de B.8.4 (referencia read-only). Salida — **corregido (critic vocab):** DOSSIER_HANDOFF emitido a feature C vía S8 usando `v_dossier_handoff` como **payload read-only**; la **persistencia auditable única es `Problema_Diagnosticado.dossier_emitido`** (ningún write a la vista). Reusar el orquestador 05B. _Recon `[I]` COL-7 (alta)._

**Constraints.** `v_dossier_handoff` es payload read-only (no record mutable, BR-B6, BR-B17). Destino exige cross-tenant ⇒ fail-closed bloquea delivery. COMPUTED-at-run. Sin cruzar `tenant_id`. Observabilidad: audit en `dossier_emitido`.

**Done-when.**
- **Given** dossier completo, **When** corre, **Then** DOSSIER_HANDOFF emitido a feature C (payload = `v_dossier_handoff` read-only) y audit en `dossier_emitido`.
- **Given** destino cross-tenant, **When** corre, **Then** bloquea delivery.
- **Given** la corrida, **When** se inspecciona, **Then** ningún write a la vista.
- **Check ejecutable:** test "emite a C + audit en dossier_emitido / cross-tenant → bloquea" — `[STACK-TUNE] <cmd:test>` filtro `B.8.5` y `[STACK-TUNE] <cmd:security>`.

---

## SPEC 05C — Generación de Conocimiento (piezas CÓDIGO)

### `05C:BR-C1-5` — Gate de dirección (interno/externo, bloquea cross-pool)

**Goal.** Gate de dirección determinista (interno = ID completo vs externo = anonimizado), bloquea cross-pool no-agregado; RLS/predicate, sin LLM.

**Context.** Entradas: `Restaurante.tenant_id` (frontera RLS/cross-pool); zona cohort (k-anon) vs zona tenant. Salida: marca dirección por artefacto (interno/externo) antes de despachar; bloquea cross-pool no-agregado. Reusar el predicado RLS.

**Constraints.** Cross-pool no-agregado ⇒ bloqueo (EC-C1-3, CIERRE-2 §6 D). Determinista. Sin cruzar `tenant_id`. Observabilidad: log de la marca/bloqueo.

**Done-when.**
- **Given** artefacto interno, **When** corre, **Then** marca interno (ID completo permitido).
- **Given** artefacto externo cross-pool no-agregado, **When** corre, **Then** bloqueo.
- **Check ejecutable:** tests "interno / externo cross-pool → bloqueo" — `[STACK-TUNE] <cmd:test>` filtro `BR-C1-5`.

---

### `05C:BR-C1-7` — Hard-no financiero (router bloquea movimiento de saldo)

**Goal.** Hard-no financiero: el router bloquea cualquier ruta que mueva saldo (lint/predicate), solo análisis de impacto; sin LLM.

**Context.** Entradas: `Artefacto_Generado.tipo=finanzas_impacto`; `NBA_Propuesta.clase_financiera`. Salida: bloqueo determinista de cualquier ruta que mueva saldo (solo análisis de impacto). Reusar el lint anti-financiero.

**Constraints.** Hard-no: nunca mueve saldo (CIERRE-2 §6 A). Solo impacto. Determinista. Sin cruzar `tenant_id`. Observabilidad: log del rechazo.

**Done-when.**
- **Given** ruta de solo-impacto, **When** corre, **Then** permitida.
- **Given** ruta que mueve saldo, **When** corre, **Then** rechazada.
- **Check ejecutable:** tests "impacto → ok / mueve saldo → rechazo" — `[STACK-TUNE] <cmd:test>` filtro `BR-C1-7`.

---

### `05C:BR-C2-9` — Text-as-data anti-injection (sanitize + log)

**Goal.** Texto de mercado/caso tratado como DATO no instrucción; sanitize + log; guard determinista, sin LLM.

**Context.** Entradas: `Conversa_Episodio.señal_inyeccion` (jsonb logueada vs tenant); campos de mercado/dossier como DATO. Salida: `Conversa_Episodio.señal_inyeccion` log; flujo no alterado. Reusar el sanitizador anti-injection. **Señal de inyección logueada:** search-term/nota con "ignora reglas" — logueado, no ejecutado (EC-C2-7).

**Constraints.** Texto = dato, jamás comando (BR-C2-9). Sanitize + log (no altera flujo). Sin cruzar `tenant_id`. Observabilidad: `señal_inyeccion` vs `tenant_id`.

**Done-when.**
- **Given** campo de mercado con instrucción embebida, **When** corre, **Then** logueado en `señal_inyeccion` y flujo inalterado (no ejecuta).
- **Check ejecutable:** test "instrucción embebida → log + flujo inalterado" — `[STACK-TUNE] <cmd:test>` filtro `BR-C2-9` y `[STACK-TUNE] <cmd:security>`.

---

### `05C:BR-C3a-2` — Gate dirección/PII para email externo

**Goal.** Gate dirección/PII determinista para email externo (propio OK, cross-pool no-agregado bloqueado, redacción); sin LLM.

**Context.** Entradas: `Restaurante.tenant_id` (frontera); `Restaurante` PII propia; evidencia agregada-anonimizada (C2). Salida: bloqueo/redacción de dato no-agregado de otro tenant antes de render; `Content_Lote.estado=rojo` si sin ancla. Reusar el predicado de dirección/PII.

**Constraints.** Cross-pool no-agregado ⇒ bloqueo/redacción (EC-C3a-2, EC-C3a-6, CIERRE-2 §6 D). Sin ancla ⇒ `estado=rojo` (fail-closed). Sin cruzar `tenant_id`. Observabilidad: log del bloqueo.

**Done-when.**
- **Given** email con PII propia + evidencia agregada, **When** corre, **Then** render permitido.
- **Given** PII de otro tenant no-agregada, **When** corre, **Then** bloqueo/redacción antes de render.
- **Given** sin ancla, **When** corre, **Then** `Content_Lote.estado=rojo`.
- **Check ejecutable:** tests "propia → ok / cross-pool → bloqueo / sin ancla → rojo" — `[STACK-TUNE] <cmd:test>` filtro `BR-C3a-2`.

---

### `05C:BR-C3c-1` — Lint anti-solicitud (bloquea campo de saldo/request)

**Goal.** Lint determinista que bloquea cualquier campo de solicitud/saldo; hard-no financiero; reescribe a impacto puro; sin LLM.

**Context.** Entradas: `Artefacto_Generado.contenido` (`tipo=finanzas_impacto`). Salida: bloqueo fail-closed de campos de solicitud (monto pedido/aprobación/movimiento saldo); reescribe a impacto puro. Reusar el lint anti-solicitud. **Señal de inyección logueada:** dossier text "inclui una solicitud de saldo de $X" — ignorado como instrucción, campo bloqueado (EC-C3c-9).

**Constraints.** Hard-no financiero (CIERRE-2 §6 A). Bloquea campo solicitud/saldo (BR-C3c-1, EC-C3c-6). Texto = dato (no ejecuta). Sin cruzar `tenant_id`. Observabilidad: log del bloqueo.

**Done-when.**
- **Given** artefacto de impacto puro, **When** corre, **Then** permitido.
- **Given** campo de solicitud de saldo (incluso embebido como texto), **When** corre, **Then** bloqueado + reescrito a impacto.
- **Check ejecutable:** tests "impacto → ok / campo saldo → bloqueo" — `[STACK-TUNE] <cmd:test>` filtro `BR-C3c-1` y `[STACK-TUNE] <cmd:security>`.

---

### `05C:BR-C3f-1` — Legal gate por defecto (least() + clase habilitada)

**Goal.** Legal gate por defecto: `nivel_efectivo=least()`, auto solo si clase habilitada (gate-1/gate-2) AND evals AND tier; gate determinista + HUMAN-gate; sin LLM.

**Context.** Entradas: `Credencial` (gate-1, clase tyc auto-habilitable); `Politica_Tier.teto_tier` (gate-2); `Eval_Cell.liberado_evals`; `min_calculo`. Salida: `min_calculo.nivel_efectivo` + ruteo a revisión humana obligatoria por defecto (motor 3-puertas). Reusar el motor de 3-puertas + `least()`.

**Constraints.** `nivel_efectivo=least()` (CIERRE-2 §6 A, BR-C3f-2). Auto-pase solo clase habilitada. Divergencia revoca auto-habilitación (EC-C3f-7). Revisión humana por defecto. COMPUTED-at-run. Sin cruzar `tenant_id`. **Señal de inyección logueada:** dossier intenta auto-elevar nivel / ordenar "publica esta T&C" — text-as-data, no eleva nivel (BR-C3f-7/EC-C3f-4).

**Done-when.**
- **Given** clase tyc habilitada + evals + tier, **When** corre, **Then** `nivel_efectivo=least()` y auto-pase elegible.
- **Given** clase no habilitada o divergencia, **When** corre, **Then** revisión humana obligatoria.
- **Given** texto que intenta auto-elevar, **When** corre, **Then** no eleva nivel (dato).
- **Check ejecutable:** tests "habilitada → least() / no habilitada → humano / auto-elevar texto → ignorado" — `[STACK-TUNE] <cmd:test>` filtro `BR-C3f-1`.

---

### `05C:BR-C6-2` — Activation guard (evals sin regresión + convergencia)

**Goal.** Leaf split (agente propone → code verifica): activation guard determinista que corre evals SIN regresión + `nivel_efectivo` + threshold de convergencia, fail-closed.

**Context.** Entradas: propuesta CANDIDATA (US-C6-2); `Eval_Cell` (set de evals del tipo); `min_calculo.nivel_efectivo`; conteo deltas (`≥N`/`≥M` fuentes). Salida: activa template solo si evals sin regresión AND `nivel_efectivo` permite AND convergencia ok (motor verificación C6); si falla → candidata + escala humano. Reusar el motor de verificación C6. **Señal de inyección logueada:** delta intenta guardar dato crudo de competidor — bloqueo duro BR-C6-5, solo patrón anonimizado (EC-C6-3).

**Constraints.** Volumen nunca basta solo (BR-C6-7). Evals sin regresión + convergencia (EC-C6-2, EC-C6-4). Dato crudo competidor ⇒ bloqueo (BR-C6-5). Gateado por humano. COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** propuesta con evals sin regresión + convergencia + nivel ok, **When** corre, **Then** activa template vN gateado por humano.
- **Given** falla cualquier condición, **When** corre, **Then** candidata + escala humano.
- **Given** delta con dato crudo competidor, **When** corre, **Then** bloqueo (solo anonimizado).
- **Check ejecutable:** tests "todo ok → activa / falla → escala / dato crudo → bloqueo" — `[STACK-TUNE] <cmd:test>` filtro `BR-C6-2`.

---

### `05C:CIERRE-1-§4-Ritual_Destino` — Registro de ritual + champion (catalog seed)

**Goal.** Registro ritual + champion (catalog seed manual día-1, fail-closed gate de entrega); catálogo versionado CRUD; sin LLM.

**Context.** Entradas: mapeo `tipo × equipo-destino → ritual nombrado + champion` (alta inicial manual). Salida: `catalog.Ritual_Destino (ritual_id, tipo_artefacto, equipo_destino, ritual_nombrado, champion_rol, estado {activo|sin_asignar}, seed_manual:bool)`. Reusar el catálogo `Ritual_Destino`.

**Constraints.** Seed manual día-1 (CIERRE-2 §6 E). Gate fail-closed de entrega C8 (sin ritual/champion no entrega, BR-C8-4). CRUD versionado. Sin cruzar `tenant_id`. Observabilidad: log del seed.

**Done-when.**
- **Given** mapeo `tipo × equipo`, **When** se da de alta, **Then** `Ritual_Destino` con `estado` y `champion_rol`.
- **Given** sin ritual/champion en entrega, **When** C8 intenta entregar, **Then** fail-closed.
- **Check ejecutable:** test de CRUD del catálogo + caso "sin ritual → fail-closed entrega" — `[STACK-TUNE] <cmd:test>` filtro `Ritual_Destino`.

---

### `05C:EPIC-C2` — Evidencia-de-mercado agregada k-anon (Named_Query)

**Goal.** Evidencia-de-mercado agregada k-anon = `Named_Query`/view determinista sobre zona cohort (ya NO resuelve NBA); code-artifact síncrono, sin LLM.

**Context.** Entradas: cohort zone agregada (k-anon `n_cuentas ≥ Config_Perillas.k_anon_threshold`); `tenant.Orden` agregada dentro del pool (libre §6 D). Salida: `evidencia_ref` snapshot agregado-anonimizado (cifras + ventana + provenance); celda nula bajo umbral k. Reusar la `Named_Query` de agregación.

**Constraints.** k-anon `n ≥ k` desde `Config_Perillas` (US-C2-2, BR-C2-3/4). Celda nula bajo umbral. Ya NO resuelve NBA (CIERRE-2 §2). COMPUTED-at-run / NULL pre-corrida (§14). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** cohort con `n ≥ k`, **When** corre, **Then** `evidencia_ref` agregada-anonimizada con cifras + ventana + provenance.
- **Given** `n < k`, **When** corre, **Then** celda nula.
- **Check ejecutable:** test "n≥k → evidencia / n<k → nula" — `[STACK-TUNE] <cmd:test>` filtro `EPIC-C2`.

---

### `05C:EPIC-C3d` — Resolución-NBA (lookup contra Knowledge_Case)

**Goal.** Resolución-NBA = lookup determinista contra `Knowledge_Case` (match/version/MISSING, nunca sintetiza); owner único; sin LLM.

**Context.** Entradas: `tenant.Knowledge_Case.resolucao` (jsonb `{steps[], precondiciones, metrica_objetivo_ref → KPI}`); `catalog.NBA_Catalogo` (lectura). Salida: contrato tipado `NBA_REF {steps[], metrica_objetivo → KPI, provenance_por_campo, status, version}` a C3a-C3f; o veredicto MISSING. Reusar el resolutor determinista C3d.

**Constraints.** Nunca sintetiza (solo lookup, CIERRE-2 §6 C, BR-C3d-1/2/4). MISSING ⇒ escala humano (INSERT `Knowledge_Case` flag='no-reforzado'). COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `Knowledge_Case` con match, **When** corre, **Then** `NBA_REF` tipado a generadores.
- **Given** sin match, **When** corre, **Then** veredicto MISSING + escala humano.
- **Check ejecutable:** tests "match → NBA_REF / sin match → MISSING" — `[STACK-TUNE] <cmd:test>` filtro `EPIC-C3d`.

---

### `05C:EPIC-C5` — Ledger (Decision_Trace + min_calculo + ROI_Operador)

**Goal.** Ledger = `Decision_Trace + min_calculo + ROI_Operador` (NO tabla nueva); persist append-only de `nivel_efectivo` + motivo; determinista, sin LLM.

**Context.** Entradas: artefacto + binding (`KPI.kpi_id` como `metric_id`, baseline, ventana); `min_calculo.nivel_efectivo`. Salida: `gov.Decision_Trace` (append-only, supersedes-chain via trace) + `gov.min_calculo`. Reusar el ledger existente. **NUNCA mueve saldo (BR-C5-6).**

**Constraints.** Append-only (BR-C5-1/2/3). NO tabla nueva (CIERRE-2 §6 B). Nunca mueve saldo (BR-C5-6). COMPUTED-at-run / NULL pre-corrida (§14). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** artefacto + binding + `nivel_efectivo`, **When** corre, **Then** `Decision_Trace` append-only + `min_calculo` escritos, sin mover saldo.
- **Check ejecutable:** test de append-only + assert "no mueve saldo" — `[STACK-TUNE] <cmd:test>` filtro `EPIC-C5`.

---

### `05C:EPIC-C7` — Gate humano graduado + cadencia (3-puertas)

**Goal.** Gate humano graduado + cadencia (tiempo/volumen) sobre auto-pasados = gobernanza vía 3-puertas + `Eval_Cell` rebaja; gates + cola humana síncronos; sin LLM.

**Context.** Entradas: `min_calculo.nivel_efectivo`; `Credencial` (gate-1) + `Politica_Tier.teto_tier` (gate-2, owner C7); `Eval_Cell.liberado_evals` (gate-3); `KPI` (métrica vinculada). Salida: `gov.Decision_Trace` (sello auto-pase|humano + `criterios_version` + clase, append-only); promoción/degradación de clase. Reusar el motor de gobernanza.

**Constraints.** Degrada a humano-siempre si rechazo/falla (BR-C7-1/2/3/7). Auto-pase solo clase elegible. COMPUTED-at-run. Sin cruzar `tenant_id`. Batch-review por tiempo/volumen/divergencia → C6.

**Done-when.**
- **Given** clase elegible que pasa 3 puertas, **When** corre, **Then** auto-pase → entrega C8.
- **Given** rechazo/falla, **When** corre, **Then** degrada a humano-siempre.
- **Check ejecutable:** tests "elegible → auto-pase / falla → degrada" — `[STACK-TUNE] <cmd:test>` filtro `EPIC-C7`.

---

### `05C:EPIC-C8` — Entrega (ruteo + binding/ritual/champion fail-closed)

**Goal.** Entrega = ruteo determinista (restaurante → `Content_Lote` cohorte / interno → email) + binding/ritual/champion fail-closed gate; superficie síncrona; sin LLM.

**Context.** Entradas: `Artefacto_Generado` (aprobado, `target_metric=KPI`, `tipo`); `cohort.Content_Lote` (email/contenido); `catalog.Ritual_Destino` + champion. Salida: `Content_Lote` (lote por cohorte, grounding fail-closed sin ancla → rojo) o email interno; `gov.Decision_Trace` sella canal/destino/artefacto/ritual; sin ritual/champion → fail-closed. Reusar el ruteador de entrega.

**Constraints.** Sin ritual/champion ⇒ fail-closed (alta manual seed día-1, BR-C8-4). Grounding sin ancla ⇒ rojo (BR-C8-1/2/3/8). COMPUTED-at-run. Sin cruzar `tenant_id`. Observabilidad: sello en `Decision_Trace`.

**Done-when.**
- **Given** artefacto aprobado con ritual/champion + ancla, **When** corre, **Then** entrega encola cohorte/email + sello en trace.
- **Given** sin ritual/champion o sin ancla, **When** corre, **Then** fail-closed (rojo).
- **Check ejecutable:** tests "completo → entrega / sin ritual/ancla → fail-closed" — `[STACK-TUNE] <cmd:test>` filtro `EPIC-C8`.

---

### `05C:US-C1-2` — Gate de binding de métrica (catálogo cerrado)

**Goal.** Gate determinista: validar `metric_id` en catálogo cerrado y escribir binding antes del generador; sin LLM.

**Context.** Entradas: catálogo cerrado de métricas = `KPI.kpi_id` + `Named_Query` (CIERRE-2 §6 B). Salida: `gov.Decision_Trace`/`gov.min_calculo` binding (`artefacto_id`, KPI ref, dossier ref, ts). Reusar el motor C1.

**Constraints.** Métrica desconocida ⇒ escala a humano (BR-C1-3, EC-C1-5). Catálogo cerrado. COMPUTED-at-run / NULL pre-corrida. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `metric_id` en catálogo, **When** corre, **Then** binding escrito + habilita generador.
- **Given** métrica desconocida, **When** corre, **Then** escala a humano.
- **Check ejecutable:** tests "en catálogo → binding / desconocida → escala" — `[STACK-TUNE] <cmd:test>` filtro `US-C1-2`.

---

### `05C:US-C1-3` — nivel_efectivo = least() + AND-de-6

**Goal.** `nivel_efectivo=least()` sobre niveles ordenados + AND-de-6 = motor determinista; `least(pedido_NBA, liberado_evals, teto_tier)`; sin LLM.

**Context.** Entradas: `NBA_Propuesta.pedido_NBA`; `Eval_Cell.liberado_evals`; `Politica_Tier.teto_tier`; `Credencial` (gate-1). Salida: `min_calculo.nivel_efectivo` + `min_calculo.auto_liberable`. Reusar el motor `least()`+AND-de-6 (golden §14).

**Constraints.** COMPUTED-at-run / NULL pre-corrida, **NUNCA sembrado** (§14). `nivel_efectivo=least(...)` exacto (CIERRE-2 §6 A, BR-C1-4). `auto_liberable` = AND-de-6. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** los 3 brazos + gate-1, **When** corre, **Then** `nivel_efectivo == least(inputs)` y `auto_liberable` solo si AND-de-6.
- **Check ejecutable:** property test "least(inputs)" + AND-de-6 — `[STACK-TUNE] <cmd:test>` filtro `US-C1-3`.

---

### `05C:US-C1-4` — Cola humano-aprobador (render de bloqueados)

**Goal.** Superficie de cola humana (CRUD/render de items bloqueados con motivo + dossier + métrica); síncrona in-app + HUMAN-gate; sin LLM.

**Context.** Entradas: `min_calculo` (items que no alcanzaron auto-pase); `gov.Decision_Trace` (motivo, `gate_result`); `KPI` (métrica vinculada). Salida: render cola humano-aprobador (read surface); resolver realimenta `gov.Decision_Trace` + dispara loop C6. Reusar el componente de cola.

**Constraints.** Read surface + resolver (BR-C1-8, EC-C1-6). a11y de la cola. HUMAN resuelve. Sin cruzar `tenant_id`. Observabilidad: resolver → trace.

**Done-when.**
- **Given** items bloqueados, **When** se renderiza la cola, **Then** cada item muestra motivo + dossier + métrica.
- **Given** un humano resuelve, **When** resuelve, **Then** realimenta `Decision_Trace` + dispara C6.
- **Check ejecutable:** test de render de cola + flujo de resolución — `[STACK-TUNE] <cmd:test>` filtro `US-C1-4`.

---

### `05C:US-C2-3` — Fail-closed escalate-to-create-NBA

**Goal.** Fail-closed escalate-to-create-NBA: como ausente/caducado o evidencia `< k` ⇒ cola crear_NBA humano; gate + HUMAN-gate; sin LLM.

**Context.** Entradas: `Knowledge_Case` (status/resolucao); cohort evidencia (`n_cuentas` vs `k_anon_threshold`). Salida: INSERT en `tenant.Knowledge_Case` (flag='no-reforzado') al crear humano; artefacto NO se genera. Reusar la cola de escalación.

**Constraints.** Fail-closed (BR-C2-2, EC-C2-1/2/3). Como ausente/caducado o `< k` ⇒ escala. HUMAN crea (HUMAN-gate). COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** como ausente/caducado o evidencia `< k`, **When** corre, **Then** cola crear_NBA humano, artefacto no generado.
- **Given** humano crea, **When** crea, **Then** INSERT `Knowledge_Case` flag='no-reforzado'.
- **Check ejecutable:** tests "ausente/<k → escala / humano crea → INSERT no-reforzado" — `[STACK-TUNE] <cmd:test>` filtro `US-C2-3`.

---
### `05C:US-C3a-3` — Batch review por cohorte (Content Studio)

**Goal.** Batch review por cohorte en Content Studio = acción humana síncrona (aprobar/editar masivamente) + UI surface + HUMAN-gate; sin LLM.

**Context.** Entradas: `cohort.Content_Lote` (agrupado por `cohort_id` + `Knowledge_Case` + `KPI`); `Eval_Cell` (que pasó eval). Salida: `Content_Lote.gate_humano` (FK→`Usuario`); edición registra delta → `memory.md` C6. Reusar el Content Studio.

**Constraints.** HUMAN-gate (`gate_humano`). Edición → delta a C6 (BR-C3a-7). a11y del batch. Sin cruzar `tenant_id`. Observabilidad: log de aceptar/rechazar.

**Done-when.**
- **Given** un lote por cohorte, **When** el humano aprueba/edita, **Then** `gate_humano` sellado y edición → delta C6.
- **Check ejecutable:** test de batch review + flujo de delta — `[STACK-TUNE] <cmd:test>` filtro `US-C3a-3`.

---

### `05C:US-C3b-1` — Trigger gate por recurrencia (≥N casos)

**Goal.** Trigger gate por recurrencia determinista (`≥N` casos/patrón) sobre `Problema.frecuencia`; sin LLM.

**Context.** Entradas: `Problema_Diagnosticado.frecuencia` + `primera_vez_ts`/`ultima_vez_ts` (señal recurrencia, CIERRE-2 §6 B); `KPI` (binding). Salida: decisión dispara/no-dispara C3b; sin conteo = no dispara. Reusar el contador de recurrencia.

**Constraints.** `≥N` desde config (BR-C3b-1/3). Sin conteo = no dispara (CIERRE-1 §3 default). Determinista. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `frecuencia ≥ N`, **When** corre, **Then** dispara C3b (spec REFORGE).
- **Given** sin conteo / `< N`, **When** corre, **Then** no dispara.
- **Check ejecutable:** tests "≥N → dispara / <N → no" — `[STACK-TUNE] <cmd:test>` filtro `US-C3b-1`.

---

### `05C:US-C3b-3` — Champion accept/edit/descartar (discovery queue)

**Goal.** Champion accept/edit/descartar en discovery queue = acción humana síncrona + UI surface + HUMAN-gate; estado tope = PREVIEW; sin LLM.

**Context.** Entradas: `gov.Artefacto_Generado` (`tipo=spec_reforge`, `estado=en_gate_humano`); `Ritual_Destino` (Discovery intake). Salida: `Artefacto_Generado.estado {auto_pasado|entregado|adopcion_nula}`; acción del champion → `gov.Decision_Trace` ligada a KPI. Reusar la discovery queue.

**Constraints.** Estado tope = PREVIEW (BR-C3b-2/7, EC-C3b-4). HUMAN-gate. "descartar" ⇒ loop C6. a11y. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** un `spec_reforge` en gate humano, **When** el champion acepta/edita/descarta, **Then** `estado` actualizado + acción → `Decision_Trace`.
- **Given** "descartar", **When** descarta, **Then** alimenta C6.
- **Check ejecutable:** test de la queue + transición de estados + caso descartar→C6 — `[STACK-TUNE] <cmd:test>` filtro `US-C3b-3`.

---

### `05C:US-C3d-2` — Humano crea/edita NBA desde cola de escalación

**Goal.** Humano crea/edita NBA desde cola (steps + métrica + fuente) = acción humana síncrona + UI/CRUD + HUMAN-gate; sin LLM.

**Context.** Entradas: cola de escalados (veredicto MISSING); `Knowledge_Case`. Salida: INSERT/UPDATE `tenant.Knowledge_Case.resolucao` (`steps[], metrica_objetivo_ref → KPI, fuente agregada`) flag='no-reforzado'; enlaza escalado origen. Reusar la cola de escalación.

**Constraints.** HUMAN-gate (CIERRE-2 §5, BR-C3d-4/5). Flag='no-reforzado' al crear. `metrica_objetivo_ref → KPI` validada (EC-C3d-8). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** un escalado MISSING, **When** el humano crea/edita NBA, **Then** `Knowledge_Case.resolucao` con flag='no-reforzado' + enlace al escalado.
- **Check ejecutable:** test de CRUD NBA + assert "flag=no-reforzado, KPI válido" — `[STACK-TUNE] <cmd:test>` filtro `US-C3d-2`.

---

### `05C:US-C3e-3` — 4-ojos gate (política borrador)

**Goal.** 4-ojos gate determinista: `estado pendiente_4ojos`, publicar exige 2 `Usuarios` distintos (IA=autor, no 2do ojo); gate + HUMAN-gate; sin LLM.

**Context.** Entradas: `gov.Artefacto_Generado` (`tipo=politica_borrador`); `Credencial`/`Usuario` (autor `≠` aprobador); `min_calculo.auto_liberable`. Salida: `Artefacto_Generado.estado {en_gate_humano|auto_pasado}`; `gov.Decision_Trace.confirmador_id` (`≠ proponente`, `independencia_garantida`); auto-pase solo si gate-1/gate-2 habilitan clase + evals. Reusar la columna GENERATED de independencia.

**Constraints.** Publicación exige 2 humanos distintos (BR-C3e-2/3, EC-C3e-4). IA=autor, nunca 2do ojo. Divergencia ⇒ fail-closed 4-ojos. COMPUTED-at-run. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** autor + aprobador distintos, **When** corre, **Then** publicable con `independencia_garantida=true`.
- **Given** IA como único firmante, **When** corre, **Then** bloqueado (no 2do ojo).
- **Check ejecutable:** tests "2 distintos → publica / IA sola → bloqueo" — `[STACK-TUNE] <cmd:test>` filtro `US-C3e-3`.

---

### `05C:US-C4-1` — Autoría/versionado KB criterios-de-bueno + few-shots

**Goal.** Autoría/versionado de KB criterios-de-bueno + few-shots por tipo (humano cura checks) = CRUD/UI síncrono + HUMAN-gate; checks almacenados; sin LLM en este paso.

**Context.** Entradas: KB por tipo (criterios versionados + few-shots pos/neg); `Intent_Catalog`/`Eval_Cell` version. Salida: `Eval_Cell` (version golden-set, `criterios_version`) — checks evaluables pasa/falla; ejemplo cross-tenant no-agregado invalida version (BR-C4-4). Reusar el catálogo `Eval_Cell`. **Señal de inyección logueada:** few-shot 'bueno' con dato cross-tenant no-agregado — rechaza version (BR-C4-4/EC-C4-3).

**Constraints.** Versionado (BR-C4-3/7). Cross-tenant no-agregado ⇒ invalida version. HUMAN cura. Sin cruzar `tenant_id`. Observabilidad: log de versionado.

**Done-when.**
- **Given** criterios + few-shots, **When** el humano cura, **Then** `Eval_Cell` versionado con checks evaluables.
- **Given** few-shot con dato cross-tenant no-agregado, **When** se valida, **Then** version rechazada.
- **Check ejecutable:** test de versionado + caso "cross-tenant → rechazo" — `[STACK-TUNE] <cmd:test>` filtro `US-C4-1`.

---

### `05C:US-C4-2` — Correr golden-set eval (liberado_evals/estado/kappa)

**Goal.** Correr el golden-set produce `liberado_evals`/`estado (rojo|verde)`/`kappa` = resultado de correr, no LLM-typed; producer determinista (`Eval_Cell`).

**Context.** Entradas: salida del generador (`Artefacto_Generado.contenido`); `Eval_Cell` (criterios + few-shots vigentes, version). Salida: `Eval_Cell.liberado_evals` + `.estado {rojo|verde}` + `kappa` (conservador inicial=rojo); veredicto a `gov.Decision_Trace`. Reusar el runner del golden-set.

**Constraints.** COMPUTED-at-run / NULL pre-corrida, conservador inicial=rojo (§14, BR-C4-1/2/6). Sin criterio claro ⇒ evals=0 congela autonomía. Feed a `min_calculo` (gate-3). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** salida + `Eval_Cell` vigente, **When** se corre el golden-set, **Then** `liberado_evals` + `estado` + `kappa` computados → feed gate-3.
- **Given** sin criterio claro, **When** corre, **Then** evals=0 (congela autonomía).
- **Check ejecutable:** test del runner con `estado`/`kappa` esperados computados por el test — `[STACK-TUNE] <cmd:test>` filtro `US-C4-2`.

---

### `05C:US-C4-3` — Few-shot canónico por tipo (store/retrieve)

**Goal.** Few-shot canónico por tipo como contexto de generador = KB content artifact (store/retrieve determinista), consumido por generadores; sin LLM en el store.

**Context.** Entradas: KB few-shots por tipo (formato equipo-destino, ej REFORGE/impacto-no-request). Salida: few-shot canónico servido a generadores; ejemplos negativos cubren hard-no por dirección. Reusar el store de few-shots.

**Constraints.** Ejemplos negativos cubren hard-no por dirección (BR-C4-4/7). Trazabilidad: generador cita ejemplo/criterio. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** un tipo de artefacto, **When** un generador pide contexto, **Then** se sirve el few-shot canónico + ejemplos negativos.
- **Check ejecutable:** test de retrieve + assert "ejemplos negativos presentes" — `[STACK-TUNE] <cmd:test>` filtro `US-C4-3`.

---

### `05C:US-C5-1` — Gate de metric-binding (rechaza sin metric_id válido)

**Goal.** Gate de metric-binding determinista: rechaza artefacto sin `metric_id` + baseline + ventana de catálogo cerrado; sin LLM.

**Context.** Entradas: catálogo cerrado de métricas = `KPI.kpi_id` + `Named_Query` (baseline, ventana) (CIERRE-2 §6 B). Salida: emisión bloqueada fail-closed con motivo estructurado si falta binding; métrica fuera de catálogo → escala humano. Reusar el gate de binding.

**Constraints.** Fail-closed sin binding (BR-C5-1, EC-C5-1/2). Métrica fuera de catálogo ⇒ escala (no auto-crea). Sin entrada al ledger sin métrica. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** `metric_id` + baseline + ventana válidos, **When** corre, **Then** entra al ledger.
- **Given** sin binding o fuera de catálogo, **When** corre, **Then** fail-closed + escala.
- **Check ejecutable:** tests "binding ok → ledger / sin binding → fail-closed" — `[STACK-TUNE] <cmd:test>` filtro `US-C5-1`.

---

### `05C:US-C5-3` — Atribución honesta (2 compuertas, agregado-anonimizado)

**Goal.** Atribución honesta (señal vs estacionalidad, 2 compuertas, agregado-anonimizado) = `ROI_Operador` job determinista (no separable = funnel-correlacional); sin LLM.

**Context.** Entradas: `gov.Decision_Trace` (acciones ligadas a KPI); `KPI.valor_hoy`; baseline estacional. Salida: `gov.ROI_Operador.ratio_1_10` + `es_atribuible` + `metodo_atribucion {funnel-correlacional='no separable'}`; cruce siempre agregado-anonimizado (cohort k-anon). Reusar el job de atribución 2 compuertas.

**Constraints.** COMPUTED-at-run / NULL pre-corrida (§14). No separable ⇒ funnel-correlacional (BR-C5-4/5, EC-C5-4). Cruce agregado-anonimizado (CIERRE-2 §6 D). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** acciones ligadas a KPI separables, **When** corre, **Then** `ratio_1_10` + `es_atribuible=true`.
- **Given** no separable, **When** corre, **Then** `metodo_atribucion=funnel-correlacional` (no confirma).
- **Check ejecutable:** tests "separable → atribuible / no separable → funnel" — `[STACK-TUNE] <cmd:test>` filtro `US-C5-3`.

---

### `05C:US-C6-1` — Capturar corrección humana como delta estructurado

**Goal.** Capturar corrección humana como delta estructurado (qué/por qué/criterio), cerrar caso antes de tocar template = CRUD síncrono al ledger + HUMAN; sin LLM.

**Context.** Entradas: corrección del humano-aprobador sobre `Artefacto_Generado`; criterio-de-bueno (`Eval_Cell`/KB). Salida: delta estructurado ligado a artefacto + dossier + tipo en `gov.Decision_Trace`; nivel-1 cierra sin tocar template (BR-C6-1); patrón solo anonimizado (BR-C6-5). Reusar el ledger.

**Constraints.** Nivel-1 cierra sin tocar template (BR-C6-1/6). Patrón solo anonimizado (BR-C6-5). Acumula delta al buffer del tipo. HUMAN. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** una corrección humana, **When** corre, **Then** delta estructurado al `Decision_Trace` + caso cerrado sin tocar template.
- **Check ejecutable:** test de captura de delta + assert "no toca template en nivel-1" — `[STACK-TUNE] <cmd:test>` filtro `US-C6-1`.

---

### `05C:US-C7-1` — Cola de aprobación por tipo (UI)

**Goal.** Approval-queue UI por tipo (muestra artefacto, métrica, evals, `nivel_efectivo`; aprobar/rechazar con motivo) = superficie síncrona + HUMAN-gate; sin LLM.

**Context.** Entradas: `gov.Artefacto_Generado` (por tipo); `Eval_Cell` (evals pasados/fallados + few-shot); `min_calculo.nivel_efectivo`; `KPI` (métrica vinculada bloqueante). Salida: render cola; aprobar → `gov.Decision_Trace` (aprobador, ts, `criterios_version`); rechazo con motivo estructurado → loop C6. Reusar el componente de cola.

**Constraints.** Métrica vinculada bloqueante (BR-C7-5/6, EC-C7-5). HUMAN-gate. Rechazo → `memory.md` C6. a11y. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** artefactos por tipo, **When** se renderiza la cola, **Then** cada uno muestra métrica + evals + `nivel_efectivo`.
- **Given** un humano aprueba/rechaza, **When** decide, **Then** sello en `Decision_Trace` / rechazo → C6.
- **Check ejecutable:** test de render + flujo aprobar/rechazar — `[STACK-TUNE] <cmd:test>` filtro `US-C7-1`.

---

### `05C:US-C8-3` — Reuse tracking (reuse_count, adopcion_nula)

**Goal.** Reuse tracking determinista (`reuse_count`, `ultimo_uso`, `adopcion_nula` tras N ciclos) = count()/trigger derivado del ledger; sin LLM.

**Context.** Entradas: `gov.Decision_Trace` + `Ritual_Destino` (uso en ritual). Salida: `Artefacto_Generado.reuse_count` + `ultimo_uso_ts` (count §14); 0 tras N ciclos → `estado=adopcion_nula`. Reusar el trigger/on-read derivado.

**Constraints.** COMPUTED-at-run / NULL pre-corrida vía count() (§14, BR-C8-7). 0 tras N ciclos ⇒ `adopcion_nula` ⇒ feed C6 + batch humano (EC-C8-7). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** uso en rituales, **When** corre, **Then** `reuse_count` + `ultimo_uso_ts` derivados.
- **Given** 0 reuse tras N ciclos, **When** corre, **Then** `estado=adopcion_nula` + feed C6.
- **Check ejecutable:** test "uso → count / 0 tras N → adopcion_nula" — `[STACK-TUNE] <cmd:test>` filtro `US-C8-3`.

---

## SPEC 05DE — Vitrina / Dashboard (piezas CÓDIGO)

> Invariante transversal 05DE: **VITRINA read-only (BR-DE1)** — ninguna pieza persiste un número de negocio; el único dato propio es la config de layout (`05DE:layout-config`). Marcas/estados derivados viven solo en la capa UI.

### `05DE:US-DE1.1` — Render-only de override + sello + cinta

**Goal.** Render-only de un número existente (override) + sello + cinta; sin LLM, apertura síncrona; persiste cero números de negocio.

**Context.** Trigger: usuario abre dashboard (síncrono, por pool vía RLS) — payload `Usuario.usuario_id`, `.tenant_id`. Entradas: `Salud_1a10` (North Star de fondo), `ROI_Operador.ratio_1_10`, `.es_atribuible`, `.metodo_atribucion`, `Afetado.silencioso`, `Processo_Critico.estado`; override deriva de `Decision_Trace.accion='override'` (read-only SELECT). Salida: render a UI only, persiste NO número de negocio; solo config propia de layout en `Config_Perillas`. Reusar el dashboard read-only.

**Constraints.** VITRINA read-only (BR-DE1/2/3/5/9). Cero números de negocio persistidos. Sin downstream trigger (§7.6). a11y del sello/cinta (texto + color). Sin cruzar `tenant_id` (RLS por pool).

**Done-when.**
- **Given** un usuario abre el dashboard, **When** se renderiza, **Then** muestra override + sello + cinta sin persistir número de negocio.
- **Given** la corrida, **When** se inspecciona la DB, **Then** solo cambia config de layout (si la hubo).
- **Check ejecutable:** test de render read-only + assert "no persiste número de negocio" — `[STACK-TUNE] <cmd:test>` filtro `US-DE1.1`.

---

### `05DE:US-DE2.1` — Render 2 curvas + marca ESTANCADO determinista

**Goal.** Render 2 curvas + marca ESTANCADO determinista (cost↓ AND intel-not↑ en ventana); threshold compare, sin LLM, síncrono; la marca vive solo en UI.

**Context.** Trigger: usuario abre dashboard / viewport héroe renderiza (síncrono) — payload `Usuario.usuario_id`, `.tenant_id`, `Config_Perillas.D` (ventana). Entradas: costo: `Conversa_Episodio.capa_metricas` (tokens, `n_re_contactos`), `KPI.valor_hoy`; inteligencia: `Knowledge_Case` (promovidos), `Politica_Tier.nacida_de_trace`, `Eval_Cell.estado` (rojo→verde via `min_calculo`), `Artefacto_Generado.reuse_count`; ventana `Config_Perillas.D` (read-only SELECT). Salida: flag ESTANCADO = comparación render-time derivada sobre valores leídos (COMPUTED-at-run, NULL/no-mark pre-corrida); persiste null — la marca existe solo en la capa UI. Reusar la vista de 2 curvas.

**Constraints.** VITRINA nunca persiste número de negocio (BR-DE1/9). Marca ESTANCADO derivada render-time (no persistida). Ventana `D` desde config. Sin downstream business trigger (§7.6). a11y. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** cost↓ AND intel-not↑ en ventana D, **When** se renderiza, **Then** marca ESTANCADO en UI (no persistida).
- **Given** condición no cumplida, **When** se renderiza, **Then** sin marca.
- **Check ejecutable:** test de la comparación ESTANCADO (con/sin condición) + assert "no persiste" — `[STACK-TUNE] <cmd:test>` filtro `US-DE2.1`.

---

### `05DE:US-DE3.1` — Drill on-demand de 3 lentes MECE + radar

**Goal.** Render drill on-demand de 3 lentes MECE + radar, colapsado por defecto; UI states, sin LLM, click síncrono; read-only.

**Context.** Trigger: usuario clic 'explícame'/drill (síncrono) — payload `Usuario.usuario_id`, `.tenant_id`. Entradas: lente Costo: `Conversa_Episodio.capa_metricas`, `KPI.valor_hoy`; lente Inteligencia: `Knowledge_Case`, `Eval_Cell.estado`, `Artefacto_Generado.reuse_count`, `min_calculo`; lente Gobierno: `Decision_Trace`, `ROI_Operador.ratio_1_10`; radar drift: `Eval_Cell.kappa`, `.estado` (read-only SELECT). Salida: render colapsado del drill a UI only, sin persist de negocio. Reusar el componente de drill colapsable.

**Constraints.** VITRINA read-only (BR-DE7, BR-DE1). Colapsado por defecto. Sin downstream trigger. a11y del colapsable (estado expandido/colapsado anunciado). Sin cruzar `tenant_id`.

**Done-when.**
- **Given** un clic 'explícame', **When** se renderiza, **Then** drill colapsado de 3 lentes + radar a UI, sin persistir negocio.
- **Check ejecutable:** test de drill + a11y del colapsable — `[STACK-TUNE] <cmd:test>` filtro `US-DE3.1` y `[STACK-TUNE] <cmd:a11y>`.

---

### `05DE:US-DE3.2` — Auto-degrade del sello DE1 a provisional (banda)

**Goal.** Check de umbral determinista: `Eval_Cell` banda fuera-de-límite ⇒ auto-degrade del sello DE1 a provisional; compare vs `Config_Perillas`, sin LLM, render síncrono; estado solo en UI.

**Context.** Trigger: dashboard render / banda `Eval_Cell` evaluada en read (síncrono, §7.4) — payload `Usuario.tenant_id`, `Config_Perillas.umbral_antifrac` (banda límite). Entradas: `Eval_Cell.estado`, `.kappa`, `.redteam_resultado_juez_vs_humano` (banda histórica por agente); `Config_Perillas` (umbral banda) (read-only SELECT). Salida: sello del veredicto degradado a 'provisional/no-confiable' = estado render-time derivado (COMPUTED-at-run, conservador/no-degrade pre-corrida); persiste null — el sello degradado vive solo en la UI (DE1). Reusar el sello DE1.

**Constraints.** VITRINA nunca persiste (BR-DE1/9). Sello degradado derivado render-time. Umbral desde `Config_Perillas`. Conservador pre-corrida (no-degrade). Sin downstream business trigger. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** banda `Eval_Cell` fuera de límite, **When** se renderiza, **Then** sello DE1 degradado a 'provisional' en UI (no persistido).
- **Given** banda dentro de límite, **When** se renderiza, **Then** sello normal.
- **Check ejecutable:** test "fuera de banda → provisional / dentro → normal" + assert "no persiste" — `[STACK-TUNE] <cmd:test>` filtro `US-DE3.2`.

---

### `05DE:layout-config` — Config de layout (único dato propio)

**Goal.** El único dato propio: config de layout (cuadros, pares bueno/cuidado, umbrales resaltados); config/CRUD determinista, síncrono; persiste config NO número de negocio.

**Context.** Trigger: operador configura el layout del dashboard (síncrono) — payload `Usuario.usuario_id`, `.tenant_id`. Entradas: `Config_Perillas` (`k_anon_threshold`, `n_min_threshold`, `TTL_baseline/stale T`, `umbral_antifrac`) para umbrales a resaltar (referencia read-only). Salida: `Config_Perillas` (config de layout: qué cuadros, qué pares bueno/cuidado, qué umbrales resaltan) — el ÚNICO dato propio; persiste config NO número de negocio (§4 "cero números nuevos"). Reusar el store de `Config_Perillas`.

**Constraints.** "Cero números nuevos" (§4): persiste solo config de layout, nunca número de negocio (BR-DE1). Sin downstream business trigger. a11y del configurador. Sin cruzar `tenant_id`.

**Done-when.**
- **Given** un operador configura el layout, **When** guarda, **Then** se persiste config de layout en `Config_Perillas`, sin número de negocio.
- **Check ejecutable:** test de CRUD de layout + assert "solo config, cero números de negocio" — `[STACK-TUNE] <cmd:test>` filtro `layout-config`.

---

## Notas de borde (no son piezas CÓDIGO construibles aquí)

Las siguientes piezas del registro **no** son CÓDIGO y por tanto no llevan framing build-ready en este archivo; se listan para que el constructor no las confunda con un faltante:

- **PENDIENTE (fail-closed, sin bucket decidible — no construir):** `02:EPIC-2-deferred`, `02:EPIC-3-deferred`, `02:WF-1D-mobile-PENDIENTE` (paridad móvil `[I]` needs-prototype), `03:EPIC-5` (HOST=P11, out-of-scope), `04:§9.3` (conector de ingest de `Evento_Uso` UNRATIFIED), `05C:CIERRE-2-§6-F-dato_del_como` (search-in-plaza no derivable de `Orden`, `[I]` needs-prototype).
- **Golden edge `all→Evento_Uso` NO reproducido (critic):** ninguna pieza del registro escribe `tenant.Evento_Uso`; el conector de escritura está UNRATIFIED (`04:§9.3`, bucket PENDIENTE). Mientras no se registre el productor (generador §12 demo o conector real por-tenant), los consumidores aguas abajo (KPI uso / `Salud_1a10` / pre-churn) deben **fail-closed-excluir** ese feed, no esperar datos vivos. No fabricar un productor CÓDIGO para `Evento_Uso` sin ratificación.
- **AGENTE / N8N (otros archivos del breakdown):** los pasos de juicio LLM (clasificación, generación, ranking, root-cause) y los contenedores de orquestación out-of-band no se especifican aquí.

## Cobertura (auto-chequeo del REJECTION TEST)

Toda pieza con `bucket=="CÓDIGO"` del registro congelado está incluida arriba con: **Goal** (outcome) · **Context** (schema EXACTO del 04 + patrones a reusar) · **Constraints** · **Done-when** (Given/When/Then + un **check ejecutable** con su comando `[STACK-TUNE] <cmd:...>`). Ninguna pieza referencia FILE 1 (mapa/registro AGENTE) ni FILE 3 (N8N); cada una es construible en aislamiento. Ninguna hard-codea un valor-resultado: los checks computan el valor esperado en el test desde los inputs (espejando la invariante §14 "resultado siempre computado / NULL pre-corrida / prohibido sembrar o tocar el test para pasar"). Los mismos `piece_id` mapean al mismo bucket CÓDIGO que en los otros dos archivos.

Correcciones del CRITIC aplicadas en este archivo: `05B:B.8.4` y `05B:B.8.5` — DATA-OUT persistido reapuntado a `Problema_Diagnosticado.dossier_emitido` (jsonb), `v_dossier_handoff` solo como proyección read-only (no sink). `02:MEJORA-D/GATE-2-XCHK` — el salto GATE-3 apunta a `02:WF-1B` (motor `least()` registrado), no a un phantom "GATE-3-min()". `01:F-1.3b` — `supresion_k_aplicada` resuelto como flag derivada render-only sobre `cohort.Subgrupo` (sin columna persistida), análogo a `02:WF-1B/BR-12-kanon`.
