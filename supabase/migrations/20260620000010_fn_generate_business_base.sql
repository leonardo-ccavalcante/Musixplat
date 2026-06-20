-- DRY extraction of the seed's 4 business-base inserts.
-- Same (p_n, p_ref) => identical output to seed.sql (verbatim SQL, only generate_series(1,5000) →
-- generate_series(1,p_n) and literal date '2026-06-17' → p_ref substituted).
-- RESULT columns (tenure_months etc.) stay NULL (§14 anti-fake).
-- Reused by: supabase/seed.sql (calls with 5000, '2026-06-17') + the demo "generate example" button.
create or replace function public.fn_generate_business_base(p_n int, p_ref date default date '2026-06-17')
returns void language plpgsql as $$
begin

-- ── tenant.Restaurant: p_n restaurants. Cohort axes = cuisine × zone × tier. ~5% managed/95% long_tail;
--    ~10% POOL-002. signup_date spread 0-23m. tenure_months stays NULL (RESULT, F-1.1). ──
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date,
                                 zone, cuisine, committed_hours_week, live_attributes)
select s.rid,
       case when s.rid = 'R001' then 'POOL-001'                         -- test anchor pinned to POOL-001
            when public.det_int(s.rid, 7, 100) < 10 then 'POOL-002' else 'POOL-001' end,
       s.tier, s.seg,
       p_ref - (public.det_int(s.rid, 11, 24) || ' months')::interval,
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
        from generate_series(1, p_n) g) ids
) s;

-- ── tenant.Order: volume CORRELATED with connection/quality/zone-demand, penalised by cancel.
--    payment_status: 'ok'=delivered · 'failed'=cancelled (cancelled_by restaurant|customer) · 'pending'.
--    photo/description ~ Bernoulli(quality). discount on ~25% of orders. net_value is GENERATED.
--    Each per-order det_int draw is computed ONCE (perf: keeps the per-suite reset fast). ──
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, cancelled_by,
                           discount_pct, has_photo, has_description, zone, cuisine, channel, provenance)
select r.restaurant_id,
       p_ref - raw.r21,
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
       (date_trunc('week', p_ref)::date - (w * 7)),
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
       (p_ref - public.det_int(r.restaurant_id || ':' || c, 44, 60))::timestamptz,  -- spread last 60d (windowable)
       jsonb_build_object('raw', 'redacted transcript ' || c)
from tenant."Restaurant" r
cross join lateral generate_series(1, 1 + public.det_int(r.restaurant_id, 42, 5)) c
where public.det_int(r.restaurant_id, 43, 100) < 35;

end;
$$;
