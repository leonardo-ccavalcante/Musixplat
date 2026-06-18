-- pgTAP — Chunk 4 topo-vs-base bands (F-1.6) + weighted UPSIDE (F-1.7). 50 restaurants in one cell
-- with DISTINCT order volumes (1..50) so composite percentiles spread 0..100 and the P90+/P10- bands
-- reach n ≥ k_anon. connection/quality/cancel held equal ⇒ composite ordering = order volume.
-- begin/rollback; brutos truncated for isolation.
begin;
select plan(6);

truncate tenant."Restaurant", tenant."Order", tenant."Weekly_Connection",
         cohort."Cohort", cohort."Subgroup", cohort."Cohort_Membership_Snapshot" cascade;

insert into catalog."Cohort_Rule_Version"(version_id, effective_date, what_changed)
  values ('vtest', date '2026-06-01', 'test');
update catalog."Config_Knobs" set value = 'vtest' where key = 'cohort_rule_version_current';

insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
select 'RB' || lpad(g::text,2,'0'), 'POOLT', 'long_tail', 'long_tail', date '2025-01-01', 'downtown', 'sushi', 40
from generate_series(1, 50) g;

-- restaurant g gets g delivered orders (distinct volumes 1..50). photo+desc true, none failed.
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, has_photo, has_description)
select 'RB' || lpad(g::text,2,'0'), date '2026-06-01', 100, 20, 'ok', true, true
from generate_series(1, 50) g cross join lateral generate_series(1, g) k;

insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
select 'RB' || lpad(g::text,2,'0'), date '2026-06-15', 30, 40 from generate_series(1, 50) g;

select cohort.fn_assign_cohorts(date '2026-06-17', date '2026-06-17');
select cohort.fn_rank_cohort(date '2026-06-17');
select cohort.fn_gate_k_anon(date '2026-06-17');
select cohort.fn_descriptive_baseline(date '2026-06-17');
select cohort.fn_upside(date '2026-06-17');

-- bands: P90+ band has non-null metrics (n90 ≥ k_anon=5)
select isnt((select descriptive_baseline->'bands'->'p90'->>'orders' from cohort."Cohort"
             where cohort_id='sushi_downtown_long_tail_vtest'), null, 'F-1.6: P90+ band metrics present (n≥k)');

-- topo-vs-base: top sells more than base (positive order delta)
select ok((select (descriptive_baseline->'topo_vs_base'->'p90_vs_p10'->>'d_orders')::numeric
           from cohort."Cohort" where cohort_id='sushi_downtown_long_tail_vtest') > 0,
          'F-1.6: P90 vs P10 d_orders > 0 (top sells more)');

-- upside: positive lift
select ok((select (descriptive_baseline->'upside'->>'lift_orders')::numeric
           from cohort."Cohort" where cohort_id='sushi_downtown_long_tail_vtest') > 0,
          'F-1.7: upside lift_orders > 0');

-- upside attribution sums to the lift (weights sum to 1.0) — within rounding tolerance
select ok((select abs(
             (descriptive_baseline->'upside'->>'lift_orders')::numeric
             - ( (descriptive_baseline->'upside'->'attribution'->>'connection')::numeric
               + (descriptive_baseline->'upside'->'attribution'->>'quality')::numeric
               + (descriptive_baseline->'upside'->'attribution'->>'cancel')::numeric
               + (descriptive_baseline->'upside'->'attribution'->>'price')::numeric))
           from cohort."Cohort" where cohort_id='sushi_downtown_long_tail_vtest') < 0.05,
          'F-1.7: Σ attribution = lift (weights sum to 1)');

-- upside is always a projection [C]
select is((select descriptive_baseline->'upside'->>'prov' from cohort."Cohort"
           where cohort_id='sushi_downtown_long_tail_vtest'), '[C]', 'F-1.7: upside provenance = [C]');

-- §3.9: a k-suppressed cell (n<5) gets NO upside
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
select 'RP' || g, 'POOLT', 'long_tail', 'long_tail', date '2025-01-01', 'centro', 'pizza', 40 from generate_series(1,3) g;
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, has_photo, has_description)
select 'RP' || g, date '2026-06-01', 100, 20, 'ok', true, true from generate_series(1,3) g;
insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
select 'RP' || g, date '2026-06-15', 30, 40 from generate_series(1,3) g;
select cohort.fn_assign_cohorts(date '2026-06-17', date '2026-06-17');
select cohort.fn_rank_cohort(date '2026-06-17');
select cohort.fn_gate_k_anon(date '2026-06-17');
select cohort.fn_upside(date '2026-06-17');
select ok((select descriptive_baseline->'upside' from cohort."Cohort"
           where cohort_id='pizza_centro_long_tail_vtest') is null,
          '§3.9: k-suppressed cell (n=3<5) renders NO upside');

select * from finish();
rollback;
