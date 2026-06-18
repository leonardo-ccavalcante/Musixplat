# 05A — Atendimiento con Contexto Integrado · TODO das partes faltantes (E2E)

> Consolidação do que falta p/ completar a `pantalla_05A` (CÓDIGO + AGENTE + fundação/DDL).
> Fontes: `specs/breakdown_CODE_AGENT.md` (CÓDIGO) · `specs/breakdown_N8N.md` (AGENTE) · `04` (DDL).
> Gerado 2026-06-18. Legenda: `[x]` feito · `[ ]` falta · **(AG)** = peça AGENTE/LLM (n8n/TS, nunca produz número) · ⛔ = bloqueada por DDL de fundação · 🟢 = construível já (fundação existe).

## Placar
- **CÓDIGO:** 4/35 feitas (A.1.1, A.1.2, A.2.2, A.4.6) → **31 faltam**.
- **AGENTE:** 0/18 feitas → **18 faltam** (camada LLM; ainda não iniciada).
- **DDL fundação:** Conversa estendida (parcial) + `gov.min_calculo` feitos; **6 tabelas faltam** (ver abaixo).

---

## 0. Fundação / DDL faltante (desbloqueadores cross-cutting) — owner = builder de fundação

Estas tabelas não existem e bloqueiam várias peças. Existem hoje: `catalog.{Config_Perillas, Cohort_Rule_Version, Intent_Catalog, Named_Query}`, `cohort.{Cohort, Subgrupo, Pertenencia_Cohort_Snapshot, Evento_Priorizado_NBA}`, `gov.{Usuario, ROI_Operador, Security_Log, min_calculo}`, `tenant.{Restaurante, Orden, Evento_Uso, KPI, Conversa_Episodio}`.

- [ ] **`gov."Decision_Trace"`** (04 §3.3) — traza append-only + 4-olhos. Desbloqueia: A.4.8, A.5.5, A.7.4b, A.7.7 + AGENTE A.3.7/A.4.9/A.5.6.
- [ ] **`gov."Politica_Tier"`** (04 §3) — políticas versionadas + `teto_tier` + `policy_version`. Desbloqueia: A.2.3, A.5.1, A.6.1.
- [ ] **`gov."Eval_Cell"`** (04 §3) — `liberado_evals` por cohort×intent (eval-green). Desbloqueia: A.2.5, motor min completo.
- [ ] **`gov."NBA_Propuesta"`** (P02, 04 §3) — best-action + WHY + `clase_financiera`. Desbloqueia: A.2.5, A.5.3, e a FK `min_calculo.nba_id` / `Conversa.nba_usada`.
- [ ] **`gov."Credencial"`** (04 §3) — RBAC matriz + tier. Desbloqueia: A.2.0.
- [ ] **`gov."Liberacion_Lote"`** (04 §3) — override liberar/pausar em lote. Desbloqueia: A.7.x gobernanza.
- [ ] **Cerebro/P7** (alvo de write-back de episódio + fonte de grounding) — definir entidade/contrato. Desbloqueia: A.6.5, A.6.7.
- [ ] **`Conversa_Episodio` colunas restantes** (04 §3 L107): `cohort_id` (FK Cohort), `nba_usada` (FK NBA_Propuesta), `lock_posesion` (usuario_id), `señal_inyeccion` (jsonb). Desbloqueia: A.2.4(stamp), A.2.5, A.7.x(lock), A.1.5(injeção).
- [ ] **Promover FKs deferred de `min_calculo`** (`eval_cell_ref`→Eval_Cell, `policy_id`→Politica_Tier, `nba_id`→NBA_Propuesta) quando as tabelas acima existirem.
- [ ] **Knobs em `Config_Perillas`**: confirmar `piso_confianza`, `umbral_antifrac`, `lock_TTL`, `retencion_PII` semeados (já tem `k_anon_threshold`, `n_min_threshold`, `TTL_baseline_days`).

---

## EPIC-A1 — Montaje de contexto integrado
- [x] **A.1.1** recv + tenant server-side + create Conversa ✅
- [x] **A.1.2** detecção + redação PII (fail-closed) ✅
- [ ] 🟢 **A.1.3** branch determinista has-image? (rota A.1.4/A.1.5)
- [ ] **A.1.4 (AG)** extração VLM/OCR de imagem
- [ ] **A.1.5 (AG)** classifica prompt-injection/jailbreak (→ `señal_inyeccion`, precisa coluna)
- [ ] 🟢 **A.1.6** sellar TURNO: provenance_por_campo + instrumentar esfuerzo
- [ ] ⛔ **A.2.0** resolver tier + scope_de_acceso desde credencial — *precisa Credencial*
- [ ] 🟢 **A.2.1** hard access filter: RLS predicate + k-anon gate (N≥k) (reusa k-anon de cohort)
- [x] **A.2.2** grounding gate (4 checks) ✅
- [ ] ⛔ **A.2.3** resolver políticas tenant×intent + sellar policy_version — *precisa Politica_Tier*
- [ ] 🟢 **A.2.4** ler cohort + percentil snapshot (n_min/k-anon, read-only) (Pertenencia existe)
- [ ] ⛔ **A.2.5** ler best-action + WHY de P2 + agregar confianza — *precisa NBA_Propuesta*
- [ ] 🟢 **A.2.6** ensamblar CONTEXTO_MONTADO + provenance (capa_estructurada existe)
- [ ] **A.2.7-degrade (AG)** resumo de ancla faltante (degrade-to-human)

## EPIC-A2 — Generación de la respuesta-coach
- [ ] ⛔ **A.3.0** pre-condições duras antes de redatar (grounding/ttl/acesso/policy no-stale) — *parcial: precisa A.2.3*
- [ ] **A.3.1 (AG)** classifica info-state (suficiente/un-gap/escalar)
- [ ] **A.3.1b (AG)** redata UMA pergunta aclaratória
- [ ] **A.3.2 (AG)** cruza 4 fontes + detecta conflito irresolúvel
- [ ] **A.3.3 (AG)** traduz P2 WHY → RAÍZ coach
- [ ] **A.3.4 (AG)** personaliza cómo+ejemplos+ganancia com dado próprio
- [ ] **A.3.5 (AG)** reescreve ao doc-de-tono versionado
- [ ] **A.3.6 (AG)** self-critique checklist pré-envio
- [ ] 🟢 **A.3.6-CHECK** CHECK determinista marca self-critique pass/fail + bounded-retry
- [ ] **A.3.7-ESCALA (AG)** empacota hipótese qué-pasó+sugestão (→ Decision_Trace, ⛔)

## EPIC-A3 — Ruteo de autonomía BAJO/ALTO + escalación
- [ ] 🟢 **A.4.1** normalizar 3 brazos a banda, brazo faltante ⇒ mais-conservador
- [ ] 🟢 **A.4.2** hard grounding gate boolean (reusa A.2.2)
- [ ] **A.4.3 (AG)** classifica EFEITO financeiro + anti-fraccionamiento
- [ ] 🟢 **A.4.4** comparar confiança vs piso (precisa knob `piso_confianza`)
- [ ] **A.4.5 (AG)** barrido MECE dos 7 eixos de escalación
- [x] **A.4.6** motor `nivel_efectivo = least(...)` ✅
- [ ] 🟢 **A.4.7** computar prioridad_cola desde spike (nunca toca tier)
- [ ] ⛔ **A.4.8** sellar Decision_Trace(bajo) + estado=abierta — *precisa Decision_Trace*
- [ ] **A.4.9 (AG)** empacota escalación ALTO (→ Decision_Trace, ⛔)

## EPIC-A4 — Ejecución vía P2 + read-back independiente
- [ ] 🟢 **A.5.0** branch nivel_efectivo==bajo? (consome min_calculo, existe)
- [ ] ⛔ **A.5.1** build pedido_ejecucion + idempotency_key + sellar policy_version — *precisa Politica_Tier*
- [ ] 🟢 **A.5.2** adquirir lock idempotente + handoff autônomo BAJO
- [ ] ⛔ **A.5.3** P2 executa + re-aplica min() + aborto financeiro em borda — *precisa NBA_Propuesta.clase_financiera*
- [ ] 🟢 **A.5.4** read-back de fonte INDEPENDIENTE + quality gate
- [ ] ⛔ **A.5.5** estado=live_aguardando_permanencia + append Decision_Trace — *precisa Decision_Trace*
- [ ] **A.5.6 (AG)** degrade-to-human em read-back fail (→ Decision_Trace, ⛔)

## EPIC-A5 — Señal de salida + write-back + contador 1:10
- [ ] ⛔ **A.6.1** sellar policy_version/tono_version + no-stale, congelar traces — *precisa Politica_Tier*
- [ ] 🟢 **A.6.2** segunda passada PII sobre transcript + retenção limitada (reusa A.1.2)
- [ ] 🟢 **A.6.3** popular capa_estructurada (tenant+restaurante + provenance, hipótese [I])
- [ ] 🟢 **A.6.4** computar esfuerzo_cliente + deflection_mala (anti-join/count, NULL pre-run)
- [ ] ⛔ **A.6.5** gerar episodio_id idempotente + write-back a Cerebro(P7) — *precisa alvo Cerebro/P7*
- [ ] 🟢 **A.6.6** atualizar contador 1:10 (provisional vs P3) + fan-out (Salud_1a10 é view)
- [ ] **A.6.7-señal-a-S8 (AG)** empacota sinal de gobernanza a S8

## EPIC-A6 — Loop de gobernanza humana
- [ ] **A.7.1 (AG)** constrói PAQUETE_ESCALACION
- [ ] 🟢 **A.7.2** revisão META de tono em lote (ação humana sync in-app · UI+a11y)
- [ ] 🟢 **A.7.3** revisão humana de conteúdo/decisão em lote (2 compuertas · UI+a11y)
- [ ] **A.7.4 (AG)** RLHF-router classifica tipo de correção (hecho/política/tono/formato)
- [ ] ⛔ **A.7.4b** anti-rubber-stamp (confirmador≠proponente + bridging + rejection→0) — *precisa Decision_Trace*
- [ ] ⛔ **A.7.7** sellar gobernanza: provenance + 1:10 honesto + versionar + write-back — *precisa Decision_Trace + Cerebro*

---

## Quick-wins (🟢 construíveis JÁ, sem esperar fundação) — ordem sugerida
1. **A.1.3** has-image branch (puro) → **A.1.6** sellar TURNO + esfuerzo.
2. **A.4.1** normalizar brazos · **A.4.2** grounding gate (reusa A.2.2) · **A.4.7** prioridade-spike.
3. **A.3.6-CHECK** verificador de self-critique + bounded-retry.
4. **A.2.1** RLS + k-anon gate · **A.2.4** ler cohort/percentil (Pertenencia existe).
5. **A.5.0** branch nivel · **A.5.2** lock idempotente · **A.5.4** read-back.
6. **A.6.2/6.3/6.4/6.6** camada de saída do episódio (PII 2ª passada, capa_estructurada, esfuerzo, contador 1:10).
7. **A.7.2/A.7.3** UI de revisão em lote (precisa tokens `--mxm-*` + a11y).

## Caminho crítico (DDL desbloqueia o resto)
`Decision_Trace` (5 peças) > `Politica_Tier` (3) > `NBA_Propuesta` (2) > `Eval_Cell`/`Credencial`/`Cerebro` (1-2 cada). Construir essas tabelas (foundation) destrava EPIC-A3/A4/A5/A6. As 18 peças **AGENTE** (n8n/LLM) são uma frente separada — só começam após o contrato CÓDIGO de cada uma existir.
