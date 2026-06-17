# breakdown_N8N.md — contratos puros (N8N/AGENTE)

> Proyección read-only del registro congelado. DOMAIN=uber_eats (vocab nativo: restaurante, Orden, Evento_Uso, Cohort).
> Cada pieza-proceso lista: TRIGGER-IN / DATA-IN / DATA-OUT / TRIGGERS-FIRED + (contenedores N8N) STEPS con balde + SCOPE (mínimo privilegio) + HARD-NO envelope.
> Convención SCOPE: zona ∈ {tenant, cohort, gov, catalog, featureC}; RLS single-pool; credencial por NOMBRE; ningún DATA-OUT cruza tenant_id.

---

## 01 — Cohorts

### 01:F-1.5 · AGENTE — PERFIL_COHORT (síntesis)
- TRIGGER-IN: sync user-action: open cohort perfil (in-app); payload: cohort_id, subgrupo_id
- DATA-IN: Cohort.baseline_descriptivo, Cohort.tenure_bucket, Cohort.tier_base, Restaurante.atributos_vivos, Pertenencia_Cohort_Snapshot.percentil_en_cohort
- DATA-OUT: PERFIL_COHORT (phantom §04 denylist; síntesis = texto generado, no columna persistida; derivado de Cohort.baseline_descriptivo; producer=agent-runtime, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: null + reason: síntesis terminal de lectura, no dispara downstream
- SCOPE: zona=cohort; lee Cohort + Pertenencia_Cohort_Snapshot + Restaurante.atributos_vivos; RLS single-pool; k-anon n_cuentas>=k
- HARD-NO: k-anon (cohort zone, n_cuentas>=k)

### 01:F-2.4 · AGENTE — feature-attribution del delta
- TRIGGER-IN: sync user-action: open delta/log entry (in-app); payload: account_id=restaurante_id, delta_status
- DATA-IN: Evento_Priorizado_NBA.delta_status, Pertenencia_Cohort_Snapshot, Restaurante.atributos_vivos, Orden
- DATA-OUT: variables_causa[] (no columna canónica; MOVIMIENTO_LOG absorbido en Evento_Priorizado_NBA.delta_status §04; output de feature-attribution, [C]/[I] si no atribuible, nunca causa fabricada como [V]; producer=agent-runtime, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: null + reason: explicabilidad de lectura, no dispara downstream
- SCOPE: zona=tenant; lee Evento_Priorizado_NBA + Pertenencia_Cohort_Snapshot + Restaurante + Orden del mismo tenant_id; RLS single-pool
- HARD-NO: cross-tenant (RLS, bloqueo-rojo); §04 §14 provenance honesto (causa no fabricada como [V])

### 01:F-2.5 · N8N — re-segmentación batch periódica (contenedor)
- TRIGGER-IN: schedule: cadencia batch versionada [C] (Config_Perillas) alineada a cadencia SEMANAL Goals; out-of-band, no en sesión operador
- DATA-IN: Pertenencia_Cohort_Snapshot (consecutivos), Cohort_Rule_Version, Cohort, Subgrupo
- DATA-OUT: Pertenencia_Cohort_Snapshot (snapshot semanal nuevo; producer=job batch P01 §14, COMPUTED at run / NULL pre-run); Evento_Priorizado_NBA.delta_status (MOVIMIENTO_LOG absorbido §04)
- TRIGGERS-FIRED: snapshot_persisted → North Star/Goals (baseline_atribucion); delta-eventos → 01:F-2.2
- STEPS:
  - 01:F-1.1 · CÓDIGO
  - 01:F-1.2 · CÓDIGO
  - 01:F-2.2 · CÓDIGO
  - 01:F-2.4 · AGENTE
  - 01:F-2.6 · CÓDIGO
- SCOPE: zona=cohort/tenant; lee/escribe Pertenencia_Cohort_Snapshot + Cohort + Subgrupo + Cohort_Rule_Version; RLS single-pool; k-anon en celda
- HARD-NO: cross-tenant (RLS single-pool, snapshot por tenant_id); k-anon (cohort zone); sin-trace-no-acción (cohort_rule_version estampada)

---

## 02 — NBA

### 02:BR-13 · AGENTE — ruteo de palanca estratégica/área
- TRIGGER-IN: action enters Cockpit; payload: NBA_Propuesta.clase_palanca/destino_ruteo
- DATA-IN: NBA_Propuesta.causa_raiz, NBA_Propuesta.clase_palanca
- DATA-OUT: NBA_Propuesta.clase_palanca, NBA_Propuesta.destino_ruteo (clasificación; producer=NBA agent-runtime @resolve-at-merge, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: degrade-a-humano + ruteo a Strategy/Soporte [I]-bilateral-unconfirmed (sin consumer trigger-in en el set)
- SCOPE: zona=tenant; lee/escribe NBA_Propuesta del mismo tenant_id; RLS single-pool
- HARD-NO: financiero nunca autónomo por efecto (clase estratégica no mueve saldo); cross-tenant (RLS)

### 02:US-1.1.1-d · N8N — write-back de histórico-similar (contenedor)
- TRIGGER-IN: event: acción closed with signal_de_resultado=true; payload: NBA_Propuesta.nba_id, NBA_Propuesta.impacto_realizado
- DATA-IN: NBA_Propuesta.impacto_realizado, ROI_Operador.signal_de_resultado
- DATA-OUT: NBA_Propuesta.impacto_estimado (update historico_similar; producer=ROI/histórico job §14, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: mejora confianza futura de estimativa [I]-bilateral-unconfirmed (feedback interno, sin downstream trigger-in)
- STEPS:
  - 02:BR-HON-2 · CÓDIGO
- SCOPE: zona=tenant; lee ROI_Operador + NBA_Propuesta del mismo tenant_id; escribe NBA_Propuesta.impacto_estimado; RLS single-pool
- HARD-NO: §04 §14 result-always-computed (impacto_estimado nace [C], gate de señal BR-HON-2); cross-tenant (RLS)

### 02:1A · AGENTE — IA propone NBAs por cohort
- TRIGGER-IN: P01 emits Evento_Priorizado_NBA for cohort / agent-manager opens Cockpit; payload: Evento_Priorizado_NBA.cohort_id, Evento_Priorizado_NBA.restaurante_id
- DATA-IN: Cohort.cohort_id, Evento_Priorizado_NBA.cohort_id, NBA_Catalogo.codigo, Restaurante.atributos_vivos
- DATA-OUT: NBA_Propuesta.tipo_accion, NBA_Propuesta.causa_raiz, NBA_Propuesta.pedido_NBA, NBA_Propuesta.before_after_esperado (producer=NBA agent-runtime, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: NBA candidata exists → 02:1B [I]-bilateral-unconfirmed (target trigger-in null); else registra no-act contrafactual
- SCOPE: zona=tenant; lee Cohort + Evento_Priorizado_NBA + NBA_Catalogo (catalog) + Restaurante del mismo tenant_id; escribe NBA_Propuesta; RLS single-pool
- HARD-NO: financiero nunca autónomo por efecto (solo propone, no libera); cross-tenant (RLS)

### 02:1E · N8N — propagación batch post-firma (contenedor)
- TRIGGER-IN: event: liberacion_lote confirmed/firmada; payload: Liberacion_Lote.liberacion_id, Liberacion_Lote.nivel_resultante, Liberacion_Lote.operador_id
- DATA-IN: Liberacion_Lote.liberacion_id, ROI_Operador.signal_de_resultado, ROI_Operador.metodo_atribucion, ROI_Operador.horizonte_medido
- DATA-OUT: Decision_Trace.trace_id, Decision_Trace.policy_version (append-only); ROI_Operador.ratio_1_10, ROI_Operador.guardrail_error, ROI_Operador.es_atribuible (producer=ROI_Operador job §14, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: guardrail sube → rebaja automática; feeds P11 Salud_1a10 / P06 Evals [I]-bilateral-unconfirmed (out-of-scope, sin in-set trigger-in)
- STEPS:
  - 02:BR-9 · CÓDIGO
  - 02:BR-11 · CÓDIGO
  - 02:BR-7 · CÓDIGO
- SCOPE: zona=tenant/gov; lee Liberacion_Lote + ROI_Operador; escribe Decision_Trace (append-only) + ROI_Operador del mismo tenant_id; RLS single-pool
- HARD-NO: sin-trace-no-acción (Decision_Trace append-only precondición); 4-ojos/anti-rubber-stamp (BR-11 confirmador≠proponente); ROI 2-compuertas (BR-7 es_atribuible+confirmado); cross-tenant (RLS)

---

## 03 — KPIs

### 03:US-3.1.1-analisis · AGENTE — punto-de-impacto + leading + acción
- TRIGGER-IN: event: KPI.valor_hoy < KPI.target AND dueno_id in scope (fired by measurement job / KPI render); payload: kpi_id, dueno_id, tenant_id
- DATA-IN: KPI.valor_hoy, KPI.target, KPI.es_lagging, KPI.parent_kpi_id, KPI.nivel, KPI.dueno_id, KPI.tenant_id
- DATA-OUT: AccionSugerida.analisis + AccionSugerida.estado='propuesta' + AccionSugerida.kpi_id (analisis = texto LLM no número-resultado; cualquier número citado es Named_Query, NULL pre-run; producer=agent-runtime, COMPUTED at run)
- TRIGGERS-FIRED: AccionSugerida created (estado=propuesta) → awaits human approval [I]-bilateral-unconfirmed (target 03:US-3.1.1-gate trigger-in null)
- SCOPE: zona=tenant; lee KPI del mismo tenant_id; escribe AccionSugerida (estado conservador propuesta); RLS single-pool
- HARD-NO: §04 §14 result-always-computed (número de Named_Query, no semilla LLM); sin-trace-no-acción (estado=propuesta, nada corre sin aprobación humana); cross-tenant (RLS)

### 03:US-3.2.1 · AGENTE — juicio de acuracidad (acertada/no/no-atribuible)
- TRIGGER-IN: event: AccionSugerida.estado='ejecutada' + cierre de ciclo (signal de resultado available); payload: accion_id, kpi_id, decision_trace_id
- DATA-IN: AccionSugerida.estado, AccionSugerida.decision_trace_id, AccionSugerida.kpi_id, KPI.valor_hoy, ROI_Operador.es_atribuible, ROI_Operador.signal_de_resultado
- DATA-OUT: AccionSugerida.acuracidad_feedback {acertada|no|no_atribuible} (LLM juzga la etiqueta; el número incremental es job de atribución 2-compuertas BR-10 / §04 §14; producer=job de atribución, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: feedback retroalimenta el ranking de recomendación P06 [I]-bilateral-unconfirmed (out-of-scope)
- SCOPE: zona=tenant; lee AccionSugerida + KPI + ROI_Operador del mismo tenant_id; escribe AccionSugerida.acuracidad_feedback; RLS single-pool
- HARD-NO: §04 §14 result-always-computed (incremental determinista, no semilla LLM); ROI 2-compuertas (es_atribuible+signal); cross-tenant (RLS)

### 03:US-4.3.1 · N8N — job de medición de KPI (contenedor)
- TRIGGER-IN: schedule: job de medición (default diario / snapshot semanal [I]); payload: tenant_id, kpi_def_version window
- DATA-IN: Named_Query.formula, Named_Query.periodicidad, Named_Query.group_by, Named_Query.source_ref, Named_Query.unit, KPI.kpi_def_version, KPI.clase; brutos via source_ref (Orden / Evento_Uso / Conversa_Episodio)
- DATA-OUT: KPI.valor_hoy + KPI.ultimo_calculo_ts (producer=Named_Query determinista §14, COMPUTED at run / NULL pre-run; clase=performance bypassa 3A → lee KPI.performance_validado_por/validado_en, nunca computa)
- TRIGGERS-FIRED: KPI.valor_hoy updated → may fire 03:US-3.1.1-analisis si valor_hoy<target in scope; render refresh
- STEPS:
  - 03:US-4.1.1 · CÓDIGO
- SCOPE: zona=tenant; lee Named_Query (catalog) + KPI + brutos source_ref del mismo tenant_id; escribe KPI.valor_hoy + KPI.ultimo_calculo_ts; RLS single-pool, sin cruzar tenant_id
- HARD-NO: cross-tenant (RLS single-pool, no cross tenant_id en agregación); §04 §14 result-always-computed (Named_Query determinista, no LLM)

### 03:US-6.1.1-hipotesis · AGENTE — hipótesis híbrido ML+LLM (Governing Thoughts rankeadas)
- TRIGGER-IN: event: KPI en rojo, human abre workbench (AccionSugerida tipo-B); payload: accion_id, kpi_id, tenant_id
- DATA-IN: KPI.valor_hoy, KPI.es_lagging, KPI.parent_kpi_id; segmento/onset diagnostic output; brutos Orden / Evento_Uso para ranking
- DATA-OUT: AccionSugerida.workbench (jsonb: governing_thought + prob_rank; la metrica_verificacion NÚMERO es Named_Query determinista 03:US-6.1.1-metrica, no LLM; producer=agent-runtime, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: human selects hipótesis → plan de acción 03:US-6.2.1 [I]-bilateral-unconfirmed (target trigger-in null)
- SCOPE: zona=tenant; lee KPI + brutos Orden/Evento_Uso del mismo tenant_id; escribe AccionSugerida.workbench; RLS single-pool
- HARD-NO: §04 §14 result-always-computed (métrica de verificación determinista, no semilla LLM); sin-trace-no-acción (human selecciona, nada corre auto); cross-tenant (RLS)

---

## 05A — Inbox / Conversa (contrato A)

### 05A:A.1.4 · AGENTE — extracción VLM/OCR de imagen
- TRIGGER-IN: A.1.3 branch image-present; payload: TURNO adjunto (imagen/print/pdf)
- DATA-IN: Conversa_Episodio.turnos (imagen_redactada)
- DATA-OUT: Conversa_Episodio.turnos += texto_extraido (fenced, tratado_como_dato=true; producer=agent-runtime VLM/OCR, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: A.1.5 (texto_redactado+OCR fenced)
- SCOPE: zona=tenant; lee/escribe Conversa_Episodio.turnos intra-conversa del mismo tenant_id; RLS single-pool
- HARD-NO: PII redactada end-to-end (imagen_redactada, texto fenced como dato); anti-injection (texto extraído = DATA, no instrucción); cross-tenant (RLS)

### 05A:A.1.5 · AGENTE — clasifica prompt-injection/jailbreak
- TRIGGER-IN: A.1.4/A.1.2 done; payload: Conversa_Episodio.turnos texto_redactado (fenced)
- DATA-IN: Conversa_Episodio.turnos (texto_redactado), tenant_id
- DATA-OUT: Conversa_Episodio.señal_inyeccion (jsonb logueada vs tenant_id; producer=agent-runtime classifier, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: señal_inyeccion → S8 gobernanza; A.1.6 (continue as DATA, min() intact) [I]-bilateral-unconfirmed (target A.1.6 trigger-in null)
- SCOPE: zona=tenant; lee Conversa_Episodio.turnos del mismo tenant_id; escribe señal_inyeccion logueada vs tenant_id; RLS single-pool
- HARD-NO: anti-injection (texto = DATA, min() intacto); PII redactada end-to-end; cross-tenant (RLS)

### 05A:A.2.7-degrade · AGENTE — resumen de ancla faltante (degrade-to-human)
- TRIGGER-IN: FC-1..FC-4 (identity/scope/grounding/policy/NBA anchor missing)
- DATA-IN: Conversa_Episodio (estado parcial), grounding_estado/confianza (spec-local)
- DATA-OUT: Conversa_Episodio.estado_conversa=escalada (CRUD by code) + escalation package text (producer=agent-runtime para el resumen; estado COMPUTED at run)
- TRIGGERS-FIRED: A.7 gobernanza humana (degrade-to-human) → 05A:A.7.1
- SCOPE: zona=tenant; lee Conversa_Episodio del mismo tenant_id; escribe estado_conversa=escalada; RLS single-pool
- HARD-NO: sin-trace-no-acción / degrade-to-human (fail-closed a humano); cross-tenant (RLS)

### 05A:A.3.1 · AGENTE — clasifica info-state (suficiente/un-gap/escalar)
- TRIGGER-IN: A.3.0 pass; payload: CONTEXTO_MONTADO + last TURNO texto_redactado
- DATA-IN: Conversa_Episodio.turnos (texto_redactado), confianza/piso (spec-local)
- DATA-OUT: info_state branch label (spec-local, no table write — interno; producer=agent-runtime, COMPUTED at run)
- TRIGGERS-FIRED: A.3.1b (one-question) | A.3.2 (sufficient) | A.3.7-ESCALA (conf<piso)
- SCOPE: zona=tenant; lee Conversa_Episodio.turnos del mismo tenant_id; no escribe tabla; RLS single-pool
- HARD-NO: PII redactada end-to-end (texto_redactado); cross-tenant (RLS)

### 05A:A.3.1b · AGENTE — redacta UNA pregunta aclaratoria
- TRIGGER-IN: A.3.1 branch (b) one askable datum missing
- DATA-IN: Conversa_Episodio.turnos, intent
- DATA-OUT: Conversa_Episodio.turnos += TURNO{autor=ia, texto_redactado=pregunta}; Conversa_Episodio.estado_conversa=abierta (CRUD; producer=agent-runtime, COMPUTED at run)
- TRIGGERS-FIRED: write-back A.6; re-entry via A.1 on client reply → 05A:A.1.5
- SCOPE: zona=tenant; lee/escribe Conversa_Episodio.turnos del mismo tenant_id; RLS single-pool
- HARD-NO: PII redactada end-to-end (texto_redactado); cross-tenant (RLS)

### 05A:A.3.2 · AGENTE — cruza 4 fuentes + detecta conflicto irresoluble
- TRIGGER-IN: A.3.1 branch (a) sufficient
- DATA-IN: CONTEXTO_MONTADO (politicas_resueltas, nba_usada+why, historico_ref→Restaurante, cohort_id/percentil)
- DATA-OUT: conflict verdict (interno, no table write; producer=agent-runtime, COMPUTED at run)
- TRIGGERS-FIRED: A.3.7-ESCALA (irresolvable) | A.3.3 (resolvable)
- SCOPE: zona=tenant; lee CONTEXTO_MONTADO + Restaurante del mismo tenant_id read-only; min()/teto aplicado por código adjunto; RLS single-pool
- HARD-NO: override-solo-baja (teto-limit aplicado, no eleva); cross-tenant (RLS)

### 05A:A.3.3 · AGENTE — traduce P2 WHY a RAÍZ coach
- TRIGGER-IN: A.3.2 no-conflict
- DATA-IN: NBA_Propuesta.causa_raiz, NBA_Propuesta.before_after_esperado (via nba_usada), Restaurante.atributos_vivos
- DATA-OUT: borrador.raiz internal draft (no table write yet; producer=agent-runtime, COMPUTED at run)
- TRIGGERS-FIRED: A.3.4
- SCOPE: zona=tenant; lee NBA_Propuesta + Restaurante.atributos_vivos del mismo tenant_id read-only; RLS single-pool
- HARD-NO: PII redactada end-to-end; cross-tenant (RLS, solo datos propios del restaurante)

### 05A:A.3.4 · AGENTE — personaliza cómo+ejemplos+ganancia con dato propio
- TRIGGER-IN: A.3.3 done
- DATA-IN: Pertenencia_Cohort_Snapshot.percentil_en_cohort (context only), Restaurante.atributos_vivos, Orden (own weak slots)
- DATA-OUT: borrador.coach {raiz, como, ejemplos, ganancia} internal (producer=agent-runtime, COMPUTED at run)
- TRIGGERS-FIRED: A.3.5 | A.3.7-ESCALA (if implies diferential treatment sin policy)
- SCOPE: zona=tenant; lee Pertenencia_Cohort_Snapshot (cohort solo contexto) + Restaurante + Orden del mismo tenant_id read-only; RLS single-pool; k-anon (cohort)
- HARD-NO: k-anon (cohort solo como contexto); cross-tenant (RLS, dato propio); PII redactada end-to-end

### 05A:A.3.5 · AGENTE — reescribe a doc-de-tono versionado
- TRIGGER-IN: A.3.4 done
- DATA-IN: documento-de-tono versionado (spec-local), borrador.coach
- DATA-OUT: borrador.coach tone-applied + tono_version sealed (interno; sellado a Conversa_Episodio.capa_estructurada en A.6; producer=agent-runtime, COMPUTED at run)
- TRIGGERS-FIRED: A.3.6
- SCOPE: zona=tenant; aplica doc-tono al borrador del mismo tenant_id; RLS single-pool
- HARD-NO: PII redactada end-to-end; cross-tenant (RLS)

### 05A:A.3.6 · AGENTE — self-critique checklist pre-envío
- TRIGGER-IN: A.3.5 done
- DATA-IN: borrador.coach, documento-de-tono, principios BR-A6/A7/A2
- DATA-OUT: self-critique verdict per item (interno; producer=agent-runtime, COMPUTED at run)
- TRIGGERS-FIRED: A.3.6-CHECK (deterministic gate) [I]-bilateral-unconfirmed (target trigger-in null) | bounded retry to A.3.3 | A.3.7-ESCALA (efecto/auto_flag)
- SCOPE: zona=tenant; evalúa borrador del mismo tenant_id; verdict marcado por leaf-split CÓDIGO A.3.6-CHECK; RLS single-pool
- HARD-NO: PII redactada end-to-end (no-leak verdict); financiero nunca autónomo por efecto (auto_flag); cross-tenant (RLS)

### 05A:A.3.7-ESCALA · AGENTE — empaqueta hipótesis qué-pasó+sugerencia
- TRIGGER-IN: A.3.x fail (confianza|efecto|auto_flag|conflicto)
- DATA-IN: borrador parcial + motivo + eje (interno)
- DATA-OUT: Decision_Trace{nivel_efectivo_aplicado=alto, eje_escalacion, accion, proponente_id, policy_version} append-only (producer=Conversa_Episodio P05A gate §14, COMPUTED at run / NULL pre-run); Conversa_Episodio.estado_conversa=escalada
- TRIGGERS-FIRED: A.4/A.7 (paquete escalación) → 05A:A.7.1
- SCOPE: zona=tenant/gov; escribe Decision_Trace append-only + estado_conversa del mismo tenant_id; RLS single-pool
- HARD-NO: sin-trace-no-acción (Decision_Trace append-only); degrade-to-human; financiero nunca autónomo por efecto; cross-tenant (RLS)

### 05A:A.4.3 · AGENTE — clasifica EFECTO financiero + anti-fraccionamiento
- TRIGGER-IN: A.4.2 pass
- DATA-IN: respuesta-coach candidate + nba_usada, Politica_Tier.permitido_hoy, esfuerzo_cliente/turnos history (fraccionamiento)
- DATA-OUT: Decision_Trace.eje_escalacion=efecto (si SÍ; producer=Conversa_Episodio P05A gate, COMPUTED at run / NULL pre-run; financiero hard-no nunca auto-libera saldo)
- TRIGGERS-FIRED: A.4.9 (ALTO) | A.4.4
- SCOPE: zona=tenant/gov; lee Politica_Tier (gov) + historial del mismo tenant_id read-only; escribe Decision_Trace.eje_escalacion; RLS single-pool
- HARD-NO: financiero nunca autónomo por efecto (saldo nunca auto-liberado); sin-trace-no-acción; cross-tenant (RLS)

### 05A:A.4.5 · AGENTE — barrido MECE de 7 ejes de escalación
- TRIGGER-IN: A.4.4 conf>=piso
- DATA-IN: Conversa_Episodio.turnos (estado señal), Pertenencia_Cohort_Snapshot.percentil_en_cohort (QUIÉN, context), historial Restaurante/prior episodios (REINCIDENCIA), anomaly signal
- DATA-OUT: Decision_Trace.eje_escalacion (producer=Conversa_Episodio P05A gate §14, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: A.4.9 (any axis fires) | A.4.6 [I]-bilateral-unconfirmed (target A.4.6 trigger-in null)
- SCOPE: zona=tenant; lee Conversa_Episodio + Pertenencia_Cohort_Snapshot + historial Restaurante del mismo tenant_id (single-pool, cross-restaurante intra-pool permitido); escribe Decision_Trace.eje_escalacion; RLS single-pool
- HARD-NO: cross-tenant (RLS single-pool, intra-pool sí, cross tenant_id no); sin-trace-no-acción; k-anon (cohort context)

### 05A:A.4.9 · AGENTE — empaqueta escalación ALTO
- TRIGGER-IN: any A.4.2/A.4.3/A.4.4/A.4.5/A.4.6 → ALTO
- DATA-IN: eje_escalacion, confianza, par, respuesta-coach candidate
- DATA-OUT: Decision_Trace{nivel_efectivo_aplicado=alto, eje_escalacion, accion, motivo} append-only (producer=Conversa_Episodio P05A gate, COMPUTED at run / NULL pre-run) + Conversa_Episodio.estado_conversa=escalada; suggestion NOT sent to client
- TRIGGERS-FIRED: A.7 (gobernanza humana) → 05A:A.7.1
- SCOPE: zona=tenant/gov; escribe Decision_Trace append-only + estado_conversa del mismo tenant_id; RLS single-pool
- HARD-NO: sin-trace-no-acción (Decision_Trace append-only); degrade-to-human; financiero nunca autónomo por efecto; cross-tenant (RLS)

### 05A:A.5.6 · AGENTE — degrade-to-human en read-back fail
- TRIGGER-IN: A.5.4 read-back NOT confirmed
- DATA-IN: read_back_resultado=no_confirmado (interno)
- DATA-OUT: Decision_Trace{nivel_efectivo_aplicado=alto, eje_escalacion=confianza, motivo=read_back_no_confirmado} append-only (producer=Conversa_Episodio P05A gate, COMPUTED at run); idempotency_key kept alive
- TRIGGERS-FIRED: A.7 (gobernanza humana) → 05A:A.7.1
- SCOPE: zona=tenant/gov; escribe Decision_Trace append-only del mismo tenant_id; RLS single-pool
- HARD-NO: sin-trace-no-acción (Decision_Trace append-only); degrade-to-human (fail-closed); cross-tenant (RLS)

### 05A:A.6.7-señal-a-S8 · AGENTE — empaqueta señal de gobernanza a S8
- TRIGGER-IN: A.6.4 deflection_mala=true OR baja-confianza/pii_residual/ANCLA_AUSENTE/snowball flags
- DATA-IN: deflection_mala/confianza/pii_residual/snowball (spec-local), Conversa_Episodio.capa_estructurada
- DATA-OUT: governance signal → S8 (RLHF-router/tono-lote/comunicado); fallback flag persistido en Conversa_Episodio.capa_estructurada (producer=agent-runtime para el empaque, COMPUTED at run)
- TRIGGERS-FIRED: A.7 S8 batch sweep → 05A:A.7.5; loops back A.6.5 to seal episode
- SCOPE: zona=tenant/gov; lee Conversa_Episodio.capa_estructurada del mismo tenant_id; escribe flag en capa_estructurada; RLS single-pool
- HARD-NO: PII redactada end-to-end (pii_residual flag); cross-tenant (RLS)

### 05A:A.7.1 · AGENTE — construye PAQUETE_ESCALACION
- TRIGGER-IN: (a) Decision_Trace.nivel_efectivo_aplicado=alto from A.4
- DATA-IN: Decision_Trace{trace_id, conversa_id, eje_escalacion, motivo}, Conversa_Episodio{nba_usada+why, capa_transcripcion redactada, intent, policy_version, tono_version}
- DATA-OUT: PAQUETE_ESCALACION → governance queue (derivado de Decision_Trace, no tabla; producer=agent-runtime, COMPUTED at run); never exposed to client
- TRIGGERS-FIRED: A.7.6 (eje=estado) | A.7.2 (else) [I]-bilateral-unconfirmed (target A.7.2 trigger-in null)
- SCOPE: zona=tenant/gov; lee Decision_Trace + Conversa_Episodio (transcripción ya redactada) del mismo tenant_id; deriva paquete; RLS single-pool
- HARD-NO: PII redactada end-to-end (transcripción redactada); cross-tenant (RLS); sin-trace-no-acción

### 05A:A.7.4 · AGENTE — RLHF-router clasifica tipo de corrección
- TRIGGER-IN: correction emitted from A.7.2/A.7.3
- DATA-IN: human correction {tipo, delta, conversa_id, episodio_id}
- DATA-OUT: versioned artifact updated {Eval_Cell golden-set | Politica_Tier borrador | doc-tono | plantilla}; fine-tuning batch queued (NOT per-correction; producer=agent-runtime classify + downstream artifact owners @resolve-at-merge, COMPUTED at run)
- TRIGGERS-FIRED: A.7.4b (anti-rubber-stamp) [I]-bilateral-unconfirmed (target trigger-in null)
- SCOPE: zona=gov; lee corrección + escribe artefacto versionado (Eval_Cell / Politica_Tier / doc-tono) del mismo tenant_id; correcciones nunca cruzan tenant; RLS single-pool
- HARD-NO: cross-tenant (correcciones nunca cruzan tenant_id); 4-ojos/anti-rubber-stamp (A.7.4b); sin-trace-no-acción

### 05A:A.7.5 · AGENTE — detecta cluster anomalía + compone COMUNICADO
- TRIGGER-IN: (d) ANOMALÍA detected in A.4 (eje=anomalia) without individual escalation
- DATA-IN: cluster Decision_Trace{eje_escalacion=anomalia} + Conversa_Episodio.capa_metricas{n_re_contactos, snowball} aggregated
- DATA-OUT: COMUNICADO {incremento[C], hipótesis provenance=[I], impacto} → S8 background channel (spec-local artifact; producer=agent-runtime, COMPUTED at run); impacto described without identifying foreign tenant
- TRIGGERS-FIRED: A.7.4 (if human intervenes) | A.7.7 (else IA keeps sustaining) [I]-bilateral-unconfirmed (target A.7.7 trigger-in null)
- SCOPE: zona=tenant/gov; agrega Decision_Trace + Conversa_Episodio.capa_metricas del mismo tenant_id; k-anon n_cuentas>=k; RLS single-pool
- HARD-NO: k-anon (n_cuentas>=k en agregado); cross-tenant (RLS, impacto sin identificar tenant ajeno); §04 §14 provenance ([C]/[I])

### 05A:A.7.6 · AGENTE — identifica estado abusivo/crisis + dispara humano
- TRIGGER-IN: (e) Decision_Trace.eje_escalacion=estado (abusivo/crisis)
- DATA-IN: Decision_Trace{eje_escalacion=estado, motivo}, Conversa_Episodio.turnos (abuse/threat signals)
- DATA-OUT: human decision {entrar|no-entrar}; if entrar Conversa_Episodio.lock_posesion=usuario_id, Conversa_Episodio.estado_conversa=en_humano (CRUD by code); episode marked for RLHF (producer=agent-runtime classify state, COMPUTED at run)
- TRIGGERS-FIRED: A.7.4 (RLHF)
- SCOPE: zona=tenant; lee Decision_Trace + Conversa_Episodio.turnos del mismo tenant_id; escribe lock_posesion + estado_conversa; RLS single-pool
- HARD-NO: degrade-to-human (humano decide entrada); PII redactada end-to-end; cross-tenant (RLS)

---

## 05B — Caza-silenciosos / diagnóstico (contrato B)

### 05B:B.1.2 · N8N — monitor proactivo de proceso-crítico (contenedor)
- TRIGGER-IN: schedule=Processo_Critico.schedule; payload: processo_id, fonte_verdade_ref, origem
- DATA-IN: Processo_Critico.processo_id, Processo_Critico.nome, Processo_Critico.score_impacto, Processo_Critico.falha_silenciosa, Processo_Critico.fonte_verdade_ref, Processo_Critico.origem, Processo_Critico.schedule; Knowledge_Case (origem=kb_promovido)
- DATA-OUT: disparo-candidato {origen=proactivo, tenant_id, processo_id, fonte_verdade_ref} a B.1.3; Processo_Critico.estado=monitoreo_degradado si fuente cae (producer=job heartbeat §14, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: dispara B.1.3 (dedup+anclaje a problema) [I]-bilateral-unconfirmed (target B.1.3 trigger-in null)
- STEPS:
  - 05B:B.1.3 · CÓDIGO
- SCOPE: zona=tenant; lee Processo_Critico + Knowledge_Case (catalog); escribe Processo_Critico.estado del mismo tenant_id; RLS single-pool
- HARD-NO: cross-tenant (RLS single-pool); §04 §14 result-always-computed (heartbeat job, no semilla)

### 05B:EPIC-B1 · N8N — orquestación diagnóstico (contenedor, node B.1)
- TRIGGER-IN: event=Conversa_Episodio nuevo (reactivo, payload episodio_id+tenant_id+restaurante_id) OR schedule=Processo_Critico.schedule (proactivo, payload processo_id+fonte_verdade_ref)
- DATA-IN: Conversa_Episodio.tenant_id, Conversa_Episodio.restaurante_id, Conversa_Episodio.capa_estructurada, Processo_Critico.processo_id, Processo_Critico.score_impacto, Processo_Critico.falha_silenciosa, Processo_Critico.schedule
- DATA-OUT: Problema_Diagnosticado.estado, Problema_Diagnosticado.primera_vez_ts, Problema_Diagnosticado.dossier_emitido (producer=caza-silenciosos+impacto jobs §14, COMPUTED at run / NULL pre-run); emisión auditada, NO escribe en la view v_dossier_handoff
- TRIGGERS-FIRED: dispara node B.2 (tipo/área, AGENTE) → 05B:US-B2.1.1 + node B.5/EPIC-B3 (caza-silenciosos, AGENTE separada por trigger)
- STEPS:
  - 05B:B.1.3 · CÓDIGO
  - 05B:B.1.4 · CÓDIGO
  - 05B:US-B2.1.1 · AGENTE
  - 05B:US-B2.2.1 · AGENTE
  - 05B:US-B2.3.1 · CÓDIGO
  - 05B:US-B3.1.1 · AGENTE
  - 05B:B.5.2b · CÓDIGO
  - 05B:US-B5.1.1 · CÓDIGO
  - 05B:US-B6.3.1 · CÓDIGO
- SCOPE: zona=tenant; lee Conversa_Episodio + Processo_Critico; escribe Problema_Diagnosticado del mismo tenant_id; emisión auditada nunca a la view v_dossier_handoff; RLS single-pool
- HARD-NO: cross-tenant (RLS single-pool, BR-B6); PII redactada end-to-end (BR-B7); §04 read-only-view (no escribe v_dossier_handoff)

### 05B:US-B2.1.1 · AGENTE — clasifica tipo/área
- TRIGGER-IN: event=problema abierto; payload: problema_id, tenant_id
- DATA-IN: Conversa_Episodio.capa_estructurada (intent), Problema_Diagnosticado.problema_id; Knowledge_Case.tipo_area, Knowledge_Case.padrao (grounding)
- DATA-OUT: Problema_Diagnosticado.tipo_area, Problema_Diagnosticado.provenance_por_campo (producer=agente-runtime clasificador §14, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: dispara B.3 (issue-tree) → 05B:US-B3.1.1
- SCOPE: zona=tenant; lee Conversa_Episodio.capa_estructurada + Knowledge_Case (catalog grounding) del mismo tenant_id; escribe Problema_Diagnosticado.tipo_area; RLS single-pool
- HARD-NO: cross-tenant (RLS single-pool, BR-B6); anti-injection (intent = DATA, BR-B3)

### 05B:US-B2.2.1 · AGENTE — rankea paths del issue-tree por probabilidad
- TRIGGER-IN: trigger=B.2 entregó tipo_area; payload: problema_id, tipo_area
- DATA-IN: Problema_Diagnosticado.tipo_area, Problema_Diagnosticado.issue_tree; Knowledge_Case.padrao, Knowledge_Case.caminho_usado, Knowledge_Case.probabilidad
- DATA-OUT: Problema_Diagnosticado.issue_tree (jsonb paths[] ordenados por probabilidad[C]; producer=agente-runtime issue-tree §14, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: dispara B.4 fetch perezoso del PATH activo → 05B:US-B3.1.1
- SCOPE: zona=tenant; lee Problema_Diagnosticado + Knowledge_Case (catalog) del mismo tenant_id; escribe Problema_Diagnosticado.issue_tree; RLS single-pool
- HARD-NO: cross-tenant (RLS single-pool); §04 §14 provenance (probabilidad [C])

### 05B:B.2.2b · AGENTE — grounding de tipo candidato vs KB + re-ajuste de confianza
- TRIGGER-IN: trigger=clasificación confianza<umbral; payload: problema_id, tipo_area candidato, rasgos
- DATA-IN: Knowledge_Case.tipo_area, Knowledge_Case.padrao; Problema_Diagnosticado.tipo_area candidato
- DATA-OUT: Problema_Diagnosticado.tipo_area ajustado, Problema_Diagnosticado.confianza (producer=agente-runtime grounding §14, COMPUTED at run / NULL pre-run); si KB no confirma → Problema_Diagnosticado.estado=needs_human
- TRIGGERS-FIRED: dispara B.2.3 (sellar tipo) o degrade-to-human [I]-bilateral-unconfirmed (B.2.3 fuera del id-set)
- SCOPE: zona=tenant; lee Knowledge_Case (catalog grounding) + Problema_Diagnosticado del mismo tenant_id; escribe Problema_Diagnosticado.tipo_area/confianza/estado; RLS single-pool
- HARD-NO: cross-tenant (RLS single-pool, BR-B3); degrade-to-human (estado=needs_human si KB no confirma)

### 05B:US-B3.1.1 · AGENTE — caza-silenciosos: decide cruzar población (node B.5)
- TRIGGER-IN: trigger=B.4 entregó fuente confirmada; payload: problema_id, tipo_area, raiz_hipotese
- DATA-IN: Orden.status_pago, Orden.restaurante_id (población-de-verdad/pagos); Conversa_Episodio (reclamantes); Problema_Diagnosticado.tipo_area, Problema_Diagnosticado.raiz_hipotese
- DATA-OUT: Afetado.reclamou, Afetado.silencioso, Afetado.evidencia, Afetado.restaurante_id (producer=caza-silenciosos agente decide + anti-join §14, COMPUTED at run / NULL pre-run; seed NUNCA inserta Afetado)
- TRIGGERS-FIRED: dispara B.7 (puntuador impacto) + alimenta campo QUIÉN de v_dossier_handoff; 05B→05C via v_dossier_handoff → 05C:EPIC-C1
- STEPS:
  - 05B:B.5.2b · CÓDIGO
- SCOPE: zona=tenant; lee Orden + Conversa_Episodio + Problema_Diagnosticado del mismo tenant_id; escribe Afetado; anti-join en leaf CÓDIGO B.5.2b; RLS single-pool
- HARD-NO: cross-tenant (RLS single-pool, BR-B4); §04 §14 result-always-computed (seed nunca inserta Afetado)

### 05B:US-B3.2.1 · AGENTE — detecta concentración por corte type-relevant
- TRIGGER-IN: trigger=Afetado[] disponible; payload: problema_id, tipo_area
- DATA-IN: Afetado.afetado_id, Afetado.restaurante_id, Afetado.silencioso; Problema_Diagnosticado.tipo_area; Orden.zona, Orden.tipo_comida, Orden.fecha (corte por tipo)
- DATA-OUT: Problema_Diagnosticado.issue_tree (jsonb corte-de-concentración {dim, valor, N}; producer=agente-runtime detector-patrón §14, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: dispara B.7 (impacto reconcilia N contra count(Afetado)) → 05B:US-B4.1.1
- SCOPE: zona=tenant; lee Afetado + Problema_Diagnosticado + Orden del mismo tenant_id; escribe Problema_Diagnosticado.issue_tree; RLS single-pool
- HARD-NO: cross-tenant (RLS single-pool, BR-B5); k-anon (concentración, BR-B5)

### 05B:US-B4.1.1 · AGENTE — grounding de hipótesis-raíz vs casos (node B.6)
- TRIGGER-IN: trigger=B.3/B.4 entregó hipótesis-de-raíz; payload: problema_id, tipo_area, raiz_hipotese
- DATA-IN: Knowledge_Case.tipo_area, Knowledge_Case.padrao, Knowledge_Case.resolucao, Knowledge_Case.probabilidad, Knowledge_Case.caminho_usado; Problema_Diagnosticado.raiz_hipotese
- DATA-OUT: Problema_Diagnosticado.raiz_hipotese, Problema_Diagnosticado.confianza, Problema_Diagnosticado.provenance_por_campo (producer=agente-runtime KB-grounding §14, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: dispara B.7 (puntuador impacto) si confianza>=umbral → 05B:US-B4.2.1; degrade-to-human si no
- SCOPE: zona=tenant; lee Knowledge_Case (catalog, validado fluye cross-pool por diseño) + Problema_Diagnosticado del mismo tenant_id; escribe Problema_Diagnosticado.raiz_hipotese/confianza; RLS single-pool
- HARD-NO: cross-tenant (RLS; Knowledge_Case validado cross-pool es catalog por diseño, no datos de tenant); degrade-to-human (BR-B3)

### 05B:US-B4.2.1 · AGENTE — juzga promoción de tipo a proceso-crítico
- TRIGGER-IN: trigger=mismo tipo_area alto-impacto repitiéndose; payload: tipo_area, problema_id
- DATA-IN: Knowledge_Case.tipo_area, Knowledge_Case.padrao, Knowledge_Case.custo_resolver_historico; Problema_Diagnosticado.rs_perdido, Problema_Diagnosticado.churn_risk
- DATA-OUT: Processo_Critico.nome, Processo_Critico.score_impacto, Processo_Critico.falha_silenciosa, Processo_Critico.origem (kb_promovido), Processo_Critico.schedule (producer=agente propone + job ranking score_impacto §14, COMPUTED at run / NULL pre-run; HUMANO confirma política)
- TRIGGERS-FIRED: alimenta B.1 monitor proactivo (nuevo schedule) → 05B:B.1.2
- SCOPE: zona=tenant; lee Knowledge_Case (catalog) + Problema_Diagnosticado del mismo tenant_id; escribe Processo_Critico (humano confirma); RLS single-pool
- HARD-NO: sin-trace-no-acción / degrade-to-human (HUMANO confirma política, BR-B12); cross-tenant (RLS); §04 §14 result-always-computed (score_impacto job)

---

## 05C — Feature C / generación de artefactos (contrato C)

### 05C:BR-C1-8 · N8N — cadencia batch-review (paso 9)
- TRIGGER-IN: schedule (cada T) OR volumen (cada N auto-pasados) OR Eval_Cell señal-de-divergencia; payload: tipo, calculo_id
- DATA-IN: Decision_Trace.gate_result, min_calculo.nivel_efectivo, Eval_Cell.kappa, Eval_Cell.redteam_independencia_flag, ROI_Operador.guardrail_error
- DATA-OUT: Politica_Tier.teto_tier rebajado (override-solo-baja; producer=job runtime §14, COMPUTED at run / NULL pre-run); Decision_Trace (append-only de la rebaja)
- TRIGGERS-FIRED: batch-review humano; en drift rebaja teto_tier (fail-closed) [I]-bilateral-unconfirmed (sin downstream consumer trigger-in en el set)
- SCOPE: zona=gov; lee Decision_Trace + min_calculo + Eval_Cell + ROI_Operador; escribe Politica_Tier.teto_tier + Decision_Trace (append-only) del mismo tenant_id; RLS single-pool
- HARD-NO: override-solo-baja (teto_tier solo rebaja); sin-trace-no-acción (Decision_Trace append-only); §04 §14 result-always-computed (job runtime); cross-tenant (RLS)

### 05C:EPIC-C1 · N8N — orquestación Feature C, sub-proceso pasos 1-9 (contenedor)
- TRIGGER-IN: event: dossier emitido por B (v_dossier_handoff listo); payload: Problema_Diagnosticado.problema_id, restaurante_id, tenant_id
- DATA-IN: v_dossier_handoff (11 campos), Problema_Diagnosticado.problema_id/tipo_area/raiz_hipotese, Knowledge_Case.resolucao, KPI.kpi_id, Politica_Tier.teto_tier, Eval_Cell.liberado_evals, Credencial.estado
- DATA-OUT: Artefacto_Generado (zona gov, append-only; producer=Feature C §3.5 §14, COMPUTED at run / NULL pre-run); min_calculo (producer=motor runtime §14, COMPUTED at run / NULL pre-run); Decision_Trace (append-only precondición)
- TRIGGERS-FIRED: despacho a generadores C3a-C3f → 05C:US-C1-1; trigger batch-review (BR-C1-8) → 05C:BR-C1-8
- STEPS:
  - 05C:US-C1-1 · AGENTE
  - 05C:US-C1-3 · CÓDIGO
  - 05C:BR-C1-5 · CÓDIGO
  - 05C:US-C1-2 · CÓDIGO
  - 05C:EPIC-C3d · CÓDIGO
  - 05C:US-C1-4 · CÓDIGO
- SCOPE: zona=gov/featureC; lee v_dossier_handoff (read-only view) + Problema_Diagnosticado + Knowledge_Case (catalog) + KPI + Politica_Tier + Eval_Cell + Credencial.estado (por NOMBRE, nunca valor); escribe Artefacto_Generado + min_calculo + Decision_Trace del mismo tenant_id; RLS single-pool
- HARD-NO: financiero nunca autónomo por efecto (router bloquea saldo, BR-C1-7); sin-trace-no-acción (Decision_Trace precondición); §04 §14 result-always-computed; cross-tenant (RLS)

### 05C:EPIC-C3a · AGENTE — genera email-wedge (render LLM del 'como')
- TRIGGER-IN: trigger: router C marca tipo email; payload: problema_id, restaurante_id, kb_case_id
- DATA-IN: Knowledge_Case.resolucao (steps[]), Restaurante.atributos_vivos (PII propia OK), Cohort.baseline_descriptivo (mercado agregado k-anon), KPI.kpi_id (target_metric)
- DATA-OUT: Content_Lote.piezas (email; producer=Content Studio/Feature C §14, COMPUTED at run / NULL pre-run) + Content_Lote.grounding_ancla NOT NULL→Restaurante
- TRIGGERS-FIRED: eval email-wedge (C4) → 05C:EPIC-C4; luego nivel_efectivo (US-C1-3)
- SCOPE: zona=featureC/tenant; lee Knowledge_Case (catalog) + Restaurante (propio) + Cohort (agregado k-anon) + KPI; escribe Content_Lote del mismo tenant_id; RLS single-pool
- HARD-NO: k-anon (mercado agregado, n_cuentas>=k); cross-tenant (RLS, PII solo propia); §04 §14 grounding_ancla NOT NULL

### 05C:EPIC-C3b · AGENTE — genera spec REFORGE preview (5 secciones)
- TRIGGER-IN: trigger: router C marca C3b SOLO si señal de patrón (>=2 casos); payload: problema_id, frecuencia
- DATA-IN: v_dossier_handoff, Problema_Diagnosticado.frecuencia/primera_vez_ts/ultima_vez_ts (recurrencia), Knowledge_Case.resolucao (HOW por ID), Cohort.baseline_descriptivo (mercado agregado)
- DATA-OUT: Artefacto_Generado.contenido (tipo=spec_reforge; producer=Feature C §3.5 §14, COMPUTED at run / NULL pre-run) + kpi_objetivo NOT NULL→KPI
- TRIGGERS-FIRED: eval REFORGE (C4) → 05C:EPIC-C4; nivel_efectivo; entrega a cola discovery Producto
- SCOPE: zona=featureC/gov; lee v_dossier_handoff (read-only view) + Problema_Diagnosticado + Knowledge_Case (catalog) + Cohort (agregado); escribe Artefacto_Generado del mismo tenant_id; RLS single-pool
- HARD-NO: k-anon (mercado agregado); cross-tenant (RLS); §04 §14 kpi_objetivo NOT NULL

### 05C:EPIC-C3c · AGENTE — genera análisis de impacto Finanzas
- TRIGGER-IN: trigger: router C tipifica impacto financiero SOLO si señal económica cuantificable; payload: problema_id
- DATA-IN: Problema_Diagnosticado.rs_perdido, Problema_Diagnosticado.valor_ganho, Problema_Diagnosticado.custo_resolver (escalares-resultado ya computados §14), Knowledge_Case.resolucao (método), Cohort.baseline_descriptivo (comparativo agregado)
- DATA-OUT: Artefacto_Generado.contenido (tipo=finanzas_impacto; producer=Feature C §3.5 §14, COMPUTED at run / NULL pre-run) + kpi_objetivo NOT NULL→KPI
- TRIGGERS-FIRED: lint anti-solicitud (BR-C3c-1); eval (C4) → 05C:EPIC-C4; nivel_efectivo; entrega email Finanzas
- SCOPE: zona=featureC/gov; lee Problema_Diagnosticado (escalares pre-computados) + Knowledge_Case (catalog) + Cohort (agregado); escribe Artefacto_Generado del mismo tenant_id; RLS single-pool
- HARD-NO: financiero nunca autónomo por efecto (Finance=solo impacto, lint anti-solicitud bloquea saldo BR-C3c-1); k-anon (agregado); cross-tenant (RLS)

### 05C:EPIC-C3e · AGENTE — genera borrador de política redactado
- TRIGGER-IN: trigger: router C marca política SOLO por patrón recurrente (umbral N/ventana); payload: problema_id, frecuencia
- DATA-IN: Problema_Diagnosticado.frecuencia (recurrencia), Knowledge_Case.resolucao (criterio-de-bueno KB), Cohort.baseline_descriptivo (mercado agregado), Politica_Tier.policy_id (a ajustar)
- DATA-OUT: Artefacto_Generado.contenido (tipo=politica_borrador; producer=Feature C §14, COMPUTED at run / NULL pre-run) + kpi_objetivo NOT NULL→KPI  — el borrador NO toca `Politica_Tier` (esa tabla es el techo ya firmado 4-ojos; no tiene `estado`/`pendiente_4ojos`, `04` §3.3)
- TRIGGERS-FIRED: co-disparo C3c/C3f por problema_id; eval (C4) → 05C:EPIC-C4; nivel_efectivo; ruteo 4-ojos
- SCOPE: zona=gov/featureC; lee Problema_Diagnosticado + Knowledge_Case (catalog) + Cohort (agregado) + Politica_Tier (techo actual, read); escribe SOLO Artefacto_Generado del mismo tenant_id; la publicación 4-ojos a Politica_Tier es paso humano CÓDIGO aparte (05C:BR-C3e-2); RLS single-pool
- HARD-NO: 4-ojos (el borrador en Artefacto_Generado NO auto-publica a Politica_Tier); k-anon (agregado); cross-tenant (RLS); §04 §14 kpi_objetivo NOT NULL

### 05C:EPIC-C3f · AGENTE — genera borrador T&C como redline
- TRIGGER-IN: trigger: router C clasifica clase=tyc por patrón legal recurrente; payload: problema_id
- DATA-IN: Problema_Diagnosticado.raiz_hipotese/frecuencia, Knowledge_Case.resolucao (clausula-base), Cohort.baseline_descriptivo (mercado agregado)
- DATA-OUT: Artefacto_Generado.contenido (tipo=tc_borrador; producer=Feature C §3.5 §14, COMPUTED at run / NULL pre-run) + kpi_objetivo NOT NULL→KPI
- TRIGGERS-FIRED: eval T&C (C4) → 05C:EPIC-C4; nivel_efectivo; entrega email Legal review queue
- SCOPE: zona=featureC/gov; lee Problema_Diagnosticado + Knowledge_Case (catalog) + Cohort (agregado); escribe Artefacto_Generado del mismo tenant_id; RLS single-pool
- HARD-NO: 4-ojos (redline a Legal review queue, no auto-publica); k-anon (agregado); cross-tenant (RLS); §04 §14 kpi_objetivo NOT NULL

### 05C:EPIC-C4 · AGENTE — corre eval criterios-de-bueno (juez del artefacto)
- TRIGGER-IN: trigger: artefacto generado pre-auto-pase; payload: artefato_id, tipo
- DATA-IN: Artefacto_Generado.contenido, Knowledge_Case (criterios-de-bueno + few-shots), Eval_Cell.eval_cell_id (célula tipo×cohort)
- DATA-OUT: score-por-criterio + veredicto per-artefacto → Artefacto_Generado (veredicto/provenance del artefacto) + registro Decision_Trace (producer=eval runtime §14, COMPUTED at run / NULL pre-run). NO escribe `Eval_Cell.liberado_evals`: ese brazo cohort×intent del min() lo flipa el golden-set runtime agregando evals (kappa/n cruza umbral), no este juez per-artefacto — `04` §3.3/§14
- TRIGGERS-FIRED: nivel_efectivo (min) recompute → 05C:US-C1-3 [I]-bilateral-unconfirmed (target US-C1-3 trigger-in null); registro en Decision_Trace
- SCOPE: zona=gov/featureC; lee Artefacto_Generado + Knowledge_Case (catalog) + Eval_Cell (célula, read); escribe Artefacto_Generado (veredicto) + Decision_Trace del mismo tenant_id; RLS single-pool
- HARD-NO: §04 §14 result-always-computed (eval juez LLM propone, min() determinista decide); sin-trace-no-acción (registro Decision_Trace); cross-tenant (RLS)

### 05C:EPIC-C6 · N8N — loop de mejora nivel-1/nivel-2 (contenedor)
- TRIGGER-IN: event: corrección humana sobre artefacto re-emitido OR feedback equipo-destino; schedule: cadencia tiempo+volumen+divergencia; payload: artefato_id, problema_id, tipo
- DATA-IN: Edicion_Contexto (delta: valor_anterior/valor_nuevo/campo/target_ref), Knowledge_Case (criterio-de-bueno), Eval_Cell (regresión set), ROI_Operador.guardrail_error
- DATA-OUT: Knowledge_Case.resolucao (re-version + memory del tipo; producer=Feature C RL §14, COMPUTED at run / NULL pre-run); Decision_Trace (activación gateada)
- TRIGGERS-FIRED: propuesta CANDIDATA → gate activación (US-C6-2/BR-C6-2) → 05C:US-C6-2; rollback vN→vN-1 si regresión; congela activaciones en drift
- STEPS:
  - 05C:US-C6-1 · CÓDIGO
  - 05C:US-C6-2 · AGENTE
  - 05C:BR-C6-2 · CÓDIGO
- SCOPE: zona=gov/featureC; lee Edicion_Contexto + Knowledge_Case (catalog) + Eval_Cell + ROI_Operador; escribe Knowledge_Case.resolucao (re-version) + Decision_Trace del mismo tenant_id; RLS single-pool
- HARD-NO: override-solo-baja (rollback si regresión, congela en drift); sin-trace-no-acción (activación gateada via Decision_Trace); §04 §14 result-always-computed; cross-tenant (RLS)

### 05C:US-C1-1 · AGENTE — routing de tipo C (paso 2)
- TRIGGER-IN: event: dossier ingestado por C1; payload: problema_id, tipo_area, raiz_hipotese
- DATA-IN: v_dossier_handoff, Problema_Diagnosticado.tipo_area/raiz_hipotese/issue_tree (DATO, no instrucción)
- DATA-OUT: set de tipos {spec_reforge|finanzas_impacto|nba_render|politica_borrador|tc_borrador|email} → Artefacto_Generado.tipo (producer=Feature C §3.5 §14, COMPUTED at run / NULL pre-run) + Content_Lote para email
- TRIGGERS-FIRED: un trigger por tipo seleccionado → generador correspondiente (router marca tipo email) → 05C:EPIC-C3a
- SCOPE: zona=featureC/gov; lee v_dossier_handoff (read-only view) + Problema_Diagnosticado del mismo tenant_id; escribe Artefacto_Generado.tipo; RLS single-pool
- HARD-NO: anti-injection (dossier = DATO, no instrucción, BR-C1-2); cross-tenant (RLS); §04 §14 result-always-computed

### 05C:US-C6-2 · AGENTE — propone cambio de template tras convergencia
- TRIGGER-IN: trigger: convergencia >=N deltas de >=M fuentes distintas (deduplicado por problema_id/usuario_id); payload: tipo, deltas-fuente
- DATA-IN: Edicion_Contexto (deltas buffer del tipo), Knowledge_Case.resolucao (template vigente), Eval_Cell (delta esperado en evals)
- DATA-OUT: propuesta CANDIDATA de Knowledge_Case.resolucao (memory del tipo, candidata; producer=Feature C §14, COMPUTED at run / NULL pre-run)
- TRIGGERS-FIRED: gate de activación BR-C6-2 (nivel_efectivo + evals sin regresión) → 05C:EPIC-C6 [I]-bilateral-unconfirmed (back-edge cíclico, unconfirmed)
- SCOPE: zona=gov/featureC; lee Edicion_Contexto + Knowledge_Case (catalog) + Eval_Cell del mismo tenant_id; propone candidata (no activa); RLS single-pool
- HARD-NO: override-solo-baja (candidata gateada, no auto-activa); sin-trace-no-acción (gate BR-C6-2); cross-tenant (RLS)

### 05C:US-C7-3 · N8N — batch-review periódico de auto-pasados
- TRIGGER-IN: schedule (cada T) OR volumen (cada N) OR Eval_Cell señal-de-divergencia; payload: clase (tipo×segmento×tier)
- DATA-IN: Decision_Trace.gate_result, min_calculo.nivel_efectivo, Artefacto_Generado.estado, Artefacto_Generado.reuse_count, Eval_Cell.kappa
- DATA-OUT: resultado lote {ok|degradar|re-entrenar} → Politica_Tier.teto_tier (rebaja fail-closed; producer=job §14, COMPUTED at run / NULL pre-run) + Decision_Trace (append-only)
- TRIGGERS-FIRED: degradar clase a humano-siempre (BR-C7-7); append a Knowledge_Case (memory) vía C6 → 05C:EPIC-C6
- SCOPE: zona=gov/featureC; lee Decision_Trace + min_calculo + Artefacto_Generado + Eval_Cell; escribe Politica_Tier.teto_tier (rebaja) + Decision_Trace (append-only) del mismo tenant_id; RLS single-pool
- HARD-NO: override-solo-baja (teto_tier solo rebaja fail-closed); sin-trace-no-acción (Decision_Trace append-only); §04 §14 result-always-computed; cross-tenant (RLS)

---

## NOTAS DE PROYECCIÓN

- **Cross-file invariant:** cada `piece_id` aquí mantiene el MISMO balde que en el registro congelado y en los otros 2 archivos.
- **Solo piezas-proceso:** este archivo proyecta únicamente las 52 piezas con balde N8N (10) o AGENTE (42). Las 236 piezas CÓDIGO y 14 PENDIENTE viven en los otros archivos / como decisiones abiertas.
- **Contenedores N8N (10):** 01:F-2.5, 02:US-1.1.1-d, 02:1E, 03:US-4.3.1, 05B:B.1.2, 05B:EPIC-B1, 05C:BR-C1-8, 05C:EPIC-C1, 05C:EPIC-C6, 05C:US-C7-3 — cada uno lista STEPS por `piece_id` ya en el registro; un STEP nunca crea pieza nueva. El shell N8N no contiene razonamiento-LLM: las piezas AGENTE referenciadas por STEP/trigger son las que razonan.
- **Golden-set N8N#3 (4º cuadrante):** 05B:EPIC-B1 (contenedor) DISPARA por trigger la pieza separada de caza-silenciosos 05B:US-B3.1.1 (node B.5/EPIC-B3, AGENTE) — no la absorbe como step interno; el contenedor referencia sus piezas-agente por trigger.
- **Bilaterales `[I]`-unconfirmed marcados in-line** en TRIGGERS-FIRED de: 02:BR-13, 02:US-1.1.1-d, 02:1A, 02:1E, 03:US-3.1.1-analisis, 03:US-3.2.1, 03:US-6.1.1-hipotesis, 05A:A.1.5, 05A:A.3.6, 05A:A.4.5, 05A:A.7.1, 05A:A.7.4, 05A:A.7.5, 05B:B.1.2, 05B:B.2.2b, 05C:BR-C1-8, 05C:EPIC-C4, 05C:US-C6-2.
