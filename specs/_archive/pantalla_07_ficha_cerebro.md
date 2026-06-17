# Pantalla 07 — Ficha / Cerebro del Cliente (raíz) · Breakdown de Feature

> **DRAFT generado por el Feature Breakdown Engine en modo AUTÓNOMO**, anclado ÚNICAMENTE en `specs/00_vision_completa.md` (v1.0 · 2026-06-15) más el cruce con `01_e2e_process.txt` y `02_user_stories.md` (mismas v1.0/fecha). El operador NO estuvo disponible para la entrevista (live grill), por lo que cada punto donde el grill HABRÍA preguntado se resolvió con la mejor hipótesis sustentada, etiquetada `[I]`, y la pregunta exacta (PT-BR) está registrada en **OPEN QUESTIONS** al final. **Este spec queda pendiente de las respuestas del operador a esas preguntas antes de considerarse cerrado.**
>
> **Provenance:** `[V]` vivido/derivable del doc · `[I]` inferido/a-decidir · `[C]` placeholder de escenario (nunca dato real).
> **Convención:** términos canónicos en `snake_case`; thresholds numéricos siempre `[C]`.

---

## Stage 0 — GROUND (resumen)

**PROBLEMA + OUTCOME (Working-Backwards).** [I]
Toda acción de IA en el cockpit (clasificar un caso, proponer una NBA, generar un lote en Content Studio, calcular un percentil, preparar un QBR) **necesita una fuente que la ancle**. Si esa fuente no existe, está desactualizada, no se puede atribuir, o no está aislada por tenant, la IA **alucina** o decide sobre ruido — y el North Star deja de ser confiable porque ningún valor es verdaderamente atribuible. El problema que resuelve esta pantalla: **dónde vive la verdad de cada cliente, quién la mantiene, cómo se versiona y cómo se audita/corrige**. **OUTCOME:** ser la **fuente única de verdad por cliente (grounding raíz)** que (a) habilita el `min()` y el fail-closed de todo el motor, (b) graba el episodio completo `riesgo → acción → resultado → permanencia → valor atribuido` que alimenta el North Star, y (c) acumula el **moat de memoria** que reduce el esfuerzo por unidad de valor con cada caso. [V: §2 eslabón 1; §4 Pantalla 7; §1 "construido sobre el Cerebro del Cliente"; US-M7.1/US-M7.2]

**SCOPE.** Pantalla **raíz del motor (eslabón 1)**: muestra el modelo vivo de **un cliente** (la ficha), su estado+memoria, sus contratos de activación, su historial de episodios y la provenance por campo. **La IA mantiene la ficha (ingiere, propone, graba episodios); el humano la audita y corrige.** Es la **fuente de grounding** de la que cuelga todo lo demás (Cohorts, NBA, Inbox, Content Studio, Evals, Managed, North Star). NO segmenta cohorts (eso es #1), NO propone NBA (eso es #2), NO ejecuta acciones sobre el cliente, NO toca dinero, NO define `teto_tier` (eso es #10). Su trabajo es **ser verdad anclada, versionada, aislada por tenant y auditable**, y servirla a quien la consume. [V: §4 Pantalla 7 "IA mantiene… humano audita y corrige"; §2; US-M7.1/US-M7.2]

**DEP-MAP (dim → dims que habilita).**
- DATA-IN (ingestión de fuentes de cliente + write-back de episodios desde Inbox/E2E) → habilita PROCESSING (consolidar estado+memoria, versionar, taggear provenance por campo) → habilita DATA-OUT (servir grounding a TODAS las pantallas + episodio al North Star) y UI (ficha + auditoría humana).
- BUSINESS-RULES (cross-tenant hard-no, PII/minimización, provenance por campo, versionado, anti-envenenamiento del write-back, no-suposición-no-declarada) y EDGE (fuente ausente, dato stale, conflicto V↔I, escritura cross-tenant, contrato incompleto, opt-out, alucinación) cuelgan de DATA-IN y PROCESSING.
- METRICS (moat de memoria, esfuerzo/valor) y NON-FUNC (acceso por rol + trilla quién-accedió-qué, latencia de grounding, i18n/toggle) se cierran al final.

**COBERTURA: 11/11** (resuelta por doc + `[I]` donde el doc no decide). Ningún `[I]` bloqueante (ver gate). Esta pantalla es **Hito 0 — Fundación**: sin ella, "toda autonomía es teatro y todo número es no-atribuible" [V: 02_user_stories Hito 0].

---

## OUTPUT 1 — ÉPICAS, USER STORIES & RECORRIDO

**SÍNTESIS:** la Ficha/Cerebro es el **eslabón 1 y la raíz de grounding de todo el motor**; sin ella se rompe TODO aguas-abajo — la IA no tiene fuente que la ancle (alucina), el fail-closed no tiene contra-qué chequear, el episodio `riesgo→acción→resultado→valor` no se graba (el North Star pierde atribución) y no se forma el **moat de memoria** que hace que cada caso resuelto baje el esfuerzo del siguiente. No es "un perfil del cliente": es la **fuente única de verdad versionada, aislada por tenant y auditable** sobre la que decide el cockpit. [V: §2 eslabón 1; §4 Pantalla 7; §1; US-M7.1]
**PROBLEMA:** la IA no puede decidir sin una fuente anclada, fresca, atribuible y aislada; sin ese sustrato, alucina o decide sobre ruido. **OUTCOME:** grounding raíz que habilita `min()`/fail-closed + episodio que alimenta el North Star + moat de memoria (menos esfuerzo por unidad de valor). [V: §2; §3; §4 Pantalla 7; US-M7.1]
**PLACEMENT:** esta pantalla = **1 de 11** del cockpit (área: eslabón 1 del motor, **raíz de grounding**, Hito 0 — Fundación). Aguas-arriba: Onboarding/Bootstrap (#9, siembra el Cerebro inicial) y Política/Tier (#10, define el aislamiento por tenant y el `teto_tier`). Aguas-abajo: **todas** — Cohorts (#1), NBA (#2), Home (#3), Content Studio (#4, grounding fail-closed), **Inbox (#5, grounding OBLIGATORIO + write-back de episodios)**, Evals (#6), Managed (#8), North Star. Hermanas conocidas: las otras 10 pantallas; ninguna se inventa aquí. [V: §2; §4; 02_user_stories Hito 0]

### Épicas (MECE; descomponen ESTA pantalla sin solape; cada una desarrollable)

---

**EPIC-1 · Modelo vivo del cliente: estado + memoria + contrato de activación** | alcance: representar, por cliente y por tenant, el estado vivo (lo que el cliente DEBERÍA y lo que SE OBSERVA), la memoria histórica (episodios) y los contratos de activación verificables, con provenance por campo | cubre dims: DATA-IN(3), PROCESSING(4), UI(7) | spec: **WHAT** (fuente única de verdad por cliente; cada campo lleva provenance `[V]/[I]/[C]`; el contrato de activación es fuente-de-verdad del `estado_esperado`, jamás cache de config; nunca inferir campo faltante con suposición no declarada) · **HOW** (consolidar inputs canónicos en `cliente.estado` + `cliente.memoria`; persistir `contrato_de_activacion` con `estado_esperado`, `ventana_activacion`, `timezone_restaurante`, `vinculo_evento_demanda`; campo faltante → `contrato_incompleto`, ruteo a humano).

  **Features:**
  - **F-1.1 · Estado vivo del cliente (esperado vs observado)** — modela `estado_esperado` (del contrato) y `estado_consumer` ∈ {live_verificado, dark_verificado, no_verificable}; nunca compara contra cache. [V: §4 Pantalla 7; 01_e2e PASO 0.3 / PASO 1.2; var `estado_consumer`/`estado_esperado`]
  - **F-1.2 · Contrato de activación verificable** — cada promo/feature persiste `{estado_esperado, ventana_inicio/fin, timezone_restaurante, vinculo_evento_demanda}`; campo faltante → `contrato_incompleto`, no se infiere. [V: US-M7.1 AC2; 01_e2e PASO 0.1/0.2/0.3]
  - **F-1.3 · Memoria / historial de episodios** — el Cerebro guarda la serie de episodios `riesgo→acción→resultado→permanencia→valor` por cliente. [V: US-M7.1 AC1; 01_e2e PASO 3.8]
  - **F-1.4 · Provenance por campo** — cada campo expone su sello: input medido `[V]`, estimado/modelado `[C]`, inferido `[I]`. [V: §8.8; 01_e2e PASO 0.1 "proveniencia por campo"]

  **US-1.1.1** | MoSCoW: Must | Hito: H0 — Como **operador 1:10**, quiero abrir la ficha de un cliente y ver su **estado vivo (esperado vs observado), su contrato de activación y su memoria de episodios**, cada dato con su provenance, para decidir y resolver en una pasada sin caza de datos en N sistemas. [V: §4 Pantalla 7; US-M5 "Cerebro ya cargado… sin caza de datos en N sistemas"]
  - Given un cliente con ficha sembrada, When abro su Ficha/Cerebro, Then veo `estado_esperado`, `estado_consumer`, el/los `contrato_de_activacion` y el historial de episodios, cada campo con sello `[V]/[I]/[C]`. [V]
  - (edge) Given un `contrato_de_activacion` con un campo faltante (ej. `timezone_restaurante`), When se renderiza la ficha, Then el campo se marca `contrato_incompleto` y se rutea a humano; **NUNCA se infiere con suposición no declarada**. [V: 01_e2e PASO 0.2/FD-07]

  **US-1.1.2** | MoSCoW: Must | Hito: H0 — Como **IA del cockpit (consumidora de grounding)**, quiero que el Cerebro distinga explícitamente **fato verificado `[V]` de inferencia del agente `[I]`**, para anclar mis decisiones solo en verdad y degradar cuando solo hay inferencia. [V: US-M5 "separación explícita entre fato verificado [V] e inferencia del agente [I]"]
  - Given un campo del Cerebro, When lo leo como grounding, Then recibo su valor + provenance, y si es `[I]` (inferido) la confianza queda señalada para que el consumidor aguas-abajo degrade. [V]
  - (edge) Given un campo sin provenance, When se intenta servir como grounding, Then se trata como **no confiable** (equivale a fuente ausente → fail-closed aguas-abajo). [V: §8.8; analogía Content Studio bloqueo rojo]

---

**EPIC-2 · Ingestión, write-back de episodios y versionado (anti-envenenamiento)** | alcance: poblar y actualizar el Cerebro desde fuentes (Onboarding, integraciones, Inbox) y grabar el aprendizaje de cada caso cerrado en la capa KNOWLEDGE versionada, sin envenenar la memoria | cubre dims: DATA-IN(3), PROCESSING(4), TRIGGERS(2) | spec: **WHAT** (el write-back del aprendizaje al Knowledge/cohort solo ocurre tras pasar la suite de regresión — anti-envenenamiento; todo es versionado: `policy/context_md/knowledge_version`; el episodio se graba con `episodio_id` único anti double-counting) · **HOW** product-judgment para la forma de ingestión (la define el builder/Onboarding); el **contrato del write-back y el gate anti-envenenamiento son fijos**.

  **Features:**
  - **F-2.1 · Ingestión de fuentes de cliente** — incorpora historial/configs/identidad desde Onboarding e integraciones; cold-start sin inputs → `tier_provisorio` conservador (marcado), nunca clasifica para abajo por falta de dato. [V: US-M9.1 AC1; §4 Pantalla 9]
  - **F-2.2 · Grabación de episodio (write-back desde el E2E/Inbox)** — al cerrar un caso, graba `riesgo→acción→resultado→permanencia→valor` con `episodio_id` único (anti double-counting). [V: 01_e2e PASO 3.8 / PASO 0.3; var `episodio_id`; US-M7.1 AC1]
  - **F-2.3 · Ingesta de aprendizaje al KNOWLEDGE versionado (gate anti-envenenamiento)** — el write-back al Knowledge/cohort solo se confirma **tras pasar la suite de regresión**. [V: 01_e2e PASO 3.6.5 "anti-envenenamiento"; var `knowledge_version`]
  - **F-2.4 · Versionado de la trinca de anclas** — el Cerebro mantiene `policy_version`, `context_md_version`, `knowledge_version` para que la trinca sea chequeable a cada acción aguas-abajo. [V: §2 trinca; US-M10.1; vars]

  **US-1.2.1** | MoSCoW: Must | Hito: H0 — Como **Producto/Eng**, quiero que el Cerebro **grabe el episodio completo de cada caso cerrado con provenance e `episodio_id` único**, para que cada caso resuelto aumente la capacidad preventiva y reduzca el esfuerzo por unidad de valor (moat de memoria) sin double-counting. [V: US-M7.1; 01_e2e PASO 3.8]
  - Given un caso cerrado con resultado, When el E2E hace write-back, Then se graba el episodio `{riesgo, acción, resultado, permanencia, valor_atribuido}` con `episodio_id` único, timestamp y provenance en la memoria del cliente. [V]
  - (edge) Given un mismo resultado que intenta grabarse dos veces (loop de síntesis), When se hace write-back, Then el `episodio_id` lo deduplica y NO se cuenta dos veces (anti double-counting del numerador). [V: var `episodio_id` "anti double-counting"]

  **US-1.2.2** | MoSCoW: Must | Hito: H0 — Como **capa de moat/memoria**, quiero que el aprendizaje solo se ingiera al KNOWLEDGE versionado **tras pasar la suite de regresión (anti-envenenamiento)**, para que un aprendizaje espurio no contamine el grounding de todos los clientes del cohort. [V: 01_e2e PASO 3.6.5]
  - Given un aprendizaje candidato a write-back al Knowledge, When se procesa, Then pasa la suite de regresión + criterio de NO-regresión ANTES de confirmarse; si falla, NO se ingiere y se rutea a revisión. [V]
  - (edge) Given un write-back que mejoraría un cohort pero regresa otro sub-caso, When la suite de regresión lo detecta, Then se bloquea la ingesta (fail-closed) y se alerta. [V: 01_e2e PASO 3.6.5; anti-envenenamiento]

  **US-1.2.3** | MoSCoW: Must | Hito: H0 — Como **operador 1:10**, quiero que un cliente cold-start (migrado de adquisición, base en email, sin CRM) reciba un **`tier_provisorio` conservador marcado como tal** y que ningún resultado suyo entre al numerador hasta que cierre atribución, para no inflar el North Star con valor no confirmado. [V: US-M9.1 AC1/AC3; §4 Pantalla 9]
  - Given un cliente cold-start sin inputs canónicos, When se siembra su ficha, Then arranca con `tier_provisorio` conservador marcado, que converge al definitivo conforme llega dato real; **nunca clasifica para abajo por falta de dato**. [V]
  - (edge) Given que la ingestión de KNOWLEDGE falla o el tenant no puede aislarse con seguridad, When se intenta operar, Then NO se opera autónomamente: se mantiene en tier humano (fail-closed). [V: US-M9.1 AC2]

---

**EPIC-3 · Aislamiento por tenant, PII/minimización y trilla de auditoría** | alcance: garantizar que el Cerebro sea aislado por tenant (hard-no cross-tenant), que la PII esté protegida/minimizada, y que todo acceso/escritura/intercambio de contexto entre agentes deje trilla de quién-accedió-qué | cubre dims: BUSINESS-RULES(8), EDGE(9), NON-FUNC(11) | spec: **WHAT** (Sony≠Warner inviolable; dato de un cliente nunca llega al diagnóstico/benchmark de otro salvo agregado de cohort anonimizado del MISMO tenant; PII minimizada y usada solo para resolver/prevenir; opt-out de contactos proactivos sin perder reactivo; trilla completa de acceso) · **HOW** (chequeo de `tenant_id` antes de cualquier lectura/escritura/share; redacción/minimización de PII en la capa de ingestión; `decision_trace`/log de acceso por cada operación).

  **Features:**
  - **F-3.1 · Hard-no cross-tenant en el Cerebro** — ninguna lectura, escritura, benchmark o share cruza tenants; solo agregado de cohort anonimizado dentro del mismo tenant. [V: §8.3; §10; US-M7.2 AC2; US-M10.3]
  - **F-3.2 · PII + minimización** — datos sensibles (ventas, estoque, márgenes, contacto) protegidos, usados solo para resolver/prevenir. [V: US-M7.1 AC3; US-M7.2]
  - **F-3.3 · Opt-out de proactivo (preserva reactivo)** — el cliente puede salir de contactos proactivos sin perder el soporte reactivo. [V: US-M7.1 AC3; 01_e2e HL-OPTOUT-01]
  - **F-3.4 · Trilla quién-accedió-qué** — todo acceso/escritura/intercambio de contexto entre agentes deja trilla auditable; el moat de datos no se vuelve pasivo de seguridad. [V: US-M7.2]

  **US-1.3.1** | MoSCoW: Must | Hito: H0 — Como **responsable de gobernanza cross-tenant (GDPR/contrato; Sony≠Warner)**, quiero que el aislamiento por tenant sea un **hard-no inviolable en el Cerebro**, para que datos de un cliente nunca crucen a otro ni por conveniencia operacional. [V: §8.3; §10; US-M10.3; US-M7.2]
  - Given una lectura/escritura/share que cruzaría `tenant_id`, When se evalúa, Then se BLOQUEA (hard-no absoluto, fail-closed) + log de evento de seguridad; nunca se ejecuta autónoma. [V: US-M7.2 AC1; US-M10.3 AC1]
  - (edge) Given una atribución ambigua entre tenants, When se intenta resolver, Then NUNCA se resuelve "a la suerte": se rutea a humano respetando el aislamiento. [V: US-M10.3 AC1/AUT-16]

  **US-1.3.2** | MoSCoW: Must | Hito: H0 — Como **dueño del dato del cliente**, quiero que mi PII esté **minimizada, protegida y usada solo para resolver/prevenir**, y poder **optar por salir de contactos proactivos sin perder el reactivo**, para confiar en que la memoria me protege y no se vuelve un pasivo. [V: US-M7.1 AC3; US-M7.2; HL-OPTOUT-01]
  - Given datos sensibles en la ficha, When se acceden, Then se aplica minimización y se usan solo para resolver/prevenir, con trilla de quién-accedió-qué. [V]
  - (edge) Given un cliente con `opt_out_proactivo = true`, When el sistema considera un contacto proactivo, Then se SUPRIME la salida proactiva pero el canal reactivo sigue intacto. [V: HL-OPTOUT-01; US-M7.1 AC3]

  **US-1.3.3** | MoSCoW: Must | Hito: H0 — Como **auditor humano**, quiero **trilla completa de todo acceso/escritura/intercambio de contexto entre agentes** sobre el Cerebro, para que la autonomía sea auditable y el moat de datos no se vuelva un pasivo de seguridad. [V: US-M7.2]
  - Given cualquier operación de lectura/escritura/share sobre la ficha, When ocurre, Then se registra `{quién, qué campo, cuándo, propósito, tenant_id}` en una trilla inmutable. [V/I: forma exacta del log → OQ-7]

---

**EPIC-4 · Auditoría y corrección humana de la ficha** | alcance: que el humano pueda revisar el modelo vivo, marcar/corregir campos, resolver conflictos `[V]↔[I]` y firmar la corrección con trilla — sin que la corrección se vuelva un sello automático (anti-rubber-stamp) | cubre dims: SCOPE/ACTORS(1), UI/STATES(7), GOVERNANCE(11) | spec: **WHAT** (la IA mantiene; el humano audita y corrige; la corrección humana es `[V]` y queda firmada/versionada; un conflicto V↔I se resuelve a favor de la fuente más fuerte y queda registrado; la firma no debe ser rubber-stamp) · **HOW** product-judgment para el render de la auditoría; el contrato de "corregir = nueva versión firmada con provenance `[V]`" es fijo.

  **Features:**
  - **F-4.1 · Vista de auditoría humana** — el operador ve qué mantuvo la IA, con qué provenance, y qué está marcado `[I]`/`contrato_incompleto`/`stale`. [V: §4 Pantalla 7 "humano la audita y corrige"]
  - **F-4.2 · Corrección + firma + versionado** — corregir un campo crea una nueva versión, sello `[V]` (corrección humana), con firma y motivo en la trilla. [V/I: §4; analogía decision_trace]
  - **F-4.3 · Resolución de conflicto `[V]`↔`[I]`** — cuando la inferencia del agente contradice un fato verificado, gana `[V]` y el conflicto queda registrado para Evals. [V: US-M5 separación V/I]
  - **F-4.4 · Anti-rubber-stamp de la corrección** — la firma humana exige re-decisión activa, no aceptar-de-1-clic; alimenta la calibración bipolar de #11. [V: §4 Pantalla 11; 02_user_stories M11 AC3]

  **US-1.4.1** | MoSCoW: Must | Hito: H0 — Como **operador 1:10 (auditor)**, quiero **revisar y corregir la ficha**, marcando un valor inferido `[I]` como verdad verificada `[V]` (o corrigiéndolo), con firma y motivo, para que la fuente de grounding mejore con supervisión humana y quede auditable. [V: §4 Pantalla 7]
  - Given un campo marcado `[I]` que sé verdadero/falso, When lo corrijo y firmo, Then se crea una nueva versión del campo con provenance `[V]`, firma, motivo y timestamp en la trilla. [V/I: forma de versionado de campo → OQ-2]
  - (edge) Given una inferencia del agente `[I]` que contradice un fato `[V]` existente, When se detecta el conflicto, Then **gana `[V]`**, la `[I]` no sobrescribe, y el conflicto se registra como señal para Evals. [V: US-M5 V/I; analogía juez co-sesgado §6]

  **US-1.4.2** | MoSCoW: Should | Hito: H0 — Como **gobernanza anti-rubber-stamp**, quiero que la corrección/firma humana exija **re-decisión activa (no 1-clic)** y que la calibración de la firma se vigile, para que el humano no se vuelva un sello automático que valida errores. [V: §4 Pantalla 11; M11 AC3; §10 riesgo 6]
  - Given una corrección de campo crítico (ej. que toca `estado_esperado` o un contrato de activación), When el humano firma, Then se exige re-decisión activa registrada, y la señal alimenta la calibración bipolar anti-rubber-stamp de #11. [V/I: qué campos son "críticos" → OQ-9]

### Recorrido (primera persona, clic por clic, estado por estado)

Yo, como **operador 1:10**, entro en **Ficha / Cerebro del Cliente** desde un caso del Inbox (#5), una cuenta de Cohorts (#1) o el panel Managed (#8).
- **(estado: carga)** Veo un skeleton mientras el sistema lee el estado+memoria persistidos del cliente **dentro de mi tenant**. La cabecera fija el `tenant_id` y el `cliente_id`; **nunca veo datos de otro tenant**. [V: §8.3]
- **(estado: ficha cargada)** Veo el **estado vivo**: `estado_esperado` (del contrato) junto a `estado_consumer` ∈ {live_verificado, dark_verificado, no_verificable}; el/los **contratos de activación** (`ventana`, `timezone_restaurante`, `vinculo_evento_demanda`); y la **memoria de episodios** (`riesgo→acción→resultado→permanencia→valor`). Cada campo lleva su sello `[V]/[I]/[C]` y, donde aplica, un `stale` o `contrato_incompleto`. [V: §4 Pantalla 7; 01_e2e]
- **(estado: separación V/I)** Veo claramente separado lo que es **fato verificado `[V]`** de lo que es **inferencia del agente `[I]`**; la inferencia no se mezcla con la verdad. [V: US-M5]
- Hago clic en un campo marcado `[I]` que sé verdadero. Espero que se abra el **editor de corrección**: corrijo, escribo el motivo y **firmo** (re-decisión activa, no 1-clic). El sistema crea una **nueva versión** del campo con provenance `[V]`, firma y timestamp en la trilla. [V/I: OQ-2]
- **(estado: conflicto)** Si una inferencia del agente contradice un `[V]` existente, veo un aviso de conflicto; **gana el `[V]`**, la `[I]` no sobrescribe, y el conflicto queda como señal para Evals. [V: US-M5]
- **(estado: opt-out)** Si el cliente tiene `opt_out_proactivo`, veo el badge correspondiente; sé que el sistema **no le mandará proactivos** pero **el reactivo sigue**. [V: HL-OPTOUT-01]
- **(estado: write-back)** Cuando un caso de este cliente se cierra en el E2E/Inbox, veo aparecer un **nuevo episodio** en la memoria, con `episodio_id` único; sé que **no se contó dos veces** y que el aprendizaje al Knowledge **solo se ingirió si pasó la regresión**. [V: 01_e2e 3.8/3.6.5]
- **(estado: stale)** Si el `estado_consumer` o un campo está más viejo que su TTL `[C]`, lo veo marcado `stale` con timestamp del último valor `[V]`; los consumidores aguas-abajo lo tratan con confianza degradada (no fail-open). [V: 01_e2e PASO 1.2 gate de frescura; OQ-8]
- **(estado: cold-start)** Si es un cliente recién migrado sin inputs canónicos, veo `tier_provisorio` conservador marcado y un aviso de que **ningún resultado entra al numerador hasta que cierre atribución**. [V: US-M9.1]
- **(estado: vacío)** Si el cliente no tiene ficha sembrada (tenant nuevo), veo un estado vacío con enlace a Onboarding (#9), no una ficha en blanco. [I: estado vacío → OQ-10]
- **(estado: error/grounding ausente)** Si una fuente requerida no responde o falta, **NO veo un valor inventado**: veo el campo como ausente/no-verificable; cualquier acción aguas-abajo que lo necesite se degrada a humano (fail-closed), nunca alucina. [V: §2 fail-closed; §4 Pantalla 4/5 grounding]

---

## OUTPUT 2 — BUSINESS RULES + EDGE CASES + FAILURE HANDLING

**SÍNTESIS:** el modo de fallo que más amenaza el North Star es **servir grounding corrupto**: una ficha que (a) cruza tenants (fuga GDPR/contrato Sony↔Warner), (b) presenta inferencia `[I]` como verdad `[V]` (la IA alucina con apariencia de fuente), (c) sirve un dato stale como si fuera fresco (fail-open encubierto), o (d) graba un episodio doble/envenenado en el numerador. Cualquiera de los cuatro envenena **toda** la cadena aguas-abajo, porque todo el cockpit decide sobre lo que el Cerebro afirma. La defensa: hard-no cross-tenant, provenance por campo (sin sello = no confiable), gate de frescura + marca `stale`, `episodio_id` anti double-counting y write-back con suite de regresión (anti-envenenamiento). [V/I: §2; §3; §8.3; §8.8; 01_e2e 3.6.5]

### A. Business Rules (invariantes)

**BR-1** | [V] | hard-no: **sí** | versionada: no
Regla: el Cerebro es **aislado por tenant**; ninguna lectura, escritura, benchmark o intercambio de contexto entre agentes cruza `tenant_id`; dato de un cliente NUNCA llega al diagnóstico/benchmark de otro salvo como **agregado de cohort anonimizado del mismo tenant**. · Por qué: aislamiento Sony≠Warner (GDPR/contrato); el moat de datos no debe volverse pasivo de seguridad. · Disparador/Alcance: todo acceso/escritura/share sobre la ficha. [V: §8.3; §10; US-M7.2; US-M10.3]
**SI SE VIOLA / FALLA →** bloqueo-rojo absoluto (fail-closed) + log de evento de seguridad atribuido al tenant + alerta a gobernanza; nunca se ejecuta autónoma. (operador + gobernanza/#10)

**BR-2** | [V] | hard-no: no | versionada: no
Regla: **todo campo lleva provenance por campo** `[V]/[I]/[C]`; un campo **sin sello = no confiable** (equivale a fuente ausente). Se distingue explícitamente **fato verificado `[V]` de inferencia del agente `[I]`**; la inferencia nunca se presenta como verdad. · Por qué: si la IA puede presentar `[I]` como `[V]`, alucina con apariencia de fuente y todo aguas-abajo decide sobre humo. · Disparador/Alcance: todo render y todo servicio de grounding. [V: §8.8; US-M5 separación V/I]
**SI SE VIOLA / FALLA →** no servir el valor sin sello; tratarlo como fuente ausente → fail-closed aguas-abajo (degrade-to-human). (consumidor aguas-abajo + operador)

**BR-3** | [V] | hard-no: no | versionada: no
Regla: **no se infiere un campo faltante con suposición no declarada**; un `contrato_de_activacion` con campo faltante se marca `contrato_incompleto` y se rutea a humano. El contrato es **fuente-de-verdad del `estado_esperado`; jamás se compara contra cache de config**. · Por qué: una suposición silenciosa contamina el grounding y produce falsos verdes/dark. · Disparador/Alcance: ingestión y consolidación de la ficha. [V: 01_e2e PASO 0.2/0.3/FD-07]
**SI SE VIOLA / FALLA →** marcar `contrato_incompleto`; degrade-to-human para completar/validar; nunca emitir el campo inventado. (operador)

**BR-4** | [V] | hard-no: no | versionada: **sí**
Regla: el aprendizaje se ingiere al **KNOWLEDGE versionado solo tras pasar la suite de regresión** (anti-envenenamiento); el episodio se graba con **`episodio_id` único (anti double-counting)**; la trinca se mantiene versionada (`policy_version`, `context_md_version`, `knowledge_version`). · Por qué: un aprendizaje espurio o un episodio doble envenenan el grounding/numerador de todos. · Disparador/Alcance: write-back de episodios y de aprendizaje. [V: 01_e2e 3.6.5/3.8; var `episodio_id`; US-M7.1]
**SI SE VIOLA / FALLA →** bloquear la ingesta (fail-closed) + no contar el episodio duplicado + rutear a revisión + alerta. (Producto-Eng)

**BR-5** | [V] | hard-no: no | versionada: no
Regla: **PII minimizada y protegida**, usada solo para resolver/prevenir; el cliente puede **optar por salir de contactos proactivos sin perder el reactivo** (`opt_out_proactivo`). · Por qué: protección del dato y de la confianza; el opt-out no debe degradar el soporte base. · Disparador/Alcance: todo acceso a datos sensibles y toda salida proactiva. [V: US-M7.1 AC3; US-M7.2; HL-OPTOUT-01]
**SI SE VIOLA / FALLA →** bloquear el acceso/uso fuera de propósito; en proactivo con opt-out, SUPRIMIR la salida proactiva (reactivo intacto). (operador + gobernanza)

**BR-6** | [V] | hard-no: no | versionada: no
Regla: el Cerebro **no opera de más ante ausencia/ambigüedad**: estado-desconocido = estado-EN-RIESGO; **fail-open ("verde por ausencia de señal") está PROHIBIDO**. Dato más viejo que su TTL `[C]` se sirve marcado `stale` (confianza degradada), nunca como fresco. · Por qué: el fail-closed del motor depende de que el Cerebro no finja saber. · Disparador/Alcance: gate de frescura/quality-of-information al servir grounding. [V: §2 fail-closed; 01_e2e PASO 1.2 (DET-08); AUT-14]
**SI SE VIOLA / FALLA →** emitir `estado-no-verificable` / marca `stale` + último valor `[V]` + timestamp; degrade-to-human; retry idempotente + health-check. (operador)

**BR-7** | [V] | hard-no: no | versionada: no
Regla: **la IA mantiene la ficha; el humano la audita y corrige.** La corrección humana es `[V]`, crea **nueva versión firmada** con motivo y timestamp; en conflicto **`[V]` gana sobre `[I]`**; la firma exige **re-decisión activa (no rubber-stamp)**. · Por qué: la supervisión humana es la que convierte el grounding en confiable; un sello automático reintroduce el error. · Disparador/Alcance: toda corrección/firma sobre la ficha. [V: §4 Pantalla 7; §4 Pantalla 11; M11 AC3]
**SI SE VIOLA / FALLA →** rechazar la corrección sin firma/motivo; señalar rubber-stamp a la calibración bipolar #11. (gobernanza/#11)

**BR-8** | [V] | hard-no: **sí (heredado)** | versionada: no
Regla: esta pantalla **no ejecuta acciones sobre el cliente, no toca dinero y no define/eleva autonomía**. Sirve grounding; la autonomía efectiva la calcula quien actúa aguas-abajo como `min(pedido_NBA, liberado_evals, teto_tier)`, nunca el máximo; **acción financiera nunca autónoma**. · Por qué: preservar invariantes del motor; el Cerebro es fuente, no actuador. · Disparador/Alcance: cualquier salida de la pantalla. [V: §2 fórmula; §4 Pantalla 7; §10.3]
**SI SE VIOLA / FALLA →** bloquear cualquier intento de ejecución desde esta pantalla + escalar a humano. (operador/gobernanza)

### B. Edge Cases (de la pasada pre-mortem)

**EC-1** | dim: EDGE/BUSINESS-RULE | [V] — Caso: lectura/escritura/share que cruzaría `tenant_id` (Sony↔Warner). · Detección: chequeo de `tenant_id` antes de toda operación. · Comportamiento: bloqueo-rojo absoluto + log de seguridad (fail-closed). · Regla(s): BR-1.
**SI LA DETECCIÓN FALLA →** congelar la ficha y abortar la operación hasta revisión humana de gobernanza.

**EC-2** | dim: EDGE/PROCESSING | [V] — Caso: inferencia del agente `[I]` se presenta o sobrescribe como verdad `[V]` (alucinación con apariencia de fuente). · Detección: chequeo de provenance por campo + detección de conflicto V↔I. · Comportamiento: `[V]` gana; la `[I]` no sobrescribe; conflicto registrado como señal para Evals. · Regla(s): BR-2, BR-7.
**SI LA DETECCIÓN FALLA →** marcar el campo `low-confidence` y tratarlo como fuente ausente (fail-closed aguas-abajo) + alerta.

**EC-3** | dim: EDGE/DATA-IN | [V] — Caso: fuente requerida ausente / contrato con campo faltante (ej. `timezone_restaurante`). · Detección: validación de completitud al ingerir/consolidar. · Comportamiento: marcar `contrato_incompleto`; NO inferir con suposición no declarada; rutear a humano. · Regla(s): BR-3.
**SI LA DETECCIÓN FALLA →** bloquear el uso del campo como grounding (fuente ausente → fail-closed).

**EC-4** | dim: EDGE/DATA-IN | [V] — Caso: dato stale (lectura más vieja que TTL `[C]`, o fuente autoritativa no respondió). · Detección: gate de frescura/quality-of-information ANTES de todo juicio. · Comportamiento: emitir `estado-no-verificable` o marca `stale` + último valor `[V]` + timestamp; **fail-open PROHIBIDO**; retry idempotente + health-check. · Regla(s): BR-6.
**SI LA DETECCIÓN FALLA →** degradar TODO el campo a `no_verificable` y escalar a humano. [I: TTL exacto → OQ-8]

**EC-5** | dim: EDGE/PROCESSING | [V] — Caso: write-back que envenenaría el Knowledge (aprendizaje espurio) o episodio duplicado. · Detección: suite de regresión + `episodio_id` único. · Comportamiento: bloquear ingesta si no pasa regresión; deduplicar por `episodio_id`. · Regla(s): BR-4.
**SI LA DETECCIÓN FALLA →** revertir el write-back a la última `knowledge_version` buena + alerta (rollback versionado).

**EC-6** | dim: EDGE/SCOPE | [V] — Caso: cliente con `opt_out_proactivo = true`. · Detección: flag en la ficha al evaluar un contacto. · Comportamiento: SUPRIMIR salida proactiva; reactivo intacto. · Regla(s): BR-5.
**SI LA DETECCIÓN FALLA →** ante duda, suprimir proactivo (lado seguro = no molestar) + log.

**EC-7** | dim: EDGE/DATA-IN | [V] — Caso: cliente cold-start sin inputs canónicos (migrado, base en email). · Detección: ausencia de inputs canónicos al sembrar. · Comportamiento: `tier_provisorio` conservador marcado; nunca clasifica para abajo por falta de dato; ningún resultado al numerador hasta cerrar atribución. · Regla(s): BR-3, BR-6.
**SI LA DETECCIÓN FALLA →** mantener en tier humano (no operar autónomo) + alerta. [V: US-M9.1]

**EC-8** | dim: EDGE/GOVERNANCE | [I] — Caso: firma humana de corrección sin revisar (rubber-stamp). · Detección: patrón de firmas-de-1-clic / calibración bipolar #11. · Comportamiento: exigir re-decisión activa en campos críticos; señalar rubber-stamp a #11. · Regla(s): BR-7.
**SI LA DETECCIÓN FALLA →** marcar las correcciones de ese operador como `unaudited` y disparar auditoría de calibración. [I: qué campos críticos → OQ-9]

**EC-9** | dim: EDGE/PROCESSING | [I] — Caso: toggle Musixmatch — la ficha cambia vocabulario (restaurante→artista/publisher) y modelo de dinero, pero los hard-nos y la separación V/I NO cambian; cohorts de 3 majors hacen que el benchmark de cohort pierda sentido. · Detección: el mismo aislamiento por tenant + n_min de #1 lo capturan. · Comportamiento: cambiar solo `display_label`/modelo de dinero; declarar "estructura quiebra para n pequeño — usar evidencia, no percentil". · Regla(s): BR-1, BR-2.
**SI LA DETECCIÓN FALLA →** mantener invariantes (hard-no + provenance) y forzar la vía evidencia. [V: §6 toggle; §7]

### C. Matriz de fallo (ordenada por amenaza-North-Star descendente)

| Regla/Edge | Modo de fallo | Detección | Respuesta | amenaza |
|---|---|---|---|---|
| BR-1 / EC-1 | Fuga cross-tenant en la ficha (Sony↔Warner) | chequeo `tenant_id` pre-operación | bloqueo-rojo + log seguridad + alerta gobernanza | **alta** |
| BR-2 / EC-2 | `[I]` servido/sobrescrito como `[V]` (alucinación con apariencia de fuente) | provenance por campo + conflicto V↔I | `[V]` gana; sin sello = no confiable → fail-closed | **alta** |
| BR-6 / EC-4 | Fail-open: dato stale servido como fresco | gate de frescura/QoI antes del juicio | `estado-no-verificable`/`stale` + último `[V]`; retry | **alta** |
| BR-4 / EC-5 | Write-back envenena Knowledge / episodio doble | suite de regresión + `episodio_id` | bloquear ingesta; deduplicar; rollback versionado | **alta** |
| BR-3 / EC-3 | Campo faltante inferido con suposición silenciosa | validación de completitud | `contrato_incompleto` + humano; no inferir | media |
| BR-7 / EC-8 | Rubber-stamp de corrección humana | calibración bipolar #11 | re-decisión activa; señalar a #11 | media |
| BR-5 / EC-6 | PII mal usada / proactivo a opt-out | flag opt-out + minimización | suprimir proactivo (reactivo intacto); bloquear uso fuera de propósito | media |
| BR-3/BR-6 / EC-7 | Cold-start clasifica para abajo o entra al numerador sin atribución | ausencia de inputs canónicos | `tier_provisorio` conservador; tier humano; fuera del numerador | media |
| BR-8 | Ejecutar acción / tocar dinero / elevar autonomía desde la ficha | guard de salida (solo servir grounding) | bloquear + escalar a humano | media |
| EC-9 | Toggle: benchmark de cohort sin sentido (3 majors) | n_min #1 + aislamiento | declarar quiebre; vía evidencia; invariantes intactos | baja |

---

## OUTPUT 3 — WORKFLOW

**SÍNTESIS:** el flujo ingiere y consolida la verdad de **un cliente dentro de su tenant**, la versiona y la tagga con **provenance por campo**, graba episodios anti-double-counting con write-back anti-envenenamiento, deja que el humano la **audite y corrija** (con firma, no rubber-stamp), y **sirve grounding fresco-o-marcado-stale** a todo el motor — **sin ejecutar nunca una acción, tocar dinero ni elevar autonomía, y sin jamás fingir saber (fail-closed)**. [V: §2 eslabón 1; §4 Pantalla 7]
Formato: `[TIPO]=nodo | -> =flujo | // =nota`.

### Contrato
- **Entrada:** inputs canónicos del cliente (Onboarding #9, integraciones), write-back de episodios desde el E2E/Inbox (#5), `tenant_id` y `tier_base`/`teto_tier` de Política (#10), correcciones humanas.
- **Salida:** **grounding por campo con provenance** servido a todas las pantallas; episodio `riesgo→acción→resultado→permanencia→valor` (al North Star); `knowledge_version`/trinca versionada (a #10/#6); trilla de auditoría.
- **Actores:** IA (ingiere, consolida, versiona, graba episodios, sirve grounding); Operador 1:10 / auditor humano (audita, corrige, firma); Producto-Eng (gobierna el write-back/regresión).
- **Frontera IA/HUMANO:** la IA **mantiene** la ficha; el humano la **audita y corrige**. La pantalla **no ejecuta** acciones, **no toca dinero**, **no eleva autonomía**.

### ANTES (triggers + precondiciones)
- **[TRIGGER]** (a) siembra inicial desde Onboarding (#9); (b) write-back de episodio al cerrar un caso en el E2E/Inbox (#5); (c) corrección humana; (d) lectura de grounding solicitada por una pantalla aguas-abajo. [V: 01_e2e PASO 0.3/3.8; §4 Pantalla 9]
- **[GROUNDING]** fuente = inputs canónicos del cliente + contrato de activación; si falta la fuente → **[FAIL-CLOSED]** no inventar: marcar `contrato_incompleto`/`no_verificable`, degrade-to-human (BR-3, BR-6).
- **[PRECONDICIÓN]** `tenant_id` resuelto y aislado (BR-1); provenance disponible por campo (BR-2); `episodio_id` asignable para write-back (BR-4).

### DURANTE (sub-procesos nombrados)

**[Sub-proceso 7A — Ingestión y consolidación del modelo vivo]** [INICIO]
  **[PASO 7A.1]** Ingerir inputs y consolidar estado+memoria.
    [ACTOR:IA] consolida `estado_esperado`, `estado_consumer`, contratos, memoria · [DATA-IN] inputs canónicos · Onboarding/integraciones · acceso IA (read/write, tenant-scoped) [V] · [CÓMPUTO] consolidación + tagging de provenance por campo · [DATA-OUT] `cliente.estado` + `cliente.memoria` (versionados) a Cerebro
    [DECISIÓN] ¿la operación cruza `tenant_id`? -> [SÍ] [FAIL-CLOSED] bloqueo-rojo + log seguridad [REGLA] BR-1,EC-1 -> [NO] continuar
    [DECISIÓN] ¿el contrato está completo y sin ambigüedad? -> [NO] marcar `contrato_incompleto` + humano [REGLA] BR-3,EC-3 -> [SÍ] PASO 7A.2
    [AUTONOMÍA] N/A (mantiene fuente; no ejecuta) · [REGLA] BR-1,BR-3 // Riesgo: suposición silenciosa contamina grounding
  **[PASO 7A.2]** Taggear provenance + separar V/I.
    [ACTOR:IA] · [CÓMPUTO] sello por campo `[V]/[I]/[C]`; separa fato verificado de inferencia · [DECISIÓN] ¿campo sin provenance? -> [SÍ] tratar como no confiable (= fuente ausente) [REGLA] BR-2,EC-2 -> [NO] persistir con sello
    [DECISIÓN] ¿dato más viejo que TTL `[C]`? -> [SÍ] marcar `stale`/`no_verificable` + retry [REGLA] BR-6,EC-4 -> [NO] marcar fresco
  [FIN 7A]

**[Sub-proceso 7B — Write-back de episodio + ingesta de aprendizaje (anti-envenenamiento)]** [INICIO]
  **[PASO 7B.1]** Grabar episodio del caso cerrado.
    [ACTOR:IA] · [DATA-IN] resultado del caso (E2E/Inbox) · [CÓMPUTO] componer `{riesgo, acción, resultado, permanencia, valor_atribuido}` + `episodio_id` único · [DECISIÓN] ¿`episodio_id` ya existe? -> [SÍ] deduplicar (no double-count) [REGLA] BR-4,EC-5 -> [NO] grabar episodio con provenance/timestamp · [DATA-OUT] `cliente.memoria` (+ señal al North Star)
  **[PASO 7B.2]** Ingerir aprendizaje al KNOWLEDGE versionado.
    [ACTOR:IA] · [CÓMPUTO] candidato de aprendizaje · [DECISIÓN] ¿pasa la suite de regresión + criterio NO-regresión? -> [NO] [FAIL-CLOSED] no ingerir + rutear a revisión [REGLA] BR-4,EC-5 -> [SÍ] write-back a `knowledge_version+1` · [DATA-OUT] Knowledge/cohort (a #6/#10)
    [AUTONOMÍA] N/A · [REGLA] BR-4 // Riesgo: aprendizaje espurio envenena a todos los del cohort
  [FIN 7B]

**[Sub-proceso 7C — Auditoría y corrección humana]** [INICIO]
  **[PASO 7C.1]** Operador audita la ficha.
    [ACTOR:HUMANO] revisa estado/memoria/contratos; ve separación `[V]`/`[I]`, `stale`, `contrato_incompleto` · [DATA-IN] ficha consolidada (tenant-scoped)
  **[PASO 7C.2]** Corregir + firmar (anti-rubber-stamp).
    [ACTOR:HUMANO] corrige un campo · [DECISIÓN] ¿conflicto `[I]` vs `[V]` existente? -> [SÍ] `[V]` gana; registrar conflicto → Evals [REGLA] BR-7,EC-2 -> [NO] continuar · [DECISIÓN] ¿campo crítico? -> [SÍ] exigir re-decisión activa (no 1-clic) [REGLA] BR-7,EC-8 -> [NO] firma estándar · [DATA-OUT] nueva versión del campo `[V]` + firma + motivo + timestamp en trilla
    [AUTONOMÍA] N/A — corrección humana, no acción sobre el cliente · [REGLA] BR-7,BR-8 // Riesgo: rubber-stamp reintroduce el error
  [FIN 7C]

**[Sub-proceso 7D — Servir grounding + aislamiento + trilla]** [INICIO]
  **[PASO 7D.1]** Servir grounding a una pantalla aguas-abajo.
    [ACTOR:IA] · [DATA-IN] solicitud de grounding (Cohorts/NBA/Inbox/Content Studio/Evals/Managed) · [DECISIÓN] ¿el solicitante es del mismo `tenant_id`? -> [NO] [FAIL-CLOSED] bloqueo-rojo + log seguridad [REGLA] BR-1,EC-1 -> [SÍ] continuar · [DECISIÓN] ¿campo `[V]` y fresco? -> [NO] servir marcado (`[I]`/`stale`/`no_verificable`) para que el consumidor degrade [REGLA] BR-2,BR-6 -> [SÍ] servir `[V]`
    [DATA-OUT] grounding por campo + provenance · [REGLA] BR-1,BR-2,BR-6
  **[PASO 7D.2]** Registrar trilla quién-accedió-qué.
    [ACTOR:IA] · [CÓMPUTO] log `{quién, qué campo, cuándo, propósito, tenant_id}` (inmutable) · [REGLA] BR-1 (auditoría) · [DATA-OUT] trilla de auditoría
    [AUTONOMÍA] N/A — la pantalla NO ejecuta, NO toca dinero, NO eleva autonomía; el `min(pedido_NBA, liberado_evals, teto_tier)` se aplica en quien actúa aguas-abajo · [REGLA] BR-8 // Riesgo: que el Cerebro intente actuar
  [FIN 7D]

### Flujo (ASCII)
```
[Inputs/Onboarding/Write-back] -> [7A.1 ingerir] -⟨cross-tenant?⟩-(sí)-> [BLOQUEO-ROJO+log]
                                                  -(no)-⟨contrato completo?⟩-(no)-> [contrato_incompleto -> HUMANO]
                                                                          -(sí)-> [7A.2 provenance/V-I/stale]
   [caso cerrado] -> [7B.1 episodio (episodio_id?)] -(dup)-> [dedup] -(nuevo)-> [7B.2 regresión?] -(no)-> [no ingerir+revisar]
                                                                                                  -(sí)-> [knowledge_version+1]
   [auditoría] -> [7C.1 revisar] -> [7C.2 corregir+firmar] -⟨I vs V?⟩-(sí)-> [V gana + señal Evals]
   [solicitud grounding] -> [7D.1 mismo tenant?] -(no)-> [BLOQUEO-ROJO] -(sí)-> ⟨V y fresco?⟩-(no)-> [servir marcado] -(sí)-> [servir V] -> [7D.2 trilla]
```

### DESPUÉS
**[DATA-OUT]** escribe/sirve desde **Cerebro** (`cliente.estado`, `cliente.memoria`, contratos, provenance por campo, trinca versionada, trilla) -> **Alimenta a:** **Cohorts** (#1, fichas para segmentar), **NBA** (#2, contexto para proponer), **Home** (#3), **Content Studio** (#4, grounding fail-closed del lote), **Inbox** (#5, grounding OBLIGATORIO + recibe write-back), **Evals** (#6, knowledge versionado + conflictos V↔I como señal), **Managed** (#8, historial para QBR), **North Star** (episodio `riesgo→acción→resultado→valor` atribuible + moat de memoria), **Política/Tier** (#10, trinca de anclas). [V: §2; §4; US-M7.1]

### MAPA DE SISTEMAS Y FLUJO DE DATOS
- **[SISTEMA 1]** Cerebro del Cliente (esta pantalla, #7) · [FUNCIÓN] fuente única de verdad por cliente + grounding raíz + memoria/episodios + provenance por campo · [DATOS] `cliente.estado`, `cliente.memoria`, contratos, `knowledge_version`, trilla · [ACCESO] IA (read/write tenant-scoped), operador (read/auditar/corregir) · [GROUNDING] sí (es la raíz)
    // Problema: ficha stale o `[I]` servido como `[V]` -> todo aguas-abajo alucina -> Alimenta a: TODAS las pantallas
- **[SISTEMA 2]** Onboarding / Bootstrap (#9) · [FUNCIÓN] siembra inicial del Cerebro (cold-start, `tier_provisorio`) · [DATOS] inputs canónicos iniciales · [ACCESO] IA propone, humano valida · [GROUNDING] sí
    // Problema: cold-start sin dato -> tier humano conservador -> Alimenta a: [SISTEMA 1]
- **[SISTEMA 3]** Política & Tier (#10) · [FUNCIÓN] aislamiento por tenant (hard-no) + `teto_tier` + trinca · [DATOS] `tenant_id`, `tier_base`, `policy_version` · [ACCESO] humano define · [GROUNDING] sí
    // Problema: aislamiento ausente -> riesgo de fuga -> Alimenta a: [SISTEMA 1] (gobierna BR-1)
- **[SISTEMA 4]** Inbox / E2E (#5) · [FUNCIÓN] write-back del episodio del caso cerrado al Cerebro · [DATOS] `{riesgo, acción, resultado, permanencia, valor}`, `episodio_id` · [ACCESO] IA escribe (anti-doble) · [GROUNDING] sí (lee Cerebro)
    // Problema: episodio doble o aprendizaje espurio -> envenena -> mitigado por BR-4 (episodio_id + regresión)
- **[SISTEMA 5]** Evals (#6) · [FUNCIÓN] consume knowledge versionado + conflictos V↔I como señal; ingesta gateada por regresión · [DATOS] `knowledge_version`, golden/red-team set · [ACCESO] humano promueve / auto-rebaja · [GROUNDING] sí
    // Problema: write-back sin regresión -> golden set contaminado -> mitigado por BR-4
- **[SISTEMA 6]** North Star · [FUNCIÓN] cuenta valor confirmado y atribuible vía episodio (numerador) + moat de memoria · [DATOS] `valor_confirmado_atribuible`, serie de episodios · [ACCESO] liderazgo · [GROUNDING] sí
    // Problema: episodio sin atribución / doble -> numerador inflado -> mitigado por BR-4/EC-7
- **[SISTEMA 7]** Calibración / Salud 1:10 (#11) · [FUNCIÓN] vigila rubber-stamp de la corrección humana (bipolar) · [DATOS] firmas/correcciones · [ACCESO] gobernanza · [GROUNDING] sí
    // Problema: firma-sello -> error reintroducido -> mitigado por BR-7/EC-8

### PUNTOS DE DOLOR / RIESGOS (rankeados por impacto)
- **[RIESGO 1]** Fuga cross-tenant en la ficha (lectura/escritura/share o atribución ambigua) // Impacto: violación GDPR/contrato (Sony↔Warner), hard-no, el moat se vuelve pasivo de seguridad // Mitigación: BR-1/EC-1 bloqueo-rojo + chequeo `tenant_id` pre-operación + trilla [V]
- **[RIESGO 2]** Inferencia `[I]` servida como verdad `[V]` (alucinación con apariencia de fuente) // Impacto: todo el cockpit decide sobre humo; deflection MALA estructural // Mitigación: BR-2/EC-2 provenance por campo; sin sello = no confiable; `[V]` gana en conflicto [V]
- **[RIESGO 3]** Fail-open encubierto: dato stale servido como fresco // Impacto: falsos verdes/dark, decisiones sobre estado-en-riesgo tratado como seguro // Mitigación: BR-6/EC-4 gate de frescura + marca `stale` + retry; fail-open PROHIBIDO [V]
- **[RIESGO 4]** Write-back envenena el Knowledge / episodio doble // Impacto: grounding corrupto para todo el cohort + numerador inflado // Mitigación: BR-4/EC-5 suite de regresión + `episodio_id` único + rollback versionado [V]
- **[RIESGO 5]** Rubber-stamp de la corrección humana // Impacto: la supervisión deja de corregir el error // Mitigación: BR-7/EC-8 re-decisión activa + calibración bipolar #11 [V/I]
- **[RIESGO 6]** La ficha intenta ejecutar/tocar dinero/elevar autonomía // Impacto: rompe fail-closed/`min()`/financial-never-autonomous // Mitigación: BR-8 solo-fuente; guard de salida [V]
**SÍNTESIS DE RIESGO:** el dominante es el **RIESGO 2** (inferencia servida como verdad), porque el "y qué" de esta pantalla es **ser la fuente que ancla TODO**; si el Cerebro puede presentar lo que la IA imaginó como si fuera verdad verificada, el fail-closed pierde su contra-referencia y toda la cadena —Cohorts, NBA, Inbox, Content Studio, Evals, North Star— hereda la alucinación. La provenance por campo (BR-2) es, por eso, la invariante de seguridad más cara de esta pantalla.

### MODELO DE VARIABLES (entidades + campos + relaciones)

**TENANT:**
- `tenant_id` : string · PK [V]
- `nombre` : string [V]
// frontera de aislamiento; cross-tenant prohibido (BR-1)

**CLIENTE (ficha / cerebro raíz):**
- `cliente_id` : string · PK (alias `id_restaurante`) [V]
- `tenant_id` : string · FK → TENANT.tenant_id [V]
- `display_label` : string · vocabulario por toggle (restaurante↔artista/publisher) [V: §6/§7]
- `tier_base` : enum{managed_brand, managed_midmarket, long_tail} · ref Política #10 [V]
- `tier_provisorio` : enum · cold-start conservador, marcado (US-M9.1) [V]
- `opt_out_proactivo` : bool · suprime proactivo, preserva reactivo (BR-5) [V]
- `estado_esperado` : json · del contrato; fuente-de-verdad, no cache (BR-3) [V]
- `estado_consumer` : enum{live_verificado, dark_verificado, no_verificable} [V]
- `frescura_timestamp` : timestamp · gate de stale/TTL (BR-6, EC-4) [I]
- `policy_version` : string · trinca de anclas [V]
- `context_md_version` : string · trinca de anclas [V]
- `knowledge_version` : string · trinca, versionado anti-envenenamiento (BR-4) [V]

**CONTRATO_DE_ACTIVACION:**
- `contrato_id` : string · PK [I]
- `cliente_id` : string · FK → CLIENTE.cliente_id [V]
- `promo_id` : string · ([C/analogía] release_id en Musixmatch) [V]
- `feature_id` : string · vínculo evento de demanda [V]
- `estado_esperado` : json [V]
- `ventana_inicio` : timestamp [V]
- `ventana_fin` : timestamp [V]
- `timezone_restaurante` : string [V]
- `vinculo_evento_demanda` : enum{feature, email, ninguno} [V]
- `contrato_incompleto` : bool · campo faltante → humano, no inferir (BR-3) [V]
- `provenance_por_campo` : map<campo, enum{V,I,C}> · sello por campo (BR-2) [V: §8.8]

**EPISODIO (memoria):**
- `episodio_id` : string · PK · único, anti double-counting (BR-4) [V]
- `cliente_id` : string · FK → CLIENTE.cliente_id [V]
- `case_class_id` : string · clave cluster↔spec↔resultado [V]
- `riesgo` : json [V]
- `accion` : json [V]
- `resultado` : json [V]
- `permanencia_verificada` : bool · probe activo sin regresión [V]
- `valor_confirmado_atribuible` : number · $ que volvió al CRM, atribuible [V]
- `metodo_atribucion` : enum{holdout, evidencia+confirmacion_humana} [V]
- `timestamp` : timestamp [V]
- `provenance` : enum{V,I,C} [V]

**CORRECCION_HUMANA (auditoría):**
- `correccion_id` : string · PK [I]
- `cliente_id` : string · FK → CLIENTE.cliente_id [V]
- `campo` : string · campo corregido [V]
- `valor_anterior` : json [V]
- `valor_nuevo` : json [V]
- `provenance_resultante` : enum{V} · corrección humana = `[V]` (BR-7) [V]
- `firma_operador_id` : string · FK → operador (re-decisión activa) [V]
- `motivo` : string [V]
- `es_campo_critico` : bool · exige re-decisión activa (BR-7, EC-8) [I → OQ-9]
- `timestamp` : timestamp [V]

**ACCESS_LOG (trilla quién-accedió-qué):**
- `log_id` : string · PK [I]
- `cliente_id` : string · FK → CLIENTE.cliente_id [V]
- `tenant_id` : string · FK → TENANT.tenant_id (aislamiento) [V]
- `quien` : string · agente/operador [V]
- `que_campo` : string [V]
- `proposito` : string · minimización: solo resolver/prevenir (BR-5) [V]
- `cuando` : timestamp [V]
- `tipo` : enum{lectura, escritura, share} [V]

Relaciones:
- TENANT 1—N CLIENTE
- CLIENTE 1—N CONTRATO_DE_ACTIVACION
- CLIENTE 1—N EPISODIO
- CLIENTE 1—N CORRECCION_HUMANA
- CLIENTE 1—N ACCESS_LOG
- TENANT 1—N ACCESS_LOG

### Gobernanza / anchor-check
- **[AUTONOMÍA]** esta pantalla **sirve grounding**; no ejecuta acción, no toca dinero, no eleva autonomía. La autonomía efectiva la calcula quien actúa aguas-abajo como `min(pedido_NBA, liberado_evals, teto_tier)` y nunca el máximo; si cualquier entrada del `min()` es nula/ausente/ilegible, se sustituye por el tier más conservador ANTES del `min` ("sin eval" ≠ "sin restricción"). [V: §2; US-M10.1]
- **Hard-nos presentes:** cross-tenant (BR-1, EC-1) = bloqueo-rojo absoluto + trilla; financial-never-autonomous (BR-8) = la ficha no toca dinero; texto-en-screenshot=dato — N/A directo aquí (el intake multimodal vive en Inbox #5), pero el Cerebro **recibe** el resultado ya anclado y solo graba episodios con provenance. [V: §8; §10]
- **Fail-closed:** estado-desconocido = estado-en-riesgo; fail-open PROHIBIDO (BR-6); `[I]` nunca se presenta como `[V]` (BR-2). [V: §2; AUT-14]
- **Versionado:** `policy_version`, `context_md_version`, `knowledge_version` (trinca); write-back con suite de regresión (BR-4). [V]
- **Anti-rubber-stamp:** corrección/firma humana con re-decisión activa; alimenta calibración bipolar #11 (BR-7). [V]
- **Variables escenario [C]:** `TTL_frescura [C]`, `ventana_permanencia [C: 14 días]`, `piso_de_confianza [C: 0.7]` (para juzgar inferencias servidas), umbral de regresión del write-back `[C]`. // el valor es placeholder; lo real es el mecanismo.

---

## OPEN QUESTIONS `[I]` (para el operador — PT-BR)

> Cada uma é o ponto onde o grill PARARIA para perguntar ao operador. A recomendação `[I]` adotada no spec está entre parênteses; o spec deve ser reconfirmado quando estas forem respondidas.

- **OQ-1 (PROCESSING/granularidade · não-bloqueante):** O Cerebro versiona **campo a campo** (cada campo tem seu histórico/versão) ou versiona a **ficha inteira** por snapshot? _(Recomendo: versionamento por campo com provenance por campo, para permitir corrigir um `[I]` sem reescrever a ficha toda e manter trilha granular.)_
- **OQ-2 (UI/PROCESSING · não-bloqueante):** Quando o humano corrige um campo, cria-se uma **nova versão imutável do campo** (com a anterior preservada para auditoria) ou se **sobrescreve** mantendo só a trilha? _(Recomendo: nova versão imutável; a anterior fica auditável.)_
- **OQ-3 (DATA-IN · BLOQUEANTE se mudar o caminho de acesso):** Quais são as **fontes canônicas exatas** que alimentam o Cerebro (integrações/CRM/Onboarding) e qual o **caminho/permissão de acesso** de cada uma, por tenant? _(Recomendo: Onboarding #9 semeia; integrações de campanha/price-match alimentam estado vivo; Inbox #5 faz write-back de episódios — todas tenant-scoped.)_ — **falsify:** você já viu essas fontes existirem e responderem, ou está supondo?
- **OQ-4 (DATA-OUT · BLOQUEANTE se mudar o contrato de grounding):** Qual é o **contrato exato de "servir grounding"** que as telas aguas-abajo consomem (payload por campo, provenance, frescura, SLA de latência)? _(Recomendo: `{campo, valor, provenance, frescura_timestamp, stale_flag}` por campo, tenant-scoped; SLA de leitura `[C]`.)_ — liga à §11.7 (quem consome e com qual SLA).
- **OQ-5 (PROCESSING/EDGE · não-bloqueante):** Qual o **TTL de frescura** por tipo de campo (a partir de quando `estado_consumer`/contrato vira `stale`/`no_verificable`)? _(Recomendo: TTL `[C]` por tipo, mais curto perto do pico (analogia checkpoints T-72h→T-0 do E2E); fail-open PROIBIDO.)_
- **OQ-6 (PROCESSING · não-bloqueante):** A **suite de regressão anti-envenenamiento** do write-back ao KNOWLEDGE roda por sub-causa/cohort, e qual o **critério de NO-regressão** para confirmar a ingestão? _(Recomendo: regressão por sub-causa + critério de NO-regressão antes de confirmar `knowledge_version+1`, coerente com 01_e2e 3.6.5.)_
- **OQ-7 (NON-FUNC/auditoria · não-bloqueante):** Qual o **formato e a retenção** da trilha "quem-acessou-o-quê" (imutável? por quanto tempo? exposta a quem)? _(Recomendo: log imutável `{quem, campo, quando, propósito, tenant_id, tipo}`, retenção por política/GDPR, visível só à governança do tenant.)_
- **OQ-8 (EDGE · não-bloqueante):** Quando um campo está **stale**, o Cerebro o **serve marcado `stale`** (consumidor degrada) ou o **oculta** até refrescar? _(Recomendo: servir marcado `stale` + último valor `[V]` + timestamp, nunca ocultar silenciosamente nem servir como fresco.)_
- **OQ-9 (GOVERNANCE/anti-rubber-stamp · não-bloqueante):** Quais campos contam como **"críticos"** e exigem **re-decisão ativa** na correção humana (ex.: `estado_esperado`, contrato de ativação, atribuição de valor)? _(Recomendo: campos que afetam grounding de ação ou o numerador do North Star.)_
- **OQ-10 (UI · não-bloqueante):** Para um **cliente sem ficha semeada** (tenant novo), qual o estado vazio desejado? _(Recomendo: estado vazio com link para Onboarding #9, não ficha em branco.)_
- **OQ-11 (METRICS/moat · não-bloqueante):** Como se **mede o "moat de memória"** (esforço por unidade de valor caindo a cada episódio) — qual a métrica e a janela? _(Recomendo: episódios resolvidos por unidade de esforço ao longo do tempo, com `ventana_permanencia [C: 14 dias]`; liga à §11.2.)_
- **OQ-12 (toggle · não-bloqueante):** No **toggle Musixmatch**, confirma-se que só mudam `display_label` e modelo de dinero (restaurante→artista/publisher; promo→release), e que **hard-nos, provenance e separação V/I permanecem invariantes**? _(Recomendo: sim — §6/§7; declarar onde a estrutura quebra (cohort de 3 majors) sem fingir operar Musixmatch.)_

---

### Convergence note
- **Cobertura: 11/11.** Sem `[I]` bloqueante remanescente que altere um trigger, um router/`min()`, um hard-no ou deixe uma épica não-desenvolvível. **OQ-3** (fontes/caminho de acesso) e **OQ-4** (contrato de grounding) são os mais próximos de bloqueantes: afetam DATA-IN/DATA-OUT — adotadas recomendações tenant-scoped e fail-closed, seguras por construção; reconfirmar com o operador.
- **Épicas MECE:** EPIC-1 (modelo vivo: estado+memoria+contrato), EPIC-2 (ingestão+write-back+versionado), EPIC-3 (isolamento+PII+trilha), EPIC-4 (auditoria+correção humana) cobrem a tela sem sobreposição; cada uma desenvolvível.
- **Invariantes honrados:** `min(pedido_NBA, liberado_evals, teto_tier)` (aplicado aguas-abajo; aqui a ficha só serve grounding e nunca eleva autonomia), cross-tenant hard-no (BR-1), financial-never-autonomous (BR-8), provenance por campo / `[I]`≠`[V]` (BR-2), fail-closed / fail-open proibido (BR-6), versionado + anti-envenenamento (BR-4), anti-rubber-stamp (BR-7), PII/minimização/opt-out (BR-5).
