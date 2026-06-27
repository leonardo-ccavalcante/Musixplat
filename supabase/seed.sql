-- ============================================================================
-- SEED — RAW ONLY (04 §6, §14). Populates ONLY raw business inputs + catalog/config.
-- Every RESULT (percentile, gap, baselines, n_accounts, delta_status, current_value, connection RATIO,
-- upside, ...) stays NULL/empty until its producer runs. pnpm test:antifake fails if broken.
--
-- MODEL v2 (Leo ratified 2026-06-18): 5000 restaurants; cohort axes = cuisine × zone × tier;
-- operational signals (connection hours, cancelled_by, discount, quality photo/description) GENERATED
-- DETERMINISTICALLY with the real correlations Leo described:
--   quality↑ → sales↑ · connection↑ → receives + orders · cancel↑ penalizes · each zone has its own demand
--   (→ allows detecting "good restaurant, weak zone" = a demand problem, not a supply problem).
-- Same input ⇒ same seed (reproducible). det_int lives in migration 20260617000006.
-- ============================================================================

-- ── Catalog: knobs BY NAME (CLAUDE.md §3.8). Values ratified by Leo. ──
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('k_anon_threshold',         '5',  '[V]', 'leo'),
  ('n_min_threshold',          '20', '[V]', 'leo'),
  ('tenure_border_1_months',   '3',  '[V]', 'leo'),
  ('tenure_border_2_months',   '6',  '[V]', 'leo'),
  ('tenure_border_3_months',   '12', '[V]', 'leo'),
  ('TTL_baseline_days',        '7',  '[C]', 'leo'),
  ('D_dias_verde',             '14', '[C]', 'leo'),
  ('cohort_rule_version_current', 'v1', '[V]', 'leo'),
  ('p90_percentile_cut',      '90', '[C]', 'leo'),
  ('at_risk_percentile_max',    '25', '[C]', 'leo'),
  -- 05D Part D: weeks after an acted week to re-measure the signal (prove-it-resolved). Engineering default.
  ('resolution_verify_window',   '1',  '[I]', 'leo'),
  -- MODEL v2 composite-ranking weights (Leo ratified 2026-06-18) — read BY NAME, never literals.
  ('weight_score_orders',        '0.40', '[V]', 'leo'),
  ('weight_score_connection',      '0.30', '[V]', 'leo'),
  ('weight_score_quality',     '0.20', '[V]', 'leo'),
  ('weight_score_cancel',        '0.10', '[V]', 'leo'),
  -- MODEL v2 upside weights (Leo ratified 2026-06-18) — factor impact on orders ([C] projection).
  ('weight_upside_connection',     '0.40', '[C]', 'leo'),
  ('weight_upside_quality',    '0.25', '[C]', 'leo'),
  ('weight_upside_cancel',       '0.20', '[C]', 'leo'),
  ('weight_upside_price',        '0.15', '[C]', 'leo')
-- idempotent: resolution_verify_window (05D Part D) is ALSO inserted by the 20260624000000 migration, so
-- on the migrate-THEN-seed path (apply-hosted hosted deploy + `supabase db reset`/test:sql) the duplicate
-- would abort the WHOLE block. Skip already-present rows (same pattern as the 05D block below). On a fresh
-- resetDb (seed-only, table truncated first) the table is empty ⇒ on-conflict never fires ⇒ every knob inserts.
on conflict (key) do nothing;

-- ── 02:BR-LOG-2 governance knob (§3.8 by name): rubber-stamp umbral in seconds. [C] engineering default;
--    Leo ratifies in the cockpit. Mirrored in migration 20260627000000 for the hosted full-reset path. ──
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('rubber_stamp_max_sec', '30', '[C]', 'leo')
on conflict (key) do nothing;

-- ── 05B Diagnosis knobs ([C] placeholders, read BY NAME). ──
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('threshold_classification',      '0.60', '[C]', 'leo'),
  ('floor_confidence_path',       '0.50', '[C]', 'leo'),
  ('cap_tree_depth',     '5',    '[C]', 'leo'),
  ('tolerance_doublecheck',    '0.05', '[C]', 'leo'),
  ('tolerance_reconciliation', '0',    '[C]', 'leo'),
  ('window_silent',       '30',   '[C]', 'leo'),
  ('monitor_cost_default', '100',  '[C]', 'leo'),
  ('cost_per_affected_default', '15',  '[I]', 'leo'),
  ('value_recovery_rate',       '0.6', '[I]', 'leo'),
  ('aht_human_touch_minutes',   '5',   '[V]', 'leo'),
  -- Take-home capacity model: explicit X/Z/team assumptions, never hidden literals in the producer.
  ('baseline_tickets_per_day',  '300', '[C]', 'leo'),
  ('baseline_team_size',        '10',  '[C]', 'leo'),
  ('operator_available_minutes','480', '[C]', 'leo'),
  ('aht_ai_absorbed_minutes',   '0.5', '[C]', 'leo'),
  ('sla_target_hours',          '24',  '[V]', 'leo'),
  -- 05D diagnosis threshold — DISTINCT from the A1 nba_connection_min_ratio ACTION policy (§3.8 by name):
  -- this decides what COUNTS as a diagnosed connection problem; the A1 knob decides when to PROPOSE reconnect.
  ('connection_min_ratio',      '0.80', '[C]', 'leo'),
  -- 05D cancellation diagnosis threshold — DISTINCT from the A6 nba_cancel_rate_max ACTION policy (§3.8 by name).
  ('cancel_rate_max',           '0.10', '[C]', 'leo'),
  ('menu_quality_min',          '0.50', '[C]', 'leo'),
  ('adoption_gap_days',         '30',   '[C]', 'leo')
-- idempotent: the 05D diagnosis knobs (connection_min_ratio, cancel_rate_max) are ALSO inserted by the
-- 20260621000006 migration (hosted-safe, Codex P1). rebuild_db.sh runs migrations THEN this seed, so this
-- block must skip the already-present rows — else the duplicate aborts the whole block (dropping window_silent
-- etc.). On a fresh resetDb (seed-only) the table is empty ⇒ on-conflict never fires; every knob inserts.
on conflict (key) do nothing;

-- ── 02 NBA action-threshold knobs ([C] placeholders — the human-approved ranges that gate autonomy,
--    read BY NAME §3.8. "value está en el mecanismo": Leo ratifies the numbers in the cockpit). ──
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('nba_connection_min_ratio',     '0.80', '[C]', 'leo'),  -- A1: connection below this ⇒ propose reconnect
  ('nba_price_premium_max_pctile', '0.75', '[C]', 'leo'),  -- A2: price above this cohort percentile ⇒ review price
  ('nba_promo_budget_max',         '0',    '[C]', 'leo'),  -- A3: auto-promo budget = 0 ⇒ nothing auto (BR-2/§3.3, human releases money)
  ('nba_menu_quality_min',         '0.50', '[C]', 'leo'),  -- A4: menu quality below this ⇒ improve menu
  ('nba_zone_demand_drop_max',     '0.20', '[C]', 'leo'),  -- A5: zone demand drop beyond this ⇒ local demand (not the restaurant's fault)
  ('nba_cancel_rate_max',          '0.10', '[C]', 'leo'),  -- A6: restaurant-side cancel rate above this ⇒ ops fix
  ('nba_fraud_pattern_max',        '0.05', '[C]', 'leo');  -- A7: customer-side cancel rate above this ⇒ fraud/risk review (money)

-- ── Catalog: Cohort_Rule_Version (current v1 + prior v0 for anti-mix F-4.3 tests). ──
insert into catalog."Cohort_Rule_Version"(version_id, effective_date, what_changed, baseline_effect, provenance) values
  ('v0', date '2026-01-01', 'initial bucket rule', 'baseline v0', '[C]'),
  ('v1', date '2026-06-01', 'tenure border adjustment', 'rebaseline v1', '[V]');

-- ── Catalog: Intent_Catalog (v2: + menu, order_review, cancellation per Leo). ──
insert into catalog."Intent_Catalog"(intent_id, label, version) values
  ('billing',      'Billing / payments', 'v1'),
  ('delivery',     'Delivery',           'v1'),
  ('quality',      'Quality',            'v1'),
  ('promo',        'Promotions',         'v1'),
  ('menu',         'Menu issues',        'v1'),
  ('order_review', 'Order review',       'v1'),
  ('cancellation', 'Order cancellation', 'v1');

-- ── Catalog: NBA_Catalogo (closed A1-A8 + no-act; the Autonomy Cockpit's action set, 02 §1A). Reference
--    data, NOT a §14 result. financial_class='direct' (A3,A7) = money gate (BR-2/§3.3). Knobs BY NAME. ──
insert into catalog."NBA_Catalogo"
  (code, label, funnel_stage, financial_class, root_cause_signal, threshold_knob, default_nba_request, action_hint) values
  ('A1','Increase connection',      'availability',  'none',    'm_connection',           'nba_connection_min_ratio',     'LOW','nudge to connect committed hours'),
  ('A2','Review price vs peers',    'attractiveness','indirect','price_pctile_in_cohort', 'nba_price_premium_max_pctile', 'LOW','price recommendation (propose only)'),
  ('A3','Propose promo/bonus',      'attractiveness','direct',  'price_pctile_in_cohort', 'nba_promo_budget_max',         'LOW','AI proposes promo; human releases the money (BR-2/§3.3)'),
  ('A4','Improve menu',             'attractiveness','none',    'm_quality',              'nba_menu_quality_min',         'LOW','menu quality checklist (photo + description)'),
  ('A5','Stimulate local demand',   'demand',        'indirect','zone_demand_trend',      'nba_zone_demand_drop_max',     'LOW','signal to local growth/marketing (not the restaurant''s fault)'),
  ('A6','Resolve cancellation ops', 'fulfillment',   'none',    'cancel_by_restaurant',   'nba_cancel_rate_max',          'LOW','operations ticket for the cancel cause'),
  ('A7','Investigate fraud/risk',   'integrity',     'direct',  'cancel_by_customer',     'nba_fraud_pattern_max',        'LOW','escalate to human risk/fraud review (money at stake)'),
  ('A8','Observation (no action)',  'fallback',      'none',    null,                     null,                           'LOW','fail-closed: no attributable cause — do not invent one');

-- 03:NBA-TEST contract metadata for fn_nba_test (mig 20260618170000). standard_knob = the MEASUREMENT
-- standard; for A3 it is the price knob (its threshold_knob nba_promo_budget_max=0 is a MONEY gate, not
-- a measurement line — A3 reuses A2's price diagnosis). signal_scale normalizes (price_pctile 0-100 vs
-- a 0-1 knob). standard_negate (A5): the problem is a DROP >= knob ⇒ compare vs -(knob). A8 stays NULL
-- (no signal/knob) ⇒ fn_nba_test returns no_data.
update catalog."NBA_Catalogo" c set
  standard_knob   = v.standard_knob,
  verdict_sense   = v.verdict_sense,
  signal_scale    = v.signal_scale,
  standard_negate = v.standard_negate
from (values
  ('A1','nba_connection_min_ratio',     'below', 1::numeric,   false),
  ('A2','nba_price_premium_max_pctile', 'above', 100::numeric, false),
  ('A3','nba_price_premium_max_pctile', 'above', 100::numeric, false),
  ('A4','nba_menu_quality_min',         'below', 1::numeric,   false),
  ('A5','nba_zone_demand_drop_max',     'below', 1::numeric,   true),
  ('A6','nba_cancel_rate_max',          'above', 1::numeric,   false),
  ('A7','nba_fraud_pattern_max',        'above', 1::numeric,   false)
) as v(code, standard_knob, verdict_sense, signal_scale, standard_negate)
where c.code = v.code;

-- 02:DETAIL-A1 — definition fields (playbook = the path; created_at = the day the closed catalog was
-- defined, mig 20260618). English (§0). Reference data, not a §14 result.
update catalog."NBA_Catalogo" c set
  created_at = '2026-06-18'::timestamptz,
  playbook   = v.playbook
from (values
  ('A1','1) Detect a connection drop (connected ÷ committed hours below the minimum). 2) Nudge the restaurant to reconnect during committed hours. 3) Re-check connection next week.'),
  ('A2','1) Compare the restaurant''s price against same-cohort peers. 2) Propose a price adjustment (propose only). 3) Human decides.'),
  ('A3','1) Detect low attractiveness driven by price. 2) Propose a promo/bonus. 3) A HUMAN releases the money (financial hard-no, BR-2).'),
  ('A4','1) Detect low menu quality (photo/description). 2) Open a menu-quality checklist. 3) Re-check.'),
  ('A5','1) Detect a demand drop in the zone (not the restaurant''s fault). 2) Signal local growth/marketing. 3) Track the trend.'),
  ('A6','1) Detect high restaurant-side cancellations. 2) Open an ops ticket for the cancel cause. 3) Re-check.'),
  ('A7','1) Detect a customer-side cancellation pattern (risk/fraud). 2) Escalate to human risk/fraud review (money at stake). 3) Human decides.'),
  ('A8','No attributable cause — observe. Fail-closed: never invent a cause.')
) as v(code, playbook)
where c.code = v.code;

-- ── Catalog: Named_Query defs (deterministic SQL, never LLM, 04 §2). ──
insert into catalog."Named_Query"(def_version, formula, periodicity, group_by, source_ref, unit) values
  ('nq_rank_recurrence_v1',
   'recurrence = count(distinct date_trunc(''week'', order_date)) over orders ok; rank within cohort',
   'weekly', 'cohort', 'tenant.Order', 'percentile'),
  ('nq_kpi_recurrence_v1',
   'avg(net_value ok) per restaurant, aggregated to cohort',
   'weekly', 'cohort', 'tenant.Order', 'EUR');

-- ── tenant.KPI defs (target = config [C]; current_value is a RESULT → NULL). ──
insert into tenant."KPI"(kpi_id, tenant_id, restaurant_id, level, class, kpi_def_version, target, provenance) values
  ('kpi_recurrence', 'POOL-001', null, 'company', 'performance', 'nq_kpi_recurrence_v1', 0.70, '[C]');

-- ── gov.User (three pools → exercises the RLS guard + cross-pool block). ──
-- U-PAY-001 / POOL-PAY is the dedicated Support·Diagnosis operator. Its 47/35 reverse-cascade DATA is
-- produced later by db:05b / the in-UI Run-flow (never seeded — §14), but the IDENTITY is seeded HERE so
-- dev-login always resolves it (local fresh, hosted, CI) — otherwise the Diagnosis/Cost/Knowledge/Health
-- screens 401 on a deploy that never ran scenario_pay. scenario_pay re-asserts these with on-conflict-do-
-- nothing, so staging stays idempotent and never reassigns the pool.
insert into gov."User"(user_id, tenant_id, org_level, role) values
  ('U-OP-001', 'POOL-001', 'team', 'agent_manager_senior'),
  ('U-OP-002', 'POOL-002', 'team', 'agent_manager_senior'),
  ('U-PAY-001', 'POOL-PAY', 'team', 'agent_manager_senior');

-- AI agent actors (one per pool): the NBA proposer. Distinct from the human operator so the
-- Release_Batch 4-eyes CHECK (proposer_id <> operator_id) + Decision_Trace independence hold when a
-- human releases an AI-proposed NBA (02:1C / BR-9 / BR-11). Config rows, not a §14 result.
insert into gov."User"(user_id, tenant_id, org_level, role) values
  ('U-AI-001', 'POOL-001', 'team', 'ai_agent'),
  ('U-AI-002', 'POOL-002', 'team', 'ai_agent'),
  ('U-PAY-001-AI', 'POOL-PAY', 'team', 'ai_agent');

-- ── Business base (Restaurant + Order + Weekly_Connection + Conversation_Episode): 5000 restaurants,
--    deterministic via fn_generate_business_base (DRY — the demo "generate example" button reuses it). ──
-- Demo-freshness vs test-determinism: BOTH the order base and the usage-event recency now read ONE clock,
-- public.fn_demo_ref() (= the `app.demo_ref` GUC when set, else current_date) — so they can never drift
-- apart again (the old bug: base frozen at 2026-06-17 while usage = current_date ⇒ board ages out). resetDb
-- (tests) sets the GUC to 2026-06-17 ⇒ deterministic; apply-hosted + `supabase db reset` leave it unset ⇒
-- current_date ⇒ the prod/demo base tracks TODAY and never goes stale.
select public.fn_generate_business_base(5000, public.fn_demo_ref());
-- 05D adoption: the platform feature-usage recency signal (Usage_Event) for the base restaurants, so the
-- adoption diagnosis sees a REAL non-adopting population (~30%) — same clock as the base (fn_demo_ref).
select public.fn_seed_usage_events(public.fn_demo_ref());

-- ── P06 Knowledge Base / RAG: knobs BY NAME (CLAUDE.md §3.8, [C] config). ──
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('kb_chunk_size',              '1200', '[C]', 'p06'),
  ('kb_chunk_overlap',           '150',  '[C]', 'p06'),
  ('kb_retrieval_top_k',         '5',    '[C]', 'p06'),
  ('kb_similarity_threshold',    '0.30', '[C]', 'p06'),
  ('kb_classification_floor',    '0.55', '[C]', 'p06')
on conflict (key) do nothing;

-- ── P07 LLM token PRICES: USD per 1,000,000 tokens, BY NAME per model (§3.8, [C] config). Cost is
--    derived in gov.v_llm_cost (never seeded). Update these as vendor pricing changes / on OpenRouter. ──
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('llm_price_in_per_mtok:gpt-4o-mini',             '0.15', '[C]', 'cost'),
  ('llm_price_out_per_mtok:gpt-4o-mini',            '0.60', '[C]', 'cost'),
  ('llm_price_in_per_mtok:text-embedding-3-small',  '0.02', '[C]', 'cost'),
  ('llm_price_out_per_mtok:text-embedding-3-small', '0',    '[C]', 'cost')
on conflict (key) do nothing;

-- ── 02C MOTOR-LLM knobs (§3.8 by-name). [C] config, not RESULTs ⇒ seeding allowed (§14). The motor's
--    approved action set lives per-tier in Policy_Tier.allowed_today.auto_actions; this default is what the
--    Autonomy Controls panel seeds into a tier that has none (A1,A4,A6 = the non-money LOW levers). ──
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('motor_max_loops',               '3',        '[C]', 'leo'),
  ('motor_min_confidence',          '0.6',      '[C]', 'leo'),
  ('motor_allowed_actions_default', 'A1,A4,A6', '[C]', 'leo')
on conflict (key) do nothing;

-- ── EPIC-B4 eval-evaluator thresholds (§3.8 by-name). [C] config, not RESULTs ⇒ seeding allowed (§14).
--    The status gate (server/eval/runEval.ts) reads these by name; a missing knob ⇒ NaN ⇒ status red
--    (fail-closed §3.7). Mirrored in the migration (hosted full-reset path); both use on-conflict-do-nothing
--    so an operator-tuned value is never clobbered. ──
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('eval_pass_threshold', '0.80', '[C]', 'b4'),   -- min pass_rate (AI label == correct_label)
  ('eval_min_n',          '30',   '[C]', 'b4'),   -- min golden cases graded (archive: >=30/root-cause)
  ('eval_kappa_min',      '0.60', '[C]', 'b4')    -- min Fleiss κ (substantial judge agreement)
on conflict (key) do nothing;
