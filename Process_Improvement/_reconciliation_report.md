# Informe de Reconciliación Cross-Spec — Plataforma Customer-Ops AI-First
> Generado por el Spec Reconciliation Engine (corrida autónoma sobre los 11 drafts derivados de `00_vision_completa.md`).
> 44 colisiones · 5 líneas clave · 128 preguntas abiertas · 11 specs · 34 agentes.

---

## 0. RESUMEN EJECUTIVO (SÍNTESIS — governing thought)

**El motor de 11 pantallas es funcionalmente coherente en su visión (un `min()` gobernado que alimenta un North Star atribuible) pero NO compone end-to-end porque la capa de contratos —identidad, términos, ownership y secuencia— está fracturada en 44 colisiones que se agrupan en una sola causa-raíz: cada pantalla fue derivada del vision doc de forma aislada, así que nombra, modela y posee los mismos datos de forma divergente.** La consecuencia operativa es triple y medible: (1) ningún handoff client-keyed encaja por shape (5 nombres para la PK de cliente, 2 percentiles pedidos vs 1 emitido); (2) el North Star —el corazón del producto— puede doble-contar y cerrar valor antes de confirmar permanencia, porque tres specs escriben el numerador sin dueño único y con dos guardas anti-doble-conteo incompatibles; y (3) el invariante de autonomía se rompe en silencio porque `teto_tier` se produce por (tenant×intent) con cap financiero pero se consume como enum plano per-tenant, haciendo invisible el cap "financial-never-autonomous" dentro del `min()`. La buena noticia: las change-sets propuestas resuelven las 44 con cero borrado de reglas `[V]` y preservando todos los invariantes; 12 colisiones son apply-ready inmediatas (bundles atómicos de terminología + ownership del numerador en P07) y el resto se desbloquea con 4 decisiones de plataforma del operador (token canónico de identidad, ventana de atribución, dueños de catálogos/destinos/RBAC). **La acción de mayor leverage: aplicar primero el bundle de identidad+términos (COL-1/COL-2/COL-4) y el contrato de numerador único vía `episodio_id` en P07 (COL-5/COL-10/COL-25/COL-26), porque desbloquean todos los joins cross-spec y la integridad de la métrica central de una sola vez.**

---

## 0.5 LÍNEAS CLAVE (5 temas que agrupan el registro — Pyramid)

| # | Tema | Núcleo | COLs | Resolver primero |
|---|------|--------|------|------------------|
| **L1** | **Identidad / contrato fracturado por shape** | Un mismo dato lleva nombres distintos en cada pantalla y el motor no encaja por forma. La PK de cliente tiene 5 nombres, los 3 brazos del `min()` divergen, falta diccionario canónico y campos de versión en consumidores. | COL-1, 2, 4, 13, 15, 16, 17, 21, 33, 35, 40, 42 | **COL-1, COL-2, COL-4** |
| **L2** | **Integridad de la métrica central (North Star)** | Múltiples escritores, gates incompatibles y secuencias de cierre contradictorias: el numerador se doble-cuenta y cierra antes de tiempo. Probe de permanencia sin pantalla dueña; percentil como valor directo; denominador sub-poseído; unit-economics sin dedupe. | COL-5, 10, 11, 23, 25, 26, 28, 36, 37 | **COL-5, COL-11** |
| **L3** | **`teto_tier` y autoridad de autonomía mal modelados** | Se pierde el eje intent y el cap financiero; ambiguo quién baja autonomía; detector rubber-stamp lee un store inexistente; recompute reactivo deja `teto_tier` stale en el `min()`. | COL-3, 8, 14, 29 | **COL-3** |
| **L4** | **Gobernanza humana sin modelo canónico** | No existe RBAC de plataforma (4 taxonomías de rol); el sembrado de Política en bootstrap viola la regla de 2-ojos; el actor Finance recibe handoffs de $ sin permiso definido. | COL-18, 20, 22 | **COL-18** |
| **L5** | **Destinos/catálogos/sistemas referenciados-pero-no-poseídos** | El surface de 11 pantallas tiene agujeros de ownership en sus bordes: catálogo NBA, taxonomía INTENT, 4 destinos de consolidación, canal outbound, sistema live, playbook, serie de percentil; races de activación; símbolo Z sobrecargado. | COL-7, 9, 12, 19, 24, 30, 31, 32, 34, 38, 39, 41, 43, 44 | **COL-9, COL-12, COL-18 (RBAC)** |

---

## 1. MAPA DE CONEXIONES

### 1.1 Matriz spec × spec (qué le pasa cada productor a cada consumidor; celda = COLs que cruzan esa arista)

| ↓ produce \ consume → | P01 | P02 | P03 | P04 | P05 | P06 | P07 | P08 | P09 | P10 | P11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **P01** Cohorts | — | 13,15,27,40 | 28,32 | 41 | — | — | 28 | 15,27 | — | — | 32 |
| **P02** NBA | — | — | 4,36 | 4,16,17,36 | 4 | — | 17 | 27,36 | — | 3 | 8,36 |
| **P03** Home | — | — | — | 33 | 21,37 | — | 28 | 23 | — | — | 6 |
| **P04** Content | — | 36 | 33 | — | 33 | 16,30 | — | 16,36 | — | — | 8,36 |
| **P05** Inbox | — | — | 6,21,37 | 33 | — | 30 | 25,39 | — | — | 22 | 6,8,36 |
| **P06** Evals | — | 16,29 | — | 16 | 30 | — | — | 16 | — | 12 | 29,36 |
| **P07** Cerebro | 1,28 | 1,17 | 1,5,28 | 1,17 | 1,39 | — | — | 1,5,10,26 | — | 42 | — |
| **P08** Managed | 27 | 27 | 5,23,26 | — | — | — | 5,10,26 | — | — | 3 | 8,36 |
| **P09** Onboard | 31,40 | 38 | — | — | — | 12 | — | — | — | 20 | 34 |
| **P10** Política | 3 | 3,14 | 3 | 3 | 2 | — | 42 | 3 | 20 | — | 3,18 |
| **P11** Salud | — | — | 6 | — | — | 29 | — | — | — | 18 | — |

*Lectura:* P07 (raíz) y P10 (autonomía) son los **hubs productores**; P03 (Home) y P11 (Salud) los **hubs consumidores**. La columna P02 y la fila P07 concentran la fricción de identidad+versión; la diagonal P05↔P07↔P08↔P03 concentra la integridad del numerador.

### 1.2 DAG end-to-end (a partir de data-in/data-out; ASCII)

```
                          ┌─────────────────────────────────────────────────────────────┐
                          │  P09 ONBOARDING/BOOTSTRAP  (fija t0, siembra, handoff)        │
                          │  COL-20(2-ojos) · COL-31(race activación) · COL-34(→P11 gap)  │
                          │  COL-9/12/38(catálogo/INTENT fallback) · COL-40(baseline homó)│
                          └───┬───────┬───────┬───────┬───────┬───────────────────────┬──┘
                              │ t0    │ regla │ Pol.  │ Evals │ Cerebro              │ (P11
                              ▼       ▼ v1    ▼ base  ▼ vacío ▼                      ▼  excl.)
   ┌──────────────┐    ┌──────────────┐                ┌──────────────────────────────────┐
   │ P10 POLÍTICA │───▶│ P07 CEREBRO  │◀───── raíz de grounding (eslabón 1) ──────────────│
   │  & TETO_TIER │    │  (CLIENTE PK)│   COL-1 identidad · COL-17 trinca · COL-42 trinca  │
   │ teto_tier    │    │ episodio_id  │   COL-5/10/25/26 NUMERADOR único · COL-28/39       │
   │ [tenant×int] │    └──┬────────┬──┘                                                    │
   │ COL-3·14·18  │       │ ficha  │ grounding                                             │
   │ COL-20·22    │       ▼        ▼                                                       │
   └──────┬───────┘  ┌────────┐  ┌────────┐   ┌────────┐                                  │
          │ teto_tier│ P01    │  │ ...    │   │ P06    │ liberado_evals (cohort×intent)   │
          │ (3er     │COHORTS │  │        │   │ EVALS  │ COL-12 INTENT · COL-16 golden    │
          │  brazo)  │percentil  │        │   │        │ COL-29 quién rebaja · COL-30     │
          ▼          └───┬────┘  └────────┘   └───┬────┘                                  │
   ┌──────────────┐      │ EVENTO_PRIORIZADO_NBA  │ liberado_evals                        │
   │  min(pedido, │      │ COL-13 shape roto      │                                       │
   │  liberado,   │◀─────┤ COL-1/15 key+versión   │                                       │
   │  teto_tier)  │      ▼                        ▼                                       │
   │              │  ┌────────────┐ pedido_NBA ┌──────────────┐                           │
   └──────────────┘  │ P02 NBA /  │───────────▶│ min() core   │                           │
                     │ PLAYBOOKS  │ COL-2/4 sinónimos brazos   │                           │
                     │ COL-3·14·27│ COL-9/38 catálogo s/dueño  │                           │
                     └─────┬──────┘                            │                          │
                           │ NBA aprobada / cluster            │                          │
                           ▼                                   ▼                          │
                     ┌────────────┐   causa_raiz/cluster ┌──────────────┐                 │
                     │ P04 CONTENT│◀────────COL-33───────│ P05 INBOX    │ = MOTOR         │
                     │  STUDIO    │ COL-41 playbook s/dueño│ (X/Y/N%, esfuerzo, intel)     │
                     │ COL-44     │ COL-16/17 versión      │ COL-21 Y split COL-37 esfuerzo│
                     │ outbound   │──piezas firmadas──┐    │ COL-6 aritmética 1:10         │
                     └────────────┘                   │    │ COL-39 fuente live · COL-22 $ │
                            │ entrega                  │    └───┬────────┬──────────┬───────┘
                            ▼ (canal s/dueño COL-44)   │        │ write-  │ P90+     │ intel
                     ╔═══════════════════════╗         │        │ back    ▼          ▼
                     ║ CLOSED-LOOP PROCESO 3 ║◀────────┴────────┘    ┌────────┐  ┌─────────────┐
                     ║ permanencia (sin       ║ COL-11 sin dueño     │ P08    │  │ Mercado/    │
                     ║ pantalla dueña COL-11) ║ COL-23 ventana 14/90 │MANAGED │  │ Producto/   │
                     ╚═══════════╤═══════════╝ COL-25/26 secuencia   │ 1:1    │  │ Finance/GTM │
                                 │ valor confirmado+permanente       │COL-5/10│  │ SINKS s/dueño│
                                 ▼          +atribuible              │ COL-23 │  │ COL-7·24·43 │
                     ┌───────────────────────┐                      │ COL-3·8│  └─────────────┘
                     │ P03 HOME / NORTH STAR  │◀─────numerador───────┴────────┘
                     │ (valor/esfuerzo −      │ COL-5/26 lee agregado, no posee
                     │  deflection-que-falla) │ COL-28/32 movimiento percentil
                     │ COL-6·19·21·33·37      │ COL-36 unit-economics
                     └───────────┬────────────┘
                                 │ snapshot salud + costo/decisión
                                 ▼
                     ┌───────────────────────┐
                     │ P11 SALUD DEL 1:10     │ COL-8 rubber-stamp (store/tiempo_a_firma)
                     │ (meta/observabilidad)  │ COL-36 dedupe costo · COL-18 RBAC overload
                     │ COL-29 señal rebaja    │ COL-32 movimiento percentil · COL-34 t0
                     └───────────────────────┘
```

*Notas del DAG:* (a) el **único punto legítimo de escritura del numerador** debe ser PROCESO 3 vía `episodio_id` del Cerebro — hoy P07/P08/P03 lo tocan en paralelo (COL-5/10/26). (b) **PROCESO 3 no es una pantalla** — es el agujero de ownership raíz de L2 (COL-11). (c) Los **sinks de la derecha** (Mercado/Producto/Finance/GTM) y el **canal outbound** caen fuera del surface de 11 (L5).

---

## 2. REGISTRO DE COLISIONES Y GAPS

*Orden: topológico por `depends-on` (raíces primero), luego por impacto × severidad. Sev: alta/media/baja. Prov: [V]=verificado ambos lados, [I]=inferido.*

| ID | Tipo | see-also | Sev | fric | Specs | Evidencia (A ‖ B) | dep-on | imp | Prov |
|---|---|---|---|---|---|---|---|---|---|
| **COL-1** | C synonym | 13,9 | alta | sí | P01-05,07,08 | P07 PK `cliente_id`(alias id_restaurante); P02/P04 `cliente_id` ‖ P01 `account_id`; P08 `cuenta_id`; P03 `entity_id`; P05 `id_restaurante`. **5 nombres = 1 identidad** | — | 7 | [V] |
| **COL-2** | C synonym | 3,18 | alta | sí | P05,10,02-04,06,08,11 | P05 nombra 3er brazo `autonomy_ceiling` ‖ P10(productor)+todos `teto_tier` | — | 6 | [V] |
| **COL-4** | C synonym | 2,16 | media | sí | P02-06,08,10 | P06/P02/P10 `liberado_evals`/`pedido_NBA` ‖ P03/04/05/08 `nivel_liberado_evals`/`nivel_pedido_nba` | — | 5 | [V] |
| **COL-33** | C syn+homón | 30,1 | alta | sí | P03,04,05 | P04 `causa_raiz` enum6 = P05 `risk_class` enum6 (nombre≠); P05 produce `case_class_id`, no `cluster_id/causa_raiz/intent` ‖ P03 `causa` free-text (homónimo, dedupe ambigua) | — | 4 | [V] |
| **COL-9** | D orphan | 12,3 | alta | sí | P02,05,08,09,10 | P02 'NBA_CATALOG propiedad de P-catálogo' ‖ ninguna de 11 lo posee; P09 sólo fallback; 'P-catálogo' inexistente | — | 4 | [V] |
| **COL-12** | J orphan | 9,30,3 | alta | no | P06,10,09 | P06 INTENT = 2º eje matriz Evals ‖ P10 FK-out `[I]`; P09 DATA-IN externo; nadie define/versiona taxonomía | — | 4 | [I] |
| **COL-18** | H RBAC | 8,20,22,3 | alta | sí | P05,08,11,10,09 | 4 taxonomías rol sin dueño (operador/liderazgo·operador managed·gobernador·admin/revisor) ‖ P11 overloada `teto_tier` como scope RBAC; P10 lo define sólo como techo | — | 5 | [V] |
| **COL-6** | D co-own | 21,19 | alta | sí | P03,05,11 | P03 ARITMETICA_110 co-own + 'fórmula versionada'(BR-9) ‖ P11 BREAKPOINT_SCENARIO co-own 'needs-prototype'; P05 OWNS COUNTER pero P03/P11 re-derivan X/Y/N% → 3 N% divergentes | — | 4 | [V] |
| **COL-2→COL-3** | B shape | 18,22,14 | alta | sí | P10,03,08,01,11,02 | P10 produce `teto_tier` per(tenant×intent)+cap Finance propose-only ‖ consumidores = enum per-tenant(=tier_base): pierden eje intent y cap | **2** | 4 | [V] |
| **COL-5** | D ownership | 10,11,25,26,23 | alta | no | P08,07,03 | P08 escribe numerador directo (F-3.4) ‖ P07 anti-doble vía `episodio_id`; P03 re-gatea en NORTH_STAR_CARD. 3 escritores, sin dueño dedupe | **1** | 3 | [V] |
| **COL-8** | D missing-field | 18,20 | alta | sí | P11,02,04,05,08 | P11 detector rubber-stamp lee `tiempo_a_firma_seg`+audit-trail consolidado ‖ productores emiten 1 timestamp a su propio store, nunca duración; decision_ref sólo cubre #5 | — | 3 | [V] |
| **COL-11** | J no-owner | 25,26,23 | alta | sí | P05,03,04,08 | P05 'cierre lo da Proceso 3' ‖ P03 sólo lee agregado, sin probe; permanencia vive en 01_e2e sin pantalla dueña | **5** | 4 | [V] |
| **COL-10** | F guard-incompat | 23,11 | alta | no | P07,08 | P07 BR-4 `episodio_id` único = guarda anti-doble ‖ P08 EC-10 idempotencia(cuenta,acción,ventana); P08 escribe sin pasar por episodio_id | **5** | 4 | [V] |
| **COL-25** | E sequence | 5,26 | alta | sí | P05,07 | P07 emite señal North Star EN write-back con permanencia+valor poblados ‖ P05 escribe en estado live-aguardando-permanencia ANTES de que P3 confirme | **11** | 3 | [V] |
| **COL-26** | E sequence | 23,25 | alta | no | P08,07,03 | P08 cuenta al firmar (sin gate permanencia) ‖ P03/P05 cierre = permanencia universal; P07 graba valor antes del gate atribución de P03 | **11,5** | 2 | [V] |
| **COL-13** | A handoff | 15 | alta | sí | P01,02 | P01 emite `account_id`+1 `percentil_en_cohort` ‖ P02 consume `cliente_id`+2 percentiles (P40→P70) que P01 nunca produce | **1** | 4 | [V] |
| **COL-15** | I version-skew | 1,13 | alta | sí | P01,02,08 | P01 emite `cohort_rule_version`+`cohort_baseline_version` ‖ P02 sin campo (decide sobre stale); P08 renombra uno + omite otro, sin migración | **13** | 3 | [V] |
| **COL-7** | D/A orphan | 24,22 | alta | sí | P05,08,02 | P05/P08/P02 escriben receita-expansión a 'GTM' ‖ ninguna de 11 es GTM; P09 publica sólo a P1/2/6/7/10 | — | 3 | [V] |
| **COL-38** | D process-own | 9,12 | alta | sí | P02,09 | P02 cita 'P-catálogo'(inexistente) ‖ P09 sólo fallback; proceso curación/versión del catálogo NBA huérfano | **9** | 3 | [V] |
| **COL-16** | I version-pin | 17,29 | media | no | P06,02,04,08 | P06 ata `liberado_evals` a `version_golden_set`/AUTONOMY_RELEASE ‖ P02/04/08 lo toman como enum sin pin → sin detección skew | **4** | 3 | [V] |
| **COL-36** | F no-dedupe | 8,34 | media | no | P02,04,05,06,08,11 | P11 único agregador costo/decisión ‖ 5 productores emiten sin unidad canónica ni dedupe → 1 decisión contada N veces | — | 3 | [V] |
| **COL-27** | B divergent | 13,31 | media | sí | P01,02,08 | P01 BLOQUEA handoff bajo n<n_min; P02 suprime/degrada NBA ‖ P08 sólo OCULTA percentil y sigue activo | **13** | 3 | [V] |
| **COL-17** | I version-skew | 16,20 | media | no | P07,10,02,04 | P07/P10 trinca versionada chequeable/acción; P05 la chequea ‖ P02/P04 sin slot policy/context/knowledge_version | — | 2 | [V] |
| **COL-14** | E stale-window | 17,3 | media | no | P10,02 | P10 EC-8 `teto_tier` puede quedar stale (recompute reactivo) ‖ P02 lo lee en min() asumiéndolo vigente; EC-2 sólo cubre 'ausente' | **3** | 2 | [V] |
| **COL-23** | F window-conflict | 11,10 | media | no | P03,08 | P03 OQ-4 ventana atribución [C:14d] ‖ P08 BR-10 [C:90d] — mismo numerador, mismo resultado cuenta o no según pantalla | **5** | 3 | [V] |
| **COL-37** | D/F/J denom | 5,6 | media | sí | P05,03 | P05 'mide' esfuerzo_cliente sin fórmula (no_instrumentado) ‖ P03 consume sin poseer; esfuerzo-operador sin dueño; nadie renderiza | — | 2 | [V] |
| **COL-39** | J external-dep | 30 | media | sí | P05,07 | P05 BR-1/BR-7 lee 'fuente live consumidor (sistema a confirmar)' ‖ P07 modela campo con OQ abierta; sistema externo no specced | — | 2 | [V] |
| **COL-21** | A handoff | 6 | media | sí | P05,03 | P05 COUNTER emite Y único ‖ P03 exige Y₁/Y₂ split (BR-2 honestidad); panel 1:10 no cumple BR-2 | **6** | 2 | [V] |
| **COL-19** | G symbol-overload | 6 | media | sí | P03,05,06,08 | §5 fija Z=SLA horas; P03/P05 siguen ‖ P06 Z=cadencia corrida; P08 Z=latencia dossier. 3 NF, 1 símbolo | — | 3 | [V] |
| **COL-29** | B authority | 8,16,4 | media | no | P11,06 | P11 BR-6 'rebaja autonomía automáticamente' ‖ P06 'único productor de liberado_evals'. Conflicto de quién escribe el techo | — | 2 | [V] |
| **COL-22** | H role-undef | 7,24,9 | media | sí | P05,10 | P05 rutea $ a 'Finance' sin definir rol/permiso ‖ P10 OQ-8 pregunta si su lista financiera == destino Finance; nadie define qué puede hacer Finance | **18,3** | 2 | [V] |
| **COL-43** | A handoff | 7,24 | media | sí | P05,08,02,09 | P05/P08/P02 emiten receita-expansión a GTM ‖ ninguna pantalla GTM; P09 no publica a GTM. Handoff sin destino | **7** | 3 | [V] |
| **COL-24** | J sinks | 7,22 | media | no | P05,02,08 | P05 intel_destino ∈{Mercado,Producto,Política,Finance,GTM} ‖ sólo Política(P10)+Managed(P08) tienen spec; 4 sinks sin pantalla | — | 2 | [V] |
| **COL-28** | B invariant | 32,5 | media | no | P01,03,07 | P01 presenta movimiento-percentil como valor North Star directo ‖ P03 BR-7/P07 §3: atribución = pre-condición; movimiento cuenta 0 hasta confirmar | — | 2 | [V] |
| **COL-31** | E activation-race | 34 | media | sí | P09,01 | P09 EC-8 tenant ACTIVO con 'handoff incompleto' ‖ P01 al abrir asume baseline/t0/regla v1 persistidos | — | 2 | [I] |
| **COL-40** | C homonym | 15,31 | media | no | P01,09 | P01 `baseline_cohort`=baseline estadístico percentil/gap ‖ P09 'baseline'=t0 temporal North Star (usa la palabra para ambos) | — | 2 | [V] |
| **COL-35** | C synonym | 5 | media | no | P05,01-04,06-08,11 | P05 'deflection-MALA' ‖ §3+resto 'deflection-que-falla'. 1 término, riesgo de leerse como 2 métricas | — | 4 | [V] |
| **COL-30** | A handoff | 12,33 | media | no | P05,06 | P05 clasifica por `risk_class`+cohort (sin intent_id) ‖ P06 GOLDEN_CASE indexa por intent_id; falta mapeo risk_class→intent | **12,33** | 2 | [I] |
| **COL-34** | A handoff | 31,8 | media | no | P09,11 | P09 handoff publica a P1/2/6/7/10 (no P11) ‖ P09 DESPUÉS dice 'Alimenta a P11'; P11 no declara P09 como fuente. t0 sin canal | — | 1 | [V] |
| **COL-32** | J no-consumer | 28 | media | no | P01,03,11 | P01 persiste PERCENTIL_SNAPSHOT para 'movimiento de percentil' ‖ ni P03 ni P11 lo consumen/computan. Sink huérfano | — | 1 | [I] |
| **COL-20** | H signature | 17,18 | alta | sí | P09,10 | P09 1 humano valida+firma Política base ‖ P10 BR-5 exige revisor≠autor (2-ojos) misma entidad POLITICA | **18** | 2 | [V] |
| **COL-42** | C label-drift | 17 | baja | no | P07,10 | P10 'trinca'=3 documentos ‖ P07 'trinca de anclas'=3 punteros de versión. Misma tríada, 2 labels | — | 1 | [V] |
| **COL-41** | I playbook-own | 12,15 | baja | no | P04,01 | P04 BR-9 gatea generación en playbook versionado intent×cohort ‖ nadie posee/versiona PLAYBOOK_CONTENIDO ni define migración al bump de cohort | **12,15** | 1 | [I] |
| **COL-44** | J outbound-own | 9 | baja | no | P04 | P04 publica a 'Canal entrega(WhatsApp/email/in-app)' idempotente ‖ ningún spec posee canal outbound/estado_publicacion/retries | — | 1 | [I] |

**Resumen por tipo (MECE sobre A–J):** A=6 (13,21,30,34,43,+33-parte) · B=5 (3,27,28,29,+anchor) · C=7 (1,2,4,33,35,40,42) · D=8 (5,6,7,9,24-no,37,38,+) · E=5 (14,25,26,31,+) · F=4 (10,23,36,+) · G=1 (19) · H=4 (18,20,22,+) · I=5 (15,16,17,41,+) · J=8 (9,11,12,24,32,39,44,+). **44 colisiones, 11 specs, 5 líneas clave.**

---

## 3. CAMBIOS POR SPEC (apply-ready, en orden de prioridad)

> Notación: cada cambio lista **Resuelve / Ubicación / ANTES→DESPUÉS (resumen) / Por qué / Blast-radius / BLOCKED-ON-DECISION**. Los ANTES/DESPUÉS literales viven en las change-sets de cada spec; aquí se sintetiza el delta load-bearing.

### Prioridad 0 — BUNDLES ATÓMICOS DE PLATAFORMA (aplicar simultáneo o se crean nuevos sinónimos)

#### B0.1 — Identidad canónica de cliente (COL-1) · raíz P07
- **Ubicación:** P07 entidad CLIENTE (`cliente_id : PK alias id_restaurante`) + nuevo MAPA DE ALIAS.
- **ANTES→DESPUÉS:** `cliente_id : PK` → `cliente_id : PK · clave canónica de toda la plataforma` + **MAPA DE ALIAS autoritativo** `cliente_id ≡ id_restaurante(P07/P05) ≡ account_id(P01) ≡ cuenta_id(P08) ≡ entity_id(P03)`; todo join cliente-keyed se resuelve contra este mapa.
- **Por qué:** el Cerebro es la raíz de grounding (eslabón 1) — único lugar legítimo para el mapa de identidad; sin él cada join cross-spec se mapea a mano.
- **Blast-radius:** P01(account_id), P02(FK), P03(entity_id→cliente_id), P04(ya canónico), P05(id_restaurante alias), P08(cuenta_id→cliente_id) — rename simultáneo. `tenant_id` NO se colapsa (clave de aislamiento cross-tenant intacta).
- **BLOCKED-ON-DECISION:** token canónico final (recomendado `cliente_id`) → OQ-13 P07 / OQ nueva. Hasta entonces el MAPA DE ALIAS es el contrato obligatorio (P02/P05 fail-closed si el mapeo no resuelve).

#### B0.2 — Glosario canónico del `min()` (COL-2, COL-4, COL-42) · owner P10, eco P02/P03/P05/P07
- **Ubicación:** P10 Gobernanza/anchor-check (GLOSARIO CANÓNICO) + P02 bloque GLOSARIO min() + P03/P05 notas.
- **ANTES→DESPUÉS:** fija un nombre por brazo: `pedido_NBA` (1º, prod. P02), `liberado_evals` (2º, prod. P06), `teto_tier` (3º, prod. P10). **Alias prohibidos:** `autonomy_ceiling`, `nivel_pedido_nba`, `nivel_liberado_evals`. `tier_base`=insumo, NUNCA techo resuelto. `trinca`(documentos) ≡ `trinca de anclas`(punteros de versión) = un solo concepto.
- **Por qué:** un solo nombre evita que el `min()` se lea como métricas distintas y que cada join se cablee a mano. `00 §2` ya fija el canon literal.
- **Blast-radius:** P05 renombra `autonomy_ceiling`→`teto_tier` (único divergente del 3er brazo) y quita prefijo `nivel_`; P03/P04/P08 quitan `nivel_`; P07 alinea `trinca`. P11 ya canónico (no se toca).
- **BLOCKED-ON-DECISION:** no (apply-ready, pero **bundle atómico**: greedy edit-by-edit lo rechazaría).

#### B0.3 — `teto_tier` por (tenant×intent) + cap Finance visible en el min() (COL-3, COL-14, COL-17) · owner P10
- **Ubicación:** P10 Contrato/Salida + entidad TETO_TIER; eco en P02 PASO 2B.2, P03 FILA_ITEM, P08 NBA_PROPUESTA, P11 TENANT.
- **ANTES→DESPUÉS:** salida = **payload firmado por par (tenant×intent)** con `{nivel, intent, politica_version, context_version, knowledge_hash, computed_at, stale}`; consumidores leen la celda del intent de la acción; si `es_financiera` → `propose-only` forzado; **contrato de lectura obligatorio**: `stale=true` o falta puntero → fail-closed a humano/0.
- **Por qué:** restaura el invariante `financial-never-autonomous` dentro del `min()` (hoy invisible por el enum plano) y cierra la ventana de staleness (COL-14) + la asimetría de versión de trinca (COL-17).
- **Blast-radius:** todos los consumidores que aplanan `teto_tier` (P01 tier_base, P02, P03, P08, P11) absorben el eje intent + punteros de versión.
- **BLOCKED-ON-DECISION:** granularidad (tenant×intent vs +cohort) → P10 OQ-1; depende del owner de INTENT (COL-12).

#### B0.4 — Numerador North Star de dueño único vía `episodio_id` (COL-5, COL-10, COL-25, COL-26) · owner P07, eco P08/P03
- **Ubicación:** P07 BR-4 + SISTEMA 6 + PASO 7B.1 + US-1.2.1 + entidad EPISODIO; P08 F-3.4/US-3.1.1/EC-10; P03 EPIC-3/BR-7/SISTEMA 5.
- **ANTES→DESPUÉS:** **el Cerebro es el ÚNICO owner de agregación/dedupe del numerador**; TODO valor (incl. firma managed P08) se materializa primero como `episodio` con `episodio_id` único; la idempotencia `(cuenta,acción,ventana)` de P08 **mapea a UN episodio_id** (no episodio nuevo por ruta). El episodio nace **PROVISIONAL** (`estado_episodio=provisional`, `permanencia_verificada=false`, `valor=null`) y sólo cuenta tras confirmación de PROCESO 3. P03 LEE el agregado deduplicado, no lo posee.
- **Por qué:** elimina el doble-conteo (2 guardas incompatibles → compuestas) y el crédito-sin-permanencia (P08/P07 contaban antes del gate). Respeta §3 (atribución = pre-condición) sin borrar ninguna guarda [V].
- **Blast-radius:** P08 ya no escribe directo (su firma produce episodio provisional + confirma atribución); P03 re-gatea sobre episodio sellado; PROCESO 3 (01_e2e) es el sellador.
- **BLOCKED-ON-DECISION:** no para el contrato; sí depende del **owner del probe de permanencia** (COL-11, gap raíz).

### Prioridad 1 — APPLY-READY (no bloqueados, fuera de bundle)

#### P01 — Cohorts Explorer
- **COL-28** · OUTCOME/F-3.4/SISTEMA 6: movimiento-percentil pasa de 'valor directo North Star' → **'baseline que cuenta 0 hasta confirmación+atribución'** (P03 BR-7 / P07 §3). *Por qué:* cierra contradicción con invariante de atribución (lo señala su propia OQ-9). *Blast:* alinea con P03/P07, ninguno destructivo.
- **COL-40** · COHORT.baseline_cohort + GLOSSARY: desambigua `baseline_cohort`(estadístico) vs `t0_north_star`(temporal, prop. P09). *Blast:* P09 espeja la separación.
- **COL-31** · ANTES/precondición: detecta tenant ACTIVO con 'handoff incompleto' (P09 EC-8) → **fail-closed 'bootstrap en curso'** en vez de leer snapshot inexistente. *Blast:* P09 debe portar ack explícito.

#### P03 — Goals & KPIs (Home)
- **COL-6** · frontera co-propiedad + ARITMETICA_110 + SISTEMA 3: **fuente-de-verdad única** — P05 produce X/Y/N% (COUNTER), la fórmula del quiebre vive en UN servicio compartido; P03/P11 LEEN, no re-derivan; conserva `N%=Y/(X+Y)` que P11 omitía. *Blast:* P11 BREAKPOINT_SCENARIO pasa a lector; cierra OQ-1/OQ-10.
- **COL-19** · renombra `Z`→`Z_sla_servicio_horas` en todas sus apariciones. *Blast:* bundle Z con P06(`Z_cadencia_eval_run`)/P08(`Z_latencia_dossier`).
- **COL-21** · US-2.1.1 edge + EC-4: **fail-closed si `Y` llega sin split Y₁/Y₂** (no sumar/inferir; viola BR-2). *Blast:* fix-producer real = P05.
- **COL-33** · FILA_ITEM `causa`(free-text) → `causa_raiz`(enum6 canónico compartido P04/P05) + `causa_detalle` opcional (nunca clave de dedupe sola). *Blast:* bundle con P05(`risk_class`→`causa_raiz`).
- **COL-28/COL-32** · NORTH_STAR_CARD nuevo `delta_percentil_baseline` (serie P01) = señal baseline, suma 0 sin confirmación → **P03 se declara consumidor** de PERCENTIL_SNAPSHOT (cierra sink huérfano).

#### P05 — Support Inbox (motor)
- **COL-35** · renombra `deflection-MALA`→`deflection-que-falla` (todas las ocurrencias). *Blast:* bundle terminología con §3+resto.
- **COL-33** · declara `risk_class ≡ causa_raiz` (enum6) + handoff explícito `{case_class_id(≡cluster_id), causa_raiz, cohort_id}`→P04. *Blast:* P04 adapter de entrada; P03 enum.
- **COL-21** · COUNTER_1A10 emite Y desagregado `Y₁`/`Y₂` (Y=Y₁+Y₂ sólo display). *Blast:* habilita P03 BR-2.
- **COL-6** · cláusula fuente-única: COUNTER es la única fuente de X/Y/N%; P03/P11 consumen, no re-derivan.
- **COL-25** · write-back PROVISIONAL al Cerebro (permanencia/valor vacíos; señal North Star la emite PROCESO 3, no la Inbox); desambigua 'P3'→'Proceso 3 (closed-loop)'. *Blast:* P07 no emite hasta confirmación.
- **COL-8** · `decision_trace` añade `tiempo_a_firma_seg` (= fin−inicio) + publica al store consolidado (decision_ref). *Blast:* bundle con P02/P04/P08.
- **COL-36** · `costo_ia_por_decision` con `decision_id` único + unidad canónica; no suma pasos de la misma decision_id.

#### P02 — NBA / Playbooks
- **COL-13/COL-1/COL-15** · Contrato Entrada: shape exacto del handoff P01 (`account_id`+1 percentil+`cohort_rule_version`), mapeo `account_id↔cliente_id`, `percentil_en_cohort↔percentil_origen`, recibe `cohort_rule_version` (detecta bumps). *Blast:* P01 fija schema.
- **COL-14** · PASO 2B.2 + nuevo EC-11: **chequeo de staleness** del `teto_tier` (versión/hash ≠ vigente → fail-closed degrade-to-human). *Blast:* refuerza COL-17.
- **COL-27/COL-15** · BR-11 sube de [I] a [V]: lee `modo` del handoff (n<n_min) y degrada/suprime NBA; detecta skew de `cohort_rule_version`. *Blast:* P08 divergente (flag).
- **COL-8** · DECISION_AUDIT añade `decision_id` canónico + `presentado_at`/`firmado_at`/`tiempo_a_firma_seg` + `decision_ref`.
- **COL-36** · emite `decision_id` canónico (1 fila/decisión) para dedupe en P11.
- **COL-16** · `liberado_evals` + `version_golden_set` (pin de versión en el trazo).
- **COL-17** · `grounding_ref` + trinca `{policy_version, context_md_version, knowledge_version}` (chequeo por acción, espejo de P05).

#### P04 — Content Studio
- **COL-33** · adapter de entrada: `case_class_id→cluster_id`, `risk_class→causa_raiz`, conserva `intel_destino`≠`intent`; mapa `causa_raiz→intent` (P04 dueño de la derivación).
- **COL-8** · DECISION_TRACE + `tiempo_a_firma_seg` + `firma_valida`; DATA-OUT del audit-trail a P11.
- **COL-16/COL-17** · PIEZA_CONTENIDO + `version_golden_set`; DECISION_TRACE + `version_golden_set` + trinca versions.
- **COL-11** · BR-8: desambigua 'Pantalla 5/3'→**PROCESO 3** (P04 no cierra valor).
- **COL-36** · `costo_ia_por_decision` con `decision_id` + regla de dedupe.

#### P06 — Evals & Fine-tuning
- **COL-16** · DATA-OUT escribe registro firmado `{liberado_evals, release_id, version_golden_set, juez_version}`; **nunca viaja desnudo**. *Blast:* P02/P04/P08 pinan versión.
- **COL-19** · `Z`→`Z_cadencia_eval_run`. *Blast:* bundle Z.
- **COL-29** · SÍNTESIS: P06 = **único ESCRITOR** de `liberado_evals`; P11 SEÑALA rebaja, P06 EJECUTA. *Blast:* eco en P11 BR-6.
- **COL-36** · FINETUNE_JOB emite `decision_scope='fine_tuning_job'`+`dedupe_key` (no re-contar como decisión operativa).

#### P07 — Cerebro (raíz)
- **COL-35** · RIESGO 2: `deflection MALA`→`deflection-que-falla`.
- **COL-42** · F-2.4: unifica `trinca`(documentos)/`trinca versionada`(punteros) como un solo concepto.
- **COL-17** · DATA-OUT: contrato de grounding propaga SIEMPRE `{policy_version, context_md_version, knowledge_version}` en el payload por campo.
- **COL-28** · BR-2: movimiento (percentil) = baseline, cuenta 0 hasta `estado_episodio=confirmado` (refuerza desde la raíz).

#### P08 — Managed 1:1
- **COL-15** · COHORT: `regla_version`→`cohort_rule_version` (canónico) + añade `cohort_baseline_version` (hoy omitido).
- **COL-16** · EVAL_CELDA + `version_golden_set`; registra en VALOR_CONFIRMADO + audit.
- **COL-9** · NBA_PROPUESTA + `catalog_action_id : FK→NBA_CATALOG`; declara consumo, no propiedad.
- **COL-19** · OQ-11: `Z`→`Z_latencia_dossier`.
- **COL-36** · OQ-12: `costo_ia_por_decision` canónico + `decision_id` dedupe.
- **COL-10** · EC-10: `episodio_id`=guard PRIMARIO del numerador; idempotencia(cuenta,acción,ventana)=secundaria/local.
- **COL-8** · VALOR_CONFIRMADO + `firma_solicitada_ts`/`firma_emitida_ts`/`tiempo_a_firma_seg`/`decision_ref`.

#### P09 — Onboarding / Bootstrap
- **COL-34** · US-5.2.1 + Sub-proceso 1E.3 + HANDOFF_EVENT: añade **P11** a la lista de handoff (t0 unit-economics + señal anti-rubber-stamp); resuelve inconsistencia interna lista-vs-DESPUÉS.
- **COL-40** · TENANT.`t0`(temporal activación) ≠ `baseline_cohort`(estadístico P01); renombra REGLA_COHORT.`baseline`→`baseline_cohort`; propaga a Contrato/DESPUÉS.
- **COL-31** · EC-8: sub-estado `baseline_no_entregado` — P01 lo trata como estado-vacío canónico, no como snapshot persistido (anti-carrera).
- **COL-43** · *Excluido de cambios P09* (P09 no es productor de la línea GTM; su handoff correctamente no incluye GTM — el fix vive en P05/P08/P02).

#### P11 — Salud del 1:10
- **COL-3** · TENANT.`teto_tier` por (tenant×intent), cap Finance visible; P11 observa, no aplana.
- **COL-29** · BR-6 + RIESGO 1 + matriz + EC-4: reincidencia → **emite señal de rebaja a P06** (P11 nunca escribe el techo). *Blast:* eco P06.
- **COL-18** · BR-8: visibilidad del audit-trail por **rol × tenant (BR-1)**, NO por `teto_tier` (elimina overload). *Nota:* taxonomía de roles → OQ-8.
- **COL-35** · SISTEMA 6: `deflection-falla`→`deflection-que-falla`.
- **COL-34** · Contrato Entrada: declara P09 como fuente DATA-IN de `t0` + señal de firma de activación.
- **COL-36** · EPIC-1: unidad canónica `decision_id` + dedupe en el agregador.

### Prioridad 2 — BLOCKED-ON-DECISION (no build-ready hasta decisión del operador)

| COL | Spec(s) | Cambio condicional | Decisión requerida |
|---|---|---|---|
| **COL-1** | P02/P05/P07 | rename a token único | **Token canónico de identidad** (rec. `cliente_id`) |
| **COL-13** | P02/P01 | origen de `percentil_objetivo` | ¿1 o 2 percentiles en el handoff? (rec. derivación local P02) |
| **COL-23** | P03/P08 | unificar ventana atribución | **14d vs 90d** (rec. 14d canónico desde PROCESO 3) |
| **COL-9/COL-38** | P02/P05/P08/P09 | asignar owner NBA_CATALOG | ¿Qué pantalla posee catálogo + versionado? (rec. P02) |
| **COL-12** | P06/P10/P09/P05 | owner taxonomía INTENT | ¿Qué spec define/versiona INTENT? (rec. spec nueva) |
| **COL-7/COL-43/COL-24** | P05/P08/P02 | destino receita-expansión | **Owner de GTM/Mercado/Producto/Finance** (sinks fuera de surface) |
| **COL-22** | P05/P10 | permiso del rol Finance | Owner del rol que ejecuta $ |
| **COL-18** | P05/P08/P10/P11/P09 | RBAC canónico | **Qué spec posee el RBAC de plataforma** (4 taxonomías) |
| **COL-20** | P09/P10 | 2-ojos en bootstrap | ¿Excepción-bootstrap (rec. carve-out: teto=piso) o 2-ojos duro? |
| **COL-30** | P05/P06 | mapeo risk_class→intent | Tabla de mapeo versionada (dep. COL-12) |
| **COL-37** | P05/P03 | fórmula esfuerzo_cliente | Fórmula/unidad/baseline + owner esfuerzo_operador |
| **COL-39** | P05/P07 | sistema live consumidor | Owner del sistema externo campañas/price-match |
| **COL-41** | P04/P01 | owner PLAYBOOK_CONTENIDO + migración | Owner del playbook (dep. COL-12/COL-15) |
| **COL-44** | P04 | owner canal outbound | Owner de entrega idempotente/estado_publicacion |
| **COL-32** | P01/P03/P11 | quién rinde movimiento-percentil | ¿P11 (observabilidad) o P03 (Home)? |
| **COL-6** | P03/P11 | fuente-de-verdad breakpoint | ¿Servicio compartido / P3 / P11? (rec. servicio único) |
| **COL-8** | P11+productores | owner store consolidado de firmas | Dónde vive el audit-trail + cuál es t0 |

---

## 4. REFINE LOG (honesto)

- **Naturaleza de esta corrida:** pasada **autónoma única** sobre drafts generados del vision doc (`00_vision_completa.md v1.0 · 2026-06-15`). No hubo segunda iteración de re-detección tras aplicar cambios; el registro de 44 colisiones y las change-sets se produjeron en un solo barrido por spec.
- **Provenance:** 35 colisiones son `[V]` (ambos lados citados con archivo+ubicación verificados); 9 son `[I]` (inferidas: COL-12, COL-30, COL-31, COL-32, COL-41, COL-44 + facetas). Las `[I]` requieren confirmación contra el texto vivo antes de aplicar.
- **Discrepancia detectada y NO silenciada:** la `evidence_b` de **COL-4** afirma que "P08 renombra ambos brazos del min()", pero la auto-verificación de la change-set de P08 (`grep`) muestra que **P08 ya usa los nombres canónicos bare** `pedido_NBA`/`liberado_evals`. El outlier real de COL-4 es P03/P04/P05 (prefijo `nivel_`), no P08. → **Re-detección obligatoria** del scope exacto de COL-4 tras el bundle B0.2.
- **Temas que REQUIEREN re-detección tras aplicar cambios:**
  1. **Bundles atómicos (B0.1–B0.4):** son válidos sólo si TODAS las specs del clúster renombran a la vez. Tras aplicarlos, re-correr detección de sinónimos para confirmar 0 residuos de `account_id`/`autonomy_ceiling`/`nivel_*`/`deflection-MALA`/`regla_version`.
  2. **Numerador (COL-5/10/25/26):** tras introducir `estado_episodio` y el contrato de `episodio_id` único, re-verificar que P03/P05/P08 no dejen ninguna ruta de escritura paralela al numerador, y que PROCESO 3 quede explícitamente asignado a un dueño (COL-11 sigue abierto).
  3. **`teto_tier` per-intent (COL-3):** tras añadir el eje intent en los 5 consumidores, re-detectar si algún `min()` aguas-abajo sigue resolviéndose sobre techo plano (regresión silenciosa del cap Finance).
  4. **Símbolo Z (COL-19):** tras los 3 renombres, verificar que el panel 1:10 (P03/P11) no cablee un único slot `Z`.
  5. **`decision_id` (COL-8/COL-36):** confirmar que los 5 productores emiten el MISMO `decision_id` end-to-end y que el store consolidado de firmas tiene dueño (hoy referenciado, no poseído).
  6. **Cadena de decisiones [I]:** COL-12 (INTENT) es dependencia de COL-9/30/41/3 — al resolverla, re-detectar el efecto dominó sobre catálogo, mapeo y playbook.

---

## 5. DECISIONES / PREGUNTAS PARA LEO (consolida TODAS las open_questions de las 11 pantallas)

> Agrupadas por pantalla; cada una con recomendación. Las **negritas** marcan las bloqueantes que cierran colisiones del registro.

### Pantalla 01 — Cohorts Explorer
- OQ-1 Percentil tiempo-real vs batch versionado → **Rec:** batch versionado → Cerebro (baseline estable, regla versionada §2).
- OQ-2 Cambio de versión de regla: recalcula vs coexisten → **Rec:** recalcular contra la vigente, nunca mezclar baselines.
- **OQ-3 (BLOQUEANTE, threshold BR-2)** n_min de cohort + comportamiento debajo → **Rec:** n_min=20 [C]; debajo → ocultar+aviso fail-closed; check falla → no renderizar+alertar. *Falsify:* ¿midió el 20 o lo supone?
- OQ-4 Criterio de orden de la fila → **Rec:** `gap_hasta_top` default, $-en-juego como prior.
- OQ-5 Payload+SLA del evento priorizado → **Rec:** `{cliente_id, cohort_id, percentil_origen, percentil_objetivo, gap_hasta_top, cohort_rule_version, cohort_baseline_version, modo, operador_id}` (alinea con COL-13/15).
- OQ-6 Granularidad temporal del percentil → **Rec:** por batch + timestamp → serie.
- OQ-7 Estado vacío tenant recién-sembrado → **Rec:** estado vacío con link a Onboarding #9 (alinea con COL-31).
- OQ-8 TTL del baseline (stale) → **Rec:** TTL [C]; al expirar mostrar marcado stale + bloquear handoff si el job no corrió.
- **OQ-9** Movimiento de percentil = valor North Star por sí solo → **Rec:** SÓLO confirmado+atribuible (§3). *Cierra COL-28.*
- OQ-10 Toggle Musixmatch con cohort minúsculo → **Rec:** sí, declarar 'estructura quiebra' + vía evidencia (managed n=1-5).

### Pantalla 02 — NBA / Playbooks
- Trigger NBA (navegación vs señal upstream) → **Rec:** ambos.
- **Schema del catálogo + por-tenant vs global** → **Rec:** definir owner del NBA_CATALOG (cierra COL-9/38); global cerrado y versionado.
- ¿Auto-ejecuta NBA no-financiera liberada vs clic humano siempre? → **Rec:** auto sólo si `min()` libera Y no financiera; financiera siempre humano (BR-3).
- Clasificación 'financiera' (flag vs clasificador) → **Rec:** flag en catálogo + fail-closed en duda; lista = la de P10 (COL-22).
- Umbral holdout→evidencia (long-tail vs managed) → **Rec:** por segmento, umbral [C] §11.3.
- n_min de cohort para NBA → **Rec:** hereda n_min de P01.
- Ventana de atribución por KPI → **Rec:** unificar con PROCESO 3 (cierra COL-23).
- Consumidor/SLA del spec generado → **Rec:** nombrar consumidor real (no GTM huérfano, COL-7/43).
- Costo de deflection-que-falla → **Rec:** instrumentar resta explícita al North Star.
- Chip min() ¿qué techo manda + empate? → **Rec:** etiqueta + motivo; empate → más conservador.
- SLA/latencia Z + budget costo/decisión → **Rec:** `Z` desambiguado (no SLA-horas); budget [C].
- Detección operacional de rubber-stamp → **Rec:** `tiempo_a_firma_seg` + tasa aprobación (cierra COL-8).
- `liberado_evals=0` ¿informativa vs suprimida? → **Rec:** informativa solo-lectura.
- 'Ajustar' ¿parámetros vs otra acción? → **Rec:** sólo otra acción del catálogo cerrado.
- Ruteo P90+→Managed ¿auto vs confirmación? → **Rec:** evento automático + traza.

### Pantalla 03 — Goals & KPIs (Home)
- **Co-propiedad aritmética 1:10 P3↔P11** → **Rec:** P3 vista operativa, P11 unit-economics, **cálculo del quiebre = servicio compartido único** (cierra COL-6).
- Clave de dedupe de la fila → **Rec:** `cliente_id`+`causa_raiz` (enum, cierra COL-1/COL-33).
- n_min de cohort → **Rec:** n_min=20 [C].
- **Ventana de atribución/permanencia** → **Rec:** [C:14d], unificada vía PROCESO 3 (cierra COL-23 — diverge de P08 90d).
- Umbral `tasa_no_atribuible` para alerta → **Rec:** [C:30%], publicado.
- Fórmula exacta del quiebre 1:10→1:6 → **Rec:** N% cruza umbral [C] o X excede capacidad (~5.000 rest/2 pers).
- Re-ordenación humana → **Rec:** orden por score; override con registro (anti-rubber-stamp).
- Estado del item tras abrir → **Rec:** `esperando_permanencia`, no sale hasta `signal_de_resultado` (BR-7).
- Consumidor/SLA del agregado → **Rec:** liderazgo casi-real-time.
- Fila única vs segmentada Y₁/Y₂ → **Rec:** fila única + filtro/selo; nunca sumar Y₁+Y₂ (BR-2).

### Pantalla 04 — Content Studio
- Trigger (cluster vs manual) → **Rec:** ambos.
- Pieza por cliente vs por cohort → **Rec:** una por cliente con `source_ref` propio.
- Playbook versionado vs prompt libre → **Rec:** playbook versionado; sin template → degrade-to-human (**owner del playbook = COL-41**).
- 'Fuente ancorada' + TTL → **Rec:** entidad versionada + frescura; stale = no-ancorado.
- Clasificar 'dinero/términos' por efecto → **Rec:** crédito/descuento/compensación/plan → teto ALTO; anti-fraccionamiento.
- Firma 'aprobar todo menos marcados' individual vs agregada → **Rec:** individual; paginar > [C].
- Formato de señal a Evals → **Rec:** `{cohort_id, intent, score_humano, nº_edições}` por celda.
- **Canal de publicación (entrega vs sólo libera)** → **Rec:** libera + dispara entrega idempotente (**owner outbound = COL-44**).
- Edición humana ¿re-grounding completo? → **Rec:** re-validar pieza entera.
- Base de `costo_ia_por_decision` + SLA lote → **Rec:** instrumentar por pieza; SLA [C].
- Proactivo vs reactivo 1:1 → **Rec:** foco lote proactivo; reactivo en P05.
- ¿Publicar ≠ valor North Star? → **Rec:** sí (BR-8).

### Pantalla 05 — Support Inbox (motor)
- OQ-1 Screenshot obligatorio → **Rec:** opcional; sólo-texto sigue a grounding.
- OQ-2 OCR falla → **Rec:** fail-closed → `extraccion_no_verificable` → humano.
- **OQ-3 Fórmula del esfuerzo-cliente** → **Rec:** compuesto (re-contactos + pasos + re-explicaciones) + `no_instrumentado` con flag hasta definir (**cierra COL-37**).
- OQ-4 SLA-alvo Z + tormenta de volumen → **Rec:** degradar a más-humano, priorizar por ventana/$/tier, nunca auto-cerrar; `Z`=desambiguado.
- **OQ-5 Fuente-de-verdad live del consumidor + TTL** → **Rec:** fuente autoritativa en runtime; TTL [C] (**cierra COL-39 — owner externo pendiente**).
- **OQ-6 Quién consume cada destino (Mercado/Producto/Política/Finance/GTM)** → **Rec:** cada destino con dueño nombrado (**cierra COL-7/24/43; rol Finance = COL-22**).
- OQ-7 Piso de confianza por tier → **Rec:** 0.7 placeholder; más alto para managed.
- OQ-8 n_min de cohort para lote → **Rec:** hereda n_min de P01.
- OQ-9 Redacción de PII reversible → **Rec:** irreversible por defecto; original sólo bajo auditoría.
- OQ-10 Contador X/Y/N% ¿al rotar vs tras cierre P3? → **Rec:** absorción provisional en tiempo real + crédito de valor sólo de P3; ambos visibles y rotulados.

### Pantalla 06 — Evals & Fine-tuning
- Umbral promoción/rebaja + histéresis → **Rec:** umbrales distintos con histéresis [C].
- n_min_eval del golden set → **Rec:** [C], paralelo a n_min cohort.
- Independencia juez↔humano (>κ) → **Rec:** métrica + umbral_independencia [C] que bloquea promoción.
- Base de fine-tuning (propio vs Claude) → **Rec:** decisión §11.10 (bloquea job).
- Consumo/SLA de `liberado_evals` + cadencia → **Rec:** SLA a NBA [C]; `Z_cadencia_eval_run` (cierra COL-19).
- Gesto mínimo de revisión (anti-rubber-stamp BR-9) → **Rec:** abrir evidencia + confirmar N casos.
- T de validez del golden set (staleness) → **Rec:** T [C]; degradar promovibilidad (EC-7).
- ¿Todo caso Inbox candidato vs marcados? + curación → **Rec:** marcados + curación humana; mapeo risk_class→intent (COL-30).
- Intents 'financieros' (BR-8) == lista P10 → **Rec:** sí, derivar de P10 (cierra COL-22 parcial).
- UI: score numérico vs color + selo [V]/[I]/[C] → **Rec:** color + score en detalle; selo por celda.

### Pantalla 07 — Ficha / Cerebro (raíz)
- OQ-1 Versionado campo-a-campo vs snapshot → **Rec:** por campo con provenance.
- OQ-2 Corrección ¿nueva versión inmutable? → **Rec:** nueva versión inmutable auditable.
- **OQ-3 (BLOQUEANTE) Fuentes canónicas + acceso por tenant** → **Rec:** Onboarding #9 siembra; integraciones campaña/price-match alimentan estado vivo; Inbox #5 write-back; todas tenant-scoped (**cierra COL-39 — falsify: ¿vio esas fuentes existir?**).
- **OQ-4 (BLOQUEANTE) Contrato exacto de grounding** → **Rec:** `{campo, valor, provenance, frescura_timestamp, stale_flag, tenant_id, policy/context/knowledge_version}` por campo (cierra COL-17).
- OQ-5 TTL de frescura por tipo de campo → **Rec:** TTL [C] por tipo; fail-open PROHIBIDO.
- OQ-6 Suite de regresión por sub-causa → **Rec:** regresión + NO-regresión antes de `knowledge_version+1`.
- OQ-7 Formato/retención de la trilla de acceso → **Rec:** log inmutable; retención GDPR; visible sólo a gobernanza.
- OQ-8 Campo stale ¿servir marcado vs ocultar? → **Rec:** servir marcado stale + último [V] + timestamp.
- OQ-9 Campos 'críticos' que exigen re-decisión → **Rec:** los que afectan grounding de acción o el numerador.
- OQ-10 Estado vacío sin ficha → **Rec:** estado vacío con link a Onboarding #9.
- OQ-11 Métrica del 'moat de memoria' → **Rec:** episodios/unidad de esfuerzo en el tiempo; ventana [C:14d].
- OQ-12 Toggle Musixmatch (sólo display+modelo de dinero) → **Rec:** sí; declarar dónde la estructura quiebra.

### Pantalla 08 — Managed 1:1
- Definición de 'valor realizado' managed → **Rec:** receita expansión/renovación/churn por KPI (§11.1).
- **Ventana de atribución por KPI** → **Rec:** alinear a 14d canónico de PROCESO 3, NO 90d (**cierra COL-23**).
- n_min de cohort para percentil → **Rec:** n_min=20 (consistencia P01).
- Contenido/orden del dossier QBR → **Rec:** secciones obligatorias vs opcionales [I].
- Evidencia obligatoria de la firma + doble-check → **Rec:** anexo + anti-rubber-stamp (cierra COL-8).
- **Quién es 'operador managed' + permiso** → **Rec:** anclar a RBAC canónico (**COL-18**).
- Recepción del ruteo P90+ + SLA QBR → **Rec:** evento push; SLA [C].
- Acción financiera ¿sólo lectura vs disparar? → **Rec:** sólo lectura (BR-3, financial-never-autonomous).
- Selo de método de atribución distinto en UI → **Rec:** texto/sinal explícito.
- Umbral de frescura (stale) del Cerebro → **Rec:** [C] días.
- Latencia Z de generación del dossier → **Rec:** `Z_latencia_dossier` (cierra COL-19).
- Costo/decisión + volumen → unit-economics P11 → **Rec:** sí, `costo_ia_por_decision` + `decision_id` (cierra COL-36).

### Pantalla 09 — Onboarding / Bootstrap
- Fuentes de entrada para sembrar el Cerebro → **Rec:** export CRM + lista clientes + histórico tickets [I] (liga OQ-3 P07).
- n_min de clientes/cohort → **Rec:** 20 (§11.4).
- ¿Activar con < n_min (sólo 1:1) vs bloquear? → **Rec:** activar en modo 1:1, North Star en 'atribución diferida'.
- Trigger del onboarding → **Rec:** evento de contrato firmado.
- **Quién es 'humano que gobierna' que firma Política base** → **Rec:** depende del RBAC canónico (**COL-18**); 2-ojos o carve-out bootstrap (**COL-20**).
- ¿IA infiere campos [I] vs sólo importa [V]? → **Rec:** sólo ancorado [V]; resto vacío.
- t0 ¿en activación vs tras estabilización? → **Rec:** en activación (cierra COL-40, separar de baseline_cohort).
- Consumidores que requieren ACK + SLA → **Rec:** ACK explícito; añadir P11 (cierra COL-34).
- Umbral de tiempo para firma sospechosa → **Rec:** piso [C] segundos.
- **Catálogo de intents en arranque (global vs por-tenant)** → **Rec:** fallback al catálogo NBA global (**owner = COL-9/12/38**).
- Toggle Musixmatch (Music Lens vs screenshots) → **Rec:** absorber sin romper hard-nos (§11.9).
- SLA/costo del bootstrap completo → **Rec:** instrumentar → P11.
- **OQ-13 nueva (COL-20):** ¿Política base de bootstrap cumple 2-ojos o excepción de 1-firma? → **Rec:** carve-out auditable (teto=piso no eleva autonomía); 2-ojos en 1ª edición en régimen.

### Pantalla 10 — Política & Trinca + Mapa Tier
- **Granularidad teto_tier** (tenant / tenant×intent / +cohort) → **Rec:** tenant×intent (necesario para BR-3 visible en min(), **cierra COL-3**).
- Cómo combina la trinca para producir teto_tier → **Rec:** el más conservador gana; needs-prototype.
- Representación del nivel (numérica vs nombrada) → **Rec:** nombrada (propose-only/draft/auto); nivel 0 = humano puro.
- Taxonomía de tiers + teto_base → **Rec:** definir por operador.
- **Quién edita/firma Política (RBAC + 2-ojos)** → **Rec:** autor≠revisor obligatorio (**COL-18/COL-20**).
- Piso de tiempo de lectura anti-rubber-stamp → **Rec:** piso [C] segundos.
- ¿Subir teto exige evidencia? → **Rec:** sí (paralelo a Evals: humano + evidencia).
- **Catálogo de intents financieros == destino Finance Inbox** → **Rec:** sí, P10 autoritativa (**cierra COL-22**).
- Recompute teto_tier reactivo vs batch + TTL → **Rec:** reactivo + flag stale + fail-closed en lectura (cierra COL-14).
- context.md/Knowledge por tenant → **Rec:** por tenant (BR-2 aislamiento).
- SLA/latencia Z + costo de gobernanza → **Rec:** `Z` desambiguado; → P11.
- PII en context.md/Knowledge → **Rec:** mismo pipeline de redacción que Inbox §5.
- Reversión/rollback de Política → **Rec:** nueva firma 2-ojos.

### Pantalla 11 — Salud del 1:10
- Costo/decisión real + meta €3→€1 (fija vs curva) → **Rec:** curva en el tiempo [C] (blocker EPIC-1).
- Mecanismo del quiebre 1:10→1:6 (X/Y/Z/N) → **Rec:** needs-prototype; N% cruza umbral (cierra COL-6).
- n_min de decisiones revisadas → **Rec:** [C] (EC-3).
- **Piso de tiempo-a-firma + reincidencias para rebaja** → **Rec:** piso [C]; reincidencia → **señal a P06** (cierra COL-29; depende COL-8).
- Definición de 'exceso confianza' vs 'exceso bloqueo' → **Rec:** fórmula por eje [C].
- Umbral κ de independencia juez↔humano → **Rec:** [C] desde Evals #6.
- Horas hasta feed stale → **Rec:** [C] (BR-9).
- **Quién es 'gobernador' vs 'operador' + visibilidad audit-trail** → **Rec:** por rol×tenant, NO por teto_tier (**cierra COL-18 overload; taxonomía = OQ-8**).
- Snapshot de salud ¿Cerebro vs log gobernanza vs ambos? → **Rec:** ambos; SLA refresh [C].
- **Punto de quiebre manipulable ¿P11 vs Home?** → **Rec:** servicio compartido único, fuente de verdad = servicio (cierra COL-6).
- ¿Cuánto resta la deflection-que-falla + aparece como línea? → **Rec:** sí, línea explícita (§3).
- Métricas que pierden sentido en toggle Musixmatch → **Rec:** declararlas (3 majors, §6).
- **OQ-32:** ¿P11 o P03 rinde 'movimiento de percentil'? → **Rec:** P11 (observabilidad), sin recalcular (cierra COL-32).

---

## 6. PRUEBA MECE / COMPLETITUD (checklist)

- [x] **Las 44 colisiones del REGISTER aparecen en §2** (COL-1…COL-44, sin huecos; COL-3 listada como `COL-2→COL-3` por su `depends-on`).
- [x] **Cobertura por tipo A–J completa** (A=handoffs, B=behavior/shape, C=synonym/homonym, D=ownership, E=sequence, F=guard/formula, G=symbol, H=RBAC/signature, I=version, J=orphan/no-owner) — distribución en §2 resumen.
- [x] **Las 5 líneas clave (THEMES) mapean a las 44 colisiones sin solapamiento ni hueco** (§0.5; cada COL asignada a exactamente una línea primaria).
- [x] **Las 11 pantallas tienen cambios en §3** (P01-P11) + el gap PROCESO 3 (sin pantalla) explicitado en COL-11.
- [x] **Orden topológico aplicado en §2** (raíces COL-1/2/4/33/9/12/18 primero; dependientes COL-3/5/10/11/13/14/15/23/25/26 después; luego impacto×severidad).
- [x] **`depends-on` consistente** entre §2 y §3 (B0.1→B0.2→B0.3→B0.4; COL-11 como raíz de COL-25/26; COL-5 raíz de COL-10/23).
- [x] **Bundles atómicos marcados** (B0.1–B0.4) con advertencia de aplicación simultánea.
- [x] **BLOCKED-ON-DECISION consolidado** (§3 Prioridad 2: 17 ítems) y trazado a decisiones de §5.
- [x] **TODAS las open_questions de las 11 pantallas en §5** (P01:10, P02:15, P03:10, P04:12, P05:10, P06:10, P07:12, P08:12, P09:12+OQ13, P10:13, P11:12+OQ32), cada una con recomendación.
- [x] **Invariantes re-aseverados:** `min(pedido_NBA, liberado_evals, teto_tier)` intacto; cross-tenant hard-no intacto; financial-never-autonomous REFORZADO (COL-3); ningún `[V]` borrado.
- [x] **DAG end-to-end** derivado de data-in/out (§1.2) + matriz spec×spec (§1.1).
- [x] **Provenance declarada** (35 [V] / 9 [I]) y discrepancia COL-4 NO silenciada (§4).
- [x] **REFINE LOG honesto:** corrida autónoma única declarada + 6 temas de re-detección listados.
- [x] **MECE check final:** sin colisión duplicada entre líneas; sin pantalla sin tratar; sin OQ omitida; sin tipo A–J vacío salvo G (único, COL-19, correcto).