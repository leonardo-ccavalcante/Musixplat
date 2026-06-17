# Evolución — Meta-inteligencia y observabilidad del aprendizaje (área Support)

> **Estado:** 🛣️ **ROADMAP / mejora futura del proceso. NO se construye esta semana.** Es la captura de los insights del `/zoom-out` sobre D+E (2026-06-17) — demasiado valiosos para perder, demasiado grandes para el demo de 1 semana. El **D+E mínimo construible** vive en `pantalla_05DE_dashboard_salud.md`; **esto es a dónde evoluciona**.
> **Provenance:** `[V]` vivido/decidido por Leo · `[I]` inferido/diseño · `[C]` escenario. **Regla Karpathy:** capturar el insight ≠ construir el sistema. Cada bloque de aquí entra como **lote/upgrade** DESPUÉS de que el D+E mínimo corra.
> **Grounding:** `00_vision` · `04_arquitectura_de_datos` (manda) · `pantalla_05A/05B/05C`.

---

## 0. La idea-madre (el reframe que cambia todo) `[V]`

**D+E no es un dashboard de SALUD/costo — es el ESTADO DE CUENTA de la tesis del área:** *"la presión del cliente se vuelve INTELIGENCIA para la empresa, no solo costo."*

Todos los paneles vividos iniciales (tokens/ticket bajando, más rápido, menos contactos) miden lo MISMO que un cost-center clásico (Zendesk). Esa es la **mitad-costo**. La **mitad-activo** — la inteligencia que se *acumula* — el modelo **ya la guarda y nadie la lee**:
- `Knowledge_Case` promovidos (no-reforzado → revisado),
- `Politica_Tier.nacida_de_trace` (políticas que NACIERON de un caso real),
- `Eval_Cell` que pasó rojo→verde (en el log `min_calculo`),
- `Artefacto_Generado.reuse_count` (conocimiento que se REUSA).

> **El eje "Inteligencia generada" al lado del eje "Costo".** La película muestra **el activo subiendo mientras el costo cae**. Si el costo cae pero el activo NO crece = **estancamiento**, no victoria. Esto es lo que prueba que el producto no es "un Zendesk más rápido". Sin inventar un número: esos campos ya existen, solo se deja de ocultar el numerador.

---

## 1. El sujeto real: ¿el sistema APRENDE o se ESTANCA? (derivada, no foto) `[V]`

El humano-meta no necesita "cuántos tokens hoy". Necesita saber si **su sistema mejora solo**. Eso es una **derivada** (cambio en el tiempo), no un instante. Hay **dos oscilaciones**:
- la del **cliente** (empeoró/paró/usa-más) — ver §3;
- la del **sistema** mismo: **autonomía liberada** creciendo (`min_calculo` antes/después) + **tasa de corrección humana CAYENDO** (si aprende, el humano corrige menos).

> Un sistema sano NO es el de costo bajo — es el de **pendiente-de-aprendizaje positiva**. Estado explícito **"ESTANCADO"** (aprendizaje plano) tan visible como el "monitoreando sin datos" de los silenciosos. Distingue: costo bajo *porque aprende* vs costo bajo *porque dejó de mejorar y se atascó en un óptimo local* — esa diferencia ES el trabajo del humano-meta.

---

## 2. Error compuesto probabilístico, en BANDA vs Evals `[V]`

Los LLMs son probabilísticos: un error que nace en el agente A se **compone** al pasar a B y a C (no-lineal). Hay que verlo en una **banda** (rango), no un punto.
- Taxa de error de cada agente (de su `Eval_Cell`) mostrada como **banda** de confianza;
- **acoplamiento**: cuando la banda de A se ensancha, las de B y C se ensanchan atrás;
- **alarma** cuando el error compuesto sale de la banda que los Evals esperaban = la cascada **amplifica**, no amortigua.

Es el hermano-meta del error-compuesto-no-lineal que `05C`/C7 ya temen — pero que **nadie estaba MIDIENDO**.

---

## 3. Drift — el embudo de 4 capas (detección del desvío silencioso) `[I]`

**No compiten: son un embudo, de lo barato/siempre-encendido a lo caro/que-prueba-causa.** El cruce **anti-Goodhart** es transversal: nada se pinta verde si el override cayó en seco O el juez de Evals está co-sesgado (`redteam_independencia_flag` bajo).

| # | Capa | Qué hace | Costo | Prueba |
|---|---|---|---|---|
| 1 | **Cadena de Confianza** (vista read-only) | Lee la confianza que cada handoff A→B→C ya estampa, **encadenada**; alarma si la confianza SUBE de un eslabón al otro sin evidencia nueva (auto-engaño / "lavado de provenance": C declara más certeza que su peor eslabón upstream). Cero tablas. | bajo | correlación |
| 2 | **Carta de Control** (CUSUM) | Mira la **distribución** semanal del error de cada agente y suma desvíos pequeños-persistentes (deriva LENTA que no da salto); bandas estratificadas por linaje upstream. | bajo | correlación |
| 3 | **Sentinela de Composición** | Golden-cases que atraviesan A→B→C **completos**. Los tests de cada agente pasan **pero el de la cadena falla** = error que vive SOLO en la composición. | medio | **causa** |
| 3b | **Canary Humano** | Re-revisión por muestra de casos auto-cerrados; divergencia humano-vs-IA = firma del drift, **y testea al gobernador** (divergencia→0 en alto volumen = rubber-stamp). | medio | causa + gobierno |

**Arquitectura:** capas 1+2 (baratas, siempre-on) dicen DÓNDE mirar; capas 3/3b (caras) disparan SOLO donde 1+2 marcaron ámbar/rojo (nunca sobre las 20 → respeta anti-overload + cuida al humano escaso). **Empezar por la Capa 1.**

---

## 4. Oscilación del cliente como PROCESO GENERATIVO `[V]` (Leo)

NO es una fórmula fija ni un panel calculado en D+E (sería calculadora). Es **B (Diagnóstico) reusado, con el sujeto cambiado de "problema→raíz" a "cliente→trayectoria"**. Existe un **productor aguas-arriba** ("B-del-cliente", job que escribe una entidad nueva sujeto=restaurante, hermana de `Problema_Diagnosticado`); D+E solo hace SELECT y pinta. Dos campos con frontera dura:
- **número determinista** (job, no opinado): `Evento_Priorizado_NBA.delta_status` {empeoró/paró/mejoró/at_risk/churn} + derivada de las señales con histéresis + delta semanal de `percentil_en_cohort`.
- **narrativa generada** (el LLM TEJE los números en una lectura — *"empezó a contactar más, csat cae, percentil baja → está resbalando"*) — **nunca inventa número ni clasificación**. El generativo cuenta el **porqué**; el determinista decide el **qué**. Si chocan, **gana el número** (igual que en B la hipótesis no se vuelve hecho sin el resultado, BR-B8).
- **Honesto:** 3 estados (trayectoria clara con evidencia citable / señales mixtas → "lectura ambigua, ojo humano" / sin datos → "monitoreando"). `evidencia_citada[]` con `snapshot_id/episodio_id`.

> ⚠️ **Riesgo #1 — fuga cross-pool por la PROSA.** El aislamiento protege COLUMNAS, pero una narrativa generada es texto libre — el RLS no la filtra. Ver §5.

---

## 5. Conocimiento de la empresa vs dato del cliente — la regla de 2 niveles `[V]` (Leo, corrección)

- 🔒 **Dato CRUDO/identificable del cliente** → preso al pool. Hacia AFUERA de la empresa, la IA solo nombra "quién hizo qué" **con validación humana**.
- 🌐 **Conocimiento VALIDADO** (patrón que funcionó, política, solución comprobada) → es de la **EMPRESA** y **FLUYE entre pools**. Así se escala: reusar el éxito de un pool en todos, no repetir el error que otro ya cometió. Sin esto, cada pool reaprende de cero.
- 🏢 **DENTRO de la empresa: trazabilidad TOTAL** — *quién hizo qué y cuál fue el resultado*, para rever el paso a paso. **NO se anonimiza internamente**; anonimizar (hacia afuera) es responsabilidad del empleado.

> **El eje "Inteligencia generada" (§0) ES este conocimiento de empresa acumulándose y fluyendo entre pools.** El **reuso de conocimiento validado cross-pool es la métrica de ESCALA de la empresa.** Guardrail que falta hoy: la narrativa generada (§4) solo puede exponer conocimiento **validado** o evidencia del **propio pool** — nunca dato crudo de otro cliente. El portón es exactamente el "verificado y validado".

---

## 6. Copiloto: D+E propone el próximo experimento RLHF (de velocímetro a copiloto) `[I]`

La celda PEOR del sistema YA es derivable (Eval_Cell rojo × n alto = cuello de autonomía; Problema frecuente sin Knowledge_Case = laguna; tipo_area con peor csat = falla de tono). D+E **rankea** "dónde mejorar política/eval/tono rinde más" por valor-en-juego ya guardado (`rs_perdido`, n-afectados). **No calcula: ORDENA lo que existe.**
- **NUNCA auto-libera** (respeta promover=humano+evidencia, AUT-11, override solo-baja). Solo SUGIERE; el humano firma.
- **Anti-overload (regla de Leo):** agrupa **MECE** (3-4 racimos por palanca) + **deep-dive on-demand**, nunca una fila de 20 ni "1 por vez × 20".

---

## 7. Salud del GOBIERNO: medir al humano-meta, no solo a la IA `[I]`

El peor fallo de un dashboard de salud: **tranquiliza** — cuanto más verde, menos mira el humano → la deriva corre sin testigo (peor por ser probabilística, §2). Medir al gobernador con campos que ya existen: `rubber_stamp_flag`, `Decision_Trace.tiempo_a_firma_seg`, `Edicion_Contexto.timestamp` (semanas sin editar política + overrides subiendo = gobierno ritual vacío). Mismo patrón "verde-real vs verde-porque-nadie-mira" de los silenciosos.

---

## 8. Métrica-madre: tasa de override honesta `[V]`

Si solo se mostrara UN número cada mañana: la **tasa de override** (lo que el humano EMPUJA esta semana = la palanca del RLHF), con el North Star/`Salud_1a10` de fondo — no al revés (el North Star es compuesto y lagging: buen norte, mal número-del-día). **Anti-Goodhart obligatorio:** override-baja solo es verde si va con **csat sostenido + reapertura-baja + tiempo_a_firma estable + sin rubber-stamp** (override-baja puede ser "la IA mejoró" O "el humano se rindió" — indistinguibles solas).

---

## 9. Cómo entra al build (orden, después del D+E mínimo)

| Upgrade | Depende de | Esfuerzo |
|---|---|---|
| Eje "Inteligencia generada" (§0) | tablas existentes (vitrina) | **bajo** — candidato a entrar ya en el D+E mínimo si sobra tiempo |
| "¿Aprende?" / derivada + estancado (§1) | serie semanal | bajo-medio |
| Error compuesto en banda (§2) + Drift Capa 1 (§3) | Eval_Cell + vista nueva | medio |
| Drift Capas 2/3/3b (§3) | historia + golden-chain + canary | alto (subsistema) |
| Oscilación generativa / "B-del-cliente" (§4) | job + entidad nueva + guardrail prosa (§5) | **alto** (feature nueva) |
| Copiloto (§6) | ranking sobre existentes | medio |
| Salud del gobierno (§7) | campos existentes | bajo-medio |

> Regla: **el D+E mínimo prueba la tesis solo** (foto+película + 2 ejes + 3 sellos + silenciosos + drift-1-banda). Todo lo de aquí es **upside rotulado**, no requisito del demo. Mostrar "sé a dónde va, elegí no construirlo esta semana" es más fuerte que construir todo a medias.
