# Reporte de verificación — build-vs-process breakdown

## ESTADO DE RESOLUCIÓN (aplicado a los 3 archivos)

**8/8 high-severity RESUELTOS** y verificados contra el oráculo `04`:
- `02:W-1A..W-1E` → renombrados a `02:1A..1E` (prefijo `W-` inventado eliminado) en los 3 archivos.
- `05B:US-B6.2.1` → `CASO_REPO` re-apuntado a `Problema_Diagnosticado` (jsonb, `04` §9), no `Knowledge_Case`.
- `05C:EPIC-C3e` → borrador aterriza SOLO en `Artefacto_Generado.contenido`; no escribe `Politica_Tier` (sin `estado`/`pendiente_4ojos`, `04` §3.3).
- `05C:EPIC-C4` → veredicto per-artefacto → `Artefacto_Generado` + `Decision_Trace`; NO `Eval_Cell.liberado_evals` (brazo cohort del min(), `04` §3.3/§14).

**Provenance `[C]`→`[I]` RESUELTO** (`03:US-2.2.1` + `03:EPIC-2`): la previsión semanal se rotula `[I]`/estimación (`03:BR-7`: "la previsión es `[I]`, nunca hecho"); el escenario `01:F-1.7` (UPSIDE) se preserva `[C]` a propósito (escenario ≠ previsión).

**Pendiente (low, no aplicado):** ~13 findings low — tags de campo derivado §14 (`snowball`, `deflection_mala`, `supresion_k_aplicada`), matices de path de contrato (`Edicion_Contexto.target_ref`, links read-only a P3/P11). Ninguno bloquea build.

## SÍNTESIS

**Los 3 archivos NO están build-ready tal cual: 8 piezas (de 294 auditadas) exigen fix quirúrgico high-severity** — 5 son el prefijo `W-` inventado en los 5 sub-procesos NBA de la spec 02, 2 son targets de escritura inexistentes en el oráculo (caso replicable y veredicto de eval en spec 05C) y 1 es el repositorio de casos apuntado a la entidad equivocada en spec 05B; el resto (15 findings med/low) son ajustes de contrato/vocab/bucket sobre piezas ya emitidas, no huecos de cobertura.

---

## HALLAZGOS (orden: high → med → low)

### invented-id (id inventado — el prefijo no existe en la spec fuente)

| piece_id (qué es en palabras) | sev | qué está mal | fix concreto |
|---|---|---|---|
| `02:W-1A` (sub-proceso NBA "proponer la próxima mejor acción") | high | la spec nombra este nodo nativamente como `(1A)`; el breakdown acuñó el prefijo `W-`, que no aparece en ninguna parte de la spec 02 | renombrar a `02:(1A)` y re-clavar la llave del registro + todas las referencias cruzadas |
| `02:W-1B` (sub-proceso NBA "calcular/computar la propuesta") | high | id nativo es `(1B)`; prefijo `W-` inventado | renombrar a `02:(1B)` |
| `02:W-1C` (sub-proceso NBA) | high | id nativo es `(1C)`; prefijo `W-` inventado | renombrar a `02:(1C)` |
| `02:W-1D` (sub-proceso NBA) | high | id nativo es `(1D)`; prefijo `W-` inventado | renombrar a `02:(1D)` |
| `02:W-1E` (job post-firma de NBA) | high | id nativo es `(1E)`; prefijo `W-` inventado (el golden-set N8N #2 también lo cita sin `W-`) | renombrar a `02:(1E)` |
| `05B:B.5.2b` (hoja de triple-check) | low | sufijo `b` no nativo; la spec define `B.5.2` (y sí define `B.2.2b` aparte, pero nunca `B.5.2b`) | usar el id nativo `B.5.2` o etiquetar como hoja §14 de `US-B3.1.1` sin acuñar variante `b` |
| `05DE:S1..S6` (6 pasos del workflow §7 de la vitrina veredicto) | low | la spec numera los pasos como `1.`–`6.` (citados nativamente `7.1`–`7.6`); el prefijo `S` es inventado | renombrar a `05DE:7.1`..`05DE:7.6` (forma ya usada en sus líneas de cita); actualizar `breakdown_HUMANO.md` línea 115 |
| `05DE:layout_config` (config de layout propia de la vitrina D+E) | low | id snake_case acuñado; la spec §4 lo menciona solo en prosa ("su configuración de layout"), sin id nativo | re-anclar a su id nativo más cercano (`BR-DE1`) o marcar como id derivado-no-nativo; el framing CRUD es correcto |

### vocab (campo/tabla fuera del allowlist del oráculo 04)

| piece_id (qué es en palabras) | sev | qué está mal | fix concreto |
|---|---|---|---|
| `05B:US-B6.2.1` (repositorio del caso replicable: cliente/día/frecuencia/screenshots) | high | apunta la escritura `CASO_REPO` a `Knowledge_Case`, entidad equivocada; en 04 §9 `CASO_REPO` es un jsonb DENTRO de `Problema_Diagnosticado`, y `frecuencia`/timestamps viven ahí (§3.1) — `Knowledge_Case` es otra tabla (la KB / B.6) | re-apuntar DATA-IN/OUT a `Problema_Diagnosticado` (CASO_REPO jsonb + `frecuencia` + `ultima_vez_ts`); dejar solo `links_similares` hacia Knowledge_Case si hace falta |
| `05C:EPIC-C3e` (borrador de política Tier) | high | DATA-OUT escribe `Politica_Tier (borrador, pendiente_4ojos)`; en 04 §3.3 `Politica_Tier` no tiene columna `estado` ni valor `pendiente_4ojos` — es la tabla del techo ya firmado por 4-ojos, no un sink de borrador; el borrador ya va correcto a `Artefacto_Generado.contenido (tipo=politica_borrador)` | quitar la DATA-OUT `Politica_Tier (borrador…)`; el borrador aterriza SOLO en `Artefacto_Generado.contenido`; la publicación 4-ojos a `Politica_Tier` es un paso humano CÓDIGO aparte (`05C:BR-C3e-2`) |
| `03:US-2.2.1` (proyección/previsión en serie semanal) | med | etiqueta la proyección `[C]` (mock/escenario); la fuente BR-7 y el cuerpo de la spec mandan `[I]` (estimación/inferida): "la previsión se rotula como proyección [I], nunca como hecho" | etiquetar provenance `[I]`; reservar `[C]` solo para números placeholder/escenario |
| `05C:US-C6-1` (delta de corrección de contexto) | med | DATA-OUT liga `Edicion_Contexto … a artefato_id`; en 04 §3.1 `Edicion_Contexto.target_ref` es FK→KPI (clase=proceso) y no hay columna `artefato_id` — es el log de edición de KPI-proceso con 4-ojos, no un delta de artefacto | capturar el delta en campo de artefacto (`Artefacto_Generado` provenance/contenido) o quitar el binding inventado `artefato_id` y reconciliar `target_ref` (KPI) |
| `01:F-1.3b` (flag de supresión-k en la frontera de salida del cohort) | low | DATA-OUT como `Cohort.supresion_k_aplicada`; en 04 ese flag es solo prosa de "frontera de SALIDA", NO está en la lista de columnas de `Cohort` (que lleva solo `colapsada:bool`) | dejarlo como flag de frontera sin tabla `supresion_k_aplicada` (igual que la prosa de 04) o tagear `producer=@resolve-at-merge`; no afirmar como columna allowlisted |
| `01:F-3.1` (lectura del dinero/impacto atribuible) | low | DATA-IN lee `ROI_Operador.impacto_negocio_atribuible/es_atribuible`; 04 §5 lista P01 LEE = Restaurante/Orden/Pertenencia_Snapshot/Cohort_Rule_Version — `ROI_Operador` (zona gov) no es lectura de P01; el dinero se modela como LINK read-only a P3/P11 | enmarcar la DATA-IN como handoff/link read-only al valor de P3/P11 (producer P3/P11), no lectura directa de columna; los nombres de campo son válidos → es matiz de path, no campo fantasma |
| `03:EPIC-2` (constraints del épico de proyección) | low | constraints dicen "proyección etiquetada `[C]`"; mismo desajuste que `03:US-2.2.1` — la fuente/BR-7 mandan `[I]` | cambiar la etiqueta de la proyección a `[I]` |
| `03:US-2.2.1` (destino de la proyección) | low | la RESULT DATA-OUT nombra producer pero no tiene tabla.columna del allowlist (la entidad KPI no tiene columna de proyección; SnapshotSemanal se plegó en la sub-serie KPI) | declarar la proyección como render-only (sin DATA-OUT persistida) o nombrar el target concreto del allowlist; no dejar RESULT DATA-OUT sin destino vocab-resoluble |
| `05A:A.6.4 / A.6.7-señal-a-S8 / A.7.5` (métricas de episodio: snowball) | low | referencian `snowball` como miembro de `Conversa_Episodio.capa_metricas`; la enumeración del oráculo no lo lista (es flag derivado; §14 fail-closed lo absorbe pero no hace string-match) | confirmar `snowball` como campo derivado §14-computed (producer = conteo de cadena de re-contactos, COMPUTED/NULL pre-run) o mapear a nombre allowlisted |
| `05A:A.6.4` (deflection mala) | low | DATA-OUT nombra `deflection_mala` como campo result de `capa_metricas`; no hace string-match al oráculo (booleano derivado por anti-join/count; §14 lo cubre) | confirmar como flag §14-computed con producer nombrado (anti-join/count, COMPUTED/NULL pre-run) o renombrar a campo allowlisted; marcarlo como derivado, no columna almacenada |
| `05C:US-C3.2.1` (concentración de patrón {dim,valor,N}) | low | escribe el result en `Problema_Diagnosticado.issue_tree`; concentración es output del detector-de-patrón, semánticamente distinto de los paths del issue-tree (no hay columna dedicada → issue_tree usado como cajón jsonb) | confirmar el aterrizaje jsonb; si va con reconciliación de impacto, rutear al jsonb impacto_meta/IMPACTO, o documentar que issue_tree carga el sub-objeto de concentración |
| `05DE:US-DE1.1` (tasa de override honesta) | low | DATA-IN lista 'override rate'; no hay columna `override`/`override_rate` en 04 (deriva de `Decision_Trace`/ROI); piezas 05DE son CÓDIGO (sin contrato 4-campos obligatorio) → es nota de Context | ligar a fuente concreta (derivada de `Decision_Trace.accion='override'`) o etiquetar como métrica de display derivada |
| `05DE:US-DE3.2 / S4 / BR-DE4` (banda histórica vs límite, Eval_Cell) | low | referencian `Eval_Cell.banda`/`band`; `Eval_Cell` existe pero no tiene columna `banda` (la "banda histórica" es prosa de la spec §4) — referencia laxa, no campo fantasma duro | nombrar columnas concretas (`Eval_Cell.kappa`/`Eval_Cell.estado` vs umbral de `Config_Perillas`) o notar 'banda' como comparación derivada sobre columnas allowlisted |

### antifake (RESULT escrito por el productor equivocado / §14)

| piece_id (qué es en palabras) | sev | qué está mal | fix concreto |
|---|---|---|---|
| `05C:EPIC-C4` (verdicto de eval de un artefacto generado) | high | DATA-OUT escribe `Eval_Cell.liberado_evals`; en 04 §3.3/§14 ese campo es el brazo de autonomía cohort×intent COMPUTADO al correr el golden-set, NO el output de un juez LLM per-artefacto — escribirlo ahí corromperia el `min()` que 02/05A también alimentan | rutear el veredicto per-artefacto a campo per-artefacto (`Artefacto_Generado.estado`/score en `contenido`) + `Decision_Trace`; reservar `Eval_Cell.liberado_evals` para el runner del golden-set |
| `03:US-3.2.1` (acuracidad del feedback de una acción) | med | escribe `AccionSugerida.acuracidad_feedback` desde un AGENTE; 04 §14 clasifica ese campo en la clase RESULT 'Atribución/valor' cuyo producer nombrado es el job determinista de atribución (2 compuertas + ventana D días), NO un LLM (la pieza incluso lee `ROI_Operador.es_atribuible`, veredicto ya determinista) | la escritura de `acuracidad_feedback` debe nombrar producer='job de atribución 2-compuertas' (CÓDIGO, BR-10/§14); el LLM no autora el campo §14 |

### bucket (balde equivocado / falta leaf-split LLM-propone + código-verifica)

| piece_id (qué es en palabras) | sev | qué está mal | fix concreto |
|---|---|---|---|
| `05A:A.6 + A.7` (orquestación señal/write-back de episodio + barrido de gobernanza) | med | 05A tiene 0 piezas N8N, pero A.6 es orquestación out-of-band (event-driven por transición de `estado_conversa`, multi-paso, write-back a Cerebro P7, fan-out a B/C/D+E) y A.7 corre en barrido batch S8 — el invocador out-of-band nunca se representa | emitir contenedor N8N para A.6 (TRIGGER-IN = evento de transición de estado; STEPS = A.6.1..A.6.6; TRIGGERS-FIRED = write-back `episodio_id` a P7 / fan-out) y otro para el barrido A.7; mantener los pasos CÓDIGO/AGENTE como STEPS referenciados |
| `05B:US-B2.2.1` (ranking de paths del árbol de causas) | med | clasificado como AGENTE puro sin leaf-split; el few-shot AGENTE #2 nombra ESTA pieza como el exemplar canónico: ranking es AGENTE (LLM) pero el CHECK determinista que marca cada path resultado=true/false es CÓDIGO (§14: LLM-propone + código-verifica NO es hoja → split) | exponer el split: AGENTE propone/rankea paths → hoja CÓDIGO que corre el CHECK determinista y escribe `issue_tree.paths[].resultado` (true/false), espejo de cómo `US-B3.1.1` decompone en la hoja anti-join `B.5.2b` |
| `01:F-2.4` (atribución de variables que explican el delta) | med | clasificado como AGENTE único, pero es el patrón LEAF-split canónico (golden AGENTE #2): un LLM PROPONE qué variables explican el delta (rankeadas) Y un CHECK determinista marca el resultado — BR-18 es justo ese gate ('una entrada sin variables atribuibles NO se emite como movimiento explicado'); el gate BR-18/EC-11 quedó plegado dentro del AGENTE | split: `[AGENTE: proponer+rankear variables_causa]` → `[CÓDIGO: guard determinista BR-18/EC-11 que marca 'movimiento explicado' vs 'sin explicación' y gatea provenance]`, espejo de golden AGENTE #2 |
| `03:US-3.2.1` (lectura cualitativa + atribución del outcome) | med | bucket=AGENTE para un paso cuyo output real (`acuracidad_feedback {acertada\|no\|no_atribuible}`) lo determina el verdicto determinista 2-compuertas que lee como DATA-IN — híbrido LLM-propone/código-verifica que el leaf-rule exige separar | split: `[AGENTE: lectura cualitativa del outcome]` → `[CÓDIGO: job de atribución determinista fija acuracidad_feedback]`, para que el campo result lo produzca el producer determinista nombrado |

### coverage (paso invocado no listado como STEP del contenedor)

| piece_id (qué es en palabras) | sev | qué está mal | fix concreto |
|---|---|---|---|
| `05A:A.6.5` (write-back idempotente episodio_id → 05B) | med | el edge golden 05A→Cerebro(P7)→05B debe reproducir (§8.3); A.6.5 es el producer pero está en bucket CÓDIGO (sin campo TRIGGERS-FIRED) → el edge golden no se declara en ningún lado y no tiene flag `[I]` | representar el edge como TRIGGERS-FIRED del contenedor N8N A.6 (preferido) o, si A.6.5 queda CÓDIGO, añadir flag `[I]-BILATERAL` explícito para el edge no representado |
| `01:F-2.5` (contenedor N8N del agente periódico) | low | la lista STEPS omite `01:F-5.3` (persistencia semanal de `PERCENTIL_SNAPSHOT`); US-2.2.6 asigna ese persist al batch del agente periódico y el DATA-OUT del contenedor escribe `Pertenencia_Cohort_Snapshot` — el paso existe pero no está listado como STEP | añadir `01:F-5.3 · CÓDIGO` a la lista STEPS de `01:F-2.5` (ya es pieza registrada; no se crea pieza nueva) |
| `03:US-4.3.1` (job de medición/freshness) | low | STEPS lista solo `03:US-4.1.1`; pero `03:EC-9` (freshness check) está documentado como 'invocado por el job de medición (03:US-4.3.1)' y produce el marker `stale@ts` que este job emite | añadir `03:EC-9 · CÓDIGO` a la lista STEPS de `03:US-4.3.1` |

### contract (campo de contrato I/O — nota, no defecto de omisión)

| piece_id (qué es en palabras) | sev | qué está mal | fix concreto |
|---|---|---|---|
| `05C:BR-C1-8` (trigger de batch-review humano) | low | TRIGGERS-FIRED marcado `[I]-bilateral-unconfirmed` (edge colgante); correctamente flageado — el target 'batch-review humano' es acción HUMANA, no pieza del registro, así que el edge colgante es esperado | sin cambio: confirmar que el batch-review humano es intencionalmente out-of-registry (atributo HUMAN); mantener el flag `[I]` |

---

## COBERTURA (por spec)

| spec | piezas | cobertura | ¿falta pieza? |
|---|---|---|---|
| **01** (cohorts/percentil) | 32 | completa — 31 features fuente (F-1.x..F-6.x + F-1.3b) + EPIC-6 presentes (29 CÓDIGO + 2 AGENTE [F-1.5,F-2.4] + 1 N8N [F-2.5]), igual al conteo HUMANO área-01 | No. Sin ids inventados; anti-fake satisfecho; sin DATA-OUT a vistas read-only; sin fuga cross-tenant |
| **02** (NBA) | 70 | completa — EPIC-1 + F-1.x + US-1.x.x (render/UI), los 5 sub-procesos OUTPUT-3 1A-1E, BR-1..12/BR-CRED/HON/LOG/M3/XCHK + EC-1..10, MEJORA-B/C/D; EPIC-2/3 correctamente PENDIENTE | No (cobertura). Defectos sistémicos: prefijo `W-` inventado (5 piezas) + mislabel zona cohort-vs-tenant en los 3 contratos que escriben NBA_Propuesta (ver nota tenant abajo) |
| **03** (KPIs/atribución) | 33 | completa — EPIC-1/2 → compositores CÓDIGO; EPIC-3/4/6 → PENDIENTE (mixto/orquestador, defendible); EPIC-5 OUT-OF-SCOPE (host=P11, link-only); F-/US-/BR-1..10/EC-1..10 cubiertos; nodos 3A-3E nativos | No. Los 7 sufijos descriptivos (-analisis/-gate/-handoffA/-diagnostico/-metrica/-tracking/-hipotesis) son leaf-splits legítimos sobre US nativos |
| **05A** (conversa episodio) | 55 | completa — los 53 pasos nativos A.x.y/[DECISIÓN A.5.0] presentes (35 CÓDIGO + 20 AGENTE; A.3.6 leaf-split a AGENTE+A.3.6-CHECK); 3 needs-prototype (EPIC-A1/A2/F-A6.2) en PENDIENTE | Hueco estructural: 0 contenedores N8N pese a 2 orquestaciones out-of-band genuinas (A.6, A.7) → arrastra el edge golden 05A→05B (findings #1,#2). Sin esto, completa |
| **05B** (diagnóstico/issue-tree) | 32 | completa — EPIC-B1..B8, F-B*/US-B* (incl. needs-prototype US-B4.3.1/EPIC-B7/B8 y B.6.5 en HUMANO PENDIENTE), BR-B1..19, EC-B1..16. Sin pieza huérfana | No. Los 4 findings son bucket/vocab/invented-id sobre piezas emitidas, no huecos |
| **05C** (generación/política/eval) | 44 | completa — 13 épicos fuente (C1-C8 incl. C3a-C3f) + entidades de CIERRE (Ritual_Destino = CIERRE-3); 44 piezas (32 CÓDIGO + 12 AGENTE/N8N) = conteo HUMANO; leaf-split honrado, HUMAN-as-attribute honrado | No. Los 3 findings reales son vocab/antifake sobre targets de DATA-OUT, no cobertura ni bucket |
| **05DE** (vitrina veredicto D+E) | 28 | completa — 3 EPIC + 4 US + 9 BR (BR-DE8 a PENDIENTE Fase-2) + 5 EC + 6 pasos workflow + layout_config; bucketing correcto (todo CÓDIGO, 0 AGENTE/0 N8N = naturaleza vitrina); HUMANO 27 CÓDIGO/0/0/1 PENDIENTE = 28 exacto | No. Todos los findings son id-provenance low + vocab suave; sin defectos de contrato/antifake/tenant |

### Nota tenant (spec 02 — 3 piezas, severity med, no listadas como hallazgos high arriba)

3 contratos de proceso que escriben `NBA_Propuesta` declaran `SCOPE: zona=tenant; RLS single-pool`, pero `NBA_Propuesta` vive en la zona COHORT (04 §3.2/§8: sin `restaurante_id`, gate = k-anon, no RLS) — primitiva de aislamiento equivocada:

| piece_id (qué es en palabras) | sev | qué está mal | fix concreto |
|---|---|---|---|
| `02:(1A)` (proponer NBA — antes `W-1A`) | med | escribe `NBA_Propuesta` con `zona=tenant; RLS tenant_id`; la tabla no tiene `tenant_id` y se gatea por k-anon | SCOPE = `zona=cohort; gate=k-anon (n_cuentas>=k)` para el write; reservar RLS tenant_id solo para lecturas tenant-zone (Restaurante, Evento_Priorizado_NBA.restaurante_id) |
| `02:BR-13` (regla de impacto de NBA) | med | mismo mislabel: `NBA_Propuesta` etiquetada zona=tenant/RLS | re-etiquetar el acceso a NBA_Propuesta como `zona=cohort; gate=k-anon` |
| `02:US-1.1.1-d` (escribe NBA_Propuesta.impacto_estimado) | med | mismo mislabel; el write target es zona cohort (k-anon), no RLS tenant_id | corregir SCOPE a cohort-zone k-anon para el write; RLS solo donde se toca tabla tenant-zone real |

---

## LIMITACIONES DEL REPORTE (per §10 del prompt canónico)

- **Cobertura ≠ corrección:** los 7 specs salen "completos" en cobertura, pero mapa completo no prueba que cada balde/contrato sea correcto — los 26 findings lo demuestran; exige revisión humana del diff, no solo gates.
- **Schema alucinado residual:** el vocab-gate BAJA pero no elimina el riesgo de citar un campo inexistente (LLM alucinan ~5-22%); todo contrato es `[I]` hasta verificado contra el `04`. Los findings vocab/antifake high (Knowledge_Case, Politica_Tier.pendiente_4ojos, Eval_Cell.liberado_evals) son exactamente este residual materializado.
- **Cita por ID, no por línea:** este reporte cita piezas por id estable nativo; las referencias de línea de las auditorías per-spec son insumo, no garantía reproducible.
- **No re-detecta contradicciones ni estima esfuerzo/build-order:** consume las auditorías per-spec; no re-corre los gates ni prioriza por costo.
- **El humano es dueño del merge:** este reporte es PROPUESTA de fixes, no decisión — y "corrió una vez" ≠ reproducible (no-determinismo LLM, temp=0 no garantiza).
