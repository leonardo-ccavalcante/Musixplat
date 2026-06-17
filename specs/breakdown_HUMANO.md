# Breakdown BUILD-vs-PROCESS — Vista HUMANA (síntesis primero)

## SÍNTESIS — el pensamiento gobernante

**Casi todo lo que hay que construir es código determinista; la inteligencia (el LLM) vive en muy pocos puntos, y esos puntos nunca tocan dinero ni cruzan tenants por su cuenta.** De 302 piezas en el registro congelado, 236 son CÓDIGO (lógica determinista o pantallas), 42 son AGENTE (juicio del LLM), 10 son contenedores N8N (orquestación fuera-de-sesión) y 14 quedan PENDIENTE (necesitan prototipo). **Y qué:** el riesgo de la plataforma no está en "la IA hace cosas raras" — el LLM es el 14% del trabajo y siempre encerrado entre compuertas de código; el riesgo real es construir bien las 236 piezas de cañería determinista (RLS por tenant, k-anon por cohort, motor min() de autonomía, anti-join de afectados-silenciosos) porque ahí viven todos los hard-nos.

Tres ideas que ordenan todo lo demás:

1. **El LLM propone, el código dispone.** Donde hay juicio (clasificar un problema, redactar un email, rankear hipótesis), un AGENTE produce el borrador y una pieza CÓDIGO lo verifica/sella. **Y qué:** ninguna decisión con efecto (liberar autonomía, mover saldo, publicar política) depende de que el modelo "acierte" — siempre hay una compuerta determinista después.

2. **El contenedor N8N orquesta, pero no razona.** Los 10 contenedores fuera-de-sesión (monitor proactivo, re-segmentación semanal, propagación post-firma, batch-review) agendan y secuencian pasos, pero el paso que razona es una pieza AGENTE *separada* enganchada por trigger, no embebida. **Y qué:** se puede construir y testear cada cerebro-LLM por separado de su cañería, y la cañería sin LLM es 100% determinista.

3. **La demo se sostiene sobre una sola cadena que cruza pantallas.** Cohorts entrega una mejor-acción → NBA la convierte en propuesta con techo de autonomía → Atendimiento la traduce a coach para el restaurante → Diagnóstico caza a los afectados-silenciosos → Generación-de-conocimiento empaqueta el aprendizaje. **Y qué:** si esa columna vertebral no enciende de punta a punta, no hay demo; el resto de las 302 piezas son músculo alrededor de ese esqueleto.

---

## MAPA POR ÁREA — conteo por balde

| Área (pantalla) | CÓDIGO | AGENTE | N8N | PENDIENTE | Total | El "y qué" de cada área |
|---|---|---|---|---|---|---|
| **01 · Cohorts Explorer** (explorar y priorizar restaurantes por cohort) | 29 | 2 | 1 | 0 | 32 | Casi pura matemática de percentiles y deltas; el único juicio es escribir el PERFIL del cohort y explicar por qué un restaurante se movió. |
| **02 · NBA Playbooks** (mejor-acción + motor de autonomía) | 68 | 2 | 2 | 2 | 74 | El corazón de las reglas duras: 2 piezas de LLM (proponer la acción, rutear la palanca) flotan sobre 68 guardas deterministas de autonomía/dinero/4-ojos. |
| **03 · KPIs / Goals** (árbol de métricas + workbench) | 26 | 3 | 1 | 4 | 34 | Medir es siempre código (Named_Query); el LLM solo razona el punto-de-impacto, juzga aciertos y rankea hipótesis. 4 epics esperan prototipo. |
| **05A · Atendimiento** (responder al restaurante con contexto integrado) | 35 | 20 | 0 | 3 | 58 | La pantalla más conversacional: el LLM lee imágenes, clasifica intención, redacta coach y empaqueta escalaciones; el código sella, versiona y aplica min(). |
| **05B · Diagnóstico** (encontrar la causa raíz y a los silenciosos) | 19 | 7 | 2 | 4 | 32 | El LLM clasifica tipo, rankea el árbol de causas y decide cazar silenciosos; el anti-join y el puntuador de impacto son código. |
| **05C · Generación de conocimiento** (convertir el diagnóstico en artefactos) | 32 | 8 | 4 | 0 | 44 | 8 generadores-LLM (email, spec, política, T&C, finanzas) y 1 juez-LLM, todos gateados por evals, metric-binding y 4-ojos deterministas. |
| **05DE · Dashboard de salud** (vitrina read-only del sistema) | 27 | 0 | 0 | 1 | 28 | Cero LLM por diseño: es una vitrina que solo lee y pinta; jamás computa ni persiste un número. |
| **TOTAL** | **236** | **42** | **10** | **14** | **302** | El 78% es construcción determinista; la IA es el 14%, siempre encajonada. |

---

## EL CAMINO-CRÍTICO DE LA DEMO (cascada-al-revés)

Se lee de abajo hacia arriba: **lo último que el espectador ve** (el aprendizaje convertido en artefacto) **descansa sobre** lo anterior. Cada eslabón está marcado con su balde. Las flechas son los triggers resueltos del registro.

```
[5] FINAL VISIBLE — Generación de conocimiento empaqueta el aprendizaje
    05C·EPIC-C1 "orquestador que ingiere el dossier" (N8N)
      → 05C·US-C1-1 "router que clasifica qué artefactos generar" (AGENTE)
      → 05C·EPIC-C3a "generador del email-wedge" (AGENTE) → 05C·EPIC-C4 "juez de evals del artefacto" (AGENTE)
    Y qué: aquí el espectador ve "el sistema aprendió y produjo algo reutilizable".
        ▲ alimentado por v_dossier_handoff (la vista de entrega con QUIÉN/QUÉ/POR QUÉ)
        │
[4] Diagnóstico encuentra causa raíz + a los afectados que NO se quejaron
    05B·EPIC-B1 "contenedor del monitor proactivo" (N8N)
      → 05B·US-B2.1.1 "clasificar tipo/área del problema" (AGENTE)
      → 05B·US-B3.1.1 "razonar que hay que cruzar la población = cazar silenciosos" (AGENTE)
           dentro lleva 05B·B.5.2b "anti-join Orden-fallida MENOS reclamantes" (CÓDIGO)
      → 05B·US-B4.1.1 "aterrizar la hipótesis de raíz contra casos similares" (AGENTE)
    Y qué: el momento "vimos a los que sufrieron en silencio" — el wow de la demo.
        ▲ disparado por un episodio de Atendimiento que dejó señal
        │
[3] Atendimiento responde al restaurante con todo el contexto
    05A·A.1.4/A.1.5 "leer imagen + detectar inyección" (AGENTE)
      → 05A·A.3.1 "clasificar si hay info suficiente" (AGENTE)
      → 05A·A.3.3/A.3.4 "traducir el porqué a coach + personalizar" (AGENTE)
      → 05A·A.4.6 "motor min() del nivel efectivo" (CÓDIGO) → 05A·A.5.x "ejecutar BAJO autónomo" (CÓDIGO)
    Y qué: el restaurante recibe una respuesta útil y honesta; nada con efecto se auto-ejecuta sin pasar el min().
        ▲ consume la mejor-acción + su porqué desde NBA
        │
[2] NBA convierte la prioridad en una propuesta con techo de autonomía
    02·1A "la IA propone la NBA por cohort" (AGENTE)
      → 02·1B "computar nivel_efectivo = least(pedido, evals, tier)" (CÓDIGO)
      → 02·1C/1D "agent-manager libera/pausa el lote con firma" (CÓDIGO + gate humano)
      → 02·1E "propagación batch post-firma" (N8N)
    Y qué: aquí se ve la regla de oro — la autonomía es el mínimo de tres límites, jamás la sube ninguna señal sola.
        ▲ disparado por el handoff de Cohorts (Evento_Priorizado_NBA)
        │
[1] PRIMER ESLABÓN — Cohorts prioriza qué restaurante atacar
    01·F-1.2 "job de ranking: percentil/gap/baselines" (CÓDIGO)
      → 01·F-1.5 "PERFIL del cohort: quién es este grupo" (AGENTE)
      → 01·F-5.2 "handoff: emite Evento_Priorizado_NBA con un click" (CÓDIGO)
    Y qué: sin esta priorización determinista, el resto de la cadena no tiene a quién atender.
```

**Edges de oro que deben reproducirse (verificados como `resolved` en el grafo):** Cohorts→NBA por `Evento_Priorizado_NBA` (`01:F-5.2 → 02:1A`); Diagnóstico→Conocimiento por la vista de entrega de 11 campos `v_dossier_handoff` (`05B:US-B3.1.1 → 05C:EPIC-C1`); medición de KPI→análisis de acción (`03:US-4.3.1 → 03:US-3.1.1-analisis`); y el contenedor de diagnóstico que enciende su clasificador y su caza-silenciosos (`05B:EPIC-B1 → US-B2.1.1 → US-B3.1.1`). **Y qué:** estos cuatro son los puntos donde una pantalla le pasa la posta a otra — si una falla, la demo se parte en silos.

---

## TIPO-DE-LEVERAGE por pieza

Cada pieza apalanca de una de cuatro formas. Esto dice *dónde está el valor* de construirla.

### Leverage de JUICIO (el LLM hace algo que el código no puede) — 42 piezas AGENTE
**Y qué:** son los pocos lugares donde se compra inteligencia real; si se quitan, el sistema se vuelve un CRUD.

- **Leer y entender lo no-estructurado:** `05A:A.1.4` "extraer texto de una imagen/print" (VLM), `05A:A.1.5` "detectar intento de inyección/jailbreak". *Y qué:* permite que un restaurante mande un screenshot y el sistema lo entienda sin formulario.
- **Clasificar / rutear:** `05B:US-B2.1.1` "clasificar tipo finanzas/producto/performance", `05B:B.2.2b` "re-aterrizar la clasificación contra la base de conocimiento", `02:BR-13` "rutear la palanca estratégica a Strategy/Soporte", `05C:US-C1-1` "decidir qué artefactos generar del dossier". *Y qué:* mete cada problema en el carril correcto sin reglas frágiles escritas a mano.
- **Razonar causa raíz / cazar silenciosos:** `05B:US-B3.1.1` "decidir cruzar la población", `05B:US-B3.2.1` "encontrar la concentración del patrón", `05B:US-B4.1.1` "aterrizar la hipótesis de raíz", `05B:US-B4.2.1` "juzgar si un tipo recurrente merece ser proceso-crítico", `03:US-6.1.1-hipotesis` "generar y rankear hipótesis como pensamientos-gobernantes". *Y qué:* es el cerebro diagnóstico — el que ve a quien sufrió sin quejarse.
- **Generar respuesta / contenido:** los coach de Atendimiento (`05A:A.3.3` la raíz, `05A:A.3.4` la personalización, `05A:A.3.5` el tono, `05A:A.3.1b` la una-pregunta), y los generadores de Conocimiento (`05C:EPIC-C3a` email, `05C:EPIC-C3b` spec REFORGE, `05C:EPIC-C3c` impacto financiero, `05C:EPIC-C3e` borrador de política, `05C:EPIC-C3f` redline de T&C). *Y qué:* convierte datos en algo que un humano lee y usa.
- **Juzgar / empaquetar para humano:** `05C:EPIC-C4` "juez de evals del artefacto", `03:US-3.2.1` "juzgar si la recomendación fue acertada", `05A:A.7.1` "empaquetar la escalación", `05A:A.7.4` "rutear la corrección RLHF", `05A:A.7.5` "redactar el comunicado de anomalía", `05A:A.7.6` "detectar estado de crisis/abuso". *Y qué:* el LLM prepara el paquete; el humano decide; el aprendizaje vuelve al sistema.

### Leverage de AUTOMATIZACIÓN-EN-EL-TIEMPO (corre solo, fuera de sesión) — 10 contenedores N8N
**Y qué:** trabajo que pasa sin que nadie esté mirando — vigilancia y propagación continuas.

- `05B:EPIC-B1` "monitor proactivo de procesos-críticos" + `05B:B.1.2` "heartbeat del proceso crítico" — *vigilan que un proceso no falle en silencio*.
- `01:F-2.5` "re-segmentación batch semanal de cohorts" — *mantiene los cohorts vivos sin intervención*.
- `02:1E` "propagación batch tras la firma de una liberación" + `02:US-1.1.1-d` "realimentar el histórico cuando hay señal de resultado" — *el efecto de una decisión se esparce y mejora estimaciones futuras*.
- `03:US-4.3.1` "job de medición de KPIs" — *los números del tablero se refrescan solos*.
- `05C:EPIC-C1` "orquestador de generación de artefactos", `05C:EPIC-C6` "loop de mejora de templates", `05C:BR-C1-8` y `05C:US-C7-3` "batch-review periódico de los auto-pasados" — *el conocimiento se genera, mejora y se audita en cadencia*.

### Leverage de GUARDA-DURA (un hard-no convertido en predicado determinista) — subconjunto crítico de CÓDIGO
**Y qué:** estas piezas no "hacen" nada visible; impiden el desastre. Son las más baratas de construir y las más caras de omitir.

- **Anti cross-tenant (RLS):** `02:BR-3`, `02:BR-CRED-4`, `05B:EC-B5`, `05B:US-B3.3.1`, `05DE:BR-DE6` "abortar cualquier agregación que cruce tenant_id". *Y qué:* un tenant jamás ve datos de otro.
- **k-anonimato (zona cohort):** `01:F-1.3b`, `02:BR-12`, `05C:US-C2-2`, `05DE:EC-DE5` "suprimir la celda si n_cuentas < k". *Y qué:* no se puede des-anonimizar un grupo pequeño.
- **PII redactada extremo-a-extremo:** `05A:A.1.2` y `05A:A.6.2` "redactar PII en la entrada y en la transcripción", `05B:EC-B6` "scanner de PII en cada borde", `05C:EC-C3a-6` "bloquear PII de otro tenant en el render". *Y qué:* ningún dato personal se filtra ni cruza fronteras.
- **Financiero nunca autónomo por efecto:** `02:BR-CRED-1`, `02:BR-2`, `02:BR-M3-04`, `05C:BR-C1-7`, `05C:BR-C3c-1` "bloquear toda ruta que mueva saldo, topar a solo-propone". *Y qué:* la IA nunca mueve plata sola.
- **Override-solo-baja + motor min():** `02:BR-1`, `02:BR-4`, `02:BR-CRED-2`, `05A:A.4.6`, `05C:US-C1-3`, `05C:BR-C4-1` "nivel_efectivo = least(...), ninguna señal sube la autonomía". *Y qué:* un humano puede frenar a la IA, nunca acelerarla por encima del techo.
- **4-ojos / anti-rubber-stamp + sin-trace-no-acción:** `02:BR-11`, `02:BR-9`, `02:BR-LOG-3`, `05A:A.7.4b`, `05C:BR-C3e-2` "publicar exige 2 personas distintas; sin trace la acción no procede". *Y qué:* toda decisión queda firmada por dos y auditada.

### Leverage de SUPERFICIE / VITRINA (renderiza estados, no computa) — render y CRUD
**Y qué:** lo que el humano ve y toca; barato pero indispensable para que la inteligencia sea usable.

- Toda la pantalla de Dashboard de salud (05DE, 28 piezas) es vitrina pura: `05DE:BR-DE1` "jamás computar ni persistir un número", `05DE:S1` a `05DE:S6` "pintar el veredicto, las curvas costo-vs-inteligencia y los 3 lentes". *Y qué:* el dashboard de salud solo lee y muestra — su único dato propio es su configuración de layout (`05DE:layout_config`).
- Render de Cohorts (`01:F-2.1` el semáforo, `01:F-5.1` el drill ordenado por gap), de NBA (`02:US-1.1.1` las filas con causa+nivel), de KPIs (`03:US-1.1.1` conmutar los 3 lentes). *Y qué:* hacen tangible la matemática de las áreas anteriores.

---

## CONFLICTOS — decisiones que el dueño-del-merge debe cerrar

### Bilaterales `[I]` no confirmados (un trigger que se dispara pero cuyo receptor no quedó verificado)
**Y qué:** no son errores; son uniones donde el "quién recibe esto" todavía no se ató. Hay que confirmar el receptor antes de construir el handoff.

- **Dentro de NBA:** `02:1A` "la IA propone la NBA" dispara hacia `02:1B` "el motor min()" pero el receptor no declara su gatillo de entrada → confirmar el contrato. `02:US-1.1.1-d` "realimentar el histórico" mejora la confianza futura pero no tiene consumidor aguas abajo (es un lazo interno). `02:BR-13` "rutear la palanca" y `02:BR-XCHK-2` "alertar al dueño de política" disparan a destinos (Strategy/Soporte, el dueño-de-política) que no son piezas en este set.
- **Hacia fuera-de-alcance:** `02:1E` "propagación post-firma" alimenta a la Salud 1:10 (P11) y a las Evals (P06), ambas pantallas fuera del set; `03:US-3.2.1` "juzgar el acierto" realimenta el ranking de P06. *Y qué:* la integración con esas pantallas queda como contrato abierto.
- **Pares paso-a-paso con receptor de gatillo nulo:** en Atendimiento (`05A:A.1.5→A.1.6`, `05A:A.3.6→A.3.6-CHECK`, `05A:A.4.5→A.4.6`, `05A:A.7.1→A.7.2`, `05A:A.7.4→A.7.4b`, `05A:A.7.5→A.7.7`), en KPIs (`03:US-3.1.1-analisis→03:US-3.1.1-gate`, `03:US-6.1.1-hipotesis→03:US-6.2.1-tracking`), en Diagnóstico (`05B:B.1.2→05B:B.1.3`, y `05B:B.2.2b→B.2.3` que ni siquiera está en el set), y en Conocimiento (`05C:EPIC-C4→05C:US-C1-3`, `05C:US-C6-2→05C:EPIC-C6` que es un lazo cíclico, `05C:BR-C1-8→batch-review-humano`). *Y qué:* la lógica del flujo está clara, pero el "engancha aquí exactamente" hay que sellarlo en build.

### Colisiones del reconciliation (alta severidad, ≥1 lado en alcance)
**Y qué:** dos o más piezas pelean por el mismo recurso o responsabilidad — el dueño debe decidir quién manda.

- **COL-1 — entrada cruda como dato, no instrucción:** toca `05A:A.1.5` (detectar inyección), `05B:EPIC-B1` (contenedor de diagnóstico), `05C:EPIC-C1` (orquestador) y `05C:EPIC-C3a` (generador de email). *Y qué:* hay que garantizar la MISMA regla anti-inyección en las cuatro puertas de entrada.
- **COL-2 — gobernanza del aprendizaje:** `05A:A.7.1` (empaquetar la escalación), `05C:EPIC-C4` (juez de evals), `05C:BR-C1-8` y `05C:US-C7-3` (batch-review). *Y qué:* definir un solo dueño del loop de calidad para no auditar dos veces o ninguna.
- **COL-33 — clasificar vs generar sobre el mismo problema:** `05B:US-B2.1.1` y `05B:US-B2.2.1` (clasificar/rankear) chocan con `05C:EPIC-C3a` (generar email). *Y qué:* aclarar la frontera diagnóstico↔generación.
- **COL-9 — generador de email aislado:** `05C:EPIC-C3a`. *Y qué:* su contrato de grounding debe quedar inequívoco para no inventar contenido.
- **COL-18 — borrador de política compartido:** `05A:A.7.1`, `05C:EPIC-C3e` (redactar la política), `05C:BR-C1-8`. *Y qué:* un solo camino para que una política nazca y se audite.
- **COL-6 — caza-silenciosos vs detector-de-patrón:** `05B:US-B3.1.1` y `05B:US-B3.2.1`. *Y qué:* separar "a quién afectó" de "dónde se concentra".
- **COL-8 — RLHF y juez compartiendo correcciones:** `05A:A.7.4` (rutear corrección), `05A:A.7.4b` (anti-rubber-stamp), `05C:EPIC-C4` (juez de evals). *Y qué:* evitar que una corrección se cuente dos veces.
- **COL-11 — señal de gobernanza a S8:** `05A:A.6.7-señal-a-S8`. *Y qué:* su empaquetado de "qué pasó y por qué se marca" debe ser único.
- **COL-25 — una-pregunta vs señal-a-S8:** `05A:A.3.1b` (preguntar un dato) y `05A:A.6.7-señal-a-S8`. *Y qué:* deslindar pedir-más-info de marcar-para-gobernanza.
- **COL-7 — spec REFORGE vs impacto-finanzas co-disparados:** `05C:EPIC-C3b` y `05C:EPIC-C3c`. *Y qué:* decidir el orden cuando ambos generadores se disparan por el mismo problema.

### Colisiones fuera-de-alcance (todos los lados caen en pantallas que no están en este set)
**Y qué:** se listan para no perderlas, pero no bloquean este breakdown — se resuelven cuando entren esas pantallas (P01/P02/P03/P06/P07/P08/P09/P10/P11). Son: COL-12, COL-2→COL-3, COL-5, COL-26, COL-10, COL-13, COL-15, COL-38 y COL-20.

---

## PIEZAS PENDIENTE — decisiones abiertas (necesitan prototipo, no tienen balde decidible)

**Y qué:** son las 14 piezas donde el spec dice explícitamente "esto no cristaliza en texto, hay que prototipar con datos reales". No se fuerza un balde inventado; se dejan como apuestas a validar.

| Pieza | Qué es en palabras simples | Por qué está abierta |
|---|---|---|
| `02:EPIC-2` | Flexibilizar la definición de cohorts | Diferida; no tiene criterios Given/When/Then, necesita hipótesis. |
| `02:EPIC-3` | Mejorar las Evals de calidad | La calibración vive en otra pantalla (P06); aquí no hay flujo. |
| `03:EPIC-3` | Workbench de análisis (análisis + aprobación + handoff) | Orquestador mixto; se descompone en sub-piezas pero el shell del epic queda abierto. |
| `03:EPIC-4` | Resolver el canon de KPIs + edición 4-ojos + medición | Orquestador; se baja a las F-4.x pero el shell no decide balde. |
| `03:EPIC-5` | Salud 1:10 | Fuera de alcance: su host es P11; aquí solo se enlaza. |
| `03:EPIC-6` | Workbench de investigación (diagnóstico + hipótesis + plan) | Orquestador; se descompone, el shell queda PENDIENTE. |
| `05A:EPIC-A1` | Layout interno del contexto-montado (orden y peso de las fuentes) | El spec dice explícitamente "necesita prototipo con datos reales". |
| `05A:EPIC-A2` | Layout de la explicación coach (raíz/cómo/ejemplos/ganancia) | No cristaliza en texto; necesita prototipo. |
| `05A:F-A6.2` | UI de revisión de tono en lote (cómo se logra el apalancamiento 1:10) | No cristaliza; necesita prototipo. |
| `05B:B.6.5` | IA detecta divergencia + humano aprueba en lote (refuerzo RL) | El refuerzo RL es indecidible; espeja a US-B4.3.1. |
| `05B:EPIC-B7` | Máquina de hipótesis completa con revisores adversariales | Necesita prototipo; queda en fila. |
| `05B:EPIC-B8` | Taxonomía MECE completa de categorías | Reemplaza al clasificador delgado; queda en fila. |
| `05B:US-B4.3.1` | Bucle de refuerzo (resultado + restricciones → memoria) | Sin productor ejecutable decidible aún. |
| `05DE:BR-DE8` | Nota de secuenciación de la fase-2 | No tiene actor ni tipo-de-trabajo; no es un balde decidible. |

---

## LIMITACIONES honestas de este mapa

**Y qué:** este documento es una PROPUESTA, no una decisión. No genera el JSON real de N8N, no da orden-de-build, no estima esfuerzo, y no re-detecta contradicciones (consume el reporte). Todo contrato citado es `[I]` hasta verificarse contra la arquitectura de datos `04`; los extractos del LLM varían entre corridas, así que "corrió una vez" no equivale a "reproducible". Cobertura completa no prueba corrección — el dueño-del-merge debe revisar el diff pieza por pieza, no solo confiar en las compuertas.
