# Plataforma de Customer Ops AI-First — Historias de Usuario

**Versión:** 1.0
**Fecha:** 2026-06-15
**Fuentes:** Plan aprobado `ethereal-foraging-kurzweil.md` [V] · Material bruto de stories+rules (LT-/MA-/OP-/AI-/PE- + DET-/SEG-/NBA-SEL-/AUT-/GNS-/ESC-) [V] · Brief take-home Musixmatch + contexto entrevista Pierpaolo [V] · Escala vivida de Leo en Uber Eats (~5.000 restaurantes / 2 personas) [V-vivido]

> **Convenciones de provenance:** `[V]` = verificado contra fuente-de-verdad (brief, plan, transcript, vivencia de Leo) · `[I]` = requiere entrevista / decisión de Leo · `[C]` = placeholder de threshold del candidato (NUNCA dato real de Musixmatch ni de Uber). Todos los umbrales numéricos están etiquetados `[C]`: el número es un placeholder, lo que importa es el MECANISMO.
> **IDs:** `US-M.N` (M = módulo/pantalla, N = secuencia). Campos de datos en `snake_case`. Variables en [corchetes]. Priorización en MoSCoW (MUST/SHOULD/COULD/WON'T).

---

## Parte 1: Contexto

### 1.1 Problema Central

> Una sola persona debe operar como diez. Hoy el soporte de Customer Ops es un **centro de costo reactivo**: el cliente (un restaurante en Uber Eats, un label en Musixmatch) descubre el problema cuando ya perdió dinero — la promo 2x1 que *debería* estar live antes de un feature/email de marketing está **dark** (bug de activación, config errada, timing, aprobación trabada o fuso horario), el restaurante ya se sobre-estocó y escaló equipo, y el pico de demanda llega sin las ventas. El operador caza datos en N sistemas, el cliente re-explica su historia a 3 atendientes, y cuando el ticket se cierra nadie confirma que el resultado **permaneció** ni lo **atribuye** a valor real. La deflection que *parece* éxito (cerrar el ticket reactivando el toggle pero dejando al restaurante sobre-estocado) infla métricas de vanidad y destruye la confianza — la mitad del costo cuando algo falla. El reto no es "responder más rápido": es convertir soporte en **prevención atribuible** sin que la calidad caiga silenciosamente al escalar, y probar con número (no con alegación) que el operador 1:10 entrega apalancamiento REAL.

### 1.2 Personas

| Perfil | Quién es | Comportamiento | Frustraciones | Motivaciones |
|---|---|---|---|---|
| **Dueño de restaurante long-tail** [V] | Cuenta automatizada de cola larga; sube su propia promo (ej. 2x1) que debería coincidir con un feature/email de Uber Eats; no siempre sabe cuándo será destacado. | Auto-servicio; abre contacto inbound (WhatsApp/email/in-app) en pánico durante el pico; no quiere re-explicar; quiere 1 acción primaria de 1 clic. | Descubre el perjuicio *después*: compró estoque y escaló equipo contando con un pico que nunca llegó porque la promo estaba trabada; recibe disculpa genérica en vez de solución. | Que el sistema vigile su promo en proporción al dinero arriesgado, lo avise *antes* con tiempo hábil, y confirme que el resultado permaneció. |
| **Cuenta managed (brand / red grande)** [V] | Cliente high-touch de alto valor (toggle Musixmatch: major/label grande old-school); promociones/créditos de alto $-en-juego por feature; quien paga es Sony/Warner. | Espera relación humana dedicada; QBR; pre-flight de prontitud temprano (T-72h) y re-verificación densa hasta T-0; sensible a costo reputacional. | Promo-dark en un feature de alto perfil = pérdida grande + erosión de marca; migración de adquisición sin CRM (base en email) la deja sin memoria desde el día 1. | Que la atribución sea confirmada, permanente y precificable; que la falla de activación deje de recurrir matando la raíz; reparación proporcional al daño real. |
| **Operador 1:10** [V] | La persona que opera como diez sobre el Cerebro del Cliente; ancla del cockpit; baseline real de Leo: ~5.000 restaurantes / 2 personas en Uber Eats. | Triage en LOTE de correcciones proactivas; concentra atención humana en pocas cuentas high-touch donde dinero y confianza están en riesgo; re-decide activamente (no rubber-stamp). | El apalancamiento se rompe con la aprobación caso-a-caso; quedar como cuello de botella en pico simultáneo; respuesta errada que genera reapertura (contra-métrica dominante). | Sostener el ratio 1:10 (y empujar a 1:6) previniendo decenas de incidentes en la ventana pre-feature; gastar tiempo humano donde rinde más (marca, dinero, raíz). |
| **Producto / Ingeniería** [V] | Dueños del loop soporte→spec; del motor de NBA proactivo; de la capa de conocimiento (`context.md` + KNOWLEDGE versionado); de evals que gatean autonomía; de las integraciones. | Definen contratos de activación verificables, triggers como specs versionadas, golden set + suite de evals; cierran el loop hasta Producto. | El conocimiento del soporte no llega a Producto y la recurrencia no muere en la raíz; sin conocimiento canónico el agente alucina y la deflection vuelve MALA. | Que la causa-raíz se prevenga por producto (deflection BUENA estructural); que el dato propietario limpio y atribuible se vuelva moat fine-tuned. |
| **Liderazgo (Head of Customer Ops)** [V] | Dueño del North Star y de la economía 1:10; debe defender en un panel que la operación es motor de receta, no costo. | Mira la Home autoritativa y la pantalla de Salud del 1:10; manipula en vivo el punto de quiebre (a qué volumen/% de escalación el 1:10 se vuelve 1:6); vigila unit economics de la IA. | Métrica de vanidad que colapsa cuando el sinal no vuelve; autonomía sin eval; gasto de IA sin saber costo/decisión × volumen. | Probar valor realizado CONFIRMADO y ATRIBUIBLE ÷ esfuerzo (cliente+operador), neto de la deflection-que-falla; convertir el data-flywheel en moat económico. |

### 1.3 Métricas

> **North Star [V]:** `valor_realizado_confirmado_y_atribuible ÷ esfuerzo_total (cliente + operador)`, **menos** el costo modelado de la deflection-que-falla. La atribución es **pre-condición técnica única y canónica**: ningún caso entra en el numerador sin que el `signal_de_resultado` vuelva al CRM/Cerebro del Cliente (promo que permaneció / ventas recuperadas / churn evitado). Todos los thresholds abajo son `[C]` — placeholders anclados en la escala REAL de Leo (~5.000 rest / 2 pers) más benchmark público de CS; el número es un placeholder, lo demostrable es el MECANISMO y el **punto de quiebre manipulable en vivo**.

| Tipo | Indicador | Línea Base AS-IS | Objetivo TO-BE |
|---|---|---|---|
| **North Star** | `valor_realizado_confirmado_atribuible ÷ esfuerzo`, neto de deflection-que-falla | Métrica inexistente / de vanidad (cierre de ticket = "éxito") `[C]` | Numerador solo con `signal_de_resultado` de vuelta al CRM; medible y precificable `[C]` |
| **Aritmética 1:10 — `X`** | `tickets_por_dia` absorbidos (equipo de 10 vs. 1 operador + IA) | Equipo de 10 procesa `X` = [tickets/día] `[C/carga instrumentada]` | 1 operador + IA sostiene el mismo `X`; ratio 1:10 (objetivo de quiebre: 1:6) `[C]` |
| **Aritmética 1:10 — `Y` (SPLIT)** | `relaciones` atendidas — **nunca sumado**: `Y₁` long-tail automatizado / `Y₂` managed 1:1 | Ancla vivida Leo: ~5.000 rest / 2 pers → `Y₁` ≈ [cola larga automatizada], `Y₂` ≈ [pocas managed high-touch] `[C]` | Split sostenido: `Y₁` absorbido por IA con holdout; `Y₂` con evidencia + confirmación humana (n=1-5) `[C]` |
| **Aritmética 1:10 — `Z`** | `sla_horas` de detección/resolución por tier | `Z` = [SLA horas] sin verde-sostenido `[C]` | `Z` cumplido solo con verde-sostenido hasta T-0 y durante la ventana del feature `[C]` |
| **Aritmética 1:10 — `N%`** | `tasa_escalacion` real a humano | `N%` = [% escalación] `[C]` | `N%` estable o decreciente sin que la calidad caiga (eval-gated); el quiebre 1:10→1:6 se modela contra `X` y `N%` `[C]` |
| **Calidad / contra-métrica** | `tasa_reapertura` + `contacto_repetido` (sobre TODOS los contactos, a-prueba-de-gaming) + fracción de deflection-MALA | No medida de forma unificada por `restaurant_id`+causa `[C]` | Contra-métrica dominante vigilada; reapertura/regresión revierte el crédito `[C]` |
| **Permanencia / atribución** | `tasa_permanencia` (verde-sostenido ≥ `[C: P checkpoints]`) + `tasa_no_atribuible` | No verificada (cerrar ≠ permaneció) `[C]` | Crédito consolida solo tras permanencia ≥ `[C: 14 días]`; `tasa_no_atribuible` publicada como sinal de salud `[C]` |
| **Economía de la IA** | `costo_por_decision` × volumen; margen post fine-tuning | Costo no instrumentado (lección €3→€1) `[C]` | Costo/decisión decreciente; fine-tuning → margen = moat económico `[C]` |

---

## Parte 2: Historias por Módulo (MECE)

> Los módulos son las **11 pantallas** del cockpit del operador 1:10 sobre el Cerebro del Cliente. Las historias del material bruto (LT-/MA-/OP-/AI-/PE-) se reasignan a la pantalla donde el usuario las vive. Énfasis especial en **M5 (Inbox = Motor de Inteligencia)**.

---

### M1 — Cohorts Explorer

**US-M1.1 | SHOULD | Hito 2**
**Como** operador 1:10, **quiero** ver todos los cohorts con el percentil de cada cuenta dentro de su cohort, el gap hasta el tope y "qué hacen los P90+", **para** entender dónde está el potencial sin esfuerzo y anclar las NBA en el comportamiento de los mejores.
**Criterios de aceptación:**
1. La vista lista cada cohort con `cohort_id`, `tier_base` y conteo de cuentas.
2. **Given** una cuenta en un cohort, **when** abro su fila, **then** veo su `percentil_en_cohort`, el `gap_hasta_top` y un resumen "qué hacen los P90+" (estructura de promo, ventana, fuso).
3. El cohort de comparación se determina por regla versionada (mismo `tier_base` + atributos canónicos), nunca ad-hoc [SEG-R5].
4. **Given** que el `knowledge_de_cohort` está ausente o sesgado (pocos datos), **then** no se emite score que parezca autoritativo; se degrada a regla determinística mínima y se señala la laguna [SEG-R5/DET-09 on_fail].
5. Datos de un restaurante nunca cruzan al benchmark de otro salvo como agregado de cohort anonimizado [AUT-08].

**US-M1.2 | SHOULD | Hito 2**
**Como** Producto/Eng, **quiero** un `config_health_score` por cuenta que compare la config de la promo contra el patrón de promos exitosas del mismo cohort/tier (estructura, ventana, fuso, mapeo de ítems, estado de aprobación), **para** prevenir la CLASE de fallas de activación, no solo la instancia.
**Criterios de aceptación:**
1. El score se computa con entradas explícitas `[C: pesos]` y es auditable [SEG-R5/DET-09].
2. **Given** una desviación que históricamente precede falla de activación (fuso ≠ fuso del restaurante; ventana terminando antes del pico típico; aprobación típicamente trabada), **then** se marca `riesgo-de-config` de baja severidad como **prior silencioso** — NO contacto proactivo en masa [DET-09].
3. El prior silencioso eleva la prioridad en el pre-flight cuando un feature sea agendado; solo se vuelve contacto si cruza el piso de severidad [DET-07/DET-09].

---

### M2 — NBA / Playbooks

**US-M2.1 | MUST | Hito 1**
**Como** operador 1:10, **quiero** que cada NBA proponga la acción que remedia la RAÍZ (no el síntoma) con un playbook tipo "P40→P70 haga X" y un chip visible del nivel efectivo `min(pedido_NBA, liberado_evals, teto_tier)`, **para** decidir en 1 clic lo que importa en dinero sabiendo exactamente cuánta autonomía hay.
**Criterios de aceptación:**
1. El motor enumera el espacio MECE de acciones ligado a las causas-raíz canónicas: `A1` reactivar/republicar toggle, `A2` corregir/compensar fuso, `A3` (re)agendar/activar publicación, `A4` destrabar/escalar aprobación, `A5` corregir config a 1:1, `A6` mitigación económica, `A7` NO-AGIR/observar, `A8` alertar al dueño con 1 acción de 1 clic [NBA-SEL-02].
2. **Given** ≥1 candidata de raíz sobre el piso de confianza, **when** el motor selecciona, **then** elige primero la que corrige la causa-raíz y RESTAURA el estado observable (promo live en la superficie del consumidor), en orden lexicográfico: (1) causa-raíz verificada, (2) restaura `live_state`, (3) idempotente bajo lock por `restaurant_id`, (4) before/after + provenance grabable [NBA-SEL-03].
3. Toda candidata declara: causa-raíz, reversibilidad, si toca dinero/términos, idempotencia, y si es COMPUESTA (componente técnico + componente que mueve dinero) [NBA-SEL-02/08].
4. **Given** múltiples acciones de raíz válidas, **then** se ranquean por `f($-en-riesgo-atribuible, tiempo-restante, reversibilidad, prob-de-fix)`; entre scores próximos gana la más reversible/idempotente; se respetan dependencias (destrabar A4 antes de A1 si A1 depende de aprobación) [NBA-SEL-04].
5. Acciones que no atacan ninguna causa-raíz se descartan (prohibido "agir por agir") [NBA-SEL-02].

**US-M2.2 | MUST | Hito 1**
**Como** motor de NBA en autonomía BAJA, **quiero**, para triggers de causa auto-corregible y bajo riesgo (no-publicada por timing/fuso, config probadamente 1:1), ejecutar la corrección bajo lock idempotente por `restaurant_id` y grabar acción + before/after + provenance en el Cerebro, **para** que la promo entre al aire antes del pico sin esfuerzo humano (deflection BUENA).
**Criterios de aceptación:**
1. **Given** el read-back de fuente INDEPENDIENTE (superficie consumidor / price-match live) no confirma la permanencia, **then** el caso NO se cierra: reabre como ALTO/escala con motivo "ejecutó pero no permaneció" [AUT-15/NBA-SEL-03].
2. Read-back auto-referente (releer la config que el propio agente escribió) está PROHIBIDO [NBA-SEL-03].
3. La autonomía puede EJECUTAR pero NO auto-atestar "resuelto/permaneció/al aire" solo porque el write devolvió OK [AUT-15].

---

### M3 — Goals & KPIs (Home)

> **[Reframe v1.1 — spec: `specs/03_feature_goals_kpis.md`]** M3 = feature standalone **Goals & KPIs** (scorecard jerárquico: Empresa/Personal/Procesos, lagging→leading, histórico→previsibilidad, acción sugerida con aprobación humana). **US-M3.1** queda **superseded** en su parte "fila + Aritmética 1:10 + break-point": el scorecard se especifica en `03`; la prueba 1:10 / break-point se reasigna a **P11/§5** (host `[I]`, vision §11.12). **US-M3.2 se PRESERVA** (se re-aloja bajo Goals & KPIs — valor realizado/deflection sigue siendo MUST, mapea a la regla de "solo valor confirmado y atribuible").

**US-M3.1 | MUST | Hito 2** _(parcialmente superseded — ver nota de reframe arriba)_
**Como** liderazgo, **quiero** una única fila autoritativa de objetivos y KPIs con la **Aritmética del 1:10** (`X` tickets/día, `Y` SPLIT long-tail/managed, `Z` SLA, `N%` escalación) y un **punto de quiebre manipulable en vivo**, **para** demostrar con número (no alegación) a qué volumen/% el 1:10 se vuelve 1:6.
**Criterios de aceptación:**
1. La Home muestra `X`, `Y₁`, `Y₂`, `Z`, `N%` como variables `[C/carga instrumentada]`, nunca como dato real; `Y₁` y `Y₂` se muestran SPLIT, jamás sumados.
2. **Given** que muevo el slider de volumen o de `N%` escalación, **when** cruza el umbral modelado, **then** la UI recalcula el ratio efectivo y muestra el quiebre 1:10→1:6 anclado en la escala vivida (~5.000 rest / 2 pers) [V-vivido].
3. Existe una única fila autoritativa de casos; no hay colas duplicadas por canal [DET-06].

**US-M3.2 | MUST | Hito 1**
**Como** operador 1:10, **quiero** ver por incidente y por cohort el valor REALIZADO confirmado y atribuible — $ de ventas protegidas/recuperadas y sobre-estoque evitado, MENOS el costo modelado de la deflection-que-falla — con verificación de permanencia y la contra-métrica de reapertura lado a lado, **para** probar el North Star con número y detectar temprano la resolución cosmética.
**Criterios de aceptación:**
1. **Given** que el `signal_de_resultado` no volvió al CRM, **then** el caso cuenta 0 — NUNCA valor estimado/presumido [GNS-02].
2. La verificación de permanencia exige verde-sostenido (resultado se mantuvo tras `[C: D días]`) [OP-P2/GNS-03].
3. La contra-métrica de reapertura/contacto-repetido se mide sobre TODOS los contactos, unificada por `restaurant_id`+causa (nunca por canal) [GNS-03].
4. **Given** un término sin modelo explícito (ej. "erosión de confianza"), **then** entra como `0-con-flag` ("término no modelado"), nunca un número inventado [GNS-04].

---

### M4 — Content Studio

**US-M4.1 | MUST | Hito 1**
**Como** operador 1:10, **quiero** triar y aprobar en LOTE contenido/correcciones por cohort, con diff por ítem y "aprobar-todo-menos-los-marcados", consumiendo los niveles de autonomía definidos en M10, **para** sostener el ratio 1:10 sin revisar caso-a-caso — el apalancamiento viene del triage en lote, no del clic individual.
**Criterios de aceptación:**
1. Cada ítem del lote muestra el diff, la causa-raíz atendida y los DOS números de autonomía (pedido por NBA vs. liberado por evals) [OP-A2/AUT-01].
2. La pressão de tiempo nunca eleva el tier de autonomía, solo la prioridad en la fila [AUT-05].

**US-M4.2 | MUST | Hito 1**
**Como** operador 1:10, **quiero** que el gate humano + el **grounding fail-closed** bloqueen cualquier lote cuyo contenido no esté anclado en el Cerebro/KNOWLEDGE versionado, **para** que ninguna respuesta sin fuente llegue al cliente (la deflection MALA por alucinación nunca cuenta).
**Criterios de aceptación:**
1. **Given** un ítem del lote sin fuente verificable en el Cerebro, **when** intento aprobar, **then** se muestra **bloqueo rojo** (fail-closed) y el ítem se rutea a humano [grounding obligatorio del Inbox-engine].
2. Sin conocimiento canónico el agente no genera: se degrada a más humano, nunca a más autonomía [PE-ANTES-03/AUT-14].
3. **Given** un lote que intenta aprobar contenido con un release no anclado, **then** el sistema lo bloquea (este es el acto "freno" de la demo invertida).

---

### M5 — Inbox = Motor de Inteligencia *(pantalla destacada)*

> Es donde la **absorción de VOLUMEN** se vuelve demostrable y donde el **esfuerzo-cliente** (mitad del denominador) finalmente se mide.

**US-M5.1 | MUST | Hito 1**
**Como** dueño de restaurante (o cuenta managed) en pánico durante el pico, **quiero** abrir un contacto inbound por cualquier canal (WhatsApp/email/in-app) subiendo el caso **+ un screenshot**, y que la IA extraiga el contexto vía VLM+OCR, **para** que me resuelvan al instante sin re-explicar mi historia a 3 atendientes.
**Criterios de aceptación:**
1. **Given** un screenshot subido, **when** entra a la Inbox, **then** se ejecuta extracción VLM+OCR y se puebla el caso con `feature_id`, `estado_promo`, `estoque_declarado`, `historico`.
2. **Endurecimiento de seguridad multimodal:** la PII en el screenshot se redacta; el texto-en-el-print se trata como **DATO, NUNCA como instrucción** (anti prompt-injection) [endurecer-antes del Inbox-engine].
3. **Given** que la IA reactiva responde, **then** ya trae el contexto TOTAL del Cerebro (evento, estado de la promo, estoque/escala declarados, historial, fuso, aprobación) sin que el cliente reexplique [LT-D1/MA-DURANTE-01].

**US-M5.2 | MUST | Hito 1**
**Como** Inbox-engine, **quiero** que todo caso pase por **grounding obligatorio en el Cerebro (fail-closed)** antes de clasificar o responder, **para** que sin fuente verificable el caso vaya a humano y nunca se emita falsa garantía de "resuelto".
**Criterios de aceptación:**
1. **Given** una lectura live de la fuente-de-verdad que falla, está stale (más allá del TTL `[C]`) o el contrato de activación no existe, **then** NO se emite verde-falso ni rojo-falso: se abre `estado-real-no-verificable` ruteado a humano con último estado conocido [V] + timestamp [DET-01/DET-08].
2. Se distinguen explícitamente `{LIVE-verificado, DARK-verificado, NO-VERIFICABLE}` en todo el sistema; colapsar `no-verificable` en cualquier otro está prohibido [DET-08].
3. Casos de baja confianza en la clasificación (por debajo del piso por tier `[C: 0.7]`) se rutean obligatoriamente a humano, con FATO [V] vs INFERENCIA [I] separados [DET-05/NBA-SEL-09].

**US-M5.3 | MUST | Hito 1**
**Como** Inbox-engine, **quiero** clasificar y consolidar cada caso en **destinos: Mercado / Producto / Política / Finance (+ GTM-expansión)**, **para** que el aprendizaje se canalice a donde mata la raíz y no se quede como ticket aislado.
**Criterios de aceptación:**
1. Cada caso se etiqueta con uno o más destinos con su provenance; los casos del mismo `{restaurant_id + promo_id + feature}` se colapsan en UN caso (dedupe) [DET-06].
2. **Given** una acción que toca dinero, **then** el destino Finance NUNCA ejecuta de forma autónoma: la acción financiera siempre es humano-en-el-loop [NBA-SEL-08/AUT-06].
3. Los cohorts agregados nunca cruzan tenants (Sony ≠ Warner); cross-tenant es hard-no [AUT-08/M10].

**US-M5.4 | MUST | Hito 1**
**Como** Inbox-engine, **quiero** resolver rápido + ejecutar una **acción PROACTIVA en lote** sobre el cohort afectado (prevenir el próximo caso), **para** que el soporte migre de "resolver caso a caso" a "producto mata la raíz".
**Criterios de aceptación:**
1. **Given** un cluster del mismo tipo (promo-no-al-aire antes de feature), **when** se resuelve, **then** se propone una acción proactiva en lote para el resto del cohort en riesgo [AI-DEPOIS-02].
2. La acción proactiva respeta el nivel efectivo `min(pedido, liberado, teto_tier)` y el read-back independiente [NBA-SEL-06/AUT-15].

**US-M5.5 | MUST | Hito 1**
**Como** liderazgo, **quiero** un **contador de volumen** visible en la Inbox — "`X` absorbidos / `Y` a humano / `N%` escalación" — **para** que la absorción de volumen del 1:10 sea demostrable en vivo y el esfuerzo-cliente quede medible.
**Criterios de aceptación:**
1. El contador muestra en tiempo real `casos_absorbidos_ia`, `casos_a_humano` y `tasa_escalacion` `[C/carga instrumentada]`.
2. **Given** que la mejora del contador coincide con caída del número de contactos registrados (posible canal escondido), **then** el detector de deflection-MALA invalida la mejora [GNS-06].
3. El contador alimenta la Aritmética 1:10 de la Home (M3) y el punto de quiebre manipulable.

**US-M5.6 | SHOULD | Hito 1**
**Como** operador 1:10, **quiero** que al abrir un incidente ACTIVO vea el Cerebro ya cargado (estado+memoria, promo, estado real del toggle/campaña, timeline del feature, estoque escalado, hipótesis de causa-raíz) con separación explícita entre fato verificado [V] e inferencia del agente [I], **para** resolver en una pasada sin caza de datos en N sistemas.
**Criterios de aceptación:**
1. El panel del caso separa visualmente [V] de [I] [OP-D1].
2. **Given** un inbound reactivo durante el pico, **when** existe un trigger proactivo previo del mismo caso, **then** el inbound se ANEXA al sinal proactivo ("avisamos en T-24h y no se corrigió"), nunca caso huérfano [DET-06/AI-DURANTE-01].

---

### M6 — Evals & Fine-tuning

**US-M6.1 | MUST | Hito 1**
**Como** Producto/Eng, **quiero** mantener un golden set + suite de evals por celda `cohort × intent` que determine la `autonomia_liberada` por capacidad (bajo/medio/alto), de modo que el nivel efectivo = `min(pedido_NBA, liberado_evals)`, **para** que la autonomía sea verdadera y segura — el agente solo actúa solo donde los evals prueban calidad.
**Criterios de aceptación:**
1. **Given** la celda `cohort × intent` sin eval (nunca corrido / sin golden set), **then** se trata como `liberado = humano (alto)`: "sin eval" ≠ "eval verde" [NBA-SEL-06/AUT-03].
2. Promover autonomía exige **humano + evidencia**; rebajar es **automático** ante regresión por tipo de caso [OP-G2/AUT-10].
3. La re-elevación post-downgrade exige eval-verde + firma humana; el loop nunca auto-re-eleva [GNS-06].

**US-M6.2 | MUST | Hito 1**
**Como** Producto/Eng, **quiero** un **red-team set** y la verificación de independencia juez↔humano (más allá de κ), **para** que un juez co-sesgado no certifique el error y la calidad no caiga silenciosamente al escalar.
**Criterios de aceptación:**
1. El red-team set incluye casos adversariales (ej. componente comercial OCULTO dentro de acción "técnica") [NBA-SEL-08].
2. **Given** regresión por tipo de caso (ej. empeoró en detectar promo-dark por FUSO), **then** se rebaja automáticamente la autonomía SOLO de ese sub-caso, no del dominio entero [AUT-10].
3. La calibración apunta a evitar el rubber-stamp (objetivo bipolar anti-rubber-stamp) [M11].

---

### M7 — Ficha / Cerebro del Cliente (raíz)

**US-M7.1 | MUST | Hito 0**
**Como** Producto/Eng, **quiero** que el Cerebro del Cliente sea la raíz versionada que graba el episodio completo (riesgo detectado → acción → resultado → permanencia → valor atribuido) con provenance, **para** que cada caso resuelto aumente la capacidad preventiva y reduzca el esfuerzo por unidad de valor (moat de memoria).
**Criterios de aceptación:**
1. **Given** un caso cerrado, **then** se graba en el estado/memoria del restaurante el episodio con provenance, y el aprendizaje se ingiere en la capa de KNOWLEDGE versionada [AI-DEPOIS-03].
2. Cada promo persiste un `contrato_de_activacion` verificable: `estado_esperado`, `ventana_inicio`/`ventana_fin`, `timezone_restaurante`, `vinculo_evento_demanda` (FEATURE/EMAIL) [PE-ANTES-01].
3. **Given** datos sensibles (ventas, estoque, margenes, contacto), **then** se protegen, se usan solo para resolver/prevenir, y el cliente puede optar por salir de contactos proactivos sin perder el soporte reactivo [LT-G2].

**US-M7.2 | MUST | Hito 0**
**Como** capa de seguridad/PII/moat, **quiero** garantizar PII + minimización + aislamiento por tenant/`restaurant_id` con trilla de quién-accedió-qué en todo acceso/escritura/intercambio de contexto entre agentes, **para** que el valor y la memoria del cliente se protejan y el moat de datos no se vuelva pasivo de seguridad.
**Criterios de aceptación:**
1. **Given** un acceso que violaría minimización o cruzaría tenants, **then** la acción se bloquea/rebaja, nunca se ejecuta autónoma [AUT-08/AI-GOV-02].
2. Dato de un restaurante NUNCA llega al diagnóstico/benchmark de otro salvo como agregado de cohort anonimizado [AUT-08].

---

### M8 — Managed 1:1 *(momento en vivo)*

**US-M8.1 | SHOULD | Hito 2**
**Como** operador 1:10 sobre una cuenta managed (quien paga es Sony/Warner), **quiero** un panel de prontitud por cohort que ranquea las managed por `(probabilidad_promo_dark × valor_en_juego)` y por SLA/tier, con benchmark vs. cohort y la NBA sugerida + nivel de autonomía por línea, **para** concentrar la atención humana en las pocas cuentas high-touch donde dinero y confianza están en riesgo.
**Criterios de aceptación:**
1. Cada línea expone fuente-de-verdad del estado esperado, gap de tiempo hasta el pico, causa-raíz probable, $-en-riesgo con inputs visibles, NBA y los DOS números de autonomía [MA-ANTES-03/SEG-R7].
2. Re-tiering solo SUBE durante ventana de riesgo (un long-tail con 2x1 que coincide con un feature y cruza `[C: umbral crítico]` se promueve a managed-por-la-ventana); nunca rebaja un caso activo para economizar toque [SEG-R4].

**US-M8.2 | SHOULD | Hito 2**
**Como** operador 1:10, **quiero** preparar un QBR de una cuenta managed en minutos (apalancamiento-en-la-preparación), **para** demostrar en vivo que la relación high-touch se sostiene aun absorbiendo volumen — y capturar expansión (upsell de P90+ del mismo cohort).
**Criterios de aceptación:**
1. **Given** una cuenta managed, **when** preparo el QBR, **then** el sistema sintetiza historial, valor realizado atribuible, riesgos y oportunidades en minutos.
2. **Given** el sexto acto ofensivo de la demo: P90+ del mismo cohort listos para upsell, **then** se rutean al Managed 1:1 (prevenir pérdida E capturar expansión) [caso de uso §6º acto].
3. Toda mitigación económica (extender promo, compensar fee) es ALTO con aprobación humana activa registrada (re-decisión, no aceptar-de-1-clic) [MA-DEPOIS-02/NBA-SEL-07/ESC-R02].

---

### M9 — Onboarding / Bootstrap

**US-M9.1 | MUST | Hito 0**
**Como** responsable de absorber cuentas managed venidas de adquisición/migración (sin CRM, base en email), **quiero** que la capa de ingestión + KNOWLEDGE incorpore historial/configs de promo y que el pre-flight de promo-dark funcione para ellas desde el primer feature bajo las MISMAS políticas y evals, **para** que las cuentas migradas no caigan en el mismo hueco por falta de memoria/proceso.
**Criterios de aceptación:**
1. **Given** una cuenta cold-start sin inputs canónicos, **then** recibe `tier_provisorio` conservador (default = tier más humano) marcado como tal, que converge al definitivo conforme llega dato real; cold-start nunca clasifica para abajo por falta de dato [SEG-R6].
2. **Given** que la ingestión de KNOWLEDGE falla o el tenant no puede aislarse con seguridad, **then** NO se opera autónomamente: se mantiene en tier humano [SEG-R6/AUT-12].
3. NINGÚN resultado obtenido en cuenta cold-start entra al numerador hasta que la atribución cierre en el CRM; hasta ahí todo trabajo es costo puro (denominador) [SEG-R6/AUT-12].

---

### M10 — Política & Trinca + Mapa de Tier

**US-M10.1 | MUST | Hito 0**
**Como** responsable de la gobernanza de autonomía, **quiero** que toda acción de la IA esté regida por la **TRINCA** (política versionada + entrada en `context.md` + KNOWLEDGE versionado), con nivel efectivo = `min(pedido_NBA, liberado_evals, teto_tier)` y trilla de auditoría completa, **para** que la autonomía sea verdadera y auditable, sin que la IA tome acción de alto riesgo sin respaldo.
**Criterios de aceptación:**
1. **Given** que falta o diverge CUALQUIER ancla de la trinca, **then** la acción se recusa/rebaja a ALTO (escala-con-motivo, motivo "ancla X ausente"); la trinca se chequea A CADA acción, no una vez por sesión [AUT-07/AI-GOV-01].
2. En el núcleo del `min()`, si cualquier entrada es nula/ausente/ilegible, se sustituye por el tier más conservador ANTES del `min` — "sin eval" ≠ "sin restricción" [AUT-01].
3. El par `(nivel_pedido, nivel_liberado)` se exhibe SIEMPRE al operador, nunca solo el resultado [AUT-01/OP-G1].
4. **Invariante universal:** ante cualquier falla/ambigüedad, el nivel efectivo se mueve hacia MÁS humano, NUNCA hacia más autonomía; no existe fail-open [AUT-14].

**US-M10.2 | MUST | Hito 0**
**Como** dueño de restaurante cuyo dinero está en juego, **quiero** que acciones que tocan dinero o términos comerciales NUNCA se ejecuten autónomamente (siempre humano-en-el-loop y motivo registrado), **para** confiar en que la automatización me protege y no toma decisiones financieras irreversibles sin supervisión.
**Criterios de aceptación:**
1. **Given** una acción (o sub-componente, si es compuesta) que altera precio, fee, compensación, crédito o términos, **then** se fija en tier ALTO (escala-con-motivo); teto duro categórico, evaluado ANTES del `min()` [LT-G1/AUT-06/NBA-SEL-08].
2. **Given** una acción "técnica" con componente comercial OCULTO (ej. republicar toggle que reaplica un descuento expirado), **then** el motor la decompone: el componente técnico puede correr en tier inferior, el comercial se bloquea a humano [NBA-SEL-08].
3. **Given** ambigüedad sobre si la acción "toca dinero", **then** se asume que SÍ → escala [AUT-06 on_fail].

**US-M10.3 | MUST | Hito 0**
**Como** responsable de gobernanza cross-tenant (GDPR/contrato; Sony ≠ Warner), **quiero** que el aislamiento por tenant sea un **hard-no** inviolable en la Política, **para** que datos de un cliente managed nunca crucen a otro ni siquiera por conveniencia operacional.
**Criterios de aceptación:**
1. **Given** una atribución ambigua entre tenants, **then** NUNCA se resuelve "a la suerte"; cruza con el aislamiento por tenant y se rutea a humano [AUT-16/AUT-08].
2. Los cohorts agregados nunca cruzan tenants; solo agregado anonimizado [AUT-08].

**US-M10.4 | MUST | Hito 0**
**Como** capa L3 de segmentación, **quiero** clasificar exactamente un `tier_base` (managed-brand / managed-midmarket / long-tail-automatizado) por cuenta a partir de inputs explícitos y versionados, **para** que el mapa de tier sea un FATO [V] auditable y no inferencia silenciosa.
**Criterios de aceptación:**
1. Mapeo: managed-brand → high-touch (humano dueño, IA asiste); managed-midmarket → híbrido; long-tail → automatizado [SEG-R1].
2. MECE: cada cuenta cae en uno y solo un tier-base; long-tail = complemento de managed (sin hueco, sin overlap) [SEG-R1].
3. **Anti-gaming:** sub-clasificar para abajo no reduce esfuerzo-medido a favor de la métrica; toda cuenta clasificada abajo que después reabre alimenta la contra-métrica y dispara auditoría de mis-tiering [SEG-R1].
4. **Given** inputs ausentes/en conflicto o tier `stale`, **then** se clasifica provisoriamente en el tier MÁS humano aplicable, marcado `tier-provisorio-degradado` [SEG-R1 on_fail].

---

### M11 — Salud del 1:10

**US-M11.1 | SHOULD | Hito 2**
**Como** liderazgo, **quiero** una pantalla de Salud del 1:10 con la **economía unitaria de la IA** (`costo_por_decision` × volumen; lección €3→€1; fine-tuning → margen) y el punto de quiebre del ratio, **para** convertir Customer Ops de centro de costo en motor de receta defendible.
**Criterios de aceptación:**
1. La pantalla muestra `costo_por_decision`, volumen y margen post fine-tuning `[C]` con inputs visibles.
2. Existe una línea de RECETA-CAPTURADA-ATRIBUIBLE (destino GTM/expansión) separada del valor protegido [destino GTM del plan].
3. El data-flywheel (matriz `cohort × intent` de evals calibrados) se expone como moat: el dato propietario operacionalizado [data-flywheel del plan].

**US-M11.2 | SHOULD | Hito 2**
**Como** liderazgo, **quiero** un objetivo de calibración bipolar anti-rubber-stamp sobre la salud de la operación, **para** garantizar que el ganho de escala nunca venga de calidad cayendo silenciosamente ni de un operador que aprueba todo.
**Criterios de aceptación:**
1. **Given** que la `tasa_no_atribuible`/excluidos cruza `[C: límite]`, **then** la elevación de autonomía se CONGELA (gate anti-muestra-sesgada): un sinal "bueno" sobre conjunto curado es ilusorio [GNS-06].
2. La contra-métrica se mide sobre TODOS los contactos (a-prueba-de-gaming) [GNS-03/GNS-06].
3. **Given** volumen bajo (sinal estadísticamente débil, `[C: n mínimo]`), **then** en la duda se mantiene o se rebaja; nunca se eleva con muestra insuficiente [GNS-06].

---

## Parte 3: Riesgos y Supuestos

| Supuesto | Riesgo si falla | Plan B |
|---|---|---|
| El caso héroe Uber Eats es el dominio que Leo domina de verdad (mano-en-la-masa) [V] | Pivotar a operación Musixmatch (publishers/letras) sería hipotético → el brief penaliza profundidad fingida | Mantener Uber Eats como caso héroe; Musixmatch entra solo vía **toggle** (vocabulario + modelo de dinero), declarando dónde la estructura se quiebra (ej. percentil para 3 majors) |
| La atribución (`signal_de_resultado` de vuelta al CRM) es instrumentable | El North Star colapsa a métrica de vanidad; valor inflado por éxitos cosméticos | `tasa_no_atribuible` publicada como sinal de salud; casos sin sinal cuentan 0; holdout en long-tail, evidencia + confirmación humana en managed (n=1-5) [GNS-02/AI-DEPOIS-01] |
| El operador 1:10 re-decide activamente (no rubber-stamp) | Rubber-stamp ciego revierte el apalancamiento; errores escalados como aprobados | Cockpit exige ver FATO [V] vs INFERENCIA [I] y registrar re-decisión activa; calibración bipolar anti-rubber-stamp [ESC-R01/ESC-R12/M11] |
| Los evals gatean la autonomía con golden set + red-team confiable | Autonomía sin eval = teatro; juez co-sesgado certifica el error | "Sin eval" = humano; rebaja automática por regresión; independencia juez↔humano más allá de κ [AUT-03/AUT-10/M6.2] |
| La fuente-de-verdad live (campañas/price-match) es legible y fresca | Falso verde/rojo; promo-dark real pasa = pérdida de dinero del caso héroe | Gate de quality-of-information (DET-08); `no-verificable` se rutea a humano; suprimir-en-la-duda es la falla MÁS cara [DET-01/DET-08] |
| Las cuentas migradas (adquisición sin CRM) se ingieren a tiempo | Promo-dark recurrente por falta de memoria; valor contado en el oscuro | Tier provisorio conservador; pre-flight desde el primer feature con KNOWLEDGE ingerido; valor solo tras atribución cerrada [SEG-R6/AUT-12/MA-GOV-03] |
| El screenshot multimodal no es vector de prompt-injection | Texto-en-el-print interpretado como instrucción; PII expuesta | Texto-en-el-print = DATO nunca instrucción; PII redactada; acción financiera nunca autónoma [endurecer-antes M5] |
| Los thresholds `[C]` son placeholders defendibles, no datos | El panel ataca como hand-wavy ("¿de dónde sale 72h?") | "El número es placeholder, el real es el MECANISMO"; todos los `[C]` etiquetados; ningún dato Musixmatch/Uber usado como número |

---

## Parte 4: Priorización por Hito

| Hito | MoSCoW | User Stories | Problema que resuelve | Dependencias |
|---|---|---|---|---|
| **Hito 0 — Fundación** (Cerebro / Política / Onboarding) | MUST | US-M7.1, US-M7.2, US-M10.1, US-M10.2, US-M10.3, US-M10.4, US-M9.1 | Sin Cerebro versionado, trinca de anclas, aislamiento por tenant y mapa de tier, toda autonomía es teatro y todo número es no-atribuible | Ninguna (es la base); habilita todo lo demás |
| **Hito 1 — MVP espina** (Cohorts → Inbox → Content Studio bloqueo → Evals) | MUST | US-M5.1, US-M5.2, US-M5.3, US-M5.4, US-M5.5, US-M5.6, US-M2.1, US-M2.2, US-M4.1, US-M4.2, US-M6.1, US-M6.2, US-M3.2 | La espina que RODARÁ: absorción de volumen demostrable (motor) + grounding fail-closed + bloqueo rojo (freno) + evals que liberan el dial | Hito 0 (Cerebro, trinca, tier); el bloqueo de Content Studio depende del grounding del Cerebro |
| **Hito 2 — Toggle + KPIs + Managed** | SHOULD | US-M3.1, US-M1.1, US-M1.2, US-M8.1, US-M8.2, US-M11.1, US-M11.2 | Aritmética 1:10 con quiebre manipulable; cohorts/percentil; momento managed en vivo (QBR + upsell); economía unitaria de la IA; toggle Musixmatch (invariancia: cambia vocabulario, nunca hard-nos/`min()`) | Hito 1 (Inbox-engine alimenta el contador 1:10; evals alimentan la matriz `cohort × intent`) |
| **Hito 3 — GTM / expansión + flywheel** | COULD | (Extensiones de US-M11.1 receta-capturada; US-M8.2 upsell ofensivo a escala; data-flywheel como producto) | Cerrar el loop cost-center → motor de receta; data-flywheel como moat económico operacionalizado | Hitos 1-2 (matriz de evals calibrados = el dato propietario; managed 1:1 = canal de expansión) |

---

*Documento de Historias de Usuario (Template B) — Plataforma de Customer Ops AI-First. Caso héroe: Uber Eats (dominio vivido por Leo), toggle Musixmatch demostrado 1× para invariancia. Todos los thresholds son `[C]` placeholders del candidato; ningún dato real de Musixmatch o Uber fue usado como número. Provenance `[V]`/`[I]`/`[C]` a lo largo del documento. El número es un placeholder; lo demostrable es el MECANISMO. — v1.0, 2026-06-15.*
