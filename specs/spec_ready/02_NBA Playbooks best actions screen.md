# Cockpit de Gobernanza de Autonomía — Feature Breakdown (consolidado, iter. 1–4)

> Salida del Feature Breakdown Engine sobre la cuña validada con Leo (iter. 1–3). Dominio concreto: **Uber Eats** (transfiere a Musixmatch — cambian los KPIs, no la estrategia). Idioma = ES; provenance por línea: `[V]` vivido/dicho por Leo · `[I]` inferido/a-decidir · `[C]` escenario placeholder ("el valor está en el mecanismo").
> Grounding pin: `specs/00_vision_completa.md` **v1.2** · 2026-06-15 (§2 motor + min(), §3 North Star, §4 P01/P02/P06/P10/P11, §8 hard-nos). *(Reconciliado: los enxertos de esta spec se integraron en 00 v1.2.)*
> Las marcas **« iter.3 »** señalan lo que se integró/refinó en esta iteración (enxertos del triple-check + respuestas de Leo sobre tenant y financiero). El resto es el artefato validado en iter. 1–2.

## Decisiones validadas (iter 1–4)
- Operador = **agent-manager**: no atiende clientes, gobierna la IA; meta = máx. autonomía segura, interviniendo solo en los puntos de juicio. [V]
- 3 puntos = 3 palancas del `min(pedido, liberado, teto)`: pausar/liberar acciones (override solo BAJA) · flexibilizar cohort (teto/segmentación) · mejorar evals (sube liberado). [V]
- Cuña desarrollada = **EPIC-1 Pausar/Liberar acciones**: lote por cohort + drill a subgrupo; ROI por operador (eficiencia × impacto atribuible: recurrencia/ventas/cross-sell); "bajo riesgo" = POLÍTICA versionada (.md), no regla chumbada; semilla AUT-04 (BAJO + reversible), nunca dinero. [V]
- EPIC-2 (flexibilizar cohorts) y EPIC-3 (mejorar evals) = diferidas `[I]`. [V]
- **« iter.4 » 3 MEJORAS folradas** (ver §MEJORAS INCORPORADAS): (B) cada acción muestra `estimativa_impacto` vs KPI (±X pp/%); (C) **matriz de decisión riesgo×impacto** (9 cuadrantes → auto-liberar / confirmar / escalar / descartar); (D) **credenciales/autoridad** (3 puertas credencial→política→`min()`, fail-closed) + `base_de_credenciales.md`. [V] (validado con Leo)
- **« iter.3 » Tenant / aislamiento:** la unidad es el **restaurante individual**; la fuga concreta a evitar = *identificar una campaña muy específica de UN restaurante* a partir de un insight/benchmark derivado de cohort/subgrupo → define BR-3 (cross-tenant) y el `k` de la k-anonymity (BR-12). [V]
- **« iter.3 » Frontera financiera:** "nunca autónomo" cubre **solo lo que mueve saldo** (reembolso/precio/crédito) → BR-2. Las palancas de mejora financiera **estratégica** (nuevo mercado, penetrar un mercado) se enrutan a **Strategy**; las de **área** (reducción de tickets) a **Soporte**; NO son NBAs auto-liberables del Cockpit → BR-13 (escopo/ruteo). [V]

---

## OUTPUT 1 — ÉPICAS, USER STORIES & RECORRIDO

**SÍNTESIS:** Esta pantalla existe porque el operador ya no atiende clientes — gobierna la IA que los atiende (es un *agent-manager*). Su único trabajo es llevar el sistema al **máximo de autonomía segura** y **expandirla con evidencia sin subir el error**, interviniendo solo en los pocos puntos que exigen juicio. Esos puntos son exactamente las tres palancas del freno: `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)`. El Cockpit hace operable ese `min()`: muestra el par `(pedido, liberado)` y deja actuar sobre cada palanca. La cuña que se desarrolla aquí es **EPIC-1 (Pausar/Liberar acciones)**; EPIC-2 (flexibilizar cohorts) y EPIC-3 (mejorar Evals) se declaran con alcance y se marcan `[I]` — no se fabrican criterios Given/When/Then. La transferencia a Musixmatch es directa (misma estrategia de gobierno de lifecycle + autonomía a escala; solo cambian los KPIs: lanzamientos, catálogo, royalties), pero aquí se razona en Uber Eats. [V] (validado con Leo, iter. 1-2)

**PROBLEMA:** El agent-manager debe maximizar y expandir la autonomía segura de la IA, pero hoy no tiene un único punto de control sobre las tres palancas del `min()`: soltar de más es riesgo, sostener de más mata el apalancamiento 1:10. No puede liberar/pausar acciones con confianza ni ver el par `(pedido, liberado)` que define qué puede hacer la IA sola. [V] · **OUTCOME:** Mueve el North Star (`valor_confirmado_atribuible / esfuerzo − deflection_que_falla`) por la vía del **ROI por operador**: tiempo economizado × impacto de negocio real y atribuible (recurrencia/ventas/cross-sell), con el 1:10 mensurable — todo bajo un **guardrail duro**: el error/reapertura/reversión de las acciones liberadas NO puede subir. Aumentar autonomía solo es legítimo vía evidencia (Evals); nunca por defecto, nunca por prisa (AUT-05), nunca dinero (AUT-06), nunca cross-tenant. [V] · cifras de métrica = [C] placeholder (el valor está en el mecanismo)

**PLACEMENT:** Pantalla de Gobernanza/Freno del motor (eslabón 4 "Autonomía"). Es el tablero humano del `min()` que **P02** (NBA/Playbooks) computa por acción. Aguas-arriba: P02 provee las acciones y su `pedido_NBA`; **P06** Evals provee `liberado_evals`; **P10** Política provee `teto_tier`; **P07** Cerebro = grounding. Aguas-abajo: las decisiones liberar/pausar gobiernan la ejecución de P02, escriben `decision_trace` en P07 y alimentan Salud 1:10 (**P11**, ROI/anti-rubber-stamp). Fuera de alcance: definir cohorts, calibrar Evals, definir Política, ejecutar dinero; **« iter.3 »** y las palancas no-operacionales (mejora financiera estratégica → Strategy; reducción de tickets → Soporte). [V]

---

### Épicas (MECE; cada una desarrollable)

| Épica | Alcance | Dims que cubre | Status |
|---|---|---|---|
| **EPIC-1 — Pausar / Liberar acciones** (override solo a la BAJA; lote de cohort con drill a subgrupo) | Ver las NBAs que la IA propone para un cohort, con causa-raíz, acción, par `(pedido, liberado)`, `min()` visible y before/after; **liberar** (deja ejecutar hasta `nivel_efectivo`) o **pausar** (sostiene) en lote por cohort, con drill a subgrupo para acciones super-específicas. | min() visible · override solo-BAJA · base-de-políticas · ROI · guardrail error · dinero-nunca · cross-tenant · anti-rubber-stamp | **desarrollar** |
| **EPIC-2 — Flexibilizar cohorts** (mover `teto_tier`/segmentación) | Ajustar segmentación y `teto_tier` que el `min()` consume; toca P01 (regla de cohort) y P10 (teto). Alto blast-radius. | teto_tier estructural · simetría promover=humano+evidencia | **diferida-[I]** |
| **EPIC-3 — Mejorar Evals** (subir `liberado_evals`) | Disparar/ver la promoción de `liberado_evals` por celda cohort × intent — la única vía legítima de AUMENTAR autonomía. Calibración del golden_set vive en P06. | liberado_evals · golden_set · n_min≥20 · independencia juez↔humano | **diferida-[I]** |

#### EPIC-1 — Spec

**WHAT (invariantes deterministas — no negociables):**
- Toda fila muestra el par `(pedido_NBA, liberado_evals)` y el `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)`. [V]
- El override humano **solo BAJA** el nivel; nunca sube por encima de `liberado_evals` (AUT-11). [V]
- Solo es auto-liberable lo de `nivel_efectivo = BAJO` **Y** reversible/idempotente bajo lock (AUT-04). [V]
- El dinero **nunca ejecuta autónomo** (ceiling=ALTO; la IA solo propone — AUT-06); **« iter.3 »** "dinero" = mueve saldo (reembolso/precio/crédito). [V]
- Cross-tenant = **bloqueo-rojo** duro; **« iter.3 »** el caso concreto = un insight que identifique la campaña específica de un restaurante. [V]
- La prisa **nunca eleva** tier (AUT-05). [V]
- Lo permitido se **VALIDA contra la base-de-políticas versionada** (.md: qué-permitido-hoy + resultado-medido + cómo-se-mide). [V] (schema fino = [I])
- Cada liberar/pausar escribe `decision_trace` con **firma humana** (anti-rubber-stamp). [V]
- **« iter.3 » Confirmación independiente:** el resultado lo confirma alguien distinto del que aprobó (`confirmador_id ≠ proponente_id`). [V]

**HOW (juicio de producto — fijar outcome+constraints, dejar margen al builder):**
1. Listar acciones propuestas por cohort con causa-raíz / acción / par `(pedido, liberado)` / `min()` / before-after. [V]
2. Acción de lote liberar/pausar a nivel cohort sobre las acciones principales comunes. [V]
3. Drill a subgrupo dentro del cohort para acciones super-específicas (2 niveles: cohort → subgrupo). [V]
4. Al liberar: validar contra base-de-políticas + checar reversibilidad/lock + descartar dinero/cross-tenant → ejecutar solo hasta `nivel_efectivo`, *degrade-to-human* el resto. [V]
5. Medir ROI (eficiencia + negocio atribuible) y vigilar el guardrail de error. [V]
- *needs-prototype:* el recorrido clic-a-clic lote-cohort → drill-subgrupo (sobre todo en móvil con paridad total) si no cristaliza en ~2 rondas → flag `[I] needs-prototype`. [I]

---

##### Features de EPIC-1

**F-1.1 — Bandeja de acciones propuestas por cohort (con `min()` visible)**

**US-1.1.1** | **Must** | Hito 1 — Como *agent-manager*, quiero ver, agrupadas por cohort, las acciones (NBAs) que la IA propone con su causa-raíz, la acción concreta, el par `(pedido, liberado)` y el `nivel_efectivo`, para entender en un vistazo qué pide la IA y cuánto la dejan los Evals. [V]
- Given un cohort con N acciones propuestas, When abro su bandeja, Then cada fila muestra causa-raíz, acción, `pedido_NBA`, `liberado_evals` y `nivel_efectivo = min(...)`, y el par `(pedido, liberado)` aparece **siempre junto**. [V]
- Given una acción cuyo `pedido_NBA = ALTO` pero `liberado_evals = BAJO`, When la veo, Then el `nivel_efectivo` se muestra = BAJO y se señala que **Evals es el brazo que limita**. [V]
- *(edge)* Given un cohort **sin acciones propuestas**, When abro su bandeja, Then se muestra estado vacío ("la IA no propone acciones para este cohort ahora") y no hay nada liberable. [V]
- *(edge)* Given una acción de clase **dinero** (mueve saldo), When la veo, Then aparece marcada "solo propuesta — no ejecutable" (ceiling=ALTO, AUT-06) y el control de liberar está **deshabilitado**. [V]
- *(edge)* Given una acción que tocaría **otro tenant** (revela la campaña de otro restaurante), When la veo, Then aparece en **bloqueo-rojo** y no es liberable bajo ninguna condición. [V]

**US-1.1.2** | **Must** | Hito 1 — Como *agent-manager*, quiero ver el before/after esperado de cada acción y su `risk_class`, para juzgar si la suelto sin abrir cada caso. [V]
- Given una fila de acción, When la inspecciono, Then veo el before/after esperado (KPI que mueve: pedidos/horario/precio/recurrencia/cross-sell) y su `risk_class` (liberable = BAJO + reversible/idempotente). [V/I]
- *(edge)* Given una acción **no reversible / no idempotente**, When la inspecciono, Then se marca "no auto-liberable" aunque su `nivel_efectivo` sea BAJO (AUT-04). [V]

**F-1.2 — Liberar/Pausar en lote por cohort**

**US-1.2.1** | **Must** | Hito 2 — Como *agent-manager*, quiero liberar o pausar en **lote** las acciones principales comunes de un cohort, para mover muchas cuentas con pocos toques certeros (apalancamiento 1:10). [V]
- Given un cohort con acciones liberables, When elijo "liberar lote", Then se libera **solo** lo que es `nivel_efectivo = BAJO` + reversible/idempotente + valida contra base-de-políticas; el resto hace *degrade-to-human*. [V]
- Given un lote a liberar, When confirmo, Then se escribe un `decision_trace` por la liberación con **mi firma humana** y el `policy_version` validado. [V]
- Given un lote, When elijo "pausar", Then esas acciones quedan sostenidas para juicio humano y su ejecución autónoma se detiene. [V]
- *(edge)* Given un lote donde **una parte es dinero o cross-tenant**, When pido liberar, Then esas se excluyen automáticamente del lote (dinero = solo-propuesta; cross-tenant = bloqueo-rojo) y se libera solo el resto elegible. [V]
- *(edge)* Given que intento, vía override, **subir** el nivel por encima de `liberado_evals`, When confirmo, Then el sistema lo **rechaza** (fail-closed) y explica que el override solo baja (AUT-11) y que subir autonomía exige Evals (EPIC-3). [V]
- *(edge)* Given prisa del operador (acción rápida masiva), When libero, Then la prisa **no eleva** ningún tier ni salta la validación de políticas (AUT-05). [V]

**US-1.2.2** | **Should** | Hito 2 — Como *agent-manager*, quiero validar cada liberación contra la base-de-políticas versionada (.md), para que "bajo riesgo" sea **política**, no regla chumbada, y para que de ahí nazcan nuevas políticas. [V]
- Given una acción a liberar, When el sistema valida, Then comprueba qué-está-permitido-hoy + resultado-medido + cómo-se-mide contra el `policy_version` vigente y registra el resultado de la validación. [V]
- *(edge)* Given una acción **no cubierta** por ninguna política vigente, When pido liberar, Then queda en *degrade-to-human* y se ofrece **proponer una nueva política** (no se libera por defecto). [V] (schema fino = [I])

**F-1.3 — Drill a subgrupo (acciones super-específicas)**

**US-1.3.1** | **Should** | Hito 3 — Como *agent-manager*, quiero descender de un cohort a un **subgrupo** dentro de él para liberar/pausar acciones super-específicas, sin salir del cohort. [V]
- Given un cohort abierto, When entro a un subgrupo, Then veo las acciones específicas de ese subgrupo con el mismo `min()` visible y los mismos invariantes (solo-BAJA, dinero-nunca, cross-tenant, base-de-políticas). [V]
- Given un subgrupo, When libero/pauso, Then la decisión aplica **solo** a ese subgrupo y escribe su propio `decision_trace`, sin afectar al resto del cohort. [V]
- *(edge)* **« iter.3 »** Given un subgrupo tan pequeño que el insight identificaría la campaña de un solo restaurante (`N < k`), When intento mostrar/derivar el benchmark, Then se **suprime** (k-anonymity, BR-12) — fail-closed por re-identificación competitiva. [V]
- *(edge)* Given el recorrido clic-a-clic cohort → subgrupo (especialmente en **móvil con paridad total**), When no se cristaliza en ~2 rondas de diseño, Then se marca `[I] needs-prototype` y **no se fabrican** GWT del flujo móvil. [I] needs-prototype

**F-1.4 — ROI por operador + guardrail de error**

**US-1.4.1** | **Must** | Hito 3 — Como *agent-manager*, quiero ver el ROI de mis liberaciones (tiempo economizado × impacto de negocio atribuible) y el guardrail de error, para demostrar el 1:10 sin subir el riesgo. [V]
- Given un conjunto de acciones liberadas, When miro el ROI, Then veo los **dos lados juntos**: eficiencia (tiempo economizado × impacto = 1:10) y negocio (¿subió recurrencia/ventas/cross-sell? — valor **real y atribuible**, nunca "acción ejecutada"). [V] · cifras = [C]
- **« iter.3 »** Given una acción liberada, When miro su impacto, Then veo su `metodo_atribucion` (holdout/control · pre-post · funnel-correlacional); si es `funnel-correlacional`, **no** puede declararse "valor confirmado y atribuible" (señal débil). [V]
- **« iter.3 »** Given una NBA con efecto medido, When reviso el ROI, Then veo el efecto en **dos horizontes** (inmediato + largo, escritos en su spec); si es inmediato+ pero largo−, se marca "revisar" y el valor neto no se acredita hasta cerrar el horizonte largo. [V]
- Given acciones liberadas, When miro el guardrail, Then veo error/reapertura/reversión de esas acciones, y si **sube** respecto al baseline se dispara alerta. [V] · umbral = [C]
- *(edge)* Given una celda cohort × intent con `n < n_min (20)`, When intento leer un percentil de impacto, Then se muestra "muestra insuficiente" en vez de un número (no se reporta percentil con n<20). [V]
- *(edge)* Given que el guardrail de error **sube** en un cohort liberado, When se detecta, Then se sugiere **rebajar** (override a la BAJA, automático) ese lote — la rebaja no exige evidencia, solo la promoción la exige. [V]

#### EPIC-2 — Flexibilizar cohorts (mover `teto_tier` / segmentación) — `[I]` diferida

**Alcance:** ajustar la segmentación y el `teto_tier` que el `min()` consume; mover estructuralmente qué grupos existen y cuánto techo permite cada uno. Toca P01 (regla de cohort versionada) y P10 (`teto_tier`). [V]
**WHAT:** el cambio es estructural y de **alto blast-radius**; subir `teto` exige **evidencia + firma humana** (simetría con Evals: promover=humano+evidencia, rebajar=automático); nunca cross-tenant; nunca eleva por defecto. [V]
**HOW:** **DIFERIDO por Leo** — requiere primero un set de **hipótesis** de impacto + un mecanismo de simulación/holdout. `[I] needs-hypothesis` — **no se fabrican GWT**.

#### EPIC-3 — Mejorar Evals (subir `liberado_evals`) — `[I]` diferida

**Alcance:** subir el `liberado_evals` de una celda cohort × intent es la **única** vía legítima de AUMENTAR la autonomía efectiva (promover = humano + evidencia; rebajar = automático). El Cockpit es donde el agent-manager vería/dispararía esa promoción, pero la **calibración del golden_set vive en P06**. [V]
**WHAT:** `liberado_evals` solo sube con evidencia del golden_set (`n_min ≥ 20` por celda) + firma humana; el override humano **nunca** sube por encima de `liberado_evals` (AUT-11); independencia juez↔humano (red-team set). [V]
**HOW:** **DIFERIDO (acordado con Leo)** — la mecánica de calibración cohort × intent es propiedad de P06; aquí solo se consume/dispara. `[I]` — **no se fabrican GWT**.

---

### Recorrido (primera persona, clic por clic)

**Contexto:** soy el agent-manager. Abro el Cockpit a las 9:00 para gobernar lo que la IA propone hoy. Foco = EPIC-1 (desktop cristalizado; móvil → `[I]`).

1. **Entro al Cockpit (estado de carga).** Veo un esqueleto de la lista de cohorts mientras P02 trae las acciones propuestas y P06/P10 alimentan `liberado_evals`/`teto_tier`. Si algún brazo del `min()` no carga, la fila aparece **deshabilitada** con aviso "esperando Evals/Política" — no puedo liberar a ciegas (fail-closed). [V]
2. **Veo la lista de cohorts.** Cada cohort muestra cuántas acciones propone la IA y cuántas son liberables. *Estado vacío:* si un cohort no tiene propuestas, lo veo en gris con "sin acciones ahora". [V]
3. **Abro un cohort → bandeja de acciones (F-1.1).** Cada fila: causa-raíz → acción → par `(pedido, liberado)` siempre junto → `nivel_efectivo = min(...)` → before/after → `risk_class`. Veo de un vistazo cuál brazo limita (ej.: "pedido ALTO, liberado BAJO → efectivo BAJO, limita Evals"). [V]
4. **Filtro lo liberable.** El sistema ya marca: dinero = "solo propuesta" (control deshabilitado, AUT-06); cross-tenant = **bloqueo-rojo**; no-reversible = "no auto-liberable" (AUT-04). Lo que queda es candidato a lote. [V]
5. **Libero en lote por cohort (F-1.2).** Pulso "liberar lote" sobre las acciones principales comunes. El sistema valida contra la **base-de-políticas** (`policy_version`), excluye automáticamente dinero/cross-tenant, libera solo `nivel_efectivo = BAJO` + reversible, y manda el resto a *degrade-to-human*. Confirmo → se escribe un `decision_trace` con mi **firma**. [V]
6. **Intento "forzar" una de alto pedido (edge).** Pruebo subir el nivel de una acción con `pedido = ALTO` pero `liberado = BAJO`. El sistema **rechaza** (fail-closed): "el override solo baja; subir autonomía exige Evals". Entiendo que esa palanca es EPIC-3. [V]
7. **Drill a subgrupo (F-1.3).** Dentro del cohort, un subgrupo de restaurantes (ej. horario nocturno con caída de recurrencia) necesita una acción super-específica. Entro al subgrupo, veo el mismo `min()` y los mismos invariantes, y libero/pauso **solo** ahí — escribe su propio `decision_trace`. **« iter.3 »** Si el subgrupo es tan chico que el insight señalaría a un solo restaurante, se suprime (k-anonymity). [V]
8. **Reviso ROI + guardrail (F-1.4).** Veo los dos lados del ROI juntos y, **« iter.3 »**, el `metodo_atribucion` y el doble horizonte (inmediato vs largo). *Edge:* un cohort liberado con error al alza → el sistema sugiere **rebajar** (automático, a la BAJA). *Edge:* una celda con `n < 20` muestra "muestra insuficiente". [V] · cifras = [C]
9. **Cierro el loop.** Cada decisión queda en `decision_trace` (P07) y alimenta Salud 1:10 (P11). Lo no cubierto por políticas quedó en *degrade-to-human* con opción de **proponer nueva política**. [V]

**Recorrido móvil — `[I] needs-prototype`:** la paridad total en móvil (actuar de todo, incluso ajustar tier) manteniendo `min()`/dinero-nunca/override-solo-baja/cross-tenant iguales, con el flujo lote-cohort → drill-subgrupo en pocos toques **no se cristaliza** clic-a-clic sin prototipo. Riesgo principal: la prisa en móvil que fura regla (AUT-05). Se marca `[I] needs-prototype` y **no se fabrican** GWT del recorrido móvil. [I]

## OUTPUT 2 — BUSINESS RULES + EDGE CASES + FAILURE HANDLING

**SÍNTESIS:** El modo de fallo que más amenaza el North Star NO es soltar de más (eso lo atajan los hard-nos y el fail-closed); es el **rubber-stamp de lote**: el agent-manager libera un lote de cohort "bajo riesgo" sin que el riesgo real esté validado contra la base-de-políticas, y el sistema cuenta como impacto algo que NO es valor atribuible. Esto envenena las dos vías del North Star a la vez — sube el error y rompe la única palanca legítima de crecer (Evals), porque el operador "gana autonomía" por firma fácil en vez de por evidencia. Por eso las reglas duras se concentran en: (1) que liberar en lote SIEMPRE valide contra política + reversibilidad + descarte dinero/cross-tenant antes de ejecutar; (2) que el ROI solo cuente impacto **atribuible y confirmado** (nunca estimado ni "acción ejecutada"); (3) que la prisa/móvil NUNCA baje el guardrail. Todo lo demás (n<20, política ausente, subgrupo vacío) degrada-a-humano antes que adivinar. [V/I]

### A. Business Rules (invariantes)

**BR-1 | [V] | hard-no:sí | versionada:no** — El override humano solo puede BAJAR el `nivel_efectivo`, nunca subirlo por encima de `liberado_evals` (AUT-11). · Por qué: aumentar autonomía es legítimo SOLO vía evidencia (Evals); subir por firma rompe la única palanca legítima de crecimiento. · Alcance: toda acción liberar/ajustar-tier (cohort, subgrupo, desktop y móvil). · SI SE VIOLA → bloqueo-rojo (rechazo + traza) + se entera el agent-manager y el owner de Política/Evals (P10/P06).

**BR-2 | [V] | hard-no:sí | versionada:no** — El dinero nunca se ejecuta de forma autónoma: ceiling=ALTO, la IA solo PROPONE (AUT-06). **« iter.3 »** "dinero" = lo que mueve **saldo**: reembolso, precio, crédito. · Por qué: el daño de un movimiento monetario erróneo es irreversible y des-atribuible. · Alcance: toda acción cuya `clase_financiera = directa` (mueve saldo), en cualquier nivel/dispositivo. · SI SE VIOLA → fail-closed (la acción queda en "propuesta", nunca ejecuta) + traza inmutable.

**BR-3 | [V] | hard-no:sí | versionada:no** — Ninguna acción/insight cruza el límite de tenant; no hay override que lo permita. **« iter.3 »** la unidad es el **restaurante individual**; la violación concreta = exponer/derivar algo que **identifique la campaña específica de un restaurante** hacia otro. · Por qué: la fuga competitiva entre restaurantes es la violación de aislamiento más cara (legal + confianza); no es graduable. · Alcance: validación previa a ejecutar/mostrar de TODA liberación o insight de lote/subgrupo. · SI SE VIOLA → bloqueo-rojo total del lote (no solo la fila infractora) + alerta a agent-manager y a seguridad/plataforma.

**BR-4 | [V] | hard-no:sí | versionada:no** — El `nivel_efectivo` mostrado y aplicado es SIEMPRE `min(pedido_NBA, liberado_evals, teto_tier)`; ningún brazo se omite y el par `(pedido, liberado)` se exhibe junto en cada fila. · Por qué: ocultar un brazo del min() reintroduce el fallo que el Cockpit existe para eliminar. · Alcance: render de toda fila y todo cómputo de ejecución. · SI SE VIOLA (un brazo null/no disponible) → fail-closed al menor brazo conocido + degrade-a-humano la fila ("no liberable: dato de freno ausente").

**BR-5 | [V] | hard-no:no | versionada:sí** — Una acción solo es auto-liberable en lote si `nivel_efectivo = BAJO` **Y** es reversible/idempotente bajo lock (AUT-04). · Por qué: el lote multiplica el blast-radius; sin reversibilidad no hay forma de deshacer un error de lote. · Alcance: liberar a nivel cohort y subgrupo. · SI SE VIOLA/FALLA → fail-closed (esa acción se excluye del lote, degrade-a-humano individual) + el agent-manager ve cuántas quedaron fuera.

**BR-6 | [V] | hard-no:no | versionada:sí** — "Bajo riesgo" NO es regla chumbada: se VALIDA contra la base-de-políticas versionada (qué-permitido-hoy + resultado-medido + cómo-se-mide) al liberar; de ahí también NACEN políticas nuevas. · Por qué: el riesgo cambia con evidencia; chumbarlo lo congela. · Alcance: toda liberación; lee `policy_version` vigente y la cita en `decision_trace`. · SI SE VIOLA/FALLA (política ausente/ilegible/versión no resoluble) → fail-closed + degrade-a-humano + alerta al owner de la base-de-políticas.

**BR-7 | [V/C] | hard-no:no | versionada:sí** — El impacto que cuenta para el ROI es SOLO `valor_confirmado_atribuible` (recurrencia/ventas/cross-sell ligado por `contrato_activacion` + `signal_de_resultado`); jamás impacto estimado ni "acción ejecutada". **« iter.3 »** se añade `metodo_atribucion ∈ {holdout/control, pre-post, funnel-correlacional}`: si es `funnel-correlacional`, la acción **no** puede declararse "confirmada y atribuible"; la confianza del North Star se degrada según el método. **« iter.3 »** apertura/log/click = **señal DÉBIL**, NUNCA confirmación de adopción ni de impacto. · Por qué: contar acciones, estimaciones o correlación temporal infla el numerador del North Star y mata el aprendizaje. · Alcance: todo cálculo de `roi_operador` y de Salud 1:10 (P11). · SI SE VIOLA/FALLA (no hay señal atribuible cerrada) → el valor NO se acredita (cuenta 0; nunca placeholder positivo) + se marca [C] pendiente.

**BR-8 | [V] | hard-no:sí | versionada:no** — La paridad móvil NO baja ningún guardrail: en celular se puede actuar de todo (incl. ajustar tier), pero `min()`, dinero-nunca, override-solo-BAJA y cross-tenant=bloqueo valen idénticos (AUT-05: la prisa nunca eleva tier). · Por qué: el contexto móvil = prisa = el vector que más tienta a saltarse el freno. · Alcance: toda acción originada en cliente móvil. · SI SE VIOLA → mismo fail-closed/bloqueo-rojo que en desktop + traza marca `origen=móvil`.

**BR-9 | [V] | hard-no:no | versionada:sí** — Todo liberar/pausar (lote o subgrupo) escribe un `decision_trace` con firma humana, `policy_version` validada y nivel resultante; sin traza-con-firma no se ejecuta (anti-rubber-stamp). · Por qué: sin traza firmada no hay auditoría, ni ROI atribuible, ni detección de sello-de-goma. · Alcance: cada acto de override. · SI SE VIOLA/FALLA → fail-closed (no ejecuta) + alerta.

**BR-10 | [V] | hard-no:no | versionada:no** — `n_min >= 20` para que un percentil/celda cohort×intent sea válido como **base estadística** de una liberación de lote. · Por qué: bajo n, el "bajo riesgo" es ruido. · Alcance: liberación de lote apoyada en `percentil_en_cohort`. · SI SE VIOLA/FALLA → degrade-a-humano (no auto-liberable; revisión individual) + la fila marca "n insuficiente". *(Distinto de BR-12: esto es validez estadística; BR-12 es re-identificación.)*

**« iter.3 » BR-11 | [V] | hard-no:no | versionada:no** — La confirmación del resultado de una liberación la hace una persona/grupo **distinto** del que la aprobó: `confirmador_id ≠ proponente_id`. Se publica la **tasa de rechazo del confirmador** como señal de salud (→0 = alerta de rubber-stamp, conecta P11). · Por qué: con un equipo de 2 personas, la "confirmación" colapsa en auto-validación (mirror-imaging); la independencia es la defensa. · Alcance: cierre de impacto de toda liberación. · SI SE VIOLA/FALLA (no hay tercero real) → marcar "**auto-confirmada — independencia NO garantizada [C]**", nunca fingir sello independiente. *(de tu [V] iter. previa + SAT H1)*

**« iter.3 » BR-12 | [V/I] | hard-no:sí | versionada:no** — k-anonymity: un insight/benchmark derivado de cohort/subgrupo solo se muestra si `N >= k`, donde `k` es suficiente para que **no se identifique la campaña específica de un solo restaurante** (respuesta de Leo sobre tenant). · Por qué: el drill-a-subgrupo (F-1.3) tiende a `N` pequeño, justo donde la agregación deja de anonimizar y "lo que hacen los P90+" revela la jugada de un rival. · Alcance: toda derivación/exhibición de insight de cohort/subgrupo. · SI SE VIOLA/FALLA (`N < k`) → suprimir el insight ("cohort demasiado pequeño — riesgo de re-identificación competitiva [fail-closed]"). *(de SAT, devil's-advocate hard-no b)*

**« iter.3 » BR-13 | [V] | hard-no:no | versionada:sí** — Escopo/ruteo de palancas no-operacionales: el Cockpit gobierna NBAs **operacionales** sobre el lifecycle/KPI del restaurante. Una acción cuya palanca real sea **mejora financiera estratégica** (nuevo mercado, penetrar un mercado) se enruta a **Strategy**; una palanca de **área** (ej. reducción de tickets) se enruta a **Soporte**. NO son NBAs auto-liberables aquí. · Por qué: mezclar palancas estratégicas/de-área con NBAs operacionales borra la frontera de responsabilidad y mete ruido en el `min()`. · Alcance: clasificación de toda acción/sugerencia que entre al Cockpit. · SI SE VIOLA/FALLA (acción mal clasificada) → degrade-a-humano + se sugiere el área dueña (Strategy/Soporte/…); no se ejecuta como NBA. *(de tu [V] iter.3 sobre financiero)*

### B. Edge Cases (pre-mortem)

**EC-1 | datos/cohort | [V]** — Cohort con `n<20` al intentar liberar lote. · Detección: conteo de la celda contra `n_min`. · Comportamiento: fail-closed → no auto-libera; revisión individual humana. · Regla(s): BR-10, BR-5. · SI LA DETECCIÓN FALLA → guardrail de error (P11) detecta varianza anómala post-hoc y revierte (reversible por BR-5) + alerta.

**EC-2 | reversibilidad | [V]** — Acción irreversible marcada "bajo riesgo" por error de clasificación. · Detección: check de reversibilidad/idempotencia + lock (AUT-04) ANTES de ejecutar, independiente de la etiqueta. · Comportamiento: fail-closed → se excluye del lote, degrade-a-humano. · Regla(s): BR-5, BR-6. · SI LA DETECCIÓN FALLA → contención por BR-9 (traza identifica alcance) + alerta alta + se corrige la base-de-políticas (de donde nace la clasificación).

**EC-3 | política | [V]** — Base-de-políticas ausente/ilegible/`policy_version` no resoluble al liberar. · Detección: resolución de `policy_version` vigente antes de validar. · Comportamiento: fail-closed → todo el lote queda pausado. · Regla(s): BR-6, BR-9. · SI LA DETECCIÓN FALLA (valida contra política stale) → firma+versión en traza permiten auditoría retroactiva + alerta al owner para re-validar.

**EC-4 | móvil/prisa/dinero | [V]** — Operador apresurado en celular intenta liberar una acción que mueve saldo. · Detección: `clase_financiera=directa` evaluado idéntico en móvil (BR-8) + ceiling=ALTO (BR-2). · Comportamiento: fail-closed → permanece "propuesta"; el móvil no ofrece atajo de ejecución de dinero. · Regla(s): BR-2, BR-8. · SI LA DETECCIÓN FALLA → bloqueo-rojo en backend (ejecución de dinero cortada en servidor, no solo UI) + traza `origen=móvil`.

**EC-5 | granularidad | [V]** — Subgrupo vacío (drill a un subgrupo sin cuentas/acciones). · Detección: conteo del subgrupo al hacer drill. · Comportamiento: fail-closed suave → "subgrupo vacío", sin acción de lote. · Regla(s): BR-4, BR-5. · SI LA DETECCIÓN FALLA (set vacío = "todo") → BR-4 impide ejecutar filas inexistentes; reconciliación post-acción marca 0 ejecuciones + log.

**EC-6 | conflicto del min() | [V]** — `pedido_NBA` > `liberado_evals` (la IA pide más de lo que Evals liberaron). · Detección: comparación de brazos en el min(). · Comportamiento: gana SIEMPRE el menor → ejecuta hasta `liberado_evals`, el resto degrade-a-humano; el par `(pedido, liberado)` se exhibe (señal para EPIC-3, no para override-al-alza). · Regla(s): BR-4, BR-1. · SI LA DETECCIÓN FALLA → BR-1 (override solo BAJA) es el segundo cerrojo.

**EC-7 | concurrencia/lock | [I]** — Dos operadores (o desktop+móvil) liberan el mismo lote a la vez. · Detección: lock por cohort/subgrupo (AUT-04). · Comportamiento: fail-closed → segunda escritura sin lock se rechaza; gana la primera traza firmada. · Regla(s): BR-5, BR-9. · SI LA DETECCIÓN FALLA → traza duplicada se detecta en reconciliación; revertir la redundante (reversible por BR-5). [I] mecánica fina de lock a decidir.

**EC-8 | ROI fantasma | [V/C]** — Una acción liberada "tuvo impacto" pero la señal no es atribuible (coincidió con promo externa, estacionalidad). · Detección: **« iter.3 »** `metodo_atribucion` exige holdout/control o pre-post, no correlación temporal; `signal_de_resultado` ligada causalmente. · Comportamiento: el valor NO se acredita hasta confirmación atribuible (cuenta 0). · Regla(s): BR-7. · SI LA DETECCIÓN FALLA → revisión periódica de Salud 1:10 (P11) con set de control detecta el sesgo. (Cifras = [C].)

**« iter.3 » EC-9 | horizonte | [V]** — NBA con efecto **inmediato+ pero largo−** (ej. promo que sube pedidos hoy y baja margen/recurrencia luego). · Detección: medir el MISMO efecto en dos ventanas (inmediato + largo, escritas en la spec de la NBA). · Comportamiento: rama "inmediato+ / largo− → **revisar la NBA**"; no acreditar valor neto hasta cerrar el horizonte largo. · Regla(s): BR-7, BR-4. · SI LA DETECCIÓN FALLA (solo se mide inmediato) → el guardrail de error/reapertura a largo plazo (P11) lo captura tarde; mitiga: ventana larga obligatoria en `roi_operador`. *(de tu [V] sobre horizonte)*

**« iter.3 » EC-10 | supresión multi-etapa | [V]** — Pausar una NBA multi-etapa con etapas YA ejecutadas y crédito parcial contado. · Detección: `[DECISIÓN] ¿la NBA pausada tenía etapas en vuelo / crédito parcial?`. · Comportamiento: rollback/cierre de las etapas pendientes + el crédito ya contado se marca **provisional** hasta reconciliar (ni se pierde ni se infla). · Regla(s): BR-5, BR-7. · SI LA DETECCIÓN FALLA → reconciliación de `decision_trace` detecta crédito huérfano + se ajusta el ROI. *(de tu [V] "no one-and-done" + critic)*

### C. Matriz de fallo (ordenada por amenaza-North-Star desc)

| Regla/Edge | Modo de fallo | Detección | Respuesta | Amenaza al North Star |
|---|---|---|---|---|
| BR-7 / EC-8 / EC-9 | ROI cuenta valor no atribuible, correlacional o solo de horizonte corto | `metodo_atribucion` + `signal_de_resultado` + doble horizonte | No se acredita (0) hasta confirmar; revisión 1:10 con control | **MÁXIMA** — corrompe el numerador y el aprendizaje |
| BR-9 / BR-11 / EC-2 | Rubber-stamp de lote / confirmación no independiente | Traza-con-firma + `confirmador_id≠proponente_id` + tasa-rechazo | Fail-closed sin traza; "auto-confirmada [C]" si no hay tercero | **MUY ALTA** — sube error y des-legitima la autonomía |
| BR-1 / EC-6 | Override sube autonomía por encima de Evals | min() + segundo cerrojo "solo a la BAJA" | Bloqueo-rojo del intento al alza | **MUY ALTA** — rompe la única palanca legítima de crecer |
| BR-6 / EC-3 | "Bajo riesgo" desalineado de la evidencia (política stale/ausente) | Resolución de `policy_version` antes de validar | Fail-closed; degrade-a-humano; alerta owner | ALTA — el freno opera con un mapa viejo |
| BR-2 / EC-4 | Dinero (saldo) ejecutado autónomo (sobre todo móvil) | `clase_financiera=directa` idéntico móvil/desktop; corte backend | Fail-closed: "propuesta"; bloqueo-rojo servidor | ALTA — daño irreversible y des-atribuible |
| BR-3 / BR-12 | Fuga competitiva: insight identifica la campaña de 1 restaurante | Límite de tenant + k-anonymity (`N>=k`) pre-exhibición | Bloqueo-rojo del lote / supresión del insight | ALTA — daño de aislamiento no graduable |
| BR-5 / EC-1 / EC-10 | Lote sobre acción irreversible, n<20, o supresión multi-etapa | Check reversibilidad+lock; `n_min>=20`; check etapas-en-vuelo | Fail-closed/degrade; excluir del lote; rollback+crédito provisional | ALTA — blast-radius sin rollback |
| BR-13 | Palanca estratégica/de-área tratada como NBA operacional | Clasificación de la acción al entrar | Degrade-a-humano + ruteo a Strategy/Soporte | MEDIA-ALTA — ruido en el min() y frontera difusa |
| BR-4 / EC-5 | Brazo del min() oculto/null; subgrupo vacío = "todo" | Render del par + cómputo por fila; conteo de subgrupo | Fail-closed al menor brazo; "no liberable"/"subgrupo vacío" | MEDIA — reintroduce soltar-de-más localizado |
| BR-8 / EC-4 | Guardrail relajado en móvil por UX | Invariantes idénticos en móvil + corte backend | Mismo fail-closed/bloqueo-rojo; traza `origen=móvil` | MEDIA-ALTA — la prisa es el vector que más tienta |
| BR-10 | Percentil sobre n insuficiente usado como evidencia | `n_min>=20` por celda | Degrade-a-humano; "n insuficiente" | MEDIA — evidencia falsa disfrazada |
| EC-7 | Doble liberación concurrente del mismo lote | Lock por cohort/subgrupo (AUT-04) | Fail-closed; gana primera traza; reconciliación revierte | MEDIA — riesgo de doble efecto [I] |

## OUTPUT 3 — WORKFLOW

**SÍNTESIS:** Este workflow existe para hacer OPERABLE el `min()` desde la única acción que Leo validó (EPIC-1 = pausar/liberar): la IA propone NBAs por cohort, el sistema calcula `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)` y clasifica "bajo riesgo" CONTRA una base-de-políticas versionada (no regla chumbada), el agent-manager LIBERA o PAUSA en lote por cohort (con drill a subgrupo), y CADA acto escribe `decision_trace` firmado y mide ROI bajo guardrail de error. El "y qué": el flujo convierte el filo de la navaja (soltar de más = riesgo / sostener de más = mata el 1:10) en pasos deterministas donde el humano solo BAJA, el dinero nunca ejecuta y el grounding faltante degrada-a-humano. [V] (validado iter. 1-2; EPIC-2/3 = solo alcance, `[I]`)
> **« iter.3 » Nota de numeración:** las referencias `[REGLA BR-x]` de los nodos se alinearon al índice único de OUTPUT 2 (firma=BR-9, prisa/móvil=BR-8, override-solo-BAJA=BR-1, k-anonymity=BR-12).

### Contrato: Entrada · Salida · Actores · Frontera IA/HUMANO
- **Entrada:** un cohort (regla versionada de P01) + el catálogo de NBAs propuestas (A1-A8 + no-act, de P02), cada una con `pedido_NBA`, causa-raíz y before/after; `liberado_evals` (P06) y `teto_tier` (P10) vigentes; `policy_version` activa. [V]
- **Salida:** decisión liberar/pausar por lote (cohort y/o subgrupo) ejecutada solo hasta `nivel_efectivo`; `decision_trace` firmado; señal de ROI (eficiencia × impacto atribuible) y lectura del guardrail de error. [V]; cifras = [C]
- **Actores:** IA (propone, calcula `min()`, clasifica riesgo, ejecuta gobernado, degrada-a-humano); agent-manager (LIBERA/PAUSA, override solo a la BAJA, firma); **« iter.3 »** confirmador independiente (`≠ proponente`, BR-11); base-de-políticas (valida lo permitido-hoy); Cerebro/P07 (grounding + traza). [V]
- **Frontera IA/HUMANO:** la IA NUNCA sube autonomía (solo Evals, EPIC-3); el humano NUNCA sube por encima de `liberado_evals` (AUT-11) — solo BAJA; el dinero (saldo) NUNCA lo ejecuta ninguno (ceiling=ALTO, AUT-06); cross-tenant = bloqueo duro; la prisa nunca eleva tier (AUT-05). [V]

### ANTES (triggers + precondiciones)
- **[TRIGGER]** P02 emite un lote de NBAs nuevas/actualizadas para un cohort (caída de pedidos, ventana horaria, oportunidad cross-sell). [V]
- **[TRIGGER]** El agent-manager abre el Cockpit sobre un cohort. [V]
- **[GROUNDING]** Cerebro/P07: regla de cohort (P01), `liberado_evals` (P06), `teto_tier` (P10), `policy_version`, evidencia de cada NBA. [V]
- **[FAIL-CLOSED]** Si falta cualquier grounding (sin `liberado_evals`, `policy_version` no resoluble, evidencia ausente, `n_min<20`) → NBA NO auto-liberable → **degrade-a-humano**. [V]

### DURANTE (sub-procesos nombrados)

**(1A) IA propone NBAs por cohort**
[INICIO] → [ACTOR:IA] → [DATA-IN] regla de cohort (P01) + señales de cuentas + catálogo A1-A8+no-act → [CÓMPUTO] agrupa cuentas, selecciona NBA por causa-raíz, adjunta `pedido_NBA` y before/after → [DATA-OUT] lista de NBAs propuestas (acciones COMUNES del cohort, nivel 1) → [DECISIÓN] ¿hay NBA candidata además de no-act? → [SÍ] 1B / [NO] registra contrafactual no-act y termina → [REGLA] catálogo cerrado: la IA solo instancia, NUNCA inventa NBAs; **« iter.3 » [REGLA BR-13]** si la palanca real es estratégica/de-área (nuevo mercado / reducción de tickets) → enruta a Strategy/Soporte, no es NBA del Cockpit → [FAIL-CLOSED] sin causa-raíz con evidencia → needs-grounding, degrade-a-humano // Riesgo: proponer acción sin raíz auditable. [V]

**(1B) Cálculo de `min()` + clasificación bajo-riesgo contra base-de-políticas**
[INICIO] → [ACTOR:IA] → [DATA-IN] `pedido_NBA` (1A) + `liberado_evals` (P06) + `teto_tier` (P10) + `policy_version` + `risk_class` + **« iter.3 »** `clase_financiera` → [CÓMPUTO] `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)`; VALIDA contra base-de-políticas (¿permitido-hoy? ¿cómo-se-mide? ¿reversible/idempotente bajo lock?); detecta dinero (saldo) y cross-tenant → [DATA-OUT] cada NBA con par (pedido, liberado), `nivel_efectivo`, auto-liberable=sí/no, motivo → [DECISIÓN] ¿`nivel_efectivo` BAJO **Y** reversible/idempotente **Y** no-dinero **Y** no-cross-tenant **Y** validada-política? → [SÍ] candidata a auto-liberar / [NO] solo-propuesta o bloqueo → [AUTONOMÍA] par (pedido, liberado) SIEMPRE exhibido → **[REGLA BR-2]** dinero(saldo) → ceiling=ALTO; **[REGLA BR-3]** cross-tenant → bloqueo-rojo; **« iter.3 » [REGLA BR-12]** si el insight identificaría la campaña de 1 restaurante (`N<k`) → suprimir → [FAIL-CLOSED] política no resoluble o `n_min<20` → degrade-a-humano // Riesgo: clasificar bajo-riesgo algo que la política no respalda. [V]

**(1C) Agent-manager libera/pausa en LOTE por cohort**
[INICIO] → [ACTOR:HUMANO] → [DATA-IN] lista 1B con par (pedido, liberado), `min()`, auto-liberable, before/after → [CÓMPUTO] revisa el lote de acciones COMUNES; decide LIBERAR (ejecutar hasta `nivel_efectivo`) o PAUSAR (sostener) → [DATA-OUT] `liberacion_lote` con nivel resultante + operador → [DECISIÓN] ¿libera el lote? → [SÍ] ejecución gobernada + 1E / [NO] pausa → cola de juicio → **« iter.3 » [DECISIÓN]** ¿la NBA que pauso tenía etapas en vuelo / crédito parcial? → [SÍ] rollback/cierre de etapas pendientes + crédito ya contado = **provisional** hasta reconciliar (EC-10) / [NO] sigue → [AUTONOMÍA] **[REGLA BR-1]** el override SOLO BAJA (AUT-11), nunca sube sobre `liberado_evals` → **[REGLA BR-9]** firma humana obligatoria (anti-rubber-stamp); **[REGLA BR-8]** la prisa NO eleva tier (AUT-05) → [FAIL-CLOSED] firma ausente o intento de subir nivel → rechazado, queda pausado // Riesgo: liberar en lote sin mirar el subgrupo de cola larga. [V]

**(1D) Drill a subgrupo para acción super-específica**
[INICIO] → [ACTOR:HUMANO] → [DATA-IN] cohort revisado + subgrupos (nivel 2) → [CÓMPUTO] desciende a un subgrupo SIN salir del cohort; revisa NBAs super-específicas con su propio par (pedido, liberado) y `min()` → [DATA-OUT] decisión liberar/pausar a nivel subgrupo → [DECISIÓN] ¿la acción específica difiere del lote-cohort? → [SÍ] decide aparte / [NO] hereda del cohort → [AUTONOMÍA] mismo `min()` y mismos invariantes que 1C → [REGLA] máximo 2 niveles (cohort → subgrupo), no anidamiento infinito; **« iter.3 » [REGLA BR-12]** subgrupo con `N<k` (insight identifica a 1 restaurante) → suprimir el insight (fail-closed) → [FAIL-CLOSED] subgrupo sin `liberado_evals`/política propia → degrade-a-humano // Riesgo: recorrido clic-a-clic lote→drill (móvil paridad total) **[I] needs-prototype** — no fabricar GWT. [V/I]

**(1E) Registro en `decision_trace` + medición ROI / guardrail / confirmación independiente**
[INICIO] → [ACTOR:IA+HUMANO] → [DATA-IN] decisión 1C/1D + ejecución gobernada + `signal_de_resultado` + `costo_ia_por_decision` → [CÓMPUTO] escribe `decision_trace` firmado en P07; calcula `roi_operador` = (tiempo economizado × impacto = 1:10) + (impacto de negocio atribuible vía `contrato_activacion` + `signal_de_resultado`); lee guardrail (error/reapertura/reversión) → [DATA-OUT] traza auditable + ROI + guardrail → **« iter.3 » [DECISIÓN]** ¿`metodo_atribucion` = holdout/control o pre-post? → [NO=funnel-correlacional] el valor NO se declara "confirmado y atribuible" (señal débil; apertura/log = NUNCA confirmación) → **« iter.3 » [DECISIÓN]** ¿efecto medido en los DOS horizontes (inmediato + largo)? → [NO] ROI parcial/no-confirmado; si inmediato+ pero largo− → revisar la NBA (EC-9) → **« iter.3 » [DECISIÓN]** ¿`confirmador_id ≠ proponente_id`? → [NO] marcar "auto-confirmada — independencia NO garantizada [C]" (BR-11) → [DECISIÓN] ¿guardrail de error sube? → [SÍ] alerta → rebaja automática del candidato (rebajar = automático) / [NO] mantiene → **[REGLA BR-7]** impacto = valor REAL, atribuible y confirmado, NUNCA "acción ejecutada" → [FAIL-CLOSED] sin `signal_de_resultado` atribuible → ROI no-confirmado, no cuenta para North Star // Riesgo: contar "acción ejecutada"/correlación/horizonte-corto como valor (vanity). [V]; cifras = [C]

### Flujo (ASCII)
```
        [TRIGGER] P02 emite NBAs por cohort / agent-manager abre Cockpit
                                  |
                          [GROUNDING] Cerebro/P07 (cohort·liberado·teto·policy_version)
                                  |
                   falta grounding? --SÍ--> [FAIL-CLOSED] degrade-a-humano
                                  | NO
                                  v
   (1A) IA PROPONE NBAs  --palanca estratégica/área?--> [BR-13] Strategy/Soporte (no NBA)
        --no hay candidata--> registra no-act --> FIN
                                  |
                                  v
   (1B) min() = min(pedido, liberado, teto) · VALIDA política · detecta dinero/cross-tenant
            +-- dinero(saldo)? --SÍ--> [BR-2] ceiling=ALTO: IA solo PROPONE
            +-- cross-tenant / N<k? --SÍ--> [BR-3/BR-12] BLOQUEO-ROJO / suprimir insight
                                  |
        auto-liberable = (BAJO Y reversible/idempotente Y no-dinero Y no-cross-tenant Y validada-política)
                                  v
   (1C) AGENT-MANAGER libera/pausa en LOTE  [HUMANO·firma BR-9]  override SOLO BAJA (BR-1)·prisa no eleva (BR-8)
        LIBERAR ----+                 PAUSAR --> ¿etapas en vuelo? --SÍ--> rollback + crédito provisional (EC-10)
                    v
   (1D) ¿drill a SUBGRUPO? (2 niveles) · mismo min() · N<k -> suprimir (BR-12) · [I] needs-prototype (móvil)
                    v
   EJECUCIÓN GOBERNADA (solo hasta nivel_efectivo · degrade-to-human el resto)
                    v
   (1E) decision_trace FIRMADO -> P07
        metodo_atribucion ∈ {holdout|pre-post|funnel-correlacional}  (funnel = señal débil, no confirma)
        doble horizonte (inmediato+largo) · confirmador ≠ proponente (BR-11)
        guardrail error sube? --SÍ--> rebaja AUTOMÁTICA
                    v
                [DESPUÉS]
```

### DESPUÉS
- **[DATA-OUT]** Escribe `decision_trace` firmado y `liberacion_lote` en P07; persiste ejecución hasta `nivel_efectivo`, el resto degrade-to-human. [V]
- **Alimenta a:** **P02** (gobierna la ejecución de las NBAs) · **North Star/P11** (`roi_operador` + guardrail anti-rubber-stamp + tasa-rechazo-confirmador) · **P06 Evals** (guardrail + señales retroalimentan la calibración que, vía EPIC-3, podría subir `liberado_evals`) · **base-de-políticas** (de trazas+resultados NACEN políticas) · **« iter.3 » Strategy/Soporte** (palancas no-operacionales ruteadas, BR-13). [V/I]

### MAPA DE SISTEMAS Y FLUJO DE DATOS
- **[SISTEMA 1] Cockpit de Gobernanza (esta pantalla)** · función: exhibir par (pedido, liberado) + `min()`, listar NBAs por cohort, liberar/pausar en lote + drill, firmar · datos: NBAs, `nivel_efectivo`, `liberacion_lote`, `decision_trace` · acceso: agent-manager (RW solo-BAJA), IA (propone/ejecuta gobernado) · grounding: P07 // Problema: sin él el `min()` no tiene tablero humano → Alimenta a: P02, P11, base-de-políticas. [V]
- **[SISTEMA 2] P02 NBA/Playbooks** · proponer acciones (A1-A8+no-act) y `pedido_NBA` · catálogo cerrado, causa-raíz, before/after · IA (RW propuesta), Cockpit (R) // Problema: acción sin raíz auditable → Alimenta a: Cockpit (1A). [V]
- **[SISTEMA 3] P06 Evals** · proveer `liberado_evals` por celda cohort×intent (única vía de SUBIR autonomía) · `golden_set`, `n_min>=20`, red-team · Cockpit (R; promoción = EPIC-3) // Problema: subir autonomía sin evidencia → Alimenta a: Cockpit (1B), retroalimentado por guardrail (1E). [V/I]
- **[SISTEMA 4] P10 Política & Tier** · proveer `teto_tier` y segmentación · `tier_base`, regla de teto · Cockpit (R; mover teto = EPIC-2) // Problema: cambio estructural sin hipótesis → Alimenta a: Cockpit (1B). [V/I]
- **[SISTEMA 5] P01 Cohorts** · regla de cohort versionada + unidad de lote/subgrupo · `Cohort`, `percentil_en_cohort`, `gap_to_top` · Cockpit (R) // Problema: agrupar sin regla versionada → Alimenta a: Cockpit (1A/1D). [V]
- **[SISTEMA 6] base-de-políticas (.md versionada)** · qué-permitido-hoy + resultado-medido + cómo-se-mide; validar y hacer NACER políticas · `policy_version`, criterios de riesgo · Cockpit (R validar, append nacer-política con firma) // Problema: "bajo riesgo" chumbado en vez de versionado → Alimenta a: Cockpit (1B), retroalimentada por 1E. [V]; schema fino = [I]
- **[SISTEMA 7] Cerebro/P07** · grounding + repositorio de `decision_trace` · trazas, señales, evidencia · todos (R), Cockpit (W traza) // Problema: decisiones sin auditoría/grounding → Alimenta a: P11, P06, base-de-políticas. [V]
- **« iter.3 » [SISTEMA 8] Strategy / Soporte (destinos de ruteo)** · receptores de palancas no-operacionales (nuevo mercado/penetración → Strategy; reducción de tickets → Soporte) · datos: sugerencia ruteada + motivo · Cockpit (W ruteo, BR-13) // Problema: si no existe el ruteo, palancas estratégicas/de-área contaminan el catálogo operacional. [V]

### PUNTOS DE DOLOR / RIESGOS (rankeados)
1. **Rubber-stamp humano (liberar en lote sin juicio real).** Mitiga: firma obligatoria (BR-9) + **« iter.3 »** confirmación independiente `confirmador≠proponente` + tasa-de-rechazo (BR-11); `decision_trace` auditable; guardrail (1E). [V] — riesgo más alto.
2. **Contar valor no atribuible / correlacional / de horizonte corto (vanity ROI).** Mitiga: **« iter.3 »** `metodo_atribucion` (bloquea funnel-correlacional) + doble horizonte (EC-9) + BR-7. [V/C]
3. **Clasificar "bajo riesgo" sin respaldo de política.** Mitiga: validación contra base-de-políticas versionada (1B/BR-6); fail-closed si `policy_version` no resoluble. [V]
4. **Dinero(saldo) o cross-tenant colándose por el lote; fuga de campaña de 1 restaurante.** Mitiga: BR-2 (ceiling=ALTO) + BR-3 (bloqueo-rojo) + **« iter.3 »** BR-12 (k-anonymity) antes de marcar auto-liberable. [V]
5. **Override que sube autonomía por error/prisa.** Mitiga: override solo a la BAJA (BR-1, AUT-11); prisa no eleva (BR-8, AUT-05); rechazo fail-closed. [V]
6. **« iter.3 » Supresión de NBA multi-etapa en vuelo deja crédito huérfano/inflado.** Mitiga: EC-10 (rollback + crédito provisional + reconciliación). [V]
7. **Recorrido lote→drill no cristaliza (móvil paridad total; la prisa fura regla).** Mitiga: **[I] needs-prototype**; invariantes idénticos en móvil. [I]
8. **`n_min<20`.** Mitiga: fail-closed, degrade-a-humano. [V]

### MODELO DE VARIABLES
**NBA_propuesta**
- nba_id : uuid · PK [V]
- cohort_id : uuid · FK→Cohort [V]
- subgrupo_id : uuid? · FK→Subgrupo (null en nivel 1) [V]
- tipo_accion : enum(A1..A8, no-act) · FK lógica→catálogo P02 [V]
- causa_raiz : text · evidencia ancla en Cerebro [V]
- pedido_NBA : enum(BAJA, MEDIA, ALTA) [V]
- before_after_esperado : json [V/C]
- clase_financiera : enum(directa, indirecta, ninguna) · **« iter.3 »** directa=mueve saldo → BR-2 [V]
- clase_palanca : enum(operacional, estrategica, area) · **« iter.3 »** ≠operacional → ruteo BR-13 [V]
- destino_ruteo : enum(NBA, Strategy, Soporte, descartar) · **« iter.3 »** [V]

**min_calculo** (computado)
- nba_id : uuid · FK→NBA_propuesta [V]
- liberado_evals : enum(BAJA,MEDIA,ALTA) · FK→Evals(P06) [V]
- teto_tier : enum(BAJA,MEDIA,ALTA) · FK→Política(P10) [V]
- nivel_efectivo : enum · = min(pedido_NBA, liberado_evals, teto_tier) [V]
- auto_liberable : bool · BAJO ∧ reversible/idempotente ∧ no-dinero ∧ no-cross-tenant ∧ validada-política ∧ N>=k [V]
- n_cohort : int · fail-closed si <20 (BR-10) [V]

**base_de_politicas** (.md versionada)
- policy_id : uuid · PK [V] · policy_version : semver [V] · permitido_hoy : json [V] · resultado_medido : text [V] · como_se_mide : text [V] · nacida_de_trace : uuid? FK→decision_trace [I] · firma_humana : uuid? FK→operador [I] · _schema fino_ : [I]

**roi_operador** (métrica-madre)
- roi_id : uuid · PK [V]
- liberacion_id : uuid · FK→liberacion_lote [V]
- tiempo_economizado : num · [C]
- impacto_negocio_atribuible : num · recurrencia/ventas/cross-sell vía signal_de_resultado [V]; valor [C]
- ratio_1_10 : num · eficiencia × impacto [C]
- guardrail_error : num · error/reapertura/reversión (no puede subir) [V]; valor [C]
- metodo_atribucion : enum(holdout/control, pre-post, funnel-correlacional) · **« iter.3 »** funnel ⇒ no-confirmable [V]
- horizonte_medido : enum(inmediato, largo, ambos) · **« iter.3 »** EC-9 [V]
- es_atribuible : bool · si false → no cuenta para North Star (BR-7) [V]
- confirmador_id : uuid? · FK→operador · **« iter.3 »** ≠ proponente_id (BR-11); null ⇒ "auto-confirmada [C]" [V]

**liberacion_lote** (override liberar/pausar)
- liberacion_id : uuid · PK [V] · cohort_id : uuid FK [V] · subgrupo_id : uuid? FK [V] · accion : enum(LIBERAR, PAUSAR) [V] · nivel_resultante : enum · ≤ nivel_efectivo (BR-1) [V] · proponente_id : uuid · FK→operador [V] · operador_id : uuid · FK · firma (BR-9) [V] · policy_version_validada : semver · FK→base_de_politicas [V] · etapas_en_vuelo_resueltas : bool · **« iter.3 »** EC-10 [V] · decision_trace_id : uuid · FK [V] · _estado/schema fino_ : [I]

**decision_trace**
- trace_id : uuid · PK [V] · liberacion_id : uuid FK [V] · operador_id : uuid FK · firma [V] · timestamp : datetime [V] · nivel_efectivo_aplicado : enum [V] · escrito_en : Cerebro/P07 [V]

**Relaciones:** Cohort 1—N NBA_propuesta · NBA_propuesta 1—1 min_calculo · liberacion_lote 1—N NBA_propuesta · liberacion_lote 1—1 decision_trace · liberacion_lote 1—1 roi_operador · base_de_politicas 1—N liberacion_lote (policy_version validada).

### Gobernanza / anchor-check
- **min():** `nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)` (1B), par exhibido en TODA fila; override solo BAJA (BR-1/AUT-11). ✔ [V]
- **Hard-nos:** dinero(saldo) nunca autónomo (BR-2/AUT-06) ✔; cross-tenant = bloqueo-rojo + **« iter.3 »** k-anonymity por re-identificación de campaña (BR-3/BR-12) ✔; prisa nunca eleva tier (BR-8/AUT-05) ✔. [V]
- **« iter.3 » Anti-vanity:** `metodo_atribucion` (no funnel-correlacional) + doble horizonte (EC-9) + confirmación independiente (BR-11). ✔ [V]
- **n_min:** `n_min>=20` (BR-10); `N>=k` (BR-12). ✔ [V]
- **Versionamiento:** `policy_version` (base-de-políticas); regla de cohort versionada (P01). ✔ [V]
- **Variables [C] (placeholder):** `tiempo_economizado`, `impacto_negocio_atribuible`, `ratio_1_10`, `guardrail_error`, `before_after_esperado`. [C]
- **EPIC-2 / EPIC-3:** solo ALCANCE — `[I]`, no se fabrican GWT. **Recorrido móvil:** `[I] needs-prototype`. [I]

## MEJORAS INCORPORADAS (iter. 4 — folradas a OUTPUT 1/2/3)
> Tres mejoras validadas con Leo, integradas: (B) estimacion de impacto vs KPI por accion; (C) matriz de decision riesgo x impacto (que acciones hacer o no); (D) credenciales/autoridad + logs + cruce con politicas. Reglas con prefijo (BR-HON/BR-M3/BR-CRED/BR-LOG/BR-XCHK) para NO colisionar con BR-1..11. US nuevas: US-1.1.1-a..d, US-C-cuadrante, US-D-credencial. Entidades nuevas: CREDENCIAL, ROL_PERMISO, CREDENCIAL_AUDIT; accion += impacto_estimado/impacto_realizado; artefacto nuevo base_de_credenciales.md (hermano de base_de_politicas.md).

### MEJORA B — Estimación de impacto vs KPI (por acción)

> **Provenance:** la estimativa nace **[C]** (placeholder de escenario); migra a **[V]** solo con dato real (telemetría/histórico) o confirmación de Leo. Confianza sube por **regla de n**, no por opinión.

### Objeto `estimativa_impacto` (cuelga de cada `accion`; es predicción, nunca resultado)

```
estimativa_impacto = {
  kpi:            enum { conexion | tickets | recurrencia | cross_sell }   // [V] KPIs del dominio (config)
  delta_esperado: { signo: +|-, valor: num, unidad: pp|% }                 // ej {+,10,pp} | {-,25,%}
  confianza:      enum { alta | media | baja }                            // [C] hasta tener n suficiente
  base_de_calculo: {
     baseline_cohort:   { valor_actual_kpi, n_cohort, ventana }           // [V] cuando hay telemetría
     historico_similar: { n_acciones_previas, delta_mediano_realizado }   // [C] hasta tener historial
     metodo: enum { historico | heuristica_politica | sin_base }          // gobierna la confianza
  }
}
```

Reglas del objeto: `confianza=baja` + `metodo=sin_base` son el **default** de arranque (sin dato → honesto); `delta_esperado` se renderiza SIEMPRE con su `kpi` (nunca delta huérfano); **no entra en `min()`** — informa la decisión, no eleva tier (AUT-05). `[I]` salvo `kpi`/`baseline` marcados `[V]`.

### De dónde sale el número (y por qué nace [C])

1. **Baseline del cohort** `[V cuando hay telemetría]`: valor actual del KPI (ej. conexión 62%, tickets/100 pedidos = 8).
2. **Histórico de acciones similares** `[C placeholder]`: delta mediano *realizado* de acciones del mismo tipo ya liberadas con `signal_de_resultado`.

Nace **[C]** porque en arranque `n_acciones_previas=0` → no hay distribución → el delta es heurística de política, no evidencia. Migra **[C]→[V]** solo al acumular histórico atribuible.

**BR-IMP-CONF** (umbral de confianza — ejemplo, **falta confirmación de Leo del n mínimo**):
```
n_acciones_previas con signal: 0    → confianza=baja, metodo=heuristica_politica, etiqueta "estimado (sin histórico)"
                                1–9  → confianza=media
                                ≥10  → confianza=alta
```

### Cierre del lazo ROI: estimado vs REALIZADO (dos casilleros separados, nunca el mismo campo)

```
accion.impacto_estimado  = estimativa_impacto                              // predicción, antes de liberar
accion.impacto_realizado = { delta_medido, valor_atribuible{recurrencia|ventas|cross_sell}, signal_de_resultado:bool }
```

**`signal_de_resultado` es el gate duro:** `false` → `impacto_realizado=0`, **no cuenta** (ni ROI, ni histórico, ni sube confianza); `true` → `delta_medido` alimenta `historico_similar` de futuras estimativas (cierra el ciclo). El **guardrail** se chequea aquí: si error/reapertura/reversión de las liberadas sube, el lazo lo marca aunque el delta_KPI sea positivo (impacto neto no esconde daño).

### Cómo aparece en la fila

```
[Cohort: recurrencia caída] Reactivar inactivos 14d
  pedido NBA: MEDIO · liberado evals: BAJO · teto tier: MEDIO → min()=BAJO
  Impacto esperado: +8pp recurrencia · confianza BAJA · estimado (sin histórico) [C]
  Before/after: recurrencia 31% → (esperado) 39%
```

Texto fijo: **"Impacto esperado: {±X}{unidad} {kpi} · confianza {nivel}"**. Tras liberar, la MISMA fila gana **"Impacto realizado: …"** solo si `signal_de_resultado=true`; si no → **"Sin señal aún — no computa"**. Nunca se pisa el estimado con el realizado.

### BRs de honestidad (blindan Mejora B)

- **BR-HON-1** (no promoción): `impacto_estimado` NUNCA se copia a `impacto_realizado`; campos distintos. `[I]`
- **BR-HON-2** (gate de señal): sin `signal_de_resultado=true` → `impacto_realizado=0`, ROI no lo cuenta. `[I]`
- **BR-HON-3** (provenance): estimativa nace `[C]`; pasa a `[V]` solo con dato real o Leo; confianza sube por regla de n. `[I]`
- **BR-HON-4** (no toca el motor): no entra en `min()`, no eleva tier (AUT-05), no relaja override-solo-baja (AUT-11), no aplica a dinero que ejecuta (AUT-06) ni cross-tenant. `[V]` (invariantes)
- **BR-HON-5** (guardrail sobre el KPI): delta_KPI positivo no compensa subida de error/reapertura/reversión; el lazo reporta ambos, manda el guardrail. `[I]`

---

### MEJORA C — Matriz Riesgo × Impacto (qué acciones hacer o no)

> **Provenance:** la matriz es **capa de decisión** sobre el motor; no inventa permisos, los lee (`min()` + `risk_class` + `estimativa_impacto`, con `base_de_politicas` como fuente de verdad). Umbrales numéricos = `[I]` (chute de anclaje — **faltan los números reales de la política**).

### Eje RIESGO — reusa `risk_class` (peor caso domina; un solo factor ALTO manda) `[V]`

| Factor | BAJO | MEDIO | ALTO |
|---|---|---|---|
| `nivel_efectivo` = min(pedido, evals, teto) | BAJO | MEDIO | ALTO |
| Reversibilidad | reversible + idempotente bajo lock | reversible sin lock / parcial | irreversible |
| Dinero (AUT-06) | sin dinero | — | toca dinero → **siempre ALTO**, ceiling ALTO |
| Cross-tenant | mismo tenant | — | cruza tenant → **bloqueo**, fuera de matriz |

Regla: dinero y cross-tenant **no promedian** — saltan a ALTO/bloqueo (impacto alto no disfraza riesgo; AUT-05). `[V]`

### Eje IMPACTO — de `estimativa_impacto` vs KPI (Mejora B)

| Nivel | Criterio (umbral por KPI, versionado en política) |
|---|---|
| alto | mueve KPI-madre fuerte: ej. +≥8pp conexión, −≥20% tickets, +≥X% recompra/cross-sell |
| medio | mueve KPI moderado o KPI secundario |
| bajo | efecto marginal / no medible con confianza |

Si `estimativa_impacto` falta o tiene baja confianza → **impacto = desconocido** (NO "bajo"); va a EC, no se descarta en silencio. `[I]`

### Los 9 cuadrantes → acción recomendada

| | Impacto ALTO | Impacto MEDIO | Impacto BAJO |
|---|---|---|---|
| **Riesgo BAJO** | **Auto-liberar en lote** (cumple AUT-04) — prioridad 1 | Liberar en lote | **Descartar / no-act** (ruido) |
| **Riesgo MEDIO** | Revisar → liberar en lote **con confirmación** | Lote con confirmación | Descartar / backlog |
| **Riesgo ALTO** | **Escalar a humano** (nunca auto) — incluye TODO dinero | Escalar a humano | **No-act** (no vale el riesgo) |

Reglas duras embebidas: fila ALTO = sin auto nunca; columna BAJO = no consume atención del operador; dinero siempre cae en fila ALTO. `[V]`

### BRs que formalizan la matriz

- **BR-M3-01** `risk_class` = peor caso entre min(), reversibilidad, dinero, cross-tenant. Dinero⇒ALTO; cross-tenant⇒bloqueo. `[V]`
- **BR-M3-02** Solo `risk_class=BAJO ∧ impacto=alto` es elegible a **auto-liberación en lote**; requiere además idempotente+reversible bajo lock (AUT-04). `[V]`
- **BR-M3-03** `risk_class=MEDIO` ⇒ lote **solo con confirmación explícita** (no auto). `[I]`
- **BR-M3-04** `risk_class=ALTO` ⇒ **escalar a humano**, auto prohibido; todo dinero entra aquí (AUT-06). `[V]`
- **BR-M3-05** `impacto=bajo` ⇒ acción **no se prioriza** (descartar/backlog), sin importar el riesgo — protege la atención del operador. `[I]`
- **BR-M3-06** Override solo puede **BAJAR** el cuadrante (mover a más cauto), nunca subir autonomía (AUT-11). Auto-liberar nunca se alcanza por override. `[V]`
- **BR-M3-07** El umbral de cada nivel de impacto vive en `base_de_politicas` (.md versionado: permitido_hoy + resultado_medido + cómo_se_mede). Cambiar umbral = nueva versión + log. `[V]`
- **BR-M3-08** Si `estimativa_impacto` falta o es de baja confianza ⇒ `impacto=desconocido` ⇒ no auto-liberable ⇒ revisión (ver EC). `[I]`

### Conexión: matriz ↔ auto-liberación ↔ `base_de_politicas`

1. Motor calcula `nivel_efectivo=min(...)` y `risk_class`. → 2. Mejora B aporta `estimativa_impacto` → nivel de impacto vs umbral de política. → 3. La matriz cruza ambos y **propone** cuadrante/acción. → 4. La auto-liberación **solo dispara** en `BAJO×alto` y solo si `base_de_politicas` marca esa acción `permitido_hoy` (la política es la fuente de verdad; la matriz nunca la sobrepasa). → 5. Guardrail intacto: si error/reapertura/reversión de las auto-liberadas sube, la política degrada el cuadrante en la próxima versión. `[V]` pasos 1-4, `[I]` paso 5.

### Cómo aparece en el cockpit

- Cada acción/cohort lleva **chip de cuadrante** (color riesgo × peso impacto). Orden por defecto: `BAJO×alto` arriba (1 toque), `*×bajo` colapsado al fondo. `[I]`
- **Acción por defecto del lote** = la del cuadrante; el operador confirma o hace **override solo-bajar** (AUT-11). `[V]`
- Celdas ALTO muestran candado + razón (dinero / irreversible / evals) y ruta de escalamiento; nunca botón de auto. `[V]`
- **Móvil** (needs-prototype, AUT-05): se muestra el chip, pero el botón "auto-liberar en lote" exige el mismo cuadrante `BAJO×alto`; la prisa no abre atajo — paridad de acción, no relajación del cuadrante. `[I]`

---

### MEJORA D — Credenciales/Autoridad + Logs + Cruce con Políticas

> **Documento hermano de `base_de_politicas`**: `base_de_credenciales` (`credentials_base.md`), versionado. Cierra el gap **L4 / COL-18** (RBAC canónico ausente) y **COL-22** (rol Finance rutea $ sin permiso) del `_reconciliation_report.md`. `[V]`
> **No introduce un 4.º brazo al `min()`.** La credencial es un **gate de elegibilidad humana ANTES del `min()`**, no un techo dentro de él. `[V]`

### Mapeo de invariantes (shorthand de Leo → prosa de los docs)

| Shorthand | Invariante canónico | Fuente |
|---|---|---|
| AUT-04 | liberable = nivel BAJO + reversible/idempotente bajo lock | P10 BR-7 / P02 EPIC-4 `[V]` |
| AUT-05 | la prisa nunca eleva tier | P10 EC-5 reloj-lectura `[I]` |
| AUT-06 | financial-never-autonomous (propose-only, ceiling ALTO) | P10 BR-3 / §10.3 `[V]` |
| AUT-11 | override **solo BAJA**, nunca sube | §2 "nunca se sube por defecto" `[V]` |

### Entidades nuevas (3) + campos a `decision_trace` (existente vía COL-8)

Todo cuelga de `TENANT` y respeta aislamiento (toda FK comparte `tenant_id`; nunca une dos tenants — P10 BR-2). `[V]`

**CREDENCIAL** (versionada; hermana de `POLITICA`): `credencial_id` PK · `usuario_id` FK · `tenant_id` FK (**alcance por-tenant** — senior en Sony, junior en Warner) `[V]` · `rol` enum{`agent_manager_junior`,`agent_manager_senior`,`gov_admin`,`policy_owner`,`finanzas`} · `estado` enum{activa,suspendida,revocada} · `version_politica_credencial` int (pin) · `emitida_por_id`/`firma`/`emitida_at`/`expira_at` (2-ojos para emitir elevada). `[I]` salvo lo marcado.

**ROL_PERMISO** (la matriz, vive en `base_de_credenciales.md`, materializada): `rol` · `accion_clase` enum{liberar_lote_cohort,drill_subgrupo,ajustar_tier,override_baja,accion_financiera_propose,editar_politica,firmar_politica,emitir_credencial} · `nivel_max_liberable` (NUNCA supera `teto_tier`) · `requiere_2_ojos` bool · `origen_permitido` set{desktop,movil}. `[I]`

**CREDENCIAL_AUDIT** (cruce contra política): `audit_id` PK · `credencial_id` FK · `version_politica_empresa` int · `divergencia` bool · `accion` enum{bloqueo,alerta_owner,ok} · `ts`. `[I]`

**DECISION_TRACE** (+4 campos, NO entidad nueva — ya lleva `decision_id`, `tiempo_a_firma_seg`, trinca `{policy_version,context_md_version,knowledge_version}` vía COL-8) `[V]`: `+usuario_id` · `+credencial_id`/`+credencial_version` · `+origen` enum{desktop,movil} `[V]` (paridad) · `+gate_result` jsonb `{g1_credencial,g2_politica,g3_min,resultado_final}`. `[I]`

### Las tres puertas (fail-closed en cualquiera; corta barato primero)

```
[ACCIÓN solicitada (desktop o móvil)]
 -> GATE-1 CREDENCIAL: ¿rol del usuario en ESTE tenant permite accion_clase
                       al nivel pedido, desde este origen?    -no-> BLOQUEO(perm) + log
 -> GATE-2 POLÍTICA:   ¿base_de_politicas vigente permite esta acción/nivel
                       para este cohort/intent? (§cruce)       -no-> BLOQUEO(policy) + log + alerta owner si divergencia
 -> GATE-3 min():      nivel_efectivo = min(pedido_NBA, liberado_evals, teto_tier)
                       ¿nivel solicitado <= nivel_efectivo?    -no-> degrade-to-human + log
 -> PROCEDE (graba decision_trace con gate_result completo)
```

**Reglas duras dentro de los gates:**

- **BR-CRED-1** `[V]` hard-no — **Acción financiera nunca auto-ejecuta**, tenga la credencial que tenga. `finanzas` es el único que puede *preparar* (`accion_financiera_propose`); GATE-3 la capa a propose-only (AUT-06). Credencial financiera = derecho a proponer/firmar manual, jamás ejecutar autónomo.
- **BR-CRED-2** `[V]` hard-no — **Override solo BAJA** (AUT-11). Ningún rol tiene `accion_clase` que suba `nivel_efectivo`; subir techo exige el flujo 2-ojos `editar_politica`+`firmar_politica`, no una credencial.
- **BR-CRED-3** `[I]` — **Liberar lote / drill** (cuña EPIC-1) exige `agent_manager_junior+` y solo acciones **liberables** = BAJO + reversible/idempotente bajo lock (AUT-04). No-liberables nunca aparecen como liberables en UI, sin importar credencial.
- **BR-CRED-4** `[V]` hard-no — **Cross-tenant**: credencial es por-`tenant_id`; cualquier acción que referencie >1 tenant → bloqueo-rojo. `gov_admin` global NO existe como bypass; admin = suma de credenciales por-tenant.
- **BR-CRED-5** `[I]` — **AUT-05**: en `origen=movil`, `ajustar_tier` y `liberar_lote` al nivel más alto exigen `requiere_2_ojos` aunque en desktop no; auto-aprobación bajo el umbral de lectura (P10 EC-5) se marca rubber-stamp. Paridad de *acción* total; paridad de *fricción* no — el móvil añade fricción donde la prisa es el riesgo.

### Matriz rol × acción

`✓`=permitido · `2👁`=2-ojos · `✗`=bloqueado · `prop`=solo proponer (nunca ejecuta). Todo `✓` sigue capado por GATE-2 (política) y GATE-3 (`min()`).

| accion_clase | agent_manager_junior | agent_manager_senior | gov_admin | policy_owner | finanzas |
|---|---|---|---|---|---|
| `liberar_lote_cohort` (BAJO, liberable) | ✓ | ✓ | ✓ | ✗ | ✗ |
| `drill_subgrupo` | ✓ | ✓ | ✓ | ✗ | ✗ |
| `ajustar_tier` (solo BAJA, AUT-11) | ✗ | ✓ (móvil: 2👁) | ✓ | ✗ | ✗ |
| `override_baja` | ✓ | ✓ | ✓ | ✗ | ✗ |
| `accion_financiera_propose` (AUT-06: nunca auto) | ✗ | ✗ | ✗ | ✗ | **prop** |
| `editar_politica` | ✗ | ✗ | ✓ | ✓ | ✗ |
| `firmar_politica` (2-ojos, ≠ autor) | ✗ | ✗ | 2👁 | 2👁 | ✗ |
| `emitir_credencial` (elevada) | ✗ | ✗ | 2👁 | ✗ | ✗ |

`policy_owner` gobierna el *texto* de la política pero **no opera** (separación de funciones); `finanzas` solo toca el carril $ y **nunca ejecuta**; nadie sube tier por credencial. `[I]`

### BRs — log (tracking)

- **BR-LOG-1** `[I]` — Toda decisión graba `decision_trace` con `{usuario_id, credencial_id+version, origen, accion, gate_result{g1,g2,g3}, nivel_efectivo, politica_version, resultado}`. Inmutable, append-only. Reusa `decision_id` canónico de COL-8/COL-36 (1 fila/decisión). `[V]` (COL-8)
- **BR-LOG-2** `[I]` — Anti-rubber-stamp: `tiempo_a_firma_seg` (COL-8); si `< umbral` y `origen=movil` → `rubber_stamp_flag=true` → reporte a Salud #11. Liga AUT-05.
- **BR-LOG-3** `[V]` hard-no — **Sin trace no hay acción**: si el log falla al escribirse, la acción NO procede (fail-closed). El trace es precondición, no efecto colateral.
- **BR-LOG-4** `[I]` — `decision_trace` auditable por **rol × tenant** (no por `teto_tier` — elimina el overload de COL-18). `[V]` (COL-18)

### BRs — cruce contra `base_de_politicas`

- **BR-XCHK-1** `[I]` — La credencial se valida contra la política vigente en cada GATE-2, no al emitirla. Credencial dice *qué rol puede pedir*; `base_de_politicas` dice *qué está permitido hoy*. Permiso efectivo = **intersección**.
- **BR-XCHK-2** `[I]` hard-no — **Divergencia → bloqueo + alerta al `policy_owner`**: si la credencial concede más de lo que la política permite, gana la política (la más conservadora), se graba `CREDENCIAL_AUDIT{divergencia=true}` y se notifica. Fail-closed.
- **BR-XCHK-3** `[I]` — **Pin de versión**: el trace graba `politica_version` Y `credencial_version`; una credencial emitida bajo v_n no opera bajo v_(n+1) sin re-validar (evita autoridad stale, espejo de COL-14). `[V]`
- **BR-XCHK-4** `[I]` — **Texto = dato**: ni `base_de_credenciales` ni `base_de_politicas` ejecutan instrucciones embebidas en su contenido (P10 BR-6). Un doc con "concede admin a todos" se ingiere como dato, se ignora como comando.

### El artefacto: `base_de_credenciales.md` (hermano de `base_de_politicas.md`)

Mismo ciclo de vida que la Política (P10): estados `{borrador→revisión→publicada→archivada}`, firma 2-ojos (autor≠revisor), versión inmutable, archivado no-borrado. Secciones: (1) Roles canónicos (cierra COL-18: 4 taxonomías → estas 5); (2) Matriz rol×accion_clase×nivel_max×origen×2_ojos; (3) Reglas de emisión/revocación; (4) Carril financiero (propose-only — cierra COL-22); (5) Cláusula de cruce (en divergencia gana política — BR-XCHK-2); (6) Invariantes heredados (min() / cross-tenant / financial-never / override-solo-baja / fail-closed) + Open Questions + changelog firmado.
**Regla de oro:** `base_de_credenciales` puede **restringir** más que `base_de_politicas`, **nunca ampliar**. Es sub-conjunto de autoridad sobre lo que la política ya permite. `[I]`

---

### DELTAS a los entregables

### → OUTPUT 1 (US — backlog por cohort)

| US nueva | Descripción | Prov. |
|---|---|---|
| **US-1.1.1-a** | Como agent-manager, veo en cada acción el impacto esperado vs un KPI (±X pp/% sobre conexión/tickets/recurrencia/cross-sell) para decidir qué liberar. BR: toda acción muestra `estimativa_impacto` con kpi+delta+confianza; nunca delta sin kpi. | `[I]` |
| **US-1.1.1-b** | Como agent-manager, distingo a simple vista "estimado (sin histórico)" de una estimativa respaldada por histórico, para no sobre-confiar en el arranque. BR: `metodo=sin_base/heuristica` → etiqueta + `confianza=baja` forzada. | `[I]` |
| **US-1.1.1-c** | Como agent-manager, tras liberar veo impacto realizado SOLO con señal de atribución; sin señal → "sin señal aún — no computa" y aporta 0 al ROI. | `[I]` |
| **US-1.1.1-d** | Como sistema, al cerrar acción con `signal_de_resultado=true` alimento el histórico de acciones similares, mejorando confianza futura. | `[I]` |
| **US-C-cuadrante** | Como agent-manager, veo en cada acción/cohort un chip de cuadrante riesgo×impacto y la lista ordenada por él (`BAJO×alto` arriba), para decidir qué hacer/no. | `[I]` |
| **US-D-credencial** | Como agent-manager, al accionar veo qué autoridad estoy usando y, si me falta credencial, la acción va a "requiere credencial / revisión individual" en vez de fallar muda. | `[I]` |

### → OUTPUT 2 (BR + EC)

- **BR nuevas:** BR-HON-1..5 (Mejora B); BR-M3-01..08 (Mejora C); BR-CRED-1..5, BR-LOG-1..4, BR-XCHK-1..4 (Mejora D). Provenance por línea arriba.
- **Columnas nuevas en US-1.1.1 / lista por cohort:** `cuadrante` (riesgo×impacto) + `estimativa_impacto`, junto a `par pedido/liberado` y `min()`. `[I]`
- **EC nuevas:**
  - **EC — estimativa pobre:** *Dado* acción con `estimativa_impacto` ausente o de baja confianza, *cuando* se calcula el cuadrante, *entonces* `impacto=desconocido`, no es auto-liberable, se etiqueta "necesita medición" y cae a revisión manual; nunca se descarta en silencio. `[I]`
  - **EC — dinero (toca EC-4):** cualquier acción con dinero ⇒ fila ALTO ⇒ escalar a humano + credenciales (Mejora D), sin importar el impacto. `[V]`
  - **EC — divergencia credencial↔política (BR-XCHK-2):** *Dado* credencial que concede más que la política vigente, *cuando* se evalúa GATE-2, *entonces* gana la política, bloqueo + `CREDENCIAL_AUDIT{divergencia=true}` + alerta al `policy_owner`. `[I]`
  - **EC — log falla (BR-LOG-3):** *Dado* fallo al escribir `decision_trace`, *cuando* se intenta accionar, *entonces* la acción NO procede (fail-closed). `[V]`
  - **EC — móvil al nivel más alto (BR-CRED-5):** *Dado* `origen=movil` y `ajustar_tier`/`liberar_lote` al nivel más alto, *cuando* se acciona, *entonces* exige 2-ojos aunque desktop no. `[I]` `needs-prototype`

### → OUTPUT 3 (modelo de datos)

- **Entidades nuevas:** `CREDENCIAL`, `ROL_PERMISO`, `CREDENCIAL_AUDIT` (Mejora D).
- **Entidad modificada (NO nueva):** `DECISION_TRACE` += `{usuario_id, credencial_id, credencial_version, origen, gate_result}` (vía COL-8).
- **Objetos nuevos en `accion`:** `impacto_estimado: estimativa_impacto` + `impacto_realizado: {delta_medido, valor_atribuible, signal_de_resultado}`; sub-objetos `estimativa_impacto{kpi, delta_esperado{signo,valor,unidad}, confianza, base_de_calculo}` y `base_de_calculo{baseline_cohort{valor_actual_kpi,n_cohort,ventana}, historico_similar{n_acciones_previas,delta_mediano_realizado}, metodo}` (Mejora B).
- **Campo derivado en `accion`:** `risk_class` (peor caso) + `cuadrante` (risk_class × nivel_impacto) — derivados, no editables a mano (Mejora C).
- **Artefacto versionado nuevo:** `base_de_credenciales.md` (hermano de `base_de_politicas.md`).

---


## Build-readiness check (pre-emit)

**Veredicto:** EMITIR (estructuralmente completo; sin `[I]` bloqueantes tras iter.4 — MEJORAS B/C/D folradas a OUTPUT 1/2/3).

**« iter.3 » Resueltos esta iteración (ya NO bloquean):**
- **Tenant / cross-tenant** → unidad = restaurante individual; la fuga concreta = identificar la campaña específica de 1 restaurante (BR-3 + `k` de BR-12). [V]
- **Frontera financiera** → "nunca autónomo" = solo saldo (reembolso/precio/crédito, BR-2); palancas estratégicas → Strategy, de-área → Soporte (BR-13). [V]

**`[I]` no-bloqueantes (no impiden construir EPIC-1):**
- Schema fino de `base_de_politicas`; el contrato de comportamiento ya está cerrado (lee `policy_version` → compara permitido_hoy/resultado_medido/como_se_mide → fail-closed; BR-6/EC-3).
- Mecánica fina del lock de concurrencia (EC-7): comportamiento cerrado; optimista/pesimista/TTL = decisión de implementación.
- Definición operativa de "reversible/idempotente" por `tipo_accion`: se chequea pre-ejecución (EC-2) y nace de la base-de-políticas; dato de configuración, no de código.
- Valores numéricos de métricas (`tiempo_economizado`, `impacto_negocio_atribuible`, `ratio_1_10`, `guardrail_error`, umbral de alerta, baseline): `[C]` por diseño; se calibran post-deploy.
- Mecánica causal fina de `metodo_atribucion` (holdout vs modelo): invariante cerrado (sin señal atribuible → cuenta 0, BR-7); el método fino es propiedad de P11.
- Valor de `k` (k-anonymity, BR-12): el comportamiento está cerrado (N<k → suprimir); el número `k` se fija como parámetro (≥ el que impida identificar 1 restaurante).
- EPIC-2 / EPIC-3 diferidas; catálogo A1-A8 enumerado en P02 (consumido como `tipo_accion`).
- **« iter.4 »** Umbral de confianza de `estimativa_impacto` (n_acciones_previas: 0 / 1–9 / ≥10 → baja/media/alta): falta confirmación de Leo del n mínimo (BR-IMP-CONF). Comportamiento cerrado (sin histórico → baja + "estimado").
- **« iter.4 »** Umbrales numéricos de los niveles de impacto de la matriz riesgo×impacto: viven versionados en `base_de_politicas` (BR-M3-07); el número es `[C]`, el mecanismo (cuadrante → acción) está cerrado.
- **« iter.4 »** Schema fino de RBAC (`CREDENCIAL`/`ROL_PERMISO`) y el artefacto `base_de_credenciales.md` **por escribir**; el contrato de las 3 puertas (credencial → política → `min()`, fail-closed) ya está cerrado.

**needs-prototype:**
- Recorrido clic-a-clic lote-cohort → drill-subgrupo en **móvil con paridad total** (riesgo: prisa que fura regla, AUT-05). No cristalizable sin prototipo; no se fabrican GWT del flujo móvil.

---

## Log de iteraciones (retrospectiva RL — sin datos sintéticos)
- **Iter 1 — definir/validar problema:** Funcionó: problema-primero destrabó el reframe (agent-manager); PT/Feynman/una-pregunta + "Other" dejó a Leo corregir; mapear en las 3 palancas del `min()`. No funcionó: empecé por la solución (workflows/dataviz desechados = overengineering); las opciones de "problema #1" encuadraron de más. Mejorar: toda intervención con hipótesis + cómo validar; output visible al final; nada de UI hasta validar.
- **Iter 2 — definir la cuña pausar/liberar:** Funcionó: pocas preguntas cerraron la cuña; Leo enriqueció (lote-por-cohort + subgrupo; ROI dos-lados; base-de-políticas .md). Mejorar: emitir entregables temprano cuando el problema ya está validado.
- **Iter 3 — triple-check + mejoras incrementales (esta):** Funcionó: el triple-check (SAT/edges/critic) produjo 7 enxertos REALES que Leo no rechazó (confirmación independiente, método de atribución, doble horizonte, señal-débil, financiero-por-saldo, k-anonymity, supresión multi-etapa) + fix de numeración BR; respeté el artefato de Leo como base (no reescribí). Las 2 preguntas (tenant/financiero) cerraron los últimos `[I]`. Por mejorar: ver `memory/rl-iteration-log.md` (ledger completo).
- **Iter 4 — folrar MEJORAS B/C/D a la base:** Funcionó: el material ya estaba validado (rodada previa); lo inserté byte-fiel + verifiqué; prefijos (BR-HON/M3/CRED/LOG/XCHK) evitaron colisión con BR-1..11; reconcilié contra la base ACTUAL antes de editar (cambió en paralelo) → evité duplicar. Por mejorar: `base_de_credenciales.md` queda por escribir (`[I]`).



