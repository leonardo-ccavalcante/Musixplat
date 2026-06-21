-- pgTAP — 05D affected dispatcher (F0 Task 3). fn_hunt_silent becomes a DISPATCHER that reads
-- Diagnosed_Problem.problem_type and calls the per-type producer (payment → fn_affected_payment),
-- with an optional p_segment filter. Regression bar: the payment anti-join still yields 47 affected
-- / 35 silent via the dispatcher; the segment filter narrows correctly (§B.1, §14 — counts produced).
-- Hermetic: stages a self-contained POOL-PAY-T fixture in the txn (47 failed orders, 35 silent,
-- segment split 30 'managed' / 17 'long_tail' — the real `segment` enum labels), rolled back.
-- Mirrors scenario_pay.ts shape (zero seeded results).
begin;
select plan(4);

-- ── fixture (INPUTS only — counts are PRODUCED by the dispatcher, never seeded, §14) ───────────
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
select 'RPT-'||lpad(g::text,3,'0'), 'POOL-PAY-T', 'long_tail',
       (case when g <= 30 then 'managed' else 'long_tail' end)::segment, date '2026-01-01',
       case when g <= 30 then 'Centro' else 'Norte' end
  from generate_series(1,47) g;
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
select 'RPT-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed',
       case when g <= 30 then 'Centro' else 'Norte' end
  from generate_series(1,47) g;
-- 12 complainants opened a billing ticket ⇒ 35 SILENT (the hunt surfaces them).
-- (intent FK → Intent_Catalog; seed it in-txn so the fixture is hermetic.)
insert into catalog."Intent_Catalog"(intent_id, label) values ('billing','Billing')
  on conflict (intent_id) do nothing;
insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
select 'RPT-'||lpad(g::text,3,'0')||':C1', 'RPT-'||lpad(g::text,3,'0')||':conv1', 'POOL-PAY-T',
       'RPT-'||lpad(g::text,3,'0'), 'billing'
  from generate_series(1,12) g;
-- payment problem (problem_type defaults to 'payment') the dispatcher resolves.
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
  values ('POOL-PAY-T','RPT-001','RPT-001:conv1','critical','open');

-- ── dispatcher call (4-arg, p_segment = null ⇒ whole pool). window_silent knob by NAME. ─────────
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-T' limit 1),
  'POOL-PAY-T', (select value::int from catalog."Config_Knobs" where key='window_silent'), null
);

select is(
  (select count(*)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-PAY-T'),
  47, 'payment affected = 47 via the general dispatcher path');
select is(
  (select count(*) filter (where silent)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-PAY-T'),
  35, 'silent = 35 via the general dispatcher path');

-- ── segment filter narrows: a SECOND problem sliced to segment 'managed' ⇒ only the 30 managed affected. ─
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status, problem_type, segment)
  values ('POOL-PAY-T','RPT-002','moderate','open','payment','managed');
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-T' and segment='managed' limit 1),
  'POOL-PAY-T', (select value::int from catalog."Config_Knobs" where key='window_silent'), 'managed'
);
select is(
  (select count(*)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.segment='managed'),
  30, 'segment managed narrows affected to the 30 managed restaurants');
-- segment 'long_tail' on a third problem ⇒ the other 17.
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status, problem_type, segment)
  values ('POOL-PAY-T','RPT-031','low','open','payment','long_tail');
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-T' and segment='long_tail' limit 1),
  'POOL-PAY-T', (select value::int from catalog."Config_Knobs" where key='window_silent'), 'long_tail'
);
select is(
  (select count(*)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.segment='long_tail'),
  17, 'segment long_tail narrows affected to the 17 long_tail restaurants');

select * from finish();
rollback;
