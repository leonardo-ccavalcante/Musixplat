# 01 · Cohorts Explorer — Missing-parts TODO (gap analysis)

> Consolidated gap between the spec `specs/spec_ready/01_Cohorts Explorer screen.md`
> (OUTPUT 1 épicas/US/F-pieces · OUTPUT 2 BR/EC/MF) and what is **built** today
> (slice-01: migrations + P01 producers + tRPC reads + React panels + sandbox + handoff;
> 35-test gate green; deployed to GitHub + hosted Supabase).
> Legend: ✅ done · 🟡 partial · ❌ missing. Refs cite the spec's BR/US/F/EC/MF IDs.
> Source of build truth: `README.md`, `supabase/migrations/*`, `server/`, `client/src/features/cohorts/*`.

---

## 0. Headline

The **CÓDIGO (deterministic) backbone of screen 01 is built and green**. What's missing splits into:
**(1) the AGENTE/LLM pieces** (text synthesis — never built, by design they were out of the CÓDIGO slice),
**(2) partial CÓDIGO pieces** that were simplified to make the cascade run corrido,
**(3) hard invariants from OUTPUT 2 not yet fully enforced**, and
**(4) `[C]` values + deferred infra**. None require re-architecture — each maps to one function / knob / component.

---

## 1. AGENTE pieces — ❌ NOT built (the 7 `AGENTE` refs)

These produce **text/ranking**, never numbers (CLAUDE.md §8). The CÓDIGO UI already has the slots to render them; the producers don't exist.

- [ ] **F-1.5 — PERFIL del cohort (síntesis gráfica + escrita "quién es")** *(Feature A, AGENTE)* — `US-1.1.5`.
  Today `F-4.1` modal + `F-2.1` semáforo render the cohort definition but **no AI síntesis text**. Needs an AGENTE that, given the cohort's `baseline_descriptivo` + KPIs, writes the 1-message profile (dataviz-honest, Cairo/Knaflic). Numbers stay from `Named_Query`; AGENTE only writes prose.
- [ ] **F-2.4 — DELTAS CON EL PORQUÉ (feature-attribution / explainability)** *(Feature B, AGENTE)* — `US-2.2.4`, `BR-18`, `EC-11`.
  `F-2.2` produces `delta_status` (the *what*); the *why* (which variables moved the account) is unbuilt. AGENTE ranks contributing variables; `EC-11`/`BR-18`: a delta with no attributable variable must degrade to "movimiento sin explicación", never a fabricated cause.
- [ ] **F-2.5 — AGENTE periódico de re-segmentación (scheduler)** *(Feature B)* — `US-2.2.6`, `BR-20`.
  The compute exists (`server/jobs/p01.ts` `runP01`), but nothing **schedules** it (weekly cadence, aligned to Goals). Needs a periodic trigger (n8n schedule / `pg_cron` / Node worker) that runs P01 + writes the log, read-only. → see `specs/breakdown_N8N.md`.

> HUMANO pieces (2): the operator's **prioritize→handoff confirm** click (`F-5.2` UI) and the **"correr ahora"** click (`F-6.1`) — both wired in the UI; no separate work, but mark as the human gates.

---

## 2. CÓDIGO pieces — 🟡 PARTIAL (built but simplified)

- [ ] **Subgrupos reales (2-nivel cohort→subgrupo)** — `EPIC-1`, `F-1.1`, `US-1.1.x`.
  `fn_assign_cohorts` creates a single default `subgrupo='all'` per cohort. Spec wants a real 2nd-level partition with `N_subgrupo`, and **`n_min` + `k-anon` applied PER SUBGRUPO** (today: per cell only). `F-1.6` topo-vs-base + `F-5.1` drill should operate at subgroup level. `EC-13`: subgroup `N<k` must suppress.
- [ ] **Dos baselines distintos (`BR-17`, `MF-10`)** — `F-1.2`/`F-1.4`.
  `baseline_descriptivo` (P90+, for upside) is built. `baseline_atribucion_segmento` is currently a trivial `{avg_metric, top_metric}` jsonb — **not** the contrafactual/holdout baseline Goals/North Star needs. Holdout construction = `[I]` needs-prototype.
- [ ] **`percentil_delta` full structure (`BR-21`)** — `F-2.2`.
  Today only the `delta_status` enum is stored. Spec wants `percentil_delta{sentido(subio|bajo|igual), magnitud, ventana, n_min_ok}` as a consumible event field. Also `at_risk` should = "bajó percentil/cohort **O** patrón pre-churn" — today it's just `percentil < at_risk_percentil_max` on a drop (pre-churn undefined, `[I]`).
- [ ] **Tickets `distribución {único|cross}` (`BR-11`, `F-3.4`, `MF-15`)** — `cohorts.intentCounts`.
  Returns `{cohort_id, intent, n}` only. Missing the `{único|cross}` flag (intent in 1 cohort vs várias) + `freshness_ts` + explicit "no rotula causa" link to Support. `EC-5`: ticket without resolved cohort → "sin cohort", don't force a cell.
- [ ] **`F-1.8` multi-KPI `baseline_cohort` (`BR-25`)** — `fn_baseline_kpi`.
  Computes only `kpi_recurrencia`. Spec wants `valor_actual_kpi` per `{conexion, tickets, recurrencia, cross_sell}` + ventana, each with per-field provenance.
- [ ] **Handoff payload `provenance` propagation (`BR-14`, `BR-23`, `MF-9`)** — `F-5.2` `fn_handoff`.
  Payload carries percentil/gap/n_min_ok/freshness/modo/version/scope_owner/operador/subgrupo ✅, but **not** an explicit per-field `provenance`. `BR-23` wants `freshness_ts/n_min_ok/provenance` propagated as fields downstream.
- [ ] **`F-2.7` `gap_hasta_top` as `{valor, unidad, cohort_rule_version}`** — currently exposed as a bare number in deltas/drill, not the structured leading-indicator field.
- [ ] **Sandbox real diff (`F-6.2`, `EPIC-6`)** — `server/routers/sandbox.ts`.
  Today simulates a `border_1+1month` what-if (illustrative). Spec wants an **ephemeral full re-segmentation** of the current period vs the vigente snapshot, same gates, labelled "SIMULACIÓN — no comprometida". No-commit invariant ✅ verified. Add `stale` marking (`EC-12`).

---

## 3. Hard invariants (OUTPUT 2) — 🟡 not fully enforced

- [ ] **Provenance POR CAMPO (`BR-5`, `MF-2`)** — only the money panel shows a sello today. Every rendered value (percentil, gap, baseline, upside, delta, ticket) must carry `[V]/[I]/[C]` per field, visible + in the export payload. "Sin provenance ⇒ no render como dato duro."
- [ ] **TTL / stale (`BR-12`, `EC-9`, `EC-12`, `MF-13`)** — `TTL_baseline_days=7` knob exists but **no stale check**: reads/sandbox never mark a baseline/snapshot stale nor degrade to qualitative/link when `freshness_ts > TTL`.
- [ ] **`n_cohort_x_intent` downstream gate (`BR-24`, `EC-14`, `MF-12`)** — count is produced (`fn_cohort_intent_count`); the **gate** ("cohort×intent under n_min ⇒ no priorización") is applied downstream in NBA/Evals (P02), not in slice-01. Confirm contract.
- [ ] **Cross-tenant log on blocked business links (`BR-1`, `BR-3.x`, `MF-4`, `MF-8`)** — handoff cross-pool is blocked + logged (`gov.Security_Log`) ✅; the money/tickets **link** resolution doesn't explicitly assert+log tenant preservation.
- [ ] **`A=B` / anti-mezcla across the log + series (`BR-3`, `BR-8`, `EC-3/7/15`)** — `F-4.3` guard exists for reads; verify the movement log + weekly series also refuse cross-version comparison and **mark** series that cross a `cohort_rule_version` change.

---

## 4. Edge cases / failure modes to verify or cover

- [ ] **`EC-1`/`BR-7`/`MF-11` — colapso jerárquico de la matriz** (aggregate noisy cells upward; show only significant + "resto colapsado"). Today cells just get `colapsada=true`; no hierarchical aggregation/roll-up in the UI.
- [ ] **`EC-6` — tenant chico (n diminuto)**: double fail-closed (k + n_min) + qualitative mode. Verify the UI stays useful (qualitative deltas + linked views) instead of empty.
- [ ] **`EC-8` — tenant sin cohorts (regla no corrió)**: honest empty state + degrade to minimal deterministic rule (`BR-4`), no fake semáforo.
- [ ] **`MF-16`/`BR-4` — knowledge ausente ⇒ regla determinística mínima** (no invented P90+ pattern). Verify `F-1.4` degrades, doesn't fabricate.

---

## 5. `[C]` values to ratify with Leo (business semantics I picked to run corrido)

- [ ] **Ranking metric** (drives ALL percentil/gap): today `recurrencia = count(Orden ok, 28d window)` in `fn_recurrencia`. Define the real metric.
- [ ] **`baseline_descriptivo` canonical dimensions**: today `avg_metric`, `avg_ticket`. Spec dims: estructura promo, ventana, fuso, conexión, recurrencia, cross_sell.
- [ ] **Topo-vs-base "P-bajos" borders** (`F-1.6`): today `<P90`; spec `[C]` = P10/P25.
- [ ] **UPSIDE formula** (`F-1.7`, `BR-16`): today `(top.avg_metric − base.avg_metric) × n_base`; `[I]` fórmula/unidad.
- [ ] **`at_risk` rule + pre-churn definition** (`BR-21`): today `percentil < 25` on drop; knob `at_risk_percentil_max=25`.
- [ ] **TTL / cadence**: `TTL_baseline_days=7`, `D_dias_verde=14`, agent cadence (weekly?) — confirm.
- [ ] Confirmed already by Leo: `k_anon_threshold=5`, `n_min_threshold=20`, tenure borders 3/6/12m, `cohort_rule_version_vigente=v1`.

---

## 6. Deferred infra (per `04 §13` roadmap — NOT this slice)

- [ ] **RLS real Postgres policies** (today: server-side tRPC guard is the active enforcement).
- [ ] **Partitioning** (`Orden` by month, `Evento_Uso` by date) + partial indexes at scale.
- [ ] **Multi-instance demo generator** (`04 §12`, Fase 2) — today manual deterministic seed (R001 + 99).
- [ ] **Full `NBA_Catalogo` A1–A8** — not needed by slice-01 (no cohort table FKs it); needed for P02.
- [ ] **CI e2e/a11y job** — `pnpm test:e2e` runs locally; CI gate runs lint/typecheck/unit/antifake/integration only (Playwright + DB + dev-stack not yet in CI).
- [ ] **`pnpm test:sql` (pgTAP) in CI** — runs locally; its assertions are mirrored in the integration suite.

---

## 7. Out of scope for THIS screen (note only)

- **05B Diagnóstico** (`Problema_Diagnosticado`, `Afetado`, `Knowledge_Case`, `min_calculo`, conversa router) was added in a parallel session — it is **screen 05B**, not 01. Not tracked here.
- **Money/Tickets ownership**: P1 only EXHIBITS/links (`BR-9/10/11`); the real money attribution (P3/P11) and ticket classification (Feature B / Support) are owned elsewhere — correct as-is.
