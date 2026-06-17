# Plataforma de Customer Ops AI-First — Visión Completa

> **Versión** 1.2 · **Fecha** 2026-06-15 · **Estado** Aprobado (visión de producto)
> **[Changelog v1.2]** Pantalla 2 (NBA/Playbooks) reflejada como el **tablero humano del `min()`** (agent-manager libera/pausa en lote por cohort; spec: `02_NBA Playbooks best actions screen.md`); precisado el hard-no **financiero** (= solo saldo) y el **cross-tenant** (= restaurante individual + k-anonymity); reconciliada la "trinca" del eslabón 4 con el `min()`. (Triple-check SAT + PS + coherencia.)
> **[Changelog v1.1]** Reframe de la Pantalla 3 → **Goals & KPIs** (scorecard jerárquico, no "fila + Aritmética 1:10"); el operador se precisa como **agent-manager**. Detalle: `specs/03_feature_goals_kpis.md`. Lo no resuelto queda `[I]` en §11.
>
> **Fuentes:** brief del take-home (Musixmatch) · entrevista con Leo (operador) · triple-check **SAT** (técnicas analíticas estructuradas) + **PS** (problem-solving McKinsey) + **Grill** (stress-test del plan) + **CEO** (revisión de ambición/escopo).
>
> **Convención de provenance** — presente en todo el documento y exigida en la UI:
> - `[V]` = **Vivido / verificado.** Experiencia directa del operador o hecho comprobable.
> - `[I]` = **Inferido / a decidir.** Hipótesis razonada u *open question* que Leo resuelve o defiende.
> - `[C]` = **Calculado / escenario.** Número de un escenario de carga instrumentado; **placeholder, nunca dato real**.

---

## 1. Qué es

> **Problema:** un operador de Customer Ops gestiona miles de relaciones con dos manos y un día de ocho horas. La bandeja de tickets es reactiva: trata síntomas uno por uno, no entiende al cliente, no previene el próximo caso ni captura expansión. El volumen aplasta la calidad y la atribución de valor no existe.

Esta plataforma es **UN cockpit del operador 1:10** construido **sobre el Cerebro del Cliente**. Una persona opera lo que hoy requiere diez, no porque escriba más rápido, sino porque la IA razona sobre un modelo vivo de cada cliente y propone la próxima mejor acción mientras el humano gobierna.

**Lo que NO es** — y esta distinción es la tesis del producto:

| NO es | SÍ es |
|---|---|
| Una bandeja de tickets más rápida | Un cockpit sobre el Cerebro del Cliente |
| Reactivo (síntoma a síntoma) | Proactivo (previene el próximo caso en lote) |
| IA que responde sola sin freno | IA con autonomía gobernada y *fail-closed* |
| Centro de costo (atender más barato) | Motor de retención **y** de expansión de ingresos |
| Valor declarado | Valor **confirmado y atribuible** |

El operador no vive en una cola: vive sobre el **Cerebro**, decide con la IA y deja que el sistema absorba el volumen long-tail mientras él se reserva para las relaciones que pagan el 1:1.

> **[v1.1]** Con precisión, el operador es un **agent-manager**: no atiende clientes — **gobierna la IA** que los atiende, llevándola al máximo de autonomía segura e interviniendo solo en los puntos de juicio. (Ver P3 Goals & KPIs y `02_NBA Playbooks best actions screen.md`.)

---

## 2. El motor (6 eslabones)

El producto es una cadena cerrada de seis eslabones. Cada eslabón alimenta al siguiente; el último cierra el lazo sobre el primero.

| # | Eslabón | Qué hace |
|---|---|---|
| 1 | **Cerebro del Cliente** | Modelo vivo y raíz: la ficha de cada cliente y la fuente de *grounding* de toda acción de IA. |
| 2 | **Cohorts** | Regla **versionada** que agrupa clientes; cada cliente tiene su **percentil dentro del cohort**, su **gap hasta el topo** y un baseline del cohort. |
| 3 | **Señales / NBA** | Catálogo **cerrado** de NBAs customer-facing (A1-A8) + contrafactual **"no actuar"** (efecto real, no actividad). Su liberación/pausa la gobierna el agent-manager **en lote por cohort vía P2** (ver `02`). |
| 4 | **Autonomía** | La IA actúa hasta `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)`. El techo estructural `teto_tier` lo fija la **trinca** (Política + `context.md` + Knowledge) — fuente de UN brazo del `min()`, no los tres. Diseño **fail-closed**. |
| 5 | **Evals** | Golden set por **cohort × intent**. **Promover** autonomía = humano + evidencia; **rebajar** = automático. |
| 6 | **North Star** | El lazo se cierra midiendo valor realizado confirmado y atribuible por unidad de esfuerzo (ver §3). |

### Fórmula de autonomía — el corazón del freno

El nivel de autonomía que la IA ejerce en cualquier acción es el **mínimo** de tres techos independientes:

```
nivel_efectivo = min( pedido_NBA , liberado_evals , teto_tier )
```

- **`pedido_NBA`** — cuánta autonomía pide la acción propuesta por el catálogo de NBA.
- **`liberado_evals`** — cuánto han liberado los Evals para esa celda cohort × intent (basado en evidencia).
- **`teto_tier`** — el techo que la Política/tier permite estructuralmente para ese cliente/tenant.

**Fail-closed:** ante ausencia de fuente, evidencia o permiso, el sistema **no actúa de más**: degrada a humano. El `min()` garantiza que el eslabón más conservador siempre gana. Nunca se sube autonomía por defecto; solo se sube con evidencia y firma humana.

---

## 3. North Star — 15/10

**Definición:**

```
North Star = (valor realizado CONFIRMADO y ATRIBUIBLE) / esfuerzo(cliente + operador)
             − deflection-que-falla
```

Tres precisiones que la hacen honesta:

1. **Atribución = pre-condición, no adorno.** Solo cuenta el valor que pasa **dos compuertas** (def. canónica §11.1): (A) **confirmado** (`signal_de_resultado` volvió y permaneció) **Y** (B) **incremental/atribuible** vs el contrafactual. Se mide distinto por segmento (ver §4 y §8): *holdout* en el long-tail, evidencia + confirmación humana en el managed n=1-5. El `metodo_atribucion` (holdout/control · pre-post · funnel-correlacional) es explícito por acción; *funnel-correlacional* NO puede declarar "confirmado y atribuible" (ver `02`).
2. **El esfuerzo del cliente es la mitad del denominador.** No basta con que el operador trabaje menos; el cliente también debe esforzarse menos. La Inbox (§4, pantalla 5) es donde ese esfuerzo-cliente por fin se mide.
3. **Se resta la deflection que falla.** "Resolver" sin resolver (el cliente vuelve) no es valor: penaliza.

**Sobre el "15/10":** es la **meta `[C]`** — la ambición declarada, no un dato medido. El mecanismo real es la fórmula; el "15/10" es el norte hacia el que se calibra el sistema.

---

## 4. Las 11 pantallas

Cada pantalla declara: **qué muestra**, **dónde está la frontera IA-vs-humano**, su **lógica de cohort/percentil/NBA**, y cómo **ata al North Star / Evals**.

### Pantalla 1 — Cohorts Explorer
- **Qué muestra:** todos los clientes, su percentil dentro del cohort, el gap hasta el topo y **"qué hacen los P90+"**.
- **IA vs humano:** la IA segmenta y calcula percentiles; el humano explora y decide a quién priorizar.
- **Lógica:** percentil en cohort + baseline del cohort; la regla de cohort es versionada.
- **Ata a:** alimenta NBA (qué acción cierra el gap) y North Star (medir movimiento de percentil).

### Pantalla 2 — NBA / Playbooks `[evolución v1.2 — spec: 02_NBA Playbooks best actions screen.md]`
- **Qué muestra:** el **tablero humano del `min()`** (eslabón 4 "Autonomía"). Las NBAs que la IA propone por cohort, cada una con el par `(pedido_NBA, liberado_evals)`, el `nivel_efectivo`, causa-raíz, before/after y `risk_class`. Chip `min()` visible. Ej.: *"cohort P40→P70: liberar/pausar acción X en lote"*.
- **IA vs humano:** la IA propone del catálogo cerrado y calcula `min()`; el **agent-manager LIBERA/PAUSA en LOTE por cohort** (con drill a subgrupo). **Override SOLO BAJA** (AUT-11), nunca sube sobre `liberado_evals`; el dinero (saldo) y el cross-tenant **nunca** son auto-liberables.
- **Lógica:** catálogo cerrado + contrafactual "no actuar"; "bajo riesgo" se **VALIDA contra una base-de-políticas versionada (.md)**, no es regla chumbada; cada liberar/pausar escribe `decision_trace` con firma humana (anti-rubber-stamp); confirmación independiente (`confirmador_id ≠ proponente_id`); k-anonymity (`N≥k`) distinta de `n_min≥20`.
- **Ata a:** Evals (`liberado_evals`) y North Star vía **ROI por operador** (eficiencia × impacto atribuible) bajo **guardrail de error**. Cuña = **EPIC-1** (Pausar/Liberar); EPIC-2 (flexibilizar cohorts) y EPIC-3 (mejorar Evals) **diferidas `[I]`**.

### Pantalla 3 — Goals & KPIs (feature standalone) `[reframe v1.1 — spec: 03_feature_goals_kpis.md]`
- **Qué muestra:** un **scorecard de KPIs vivo, jerárquico y con memoria** — el tablero de instrumentos del agent-manager. 3 lentes separadas: **Empresa · Personal · Procesos-que-administro** (= los agentes que gerencia). Por KPI: target vs hoy, descomposición lagging→leading, histórico→previsibilidad, acción sugerida. `[V]`
- **IA vs humano:** la IA mide (agente Python/SQL determinista, nunca LLM), analiza y **sugiere**; el humano **aprueba antes de ejecutar** (nada autónomo) y valida la acuracidad. `[V]`
- **Lógica:** 2 clases de dato gobernadas — **Performance** (empresa+persona) read-only desde RH/estrategia (solo se consume); **Contexto/NBA de proceso** editable con validación 4-ojos + log. Def canónica única (A=B). `[V]`
- **Ata a:** North Star directo. · **Ya NO es** "fila + Aritmética 1:10": la prueba 1:10 / break-point vive en **P11** (`[V]` resuelto); la ejecución de acciones internas ("tipo-B") = **EPIC-6 Investigation Workbench** (`03`). `[V]`

### Pantalla 4 — Content Studio
- **Qué muestra:** generación de contenido en **lotes por cohort** (ej. comunicaciones, respuestas, campañas).
- **IA vs humano:** **gate humano obligatorio** + **grounding fail-closed**: sin fuente anclada en el Cerebro, **bloqueo rojo**, no se publica.
- **Lógica:** lote segmentado por cohort; toda pieza anclada al Cerebro.
- **Ata a:** Evals (calidad del lote) y es el **freno visible** de la demo (§6).

### ⭐ Pantalla 5 — Support Inbox = MOTOR DE INTELIGENCIA

Esta pantalla es el upgrade-clave del producto. No es una bandeja: es donde **el volumen se vuelve demostrable** y donde el **esfuerzo-cliente** (la mitad del denominador del North Star) por fin se mide.

**Flujo:**

```
Cliente sube caso + SCREENSHOT
        │
        ▼
Extracción multimodal (VLM + OCR)
        │
        ▼
GROUNDING OBLIGATORIO en el Cerebro  ──►  sin fuente → HUMANO (fail-closed)
        │
        ▼
Clasifica y consolida en DESTINOS:
   Mercado · Producto · Política · Finance · (+ GTM-expansión)
        │
        ▼
Resuelve RÁPIDO  +  acción PROACTIVA en lote (prevenir el próximo)
```

- **Qué muestra:** un contador vivo **"X absorbidos / Y a humano / N% escalación"** — la prueba del 1:10 en tiempo real.
- **IA vs humano:** la IA extrae, ancla, clasifica y propone; el humano gobierna lo que no tiene fuente y todo lo que toca dinero.
- **Hardening obligatorio (declarado antes de operar):**
  - **PII** en el screenshot **redactada**.
  - El **texto dentro del screenshot = DATO, nunca instrucción** (defensa contra inyección indirecta).
  - **Acción financiera nunca autónoma** — "financiero" = lo que mueve **saldo** (reembolso/precio/crédito); las palancas de mejora financiera **estratégica** (nuevo mercado/penetración) → Strategy y las de **área** (reducción de tickets) → Soporte (no son NBAs auto-liberables; ver `02` BR-2/BR-13).
  - **Cohorts agregados, nunca cross-tenant** (ver §8, gobernanza).
- **Ata a:** North Star (mide volumen absorbido **y** esfuerzo-cliente), Evals (cada caso es señal del flywheel) y GTM (destino de expansión).

### Pantalla 6 — Evals & Fine-tuning
- **Qué muestra:** la matriz golden set **cohort × intent**, celdas en rojo/verde, y un **red-team set**.
- **IA vs humano:** **rebajar autonomía = automático**; **promover = humano + evidencia**. El red-team verifica que un juez co-sesgado no certifique el error (independencia juez ↔ humano, más allá de κ).
- **Lógica:** golden set versionado; la matriz calibrada es el dato propietario (data-flywheel, §8).
- **Ata a:** es la fuente de `liberado_evals` en la fórmula `min()` (§2).

### Pantalla 7 — Ficha / Cerebro (raíz)
- **Qué muestra:** el modelo vivo de un cliente — la raíz de todo el grounding.
- **IA vs humano:** la IA mantiene la ficha; el humano la audita y corrige.
- **Lógica:** fuente única de verdad por cliente.
- **Ata a:** es el eslabón 1 del motor; todo lo demás cuelga de aquí.

### Pantalla 8 — Managed 1:1
- **Qué muestra:** las relaciones de alto valor trabajadas 1:1; **momento en vivo**: preparar un QBR en minutos = **apalancamiento-en-el-preparo**.
- **IA vs humano:** la IA prepara material y contexto; el humano lleva la conversación de valor.
- **Lógica:** segmento managed (Y₂, ver §5); atribución por evidencia + confirmación humana (n=1-5).
- **Ata a:** North Star (valor confirmado) y responde al grill *"¿quién paga?"* — el managed (restaurantes/cadenas de alto valor) es donde está el dinero grande. (Bajo el toggle Musixmatch: Sony/Warner.)

### Pantalla 9 — Onboarding / Bootstrap
- **Qué muestra:** cómo arranca un cliente/tenant nuevo desde frío.
- **IA vs humano:** la IA propone setup inicial; el humano valida la configuración base.
- **Lógica:** sembrar Cerebro + cohorts + Política iniciales.
- **Ata a:** habilita el resto del motor para un tenant nuevo.

### Pantalla 10 — Política & Trinca + Mapa Tier
- **Qué muestra:** la trinca de autonomía (Política + `context.md` + Knowledge), el mapa de tiers y el **hard-no de gobernanza cross-tenant**.
- **IA vs humano:** humano define la Política; la IA opera dentro de ella.
- **Lógica:** define `teto_tier` de la fórmula `min()` (§2). Hard-no cross-tenant: en el dominio primario (Uber Eats) la unidad es el **restaurante individual** — nunca se cruza un insight que **identifique la campaña específica de un restaurante** hacia otro (**k-anonymity `N≥k`**, distinta de `n_min≥20` de validez estadística). (Bajo el toggle Musixmatch el mismo hard-no se lee **Sony ≠ Warner**; GDPR/contrato.)
- **Ata a:** es la fuente de `teto_tier`; fija el techo estructural de la autonomía.

### Pantalla 11 — Salud del 1:10
- **Qué muestra:** la salud del modelo 1:10, las **unit economics de la IA** (costo/decisión × volumen + **tokens**) y un **alvo de calibración bipolar anti-rubber-stamp**. · **[host del break-point — resuelto]** aloja la **prueba de flywheel / break-point del 1:10**: el break-point reframado = **la curva del trabajo de revisión vs volumen** (10 señales de salud + modelo no-lineal codo+histéresis+early-warning). Las señales se **fuentean** del scorecard de Goals & KPIs (#3); spec-semilla en `03` EPIC-5. `[V]`
- **IA vs humano:** la IA reporta su propio costo y calibración; el humano vigila que la firma humana no sea un sello automático.
- **Lógica:** costo por decisión, margen vía fine-tuning (moat económico), calibración que penaliza tanto el exceso de confianza como el exceso de bloqueo.
- **Ata a:** North Star (eficiencia económica) y a la sostenibilidad del modelo (cost-center → motor de receita).

---

## 5. Aritmética del 1:10

**Dos cosas distintas — NO confundir (corrección Leo, 06-16):**
- **Lo que Leo HIZO = PRUEBA-DE-CAPACIDAD `[V]`** (no el número baseline): operó ~5.000 restaurantes con 2 personas porque **1 persona veía 250 restaurantes 1:1 y la otra creaba contenido escalable** para los ~4.750 restantes. Prueba que **puede** hacerlo y que la palanca 1:N **ya funcionaba antes de la IA**; de aquí sale el ORIGEN del split (250/5.000 = **5% managed**).
- **El NÚMERO baseline del 1:10 = BENCHMARK público `[I]`** (cómo opera el mercado HOY): **X** tickets/día · **N%** · **AHT** se **toman del benchmark**, NO se derivan del 5.000/2 de Leo (que es credibilidad aparte). El 1:10 = **1 operador+IA iguala al equipo-de-10 del mercado**; lo vivido es la prueba de que es alcanzable, no la aritmética del baseline.

Pantalla dueña: **Salud del 1:10 (#11)** `[V resuelto — Leo]` (era `[I]` P3-vs-P11). El break-point ya NO es un "slider de capacidad física" sino la **curva del trabajo de revisión vs volumen** (prueba de que el flywheel funciona); modelo no-lineal (codo de saturación + histéresis + early-warning). Las señales (10) se fuentean del scorecard de Goals & KPIs (#3). Detalle: `03` EPIC-5.

| Variable | Valor escenario | Cómo se deriva (MECANISMO) | Ancla / provenance |
|---|---|---|---|
| **X** | **~300 tickets/día** (equipo de 10) · rango 210–500 | 30 tickets/agente/día (benchmark IA-asistido) × 10; el rango = complejidad del ticket | `[C]` ← `[I]` benchmark ([Jitbit ~1.000 SaaS](https://www.jitbit.com/news/2266-average-customer-support-metrics-from-1000-companies/)) |
| **Y** | **~1.500–2.500 relaciones** (equipo de 10) · split **5% managed / 95% long-tail** — nunca sumados | 10 × 144–250 cuentas/CSM (benchmark **SMB tech-touch**); restaurante = SMB low-ACV → "managed" ≈ tope de la banda SMB (~250), **NO** enterprise high-touch (22). El 1:10 vive en el **long-tail** (la IA lo absorbe); el managed **NO escala 10×** | `[C]`←`[I]` benchmark Gainsight/SMB; split origen vivido `[V]` (250/5.000) |
| **Z** | managed **≤24h** · long-tail: respuesta en minutos | SLA vivido; la IA da al long-tail rapidez **con** calidad → rompe el trade-off vivido ("rápido pero peor") | `[V]` Leo (24h managed) |
| **N%** | **12–15% hoy → meta ~7%** (con IA + Knowledge Base) | benchmark de escalación (marketplace/pagos puxa alto, retail 14–20%); el delta hacia ~7% es **parte del** 1:10 | `[C]` ← `[I]` benchmark ([Stealth Agents 2026](https://stealthagents.com/research/customer-support-escalation-statistics-2026)) |

**Delta solo-vs-IA (la cuenta que sostiene el 1:10):** 300 tickets × **5 min** de toque humano = **~25 h-persona** (≈ equipo de 10 a ~2,5 h de toque/día c/u) → con IA: long-tail (285) a revisión ~0,5 min = **2,4 h** + managed (15) IA-prepped ~4 min = **1 h** ≈ **~3,4 h, una persona**. AHT efectivo del toque cae de **5 min → ~0,7 min/ticket (~7×)**. El multiplicador NO es velocidad de tecleo: es la IA absorbiendo el **95% long-tail a toque-cero** y devolviendo las horas al managed que paga. *(AHT solo `[I]` [Zendesk](https://www.zendesk.es/blog/customer-service/satisfaction/average-handle-time/), ajustado por Leo a 5 min.)*

**Reglas de honestidad:**
- Cada número va rotulado `[C/escenario de carga instrumentado]`, **nunca como dato real**.
- **Y nunca se suma:** el long-tail (Y₁) y el managed (Y₂) son dos lógicas distintas y se reportan por separado.
- El valor está en el **mecanismo** (cómo se calcula el quiebre), no en el número concreto. Respuesta anticipada a *"¿de dónde sale el 72h?"* → **"el número es placeholder; lo real es el mecanismo."**

**Apéndice de defensa — book-size por agente (mercado HOY, fuentes re-verificadas verbatim por re-fetch):**

| Modelo de toque | Cuentas/agente | Fuente |
|---|---|---|
| High-touch (enterprise, ACV>$100K) | 22–25 | [Gainsight](https://www.gainsight.com/blog/gainsight-horizon-ai-labs-what-is-the-right-csm-to-customer-ratio/) (22) · [Tunguz](https://tomtunguz.com/how-much-arr-can-a-csm-manage/) (25) · [Fullview](https://www.fullview.io/blog/how-many-accounts-customer-success) (20–50 whale) |
| Mid-touch | 49 | [Gainsight](https://www.gainsight.com/blog/gainsight-horizon-ai-labs-what-is-the-right-csm-to-customer-ratio/) |
| **Tech-touch / SMB** ← el del restaurante | **144–250** | [Gainsight](https://www.gainsight.com/blog/gainsight-horizon-ai-labs-what-is-the-right-csm-to-customer-ratio/) low-touch (144, n=17.034 CSMs) · [Gainsight SMB](https://www.gainsight.com/blog/customer-success-team-planning-cost-benchmarks/) (mediana 100–250; 37% >250) |
| Pooled / scaled (automatización pesada) | ~500 | [CS Collective](https://www.customersuccesscollective.com/scale-customer-success-with-a-high-csm-ratio/) (1:500) |

Triangulación: 10–500 cuentas/CSM general; 85% ≤50 ([Vitally](https://www.vitally.io/post/what-is-the-golden-ratio-of-customer-success-managers-to-customers) · [Tunguz](https://tomtunguz.com/how-much-arr-can-a-csm-manage/)). → **Y(equipo-10) = 10 × 144–250 ≈ 1.500–2.500** (banda SMB tech-touch, la del restaurante).
**Cross-check prueba-de-capacidad `[V]` (separado del número):** el equipo de 2 de Leo cubrió 5.000 = lo que un equipo-de-10 cubre solo en modo **pooled** (10×500) → su célula ya performaba como un equipo-de-10 apalancado **antes de la IA**. Es la credibilidad ("ya viví una versión del 1:10"), no la aritmética del baseline.

---

## 6. Caso de uso — Uber Eats, demo INVERTIDA (motor → freno)

La demo invierte el orden clásico: **primero el motor (volumen), después el freno (gobernanza)**. Así el evaluador ve la potencia antes que las restricciones.

| Acto | Qué pasa | Qué demuestra |
|---|---|---|
| **1. Volumen (motor)** | N casos/screenshots crudos entran a la Inbox → la IA clasifica + agrupa + propone en segundos → **contador 1:10** en pantalla | La absorción de volumen es real y visible |
| **2. El freno** | Content Studio intenta aprobar un lote con un *release* sin anclar → **bloqueo rojo** (fail-closed) | La autonomía está gobernada; no inventa |
| **3. Cluster → spec** | El cluster *"promo-dark"* se convierte en una especificación | El volumen genera inteligencia estructurada |
| **4. Evals roja → verde** | La celda de Evals pasa de ROJA a VERDE → **libera el dial** de autonomía | `liberado_evals` sube con evidencia, no por defecto |
| **5. Acción proactiva** | Resuelve rápido **y** lanza acción en lote para prevenir el próximo caso | Previene, no solo reacciona |
| **6. Acto ofensivo** | Del mismo cohort, los **P90+ listos para upsell** → se rutean al **Managed 1:1** | Previene pérdida **Y** captura expansión (motor de receita) |

**Toggle Musixmatch (1 vez):** se demuestra la **invariancia** — el toggle cambia **vocabulario y modelo de dinero**, pero **nunca los hard-nos ni el `min()`**. Y se **declara dónde la estructura quiebra** (ej.: el percentil dentro de cohort pierde sentido con 3 majors). Honestidad explícita: no se finge operar Musixmatch.

---

## 7. Decisión de dominio

**Uber Eats es el dominio primario.** Es lo que **Leo domina de verdad** (~5.000 restaurantes / 2 personas; segmentación, NBA, price-match). El brief lo manda explícitamente:

> *"Solve a real problem you understand well, not hypothetical; depth over breadth; real hands-on familiarity will show."*

Pivotar a la operación de Musixmatch (adquisición / publishers / letras) sería **hipotético** para Leo → **rechazado**. La profundidad de un dominio vivido se nota; la superficialidad de uno fingido también.

**Musixmatch entra vía toggle**, no como dominio operado:
- El toggle cambia el **vocabulario** (restaurantes → artistas/publishers) y el **modelo de dinero**.
- Prueba la **transferencia** de la estructura sin fingir mano-en-la-masa.
- Mantiene invariantes los hard-nos y la fórmula `min()`.

---

## 8. Gap-fixes incorporados

Lista de correcciones que salieron del triple-check (SAT / PS / Grill / CEO), ya integradas en el diseño:

| # | Gap-fix | Cómo queda incorporado |
|---|---|---|
| 1 | **Demo invertida** | Motor (volumen) antes del freno (gobernanza); X/Y/Z/N fijados en pantalla (§5, §6) |
| 2 | **Red-team en Evals** | Set red-team para que un juez co-sesgado no certifique el error; independencia juez ↔ humano más allá de κ (pantalla 6) |
| 3 | **Gobernanza cross-tenant** | Hard-no: unidad = restaurante individual; nunca un insight identifica la campaña de 1 restaurante (k-anonymity `N≥k`) (pantalla 10). Toggle Musixmatch: Sony ≠ Warner |
| 4 | **Unit economics de la IA** | Costo/decisión × volumen; lección €3→€1; fine-tuning → margen = moat económico (pantalla 11) |
| 5 | **Data-flywheel como moat** | La matriz cohort × intent de Evals calibrados es el dato propietario operacionalizado (pantalla 6) |
| 6 | **Atribución por segmento** | Holdout en long-tail; evidencia + confirmación humana en managed n=1-5; **selos distintos en la UI** (§3, pantallas 1/8) |
| 7 | **Destino GTM / expansión** | Línea de **receita capturada atribuible**; cost-center → motor de receita (Inbox §4, acto 6 §6) |
| 8 | **Provenance en la UI** | `[V]/[I]/[C]` visible; thresholds `[C]` rotulados; respuesta anticipada *"¿de dónde sale el 72h?"* → "el número es placeholder, lo real es el MECANISMO" |
| 9 | **Honestidad de escopo** | La espina (Cerebro → Cohorts → Inbox → Content Studio → Evals) es lo que **rodará** al construir; el resto = **mock explícito** |

---

## 9. Demo de 30 min — en vivo vs narrado

Principio de honestidad: **lo determinista se muestra en vivo; lo longitudinal se narra con `[C]`.**

| Se MUESTRA en vivo (determinista) | Se NARRA con `[C]` (longitudinal) |
|---|---|
| Inbox absorbe N casos + contador 1:10 | Resultado de retención a 72h / semanas |
| Bloqueo rojo del Content Studio (fail-closed) | Curva de costo/decisión €3→€1 en el tiempo |
| Cluster "promo-dark" → spec | Margen vía fine-tuning acumulado |
| Celda de Evals roja → verde libera el dial | Movimiento de percentiles del cohort |
| Ruteo P90+ a Managed 1:1 | Receita de expansión capturada |
| Toggle Musixmatch (invariancia + dónde quiebra) | Atribución por holdout en long-tail |

Regla de oro de la narración: cuando se nombra un número longitudinal, se rotula `[C]` y se aclara que **el valor está en el mecanismo**, no en la cifra.

---

## 10. Top riesgos (declarados)

| # | Riesgo | Mitigación incorporada |
|---|---|---|
| 1 | El brief penaliza el mockup | Decisión consciente: **specs primero, build-ready**; la espina rodará en el próximo ciclo (§8.9) |
| 2 | Inyección indirecta vía texto en screenshot | Texto-en-print = **dato, nunca instrucción** (pantalla 5) |
| 3 | Acción financiera autónoma | **Nunca autónoma** (= lo que mueve saldo); palancas estratégicas → Strategy, de área → Soporte (pantalla 5 / `02` BR-2/BR-13) |
| 4 | Fuga cross-tenant (identificar la campaña de 1 restaurante; toggle: Sony↔Warner) | Hard-no + **k-anonymity `N≥k`** (distinta de `n_min≥20`) (pantalla 10 / `02` BR-3/BR-12) |
| 5 | Juez de Evals co-sesgado certifica el error | Red-team set + independencia juez ↔ humano (pantalla 6) |
| 6 | Rubber-stamp humano (firma sin revisar) | Calibración bipolar anti-rubber-stamp (pantalla 11) |
| 7 | North Star sin atribución = teatro | Atribución como **pre-condición**; selos por segmento (§3) |
| 8 | El toggle Musixmatch se vende como operación real | Honestidad de escopo: se declara dónde la estructura quiebra (§6, §7) |
| 9 | Números `[C]` confundidos con datos reales | Provenance visible en la UI; todo `[C]` rotulado (§8.8) |

---

## 11. Open questions `[I]`

Preguntas abiertas que **Leo decide o defiende** (cada una etiquetada `[I]`):

1. **RESUELTO v1.1 (Leo: "ambos")** `[V]` — valor **"realizado"** del Pro = un caso cuenta SOLO si pasa **dos compuertas**: (A) **confirmado** (`signal_de_resultado` volvió al CRM y **permaneció**, verde-sostenido `[C:D días]`) **Y** (B) **incremental/atribuible** por segmento (holdout long-tail; evidencia+confirmación humana managed n=1-5) — el **incremento** vs el contrafactual, no el resultado bruto. Falla cualquiera → 0; luego se resta `deflection-que-falla`.
2. `[I]` Ventana de atribución por KPI (cuánto tiempo cuenta una acción).
3. `[I]` Holdout en el long-tail **vs** evidencia en el managed (umbral del cambio de método).
4. `[I]` **n mínimo** de cohort para que el percentil sea significativo.
5. `[I]` Churn real (línea base de pérdida).
6. **RESUELTO (06-16)** `[V/C]` — X/Y/Z/N fijados (mecanismo + 3 alternativas por número + fuentes en §5 y en `_design_B_office_hours.md`): **X ≈ 300 tickets/día** (equipo de 10; benchmark IA-asistido ×10, rango 210–500) · **Y = 5% managed / 95% long-tail** (vivido de Leo, núcleo 1:1; nunca sumados) · **Z = ≤24h managed** + long-tail en minutos con calidad · **N% = 12–15% hoy → meta ~7%**. **Delta:** ~25 h-persona (≈10) → ~3,4 h con IA (AHT toque 5 min → ~0,7 min). Valores finales = `[C/escenario]`; anclas (5.000/2 · 20/80→5/95 · 24h · AHT 5 min) = `[V]`; benchmarks (tickets/día · escalación) = `[I]`.
7. `[I]` Quién consume el spec generado y con qué SLA.
8. `[I]` Costo de la **deflection-que-falla** (cuánto resta al North Star).
9. `[I]` Superficie multimodal en el toggle Musixmatch + complementariedad con Music Lens.
10. `[I]` Fine-tuning **sobre qué base** (modelo propio vs Claude).
11. ~~`[I]` Camino de ejecución tipo-B~~ → **RESUELTO: EPIC-6 Investigation Workbench** `[V]` (`03`): diagnóstico determinista → hipótesis-Governing-Thought (híbrido) → plan → ejecución híbrida (NBA→autoriza→IA / acción-mundo→humano) → tracking→acuracidad.
12. ~~`[I]` Host del break-point~~ → **RESUELTO: P11 (Salud del 1:10)** `[V]` (Leo). Reframe: break-point = curva trabajo-de-revisión vs volumen (prueba de flywheel); señales fuenteadas del scorecard de Goals & KPIs; spec-semilla en `03` EPIC-5.
13. **Contrato RESUELTO** `[V]` (`PerformanceFeed` + `OrgGraph` en `03`); **fuente real** del archivo Performance + grafo-org = `[I]` (mock ahora; documento de RH después).

---

### Apéndice — Inventario de specs (`Musixmatch/specs/`, ES)

> Reconciliado `[v1.2]` con la estructura real: el plan original de "3 documentos" evolucionó a **specs por-feature** generadas con el Engine. Inventario vivo; `_archive/` = histórico.

**Base — visión & proceso:**
1. `00_vision_completa.md` — **este documento** (visión, fuente de verdad).
2. `01_e2e_process.txt` — Template A (Contrato → ANTES → DURANTE → DESPUÉS → Gobernanza/anchor-check + variables), con Inbox-engine + demo invertida.
3. `02_user_stories.md` — Template B (user stories de las 11 pantallas; `US-X.Y | MoSCoW | Hito` + Como/quiero/para + Given/When/Then).

**Specs por feature/pantalla (build-ready, una feature por sesión, generadas con el Engine):**
- `01_Cohorts Explorer screen.md` · `02_NBA Playbooks best actions screen.md` · `03_feature_goals_kpis.md`. (Esquema que **reemplaza** a los `pantalla_0X_*` archivados.)

**Tooling (`_*`):**
- `_prompt_feature_breakdown.md` — el **Engine** que genera las specs por-feature.
- `_feature_breakdown_playbook.md` — runbook para usar el Engine y llegar rápido al resultado.
- (+ otros artefactos `_*` de uso/reconciliación en evolución.)

**`_archive/`** — specs antiguos por-pantalla (`pantalla_0X_*`): **histórico, NO usar** (ver `_archive/README.md`).

**Diferido:** build de código (la espina rodando, sembrada) → próximo ciclo. Arquitectura/stack (Supabase + agentes Claude Code, factibilidad del toggle) → con el build.
