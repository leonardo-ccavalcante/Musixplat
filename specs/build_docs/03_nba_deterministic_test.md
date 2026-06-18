# 03:NBA-TEST — deterministic "measure result vs standard" + the AI's which-test selection · [target: CÓDIGO (test fn) + AGENTE (selection prompt)] [build: Claude+Codex-review]

> Slice 3 of the NBA feature (Leo ratified 2026-06-18). **Open this in a fresh session** — anchor on this
> doc + `specs/build_docs/02_nba_catalog_signals.md` (slice 1+2, on `main`) + `specs/build_docs/01_nba_issue_tree.md`.
> Builds on `catalog."NBA_Catalogo"` (codes + `root_cause_signal` + `threshold_knob`) and the membership
> signals (`m_connection`, `price_pctile_in_cohort`, `m_quality`, `cancel_by_restaurant/customer`, `zone_demand_trend`).

> **PART OF — `specs/spec_ready/02_NBA Playbooks best actions screen.md` (Cockpit de Gobernanza de Autonomía).**

## The decision this slice encodes (Leo, verbatim intent)

- **The funnel CHOICE is the AI's job** (AGENTE) — it *collects hypotheses* and *walks the funnel*. CÓDIGO does
  NOT pick the action.
- **What MUST be deterministic is the TEST the AI calls:** the AI proposes a hypothesis, then **calls a
  deterministic function that measures the result and compares the measured number against the standard** —
  pure SQL, **never the AI inventing the number** (§14 / §3.6). The AI may **interpret afterward, only within
  the range the function returns** (it cannot claim beyond the measured verdict).
- **Grounded in the metrics we ALREADY have — no off-model analysis (Leo, §4 reuse-first):** the test is NOT
  a new analysis. It is bounded to, and REUSES, what already exists: **(a) what is measured** (the signals
  `m_orders/m_connection/m_quality/m_cancel`, `percentile_in_cohort`, `price_pctile_in_cohort`, the cancel
  split, `zone_demand_trend`), **(b) what our existing calculations use** (the composite percentile from
  `fn_rank_cohort`, the 4 KPI families from `fn_baseline_kpi`, the bands P90/P75/P25/P10 from
  `fn_descriptive_baseline`, `fn_upside`, `fn_diff_delta`/at_risk), **(c) what the NBAs use** (the catalog's
  `root_cause_signal` + `threshold_knob`). `fn_nba_test` is a **thin router over those already-structured
  functions/columns** — it does not compute a new metric. The AI's hypothesis space = exactly these metrics.

So this slice = the **deterministic test harness** the AGENTE invokes per hypothesis. It is the substrate that
makes node 1A's choice *auditable and reproducible*: same restaurant + same hypothesis + same brutos ⇒ same
verdict, every time (that is the whole point — "para esses testes precisa ser determinística").

## The AGENTE half — WHICH test to call (problem-solving + SAT), then interpret (Leo, 2026-06-18)

The AI does not call a fixed test — it must **analyze which function to call from the problem's
characteristics**, with a structured reasoning scaffold, *then* call the deterministic CÓDIGO test, *then*
interpret within range. This is an **AGENTE piece** (`02:1A`), separate from the CÓDIGO test above; §8 golden
rule holds — the AGENTE reasons/selects/interprets **text**, the NUMBER is always `fn_nba_test` (CÓDIGO),
never fabricated.

Required protocol (Leo-specified):
1. **/problem-solving (McKinsey)** — structure the underperformance into the MECE funnel issue-tree
   (`01_nba_issue_tree.md`) and produce **up to 3 MECE lines of investigation (hypotheses), RANKED by
   probability** (availability → attractiveness → demand → fulfillment → integrity). **HARD CAP = 3** — cost
   control: no unbounded hypothesis generation / token burn.
2. **Sequential elimination, carrying forward (≤3 rounds)** — test the **highest-probability** hypothesis
   first by calling `fn_nba_test`:
   - verdict CONFIRMS → that is the lever; proceed there.
   - verdict DISCONFIRMS → **discard it** (record it) and move to the 2nd, then the 3rd — each step **never
     re-tests a discarded branch** (carry-forward elimination).
3. **/sat check (CIA Tradecraft) at each branch** — Key Assumptions Check + Analysis of Competing Hypotheses
   so the ranking isn't biased. The canonical trap: "low orders" = *attractiveness* (A2-A4, the restaurant's
   fault) vs *demand/zone* (A5, **not** its fault). ACH uses the deterministic verdicts to keep the cause whose
   competitors are most disconfirmed.
4. **Terminate after ≤3 rounds — never loop:** if a hypothesis confirms, interpret within range and propose
   its action (A1-A7). If **all 3 are disconfirmed** (or `no_data`), **ESCALATE TO HUMAN** —
   `outcome='escalated'` in Knowledge_Case (+ the 3 `discarded_branches` + `not_resolved_reason`), never invent
   a cause and **never generate a 4th hypothesis**. This is both §3.7 fail-closed AND the cost discipline Leo
   set: 3 rounds is the budget; beyond it the token spend isn't worth it, so the human takes the case. (A8 is
   the catalog code for this non-attributable terminal; it routes to the human, not a silent no-op.)

**TRACE (mandatory — this is how we track the AI learning):** persist the FULL step-by-step of every
investigation to `tenant."Knowledge_Case"` (built in 05B, this session): `caminho_usado` = the ordered path
taken; `discarded_branches` = the hypotheses ruled out + why; `outcome` (resolved/not_resolved/escalated —
MEASURED ⇒ [V]/[I]) + `resolucao` / `not_resolved_reason` (AI text ⇒ [C], human-gated `revisado=false`).

**IMPROVEMENT LOOP (continuous — after EVERY solution):** review the saved trace to find which step was the
wrong one and feed it back — next time **prune the dead branches** (`discarded_branches` → don't re-propose)
and **replicate the resolved paths** (`caminho_usado`). This is exactly the `Knowledge_Case` convergence
(NEGATIVE polarity pruned, POSITIVE polarity replicated) — the loop converges, never oscillates. The "where it
failed" narrative is AI text (human-gated); the `outcome` that drives it is MEASURED (deterministic, §14).

This AGENTE engine (problem-solving ≥3-hypothesis elimination + SAT gate + `Knowledge_Case` trace + improvement
loop) is its own deliverable (`[target: AGENTE]`); it CONSUMES the CÓDIGO `fn_nba_test` below and the 05B
`Knowledge_Case` store. Whether it ships in the same fresh session or the next is a scope call for that session.

## Functionality

- **Goal:** a deterministic, side-effect-free function `cohort.fn_nba_test(restaurant_id, action_code, week)`
  that measures the restaurant's result on that action's dimension and returns it **against the standard** —
  the facts the AGENTE tests its hypotheses against (and that the cockpit shows as before/after-vs-KPI).
- **Composes / cites:** `NBA_Catalogo` (slice 1 — `root_cause_signal` + `threshold_knob` drive the test),
  membership signals (slice 2), `knob_required_num` (fail-closed knob read), `fn_descriptive_baseline`
  (cohort bands, the "vs peers" standard). Consumed by the AGENTE `02:1A` + the cockpit (F-1.1 before/after).
  **04 §:** §2/§14 (deterministic, no fabricated number), §3.6 (LLM proposes text, never a number), §3.8
  (standard read BY NAME), §3.2 (k-anon at the frontier).
- **Contract:**
  - TRIGGER-IN: the AGENTE calls it per hypothesis (read-only function; no trigger, no write).
  - DATA-IN: `NBA_Catalogo[action_code].{root_cause_signal, threshold_knob}`; the membership signal for that
    restaurant/week; the knob value (and/or the cohort band).
  - DATA-OUT (return value, NOT a stored result): a deterministic verdict object —
    `{ dimension, measured, standard, verdict ∈ {below|ok|above|no_data}, gap, within_range, n_min_ok,
      k_anon_ok, provenance:'[V]' }`. **No table write** — it's a measurement function (§14: it READS brutos-
    derived signals, never seeds a result).
  - TRIGGERS-FIRED: none (pure function).
- **Workflow — runtime (per hypothesis the AI tests):**
  1. AGENTE proposes a hypothesis = "is `action_code` the lever for restaurant R this week?".
  2. `fn_nba_test(R, action_code, week)` → look up the action's `root_cause_signal` + `threshold_knob` in the
     catalog → fetch R's measured signal (slice 2) + the standard (knob via `knob_required_num`, and/or the
     cohort band) → **gate**: if the signal is NULL (incomplete brutos) ⇒ `verdict='no_data'` (conservative,
     never a fabricated below/ok); honor k_anon/n_min (qualitative when the cohort cell is suppressed).
  3. compute `measured` vs `standard` → `verdict` + `gap` + `within_range` (deterministic comparison only).
  4. return the verdict object. The AGENTE interprets it as TEXT, **bounded by `within_range`** — it cannot
     assert a number the function didn't return (§3.6).
- **Constraints (CLAUDE.md §3 + Cockpit BRs):** §14 no fabricated number / no-data is conservative;
  §2/§3.6 deterministic measurement, LLM only interprets text within range; §3.8 standard BY NAME (no
  literal); §3.2/BR-12 k-anon — a verdict that would identify one restaurant's campaign is suppressed;
  determinism: same (R, action_code, brutos) ⇒ identical verdict.
- **Done-when:**
  - *Given* a ranked restaurant + an action_code, *When* `fn_nba_test` is called, *Then* it returns the
    measured signal, the named standard, a verdict, and the gap — and calling it twice on the same brutos
    returns byte-identical results.
  - *Given* a restaurant with incomplete brutos (signal NULL), *When* tested, *Then* `verdict='no_data'`
    (never a fabricated below/ok) — §14 fail-closed.
  - *Given* a cohort cell below k-anon, *When* tested, *Then* the verdict is suppressed/qualitative (§3.2).
  - **Check ejecutable:** `pnpm test:integration` (determinism + §14 no-data + each catalog dimension maps
    to a real signal+standard + k-anon suppression). `pnpm typecheck` for the tRPC/Zod wrapper if exposed.

## Design

- No screen in this slice. If exposed to the AGENTE over tRPC, add a thin read-only procedure
  (`nba.test`) with a Zod output schema mirroring the verdict object; `tenant_id` server-side (§3.4).
- The cockpit (slice 4) will render the verdict as the row's "before/after vs KPI" + the limiting arm.

## Data

- **Tables read (`04 §3`):** `catalog."NBA_Catalogo"`, `catalog."Config_Knobs"`,
  `cohort."Cohort_Membership_Snapshot"` (signals), optionally `cohort."Cohort"` bands /
  `fn_descriptive_baseline` output. **Writes nothing.**
- **dimension → (signal, standard) mapping** (driven by the catalog, not hardcoded):

  | action | signal (membership) | standard (knob) | verdict sense |
  |---|---|---|---|
  | A1 | m_connection | nba_connection_min_ratio | below = problem |
  | A2/A3 | price_pctile_in_cohort | nba_price_premium_max_pctile | above = problem |
  | A4 | m_quality | nba_menu_quality_min | below = problem |
  | A5 | zone_demand_trend | nba_zone_demand_drop_max | below (drop) = local, not the restaurant |
  | A6 | cancel_by_restaurant | nba_cancel_rate_max | above = problem |
  | A7 | cancel_by_customer | nba_fraud_pattern_max | above = problem |
  | A8 | (none) | (none) | always 'no_data' / fallback |

- **§14:** returns measured numbers (from the already-computed signals) + the standard; NULL signal ⇒
  `no_data`. No new stored result column; nothing seeded.
- **Determinism:** pure function over committed brutos-derived signals + knobs ⇒ reproducible (the test).

## Open decisions for the fresh session (`[I]` — confirm with Leo before coding)

1. **Standard = knob, or cohort band, or both?** The table above uses the **knob** (fixed human threshold).
   Some dimensions are naturally "vs peers" (price is already a cohort percentile). Decide per dimension
   whether the standard is the knob, the cohort band (`fn_descriptive_baseline` P50/P75), or both reported.
2. **Return shape:** single-dimension `fn_nba_test(R, action_code, week)` vs a multi-dimension
   `fn_nba_test_all(R, week)` returning every dimension's verdict in one call (likely both — the AI may
   want the whole funnel at once).
3. **Exposure:** SQL-only (AGENTE calls via the runtime) vs a tRPC `nba.test` procedure (if the AGENTE runs
   in TS). Match the actual `02:1A` runtime in `breakdown_N8N.md`.
4. **Out of scope here (later loop):** the **post-action** "result vs standard" (did the chosen action move
   the KPI? = Eval / ROI attribution, holdout/pre-post) — that is the spec's EPIC-3 / ROI, marked `[I]`/`[C]`,
   a separate slice. This slice is the **pre-action** measurement the AI tests hypotheses against.
5. **`min()` autonomy gate** (`nivel_efectivo = min(nba_request, released_evals, tier_cap)` + auto_liberable
   + financial/cross-tenant/k-anon gates) is the **next CÓDIGO slice** (operates on the NBA_Proposal the AI
   writes); confirm whether it joins this slice or is slice 3b.
