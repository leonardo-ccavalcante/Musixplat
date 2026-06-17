# Breakdown HUMANO — Mapa de construcción (dominio: uber_eats)

## SÍNTESIS (la idea que gobierna)

**Las 229 piezas congeladas del producto se construyen con un solo patrón repetido — el músculo determinista (`CÓDIGO`, 170 piezas) hace casi todo el trabajo, el juicio del modelo (`AGENTE`, 44 piezas) queda confinado a clasificar y redactar, y el sistema nunca actúa solo sobre el dinero ni cruza la frontera del operador (tenant) — por lo tanto el riesgo de la demo no está en "cuánta IA hay" sino en seis costuras concretas: el camino-crítico que cruza features, los nueve contenedores de orquestación (`N8N`) que escriben de vuelta, y las seis decisiones todavía abiertas (`PENDIENTE`).**

El "y qué": cualquiera que lea esto sabe en un minuto **qué se construye con código vs. con modelo**, **por dónde fluye la demo de punta a punta**, y **dónde mirar antes de prometer una fecha** (los conflictos y los `PENDIENTE`). No es un inventario; es el mapa de dónde está apalancado el valor y dónde está el peligro.

Tres líneas-clave sostienen esa síntesis:

1. **El reparto del trabajo ya está decidido y es conservador** — 74% del producto es código determinista; el modelo solo entra donde hay que *leer texto libre* o *redactar una respuesta*, y siempre detrás de una compuerta humana o un `min()`. → *Y qué:* el blast-radius del "alucina" está acotado por diseño, no por suerte.
2. **El valor de la demo viaja por una sola espina cruzada** — Atendimiento → Diagnóstico → Generación de conocimiento, más Cohorts → NBA. Si esa espina se rompe, no hay historia que contar. → *Y qué:* el camino-crítico es donde hay que invertir robustez primero.
3. **Lo que puede hundir la entrega no es código por escribir sino acuerdos por cerrar** — seis `PENDIENTE` y siete costuras `[I]` bilaterales son decisiones de producto, no bugs. → *Y qué:* se gestionan con una conversación, no con un sprint.

---

## MAPA POR ÁREA (conteo por balde, por spec)

Cada feature es un "área". El balde dice **con qué se construye cada pieza**: `CÓDIGO` = lógica determinista (SQL/Python, reglas, UI, gates); `AGENTE` = juicio del modelo (clasificar / redactar); `N8N` = contenedor de orquestación fuera-de-banda que escribe de vuelta; `PENDIENTE` = decisión abierta, sin balde decidible (fail-closed).

| Área (feature) | Total | CÓDIGO | AGENTE | N8N | PENDIENTE | Y qué (para qué sirve el área) |
|---|---:|---:|---:|---:|---:|---|
| **01 — Explorador de Cohortes** | 29 | 26 | 2 | 1 | 0 | Segmenta cada restaurante en su cohorte y le pone percentil/gap; **emite el evento que arranca la cadena de NBA**. |
| **02 — Cockpit de NBA + autonomía** | 22 | 16 | 2 | 1 | 3 | Propone la mejor acción por cohorte y calcula el nivel de autonomía con `min()`; **el dinero nunca se libera solo**. |
| **03 — Scorecard de KPIs** | 25 | 20 | 2 | 2 | 1 | Mide KPIs canónicos y, bajo target, propone una acción de la semana con firma humana; **un número sin definición versionada no se muestra**. |
| **04 — Arquitectura de datos** | 1 | 0 | 0 | 0 | 1 | El conector real de `Evento_Uso` no está ratificado; **es el único productor que falta del grafo**. |
| **05A — Atendimiento (coach)** | 60 | 42 | 16 | 2 | 0 | Recibe el mensaje del restaurante, monta contexto, responde como coach y escala; **es la puerta de entrada de toda la cadena**. |
| **05B — Diagnóstico de problemas** | 46 | 31 | 14 | 1 | 0 | Encuentra la causa-raíz y **caza a los afectados silenciosos** que nunca reclamaron; arma el dossier. |
| **05C — Generación de conocimiento** | 41 | 30 | 8 | 2 | 1 | Convierte el dossier en artefactos (email, spec, política, T&C, análisis de impacto) con gate humano graduado. |
| **05DE — Vitrina / dashboard** | 5 | 5 | 0 | 0 | 0 | Muestra números que ya existen; **no persiste ningún número de negocio propio** (solo su layout). |
| **TOTAL** | **229** | **170** | **44** | **9** | **6** | 74% código · 19% modelo · 4% orquestación · 3% abierto. |

**Lectura del mapa (el "y qué" global):** las áreas más cargadas de juicio del modelo son las que tocan *texto del cliente* — 05A (16 `AGENTE`) y 05B (14 `AGENTE`) — exactamente donde más fuerte está la regla "texto = dato, nunca instrucción". Las áreas de medición y vitrina (03, 05DE) son casi 100% código: ahí el riesgo es de exactitud, no de alucinación.

---

## EL CAMINO-CRÍTICO DE LA DEMO (cascada-al-revés)

La demo no es 229 piezas en paralelo: es **una espina cruzada que entrega el "wow"**. Leída al revés (desde el resultado visible hacia el disparador), el valor se entrega así. Las piezas marcadas **[CRÍTICO]** son las que, si fallan, rompen la historia.

**Espina principal — el lazo de aprendizaje punta a punta:**

1. **[CRÍTICO] `05A:PASO-A.6-container` (N8N)** — sella el episodio en 3 capas y lo escribe de vuelta al cerebro (P7) de forma idempotente. → *Y qué:* sin este sello, nada llega a Diagnóstico; es el cuello de la cascada.
2. **[CRÍTICO] `05B:EPIC-B1` (N8N)** — recibe el episodio nuevo, secuencia los subagentes y compone el dossier de 11 campos. → *Y qué:* es el contenedor que convierte una queja suelta en un caso con causa-raíz e impacto.
3. **[CRÍTICO] `05B:B.5.2-reasoning` (AGENTE)** + **`05B:B.5.2-anti-join` (CÓDIGO)** — el modelo razona *a quién cruzar* y el código hace el anti-join que destapa a los restaurantes afectados que nunca reclamaron. → *Y qué:* este par es el momento-demo ("ves a los invisibles"); el split modelo-propone/código-verifica es el patrón de oro.
4. **[CRÍTICO] `05B:B.8.4` (CÓDIGO)** → **`05B:B.8.5` (CÓDIGO)** — arma y emite el dossier completo (la auditoría se persiste en `Problema_Diagnosticado.dossier_emitido`, el `v_dossier_handoff` es solo la proyección de lectura). → *Y qué:* fail-closed si faltan campos; no se entrega a medias.
5. **[CRÍTICO] `05C:EPIC-C1` (N8N)** — recibe el dossier y dispara los generadores 1:N por tipo de artefacto. → *Y qué:* cierra el lazo: del problema al conocimiento reusable.
6. **`05C:EPIC-C3d` (CÓDIGO)** → **`05C:US-C1-1` (AGENTE)** — resuelve la NBA contra `Knowledge_Case` (nunca la inventa) y el router decide qué artefactos generar. → *Y qué:* la creatividad del modelo está cercada por un catálogo cerrado.

**Espina secundaria — autonomía gobernada (Cohorts → NBA → traza firmada):**

7. **[CRÍTICO] `01:F-5.2` (CÓDIGO)** — el operador prioriza un subgrupo y emite `Evento_Priorizado_NBA` (único output mutante). → *Y qué:* es el handoff humano que arranca la NBA; el `risk_class` nace después, no aquí.
8. **[CRÍTICO] `02:WF-1A` (AGENTE)** → **`02:WF-1B` (CÓDIGO)** — el modelo propone la NBA por causa-raíz (catálogo cerrado A1..A8) y el código calcula `nivel_efectivo = least(pedido_NBA, liberado_evals, teto_tier)`. → *Y qué:* el corazón del producto; el `min()` es la garantía de que ninguna pieza sube su propia autonomía.
9. **`02:WF-1C/US-1.2.1` (CÓDIGO)** → **`02:WF-1E-trace` (N8N)** — humano libera/pausa en lote con firma y se escribe la traza de decisión. → *Y qué:* "sin traza no hay acción"; es la prueba de auditoría.

**Conexión de 03 a la espina:** `03:US-3.1.1-analysis` (AGENTE) propone → `03:US-3.1.1-approval` (CÓDIGO, gate humano) → `03:US-3.1.1-handoff-A` (CÓDIGO) **entra a `02:WF-1B`** con el envelope {nba_id, cohort_id, intent}. → *Y qué:* el Scorecard no ejecuta nada; delega el `min()` al motor de NBA.

**El "y qué" del camino-crítico:** los cuatro contenedores `N8N` de la espina (`05A:PASO-A.6-container`, `05A:PASO-A.7-container`, `05B:EPIC-B1`, `05C:EPIC-C1`) son los puntos únicos de fallo de la cascada. Si la demo cojea, se mira ahí primero, no en los 170 nodos de código.

---

## TIPO DE LEVERAGE POR PIEZA (dónde está apalancado el valor)

No todas las piezas pesan igual. Cuatro tipos de leverage explican *por qué cada balde existe*:

- **Leverage de juicio (AGENTE, 44 piezas)** — el modelo aporta donde el problema es *leer texto libre* o *redactar*. Casos núcleo: clasificar intención (`05A:PASO-A.2.intent`, `05B:B.2.2`), generar el coach (`05A:PASO-A.3.3`/`A.3.4`/`A.3.5`), proponer NBA (`02:WF-1A`), generar el árbol de hipótesis (`05B:B.3.1`/`B.3.2`), redactar artefactos (`05C:US-C3a-2`, `05C:US-C3b-2`, `05C:US-C3e-2`, `05C:US-C3f-2`). → *Y qué:* todo `AGENTE` que escribe va seguido de un `CÓDIGO` que verifica o de un gate humano — el split leaf (propone→verifica) es el control.
- **Leverage de garantía determinista (CÓDIGO, 170 piezas)** — cálculos que *nunca* puede hacer el modelo: el `min()`/`least()` de autonomía (`02:WF-1B`, `05A:PASO-A.4.6`, `05C:US-C1-3`), los números canónicos por `Named_Query` (`03:Named_Query.valor_hoy`, `05B:B.7.2`), los gates k-anon y cross-tenant (`02:WF-1B/BR-12-kanon`, `03:BR-8`, `05A:PASO-A.2.1`, `05B:B.5.4`). → *Y qué:* aquí vive la confianza del sistema; estos son los "golden" que jamás se siembran ni se delegan al LLM.
- **Leverage de orquestación (N8N, 9 piezas)** — contenedores fuera-de-banda que secuencian subagentes y escriben de vuelta: `01:F-2.5`, `02:WF-1E-trace`, `03:BR-10`, `03:US-4.3.1`, `05A:PASO-A.6-container`, `05A:PASO-A.7-container`, `05B:EPIC-B1`, `05C:EPIC-C1`, `05C:US-C7-3`. → *Y qué:* son los nervios que conectan features; cada uno es idempotente y read-only sobre el dinero.
- **Leverage de superficie / freno (CÓDIGO-UI y HUMAN-gate)** — render read-only y compuertas de firma: la vitrina entera (`05DE:US-DE1.1`..`05DE:layout-config`, cero números nuevos), las aprobaciones 4-ojos (`03:US-4.2.1`, `05C:US-C3e-3`, `05A:PASO-A.7.4b`). → *Y qué:* el humano siempre puede frenar, y la vitrina nunca miente porque no inventa.

---

## CONFLICTOS (lo que aún no cierra entre piezas)

Aquí están las costuras donde dos piezas no encajan limpio. Se separan en **dentro del alcance** (las podemos resolver) y **fuera del alcance** (viven en specs que no construimos).

### Costuras [I] bilaterales — dentro del alcance (un emisor dispara algo cuyo receptor no confirma)

- **`02:MEJORA-D/GATE-2-XCHK` → "GATE-3-min()"** — el cruce credencial×política dice que dispara un "GATE-3" que no existe como pieza; el receptor real es **`02:WF-1B`** (el motor `least()`). → *Y qué:* es un nombre fantasma, no un hueco real; repuntar la flecha a `02:WF-1B` lo cierra.
- **`02:WF-1E-confirm` → `02:WF-1E-roi`** — la confirmación independiente alimenta una tasa-de-rechazo hacia P11 (anti-rubber-stamp), pero P11 no está en el alcance. → *Y qué:* la señal se calcula bien; solo su consumidor está fuera.
- **`01:F-5.2` → `02:WF-1A`** — el evento priorizado viaja completo pero el receptor solo consume `cohort_id` (estrechamiento de forma). → *Y qué:* la trigger round-trip funciona; el skew de forma es conocido (recon COL-13) y no rompe la demo.
- **`05B:B.8.6` → `05A:PASO-A.1.1`** — el mensaje proactivo "avisar" al restaurante no tiene un payload `inbound_recibido` que case. → *Y qué:* solo aplica en la rama "avisar"; si no hay match, fail-closed a humano.
- **`05A:PASO-A.7.4-route` → `05C:EPIC-C1`** — artefactos versionados (Eval_Cell/Politica_Tier) hacia Evals P6/P10 con receptor no confirmado. → *Y qué:* fan-out cross-feature pendiente de confirmar el otro lado.

### Costuras del reconciliation — dentro del alcance (COL-… marcadas `[I] alta`)

Trece colisiones tocan piezas que sí construimos, casi todas en 05A/05B. Las de más peso:

- **COL-1 (identidad/stamp tenant-restaurante)** en `05A:PASO-A.1.1`, `05A:PASO-A.6.3`. → *Y qué:* hay que garantizar que cada episodio lleve `tenant_id`+`restaurante_id` sellados, o el k-anon de 05B falla.
- **COL-2 (el `min()` canónico)** en `05A:PASO-A.4.6`. → *Y qué:* el `least()` de Atendimiento debe ser idéntico al de NBA; es el invariante de autonomía.
- **COL-8 (traza de escalación)** en `05A:PASO-A.4.8`, `05A:PASO-A.3.7-ESCALA`. → *Y qué:* toda escalación debe dejar `Decision_Trace`; "nada se cae por timeout".
- **COL-6 (contador 1:10 / esfuerzo)** en `05A:PASO-A.6.4`, `05A:PASO-A.6.6`. → *Y qué:* el numerador del North Star es derivado read-only, nunca fixture.
- **COL-33 (corte por tipo)** en `05B:B.5.3`, **COL-18 (ruta stub)** en `05B:B.8.1`, **COL-9 (promover a proceso crítico)** en `05B:B.6.6`, **COL-7/COL-11/COL-25** en handoff y estado de vida. → *Y qué:* son acuerdos de granularidad y de estado, no errores de lógica.

### Costuras fuera del alcance (no se resuelven aquí — viven en specs que no construimos)

Nueve colisiones (COL-12, COL-2→COL-3, COL-5, COL-10, COL-26, COL-13, COL-15, COL-38, COL-20) caen entre P06/P07/P08/P09/P10/P11, ninguna con spec en alcance. → *Y qué:* la propiedad del taxonómico de INTENT, el numerador del North Star, el version-skew de cohortes y la firma de bootstrap de políticas **se gestionan con los dueños de esas specs**, no en este breakdown. Listarlas es la transparencia; resolverlas no es nuestro entregable.

### Residual del crítico que toca piezas en alcance

- **`05B:B.8.4` / `05B:B.8.5` (vocab)** — el `v_dossier_handoff` es vista de lectura; el `DATA-OUT` persistido debe ser `Problema_Diagnosticado.dossier_emitido` (jsonb). → *Y qué:* no escribir sobre la vista; ya está reflejado en el camino-crítico arriba.
- **`01:F-1.3b` (vocab, confianza baja)** — la supresión k-anon (`supresion_k_aplicada`) no tiene columna canónica; debe resolverse como flag derivado de render sobre `cohort.Subgrupo` (análogo a `02:WF-1B/BR-12-kanon`, que no persiste columna). → *Y qué:* es un token sin mapear; se rinde como supresión de UI, no como dato persistido.

---

## PIEZAS PENDIENTE (decisiones abiertas, no trabajo pendiente)

Seis piezas no tienen balde decidible: el spec las marca diferidas o fuera-de-host. Son **decisiones de producto a tomar**, fail-closed mientras tanto.

- **`02:EPIC-2-deferred`** — flexibilizar cohortes (subir `teto_tier`/re-segmentar). → *Y qué:* alto blast-radius; subir autonomía exige evidencia + firma humana, por eso no se cablea sin hipótesis.
- **`02:EPIC-3-deferred`** — mejorar Evals (subir `liberado_evals`). → *Y qué:* la calibración cohort×intent es propiedad de P06; aquí solo se consume. La única vía legítima de *subir* autonomía es humano+evidencia.
- **`02:WF-1D-mobile-PENDIENTE`** — paridad total del flujo lote→drill en móvil. → *Y qué:* necesita prototipo; los invariantes (`min()`/dinero-nunca/cross-tenant) son idénticos a desktop, pero el flujo no está cristalizado.
- **`03:EPIC-5`** — Salud del 1:10 / break-point. → *Y qué:* el host es P11; aquí solo se linka. El modelo no-lineal (codo/histéresis) no es nuestro.
- **`04:§9.3`** — ingesta real de `Evento_Uso` (conector no ratificado). → *Y qué:* **es la única ausencia que rompe un golden** ("all→Evento_Uso" no se reproduce): ninguna pieza escribe `Evento_Uso`. Decisión: o se registra el generador demo como productor explícito, o los consumidores (KPI de uso, Salud_1a10, pre-churn) excluyen-fail-closed en vez de esperar un feed vivo. No se deja el ancla silenciosamente sin productor.
- **`05C:CIERRE-2-§6-F-dato_del_como`** — el "dato del cómo" (qué buscan los usuarios en la plaza) no es derivable de `Orden`. → *Y qué:* se escala a humano (needs-prototype, Q1.3); no se inventa.

**El "y qué" de los PENDIENTE:** cinco son diferimientos de diseño con invariantes ya protegidos; **solo `04:§9.3` tiene consecuencia inmediata** porque deja un golden sin reproducir. Esa es la única decisión abierta que conviene cerrar antes de la demo.
