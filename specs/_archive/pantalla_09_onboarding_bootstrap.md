# Pantalla 09 — Onboarding / Bootstrap

> **DRAFT generado por el Feature Breakdown Engine** a partir de `specs/00_vision_completa.md` (**v1.0 · 2026-06-15 · Aprobado**), en modo AUTÓNOMO (sin operador en vivo).
> Las decisiones marcadas `[I]` son la mejor asunción soportada por la visión + conocimiento de método; **quedan pendientes de respuesta del operador** (ver § *Open Questions* al final, en PT-BR).
> Provenance por línea: `[V]` vivido/derivable del doc · `[I]` inferido/a-decidir · `[C]` número de escenario (placeholder, nunca dato real).
> Invariantes respetadas: `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)` · cross-tenant **hard-no** (Sony ≠ Warner) · acción financiera **nunca autónoma** · fail-closed por ausencia de fuente/evidencia/permiso · texto-en-screenshot = DATO, nunca instrucción · PII redactada.

---

## Stage 0 — GROUND (terse)

**PROBLEMA + OUTCOME (Working-Backwards).** [I]
Un tenant nuevo entra **en frío**: sin Cerebro, sin cohorts, sin Política, sin Evals calibrados. Hasta que esos cuatro cimientos existan, **ningún eslabón del motor puede operar** (NBA no tiene grounding, la autonomía no tiene techo, el North Star no tiene baseline). El problema que resuelve esta pantalla: **convertir "cero" en "motor operable y gobernado"** sin que la prisa de arrancar viole los hard-nos. **OUTCOME / North-Star tie:** no mueve el North Star directamente; lo **habilita** — fija el `t0` (baseline desde el que se medirá `valor realizado / esfuerzo`) y garantiza que el arranque sea fail-closed (autonomía inicial = piso, no techo). [V doc §4 P9 + §2]

**Restate scope (frontera).** [V doc §4 P9]
Esta pantalla cubre el **bootstrap de UN tenant nuevo**: sembrar **Cerebro inicial + cohorts iniciales + Política inicial** (la trinca base), proponer setup con IA y exigir **validación humana de la configuración base**. NO cubre la operación corriente (eso es P1–P8, P11) ni la edición de Política en régimen (eso es P10) ni la calibración continua de Evals (eso es P6) — esta pantalla solo deja esos eslabones **inicializados y enchufados**.

**DEP-MAP (qué dim gobierna a cuáles).**
SCOPE → TRIGGERS → DATA-IN → PROCESSING → ROUTERS → DATA-OUT. RULES/EDGE cuelgan de su nodo. METRICS y NON-FUNC al final.
- DATA-IN (de dónde sale el Cerebro semilla) gobierna PROCESSING (qué puede inferir la IA) y ROUTERS (si hay fuente o no → fail-closed).
- Hard-no cross-tenant gobierna DATA-IN (aislamiento de ingest) **y** DATA-OUT (namespace del tenant) **y** PROCESSING (la IA no puede usar otro tenant como semilla).
- `teto_tier` inicial (Política base) gobierna toda la autonomía posterior vía `min()`.

**Cobertura de las 11 dims: 11/11** (resueltas desde doc + método + asunciones `[I]` registradas).

| # | Dim | Estado | Fuente |
|---|---|---|---|
| 1 | SCOPE & ACTORS | cubierta | doc §4 P9, §8.3 |
| 2 | TRIGGERS / ENTRY | cubierta | doc §4 P9 + [I] |
| 3 | DATA-IN | cubierta | doc §2 (Cerebro), §5 P5 + [I] |
| 4 | PROCESSING / LOGIC | cubierta | doc §2, §4 P1/P10 + [I] |
| 5 | ROUTERS / DECISIONS | cubierta | doc §2 fail-closed + [I] |
| 6 | DATA-OUT | cubierta | doc §2 eslabones + [I] |
| 7 | UI / STATES | cubierta | doc §8.8 provenance + [I] |
| 8 | BUSINESS-RULES / INVARIANTS | cubierta | doc §2, §5, §8, §10 |
| 9 | EDGE / ABNORMAL INPUT | cubierta | pre-mortem + doc §10 |
| 10 | METRICS / NORTH-STAR | cubierta | doc §3 + [I] |
| 11 | NON-FUNC & GOV-OPS | cubierta | doc §8, §11.7 + [C] |

---

## OUTPUT 1 — ÉPICAS, USER STORIES & RECORRIDO

**SÍNTESIS:** Onboarding/Bootstrap es el **encendido fail-closed del motor para un tenant nuevo**: sin él, los seis eslabones (§2) no tienen raíz — el Cerebro está vacío, no hay cohorts que percentilar, no hay `teto_tier` que limite el `min()`, y el North Star no tiene `t0`. Sin esta pantalla, **se rompe el eslabón 1 (Cerebro) y, en cascada, todos los demás**. [V doc §2 + §4 P9]
**PROBLEMA:** un tenant arranca en frío y nada del motor puede operar hasta tener Cerebro+Cohorts+Política sembrados y validados por humano. [V doc §4 P9]
**OUTCOME:** habilitador del North Star — fija el baseline `t0` y garantiza arranque gobernado (autonomía inicial = piso). No mueve la métrica; **la enchufa**. [I deriva de §2/§3]
**PLACEMENT:** esta pantalla = **1 de 11** (§4); aguas-arriba: ninguna (es el origen del ciclo de vida del tenant). Aguas-abajo: **alimenta a P7/Cerebro, P1/Cohorts, P10/Política, P6/Evals** — y a través de ellos, a todo el motor. Hermanas conocidas: P10 (Política & Trinca, edición en régimen — fuera de alcance aquí), P6 (Evals, calibración continua — fuera de alcance), P7 (Ficha/Cerebro, mantenimiento en régimen — fuera de alcance). [V doc §4]

### Épicas (MECE; descomponen ESTA pantalla sin solape; cada una desarrollable)

---

**EPIC-1 — Provisión y aislamiento del tenant** | alcance: crear el tenant, su namespace de datos y su frontera cross-tenant ANTES de ingerir nada | cubre dims: 1, 2, 8, 11 | spec: **WHAT** (todo dato del tenant nace en su namespace aislado; cross-tenant = hard-no desde el byte cero) **| HOW** (crear `tenant_id` → crear namespace/aislamiento → registrar tier provisional → log de auditoría de creación). Camino determinista → GWT exhaustivo.

  Features:
  - **F-1.1 Creación del tenant + namespace aislado**
    - **US-1.1.1** | MoSCoW: Must | Hito: H1 — Como **admin de plataforma**, quiero **crear un tenant nuevo con un namespace de datos aislado**, para que **ningún dato suyo pueda mezclarse jamás con otro tenant (Sony ≠ Warner)**. [V doc §8.3, §10.4]
      - Given que no existe tenant con ese identificador, When creo el tenant, Then se genera un `tenant_id` único y un namespace de datos exclusivo, y se registra en el audit-trail con firma del admin. [V]
      - (edge) Given un intento de crear un tenant cuyo nombre/identificador ya existe, When confirmo, Then **bloqueo + aviso** (no se reusa namespace). [I]
      - (edge) Given que la creación del namespace falla a mitad, When ocurre el fallo, Then **rollback total** (no queda tenant a medio-crear) + alerta al admin (fail-closed). [I]
  - **F-1.2 Tier provisional y techo de autonomía inicial**
    - **US-1.2.1** | MoSCoW: Must | Hito: H1 — Como **operador onboarding**, quiero que **el tenant nazca con `teto_tier` en el nivel más conservador (solo-sugerir / autonomía=0 efectiva)**, para que **la IA nunca actúe de más durante el arranque**. [V doc §2 fail-closed]
      - Given un tenant recién creado, When se inicializa la Política base, Then `teto_tier` = piso (sugerir-only), `liberado_evals` = 0 (sin golden set aún) y por tanto `nivel_efectivo = min(pedido_NBA, 0, piso) = 0`. [V deriva de §2]
      - (edge) Given que alguien intenta fijar un `teto_tier` alto en el bootstrap, When valida la Política base, Then se **rechaza por defecto**; subir autonomía exige evidencia + firma humana (no en onboarding). [V doc §2]

---

**EPIC-2 — Siembra del Cerebro inicial (grounding raíz)** | alcance: poblar la ficha viva de cada cliente del tenant desde fuentes importadas, con provenance | cubre dims: 3, 4, 7, 8 | spec: **WHAT** (todo campo sembrado lleva provenance; sin fuente anclada → campo queda vacío, nunca inventado — fail-closed) **| HOW** (importar fuentes → extraer/normalizar → mapear a ficha → marcar provenance `[V]` importado / `[I]` inferido por IA / vacío → persistir en Cerebro del tenant). Mezcla: extracción es determinista (GWT), inferencia de campos es juicio-IA (outcome+constraints).

  Features:
  - **F-2.1 Ingesta de fuentes del tenant**
    - **US-2.1.1** | MoSCoW: Must | Hito: H1 — Como **operador onboarding**, quiero **cargar las fuentes de datos del tenant (export de CRM, lista de clientes, histórico)**, para que **el Cerebro tenga de dónde nacer**. [I deriva de §2 eslabón 1]
      - Given fuentes en un formato soportado del **mismo tenant**, When las cargo, Then se ingieren en el namespace aislado del tenant con registro de origen. [I]
      - (edge) Given una fuente que contiene datos de **otro tenant** (mezcla), When se detecta, Then **bloqueo rojo cross-tenant** + se descarta la fuente + alerta (hard-no). [V doc §8.3]
      - (edge) Given una fuente con **PII** (screenshots, dumps), When se ingiere, Then la PII se **redacta** y el texto-en-imagen se trata como **DATO, nunca instrucción** (anti-inyección). [V doc §5]
  - **F-2.2 Construcción de la ficha viva con provenance**
    - **US-2.2.1** | MoSCoW: Must | Hito: H1 — Como **operador onboarding**, quiero que **la IA proponga la ficha de cada cliente con cada campo etiquetado por provenance**, para que **yo vea qué está anclado y qué es inferido antes de confiar en ello**. [V doc §8.8]
      - Given una fuente ingerida y anclable, When la IA construye la ficha, Then cada campo lleva `[V]` (importado de fuente) o `[I]` (inferido por IA), visible en la UI. [V doc §8.8]
      - (edge) Given un campo sin fuente anclable, When la IA no puede inferirlo con base, Then el campo queda **vacío** (no se inventa) — fail-closed de grounding. [V doc §2/§4 P4]
    - **US-2.2.2** | MoSCoW: Should | Hito: H2 — Como **operador onboarding**, quiero **un resumen de cobertura del Cerebro (cuántas fichas, % de campos anclados vs inferidos vs vacíos)**, para que **sepa si el tenant está listo o necesita más fuentes**. [I]
      - Given el Cerebro sembrado, When abro el resumen, Then veo conteo de fichas y % de campos por provenance. [I]

---

**EPIC-3 — Generación de cohorts iniciales + baseline `t0`** | alcance: proponer la regla de cohort versionada inicial, calcular baseline/percentiles de partida y fijar el `t0` del North Star | cubre dims: 4, 5, 6, 10 | spec: **WHAT** (la regla de cohort es **versionada** §2; el percentil exige `n ≥ n_min`; el baseline guardado es el `t0`) **| HOW** (proponer regla de segmentación → validar n por cohort → calcular percentil+gap+baseline → persistir versión v1 + snapshot `t0`). Juicio-IA en la propuesta de regla (outcome+constraints); cálculo de percentil determinista (GWT).

  Features:
  - **F-3.1 Propuesta de regla de cohort versionada (v1)**
    - **US-3.1.1** | MoSCoW: Must | Hito: H1 — Como **operador onboarding**, quiero que **la IA proponga una regla inicial de cohort y la guarde versionada (v1)**, para que **el motor tenga grupos sobre los que percentilar y la regla sea auditable**. [V doc §2 cohort versionado, §4 P1]
      - Given un Cerebro con fichas suficientes, When la IA propone la regla v1, Then se persiste como **versión inmutable v1** con autor (IA-propuesto) y validador (humano). [V doc §2]
      - (edge) Given que un cohort propuesto tiene `n < n_min`, When se valida la regla, Then ese cohort se marca **"percentil no significativo"** (oculto + aviso, fail-closed) — no se reporta percentil sobre ruido. [I deriva de §11.4]
  - **F-3.2 Baseline + snapshot `t0` del North Star**
    - **US-3.2.1** | MoSCoW: Must | Hito: H2 — Como **operador onboarding**, quiero que **al confirmar la regla v1 se guarde el baseline del cohort y el snapshot `t0`**, para que **el North Star tenga el punto cero desde el que medir valor realizado**. [I deriva de §3]
      - Given regla v1 validada, When confirmo, Then se persiste baseline por cohort + percentil+gap por cliente + timestamp `t0`. [I]
      - (edge) Given que el tenant tiene `< n_min` clientes en total, When intento fijar `t0`, Then se permite el arranque pero el North Star queda en estado **"baseline insuficiente — atribución diferida"** (no se finge métrica). [I]

---

**EPIC-4 — Inicialización de la trinca de gobernanza + Evals vacíos** | alcance: crear Política base + `context.md` + Knowledge inicial (trinca §2) y la matriz Evals cohort × intent vacía (todo rojo) | cubre dims: 4, 8, 10, 11 | spec: **WHAT** (la trinca define `teto_tier`; los Evals nacen vacíos → `liberado_evals=0`; promover autonomía = humano+evidencia, rebajar = automático §6) **| HOW** (instanciar plantilla de Política → crear `context.md` + Knowledge base → generar matriz Evals cohort×intent vacía → conectar a la fórmula `min()`). Determinista (GWT).

  Features:
  - **F-4.1 Política base + `context.md` + Knowledge (trinca)**
    - **US-4.1.1** | MoSCoW: Must | Hito: H1 — Como **humano que gobierna (operador/admin)**, quiero **validar la Política base, el `context.md` y el Knowledge inicial propuestos por la IA**, para que **`teto_tier` quede fijado por humano y la IA solo opere dentro de él**. [V doc §4 P10, §2]
      - Given la trinca propuesta por la IA, When la valido y firmo, Then se persiste con `teto_tier` = piso, hard-no cross-tenant activo, y regla "acción financiera nunca autónoma" activa. [V doc §2, §5, §10.4]
      - (edge) Given que el humano no valida (la deja en borrador), When alguien intenta operar el tenant, Then el tenant queda **bloqueado/no-operable** hasta que haya firma humana (fail-closed). [I]
  - **F-4.2 Matriz Evals cohort × intent vacía (estado inicial)**
    - **US-4.2.1** | MoSCoW: Must | Hito: H2 — Como **operador onboarding**, quiero que **se genere la matriz Evals cohort × intent en estado vacío (todo rojo, `liberado_evals=0`)**, para que **la autonomía no pueda subir hasta que haya golden set + evidencia**. [V doc §2, §6]
      - Given cohorts v1 + catálogo de intents, When se inicializa Evals, Then existe una celda por cohort×intent en estado ROJO con `liberado_evals=0`. [V deriva de §2/§6]
      - (edge) Given que falta el catálogo de intents, When se inicializa Evals, Then se usa el **catálogo cerrado base de NBA** (§3) y se marca cualquier hueco como `[I]` para revisión humana. [I]

---

**EPIC-5 — Gate humano de activación + handoff al motor** | alcance: la compuerta final donde el humano confirma "tenant listo" y se libera el handoff a P1–P11 | cubre dims: 5, 6, 7, 11 | spec: **WHAT** (sin firma humana de activación, el tenant NO opera — gate obligatorio; el handoff escribe los punteros que el resto del motor consume) **| HOW** (checklist de readiness → firma humana anti-rubber-stamp → set tenant=ACTIVO → emitir eventos de handoff a Cerebro/Cohorts/Política/Evals). Determinista (GWT).

  Features:
  - **F-5.1 Checklist de readiness + firma de activación**
    - **US-5.1.1** | MoSCoW: Must | Hito: H2 — Como **humano que gobierna**, quiero **un checklist de readiness (Cerebro sembrado, cohorts v1, Política firmada, Evals inicializados) y firmar la activación**, para que **el tenant solo pase a ACTIVO con revisión humana real, no un sello automático**. [V doc §4 P9, §11 anti-rubber-stamp]
      - Given los 4 cimientos en estado mínimo viable, When reviso el checklist y firmo, Then el tenant pasa a ACTIVO y la firma queda en audit-trail con timestamp + identidad. [I deriva de §4 P9/§8.8]
      - (edge) Given un checklist con un cimiento faltante (ej. Política sin firmar), When intento activar, Then **bloqueo** — no se puede activar (fail-closed). [I]
      - (edge) Given una firma sospechosa de rubber-stamp (ej. activación < N segundos tras abrir el checklist), When se firma, Then se **registra el patrón** para la calibración anti-rubber-stamp de P11. [I deriva de §10.6]
  - **F-5.2 Handoff a los eslabones del motor**
    - **US-5.2.1** | MoSCoW: Must | Hito: H2 — Como **sistema**, quiero **emitir el handoff (punteros a Cerebro/Cohorts/Política/Evals + `t0`) cuando el tenant pasa a ACTIVO**, para que **P1–P11 puedan operar el tenant nuevo sin re-preguntar nada**. [I deriva de §2 cadena]
      - Given tenant=ACTIVO, When se completa la activación, Then se publican los eventos/punteros que consumen P1 (Cohorts), P2 (NBA), P6 (Evals), P7 (Cerebro), P10 (Política). [I]
      - (edge) Given que un consumidor aguas-abajo no acusa recibo del handoff, When expira el timeout, Then se **reintenta** y, si persiste, se alerta (el tenant queda ACTIVO pero con flag "handoff incompleto"). [I]

### Recorrido (primera persona, clic por clic, estado-por-estado, incl. vacío/carga/error)

Yo, como **operador onboarding**, entro en **Onboarding / Bootstrap** para un tenant nuevo (ej. "Warner"). Veo un **wizard de 5 pasos** (Provisión → Cerebro → Cohorts → Trinca/Evals → Activación) con una barra de progreso y, en el lado, un panel de **provenance y hard-nos siempre visible** (cross-tenant: BLOQUEADO ✓, financiero: nunca autónomo ✓, autonomía inicial: `min()`=0).

**Paso 1 — Provisión.** Veo un formulario "Crear tenant". Escribo el nombre, hago clic en **Crear**. Espero que se abra un estado de **carga** ("creando namespace aislado…"). Si todo va bien, veo "Tenant `warner` creado · namespace aislado ✓ · `teto_tier`=piso". Si el nombre ya existe, veo un **aviso rojo** "ya existe — elige otro". Si falla a mitad, veo "creación revertida (rollback)" y un botón **Reintentar**.

**Paso 2 — Cerebro.** Veo una zona de **carga de fuentes** (vacía al inicio: "aún no hay fuentes — carga el export del CRM o la lista de clientes"). Subo el archivo, hago clic en **Ingerir**. Espero un estado de carga ("redactando PII · anclando · construyendo fichas…"). Veo aparecer las fichas con cada campo etiquetado `[V]`/`[I]`/vacío. Si una fuente trae datos de otro tenant, veo **bloqueo rojo cross-tenant** y la fuente se descarta. Abajo veo el **resumen de cobertura** (ej. "320 fichas · 64% campos `[V]` · 21% `[I]` · 15% vacíos").

**Paso 3 — Cohorts.** Veo la **propuesta de regla v1** de la IA (con su razonamiento) y, debajo, los cohorts resultantes con su `n`. Los cohorts con `n < n_min` aparecen atenuados con la etiqueta "percentil no significativo". Hago clic en **Validar regla v1**. Espero que se calcule baseline+percentil+gap y se fije el **snapshot `t0`**. Veo "regla v1 versionada ✓ · `t0` fijado". Si el tenant tiene muy pocos clientes, veo "baseline insuficiente — atribución diferida" (no se finge métrica).

**Paso 4 — Trinca & Evals.** Veo la **Política base + `context.md` + Knowledge** propuestos por la IA, con el hard-no cross-tenant y "financiero nunca autónomo" ya marcados como no-editables. Reviso y hago clic en **Firmar Política base**. Veo generarse la **matriz Evals cohort × intent toda en ROJO** con "`liberado_evals`=0". Confirmo que entiendo que la autonomía solo sube con evidencia + firma (P6).

**Paso 5 — Activación.** Veo el **checklist de readiness**: Cerebro ✓ · Cohorts v1 ✓ · Política firmada ✓ · Evals inicializados ✓. Si algo falta, el botón **Activar** está deshabilitado y veo qué falta. Cuando todo está verde, leo un resumen, hago clic en **Activar tenant** y **firmo**. Espero el estado de carga del **handoff** ("publicando punteros a Cerebro/Cohorts/Política/Evals…"). Veo "Tenant **ACTIVO** · motor habilitado · `t0` = <timestamp>". Si un consumidor aguas-abajo no responde, veo un flag amarillo "handoff incompleto — reintentando".

---

## OUTPUT 2 — BUSINESS RULES + EDGE CASES + FAILURE HANDLING

**SÍNTESIS:** el modo de fallo que más amenaza al North Star aquí no es un percentil ruidoso (eso es P1) sino **arrancar un tenant con grounding inventado o con autonomía abierta de más** — un Cerebro semilla fabricado contamina TODA decisión posterior, y un `teto_tier` alto en frío rompe el `min()` antes de que existan Evals. Por eso el bootstrap es **fail-closed por construcción**: nace en piso y solo sube con evidencia + firma. [V deriva de §2, §3, §10]

### A. Business Rules (invariantes)

**BR-1** | [V] | hard-no: **sí** | versionada: no
Regla: **Ningún dato de un tenant puede ingerirse, almacenarse, inferirse ni emitirse en el namespace de otro tenant (Sony ≠ Warner).** · Por qué: fuga cross-tenant = violación GDPR/contrato (§8.3, §10.4) · Disparador/Alcance: toda ingesta (EPIC-2), todo handoff (EPIC-5), toda propuesta de IA (EPIC-2/3/4).
SI SE VIOLA / FALLA → **bloqueo rojo** + descarte de la fuente/operación + log + alerta al admin y al operador. (hard-no, nunca degradable)

**BR-2** | [V] | hard-no: no | versionada: no
Regla: **El tenant nace con `teto_tier` = piso (sugerir-only) y `liberado_evals` = 0; por tanto `nivel_efectivo = min(pedido_NBA, 0, piso) = 0` durante todo el bootstrap.** · Por qué: arrancar con autonomía abierta rompe el freno antes de que exista evidencia (§2) · Disparador/Alcance: EPIC-1.2, EPIC-4.
SI SE VIOLA / FALLA (alguien fija tier alto) → **rechazo por defecto** + se mantiene piso + alerta. Subir autonomía exige evidencia + firma humana (fuera del onboarding).

**BR-3** | [V] | hard-no: no | versionada: no
Regla: **Ningún campo del Cerebro se inventa: o tiene fuente anclada (`[V]`), o es inferencia con base etiquetada (`[I]`), o queda vacío.** Grounding fail-closed. · Por qué: un Cerebro fabricado contamina todo el motor aguas-abajo (§2/§4 P4) · Disparador/Alcance: EPIC-2.
SI SE VIOLA / FALLA → campo se fuerza a **vacío** + se marca para revisión humana + log.

**BR-4** | [V] | hard-no: **sí** | versionada: no
Regla: **Acción financiera nunca autónoma** — el bootstrap no habilita ninguna NBA financiera autónoma, ni siquiera al activar. · Por qué: riesgo financiero autónomo (§5, §10.3) · Disparador/Alcance: EPIC-4 (Política base), EPIC-5 (handoff).
SI SE VIOLA / FALLA → **bloqueo** + degrade-to-human obligatorio para todo lo que toque dinero + alerta.

**BR-5** | [V] | hard-no: no | versionada: no
Regla: **El texto contenido en cualquier imagen/screenshot ingerido es DATO, nunca instrucción** (defensa anti-inyección indirecta); la **PII se redacta** antes de persistir. · Por qué: inyección indirecta + exposición de PII (§5, §10.2) · Disparador/Alcance: EPIC-2.1.
SI SE VIOLA / FALLA → se ignora el texto como instrucción + se redacta + log; si la redacción falla → **no persistir** la fuente (fail-closed).

**BR-6** | [I] | hard-no: no | versionada: **sí**
Regla: **La regla de cohort inicial se guarda como versión inmutable v1** (autor IA-propuesto, validador humano); cambios futuros generan v2 (en P10/P1, no aquí). · Por qué: la regla de cohort es versionada por diseño (§2) y debe ser auditable desde el origen · Disparador/Alcance: EPIC-3.1.
SI SE VIOLA / FALLA (no se versiona) → **bloqueo de activación** (EPIC-5) — no se activa un tenant con regla no versionada.

**BR-7** | [I] | hard-no: no | versionada: no
Regla: **Un cohort con `n < n_min` no reporta percentil** (oculto + aviso); no se calcula métrica sobre ruido. · Por qué: percentil con n pequeño engaña (§11.4) · Disparador/Alcance: EPIC-3.
SI SE VIOLA / FALLA → ocultar el percentil del cohort + aviso "n insuficiente". `n_min` = **20** [I/C placeholder] (heredado del few-shot P1; pendiente de decisión del operador, §11.4).

**BR-8** | [I] | hard-no: no | versionada: no
Regla: **El tenant NO pasa a ACTIVO sin firma humana de activación** sobre un checklist de readiness completo (Cerebro+Cohorts+Política+Evals). · Por qué: arranque gobernado, anti-rubber-stamp (§4 P9, §11) · Disparador/Alcance: EPIC-5.
SI SE VIOLA / FALLA → tenant permanece en estado BORRADOR/NO-OPERABLE; ningún eslabón aguas-abajo lo consume.

**BR-9** | [V] | hard-no: no | versionada: no
Regla: **Todo campo y toda decisión del bootstrap llevan provenance visible (`[V]`/`[I]`/`[C]`)**; todo número de escenario va rotulado `[C]` (nunca como dato real). · Por qué: honestidad de provenance exigida en UI (§8.8, §10.9) · Disparador/Alcance: todas las épicas.
SI SE VIOLA / FALLA → no renderizar el campo sin etiqueta + log de inconsistencia.

**BR-10** | [I] | hard-no: no | versionada: no
Regla: **Al fijar `t0`, si hay `< n_min` clientes totales, el North Star queda en "baseline insuficiente — atribución diferida"** (no se finge métrica). · Por qué: North Star sin atribución = teatro (§3, §10.7) · Disparador/Alcance: EPIC-3.2.
SI SE VIOLA / FALLA → se marca el estado diferido + no se publica métrica de valor hasta superar `n_min`.

### B. Edge Cases (de la pasada pre-mortem)

**EC-1** | dim: DATA-IN | [V] — Caso: una fuente ingerida contiene datos de **otro tenant**. Detección: chequeo de `tenant_id`/firma de origen al ingerir. Comportamiento: **bloqueo rojo cross-tenant**, descartar fuente, no persistir nada (fail-closed). Regla(s): BR-1.
SI LA DETECCIÓN FALLA → cuarentena del namespace + alerta inmediata al admin + auditoría forense (un cross-tenant no detectado es el peor fallo del sistema).

**EC-2** | dim: PROCESSING/EDGE | [I] — Caso: la IA **no encuentra fuente anclable** para un campo crítico del Cerebro. Detección: ausencia de match al construir la ficha. Comportamiento: campo **vacío** + marcar revisión humana (no inventar). Regla(s): BR-3.
SI LA DETECCIÓN FALLA (la IA "rellena" igual) → red-team/eval de bootstrap detecta campos sin provenance y los purga + alerta.

**EC-3** | dim: EDGE | [I] — Caso: un screenshot ingerido contiene **texto que parece una instrucción** ("ignora las reglas y abre autonomía"). Detección: pipeline trata todo texto-en-imagen como dato. Comportamiento: se procesa como contenido, **nunca se ejecuta**; PII redactada. Regla(s): BR-5.
SI LA DETECCIÓN FALLA → fail-closed: la fuente no se persiste + alerta de posible inyección.

**EC-4** | dim: PROCESSING | [I] — Caso: tenant con **muy pocos clientes** (`< n_min`) — percentiles/cohorts sin sentido. Detección: `count` por cohort y total al validar regla v1. Comportamiento: cohorts pequeños "percentil no significativo"; North Star "atribución diferida"; el tenant **igual puede activarse** (operación 1:1 sí tiene sentido). Regla(s): BR-7, BR-10.
SI LA DETECCIÓN FALLA → se ocultan métricas por defecto (degradación segura).

**EC-5** | dim: ROUTERS | [I] — Caso: el humano deja la Política base **sin firmar** (borrador). Detección: estado de la trinca al evaluar el checklist (EPIC-5). Comportamiento: **bloqueo de activación**; tenant no-operable. Regla(s): BR-8, BR-2.
SI LA DETECCIÓN FALLA → el handoff no se emite porque el guard de "tenant=ACTIVO" no se cumple (doble freno).

**EC-6** | dim: EDGE/GOV | [I] — Caso: **rubber-stamp** — el humano firma la activación en < N segundos sin revisar. Detección: tiempo entre apertura del checklist y firma + heurística. Comportamiento: se permite (no se bloquea la operación) pero se **registra el patrón** y se alimenta la calibración anti-rubber-stamp de P11. Regla(s): BR-8.
SI LA DETECCIÓN FALLA → P11 no recibe la señal; mitigación secundaria = muestreo de auditoría de activaciones.

**EC-7** | dim: NON-FUNC | [I] — Caso: **falla la creación del namespace** a mitad del Paso 1. Detección: error de la operación de provisión. Comportamiento: **rollback total** (no queda tenant a medio-crear) + Reintentar. Regla(s): EPIC-1.1.
SI LA DETECCIÓN FALLA → tenant huérfano detectado por job de consistencia + purga + alerta.

**EC-8** | dim: DATA-OUT | [I] — Caso: un **consumidor aguas-abajo del handoff no acusa recibo** (EPIC-5.2). Detección: timeout sin ack. Comportamiento: **reintento**; si persiste, tenant queda ACTIVO con flag "handoff incompleto" + alerta. Regla(s): EPIC-5.2.
SI LA DETECCIÓN FALLA → reconciliación periódica de punteros entre P9 y P1/P6/P7/P10.

**EC-9** | dim: PROCESSING | [I] — Caso: **falta el catálogo de intents** para inicializar Evals. Detección: ausencia al generar la matriz (EPIC-4.2). Comportamiento: usar **catálogo cerrado base de NBA** (§3) + marcar huecos `[I]` para revisión. Regla(s): EPIC-4.2.
SI LA DETECCIÓN FALLA → matriz Evals incompleta → bloqueo de activación (un eslabón faltante).

**EC-10** | dim: DATA-IN | [I] — Caso: fuente en **formato no soportado / corrupta**. Detección: validación de formato al cargar. Comportamiento: rechazar la fuente + aviso claro de qué formato se espera (no parsear basura). Regla(s): BR-3.
SI LA DETECCIÓN FALLA → la extracción produce campos sin provenance → BR-3 los fuerza a vacío.

### C. Matriz de fallo (ordenada por amenaza-North-Star descendente)

| Regla/Edge | Modo de fallo | Detección | Respuesta | amenaza |
|---|---|---|---|---|
| BR-1 / EC-1 | Fuga cross-tenant en ingesta o handoff | chequeo `tenant_id` al ingerir/emitir | bloqueo rojo + descarte + cuarentena + alerta | **alta** |
| BR-3 / EC-2 | Cerebro semilla con campos inventados | ausencia de provenance | forzar vacío + revisión humana + eval de bootstrap | **alta** |
| BR-2 | `teto_tier` alto en frío (rompe `min()`) | validación de Política base | rechazo por defecto + mantener piso + alerta | **alta** |
| BR-4 | NBA financiera autónoma habilitada al activar | guard de Política | bloqueo + degrade-to-human | **alta** |
| BR-5 / EC-3 | Inyección indirecta vía texto-en-screenshot | texto-en-imagen = dato | nunca ejecutar + redactar PII + no persistir si redacción falla | **alta** |
| BR-8 / EC-5 | Tenant activado sin firma humana | estado de checklist | bloqueo de activación + handoff no emitido | media |
| BR-6 | Regla de cohort no versionada | check de versión al activar | bloqueo de activación | media |
| BR-10 / EC-4 | North Star con baseline ruidoso (`<n_min`) | count total/cohort | estado "atribución diferida" + ocultar métricas | media |
| BR-7 | Percentil reportado con `n<n_min` | count por cohort | ocultar + aviso | media |
| EC-6 | Rubber-stamp en la firma de activación | tiempo+heurística | registrar patrón → P11 + muestreo auditoría | media |
| EC-7 | Namespace a medio-crear (provisión falla) | error de provisión | rollback total + reintentar | baja |
| EC-8 | Handoff sin ack aguas-abajo | timeout | reintento + flag "handoff incompleto" + reconciliación | baja |
| EC-9 | Catálogo de intents ausente | check al generar Evals | fallback a catálogo base NBA + marcar `[I]` | baja |
| EC-10 | Fuente corrupta/no soportada | validación de formato | rechazar + aviso de formato esperado | baja |

---

## OUTPUT 3 — WORKFLOW

**SÍNTESIS:** el flujo enciende un tenant en frío en cinco sub-procesos **fail-closed encadenados** — nada avanza al siguiente eslabón sin grounding anclado y, al final, sin firma humana; el "y qué" es que el motor sale del bootstrap **en piso de autonomía con `t0` fijado**, listo para que la evidencia (no el optimismo) lo destrabe. [V deriva de §2/§3/§4 P9]
Formato: `[TIPO]=nodo | -> =flujo | // =nota`.

### Contrato
- **Entrada:** solicitud de alta de un tenant nuevo (identidad del tenant) + fuentes de datos del propio tenant (export CRM/clientes/histórico) + identidad del humano que gobierna.
- **Salida:** tenant **ACTIVO** con Cerebro sembrado (con provenance), regla de cohort v1 versionada, baseline + snapshot `t0`, Política base firmada (`teto_tier`=piso), matriz Evals cohort×intent vacía (`liberado_evals`=0), y handoff emitido a P1/P2/P6/P7/P10.
- **Actores:** **IA** (propone setup, extrae, ancla, infiere, calcula baseline, genera matriz) · **HUMANO** (valida configuración base, firma Política, firma activación) · **Admin de plataforma** (crea tenant/namespace).
- **Frontera IA/HUMANO:** la IA **propone** todo; el humano **valida la configuración base y firma la activación**. Nada pasa a ACTIVO sin firma humana (§4 P9). Todo lo que toca dinero = humano (BR-4).

### ANTES (triggers + precondiciones)
[TRIGGER] Alta de tenant nuevo (admin lanza el wizard) // entrada del ciclo de vida del tenant [I]
[GROUNDING] No hay Cerebro aún → el grounding **se construye en este flujo**; cualquier fuente debe ser del **mismo tenant** [V BR-1]
[PRECONDICIÓN] Identidad del humano que gobierna disponible (para firma) [I]
[FAIL-CLOSED] Sin identidad de firma → no se puede activar (EPIC-5 bloquea) [I]

### DURANTE

**[Sub-proceso 1A — Provisión y aislamiento del tenant] [INICIO]**
  [PASO 1A.1] Crear tenant + namespace aislado
    [ACTOR:HUMANO(admin)] solicita alta · [DATA-IN] identidad del tenant · de admin · acceso admin [I] · [CÓMPUTO] generar `tenant_id` + namespace exclusivo · [DATA-OUT] registro de tenant → audit-trail
    [DECISIÓN] ¿identificador ya existe? -> [SÍ] [FAIL-CLOSED] bloqueo+aviso -> [FIN 1A] -> [NO] continuar
    [DECISIÓN] ¿creación de namespace OK? -> [NO] [FAIL-CLOSED] rollback total + reintentar (EC-7) -> [SÍ] continuar
    [REGLA] BR-1 // Riesgo: tenant huérfano
  [PASO 1A.2] Fijar tier provisional
    [ACTOR:IA] inicializa Política base provisional · [CÓMPUTO] `teto_tier`=piso ; `liberado_evals`=0 · [DATA-OUT] Política base (borrador) → namespace tenant
    [AUTONOMÍA] min(pedido_NBA, 0, piso) = 0 · [REGLA] BR-2 // la IA no actúa de más en el arranque
  [FIN 1A]

**[Sub-proceso 1B — Siembra del Cerebro] [INICIO]**
  [PASO 1B.1] Ingesta de fuentes
    [ACTOR:HUMANO] carga fuentes · [DATA-IN] export CRM/clientes/histórico · del tenant · acceso operador [I] · [CÓMPUTO] validar formato + validar `tenant_id`
    [DECISIÓN] ¿fuente de otro tenant? -> [SÍ] [FAIL-CLOSED] bloqueo rojo cross-tenant + descartar (EC-1) -> [NO] continuar [REGLA] BR-1
    [DECISIÓN] ¿formato soportado? -> [NO] rechazar+aviso (EC-10) -> [SÍ] continuar
  [PASO 1B.2] Extracción + redacción + construcción de ficha
    [ACTOR:IA] extrae (VLM+OCR si hay imágenes), redacta PII, ancla a ficha · [CÓMPUTO] mapear campos + asignar provenance `[V]`/`[I]`/vacío · [DATA-OUT] fichas → **Cerebro (namespace tenant)**
    [DECISIÓN] ¿texto-en-imagen como instrucción? -> tratar como DATO siempre (EC-3) [REGLA] BR-5
    [DECISIÓN] ¿campo sin fuente anclable? -> [SÍ] dejar **vacío** (no inventar) (EC-2) [REGLA] BR-3 -> [NO] persistir con provenance
  [FIN 1B]

**[Sub-proceso 1C — Cohorts v1 + baseline t0] [INICIO]**
  [PASO 1C.1] Proponer regla de cohort v1
    [ACTOR:IA] propone segmentación · [DATA-IN] fichas Cerebro · del tenant [I] · [CÓMPUTO] agrupar + contar `n` por cohort · [DATA-OUT] regla v1 (borrador)
    [DECISIÓN] ¿cohort con `n<n_min`? -> [SÍ] marcar "percentil no significativo" (EC-4) [REGLA] BR-7 -> [NO] elegible
  [PASO 1C.2] Validar regla + fijar t0
    [ACTOR:HUMANO] valida regla v1 · [CÓMPUTO] versionar v1 (inmutable) + calcular percentil+gap+baseline + snapshot `t0` · [DATA-OUT] regla v1 + baseline + `t0` → Cohorts/Cerebro
    [DECISIÓN] ¿`<n_min` clientes totales? -> [SÍ] North Star = "atribución diferida" (EC-4) [REGLA] BR-10 -> [NO] baseline normal
    [REGLA] BR-6 // regla versionada o no se activa
  [FIN 1C]

**[Sub-proceso 1D — Trinca de gobernanza + Evals vacíos] [INICIO]**
  [PASO 1D.1] Validar y firmar la trinca
    [ACTOR:IA] propone Política base + `context.md` + Knowledge · [ACTOR:HUMANO] revisa y **firma** · [CÓMPUTO] fijar `teto_tier`=piso, activar hard-no cross-tenant (BR-1), activar "financiero nunca autónomo" (BR-4) · [DATA-OUT] trinca firmada → Política (namespace tenant)
    [DECISIÓN] ¿humano firmó? -> [NO] [FAIL-CLOSED] queda borrador, tenant no-operable (EC-5) [REGLA] BR-8 -> [SÍ] continuar
  [PASO 1D.2] Generar matriz Evals vacía
    [ACTOR:IA] genera celdas cohort×intent · [DATA-IN] cohorts v1 + catálogo de intents (o base NBA si falta, EC-9) · [CÓMPUTO] todas las celdas en ROJO, `liberado_evals`=0 · [DATA-OUT] matriz Evals → P6
    [AUTONOMÍA] min(pedido_NBA, 0, piso)=0 // sigue en piso, sin evidencia aún
  [FIN 1D]

**[Sub-proceso 1E — Gate de activación + handoff] [INICIO]**
  [PASO 1E.1] Checklist de readiness
    [ACTOR:IA] evalúa: Cerebro✓ · Cohorts v1✓ · Política firmada✓ · Evals inicializados✓ · [CÓMPUTO] readiness booleano
    [DECISIÓN] ¿todos los cimientos OK? -> [NO] [FAIL-CLOSED] botón Activar deshabilitado + mostrar faltante (EC-5/EC-9) [REGLA] BR-8 -> [SÍ] habilitar firma
  [PASO 1E.2] Firma de activación
    [ACTOR:HUMANO] firma activación · [CÓMPUTO] set tenant=ACTIVO + registrar firma (identidad+timestamp) en audit-trail
    [DECISIÓN] ¿firma en < N s (rubber-stamp)? -> [SÍ] registrar patrón → P11 (EC-6) -> [NO] ok · [REGLA] anti-rubber-stamp
  [PASO 1E.3] Handoff al motor
    [ACTOR:IA] publica punteros + `t0` · [DATA-OUT] eventos → **P1(Cohorts) · P2(NBA) · P6(Evals) · P7(Cerebro) · P10(Política)**
    [DECISIÓN] ¿consumidor sin ack? -> [SÍ] reintento; si persiste flag "handoff incompleto" + alerta (EC-8) -> [NO] handoff completo
  [FIN 1E]

### Flujo (ASCII)
```
[alta tenant] -> [1A.1 crear+namespace] -⟨existe?⟩-(sí)-> [FAIL bloqueo]
                                          -(no)-> ⟨namespace OK?⟩-(no)-> [rollback]
                                                                  -(sí)-> [1A.2 tier=piso]
   -> [1B.1 ingesta] -⟨otro tenant?⟩-(sí)-> [FAIL cross-tenant]
                      -(no)-> [1B.2 extrae+redacta+ancla] -⟨campo sin fuente?⟩-(sí)-> [vacío]
                                                                               -(no)-> [Cerebro]
   -> [1C.1 regla v1] -⟨n<n_min?⟩-(sí)-> [oculto] -> [1C.2 validar+versionar+t0]
   -> [1D.1 firmar trinca] -⟨firmada?⟩-(no)-> [no-operable]
                            -(sí)-> [1D.2 Evals ROJO/liberado=0]
   -> [1E.1 checklist] -⟨todo OK?⟩-(no)-> [Activar deshabilitado]
                        -(sí)-> [1E.2 firma humana] -> [1E.3 handoff] -> [TENANT ACTIVO]
```

### DESPUÉS
[DATA-OUT] escribe en **Cerebro (fichas+provenance)**, **Cohorts (regla v1 + baseline + `t0`)**, **Política (trinca firmada, `teto_tier`=piso)**, **Evals (matriz vacía, `liberado_evals`=0)**, **audit-trail (creación + firmas)**.
-> Alimenta a: **P7 Cerebro** (raíz de grounding) · **P1 Cohorts** (percentiles/gap) · **P2 NBA** (catálogo enchufado, pero `min()`=0) · **P6 Evals** (matriz a calibrar) · **P10 Política** (techo `teto_tier`) · **P11 Salud 1:10** (señales anti-rubber-stamp + `t0` para unit economics) · **North Star** (`t0` fijado, métrica diferida si `<n_min`).

### MAPA DE SISTEMAS Y FLUJO DE DATOS
[SISTEMA 1] **Provisión / Tenancy** · [FUNCIÓN] crear tenant + namespace aislado + tier provisional · [DATOS] `tenant_id`, namespace, tier · [ACCESO] admin · [GROUNDING] no
    // Problema: namespace a medio-crear → tenant huérfano -> Alimenta a: [SISTEMA 2,5]
[SISTEMA 2] **Ingesta / Extracción multimodal** · [FUNCIÓN] cargar fuentes, validar tenant, VLM+OCR, redactar PII, anclar · [DATOS] fuentes crudas, campos extraídos, provenance · [ACCESO] operador onboarding · [GROUNDING] sí (construye el grounding)
    // Problema: cross-tenant o inyección vía texto-en-imagen -> Alimenta a: [SISTEMA 3]
[SISTEMA 3] **Cerebro (raíz)** · [FUNCIÓN] ficha viva por cliente, fuente única de verdad · [DATOS] fichas, campos, provenance · [ACCESO] IA (mantiene), humano (audita) · [GROUNDING] sí (es el grounding)
    // Problema: campos sin fuente → tentación de inventar (BR-3) -> Alimenta a: [SISTEMA 4]
[SISTEMA 4] **Cohorts + Baseline** · [FUNCIÓN] regla v1 versionada, percentil/gap/baseline, snapshot `t0` · [DATOS] regla v1, baseline, percentiles, `t0` · [ACCESO] IA (calcula), humano (valida) · [GROUNDING] sí (lee Cerebro)
    // Problema: `n<n_min` → percentil engaña (BR-7) / baseline diferido (BR-10) -> Alimenta a: [SISTEMA 5,6]
[SISTEMA 5] **Trinca de gobernanza (Política+context.md+Knowledge) + Evals** · [FUNCIÓN] fijar `teto_tier`=piso, hard-nos, matriz Evals vacía · [DATOS] Política, `teto_tier`, matriz cohort×intent, `liberado_evals` · [ACCESO] humano (firma), IA (propone) · [GROUNDING] sí
    // Problema: tier alto en frío rompe el `min()` (BR-2) / Política sin firmar (BR-8) -> Alimenta a: [SISTEMA 6]
[SISTEMA 6] **Activación + Handoff** · [FUNCIÓN] checklist readiness, firma humana, set ACTIVO, publicar punteros · [DATOS] estado tenant, firma, punteros, eventos · [ACCESO] humano (firma), IA (publica) · [GROUNDING] sí
    // Problema: rubber-stamp (EC-6) / handoff sin ack (EC-8) -> Alimenta a: [P1,P2,P6,P7,P10,P11, North Star]

### PUNTOS DE DOLOR / RIESGOS (rankeados por impacto)
[RIESGO 1] **Fuga cross-tenant en ingesta o handoff** // Impacto: violación GDPR/contrato, el peor fallo del sistema // Mitigación: BR-1 hard-no, validación `tenant_id` al ingerir y al emitir, cuarentena+forense si la detección falla [V §8.3/§10.4]
[RIESGO 2] **Cerebro semilla fabricado** (IA inventa campos sin fuente) // Impacto: contamina TODO el motor aguas-abajo // Mitigación: BR-3 (vacío o provenance), eval de bootstrap que purga campos sin provenance [V §2/§4 P4]
[RIESGO 3] **Autonomía abierta en frío** (`teto_tier` alto antes de Evals) // Impacto: rompe el `min()`, la IA actúa sin evidencia // Mitigación: BR-2 piso por defecto, `liberado_evals`=0, subir solo con evidencia+firma [V §2]
[RIESGO 4] **Inyección indirecta vía texto-en-screenshot durante la ingesta** // Impacto: manipulación del setup // Mitigación: BR-5 texto=dato nunca instrucción, PII redactada, no persistir si redacción falla [V §5/§10.2]
[RIESGO 5] **Rubber-stamp en la activación** // Impacto: arranque no gobernado de verdad // Mitigación: registrar patrón → calibración anti-rubber-stamp P11, muestreo de auditoría [I §10.6/§11]
[RIESGO 6] **`t0` ruidoso / `n<n_min`** // Impacto: North Star arranca como teatro // Mitigación: BR-10 "atribución diferida", BR-7 ocultar percentil [I §3/§11.4]
SÍNTESIS DE RIESGO: el dominante es la **fuga cross-tenant** porque es el único fallo aquí que es **irreversible y legalmente catastrófico** — un Cerebro contaminado o una autonomía abierta se corrigen; un dato de Sony filtrado a Warner, no. Por eso el aislamiento es lo primero (Sub-proceso 1A) y se vuelve a chequear en cada ingesta y en el handoff. [V deriva de §10.4]

### MODELO DE VARIABLES (entidades + campos + relaciones)
**TENANT:**
  - `tenant_id` : uuid · PK [I]
  - `nombre` : string [I]
  - `estado` : enum{BORRADOR, EN_BOOTSTRAP, ACTIVO, BLOQUEADO} [I]
  - `namespace` : string · aislamiento físico/lógico [V deriva BR-1]
  - `t0` : timestamp · snapshot baseline North Star [I]
  - `creado_por` : ref USUARIO (admin) · FK [I]
  - `activado_por` : ref USUARIO (humano firma) · FK · null hasta ACTIVO [I]

**FUENTE_INGESTA:**
  - `fuente_id` : uuid · PK [I]
  - `tenant_id` : uuid · FK→TENANT [V BR-1]
  - `tipo` : enum{CRM_EXPORT, LISTA_CLIENTES, HISTORICO, SCREENSHOT, OTRO} [I]
  - `estado` : enum{INGERIDA, RECHAZADA_FORMATO, BLOQUEADA_CROSS_TENANT, PII_REDACTADA} [I]
  - `origen_verificado` : bool · pasó chequeo `tenant_id` [V BR-1]

**FICHA_CEREBRO:** (cliente)
  - `ficha_id` : uuid · PK [I]
  - `tenant_id` : uuid · FK→TENANT [V BR-1]
  - `cliente_ref` : string [I]
  - `campos` : json (cada campo con `valor` + `provenance` ∈ {V,I,vacío} + `fuente_id` FK) [V BR-3/BR-9]

**REGLA_COHORT:**
  - `cohort_id` : uuid · PK [I]
  - `tenant_id` : uuid · FK→TENANT [V BR-1]
  - `version` : int · v1 inmutable [V BR-6]
  - `definicion` : json [I]
  - `n` : int · tamaño del cohort [I]
  - `baseline` : json · percentil/gap base [I]
  - `significativo` : bool · `n ≥ n_min` [I BR-7]
  - `creado_por` : ref USUARIO (IA-propuesto) · `validado_por` : ref USUARIO (humano) · FK [V §2]

**POLITICA_TRINCA:**
  - `politica_id` : uuid · PK [I]
  - `tenant_id` : uuid · FK→TENANT [V BR-1]
  - `teto_tier` : enum/int · piso por defecto [V BR-2]
  - `context_md` : text · `knowledge` : ref [I]
  - `hard_no_cross_tenant` : bool=true [V BR-1]
  - `financiero_autonomo` : bool=false [V BR-4]
  - `firmada_por` : ref USUARIO · FK · null hasta firma [V BR-8]

**CELDA_EVAL:**
  - `celda_id` : uuid · PK [I]
  - `tenant_id` : uuid · FK→TENANT [V BR-1]
  - `cohort_id` : uuid · FK→REGLA_COHORT [I]
  - `intent` : string (del catálogo cerrado) [V §3]
  - `estado` : enum{ROJO, VERDE} · ROJO inicial [V §6]
  - `liberado_evals` : int=0 [V §2]

**HANDOFF_EVENT:**
  - `event_id` : uuid · PK [I]
  - `tenant_id` : uuid · FK→TENANT [V BR-1]
  - `destino` : enum{P1,P2,P6,P7,P10,P11} [I]
  - `ack` : bool · acuse de recibo [I EC-8]

**AUDIT_ENTRY:**
  - `audit_id` : uuid · PK [I]
  - `tenant_id` : uuid · FK→TENANT [V BR-1]
  - `accion` : enum{CREAR_TENANT, FIRMAR_POLITICA, FIRMAR_ACTIVACION, BLOQUEO_CROSS_TENANT, ...} [I]
  - `actor` : ref USUARIO · FK · `timestamp` : ts · `rubber_stamp_flag` : bool [I EC-6]

**Relaciones:**
- TENANT 1—N FUENTE_INGESTA · TENANT 1—N FICHA_CEREBRO · TENANT 1—N REGLA_COHORT
- TENANT 1—1 POLITICA_TRINCA · TENANT 1—N CELDA_EVAL · TENANT 1—N HANDOFF_EVENT · TENANT 1—N AUDIT_ENTRY
- REGLA_COHORT 1—N CELDA_EVAL · REGLA_COHORT 1—N FICHA_CEREBRO (vía pertenencia) · FUENTE_INGESTA 1—N (campos de) FICHA_CEREBRO
- **Invariante de FK:** toda entidad lleva `tenant_id` y ninguna FK puede cruzar `tenant_id` distinto (BR-1, enforced a nivel de datos).

### Gobernanza / anchor-check
[AUTONOMÍA] `nivel_efectivo = min(pedido_NBA, liberado_evals=0, teto_tier=piso) = 0` durante TODO el bootstrap; sale en piso. [V §2]
Hard-nos: **cross-tenant Sony≠Warner** (BR-1) · **financiero nunca autónomo** (BR-4) · texto-en-screenshot=DATO (BR-5) · grounding fail-closed: sin fuente → vacío/humano (BR-3) · no ACTIVO sin firma humana (BR-8). [V §2/§5/§8/§10]
Versionado: regla de cohort v1 inmutable (BR-6). n_min: **20** [C placeholder, §11.4 abierto].
Variables de escenario: X/Y/Z/N son `[C]` (instrumentadas, nunca dato real); el bootstrap **fija `t0`** desde el que X/Y/Z/N se medirán en P3/P11. [C §5]
Provenance visible en toda la UI del wizard (BR-9). [V §8.8]

---

## Open Questions `[I]` (PT-BR — pendientes de respuesta del operador)

> Cada una es la pergunta que o grill faria ao operador; abaixo, a asunção `[I]` adotada neste draft.

1. **[Dim 3 · DATA-IN]** Quais são exatamente as **fontes de entrada** para semear o Cerebro de um tenant novo (export de CRM? lista de clientes? histórico de tickets? quais formatos)? — *Asunción [I]: export CRM + lista de clientes + histórico, formatos tabulares + screenshots; ver F-2.1.*
2. **[Dim 8 · BR-7]** Qual é o **`n_min`** de clientes/cohort para o percentil ser significativo neste tenant? — *Asunción [I/C]: 20 (herdado do few-shot P1); §11.4 está aberto.*
3. **[Dim 5 · ROUTERS]** O bootstrap deve **permitir ativar um tenant com `< n_min` clientes** (operação só 1:1) ou bloquear até ter massa crítica? — *Asunción [I]: permitir ativar com North Star em "atribução diferida" (EC-4).*
4. **[Dim 2 · TRIGGERS]** Quem dispara o onboarding — **admin de plataforma, self-service do tenant, ou sales/CS**? E é manual ou via evento de contrato assinado? — *Asunción [I]: admin de plataforma, manual.*
5. **[Dim 1 · SCOPE]** **Quem é o "humano que governa"** que assina a Política base e a ativação — o operador onboarding, um admin, ou um compliance officer? São a mesma pessoa? — *Asunción [I]: operador onboarding assina config base; admin cria tenant; podem ser distintos.*
6. **[Dim 4 · PROCESSING]** A IA deve **inferir campos do Cerebro** (provenance [I]) ou só importar o que está ancorado (provenance [V]), deixando o resto vazio? Qual o apetite de inferência no arranque? — *Asunción [I]: inferir com base + etiquetar [I]; nunca inventar (BR-3).*
7. **[Dim 10 · METRICS]** O **`t0` do North Star** se fixa no momento da ativação ou após uma janela de estabilização (ex.: 1ª semana de dados)? — *Asunción [I]: no momento da ativação (EPIC-3.2).*
8. **[Dim 6 · DATA-OUT]** **Quais consumidores aguas-abajo precisam de ACK explícito** no handoff e com qual SLA (liga-se a §11.7 "quem consome o spec e com qual SLA")? — *Asunción [I]: P1/P6/P7/P10 precisam ack; SLA não definido.*
9. **[Dim 11 · GOV-OPS]** Qual o **limiar de tempo (N segundos)** abaixo do qual uma assinatura de ativação conta como suspeita de rubber-stamp? — *Asunción [I]: placeholder, calibrado por P11 (EC-6).*
10. **[Dim 4 · PROCESSING]** O **catálogo de intents** para a matriz Evals vem de onde no arranque — é o catálogo fechado de NBA global, ou específico por tenant? — *Asunción [I]: catálogo fechado base de NBA; lacunas marcadas [I] (EC-9).*
11. **[Dim 3 · DATA-IN]** No **toggle Musixmatch**, a superfície multimodal de ingestão muda (ex.: Music Lens em vez de screenshots de app)? Como o bootstrap absorve isso sem quebrar os hard-nos? — *Asunción [I]: toggle muda vocabulário/fontes, nunca os hard-nos nem o `min()`; §11.9 aberto.*
12. **[Dim 11 · NON-FUNC]** Qual o **SLA/latência aceitável** do bootstrap completo (minutos? horas?) e o **custo/decisão** de inicializar um tenant (liga a P11 unit economics)? — *Asunción [I/C]: placeholder; valor está no mecanismo.*
