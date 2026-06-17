# breakdown_CODE_AGENT.md — vista build-ready (CÓDIGO · ES)

> Proyección read-only del registro congelado. Solo piezas `CÓDIGO` (236). Cada pieza es construible en aislamiento (cero referencia a los otros 2 archivos).
> `[STACK-TUNE]`: los comandos reales de build/lint/type-check/test/a11y/security + umbrales viven en la guía del repo (`AGENTS.md`/`CLAUDE.md`); cada pieza los REFERENCIA, no los reinventa. Donde abajo se escribe `[STACK-TUNE: <comando>]`, sustituir por el comando real del repo.
> Contrato de build-quality (aplica a TODAS las piezas): reusar antes de crear (escanear containers/modals/hooks/utils existentes; crear solo declarando POR QUÉ el reuso es imposible) · unidad ≈ ≤100 líneas · production-ready (error-handling + casos borde + a11y + seguridad + observabilidad; cero dead-code; TODO = follow-up rastreado) · tests parte del Done · referenciar patrones/versiones existentes (no inventar APIs) · secretos por NOMBRE de env-var nunca el valor · prohibido hard-codear un valor-resultado o tocar el test para pasar (reward-hacking; espelha `04` §14).
> Vocab nativa uber_eats: `Restaurante`, `Orden`, `Evento_Uso` (no se traducen).

---

## 01:EPIC-6 — Orquestación on-demand de simulación de re-segmentación (sandbox efímero)

- **Goal:** un operador puede correr, dentro de su misma sesión, una simulación de re-segmentación que muestra el diff contra el snapshot vigente sin tocar nada real, y al cerrar la sesión el sandbox desaparece.
- **Context:** orquesta sincrónicamente las piezas `01:F-6.1` (botón disparador), `01:F-6.2` (diff simulado) y `01:F-6.3` (guard no-commit), todas `CÓDIGO`, con una HUMAN-gate (el operador pulsa el botón). Reusar el contenedor de pantalla y el patrón de modal/panel de `01:F-2.3` (panel de delta priorizado) en vez de crear superficie nueva; reusar el hook de sesión existente para el ciclo de vida del sandbox. Lee `Pertenencia_Cohort_Snapshot` (vigente), `Restaurante`, `Cohort_Rule_Version` vigente (`04` §3, zona cohort, k-anon `n_cuentas >= k_anon_threshold`, RLS single-pool). NO escribe `Pertenencia_Cohort_Snapshot` real, NO emite `Evento_Priorizado_NBA`, NO toca dinero (denylist sandbox `04` §14 / BR-19 / MF-6).
- **Constraints:** invocación SÍNCRONA in-app (no schedule). El sandbox es efímero, mismo-tenant, RLS single-pool, k-anon idéntico al flujo real. Por diseño NO dispara triggers downstream (`triggers_fired = null`). Observabilidad: loguear apertura/cierre del sandbox como `Evento_Uso` (append-only) sin grabar resultados de la simulación. La pieza referencia a sus 3 sub-piezas por `piece_id`, no recrea su lógica.
- **Done-when:**
  - *Given* un operador autenticado con un cohort vigente, *When* pulsa "correr ahora" y luego cierra la sesión, *Then* el diff se renderiza, ninguna fila real de `Pertenencia_Cohort_Snapshot` cambia y el sandbox queda destruido.
  - *Given* una simulación en curso, *When* termina, *Then* no se emite `Evento_Priorizado_NBA` ni se dispara ningún trigger downstream.
  - **Check ejecutable:** test e2e que corre la simulación y asserta `count(Pertenencia_Cohort_Snapshot)` y `count(Evento_Priorizado_NBA)` invariantes antes/después, más assert de que el sandbox se libera al cerrar sesión. `[STACK-TUNE: <comando e2e>]` + `[STACK-TUNE: <type-check>]`.

---

## 01:F-1.1 — Regla determinista de asignación celda-cohort + subgrupo (versionada)

- **Goal:** cada `Restaurante` queda asignado a su celda de cohort (`tenure_bucket × tier_base`) y subgrupo según la regla vigente, de forma reproducible y trazable a la versión de regla.
- **Context:** lógica determinista (sin LLM), render sincrónico. Lee `Restaurante.tier_base`, `Restaurante.fecha_alta` (deriva `tenure_bucket`), `Cohort_Rule_Version.version_id` vigente (`04` §3). Escribe la liga vía `Pertenencia_Cohort_Snapshot` (única liga `Restaurante↔Cohort`, `04` §3). Reusar la utilidad de buckets de tenure si ya existe; no duplicar el cálculo `hoy − fecha_alta` (ya es `Restaurante.tenure_actual` GENERATED, `04` §3). Cita `01:US-1.1.1`, `01:1A`, `01:BR-3`.
- **Constraints:** la `cohort_rule_version` se estampa por fila (BR-3; anti-mezcla de versiones, `04` §6). Bordes de `tenure_bucket` son `[C]` desde `Config_Perillas` por NOMBRE, nunca constantes hard-codeadas. Casos borde: `fecha_alta` nula o futura ⇒ estado conservador, no asignación silenciosa. ≤100 líneas.
- **Done-when:**
  - *Given* un `Restaurante` con `tier_base` y `fecha_alta` válidos, *When* corre la regla vigente, *Then* obtiene exactamente una celda+subgrupo con la `cohort_rule_version` vigente estampada.
  - *Given* dos corridas con la misma versión de regla, *When* se comparan, *Then* el resultado es idéntico (determinismo).
  - **Check ejecutable:** unit-test parametrizado por borde de bucket (incl. `fecha_alta` nula/futura) que asserta celda esperada y versión estampada. `[STACK-TUNE: <comando test>]`.

---

## 01:F-1.2 — Job batch de ranking: percentil / gap / dos baselines

- **Goal:** para cada cohort, computar de forma determinista el percentil y el gap-hasta-top de cada cuenta y los dos baselines de cohort, y persistirlos.
- **Context:** job batch (`Named_Query` de ranking, `04` §6 "Ranking → job batch P01"). DATA-IN: `Restaurante`, `Orden` (métricas de negocio — `recurrencia`/`cross_sell` se COMPUTAN de `Orden`, nunca columnas, `04` §3/§14), `Cohort`, `Subgrupo`, `Pertenencia_Cohort_Snapshot` (prev), `Cohort_Rule_Version`. DATA-OUT: `Pertenencia_Cohort_Snapshot.percentil_en_cohort` y `.gap_hasta_top` (producer = job batch P01 / `Named_Query` de ranking, `04` §14 · COMPUTED at run / NULL pre-run); `Cohort.baseline_descriptivo` y `.baseline_atribucion_segmento` (producer = job P01, `04` §14 · COMPUTED / NULL pre-run). Reusar el runner de `Named_Query` existente; no inventar un motor de ranking nuevo.
- **Constraints:** PROHIBIDO semear cualquier número-resultado; pre-corrida toda columna-resultado = NULL (`04` §14). Ejecutor Python/SQL determinista, nunca LLM. `cohort_rule_version` por fila (anti-mezcla). UNIQUE `(restaurante_id, cohort_id, semana, cohort_rule_version)` respetado. Observabilidad: `ultimo_calculo_ts`/provenance por fila.
- **Done-when:**
  - *Given* brutos semeados sin resultados, *When* corre el job, *Then* `percentil_en_cohort`/`gap_hasta_top`/baselines pasan de NULL a valores computados sobre `Orden`.
  - *Given* el estado pre-corrida, *When* corre el assert anti-fake, *Then* toda columna-resultado era NULL antes del job.
  - **Check ejecutable:** test anti-fake (CI) que corre tras el seed y ANTES del job y FALLA si alguna columna-resultado ≠ NULL (`04` §14, checklist §13); + test que verifica determinismo en dos corridas. `[STACK-TUNE: <comando test CI anti-fake>]`.

---

## 01:F-1.3 — Gate determinista n_min (colapso de célula)

- **Goal:** cada celda con muestra insuficiente queda marcada como colapsada/cualitativa en vez de reportar un percentil no significativo.
- **Context:** predicado determinista de umbral (sin LLM), sincrónico. Evalúa `n_min_threshold` (`04` §6, DOS constraints separadas de k-anon) sobre el conteo de la celda; setea `Cohort.colapsada` y `Pertenencia_Cohort_Snapshot.n_min_ok` + `modo` (`04` §3). Reusar el predicado de conteo de celda si existe; no fusionar con el CHECK k-anon de `01:F-1.3b` (son constraints distintas). Cita `01:BR-2`, `01:1B`.
- **Constraints:** `n_min_threshold` por NOMBRE desde `Config_Perillas`, nunca literal. n_min ≠ k-anon (no confundir significancia con re-identificación, `04` §6). Caso borde: conteo exactamente en el umbral ⇒ comportamiento definido y testeado. ≤100 líneas.
- **Done-when:**
  - *Given* una celda con conteo < umbral, *When* corre el gate, *Then* `n_min_ok=false` y `modo=cualitativo`.
  - *Given* conteo ≥ umbral, *When* corre el gate, *Then* `n_min_ok=true`.
  - **Check ejecutable:** unit-test de límite (umbral−1, umbral, umbral+1) que asserta `n_min_ok`/`colapsada`. `[STACK-TUNE: <comando test>]`.

---

## 01:F-1.3b — CHECK de k-anonimidad + flag de supresión

- **Goal:** ningún insight/perfil de cohort sale a la frontera cross-tenant si la celda no alcanza el umbral de k-anonimidad.
- **Context:** constraint determinista (sin LLM), sincrónico. DATA-IN: `Cohort.n_cuentas`, `Subgrupo`. DATA-OUT: `Cohort.supresion_k_aplicada` (CHECK `n_cuentas >= k_anon_threshold`; determinista, COMPUTED at run, `04` §3/§6). Implementar como CHECK/columna derivada en la frontera de SALIDA (`04` §3 "k-anon + flag en la frontera de salida"); reusar el patrón de CHECK existente de la zona cohort. Cita `01:BR-15`, `01:1A`.
- **Constraints:** `k_anon_threshold` por NOMBRE desde `Config_Perillas`, nunca literal. Es la frontera de SALIDA cross-tenant; no aplica al diagnóstico interno (`04` §6). Seguridad: la supresión es fail-closed (si el conteo no se puede computar ⇒ suprimir). Separada de n_min.
- **Done-when:**
  - *Given* una celda con `n_cuentas < k_anon_threshold`, *When* se intenta emitir insight, *Then* `supresion_k_aplicada=true` y el insight se suprime.
  - *Given* `n_cuentas >= k_anon_threshold`, *When* se emite, *Then* `supresion_k_aplicada=false`.
  - **Check ejecutable:** unit-test del CHECK en ambos lados del umbral + test de que conteo-indeterminado suprime (fail-closed). `[STACK-TUNE: <comando test>]`.

---

## 01:F-1.4 — Agregación P90+ por dimensiones canónicas → baseline_descriptivo

- **Goal:** poblar el perfil descriptivo de cada cohort con las características agregadas de su tramo P90+.
- **Context:** agregación determinista (sin LLM). DATA-IN: `Restaurante.atributos_vivos`, `Pertenencia_Cohort_Snapshot.percentil_en_cohort`. DATA-OUT: `Cohort.baseline_descriptivo` (jsonb; producer = job P01, `04` §14 · COMPUTED at run / NULL pre-run). Reusar el job batch P01 de `01:F-1.2` como host de la agregación si comparten corrida; no duplicar la lectura de percentil. Cita `01:BR-4`, `01:1B`.
- **Constraints:** PROHIBIDO semear `baseline_descriptivo`; NULL pre-run (`04` §14). `recurrencia`/`cross_sell` se computan de `Orden`, no se leen de `Restaurante` (denylist `04` §4). Respeta k-anon en la salida (depende de `01:F-1.3b`). Determinista.
- **Done-when:**
  - *Given* cuentas P90+ de una celda, *When* corre la agregación, *Then* `baseline_descriptivo` pasa de NULL a las características agregadas por dimensión canónica.
  - **Check ejecutable:** test que asserta `baseline_descriptivo = NULL` pre-corrida y poblado post-corrida, con valores derivados (no semeados) de los brutos. `[STACK-TUNE: <comando test anti-fake>]`.

---

## 01:F-1.6 — Comparación lado-a-lado topo-vs-base

- **Goal:** el operador ve, en una sola vista, las dimensiones canónicas del tramo top frente al tramo base de un cohort.
- **Context:** comparación determinista + superficie de render (sin LLM), sincrónica. Lee `Cohort.baseline_descriptivo` (top vs base) por dimensión canónica (`04` §3). Reusar el componente de tabla/diff comparativo existente (mismo patrón que el panel de delta de `01:F-2.3`); crear solo si no hay componente de comparación reutilizable, declarando por qué. Cita `01:US-1.1.6`, `01:1H`.
- **Constraints:** solo lee; no recomputa baselines (los produce `01:F-1.4`). a11y: tabla comparativa con headers asociados y orden de lectura lógico; estados loading/empty/error. No mezclar dimensiones de `cohort_rule_version` distintas (BR-3 vía `01:F-4.3`). ≤100 líneas.
- **Done-when:**
  - *Given* un cohort con `baseline_descriptivo` poblado, *When* se abre la comparación, *Then* se muestran top y base alineados por dimensión.
  - *Given* un cohort sin baseline (NULL), *When* se abre, *Then* se muestra estado empty conservador, no ceros falsos.
  - **Check ejecutable:** test de componente (render con baseline poblado / NULL) + check de a11y. `[STACK-TUNE: <comando test componente>]` + `[STACK-TUNE: <comando a11y>]`.

---

## 01:F-1.7 — UPSIDE = f(brecha × n_base) (proyección [C])

- **Goal:** mostrar, por cohort, la oportunidad-de-valor estimada como función determinista de la brecha contra top y el tamaño del tramo base.
- **Context:** fórmula determinista sobre `baseline_descriptivo` (sin LLM). DATA-IN: `Cohort.baseline_descriptivo`, `n_base` (count de `Pertenencia_Cohort_Snapshot`). DATA-OUT: `oportunidad_valor` = proyección `[C]` (campos/derivados de `Cohort.baseline_descriptivo`, `04` §3; producer = job P01, `04` §14 · COMPUTED / NULL pre-run; **nunca asciende a [V]**). Reusar el job P01; no inventar tabla UPSIDE (es phantom, denylist `04` §4 — son derivados de `Cohort.baseline_descriptivo`). Cita `01:BR-16`, `01:1H`.
- **Constraints:** la cifra es proyección-NO-medida; etiqueta visible en UI igual que Y1/Y2 de Salud_1a10 (`04` §14), nunca un número que parezca medido. PROHIBIDO semear; NULL pre-run. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* `baseline_descriptivo` y `n_base`, *When* corre la fórmula, *Then* `oportunidad_valor` se computa y se renderiza con el sello de proyección `[C]`.
  - *Given* sin baseline, *When* corre, *Then* el valor queda NULL/etiquetado, no un número fabricado.
  - **Check ejecutable:** unit-test de la fórmula con insumos conocidos (assert relación, no un literal sembrado) + assert de que el sello `[C]`/proyección está presente en el render. `[STACK-TUNE: <comando test>]`.

---

## 01:F-1.8 — baseline_cohort poblado con valor_actual_kpi por KPI (Named_Query)

- **Goal:** cada cohort tiene, por KPI, su valor actual medido de forma determinista para anclar el baseline.
- **Context:** medición determinista vía `Named_Query` (CÓDIGO #2 golden-set; "el cómo-se-mide lo ejecuta SIEMPRE Python/SQL, nunca un LLM", `04` §2). DATA-IN: `KPI.valor_hoy` vía `Named_Query.def_version`; `Orden` (conexión/recurrencia/cross_sell COMPUTADOS, `04` §14). DATA-OUT: `Cohort.baseline_descriptivo` (`valor_actual_kpi` por KPI; producer = `Named_Query`, `04` §14 · COMPUTED at run / NULL pre-run). Reusar el runner de `Named_Query` y el patrón de `01:F-1.2`; no duplicar el cómputo de métricas de `Orden`. Cita `01:BR-25`, `01:1B`.
- **Constraints:** ejecutor determinista nunca LLM. `kpi_def_version` por NOMBRE (`Named_Query.def_version`); KPI solo muestra número si `formula+periodicidad+group_by == def_version` citado (anti-mezcla, `04` §6). PROHIBIDO semear; NULL pre-run. Determinista.
- **Done-when:**
  - *Given* `Named_Query.def_version` y brutos `Orden`, *When* corre, *Then* `valor_actual_kpi` por KPI pasa de NULL a computado.
  - *Given* def_version distinta a la citada, *When* se intenta mostrar, *Then* no se muestra número (gate anti-mezcla).
  - **Check ejecutable:** test que corre la `Named_Query` y asserta valor derivado de `Orden` (no literal) + test anti-fake NULL-pre-run. `[STACK-TUNE: <comando test>]`.

---

## 01:F-2.1 — Render del semáforo (estados + síntesis de perfil embebida)

- **Goal:** el operador ve el estado de cada cohort en un semáforo con sus estados de carga/vacío/error correctos.
- **Context:** superficie de render/estados (sin LLM), sincrónica. Lee estados de cohort y embebe la síntesis de perfil (la síntesis-texto la produce `01:F-1.5` AGENTE; esta pieza solo la renderiza, no la genera). Reusar el componente de badge/semáforo del design-system si existe; crear solo declarando por qué. Cita `01:US-2.2.1`, `01:1D`.
- **Constraints:** solo render; no computa estados ni genera texto de síntesis. a11y: el color del semáforo NO es el único portador de significado (texto/ícono redundante); estados loading/empty/error explícitos. Cero dead-code. ≤100 líneas.
- **Done-when:**
  - *Given* un cohort con estado conocido, *When* se renderiza, *Then* el semáforo muestra el estado con etiqueta textual redundante al color.
  - *Given* datos no cargados, *When* se renderiza, *Then* aparece el estado loading/empty, no un verde-fake.
  - **Check ejecutable:** test de componente por estado + check de a11y (no-color-only). `[STACK-TUNE: <comando test componente>]` + `[STACK-TUNE: <comando a11y>]`.

---

## 01:F-2.2 — Diff de delta (snapshot_to vs snapshot_from)

- **Goal:** detectar y marcar, entre dos snapshots consecutivos, qué cambió para cada cuenta (delta_status).
- **Context:** comparación determinista (sin LLM). DATA-IN: `Pertenencia_Cohort_Snapshot` (vigente + anterior, mismo `tenant_id`, misma `cohort_rule_version`). DATA-OUT: `Evento_Priorizado_NBA.delta_status` (TRANSICION/MOVIMIENTO_LOG absorbido, `04` §3; producer = job diff P01, `04` §14 · COMPUTED at run / NULL pre-run). Reusar el job P01; no inventar tabla de transición (absorbida en `delta_status`, denylist `04` §4). Cita `01:BR-21`, `01:1C`.
- **Constraints:** el diff SOLO compara snapshots de la MISMA `cohort_rule_version` (anti-mezcla BR-3; ver `01:F-4.3`). Mismo `tenant_id` (RLS single-pool). PROHIBIDO semear `delta_status`; NULL pre-run. Determinista (mismos snapshots ⇒ mismo diff).
- **Done-when:**
  - *Given* dos snapshots consecutivos de la misma versión, *When* corre el diff, *Then* cada cuenta recibe su `delta_status` correcto (mudou_cohort/melhorou/baixou/at_risk/novo/churn).
  - *Given* snapshots de versiones distintas, *When* se intenta diffear, *Then* la operación se rechaza (anti-mezcla).
  - **Check ejecutable:** unit-test con pares de snapshots fixture que asserta `delta_status` esperado + test de rechazo cross-version. `[STACK-TUNE: <comando test>]`.

---

## 01:F-2.3 — Render del panel de delta priorizado (at_risk arriba)

- **Goal:** el operador ve el panel de deltas ordenado con las cuentas at_risk en la cima.
- **Context:** superficie de render/orden (sin LLM), sincrónica. Lee `Evento_Priorizado_NBA.delta_status` y ordena con at_risk primero. Reusar el componente de lista/tabla ordenable existente; este panel es el patrón reusable que otras piezas (`01:F-1.6`, `01:EPIC-6`) referencian. Cita `01:US-2.2.2`, `01:1D`.
- **Constraints:** solo render/orden; no recomputa deltas (los produce `01:F-2.2`). a11y: orden expuesto semánticamente, navegable por teclado; estados loading/empty/error. Cero dead-code. ≤100 líneas.
- **Done-when:**
  - *Given* un conjunto de deltas con varias cuentas at_risk, *When* se renderiza el panel, *Then* las at_risk aparecen arriba en el orden definido.
  - *Given* lista vacía, *When* se renderiza, *Then* estado empty explícito.
  - **Check ejecutable:** test de componente que asserta el orden (at_risk primero) + check a11y de navegación. `[STACK-TUNE: <comando test componente>]` + `[STACK-TUNE: <comando a11y>]`.

---

## 01:F-2.6 — Persistencia del LOG de movimiento (anclado a cohort_rule_version)

- **Goal:** queda registrado de forma append-only quién se movió entre cohorts, con la versión de regla estampada por fila.
- **Context:** write determinista append-only (sin LLM; el texto del POR QUÉ lo produce `01:F-2.4` AGENTE, no esta pieza). DATA-IN: `Evento_Priorizado_NBA.delta_status`, `Cohort_Rule_Version`. DATA-OUT: `Evento_Priorizado_NBA.delta_status` (MOVIMIENTO_LOG absorbido, `04` §3; `cohort_rule_version` estampada por fila; producer = job, `04` §14 · COMPUTED / NULL pre-run). Reusar el patrón de write append-only del job P01; no crear tabla de log nueva (absorbida, denylist `04` §4). Cita `01:US-2.2.5`, `01:BR-18`, `01:BR-3`, `01:1I`.
- **Constraints:** append-only (no update/delete del log). `cohort_rule_version` por fila (anti-mezcla BR-3). PROHIBIDO semear; NULL pre-run. Observabilidad: provenance por fila.
- **Done-when:**
  - *Given* un `delta_status` computado, *When* se persiste el movimiento, *Then* la fila lleva la `cohort_rule_version` vigente y es append-only.
  - **Check ejecutable:** test que inserta un movimiento y asserta append-only (un segundo write no muta el previo) + versión estampada. `[STACK-TUNE: <comando test>]`.

---

## 01:F-2.7 — Exponer gap_hasta_top como indicador-líder consumible

- **Goal:** el `gap_hasta_top` queda disponible como campo consumible (indicador líder) para downstream sin recálculo.
- **Context:** proyección de campo determinista (sin LLM), sincrónica. Lee `Pertenencia_Cohort_Snapshot.gap_hasta_top` (producido por `01:F-1.2`) y lo expone. Reusar el selector/serializador de snapshot existente; no recomputar el gap. Cita `01:BR-23`.
- **Constraints:** solo lectura/exposición; el gap lo produce el job de ranking. RLS single-pool (zona cohort). Sin números fabricados: si `gap_hasta_top` es NULL, se expone NULL/estado conservador. ≤100 líneas.
- **Done-when:**
  - *Given* un snapshot con `gap_hasta_top` poblado, *When* se consume el campo, *Then* se expone el valor sin recálculo.
  - *Given* `gap_hasta_top = NULL`, *When* se consume, *Then* se expone NULL, no un valor inventado.
  - **Check ejecutable:** unit-test que verifica pass-through del valor y manejo de NULL. `[STACK-TUNE: <comando test>]`.

---

## 01:F-3.1 — Panel de dinero (lee/linkea valor_confirmado_atribuible, nunca recalcula)

- **Goal:** el operador ve el impacto de negocio atribuible enlazado desde su dueño, sin que esta pantalla lo recalcule.
- **Context:** superficie read+link (sin LLM), sincrónica. DATA-IN: `ROI_Operador.impacto_negocio_atribuible` / `es_atribuible` (read-only link a su dueño P3/P11); `freshness_ts`. DATA-OUT: null (solo lee). Reusar el componente de panel de métrica/sello existente; no crear cálculo de dinero (el número es de su dueño, `04` §14). Cita `01:US-3.1.1`, `01:BR-9`, `01:1E`.
- **Constraints:** NUNCA recalcula dinero (lo produce P3/P11). Muestra `freshness_ts` y sello `confirmado/provisional/no-confiable`. Hard-no financiero: solo muestra impacto, no mueve saldo (`04` §7). a11y/estados. ≤100 líneas.
- **Done-when:**
  - *Given* `ROI_Operador` con valor atribuible, *When* se renderiza el panel, *Then* se muestra el valor enlazado con su `freshness_ts` y sello, sin recálculo local.
  - *Given* valor no atribuible, *When* se renderiza, *Then* se muestra estado conservador, nunca un gross/estimado fabricado.
  - **Check ejecutable:** test de componente (valor atribuible / no-atribuible) que asserta ausencia de cálculo local y presencia de sello. `[STACK-TUNE: <comando test componente>]`.

---

## 01:F-3.2 — Invariante "sin señal = 0, jamás gross/estimado"

- **Goal:** cuando no hay señal de impacto, el panel muestra 0/estado conservador y nunca un valor gross o estimado.
- **Context:** predicado guard determinista (sin LLM), sincrónico. Acompaña a `01:F-3.1`; evalúa la existencia de señal atribuible y fuerza 0/conservador. Reusar el guard de estados conservadores del patrón D+E (superficie humana del §14, `04` §3.6); no duplicar. Cita `01:BR-9`, `01:EC-4`.
- **Constraints:** fail-closed: sin señal ⇒ 0/conservador, nunca gross/estimado (`04` §14 "jamás verde-fake"). Determinista. Cubre el caso borde EC-4 explícitamente. ≤100 líneas.
- **Done-when:**
  - *Given* ausencia de señal de impacto, *When* corre el guard, *Then* el panel muestra 0/estado conservador.
  - *Given* señal presente, *When* corre el guard, *Then* deja pasar el valor atribuible de `01:F-3.1`.
  - **Check ejecutable:** unit-test del guard con señal/sin señal que asserta nunca-gross-ni-estimado en el caso sin-señal. `[STACK-TUNE: <comando test>]`.

---

## 01:F-3.3 — Panel de tickets (lee/linkea conteo de Support, nunca intake/close)

- **Goal:** el operador ve el conteo de tickets enlazado desde Support, por intent/cohort, sin gestionar tickets aquí.
- **Context:** superficie read+link (sin LLM), sincrónica. DATA-IN: `Conversa_Episodio` (tickets = señal cruda, link a Support; conteo por intent/cohort); `freshness_ts`. DATA-OUT: null. Reusar el componente de panel de conteo existente; no crear intake/close de tickets (no es competencia de esta pantalla). Cita `01:US-3.1.2`, `01:BR-11`, `01:1E`.
- **Constraints:** solo lee/linkea; nunca intake ni close de tickets. Muestra `freshness_ts`. RLS single-pool. a11y/estados loading/empty/error. ≤100 líneas.
- **Done-when:**
  - *Given* `Conversa_Episodio` con tickets, *When* se renderiza, *Then* se muestra el conteo enlazado por intent/cohort con su freshness.
  - *Given* sin tickets, *When* se renderiza, *Then* estado empty, no conteo fabricado.
  - **Check ejecutable:** test de componente (con/sin tickets) que asserta ausencia de acciones intake/close. `[STACK-TUNE: <comando test componente>]`.

---

## 01:F-3.4 — Conteo crudo ticket_type × cohort + distribución

- **Goal:** mostrar la distribución cruda de tickets por tipo y cohort, sin clasificar causas.
- **Context:** agregación determinista (sin LLM; NO es clasificación de causa). DATA-IN: `Conversa_Episodio.intent`, `Conversa_Episodio.cohort_id` (conteo crudo). DATA-OUT: null (deriva conteo para render). Reusar la utilidad de agregación/group-by existente; no invocar ningún clasificador LLM (la clasificación de causa NO es esta pieza). Cita `01:US-3.1.2`, `01:BR-11`, `01:MF-15`.
- **Constraints:** conteo crudo, NO clasificación (MF-15). Determinista. RLS single-pool; respeta k-anon en salida si la celda cae bajo umbral. Cero números fabricados. ≤100 líneas.
- **Done-when:**
  - *Given* episodios con `intent`/`cohort_id`, *When* corre la agregación, *Then* se obtiene la distribución `intent × cohort` por conteo crudo.
  - *Given* una celda bajo k-anon, *When* se agrega para salida, *Then* se suprime conforme a `01:F-1.3b`.
  - **Check ejecutable:** unit-test de la agregación con fixture conocido que asserta conteos (derivados, no semeados). `[STACK-TUNE: <comando test>]`.

---

## 01:F-4.1 — Modal de síntesis de cohort (renderiza definición + abre PERFIL)

- **Goal:** el operador abre un modal con la definición del cohort y puede saltar a su PERFIL.
- **Context:** superficie de render (shell de modal, sin LLM), sincrónica. DATA-IN: `Cohort.cohort_id`, `.tenure_bucket`, `.tier_base`, `.n_cuentas`, `Subgrupo.N_subgrupo`, `Cohort.baseline_descriptivo`, `Cohort.cohort_rule_version` (`04` §3). Reusar el componente de modal existente del design-system; crear solo declarando por qué. El PERFIL-texto lo produce `01:F-1.5` (AGENTE); este modal solo lo abre. Cita `01:US-4.1.1`, `01:1F`.
- **Constraints:** solo render; no genera la síntesis-texto. a11y de modal: focus-trap, cierre por Esc, `aria-modal`, retorno de foco al disparador. Estados loading/empty/error. ≤100 líneas.
- **Done-when:**
  - *Given* un `cohort_id` válido, *When* se abre el modal, *Then* se muestra la definición (bucket/tier/n_cuentas/versión) y el acceso a PERFIL.
  - *Given* el modal abierto, *When* se pulsa Esc, *Then* se cierra y el foco vuelve al disparador.
  - **Check ejecutable:** test de componente + check a11y de modal (focus-trap, Esc, retorno de foco). `[STACK-TUNE: <comando test componente>]` + `[STACK-TUNE: <comando a11y>]`.

---

## 01:F-4.2 — Timeline de changelog ML (lee Cohort_Rule_Version)

- **Goal:** el operador ve la línea de tiempo de versiones de regla de cohort con qué cambió y su efecto.
- **Context:** render determinista de filas almacenadas (sin LLM), sincrónico. DATA-IN: `Cohort_Rule_Version.version_id`, `.fecha`, `.que_cambio`, `.efecto_en_baseline`, `.provenance` (`04` §3). Reusar el componente de timeline/lista existente; no recomputar nada (solo lee filas). Cita `01:US-4.1.2`, `01:BR-13`, `01:1F`.
- **Constraints:** solo lectura de `Cohort_Rule_Version`. Ordenado por `fecha`. a11y: timeline con semántica de lista, navegable. Estados loading/empty/error. ≤100 líneas.
- **Done-when:**
  - *Given* varias versiones de regla, *When* se renderiza el timeline, *Then* aparecen ordenadas por fecha con `que_cambio`/`efecto_en_baseline`/`provenance`.
  - *Given* sin versiones, *When* se renderiza, *Then* estado empty.
  - **Check ejecutable:** test de componente que asserta el orden por fecha y el render de campos. `[STACK-TUNE: <comando test componente>]`.

---

## 01:F-4.3 — Invariante anti-mezcla de versiones (nunca mezclar baselines de cohort_rule_version distintas)

- **Goal:** ninguna vista combina baselines de versiones de regla distintas.
- **Context:** predicado guard determinista (sin LLM), sincrónico. Aplica el invariante A=B (`cohort_rule_version` estampada por fila; prohibido mezclar baselines, `04` §6) en los puntos de lectura (`01:F-1.6`, `01:F-2.2`, `01:F-4.2`). Reusar como guard compartido en el selector de snapshot/baseline; no duplicar la comprobación por pantalla. Cita `01:BR-3`, `01:EC-3`.
- **Constraints:** fail-closed: ante versiones mezcladas ⇒ rechazar/aislar, nunca renderizar mezcla (EC-3). Determinista. Observabilidad: loguear el intento de mezcla bloqueado. ≤100 líneas.
- **Done-when:**
  - *Given* baselines de la misma versión, *When* corre el guard, *Then* deja pasar.
  - *Given* baselines de versiones distintas, *When* corre el guard, *Then* se rechaza/aísla y se loguea.
  - **Check ejecutable:** unit-test que asserta pass mismo-version y reject cross-version (caso EC-3). `[STACK-TUNE: <comando test>]`.

---

## 01:F-5.1 — Drill matriz → celda → subgrupo → cuentas (ordenado por gap)

- **Goal:** el operador navega desde la matriz hasta las cuentas individuales, ordenadas por gap.
- **Context:** superficie de sort/render (sin LLM), sincrónica (user-action). DATA-IN: `Pertenencia_Cohort_Snapshot.percentil_en_cohort`, `.gap_hasta_top` (orden por gap, `04` §3). Reusar el componente de tabla drill-down/ordenable existente (mismo patrón que `01:F-2.3`); crear solo declarando por qué. Cita `01:US-5.1.1`, `01:1G`.
- **Constraints:** solo sort/render; el gap lo produce `01:F-1.2`. RLS single-pool. a11y: jerarquía navegable por teclado, orden expuesto semánticamente. Estados loading/empty/error. ≤100 líneas.
- **Done-when:**
  - *Given* una celda con cuentas, *When* se hace drill, *Then* las cuentas aparecen ordenadas por `gap_hasta_top`.
  - *Given* celda vacía, *When* se hace drill, *Then* estado empty.
  - **Check ejecutable:** test de componente que asserta el orden por gap a través de los niveles del drill. `[STACK-TUNE: <comando test componente>]`.

---

## 01:F-5.2 — Handoff: emite Evento_Priorizado_NBA en click síncrono (único output mutante)

- **Goal:** al confirmar el handoff, se emite un `Evento_Priorizado_NBA` para que NBA lo consuma — el único output mutante real de P01.
- **Context:** write determinista de evento en user-action síncrona + HUMAN-gate (TEST-2 = sync ⇒ CÓDIGO). TRIGGER-IN: operador confirma handoff (click in-app); payload `restaurante_id, cohort_id, subgrupo_id`. DATA-IN: `Pertenencia_Cohort_Snapshot.percentil_en_cohort`, `.gap_hasta_top`, `.n_min_ok`, `.freshness_ts`, `.scope_owner_ref`, `.cohort_rule_version`; `Usuario.usuario_id` (operador_id); `tenant_id` server-side (RLS). DATA-OUT: `Evento_Priorizado_NBA{evento_id, restaurante_id, cohort_id, subgrupo_id, percentil_en_cohort (null si sin-percentil), gap_hasta_top, delta_status, n_min_ok, freshness_ts, modo, cohort_rule_version, scope_owner_ref, operador_id}` (único output mutante; producer = evento sync, `04` §14 · NULL pre-run). TRIGGERS-FIRED: `Evento_Priorizado_NBA → P02 NBA`; append a `Evento_Uso` (append-only). Reusar el patrón de write de evento + append a `Evento_Uso` existente; no inventar tabla nueva. Cita `01:US-5.1.2`, `01:BR-14`, `01:BR-6`, `01:1G`.
- **Constraints:** `tenant_id` server-side (RLS single-pool), nunca del cliente. `risk_class` NO nace aquí (nace en P02, `04` §3). `cohort_rule_version` estampada. Seguridad: validar autorización del operador (scope_owner_ref). Idempotencia razonable ante doble-click. PROHIBIDO semear; NULL pre-run. Colisión registrada COL-13/COL-15 con `02:1A` ⇒ el contrato de payload `cohort_id/restaurante_id` debe coincidir con el `TRIGGER-IN` de `02:1A` (resuelto en el grafo de triggers).
- **Done-when:**
  - *Given* un operador autorizado en una cuenta priorizada, *When* confirma el handoff, *Then* se inserta exactamente un `Evento_Priorizado_NBA` con la versión estampada y se appendea `Evento_Uso`.
  - *Given* doble-click, *When* se confirma dos veces, *Then* no se duplica el evento (idempotencia).
  - **Check ejecutable:** integration-test que confirma el handoff y asserta una sola fila `Evento_Priorizado_NBA` + el append a `Evento_Uso` + `tenant_id` server-side; + test de round-trip de payload contra el `TRIGGER-IN` de `02:1A`. `[STACK-TUNE: <comando test integración>]`.

---

## 01:F-5.3 — Persistencia del snapshot semanal de percentil (serie temporal)

- **Goal:** queda persistido, semana a semana, el snapshot de percentil como serie temporal para North Star.
- **Context:** write determinista batch (sin LLM). DATA-IN: `Pertenencia_Cohort_Snapshot`, `Cohort.baseline_atribucion_segmento`. DATA-OUT: `Pertenencia_Cohort_Snapshot{snapshot_id, restaurante_id, cohort_id, subgrupo_id, semana, percentil_en_cohort, gap_hasta_top, cohort_rule_version, scope_owner_ref, provenance}` (UNIQUE `restaurante_id, cohort_id, semana, cohort_rule_version`; producer = job batch P01, `04` §14 · COMPUTED at run / NULL pre-run). Reusar el writer del job P01; no crear tabla de serie nueva. Cita `01:US-5.1.3`, `01:1B`, `01:1G`.
- **Constraints:** UNIQUE `(restaurante_id, cohort_id, semana, cohort_rule_version)` (anti-double-count semanal, `04` §3). `cohort_rule_version` por fila. PROHIBIDO semear; NULL pre-run. Determinista.
- **Done-when:**
  - *Given* un cómputo semanal, *When* se persiste, *Then* la fila respeta la clave UNIQUE y lleva la versión estampada.
  - *Given* re-corrida de la misma semana/versión, *When* se intenta insertar, *Then* no se duplica (constraint UNIQUE).
  - **Check ejecutable:** test que inserta dos veces la misma semana/versión y asserta el rechazo por UNIQUE + NULL-pre-run. `[STACK-TUNE: <comando test>]`.

---

## 01:F-5.4 — Conteo n_cohort_x_intent por celda cohort × intent

- **Goal:** queda disponible, por celda cohort×intent, el conteo de muestra que alimenta el gate downstream.
- **Context:** conteo determinista (sin LLM). DATA-IN: `Pertenencia_Cohort_Snapshot`, `Conversa_Episodio.intent`. DATA-OUT: `n_cohort_x_intent` (count derivado; mapea a `min_calculo.n_cohort` / `Eval_Cell.n_cohort_x_intent`; producer = job P01, `04` §14 · COMPUTED / NULL pre-run). Reusar la utilidad de group-by/count existente; no recomputar en la pantalla consumidora. Cita `01:BR-24`, `01:EC-14`.
- **Constraints:** conteo determinista. PROHIBIDO semear; NULL pre-run. RLS single-pool; respeta k-anon en salida cross-tenant. Caso borde EC-14 (celda vacía ⇒ 0/estado definido). ≤100 líneas.
- **Done-when:**
  - *Given* episodios con intent en una celda, *When* corre el conteo, *Then* `n_cohort_x_intent` se computa y mapea a `Eval_Cell.n_cohort_x_intent`.
  - *Given* celda sin episodios, *When* corre, *Then* 0/estado definido (EC-14).
  - **Check ejecutable:** unit-test del conteo con fixture conocido + caso celda-vacía. `[STACK-TUNE: <comando test>]`.

---

## 01:F-5.5 — Anotación scope_owner_ref{dueno_id, nivel}

- **Goal:** cada snapshot lleva la referencia de dueño/nivel que habilita los Goals con alcance por rol.
- **Context:** write determinista de campo (sin LLM). DATA-IN: `Usuario.usuario_id`, `Usuario.nivel_org`. DATA-OUT: `Pertenencia_Cohort_Snapshot.scope_owner_ref` (jsonb `{dueno_id, nivel}`; write determinista, `04` §3). Reusar el mapeo Usuario→scope existente; no duplicar la resolución de nivel. Cita `01:BR-23`.
- **Constraints:** `scope_owner_ref` jsonb conforme al schema `{dueno_id, nivel}`. Determinista. Seguridad: `dueno_id` validado contra `Usuario`; no aceptar nivel arbitrario del cliente. ≤100 líneas.
- **Done-when:**
  - *Given* un `Usuario` con `usuario_id`/`nivel_org`, *When* se anota el snapshot, *Then* `scope_owner_ref = {dueno_id, nivel}` queda escrito conforme al schema.
  - *Given* un `dueno_id` inexistente, *When* se intenta anotar, *Then* se rechaza (validación).
  - **Check ejecutable:** unit-test que asserta la forma del jsonb y el rechazo de dueño inválido. `[STACK-TUNE: <comando test>]`.

---

## 01:F-6.1 — Botón "correr ahora" (dispara sandbox efímero on-demand)

- **Goal:** el operador puede disparar, on-demand, una re-segmentación en sandbox efímero desde un botón en la sesión.
- **Context:** superficie de trigger/UI (sin LLM), sincrónica (user-action). Es el disparador del contenedor `01:EPIC-6`; invoca el diff `01:F-6.2` bajo el guard `01:F-6.3`. Reusar el componente de botón + el hook de sesión existente; no crear superficie nueva. Cita `01:US-6.1.1`, `01:1J`.
- **Constraints:** invocación SÍNCRONA in-app (no schedule). El botón refleja estado loading/disabled durante la corrida; previene doble-disparo. a11y: botón con label accesible y estado `aria-busy`. No persiste nada (delega el no-commit a `01:F-6.3`). ≤100 líneas.
- **Done-when:**
  - *Given* un cohort vigente, *When* el operador pulsa "correr ahora", *Then* se inicia la simulación y el botón pasa a estado busy/disabled.
  - *Given* una corrida en curso, *When* se vuelve a pulsar, *Then* no se dispara una segunda corrida.
  - **Check ejecutable:** test de componente que asserta el disparo único y los estados busy/disabled + check a11y. `[STACK-TUNE: <comando test componente>]` + `[STACK-TUNE: <comando a11y>]`.

---

## 01:F-6.2 — Diff simulado vs snapshot vigente (efímero)

- **Goal:** la simulación muestra cómo quedaría la re-segmentación frente al snapshot vigente, sin persistir.
- **Context:** comparación determinista efímera (misma lógica que el batch, sin LLM). DATA-IN: `Pertenencia_Cohort_Snapshot` (vigente), `Restaurante` (cuentas actuales), `Cohort_Rule_Version` vigente. DATA-OUT: SIMULACION efímera read-only (sandbox, `04` §14 denylist; NO data-out real, NO persiste como cohort real). Reusar la MISMA lógica de diff de `01:F-2.2` en modo sandbox; NO duplicar el motor de diff (declarar reuso). Cita `01:US-6.1.2`, `01:BR-19`, `01:1J`.
- **Constraints:** efímero, no-commit (delega a `01:F-6.3`). NO escribe `Pertenencia_Cohort_Snapshot` real (tabla SIMULACION es phantom, denylist `04` §4 — es view/sandbox read-only). Misma `cohort_rule_version` vigente (anti-mezcla). Determinista para mismos insumos.
- **Done-when:**
  - *Given* el snapshot vigente y las cuentas actuales, *When* corre el diff simulado, *Then* se muestra el resultado sin escribir ninguna fila real.
  - *Given* la simulación, *When* termina, *Then* `count(Pertenencia_Cohort_Snapshot)` real queda invariante.
  - **Check ejecutable:** test que corre el diff simulado y asserta cero escrituras reales (count invariante) + reuso de la lógica de `01:F-2.2`. `[STACK-TUNE: <comando test>]`.

---

## 01:F-6.3 — Invariante sandbox no-commit (mismos gates, sin persistir/handoff/versión/dinero)

- **Goal:** la simulación nunca persiste, nunca hace handoff, nunca cambia versión y nunca toca dinero, aunque pasa por los mismos gates que el flujo real.
- **Context:** conjunto de guards deterministas (sin LLM), sincrónico. Envuelve a `01:F-6.1`/`01:F-6.2` dentro de `01:EPIC-6`. Aplica los mismos gates (k-anon, n_min, anti-mezcla) que el flujo real pero bloquea todo efecto (`04` §14 denylist sandbox / BR-19 / MF-6). Reusar los predicados `01:F-1.3`/`01:F-1.3b`/`01:F-4.3` en modo read-only; no duplicar los gates. Cita `01:BR-19`, `01:MF-6`, `01:1J`.
- **Constraints:** fail-closed: cualquier intento de escritura/handoff/cambio-de-versión/movimiento-de-dinero dentro del sandbox se bloquea. No dispara triggers downstream. Observabilidad: loguear bloqueos como señal de seguridad (sin grabar el resultado simulado). Determinista.
- **Done-when:**
  - *Given* una simulación en curso, *When* intenta persistir/handoff/cambiar versión/mover dinero, *Then* el guard lo bloquea en los 4 casos.
  - *Given* la simulación, *When* corre, *Then* aplica los mismos gates k-anon/n_min/anti-mezcla que el flujo real (solo que sin efecto).
  - **Check ejecutable:** unit-test que ejercita los 4 intentos de efecto y asserta bloqueo en cada uno + assert de que los gates corren igual que en real. `[STACK-TUNE: <comando test>]`.

---
## 02 — NBA Playbooks (Cockpit de gobernanza) · piezas CÓDIGO

---

## 02:EPIC-1 — Cockpit de gobernanza (superficie UI/CRUD: listar + liberar/pausar)

- **Goal:** el operador ve la bandeja de NBAs propuestas por cohort y puede liberar/pausar en lote desde una sola superficie.
- **Context:** superficie UI/CRUD (sin LLM en el shell), user-action síncrona + HUMAN-gate. Reusar el contenedor de pantalla y la tabla/lista ordenable existentes; el render de filas vive en `02:F-1.1`, la acción liberar/pausar en `02:F-1.2`, el drill en `02:F-1.3` y la vista ROI en `02:F-1.4` — esta pieza es el shell que los compone, no recrea su lógica. Lee `NBA_Propuesta`, `min_calculo`, `Politica_Tier`, `Credencial` (`04` §3, zona cohort/gov, RLS single-pool). Cita `EPIC-1`.
- **Constraints:** invocación sync in-app. RLS `tenant_id` server-side (anti-spoofing, `04` §7). El shell no computa `nivel_efectivo` (lo produce `02:1B`/`min_calculo`). Estados loading/empty/error; a11y de navegación por teclado. Cero dead-code. ≤100 líneas (shell compositor; delega).
- **Done-when:**
  - *Given* un operador autorizado, *When* abre el cockpit, *Then* ve la bandeja por cohort con sus sub-superficies montadas.
  - *Given* un usuario fuera de scope, *When* intenta abrir, *Then* RLS bloquea (cero filas cross-pool).
  - **Check ejecutable:** test de integración del shell que asserta el montaje de sub-superficies + test RLS cross-pool. `[STACK-TUNE: <comando test integración>]`.

---

## 02:F-1.1 — Render de bandeja por cohort con min() visible

- **Goal:** cada fila de la bandeja muestra el `nivel_efectivo` (resultado de `min()`) de forma legible junto a su causa-raíz y pedido.
- **Context:** superficie de render (sin LLM), sync. DATA-IN: `NBA_Propuesta.cohort_id/causa_raiz/pedido_NBA`, `min_calculo.nivel_efectivo/auto_liberable`, `NBA_Propuesta.clase_financiera` (`04` §3). Reusar el componente de tabla del cockpit; no recomputar `min()` (lo produce `02:1B`). Cita `02:US-1.1.1`, `F-1.1`, `BR-4`.
- **Constraints:** solo lee/renderiza; `nivel_efectivo` viene de `min_calculo` (copia inmutable). a11y: columnas con headers asociados; estados loading/empty/error. RLS single-pool. ≤100 líneas.
- **Done-when:**
  - *Given* NBAs con `nivel_efectivo` computado, *When* se renderiza la bandeja, *Then* cada fila muestra el min() vigente sin recálculo local.
  - *Given* `min_calculo` sin filas (pre-corrida), *When* se renderiza, *Then* estado conservador, no número fabricado.
  - **Check ejecutable:** test de componente que asserta el render del min() leído (no recomputado) + estado pre-corrida. `[STACK-TUNE: <comando test componente>]`.

---

## 02:US-1.1.1 — Render de filas (causa-raíz, (pedido, liberado), nivel_efectivo + estados empty/dinero/cross-tenant)

- **Goal:** cada fila expone causa-raíz, el par (pedido_NBA, liberado_evals), el `nivel_efectivo` y sus estados especiales (vacío, dinero, cross-tenant).
- **Context:** superficie de render (sin LLM), sync. DATA-IN: `NBA_Propuesta.cohort_id/causa_raiz/pedido_NBA`, `min_calculo.liberado_evals/teto_tier/nivel_efectivo/auto_liberable`, `NBA_Propuesta.clase_financiera` (`04` §3). Reusar el componente de fila de `02:F-1.1`; no duplicar. Cita `US-1.1.1`, `BR-4`.
- **Constraints:** estado dinero (`clase_financiera=directa` ⇒ ALTO solo-propone, `04` §7) y estado cross-tenant explícitos. Solo render. a11y/estados. ≤100 líneas.
- **Done-when:**
  - *Given* una NBA con `clase_financiera=directa`, *When* se renderiza, *Then* la fila muestra el estado dinero (solo-propone), no un botón de auto-liberar.
  - *Given* un cohort vacío, *When* se renderiza, *Then* estado empty.
  - **Check ejecutable:** test de componente por estado (normal/dinero/cross-tenant/empty). `[STACK-TUNE: <comando test componente>]`.

---

## 02:US-1.1.1-a — Render de estimativa_impacto (kpi + delta + confianza) por acción

- **Goal:** cada acción muestra su estimativa de impacto (KPI, delta, confianza) como proyección etiquetada.
- **Context:** superficie de render de jsonb (sin LLM), sync. DATA-IN: `NBA_Propuesta.impacto_estimado` (jsonb `[C]`, `04` §3). Reusar el componente de sello/badge de proyección de `01:F-1.7`; no crear nuevo. Cita `US-1.1.1-a`, `BR-HON-3`.
- **Constraints:** la estimativa es proyección-NO-medida; etiqueta visible (igual que Y1/Y2 Salud_1a10, `04` §14), nunca número que parezca medido. `impacto_estimado` no entra en `min()` (`04` §14, BR-HON-4). Solo render. ≤100 líneas.
- **Done-when:**
  - *Given* una NBA con `impacto_estimado`, *When* se renderiza, *Then* se muestra kpi+delta+confianza con sello de proyección.
  - *Given* sin estimativa, *When* se renderiza, *Then* estado conservador, no cero fabricado.
  - **Check ejecutable:** test de componente que asserta presencia del sello de proyección. `[STACK-TUNE: <comando test componente>]`.

---

## 02:US-1.1.1-b — Etiqueta estimado-sin-histórico (metodo=sin_base ⇒ confianza=baja)

- **Goal:** cuando una estimativa no tiene base histórica, se fuerza y se muestra confianza=baja.
- **Context:** regla determinista de etiquetado (sin LLM), sync. DATA-IN: `NBA_Propuesta.impacto_estimado` (`04` §3). Reusar el mismo componente de badge de `02:US-1.1.1-a`; no duplicar. Cita `US-1.1.1-b`, `BR-IMP-CONF`.
- **Constraints:** determinista; `metodo=sin_base` ⇒ `confianza=baja` forzada (no opcional). Solo lectura/render del jsonb. ≤100 líneas.
- **Done-when:**
  - *Given* `impacto_estimado` con `metodo=sin_base`, *When* se renderiza, *Then* la confianza se muestra como baja.
  - **Check ejecutable:** unit-test que asserta confianza=baja cuando metodo=sin_base. `[STACK-TUNE: <comando test>]`.

---

## 02:US-1.1.1-c — Mostrar impacto_realizado solo si signal_de_resultado=true, si no 0

- **Goal:** el impacto realizado solo se muestra cuando hay señal de resultado; de lo contrario 0/conservador.
- **Context:** gate determinista de render (sin LLM), sync. DATA-IN: `NBA_Propuesta.impacto_realizado`, `ROI_Operador.signal_de_resultado` (`04` §3). Reusar el guard conservador de `01:F-3.2`; no duplicar. Cita `US-1.1.1-c`, `BR-HON-2`.
- **Constraints:** fail-closed: sin `signal_de_resultado=true` ⇒ `impacto_realizado=0` (`04` §14, BR-HON-2). `impacto_estimado` nunca se copia a `impacto_realizado` (BR-HON-1). Solo render. ≤100 líneas.
- **Done-when:**
  - *Given* `signal_de_resultado=false`, *When* se renderiza, *Then* se muestra 0, no la estimativa.
  - *Given* `signal_de_resultado=true`, *When* se renderiza, *Then* se muestra `impacto_realizado`.
  - **Check ejecutable:** unit-test del gate con señal/sin señal. `[STACK-TUNE: <comando test>]`.

---

## 02:US-1.1.2 — Render before/after + risk_class + estado no-reversible

- **Goal:** cada acción muestra su before/after esperado, su `risk_class` y si es no-reversible.
- **Context:** superficie de render (sin LLM), sync. DATA-IN: `NBA_Propuesta.before_after_esperado/risk_class` (`04` §3). Reusar componente de detalle de acción; no crear nuevo. Cita `US-1.1.2`.
- **Constraints:** `before_after_esperado` es proyección `[C]` etiquetada (`04` §14). `risk_class` se lee (derivado, nace en P02/`02:BR-M3-01`), no se recomputa aquí. a11y/estados. ≤100 líneas.
- **Done-when:**
  - *Given* una NBA con `risk_class=ALTO` no-reversible, *When* se renderiza, *Then* se muestran ambos con etiqueta clara.
  - **Check ejecutable:** test de componente por `risk_class`. `[STACK-TUNE: <comando test componente>]`.

---

## 02:F-1.2 — Liberar/Pausar lote (acción humana sync in-app + HUMAN-gate)

- **Goal:** el operador libera o pausa una NBA en lote por cohort/subgrupo con su firma, dentro de los guardrails.
- **Context:** UI/CRUD + HUMAN-gate (TEST-2 sync ⇒ CÓDIGO, no N8N — la propagación post-firma es `02:1E` N8N). DATA-IN: `min_calculo.nivel_efectivo/auto_liberable`, `Politica_Tier.policy_version`. DATA-OUT: `Liberacion_Lote{accion, nivel_resultante, operador_id, policy_version_validada}` (CRUD write, no campo-resultado); dispara firma `Decision_Trace`. Reusar el patrón de write de `Liberacion_Lote` + `Decision_Trace`; no inventar tabla. Cita `02:US-1.2.1`, `F-1.2`, `BR-9`, `BR-1`.
- **Constraints:** override SOLO BAJA: CHECK `nivel_resultante <= nivel_efectivo` (`04` §7, AUT-11). Sin-trace-no-acción: `Decision_Trace` append-only es precondición (`04` §7). `tenant_id` server-side. PROHIBIDO semear `nivel_efectivo`. ≤100 líneas.
- **Done-when:**
  - *Given* `nivel_resultante <= nivel_efectivo` y firma válida, *When* se libera, *Then* se escribe `Liberacion_Lote` y el `Decision_Trace` previo.
  - *Given* `nivel_resultante > nivel_efectivo`, *When* se intenta, *Then* el CHECK rechaza (override-solo-baja).
  - *Given* fallo al escribir `Decision_Trace`, *When* se intenta liberar, *Then* la acción no procede (sin-trace-no-acción).
  - **Check ejecutable:** test que asserta rechazo de override-sube + precondición de trace + write correcto. `[STACK-TUNE: <comando test integración>]`.

---

## 02:US-1.2.1 — Click + firma liberar/pausar escribe Liberacion_Lote + Decision_Trace

- **Goal:** el click+firma del operador persiste la acción y su traza de forma atómica.
- **Context:** user-action sync + HUMAN-gate ⇒ CÓDIGO. DATA-IN: `min_calculo.auto_liberable/nivel_efectivo`, `Politica_Tier.policy_version`. DATA-OUT: `Liberacion_Lote.accion/nivel_resultante/operador_id/policy_version_validada` (CRUD write); `Decision_Trace.firma` disparado post-write. Reusar el flujo de `02:F-1.2`; no duplicar. Cita `US-1.2.1`, `BR-9`, `BR-1`.
- **Constraints:** atomicidad write `Liberacion_Lote` ↔ `Decision_Trace` (sin-trace-no-acción, `04` §7). override-solo-baja. `policy_version_validada` estampada. ≤100 líneas.
- **Done-when:**
  - *Given* firma válida, *When* se confirma, *Then* `Liberacion_Lote` y `Decision_Trace` quedan escritos consistentemente.
  - *Given* rollback del trace, *When* falla, *Then* no queda `Liberacion_Lote` huérfana.
  - **Check ejecutable:** test transaccional que asserta atomicidad write+trace. `[STACK-TUNE: <comando test>]`.

---

## 02:US-1.2.2 — Validación determinista vs Politica_Tier.policy_version al liberar

- **Goal:** ninguna liberación procede sin validar la versión de política vigente, fail-closed si no se resuelve.
- **Context:** artefacto rule-check (sin LLM), sync. DATA-IN: `Politica_Tier.policy_version/permitido_hoy/resultado_medido/como_se_mide` (`04` §3). Reusar el resolutor de política versionada; no duplicar. Cita `US-1.2.2`, `BR-6`.
- **Constraints:** fail-closed: `policy_version` no resoluble ⇒ pausa lote (no procede, `04` §7 EC-3). Determinista. `04` §7 TRES PUERTAS gate-2. ≤100 líneas.
- **Done-when:**
  - *Given* `policy_version` vigente, *When* valida, *Then* deja pasar.
  - *Given* `policy_version` irresoluble, *When* valida, *Then* fail-closed (pausa).
  - **Check ejecutable:** unit-test resoluble/irresoluble que asserta el fail-closed. `[STACK-TUNE: <comando test>]`.

---

## 02:F-1.3 — Drill a subgrupo (2 niveles, mismos invariantes)

- **Goal:** el operador baja de cohort a subgrupo manteniendo los mismos guardrails de liberación.
- **Context:** UI/CRUD render + acción (sin LLM), sync + HUMAN-gate. DATA-IN: `Cohort`, `Subgrupo`, `min_calculo`. Reusar el drill de `01:F-5.1` y los guards de `02:F-1.2`; no duplicar. Cita `F-1.3`.
- **Constraints:** máx 2 niveles (`04` §3, sin anidamiento infinito). Mismos invariantes (override-solo-baja, k-anon). RLS single-pool. a11y/estados. ≤100 líneas.
- **Done-when:**
  - *Given* un cohort con subgrupos, *When* se hace drill, *Then* el subgrupo expone las mismas acciones con los mismos guards.
  - **Check ejecutable:** test de componente del drill + assert de invariantes heredados. `[STACK-TUNE: <comando test componente>]`.

---

## 02:US-1.3.1 — Liberar/pausar subgrupo escribe su Decision_Trace + supresión k-anon

- **Goal:** una acción a nivel subgrupo escribe su propia traza y respeta la supresión k-anon.
- **Context:** user-action sync + HUMAN-gate ⇒ CÓDIGO. DATA-IN: `NBA_Propuesta.subgrupo_id`, `min_calculo.nivel_efectivo`, `Cohort.supresion_k_aplicada/n_cuentas`. DATA-OUT: `Liberacion_Lote.subgrupo_id` (CRUD write); `Decision_Trace` por subgrupo. Reusar `02:US-1.2.1`; no duplicar. Cita `US-1.3.1`, `BR-12`.
- **Constraints:** k-anon: si `n_cuentas < k_anon_threshold` ⇒ supresión en salida (`04` §7). Cada subgrupo su `Decision_Trace` (sin-trace-no-acción). override-solo-baja. ≤100 líneas.
- **Done-when:**
  - *Given* un subgrupo sobre umbral k, *When* se libera, *Then* se escribe su `Liberacion_Lote.subgrupo_id` + `Decision_Trace`.
  - *Given* subgrupo bajo umbral k, *When* se intenta emitir insight, *Then* se suprime.
  - **Check ejecutable:** test que asserta trace por subgrupo + supresión bajo k. `[STACK-TUNE: <comando test>]`.

---

## 02:F-1.4 — Vista ROI + guardrail (lee resultados computados de ROI_Operador)

- **Goal:** el operador ve el ratio 1:10, el guardrail y el método de atribución sin que esta vista los recalcule.
- **Context:** superficie de render (sin LLM), sync. DATA-IN: `ROI_Operador.ratio_1_10/guardrail_error/metodo_atribucion/horizonte_medido/es_atribuible` (read-only). Reusar el panel de métrica de `01:F-3.1`; no crear cálculo. Cita `F-1.4`.
- **Constraints:** NUNCA recalcula ROI (lo produce el job P02/`02:1E`). 2-compuertas: solo cuenta si `es_atribuible` AND confirmado (`04` §7). Sello provenance. ≤100 líneas.
- **Done-when:**
  - *Given* `ROI_Operador` computado, *When* se renderiza, *Then* muestra ratio/guardrail/método sin recálculo.
  - **Check ejecutable:** test de componente que asserta ausencia de cálculo local. `[STACK-TUNE: <comando test componente>]`.

---

## 02:US-1.4.1 — Render ratio_1_10 / guardrail / metodo_atribucion / horizonte + estado n<20

- **Goal:** la vista expone los campos de ROI y muestra el estado n<20 cuando la muestra es insuficiente.
- **Context:** superficie de render (sin LLM), sync. DATA-IN: `ROI_Operador.ratio_1_10/guardrail_error/metodo_atribucion/horizonte_medido/es_atribuible`, `min_calculo.n_cohort` (`04` §3). Reusar `02:F-1.4`; no duplicar. Cita `US-1.4.1`, `BR-7`, `BR-10`.
- **Constraints:** estado n<20 (`n_min`, BR-10) explícito, no número engañoso. Solo lee resultados. ≤100 líneas.
- **Done-when:**
  - *Given* `n_cohort < 20`, *When* se renderiza, *Then* se muestra el estado n<20 en vez de un ratio no-significativo.
  - **Check ejecutable:** test de componente con n por debajo/encima de 20. `[STACK-TUNE: <comando test componente>]`.

---

## 02:US-C-cuadrante — Render chip cuadrante riesgo×impacto + ordenar lista

- **Goal:** cada acción muestra un chip de cuadrante riesgo×impacto y la lista se ordena por ese cuadrante.
- **Context:** render de campo derivado (sin LLM), sync. DATA-IN: `NBA_Propuesta.risk_class/impacto_estimado` (`04` §3). Reusar el componente de chip/badge existente; no crear. Cita `US-C-cuadrante`, `BR-M3-01`.
- **Constraints:** `risk_class` se lee (derivado peor-caso, `02:BR-M3-01`), no se recomputa. `impacto_estimado` es proyección etiquetada. Solo render/orden. ≤100 líneas.
- **Done-when:**
  - *Given* acciones con `risk_class`/`impacto_estimado`, *When* se renderiza, *Then* el chip de cuadrante aparece y la lista se ordena por cuadrante.
  - **Check ejecutable:** test de componente que asserta chip + orden. `[STACK-TUNE: <comando test componente>]`.

---

## 02:US-D-credencial — Mostrar autoridad usada / rutear credencial faltante a revisión

- **Goal:** la UI muestra qué autoridad se usó y rutea a revisión cuando falta credencial.
- **Context:** gate render (sin LLM), sync + HUMAN-gate. DATA-IN: `Credencial.rol/estado/rbac_matriz` (`04` §3). Reusar el componente de estado/badge; no crear. Cita `US-D-credencial`, `BR-CRED-3`.
- **Constraints:** TRES PUERTAS gate-1 (Credencial RESTRINGE, nunca amplía, `04` §7). Liberar/drill exige `agent_manager_junior+`. Sin credencial ⇒ ruta a revisión (fail-closed). ≤100 líneas.
- **Done-when:**
  - *Given* credencial suficiente, *When* se renderiza, *Then* se muestra la autoridad usada.
  - *Given* credencial faltante/insuficiente, *When* se intenta acción, *Then* se rutea a revisión.
  - **Check ejecutable:** test de componente con credencial suficiente/insuficiente. `[STACK-TUNE: <comando test componente>]`.

---

## 02:1B — Motor min(): nivel_efectivo = least(...) + validar política + detectar dinero/cross-tenant

- **Goal:** computar de forma determinista `nivel_efectivo` y detectar dinero/cross-tenant para gobernar cada acción.
- **Context:** motor `least()` (CÓDIGO #3 golden-set), sync. DATA-IN: `NBA_Propuesta.pedido_NBA/clase_financiera`, `Eval_Cell.liberado_evals`, `Politica_Tier.teto_tier/policy_version`, `NBA_Propuesta.risk_class`. DATA-OUT: `min_calculo.nivel_efectivo` (producer = motor runtime, `04` §14 · COMPUTED at run / NULL pre-run, sin filas pre-corrida). Reusar el motor `least()` de `min_calculo`; no duplicar. Cita `(1B)`, `BR-2`, `BR-3`, `BR-12`.
- **Constraints:** fail-closed: brazo null ⇒ menor conocido; empate/indeterminación ⇒ mínima autonomía (`04` §7). CHECK `nivel_efectivo = least(pedido_NBA, liberado_evals, teto_tier)` sobre ENUM ordenado. `clase_financiera=directa` ⇒ ALTO solo-propone. Cross-tenant (>1 `tenant_id`) ⇒ bloqueo rojo. `impacto_estimado` NO entra al min() (BR-HON-4). `min_calculo` nunca semeado (`04` §14). append-only.
- **Done-when:**
  - *Given* tres brazos válidos, *When* corre el motor, *Then* `nivel_efectivo = least(...)` correcto.
  - *Given* un brazo null, *When* corre, *Then* cae al menor conocido (fail-closed).
  - *Given* estado pre-corrida, *When* se inspecciona, *Then* `min_calculo` no tiene filas.
  - **Check ejecutable:** unit-test del `least()` (incl. brazo null, empate) + test anti-fake (sin filas pre-corrida). `[STACK-TUNE: <comando test>]`.

---

## 02:1C — Agent-manager libera/pausa lote + firma (acción humana sync)

- **Goal:** el agent-manager confirma la liberación/pausa del lote con su firma dentro de los guards.
- **Context:** acción humana sync in-app = CÓDIGO/UI + HUMAN-gate (no N8N). DATA-IN: `min_calculo.nivel_efectivo/auto_liberable`, `NBA_Propuesta.before_after_esperado`. DATA-OUT: `Liberacion_Lote.accion/nivel_resultante/operador_id` (CRUD write). Reusar `02:F-1.2`; no duplicar. Cita `(1C)`, `BR-1`, `BR-9`, `BR-8`.
- **Constraints:** override-solo-baja; sin-trace-no-acción; paridad móvil (`origen=movil` estampado, mismos guardrails, `04` §7). ≤100 líneas.
- **Done-when:**
  - *Given* firma válida desde desktop o móvil, *When* libera, *Then* se aplican idénticos guardrails y se estampa `origen`.
  - **Check ejecutable:** test que asserta paridad de guardrails desktop vs móvil. `[STACK-TUNE: <comando test>]`.

---

## 02:1D — Drill subgrupo: decisión liberar/pausar con el mismo min()

- **Goal:** la decisión a nivel subgrupo reusa el mismo `min()` y los mismos guards que el cohort.
- **Context:** acción humana sync = CÓDIGO/UI + HUMAN-gate. DATA-IN: `NBA_Propuesta.subgrupo_id`, `min_calculo.nivel_efectivo`, `Cohort.supresion_k_aplicada`. DATA-OUT: `Liberacion_Lote.subgrupo_id` (CRUD write). Reusar `02:F-1.3`/`02:1C`; no duplicar. Cita `(1D)`, `BR-12`.
- **Constraints:** k-anon en salida; override-solo-baja; máx 2 niveles. ≤100 líneas.
- **Done-when:**
  - *Given* un subgrupo, *When* se decide liberar, *Then* usa el mismo `nivel_efectivo` y respeta k-anon.
  - **Check ejecutable:** test que asserta reuso del min() y supresión k. `[STACK-TUNE: <comando test>]`.

---

## 02:MEJORA-D-ENTITIES — Schema canónico de credenciales (ROL_PERMISO/CREDENCIAL_AUDIT → Credencial)

- **Goal:** las entidades de credenciales que el spec nombra fuera del allowlist se materializan sobre el schema canónico `Credencial`.
- **Context:** schema/CRUD determinista (sin LLM), sync. El spec nombra `ROL_PERMISO`/`CREDENCIAL_AUDIT`/`base_de_credenciales.md` que NO están en el allowlist; el canónico es `Credencial.rbac_matriz`/`audit_divergencia` (`04` §3). DATA-IN: `Credencial.credencial_id/rol/estado/rbac_matriz/audit_divergencia/credential_policy_pin`. Reusar la entidad `Credencial` (RBAC materializado como matriz jsonb); NO crear tablas `ROL_PERMISO`/`CREDENCIAL_AUDIT` (denylist `04` §4 — son la `rbac_matriz`/`audit_divergencia`). Cita `DECISION_TRACE`, `CREDENCIAL`, `ROL_PERMISO`, `CREDENCIAL_AUDIT`.
- **Constraints:** mapear RBAC a `Credencial.rbac_matriz` (jsonb rol×accion_clase→nivel_max_liberable/requiere_2_ojos/origen_permitido). `nivel_max_liberable` nunca supera `teto_tier` (`04` §3). credencial por-`tenant_id`. ≤100 líneas (DDL/migración acotada).
- **Done-when:**
  - *Given* el modelo de credenciales, *When* se materializa, *Then* usa `Credencial.rbac_matriz`/`audit_divergencia`, sin tablas phantom.
  - *Given* un intento de `nivel_max_liberable > teto_tier`, *When* se valida, *Then* el CHECK lo rechaza.
  - **Check ejecutable:** test de migración + test del CHECK `nivel_max_liberable <= teto_tier`. `[STACK-TUNE: <comando migración/test>]`.

---


## 02:BR-1 — Override solo BAJA (CHECK nivel_resultante <= nivel_efectivo)

- **Goal:** ningún override sube la autonomía por encima del `nivel_efectivo` calculado.
- **Context:** constraint determinista (sin LLM), sync. DATA-IN: `Liberacion_Lote.nivel_resultante`, `min_calculo.nivel_efectivo`. Reusar el CHECK de la columna `Liberacion_Lote` (`04` §3); no duplicar en código de app. Cita `BR-1`.
- **Constraints:** CHECK `nivel_resultante <= nivel_efectivo` sobre el ENUM ordenado (AUT-11, `04` §7). Determinista. Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* `nivel_resultante <= nivel_efectivo`, *When* se inserta, *Then* pasa.
  - *Given* `nivel_resultante > nivel_efectivo`, *When* se inserta, *Then* el CHECK rechaza.
  - **Check ejecutable:** test del CHECK en ambos lados del límite. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-2 — Dinero (saldo) clase_financiera=directa ⇒ techo ALTO solo-propone

- **Goal:** toda acción que mueve saldo queda capada a solo-propone (nunca auto-libera dinero).
- **Context:** predicado guard determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.clase_financiera/risk_class`. Reusar el guard de clasificación financiera del motor; no duplicar. Cita `BR-2`.
- **Constraints:** `clase_financiera=directa` ⇒ `risk_class=ALTO` ⇒ IA solo PROPONE (hard-no financiero por efecto, `04` §7). Determinista. Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* `clase_financiera=directa`, *When* corre el guard, *Then* la acción queda solo-propone (no auto-libera).
  - **Check ejecutable:** unit-test que asserta solo-propone para directa. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-3 — Bloqueo cross-tenant (RLS sobre tenant_id)

- **Goal:** ninguna acción o agregación cruza `tenant_id` (pool).
- **Context:** predicado RLS determinista (sin LLM), sync. DATA-IN: `Restaurante.tenant_id` (RLS single-pool). Reusar la política RLS Postgres `WHERE tenant_id = current_pool()` (`04` §7/§8); no reimplementar en app. Cita `BR-3`.
- **Constraints:** abortar + bloqueo rojo + log seguridad si una agregación toca >1 `tenant_id`. `tenant_id` server-side de la credencial (anti-spoofing). Cruzar restaurantes DENTRO del pool es permitido. ≤100 líneas.
- **Done-when:**
  - *Given* una consulta dentro de un pool, *When* corre, *Then* ve solo su pool.
  - *Given* una agregación cross-pool, *When* corre, *Then* aborta con bloqueo rojo + log.
  - **Check ejecutable:** test RLS que asserta aislamiento entre pools y aborto cross-pool. `[STACK-TUNE: <comando test RLS>]`.

---

## 02:BR-4 — nivel_efectivo = min(...) siempre renderizado + computado, brazo null fail-closed

- **Goal:** el `nivel_efectivo` se computa y muestra siempre, con fail-closed ante brazo indisponible.
- **Context:** motor `least()` determinista (sin LLM), sync. DATA-IN: `min_calculo.pedido_NBA/liberado_evals/teto_tier/nivel_efectivo`. Reusar el motor de `02:1B`/`min_calculo`; no duplicar. Cita `BR-4`.
- **Constraints:** CHECK motor `nivel_efectivo = least(...)`; brazo null ⇒ menor conocido (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un brazo null, *When* corre el motor, *Then* `nivel_efectivo` cae al menor conocido.
  - **Check ejecutable:** unit-test del fail-closed con brazo null. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-5 — Auto-liberable sii BAJO ∧ reversible/idempotente bajo lock

- **Goal:** una acción solo es auto-liberable si cumple el predicado booleano completo.
- **Context:** predicado booleano determinista (sin LLM), sync. DATA-IN: `min_calculo.nivel_efectivo/auto_liberable`. Reusar el AND-de-6 de `min_calculo.auto_liberable` (`04` §3); no duplicar. Cita `BR-5`.
- **Constraints:** `auto_liberable = BAJO ∧ reversible/idempotente ∧ no-dinero ∧ no-cross-tenant ∧ validada-política ∧ N>=k` (`04` §3). Determinista. Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* todos los términos verdaderos, *When* corre, *Then* `auto_liberable=true`.
  - *Given* un término falso, *When* corre, *Then* `auto_liberable=false`.
  - **Check ejecutable:** unit-test parametrizado por cada término del AND. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-6 — Validar vs Politica_Tier versionada, fail-closed si irresoluble

- **Goal:** toda acción valida contra la versión de política y falla cerrada si no se resuelve.
- **Context:** resolución determinista (sin LLM), sync. DATA-IN: `Politica_Tier.policy_version/permitido_hoy`. Reusar el resolutor de `02:US-1.2.2`; no duplicar. Cita `BR-6`.
- **Constraints:** fail-closed si irresoluble (TRES PUERTAS gate-2, `04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* política resoluble, *When* valida, *Then* pasa.
  - *Given* irresoluble, *When* valida, *Then* fail-closed.
  - **Check ejecutable:** unit-test resoluble/irresoluble. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-7 — ROI cuenta solo es_atribuible AND confirmado (2 compuertas)

- **Goal:** el ROI solo suma valor que pasa las dos compuertas.
- **Context:** gate booleano determinista (sin LLM), sync. DATA-IN: `ROI_Operador.es_atribuible/metodo_atribucion/signal_de_resultado`. Reusar el gate 2-compuertas; no duplicar. Cita `BR-7`.
- **Constraints:** solo cuenta si (A) confirmado+permanente Y (B) incremental; funnel-correlacional NO confirma (`04` §7). Falta A o B ⇒ 0. ≤100 líneas.
- **Done-when:**
  - *Given* ambas compuertas verdaderas, *When* corre, *Then* el valor cuenta.
  - *Given* una compuerta falsa, *When* corre, *Then* 0.
  - **Check ejecutable:** unit-test de las 4 combinaciones de compuertas. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-8 — Paridad móvil (mismos guardrails, origen=móvil estampado)

- **Goal:** las acciones desde móvil pasan por los mismos guardrails y quedan estampadas con su origen.
- **Context:** invariante + write determinista (sin LLM), sync. DATA-IN/OUT: `Decision_Trace.origen`. Reusar el flujo de firma; no duplicar guardrails por canal. Cita `BR-8`.
- **Constraints:** mismos guardrails desktop/móvil; `origen` estampado en `Decision_Trace` (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* acción móvil, *When* se ejecuta, *Then* aplica idénticos guardrails y estampa `origen=movil`.
  - **Check ejecutable:** test de paridad de guardrails por canal. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-9 — Cada liberar/pausar escribe Decision_Trace con firma (sin-trace-no-acción)

- **Goal:** ninguna acción procede sin un `Decision_Trace` firmado escrito como precondición.
- **Context:** CRUD determinista append-only (sin LLM), sync + HUMAN-gate. DATA-IN: `Liberacion_Lote.operador_id/policy_version_validada/nivel_resultante`. DATA-OUT: `Decision_Trace.trace_id/proponente_id/policy_version` (append-only write, no campo-resultado). Reusar el writer de `Decision_Trace`; no duplicar. Cita `BR-9`.
- **Constraints:** sin-trace-no-acción: falla al escribir ⇒ acción no procede (`04` §7). append-only. ≤100 líneas.
- **Done-when:**
  - *Given* firma válida, *When* libera, *Then* `Decision_Trace` queda escrito antes del efecto.
  - *Given* fallo de write, *When* libera, *Then* acción no procede.
  - **Check ejecutable:** test que asserta precondición de trace (fallo de write bloquea acción). `[STACK-TUNE: <comando test>]`.

---

## 02:BR-10 — n_min >= 20 para validez de percentil

- **Goal:** ningún percentil se reporta como válido bajo el umbral n_min.
- **Context:** check de umbral determinista (sin LLM), sync. DATA-IN: `min_calculo.n_cohort`, `Pertenencia_Cohort_Snapshot.n_min_ok/percentil_en_cohort`. Reusar el gate de `01:F-1.3`; no duplicar. Cita `BR-10`.
- **Constraints:** `n_min_threshold=20` por NOMBRE desde `Config_Perillas` (`04` §3.4). n_min ≠ k-anon. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* `n_cohort < 20`, *When* corre, *Then* `n_min_ok=false`.
  - **Check ejecutable:** unit-test de límite (19/20/21). `[STACK-TUNE: <comando test>]`.

---

## 02:BR-11 — confirmador_id != proponente_id (4-ojos) + independencia_garantida

- **Goal:** ninguna decisión la confirma su propio proponente.
- **Context:** constraint 4-ojos determinista (sin LLM), sync. DATA-IN/OUT: `ROI_Operador.confirmador_id`, `Decision_Trace.proponente_id/confirmador_id/independencia_garantida`. Reusar el CHECK 4-ojos canónico (`04` §3/§7); no duplicar. Cita `BR-11`.
- **Constraints:** CHECK `confirmador_id IS NULL OR confirmador_id <> proponente_id` + columna generada `independencia_garantida` (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* confirmador != proponente, *When* se inserta, *Then* pasa e `independencia_garantida=true`.
  - *Given* confirmador == proponente, *When* se inserta, *Then* el CHECK rechaza.
  - **Check ejecutable:** test del CHECK 4-ojos en ambos casos. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-12 — k-anonimidad N>=k suprime insight en salida cohort/subgrupo

- **Goal:** ningún insight de cohort/subgrupo sale si N < k.
- **Context:** gate determinista (sin LLM), sync. DATA-IN: `Cohort.n_cuentas/supresion_k_aplicada`. Reusar el CHECK k-anon de `01:F-1.3b`; no duplicar. Cita `BR-12`.
- **Constraints:** `k_anon_threshold` por NOMBRE; frontera de salida cross-tenant (`04` §7). Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* `n_cuentas < k`, *When* se emite, *Then* `supresion_k_aplicada=true`.
  - **Check ejecutable:** unit-test del gate en ambos lados de k. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-CRED-1 — Acción financiera nunca auto-ejecuta (GATE-3 cap a propose-only)

- **Goal:** ninguna acción financiera se auto-ejecuta; el gate la capa a solo-propone.
- **Context:** predicado guard determinista (sin LLM), sync. DATA-IN: `Credencial.rol/rbac_matriz`, `NBA_Propuesta.clase_financiera`. Reusar el guard financiero de `02:BR-2`; no duplicar. Cita `BR-CRED-1`.
- **Constraints:** hard-no financiero (`04` §7); GATE-3 capa a propose-only. Determinista. Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* acción financiera, *When* corre el gate, *Then* solo-propone (nunca auto-ejecuta).
  - **Check ejecutable:** unit-test que asserta no-auto-ejecución financiera. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-CRED-2 — Override solo BAJA; ningún rol sube nivel_efectivo

- **Goal:** ninguna credencial/rol eleva el `nivel_efectivo`.
- **Context:** constraint de credencial determinista (sin LLM), sync. DATA-IN: `Credencial.rol/rbac_matriz`. Reusar el invariante override-solo-baja; no duplicar. Cita `BR-CRED-2`.
- **Constraints:** Credencial RESTRINGE, nunca amplía (`04` §7 TRES PUERTAS). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* cualquier rol, *When* intenta subir nivel, *Then* se rechaza.
  - **Check ejecutable:** unit-test que asserta que ningún rol eleva el nivel. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-CRED-3 — Liberar/drill exige agent_manager_junior+ y solo liberables

- **Goal:** solo roles `agent_manager_junior+` ejecutan liberar/drill, y solo sobre acciones liberables.
- **Context:** RBAC check determinista (sin LLM), sync. DATA-IN: `Credencial.rol/rbac_matriz`, `min_calculo.auto_liberable`. Reusar la `rbac_matriz`; no duplicar. Cita `BR-CRED-3`.
- **Constraints:** gate-1 Credencial (`04` §7). Determinista. Fail-closed si rol insuficiente. ≤100 líneas.
- **Done-when:**
  - *Given* rol < junior, *When* intenta liberar, *Then* rechazo.
  - *Given* rol junior+, *When* libera un liberable, *Then* pasa.
  - **Check ejecutable:** unit-test RBAC por rol. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-CRED-4 — Credencial por-tenant_id; acción >1 tenant ⇒ bloqueo-rojo

- **Goal:** una credencial solo opera en su `tenant_id`; cruzar pools bloquea.
- **Context:** predicado RLS/cross-tenant determinista (sin LLM), sync. DATA-IN: `Credencial.tenant_id`. Reusar la RLS de `02:BR-3`; no duplicar. Cita `BR-CRED-4`.
- **Constraints:** credencial alcance por-`tenant_id` (`04` §3). Acción >1 tenant ⇒ bloqueo rojo + log. Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* credencial de un pool, *When* actúa cross-pool, *Then* bloqueo rojo.
  - **Check ejecutable:** test RLS cross-tenant de credencial. `[STACK-TUNE: <comando test RLS>]`.

---

## 02:BR-CRED-5 — Móvil al nivel más alto exige 2-ojos

- **Goal:** una acción móvil al nivel más alto requiere 2-ojos (anti rubber-stamp).
- **Context:** regla determinista por origen (sin LLM), sync. DATA-IN: `Decision_Trace.origen/rubber_stamp_flag`, `Credencial.rbac_matriz`. Reusar `rubber_stamp_flag` (`04` §3); no duplicar. Cita `BR-CRED-5`.
- **Constraints:** `rubber_stamp_flag = (tiempo_a_firma_seg < umbral AND origen=movil)` (`04` §7). Móvil+alto ⇒ exige 2 personas. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* acción móvil al nivel más alto sin 2-ojos, *When* se intenta, *Then* se rechaza.
  - **Check ejecutable:** unit-test del requisito 2-ojos móvil-alto. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-HON-1 — impacto_estimado nunca se copia a impacto_realizado

- **Goal:** el campo de estimativa jamás contamina el campo de realizado.
- **Context:** invariante de separación de campos determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.impacto_estimado/impacto_realizado`. Reusar el guard de honestidad; no duplicar. Cita `BR-HON-1`.
- **Constraints:** separación estricta (`04` §14). `impacto_realizado` solo de señal real. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una estimativa, *When* se procesa, *Then* `impacto_realizado` no la copia.
  - **Check ejecutable:** unit-test que asserta no-copia estimado→realizado. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-HON-2 — Gate de señal: sin signal_de_resultado=true ⇒ impacto_realizado=0

- **Goal:** sin señal de resultado, el impacto realizado es 0.
- **Context:** gate booleano determinista (sin LLM), sync. DATA-IN: `ROI_Operador.signal_de_resultado`, `NBA_Propuesta.impacto_realizado`. Reusar el gate de `02:US-1.1.1-c`; no duplicar. Cita `BR-HON-2`.
- **Constraints:** fail-closed: sin señal ⇒ 0 (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* `signal_de_resultado=false`, *When* corre, *Then* `impacto_realizado=0`.
  - **Check ejecutable:** unit-test del gate con/sin señal. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-HON-3 — Provenance: estimativa nace [C], confianza sube por regla de n

- **Goal:** toda estimativa nace marcada `[C]` y su confianza sube solo por regla de n.
- **Context:** regla de provenance determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.impacto_estimado`. Reusar la regla de provenance; no duplicar. Cita `BR-HON-3`.
- **Constraints:** estimativa = `[C]` no-confiable hasta regla de n (`04` §7 PROVENANCE). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una estimativa nueva, *When* nace, *Then* lleva sello `[C]`.
  - *Given* n suficiente, *When* aplica la regla, *Then* la confianza sube según la regla.
  - **Check ejecutable:** unit-test de la regla de confianza por n. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-HON-4 — Estimativa no entra en min(), no eleva tier

- **Goal:** la estimativa de impacto nunca participa del motor `min()` ni eleva el tier.
- **Context:** invariante de aislamiento del motor determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.impacto_estimado`, `min_calculo.nivel_efectivo`. Reusar el motor de `02:1B` aislado; no duplicar. Cita `BR-HON-4`.
- **Constraints:** `impacto_estimado` fuera del `least()` (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una estimativa alta, *When* corre el motor, *Then* `nivel_efectivo` no cambia por ella.
  - **Check ejecutable:** unit-test que asserta motor invariante ante estimativa. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-HON-5 — Guardrail sobre KPI: delta+ no compensa subida de error

- **Goal:** una mejora de KPI no compensa una subida del guardrail de error.
- **Context:** comparación de guardrail determinista (sin LLM), sync. DATA-IN: `ROI_Operador.guardrail_error`, `NBA_Propuesta.impacto_realizado`. Reusar el guardrail; no duplicar. Cita `BR-HON-5`.
- **Constraints:** `guardrail_error` no puede subir (`04` §3); delta+ no lo compensa. Determinista. Fail-closed (rebaja automática). ≤100 líneas.
- **Done-when:**
  - *Given* delta+ con error subiendo, *When* corre, *Then* no compensa (rebaja).
  - **Check ejecutable:** unit-test de la regla guardrail vs delta. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-LOG-1 — Cada decisión escribe Decision_Trace append-only con gate_result

- **Goal:** cada decisión deja una traza append-only con su resultado de gates.
- **Context:** CRUD log determinista (sin LLM), sync. DATA-IN: `Decision_Trace.credencial_id/policy_version/gate_result/nivel_efectivo_aplicado`. DATA-OUT: `Decision_Trace.trace_id` (append-only write, no campo-resultado). Reusar el writer de `Decision_Trace`; no duplicar. Cita `BR-LOG-1`.
- **Constraints:** append-only; `gate_result` jsonb g1/g2/g3 (`04` §3). `gate_result` computado en runtime, NULL pre-corrida (`04` §14). ≤100 líneas.
- **Done-when:**
  - *Given* una decisión, *When* se ejecuta, *Then* se appendea un `Decision_Trace` con `gate_result`.
  - **Check ejecutable:** test que asserta append-only + presencia de gate_result. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-LOG-2 — rubber_stamp_flag = (tiempo_a_firma_seg < umbral AND origen=movil)

- **Goal:** las firmas sospechosas de rubber-stamp quedan marcadas automáticamente.
- **Context:** columna generada determinista (sin LLM), sync. DATA-IN: `Decision_Trace.tiempo_a_firma_seg/origen/rubber_stamp_flag`. Reusar la columna generada (`04` §3); no duplicar. Cita `BR-LOG-2`.
- **Constraints:** `rubber_stamp_flag` GENERATED, no semeada (`04` §14). Umbral por NOMBRE. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* firma rápida desde móvil, *When* se inserta, *Then* `rubber_stamp_flag=true`.
  - **Check ejecutable:** unit-test de la columna generada por combinaciones. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-LOG-3 — Sin trace no hay acción (fallo de write ⇒ acción no procede)

- **Goal:** un fallo al escribir la traza impide que la acción ocurra.
- **Context:** precondición fail-closed determinista (sin LLM), sync. DATA-IN: `Decision_Trace.trace_id`. Reusar la precondición de `02:BR-9`; no duplicar. Cita `BR-LOG-3`.
- **Constraints:** sin-trace-no-acción (`04` §7). Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* fallo de write de trace, *When* se intenta la acción, *Then* no procede.
  - **Check ejecutable:** test que simula fallo de write y asserta no-acción. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-LOG-4 — Decision_Trace auditable por rol×tenant

- **Goal:** la traza es consultable con alcance por rol y tenant.
- **Context:** query/RLS scope determinista (sin LLM), sync. DATA-IN: `Decision_Trace.credencial_id`, `Credencial.rol/tenant_id`. Reusar la RLS de auditoría; no duplicar. Cita `BR-LOG-4`.
- **Constraints:** RLS single-pool; alcance por rol (`04` §7/§8). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un auditor de un pool, *When* consulta, *Then* ve solo su pool con su alcance de rol.
  - **Check ejecutable:** test RLS de auditoría por rol×tenant. `[STACK-TUNE: <comando test RLS>]`.

---

## 02:BR-M3-01 — risk_class = peor caso (min, reversibilidad, dinero, cross-tenant)

- **Goal:** el `risk_class` se deriva como el peor caso de sus factores.
- **Context:** scoring derivado determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.risk_class/clase_financiera`, `min_calculo.nivel_efectivo`. Reusar el derivador de `risk_class` (`04` §3); no duplicar. Cita `BR-M3-01`.
- **Constraints:** peor-caso entre factores; `clase_financiera=directa` ⇒ ALTO (`04` §7). `risk_class` computado, NULL pre-corrida (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* factores mixtos, *When* corre, *Then* `risk_class` = el peor.
  - **Check ejecutable:** unit-test parametrizado por combinaciones de factores. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-M3-02 — Solo BAJO ∧ impacto=alto elegible auto-liberar (idempotente/reversible)

- **Goal:** solo acciones de bajo riesgo y alto impacto, reversibles, son elegibles para auto-liberar.
- **Context:** predicado determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.risk_class/impacto_estimado`, `min_calculo.auto_liberable`. Reusar el predicado de `02:BR-5`; no duplicar. Cita `BR-M3-02`.
- **Constraints:** BAJO ∧ impacto=alto ∧ idempotente/reversible (`04` §3). Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* BAJO+alto+reversible, *When* corre, *Then* elegible.
  - *Given* cualquier término falla, *When* corre, *Then* no elegible.
  - **Check ejecutable:** unit-test parametrizado por término. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-M3-03 — risk_class=MEDIO ⇒ lote solo con confirmación explícita

- **Goal:** las acciones de riesgo medio requieren confirmación explícita para el lote.
- **Context:** regla de rama determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.risk_class`. Reusar el router de riesgo; no duplicar. Cita `BR-M3-03`.
- **Constraints:** MEDIO ⇒ exige confirmación explícita (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* `risk_class=MEDIO`, *When* se intenta lote sin confirmación, *Then* se bloquea hasta confirmar.
  - **Check ejecutable:** unit-test de la rama MEDIO. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-M3-04 — risk_class=ALTO ⇒ escalar a humano, auto prohibido (todo dinero)

- **Goal:** las acciones de alto riesgo (todo dinero) escalan a humano, nunca auto.
- **Context:** regla determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.risk_class/clase_financiera`. Reusar el guard financiero de `02:BR-2`; no duplicar. Cita `BR-M3-04`.
- **Constraints:** ALTO ⇒ escala humana; hard-no financiero (`04` §7). Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* `risk_class=ALTO`, *When* corre, *Then* escala a humano (auto prohibido).
  - **Check ejecutable:** unit-test que asserta escala-no-auto para ALTO. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-M3-05 — impacto=bajo ⇒ no se prioriza (descartar/backlog)

- **Goal:** las acciones de bajo impacto no se priorizan.
- **Context:** regla de prioridad determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.impacto_estimado`. Reusar el priorizador; no duplicar. Cita `BR-M3-05`.
- **Constraints:** impacto=bajo ⇒ descartar/backlog. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* impacto=bajo, *When* corre, *Then* va a backlog (no se prioriza).
  - **Check ejecutable:** unit-test de la regla de prioridad. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-M3-06 — Override solo baja el cuadrante, nunca sube autonomía (AUT-11)

- **Goal:** un override puede bajar el cuadrante de riesgo pero nunca subir la autonomía.
- **Context:** constraint determinista (sin LLM), sync. DATA-IN: `Liberacion_Lote.nivel_resultante`, `min_calculo.nivel_efectivo`. Reusar el CHECK de `02:BR-1`; no duplicar. Cita `BR-M3-06`.
- **Constraints:** override-solo-baja (AUT-11, `04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un override, *When* baja el cuadrante, *Then* pasa; *When* intenta subir autonomía, *Then* rechazo.
  - **Check ejecutable:** unit-test override baja/sube. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-M3-07 — Umbrales de impacto viven en Politica_Tier versionada

- **Goal:** los umbrales de impacto se leen de la política versionada, no hard-codeados.
- **Context:** lookup de config determinista (sin LLM), sync. DATA-IN: `Politica_Tier.permitido_hoy/policy_version`. Reusar el resolutor de política; no duplicar. Cita `BR-M3-07`.
- **Constraints:** umbrales por NOMBRE/versión (`04` §3, no literales). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* la política vigente, *When* se leen umbrales, *Then* vienen de `Politica_Tier`, no de constantes.
  - **Check ejecutable:** unit-test que asserta lectura desde política versionada. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-M3-08 — estimativa ausente/baja-confianza ⇒ impacto=desconocido ⇒ no auto-liberable

- **Goal:** sin estimativa confiable, el impacto es desconocido y la acción no es auto-liberable.
- **Context:** gate determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.impacto_estimado`, `min_calculo.auto_liberable`. Reusar el predicado de `02:BR-5`; no duplicar. Cita `BR-M3-08`.
- **Constraints:** fail-closed: impacto desconocido ⇒ `auto_liberable=false` (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* estimativa ausente/baja-confianza, *When* corre, *Then* `auto_liberable=false`.
  - **Check ejecutable:** unit-test del gate impacto-desconocido. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-XCHK-1 — Credencial validada vs Politica_Tier en GATE-2 (permiso = intersección)

- **Goal:** el permiso efectivo es la intersección de credencial y política.
- **Context:** check de intersección determinista (sin LLM), sync. DATA-IN: `Credencial.rbac_matriz`, `Politica_Tier.permitido_hoy/policy_version`. Reusar el resolutor de TRES PUERTAS; no duplicar. Cita `BR-XCHK-1`.
- **Constraints:** permiso = intersección credencial ∩ política (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* credencial y política, *When* corre, *Then* el permiso = intersección.
  - **Check ejecutable:** unit-test de la intersección. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-XCHK-2 — Divergencia credencial>política ⇒ bloqueo, gana política, alerta owner

- **Goal:** cuando la credencial diverge por encima de la política, gana la política y se alerta al owner.
- **Context:** comparación + audit write determinista (sin LLM), sync. DATA-IN: `Credencial.rbac_matriz/audit_divergencia`, `Politica_Tier.permitido_hoy`. DATA-OUT: `Credencial.audit_divergencia` (write, no campo-resultado). TRIGGERS-FIRED: alerta a `policy_owner` si divergencia (bilateral-unconfirmed, sin consumidor en set). Reusar el cruce credencial↔política; no duplicar. Cita `BR-XCHK-2`.
- **Constraints:** gana la política; divergencia ⇒ bloqueo + alerta (`04` §7). `audit_divergencia` escrita. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* credencial > política, *When* corre, *Then* bloqueo, gana política, `audit_divergencia` escrita + alerta.
  - **Check ejecutable:** unit-test de divergencia que asserta gana-política + write de audit. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-XCHK-3 — Pin de versión: trace graba policy_version Y credencial version

- **Goal:** cada traza fija la versión de política y de credencial usadas.
- **Context:** version-pin determinista (sin LLM), sync. DATA-IN: `Decision_Trace.policy_version`, `Credencial.credential_policy_pin`. Reusar el writer de trace; no duplicar. Cita `BR-XCHK-3`.
- **Constraints:** pin de ambas versiones por fila (A=B, `04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una decisión, *When* se traza, *Then* graba `policy_version` y `credential_policy_pin`.
  - **Check ejecutable:** unit-test que asserta ambos pins en el trace. `[STACK-TUNE: <comando test>]`.

---

## 02:BR-XCHK-4 — Texto = dato: docs no ejecutan instrucciones embebidas

- **Goal:** el contenido de documentos/políticas se trata como dato, nunca como instrucción ejecutable.
- **Context:** invariante anti-injection determinista (sin LLM), sync. DATA-IN: `Politica_Tier.permitido_hoy`. Reusar el data-fencing (`04` §7 TEXTO=DATO); no duplicar. Cita `BR-XCHK-4`.
- **Constraints:** `tratado_como_dato=true`; inyección ⇒ log de señal, motor intacto (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un doc con instrucción embebida, *When* se procesa, *Then* se trata como dato (no se ejecuta) y se loguea señal.
  - **Check ejecutable:** unit-test con payload de inyección que asserta no-ejecución + log. `[STACK-TUNE: <comando test>]`.

---
## 02:EC-1 — Cohort n<20 fail-closed (count vs n_min)

- **Goal:** una cohort con muestra insuficiente cae fail-closed en vez de reportar un percentil.
- **Context:** detección determinista (sin LLM), sync. DATA-IN: `min_calculo.n_cohort`. Reusar el gate n_min de `02:BR-10`/`01:F-1.3`; no duplicar. Cita `EC-1`, `BR-10`, `BR-5`.
- **Constraints:** `n_min_threshold=20` por NOMBRE. Fail-closed (modo cualitativo). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* `n_cohort < 20`, *When* corre, *Then* fail-closed (no percentil).
  - **Check ejecutable:** unit-test de límite n<20. `[STACK-TUNE: <comando test>]`.

---

## 02:EC-2 — Reversibilidad/idempotencia + lock check antes de ejecutar

- **Goal:** ninguna ejecución procede sin verificar reversibilidad/idempotencia bajo lock.
- **Context:** predicado determinista (sin LLM), sync. DATA-IN: `min_calculo.auto_liberable`. Reusar el predicado de `02:BR-5`; no duplicar. Cita `EC-2`, `BR-5`, `BR-6`.
- **Constraints:** lock antes de ejecutar; reversible/idempotente requerido (`04` §3). Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* acción no-reversible, *When* corre el check, *Then* se bloquea.
  - **Check ejecutable:** unit-test reversible/no-reversible bajo lock. `[STACK-TUNE: <comando test>]`.

---

## 02:EC-3 — policy_version irresoluble ⇒ fail-closed pausa lote

- **Goal:** una versión de política irresoluble pausa el lote (no procede).
- **Context:** resolución determinista (sin LLM), sync. DATA-IN: `Politica_Tier.policy_version`. Reusar el resolutor de `02:BR-6`; no duplicar. Cita `EC-3`, `BR-6`, `BR-9`.
- **Constraints:** fail-closed: irresoluble ⇒ pausa (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* `policy_version` irresoluble, *When* corre, *Then* el lote se pausa.
  - **Check ejecutable:** unit-test de versión irresoluble. `[STACK-TUNE: <comando test>]`.

---

## 02:EC-4 — Móvil + dinero: clase_financiera=directa evaluada idéntica, backend cut

- **Goal:** una acción financiera desde móvil se evalúa igual que en desktop y se corta en backend.
- **Context:** guard determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.clase_financiera`, `Decision_Trace.origen`. Reusar los guards de `02:BR-2`/`02:BR-8`; no duplicar. Cita `EC-4`, `BR-2`, `BR-8`.
- **Constraints:** paridad de canal; corte financiero en backend (`04` §7). Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* dinero desde móvil, *When* corre, *Then* mismo corte que desktop (backend).
  - **Check ejecutable:** unit-test de paridad móvil+dinero. `[STACK-TUNE: <comando test>]`.

---

## 02:EC-5 — Subgrupo vacío: count subgrupo ⇒ no lote action

- **Goal:** un subgrupo vacío no admite acción en lote.
- **Context:** conteo determinista (sin LLM), sync. DATA-IN: `NBA_Propuesta.subgrupo_id`. Reusar la utilidad de conteo; no duplicar. Cita `EC-5`, `BR-4`, `BR-5`.
- **Constraints:** subgrupo vacío ⇒ no-action (estado definido). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* subgrupo con count 0, *When* corre, *Then* no hay acción de lote.
  - **Check ejecutable:** unit-test subgrupo vacío. `[STACK-TUNE: <comando test>]`.

---

## 02:EC-6 — pedido > liberado: min() elige el menor

- **Goal:** cuando el pedido supera lo liberado, el motor elige el menor.
- **Context:** comparación de brazos determinista (sin LLM), sync. DATA-IN: `min_calculo.pedido_NBA/liberado_evals/nivel_efectivo`. Reusar el motor de `02:1B`; no duplicar. Cita `EC-6`, `BR-4`, `BR-1`.
- **Constraints:** `least()` sobre ENUM ordenado (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* `pedido > liberado`, *When* corre, *Then* `nivel_efectivo = liberado`.
  - **Check ejecutable:** unit-test pedido>liberado. `[STACK-TUNE: <comando test>]`.

---

## 02:EC-7 — Liberación de lote concurrente: lock por cohort/subgrupo, segundo write rechazado

- **Goal:** dos liberaciones concurrentes del mismo lote no producen doble efecto.
- **Context:** lock determinista (sin LLM), sync; la mecánica fina es `[I]`. DATA-IN: `Liberacion_Lote.cohort_id/subgrupo_id`. Reusar el patrón de lock idempotente; no duplicar. Cita `EC-7`, `BR-5`, `BR-9`.
- **Constraints:** lock por cohort/subgrupo; segundo write rechazado (idempotencia). Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* dos writes concurrentes, *When* corren, *Then* solo el primero aplica, el segundo se rechaza.
  - **Check ejecutable:** test de concurrencia que asserta un solo efecto. `[STACK-TUNE: <comando test concurrencia>]`.

---

## 02:EC-8 — ROI fantasma: metodo_atribucion requiere holdout/pre-post, no correlación

- **Goal:** ningún ROI cuenta si su método de atribución es mera correlación.
- **Context:** gate de enum determinista (sin LLM), sync. DATA-IN: `ROI_Operador.metodo_atribucion/signal_de_resultado/es_atribuible`. Reusar el gate 2-compuertas de `02:BR-7`; no duplicar. Cita `EC-8`, `BR-7`.
- **Constraints:** `funnel-correlacional` NO confirma (`04` §7). Solo holdout-control/pre-post cuentan. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* `metodo=funnel-correlacional`, *When* corre, *Then* `es_atribuible=false`.
  - **Check ejecutable:** unit-test por método de atribución. `[STACK-TUNE: <comando test>]`.

---

## 02:EC-9 — Doble horizonte inmediato/largo: medir el mismo efecto en dos ventanas

- **Goal:** un mismo efecto se mide en su horizonte inmediato y largo de forma consistente.
- **Context:** check de horizonte determinista (sin LLM), sync. DATA-IN: `ROI_Operador.horizonte_medido`. Reusar el medidor de horizonte; no duplicar. Cita `EC-9`, `BR-7`, `BR-4`.
- **Constraints:** dos ventanas (`inmediato|largo|ambos`); Y1/Y2 nunca se suman (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un efecto, *When* se mide, *Then* se reporta por ventana sin sumarlas.
  - **Check ejecutable:** unit-test de horizonte doble. `[STACK-TUNE: <comando test>]`.

---

## 02:EC-10 — Pausa multi-etapa: rollback pendiente + crédito provisional

- **Goal:** una pausa en medio de etapas en vuelo resuelve rollback y crédito provisional.
- **Context:** resolución determinista (sin LLM), sync. DATA-IN: `Liberacion_Lote.etapas_en_vuelo_resueltas`. Reusar el resolutor de etapas; no duplicar. Cita `EC-10`, `BR-5`, `BR-7`.
- **Constraints:** `etapas_en_vuelo_resueltas` marca la resolución; crédito provisional separado del confirmado (`04` §3/§7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una pausa con etapas en vuelo, *When* corre, *Then* rollback pendiente + crédito provisional resueltos.
  - **Check ejecutable:** unit-test de pausa multi-etapa. `[STACK-TUNE: <comando test>]`.

---
## 03 — Goals & KPIs · piezas CÓDIGO

## 03:EPIC-1 — Scorecard de 3 lentes (superficie sync UI/CRUD)

- **Goal:** el usuario ve el scorecard de KPIs en sus 3 lentes (empresa/personal/proceso) en una sola superficie.
- **Context:** superficie UI/CRUD (sin LLM), sync. Compone el render de lentes (`03:US-1.1.1`), el render de KPI (`03:US-1.1.2`) y el role-scoping (`03:US-1.2.1`). Reusar el contenedor de pantalla y el componente de scorecard existente; no recrear. DATA-IN: `KPI.nivel/target/valor_hoy/provenance` (`04` §3). Cita `03:EPIC-1`, `03:F-1.1`, `03:F-1.2`.
- **Constraints:** solo render; `valor_hoy` lo produce el job de medición (`03:US-4.3.1`), no esta pieza. RLS single-pool. a11y/estados. ≤100 líneas (shell compositor).
- **Done-when:**
  - *Given* KPIs medidos, *When* se abre el scorecard, *Then* monta las 3 lentes con sus sub-superficies.
  - **Check ejecutable:** test de integración del shell + RLS. `[STACK-TUNE: <comando test integración>]`.

---

## 03:US-1.1.1 — Conmutar 3 lentes (default por nivel)

- **Goal:** el usuario conmuta entre las 3 lentes, con un default según su nivel.
- **Context:** render/estados (sin LLM), user-action sync. DATA-IN: `KPI.nivel/dueno_id` (`04` §3). Reusar el toggle/tabs existente; no crear. Cita `03:US-1.1.1`, `03:F-1.1`.
- **Constraints:** default por nivel del usuario; solo render. a11y: tabs navegables por teclado, `aria-selected`. ≤100 líneas.
- **Done-when:**
  - *Given* un usuario de nivel X, *When* abre, *Then* la lente default = su nivel.
  - *Given* conmuta, *When* selecciona otra lente, *Then* se actualiza la vista.
  - **Check ejecutable:** test de componente del toggle + default por nivel. `[STACK-TUNE: <comando test componente>]`.

---

## 03:US-1.1.2 — Render target/valor_hoy/proximidad/provenance + fail-closed sin def

- **Goal:** cada KPI muestra target, valor actual, proximidad y provenance; sin definición no muestra número.
- **Context:** render (sin LLM), sync. DATA-IN: `KPI.target/valor_hoy/kpi_def_version/provenance`, `Named_Query.def_version` (`04` §3). Reusar el componente de KPI/sello; no crear. Cita `03:US-1.1.2`, `03:F-1.1`.
- **Constraints:** fail-closed: sin `kpi_def_version` resoluble ⇒ no muestra número (`04` §6 A=B). Sin provenance no renderiza (`04` §7). a11y/estados. ≤100 líneas.
- **Done-when:**
  - *Given* KPI con def y provenance, *When* se renderiza, *Then* muestra target/valor/proximidad.
  - *Given* sin def, *When* se renderiza, *Then* estado conservador, no número.
  - **Check ejecutable:** test de componente con/sin def + provenance. `[STACK-TUNE: <comando test componente>]`.

---

## 03:US-1.2.1 — Role-scoping predicate (RLS-style visible() sobre Usuario)

- **Goal:** cada usuario solo ve los KPIs dentro de su alcance organizacional.
- **Context:** predicado RLS-style determinista (sin LLM), sync. DATA-IN: `Usuario` (org graph), `KPI.dueno_id/nivel` (`04` §3). Reusar el predicado `visible()` sobre el grafo Usuario; no duplicar. Cita `03:US-1.2.1`, `03:F-1.2`, `03:BR-5`.
- **Constraints:** RLS single-pool; alcance por rol/nivel (`04` §8). Fail-closed (deny-by-default). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un usuario, *When* consulta KPIs, *Then* ve solo los de su alcance.
  - **Check ejecutable:** unit-test de `visible()` por nivel org. `[STACK-TUNE: <comando test>]`.

---

## 03:US-2.1.1 — Descomposición lagging→leading sobre links de KPI + flag orphan

- **Goal:** cada KPI lagging se descompone en sus leading vinculados, marcando los huérfanos.
- **Context:** descomposición determinista (sin LLM), sync. DATA-IN: `KPI.es_lagging/parent_kpi_id` (`04` §3). Reusar el recorrido del grafo leading/lagging acíclico; no duplicar. Cita `03:US-2.1.1`, `03:F-2.1`, `03:BR-6`.
- **Constraints:** grafo acíclico (ciclo ⇒ fail-closed, `04` §7). `parent_kpi_id` null en proceso ⇒ flag orphan. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un KPI lagging con leading, *When* corre, *Then* se descompone correctamente.
  - *Given* un KPI proceso sin parent, *When* corre, *Then* se marca orphan.
  - **Check ejecutable:** unit-test de descomposición + detección de ciclo/orphan. `[STACK-TUNE: <comando test>]`.

---

## 03:US-2.2.1 — Tendencia/proyección sobre snapshots semanales (fail si historia insuficiente)

- **Goal:** se computa la tendencia y proyección de un KPI sobre su serie semanal, fail-closed si falta historia.
- **Context:** fórmula determinista (sin LLM), sync. DATA-IN: serie semanal de `KPI` (1-N sub-serie, `04` §3). DATA-OUT: proyección `[I]`/estimación etiquetada (`03:BR-7` — previsión es `[I]`, nunca `[C]`/hecho; el número es COMPUTED por fórmula determinista, `04` §14 · NULL pre-run). Reusar el cómputo de tendencia; no inventar. Cita `03:US-2.2.1`, `03:F-2.2`, `03:BR-7`.
- **Constraints:** proyección con sello `[I]`/estimación (`03:BR-7`; no número medido pero COMPUTED, `04` §14). Historia insuficiente ⇒ fail-closed (no proyecta). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* serie suficiente, *When* corre, *Then* tendencia/proyección con sello `[I]`/estimación.
  - *Given* historia insuficiente, *When* corre, *Then* fail-closed.
  - **Check ejecutable:** unit-test de tendencia + caso historia-insuficiente. `[STACK-TUNE: <comando test>]`.

---

## 03:US-3.1.1-gate — Approval-gate: nada corre sin aprobación humana

- **Goal:** ninguna `AccionSugerida` se ejecuta sin la aprobación humana explícita.
- **Context:** UI/CRUD + HUMAN-gate (sin LLM), user-action sync. DATA-IN: `AccionSugerida.estado/aprobado_por` (`04` §3). DATA-OUT: `AccionSugerida.estado` transiciona vía acción humana (CRUD). Reusar el patrón de aprobar/rechazar; no duplicar. Cita `03:US-3.1.1`, `03:F-3.1`, `03:BR-4`, `03:EC-4`.
- **Constraints:** BR-4 nada autónomo; estado inicial `propuesta` (conservador, `04` §14); solo humano pasa a `aprobada/rechazada`. ≤100 líneas.
- **Done-when:**
  - *Given* una acción `propuesta`, *When* el humano aprueba, *Then* pasa a `aprobada`; sin aprobación no corre.
  - **Check ejecutable:** test que asserta no-ejecución sin aprobación + transición. `[STACK-TUNE: <comando test>]`.

---

## 03:US-3.1.1-handoffA — Handoff tipo-A: arma envelope a P02/min()

- **Goal:** al aprobar una acción tipo-A, se arma el envelope hacia P02/`min()`.
- **Context:** predicado/dispatch determinista (sin LLM), user-action sync. DATA-IN: `AccionSugerida.nba_id/cohort_id/intent` (envelope tipo-A, `04` §3). Reusar el dispatcher de handoff existente; no duplicar. Cita `03:US-3.1.1`, `03:F-3.1`, `03:EPIC-3`.
- **Constraints:** envelope `{nba_id, cohort_id, intent}` para P02 (`04` §3). Solo on-approve. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una acción tipo-A aprobada, *When* corre el handoff, *Then* el envelope a P02/min() queda armado.
  - **Check ejecutable:** unit-test del envelope tipo-A. `[STACK-TUNE: <comando test>]`.

---

## 03:US-4.1.1 — Resolver KPI a def canónica + A=B unify check, fail-closed divergencia

- **Goal:** cada KPI resuelve su definición canónica y verifica A=B, fallando cerrado ante divergencia.
- **Context:** resolución determinista (sin LLM), sync. DATA-IN: `KPI.kpi_def_version`, `Named_Query.def_version/formula/periodicidad/group_by` (`04` §3). Reusar el resolutor de def; no duplicar. Cita `03:US-4.1.1`, `03:F-4.1`, `03:BR-1`, `03:EC-1`, `03:EC-2`.
- **Constraints:** A=B: KPI muestra número solo si `formula+periodicidad+group_by == def_version` (`04` §6). Divergencia ⇒ fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* def coincidente, *When* corre, *Then* unifica (A=B pasa).
  - *Given* divergencia, *When* corre, *Then* fail-closed.
  - **Check ejecutable:** unit-test A=B coincidente/divergente. `[STACK-TUNE: <comando test>]`.

---

## 03:US-4.2.1 — Edición 4-ojos con validación + log (clase=proceso)

- **Goal:** la edición de un KPI de proceso exige 4-ojos y queda registrada.
- **Context:** UI/CRUD + HUMAN-gate (sin LLM), user-action sync. DATA-IN/OUT: `Edicion_Contexto.editor_id/validador_id/target_ref/campo/valor_anterior/valor_nuevo` (`04` §3). Reusar el CHECK 4-ojos canónico; no duplicar. Cita `03:US-4.2.1`, `03:F-4.2`, `03:BR-3`, `03:EC-3`.
- **Constraints:** CHECK `validador_id <> editor_id` + `independencia_garantida` (`04` §7). `clase=performance` es read-only (no pasa por aquí). Log revertible. ≤100 líneas.
- **Done-when:**
  - *Given* validador != editor, *When* edita, *Then* se aplica y se loguea.
  - *Given* validador == editor, *When* edita, *Then* rechazo (4-ojos).
  - **Check ejecutable:** test del CHECK 4-ojos + log. `[STACK-TUNE: <comando test>]`.

---

## 03:US-6.1.1-diagnostico — Diagnóstico determinista (leading + dónde + desde-cuándo)

- **Goal:** el workbench computa de forma determinista el leading afectado, el segmento y el onset.
- **Context:** reuso determinista (sin LLM), sync. DATA-IN: `KPI.valor_hoy/es_lagging/parent_kpi_id` (lagging→leading, reusa `03:US-2.1.1`); segmento/onset. Reusar la descomposición de EPIC-2; no duplicar. Cita `03:US-6.1.1`, `03:F-6.1`.
- **Constraints:** determinista; reusa la lógica lagging→leading. Sin números fabricados (segmento/onset derivados). ≤100 líneas.
- **Done-when:**
  - *Given* un KPI en rojo, *When* corre el diagnóstico, *Then* devuelve leading + dónde + desde-cuándo.
  - **Check ejecutable:** unit-test del diagnóstico determinista. `[STACK-TUNE: <comando test>]`.

---

## 03:US-6.1.1-metrica — Métrica de verificación determinista (el número que confirma/refuta)

- **Goal:** cada hipótesis del workbench tiene una métrica de verificación calculada de forma determinista.
- **Context:** check determinista Python/SQL (sin LLM; leaf-split de la hipótesis AGENTE), sync. DATA-IN: brutos `Orden`/`Evento_Uso` por hipótesis. DATA-OUT: `AccionSugerida.workbench.metrica_verificacion` (producer = `Named_Query` determinista, `04` §14 · COMPUTED/NULL pre-run). Reusar el runner de `Named_Query`; no duplicar. Cita `03:US-6.1.1`, `03:F-6.1`, `03:EPIC-6`.
- **Constraints:** el NÚMERO es determinista, nunca LLM (`04` §14). PROHIBIDO semear; NULL pre-run. ≤100 líneas.
- **Done-when:**
  - *Given* una hipótesis, *When* corre la métrica, *Then* el número la confirma/refuta (derivado de brutos).
  - *Given* pre-corrida, *When* se inspecciona, *Then* `metrica_verificacion = NULL`.
  - **Check ejecutable:** test que corre la métrica (valor derivado) + anti-fake NULL-pre-run. `[STACK-TUNE: <comando test>]`.

---

## 03:US-6.2.1-handoffA — Ítem NBA A1-A8 autorizado → P2/min()

- **Goal:** un ítem de plan autorizado se entrega como handoff a P2/`min()`.
- **Context:** dispatch determinista (sin LLM), user-action sync + HUMAN-gate. DATA-IN: ítem del plan (`AccionSugerida.workbench`), `NBA_Catalogo.codigo` (A1-A8). Reusar el dispatcher de `03:US-3.1.1-handoffA`; no duplicar. Cita `03:US-6.2.1`, `03:F-6.2`, `03:EPIC-6`.
- **Constraints:** solo A1-A8 (catálogo cerrado, `04` §3); solo on-authorize humano. Envelope a P2/min(). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un ítem A1-A8 autorizado, *When* corre el handoff, *Then* el envelope a P2/min() queda armado.
  - **Check ejecutable:** unit-test del envelope de ítem. `[STACK-TUNE: <comando test>]`.

---

## 03:US-6.2.1-tracking — Tracking qué/quién/resultado por ítem (loop acuracidad)

- **Goal:** cada ítem ejecutado registra qué/quién/cuándo para el loop de acuracidad.
- **Context:** CRUD determinista (sin LLM), user-action sync. DATA-IN/OUT: registro del ítem (`AccionSugerida.workbench.items`, `decision_trace_id`). Reusar el patrón de tracking/CRUD; no duplicar. Cita `03:US-6.2.1`, `03:F-6.2`, `03:BR-10`.
- **Constraints:** registra qué/quién/cuándo; alimenta `acuracidad_feedback` (producido por job de atribución, no aquí). RLS single-pool. ≤100 líneas.
- **Done-when:**
  - *Given* un ítem marcado hecho, *When* se registra, *Then* quedan qué/quién/cuándo.
  - **Check ejecutable:** test CRUD del tracking. `[STACK-TUNE: <comando test>]`.

---

## 03:EPIC-2 — Orquestador de descomposición + tendencia + proyección (todo determinista)

- **Goal:** componer la descomposición lagging→leading, la tendencia semanal y la proyección en un flujo determinista.
- **Context:** orquestación determinista (sin LLM), sync. Compone `03:US-2.1.1` (descomposición) y `03:US-2.2.1` (tendencia/proyección). Reusar ambas; no recrear su lógica. DATA-IN: `KPI` (links + serie semanal). Cita `03:EPIC-2`, `03:F-2.1`, `03:F-2.2`.
- **Constraints:** todo cómputo determinista; proyección etiquetada `[I]`/estimación (`03:BR-7`; número COMPUTED, `04` §14); grafo acíclico. RLS single-pool. ≤100 líneas (compositor).
- **Done-when:**
  - *Given* un KPI con links y serie, *When* corre el orquestador, *Then* produce descomposición + tendencia + proyección.
  - **Check ejecutable:** test de integración que asserta el encadenamiento determinista. `[STACK-TUNE: <comando test integración>]`.

---

## 03:BR-1 — A=B unify check contra Named_Query canónica (fail-closed)

- **Goal:** ninguna métrica se reporta si su definición no unifica con la canónica.
- **Context:** invariante determinista (sin LLM), sync. DATA-IN: `KPI.kpi_def_version`, `Named_Query.def_version`. Reusar el resolutor de `03:US-4.1.1`; no duplicar. Cita `03:BR-1`, `03:EC-1`, `03:EC-2`.
- **Constraints:** A=B fail-closed (`04` §6/§7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* defs distintas, *When* corre, *Then* fail-closed (no número).
  - **Check ejecutable:** unit-test A=B. `[STACK-TUNE: <comando test>]`.

---

## 03:BR-2 — Read-only guard sobre clase=performance (bloquea edición)

- **Goal:** los KPIs de clase performance no se pueden editar.
- **Context:** predicado read-only determinista (sin LLM), sync. DATA-IN: `KPI.clase`, `KPI.performance_validado_por`. Reusar el guard de clase; no duplicar. Cita `03:BR-2`.
- **Constraints:** `clase=performance` ⇒ read-only RH (`04` §3); no pasa por `Edicion_Contexto`. Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un KPI performance, *When* se intenta editar, *Then* se bloquea.
  - **Check ejecutable:** unit-test del guard read-only por clase. `[STACK-TUNE: <comando test>]`.

---

## 03:BR-3 — 4-ojos CHECK (validador_id <> editor_id) + log gate

- **Goal:** ninguna edición de proceso la valida su propio editor.
- **Context:** constraint 4-ojos determinista (sin LLM), sync + HUMAN-gate. DATA-IN: `Edicion_Contexto.editor_id/validador_id`. Reusar el CHECK canónico de `03:US-4.2.1`; no duplicar. Cita `03:BR-3`, `03:EC-3`.
- **Constraints:** CHECK `validador_id <> editor_id` + `independencia_garantida` (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* validador != editor, *When* se inserta, *Then* pasa.
  - *Given* iguales, *When* se inserta, *Then* rechazo.
  - **Check ejecutable:** test del CHECK 4-ojos. `[STACK-TUNE: <comando test>]`.

---

## 03:BR-4 — Approval-gate (estado debe ser aprobada antes de correr)

- **Goal:** ninguna acción corre antes de estar aprobada.
- **Context:** gate de aprobación determinista (sin LLM), sync + HUMAN-gate. DATA-IN: `AccionSugerida.estado`. Reusar el gate de `03:US-3.1.1-gate`; no duplicar. Cita `03:BR-4`, `03:EC-4`.
- **Constraints:** backend cut: solo `estado=aprobada` corre (`04` §7, nada autónomo). Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* `estado != aprobada`, *When* se intenta correr, *Then* se bloquea.
  - **Check ejecutable:** unit-test del approval-gate. `[STACK-TUNE: <comando test>]`.

---

## 03:BR-5 — Role-scoping predicate visible() sobre grafo org de Usuario

- **Goal:** cada usuario solo accede a lo que su rol/posición org permite.
- **Context:** predicado RLS-style determinista (sin LLM), sync. DATA-IN: `Usuario` (org graph), `KPI.dueno_id`. Reusar `visible()` de `03:US-1.2.1`; no duplicar. Cita `03:BR-5`, `03:EC-7`.
- **Constraints:** deny-by-default; RLS single-pool (`04` §8). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un usuario, *When* consulta, *Then* ve solo su alcance.
  - **Check ejecutable:** unit-test de `visible()`. `[STACK-TUNE: <comando test>]`.

---

## 03:BR-6 — Nesting check (parent_kpi_id null en proceso = orphan flag)

- **Goal:** un KPI de proceso sin padre queda marcado huérfano.
- **Context:** predicado determinista (sin LLM), sync. DATA-IN: `KPI.parent_kpi_id/clase`. Reusar el recorrido de `03:US-2.1.1`; no duplicar. Cita `03:BR-6`, `03:EC-6`.
- **Constraints:** grafo acíclico (`04` §7); `parent_kpi_id` null en proceso ⇒ orphan. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* proceso sin parent, *When* corre, *Then* flag orphan.
  - **Check ejecutable:** unit-test del nesting check. `[STACK-TUNE: <comando test>]`.

---

## 03:BR-7 — Enforcement de badge provenance/estimación en la proyección

- **Goal:** toda cifra proyectada lleva su badge de provenance/estimación.
- **Context:** render/states determinista (sin LLM), sync. DATA-IN: `KPI.provenance`, proyección de `03:US-2.2.1`. Reusar el componente de sello de `01:F-1.7`; no duplicar. Cita `03:BR-7`, `03:EC-5`, `03:EC-10`.
- **Constraints:** sin provenance no renderiza (`04` §7); proyección = badge `[C]` (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una proyección, *When* se renderiza, *Then* lleva su badge `[C]`.
  - *Given* sin provenance, *When* se renderiza, *Then* no renderiza el número.
  - **Check ejecutable:** test de componente que asserta el badge. `[STACK-TUNE: <comando test componente>]`.

---

## 03:BR-8 — RLS cross-tenant guard (aborta agregado que cruza tenant_id)

- **Goal:** ningún agregado cruza `tenant_id`.
- **Context:** predicado RLS determinista (sin LLM), sync. DATA-IN: `tenant_id` de las filas agregadas. Reusar la RLS de `02:BR-3`; no duplicar. Cita `03:BR-8`, `03:EC-8`.
- **Constraints:** aborta + bloqueo si agregación toca >1 `tenant_id` (`04` §7/§8). Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* agregado cross-tenant, *When* corre, *Then* aborta.
  - **Check ejecutable:** test RLS de agregación cross-tenant. `[STACK-TUNE: <comando test RLS>]`.

---

## 03:BR-9 — Enforcement de placeholder [C] en cifras de escenario

- **Goal:** las cifras de escenario se marcan como `[C]` placeholder, no como medidas.
- **Context:** render/states determinista (sin LLM), sync. DATA-IN: cifras de escenario con provenance `[C]`. Reusar el badge de `03:BR-7`; no duplicar. Cita `03:BR-9`.
- **Constraints:** `[C]` visible (`04` §14); nunca número que parezca medido. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una cifra de escenario, *When* se renderiza, *Then* lleva sello `[C]`.
  - **Check ejecutable:** test de componente del sello `[C]`. `[STACK-TUNE: <comando test componente>]`.

---

## 03:BR-10 — 2-compuertas de valor (confirmado+permanente AND incremental)

- **Goal:** ningún valor cuenta sin pasar las dos compuertas.
- **Context:** check determinista (sin LLM), sync. DATA-IN: `ROI_Operador.es_atribuible/signal_de_resultado`, atribución 2-compuertas. Reusar el gate de `02:BR-7`; no duplicar. Cita `03:BR-10`, `03:EC-10`.
- **Constraints:** confirmado+permanente AND incremental (`04` §7). Falta una ⇒ 0. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* ambas compuertas, *When* corre, *Then* cuenta.
  - *Given* falta una, *When* corre, *Then* 0.
  - **Check ejecutable:** unit-test de las compuertas. `[STACK-TUNE: <comando test>]`.

---

## 03:EC-9 — Freshness check (timestamp vs TTL, stale@ts marker)

- **Goal:** un valor que excede su TTL se marca stale en vez de mostrarse como fresco.
- **Context:** check de freshness determinista (sin LLM); invocado por el job de medición (`03:US-4.3.1`). DATA-IN: `KPI.ultimo_calculo_ts`, `TTL_baseline` (`Config_Perillas`). Reusar la utilidad de TTL; no duplicar. Cita `03:EC-9`, `03:BR-1`.
- **Constraints:** `TTL_baseline` por NOMBRE (`04` §3.4). stale ⇒ marker, no verde-fake (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* `ts` más viejo que TTL, *When* corre, *Then* marca stale.
  - **Check ejecutable:** unit-test de freshness en ambos lados del TTL. `[STACK-TUNE: <comando test>]`.

---
## 05A — Atención (contexto integrado) · piezas CÓDIGO

## 05A:A.1.1 — Recv + resolver tenant server-side + CRUD create CONVERSA/TURNO

- **Goal:** un mensaje entrante crea su `Conversa_Episodio`/turno con el `tenant_id` resuelto server-side.
- **Context:** recv + CRUD determinista (sin LLM), sync in-app. DATA-IN/OUT: `Conversa_Episodio{conversa_id, tenant_id, restaurante_id, canal, turnos}` (`04` §3). Reusar el writer de `Conversa_Episodio`; no inventar tabla. Cita `A.1.1`, `BR-A2`, `BR-A4`, `EPIC-A1`.
- **Constraints:** `tenant_id` server-side de la credencial (anti-spoofing, `04` §7). `episodio_id` idempotente. Fail-closed si falta tenant. ≤100 líneas.
- **Done-when:**
  - *Given* un mensaje con credencial, *When* llega, *Then* se crea la conversa con `tenant_id` server-side.
  - *Given* sin tenant resoluble, *When* llega, *Then* fail-closed.
  - **Check ejecutable:** test que asserta tenant server-side + idempotencia de creación. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.1.2 — Detección + redacción de PII (transform determinista, fail-closed)

- **Goal:** toda PII se detecta y redacta antes de cómputo/almacenamiento.
- **Context:** transform determinista (regex/NER classifier, sin juicio-ranking), sync, fail-closed. DATA-IN/OUT: `Conversa_Episodio.capa_transcripcion` (PII redactada, `04` §3). Reusar el redactor PII existente; no duplicar. Cita `A.1.2`, `BR-A2`, `EC-A14`.
- **Constraints:** redacción ANTES de cómputo (`04` §7 PII E2E). Fail-closed: PII residual ⇒ no avanza. Retención limitada. ≤100 líneas.
- **Done-when:**
  - *Given* un turno con PII, *When* corre, *Then* la PII queda redactada antes de persistir.
  - *Given* PII residual, *When* corre, *Then* fail-closed.
  - **Check ejecutable:** test con fixtures de PII que asserta redacción + fail-closed residual. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.1.3 — Branch determinista has-image?

- **Goal:** el flujo decide de forma determinista si el turno trae imagen.
- **Context:** router puro determinista (sin LLM), sync. DATA-IN: `Conversa_Episodio.turnos` (presencia de adjunto). Reusar el router de ramas; no duplicar. Cita `A.1.3`, `BR-A2`.
- **Constraints:** decisión binaria sin juicio. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* turno con imagen, *When* corre, *Then* rutea a A.1.4; sin imagen, a A.1.5.
  - **Check ejecutable:** unit-test del branch con/sin imagen. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.1.6 — Sellar TURNO: provenance_por_campo + instrumentar esfuerzo (CRUD)

- **Goal:** el turno queda consolidado con provenance por campo y el contador de esfuerzo instrumentado.
- **Context:** CRUD determinista (sin LLM), sync. DATA-IN/OUT: `Conversa_Episodio.turnos`, `provenance_por_campo`, `capa_metricas.esfuerzo_cliente` (`04` §3). Reusar el writer de consolidación; no duplicar. Cita `A.1.6`, `BR-A2`, `BR-A15`, `BR-A16`.
- **Constraints:** provenance por campo (`04` §7). `esfuerzo_cliente` es conteo computado, NULL pre-corrida (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un turno procesado, *When* se sella, *Then* lleva provenance y el contador de esfuerzo se incrementa.
  - **Check ejecutable:** test que asserta provenance + incremento de esfuerzo. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.2.0 — Resolver tier + construir scope_de_acceso desde credencial

- **Goal:** el flujo resuelve el tier del cliente y arma el scope de acceso desde la credencial.
- **Context:** lookup RLS/policy determinista (sin LLM), sync. DATA-IN: `Credencial`, `Politica_Tier.teto_tier`, `Restaurante.tier_base` (`04` §3). Reusar el resolutor de credencial/tier; no duplicar. Cita `A.2.0`, `BR-A4`.
- **Constraints:** scope desde credencial server-side (`04` §7). RLS single-pool. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una credencial, *When* corre, *Then* resuelve tier + scope.
  - **Check ejecutable:** unit-test del resolutor tier/scope. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.2.1 — Hard access filter: RLS predicate + k-anon gate (N>=k)

- **Goal:** el acceso a datos pasa un filtro duro de RLS y k-anon, deny-by-default.
- **Context:** predicado determinista (sin LLM), sync. DATA-IN: `tenant_id` (RLS), `Cohort.n_cuentas` (k-anon). Reusar la RLS de `02:BR-3` + el k-anon de `01:F-1.3b`; no duplicar. Cita `A.2.1`, `BR-A4`, `EC-A4`, `EC-A18`.
- **Constraints:** RLS single-pool + k-anon N>=k (`04` §7). Deny-by-default. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* acceso dentro del pool sobre umbral k, *When* corre, *Then* pasa.
  - *Given* cross-pool o bajo k, *When* corre, *Then* deny.
  - **Check ejecutable:** test RLS + k-anon deny-by-default. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.2.2 — Grounding gate (4 checks booleanos: TTL/respondió/no-ambiguo/tenant)

- **Goal:** ninguna respuesta se compone sin grounding válido (4 condiciones).
- **Context:** 4 checks booleanos deterministas (sin LLM), sync. DATA-IN: ancla de grounding, TTL, estado de respuesta, `tenant_id`. Reusar el gate de grounding; no duplicar. Cita `A.2.2`, `BR-A1`, `EC-A2`, `RIESGO 2`.
- **Constraints:** grounding obligatorio (`04` §7); falla un check ⇒ fail-closed. `TTL` por NOMBRE. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* los 4 checks ok, *When* corre, *Then* pasa.
  - *Given* uno falla, *When* corre, *Then* fail-closed.
  - **Check ejecutable:** unit-test de los 4 checks. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.2.3 — Resolver políticas versionadas (tenant×intent) + sellar policy_version

- **Goal:** el flujo resuelve las políticas vigentes por tenant×intent y sella la versión.
- **Context:** lookup determinista (sin LLM), sync. DATA-IN: `Politica_Tier.policy_version/permitido_hoy`, `intent` (`04` §3). Reusar el resolutor de política; no duplicar. Cita `A.2.3`, `BR-A4`, `BR-A15`.
- **Constraints:** `policy_version` sellada por episodio (A=B, `04` §7). Fail-closed si irresoluble. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* tenant×intent, *When* corre, *Then* resuelve y sella `policy_version`.
  - **Check ejecutable:** unit-test del resolutor + sellado. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.2.4 — Leer cohort + percentil snapshot honrando n_min/k-anon (read-only)

- **Goal:** el flujo lee el contexto de cohort/percentil respetando n_min y k-anon.
- **Context:** lookup read-only determinista (sin LLM), sync. DATA-IN: `Pertenencia_Cohort_Snapshot.percentil_en_cohort/n_min_ok`, `Cohort.supresion_k_aplicada` (`04` §3). Reusar el selector de snapshot; no duplicar. Cita `A.2.4`, `BR-A7`, `BR-A4`.
- **Constraints:** percentil solo si `n_min_ok`; k-anon en salida; percentil = solo contexto (`04` §3). Read-only. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* snapshot válido, *When* lee, *Then* expone percentil como contexto.
  - *Given* `n_min_ok=false`, *When* lee, *Then* modo cualitativo (no percentil).
  - **Check ejecutable:** unit-test del lector honrando n_min/k. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.2.5 — Leer best-action + WHY de P2 + agregar confianza (fetch/seal)

- **Goal:** el flujo lee la mejor acción y su WHY desde P2 y agrega la confianza, sin generarla aquí.
- **Context:** fetch/seal determinista (sin LLM; la generación de NBA vive en P2), sync. DATA-IN: `NBA_Propuesta.causa_raiz/before_after_esperado` (vía nba_usada). Reusar el fetcher de NBA; no duplicar. Cita `A.2.5`, `BR-A9`, `BR-A12`.
- **Constraints:** A solo LEE (no genera NBA, `04` §3 — eso es P2). Confianza agregada determinista. Read-only de P2. ≤100 líneas.
- **Done-when:**
  - *Given* una NBA en P2, *When* corre, *Then* lee best-action+WHY y agrega confianza.
  - **Check ejecutable:** unit-test del fetch/seal (sin generación). `[STACK-TUNE: <comando test>]`.

---

## 05A:A.2.6 — Ensamblar CONTEXTO_MONTADO + cargar provenance_por_campo (CRUD seal)

- **Goal:** el flujo ensambla el contexto montado con su provenance por campo.
- **Context:** seal CRUD determinista (sin LLM), sync. DATA-IN/OUT: `Conversa_Episodio.capa_estructurada` (provenance_por_campo, `04` §3). Reusar el writer de capa estructurada; no duplicar. Cita `A.2.6`, `BR-A2`, `BR-A15`.
- **Constraints:** provenance por campo (`04` §7). Sin juicio. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* las fuentes resueltas, *When* se ensambla, *Then* el contexto lleva provenance por campo.
  - **Check ejecutable:** test que asserta provenance en el contexto montado. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.3.0 — Pre-condiciones duras antes de redactar (grounding/ttl/acceso/policy no-stale)

- **Goal:** ninguna redacción empieza sin pasar las pre-condiciones duras.
- **Context:** checks booleanos deterministas (sin LLM), sync. DATA-IN: grounding, TTL, acceso, `policy_version` no-stale. Reusar los gates de A.2.2/A.2.3/A.6.1; no duplicar. Cita `A.3.0`, `BR-A1`, `BR-A15`.
- **Constraints:** fail-closed: cualquier pre-condición falla ⇒ no redacta (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* todas las pre-condiciones ok, *When* corre, *Then* habilita redacción.
  - *Given* una falla, *When* corre, *Then* fail-closed.
  - **Check ejecutable:** unit-test de las pre-condiciones. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.3.6-CHECK — CHECK determinista que marca self-critique pass/fail + bounded-retry

- **Goal:** el resultado del self-critique (AGENTE) queda marcado por un verificador determinista con tope de reintentos.
- **Context:** verificador CÓDIGO (leaf-split §14: AGENTE propone → CÓDIGO marca), sync. DATA-IN: veredicto del self-critique (interno de A.3.6). Reusar el patrón de CHECK + contador; no duplicar. Cita `A.3.6`, `BR-A6`, `BR-A3`.
- **Constraints:** marca pass/fail determinista; bounded-retry con contador acotado (no loop infinito). Fail-closed al agotar reintentos ⇒ escala. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un veredicto pass, *When* corre el CHECK, *Then* marca pass y avanza.
  - *Given* fail repetido, *When* agota reintentos, *Then* escala (fail-closed).
  - **Check ejecutable:** unit-test del CHECK + contador de reintentos. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.4.1 — Normalizar 3 brazos a banda, brazo faltante ⇒ más-conservador

- **Goal:** los 3 brazos se normalizan a banda y el brazo faltante cae al más conservador.
- **Context:** mapeo determinista (sin LLM), sync. DATA-IN: los 3 brazos del `min()`. Reusar el normalizador de banda; no duplicar. Cita `A.4.1`, `BR-A5`, `FEW-SHOT CÓDIGO#3`.
- **Constraints:** brazo faltante ⇒ más conservador (fail-closed, `04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un brazo faltante, *When* corre, *Then* cae al más conservador.
  - **Check ejecutable:** unit-test de normalización con brazo faltante. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.4.2 — Hard grounding gate boolean (precondición)

- **Goal:** ninguna acción procede sin grounding (precondición dura).
- **Context:** precondición booleana determinista (sin LLM), sync. DATA-IN: ancla de grounding. Reusar el gate de A.2.2; no duplicar. Cita `A.4.2`, `BR-A1`, `BR-A4`.
- **Constraints:** grounding obligatorio (`04` §7). Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* sin grounding, *When* corre, *Then* fail-closed.
  - **Check ejecutable:** unit-test del gate de grounding. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.4.4 — Comparar confianza vs piso (gate numérico determinista)

- **Goal:** la confianza se compara contra su piso de forma determinista.
- **Context:** gate numérico determinista (sin LLM; el juicio de confianza fue upstream A.3.1), sync. DATA-IN: confianza (spec-local), piso. Reusar el comparador de umbral; no duplicar. Cita `A.4.4`, `BR-A12`.
- **Constraints:** `piso` por NOMBRE; confianza < piso ⇒ escala (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* confianza < piso, *When* corre, *Then* escala.
  - *Given* confianza >= piso, *When* corre, *Then* avanza.
  - **Check ejecutable:** unit-test del gate en ambos lados del piso. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.4.6 — nivel_efectivo = least(pedido_NBA, liberado_evals, teto_tier) (motor min)

- **Goal:** el flujo computa el `nivel_efectivo` con el motor `min()` sobre el ENUM ordenado.
- **Context:** motor `least()` determinista (CÓDIGO #3 golden-set), sync. DATA-IN: `min_calculo.pedido_NBA/liberado_evals/teto_tier`. DATA-OUT: `min_calculo.nivel_efectivo` (producer = motor runtime, `04` §14 · COMPUTED/NULL pre-run). Reusar el motor de `02:1B`; no duplicar. Cita `A.4.6`, `BR-A5`, `FEW-SHOT CÓDIGO#3`.
- **Constraints:** `least()` sobre ENUM ordenado; brazo null ⇒ menor (`04` §7). `min_calculo` nunca semeado. append-only. ≤100 líneas.
- **Done-when:**
  - *Given* los 3 brazos, *When* corre, *Then* `nivel_efectivo = least(...)`.
  - **Check ejecutable:** unit-test del motor + anti-fake sin filas pre-corrida. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.4.7 — Computar prioridad_cola desde spike (nunca toca tier)

- **Goal:** la prioridad de cola se computa por spike sin alterar el tier.
- **Context:** cómputo determinista (sin LLM), sync. DATA-IN: señal de spike. Reusar el priorizador de cola; no duplicar. Cita `A.4.7`, `BR-A13`, `EC-A13`.
- **Constraints:** prioridad nunca eleva tier (aislada del motor, `04` §3). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un spike, *When* corre, *Then* la prioridad de cola sube sin tocar el tier.
  - **Check ejecutable:** unit-test que asserta tier invariante ante prioridad. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.4.8 — Sellar Decision_Trace(bajo) + estado_conversa=abierta (append-only)

- **Goal:** una acción de bajo nivel sella su traza y deja la conversa abierta.
- **Context:** write append-only determinista (sin LLM), sync. DATA-IN/OUT: `Decision_Trace` (nivel bajo), `Conversa_Episodio.estado_conversa=abierta` (`04` §3). Reusar el writer de trace; no duplicar. Cita `A.4.8`, `BR-A9`.
- **Constraints:** append-only; sin-trace-no-acción (`04` §7). Nunca marca "resuelto" (`04` §3). `estado_conversa` cae del flujo (`04` §14). ≤100 líneas.
- **Done-when:**
  - *Given* una acción bajo nivel, *When* se sella, *Then* `Decision_Trace` append-only + `estado_conversa=abierta`.
  - **Check ejecutable:** test que asserta append-only + estado. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.5.0 — Branch nivel_efectivo==bajo? (consume min() sin recomputar)

- **Goal:** el flujo decide la rama según `nivel_efectivo`, consumiendo el resultado del motor.
- **Context:** gate determinista (sin LLM), sync. DATA-IN: `min_calculo.nivel_efectivo`. Reusar el resultado de A.4.6; no recomputar. Cita `A.5.0`, `BR-A5`, `BR-A9`.
- **Constraints:** consume `nivel_efectivo` (no recomputa). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* `nivel_efectivo=bajo`, *When* corre, *Then* rutea a ejecución autónoma BAJO.
  - **Check ejecutable:** unit-test del branch por nivel. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.5.1 — Build pedido_ejecucion + idempotency_key hash + sellar policy_version

- **Goal:** el flujo arma el pedido de ejecución con una clave idempotente y sella la versión de política.
- **Context:** construcción determinista (sin LLM; A origina, no LLM), sync. DATA-IN/OUT: pedido_ejecucion, idempotency_key, `policy_version`. Reusar el hash de idempotencia; no duplicar. Cita `A.5.1`, `BR-A9`, `BR-A15`.
- **Constraints:** idempotency_key determinista (hash); `policy_version` sellada. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un contexto válido, *When* corre, *Then* arma pedido + idempotency_key + sella versión.
  - **Check ejecutable:** unit-test del hash idempotente + sellado. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.5.2 — Adquirir lock idempotente + handoff autónomo BAJO

- **Goal:** una ejecución BAJO adquiere su lock idempotente antes del handoff autónomo.
- **Context:** lock CRUD determinista (sin LLM), sync. DATA-IN: idempotency_key. Reusar el patrón de lock de `02:EC-7`; no duplicar. Cita `A.5.2`, `BR-A9`, `BR-A10`.
- **Constraints:** lock idempotente (segundo intento no duplica); solo BAJO autónomo. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* la clave, *When* adquiere lock, *Then* el handoff BAJO procede una sola vez.
  - **Check ejecutable:** test de lock + no-duplicación. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.5.3 — P2 ejecuta + re-aplica min() + aborto financiero en borde

- **Goal:** la ejecución re-aplica el `min()` y aborta si toca un borde financiero.
- **Context:** gate determinista (sin LLM en el paso de A; substrato P2), sync. DATA-IN: `NBA_Propuesta.clase_financiera`, `min_calculo.nivel_efectivo`. Reusar el motor + guard financiero; no duplicar. Cita `A.5.3`, `BR-A3`, `BR-A9`, `FEW-SHOT N8N#2`.
- **Constraints:** re-aplica `min()`; financiero (`clase_financiera=directa`) ⇒ aborto en borde (`04` §7). Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* una acción financiera en borde, *When* P2 ejecuta, *Then* aborta.
  - **Check ejecutable:** unit-test del aborto financiero en borde. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.5.4 — Read-back de fuente INDEPENDIENTE + quality gate (observed vs expected)

- **Goal:** tras ejecutar, el flujo verifica el resultado leyendo una fuente independiente.
- **Context:** read-back + compare determinista (sin LLM), sync. DATA-IN: fuente independiente, resultado esperado. Reusar el comparador de calidad; no duplicar. Cita `A.5.4`, `BR-A10`, `BR-A1`, `EC-A1`.
- **Constraints:** fuente INDEPENDIENTE (no la propia escritura). observed != expected ⇒ degrade (A.5.6). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* observed == expected, *When* corre, *Then* confirma.
  - *Given* observed != expected, *When* corre, *Then* no confirma (rutea a degrade).
  - **Check ejecutable:** unit-test del read-back con match/mismatch. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.5.5 — estado_conversa=live_aguardando_permanencia + append Decision_Trace (nunca 'resuelto')

- **Goal:** tras confirmar, la conversa queda en espera de permanencia, nunca marcada resuelto.
- **Context:** CRUD determinista (sin LLM), sync. DATA-IN/OUT: `Conversa_Episodio.estado_conversa=live_aguardando_permanencia`, `Decision_Trace` (append). Reusar el writer de estado/trace; no duplicar. Cita `A.5.5`, `BR-A10`, `BR-A16`.
- **Constraints:** NUNCA marca "resuelto" (cierre = P3, `04` §3). append-only. `estado_conversa` cae del flujo (`04` §14). ≤100 líneas.
- **Done-when:**
  - *Given* una confirmación, *When* se sella, *Then* `estado_conversa=live_aguardando_permanencia` + trace appendeado.
  - **Check ejecutable:** test que asserta el estado correcto (nunca resuelto). `[STACK-TUNE: <comando test>]`.

---

## 05A:A.6.1 — Sellar policy_version/tono_version + verificar no-stale, congelar traces

- **Goal:** al cerrar el episodio se sellan las versiones y se verifican no-stale, congelando las trazas.
- **Context:** seal determinista (sin LLM), sync. DATA-IN/OUT: `Conversa_Episodio.capa_estructurada` (policy_version, tono_version). Reusar el sellador de versiones; no duplicar. Cita `A.6.1`, `BR-A15`.
- **Constraints:** A=B (versiones por episodio); no-stale verificado (`04` §7). Traces congeladas (append-only). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* versiones vigentes, *When* se sella, *Then* quedan estampadas + traces congeladas.
  - *Given* versión stale, *When* se sella, *Then* fail-closed.
  - **Check ejecutable:** unit-test del sellado + check no-stale. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.6.2 — Segunda pasada de redacción PII sobre transcript + retención limitada

- **Goal:** el transcript pasa una segunda redacción de PII con retención limitada.
- **Context:** transform determinista (sin LLM), sync, fail-closed. DATA-IN/OUT: `Conversa_Episodio.capa_transcripcion`. Reusar el redactor de A.1.2; no duplicar. Cita `A.6.2`, `BR-A2`, `BR-A15`, `EC-A14`.
- **Constraints:** PII E2E (`04` §7); retención limitada. Fail-closed si residual. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* el transcript final, *When* corre, *Then* PII residual queda redactada con retención limitada.
  - **Check ejecutable:** test de segunda pasada PII. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.6.3 — Poblar capa_estructurada (tenant_id+restaurante_id + provenance, hipótesis [I])

- **Goal:** la capa estructurada se puebla con sus identificadores y provenance, marcando la hipótesis como `[I]`.
- **Context:** CRUD determinista (sin LLM; la causa ya se produjo upstream), sync. DATA-IN/OUT: `Conversa_Episodio.capa_estructurada` (estampa `tenant_id`/`restaurante_id`, provenance). Reusar el writer de A.2.6; no duplicar. Cita `A.6.3`, `BR-A15`, `BR-A7`, `SINAL_EPISODIO contrato-B`.
- **Constraints:** estampa `tenant_id`+`restaurante_id`; hipótesis = `[I]` (provenance, `04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* el episodio cerrado, *When* se puebla, *Then* la capa lleva ids + provenance + hipótesis `[I]`.
  - **Check ejecutable:** test que asserta ids/provenance/sello `[I]`. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.6.4 — Computar esfuerzo_cliente + deflection_mala (anti-join/count determinista)

- **Goal:** se computan el esfuerzo del cliente y el flag de mala deflexión sobre turnos/re-contactos.
- **Context:** anti-join/count determinista (sin LLM), sync. DATA-IN: `Conversa_Episodio.capa_metricas` (turnos, re-contactos). DATA-OUT: `capa_metricas.esfuerzo_cliente`, `deflection_mala` (producer = count/anti-join, `04` §14 · COMPUTED/NULL pre-run). Reusar la utilidad de conteo; no duplicar. Cita `A.6.4`, `BR-A16`, `EC-A11`.
- **Constraints:** conteos computados, NULL pre-corrida (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* turnos/re-contactos, *When* corre, *Then* `esfuerzo_cliente`/`deflection_mala` se computan.
  - **Check ejecutable:** unit-test del cálculo + anti-fake NULL-pre-run. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.6.5 — Generar episodio_id idempotente + upsert write-back a Cerebro(P7)

- **Goal:** el episodio se persiste de vuelta al Cerebro de forma idempotente.
- **Context:** CRUD idempotente determinista (sin LLM), sync. DATA-IN/OUT: `Conversa_Episodio.episodio_id` (idempotente), write-back a Cerebro/P7 (`04` §3). Reusar el upsert idempotente; no duplicar. Cita `A.6.5`, `BR-A15`, `EC-A15`.
- **Constraints:** `episodio_id` idempotente (anti-double-count, `04` §3) — golden edge 05A→Cerebro(P7), estampado +`tenant_id`+`restaurante_id`. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un episodio, *When* se escribe dos veces, *Then* el upsert idempotente no duplica.
  - **Check ejecutable:** test de idempotencia del write-back. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.6.6 — Actualizar contador 1:10 (provisional vs P3) + fan-out señal

- **Goal:** el contador 1:10 se actualiza de forma provisional y se emite la señal de fan-out.
- **Context:** derive/emit determinista (sin LLM), sync. DATA-IN/OUT: contador 1:10 provisional; `Salud_1a10` es vista read-only (no DATA-OUT). Reusar el derivador del contador; no escribir en la vista. Cita `A.6.6`, `BR-A16`, `BR-A10`, `DESPUÉS`.
- **Constraints:** `Salud_1a10` es read-only (no se escribe, `04` §3.4). Provisional separado del confirmado P3 (2-compuertas). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un episodio absorbido, *When* corre, *Then* el contador provisional sube y se emite fan-out, sin escribir `Salud_1a10`.
  - **Check ejecutable:** test que asserta no-write a la vista + contador provisional. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.7.2 — Revisión META de tono en lote (acción humana sync in-app)

- **Goal:** un humano revisa el tono en lote (muestra ∪ escaladas) desde la app.
- **Context:** UI/CRUD + HUMAN-gate (sin LLM en el shell), user-action sync (NO N8N). DATA-IN: lote de episodios (muestra + escaladas). Reusar la cola de revisión en lote; no duplicar. Cita `A.7.2`, `BR-A8`, `BR-A16`.
- **Constraints:** acción humana sync = CÓDIGO/UI + HUMAN-gate (`04` §5 TEST-2). RLS single-pool. a11y/estados. ≤100 líneas.
- **Done-when:**
  - *Given* un lote, *When* el humano revisa el tono, *Then* sus correcciones quedan registradas.
  - **Check ejecutable:** test de la cola de revisión de tono. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.7.3 — Revisión humana de contenido/decisión en lote (2 compuertas de valor)

- **Goal:** un humano revisa la sustancia de las decisiones en lote, con las 2 compuertas de valor.
- **Context:** UI/CRUD + HUMAN-gate (sin LLM en el shell), user-action sync. DATA-IN: lote de decisiones. Reusar la cola de revisión de `A.7.2`; no duplicar. Cita `A.7.3`, `BR-A16`, `BR-A15`.
- **Constraints:** 2-compuertas de valor (`04` §7); acción humana sync = CÓDIGO + HUMAN-gate. ≤100 líneas.
- **Done-when:**
  - *Given* un lote de decisiones, *When* el humano revisa, *Then* aplica las 2 compuertas y registra.
  - **Check ejecutable:** test de la cola de revisión de contenido. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.7.4b — Anti-rubber-stamp (confirmador_id != proponente_id + bridging + rejection→0 alarm)

- **Goal:** las correcciones humanas no son rubber-stamp y una tasa de rechazo→0 dispara alarma.
- **Context:** CHECK determinista sobre `Decision_Trace` (sin LLM), sync. DATA-IN: `Decision_Trace.confirmador_id/proponente_id`. Reusar el CHECK 4-ojos + `rubber_stamp_flag`; no duplicar. Cita `A.7.4b`, `BR-A17`, `EC-A7`.
- **Constraints:** `confirmador_id != proponente_id` (`04` §7); rejection-rate→0 ⇒ alarma (anti-rubber-stamp). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* confirmador == proponente, *When* corre, *Then* rechazo.
  - *Given* rejection-rate cae a 0, *When* corre, *Then* alarma.
  - **Check ejecutable:** unit-test 4-ojos + alarma rejection→0. `[STACK-TUNE: <comando test>]`.

---

## 05A:A.7.7 — Sellar gobernanza: provenance + contador 1:10 honesto + versionar + write-back

- **Goal:** la gobernanza sella provenance, incrementa el contador honesto y versiona los artefactos.
- **Context:** CRUD determinista (sin LLM), sync. DATA-IN/OUT: provenance, contador 1:10, artefactos versionados, write-back. Reusar los writers de A.6.x; no duplicar. Nunca marca resuelto. Cita `A.7.7`, `BR-A15`, `BR-A10`, `BR-A16`.
- **Constraints:** contador 1:10 honesto (2-compuertas, `04` §7); nunca "resuelto". append-only. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una corrección aplicada, *When* se sella, *Then* provenance + contador + versión quedan escritos, sin marcar resuelto.
  - **Check ejecutable:** test del sellado de gobernanza (nunca resuelto). `[STACK-TUNE: <comando test>]`.

---
## 05B — Diagnóstico · piezas CÓDIGO

## 05B:B.1.3 — Dedup lookup de Problema abierto + create-or-increment frecuencia

- **Goal:** un disparo nuevo o incrementa la frecuencia de un `Problema_Diagnosticado` abierto, sin duplicar.
- **Context:** dedup lookup + CRUD determinista (sin LLM), sync. DATA-IN/OUT: `Problema_Diagnosticado.problema_id/estado/frecuencia` (`04` §3). Reusar el patrón create-or-increment; no duplicar. Cita `B.1.3`, `BR-B5`, `BR-B8`.
- **Constraints:** un caso = un PROBLEMA (anti doble-conteo, `04` §3). `frecuencia` es count computado (`04` §14). RLS single-pool. ≤100 líneas.
- **Done-when:**
  - *Given* un problema abierto existente, *When* llega un disparo, *Then* incrementa `frecuencia` (no duplica).
  - *Given* sin problema previo, *When* llega, *Then* crea uno.
  - **Check ejecutable:** unit-test create-vs-increment. `[STACK-TUNE: <comando test>]`.

---

## 05B:B.1.4 — Función de prioridad de despacho f(criticidad, impacto[C], agile)

- **Goal:** la cola de despacho se ordena por una función determinista de criticidad, impacto y agilidad.
- **Context:** función de prioridad determinista (sin LLM), sync. DATA-IN: criticidad, `impacto` `[C]`, agile. Reusar el priorizador; no duplicar. Cita `B.1.4`, `BR-B11`, `BR-B10`.
- **Constraints:** orden auditable fijo; `impacto` es `[C]` proyección (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* varios problemas, *When* corre, *Then* la cola queda ordenada por la función definida.
  - **Check ejecutable:** unit-test del orden de despacho. `[STACK-TUNE: <comando test>]`.

---

## 05B:B.5.2b — Anti-join Orden(fallido) MINUS reclamantes ⇒ filas Afetado

- **Goal:** se identifican los afectados silenciosos por anti-join entre órdenes fallidas y reclamantes.
- **Context:** anti-join determinista (sin LLM; el razonamiento de cruzar población es la pieza AGENTE `05B:US-B3.1.1`), sync. DATA-IN: `Orden` (status_pago=fallido), `Conversa_Episodio` (reclamantes). DATA-OUT: `Afetado.reclamou/silencioso/evidencia/restaurante_id` (producer = caza-silenciosos corriendo, `04` §14 · COMPUTED/NULL pre-run; el seed NO inserta las filas `Afetado`). Reusar el índice parcial `(restaurante_id) WHERE status_pago='fallido'` (`04` §3); no duplicar. Cita `B.5.2`, `BR-B4`, `B.5`.
- **Constraints:** las filas `Afetado` NUNCA se semean (`04` §14 — el agente CORRIENDO las produce). `Afetado.evidencia → Orden.orden_id`. k-anon NO suprime internamente (silencioso n=1 permitido, `04` §3). RLS dentro del pool. ≤100 líneas.
- **Done-when:**
  - *Given* órdenes fallidas y reclamantes, *When* corre el anti-join, *Then* las filas `Afetado` (silencioso/reclamou) se computan.
  - *Given* pre-corrida, *When* se inspecciona, *Then* cero filas `Afetado` semeadas.
  - **Check ejecutable:** unit-test del anti-join (47/35 derivado) + anti-fake (sin filas pre-corrida). `[STACK-TUNE: <comando test>]`.

---

## 05B:B.8.6 — Branch de mensaje proactivo policy-driven vía 05A (sin internals)

- **Goal:** el mensaje proactivo se dispara según política, delegando el envío a 05A.
- **Context:** branch determinista policy-driven (sin LLM), sync. DATA-IN: política de comunicación (`avisar` vs `corregir-callado`). Reusar el branch de `05B:US-B6.4.1`; no duplicar internals de 05A. Cita `B.8.6`, `BR-B13`, `EC-B14`.
- **Constraints:** default no-comunicar (`04` §7); delega envío a 05A (no reimplementa). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* política avisar, *When* corre, *Then* dispara el mensaje vía 05A.
  - *Given* política corregir-callado, *When* corre, *Then* no comunica.
  - **Check ejecutable:** unit-test de la rama de política. `[STACK-TUNE: <comando test>]`.

---

## 05B:EC-B10 — Guard injection/fraude (texto = DATO, no instrucción, log señal)

- **Goal:** el texto de conversa nunca se ejecuta como instrucción; la inyección se loguea.
- **Context:** guard anti-injection determinista (sin LLM), sync. DATA-IN: `Conversa_Episodio` (texto). Reusar el data-fencing (`04` §7 TEXTO=DATO); no duplicar. Cita `EC-B10`, `BR-B3`, `BR-B8`.
- **Constraints:** `tratado_como_dato=true`; inyección ⇒ `señal_inyeccion` logueada, motor intacto (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* texto con instrucción embebida, *When* corre, *Then* se trata como dato + log de señal.
  - **Check ejecutable:** unit-test con payload de inyección. `[STACK-TUNE: <comando test>]`.

---

## 05B:EC-B5 — Cross-tenant guard (cuenta tenant_id distintos en agregación, aborta HARD)

- **Goal:** ninguna agregación de diagnóstico cruza `tenant_id`.
- **Context:** predicado RLS determinista (sin LLM), sync. DATA-IN: `tenant_id` de las filas. Reusar la RLS de `02:BR-3`; no duplicar. Cita `EC-B5`, `BR-B6`, `BR-B5`.
- **Constraints:** >1 `tenant_id` ⇒ aborto HARD + bloqueo (`04` §7/§8). Cruzar restaurantes dentro del pool es permitido. Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* agregación cross-tenant, *When* corre, *Then* aborta.
  - *Given* dentro del pool, *When* corre, *Then* pasa.
  - **Check ejecutable:** test RLS cross-tenant. `[STACK-TUNE: <comando test RLS>]`.

---

## 05B:EC-B6 — PII scanner en cada borde read/write (redacta/bloquea handoff)

- **Goal:** toda frontera de lectura/escritura escanea PII y bloquea el handoff si hay residual.
- **Context:** scanner determinista (sin LLM), sync. DATA-IN: payloads en bordes. Reusar el redactor de `05A:A.1.2`; no duplicar. Cita `EC-B6`, `BR-B7`.
- **Constraints:** PII E2E (`04` §7); residual ⇒ bloquea handoff (`v_dossier_handoff` no emite, `04` §3.4). Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* PII en un borde, *When* corre, *Then* redacta o bloquea el handoff.
  - **Check ejecutable:** test del scanner en bordes. `[STACK-TUNE: <comando test>]`.

---

## 05B:US-B1.1.1 — Gate valida tenant_id+restaurante_id presentes, crea fila, fail-closed

- **Goal:** ninguna fila de diagnóstico se crea sin `tenant_id` y `restaurante_id`.
- **Context:** gate CRUD determinista (sin LLM), sync. DATA-IN/OUT: `Problema_Diagnosticado.restaurante_id` + `tenant_id`. Reusar el gate de creación; no duplicar. Cita `F-B1.1`, `US-B1.1.1`, `BR-B6`.
- **Constraints:** `tenant_id`/`restaurante_id` NOT NULL (`04` §3); fail-closed si falta. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* ambos ids, *When* corre, *Then* crea la fila.
  - *Given* falta uno, *When* corre, *Then* fail-closed.
  - **Check ejecutable:** unit-test del gate de ids. `[STACK-TUNE: <comando test>]`.

---

## 05B:US-B1.2.1 — Tie-break ordering criticidad>impacto>agile (orden fijo auditable)

- **Goal:** los empates de prioridad se rompen con un orden fijo y auditable.
- **Context:** ordering determinista (sin LLM), sync. DATA-IN: criticidad, impacto, agile. Reusar el priorizador de `05B:B.1.4`; no duplicar. Cita `F-B1.2`, `US-B1.2.1`, `BR-B11`.
- **Constraints:** orden fijo `criticidad > impacto > agile` (auditable). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un empate, *When* corre, *Then* se rompe por el orden fijo.
  - **Check ejecutable:** unit-test del tie-break. `[STACK-TUNE: <comando test>]`.

---

## 05B:US-B1.3.1 — Dedup + reconcile contra el set Afetado, fail-closed en hard-no

- **Goal:** el conteo de afectados se reconcilia contra el set `Afetado`, fail-closed ante hard-no.
- **Context:** dedup + reconcile determinista (sin LLM), sync. DATA-IN: `Afetado` (set), `Problema_Diagnosticado`. Reusar `count(Afetado WHERE problema_id=X)` (`04` §3 fix eng); no duplicar. Cita `F-B1.3`, `US-B1.3.1`, `BR-B17`, `BR-B8`, `B-block-1`.
- **Constraints:** `restaurantes_afetados` = `count(Afetado)` (nunca número guardado, `04` §3). `silenciosos_no_evaluable` si fuente stale. Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* el set `Afetado`, *When* reconcilia, *Then* el conteo coincide con `count(Afetado)`.
  - *Given* fuente stale, *When* corre, *Then* `silenciosos_no_evaluable`.
  - **Check ejecutable:** unit-test de reconciliación 47=count(Afetado) + stale. `[STACK-TUNE: <comando test>]`.

---

## 05B:US-B2.3.1 — Lazy-fetch de UNA fuente del path activo, bloquea bulk

- **Goal:** el árbol diagnóstico trae solo la fuente del path activo, nunca en bulk.
- **Context:** lazy-fetch determinista (sin LLM), sync. DATA-IN: `Problema_Diagnosticado.issue_tree` (path activo). Reusar el fetcher perezoso; no duplicar. Cita `F-B2.3`, `US-B2.3.1`, `BR-B2`.
- **Constraints:** fetch de UNA fuente del path activo; bloquea bulk (`04` §3 issue_tree). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un path activo, *When* corre, *Then* trae solo su fuente.
  - *Given* intento de bulk, *When* corre, *Then* se bloquea.
  - **Check ejecutable:** unit-test del lazy-fetch + bloqueo bulk. `[STACK-TUNE: <comando test>]`.

---

## 05B:US-B3.3.1 — Boundary check (cuenta tenant_id distintos, fail-closed cross-tenant)

- **Goal:** ningún cruce de población diagnóstica sale del pool.
- **Context:** boundary check determinista (sin LLM), sync. DATA-IN: `tenant_id` de las filas cruzadas. Reusar la RLS de `05B:EC-B5`; no duplicar. Cita `F-B3.3`, `US-B3.3.1`, `BR-B5`, `BR-B6`.
- **Constraints:** >1 `tenant_id` ⇒ fail-closed (`04` §7/§8). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* cruce cross-tenant, *When* corre, *Then* fail-closed.
  - **Check ejecutable:** test RLS del boundary check. `[STACK-TUNE: <comando test RLS>]`.

---

## 05B:US-B5.1.1 — Named_Query rs_perdido + churn job + double-check (nunca LLM)

- **Goal:** el `rs_perdido` y el churn se computan de forma determinista con double-check.
- **Context:** `Named_Query` determinista (sin LLM), sync. DATA-IN: `Orden` (valor_neto, status_pago). DATA-OUT: `Problema_Diagnosticado.rs_perdido/churn_risk` (producer = `Named_Query` / job pre-churn, `04` §14 · COMPUTED/NULL pre-run; si el job pre-churn no existe, `churn_risk` se EXCLUYE fail-closed). Reusar la fórmula canónica única `rs_perdido = sum(Orden.valor_neto WHERE status_pago='fallido')` (`04` §3); no duplicar. Cita `F-B5.1`, `US-B5.1.1`, `BR-B10`.
- **Constraints:** fórmula canónica ÚNICA (idéntica §4/§6/§14). Hereda peor provenance. PROHIBIDO semear; NULL pre-run. `churn_risk` fail-closed si no hay productor. ≤100 líneas.
- **Done-when:**
  - *Given* órdenes fallidas, *When* corre, *Then* `rs_perdido = sum(valor_neto)` derivado.
  - *Given* sin job pre-churn, *When* se emite, *Then* `churn_risk` se excluye (fail-closed).
  - **Check ejecutable:** test que asserta `rs_perdido` derivado + exclusión de `churn_risk` sin productor + anti-fake NULL-pre-run. `[STACK-TUNE: <comando test>]`.

---

## 05B:US-B5.2.1 — Priorización ahora/fila desde riesgo×impacto×costo

- **Goal:** cada problema se enruta a "ahora" o "fila" según riesgo×impacto×costo.
- **Context:** priorización determinista (sin LLM), sync. DATA-IN: riesgo, impacto, costo. Reusar el priorizador de `05B:B.1.4`; no duplicar. Cita `F-B5.2`, `US-B5.2.1`, `BR-B11`.
- **Constraints:** determinista; insumos computados (`04` §14). ≤100 líneas.
- **Done-when:**
  - *Given* riesgo/impacto/costo, *When* corre, *Then* clasifica ahora/fila.
  - **Check ejecutable:** unit-test de la priorización. `[STACK-TUNE: <comando test>]`.

---

## 05B:US-B5.3.1 — Ledger write custo_resolver vs valor_ganho por caso

- **Goal:** cada caso registra su costo de resolver frente al valor ganado en el libro-razón.
- **Context:** ledger write determinista (sin LLM), sync. DATA-IN/OUT: `Problema_Diagnosticado.custo_resolver/valor_ganho` (`04` §3). Reusar el writer del libro-razón; no duplicar. Cita `F-B5.3`, `US-B5.3.1`, `BR-B14`.
- **Constraints:** `custo_resolver`/`valor_ganho` computados, NULL pre-run (`04` §14). append-only. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un caso resuelto, *When* corre, *Then* el ledger registra costo vs valor (derivados).
  - **Check ejecutable:** test del ledger + anti-fake NULL-pre-run. `[STACK-TUNE: <comando test>]`.

---

## 05B:US-B6.1.1 — Demo: stub determinista regla tipo_area→ruta (5 reglas en fila)

- **Goal:** el ruteo de la demo usa un stub determinista `tipo_area → ruta` (las 5 reglas completas quedan en backlog).
- **Context:** regla determinista FIXED (sin LLM), sync. DATA-IN: `Problema_Diagnosticado.tipo_area`. Reusar la tabla de ruteo; no duplicar. Cita `F-B6.1`, `US-B6.1.1`.
- **Constraints:** stub FIXED para demo; las 5 reglas plenas son fila (TODO rastreado, no deuda silenciosa). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un `tipo_area`, *When* corre el stub, *Then* devuelve la ruta determinista.
  - **Check ejecutable:** unit-test del stub de ruteo. `[STACK-TUNE: <comando test>]`.

---

## 05B:US-B6.2.1 — CRUD write/increment de caso replicable + frecuencia

- **Goal:** un caso replicable se persiste o incrementa su frecuencia.
- **Context:** CRUD determinista (sin LLM), sync. DATA-IN/OUT: `Problema_Diagnosticado` (CASO_REPO jsonb: caso replicable cliente/día/screenshots) + `frecuencia` + `ultima_vez_ts` (`04` §9/§3.1). `Knowledge_Case` (KB) es entidad aparte — solo `links_similares` si hace falta. Cita `F-B6.2`, `US-B6.2.1`, `BR-B15`.
- **Constraints:** `CASO_REPO` es sub-objeto jsonb dentro de `Problema_Diagnosticado` (`04` §9, no tabla propia). `frecuencia` es count (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un caso replicable nuevo, *When* corre, *Then* se persiste en `Problema_Diagnosticado.CASO_REPO` (jsonb).
  - *Given* uno existente, *When* corre, *Then* incrementa frecuencia.
  - **Check ejecutable:** unit-test create-vs-increment + flag inicial. `[STACK-TUNE: <comando test>]`.

---

## 05B:US-B6.3.1 — Gate de completitud 11-campos + provenance, fail-closed si incompleto

- **Goal:** el dossier solo se emite si sus 11 campos están completos con provenance.
- **Context:** gate de completitud determinista (sin LLM), sync. DATA-IN: los 11 campos de `v_dossier_handoff` (`04` §3.4). Reusar el gate fail-closed del dossier; no duplicar. Cita `F-B6.3`, `US-B6.3.1`, `BR-B17`, `BR-B18`.
- **Constraints:** fail-closed: cualquier campo vacío/sin provenance ⇒ no emite (`04` §3.4); PII saneada. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* los 11 campos completos con provenance, *When* corre, *Then* emite.
  - *Given* un campo vacío, *When* corre, *Then* fail-closed.
  - **Check ejecutable:** unit-test del gate de 11 campos (completo/incompleto). `[STACK-TUNE: <comando test>]`.

---

## 05B:US-B6.4.1 — Branch de política avisar vs corregir-callado (default no-comunicar)

- **Goal:** el flujo decide avisar o corregir-callado según política, con default no-comunicar.
- **Context:** branch de política determinista (sin LLM), sync. DATA-IN: política de comunicación. Reusar el branch de `05B:B.8.6`; no duplicar. Cita `F-B6.4`, `US-B6.4.1`, `BR-B13`.
- **Constraints:** default no-comunicar (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* política avisar, *When* corre, *Then* avisar.
  - *Given* sin política explícita, *When* corre, *Then* no-comunicar.
  - **Check ejecutable:** unit-test del branch con default. `[STACK-TUNE: <comando test>]`.

---
## 05C — Generación de conocimiento · piezas CÓDIGO

## 05C:EPIC-C2 — Evidencia de mercado agregada k-anon (Named_Query/view dentro del pool)

- **Goal:** los generadores leen evidencia de mercado agregada y k-anonimizada, sin exponer cuentas individuales.
- **Context:** Named_Query/view agregada determinista (sin LLM), invocada sync por generador. DATA-IN: `Cohort.baseline_descriptivo` (mercado agregado dentro del pool, `04` §3). Reusar la view k-anon de `05C:US-C2-2`; no duplicar. Cita `EPIC-C2`, `BR-C2-3`, `BR-C2-4`, `CIERRE §2`.
- **Constraints:** k-anon `n_cuentas >= k` en la salida (`04` §7); ya NO resuelve NBA (CIERRE §2). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un cohort sobre umbral k, *When* corre, *Then* devuelve el agregado de mercado.
  - *Given* bajo k, *When* corre, *Then* suprime (celda nula).
  - **Check ejecutable:** unit-test del agregado k-anon. `[STACK-TUNE: <comando test>]`.

---

## 05C:EPIC-C3d — Resolución NBA: match Knowledge_Case → contrato tipado o MISSING

- **Goal:** la resolución de "cómo" hace match contra `Knowledge_Case` y devuelve un contrato tipado o MISSING.
- **Context:** catalog lookup/match determinista (sin LLM), sync. DATA-IN: `Knowledge_Case.resolucao` (jsonb steps[] tipado, `04` §3.5). DATA-OUT: contrato tipado o MISSING. Reusar el matcher de `Knowledge_Case`; NO crear código A9 en `NBA_Catalogo` (cerrado, `04` §3.5). Cita `EPIC-C3d`, `BR-C3d-1`, `CIERRE §2`, `CIERRE-2.C`.
- **Constraints:** "crear NBA" = INSERT en `Knowledge_Case` (`flag=no-reforzado`), jamás A9 (`04` §3.5). MISSING ⇒ escala (no inventa). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un `Knowledge_Case` matcheable, *When* corre, *Then* devuelve el contrato tipado.
  - *Given* sin match, *When* corre, *Then* MISSING (escala).
  - **Check ejecutable:** unit-test del match con/sin caso. `[STACK-TUNE: <comando test>]`.

---

## 05C:EPIC-C5 — Ledger = Decision_Trace + min_calculo + ROI_Operador (precondición sync)

- **Goal:** ningún artefacto se entrega sin su ledger (traza + cálculo + métrica) escrito.
- **Context:** write append-only + metric gate determinista (sin LLM), sync. DATA-IN/OUT: `Decision_Trace`, `min_calculo`, `ROI_Operador` (reuso, no tabla nueva). Reusar los writers existentes (`04` §3); no crear tabla. Cita `EPIC-C5`, `BR-C5-1`, `BR-C5-2`, `CIERRE-2.A`, `CIERRE-2.B`.
- **Constraints:** sin-trace-no-acción (`04` §7); append-only; reusa Cerebro (no tabla nueva, `04` §3.5). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un artefacto pre-entrega, *When* corre el ledger, *Then* `Decision_Trace`+`min_calculo`+métrica quedan escritos antes de entregar.
  - **Check ejecutable:** test que asserta precondición de ledger antes de entrega. `[STACK-TUNE: <comando test>]`.

---

## 05C:EPIC-C7 — Gobernanza: 3-gate fail-closed + promoción/degradación (cola humana)

- **Goal:** la gobernanza rutea por 3 gates y promueve/degrada clases con cola humana.
- **Context:** routing 3-gate determinista + HUMAN-gate (sin LLM), sync. DATA-IN: `Credencial`, `Politica_Tier`, `min_calculo`, `Eval_Cell`. Reusar el motor TRES PUERTAS + la cola de `05C:US-C7-1`; no duplicar. Cita `EPIC-C7`, `BR-C7-1`, `BR-C7-2`, `BR-C7-7`, `CIERRE-2.A`.
- **Constraints:** 3 gates fail-closed (gate-1 Credencial → gate-2 Política → gate-3 min(), `04` §7). promoción humana+evidencia / degradación automática (asimetría). ≤100 líneas.
- **Done-when:**
  - *Given* una clase, *When* pasa los 3 gates, *Then* rutea correcto; *When* falla uno, *Then* fail-closed.
  - **Check ejecutable:** test del routing 3-gate + promoción/degradación. `[STACK-TUNE: <comando test>]`.

---

## 05C:EPIC-C8 — Entrega: route a canal + sella binding + trackea reuso

- **Goal:** el artefacto se enruta a su canal, sella su binding y registra el reuso.
- **Context:** channel-route + gate + tracking determinista (sin LLM), sync. DATA-IN/OUT: `Artefacto_Generado.ritual_ref/reuse_count`, `Ritual_Destino`. Reusar el router de canal + contador de `05C:BR-C8-7`; no duplicar. Cita `EPIC-C8`, `BR-C8-1`, `BR-C8-3`, `BR-C8-4`.
- **Constraints:** gate fail-closed con alta manual: no entrega sin ritual/champion (`04` §3.5). `reuse_count` computado (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un artefacto con ritual/champion, *When* corre, *Then* entrega + sella binding + trackea reuso.
  - *Given* sin ritual, *When* corre, *Then* fail-closed.
  - **Check ejecutable:** test de entrega + gate de ritual + tracking. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C1-2 — Metric-binding (FK NOT NULL gate kpi_objetivo → KPI)

- **Goal:** ningún artefacto nace sin estar atado a una métrica.
- **Context:** gate FK NOT NULL determinista (sin LLM), sync pre-generador. DATA-IN/OUT: `Artefacto_Generado.kpi_objetivo → KPI` (NOT NULL, `04` §3.5). Reusar el constraint FK; no duplicar. Cita `US-C1-2`, `BR-C1-3`, `EC-C1-5`.
- **Constraints:** `kpi_objetivo` NOT NULL al nacer (binding obligatorio, `04` §3.5). Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un artefacto con `kpi_objetivo`, *When* nace, *Then* pasa.
  - *Given* sin métrica, *When* nace, *Then* fail-closed.
  - **Check ejecutable:** unit-test del gate de binding. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C1-3 — nivel_efectivo por tipo (motor min sobre ENUM ordenado)

- **Goal:** cada tipo de artefacto obtiene su `nivel_efectivo` por el motor `min()`.
- **Context:** motor `least()` determinista (sin LLM), sync. DATA-IN: brazos del `min()` por tipo. DATA-OUT: `min_calculo.nivel_efectivo` (producer = motor runtime, `04` §14 · COMPUTED/NULL pre-run). Reusar el motor de `02:1B`; no duplicar. Cita `US-C1-3`, `BR-C1-4`, `C1 Sub-proceso 6`.
- **Constraints:** `least()` sobre ENUM; brazo null ⇒ menor (`04` §7). `min_calculo` nunca semeado. ≤100 líneas.
- **Done-when:**
  - *Given* los brazos por tipo, *When* corre, *Then* `nivel_efectivo = least(...)`.
  - **Check ejecutable:** unit-test del motor + anti-fake sin filas pre-corrida. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C1-4 — Cola humano-aprobador (UI render con motivo + dossier + métrica)

- **Goal:** el aprobador humano ve la cola con motivo, dossier y métrica para decidir.
- **Context:** CRUD/UI render + HUMAN-gate (sin LLM), user-action sync. DATA-IN: `Artefacto_Generado` (motivo, dossier, métrica). Reusar la cola de aprobación de `05C:US-C7-1`; no duplicar. Cita `US-C1-4`, `C1 Sub-proceso 7`.
- **Constraints:** acción humana sync = CÓDIGO/UI + HUMAN-gate (`04` §5). RLS single-pool. a11y/estados. ≤100 líneas.
- **Done-when:**
  - *Given* artefactos pendientes, *When* se abre la cola, *Then* muestra motivo+dossier+métrica.
  - **Check ejecutable:** test de componente de la cola. `[STACK-TUNE: <comando test componente>]`.

---

## 05C:US-C2-2 — Vista agregada-anonimizada k-anon (n_cuentas>=k → celda nula)

- **Goal:** la vista de mercado suprime las celdas bajo el umbral k.
- **Context:** predicado k-anon determinista (Named_Query/RLS), sync. DATA-IN: `Cohort.n_cuentas`. Reusar el CHECK k-anon de `01:F-1.3b`; no duplicar. Cita `US-C2-2`, `BR-C2-4`, `EC-C2-3`.
- **Constraints:** `n_cuentas >= k` (`04` §7); bajo k ⇒ celda nula. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* celda bajo k, *When* se consulta, *Then* devuelve nula.
  - **Check ejecutable:** unit-test de la vista k-anon. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C2-3 — Escala crear-NBA cuando gap (no NBA O k<umbral)

- **Goal:** un gap (sin NBA o bajo k) rutea a la cola humana de crear NBA.
- **Context:** gap-detect determinista (sin LLM), sync + HUMAN-gate. DATA-IN: existencia de NBA, `Cohort.n_cuentas`. Reusar el detector de gap; no duplicar. Cita `US-C2-3`, `BR-C2-2`, `EC-C2-1`.
- **Constraints:** no NBA O k<umbral ⇒ cola humana crear_NBA (fail-closed, `04` §3.5 — INSERT `Knowledge_Case`, no A9). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* sin NBA o bajo k, *When* corre, *Then* rutea a cola humana.
  - **Check ejecutable:** unit-test del gap-detect. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C3a-3 — Revisión en lote por cohorte en Content Studio (humano sync)

- **Goal:** un humano aprueba/edita el lote de email por cohorte, capturando el delta.
- **Context:** UI/CRUD + HUMAN-gate (sin LLM), user-action sync. DATA-IN/OUT: `Content_Lote.piezas`, delta capturado. Reusar la cola de revisión en lote; no duplicar. Cita `US-C3a-3`, `BR-C3a-7`.
- **Constraints:** acción humana sync = CÓDIGO/UI + HUMAN-gate. delta capturado para RL (`05C:US-C6-1`). RLS single-pool. ≤100 líneas.
- **Done-when:**
  - *Given* un lote por cohorte, *When* el humano revisa, *Then* aprueba/edita y captura el delta.
  - **Check ejecutable:** test de la cola de revisión + captura de delta. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C3b-3 — Champion acepta/edita/descarta en discovery (humano sync, one-click)

- **Goal:** el champion decide en un click sobre la spec REFORGE y se registra en el ledger.
- **Context:** UI/CRUD + HUMAN-gate (sin LLM), user-action sync. DATA-IN/OUT: decisión del champion + ledger write. Reusar la cola one-click + el ledger de `05C:EPIC-C5`; no duplicar. Cita `US-C3b-3`, `BR-C3b-7`.
- **Constraints:** acción humana sync = CÓDIGO/UI + HUMAN-gate. ledger write (sin-trace-no-acción). ≤100 líneas.
- **Done-when:**
  - *Given* una spec en discovery, *When* el champion decide, *Then* la decisión queda en el ledger.
  - **Check ejecutable:** test de la decisión one-click + ledger. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C3d-2 — Humano crea/edita NBA desde cola de escalados (INSERT Knowledge_Case v1)

- **Goal:** un humano crea/edita la resolución (NBA) desde la cola de escalados, publicando v1.
- **Context:** UI/CRUD + HUMAN-gate (sin LLM), user-action sync. DATA-IN/OUT: `Knowledge_Case` (INSERT v1, `flag=no-reforzado`), trace al escalado. Reusar el writer de `Knowledge_Case`; NO crear A9 (`04` §3.5). Cita `US-C3d-2`, `BR-C3d-6`, `EC-C3d-8`.
- **Constraints:** "crear NBA" = INSERT en `Knowledge_Case` (`04` §3.5), jamás A9. trace al escalado (sin-trace-no-acción). ≤100 líneas.
- **Done-when:**
  - *Given* un escalado, *When* el humano crea la resolución, *Then* INSERT `Knowledge_Case` v1 + trace.
  - **Check ejecutable:** test del INSERT v1 + trace. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C5-2 — Métrica fuera de catálogo → escala humano

- **Goal:** una métrica que no está en el catálogo de KPIs rutea a humano.
- **Context:** catalog membership check determinista (sin LLM), sync + HUMAN-gate. DATA-IN: `KPI` (catálogo). Reusar el check de membresía; no duplicar. Cita `US-C5-2`, `EC-C5-2`, `CIERRE §1`.
- **Constraints:** métrica fuera de `KPI` ⇒ escala (fail-closed). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* métrica fuera de catálogo, *When* corre, *Then* escala a humano.
  - **Check ejecutable:** unit-test de membresía de catálogo. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C5-3 — Atribución señal vs estacionalidad (2-compuertas vía ROI_Operador)

- **Goal:** la atribución distingue señal real de estacionalidad usando las 2 compuertas.
- **Context:** read determinista 2-compuertas (sin LLM), sync. DATA-IN: `ROI_Operador.es_atribuible/metodo_atribucion`. Reusar el gate de `02:BR-7`; no duplicar. Cita `US-C5-3`, `BR-C5-4`, `BR-C5-5`.
- **Constraints:** 2-compuertas (`04` §7); funnel-correlacional no confirma. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* señal atribuible, *When* corre, *Then* cuenta; *Given* estacional, *Then* no.
  - **Check ejecutable:** unit-test de atribución señal/estacionalidad. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C6-1 — Capturar delta estructurado nivel-1 (Edicion_Contexto ligado a artefato_id)

- **Goal:** cada corrección humana se captura como delta estructurado ligado al artefacto.
- **Context:** CRUD determinista (sin LLM), user-action sync. DATA-IN/OUT: `Edicion_Contexto.campo/valor_anterior/valor_nuevo/target_ref`, ligado a `artefato_id`. Reusar el writer de `Edicion_Contexto`; no duplicar. Cita `US-C6-1`, `BR-C6-1`.
- **Constraints:** delta estructurado (no texto libre); ligado a `artefato_id`. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una corrección, *When* se captura, *Then* queda como `Edicion_Contexto` ligado al artefacto.
  - **Check ejecutable:** test de captura de delta. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C7-1 — Cola de aprobación por tipo (decisión humana + motivo + sello LEDGER)

- **Goal:** el aprobador decide por tipo, con motivo estructurado y sello en el ledger.
- **Context:** UI/CRUD + HUMAN-gate (sin LLM), user-action sync. DATA-IN/OUT: `Artefacto_Generado.estado`, `Decision_Trace` (sello). Reusar la cola + el ledger de `05C:EPIC-C5`; no duplicar. Cita `US-C7-1`, `BR-C7-6`.
- **Constraints:** motivo estructurado; sello LEDGER (sin-trace-no-acción, `04` §7). RLS single-pool. ≤100 líneas.
- **Done-when:**
  - *Given* artefactos por tipo, *When* el humano aprueba/rechaza, *Then* motivo + sello quedan en el ledger.
  - **Check ejecutable:** test de la cola + sello. `[STACK-TUNE: <comando test>]`.

---

## 05C:US-C7-2 — Promover clase a auto-pase tras N aprobaciones (override-solo-baja)

- **Goal:** una clase se promueve a auto-pase tras N aprobaciones consecutivas, sin subir más allá del límite.
- **Context:** regla de promoción determinista (sin LLM), sync. DATA-IN: N aprobaciones consecutivas, `Politica_Tier`, `Eval_Cell`. Reusar la regla de promoción de `05C:EPIC-C7`; no duplicar. Cita `US-C7-2`, `BR-C7-2`, `BR-C7-3`.
- **Constraints:** N consecutivas + política + evals sin regresión; override-solo-baja (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* N aprobaciones + evals ok, *When* corre, *Then* promueve a auto-pase.
  - *Given* intento de subir más, *When* corre, *Then* rechazo (solo-baja).
  - **Check ejecutable:** unit-test de la promoción + límite. `[STACK-TUNE: <comando test>]`.

---

## 05C:BR-C1-5 — Gate de dirección (RLS cross-pool tenant_id check)

- **Goal:** el ruteo de dirección respeta el aislamiento cross-pool.
- **Context:** predicado RLS/dirección determinista (sin LLM), sync. DATA-IN: `tenant_id` (cross-pool check). Reusar la RLS de `02:BR-3`; no duplicar. Cita `BR-C1-5`, `EC-C1-3`, `C1 Sub-proceso 3`.
- **Constraints:** cross-pool ⇒ bloqueo (`04` §7/§8); conocimiento validado fluye, dato crudo no. Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* dirección dentro del pool, *When* corre, *Then* pasa.
  - *Given* cross-pool de dato crudo, *When* corre, *Then* bloqueo.
  - **Check ejecutable:** test RLS de dirección. `[STACK-TUNE: <comando test RLS>]`.

---

## 05C:BR-C1-6 — NBA faltante → fail-closed escala (Knowledge_Case resoluble?)

- **Goal:** si la resolución no es resoluble, el flujo escala a humano en vez de inventar.
- **Context:** check determinista (sin LLM), sync. DATA-IN: `Knowledge_Case` (resoluble?). Reusar el matcher de `05C:EPIC-C3d`; no duplicar. Cita `BR-C1-6`, `EC-C1-1`, `C1 Sub-proceso 4`.
- **Constraints:** no resoluble ⇒ route-to-human (fail-closed, `04` §3.5 — no inventa A9). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* resolución no resoluble, *When* corre, *Then* escala.
  - **Check ejecutable:** unit-test del fail-closed escala. `[STACK-TUNE: <comando test>]`.

---

## 05C:BR-C1-7 — Finance = solo impacto, router bloquea saldo

- **Goal:** ningún artefacto financiero mueve saldo; el router lo bloquea.
- **Context:** lint/router block determinista (sin LLM), sync. DATA-IN: ruta candidata (saldo). Reusar el guard financiero de `02:BR-2`; no duplicar. Cita `BR-C1-7`, `EC-C1-4`.
- **Constraints:** hard-no financiero por efecto (`04` §7); solo muestra impacto, nunca mueve saldo. Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* una ruta que mueve saldo, *When* corre, *Then* bloqueo.
  - **Check ejecutable:** unit-test del block financiero. `[STACK-TUNE: <comando test>]`.

---

## 05C:BR-C3c-1 — Lint anti-solicitud (bloquea campo de saldo)

- **Goal:** ningún análisis de impacto financiero contiene un campo de solicitud/saldo.
- **Context:** lint determinista (sin LLM), sync. DATA-IN: contenido del artefacto Finanzas. Reusar el lint de `05C:BR-C1-7`; no duplicar. Cita `BR-C3c-1`, `EC-C3c-6`, `EC-C3c-9`.
- **Constraints:** hard-no financiero por efecto (`04` §7); bloquea cualquier campo request/saldo. Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un artefacto con campo de saldo, *When* corre el lint, *Then* bloqueo.
  - **Check ejecutable:** unit-test del lint anti-solicitud. `[STACK-TUNE: <comando test>]`.

---

## 05C:BR-C3e-2 — 4-ojos para publicar política (autor ≠ aprobador; IA = autor)

- **Goal:** publicar una política requiere 2 personas distintas; la IA cuenta como autor, nunca aprobador.
- **Context:** CHECK 4-ojos determinista + HUMAN-gate (sin LLM), sync. DATA-IN: autor, aprobador (`Usuario`). Reusar el CHECK 4-ojos canónico; no duplicar. Cita `BR-C3e-2`, `EC-C3e-4`, `US-C3e-3`.
- **Constraints:** `autor != aprobador`; IA = autor (`04` §7 4-ojos). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* autor != aprobador humano, *When* publica, *Then* pasa.
  - *Given* IA como aprobador, *When* publica, *Then* rechazo.
  - **Check ejecutable:** unit-test del 4-ojos de publicación. `[STACK-TUNE: <comando test>]`.

---

## 05C:BR-C4-1 — Motor min: nivel_efectivo = least de 3, fail-closed

- **Goal:** el `nivel_efectivo` del artefacto se computa con `least()` sobre los 3 brazos, fail-closed.
- **Context:** motor `least()` determinista (sin LLM), sync. DATA-IN: los 3 brazos. DATA-OUT: `min_calculo.nivel_efectivo` (producer = motor runtime, `04` §14 · COMPUTED/NULL pre-run). Reusar el motor de `02:1B`; no duplicar. Cita `BR-C4-1`, `BR-C4-5`, `C4 Sub-proceso 5`.
- **Constraints:** `least()` sobre ENUM; ninguna señal eleva otra (`04` §7). `min_calculo` nunca semeado. ≤100 líneas.
- **Done-when:**
  - *Given* los 3 brazos, *When* corre, *Then* `nivel_efectivo = least(...)`.
  - **Check ejecutable:** unit-test del motor + anti-fake. `[STACK-TUNE: <comando test>]`.

---

## 05C:BR-C4-3 — KB versionada: criterio con ≥1 few-shot +/- (CRUD)

- **Goal:** cada criterio-de-bueno de la KB se versiona con al menos un ejemplo positivo y uno negativo.
- **Context:** CRUD de entradas versionadas determinista (sin LLM), sync authoring. DATA-IN/OUT: `Knowledge_Case` (criterios + few-shots). Reusar el writer de `Knowledge_Case`; no duplicar. Cita `BR-C4-3`, `US-C4-1`, `US-C4-4`.
- **Constraints:** ≥1 few-shot +/- por criterio (versionado, `04` §3.5). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un criterio con +/- ejemplos, *When* se guarda, *Then* queda versionado.
  - *Given* sin ejemplos, *When* se guarda, *Then* rechazo.
  - **Check ejecutable:** unit-test del CRUD versionado + validación de few-shots. `[STACK-TUNE: <comando test>]`.

---

## 05C:BR-C6-2 — Guard anti-RL (gate de activación de template)

- **Goal:** ningún template candidato se activa sin pasar el gate (min + convergencia + evals sin regresión).
- **Context:** gate determinista (sin LLM), sync. DATA-IN: `min_calculo.nivel_efectivo`, umbral de convergencia, `Eval_Cell` (regresión). Reusar el gate de activación; no duplicar. Cita `BR-C6-2`, `BR-C6-7`, `EC-C6-2`, `EC-C6-8`.
- **Constraints:** fail-closed: min() + umbral convergencia + evals sin regresión (`04` §7). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* candidato con evals sin regresión, *When* corre, *Then* activa.
  - *Given* regresión en evals, *When* corre, *Then* fail-closed (no activa).
  - **Check ejecutable:** unit-test del gate de activación. `[STACK-TUNE: <comando test>]`.

---

## 05C:BR-C8-2 — Gate de dirección pre-empaquetado (redacta PII/cross-pool)

- **Goal:** antes de empaquetar, el gate redacta PII y aplica el aislamiento cross-pool.
- **Context:** direction gate determinista (sin LLM), sync. DATA-IN: contenido (interno = ID completo; externo = redacta PII + market-agregado). Reusar el redactor + RLS; no duplicar. Cita `BR-C8-2`, `EC-C8-3`, `CIERRE-2.D`.
- **Constraints:** interno: trazabilidad total; externo: redacta PII + agregado (`04` §7/§8). Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* dirección externa, *When* corre, *Then* PII redactada + market-agregado.
  - *Given* dirección interna, *When* corre, *Then* ID completo.
  - **Check ejecutable:** unit-test del gate de dirección interno/externo. `[STACK-TUNE: <comando test>]`.

---

## 05C:BR-C8-7 — Reuso = métrica de primera clase (reuse_count)

- **Goal:** cada uso ritual de un artefacto incrementa su contador de reuso.
- **Context:** counter determinista (sin LLM), sync. DATA-IN/OUT: `Artefacto_Generado.reuse_count/ultimo_uso_ts`. Reusar el contador (`04` §3.5); no duplicar. Cita `BR-C8-7`, `US-C8-3`, `EC-C8-7`.
- **Constraints:** `reuse_count` computado (`04` §14); reuso cross-pool legítimo (eje de escala, `04` §8). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un uso ritual, *When* corre, *Then* `reuse_count` se incrementa + `ultimo_uso_ts`.
  - **Check ejecutable:** unit-test del incremento del contador. `[STACK-TUNE: <comando test>]`.

---

## 05C:CIERRE-3 — Seed manual de Ritual_Destino + alta inicial (CRUD admin)

- **Goal:** el catálogo `Ritual_Destino` se siembra manualmente (tipo×equipo → ritual + champion).
- **Context:** CRUD seed-manual determinista (sin LLM), sync admin. DATA-IN/OUT: `Ritual_Destino{tipo_artefacto, equipo_destino, ritual_nombrado, champion_rol, seed_manual}`. Reusar el writer de catálogo; no duplicar. Cita `CIERRE §3`, `CIERRE §4`, `BR-C8-4`.
- **Constraints:** seed manual `[C]` (roles placeholder); gate fail-closed con alta manual (`04` §3.5 — no congela día 1). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un alta de ritual, *When* se siembra, *Then* `Ritual_Destino` queda con `seed_manual=true`.
  - **Check ejecutable:** test del seed de catálogo. `[STACK-TUNE: <comando test>]`.

---

## 05C:EC-C2-9 — Match ambiguo entre NBAs (tie-break por adoption_score, luego escala)

- **Goal:** un match ambiguo se desempata por adoption_score y, si persiste, escala.
- **Context:** tie-break determinista (regla fija, no LLM), sync. DATA-IN: candidatos + adoption_score. Reusar el matcher de `05C:EPIC-C3d`; no duplicar. Cita `EC-C2-9`, `US-C2-1`.
- **Constraints:** ranking por regla fija (no LLM); persiste ambigüedad ⇒ escala. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* match ambiguo, *When* corre, *Then* desempata por adoption_score.
  - *Given* empate persistente, *When* corre, *Then* escala.
  - **Check ejecutable:** unit-test del tie-break. `[STACK-TUNE: <comando test>]`.

---

## 05C:EC-C3a-6 — PII de OTRO tenant en render → bloqueo

- **Goal:** ninguna PII de otro tenant aparece en un render publicable.
- **Context:** predicado de redacción/cross-pool determinista (sin LLM), sync. DATA-IN: contenido a publicar. Reusar el gate de `05C:BR-C8-2`; no duplicar. Cita `EC-C3a-6`, `BR-C3a-2`.
- **Constraints:** hard-no PII cross-pool (`04` §7); bloqueo antes de publicar. Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* PII de otro tenant en el render, *When* corre, *Then* bloqueo.
  - **Check ejecutable:** unit-test del bloqueo PII cross-pool. `[STACK-TUNE: <comando test>]`.

---

## 05C:EC-C3f-8 — Colisión clase política↔T&C → no auto-elige (rutea a Legal+Policy)

- **Goal:** una colisión de clase política/T&C no se resuelve sola; rutea a Legal+Policy.
- **Context:** regla determinista (sin LLM), sync. DATA-IN: clase del artefacto (política/T&C). Reusar el router de tipo; no duplicar. Cita `EC-C3f-8`, `US-C3f-1`.
- **Constraints:** marca ambas clases + route, sin default pick (fail-closed). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* colisión política↔T&C, *When* corre, *Then* marca ambas + rutea a Legal+Policy (no auto-elige).
  - **Check ejecutable:** unit-test de la colisión de clase. `[STACK-TUNE: <comando test>]`.

---
## 05DE — Dashboard de salud (VITRINA read-only) · piezas CÓDIGO

> Toda pieza 05DE es VITRINA: hace SELECT sobre RESULTADOS ya computados por sus dueños; NUNCA recomputa, NUNCA persiste un número (`04` §3.6). Es la superficie humana del invariante `04` §14 (sellos honestos, conservador antes que verde-fake).

## 05DE:EPIC-DE1 — Render del viewport de veredicto (override + sello + cinta silenciosos)

- **Goal:** el viewport de veredicto muestra override-rate, sello de salud y la cinta de silenciosos de forma honesta.
- **Context:** render read-only (sin LLM), sync. Compone `05DE:US-DE1.1`. DATA-IN: `Salud_1a10` (background, read-only), `ROI_Operador` (sello), `Afetado.silencioso`/`Processo_Critico` (cinta) (`04` §3.6/§5). Reusar el componente de viewport; no crear. Cita `EPIC-DE1`, `US-DE1.1`, `BR-DE5`, `BR-DE9`.
- **Constraints:** NUNCA recomputa (números de su dueño, `04` §3.6). `Salud_1a10` read-only (no DATA-OUT, `04` §3.4). Anti-fake §14: excluye campo sin productor. a11y/estados. ≤100 líneas.
- **Done-when:**
  - *Given* resultados computados, *When* se renderiza, *Then* muestra override+sello+cinta.
  - *Given* resultado sin productor, *When* se renderiza, *Then* se excluye (no `[C]`).
  - **Check ejecutable:** test de componente del viewport + assert de no-recálculo + exclusión sin-productor. `[STACK-TUNE: <comando test componente>]`.

---

## 05DE:EPIC-DE2 — Render de dos curvas costo vs inteligencia (time-series)

- **Goal:** el hero muestra las dos curvas temporales de costo e inteligencia generada.
- **Context:** render read-only (sin LLM), sync. Compone `05DE:US-DE2.1`. DATA-IN: métricas de costo + contadores de inteligencia (read-only). Reusar el componente de gráfico de series; no crear. Cita `EPIC-DE2`, `US-DE2.1`, `EC-DE4`.
- **Constraints:** solo SELECT; no recomputa. Anti-fake: vacío/conservador si no computado (`04` §14). a11y: curvas con etiquetas textuales redundantes. ≤100 líneas.
- **Done-when:**
  - *Given* las dos series, *When* se renderiza, *Then* muestra costo vs inteligencia.
  - **Check ejecutable:** test de componente de las dos curvas. `[STACK-TUNE: <comando test componente>]`.

---

## 05DE:EPIC-DE3 — Render colapsado de 3 lentes + radar

- **Goal:** el drill muestra las 3 lentes (Costo/Inteligencia/Gobierno) + radar, colapsado por defecto.
- **Context:** render read-only colapsado (sin LLM), sync. Compone `05DE:US-DE3.1`/`US-DE3.2`. DATA-IN: las 3 lentes (read-only). Reusar el componente de drill/radar; no crear. Cita `EPIC-DE3`, `US-DE3.1`, `US-DE3.2`, `BR-DE7`.
- **Constraints:** anti-overload: 1 viewport, detalle colapsado, agrupación MECE (`04` §3.6, BR-DE7). Solo SELECT. a11y: secciones colapsables navegables. ≤100 líneas.
- **Done-when:**
  - *Given* las 3 lentes, *When* se abre el drill, *Then* aparecen colapsadas + radar.
  - **Check ejecutable:** test de componente del drill colapsado. `[STACK-TUNE: <comando test componente>]`.

---

## 05DE:US-DE1.1 — SELECT + render override rate + Salud_1a10 background + sello + cinta silenciosos

- **Goal:** la fila de veredicto consulta y muestra override-rate, fondo de salud, sello y cinta de silenciosos.
- **Context:** SELECT + render read-only (sin LLM), sync. DATA-IN: override rate, `Salud_1a10` (background), `ROI_Operador` (sello), `Afetado.silencioso` (cinta) (`04` §3.6). Reusar el viewport de `05DE:EPIC-DE1`; no duplicar. Cita `US-DE1.1`, `BR-DE2`, `BR-DE3`, `BR-DE5`.
- **Constraints:** `Salud_1a10` read-only; sello según 2-compuertas (BR-DE2). Anti-fake §14. ≤100 líneas.
- **Done-when:**
  - *Given* los resultados, *When* se renderiza, *Then* muestra override+salud+sello+cinta.
  - **Check ejecutable:** test de componente de la fila de veredicto. `[STACK-TUNE: <comando test componente>]`.

---

## 05DE:US-DE2.1 — SELECT de métricas de costo + contadores inteligencia + flag ESTANCADO

- **Goal:** el hero consulta los costos y los contadores de inteligencia y marca ESTANCADO cuando aplica.
- **Context:** SELECT + render read-only (sin LLM), sync. DATA-IN: métricas de costo, contadores de inteligencia generada (read-only). Reusar el gráfico de `05DE:EPIC-DE2` + el flag de `05DE:EC-DE4`; no duplicar. Cita `US-DE2.1`, `EC-DE4`, `BR-DE9`.
- **Constraints:** anti-fake §14: excluye campo sin productor (BR-DE9). Solo SELECT. ≤100 líneas.
- **Done-when:**
  - *Given* costos cayendo + inteligencia plana, *When* se renderiza, *Then* marca ESTANCADO.
  - **Check ejecutable:** test de componente del hero + flag ESTANCADO. `[STACK-TUNE: <comando test componente>]`.

---

## 05DE:US-DE3.1 — SELECT + render de 3 MECE lentes (Costo/Inteligencia/Gobierno) + radar, colapsado

- **Goal:** el drill consulta y muestra las 3 lentes MECE + radar, colapsado por defecto.
- **Context:** SELECT + render read-only on-demand (sin LLM), sync. DATA-IN: las 3 lentes (read-only). Reusar el drill de `05DE:EPIC-DE3`; no duplicar. Cita `US-DE3.1`, `BR-DE7`.
- **Constraints:** MECE; colapsado por defecto (anti-overload, BR-DE7). Solo SELECT. a11y. ≤100 líneas.
- **Done-when:**
  - *Given* las 3 lentes, *When* se abre, *Then* render colapsado + radar.
  - **Check ejecutable:** test de componente de las 3 lentes. `[STACK-TUNE: <comando test componente>]`.

---

## 05DE:US-DE3.2 — Comparar Eval_Cell band vs límite, auto-degradar sello

- **Goal:** cuando una banda de Eval sale del límite, el sello del veredicto se degrada automáticamente.
- **Context:** compare + render determinista (sin LLM), sync. DATA-IN: `Eval_Cell` (band vs límite). Reusar el comparador de banda; no duplicar. Cita `US-DE3.2`, `BR-DE4`, `EC-DE3`.
- **Constraints:** band-out ⇒ verdict provisional/degradado (no verde, `04` §14). Solo lee `Eval_Cell`. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* banda fuera de límite, *When* corre, *Then* el sello se degrada.
  - **Check ejecutable:** unit-test del compare banda + degradación. `[STACK-TUNE: <comando test>]`.

---

## 05DE:S1 — Open → SELECT read-only per-pool RLS sobre tablas §4

- **Goal:** al abrir el dashboard se hace un SELECT read-only acotado por pool.
- **Context:** query surface read-only (sin LLM), sync. DATA-IN: tablas de `04` §4 (read-only, RLS). Reusar el patrón de query per-pool; no duplicar. Cita `7.1`, `BR-DE1`, `BR-DE6`.
- **Constraints:** RLS single-pool; solo SELECT (vitrina, `04` §3.6). k-anon en cross-pool. ≤100 líneas.
- **Done-when:**
  - *Given* apertura del dashboard, *When* corre, *Then* SELECT read-only acotado al pool.
  - **Check ejecutable:** test RLS del SELECT read-only. `[STACK-TUNE: <comando test RLS>]`.

---

## 05DE:S2 — Paint veredicto (override + sello + cinta silenciosos)

- **Goal:** se pinta el veredicto con override, sello y cinta de silenciosos.
- **Context:** render read-only (sin LLM), sync. DATA-IN: resultados de veredicto (read-only). Reusar `05DE:US-DE1.1`; no duplicar. Cita `7.2`, `US-DE1.1`.
- **Constraints:** solo render; no recomputa. Anti-fake §14. a11y/estados. ≤100 líneas.
- **Done-when:**
  - *Given* los resultados, *When* se pinta, *Then* veredicto con override+sello+cinta.
  - **Check ejecutable:** test de componente del paint. `[STACK-TUNE: <comando test componente>]`.

---

## 05DE:S3 — Paint hero 2-curvas + marca ESTANCADO

- **Goal:** se pinta el hero con las dos curvas y la marca ESTANCADO.
- **Context:** render read-only (sin LLM), sync. DATA-IN: series costo/inteligencia (read-only). Reusar `05DE:US-DE2.1`; no duplicar. Cita `7.3`, `US-DE2.1`, `EC-DE4`.
- **Constraints:** solo render; no recomputa. ESTANCADO derivado por `05DE:EC-DE4`. a11y. ≤100 líneas.
- **Done-when:**
  - *Given* las series, *When* se pinta, *Then* hero 2-curvas + ESTANCADO si aplica.
  - **Check ejecutable:** test de componente del hero. `[STACK-TUNE: <comando test componente>]`.

---

## 05DE:S4 — Leer Eval_Cell bands → si out-of-band degradar verdict sello

- **Goal:** si una banda de Eval está fuera de límite, el sello del veredicto se degrada.
- **Context:** lógica determinista read (sin LLM), sync. DATA-IN: `Eval_Cell` (bands). Reusar `05DE:US-DE3.2`; no duplicar. Cita `7.4`, `BR-DE4`.
- **Constraints:** band-out ⇒ degradar sello (`04` §14). Solo lee. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* banda fuera de límite, *When* corre, *Then* degrada el sello.
  - **Check ejecutable:** unit-test del read + degradación. `[STACK-TUNE: <comando test>]`.

---

## 05DE:S5 — On-demand drill render 3 lentes + radar (colapsado default)

- **Goal:** el drill on-demand muestra las 3 lentes + radar, colapsado por defecto.
- **Context:** render read-only on-demand (sin LLM), sync. DATA-IN: las 3 lentes (read-only). Reusar `05DE:US-DE3.1`; no duplicar. Cita `7.5`, `US-DE3.1`, `BR-DE7`.
- **Constraints:** colapsado default (anti-overload). Solo render. a11y. ≤100 líneas.
- **Done-when:**
  - *Given* drill abierto, *When* se renderiza, *Then* 3 lentes + radar colapsados.
  - **Check ejecutable:** test de componente del drill. `[STACK-TUNE: <comando test componente>]`.

---

## 05DE:S6 — Invariante cero business write-back (RLHF vive en P02/P06)

- **Goal:** el dashboard nunca escribe de vuelta lógica de negocio.
- **Context:** invariante/constraint determinista (sin LLM), sync. DATA-IN: ninguno (solo verifica ausencia de write). Reusar el guard de read-only; no duplicar. Cita `7.6`, `BR-DE1`.
- **Constraints:** cero write-back de negocio (RLHF en P02/P06, `04` §3.6); vitrina pura. Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* cualquier interacción del dashboard, *When* corre, *Then* no hay write de negocio.
  - **Check ejecutable:** test que asserta cero escrituras de negocio desde el dashboard. `[STACK-TUNE: <comando test>]`.

---

## 05DE:BR-DE1 — Invariante vitrina (render read-only, nunca computa/persiste un número)

- **Goal:** el dashboard nunca computa ni persiste un número.
- **Context:** constraint determinista (sin LLM), sync. DATA-IN: ninguno (verifica ausencia de cómputo/persistencia). Reusar el guard de `05DE:S6`; no duplicar. Cita `BR-DE1`.
- **Constraints:** read-only (vitrina, `04` §3.6). Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* el dashboard, *When* corre, *Then* no computa ni persiste número.
  - **Check ejecutable:** test que asserta ausencia de cómputo/persistencia. `[STACK-TUNE: <comando test>]`.

---

## 05DE:BR-DE2 — Sello determinista desde es_atribuible/metodo_atribucion (no suma provisional+confirmado)

- **Goal:** el sello de cada $ se deriva de la atribución, sin sumar provisional y confirmado.
- **Context:** mapping determinista (sin LLM), sync. DATA-IN: `ROI_Operador.es_atribuible/metodo_atribucion`. Reusar el mapeo de sello; no duplicar. Cita `BR-DE2`, `EC-DE2`.
- **Constraints:** 2-compuertas; no suma provisional+confirmado (`04` §7/§14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* atribución, *When* corre, *Then* el sello correcto sin suma indebida.
  - **Check ejecutable:** unit-test del mapeo de sello. `[STACK-TUNE: <comando test>]`.

---

## 05DE:BR-DE3 — Cruce Afetado.silencioso + Processo_Critico degraded (no-data → conservador)

- **Goal:** el estado de silenciosos cruza afectados y procesos degradados, conservador sin datos.
- **Context:** cruce determinista (sin LLM), sync. DATA-IN: `Afetado.silencioso`, `Processo_Critico.estado` (`04` §3). Reusar el cruce; no duplicar. Cita `BR-DE3`, `EC-DE1`.
- **Constraints:** no-data ⇒ estado conservador ("monitoreando, sin datos", `04` §14), nunca verde-fake. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* sin datos, *When* corre, *Then* estado conservador.
  - **Check ejecutable:** unit-test del cruce + caso no-data. `[STACK-TUNE: <comando test>]`.

---

## 05DE:BR-DE4 — Band-out check auto-degrada el sello del veredicto

- **Goal:** cuando un valor sale de banda, el sello del veredicto se degrada automáticamente.
- **Context:** band-out check determinista (sin LLM), sync render. DATA-IN: valor vs banda (`Eval_Cell`). Reusar `05DE:S4`; no duplicar. Cita `BR-DE4`, `EC-DE3`, `US-DE3.2`.
- **Constraints:** band-out ⇒ verdict provisional/degradado (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* valor fuera de banda, *When* corre, *Then* sello degradado.
  - **Check ejecutable:** unit-test del band-out. `[STACK-TUNE: <comando test>]`.

---

## 05DE:BR-DE5 — Anti-Goodhart predicate (csat sostenido AND reapertura-baja AND tiempo_a_firma estable) para verde

- **Goal:** el veredicto verde exige las tres condiciones anti-Goodhart simultáneas.
- **Context:** predicado determinista (sin LLM), sync. DATA-IN: csat, tasa de reapertura, `tiempo_a_firma`. Reusar el predicado anti-Goodhart; no duplicar. Cita `BR-DE5`, `US-DE1.1`.
- **Constraints:** verde solo si csat sostenido AND reapertura-baja AND tiempo_a_firma estable (`04` §14). Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* las tres condiciones, *When* corre, *Then* verde.
  - *Given* falta una, *When* corre, *Then* no verde.
  - **Check ejecutable:** unit-test parametrizado por condición. `[STACK-TUNE: <comando test>]`.

---

## 05DE:BR-DE6 — RLS single-pool + k-anon (n_cuentas>=k) en vistas cross-pool agregadas

- **Goal:** las vistas agregadas cross-pool aplican RLS single-pool y k-anon.
- **Context:** predicado RLS + k-anon determinista (sin LLM), sync. DATA-IN: `tenant_id`, `Cohort.n_cuentas`. Reusar la RLS de `02:BR-3` + k-anon de `01:F-1.3b`; no duplicar. Cita `BR-DE6`, `EC-DE5`.
- **Constraints:** RLS single-pool + k-anon N>=k (`04` §7/§8). Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* vista cross-pool bajo k, *When* corre, *Then* suprime.
  - **Check ejecutable:** test RLS + k-anon de la vista. `[STACK-TUNE: <comando test>]`.

---

## 05DE:BR-DE7 — Anti-overload layout (1 viewport, detalle colapsado, agrupación MECE)

- **Goal:** el layout cabe en un viewport con detalle colapsado y agrupación MECE.
- **Context:** constraint UI determinista (sin LLM), sync. DATA-IN: config de layout. Reusar el componente de layout; no crear. Cita `BR-DE7`, `EPIC-DE3`.
- **Constraints:** 1 viewport; detalle colapsado; MECE (`04` §3.6). a11y. ≤100 líneas.
- **Done-when:**
  - *Given* el dashboard, *When* se renderiza, *Then* cabe en 1 viewport con detalle colapsado.
  - **Check ejecutable:** test de layout (1 viewport, colapsado). `[STACK-TUNE: <comando test componente>]`.

---

## 05DE:BR-DE9 — Anti-fake render guard (mostrar solo COMPUTED, excluir campo sin productor, conservador pre-run)

- **Goal:** el dashboard solo muestra valores computados y excluye los que no tienen productor.
- **Context:** render guard determinista (sin LLM), sync. DATA-IN: provenance/estado-computado de cada campo. Reusar el guard de `01:F-3.2`/§14; no duplicar. Cita `BR-DE9`, `EC-DE1`.
- **Constraints:** §14 anti-fake: solo COMPUTED; campo sin productor se EXCLUYE (no `[C]`); conservador pre-run (`04` §3.6/§14). Fail-closed. ≤100 líneas.
- **Done-when:**
  - *Given* un campo sin productor, *When* se renderiza, *Then* se excluye.
  - *Given* pre-run, *When* se renderiza, *Then* estado conservador.
  - **Check ejecutable:** test que asserta exclusión sin-productor + conservador pre-run. `[STACK-TUNE: <comando test>]`.

---

## 05DE:EC-DE1 — stale > T renderiza "monitoreando-sin-datos" (no verde)

- **Goal:** un valor stale se muestra como "monitoreando, sin datos", nunca verde.
- **Context:** check de freshness determinista (sin LLM), sync render. DATA-IN: timestamp vs T. Reusar el freshness de `03:EC-9`; no duplicar. Cita `EC-DE1`, `BR-DE3`.
- **Constraints:** stale ⇒ estado conservador (`04` §14), nunca verde-fake. `T` por NOMBRE. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* valor stale > T, *When* se renderiza, *Then* "monitoreando-sin-datos".
  - **Check ejecutable:** unit-test del estado stale. `[STACK-TUNE: <comando test>]`.

---

## 05DE:EC-DE2 — 1-gate → sello provisional, separado visualmente, sin inflar total

- **Goal:** un valor que pasa solo 1 compuerta se marca provisional, separado, sin inflar el total.
- **Context:** render determinista (sin LLM), sync. DATA-IN: estado de compuertas. Reusar el mapeo de sello de `05DE:BR-DE2`; no duplicar. Cita `EC-DE2`, `BR-DE2`.
- **Constraints:** 1-gate ⇒ provisional separado; no suma al total (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* 1 compuerta, *When* se renderiza, *Then* provisional separado sin inflar total.
  - **Check ejecutable:** unit-test del sello provisional. `[STACK-TUNE: <comando test>]`.

---

## 05DE:EC-DE3 — Band-out → verdict provisional + drill mark

- **Goal:** un band-out marca el veredicto como provisional y añade marca de drill.
- **Context:** render determinista (sin LLM), sync. DATA-IN: banda vs límite. Reusar `05DE:BR-DE4`; no duplicar. Cita `EC-DE3`, `BR-DE4`.
- **Constraints:** band-out ⇒ provisional + drill mark (`04` §14). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* band-out, *When* se renderiza, *Then* veredicto provisional + drill mark.
  - **Check ejecutable:** unit-test del band-out provisional. `[STACK-TUNE: <comando test>]`.

---

## 05DE:EC-DE4 — Costo-baja + inteligencia-flat ⇒ flag ESTANCADO

- **Goal:** cuando el costo cae sin que suba la inteligencia, se marca ESTANCADO.
- **Context:** lógica determinista de ventana (sin LLM), sync. DATA-IN: serie de costo, serie de inteligencia. Reusar el detector; no duplicar. Cita `EC-DE4`, `US-DE2.1`.
- **Constraints:** costo-down + inteligencia-flat en ventana ⇒ ESTANCADO (`04` §3.6). Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* costo cayendo + inteligencia plana, *When* corre, *Then* flag ESTANCADO.
  - **Check ejecutable:** unit-test del flag ESTANCADO. `[STACK-TUNE: <comando test>]`.

---

## 05DE:EC-DE5 — n_cuentas < k cross-pool ⇒ suprimir/no-evaluable (nunca expone)

- **Goal:** ninguna celda cross-pool bajo k se expone.
- **Context:** k-anon gate determinista (sin LLM), sync. DATA-IN: `Cohort.n_cuentas` (cross-pool). Reusar el k-anon de `05DE:BR-DE6`; no duplicar. Cita `EC-DE5`, `BR-DE6`.
- **Constraints:** `n_cuentas < k` ⇒ suprimir/no-evaluable (`04` §7). Fail-closed. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* celda cross-pool bajo k, *When* corre, *Then* suprime (no expone).
  - **Check ejecutable:** unit-test del k-anon cross-pool. `[STACK-TUNE: <comando test>]`.

---

## 05DE:layout_config — CRUD del único dato propio del dashboard (config de layout)

- **Goal:** el dashboard persiste solo su config de layout (su único dato propio), nada de negocio.
- **Context:** CRUD determinista (sin LLM), sync. DATA-IN/OUT: config de layout (qué cuadros, pares bueno/cuidado, umbrales que resaltan) — UI, no entidad de negocio (`04` §3.6). Reusar el writer de config UI; no crear entidad de negocio. Cita `4`, `BR-DE1`.
- **Constraints:** único dato propio = layout (vitrina sin entidad de negocio, `04` §3.6); cero write-back de negocio. Determinista. ≤100 líneas.
- **Done-when:**
  - *Given* un cambio de layout, *When* se guarda, *Then* persiste solo la config UI.
  - *Given* un intento de escribir un número de negocio, *When* corre, *Then* se rechaza.
  - **Check ejecutable:** test del CRUD de layout + assert de cero write de negocio. `[STACK-TUNE: <comando test>]`.

---

> **Cross-bucket nota:** esta vista proyecta SOLO las 236 piezas `CÓDIGO` del registro congelado. Las piezas de balde `AGENTE` y `N8N` (contratos de proceso) y las `PENDIENTE` (needs-prototype) NO se renderizan en esta vista; cada `piece_id` conserva su balde del registro. Construible en aislamiento: ninguna pieza de arriba referencia otra vista.
