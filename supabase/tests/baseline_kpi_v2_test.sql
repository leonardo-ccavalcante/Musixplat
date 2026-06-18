-- pgTAP — Chunk 3 cohort KPI profile (F-1.8 v2). Isolated cohort of 6 restaurants (≥ k_anon=5 ⇒
-- NOT suppressed) with fully controlled brutos so every KPI family is exactly predictable.
-- begin/rollback; brutos truncated for isolation (live DB holds the 5000 seed).
begin;
select plan(7);

truncate tenant."Restaurant", tenant."Order", tenant."Weekly_Connection",
         cohort."Cohort", cohort."Subgroup", cohort."Cohort_Membership_Snapshot" cascade;

insert into catalog."Cohort_Rule_Version"(version_id, effective_date, what_changed)
  values ('vtest', date '2026-06-01', 'test');
update catalog."Config_Knobs" set value = 'vtest' where key = 'cohort_rule_version_current';

-- 6 comparable restaurants (one cell). signup old ⇒ tenure computes.
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
select 'RK' || g, 'POOLT', 'long_tail', 'long_tail', date '2025-01-01', 'downtown', 'sushi', 40
from generate_series(1, 6) g;

-- each restaurant: 10 delivered orders, net 80 (gross 100 − fee 20), photo+desc true, zero cancels.
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, has_photo, has_description)
select 'RK' || g, date '2026-06-01', 100, 20, 'ok', true, true
from generate_series(1, 6) g cross join lateral generate_series(1, 10) k;

-- connection: 30/40 each ⇒ cohort ratio 180/240 = 0.75.
insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
select 'RK' || g, date '2026-06-15', 30, 40 from generate_series(1, 6) g;

select cohort.fn_assign_cohorts(date '2026-06-17', date '2026-06-17');
select cohort.fn_rank_cohort(date '2026-06-17');
select cohort.fn_gate_k_anon(date '2026-06-17');
select cohort.fn_baseline_kpi(date '2026-06-17');

-- the cohort KPI profile (cell is viable: n=6 ≥ k=5)
select is((select (descriptive_baseline->'kpis'->'volume'->>'avg_orders')::numeric
           from cohort."Cohort" where cohort_id='sushi_downtown_long_tail_vtest'),
          10.00::numeric, 'Volume: avg_orders = 60/6 = 10');
select is((select (descriptive_baseline->'kpis'->'volume'->>'avg_ticket')::numeric
           from cohort."Cohort" where cohort_id='sushi_downtown_long_tail_vtest'),
          80.00::numeric, 'Volume: avg_ticket = gmv/ok = 80');
select is((select (descriptive_baseline->'kpis'->'connection'->>'ratio')::numeric
           from cohort."Cohort" where cohort_id='sushi_downtown_long_tail_vtest'),
          0.7500::numeric, 'Connection: ratio = 180/240 = 0.75');
select is((select (descriptive_baseline->'kpis'->'fulfillment'->>'delivery_rate')::numeric
           from cohort."Cohort" where cohort_id='sushi_downtown_long_tail_vtest'),
          1.0000::numeric, 'Fulfillment: delivery_rate = 1.0');
select is((select (descriptive_baseline->'kpis'->'quality'->>'pct_photo')::numeric
           from cohort."Cohort" where cohort_id='sushi_downtown_long_tail_vtest'),
          1.0000::numeric, 'Quality: pct_photo = 1.0');
select is((select descriptive_baseline->'kpis'->'volume'->>'prov'
           from cohort."Cohort" where cohort_id='sushi_downtown_long_tail_vtest'),
          '[V]', 'per-field provenance = [V]');

-- §3.9: a k-suppressed cell (n<5) gets NO kpis. Insert a 3-restaurant cell, re-run.
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
select 'RS' || g, 'POOLT', 'long_tail', 'long_tail', date '2025-01-01', 'centro', 'pizza', 40
from generate_series(1, 3) g;
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, has_photo, has_description)
select 'RS' || g, date '2026-06-01', 100, 20, 'ok', true, true from generate_series(1, 3) g;
insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
select 'RS' || g, date '2026-06-15', 30, 40 from generate_series(1, 3) g;
select cohort.fn_assign_cohorts(date '2026-06-17', date '2026-06-17');
select cohort.fn_rank_cohort(date '2026-06-17');
select cohort.fn_gate_k_anon(date '2026-06-17');
select cohort.fn_baseline_kpi(date '2026-06-17');
select ok((select descriptive_baseline->'kpis' from cohort."Cohort"
           where cohort_id='pizza_centro_long_tail_vtest') is null,
          '§3.9: k-suppressed cell (n=3<5) renders NO kpis');

select * from finish();
rollback;
