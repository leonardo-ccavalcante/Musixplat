# Pantalla 5 D+E — Dashboard de Salud del área Support (VITRINA)

> **Estado:** DRAFT EMITIDO · 2026-06-17 · **última feature del área Support**. **Fase 2** del build (§13 de `04`): la espina ya corre; D+E entra como lote, NO bloquea GATE 1.
> **Naturaleza:** **VITRINA read-only.** Solo MUESTRA números ya calculados/guardados por otras features; **nunca recomputa** (número determinista lo produce su dueño vía `Named_Query`, jamás el LLM). No tiene tabla de cálculo propia — solo su **configuración de layout**.
> **Provenance:** `[V]` vivido/decidido por Leo · `[I]` diseño · `[C]` escenario.
> **Karpathy:** este doc es el MÍNIMO que prueba la tesis en el demo. Todo lo avanzado (drift de 4 capas, oscilación generativa, copiloto, salud-del-gobierno) está **capturado como roadmap** en `_evolucion_meta_inteligencia_support.md` — NO se construye esta semana.

---

## 1. Problema `[V]`

El humano-meta-capa que gobierna la IA (mejora políticas/evals/tono = RLHF; opera 1:10, ~5000 restaurantes por pool) **no tiene una vista integrada de la salud del área**. La info está dispersa: tokens en cada conversa, metas en otra tela, valor (1:10) en otra. No puede, de un vistazo, saber si el Support va bien — ni **probar** que la presión del cliente se está volviendo inteligencia, en vez de solo costo.

**El dolor vivido (Uber Eats):** faltaba visión integrada, era difícil cruzar datos, y no se veía **el impacto que pasaba DESPUÉS** con el cliente.

## 2. Frame `[V]`

D+E = una **vitrina** que junta, en una pantalla, los números que ya existen — con **honestidad** (sellos de confianza, silenciosos visibles) y **estructura Pirámide** (un veredicto arriba; el detalle, colapsado, solo on-demand). Es para el **barrido diario de 5 segundos** del operador 1:10 + decisión profunda a veces. **Anti-overload es constraint duro.**

**Lo que prueba la tesis** (el héroe): **dos curvas en el mismo eje temporal — costo BAJANDO mientras la inteligencia generada SUBE.** Si el costo cae y la inteligencia no crece = estancamiento, no victoria.

---

## 3. Estructura — Pirámide Invertida (primer viewport = UNA cosa)

### EPIC-DE1 · Veredicto (lo único en el primer viewport)
- **US-DE1.1** — Como humano-meta, al abrir veo **un** número: la **tasa de override honesta** (cuánto corrijo a la IA) con el North Star/`Salud_1a10` de fondo, su **sello de confianza** pegado, y una **cinta de silenciosos** siempre visible. Sé en 5s si va bien.
- **AC:** override NUNCA solo con flecha-abajo (anti-Goodhart, BR-DE5); sello visible; cinta de silenciosos visible aunque esté "0 datos".

### EPIC-DE2 · El héroe: Costo vs Inteligencia (la película de la tesis)
- **US-DE2.1** — Como humano-meta, veo **dos curvas en el tiempo**: el **costo** (tokens/ticket, AHT, contactos) bajando, y la **inteligencia generada** (conocimientos validados, políticas nacidas de casos, celdas rojo→verde, reuso) subiendo. Veo el **activo** acumularse, no solo el costo caer.
- **AC:** si el costo cae y la inteligencia NO sube en la ventana → se marca **"ESTANCADO"** (no verde).

### EPIC-DE3 · Drill on-demand (colapsado): 3 lentes + radar de drift
- **US-DE3.1** — Como humano-meta, si pido "explícame", abro 3 lentes MECE — **Costo** / **Inteligencia (¿aprende?)** / **Gobierno** — y el **radar de drift**. Por defecto **colapsado** (anti-overload).
- **US-DE3.2 (drift mínimo)** — Como humano-meta, veo la **banda de error por agente** (de las `Eval_Cell`); cuando una sale de su banda, **el sello del veredicto (DE1) cae solo a "provisional/no-confiable"** — el drift **sube al héroe** sin que yo abra el cajón.

---

## 4. Mapa de lectura (cada número → tabla EXISTENTE; D+E solo hace SELECT)

| Lo que muestra | Lee de (canónico `04`) | Dueño |
|---|---|---|
| balance/volumen/estado de tickets, tipos, canal | `Conversa_Episodio.estado_conversa` / `.intent` / `.canal` | 05A |
| tokens/ticket, contactos-por-persona, csat, absorbido/escalado | `Conversa_Episodio.capa_metricas` | 05A |
| valor / ratio 1:10 (con 2 compuertas) | `ROI_Operador.ratio_1_10`, `.es_atribuible`, `.metodo_atribucion` | P02 |
| metas vs target | `KPI.valor_hoy/target` (det. vía `Named_Query`) | P03 |
| salud longitudinal (North Star de fondo) | vista `Salud_1a10` | P11 (narrado) |
| **inteligencia generada** | `Knowledge_Case` promovidos · `Politica_Tier.nacida_de_trace` · `Eval_Cell` rojo→verde (`min_calculo`) · `Artefacto_Generado.reuse_count` | 05B/05C/P02 |
| autonomía liberada (¿aprende?) | `min_calculo` (antes/después) | P02/P05A |
| **silenciosos** | `Afetado.silencioso` · `Processo_Critico.estado=monitoreo_degradado` | 05B |
| costo/resolver vs valor-ganado | `Problema_Diagnosticado.impacto` | 05B |
| banda de error por agente (drift) | `Eval_Cell` (estado, kappa, banda histórica) | gov Evals |
| umbrales (k, banda, n_min, stale T) | `Config_Perillas` | — |

**Único dato propio de D+E:** su **configuración de layout** (qué cuadros, qué pares bueno/cuidado, qué umbrales resaltan). **Cero números nuevos.**

---

## 5. Reglas de negocio

- **BR-DE1 (vitrina):** D+E **nunca calcula ni persiste un número** de negocio; solo LEE y visualiza. Cualquier métrica de salud que NO exista ya como campo → se crea como `Named_Query`+`KPI` en su dueño, no ad-hoc en el dashboard. `[V]`
- **BR-DE2 (3 sellos):** todo valor en $ lleva sello — **confirmado** (2 compuertas: `es_atribuible=true`) / **provisional** (1) / **no-confiable** (`funnel-correlacional` o `[C]` narrado). Nunca sumar provisional+confirmado en un verde. `[V]`
- **BR-DE3 (silenciosos no-verde):** la foto cruza la población proactiva (`Afetado.silencioso` + `Processo_Critico` degradado); sin datos → **"monitoreando, sin datos"**, jamás verde-falso. `[V]`
- **BR-DE4 (drift → sello, push al héroe):** banda de `Eval_Cell` fuera de límite → el sello del veredicto (DE1) **se degrada automáticamente**; el drift no depende de que el humano abra el drill. `[V]`
- **BR-DE5 (anti-Goodhart):** override-baja solo es verde con **csat sostenido + reapertura-baja + tiempo_a_firma estable**. `[V]`
- **BR-DE6 (pools, 2 niveles):** **dentro** del pool/empresa = trazabilidad total (quién hizo qué + resultado). Vistas **agregadas cross-pool** = zona cohort, exigen `n_cuentas >= k_anon_threshold`. Dato crudo de cliente nunca cruza hacia afuera sin validación humana. `[V]`
- **BR-DE7 (anti-overload):** primer viewport = UNA cosa; detalle colapsado; sugerencias agrupadas **MECE** + deep-dive on-demand (nunca fila de 20). `[V]`
- **BR-DE8 (Fase 2):** D+E consume la espina ya corriendo; no bloquea GATE 1. `[I]`
- **BR-DE9 (§14 anti-fake — invariante):** D+E solo muestra resultados **COMPUTADOS** por su productor; pre-corrida = vacío/conservador, **nunca verde/número-fake**. Un valor sin que su productor haya corrido NO se pinta. Campo-resultado sin productor ejecutable (p.ej. `at_risk`/pre-churn, needs-prototype) → se **EXCLUYE** (fail-closed), no se muestra `[C]`. D+E es la superficie humana de la regla `04 §14`. `[V]`

## 6. Casos borde
- **EC-DE1:** dato stale (> T) → "monitoreando, sin datos", no verde. (alinea BR-DE3)
- **EC-DE2:** valor que solo pasó 1 compuerta → sello **provisional**, separado visualmente del confirmado (nunca inflar el total).
- **EC-DE3:** banda de error de un agente fuera de límite → sello del veredicto a provisional + marca en el drill (BR-DE4).
- **EC-DE4:** costo cae + inteligencia plana en la ventana → **"ESTANCADO"** (no celebrar).
- **EC-DE5:** vista agregada con `n_cuentas < k` cross-pool → suprime/“no evaluable”, nunca expone.

## 7. Workflow (lectura, sin escritura de negocio)
1. Abre → SELECT a las tablas del §4 (read-only, por pool vía RLS).
2. Pinta **veredicto** (override + sello + cinta silenciosos).
3. Pinta el **héroe** (2 curvas costo vs inteligencia; marca ESTANCADO si aplica).
4. Lee bandas de `Eval_Cell`; si alguna fuera de banda → **degrada el sello del veredicto** (BR-DE4).
5. Drill on-demand → 3 lentes + radar de drift (colapsado por defecto).
6. Cero write-back de negocio; la acción RLHF vive en P02/P06, no aquí.

---

## 8. Build (Fase 2) + Roadmap
- **Mínimo-demo:** veredicto (DE1) + héroe 2-curvas (DE2) + 3 sellos + silenciosos + drift-1-banda. Reusa la espina; ~1 pantalla read-only.
- **Si sobra tiempo (upside bajo):** el eje "Inteligencia generada" ya cabe aquí (campos existentes).
- **Roadmap (NO esta semana) → `_evolucion_meta_inteligencia_support.md`:** drift de 4 capas, oscilación generativa ("B-del-cliente"), copiloto de próximo-experimento, salud-del-gobierno, error compuesto en banda. Todo **rotulado como upside**, no requisito del demo.
