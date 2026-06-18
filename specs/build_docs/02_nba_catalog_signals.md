# 02:NBA-CAT + 02:NBA-SIG — NBA catalog (A1-A8) + deterministic signals · [target: CÓDIGO] [build: Claude+Codex-review]

> Slice 1+2 of the NBA feature (Leo ratified 2026-06-18). The funnel diagnosis lives in
> `specs/build_docs/01_nba_issue_tree.md` (MECE issue tree, ratified).

> **PART OF — `specs/spec_ready/02_NBA Playbooks best actions screen.md` (Cockpit de Gobernanza de
> Autonomía).** That spec is the authoritative feature (the human `min()` tablero); this build-doc is the
> **deterministic substrate** under its workflow:
> - **Node 1A (AGENTE proposes NBAs):** reads "catálogo A1-A8 + no-act" + "señales de cuentas" → this slice
>   = `NBA_Catalogo` + the signals. Catalog is **closed**: the AI only instances, never invents (workflow §1A).
> - **Node 1C (`min()`, CÓDIGO):** `nivel_efectivo = min(nba_request, released_evals, tier_cap)`. This slice
>   supplies the **`nba_request` (pedido_NBA) arm** as the catalog's per-action `default_nba_request`, plus
>   `financial_class` (BR-2 dinero=saldo → ceiling ALTO, AUT-06). The min() itself = **slice 3** (reuse `02:1B`
>   / `min_calculation`). The **human surface** = **slice 4** = EPIC-1 bandeja (F-1.1) + liberar/pausar (F-1.2)
>   + drill-subgrupo (F-1.3) + ROI (F-1.4) — extends the existing cockpit + `Tier_Policy`.
> Vocabulary aligns to the post-#10 English schema: `gov."NBA_Proposal"` (`action_type`, `nba_request`,
> `root_cause`, `financial_class`, `risk_class`), `Tier_Policy.tier_cap`, `released_evals`.

## Functionality

- **Goal:** ship the closed `NBA_Catalogo` (A1-A8) the agent picks from, plus the deterministic
  per-restaurant signals it reads to walk the funnel — numbers always from SQL, never the LLM.
- **Composes / cites:** consumer `02:1A` (`NBA_Catalogo.codigo` + signals → `NBA_Proposal`); `01:F-5.2`
  (emits `Evento_Priorizado_NBA{cohort_id, restaurante_id}` that triggers `02:1A`); `02:1B` (min()
  autonomy); `Tier_Policy` (human ceiling = tier_cap); reuses `fn_rank_cohort` metrics. **04 §:** §3.4 (catalog),
  §2/§14 (deterministic, NULL pre-run), §7 (§3.3 financial hard-no, fail-closed), §3.8 (knobs by name),
  §3.10 (autonomy_level).
- **Contract (E2E — must match `02:1A` in `breakdown_N8N.md` lines 63-68):**
  - TRIGGER-IN: none for the catalog (static reference, seeded). Signals: read on demand by `02:1A`.
  - DATA-IN: `tenant."Order"`, `tenant."Weekly_Connection"`, `cohort."Cohort_Membership_Snapshot"`
    (reuse stored `m_orders/m_connection/m_quality/m_cancel`), `tenant."Restaurant".zone`.
  - DATA-OUT:
    - `catalog."NBA_Catalogo"{code, label, funnel_stage, financial_class, root_cause_signal,
      threshold_knob, default_nba_request, action_hint}` — **reference data** (seeded, like `Intent_Catalog`;
      NOT a §14 result column → no NULL-pre-run rule; it carries no computed numbers).
    - Signals (`Named_Query`, per restaurant within its cohort): `connection_ratio` (A1),
      `price_pctile_in_cohort` (A2/A3), `menu_quality` (A4), `zone_demand_trend` (A5),
      `cancel_rate` + `cancel_by_restaurant` / `cancel_by_user` split (A6/A7). Producer = `Named_Query`
      / job · **NULL pre-run (§14)** for any stored signal column.
  - TRIGGERS-FIRED: none (terminal data layer; `02:1A` reads it).
- **Workflow — runtime:**
  1. Migration creates `catalog."NBA_Catalogo"` + seeds the 8 rows + adds the FK
     `gov."NBA_Proposal".action_type → NBA_Catalogo.code` (clears the "catalog not built yet" defer).
  2. Signals: `Named_Query` SQL reads brutos + reuses membership metrics → **gate**: only complete-brutos
     restaurants (inner-join, no coalesce-to-0, §14) and k-anon/n_min respected via the membership row →
     **fail-closed** to NULL when data missing.
  3. Autonomy model (encoded in the catalog, enforced in slice 3): each action's `threshold_knob` names a
     `Config_Knobs` range. Agent acts autonomously when the signal is **inside** the human-approved range;
     **outside** → `autonomy_level` `least()`-floored to LOW (§3.10) → human. `financial_class=direct`
     (A3, A7 — real $$) adds the §3.3 hard-no: the agent may propose/act within range but the **money
     movement never auto-releases** → human. (No static `human_gated` column — escalation is derived.)
  4. Determinism: same brutos ⇒ same signals; catalog is fixed reference.
- **Constraints (CLAUDE.md §3 + Cockpit BRs from the spec_ready feature):** §2/§14 deterministic-never-LLM
  + NULL pre-run; §3.3 / **BR-2** financial hard-no (`direct` = moves balance ⇒ ceiling ALTO, AI proposes
  only, AUT-06); §3.8 every threshold by NAME (no literals); §3.10 `autonomy_level` ordered enum, `least()`
  fail-closed to LOW; **BR-4** the `min()` never omits an arm and fails closed to the lowest known arm;
  §3.4 / **BR-3** cross-tenant = red-block + **BR-12** k-anon (suppress when an insight would identify one
  restaurant's campaign), `tenant_id` server-side. **Catalog-closed (workflow §1A):** the AI only instances
  catalog rows, NEVER invents an action; no attributable cause ⇒ `A8` no-act (fail-closed, never guess A1-A7).
- **Done-when:**
  - *Given* a fresh db, *When* migrations + seed run, *Then* `NBA_Catalogo` has exactly 8 rows A1-A8,
    `financial_class=direct` for **A3 and A7 only**, and `NBA_Proposal.action_type` FK resolves.
  - *Given* a ranked cohort, *When* the signals run, *Then* each restaurant with complete brutos gets
    non-null signals and incomplete ones stay NULL (fail-closed), every threshold read by knob name.
  - **Check ejecutable:** `pnpm test:sql` (pgTAP: 8 rows, direct set, FK, knobs-by-name) +
    `pnpm test:integration` (signals determinism + §14 NULL-pre-run + complete-brutos gate).

## Design

- No UI in this slice (data + SQL only). The human surface (slice 4 = EPIC-1 bandeja F-1.1) **extends the
  02 cockpit** + reads the descriptive bands (`fn_descriptive_baseline` P90/P75/P25/P10) as the "result
  ranges", and writes thresholds to `Config_Knobs` / `Tier_Policy`. Noted here so `threshold_knob` names align.

## Data

- **Canonical tables (`04 §3`):** NEW `catalog."NBA_Catalogo"`; FK from existing `gov."NBA_Proposal".action_type`.
  Signals read `tenant."Order"`, `tenant."Weekly_Connection"`, `tenant."Restaurant".zone`,
  `cohort."Cohort_Membership_Snapshot"` (reuse `m_*` metrics — do NOT recompute what `fn_rank_cohort` stored).
- **The 8 rows:**

  | code | label | funnel_stage | financial_class | root_cause_signal | threshold_knob (Config_Knobs name) |
  |---|---|---|---|---|---|
  | A1 | Increase connection | availability | none | connection_ratio | `nba_connection_min_ratio` |
  | A2 | Review price vs peers | attractiveness | indirect | price_pctile_in_cohort | `nba_price_premium_max_pctile` |
  | A3 | Propose promo/bonus | attractiveness | **direct** | price_pctile_in_cohort | `nba_promo_budget_max` |
  | A4 | Improve menu (photo+desc) | attractiveness | none | menu_quality | `nba_menu_quality_min` |
  | A5 | Stimulate local demand | demand | indirect | zone_demand_trend | `nba_zone_demand_drop_max` |
  | A6 | Resolve cancellation ops | fulfillment | none | cancel_by_restaurant | `nba_cancel_rate_max` |
  | A7 | Investigate fraud/risk | integrity | **direct** | cancel_by_user | `nba_fraud_pattern_max` |
  | A8 | Observation (no action) | fallback | none | (none — fail-closed default) | (none) |

  Each row also carries `default_nba_request` (`public.autonomy_level` — seeds `NBA_Proposal.nba_request`,
  the pedido_NBA arm of the `min()`; conservative LOW by default) and `action_hint`. **A8 = the "no-act"**
  contrafactual of the closed catalog (workflow §1A "A1-A8 + no-act") — the fail-closed default when no
  cause is attributable.
- **DATA-IN → DATA-OUT:** catalog seeded (reference, no result number). Signals = `Named_Query`, every
  stored signal column NULL pre-run (§14); inner-join complete brutos, no coalesce-to-0 (the §14 lesson
  from `fn_rank`).
- **Gates:** RLS zone tenant + `tenant_id` server-side on signals; k-anon/n_min honored via the membership
  row (signals only for restaurants whose cohort passed the gates); `cohort_rule_version` carried through.
- **Config_Perillas by NAME:** the 7 `threshold_knob`s above (seeded into `Config_Knobs` with conservative
  defaults + `[C]` provenance, human-owned). No literal thresholds anywhere.
- **Phantom check (§4):** `NBA_Catalogo` is real catalog reference (NOT denylisted — `UPSIDE`,
  `MOVIMIENTO_LOG`, `SIMULACION`, `PERFIL_COHORT`, `TRANSICION_DE_COHORT` are the phantoms). ✔
- **Determinism:** same brutos + same knob values ⇒ identical signals (pgTAP + integration assert it).

## English alignment — RESOLVED by PR #10 (full-english-rename, merged 2026-06-18)

No rename burden on this slice. `main` already has `public.financial_class` (`direct/indirect/none`) and
`gov."NBA_Proposal".action_type` / `.financial_class` in English. This slice simply **reuses** that enum
and **wires the deferred FK** `NBA_Proposal.action_type → NBA_Catalogo.code`. The only stale Spanish left
is a comment ("NBA_Catalogo.codigo … catalog not built yet") which this slice rewrites when it adds the FK.
