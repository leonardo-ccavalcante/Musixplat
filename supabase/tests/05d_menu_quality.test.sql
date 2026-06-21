-- pgTAP — 05D menu_quality problem type. A FOURTH problem flows through the SAME engine: the dispatchers
-- gain a `when 'menu_quality'` case (fn_affected_menu_quality / fn_impact_menu_quality) while the
-- payment + connection + cancellation cases stay byte-identical (zero regression). 04 §3 / §7 / §8 / §14.
-- The affected anti-join + the at-risk-GMV € are SQL (no LLM, §3.6); the knob menu_quality_min is read
-- BY NAME (§3.8) — DISTINCT from the A4 action knob nba_menu_quality_min. Counts/€ PRODUCED, never seeded (§14).
--
-- Hermetic, drift-immune fixture (rolled back): orders are staged at current_date-relative dates so the
-- window (order_date >= current_date - window_silent[30]) always covers them ⇒ the pinned numbers
-- (8 affected / €2400) never drift with the calendar. 8 low-quality restaurants @ quality 0.25
-- (4 orders each: 2 photo-only=0.5, 2 neither=0.0 ⇒ avg 0.25) + 4 healthy @ quality 1.0 (both flags).
-- Every order net 100 (gross 120 − fee 20). 3 of the 8 complained ⇒ 5 SILENT. at-risk =
-- 8 × (4 orders × net 100 = 400 GMV) × (1 − 0.25 quality = 0.75 shortfall) = 8 × 300 = €2400.
begin;
select plan(8);

-- ── dispatch contract (drives the refactor): the per-type producers exist; the dispatchers route to them.
select has_function('tenant', 'fn_affected_menu_quality',
  array['uuid', 'text', 'integer', 'text'], 'fn_affected_menu_quality extracted');
select has_function('tenant', 'fn_impact_menu_quality', array['uuid'], 'fn_impact_menu_quality extracted');

-- ── menu_quality fixture (INPUTS only — counts/€ are PRODUCED, §14) ───────────────────────────────
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
select 'RMQ-'||lpad(g::text,3,'0'), 'POOL-MQ', 'long_tail', 'long_tail'::segment, date '2026-01-01',
       case when g <= 8 then 'Centro' else 'Norte' end, 'pizza', 50
  from generate_series(1,12) g;
-- LOW-quality (g<=8): 4 orders/restaurant, k in 1..2 = photo-only (0.5), k in 3..4 = neither (0.0)
--   ⇒ avg quality = (0.5+0.5+0+0)/4 = 0.25  (< menu_quality_min 0.50 ⇒ affected). net 100 each.
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, has_photo, has_description, zone)
select 'RMQ-'||lpad(g::text,3,'0'), current_date - 5, 120, 20, 'ok',
       (k <= 2), false, 'Centro'
  from generate_series(1,8) g cross join generate_series(1,4) k;
-- HEALTHY (g>=9): 4 orders/restaurant, both flags true ⇒ avg quality = 1.0 (>= 0.50 ⇒ NOT affected).
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, has_photo, has_description, zone)
select 'RMQ-'||lpad(g::text,3,'0'), current_date - 5, 120, 20, 'ok', true, true, 'Norte'
  from generate_series(9,12) g cross join generate_series(1,4) k;
-- 3 of the 8 low-quality restaurants opened a ticket ⇒ 5 SILENT (affected but never complained).
insert into catalog."Intent_Catalog"(intent_id, label) values ('menu','Menu')
  on conflict (intent_id) do nothing;
insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
select 'RMQ-'||lpad(g::text,3,'0')||':C1', 'RMQ-'||lpad(g::text,3,'0')||':conv1', 'POOL-MQ',
       'RMQ-'||lpad(g::text,3,'0'), 'menu'
  from generate_series(1,3) g;
-- menu_quality problem the dispatcher resolves (problem_type='menu_quality').
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status, problem_type)
  values ('POOL-MQ','RMQ-001','moderate','open','menu_quality');

-- ── NULL pre-run (§14): revenue_lost is NULL BEFORE the impact producer fires. ──────────────────
select is(
  (select revenue_lost from tenant."Diagnosed_Problem" where tenant_id='POOL-MQ'),
  null::numeric, 'menu_quality revenue_lost is NULL before the impact producer runs (§14)');

-- ── affected dispatcher (4-arg, p_segment null). window_silent knob by NAME. ─────────────────────
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-MQ' limit 1),
  'POOL-MQ', (select value::int from catalog."Config_Knobs" where key='window_silent'), null);
select is(
  (select count(*)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-MQ'),
  8, 'menu_quality affected = 8 (quality 0.25 < menu_quality_min 0.50) via the general dispatcher path');
select is(
  (select count(*) filter (where silent)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-MQ'),
  5, 'menu_quality silent = 5 (8 affected − 3 complainants) via the anti-join');

-- ── impact dispatcher: deterministic at-risk GMV = Σ GMV_window × (1 − quality) over affected.
--    8 × (4×100 = 400 GMV) × (1 − 0.25 = 0.75) = 8 × 300 = €2400. ──────────────────────────────────
select is(
  tenant.fn_impact_revenue_lost((select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-MQ' limit 1)),
  2400::numeric, 'menu_quality at-risk GMV = €2400 (8 × 400 × 0.75) via the menu_quality dispatcher');
select is(
  (select provenance_by_field->>'revenue_lost' from tenant."Diagnosed_Problem" where tenant_id='POOL-MQ'),
  '[I]', 'menu_quality revenue_lost carries provenance [I] (inferred)');

-- ── REGRESSION: payment still yields 47 through the SAME dispatcher (the menu_quality case must not
--    perturb the payment route). Self-contained POOL-PAY-M fixture (47 failed @ net 80). ───────────
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
select 'RPM-'||lpad(g::text,3,'0'), 'POOL-PAY-M', 'long_tail', 'long_tail'::segment, date '2026-01-01', 'Centro'
  from generate_series(1,47) g;
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
select 'RPM-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed', 'Centro'
  from generate_series(1,47) g;
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status)
  values ('POOL-PAY-M','RPM-001','critical','open');
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-M' limit 1),
  'POOL-PAY-M', (select value::int from catalog."Config_Knobs" where key='window_silent'), null);
select is(
  (select count(*)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-PAY-M'),
  47, 'REGRESSION: payment affected still 47 via the dispatcher (menu_quality case did not perturb it)');

select * from finish();
rollback;
