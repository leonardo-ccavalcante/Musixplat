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
  ('window_silent',       '30',   '[C]', 'leo');

-- ── Catalog: Cohort_Rule_Version (current v1 + prior v0 for anti-mezcla F-4.3 tests). ──
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

-- ── Catalog: Named_Query defs (deterministic SQL, never LLM, 04 §2). ──
insert into catalog."Named_Query"(def_version, formula, periodicity, group_by, source_ref, unit) values
  ('nq_rank_recurrence_v1',
   'recurrence = count(distinct date_trunc(''week'', order_date)) over orders ok; rank within cohort',
   'weekly', 'cohort', 'tenant.Order', 'percentile'),
  ('nq_kpi_recurrence_v1',
   'avg(net_value ok) per restaurant, aggregated to cohort',
   'weekly', 'cohort', 'tenant.Order', 'BRL');

-- ── tenant.KPI defs (target = config [C]; current_value is a RESULT → NULL). ──
insert into tenant."KPI"(kpi_id, tenant_id, restaurant_id, level, class, kpi_def_version, target, provenance) values
  ('kpi_recurrence', 'POOL-001', null, 'company', 'performance', 'nq_kpi_recurrence_v1', 0.70, '[C]');

-- ── gov.User (two pools → exercises the RLS guard + cross-pool block). ──
insert into gov."User"(user_id, tenant_id, org_level, role) values
  ('U-OP-001', 'POOL-001', 'team', 'agent_manager_senior'),
  ('U-OP-002', 'POOL-002', 'team', 'agent_manager_senior');

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
