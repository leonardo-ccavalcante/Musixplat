# 04 · Arquitectura de Datos (ADR + System-Design)

> **Grounding pin:** `00_vision_completa.md` v1.2 · **Fecha:** 2026-06-16 · **Provenance global:** `[V]` vivido/real · `[I]` inferido · `[C]` escenario/mock. En un take-home, **mucho dato es mock/fixture — INTENCIONAL, no es falla.**
> **Specs costuradas:** `00_vision` · `01_Cohorts Explorer` · `02_NBA Playbooks` · `03_Goals & KPIs` · `05A_Atención` · `05B_Diagnóstico` · `05C_Generación-de-conocimiento` (§3.5) · `05DE_Dashboard-salud` (§3.6).
> **Estado:** documento-base que define el modelo canónico. Lo que aquí decimos **manda** sobre los nombres y contratos de las 6 specs cuando hay conflicto (los conflictos clave — `tenant_id`/`id_restaurante`, `FuenteVerdad`→`Orden`+`Evento_Uso` — se resuelven inline en §3).
> **▶ Para CODAR, empieza por la §13 — Orden de producción** (build vertical-slice: espina corriendo primero, features por encima en lotes). El modelo (§3) es el *mapa*; la §13 es la *secuencia*. Regla: si no corre en vivo, no cuenta. · **§14 = invariante anti-fake** (todo dato-resultado se computa al correr, nunca se semea).

---

## 1. Contexto — por qué existe este documento

Las 6 pantallas se diseñaron por separado. Al revisarlas juntas, el operador (Leo) vio que las **3 piezas que faltaban** — **Cerebro** (base de datos de los restaurantes), **Evals** y **Políticas** — no son 3 features distintas: son **una sola capa de datos**. El Cerebro es la raíz/grounding, Evals produce un brazo del motor de autonomía, Políticas produce otro. Si esa capa no existe como modelo único, cada pantalla inventa su propio esquema y la cascada de la demo (`1 → 47 → R$X`) no reconcilia: cada feature reporta su propio número y no hay forma de probar que hablan del mismo restaurante.

**Este documento es esa fundación.** Define el modelo de datos canónico que cose las 6 pantallas con **una misma clave (`restaurante_id`)** y **una misma versión de regla (`cohort_rule_version`)**, de modo que la demo en vivo reconcilie punta a punta.

**El motor (de `00_vision`):**

```
nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)
```

…con grounding obligatorio en el Cerebro y **fail-closed**: si un brazo es `null`/indisponible, se cae al menor brazo conocido; ante empate/indeterminación, se elige la banda más conservadora.

**Constraints de este doc:**

- **1 semana, demo en vivo.** El esquema tiene que poder semearse, correr 2-3 jobs batch y exhibir la cascada en un paseo de ~30 min.
- **Es REAL, no un mock.** La finalidad del proyecto es **probar que se sabe resolver el problema**. El esquema y las queries tienen que ser realistas y performantes, no un juguete.
- **Karpathy (no over-engineering).** El stack y el modelo **más simple** que resuelve la demo + la visión. Relacional simple, no data-lake / event-sourcing / microservicios.
- **MECE — pero tablas GORDAS-por-proceso, no fragmentadas.** Entidades mutuamente excluyentes, colectivamente exhaustivas, **sin solapamiento ni hueco** — y agrupando **el máximo de datos del MISMO proceso en una sola tabla** (rule of thumb del operador: "todas las órdenes de los restaurantes = 1 tabla; uso de la plataforma + log de features = otra"). No decenas de tablitas con pocas columnas.
- **Performance es criterio de diseño.** Sin anidar muchas queries (join ≤ 2-3 en las queries de la demo); sin tablas lentas por estructura mala. Ver **§11 — Performance**.
- **Datos de demo generados por instancia.** En el panel, una persona de la audiencia **se registra e itera** y ve resultados correctos; los datos se generan al vuelo, **con variación entre instancias** (2 personas nunca reciben el mismo set). Ver **§12 — Generador de datos de demo**.
- **Provenance por campo.** Sin provenance, un campo no se renderiza como dato duro ni se exporta.
- **Encaje bilateral.** "Feature X lee dato de Y" solo es **firme** si el campo aparece en **los dos** docs; si no, es `[I]`.

---

## 2. Decisión de stack

| Opción | Veredicto |
|---|---|
| Data-lake + event-sourcing + microservicios | **Descartado.** Nada aquí lo exige; mata la semana. |
| NoSQL documental (Mongo/Firestore) | **Descartado.** El modelo es relacional con FKs cross-feature y series semanales; perderíamos integridad referencial, que es justo lo que sostiene el `min()` y la cascada. |
| **Postgres único (una instancia, schemas lógicos) + jobs Python batch + `named_query` versionadas en tabla** | **ELEGIDO.** |

**Justificación (Karpathy).** Todo el modelo es relacional con FKs claras, series semanales y logs append-only. Postgres da: tipos `ENUM` nativos (clave para el `min()`, ver §4), `jsonb` para sub-objetos 1-1, índices parciales, **Row-Level Security (RLS)** para la frontera cross-tenant, columnas generadas y triggers para reconciliaciones. Los **jobs Python batch** corren lo que no es CRUD: segmentación/percentil (P01), agente de medición de KPI (P03), double-check de impacto (P05B). El **"cómo se mide"** vive en una tabla `Named_Query` versionada y lo ejecuta **siempre** Python/SQL determinista, **nunca un LLM**. El LLM solo genera/rankea hipótesis.

> **Schemas lógicos** (no bases separadas): `tenant` (datos por-restaurante, con RLS), `cohort` (datos agregados por cohort), `gov` (gobernanza/auditoría), `catalog` (catálogos versionados). Esto materializa en el esquema la separación de **dos zonas** que resuelve el cross-tenant (ver §8).

---

## 3. Modelo de datos canónico

**Organización por PROCESO, no por feature.** Cada entidad vive en exactamente un grupo (MECE). La base de todo son los **datos brutos de negocio** (`Orden`, `Evento_Uso`) de los que derivan cohorts, problemas y métricas — es la materialización del "Cerebro = base de datos de los restaurantes".

| Proceso | Tablas |
|---|---|
| **Negocio (datos brutos)** | `Orden` |
| **Uso de la plataforma** | `Evento_Uso` |
| **Cliente / Cerebro** | `Restaurante` |
| **Atención** | `Conversa_Episodio` |
| **Diagnóstico** | `Problema_Diagnosticado` · `Afetado` · `Knowledge_Case` · `Processo_Critico` |
| **Segmentación** | `Cohort` · `Subgrupo` · `Pertenencia_Cohort_Snapshot` · `Evento_Priorizado_NBA` · `Cohort_Rule_Version` |
| **Autonomía / Gobernanza** | `NBA_Propuesta` · `min_calculo` · `Eval_Cell` · `Politica_Tier` · `Decision_Trace` · `Liberacion_Lote` · `ROI_Operador` · `Credencial` · `Usuario` · `Edicion_Contexto` · `Artefacto_Generado` (C · §3.5) |
| **Métricas** | `KPI` · `AccionSugerida` |
| **Contenido** | `Content_Lote` |
| **Catálogos** | `Intent_Catalog` · `NBA_Catalogo` · `Named_Query` · `Config_Perillas` · `Ritual_Destino` (C · §3.5) |

**~26 tablas persistidas** + 5 catálogos + 3 vistas/derivados (las 2 últimas, `Artefacto_Generado` y `Ritual_Destino`, son de Feature C · §3.5). Las tablas **gordas-por-proceso** son `Orden`, `Evento_Uso`, `Conversa_Episodio` y `Problema_Diagnosticado` (absorbe ISSUE_TREE/IMPACTO/CASO_REPO como `jsonb`). Las finas que sobreviven (`Decision_Trace`, `ROI_Operador`, `Credencial`, `Eval_Cell`, `Politica_Tier`) son **procesos de gobernanza distintos**: fundirlas rompería la auditoría append-only y los 4-ojos.

Convención de nombres aplicada (fix DevEx): los 3 brazos del motor y los 4 versionados llevan nombre explícito y único para que el dev no los confunda en el código.

> **Tipo compartido (fix eng severidad baja → crítico para el motor):**
> `CREATE TYPE nivel_autonomia AS ENUM ('BAJA','MEDIA','ALTA');`
> El `ENUM` nativo de Postgres ordena por **orden de declaración**, así `BAJA < MEDIA < ALTA` y `least()`/`min()` funcionan. **Nunca `varchar`** (daría orden alfabético `ALTA<BAJA<MEDIA`, invirtiendo el fail-closed). Se reutiliza en `pedido_NBA`, `liberado_evals`, `teto_tier`, `nivel_efectivo`, `nivel_resultante`.

---

### 3.1 ZONA `tenant` (RLS por **operador/pool** · `restaurante_id` = dato visible dentro del pool)

#### `Restaurante`
- **Propósito:** raíz/grounding por cliente (Cerebro). Unidad atómica de dato; **la frontera de aislamiento es el operador/pool** (`tenant_id`), NO el restaurante (ver Nota). Toda acción de IA exige fuente anclada aquí; sin grounding → fail-closed. Funde Cerebro_Cliente (00) + CUENTA (01) + (03) + id_restaurante (05A/05B).
- **Campos:** `restaurante_id` **(PK)** · `tenant_id` **(FK → operador/pool · frontera RLS)** · `tier_base {managed_brand|managed_midmarket|long_tail}` **(FK → Politica_Tier.tier_id)** · `segmento {long_tail|managed}` · `fecha_alta` **(bruto, seed)** · `atributos_vivos (jsonb: config bruta — estructura_promo, ventana, fuso, conexión; **recurrencia/cross_sell NO van aquí: se computan de Orden**, §14)` · `fontes_grounding (anchor refs)` · `tenure_actual` **(GENERATED = hoy − fecha_alta, §14 — no semeado)** · `estado {activo|suspendido}` (operacional bruto; el **at_risk** es score aparte, job pre-churn §14) · `provenance_por_campo`.
- **Fuente:** real (grounding/Cerebro); muchos atributos del demo = mock/fixture `[C]`.
- **Producida por:** Onboarding (seed) · Conversa_Episodio (write-back enriquece el Cerebro).
- **Consumida por:** Cohort (segmentación, vía snapshot) · Conversa_Episodio · Problema_Diagnosticado · Content_Lote (ancla) · KPI · v_min_calculo (validación grounding).

> **Nota (FIX de correctness — aislamiento por OPERADOR/POOL · decidido por Leo 2026-06-16) `[V]`:** la unidad de aislamiento (RLS) es el **operador/pool** = `tenant_id` (la cuenta agent-manager que gobierna **N restaurantes** — Leo operó ~5.000 con 2 personas), **NO el restaurante**. *El restaurante NO es una caja-fuerte:* cualquier agent-manager de su pool ve la info interna de **todos** sus restaurantes — es exactamente lo que permite al caza-silenciosos leer los 47 a la vez. `restaurante_id` es la **unidad de dato dentro del pool**, no la frontera. La protección entre restaurantes (**k-anon**) entra **solo en la SALIDA** de un insight que cruzaría a OTRO pool/tenant — nunca en la lectura interna. Por eso: **RLS por `tenant_id`** (`WHERE tenant_id = current_pool()`); `restaurante_id` NOT NULL como dato; `05A` sigue resolviendo `tenant_id` server-side de la credencial (anti-spoofing). **Resuelve la contradicción RLS×caza-silenciosos** (un RLS por-restaurante bloquearía ver los otros 46) y cierra la open-question §9.1.

#### `Orden` *(proceso Negocio — dato bruto, tabla gorda)*
- **Propósito:** TODAS las órdenes/pagos del restaurante en **una** tabla. Fuente REAL del **R$** (impacto), de los **silenciosos** (pago fallido sin reclamo) y de las métricas de negocio. **Reemplaza** la genérica `FuenteVerdad(tipo=pagos/campañas)` (datos del mismo proceso = una tabla, no un catch-all).
- **Campos:** `orden_id` **(PK)** · `restaurante_id` **(FK → Restaurante, NOT NULL)** · `fecha` · `valor_bruto` · `fee` · `valor_neto` · `status_pago {ok|fallido|pendiente}` · `motivo_fallo` · `zona` · `tipo_comida` · `canal` · `provenance`.
- **Índices/perf:** `(restaurante_id, fecha)`; **parcial** `(restaurante_id) WHERE status_pago='fallido'` (es el cruce de silenciosos — barato). **Particionada por mes.**
- **Fuente:** real (en dominio = ingesta read-only por-tenant); en demo = **generada (§12)**; el `47` deriva de `count(Orden WHERE status_pago='fallido')`, el R$ de `sum(valor_neto)`.
- **Producida por:** ingesta / generador de demo.
- **Consumida por:** Afetado (`evidencia`) · Processo_Critico (monitor de pagos) · Problema_Diagnosticado (`rs_perdido`) · KPI (métricas de negocio) · Pertenencia_Cohort_Snapshot (ranking).

#### `Evento_Uso` *(proceso Uso — log append-only, tabla gorda)*
- **Propósito:** uso de la plataforma + log de features en **una** tabla append-only. **Reemplaza** `FuenteVerdad(tipo=product_logs)` y consolida la telemetría de uso que estaba dispersa en `Conversa_Episodio.capa_metricas`.
- **Campos:** `evento_id` **(PK)** · `restaurante_id` **(FK → Restaurante, NOT NULL)** · `usuario_id` **(FK → Usuario, opcional)** · `feature` · `tipo_evento` · `ts` · `payload (jsonb)`.
- **Índices/perf:** `(restaurante_id, ts)`, `(feature, ts)`. **Particionada por fecha**; retención por ventana.
- **Fuente:** real (telemetría) / en demo = generada (§12).
- **Producida por:** la plataforma (todas las features loguean aquí) / generador.
- **Consumida por:** KPI (uso) · Salud_1a10 (métricas) · Diagnóstico (señal de performance) · cálculo de `at_risk`/pre-churn.

#### `Conversa_Episodio`
- **Propósito:** episodio de atención (3 capas: transcripción redactada / estructurada / métricas). **Entrada reactiva** que PRODUCE la señal que el Diagnóstico consume. Consume Cerebro/Cohort/NBA/Política/Eval. 1 conversa → 1 `episodio_id` idempotente (anti-double-count). **NO marca "resuelto"** (cierre = P3). Funde CONVERSA + SINAL_EPISODIO + Episodio_Atención (00) + TURNO (sub-array).
- **Campos:** `episodio_id` **(PK idempotente)** · `conversa_id` (raíz transaccional) · `tenant_id` (server-side credencial) · `restaurante_id` (= `id_restaurante`) **(FK → Restaurante)** · **`cohort_id` (FK → Cohort) [columna top-level, fix DevEx]** · **`nba_usada` (FK → NBA_Propuesta) [columna top-level, fix DevEx]** · `intent` **(FK → Intent_Catalog)** · `canal {whatsapp|email|in_app}` · `estado_conversa {abierta|en_humano|live_aguardando_permanencia|escalada}` · `capa_transcripcion (jsonb · PII redactada · retención limitada)` · `capa_estructurada (jsonb: causa_hipótesis+confianza, percentil-solo-contexto, resultado{absorbido|escalado}, policy_version, tono_version, provenance_por_campo)` · `capa_metricas (jsonb: tokens, n_turnos, n_re_contactos, esfuerzo_cliente, absorbido|escalado, csat)` · `turnos (jsonb array — sub-registro, no tabla)` · `lock_posesion (usuario_id|null)` · `señal_inyeccion (jsonb · logueada vs tenant)`.
- **Fuente:** real (write-back idempotente al Cerebro); en demo las 3 capas = fixture-escenario, causa = hipótesis `[I]`.
- **Producida por:** Atención P05A (runtime).
- **Consumida por:** Problema_Diagnosticado/Afetado (05B) · Salud_1a10 (capa_metricas) · correccion_humana (RLHF-router, drop-RH futuro).

> **Fix DevEx alta:** `cohort_id` y `nba_usada` suben de dentro de `capa_estructurada` a **columnas top-level FK-ables** — son justo lo que 05B cruza y lo que liga al `min()`; dentro del jsonb no son FK válidas y el DDL no compila.

#### `Problema_Diagnosticado`
- **Propósito:** hub del diagnóstico cross-conversación (05B): **un caso = un PROBLEMA** (anti doble-conteo). Carga `tipo_area` (dueño ÚNICO de la clasificación de causa), raíz-hipótesis, estado, ventana temporal, ruta-sugerida. Agrega ISSUE_TREE/IMPACTO/CASO_REPO como sub-objetos `jsonb` (Karpathy: no son 4 tablas en el demo). Funde Cluster/Problema_Diagnosticado (00) + PROBLEMA_DIAGNOSTICADO (05B).
- **Campos:** `problema_id` **(PK)** · `restaurante_id` **(FK → Restaurante, NOT NULL)** · `processo_id` **(FK → Processo_Critico, opcional, origen proactiva)** · `tipo_area` · `raiz_hipotese` · `confianza [C]` · `estado {nuevo|abierto|needs_human|degrade_humano|bloqueado|pendiente_confirmacion}` · `primera_vez_ts` · `ultima_vez_ts` · `frecuencia` · `ruta_sugerida (1 de 5)` · `issue_tree (jsonb: paths + resultado true/false/abierto + camino_usado)` · **escalares-resultado de impacto = COLUMNAS top-level `DEFAULT NULL`** (no claves jsonb — para que el test pre-corrida=NULL sea enforçable, fresta del triple-check): `rs_perdido`, `churn_risk`, `custo_resolver`, `valor_ganho`, `ordens_media`, `dias` (todas NULL hasta que el job compute; ver §14) · `impacto_meta (jsonb: flag ESTIMADO/rango + provenance)` · `dossier_emitido (jsonb · snapshot del Dossier emitido, ver §3.4)` · `provenance_por_campo`.
- **Fuente:** real-estructura / mock-contenido (fixture-escenario `[C]`; R$X de la cascada = `[C]` a definir+defender en el 1:10).
- **Producida por:** Diagnóstico P05B (orquestador + subagentes).
- **Consumida por:** Salud_1a10 (libro-razón: custo_resolver vs valor_ganho) · Content_Lote (acción proactiva en lote) · v_dossier_handoff (§3.4).

> **Fix eng alta — reconciliación 47 = count(Afetado):** `impacto.restaurantes_afetados` **NO se guarda como número** en el jsonb. Se deriva **siempre** de `count(Afetado WHERE problema_id=X)`. Para materializar al dossier sin drift, una **columna generada / trigger AFTER INSERT/DELETE on Afetado** recomputa, con flag `silenciosos_no_evaluable` cuando la fuente-población está stale (BR-B4). `rs_perdido` ídem = **`sum(Orden.valor_neto WHERE status_pago='fallido')`** del patrón — **fórmula canónica ÚNICA** (idéntica en §4/§6/§14; se elimina la vieja `count×ordens_media×dias` para no tener dos fórmulas), heredando la **peor provenance** de los insumos (`ordens_media`/`dias` derivan de Orden, no son constantes). El 47/35 es el corazón del "uau" — sin esto el dossier reporta 47 y la tabla tiene 50 y nadie lo nota.

#### `Afetado`
- **Propósito:** núcleo del "uau" (caza-silenciosos): cada restaurante afectado por un problema, con flag reclamó vs silencioso. **Fuente ÚNICA** de quién-está-afectado (key `restaurante_id`) que reconcilia el N-del-patrón con `impacto.restaurantes_afetados` — es el "47 afectados / 35 silenciosos". K-anon **NO suprime internamente** (silencioso suele ser n=1; 05B BR-B5/B6).
- **Campos:** `afetado_id` **(PK)** · `problema_id` **(FK → Problema_Diagnosticado)** · `restaurante_id` **(FK → Restaurante)** · `reclamou {true|false|desconocido}` · `silencioso:bool` · `evidencia` **(FK → Orden.orden_id · la orden con `status_pago='fallido'`)**.
- **Fuente:** mock-derivado de fixture (cruza "población-de-verdad" × reclamantes; 47/35 = `[C]` en demo).
- **Producida por:** Diagnóstico P05B (caza-silenciosos B.5).
- **Consumida por:** Problema_Diagnosticado (reconciliación) · v_dossier_handoff (QUIÉN).

#### `FuenteVerdad` → **dividida en `Orden` + `Evento_Uso`** (fix Leo: tablas gordas-por-proceso)
La genérica `FuenteVerdad` se **eliminó** (era un catch-all de procesos distintos). Se reparte así: `pagos/campañas` → **`Orden`** · `product_logs` → **`Evento_Uso`** · `tickets` ya son **`Conversa_Episodio`**. Las FKs que la referenciaban ahora apuntan a `Orden`: **`Afetado.evidencia → Orden.orden_id`** (la orden con `status_pago='fallido'` ES la evidencia del silencioso) y **`Processo_Critico.fonte_verdade_ref → Orden`**. El `47` sigue siendo derivable — ahora de un dato de proceso **concreto**, no de un catch-all.

#### `Processo_Critico`
- **Propósito:** procesos que el monitor proactivo vigila (dispara el caso **antes** del ticket = la cascada al revés). Entra si impacto-alto × falla-silenciosa × fuente-medible (ej.: pagos, cobranza incorrecta). Caso real vivido del Leo `[V]`.
- **Campos:** `processo_id` **(PK)** · `restaurante_id` **(FK → Restaurante, NOT NULL)** · `nome` · `score_impacto` · `falha_silenciosa:bool` · `fonte_verdade_ref` **(FK → Orden · proceso pagos)** · `origem {politica|kb_promovido}` · `schedule` · `estado {monitoreo_degradado|no-medible-ahora}`.
- **Fuente:** real-concepto (pagos = caso vivido `[V]`) / mock-registro (schedule y score = fixture).
- **Producida por:** Orquestador/monitor (P05B) · promoción vía Knowledge_Case.
- **Consumida por:** Problema_Diagnosticado (origen proactiva).

#### `Knowledge_Case`
- **Propósito:** base de conocimiento (anti-alucinación + grounding de hipótesis + RL): patrón → resolución → camino_usado por `tipo_area`. Toda hipótesis de raíz se chequea contra ella; sin casos + baja confianza → degrade-to-human. Guarda camino con guard anti-refuerzo (nace `no-reforzado`).
- **Campos:** `kb_case_id` **(PK)** · `tipo_area` · `padrao` · `resolucao` · `probabilidad [C]` · `caminho_usado` · `links_similares[]` · `flag {no-reforzado|pendiente-de-revision|divergente}` · `custo_resolver_historico`.
- **Relación:** N–N con `Problema_Diagnosticado` (tabla puente `Problema_Knowledge{problema_id, kb_case_id}`).
- **Fuente:** mock/fixture (KB del demo = seed; crece por RL con guard humano en lote).
- **Producida por:** Diagnóstico P05B.
- **Consumida por:** Problema_Diagnosticado (grounding/RL) · Processo_Critico (promoción) · v_dossier_handoff (casos-similares).

#### `KPI`
- **Propósito:** tabla viva central de KPIs medidos vs target, en 1 de 3 lentes (empresa/personal/proceso), con `clase` que gobierna read-only-vs-editable. `valor_hoy` calculado por agente determinista (`Named_Query`, **nunca LLM**). PerformanceFeed incorporado como campos (Karpathy: no es tabla/ingesta aparte). Funde KPI_Scorecard (00) + KPI/DocCanonicoKPI/PerformanceFeed (03).
- **Campos:** `kpi_id` **(PK, estable y compartido con North Star)** · `tenant_id` / `restaurante_id` **(FK → Restaurante)** · `nivel {empresa|personal|proceso}` (lente) · `dueno_id` **(FK → Usuario, role-scoping)** · `clase {performance|proceso}` · `kpi_def_version` **(FK → Named_Query.def_version)** · `target [C]` · `valor_hoy [C]` · `es_lagging:bool` · `parent_kpi_id` **(FK → KPI, self, nesting)** · `performance_validado_por/validado_en` (si clase=performance, read-only RH) · `ultimo_calculo_ts` · `provenance`.
- **Relación:** N–N KPI vía leading/lagging (**acíclico** — ciclo ⇒ fail-closed); 1–N sub-serie semanal.
- **Fuente:** estructura real; valores = mock/`[C]`; clase=performance = drop-RH-después (CSV/JSON firmado); clase=proceso = real/editable.
- **Producida por:** Agente de medición 3A (Python/SQL determinista) · PerformanceFeed RH · Edicion_Contexto (clase=proceso, 4-ojos).
- **Consumida por:** Salud_1a10 (10 señales por `kpi_id`) · AccionSugerida (KPI bajo target).

#### `AccionSugerida`
- **Propósito:** acción generada por agente cuando KPI bajo target Y en alcance (approval-gate BR-4: nada autónomo). Ruteo A/B: tipo-A = NBA A1-A8 sobre cohort → handoff a P02/`min()`; tipo-B → Workbench (Hipotesis/Plan/Item como sub-objeto). Funde AccionSugerida + Hipotesis/PlanDeAccion/ItemPlan (03).
- **Campos:** `accion_id` **(PK)** · `kpi_id` **(FK → KPI)** · `analisis` · `estado {propuesta|aprobada|rechazada|ejecutada}` · `aprobado_por` **(FK → Usuario)** · `tipo_ejecucion {A|B}` · `nba_id` **(FK → NBA_Propuesta, null⇒B)** · `cohort_id` **(FK → Cohort, null⇒B)** · `intent` **(FK → Intent_Catalog)** · `decision_trace_id` **(FK → Decision_Trace, solo tipo-A ejecutado)** · `acuracidad_feedback {acertada|no|no_atribuible}` · `workbench (jsonb tipo-B: governing_thought, metrica_verificacion determinista, plan, items)`.
- **Fuente:** real (genera/persiste; envelope `{nba_id,cohort_id,intent}` para P02).
- **Producida por:** Goals & KPIs P03.
- **Consumida por:** NBA_Propuesta (handoff tipo-A) · Salud_1a10 (valor que pasa 2 compuertas).

#### `Edicion_Contexto`
- **Propósito:** log de edición gobernada del contexto/NBA de proceso: credencial + 4-ojos (`validador_id != editor_id`) + log revertible. Performance es read-only y NO pasa por aquí. Funde EdicionContexto (03).
- **Campos:** `edicion_id` **(PK)** · `editor_id` **(FK → Usuario)** · `validador_id` **(FK → Usuario · != editor)** · `target_ref` **(FK → KPI clase=proceso)** · `campo` · `valor_anterior` · `valor_nuevo` · `timestamp`.
- **CHECK:** `validador_id IS NULL OR validador_id <> editor_id` + columna generada `independencia_garantida = (validador_id IS NOT NULL)`.
- **Fuente:** real.
- **Producida por:** Goals & KPIs P03 (edición 4-ojos).
- **Consumida por:** KPI (aplica cambio en clase=proceso) · auditoría.

---

### 3.2 ZONA `cohort` (agregada · **SIN `restaurante_id`** · gate = k-anon, no RLS)

> **Fix eng alta — cross-tenant en zona agregada.** Un Cohort agrega N restaurantes **por definición** (`tenure_bucket × tier_base`); darle `restaurante_id` sería contradicción. Aquí el cross-tenant NO se enforce con `restaurante_id` (no existe la columna) sino con **k-anon (`n_cuentas >= k`, CHECK) + flag `supresion_k_aplicada` en la frontera de SALIDA**. La liga restaurante↔cohort vive **solo** en `Pertenencia_Cohort_Snapshot`.

#### `Cohort`
- **Propósito:** célula versionada `tenure_bucket × tier_base`; unidad de comparación estable y de lote. `cohort_id` identifica una CÉLULA, no un tier. Puede contener Subgrupo (nivel 2, sin anidamiento infinito). Funde Cohort (00) + COHORT/celda (01) + Cohort (02/03).
- **Campos:** `cohort_id` **(PK · por `cohort_rule_version`)** · `tenure_bucket {0-3m|3-6m|6-12m|12m+}` · `tier_base` · `n_cuentas` · `cohort_rule_version` **(FK → Cohort_Rule_Version.version_id)** · `baseline_descriptivo (jsonb)` · `baseline_atribucion_segmento (jsonb)` · `freshness_ts` · `colapsada:bool`.
- **CHECK k-anon:** salida de insight/perfil/P90+ exige `n_cuentas >= k_anon_threshold` (`[C]` placeholder, ver `Config_Perillas`).
- **Fuente:** fixture-escenario (job batch versionado persiste en el Cerebro; bordes de `tenure_bucket` = `[C]`).
- **Producida por:** job batch de segmentación (P01).
- **Consumida por:** NBA_Propuesta · Eval_Cell · Liberacion_Lote · Content_Lote · AccionSugerida · Pertenencia_Cohort_Snapshot.

> `Subgrupo` (nivel 2) se modela como **tabla fina** `Subgrupo{subgrupo_id PK, cohort_id FK}` (fix DevEx: NO columna nullable que sea FK-target). Máx 2 niveles.

#### `Cohort_Rule_Version` (catálogo · ver nota Karpathy §9)
- **Propósito:** versionado de la regla de generación de cohorts ("el ML") + changelog. **Estampado POR FILA/EVENTO**. Garantiza A=B y anti-mezcla de baselines. Funde COHORT_RULE_VERSION/ML_CHANGELOG (01).
- **Campos:** `version_id` **(PK = cohort_rule_version)** · `fecha` · `que_cambio` · `efecto_en_baseline` · `provenance`.
- **Fuente:** fixture (changelog versionado; nunca mezcla baselines de versiones distintas).
- **Consumida por:** Cohort · Pertenencia_Cohort_Snapshot · Evento_Priorizado_NBA · NBA_Propuesta · Liberacion_Lote.

#### `Pertenencia_Cohort_Snapshot` *(= `PERCENTIL_SNAPSHOT` en 01)*
- **Propósito:** posición de cada restaurante en su cohort en serie **SEMANAL**: percentil, gap-hasta-el-tope, dos baselines. Liga Restaurante↔Cohort y alimenta NBA y North Star. Bloquea percentil si `n < n_min` (cae a modo cualitativo). Funde Pertenencia_Cohort/Percentil (00) + PERCENTIL_SNAPSHOT (01).
- **Campos:** `snapshot_id` **(PK)** · `restaurante_id` **(FK → Restaurante)** · `cohort_id` **(FK → Cohort)** · `subgrupo_id` **(FK → Subgrupo)** · `semana` · `percentil_en_cohort (null si sin-percentil)` · `gap_hasta_top` · `n_min_ok:bool` · `freshness_ts` · `cohort_rule_version` **(FK)** · `scope_owner_ref (jsonb embebido {dueno_id, nivel})` · `provenance`.
- **UNIQUE (anti-double-count semanal):** `(restaurante_id, cohort_id, semana, cohort_rule_version)`.
- **Fuente:** fixture-escenario (ranking sobre métricas canónicas del Cerebro; baseline con telemetría = `[V]`, si no `[C]`; cadencia SEMANAL).
- **Producida por:** job batch de percentil (P01).
- **Consumida por:** Evento_Priorizado_NBA · KPI/North Star (baseline_atribucion) · Conversa_Episodio (percentil solo contexto).

> Esta es la **única** entidad que liga restaurante↔cohort (resuelve el cross-tenant de la zona agregada).

#### `Evento_Priorizado_NBA` *(= EVENTO_PRIORIZADO_NBA + TRANSICION_DE_COHORT/DELTA en 01)*
- **Propósito:** único output **mutante REAL** de P01: intención (NO acción) que NBA consume. `risk_class` NO nace aquí (nace en P02). Funde EVENTO_PRIORIZADO_NBA + delta de cohort (01) como contrato de handoff P01→P02.
- **Campos:** `evento_id` **(PK)** · `restaurante_id` **(FK)** · `cohort_id` **(FK)** · `subgrupo_id` **(FK)** · `percentil_en_cohort (null si sin-percentil)` · `gap_hasta_top` · `delta_status {mudou_cohort|melhorou_percentil|baixou_percentil|at_risk|novo|churn}` · `n_min_ok` · `freshness_ts` · `modo {percentil|cualitativo_sin_percentil}` · `cohort_rule_version` **(FK)** · `scope_owner_ref` · `operador_id` **(FK → Usuario)**.
- **Fuente:** real (único output mutante; consumido por NBA P02).
- **Producida por:** Cohorts Explorer batch (P01).
- **Consumida por:** NBA_Propuesta · AccionSugerida/Goals (03).

#### `Eval_Cell`
- **Propósito:** golden-set por `cohort × intent`; estado rojo/verde produce `liberado_evals` (1 brazo del `min()`). Promover autonomía = humano+evidencia; rebajar = automático (asimetría fail-closed). Incorpora el Red_Team_Set (00) como flag de independencia juez↔humano (Karpathy: no es tabla propia). Funde Eval_Cell (00) + EVALS-cell (02/03/05A).
- **Campos:** `eval_cell_id` **(PK surrogate uuid)** · **UNIQUE `(cohort_id, intent, version)`** · `cohort_id` **(FK → Cohort)** · `intent` **(FK → Intent_Catalog)** · `version` (golden set) · `liberado_evals (nivel_autonomia)` · `estado {rojo|verde}` · `n_cohort_x_intent` · `kappa` · `redteam_independencia_flag:bool` · `redteam_resultado_juez_vs_humano`.
- **Fuente:** fixture-escenario (golden set; la célula pasa rojo→verde en el acto 4 de la demo).
- **Producida por:** gobernanza Evals (promover=humano+evidencia; rebajar=automático) · correccion_humana ruteada de 05A.
- **Consumida por:** v_min_calculo (liberado_evals) · Decision_Trace (par) · Content_Lote (calidad) · Conversa_Episodio (liberado_evals de la célula).

> **Fix eng alta:** PK **surrogate** `eval_cell_id` + `UNIQUE(cohort_id,intent,version)`. Todas las referencias apuntan a `eval_cell_id` (no a la PK compuesta, que da FK órfana). `intent` aislado **nunca** es target de FK → apunta a `Intent_Catalog`.

#### `NBA_Propuesta`
- **Propósito:** catálogo **CERRADO A1-A8** + "no actuar" instanciado: cada acción que la IA propone para un cohort/subgrupo, con causa-raíz, before/after y `pedido_NBA` (1 brazo del `min()`). Carga `clase_financiera` (directa = mueve saldo) y `clase_palanca` (ruteo). La IA instancia, **nunca inventa**. Funde NBA (00) + NBA_propuesta (02) + catálogo (03/05A).
- **Campos:** `nba_id` **(PK uuid)** · `tipo_accion` **(FK → NBA_Catalogo.codigo {A1..A8|no-act})** · `cohort_id` **(FK → Cohort)** · `subgrupo_id` **(FK → Subgrupo)** · `intent` **(FK → Intent_Catalog)** · `causa_raiz` · `pedido_NBA (nivel_autonomia)` · `before_after_esperado (jsonb [C])` · `clase_financiera {directa|indirecta|ninguna}` · `clase_palanca {operacional|estrategica|area}` · `destino_ruteo {NBA|Strategy|Soporte|descartar}` · `risk_class (derivado, peor caso)` · `impacto_estimado (jsonb [C])` · `impacto_realizado (jsonb)` · `cohort_rule_version` **(FK)**.
- **Fuente:** mock/fixture-escenario (catálogo A1-A8 pre-definido; before_after = `[C]`).
- **Producida por:** Cohorts Explorer (Evento_Priorizado_NBA dispara) · AccionSugerida tipo-A (03) · Conversa_Episodio (origina pedido).
- **Consumida por:** v_min_calculo · Liberacion_Lote · Decision_Trace · Conversa_Episodio (nba_recomendada+why) · AccionSugerida (handoff tipo-A).

#### `Content_Lote`
- **Propósito:** generación de contenido en lote por cohort (comunicaciones/respuestas/campañas) con gate humano + grounding fail-closed: sin ancla en el Cerebro → **bloqueo rojo**, no publica (freno visible de la demo, acto 2). Funde Content_Lote (00).
- **Campos:** `lote_id` **(PK)** · `cohort_id` **(FK → Cohort)** · `piezas (jsonb[])` · `grounding_ancla` **(FK → Restaurante)** · `calidad` **(FK → Eval_Cell.eval_cell_id)** · `estado {rojo|aprobado}` · `gate_humano` **(FK → Usuario)**.
- **Fuente:** fixture-escenario (lote sin ancla dispara bloqueo rojo).
- **Producida por:** Content Studio (P04) · Problema_Diagnosticado (acción proactiva en lote).
- **Consumida por:** operación (publicación tras gate).

---

### 3.3 ZONA `gov` (gobernanza/auditoría · append-only)

#### `Usuario`
- **Propósito:** actor único que gobierna la IA (no atiende clientes directamente). Unifica operador/agent-manager (00) + usuario/proponente/confirmador (02) + editor/validador/aprobado_por/dueño (03). Sostiene 4-ojos, role-scoping (OrgGraph absorbido) y ROI por operador.
- **Campos:** `usuario_id` **(PK)** · `tenant_id` **(FK → Restaurante, escopo)** · `nivel_org {CEO|VP|equipo|IC}` · `manager_id` **(FK → Usuario, self)** · `directos[]` · `papel_corrente {proponente|confirmador|editor|validador|dueno}` · `rol_credencial` (gate lógico mockado hasta base_de_credenciales) · `ROI_por_operador`.
- **Fuente:** mock AHORA / drop-RH-después (OrgGraph y roles vienen de doc de RH).
- **Producida por:** RH/Onboarding (drop futuro).
- **Consumida por:** Decision_Trace · Liberacion_Lote · Credencial · KPI · Edicion_Contexto · Conversa_Episodio (lock).

#### `Politica_Tier`
- **Propósito:** produce `teto_tier` (3er brazo del `min()`): techo estructural de autonomía por restaurante. Documento `.md` versionado = fuente-de-verdad del "bajo riesgo", no regla chumbada. Aloja hard-no cross-tenant y mapa de tiers. Funde Politica_Tier (00) + base_de_politicas (02) + Política/Tier #10.
- **Campos:** `policy_id` **(PK)** · `tier_id` · `policy_version (semver)` · `teto_tier (nivel_autonomia)` · `permitido_hoy (jsonb)` · `resultado_medido` · `como_se_mide` · `regra_cross_tenant (hard-no)` · `nacida_de_trace` **(FK → Decision_Trace, NULLABLE)** · `firma_humana` **(FK → Usuario)**.
- **Fuente:** real (`.md` versionado, fuente-de-verdad); schema fino `[I]`.
- **Producida por:** NBA/gobernanza (nueva política nacida de trace+resultado, con firma).
- **Consumida por:** v_min_calculo (teto_tier) · Liberacion_Lote (policy_version validada) · Decision_Trace (gate-2) · Conversa_Episodio (políticas tenant×intent) · Credencial (cruce).

> **Fix eng media — circularidad de seed:** `nacida_de_trace` es **NULLABLE**; en el seed la política-raíz lleva `nacida_de_trace = NULL`. Orden de seed: `Politica_Tier(nacida_de_trace=NULL)` → luego `Decision_Trace`. `Decision_Trace.policy_version` es NOT NULL. `nacida_de_trace` solo se llena en políticas de 2ª generación.

#### `Credencial`
- **Propósito:** autoridad humana **POR-TENANT** (gate de elegibilidad **ANTES** del `min()`, NO 4º brazo). Versionada, hermana de Politica_Tier. RBAC materializado (ROL_PERMISO como matriz): qué acción cada rol puede pedir, hasta qué nivel, con 2-ojos, de qué origen. `nivel_max_liberable` **nunca** supera `teto_tier`. Funde CREDENCIAL + ROL_PERMISO + CREDENCIAL_AUDIT (02).
- **Campos:** `credencial_id` **(PK)** · `usuario_id` **(FK → Usuario)** · `tenant_id` **(FK → Restaurante, alcance por-tenant)** · `rol {agent_manager_junior|agent_manager_senior|gov_admin|policy_owner|finanzas}` · `estado {activa|suspendida|revocada}` · `credential_policy_pin` (versión política de credencial) · `rbac_matriz (jsonb: rol×accion_clase → nivel_max_liberable, requiere_2_ojos, origen_permitido)` · `audit_divergencia (cruce vs política: gana la política)` · `emitida_por_id` **(FK → Usuario)** · `expira_at`.
- **Fuente:** drop-RH-después (`base_de_credenciales.md` por escribir; contrato cerrado, schema fino `[I]`). En demo = gate lógico mockado (campo `rol` en Usuario + matriz en `Config_Perillas`).
- **Producida por:** RH/gov_admin.
- **Consumida por:** Decision_Trace (gate-1) · Edicion_Contexto · v_min_calculo (elegibilidad antes del min).

#### `Liberacion_Lote`
- **Propósito:** override humano liberar/pausar **EN LOTE** por cohort/subgrupo. `nivel_resultante <= nivel_efectivo` (override **SOLO BAJA**, AUT-11). Carga firma humana + policy_version validada. Funde liberacion_lote (02) + gobernanza liberar/pausar (00).
- **Campos:** `liberacion_id` **(PK)** · `cohort_id` **(FK → Cohort)** · `subgrupo_id` **(FK → Subgrupo)** · `accion {LIBERAR|PAUSAR}` · `nivel_resultante (nivel_autonomia, <= nivel_efectivo)` · `proponente_id` **(FK → Usuario)** · `operador_id` **(FK → Usuario, firma)** · `policy_version_validada` **(FK → Politica_Tier.policy_version)** · `etapas_en_vuelo_resueltas:bool` · `decision_trace_id` **(FK → Decision_Trace)**.
- **Fuente:** real (generado por la acción del operador en la demo).
- **Producida por:** operador vía cockpit de gobernanza (P02).
- **Consumida por:** Decision_Trace (1-1) · ROI_Operador (1-1) · NBA_Propuesta (gobierna ejecución).

#### `Decision_Trace`
- **Propósito:** traza auditable **append-only** de cada liberar/pausar/evaluación de autonomía: firma humana + policy_version + nivel aplicado + 3 gates + 4-ojos. **Sin trace no hay acción** (precondición). **Nunca expuesto al cliente.** Funde Decision_Trace (00) + decision_trace (02) + DECISION_TRACE (05A).
- **Campos:** `trace_id` **(PK, decision_id canónico)** · `liberacion_id` **(FK → Liberacion_Lote)** · `conversa_id` **(FK → Conversa_Episodio, null si origen gobernanza)** · `calculo_id` **(FK → min_calculo log, ver §3.4)** · `accion {liberar|pausar|override}` · `proponente_id` **(FK → Usuario)** · `confirmador_id` **(FK → Usuario, != proponente; null=auto-confirmada [C])** · `nivel_efectivo_aplicado (nivel_autonomia)` · `eje_escalacion {quien|efecto|confianza|estado|anomalia|reincidencia|auto_flag|none}` · `credencial_id` **(FK → Credencial)** · `policy_version` **(FK → Politica_Tier, NOT NULL)** · `origen {desktop|movil}` · `gate_result (jsonb g1/g2/g3)` · `tiempo_a_firma_seg` · `rubber_stamp_flag (generada)` · `timestamp`.
- **CHECK 4-ojos (fix eng media):** `confirmador_id IS NULL OR confirmador_id <> proponente_id` + columna generada `independencia_garantida = (confirmador_id IS NOT NULL)`. `rubber_stamp_flag` = `(tiempo_a_firma_seg < umbral AND origen='movil')`. Misma regla en `ROI_Operador` y `Edicion_Contexto`.
- **Fuente:** real (persistido en el Cerebro/P07, append-only, inmutable).
- **Producida por:** NBA/Liberacion (P02) · Conversa_Episodio (P05A gate `min()`).
- **Consumida por:** ROI_Operador · Politica_Tier (nacida_de_trace) · AccionSugerida (decision_trace_id) · Paquete_Escalacion (05A, derivado).

#### `min_calculo` (log append-only — NO 1-1 con NBA)
- **Propósito:** **núcleo del motor**, persistido como **log auditable**. `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)`; brazo null/indisponible → fail-closed al menor conocido. Funde min_calculo (02) + nivel_efectivo (00) + DECISION_TRACE.par (05A).
- **Campos:** `calculo_id` **(PK uuid)** · `nba_id` **(FK → NBA_Propuesta, NULLABLE — path P02)** · `conversa_id` **(FK → Conversa_Episodio, NULLABLE — path P05A)** · `eval_cell_ref` **(FK → Eval_Cell.eval_cell_id)** · `policy_id` **(FK → Politica_Tier.policy_id)** · `pedido_NBA (nivel_autonomia)` · `liberado_evals (nivel_autonomia · copia inmutable)` · `teto_tier (nivel_autonomia · copia inmutable)` · `nivel_efectivo (nivel_autonomia)` · `auto_liberable:bool` · `n_cohort` · `cohort_rule_version` · `computed_at`.
- **CHECK XOR origen:** `(nba_id IS NOT NULL) <> (conversa_id IS NOT NULL)` — debe venir de un path o del otro.
- **CHECK motor:** `nivel_efectivo = least(pedido_NBA, liberado_evals, teto_tier)` (sobre el ENUM ordenado).
- **`auto_liberable`** = `BAJO ∧ reversible/idempotente ∧ no-dinero ∧ no-cross-tenant ∧ validada-política ∧ N >= k`.
- **Fuente:** computado en runtime, persistido append-only; insumos: `teto_tier` = config del `.md` (bruto); `liberado_evals` = **COMPUTADO al correr el golden-set de Eval_Cell** (§14), copiado inmutable al log. **Nunca semeado** — el seed NO inserta filas en `min_calculo` (las genera el motor al correr).
- **Producida por:** NBA P02 (runtime) · Conversa_Episodio P05A (runtime).
- **Consumida por:** Liberacion_Lote · Decision_Trace (`calculo_id`).

> **Fixes integrados (eng alta + media · DevEx media · Karpathy alta):**
> 1. **Separar VALOR de PROCEDENCIA (eng):** el log guarda los 3 valores enum (copia inmutable) **MÁS** las FKs reales a la origen (`eval_cell_ref`, `policy_id`, `nba_id`). Así el trace prueba de **qué** célula y **qué** versión de política vino cada brazo — el grounding deja de ser teatro.
> 2. **PK propia `calculo_id` + append-only (eng/DevEx):** una misma NBA se evalúa hoy (rojo) y en el acto 4 (verde → `liberado_evals` sube) = **dos** filas con `nivel_efectivo` distinto. La PK=nba_id (descartada) borraría el antes/después que ES el acto 4 de la demo.
> 3. **Path 05A (DevEx):** `conversa_id` como FK alterna porque 05A computa `min()` por DECISION_TRACE de la conversa, donde puede no haber `nba_id` aún (A pide, P2 instancia).
> 4. **Respuesta a Karpathy (¿no es una vista?):** sí, la **lectura** del "min vigente" es `v_min_calculo` (vista, §3.4). Pero el **histórico append-only** sí es tabla, porque el Decision_Trace tiene que apuntar a la evaluación exacta que firmó. La vista da el cálculo en vivo; el log da la auditoría del antes/después. Conservar el log es lo que hace auditable la transición rojo→verde.

#### `ROI_Operador`
- **Propósito:** métrica-madre por liberación: eficiencia 1:10 (tiempo economizado × impacto) + impacto de negocio atribuible. SOLO cuenta valor **CONFIRMADO + ATRIBUIBLE** (2 compuertas). funnel-correlacional ⇒ no-confirmable. Funde roi_operador (02) + valor del North Star (00).
- **Campos:** `roi_id` **(PK)** · `liberacion_id` **(FK → Liberacion_Lote)** · `tiempo_economizado` · `impacto_negocio_atribuible {recurrencia|ventas|cross_sell}` · `ratio_1_10` · `guardrail_error (no puede subir)` · `metodo_atribucion {holdout-control|pre-post|funnel-correlacional}` · `horizonte_medido {inmediato|largo|ambos}` · `es_atribuible:bool (false ⇒ no cuenta North Star)` · `confirmador_id` **(FK → Usuario, != proponente)** · `signal_de_resultado`.
- **Fuente:** mock/`[C]` placeholder (valores calibran post-deploy; estructura real).
- **Producida por:** NBA/Liberacion (P02).
- **Consumida por:** Salud_1a10 (Salud_1a10) · Eval_Cell (retroalimenta calibración).

---

### 3.4 Catálogos finos, vistas y derivados (lo que NO es tabla de dominio)

**Catálogos versionados** (`schema catalog`):

- **`Intent_Catalog`** `{intent_id PK, label, version}` — *(fix DevEx/eng alta)* `intent` es FK-target sin entidad en el modelo original. Necesario para anclar `'cobrança'` del fixture; lo referencian `Eval_Cell`, `NBA_Propuesta`, `Conversa_Episodio`, `Politica_Tier (tenant×intent)`, `AccionSugerida`.
- **`NBA_Catalogo`** `{codigo PK {A1..A8|no-act}, nome, clase_financiera_default, descripcion}` — *(fix DevEx alta)* el catálogo "cerrado A1-A8" se nombra en 00/02 pero **nunca se enumera**. Sin los 8 placeholders el enum no compila y el fixture (`'corrigir-callado'`) no rutea. **`[I]` — los 8 códigos deben ratificarse con Leo; en el fixture mapeamos 'corrigir-callado' → A3.**
- **`Named_Query`** `{def_version PK, formula, periodicidad, group_by, source_ref, unit}` — *(fix DevEx alta)* el "cómo se mide" de KPI. Ejecutor **siempre** Python/SQL determinista, nunca LLM. `KPI.kpi_def_version` apunta aquí.
- **`Config_Perillas`** `{key PK, valor, provenance, owner}` — *(fix DevEx baja + open question)* fuente **única** de los placeholders `[C]`: `k_anon_threshold`, `n_min_threshold (=20)`, `D (días verde-sostenido)`, `TTL_baseline`, `lock_TTL`, `umbral_antifrac`, `retencion_PII`, `costo_por_respuesta`. Todas las features leen de aquí ⇒ `n_min=20` es el mismo en 01, 02 y 05A.

**Vistas / derivados** (no persisten dato nuevo — respuesta a Karpathy):

- **`v_min_calculo`** — lectura del "min vigente" por NBA/conversa: `SELECT least(...)` + JOINs a Eval_Cell/Politica_Tier. La **lectura** es vista; el **histórico** es el log `min_calculo` (§3.3).
- **`v_dossier_handoff`** — *(Karpathy media)* el Dossier_Handoff (output E2E #8, 11 campos) es **derivado puro** de Problema_Diagnosticado + Afetado + issue_tree + impacto + Knowledge_Case. No es tabla mientras Feature C no declare el contrato; lo emitido se audita en `Problema_Diagnosticado.dossier_emitido (jsonb)`. **Fail-closed: EXCLUYE (no muestra) todo campo cuyo productor no haya corrido o con provenance `[C]`-sin-computar — p.ej. `churn_risk` si el job pre-churn no existe. Nunca muestra un número que ningún agente produjo.**
- **`Salud_1a10` (North Star / libro-razón)** — **vista de lectura, NO fixture estático** (corrección §14): el **ratio 1:10 y las 10 señales DERIVAN en vivo** de `Conversa_Episodio.capa_metricas` (absorbido/escalado) + `KPI.valor_hoy` (Named_Query) + `ROI_Operador`. Lo **longitudinal que no se puede computar en el demo** (Y1/Y2, curva €3→€1 en el tiempo) se marca **proyección-narrada-NO-numérica** (etiqueta visible), nunca un número que parezca medido. Cuando P11 se specee, vuelve tabla. *(Antes decía "fixture estático [C]" — contradecía §12; resuelto a favor de derivar.)*

---

### 3.5 ZONA Feature C — Generación de conocimiento (`05C`) · entidades nuevas + contrato del dossier

> **Costura de `05C` (2026-06-16).** C corre **después** de B; toma el dossier (`v_dossier_handoff`) y lo traduce en **N artefactos** (router propio de TIPO; 1 dossier → N). **C REUSA el Cerebro** — métricas (`KPI`+`Named_Query`), gobernanza/`min()` (`Politica_Tier`+`Eval_Cell`+`Credencial`+`Decision_Trace`+`min_calculo`), atribución (`ROI_Operador`), entrega email (`Content_Lote`), conocimiento (`Knowledge_Case`) — y **solo declara lo de abajo**. **El "cómo" reproducible NO es un código nuevo de `NBA_Catalogo` (cerrado A1-A8): es `Knowledge_Case`.** Estas entidades son **Fase 2** (§13), no la espina.

#### `Artefacto_Generado` *(zona `gov` · append-only)*
- **Propósito:** cada artefacto que C genera para un equipo-destino en los **5 tipos NO-email** (spec REFORGE, análisis Finanzas, NBA-render, borrador política, borrador T&C). El **email/contenido a restaurantes sale por `Content_Lote`** (no aquí). Nace **atado a una métrica** (binding obligatorio) y **no se entrega sin `Decision_Trace`**.
- **Campos:** `artefato_id` **(PK)** · `tipo {spec_reforge|finanzas_impacto|nba_render|politica_borrador|tc_borrador}` · `problema_id` **(FK → Problema_Diagnosticado · el dossier origen)** · `kpi_objetivo` **(FK → KPI, NOT NULL · binding métrica al nacer)** · `equipo_destino` · `ritual_ref` **(FK → Ritual_Destino)** · `contenido (jsonb)` · `estado {borrador|en_gate_humano|auto_pasado|entregado|adoptado|adopcion_nula}` · `calculo_id` **(FK → min_calculo · el `nivel_efectivo` aplicado)** · `decision_trace_id` **(FK → Decision_Trace)** · `reuse_count` · `ultimo_uso_ts` · `provenance_por_campo`.
- **Hard-nos:** `tipo=finanzas_impacto` **muestra impacto, nunca pide recurso/mueve saldo** (hereda `NBA_Propuesta.clase_financiera`; `=directa` ⇒ ceiling ALTO, solo-propone + `umbral_antifrac`). `politica_borrador`/`tc_borrador` → gate humano salvo que `Politica_Tier.permitido_hoy` + `Eval_Cell` habiliten la clase (gate-1 `Credencial` + gate-2 Política, **NO** un brazo del `min`). Número **siempre determinista** (`Named_Query`, nunca LLM).
- **Fuente:** real (estructura) / `[C]` (contenido demo). **Producida por:** Feature C (P05C, generadores spec/finanzas/política/T&C). **Consumida por:** `Salud_1a10` (atribución por destino) · `Ritual_Destino` (adopción).

#### `Ritual_Destino` *(catálogo · `schema catalog`)*
- **Propósito:** mapeo (`tipo_artefacto` × `equipo_destino`) → **ritual recurrente nombrado + champion** (adopción; principios Shishir/Claire). Gate **fail-closed con alta manual**: `Artefacto_Generado` no se entrega si falta ritual/champion, pero el primer ritual se da de alta a mano (no congela el día 1).
- **Campos:** `ritual_id` **(PK)** · `tipo_artefacto` · `equipo_destino` · `ritual_nombrado` · `champion_rol` · `estado {activo|sin_asignar}` · `seed_manual:bool`.
- **Fuente:** seed manual `[C]` (roles placeholder hasta nombrar personas). **Consumida por:** `Artefacto_Generado` (gate de entrega).

#### Extensión `Knowledge_Case.resolucao` — el "cómo" tipado (sobre §3.1)
`resolucao` pasa de texto a **`jsonb {steps[] ordenados, precondiciones, metrica_objetivo_ref → KPI}`** para que C la consuma como **contrato tipado** (lo que `05C` llamaba `NBA_REF.steps[]`). El paso-a-paso vive **aquí**, nunca en `NBA_Propuesta` (que sigue sin `steps[]`). **"Crear NBA nueva cuando falta"** = `INSERT` en `Knowledge_Case` (`flag='no-reforzado'`, guard RL humano-en-lote), **jamás** un código A9 en `NBA_Catalogo` (cerrado).

#### Contrato `v_dossier_handoff` — los **11 campos** (cierra Open Question §9.4)
Vista derivada (no tabla); **fail-closed** si cualquier campo vacío/sin provenance (PII saneada). La `ruta_sugerida` del dossier es **input** al router propio de C. Los 11:
1. `problema_id` + `tenant_id`(pool)/`restaurante_id` · 2. `tipo_area` (clasificación; dueño = 05B) · 3. `raiz_hipotese` + `confianza` · 4. `afectados = count(Afetado)` + `silenciosos` (quién) · 5. `impacto.rs_perdido` + `ordens_media` + `dias` · 6. `churn_risk` · 7. `ruta_sugerida` (1 de 5) · 8. `issue_tree.camino_usado` · 9. `knowledge_cases` similares (links) · 10. `custo_resolver` vs `valor_ganho` (libro-razón) · 11. `provenance_por_campo` + flag `fail_closed`.

---

### 3.6 Feature D+E — Dashboard de salud (`05DE`) · VITRINA, sin entidad nueva

> **Costura de `05DE` (2026-06-17).** D+E **NO declara ninguna entidad de negocio** — solo su **config de layout** (UI: qué cuadros, qué pares bueno/cuidado, qué umbrales resaltan). Es una **VITRINA read-only** que hace SELECT sobre RESULTADOS ya computados por sus dueños (ver §5: `KPI`/`Named_Query`, `ROI_Operador`, `Conversa_Episodio.capa_metricas`, `Salud_1a10`, `Pertenencia_Cohort_Snapshot`, `Problema_Diagnosticado`, `Afetado`, `Artefacto_Generado`, `Eval_Cell`). **Nunca recomputa** (número determinista = de su dueño, nunca LLM).
> **D+E es la SUPERFICIE HUMANA del invariante §14:** renderiza los estados conservadores/NULL **honestamente** — sellos `confirmado/provisional/no-confiable` en cada $ (2 compuertas), "monitoreando, sin datos" en vez de verde-fake (silenciosos), "ESTANCADO" si el costo cae sin que suba la inteligencia. Un resultado aún no computado se pinta vacío/conservador, **jamás** como número que parezca medido; un campo-resultado sin productor (p.ej. `at_risk`/pre-churn, needs-prototype §9.9) se **EXCLUYE** (fail-closed), no se muestra `[C]`.
> **El detalle** (modelo de evolución + roadmap: drift de 4 capas, oscilación generativa "B-del-cliente", copiloto de próximo-experimento, salud-del-gobierno, error compuesto en banda) vive en `_evolucion_meta_inteligencia_support.md` — **NO build esta semana** (Karpathy: insight capturado ≠ sistema construido).

---

## 4. Relaciones (FKs)

```
catalog:
  Intent_Catalog(intent_id) ←─ Eval_Cell.intent, NBA_Propuesta.intent,
                                Conversa_Episodio.intent, AccionSugerida.intent
  NBA_Catalogo(codigo)      ←─ NBA_Propuesta.tipo_accion
  Named_Query(def_version)  ←─ KPI.kpi_def_version
  Config_Perillas(key)      ←─ (leído por jobs/CHECKs, no FK rígida)

tenant (RLS por tenant_id/pool · restaurante_id = dato NOT NULL):
  Restaurante(restaurante_id) ──1─1── Politica_Tier (vía tier_base → tier_id; define teto_tier)
        ▲  ▲  ▲  ▲  ▲
        │  │  │  │  └── KPI.restaurante_id
        │  │  │  └───── Conversa_Episodio.restaurante_id (= id_restaurante)
        │  │  └──────── Problema_Diagnosticado.restaurante_id
        │  └─────────── Afetado.restaurante_id
        └────────────── Orden.restaurante_id, Evento_Uso.restaurante_id, Processo_Critico.restaurante_id
  Restaurante(restaurante_id) ──1─N── Orden, Evento_Uso        [datos brutos de negocio/uso]
  Problema_Diagnosticado(problema_id) ──1─N── Afetado   [count(Afetado) = impacto.restaurantes_afetados]
  Problema_Diagnosticado ──N─N── Knowledge_Case  (puente Problema_Knowledge)
  Problema_Diagnosticado.processo_id → Processo_Critico
  Processo_Critico.fonte_verdade_ref → Orden   ;   Afetado.evidencia → Orden (status_pago='fallido')
        [rs_perdido = sum(Orden.valor_neto fallido) ;  47 = count(Afetado) derivado de Orden]
  KPI.parent_kpi_id → KPI (self, nesting acíclico) ; KPI ──N─N── KPI (leading/lagging, acíclico)
  KPI(kpi_id) ──1─N── AccionSugerida   ;   Edicion_Contexto.target_ref → KPI(clase=proceso)

cohort (SIN restaurante_id · gate=k-anon):
  Cohort_Rule_Version(version_id) ←─ Cohort, Pertenencia_Snapshot, Evento_Priorizado_NBA,
                                     NBA_Propuesta, Liberacion_Lote   [estampado POR FILA → A=B]
  Cohort(cohort_id) ──1─N── Subgrupo ; ──1─N── Eval_Cell, NBA_Propuesta, Content_Lote, Liberacion_Lote
  Cohort ──1─N── Pertenencia_Cohort_Snapshot   ◄── ÚNICA liga Restaurante↔Cohort
        Pertenencia_Snapshot.restaurante_id → Restaurante (cruza zona tenant↔cohort SOLO aquí)
  Eval_Cell(eval_cell_id) ←─ Content_Lote.calidad, min_calculo.eval_cell_ref
  Content_Lote.grounding_ancla → Restaurante

gov (append-only):
  Usuario(usuario_id) ←─ {proponente|confirmador|editor|validador|dueno|operador}_id (todos FK a Usuario)
        Usuario.manager_id → Usuario (self) ; Usuario.tenant_id → Restaurante
  Liberacion_Lote(liberacion_id) ──1─1── Decision_Trace ; ──1─1── ROI_Operador
  Decision_Trace.proponente_id ≠ confirmador_id (4-ojos) ; .policy_version → Politica_Tier (gate-2) ;
        .credencial_id → Credencial (gate-1) ; .calculo_id → min_calculo (gate-3, el par)
  Politica_Tier.nacida_de_trace → Decision_Trace (NULLABLE · 2ª generación)
  Credencial.usuario_id → Usuario ; .tenant_id → Restaurante (por-tenant, sin bypass global)
  min_calculo: nba_id XOR conversa_id ; eval_cell_ref → Eval_Cell ; policy_id → Politica_Tier
        nivel_efectivo = least(pedido_NBA, liberado_evals, teto_tier)
```

---

## 5. Mapa feature → datos

`[I]` = contrato **no bilateral** (el campo aún no aparece en los dos docs; firme solo cuando ambos lo nombren).

| Pantalla | LEE | ESCRIBE |
|---|---|---|
| **P01 Cohorts Explorer** | Restaurante, **Orden** (métricas de negocio), Pertenencia_Snapshot, Cohort_Rule_Version | Cohort, Subgrupo, Pertenencia_Cohort_Snapshot, **Evento_Priorizado_NBA** (único output mutante) |
| **P02 NBA Playbooks** | Evento_Priorizado_NBA, Cohort, Eval_Cell (`liberado_evals`), Politica_Tier (`teto_tier`), NBA_Catalogo, Credencial | NBA_Propuesta, **min_calculo** (log), Liberacion_Lote, Decision_Trace, ROI_Operador |
| **P03 Goals & KPIs** | KPI, Named_Query, Evento_Priorizado_NBA, Pertenencia_Snapshot | KPI (clase=proceso), AccionSugerida, Edicion_Contexto; **tipo-A → NBA_Propuesta + min_calculo** (devuelve `decision_trace_id`) `[I]` subgrupo |
| **P04 Content Studio** | Cohort, Restaurante (ancla), Eval_Cell (calidad) | Content_Lote |
| **P05A Atención** | Restaurante (grounding), Cohort (percentil solo contexto), NBA_Propuesta, Politica_Tier (tenant×intent), Eval_Cell, Intent_Catalog | Conversa_Episodio, **min_calculo** (path conversa), Decision_Trace; **origina pedido a NBA**; write-back al Cerebro `[I]` catálogo A1-A8, `[I]` intent |
| **P05B Diagnóstico** | Conversa_Episodio (señal), **Orden** (población-de-verdad/pagos), Knowledge_Case, Processo_Critico | Problema_Diagnosticado, Afetado, Knowledge_Case (RL), `v_dossier_handoff` (contrato 11 campos declarado por C · §3.5) |
| **P05DE Dashboard de salud** (vitrina · §3.6) | **TODO read-only:** `KPI`/`Named_Query`, `ROI_Operador`, `Conversa_Episodio.capa_metricas`, `Salud_1a10`, `Pertenencia_Cohort_Snapshot`, `Problema_Diagnosticado`, `Afetado.silencioso`, `Artefacto_Generado`, `Eval_Cell` (bandas), `Config_Perillas` | — (solo su **config de layout**; **cero número nuevo**; muestra resultados YA computados §14 con sellos/estados conservadores, nunca verde-fake) |
| **P05C Generación de conocimiento** | `v_dossier_handoff` (dossier #8), `Knowledge_Case` (el "cómo"), `NBA_Catalogo` (lee, cerrado), `KPI`/`Named_Query`, `Cohort` (evidencia mercado k-anon cross-pool), `Politica_Tier`/`Eval_Cell`/`Credencial` (gates) | `Artefacto_Generado`, `Content_Lote` (email), `Knowledge_Case` (resoluciones nuevas, RL), `Politica_Tier` (borrador), `Ritual_Destino`; `min_calculo`+`Decision_Trace` (auto-pase) |
| **(narrado) P11 Salud 1:10** | KPI, ROI_Operador, Conversa_Episodio (métricas), Problema_Diagnosticado (libro-razón) | — (vista de lectura; ratio 1:10 + señales DERIVAN en vivo §3.4; solo Y1/Y2 = proyección narrada) |
| **(todas las pantallas)** | — | **Evento_Uso** (cada feature loguea su uso, append-only) |

---

## 6. Fixture único de escenario (la cascada `1 → 47 → R$X`)

Un **único seed** con **IDs compartidos entre las 6 specs** para que la cascada reconcilie punta a punta con la **misma `restaurante_id`** y la **misma `cohort_rule_version`**:

> **El seed puebla SOLO los brutos** (Orden, Conversa, golden-set, Knowledge_Case, config). Todo número-resultado (el 47, R$X, Eval verde, `min()`, 1:10) **emerge cuando el job/agente CORRE** — ver §14. Los pasos abajo describen **la corrida**, no lo que se graba a mano.

1. **1 Restaurante-tenant:** `'Pizzaria do Léo'`, `restaurante_id=R001`, `tier_base=long_tail`.
2. Entra en un **Processo_Critico** monitoreado = `'cobrança incorreta / pagos'` (`falha_silenciosa=true`, `fonte_verdade_ref` → `Orden` (pagos de R001)). El monitor proactivo dispara **1 Problema_Diagnosticado** (`tipo_area='promo-dark/cobrança'`, raíz anclada en 1 Knowledge_Case seed) **ANTES** de cualquier ticket.
3. El **caza-silenciosos (05B) CORRE el anti-join** `Orden(status_pago='fallido')` × reclamantes → **produce** las filas `Afetado` (el seed NO las inserta). Sobre los brutos semeados emergen **47** afectados — **35 silenciosos** (sin `Conversa_Episodio`) + 12 reclamantes; el flag `silencioso` **cae del cruce**, no se teclea. `impacto.restaurantes_afetados = count(Afetado)` y `rs_perdido = sum(Orden.valor_neto fallido)` (columnas generadas) → **R$X** emerge `[C]`, a defender en el 1:10. **Ningún número de este paso se graba en el seed.**
4. Se **CORRE el golden-set** de la `Eval_Cell` (`long_tail × 'cobrança'`): con más evidencia, `kappa`/`n_cohort_x_intent` cruzan el umbral y el `estado` pasa **rojo→verde** → `liberado_evals` **deriva** a `BAJA` (no se teclea). El **motor GENERA dos filas en `min_calculo`** (antes: evals rojo → fail-closed; después: `least(pedido_NBA, liberado_evals=BAJA, teto_tier)` ⇒ `nivel_efectivo=BAJA` ⇒ `auto_liberable`). El seed **no inserta** filas en `min_calculo` ni deja la Eval en 'verde'.
5. Una **Liberacion_Lote** sobre el cohort escribe **1 Decision_Trace** firmado (`proponente_id != confirmador_id`), citando `calculo_id` de la fila "después".
6. **1 Content_Lote** para los 35 silenciosos: el `estado` **deriva del check de grounding** (sin `grounding_ancla` ⇒ rojo, no publica; con ancla ⇒ aprobado). El seed no fija `estado='aprobado'` — cae del check fail-closed = freno visible.
7. El **`v_dossier_handoff`** agrega los 11 campos (47 afectados + 35 silenciosos + R$X + ruta-sugerida + provenance por campo).
8. El **agente 3A corre la `Named_Query`** de `'tickets/cobrança'` sobre `Conversa_Episodio`/`Orden` → `KPI.valor_hoy` **se computa** y cae bajo target → dispara **AccionSugerida tipo-A** (mismo `nba_id`/`cohort_id`/`intent`). El seed **no graba** `valor_hoy` bajo-target.
9. **Salud_1a10** (narrado) cuenta valor SOLO tras las 2 compuertas (X=absorción provisional; crédito solo con `signal_de_resultado` verde-sostenido D días).

Todos los IDs (`R001`, `cohort_id`, `eval_cell_id`, `nba_id`, `problema_id`) se comparten en el mismo fixture.

> **`R001` = caso-ancla controlado** (ensayo reproducible / ronda guionada). En el panel **en vivo**, cada persona que se registra recibe una **instancia sorteada** por el generador (§12): mismos invariantes, **números distintos**. La cascada reconcilia por construcción en ambos casos (`47 = count(Afetado)`, `R$ = sum(Orden)`).

---

## 7. Hard-nos como constraints de datos

| Hard-no | Materialización en el modelo |
|---|---|
| **FAIL-CLOSED** (regla-madre) | `nivel_autonomia` ENUM ordenado + CHECK `nivel_efectivo = least(...)`; brazo null → menor conocido; empate/indeterminación → **mínima autonomía** (`nivel_efectivo=BAJA`) o degrade-to-human. Toda falla degrada a humano. |
| **CROSS-TENANT (= cross-POOL)** | **RLS** Postgres: `WHERE tenant_id = current_pool()` (tenant = operador/pool, NO restaurante). Cruzar restaurantes **DENTRO** del pool es permitido (es el caza-silenciosos). Lo que ABORTA + bloqueo rojo + log seguridad alta es una agregación que toca **>1 `tenant_id` (pool)**. `tenant_id` resuelto **server-side de la credencial** (anti-spoofing, nunca del cuerpo). |
| **CROSS-TENANT (zona cohort)** | NO hay `restaurante_id` (es agregada por definición). Gate = **k-anon** `n_cuentas >= k_anon_threshold` (CHECK) + flag `supresion_k_aplicada` en la frontera de salida. Dos mecanismos, no uno. |
| **DATO de cliente vs CONOCIMIENTO de empresa (2 niveles)** `[V]` (Leo 2026-06-17) | El aislamiento por pool protege el **DATO CRUDO/identificable** del cliente (RLS + k-anon). El **CONOCIMIENTO VALIDADO** (patrón/política/solución comprobada: `Knowledge_Case` revisado, `Politica_Tier` firmada) es **de la EMPRESA y FLUYE entre pools** — es la palanca de ESCALA (reusar éxito, no repetir error ajeno). **DENTRO de la empresa: trazabilidad TOTAL** (quién hizo qué + resultado, para rever el paso a paso); **NO** se anonimiza internamente. La IA solo nombra "quién" **HACIA AFUERA** con validación humana; anonimizar hacia afuera = responsabilidad del empleado. Portón = estado "verificado y validado" (`Knowledge_Case.flag: no-reforzado → revisado`). Ver §8. |
| **GROUNDING obligatorio** | `Content_Lote.grounding_ancla` FK NOT NULL → Restaurante; sin ancla ⇒ `estado=rojo`, no publica. `min_calculo.eval_cell_ref`/`policy_id` prueban de qué célula/política vino cada brazo. |
| **k-anonymity (N≥k)** vs **n_min (≥20)** | **DOS** constraints SEPARADAS. `k_anon_threshold` (re-identificación → suprime insight en la salida cross-tenant). `n_min_threshold=20` (significancia → colapsa célula: `n_min_ok=false`, modo cualitativo). Diagnóstico (05B) es INTERNO: resuelve n=1 sin suprimir; k solo en salida cross-tenant. |
| **PII redactada E2E** | redacción ANTES de cómputo/almacenamiento. `Conversa_Episodio.capa_transcripcion` con PII redactada + retención limitada. PII residual ⇒ `v_dossier_handoff` no emite hasta sanear. |
| **TEXTO-DEL-CLIENTE = DATO, no instrucción** | `tratado_como_dato=true` sellado en turnos; OCR/VLM con data-fencing; inyección ⇒ `señal_inyeccion` logueada vs tenant, `min()` intacto. |
| **FINANCIERO nunca autónomo** | `clase_financiera=directa` ⇒ `risk_class=ALTO` ⇒ IA solo PROPONE (nunca auto-libera dinero). Anti-fraccionamiento: N micro-pedidos suman contra `umbral_antifrac` por restaurante en ventana. |
| **OVERRIDE solo baja (AUT-11)** | CHECK `Liberacion_Lote.nivel_resultante <= nivel_efectivo`. Subir autonomía solo vía Evals (humano+evidencia). Rebajar = automático (`guardrail_error` subiendo ⇒ rebaja sin exigir evidencia). |
| **4-OJOS / anti-rubber-stamp** | CHECK `confirmador_id IS NULL OR confirmador_id <> proponente_id` + `independencia_garantida` generada, en Decision_Trace, ROI_Operador, Edicion_Contexto. `rubber_stamp_flag = (tiempo_a_firma_seg<umbral AND origen='movil')`. |
| **SIN TRACE NO HAY ACCIÓN** | Decision_Trace append-only **precondición** (no efecto colateral); falla al escribir ⇒ acción no procede. |
| **TRES PUERTAS fail-closed** | gate-1 Credencial (rol por-tenant) → gate-2 Política → gate-3 `min()`. Credencial RESTRINGE, nunca amplía; divergencia ⇒ gana la política + alerta `policy_owner`. |
| **A=B / anti-mezcla de versiones** | `cohort_rule_version` y `kpi_def_version` estampados POR FILA; prohibido mezclar baselines de versiones distintas; KPI solo muestra número si `formula+periodicidad+group_by == def_version` citado. |
| **PROVENANCE por campo** | sin provenance no renderiza ni exporta; campo sin provenance = `[C]` no-confiable; `rs_perdido`/impacto heredan la **peor** provenance. |
| **VALOR = 2 compuertas** | solo cuenta si (A) confirmado+permanente Y (B) incremental vs contrafactual. funnel-correlacional NO declara "confirmado y atribuible". Falta A o B ⇒ 0. Y1/Y2 nunca se suman. |
| **RESULTADO siempre COMPUTADO, nunca semeado** (ver §14) | Todo dato-resultado (KPI, impacto, percentil, ratio 1:10, score, Eval-estado, contador) lo produce un **productor ejecutable nombrado** (Named_Query / job / columna-generada / agente-runtime) sobre brutos; el seed solo puebla brutos. `valor_hoy`/`metrica_verificacion`/`Named_Query` ⇒ Python/SQL, **nunca LLM**. **Resultado semeado = bug fatal.** Test: pre-corrida, toda columna-resultado = NULL. LeadingLink acíclico (ciclo ⇒ fail-closed). |

---

## 8. Dos zonas de aislamiento (síntesis del fix cross-tenant)

El cross-tenant **no es un mecanismo único**. El modelo lo separa en dos zonas con esquema físico distinto:

- **Zona `tenant` (RLS por `tenant_id`/pool):** `Restaurante, Orden, Evento_Uso, Conversa_Episodio, Problema_Diagnosticado, Afetado, Processo_Critico, KPI, Usuario, Credencial`. La frontera es el **operador/pool** (`tenant_id`); `restaurante_id` es dato visible dentro del pool (NOT NULL). Cruzar restaurantes dentro del pool es la operación normal (caza-silenciosos); el RLS solo corta **entre pools**. Enforced por **Row-Level Security** real (fail-closed).
- **Zona `cohort` (k-anon):** `Cohort, Subgrupo, Eval_Cell, NBA_Propuesta, Liberacion_Lote, Content_Lote, min_calculo, Pertenencia_Snapshot, Evento_Priorizado_NBA`. Intrínsecamente agregadas; gate = `n_cuentas >= k`. La **única** liga a un restaurante concreto vive en `Pertenencia_Cohort_Snapshot`.

Tres niveles, sin contradicción: **pool** (`tenant_id`, frontera RLS) ⊃ **restaurante** (`restaurante_id`, dato visible dentro del pool, unidad de k-anon solo en salida cross-pool) ⊃ datos; y la zona **cohort** agrega N restaurantes con gate `n_cuentas >= k`. El caza-silenciosos cruza restaurantes dentro del pool sin restricción; k-anon y RLS solo actúan en fronteras de salida.

> **Tercer eje — ortogonal a las dos zonas: DATO vs CONOCIMIENTO `[V]` (Leo 2026-06-17).** Las dos zonas aíslan **DATOS**. El **CONOCIMIENTO VALIDADO no es un dato de pool**: es activo de la **EMPRESA** y cruza pools por diseño (`Knowledge_Case` revisado, `Politica_Tier` firmada, patrones de resolución). Reusar conocimiento validado cross-pool **es la palanca de ESCALA** (escalar éxitos, no repetir errores ya cometidos por otros). El **portón** es el estado "verificado y validado" (`Knowledge_Case.flag: no-reforzado → revisado`): crudo/no-validado = preso al pool; validado = de la empresa. **Internamente, trazabilidad total** (quién/qué/resultado, para rever el paso a paso); la **anonimización solo aplica a la SALIDA externa**, con validación humana (responsabilidad del empleado). **Afecta `05C`:** el `reuse_count` de `Artefacto_Generado`/`Knowledge_Case` cross-pool es **legítimo** y es, de hecho, la métrica de escala de la empresa (eje "inteligencia generada" del D+E, §3.6). El guardrail que queda: una narrativa/artefacto **hacia afuera** nunca expone dato crudo de OTRO cliente sin validación humana.

---

## 9. Lo que se cortó (Karpathy) + Open questions

**Cambios estructurales (fix Leo — tablas gordas-por-proceso):**

- `FuenteVerdad` (catch-all genérico de procesos distintos) → **dividida en `Orden`** (negocio: pagos/campañas) **+ `Evento_Uso`** (uso/logs de features); `tickets` ya eran `Conversa_Episodio`. Regla: datos del mismo proceso = una tabla gorda, no un catch-all ni decenas de tablitas.

**Cortado / fundido (no es tabla en el demo):**

- `VISTA_DINERO_LINK`, `VISTA_TICKETS_LINK`, `COHORT_INFO`, `SIMULACION` (01) → UI/views read-only, no entidades.
- `UPSIDE`, `PERFIL_COHORT` (01) → campos/derivados de `baseline_descriptivo`; la **regla** de dos baselines (BR-17) es constraint, no tabla.
- `MOVIMIENTO_LOG` + `TRANSICION_DE_COHORT` (01) → `delta_status` dentro de `Evento_Priorizado_NBA`.
- `Red_Team_Set` (00) → flags en `Eval_Cell`.
- `PerformanceFeed`, `OrgGraph` (03) → campos de `KPI` y `Usuario`.
- `DocCanonicoKPI` (03) → catálogo `Named_Query`.
- `ISSUE_TREE`, `IMPACTO`, `CASO_REPO` (05B) → `jsonb` en `Problema_Diagnosticado`. (`Afetado` SÍ queda tabla: es la fuente-única del 47/35.)
- `Hipotesis/PlanDeAccion/ItemPlan` (03) → `jsonb workbench` en `AccionSugerida`.
- `TURNO` (05A) → array `jsonb` en `Conversa_Episodio`.
- `señal_inyeccion`, `PAQUETE_ESCALACION`, `contador_1:10`, `documento_de_tono`, `correccion_humana` (05A) → campos/derivados/drop-RH.
- `scope_owner_ref` (01) → objeto embebido.
- **`Salud_1a10`** y **`Dossier_Handoff`** → **vistas/derivados** (§3.4), no tablas: en `Salud_1a10` el ratio 1:10 + 10 señales **DERIVAN en vivo** (de KPI/ROI/Conversa); solo lo longitudinal (Y1/Y2, curva €3→€1) = proyección-narrada-NO-numérica. El dossier es agregación pura sin dato propio hasta que Feature C declare el contrato.
- **Stack:** data-lake, event-sourcing, microservicios.

**Decisiones donde se contuvo a Karpathy (se mantuvo tabla a pesar de la presión de fundir):**

- `min_calculo` se mantiene como **log append-only** (no solo vista): el Decision_Trace tiene que apuntar a la evaluación exacta firmada, y la transición rojo→verde necesita el antes/después. La **lectura** sí es vista (`v_min_calculo`).
- `Cohort_Rule_Version` se mantiene como **catálogo fino** (no varchar suelto): aunque el demo corre 1 versión, el estampado POR FILA + el seed del changelog son baratos y la constraint A=B necesita la referencia.
- `ROI_Operador`, `Credencial`, `Edicion_Contexto`: caminos diferidos/drop-RH, pero se mantienen como tablas finas porque el demo SÍ escribe `Decision_Trace`/`Liberacion_Lote` y la auditoría 4-ojos necesita el espejo. Schema mínimo, sin gold-plating.

**Open questions `[I]` (necesitan una fuente única — `Config_Perillas` resuelve los valores):**

1. **Granularidad tenant — RESUELTA `[V]` (Leo 2026-06-16):** tenant = **operador/pool** que gobierna N restaurantes; `tenant_id` es el padre y la frontera RLS, `restaurante_id` la unidad de dato visible al pool. El restaurante NO es caja-fuerte. (Cerró el bug RLS×caza-silenciosos; ver §3.1 Nota.)
2. **Valores de placeholders `[C]`:** `k`, `n_min(=20?)`, `TTL_baseline`, `D`, `umbral_antifrac`, `lock_TTL`, `retención_PII`, `costo_por_respuesta`, `tolerancia_doublecheck` — viven en `Config_Perillas`, falta ratificar.
3. **Red de fuentes-de-verdad (S1):** RESUELTA → `Orden` (pagos/campañas) + `Evento_Uso` (logs). En dominio real = ingesta read-only por-tenant; en demo = generador (§12). Falta ratificar el conector de ingesta real.
4. **Contrato 11 campos `v_dossier_handoff` ↔ Feature C — RESUELTA `[V]` (2026-06-16):** Feature C specada (`05C`) y cosida (§3.5); los 11 campos declarados allí. Firme.
5. **Catálogo exacto A1-A8:** los 8 códigos de `NBA_Catalogo` deben enumerarse de verdad (vive en P02, no specada aquí); fixture mapea 'corrigir-callado' → A3 provisionalmente.
6. **`subgrupo` (nivel 2):** modelado como tabla `Subgrupo`; ratificar si P02/P03 consumen subgrupo o solo cohort.
7. **`cliente_id` vs `restaurante_id`:** ¿"cliente" = persona del restaurante (⊂ restaurante) o consumidor final de Uber Eats (un nivel más)? Confirmar con Leo.
8. **Dueño del cierre/crédito final:** 05A dice cierre=P3; 05B dice B NO cierra; 02 dice ROI solo cuenta confirmado. Modelado `Salud_1a10` como punto único de crédito; ratificar que P3/P11 son la misma autoridad.
9. **Método feature-attribution + umbral at_risk/pre-churn:** marcados needs-prototype en 01; no decididos.

---

## 10. Action items (checklist para el build)

**Bloqueantes antes del seed (severidad alta):**

- [ ] `CREATE TYPE nivel_autonomia AS ENUM ('BAJA','MEDIA','ALTA');` y usarlo en los 5 campos de nivel.
- [ ] Crear catálogos `Intent_Catalog`, `NBA_Catalogo` (8 placeholders A1-A8 + no-act), `Named_Query`, `Config_Perillas`.
- [ ] `Eval_Cell`: PK surrogate `eval_cell_id` + `UNIQUE(cohort_id,intent,version)`; todas las FK apuntan a `eval_cell_id`; `intent` → `Intent_Catalog`.
- [ ] `min_calculo` como log: PK `calculo_id`, `nba_id` XOR `conversa_id`, FKs `eval_cell_ref`/`policy_id`, copia inmutable de los 3 valores, CHECK `least()`, append-only.
- [ ] Quitar `restaurante_id` de `Cohort` y zona-cohort; mover la liga a `Pertenencia_Cohort_Snapshot`. Crear schemas `tenant`/`cohort`/`gov`/`catalog` y **RLS** en `tenant`.
- [ ] `Problema_Diagnosticado.impacto.restaurantes_afetados`: columna generada / trigger = `count(Afetado WHERE problema_id=X)`; `rs_perdido` derivado con herencia de peor provenance.
- [ ] Subir `cohort_id` y `nba_usada` a columnas top-level FK-ables en `Conversa_Episodio`. Modelar `Subgrupo` como tabla.
- [ ] **DDL de `Orden` y `Evento_Uso`** (tablas gordas-por-proceso); eliminar `FuenteVerdad`; re-apuntar FKs `Afetado.evidencia` y `Processo_Critico.fonte_verdade_ref` → `Orden`.

**Importantes (severidad media):**

- [ ] `Politica_Tier.nacida_de_trace` NULLABLE; orden de seed: política-raíz (NULL) → trace. `Decision_Trace.policy_version` NOT NULL.
- [ ] CHECK 4-ojos + `independencia_garantida` + `rubber_stamp_flag` (generadas) en Decision_Trace, ROI_Operador, Edicion_Contexto.
- [ ] Índices: `Pertenencia(cohort_id,semana)` y `(restaurante_id,semana)`; `KPI(tenant_id,nivel,dueno_id)` y `(parent_kpi_id)`; `Afetado(problema_id) WHERE silencioso=true` (parcial); `Decision_Trace(liberacion_id)` y `(confirmador_id)`; `Conversa_Episodio(restaurante_id)`,`(cohort_id)`; **`Orden(restaurante_id,fecha)` + parcial `WHERE status_pago='fallido'`**; **`Evento_Uso(restaurante_id,ts)`,`(feature,ts)`**.
- [ ] **Particionar `Orden`** (por mes) y **`Evento_Uso`** (por fecha); retención por ventana en `Evento_Uso`.
- [ ] Convención de nombres en columnas: `n_min_threshold` vs `k_anon_threshold`; `cohort_rule_version`/`kpi_def_version`/`policy_version`/`credential_policy_pin` con comentario por columna.

**Seed del fixture único:**

- [ ] Semear **SOLO brutos** (§14, lista cerrada): `R001 + ~50 restaurantes (fecha_alta+config) + Orden (con %fallido) + Conversa crudas + golden-set Eval (casos, SIN estado) + Knowledge_Case (padrão/resolucao) + Politica_Tier (.md) + Config_Perillas`, IDs compartidos. **NO semear:** Afetado, Eval.estado, `min_calculo`, KPI.valor_hoy, percentil, baselines, ni ningún resultado.
- [ ] **Correr los productores** que generan los resultados: caza-silenciosos 05B (→Afetado/47), golden-set Eval (→rojo→verde), motor `min()` (→filas), agente 3A (→KPI.valor_hoy), job percentil P01 (→percentil/baselines/gap).
- [ ] **Assert anti-fake automatizado (CI):** un test que corre tras el seed y ANTES de los productores y **FALLA el build** si alguna columna-resultado ≠ NULL/estado-conservador. Convierte el invariante §14 en enforcement mecánico, no solo documental (el único punto que faltaba para blindaje 10/10).
- [ ] Vistas `v_min_calculo`, `v_dossier_handoff`, `Salud_1a10` (lectura).
- [ ] Jobs Python batch: segmentación/percentil (P01), agente de medición KPI (P03), double-check de impacto (P05B).

**Generador de datos de demo (§12):**

- [ ] Generador parametrizado con **semente por instancia** (`user_id`+timestamp) → datasets **distintos** por persona; determinista solo dentro de una instancia.
- [ ] La cascada **deriva** (`47=count(Afetado)`, `R$=sum(Orden fallido)`) para cualquier instancia sorteada → resultados siempre correctos.
- [ ] Rangos de variación en `Config_Perillas` (nº restaurantes, nº órdenes, % pago-fallido, % silenciosos) `[C]`.

---

## 11. Performance (criterio de diseño — porque es real, no mock)

Las queries de la demo corren **en vivo**; cada una tiene que ser rápida con la estructura propuesta. Regla: **join ≤ 2-3 niveles**, desnormalización consciente donde ayuda (el snapshot semanal ya lo es).

| Query caliente (demo) | Cómo se mantiene rápida |
|---|---|
| **Cascada `1 → 47 → R$X`** (caza-silenciosos) | Anti-join `Orden (status_pago='fallido')` × reclamantes (`Afetado.reclamou`), filtrado por `restaurante_id` (RLS) + **índice parcial** `WHERE status_pago='fallido'`. No barre toda la población. |
| **`min()` vigente** | Vista `v_min_calculo` = `least()` sobre 3 columnas + 2 JOINs (Eval_Cell, Politica_Tier) por PK (`eval_cell_id`/`policy_id`). 2 joins, no más. |
| **Contador 1:10** | Agregación sobre `Conversa_Episodio.capa_metricas` (absorbido/escalado) por ventana; índice `(restaurante_id)`. |
| **Percentil semanal por cohort** | **Pre-computado** por job batch en `Pertenencia_Cohort_Snapshot` (desnormalizado, serie semanal) — la pantalla **lee**, no rankea en vivo. |

**Principios:**
- **Datos brutos gordos, append-only, particionados** (`Orden` por mes, `Evento_Uso` por fecha) → escanea solo la partición relevante.
- **Números derivados materializados** donde se leen mucho: `impacto.restaurantes_afetados` = columna generada / trigger sobre `Afetado` (no recomputa en cada lectura).
- **Lo pesado corre en batch, no en request:** segmentación, percentil y double-check de impacto son jobs Python; las pantallas leen el resultado.
- **El `[C]`/mock no exime de performance:** el esquema es el real; un dataset generado grande tiene que correr igual de rápido — es lo que prueba que no es un juguete.

---

## 12. Generador de datos de demo (registro → instancia jugable)

**Decisión: generador PROGRAMÁTICO, no seed a mano.** En el panel, una persona de la audiencia se registra e **itera en vivo**; necesita un dataset propio, correcto y **distinto** del de cualquier otra persona.

**Mecanismo:**

1. **Semente por instancia** = `hash(user_id + timestamp_registro)`. → 2 personas **nunca** reciben el mismo set (requisito del operador). Determinista **solo dentro** de una instancia (la semente reproduce esa sesión para debug), **nunca entre instancias**.
2. **Sortea los datos brutos** dentro de rangos plausibles (en `Config_Perillas`, `[C]` ajustables): nº de restaurantes, nº de `Orden` por restaurante, `%` de pago-fallido, `%` de afectados que reclamó, distribución por zona/tipo.
3. **Los números de la cascada DERIVAN** de los datos brutos — no se fijan: `afetados = count(Orden fallida del patrón)`, `silenciosos = afetados sin Conversa`, `R$ = sum(Orden.valor_neto fallido)`. → **reconcilian por construcción → siempre correctos**, sea cual sea el sorteo. Es lo que da "resultados correctos" sin fijar el número.
4. **Aislamiento:** cada instancia es un tenant propio (RLS) — una persona no ve datos de otra.
5. **Invariantes constantes** (NO varían entre instancias): el mecanismo del `min()`, los hard-nos (cross-tenant, k-anon, fail-closed) y la transición Eval rojo→verde del acto 4. Varían los **números**, no las **reglas**.

**Rangos de variación `[C]` — confirmados por Leo (2026-06-16)** (verosímiles para Uber Eats):

| Perilla | Rango propuesto `[C]` |
|---|---|
| nº restaurantes / instancia | 30 – 120 |
| órdenes / restaurante (ventana) | 200 – 2.000 |
| `%` pago-fallido (genera el problema) | 2 – 8 % |
| nº afectados del patrón | 20 – 90 |
| `%` silenciosos (de los afectados) | 60 – 80 % |
| **`%` managed vs long_tail** (split **Y** → `Restaurante.segmento`) | **~5 % / ~95 %** `[V]` vivido Leo |
| **`%` escalado a humano** (**N%** → `Conversa_Episodio.estado=escalada` / `capa_metricas.escalado`) | **12 – 15 %** `[C]`←`[I]` |
| **AHT de toque humano-solo** (deriva el delta 1:10) | **5 min** `[V]` (ajuste Leo) |
| **SLA objetivo managed** (**Z** · invariante, NO sorteado) | **≤ 24 h** `[V]` |

> **El número 1:10 DERIVA, no se fija (igual que `47 = count(Afetado)`):** el **contador 1:10** y `ROI_Operador.ratio_1_10` se computan de `%`escalado (N%) y del toque-por-ticket sobre `Conversa_Episodio.capa_metricas` (absorbido/escalado) — **no** se hard-codean. El **X = 300/día** es la escala-narrativa de *equipo-de-10*; la instancia jugable (30–120 restaurantes) produce una **rebanada proporcional** donde el ratio (N%, split Y, ~7× de toque) **se mantiene por construcción**. Así reconcilia en cualquier sorteo, como la cascada.

> El caso-ancla `R001` (§6) es una instancia con **semente fija** — para ensayar la ronda guionada. El panel en vivo usa **instancias sorteadas** por registro.
> **Nota de build:** este generador multi-instancia es **Fase 2** (§13). La Fase 1 (la espina del demo) corre sobre `R001` **semeado a mano**; el generador es upside, no requisito del demo mínimo.

---

## 13. Orden de producción (build vertical-slice)

> **Governing thought:** construir **de dentro hacia fuera y de abajo hacia arriba** — la espina vertical CORRIENDO primero (de-risquea el demo desde el día 1), las features por encima en **lotes verticales verificados** (nunca big-bang). Las 6 specs + este doc **ya son el combustible** del code-agent; el cuello de botella ahora es BUILD, no spec. Regla-madre: *si no corre en vivo, no cuenta* (el brief juzga "working", no specs).

### Fases (cada una avanza solo con su GATE en verde)

**FASE 0 — Trabar decisiones (de-risquea todo · ~0 código)**
- Schema trabado: ENUM `nivel_autonomia`; aislamiento por **pool/operador** (`tenant_id`), no restaurante (§3.1); nombres canónicos (`Orden`/`Evento_Uso`/…).
- ✅ **Número 1:10 CERRADO (2026-06-16)** — fijado y defendible; alimenta el seed (detalle + 3 alternativas por número + fuentes en `00_vision §5` y `_design_B_office_hours §Prueba 1:10`):
  - **X ≈ 300 tickets/día** (equipo de 10) = 30 tickets/agente·día (benchmark IA-asistido) × 10; rango de defensa 210–500 según complejidad. `[C]`←`[I]`
  - **Y ≈ 1.500–2.500 relaciones** (equipo de 10) = 10 × 144–250 cuentas/CSM (benchmark **SMB tech-touch**); split **5% managed / 95% long-tail**, nunca sumados; bind a `Restaurante.segmento`. Origen del split vivido (250/5.000 = 5%); el 250 = tope banda SMB tech-touch, **NO** enterprise high-touch (22). `[C]`←`[I]` + split `[V]`
  - **Z = ≤24h managed** · long-tail: respuesta en minutos **con** calidad (la IA rompe el trade-off vivido). `[V]`
  - **N% = 12–15% hoy → meta ~7%** (IA + Knowledge Base); bind a `Conversa_Episodio.estado=escalada` / `capa_metricas.escalado`. `[C]`←`[I]`
  - **Delta solo-vs-IA:** 300 tickets × **5 min** de toque = **~25 h-persona (≈10 personas)** → con IA ≈ **3,4 h (1 persona)**; AHT efectivo 5 min → ~0,7 min/ticket (**~7×**). Alimenta `ROI_Operador.ratio_1_10` + `Salud_1a10` (Y1/Y2 separados).
  - **Honestidad (dos capas distintas — corrección Leo):** el **número baseline del equipo-de-10 = BENCHMARK `[I]`** (mercado hoy: X tickets/día, N%, AHT) — NO se deriva del 5.000/2 de Leo. **Lo vivido (5.000/2 = 250 managed 1:1 + 1 persona de contenido escalable) = PRUEBA-DE-CAPACIDAD `[V]` separada** (de ahí el origen del split 250/5.000 = 5%; Z=24h y AHT-toque = anclas de servicio). El valor final en UI = `[C/escenario]` que **deriva** del seed (§12), no se fija.
- Stack mínimo de pie (Postgres o SQLite + runner de queries).
- **GATE 0:** schema de las 8 tablas ✅ + número 1:10 ✅ decididos por escrito. *(Era el único "spec" que faltaba — DECISIÓN, no doc nuevo. **Cerrado.**)*

**FASE 1 — La espina vertical CORRIENDO (camino crítico = demo mínimo viable)**
Orden interno (cada paso desbloquea el siguiente):
1. **Seed a mano** (`R001` + pool de ~50 restaurantes) — datos brutos coherentes, determinista. (NO el generador multi-instancia.)
2. **8 tablas (DDL):** `Restaurante` · `Orden` · `Conversa_Episodio` · `Problema_Diagnosticado` · `Afetado` · `Eval_Cell` · `min_calculo` · `NBA_Propuesta` (+ catálogo mínimo `Config_Perillas`).
3. **Query de la cascada `1→47→R$X`** — caza-silenciosos (anti-join `Orden` fallido × reclamantes); números **derivan** (`count`/`sum`).
4. **`min()` + Eval rojo→verde + fail-closed** — el motor barrando/liberando 1 caso.
5. **Contador 1:10** — derivado de lo que la rebanada procesó.
6. **UI mínima del loop** — la pantalla que el panel ve: registrar → cascada → min() → número.
- **GATE 1:** el loop corre end-to-end AO VIVO, del registro al número, sin trabarse. **Si el tiempo se acaba aquí, igual gana el panel.**

**FASE 2 — Engordar en lotes (no-limitada · solo con Fase 1 en verde)**
- Las otras ~17 tablas/features entran en **lotes verticales**, cada uno codado por el code-agent usando las specs YA listas + la fundación verificada, y **verificado antes del siguiente**:
  - Lote A — Cohorts Explorer · Lote B — Goals & KPIs scorecard · Lote C — Content Studio / Managed / resto · **Lote D — Feature C** (generación de conocimiento: `Artefacto_Generado` + `Ritual_Destino` + contrato dossier · §3.5; consume la espina Problema/Afetado/`v_dossier_handoff` ya corriendo) · **Lote E — D+E** (dashboard de salud · `05DE`/§3.6: VITRINA read-only, cero entidad nueva salvo config de layout; consume resultados YA computados; superficie humana del invariante §14; mínimo-demo = veredicto + 2-curvas costo↓/inteligencia↑ + sellos + silenciosos).
- **GATE por lote:** corre + no rompe lo que ya corría.
- **Roadmap explícito (NO build esta semana):** RLS real (en Fase 1/2 = `WHERE tenant_id` en el app), particionamiento, índices parciales, **generador multi-instancia (§12)**, catálogo A1–A8 completo, Política/Credencial/ROI completos.

### Reglas transversales (de-risk)
- **Vertical-slice, nunca big-bang** — aísla los bugs de integración (donde de verdad viven).
- **Gate en verde antes de avanzar** — cada fase entrega algo que corre.
- **Live / Concept / Roadmap rotulado en pantalla** — la honestidad es punto de juicio, no descuento.
- **La Fase 1 es auto-suficiente como demo** — la plataforma completa es upside, no requisito.

### Key Assumptions Check (SAT — por qué esta orden)
| Premisa de la orden | Estado |
|---|---|
| El code-agent genera mejor sobre fundación verificada (vertical) que big-bang sobre papel | **SÓLIDA** |
| La espina de 8 tablas prueba la tesis 1:10 sola | **SÓLIDA** (el loop cierra) |
| El número 1:10 es derivable del seed | **SÓLIDA** si el seed se diseña para eso (Fase 0) |
| "Sobra tiempo" para las 17 | **FRÁGIL** → por eso la Fase 1 debe ser demo-completo, no medio-loop |

### What-If (riesgos que la orden mitiga)
- *¿Y si el build se rompe tarde?* → la espina corre en Fase 1 (temprano); queda buffer de debug.
- *¿Y si el 1:10 no cierra?* → cerrado en Fase 0, antes de cualquier DDL.
- *¿Y si el code-agent buggea las 17?* → lotes verticales aíslan; nunca debug de 25 tablas en vivo.

---

## 14. Dato bruto vs dato-RESULTADO — el invariante anti-fake `[V]` (Leo, 2026-06-16)

> **Regla-madre:** un dato que es **RESULTADO de un proceso** (KPI, impacto R$, percentil, ratio 1:10, score, estado Eval, contador, before/after realizado, churn-risk) **NUNCA se semea ni se hard-codea** — siempre lo **COMPUTA un productor ejecutable nombrado** sobre datos brutos, al correr. El seed/generador puebla **solo brutos**. **Resultado semeado = bug fatal**: si el número ya está en la tabla, no se prueba que el agente funciona — que es justo lo que el panel evalúa.
>
> **DEFAULT FAIL-CLOSED (cierra toda omisión):** la lista de BRUTO de abajo es **exhaustiva y cerrada**. **Todo campo NO listado explícitamente como bruto = RESULTADO por defecto** (vacío pre-corrida), aunque no aparezca en la tabla de clases. Omitir un campo ⇒ se vuelve computado, jamás semeable. (Mismo fail-closed del motor: ante duda, lo conservador.)

**Qué es BRUTO (lista CERRADA — el seed/generador SÍ puebla, y SOLO esto):** `Orden` (valor_bruto, fee, status_pago, fecha, zona, tipo_comida) · `Conversa_Episodio` (transcripción/turnos crudos — **sin** estado-escalado ni métricas) · `Restaurante` (**solo** fecha_alta + config: fuso, ventana, conexión, tier — **NO** recurrencia/cross_sell, que se computan de Orden) · golden-set de `Eval_Cell` (casos crudos — **NO** estado/kappa/n) · `Politica_Tier` (**solo** el .md: teto_tier, permitido_hoy, regra_cross_tenant, como_se_mide — **NO** resultado_medido) · `Knowledge_Case` (**solo** padrão/resolucao/caminho/links — **NO** probabilidad/custo_resolver_historico, que son agregados) · `Processo_Critico` (**solo** nome/schedule — **NO** score_impacto) · `Config_Perillas` (umbrales). Son **inputs del mundo**, no salidas nuestras.

**Qué es RESULTADO (NULL/vacío hasta que el productor corre) — los ~55 campos auditados, por clase:**

| Clase de resultado | Campos (ejemplos) | Productor ejecutable |
|---|---|---|
| Aritmética de fila | `Orden.valor_neto`, `Restaurante.tenure_actual` | **columna `GENERATED`** (bruto−fee; hoy−fecha_alta) |
| Conteo / agregación | `impacto.restaurantes_afetados`(=47), `Cohort.n_cuentas`, `capa_metricas.n_turnos`, `Problema.frecuencia`, `Eval.n_cohort_x_intent`, `Artefacto.reuse_count` | **`count()`/`sum()`** — columna generada / trigger / on-read |
| Cruce / anti-join | el **conjunto** `Afetado` (los 47) + `silencioso`, `reclamou` | **agente caza-silenciosos (05B) CORRIENDO** — el seed NO inserta las 47 filas |
| KPI / dinero | `KPI.valor_hoy`, `impacto.rs_perdido`, `ordens_media`, `dias`, `custo_resolver`, `valor_ganho` | **`Named_Query` determinista (agente 3A / double-check P05B), nunca LLM** |
| Ranking | `percentil_en_cohort`, `gap_hasta_top`, `Processo.score_impacto` | **job batch P01 (Named_Query de ranking)** |
| Score de modelo | `churn_risk`, `at_risk`, `Restaurante.estado(at_risk)`, `Evento.delta_status` | **job pre-churn** (Open Question §9 ítem 9 — needs-prototype) — si el job NO existe, `v_dossier_handoff` **EXCLUYE el campo (fail-closed)**, no muestra `[C]` |
| Veredicto de calidad | `Eval.estado` (rojo/verde), `kappa`, `liberado_evals`, `redteam_resultado` | **correr el golden-set / red-team** — no teclear "verde"/"BAJA" |
| Motor de autonomía | `min_calculo.nivel_efectivo`, `auto_liberable` | **`least()` + AND-de-6 en runtime del motor** — el seed NO inserta filas en `min_calculo` |
| Estado de flujo | `Conversa.estado_conversa`(escalada), `Content_Lote.estado`, `Artefacto.estado` | **cae del flujo del agente** (min/grounding/gate) — nunca semeado |
| Atribución / valor | `ROI.ratio_1_10`, `es_atribuible`, `signal_de_resultado`, `Usuario.ROI_por_operador`, `NBA.impacto_realizado`, `AccionSugerida.acuracidad_feedback`, todo `Salud_1a10` | **job de atribución (2 compuertas) + ventana D días** — vacío hasta cumplir |
| Veredicto de diagnóstico | `issue_tree.resultado`, `Problema.confianza`/`raiz_hipotese`, `causa_hipótesis` (Problema y Conversa) | **orquestador 05B corriendo el árbol vs Knowledge_Case** (LLM propone; chequeo determinista marca resultado) — pre-corrida: paths con `resultado=abierto`, confianza NULL |
| Veredicto de gate/gobernanza | `Decision_Trace.gate_result`/`tiempo_a_firma_seg`, `Credencial.audit_divergencia`, `Politica_Tier.resultado_medido` | **motor 3-puertas en runtime + job de medición** — NULL pre-corrida; trace semeado con gates=pass = acción fakeada |

> **La tabla es ILUSTRATIVA, no exhaustiva** — por el DEFAULT fail-closed, todo campo-resultado no listado igual se computa: p.ej. `capa_metricas.{tokens, n_re_contactos, esfuerzo_cliente, csat}`, `Cohort.baseline_descriptivo`/`baseline_atribucion_segmento` (job P01 sobre las cuentas de la celda), flags derivados de conteo (`colapsada`, `n_min_ok`, `modo`), `Knowledge_Case.probabilidad`/`custo_resolver_historico` (agregados RL). Y `before_after_esperado`/`impacto_estimado` (NBA) = **proyección-NO-medida**: etiqueta visible en UI (igual que Y1/Y2 de Salud_1a10), nunca un número que parezca medido.

**Test de verificación (el que prueba que NO es fake):** después de semear y **ANTES** de correr cualquier job/agente: escalares-resultado = **NULL**; estados-veredicto = su **valor conservador inicial** (`Eval.estado=rojo`, `Content.estado=rojo`, `min_calculo` = **sin filas**, autonomía = fail-closed) — **nunca** verde/aprobado/absorbido/escalada ni ningún número. El `47`, el R$X, el percentil, el ratio 1:10 **aparecen recién cuando el job/agente corre** sobre los brutos. Si un verde, un número o una fila de `min_calculo` existe sin que su productor haya corrido → **bug fatal**. (Generaliza lo que ya rige `impacto.restaurantes_afetados = count(Afetado)` a TODO resultado.)

**Por qué importa (el operador):** *"si el agente solo lee el resultado fakeado y no corre para generarlo, nunca vamos a saber si funciona de verdad."* El demo prueba el agente justamente porque el número **nace de la corrida**, no del seed.
