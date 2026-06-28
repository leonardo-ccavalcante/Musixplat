-- pgTAP — 05D impact dispatcher (F0 Task 4). fn_impact_revenue_lost becomes a DISPATCHER on
-- Diagnosed_Problem.problem_type → fn_impact_payment for payment. The € is byte-identical to the
-- shipped producer (sum(net_value) over the affected failed orders) ⇒ zero regression. It still
-- WRITES revenue_lost + provenance [I] and RETURNS the total (§14, BR-B10). Hermetic POOL-PAY-I
-- fixture (47 failed orders @ net 80 ⇒ €3760), rolled back. Counts/€ PRODUCED, never seeded.
begin;
select plan(6);

-- ── dispatch contract (drives the refactor): the extracted per-type fn exists, and the dispatcher
--    is fail-closed on an unregistered type (the shipped payment-bound fn would silently sum ⇒ RED). ─
select has_function('tenant', 'fn_impact_payment', array['uuid'], 'fn_impact_payment extracted');

-- ── fixture (INPUTS only — net_value is generated = gross-fee = 80; € is PRODUCED, §14) ────────
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
select 'RPI-'||lpad(g::text,3,'0'), 'POOL-PAY-I', 'long_tail', 'long_tail'::segment, date '2026-01-01', 'Centro'
  from generate_series(1,47) g;
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
select 'RPI-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed', 'Centro'
  from generate_series(1,47) g;
-- P1-6 window pin: an OUT-OF-WINDOW failed order (current_date - 60 > window_silent[30]) on an affected
-- restaurant. It MUST be excluded from revenue_lost — un-windowed code would return €4260, not €3760.
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
  values ('RPI-001', current_date - 60, 600, 100, 'failed', 'Centro');
insert into catalog."Intent_Catalog"(intent_id, label) values ('billing','Billing')
  on conflict (intent_id) do nothing;
insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
select 'RPI-'||lpad(g::text,3,'0')||':C1', 'RPI-'||lpad(g::text,3,'0')||':conv1', 'POOL-PAY-I',
       'RPI-'||lpad(g::text,3,'0'), 'billing'
  from generate_series(1,12) g;
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
  values ('POOL-PAY-I','RPI-001','RPI-001:conv1','critical','open');

-- ── NULL pre-run (§14): revenue_lost is NULL BEFORE the impact producer fires. ─────────────────
select is(
  (select revenue_lost from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-I'),
  null::numeric, 'revenue_lost is NULL before the impact producer runs (§14)');

-- ── populate Affected via the dispatcher, then run the impact dispatcher. ───────────────────────
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-I' limit 1),
  'POOL-PAY-I', (select value::int from catalog."Config_Knobs" where key='window_silent'), null);

select is(
  tenant.fn_impact_revenue_lost((select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-I' limit 1)),
  3760::numeric, 'fn_impact_revenue_lost returns €3760 via the payment dispatcher (47 × net 80)');

select is(
  (select revenue_lost from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-I'),
  3760::numeric, 'revenue_lost WRITTEN = €3760 (produced, not seeded)');

select is(
  (select provenance_by_field->>'revenue_lost' from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-I'),
  '[I]', 'revenue_lost carries provenance [I] (inferred, BR-B10)');

-- fail-closed: an unregistered problem_type must RAISE (the shipped fn would silently sum ⇒ this is RED).
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status, problem_type)
  values ('POOL-PAY-I','RPI-002','low','open','mystery_type');
-- throws_ok(sql, errcode, errmsg, description): match SQLSTATE P0001 (raise_exception); errmsg NULL = any.
select throws_ok(
  $$ select tenant.fn_impact_revenue_lost(
       (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-I' and problem_type='mystery_type')) $$,
  'P0001', NULL,
  'fail-closed: impact dispatcher RAISES on an unregistered problem_type');

select * from finish();
rollback;
