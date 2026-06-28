-- pgTAP — review fix P0-2 follow-up: fn_diff_delta refreshes n_min_ok + mode on a re-run conflict.
-- Regression for the leak where an event written with n_min_ok=true kept that stale flag after a re-run
-- recalced its subgroup below n_min — exposing the new sub-n_min percentile/delta through cohorts.deltas
-- (which gates on e.n_min_ok). The flag must refresh WITH the values it qualifies. begin/rollback.
begin;
select plan(4);

truncate tenant."Restaurant", cohort."Cohort", cohort."Subgroup",
         cohort."Cohort_Membership_Snapshot", cohort."Prioritized_NBA_Event" cascade;
insert into catalog."Cohort_Rule_Version"(version_id, effective_date, what_changed) values ('vtest', date '2026-06-01', 't');
update catalog."Config_Knobs" set value = 'vtest' where key = 'cohort_rule_version_current';

insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
  values ('RA','PT','long_tail','long_tail',date '2025-01-01');
insert into cohort."Cohort"(cohort_id, cuisine, zone, tier_base, cohort_rule_version)
  values ('c1','sushi','downtown','long_tail','vtest');

-- prev (W1) + cur (W2): RA drops 80→50 with orders 20→10 ⇒ at_risk delta. cur starts n_min_ok=true.
insert into cohort."Cohort_Membership_Snapshot"
  (restaurant_id, cohort_id, week, cohort_rule_version, percentile_in_cohort, m_orders, n_min_ok, mode, provenance)
values
  ('RA','c1',date '2026-05-25','vtest', 80.00, 20, true, 'percentile', '[V]'),
  ('RA','c1',date '2026-06-15','vtest', 50.00, 10, true, 'percentile', '[V]');

-- first run ⇒ event written with n_min_ok=true.
select cohort.fn_diff_delta(date '2026-06-15', date '2026-05-25');
select is((select n_min_ok from cohort."Prioritized_NBA_Event" where restaurant_id='RA'),
          true, 'first run: event carries n_min_ok=true');

-- the subgroup shrinks below n_min on a later gate ⇒ cur snapshot flips n_min_ok=false (qualitative).
update cohort."Cohort_Membership_Snapshot"
  set n_min_ok = false, mode = 'qualitative_no_percentile'
  where restaurant_id='RA' and week = date '2026-06-15' and cohort_rule_version='vtest';

-- re-run ⇒ ON CONFLICT must refresh n_min_ok + mode (not keep the stale true).
select cohort.fn_diff_delta(date '2026-06-15', date '2026-05-25');
select is((select n_min_ok from cohort."Prioritized_NBA_Event" where restaurant_id='RA'),
          false, 're-run: event n_min_ok refreshed to false (no stale-true leak)');
select is((select mode::text from cohort."Prioritized_NBA_Event" where restaurant_id='RA'),
          'qualitative_no_percentile', 're-run: event mode refreshed to qualitative');
select is((select (percentile_delta->>'n_min_ok')::boolean from cohort."Prioritized_NBA_Event" where restaurant_id='RA'),
          false, 're-run: percentile_delta jsonb n_min_ok also rebuilt to false');

select * from finish();
rollback;
