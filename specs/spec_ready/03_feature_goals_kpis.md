# Goals & KPIs — Feature Breakdown (saída do Engine)

> Entregáveis do Feature Breakdown Engine sobre o modelo validado com Leo (iterações 1–3 desta sessão). Domínio concreto: Uber Eats (transfere a Musixmatch — mudam os KPIs, não a estratégia). Saída em ES, com provenance `[V]/[I]/[C]`.
> **Grounding pin:** `specs/00_vision_completa.md` **v1.2** · 2026-06-15 · Aprobado. Ancla motor + `min()` (§2), North Star (§3), hard-nos (§8/§10).
> **Reframe (decidido por Leo, iter 3 · H=sí):** esta feature **reemplaza** la definición vieja de "Pantalla 3 — Home (fila + Aritmética 1:10)". P3 ahora = **Goals & KPIs**, una feature standalone de medición. (Actualizar `00_vision_completa.md §4-P3` y `02_user_stories.md M3` — pendiente OK de Leo, OQ#8.)

## ✅ Estado: EMIT-READY (iter 13 — 3ª verificación completa, 4 críticos, fixes aplicados)
> Histórico: 1ª verif = back-to-interview → Q9-Q13 + diseño Q11 integrados → 2ª verif (iter-7) = emit-with-minor-fixes → 3ª verif COMPLETA (iter-13, 4 críticos, ground-truth completo) = **emit-with-minor-fixes** y los **3 bloqueantes finales aplicados**: (1) roster "9 agentes" → cardinalidad `[I]` (lente+roster de la tabla de Leo `[V]`); (2) router A/B **constructable** (nba_id+cohort_id+intent+envelope a P02); (3) contrato `named_query` (registro+firma+retorno). + struck de contradicciones (host=P11 `[V]`, Q6 resuelto, OQ resueltas) + schema-hygiene (PKs, aciclicidad, predicado de scope evaluable). **Residual cosmético:** ✅ **cerrado (iter-14)** — seam EPIC-3/6 (eje horizontal/vertical + reuso), clase→source dispatch en EPIC-4, 10 señales renumeradas + atadas a BR-1/BR-10. Resoluciones abajo:
>
> **R-Q9 — Ejecución de una acción aprobada (predicado A/B). `[V]`** **A** sii la acción instancia una NBA **customer-facing A1-A8 sobre un cohort** → se ejecuta vía **`specs/02_NBA Playbooks best actions screen.md`** (tablero del `min()`, firmado). **B** = cualquier otra (interna / de performance) → **EPIC-6 Investigation Workbench** (diseñado iter-10). ⚠️ **Verdad de alcance:** el canal tipo-A (P2/cockpit) SOLO ejecuta A1-A8; **la mayoría** de las acciones son tipo-B → su ejecución vive en EPIC-6 (diagnóstico + hipótesis-Governing-Thought + plan + ejecución híbrida + tracking).
> **R-Q10 — Def canónica ejecutable. `[V]`** `como_se_mide` = **fórmula estándar de la empresa**, expresada como **DSL/fórmula** o **named-query**, ejecutada por el agente en **Python/SQL determinista — NUNCA un LLM** (para no introducir variación). El campo libre `texto` se reemplaza por `metric_expression | named_query` + `source_ref` + `unit` + `def_version`.
> **R-Q11 — Contrato de ingesta de Performance/RH (adjacente, solo-consumo). `[I]` propuesta (4 lentes):** **Síntesis:** Performance entra como un **archivo firmado por RH**, read-only, que la feature solo lee y **nunca calcula ni edita**; si falta/viejo/malformado/sin-firma → **falla visible**, nunca muestra un número de performance no validado.
>   - *Fuente/transporte:* **archivo** (CSV/JSON) entregado por RH (no API por ahora — Leo: "documento do RH"); **mock** fijo ahora, drop real de RH después (Q12 mismo patrón). Bypasa el agente de medición 3A (no se computa local).
>   - *Shape mínimo/fila (+ punto de Leo):* `kpi_id` · `nivel/owner` · `target` · `valor` · `validado_por` (RH/estrategia/manager) · `validado_en` · `def_version` · **`formula` · `periodicidad` · `group_by`/dimensiones** — estos tres deben **calzar** con la def canónica o el número DISTORSIONA (A≠B) → no se muestra.
>   - *Match key:* `kpi_id`+`def_version` resuelve contra el doc canónico; si no resuelve → fail-closed (no render).
>   - *Fallos nombrados (CEO — cero silencio):* archivo ausente → "Performance no disponible (falta drop RH)"; schema-mismatch → "formato inválido — no ingerido"; `validado_por`/`validado_en` ausentes → "sin firma de validación — no se muestra"; `now − validado_en > TTL [C]` → "Performance @ fecha — posiblemente desactualizado" (avisa, no oculta).
>   - *Seguridad (CEO threat-model):* dato sensible (perf review/PII) → read-only + firma RH + audit de qué archivo/versión se ingirió + nunca cross-tenant. *(Karpathy: nada de API especulativa; SAT key-assumption: sin `validado_por`+`validado_en` el dato NO es de fiar → no se muestra.)*
> **R-Q12 — Grafo organizacional. `[V]` escalera + `[I]` fuente.** La escalera CEO→VP→equipo→IC ("veo mi nivel + mis directos") es `[V]` (Leo, Q2). Fuente de datos = **mock ahora**, **documento de RH** después (mismo patrón que Performance). Entidad `OrgGraph` {`user_id`, `nivel`, `manager_id`, `directos[]`, `tenant_id`}; predicado de scope = "veo nodos donde `owner ∈ {yo} ∪ mis-directos ∪ company-scope`".
> **R-Q13 — Reconciliación con vision v1.0. `[V]` = SÍ.** Leo aprobó actualizar la vision para incluir el modelo nuevo. **Próximo paso (separado):** editar `00_vision_completa.md` (§1 personas: operador→agent-manager; §2 motor; §4-P3 = Goals & KPIs; ¿pantalla nueva?) y `02_user_stories.md` M3 — **preservando US-M3.2** (valor realizado/deflection, MUST → se re-aloja, no se borra).
>
> **Hecho (iter-7):** modelo de variables integrado (DocCanonicoKPI ejecutable=named_query, PerformanceFeed, OrgGraph, `tenant_id`, AccionSugerida tipo A/B + predicado) · honestidad: "nunca por encima"→`[I]`, refs §-planas, formula v1=named_query.
> **Residual no-bloqueante:** hilar OrgGraph/PerformanceFeed en los CUERPOS de EPIC-1/EPIC-4 (hoy solo en el modelo) · downgrade `[V]→[I]` de pasos HOW · EPIC-4=enforcement/EPIC-1=display.
> **Cerrado (iter 8-10):** TIPO-B = **EPIC-6 Investigation Workbench** (diseñado) · Q6 "valor realizado" = dos compuertas (§11.1, BR-10) · vision reconciliada (v1.1). **Residual no-bloqueante:** hilar las entidades nuevas en los cuerpos de EPIC-1/4 · downgrade `[V]→[I]` de pasos HOW · host del break-point (EPIC-5, `[I]` C).

## Decisiones validadas (iter 1–3, todas `[V]` de Leo salvo marca)
- **No es una cola de tickets.** Es un **scorecard de KPIs vivo, jerárquico y con memoria** — el tablero de instrumentos del cockpit. `[V]`
- **3 lentes SEPARADAS** (vistas distintas, no una sola árbol etiquetada): **Empresa · Personal · Procesos que administro**. Para entender cada día: ¿a dónde va la empresa, a dónde voy yo, a dónde van mis procesos? `[V]`
- **Lente "Procesos que administro" = los agentes que el agent-manager gerencia** (de su **tabla de 10 roles**, iter-2: Resolución/Escalación · NBA-Lifecycle · Contenido-Personalizado · Contenido-de-Feature · Analítico-ML · Orquestador-de-Bug · Síntesis · Lifecycle-multicanal; **rol 10 = el humano**). Mis KPIs de proceso = salud/output de esos agentes. `[V]` (lente + roster de la tabla de Leo). **Cardinalidad exacta** ("9 agentes") = `[I]` — 10 roles ≠ N agentes distintos (roles 1-2 comparten agente; rol 9 ⊂ NBA).
- **2 clases de dato con gobernanza distinta:**
  - **Performance (empresa + persona):** viene de **FUERA**, validada con **RH + estrategia + manager directo**, ligada a la **perf review**. La feature **solo consume** (read-only); no edita. `[V]` (iter 3 · J=solo consumimos)
  - **Contexto-de-proceso / acciones-NBA:** documentado (por qué + qué), con **log de cambio** y edición solo con **validación de 4 ojos** (quien tiene credencial cambia, otro valida). `[V]`
- **Nesting obligatorio:** KPI de proceso debe conectar al impacto de negocio (anidado company→área→proceso); KPI que no conecta al impacto **no tiene sentido**. `[V]` (iter 2)
- **Doc canónico de KPIs** = fuente única del "cómo medimos": company-wide viene de la compañía; process-specific viene de un doc de área. Números **sistematizados y unificados** (persona A no mide distinto de B). Cambiar exige credenciales + validación. `[V]`
- **Por KPI:** target vs hoy + ¿cerca o no? · descomposición **lagging→leading** (¿qué empujó el resultado?) · histórico semanal → **previsibilidad** de trayectoria. `[V]`
- **KPI rojo → acción:** un agente analiza, dice "tu punto de impacto es aquí, estos leading indicators empujan, acción sugerida de la semana" — pero **la persona aprueba antes de rodar; nada autónomo**. `[V]`
- **Loop de acuracidad:** la persona valida cuán acertada fue la recomendación → los ciclos mejoran. **Impact assignment es incierto** ("no necesariamente *esto* me lleva al target"). `[V]`
- **Agente de medición** (Python/Postgres) va al banco, recopila, calcula y actualiza las bases. `[V]`
- **Diferido `[I]`:** (a) la **prueba del 1:10 / break-point 1:10→1:6** — ¿vive aquí en la lente "procesos" o en P11 Salud? (C sin resolver); (b) definición operativa de **"valor realizado"** (Q6 abierta; vision §11.1).

---

## OUTPUT 1 — ÉPICAS, USER STORIES & RECORRIDO

**SÍNTESIS:** Goals & KPIs es el **tablero de instrumentos** del agent-manager: muestra, cada día y en cada nivel (empresa / personal / procesos-que-administro = los 9 agentes), si está llegando a los objetivos — con cada KPI **amarrado al impacto de negocio** (lagging→leading), su **histórico→previsibilidad**, y la **acción sugerida** (aprobada por humano). Sin ella el agent-manager vuela ciego: no sabe si el 1:10 entrega valor, ni dónde enfocar, ni si va a llegar al target. `[V]` (validado con Leo, iter 1-3)

**PROBLEMA:** no hay una superficie única que muestre, **role-scoped** y por nivel, el KPI actual vs target (¿cerca o no?), **qué lo empuja** (leading indicators), su **histórico→previsibilidad**, y la **acción a tomar** — con los números **sistematizados y unificados** (persona A no mide distinto de B) y **gobernados**. `[V]` · **OUTCOME:** mueve el North Star dando al agent-manager la visión diaria para (a) saber dónde están empresa/él/sus procesos vs target, (b) enfocar donde tiene impacto, (c) aprobar la acción correcta — cerrando el loop de acuracidad. Los KPIs de valor vienen de fuente externa validada; cifras = `[C]` placeholder (el valor está en el mecanismo). `[V/C]`

**PLACEMENT:** feature standalone **Goals & KPIs** (reemplaza la def vieja de P3 "fila + Aritmética 1:10"). · **Aguas-arriba (consume; no las posee):** sistema de **Performance/RH** (adjacente — solo fornece el archivo validado de KPIs empresa+persona, J), los **9 agentes/procesos** (salud/output = lente "procesos", I), el **doc canónico de KPIs** (company-wide de la compañía / process-specific del área), Cohorts/Evals/Tier/Cerebro para grounding. · **Aguas-abajo:** alimenta North Star; las acciones sugeridas → aprobación humana → ejecución gobernada vía NBA/`min()` (P02). · **Fuera de alcance:** definir la perf review (adjacente), ejecutar acción sin aprobación, cambiar definición de KPI sin credencial+validación, atender clientes. `[V]`

### Épicas (MECE; descomponen ESTA feature sin solape)
> **Dos ejes (resuelve los seams):** **EPIC-1..4** = capas horizontales (scorecard · análisis · KPI→acción · gobernanza/medición), todas desarrollables aquí; **EPIC-6** = drill vertical (tipo-B) que **COMPONE** esas capas — NO re-implementa nada (reusa el análisis lagging→leading de EPIC-2 y el approval-gate + loop de acuracidad de EPIC-3); **EPIC-5** = OUT-OF-SCOPE aquí (semilla del spec de P11).

| Épica | Alcance | Dims | Status |
|---|---|---|---|
| **EPIC-1 — Scorecard jerárquico role-scoped (3 lentes)** | Empresa / Personal / Procesos-que-administro (=9 agentes); cada KPI con target vs hoy, ¿cerca?, provenance; scoping por nivel (CEO→VP→equipo→personal: cada uno ve lo suyo + sus directos) | 1,3,7 | **desarrollar** |
| **EPIC-2 — Motor de análisis (lagging→leading + histórico→previsibilidad)** | Descomposición del lagging en leading indicators; snapshots semanales → tendencia → previsibilidad; impact-assignment marcado como incierto | 4,10 | **desarrollar** |
| **EPIC-3 — KPI→acción (sugerencia + aprobación humana + loop de acuracidad)** | Detectar KPI bajo target *en mi alcance* → análisis (punto de impacto + leading + acción de la semana) → humano aprueba ANTES de rodar → validar acuracidad de la recomendación | 4,5,6 | **desarrollar** |
| **EPIC-4 — Gobernanza de datos + agente de medición** | 2 clases (Performance externa read-only vs Contexto/NBA editable con 4-ojos+log); doc canónico versionado (A=B); agente Python/Postgres que recopila/calcula/actualiza | 3,8,11 | **desarrollar** |
| **EPIC-5 — Salud del 1:10 / break-point** | 10 señales de flywheel vs volumen + modelo no-lineal (codo+histéresis+early-warning) | 1,10 | **HOST=P11 `[V]`** — OUT-OF-SCOPE aquí (semilla del spec de P11; P3 solo linka) |
| **EPIC-6 — Investigation Workbench (tipo-B)** | subtela: KPI rojo → diagnóstico (determinista) + hipótesis-como-Governing-Thought (híbrido ML+LLM) + plan + ejecución híbrida (autorizar NBA/acción-mundo) + tracking→acuracidad | 4,5,6,10 | **desarrollar** (resuelto iter-10) |

#### EPIC-1 — Scorecard jerárquico role-scoped

**WHAT (invariantes — `[V]`):**
- 3 lentes SEPARADAS: Empresa · Personal · Procesos-que-administro. No se fusionan en una sola árbol. `[V]`
- **Role-scoping:** cada usuario ve su nivel + sus directos (CEO→toda la compañía + sus directos; VP→compañía → lo suyo → sus directos; etc.). Nunca por encima de su alcance. `[V]`
- Cada KPI: target, valor-hoy, ¿cerca o no?, provenance `[V/I/C]`, clase (performance|proceso). `[V]`
- Performance (empresa+persona) = **read-only** (viene de fuera). `[V]`

**HOW (juicio de producto):**
1. Render de 3 lentes conmutables; cada lente = árbol de KPIs anidado. `[V]`
2. Aplicar scoping por rol al entrar (qué nivel + qué directos). `[V]`
3. Por fila de KPI: target vs hoy + indicador de proximidad + badge de provenance. `[V]`

**F-1.1 — Las 3 lentes**
- **US-1.1.1** | Must | H1 — Como agent-manager, quiero conmutar entre Empresa / Personal / Procesos-que-administro, para entender cada día dónde va la empresa, dónde voy yo y dónde van mis procesos. `[V]`
  - Given mi rol resuelto, When abro la feature, Then veo las 3 lentes y, por defecto, la que corresponde a mi nivel. `[I]` (default = `[I]`)
  - (edge) Given un KPI de **Performance**, When lo veo, Then es read-only (no editable aquí) y marcado "fuente externa validada". `[V]`
- **US-1.1.2** | Must | H1 — Como agent-manager, quiero que cada KPI muestre target vs hoy y si estoy cerca o no, para leer el estado de un vistazo. `[V]`
  - Given un KPI con def validada, When lo veo, Then muestra target, valor-hoy, proximidad y provenance. `[V]`
  - (edge) Given un KPI **sin def validada** en el doc canónico, When se renderiza, Then se muestra "KPI no validado — no medible" (fail-closed), no un número. `[V]`

**F-1.2 — Scoping por rol (jerárquico)**
- **US-1.2.1** | Must | H1 — Como líder de cualquier nivel, quiero ver la compañía (lo que me corresponde) + lo mío + mis directos, para administrar mi alcance sin dispersión. `[V]`
  - Given mi nivel (CEO/VP/líder/IC), When entro, Then veo company-scope + mi-scope + mis-directos, nunca por encima de mi alcance. `[V]`
  - (edge) Given que intento ver un KPI fuera de mi alcance, When navego, Then se bloquea (acceso role-scoped). `[V]`

#### EPIC-2 — Motor de análisis (lagging→leading + histórico→previsibilidad)

**WHAT:** todo KPI lagging se descompone en sus leading indicators; los snapshots semanales construyen tendencia y previsibilidad; **la previsión se rotula como proyección `[I]`, nunca como hecho**; impact-assignment es incierto. `[V]`
**HOW:** registrar snapshot semanal por KPI; al abrir un KPI, mostrar qué leading indicators se movieron; proyectar trayectoria vs target marcándola como estimación. `[V]`

**F-2.1 — Descomposición lagging→leading**
- **US-2.1.1** | Must | H2 — Como agent-manager, quiero ver, para un KPI que no llega al target, **qué leading indicators lo empujan**, para entender la causa, no solo el síntoma. `[V]`
  - Given un KPI lagging bajo target, When lo abro, Then veo sus leading indicators y cuál(es) se movió(eron). `[V]`
  - (edge) Given un KPI de proceso **no conectado** a un KPI de negocio (huérfano), When se renderiza, Then se marca "KPI no conectado al impacto — revisar" (Leo: "no tiene sentido"). `[V]`

**F-2.2 — Histórico → previsibilidad**
- **US-2.2.1** | Must | H2 — Como agent-manager, quiero ver el histórico semanal y una proyección de si llego al target, para anticipar, no reaccionar. `[V]`
  - Given ≥ N snapshots semanales `[C]`, When abro el histórico, Then veo la tendencia + una proyección rotulada como estimación `[I]`. `[V]`
  - (edge) Given histórico insuficiente (< N snapshots), When pido proyección, Then se muestra "datos insuficientes para previsibilidad", no una curva inventada. `[V]`

#### EPIC-3 — KPI→acción (sugerencia + aprobación + loop de acuracidad)

**WHAT:** cuando un KPI está bajo target **y está en el alcance de la persona**, un agente genera análisis + acción sugerida de la semana; **la persona aprueba antes de que algo corra (nada autónomo)**; la persona valida la acuracidad de la recomendación → mejora el ciclo. **El approval-gate y el loop de acuracidad VIVEN AQUÍ** (EPIC-3 los posee). La acción se bifurca por `tipo_ejecucion`: **tipo-A** (NBA A1-A8 sobre cohort) → handoff a P02/`min()`; **tipo-B** (interna/performance) → abre **EPIC-6** (que reusa este gate/loop, no lo duplica). `[V]`
**HOW:** detectar desvío → agente arma "punto de impacto + leading + acción" → presentar para aprobación → al aprobar y si es tipo-A, handoff a P02 con el envelope {nba_id, cohort_id, intent}; si es tipo-B, abrir EPIC-6 → capturar feedback de acuracidad. `[V]`

**F-3.1 — Acción sugerida con aprobación humana**
- **US-3.1.1** | Must | H2 — Como agent-manager, quiero que, ante un KPI bajo target en mi alcance, el sistema me diga dónde tengo impacto, qué leading mover y qué acción tomar esta semana, para enfocar. `[V]`
  - Given un KPI bajo target en mi alcance, When lo abro, Then veo "tu punto de impacto + leading indicators + acción sugerida de la semana". `[V]`
  - Given una acción sugerida, When decido, Then **nada corre sin mi aprobación explícita** (approval-gate). `[V]`
  - (edge) Given un KPI bajo target **fuera de mi alcance** (ej. métrica de compañía que no controlo), When lo veo, Then el análisis es más limitado / informativo y no ofrece acción accionable por mí. `[V]`

**F-3.2 — Loop de acuracidad**
- **US-3.2.1** | Should | H3 — Como agent-manager, quiero validar cuán acertada fue una recomendación, para que las recomendaciones mejoren con el tiempo. `[V]`
  - Given una recomendación aprobada y ejecutada, When se cierra el ciclo, Then registro si fue acertada y eso retroalimenta el modelo de recomendación. `[V]`
  - (edge) Given que el resultado **no es atribuible** a la acción (impact-assignment incierto), When se evalúa, Then no se acredita causalidad fuerte; se marca como correlación, no causa. `[V]`

#### EPIC-4 — Gobernanza de datos + agente de medición

**WHAT:** 2 clases de dato con gobernanza distinta (Performance externa read-only / Contexto-proceso editable con 4-ojos+log); números sistematizados y unificados desde el doc canónico versionado (A=B); el agente de medición recopila/calcula/actualiza desde el banco. `[V]`
**HOW:** resolver cada KPI contra su def canónica; bloquear edición de performance; exigir 4-ojos+log para editar contexto; correr el agente de medición (Python/Postgres). · **Dispatch por `clase`:** `clase=proceso` → 3A lo calcula (named_query sobre el banco); `clase=performance` → se LEE del `PerformanceFeed` read-only, **nunca** pasa por 3A; sin feed validado → fail-closed "Performance no disponible / sin firma". `[V]`

**F-4.1 — Doc canónico + números unificados**
- **US-4.1.1** | Must | H1 — Como compañía, quiero un doc canónico versionado de cómo se mide cada KPI, para que persona A no mida distinto de B. `[V]`
  - Given un KPI, When se calcula, Then usa la def del doc canónico vigente (company-wide de la compañía / process-specific del área). `[V]`
  - (edge) Given dos cálculos divergentes del mismo KPI, When se detecta, Then fail-closed "KPI no unificado" (fuente única manda). `[V]`

**F-4.2 — Edición gobernada del contexto**
- **US-4.2.1** | Must | H2 — Como dueño de un proceso con credencial, quiero editar el contexto/NBA de mi proceso, pero solo con validación de otro, para que el cambio sea auditable. `[V]`
  - Given un usuario con credencial, When edita el contexto de proceso, Then el cambio requiere **validación de 4 ojos** + queda en **log de cambio**. `[V]`
  - (edge) Given una edición sin validación, When se intenta aplicar, Then se bloquea (no cambia). `[V]`

**F-4.3 — Agente de medición**
- **US-4.3.1** | Must | H1 — Como sistema, quiero un agente (Python/Postgres) que recopile del banco, calcule los KPIs por su def canónica y actualice las bases, para que los números estén vivos y consistentes. `[V]`
  - Given el agente de medición programado, When corre, Then recopila del banco, calcula por def canónica y actualiza las bases + un snapshot semanal. `[V]`
  - (edge) Given que el banco/feed no responde o trae datos stale, When el agente corre, Then marca el KPI "stale @ timestamp" y no presenta el valor viejo como vivo. `[I]` (TTL = `[I]`)

#### EPIC-5 — Salud del 1:10 / break-point — `[V]` (grill iter-11; HOST recomendado P11)

**Síntesis (reframe de Leo):** el break-point NO es "capacidad física de tickets". Es **la curva del trabajo de REVISIÓN vs el volumen**: si el flywheel funciona (políticas más precisas, procesos más aceptados, CI + RL rodando), la carga de revisión **no escala con el volumen** → el 1:10 se sostiene (o mejora); si falla, escala → degrada a 1:6. La pantalla **prueba que el aprendizaje funciona**, no la capacidad física. `[V]`

**Señales de salud (10) — `[V]`** — cada una es un **KPI `clase=proceso`** con su `def_version` (obedece BR-1: A=B) y `kpi_id` estable (P11 las fuentea por id); aquí se ven **vs volumen en el tiempo**:
1. # casos cerrados con CSAT máximo (políticas actuales). 2. # interacciones para resolver a CSAT máximo (↓). 3. # políticas que el agente debe revisar por caso. 4. clasificación correcta (tipo/causa) por IA, revisada por humano. 5. override/corrección humana por propuesta (↓) — el "trabajo de revisión" más puro. 6. escalación **por laguna de política** (no hay / las actuales no resuelven), NO genérica. 7. reapertura/deflection-que-falla (↓) — guardrail anti-gaming. 8. costo por decisión + **tokens**. 9. # **snowballs** (caso no contenido que cascadea → falla de prevención). 10. **impacto negativo en métrica-vecina** (resolvió lo pedido pero rompió un vecino) — do-no-harm.
> Etiquetas de sesión: 5=S5 · 6=S7 · 7=S8 · 8=S9 · 9=S10 · 10=S11. **S6 RECHAZADA — no MECE** ("tasa de políticas nuevas" mezcla flywheel-falla con causa externa; feature/producto nuevo crea políticas legítimamente). `[V]` (Leo). **Anti-doble-conteo (BR-10):** la señal #7 (reapertura/deflection) ya se RESTA del North Star — aquí se usa como *señal de salud*, no se re-cuenta como valor.

**Modelo del break-point (no-lineal) — `[V]` (Leo: 2+3+early-warning):**
- **Codo de saturación (Little's Law):** la capacidad de revisión es un recurso; el ratio cae **no-linealmente** cerca de la saturación → el break-point es el **codo**, no un punto elegido.
- **Histéresis (regime-switch):** banda de transición 1:10→1:6 **con memoria** (degrada en volumen X; para recuperar hay que bajar de X).
- **Early-warning por aceleración:** vigila la **derivada** de las 10 señales → alerta **antes** del codo. (SAT Indicators/Signposts)

**HOST = P11 (Salud del 1:10) — `[V]` (Leo confirmó iter-11).** Es una vista de **sostenibilidad / prueba-de-flywheel**, no un KPI diario. Las 10 señales se **fuentean** del scorecard de Goals & KPIs; la **vista-vs-volumen + modelo no-lineal viven en P11**; Goals & KPIs (P3) solo **LINKA**. → **Esta EPIC-5 = spec-semilla del P11**: cuando se especifique P11, este contenido se muda allá y aquí queda el link. **Vision reconciliada:** §5 + §11.12 + §4-P11 actualizadas (host=P11). `[V]`

#### EPIC-6 — Investigation Workbench (tipo-B) — `[V]` (resuelto iter-10)

**Síntesis:** **subtela de Goals & KPIs** que se abre cuando un KPI queda en rojo. Es donde la acción **tipo-B** (interna / de-performance — la MAYORÍA) se **diagnostica → hipotetiza → planea → ejecuta (híbrido) → mide**. División de trabajo: el **sistema** diagnostica + genera hipótesis + mide; el **humano** decide + actúa.

**WHAT (invariantes):**
- **Frontera determinista vs LLM (cierra la tensión Q10):** el LLM/híbrido **GENERA y RANKEA** hipótesis; el **NÚMERO** que mide cada hipótesis y el impacto es **siempre Python/SQL determinista** — el LLM **nunca** produce el número. `[V]`
- Cada hipótesis se formula como un **Governing Thought** (claim top-line claro, estilo Pyramid) + su **métrica de verificación** (el número que la confirma/refuta). `[V]`
- El plan enruta **por ítem**: ítem = **NBA estructurada (A1-A8)** → el humano **AUTORIZA** → ejecuta vía P2/`min()` (canal tipo-A, firmado); ítem = **acción en el mundo** → lo hace el humano. `[V]`
- Todo lo hecho se registra: **qué · quién · resultado** → alimenta el loop de acuracidad y las **dos compuertas** del valor realizado (BR-10). Apertura/correlación = señal débil, no confirma. `[V]`

**HOW (5 pasos):**
1. **Diagnóstico (determinista):** **reusa lagging→leading de EPIC-2** + AÑADE **DÓNDE** (segmento peor) + **DESDE CUÁNDO** (onset/tendencia). No re-implementa EPIC-2. `[V]`
2. **Hipótesis (híbrido) como Governing Thoughts:** abanico rankeado por probabilidad (ML sobre datos + LLM razonando), cada una = Governing Thought + métrica de verificación. Ej.: *"el churn sube por exceso de oferta en el lado-restaurantes del segmento X"* → medible por `<número>`. `[V]`
3. **Humano decide → plan de acción** (lista de ítems). `[V]`
4. **Ejecución híbrida por ítem** (ver WHAT). `[V]`
5. **Mide impacto → acuracidad:** registra qué/quién/resultado; valida cuán acertada fue → mejora el ranking futuro. `[V]`

**F-6.1 — Diagnóstico + hipótesis-como-Governing-Thought**
- **US-6.1.1** | Must | H2 — Como agent-manager, ante un KPI en rojo quiero abrir el workbench y ver leading + dónde + desde-cuándo + hipótesis rankeadas (Governing Thoughts), para decidir sobre causa probable. `[V]`
  - Given un KPI en rojo, When abro el workbench, Then veo lagging→leading + segmento + onset + N Governing Thoughts rankeadas, cada una con su métrica de verificación. `[V]`
  - *(edge)* Given que el número que mide una hipótesis lo intenta producir el LLM, Then se rechaza — el valor es Python/SQL determinista; el LLM solo formula/rankea (cierra Q10). `[V]`
  - *(edge)* Given datos insuficientes (n<n_min / histórico corto), Then "no medible aún", no se inventa el número. `[V]`

**F-6.2 — Plan de acción + ejecución híbrida + tracking**
- **US-6.2.1** | Must | H3 — Como agent-manager, quiero convertir las hipótesis elegidas en un plan de ítems y ejecutarlo híbrido (autorizar NBAs a la IA / hacer yo las del mundo), todo registrado, para actuar y medir. `[V]`
  - Given un ítem = **NBA estructurada A1-A8** y lo autorizo, Then se ejecuta vía P2/`min()` (canal tipo-A, firmado). `[V]`
  - Given un ítem = **acción en el mundo**, When lo marco hecho, Then se registra qué/quién/cuándo (el sistema NO lo ejecuta). `[V]`
  - Then por cada ítem se guarda el resultado → loop de acuracidad; el valor solo cuenta si pasa las dos compuertas (BR-10). `[V]`
  - *(edge)* Given un ítem-NBA que toca dinero(saldo)/cross-tenant, Then NO es auto-autorizable (los hard-nos del canal tipo-A se mantienen). `[V]`

### Recorrido (primera persona, clic por clic)

**Contexto:** soy el agent-manager. Abro Goals & KPIs a las 9:00 para ver dónde estamos y qué hacer hoy.

1. **Entro (carga + scoping).** El sistema resuelve mi rol y scoping; veo un skeleton mientras el agente de medición trae los KPIs ya calculados por def canónica. Por defecto cae en mi nivel. `[V/I]`
2. **Conmuto entre las 3 lentes.** Empresa (a dónde va la compañía), Personal (a dónde voy yo), Procesos-que-administro (salud de mis 9 agentes). En cada una, KPIs con target vs hoy + ¿cerca? + provenance. Los de Performance están marcados read-only. `[V]`
3. **Abro un KPI bajo target.** Veo su descomposición lagging→leading (qué empujó), el histórico semanal y la proyección (rotulada estimación `[I]`). Si es un KPI de proceso huérfano (no conecta al negocio), veo el flag. `[V]`
4. **Recibo la acción sugerida.** El agente dice "tu punto de impacto está aquí, estos leading mover, esta acción esta semana". Si el KPI está fuera de mi alcance, el análisis es informativo, sin acción accionable por mí. `[V]`
5. **Apruebo (o no).** Nada corre sin mi aprobación explícita. Al aprobar, se hace handoff a la ejecución gobernada (NBA/`min()`, P02). `[V]`
6. **Edito contexto de proceso (si hace falta).** Cambio algo del contexto/NBA de mi proceso → exige validación de otro (4 ojos) + queda en log. La Performance no la puedo tocar (viene de fuera). `[V]`
7. **Cierro el loop de acuracidad.** Más tarde valido si la recomendación fue acertada; eso mejora las próximas. `[V]`
8. **Estados de honestidad.** KPI sin def validada → "no medible". Histórico insuficiente → "datos insuficientes". Feed stale → "stale @ timestamp". Agregado cross-tenant → bloqueo. `[V]`

> WHAT-vs-HOW: EPIC-4 (doc canónico, 4-ojos, agente de medición) y EPIC-1 (scoping) = determinista → GWT exhaustivo. EPIC-2 (previsibilidad) y EPIC-3 (acción sugerida) = product-judgment → outcome+constraints, margen al builder. **`needs-prototype`:** la UI de las 3 lentes conmutables con drill jerárquico sin perder contexto.

---

## OUTPUT 2 — BUSINESS RULES + EDGE CASES + FAILURE HANDLING

**SÍNTESIS:** el modo de fallo que más amenaza el valor de esta feature es el **número deshonesto o desalineado**: un KPI calculado distinto por dos personas (A≠B), una proyección presentada como hecho, un `[C]` leído como dato real, o una acción que corre sin aprobación. Cualquiera de esos convierte el tablero de instrumentos en un espejo que miente — y el agent-manager decide sobre ruido. Por eso las reglas duras se concentran en: (1) **fuente única** de definición (doc canónico versionado, A=B); (2) **separación de gobernanza** (Performance read-only externa / Contexto editable con 4-ojos+log); (3) **approval-gate** (nada corre sin humano); (4) **honestidad de provenance** (proyección=`[I]`, escenario=`[C]`, impact-assignment incierto). `[V]`

### A. Business Rules (invariantes)

**BR-1 | `[V]` | hard-no:no | versionada:sí** — Cada KPI se calcula con la **def del doc canónico vigente**; números sistematizados y unificados (persona A no mide distinto de B). · Por qué: sin fuente única, el tablero produce verdades divergentes y nadie confía. · Alcance: todo cálculo/render de KPI. · SI SE VIOLA/FALLA (dos cálculos divergen, def ausente) → fail-closed "KPI no unificado / no validado"; no se muestra número.

**BR-2 | `[V]` | hard-no:sí | versionada:no** — Los KPIs de **Performance (empresa+persona) son read-only**; vienen de fuente externa validada (RH+estrategia+manager). La feature **no los edita**. · Por qué: están ligados a la perf review; editarlos aquí rompería la cadena de validación de RH. · Alcance: toda fila de clase Performance. · SI SE VIOLA → bloqueo de edición + alerta.

**BR-3 | `[V]` | hard-no:no | versionada:sí** — Editar **contexto-de-proceso/NBA** exige **credencial + validación de 4 ojos + log de cambio**. · Por qué: el contexto gobierna decisiones; un cambio unilateral no auditado las corrompe. · Alcance: toda edición de contexto/NBA. · SI SE VIOLA/FALLA (sin validación o sin log) → el cambio no se aplica + alerta.

**BR-4 | `[V]` | hard-no:sí | versionada:no** — **Ninguna acción sugerida corre sin aprobación humana explícita** (approval-gate; nada autónomo). · Por qué: el humano gobierna; el agente sugiere. · Alcance: toda acción derivada de un KPI. · SI SE VIOLA → la acción no se ejecuta + queda como propuesta + alerta.

**BR-5 | `[V]` escalera / `[I]` "nunca por encima" | hard-no:sí | versionada:no** — **Role-scoping:** cada usuario ve su nivel + sus directos (escalera CEO→VP→equipo→IC `[V]`, Leo Q2). "Nunca por encima de su alcance" = `[I]` (inferencia mía, no dicho por Leo). · Por qué: gobernanza de acceso jerárquico. · Alcance: render y navegación. · SI SE VIOLA → bloqueo de acceso.

**BR-6 | `[V]` | hard-no:no | versionada:no** — Todo **KPI de proceso debe conectar (anidado) a un KPI de negocio**; un KPI huérfano se marca "no conectado al impacto". · Por qué (Leo): "un proceso genera un Goal y si el KPI no conecta al impacto, no tiene sentido". · Alcance: definición/render de KPIs de proceso. · SI SE VIOLA/FALLA → flag "revisar conexión al impacto" (no se borra, se señala).

**BR-7 | `[V/I]` | hard-no:no | versionada:no** — La **previsibilidad es proyección, no hecho**: se rotula `[I]`/estimación; el **impact-assignment es incierto** (recomendación ≠ garantía). · Por qué: presentar proyección como hecho infla la confianza y engaña. · Alcance: toda proyección y toda recomendación. · SI SE VIOLA → se fuerza el rótulo de estimación.

**BR-8 | `[V]` | hard-no:sí | versionada:no** — **Cross-tenant prohibido** en agregados (Sony≠Warner); ningún KPI agregado cruza tenants. · Por qué: GDPR/contrato (vision §8 gap-fix#3 / §10 riesgo#4; pantallas 5 y 10). · Alcance: todo agregado/rollup. · SI SE VIOLA → bloqueo-rojo + alerta.

**BR-9 | `[V]` | hard-no:no | versionada:no** — Todo número de **escenario va rotulado `[C]`** ("placeholder; el valor está en el mecanismo"); nunca se presenta como dato real. · Por qué: no confundir placeholder con realidad (§8.8). · Alcance: render de cifras `[C]`. · SI SE VIOLA → se fuerza el badge `[C]`.

**BR-10 | `[V]` | hard-no:no | versionada:no** — **`valor_realizado` = DOS compuertas (Q6, Leo "ambos")**: (A) **confirmado** — `signal_de_resultado` volvió al CRM y **permaneció** (verde-sostenido `[C:D días]`); **Y** (B) **incremental/atribuible** por segmento (holdout long-tail; evidencia+confirmación humana managed n=1-5), el incremento vs el contrafactual, NO el resultado bruto. · Por qué: North Star honesto (§3) — ni gross-sin-confirmar ni correlacional. · Alcance: todo KPI que alimente el North Star. · SI SE VIOLA/FALLA (falta A o B) → **cuenta 0**; luego se resta `deflection-que-falla`.

### B. Edge Cases (pre-mortem)

**EC-1 | dato/def | `[V]`** — KPI sin def validada en el doc canónico. · Detección: resolución de def al calcular. · Comportamiento: fail-closed "no medible", no número. · Regla: BR-1. · SI LA DETECCIÓN FALLA → no renderizar valor + alerta al owner del doc canónico.

**EC-2 | consistencia | `[V]`** — Dos cálculos divergentes del mismo KPI (A≠B). · Detección: comparación contra def canónica única. · Comportamiento: fail-closed "KPI no unificado". · Regla: BR-1. · SI LA DETECCIÓN FALLA → marcar discrepancia + log.

**EC-3 | gobernanza | `[V]`** — Edición de contexto sin validación de 4 ojos. · Detección: gate de validación pre-commit. · Comportamiento: el cambio no se aplica. · Regla: BR-3. · SI LA DETECCIÓN FALLA → el log permite revertir + alerta.

**EC-4 | autonomía | `[V]`** — Acción sugerida tratada como auto-ejecutable. · Detección: approval-gate obligatorio. · Comportamiento: queda como propuesta hasta aprobación. · Regla: BR-4. · SI LA DETECCIÓN FALLA → corte en backend (no hay ejecución sin firma).

**EC-5 | previsibilidad | `[V]`** — Histórico insuficiente para proyectar. · Detección: conteo de snapshots < N `[C]`. · Comportamiento: "datos insuficientes", no curva inventada. · Regla: BR-7. · SI LA DETECCIÓN FALLA → marcar proyección como baja-confianza.

**EC-6 | impacto | `[V]`** — KPI de proceso huérfano (no conecta a negocio). · Detección: chequeo de nesting. · Comportamiento: flag "no conectado al impacto". · Regla: BR-6. · SI LA DETECCIÓN FALLA → revisión periódica del árbol de KPIs.

**EC-7 | acceso | `[V]`** — Usuario intenta ver/actuar fuera de su alcance. · Detección: role-scoping. · Comportamiento: bloqueo de acceso. · Regla: BR-5. · SI LA DETECCIÓN FALLA → log de seguridad.

**EC-8 | aislamiento | `[V]`** — Agregado mezcla tenants (Sony+Warner). · Detección: validación de límite de tenant en rollup. · Comportamiento: bloqueo-rojo. · Regla: BR-8. · SI LA DETECCIÓN FALLA → escalar a gobernanza.

**EC-9 | freshness | `[I]`** — Feed/banco stale o no responde al correr el agente de medición. · Detección: timestamp vs TTL `[C]`. · Comportamiento: "stale @ timestamp", no presentar valor viejo como vivo. · Regla: BR-1. · SI LA DETECCIÓN FALLA → marcar el tablero "datos posiblemente desactualizados". (TTL = `[I]`.)

**EC-10 | atribución | `[I/C]`** — Resultado coincide con la acción pero no es atribuible (estacionalidad, factor externo). · Detección: impact-assignment exige señal atribuible. · Comportamiento: no se acredita causa; correlación, no causa. · Regla: BR-7, BR-10. · SI LA DETECCIÓN FALLA → North Star se infla → revisión periódica.

### C. Matriz de fallo (ordenada por amenaza descendente)

| Regla/Edge | Modo de fallo | Detección | Respuesta | Amenaza |
|---|---|---|---|---|
| BR-1 / EC-1,2 | Número divergente o sin def (A≠B) | Def canónica única | Fail-closed "no unificado/no medible" | **MÁXIMA** — el tablero miente, se decide sobre ruido |
| BR-4 / EC-4 | Acción corre sin aprobación | Approval-gate + corte backend | Queda propuesta; nada autónomo | **MUY ALTA** — viola gobierno humano |
| BR-2 / — | Edición de Performance ligada a perf review | Clase read-only | Bloqueo de edición | ALTA — rompe cadena de validación RH |
| BR-3 / EC-3 | Cambio de contexto sin 4-ojos/log | Gate de validación pre-commit | No se aplica + log | ALTA — decisión sobre contexto corrupto |
| BR-7 / EC-5,10 | Proyección/recomendación como hecho | Rótulo estimación + impact-assignment | Forzar `[I]`; correlación≠causa | ALTA — confianza inflada |
| BR-8 / EC-8 | Agregado cross-tenant | Límite de tenant en rollup | Bloqueo-rojo | ALTA — GDPR/contrato |
| BR-5 / EC-7 | Acceso fuera de alcance | Role-scoping | Bloqueo de acceso | MEDIA |
| BR-6 / EC-6 | KPI de proceso huérfano | Chequeo de nesting | Flag "no conectado al impacto" | MEDIA — KPI sin sentido |
| BR-1 / EC-9 | Dato stale presentado como vivo | Timestamp vs TTL | "stale @ ts" | MEDIA |
| BR-9 / — | `[C]` confundido con dato real | Badge obligatorio | Forzar `[C]` | BAJA |

---

## OUTPUT 3 — WORKFLOW

**SÍNTESIS:** el flujo mantiene vivo el tablero de instrumentos: un **agente de medición** (Python/Postgres) recopila del banco y calcula cada KPI **por su def canónica** (A=B), persiste el snapshot semanal; la feature **renderiza role-scoped** las 3 lentes; al abrir un KPI bajo target, descompone **lagging→leading** y proyecta (estimación); si está en mi alcance, sugiere una acción que **solo corre con mi aprobación**; toda edición de contexto pasa por **4-ojos+log**; la Performance es **read-only** (externa). El "y qué": convierte datos crudos del banco en una visión gobernada y honesta de "¿llego al target y qué hago?", sin números divergentes ni acción sin gobierno. `[V]`

### Contrato
- **Entrada:** def de KPIs (doc canónico versionado: company-wide / area), datos crudos del banco, archivo validado de Performance (de RH/estrategia — adjacente), salud/output de los 9 agentes (lente procesos), rol del usuario. `[V]`
- **Salida:** scorecard role-scoped (3 lentes) con target vs hoy + lagging→leading + histórico→previsibilidad; acción sugerida → (tras aprobación) handoff a ejecución gobernada (NBA/`min()`); snapshot semanal persistido; feedback de acuracidad. `[V]`
- **Actores:** agente de medición (IA: recopila/calcula/actualiza); agente de análisis (IA: lagging→leading, previsibilidad, acción sugerida); agent-manager (HUMANO: aprueba acción, edita contexto con 4-ojos, valida acuracidad); RH/estrategia (externo: valida Performance). `[V]`
- **Frontera IA/HUMANO:** la IA mide, analiza y **sugiere**; el humano **aprueba** (nada corre sin él), edita contexto solo con 4-ojos, y valida acuracidad. Performance no la edita nadie aquí (read-only externa). `[V]`

### ANTES (triggers + precondiciones)
- `[TRIGGER]` job programado del agente de medición (ej. diario/semanal `[I]`) **O** el agent-manager abre la feature. `[V/I]`
- `[GROUNDING]` def canónica de cada KPI debe existir y estar versionada; si falta → `[FAIL-CLOSED]` "KPI no medible" (BR-1). `[V]`
- `[PRECOND]` rol del usuario resuelto para el scoping (BR-5). `[V]`
- `[PRECOND]` aislamiento por tenant; ningún agregado cruza tenants (BR-8). `[V]`

### DURANTE (sub-procesos nombrados)

**(3A) Agente de medición — recopila/calcula/actualiza** `[INICIO]`
- `[ACTOR:IA]` → `[DATA-IN]` datos crudos del banco + def canónica (doc versionado) → `[CÓMPUTO]` calcula cada KPI por su def; persiste snapshot semanal → `[DATA-OUT]` bases actualizadas + snapshot → `[DECISIÓN]` ¿banco responde y def existe? → `[NO]` `[FAIL-CLOSED]` "no medible / stale @ ts" (BR-1, EC-1/9) → `[SÍ]` continúa → `[REGLA]` BR-1 // Riesgo: presentar dato stale como vivo. `[V]`
- `[FIN 3A]`

**(3B) Render del scorecard role-scoped** `[INICIO]`
- `[ACTOR:IA]` → `[DATA-IN]` KPIs calculados + rol → `[CÓMPUTO]` aplica scoping (nivel + directos); arma las 3 lentes (Empresa/Personal/Procesos) → `[DATA-OUT]` scorecard con target vs hoy + proximidad + provenance → `[DECISIÓN]` ¿KPI de Performance? → `[SÍ]` read-only (BR-2) → `[NO]` editable-gobernado → `[REGLA]` BR-5, BR-2, BR-9 // Riesgo: fuga de alcance / cross-tenant (BR-8). `[V]`
- `[FIN 3B]`

**(3C) Análisis lagging→leading + previsibilidad** `[INICIO]`
- `[ACTOR:IA]` → `[DATA-IN]` KPI abierto + histórico (snapshots) + árbol de nesting → `[CÓMPUTO]` descompone lagging→leading; proyecta trayectoria (estimación) → `[DATA-OUT]` "qué empuja + proyección `[I]`" → `[DECISIÓN]` ¿histórico suficiente? → `[NO]` "datos insuficientes" (EC-5) → ¿KPI conectado al impacto? → `[NO]` flag huérfano (BR-6) → `[REGLA]` BR-6, BR-7 // Riesgo: proyección como hecho. `[V]`
- `[FIN 3C]`

**(3D) KPI→acción + aprobación + loop de acuracidad** `[INICIO]`
- `[ACTOR:IA]` → `[CÓMPUTO]` si KPI bajo target **y en mi alcance**: arma "punto de impacto + leading + acción de la semana" → `[ACTOR:HUMANO]` aprueba/ajusta/rechaza → `[DECISIÓN]` ¿aprobado? → `[SÍ]` handoff a ejecución gobernada (NBA/`min()`, P02) → `[NO]` queda propuesta → `[AUTONOMÍA]` nada corre sin aprobación (BR-4); la ejecución la gobierna P02 con `min()` → `[DATA-OUT]` decisión + (después) feedback de acuracidad → `[REGLA]` BR-4, BR-10 // Riesgo: acción autónoma / valor no atribuible (EC-10). `[V]`
- `[FIN 3D]`

**(3E) Edición gobernada de contexto** `[INICIO]`
- `[ACTOR:HUMANO]` con credencial edita contexto/NBA → `[DECISIÓN]` ¿validación de 4 ojos? → `[NO]` `[FAIL-CLOSED]` no se aplica (BR-3, EC-3) → `[SÍ]` aplica + `[DATA-OUT]` log de cambio → `[REGLA]` BR-3 // Riesgo: cambio unilateral no auditado. `[V]`
- `[FIN 3E]`

### Flujo (ASCII)

```
[job medición / abre feature]
        |
   [GROUNDING] def canónica existe? --NO--> [FAIL-CLOSED] "KPI no medible"
        | SÍ
        v
 (3A) AGENTE MEDICIÓN: banco -> calcula por def -> snapshot semanal
        | (stale/no def -> "stale @ ts" / "no medible")
        v
 (3B) RENDER role-scoped (3 lentes: Empresa / Personal / Procesos)
        |   Performance = read-only ; cross-tenant -> BLOQUEO
        v
 (3C) abro KPI -> lagging->leading + histórico->proyección [I]
        |   (histórico insuf -> "datos insuficientes" ; huérfano -> flag)
        v
 (3D) KPI bajo target Y en mi alcance? --SÍ--> acción sugerida
        |                                          |
        |                                   [HUMANO aprueba?]
        |                                    /            \
        |                                  SÍ             NO -> queda propuesta
        |                                   v
        |                       handoff a ejecución gobernada (NBA/min(), P02)
        |                                   v
        |                          loop de acuracidad (¿fue atribuible?)
        v
 (3E) editar contexto -> ¿4 ojos? --NO--> no se aplica
                                  --SÍ--> aplica + log de cambio
```

### DESPUÉS
- `[DATA-OUT]` snapshot semanal persistido + bases actualizadas + log de cambios + decisiones/feedback. `[V]`
- **Alimenta a:** **North Star** (valor confirmado/atribuible); **NBA/`min()` (P02)** (las acciones aprobadas se ejecutan gobernadas allí); los **9 agentes** (su salud/output retroalimenta la lente procesos); el **loop de acuracidad** mejora futuras recomendaciones. `[V]`

### MAPA DE SISTEMAS Y FLUJO DE DATOS
- `[SISTEMA 1]` **Goals & KPIs (esta feature)** · función: tablero role-scoped (3 lentes), lagging→leading, histórico→previsibilidad, acción sugerida con aprobación · datos: KPIs, snapshots, acciones, log · acceso: agent-manager (read; edita contexto con 4-ojos; Performance read-only) · grounding: doc canónico + Cerebro // Problema: número divergente → tablero miente → Alimenta a: North Star, P02. `[V]`
- `[SISTEMA 2]` **Agente de medición (Python/Postgres)** · función: recopilar del banco, calcular por def, actualizar bases + snapshot · datos: KPIs crudos→calculados · acceso: IA · grounding: doc canónico // Problema: dato stale presentado como vivo → Alimenta a: Sistema 1. `[V]`
- `[SISTEMA 3]` **Doc canónico de KPIs (versionado)** · función: def única de "cómo medimos" (company-wide / area) · datos: def, target, cómo-se-mide, versión · acceso: compañía/área (escribe con credencial); feature (lee) // Problema: def ausente/divergente (A≠B) → Alimenta a: Sistema 2. `[V]`
- `[SISTEMA 4]` **Performance/RH (adjacente, externo)** · función: fornecer el archivo validado de KPIs empresa+persona (ligado a perf review) · datos: KPIs de performance validados · acceso: RH/estrategia/manager (valida); feature (solo consume, read-only) · grounding: n/a // Problema: si cambia fuera, la feature debe reflejarlo sin editar → Alimenta a: Sistema 1. `[V]` (J=solo consumimos)
- `[SISTEMA 5]` **Los 9 agentes (procesos que administro)** · función: ejecutar los procesos cuya salud/output = lente "procesos" · datos: métricas de salud/output por agente · acceso: feature (lee) · grounding: Cerebro // Problema: agente degradado sin señal → Alimenta a: Sistema 1 (lente procesos). `[V]` (I=correcto)
- `[SISTEMA 6]` **NBA/`min()` (P02)** · función: ejecutar gobernada la acción aprobada · datos: acción + `nivel_efectivo` · acceso: handoff desde 3D // Problema: acción sin aprobación → Alimenta a: ejecución. `[V]`
- `[SISTEMA 7]` **North Star (§3)** · función: medir valor confirmado/atribuible · datos: valor, esfuerzo, atribución · acceso: IA reporta // Problema: atribución débil → teatro → Alimenta a: P11. `[V]`

### PUNTOS DE DOLOR / RIESGOS (rankeados)
1. **Número divergente / sin def única (A≠B).** Mitiga: doc canónico versionado + fail-closed "no unificado" (BR-1). `[V]`
2. **Acción que corre sin aprobación.** Mitiga: approval-gate + corte backend (BR-4). `[V]`
3. **Proyección/recomendación leída como hecho.** Mitiga: rótulo estimación + impact-assignment incierto (BR-7). `[V]`
4. **Edición de contexto sin auditoría.** Mitiga: 4-ojos + log (BR-3). `[V]`
5. **Fuga cross-tenant en agregados.** Mitiga: bloqueo-rojo (BR-8). `[V]`
6. **KPI de proceso huérfano (sin sentido).** Mitiga: chequeo de nesting + flag (BR-6). `[V]`
7. **Dato stale presentado como vivo.** Mitiga: timestamp vs TTL `[I]` (EC-9). `[I]`

**SÍNTESIS DE RIESGO:** el dominante es **el número deshonesto/desalineado** (divergente, stale o proyección-como-hecho) porque destruye la confianza en el tablero — y un tablero en el que no se confía no se usa para decidir. `[V]`

### MODELO DE VARIABLES

**KPI**
- kpi_id : uuid · PK `[V]`
- tenant_id : uuid · FK→Tenant (frontera dura cross-tenant, BR-8) `[V]`
- nivel : enum(empresa, personal, proceso) · la lente `[V]`
- dueno_id : uuid · FK→Usuario/Equipo (role-scoping) `[V]`
- clase : enum(performance, proceso) · gobierna read-only vs editable `[V]`
- def_ref : uuid · FK→DocCanonicoKPI (fuente única) `[V]`
- target : num `[C]`
- valor_hoy : num · calculado por el agente de medición `[C]`
- es_lagging : bool · lagging vs leading `[V]`
- parent_kpi_id : uuid? · FK→KPI (nesting; null si raíz) — KPI de proceso sin parent-de-negocio = huérfano (BR-6) `[V]`
- provenance : enum([V]/[I]/[C]) `[V]`
- ultimo_calculo_ts : datetime · freshness (EC-9) `[I]`

**SnapshotSemanal**
- snapshot_id : uuid · PK `[V]`
- kpi_id : uuid · FK→KPI `[V]`
- semana : date `[V]`
- valor : num `[C]`

**LeadingLink** (descomposición)
- **PK (lagging_kpi_id, leading_kpi_id)** · ambos FK→KPI `[V]`
- **invariante acíclico:** un KPI no puede ser upstream Y downstream de sí mismo; ciclo detectado → fail-closed/flag (3C no entra en loop) `[V]`

**AccionSugerida**
- accion_id : uuid · PK `[V]`
- kpi_id : uuid · FK→KPI (bajo target, en alcance) `[V]`
- analisis : text · punto de impacto + leading indicators `[V]`
- estado : enum(propuesta, aprobada, rechazada, ejecutada) · approval-gate (BR-4) `[V]`
- aprobado_por : uuid? · FK→Usuario (null hasta aprobar) `[V]`
- tipo_ejecucion : enum(A, B) — **predicado CONSTRUCTABLE (cierra OQ#9):** A **sii** `nba_id` Y `cohort_id` resuelven (instancia una NBA A1-A8 sobre un cohort); si cualquiera es null → **B por construcción** `[V]` (R-Q9)
- nba_id : enum(A1-A8)? · FK→catálogo cerrado de P02 (null ⇒ tipo-B) `[V]`
- cohort_id : uuid? · FK→cohort P01 (null ⇒ tipo-B) `[V]`
- intent : enum? · para que el `min()` de P02 llave por **cohort×intent** `[V]`
- handoff(tipo-A) → **envelope a P02** = {`nba_id`, `cohort_id`, `intent`} → P02 computa `nivel_efectivo=min(pedido_NBA, liberado_evals, teto_tier)` y ejecuta gobernado; **devuelve** `decision_trace_id` firmado `[V]`
- handoff(tipo-B) → abre **EPIC-6 Investigation Workbench** `[V]`
- decision_trace_id : uuid? · FK→decision_trace de P02 (solo tipo-A ejecutado) `[V]`
- acuracidad_feedback : enum?(acertada, no, no_atribuible) · loop (EC-10) `[V]`
> **Verdad de alcance:** tipo-A SOLO ejecuta NBAs A1-A8 (vía P02/`min()`, envelope arriba); internas/de-performance (la MAYORÍA) → TIPO-B en EPIC-6.

**DocCanonicoKPI** (versionado · fuente única · EJECUTABLE — R-Q10 + punto Q11 de Leo)
- doc_id : uuid · PK `[V]`
- escopo : enum(company_wide, area) · company-wide viene de la compañía; area del doc de área `[V]`
- formula : **v1 = named_query** (referencia a una query nombrada en un **registro versionado**; DSL propio diferido `[I]`, sin gramática aún) `[V]` (R-Q10)
- periodicidad : enum(diaria, semanal, mensual, trimestral, …) · define la **ventana** del cómputo `[V]` (Q11)
- group_by / dimensiones : list · recortes válidos (region, equipo, segmento…) — **un group distinto DISTORSIONA** `[V]` (Q11)
- source_ref : ref · tabla/feed de origen `[V]` · unit : str `[V]`
- version : semver (`def_version` — todo valor/feed la cita) `[V]`
- ejecutor : **Python/SQL determinista — NUNCA LLM** `[V]` (R-Q10)
> **Contrato `named_query` (v1, cierra OQ#10 — hace 3A construible):** `KPI.def_ref` → DocCanonicoKPI → `formula` resuelve a UNA entrada del **registro de queries** (almacén versionado por `def_version`). **Firma:** `run(named_query, params={group_by:[…], ventana:=from(periodicidad), tenant_id})`. **Retorno:** `{value:num, unit}`. El agente **3A** llama esto para producir `valor_hoy`; `Hipotesis.metrica_verificacion` (EPIC-6) usa el **mismo registro/ejecutor**. *Ej. e2e:* KPI "churn" → def_ref → `run(churn_rate, {group_by:[segmento], ventana:semanal, tenant})` → `{0.12 [C], "%"}`.
> **Regla anti-distorsión (Q11):** un valor es válido solo si `formula`+`periodicidad`+`group_by` == los del `def_version` citado; si difieren → fail-closed "KPI no unificado" (A≠B). Performance que no calce los tres NO se muestra.

**EdicionContexto** (4-ojos + log)
- edicion_id : uuid · PK `[V]`
- editor_id : uuid · FK→Usuario (con credencial) · `validador_id != editor_id` `[V]`
- validador_id : uuid? · FK→Usuario (4-ojos; null = no aplicada → no se aplica el cambio) (BR-3) `[V]`
- target_ref · campo · valor_anterior · valor_nuevo : para poder revertir (EC-3) `[I]`
- timestamp : datetime · log de cambio `[V]`

**PerformanceFeed** (R-Q11 · archivo RH-firmado · read-only · NUNCA calculado local · bypasa el agente 3A)
- **PK (kpi_id, def_version, validado_en)** — drops históricos no colisionan `[V]`
- kpi_id : uuid · FK→KPI (match key con `def_version`) `[I]`
- tenant_id : uuid `[V]` · nivel/owner : ref `[I]`
- target · valor : num `[C]`
- formula · periodicidad · group_by : deben **calzar** con `DocCanonicoKPI.def_version` (anti-distorsión, Q11) `[I]`
- validado_por : ref(RH/estrategia/manager) `[I]` · validado_en : date `[I]` · def_version : semver `[I]`
- estado_freshness : derivado(`now − validado_en` vs TTL `[C]`) `[I]`
> Sin `validado_por`+`validado_en` → **no se muestra**. Ausente/malformado/no-calza-def → fail-closed visible. Fuente = **mock ahora / drop de RH después**.

**OrgGraph** (R-Q12 · mock ahora · doc de RH después)
- user_id : uuid · PK `[I]` · tenant_id : uuid `[V]`
- nivel : enum · escalera CEO→VP→equipo→IC `[V]` (Leo, Q2)
- manager_id : uuid? · FK→OrgGraph `[I]` · directos : list<user_id> `[I]`
> Predicado de scope (evaluable): `visible(KPI) sii KPI.tenant_id==viewer.tenant_id Y (KPI.dueno_id ∈ {viewer.user_id} ∪ viewer.directos[]  Ó  KPI.nivel==empresa)`. **company-scope** = KPIs `nivel=empresa` (read-only para todos los niveles); `dueno_id`=equipo → resuelve a su nodo OrgGraph (Team→miembros). Compone con BR-8 (tenant). ("nunca por encima" = `[I]`, inferencia mía.)

**Hipotesis** (Governing Thought medible — tipo-B / EPIC-6)
- hip_id : uuid · PK `[V]` · kpi_id : uuid · FK→KPI (el lagging en rojo) `[V]`
- governing_thought : text · claim top-line (Pyramid) `[V]`
- metrica_verificacion : ref · el **número determinista** (Python/SQL) que la confirma/refuta `[V]`
- prob_rank : num · ranking **híbrido** (ML+LLM); el rank es probabilístico, la métrica NO `[V]`
- segmento(dónde) · onset(desde-cuándo) : ref `[V]`

**PlanDeAccion** + **ItemPlan** (tipo-B / EPIC-6)
- plan_id : uuid · PK · kpi_id/hip_id : refs · dueño : uuid `[V]`
- ItemPlan: tipo : enum(NBA_estructurada, accion_mundo) · descr · estado : enum(propuesto, autorizado, hecho) `[V]`
  - si NBA_estructurada → {`nba_id`(A1-A8), `cohort_id`, `intent`} → handoff a P2/`min()` (firma, hard-nos tipo-A) ; si accion_mundo → quién + cuándo (humano) `[V]`
  - resultado : ref → loop de acuracidad + dos compuertas (BR-10) `[V]`

Relaciones:
- DocCanonicoKPI 1—N KPI · KPI 1—N SnapshotSemanal · KPI 1—N AccionSugerida
- KPI N—N KPI vía LeadingLink (lagging↔leading) · KPI 1—N KPI vía parent_kpi_id (nesting)
- Usuario 1—N EdicionContexto (editor) ; Usuario 1—N EdicionContexto (validador)
- Tenant 1—N {KPI, Usuario} (frontera dura cross-tenant, BR-8)
- KPI 1—N Hipotesis · Hipotesis 1—N PlanDeAccion (vía elección humana) · PlanDeAccion 1—N ItemPlan
- ItemPlan →(NBA_estructurada) P2/`min()` (canal tipo-A) ; ItemPlan →(accion_mundo) Usuario

### Gobernanza / anchor-check
- **Fuente única:** doc canónico versionado; A=B (BR-1). ✔ `[V]`
- **Separación de gobernanza:** Performance read-only externa (BR-2) ; Contexto editable con 4-ojos+log (BR-3). ✔ `[V]`
- **Approval-gate:** nada corre sin humano (BR-4); ejecución gobernada por `min()` en P02. ✔ `[V]`
- **Hard-nos:** cross-tenant prohibido (BR-8) ; `[C]` nunca como dato real (BR-9) ; financiero (cuando la acción derive en dinero) nunca autónomo → lo aplica P02. ✔ `[V]`
- **Honestidad:** proyección=`[I]`, impact-assignment incierto (BR-7) ; valor solo confirmado/atribuible al North Star (BR-10). ✔ `[V]`
- **Role-scoping:** nivel + directos (escalera `[V]`); "nunca por encima" = `[I]` (BR-5). ✔
- **Resuelto:** HOST break-point = **P11** `[V]` · "valor realizado" = **dos compuertas** (BR-10/§11.1) `[V]` · tipo-B = **EPIC-6** `[V]`. · **Diferido `[I]` (no-bloqueante, defaults declarados):** TTL freshness (default: cómputo diario / snapshot semanal) · lente default + drill (needs-prototype) · n de snapshots · mecánica de acuracidad (wiring P06) · credencial + schema fino del registro de queries.

---

## OPEN QUESTIONS (PT-BR) — lo que el grill sigue preguntando

> **RESUELTAS esta sesión `[V]` (ver el doc):** #1 host break-point = **P11** · #2 "valor realizado" = **dos compuertas** (BR-10) · #8/#13 **reconciliación vision** (v1.2, US-M3.2 preservada) · #9 **ejecución A/B** + envelope a P02 (predicado constructable) · #10 **contrato `named_query`** · #11 **contrato PerformanceFeed** · #12 **OrgGraph** (mock→RH).

> **ABIERTAS `[I]` (no-bloqueantes — defaults declarados, no fabrican GWT):**
3. **[EPIC-4 · freshness]** TTL + cadencia del agente. *Default:* cómputo diario / snapshot semanal.
4. **[EPIC-1 · UI]** Lente default + drill jerárquico → **needs-prototype**.
5. **[EPIC-2]** n mínimo de snapshots para proyectar con confianza.
6. **[EPIC-3 · acuracidad]** Mecánica de validación de acuracidad + wiring a Evals/P06.
7. **[EPIC-4 · doc canónico]** Credencial para editar (company-wide vs area) + schema fino del registro de queries.
