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
  -- MODEL v2 composite-ranking weights (Leo ratified 2026-06-18) — read BY NAME, never literals.
  ('weight_score_orders',        '0.40', '[V]', 'leo'),
  ('weight_score_connection',      '0.30', '[V]', 'leo'),
  ('weight_score_quality',     '0.20', '[V]', 'leo'),
  ('weight_score_cancel',        '0.10', '[V]', 'leo'),
  -- MODEL v2 upside weights (Leo ratified 2026-06-18) — factor impact on orders ([C] projection).
  ('weight_upside_connection',     '0.40', '[C]', 'leo'),
  ('weight_upside_quality',    '0.25', '[C]', 'leo'),
  ('weight_upside_cancel',       '0.20', '[C]', 'leo'),
  ('weight_upside_price',        '0.15', '[C]', 'leo');

-- ── 05B Diagnosis knobs ([C] placeholders, read BY NAME). ──
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('threshold_classification',      '0.60', '[C]', 'leo'),
  ('floor_confidence_path',       '0.50', '[C]', 'leo'),
  ('cap_tree_depth',     '5',    '[C]', 'leo'),
  ('tolerance_doublecheck',    '0.05', '[C]', 'leo'),
  ('tolerance_reconciliation', '0',    '[C]', 'leo'),
  ('window_silent',       '30',   '[C]', 'leo'),
  ('monitor_cost_default', '100',  '[C]', 'leo');

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

-- ── gov.User (two pools → exercises the RLS guard + cross-pool block). ──
insert into gov."User"(user_id, tenant_id, org_level, role) values
  ('U-OP-001', 'POOL-001', 'team', 'agent_manager_senior'),
  ('U-OP-002', 'POOL-002', 'team', 'agent_manager_senior');

-- AI agent actors (one per pool): the NBA proposer. Distinct from the human operator so the
-- Release_Batch 4-eyes CHECK (proposer_id <> operator_id) + Decision_Trace independence hold when a
-- human releases an AI-proposed NBA (02:1C / BR-9 / BR-11). Config rows, not a §14 result.
insert into gov."User"(user_id, tenant_id, org_level, role) values
  ('U-AI-001', 'POOL-001', 'team', 'ai_agent'),
  ('U-AI-002', 'POOL-002', 'team', 'ai_agent');

-- ── tenant.Restaurant: 5000. Cohort axes = cuisine × zone × tier. ~5% managed/95% long_tail;
--    ~10% POOL-002. signup_date spread 0-23m. tenure_months stays NULL (RESULT, F-1.1). ──
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date,
                                 zone, cuisine, committed_hours_week, live_attributes)
select s.rid,
       case when s.rid = 'R001' then 'POOL-001'                         -- test anchor pinned to POOL-001
            when public.det_int(s.rid, 7, 100) < 10 then 'POOL-002' else 'POOL-001' end,
       s.tier, s.seg,
       date '2026-06-17' - (public.det_int(s.rid, 11, 24) || ' months')::interval,
       s.zone, s.tipo,
       (40 + public.det_int(s.rid, 8, 41))::numeric(6,2),         -- 40..80 committed hours/week
       jsonb_build_object('timezone', 'America/Sao_Paulo', 'window', 'night')
from (
  select rid,
         (array['downtown','north','south','east','west','southeast','northwest','coast'])[1 + public.det_int(rid, 5, 8)] as zone,
         (array['pizza','sushi','burger','brazilian','healthy','desserts'])[1 + public.det_int(rid, 6, 6)] as tipo,
         case when public.det_int(rid, 3, 1000) < 30 then 'managed_brand'::public.tier_base
              when public.det_int(rid, 3, 1000) < 50 then 'managed_midmarket'::public.tier_base
              else 'long_tail'::public.tier_base end as tier,
         case when public.det_int(rid, 3, 1000) < 50 then 'managed'::public.segment
              else 'long_tail'::public.segment end as seg
  -- g=1 ⇒ 'R001' (legacy test anchor, used by 05A/05B + handoff fixtures); rest ⇒ R0002..R5000.
  -- (lpad to 4: 5000 needs 4 digits; lpad truncates if width<digits, so width must be 4.)
  from (select case when g = 1 then 'R001' else 'R' || lpad(g::text, 4, '0') end as rid
        from generate_series(1, 5000) g) ids
) s;

-- ── tenant.Order: volume CORRELATED with connection/quality/zone-demand, penalised by cancel.
--    payment_status: 'ok'=delivered · 'failed'=cancelled (cancelled_by restaurant|customer) · 'pending'.
--    photo/description ~ Bernoulli(quality). discount on ~25% of orders. net_value is GENERATED.
--    Each per-order det_int draw is computed ONCE (perf: keeps the per-suite reset fast). ──
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, cancelled_by,
                           discount_pct, has_photo, has_description, zone, cuisine, channel, provenance)
select r.restaurant_id,
       date '2026-06-17' - raw.r21,
       raw.v, round(raw.v * 0.20, 2),
       case when raw.r22 < r.p_cancel     then 'failed'::public.payment_status
            when raw.r22 < r.p_cancel + 4 then 'pending'::public.payment_status
            else 'ok'::public.payment_status end,
       case when raw.r22 < r.p_cancel
              then (case when raw.r25 < 65 then 'restaurant' else 'customer' end)::public.cancelled_by
            else null end,
       case when raw.r28 < 25 then (10 + raw.r29)::numeric(5,2) else 0 end,    -- discount 10..40% on ~25%
       raw.r26 < r.q,                                                           -- has_photo ~ P(quality)
       raw.r27 < r.q,                                                           -- has_description ~ P(quality)
       r.zone, r.cuisine, 'app', '[V]'
from (
  select rest.restaurant_id, rest.zone, rest.cuisine,
         public.det_int(rest.restaurant_id, 51, 101) as q,                     -- quality 0..100
         round(public.det_int(rest.restaurant_id, 53, 101) * 0.4) as p_cancel, -- cancel band 0..40%
         (6 + round(                                                            -- n_orders ~ 6..36 (avg ~18)
              ( 0.35 * public.det_int(rest.restaurant_id, 52, 101)             -- connection
              + 0.25 * (40 + public.det_int(rest.zone, 71, 51))                 -- zone demand
              + 0.20 * public.det_int(rest.restaurant_id, 51, 101)             -- quality
              + 0.20 * (100 - public.det_int(rest.restaurant_id, 53, 101))     -- (less cancel)
              ) * 0.30
           ))::int as n_orders,
         case rest.tier_base when 'managed_brand' then 40 when 'managed_midmarket' then 20 else 0 end as tier_bonus
  from tenant."Restaurant" rest
) r
cross join lateral generate_series(1, r.n_orders) g
cross join lateral (
  select public.det_int(r.restaurant_id || ':' || g, 21, 90)                       as r21,
         (20 + r.tier_bonus + public.det_int(r.restaurant_id || ':' || g, 24, 80))::numeric(12,2) as v,
         public.det_int(r.restaurant_id || ':' || g, 22, 100)                      as r22,
         public.det_int(r.restaurant_id || ':' || g, 25, 100)                      as r25,
         public.det_int(r.restaurant_id || ':' || g, 26, 100)                      as r26,
         public.det_int(r.restaurant_id || ':' || g, 27, 100)                      as r27,
         public.det_int(r.restaurant_id || ':' || g, 28, 100)                      as r28,
         public.det_int(r.restaurant_id || ':' || g, 29, 31)                       as r29
) raw;

-- ── tenant.Weekly_Connection: 9 weeks/restaurant. real connection = connected/committed.
--    connected_hours = committed × connection-propensity × weekly-noise, capped at committed. ──
insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
select r.restaurant_id,
       (date_trunc('week', date '2026-06-17')::date - (w * 7)),
       least(r.hp,
             round(r.hp
                   * (public.det_int(r.restaurant_id, 52, 101)::numeric / 100)            -- connection propensity
                   * ((70 + public.det_int(r.restaurant_id || ':' || w, 61, 31))::numeric / 100), -- noise 0.70..1.00
                   2)),
       r.hp
from (select restaurant_id, committed_hours_week as hp from tenant."Restaurant") r
cross join generate_series(0, 8) w;

-- ── tenant.Conversation_Episode: tickets for ~35% of restaurants (7 intents v2). metrics_layer RESULT→NULL. ──
insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent, ts, transcript_layer)
select r.restaurant_id || ':C' || c,
       r.restaurant_id || ':conv' || c,
       r.tenant_id,
       r.restaurant_id,
       (array['billing','delivery','quality','promo','menu','order_review','cancellation'])[1 + public.det_int(r.restaurant_id || ':' || c, 41, 7)],
       (date '2026-06-17' - public.det_int(r.restaurant_id || ':' || c, 44, 60))::timestamptz,  -- spread last 60d (windowable)
       jsonb_build_object('raw', 'redacted transcript ' || c)
from tenant."Restaurant" r
cross join lateral generate_series(1, 1 + public.det_int(r.restaurant_id, 42, 5)) c
where public.det_int(r.restaurant_id, 43, 100) < 35;
