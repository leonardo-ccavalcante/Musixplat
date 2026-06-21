-- pgTAP — 05D cancellation problem type. A THIRD problem flows through the SAME engine: the dispatchers
-- gain a `when 'cancellation'` case (fn_affected_cancellation / fn_impact_cancellation) while the payment +
-- connection cases stay byte-identical (zero regression: payment 47 still produced via the dispatcher).
-- 04 §3 / §7 / §8 / §14. The affected anti-join + the at-risk-GMV € are SQL (no LLM, §3.6); the diagnosis
-- knob cancel_rate_max is read BY NAME (§3.8), DISTINCT from the A6 nba_cancel_rate_max action policy.
-- Counts/€ are PRODUCED, never seeded (§14).
--
-- Hermetic, drift-immune fixture (rolled back): orders are staged at current_date-relative dates so the
-- window (order_date >= current_date - window_silent) always covers them ⇒ the pinned numbers (8 affected
-- / €3200) never drift with the calendar. 8 high-cancel restaurants @ rate 0.50 (5 restaurant-cancelled /
-- 10 concluded) + 4 healthy @ rate 0.00 (0 restaurant-cancelled, 2 CUSTOMER-cancelled to prove customer
-- cancels are excluded). 3 of the 8 complained ⇒ 5 SILENT. Each high-cancel restaurant has 5 restaurant-
-- cancelled orders @ net 80 ⇒ at-risk = 8 × (5 × 80) = 8 × 400 = €3200.
begin;
select plan(8);

-- ── dispatch contract (drives the refactor): the per-type producers exist; the dispatchers route to
--    them. Without the new migration these RED (the functions are absent / the case raises). ────────
select has_function('tenant', 'fn_affected_cancellation',
  array['uuid', 'text', 'integer', 'text'], 'fn_affected_cancellation extracted');
select has_function('tenant', 'fn_impact_cancellation', array['uuid'], 'fn_impact_cancellation extracted');

-- ── cancellation fixture (INPUTS only — counts/€ are PRODUCED, §14) ──────────────────────────────
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
select 'RCAN-'||lpad(g::text,3,'0'), 'POOL-CANCEL', 'long_tail', 'long_tail'::segment, date '2026-01-01',
       case when g <= 8 then 'Centro' else 'Norte' end, 'pizza', 50
  from generate_series(1,12) g;
-- high-cancel (g<=8): 5 RESTAURANT-cancelled orders @ net 80 (gross 100 − fee 20), order_date in window.
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, cancelled_by, zone)
select 'RCAN-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'failed', 'restaurant', 'Centro'
  from generate_series(1,8) g cross join generate_series(1,5) k;
-- high-cancel (g<=8): 5 'ok' orders @ net 80 ⇒ concluded = 10 ⇒ rate 5/10 = 0.50 > 0.10 (affected).
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
select 'RCAN-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'ok', 'Centro'
  from generate_series(1,8) g cross join generate_series(1,5) k;
-- healthy (g 9-12): 2 CUSTOMER-cancelled @ net 80 + 8 'ok' ⇒ restaurant-rate 0/10 = 0.00 (NOT affected;
-- proves the producer ignores customer-side cancels in the numerator).
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, cancelled_by, zone)
select 'RCAN-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'failed', 'customer', 'Norte'
  from generate_series(9,12) g cross join generate_series(1,2) k;
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
select 'RCAN-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'ok', 'Norte'
  from generate_series(9,12) g cross join generate_series(1,8) k;
-- 3 of the 8 high-cancel restaurants opened a cancellation ticket ⇒ 5 SILENT (affected, never complained).
insert into catalog."Intent_Catalog"(intent_id, label) values ('cancellation','Order cancellation')
  on conflict (intent_id) do nothing;
insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
select 'RCAN-'||lpad(g::text,3,'0')||':C1', 'RCAN-'||lpad(g::text,3,'0')||':conv1', 'POOL-CANCEL',
       'RCAN-'||lpad(g::text,3,'0'), 'cancellation'
  from generate_series(1,3) g;
-- cancellation problem the dispatcher resolves (problem_type='cancellation').
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status, problem_type)
  values ('POOL-CANCEL','RCAN-001','moderate','open','cancellation');

-- ── NULL pre-run (§14): revenue_lost is NULL BEFORE the impact producer fires. ──────────────────
select is(
  (select revenue_lost from tenant."Diagnosed_Problem" where tenant_id='POOL-CANCEL'),
  null::numeric, 'cancellation revenue_lost is NULL before the impact producer runs (§14)');

-- ── affected dispatcher (4-arg, p_segment null). window_silent knob by NAME. ─────────────────────
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-CANCEL' limit 1),
  'POOL-CANCEL', (select value::int from catalog."Config_Knobs" where key='window_silent'), null);
select is(
  (select count(*)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-CANCEL'),
  8, 'cancellation affected = 8 (restaurant-cancel rate > cancel_rate_max) via the general dispatcher path');
select is(
  (select count(*) filter (where silent)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-CANCEL'),
  5, 'cancellation silent = 5 (8 affected − 3 complainants) via the anti-join');

-- ── impact dispatcher: deterministic at-risk GMV = Σ net_value of restaurant-cancelled orders over affected.
select is(
  tenant.fn_impact_revenue_lost((select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-CANCEL' limit 1)),
  3200::numeric, 'cancellation at-risk GMV = €3200 (8 × 5 cancelled × net 80) via the cancellation dispatcher');
select is(
  (select provenance_by_field->>'revenue_lost' from tenant."Diagnosed_Problem" where tenant_id='POOL-CANCEL'),
  '[I]', 'cancellation revenue_lost carries provenance [I] (inferred)');

-- ── REGRESSION: payment still yields 47 through the SAME dispatcher (the cancellation case must not
--    perturb the payment route). Self-contained POOL-PAY-K fixture (47 failed @ net 80, 12 complain). ─
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
select 'RPK-'||lpad(g::text,3,'0'), 'POOL-PAY-K', 'long_tail', 'long_tail'::segment, date '2026-01-01', 'Centro'
  from generate_series(1,47) g;
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
select 'RPK-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed', 'Centro'
  from generate_series(1,47) g;
insert into catalog."Intent_Catalog"(intent_id, label) values ('billing','Billing')
  on conflict (intent_id) do nothing;
insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
select 'RPK-'||lpad(g::text,3,'0')||':C1', 'RPK-'||lpad(g::text,3,'0')||':conv1', 'POOL-PAY-K',
       'RPK-'||lpad(g::text,3,'0'), 'billing'
  from generate_series(1,12) g;
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
  values ('POOL-PAY-K','RPK-001','RPK-001:conv1','critical','open');
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-K' limit 1),
  'POOL-PAY-K', (select value::int from catalog."Config_Knobs" where key='window_silent'), null);
select is(
  (select count(*)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-PAY-K'),
  47, 'REGRESSION: payment affected still 47 via the dispatcher (cancellation case did not perturb it)');

select * from finish();
rollback;
