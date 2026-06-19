# 05B Diagnosis — Working Prototype build-doc

> Spec: `specs/spec_ready/pantalla_05B_diagnostico.md` · pieces: `specs/breakdown_CODE_AGENT.md` §05B · data: `04`.
> Scope approved by Leo (2026-06-19): **vertical E2E working prototype** (not a demo), **both flows**
> (reactive episode→dossier + proactive monitor→reverse-cascade), AGENTE layer = **real Claude** (text
> only, numbers always SQL §8), proactive monitor = **new `Critical_Process` DDL**. Branch `feat/p05b-diagnosis`.

## Functionality

**What:** assemble the already-built-but-DEAD 05B backend (`server/diagnosis/*`, all 33 integration tests
green, never called) into a real machine + give it a surface. The orchestrator sequences B.1→B.8 over the
existing modules; a producer runs it on a fixture; a read endpoint + screen surface the result.

**The "uau":** the reverse-cascade — proactive monitor catches a non-payment BEFORE a ticket: one
restaurant → `huntSilent` reveals N affected / M silent (never spoke) → `fn_impact_revenue_lost` → R$ lost.
Numbers are REAL (SQL anti-join + Named_Query over a fixture of failed Orders); the fixture rows are inputs
marked `[C]`, never seeded into RESULT columns (§14).

### Workflow (runtime)
1. **Trigger.** Reactive: `diagnosis.reportProblem` (existing, US-B1.1.1 gate + B.1.3 dedup) creates an open
   `Diagnosed_Problem` from a 05A episode. Proactive: `fn_monitor_critical` scans `Critical_Process`
   (payments) on schedule, creates an open problem with `conversation_id=NULL` (BR-B12).
2. **Orchestrate** `runDiagnosis(problemId, tenantId, reasoning)`:
   - **B.2 classify** — `guardInjection` on episode text (EC-B10); `reasoning.classifyArea` → `area_type`
     + `confidence` (text/[C], never a number that matters). Low confidence + no KB ⇒ degrade-to-human (BR-B3).
   - **B.3 issue-tree** — deterministic candidate hypotheses for the area; `reasoning.rankPaths` ranks by
     probability `[C]`; persist `issue_tree` jsonb.
   - **B.4 lazy-fetch** — `lazyFetchPath` resolves the SINGLE source of the top path (BR-B2, bulk blocked).
   - **B.5 silent-hunt** — `huntSilent` (SQL anti-join Order∖complainants) + `reconcileAffected` → Affected
     rows + `silent_status`. The 47/35 are produced here, never seeded (BR-B4 ⭐, §14).
   - **B.6 KB grounding** — query `Knowledge_Case` similars; set `hypothesis_root` + `similar_links`.
   - **B.7 impact + priority** — `computeRevenueLost` (Named_Query) → `revenue_lost`; `dispatchPriority` +
     `routeNowQueue` (risk×impact vs cost) → now/queue.
   - **B.8 route + repo + handoff** — `routeStub(area_type)` → `suggested_route`; `upsertCaseRepo`
     (where_concentrated + raw_data, PII-redacted); `emitDossier` 11-field gate.
   - Border guards throughout: `assertSingleTenant` (EC-B5 cross-pool hard-no), `scanBorderPII` (EC-B6).
3. **Read** — `diagnosis.list` (problems: status, criticality, affected/silent counts, revenue_lost, route,
   origin reactive/proactive) + `diagnosis.getDossier(problemId)` (11-field view + gate result).
4. **Screen** — `/diagnosis`: reverse-cascade card (the uau), board grouped now/queue × reactive/proactive,
   `DossierModal` (11 fields + provenance + honest gaps), states from spec.

### Honest fail-closed (working = the gate really gates)
- `emitDossier` returns **parcial** with `gaps=['f5_how_much']`: `churn_risk` is fail-closed NULL (no
  pre-churn producer this session) and `cost_to_resolve`/`value_gained` are NULL pre-resolution (BR-B14).
  This is correct, not broken — the screen shows "10/11 · gap: f5_how_much (impact incompleto)".
- LLM unreachable / low confidence ⇒ degrade-to-human (BR-B3), never an optimistic default (§7).
- Loading: "Cazando silenciosos…". Empty: "0 silenciosos / población no disponible" · "Nada que reportar
  — procesos en verde". Error: cross-tenant/PII ⇒ dossier blocked; field gap ⇒ no emit (BR-B17).

## Design
- **Reasoning seam** (`server/diagnosis/reasoning.ts`) mirrors `server/agente/reasoning.ts`:
  `DiagnosisReasoning` interface; `deterministicReasoning` (default, gate/tests, no LLM, reproducible) +
  `llmReasoning(client)` (real Claude, used by `run-05b`). Tests inject the deterministic stub ⇒ gate
  stays deterministic; LLM produces TEXT only, every number stays SQL (§8). LLM error ⇒ caller fail-closes.
- **Orchestrator** (`server/diagnosis/orchestrator.ts`) is pure sequencing — it OWNS no math; each step
  delegates to the existing module (SQL determinism, §3.6). It persists the text/classification columns
  (`area_type`, `hypothesis_root`, `confidence`, `issue_tree`, `suggested_route`) with per-field provenance.
- **Read surface** mirrors P02 cockpit (`server/routers/cockpit.ts`): `tenantProcedure`, tenant resolved
  server-side, no recomputation. **Screen** mirrors `features/cockpit/*` (dark, `--mxm-*`, a11y AA).
- Each unit ≤100 lines; 1 piece = 1 commit citing `piece_id` + `04 §`; per-piece adversarial review (§7).

## Data (all RESULT columns NULL pre-run, §14 — verified by antifake test)
- Reuse mig-14: `tenant.{Diagnosed_Problem, Affected, Knowledge_Case}`, `fn_hunt_silent`,
  `fn_impact_revenue_lost`, `v_dossier_handoff` (11 fields). Knobs (`window_silent`, `k_anon_threshold`,
  `cohort_rule_version_current`) seeded.
- **New** mig: `tenant.Critical_Process{process_id, tenant_id, name, impact_score, fails_silently,
  truth_source_ref, origin(policy|kb_promoted), schedule, state}` + `fn_monitor_critical(tenant, process)`
  → opens a `Diagnosed_Problem` (proactive). `state` is the only RESULT column (NULL pre-run; `monitoring_degraded`
  when the source is down — absence of signal ≠ all-good, BR-B12).
- Fixture (run-05b): failed `Order` rows + `Conversation_Episode` complainants in ONE pool such that the
  anti-join yields the reverse-cascade. Inputs only; producers compute every count + R$.
