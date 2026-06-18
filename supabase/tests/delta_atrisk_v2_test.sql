-- pgTAP — Chunk 5 delta + at_risk (F-2.2 v2). Two membership snapshots (W1, W2) inserted directly
-- with controlled percentile + m_orders, so fn_diff_delta logic is exercised in isolation (no
-- fn_rank needed). begin/rollback; fixtures truncated for isolation.
begin;
select plan(8);

truncate tenant."Restaurant", cohort."Cohort", cohort."Subgroup",
         cohort."Cohort_Membership_Snapshot", cohort."Prioritized_NBA_Event" cascade;
insert into catalog."Cohort_Rule_Version"(version_id, effective_date, what_changed) values ('vtest', date '2026-06-01', 't');
update catalog."Config_Knobs" set value = 'vtest' where key = 'cohort_rule_version_current';

insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
  values ('RA','PT','long_tail','long_tail',date '2025-01-01'),
         ('RB','PT','long_tail','long_tail',date '2025-01-01'),
         ('RC','PT','long_tail','long_tail',date '2025-01-01'),
         ('RD','PT','long_tail','long_tail',date '2025-01-01');
insert into cohort."Cohort"(cohort_id, cuisine, zone, tier_base, cohort_rule_version)
  values ('c1','sushi','downtown','long_tail','vtest');

-- W1 = 2026-05-25 baseline (RD has no W1 ⇒ 'new')
insert into cohort."Cohort_Membership_Snapshot"
  (restaurant_id, cohort_id, week, cohort_rule_version, percentile_in_cohort, m_orders, n_min_ok, provenance)
values
  ('RA','c1',date '2026-05-25','vtest', 80.00, 20, true, '[V]'),
  ('RB','c1',date '2026-05-25','vtest', 50.00, 12, true, '[V]'),
  ('RC','c1',date '2026-05-25','vtest', 40.00, 8,  true, '[V]');
-- W2 = 2026-06-15 current
insert into cohort."Cohort_Membership_Snapshot"
  (restaurant_id, cohort_id, week, cohort_rule_version, percentile_in_cohort, m_orders, n_min_ok, provenance)
values
  ('RA','c1',date '2026-06-15','vtest', 50.00, 10, true, '[V]'),   -- dropped 80→50 + orders 20→10 ⇒ at_risk(orders)
  ('RB','c1',date '2026-06-15','vtest', 80.00, 15, true, '[V]'),   -- 50→80 ⇒ percentile_up
  ('RC','c1',date '2026-06-15','vtest', 30.00, 0,  true, '[V]'),   -- 0 orders ⇒ churn
  ('RD','c1',date '2026-06-15','vtest', 60.00, 5,  true, '[V]');   -- no W1 ⇒ new

select cohort.fn_diff_delta(date '2026-06-15', date '2026-05-25');

select is((select delta_status::text from cohort."Prioritized_NBA_Event" where restaurant_id='RA'),
          'at_risk', 'RA: percentile drop + orders↓ ⇒ at_risk');
select is((select percentile_delta->>'sentido' from cohort."Prioritized_NBA_Event" where restaurant_id='RA'),
          'down', 'RA: percentile_delta.sentido = down');
select is((select percentile_delta->>'root_cause' from cohort."Prioritized_NBA_Event" where restaurant_id='RA'),
          'orders', 'RA: root_cause = orders (Leo crux)');
select is((select (percentile_delta->>'magnitud')::numeric from cohort."Prioritized_NBA_Event" where restaurant_id='RA'),
          30.00::numeric, 'RA: magnitud = |50-80| = 30');
select is((select (percentile_delta->>'ventana_dias')::int from cohort."Prioritized_NBA_Event" where restaurant_id='RA'),
          21, 'RA: ventana_dias = 21');
select is((select delta_status::text from cohort."Prioritized_NBA_Event" where restaurant_id='RB'),
          'percentile_up', 'RB: 50→80 ⇒ percentile_up');
select is((select delta_status::text from cohort."Prioritized_NBA_Event" where restaurant_id='RC'),
          'churn', 'RC: 0 orders ⇒ churn');
select is((select delta_status::text from cohort."Prioritized_NBA_Event" where restaurant_id='RD'),
          'new', 'RD: no prior week ⇒ new');

select * from finish();
rollback;
