-- P01 deterministic producers (04 §6/§14). Math lives in SQL (CLAUDE.md §1); orchestration in
-- TS (server/jobs/p01.ts). Every function reads thresholds BY NAME, stamps cohort_rule_version
-- per row, and computes RESULTS from brutos — never seeds a number. Determinism: same brutos +
-- same (week, ref_date) ⇒ identical output.

-- Business metric (recurrence proxy) from Order, windowed on the week (28d) so consecutive
-- snapshots differ — deterministic, reused by ranking/baselines. recurrence is COMPUTED from
-- Order, never a column (04 §14 denylist).
create or replace function cohort.fn_recurrence(p_rest text, p_week date)
returns integer language sql stable as $$
  select count(*)::integer from tenant."Order"
  where restaurant_id = p_rest and payment_status = 'ok'
    and order_date > p_week - 28 and order_date <= p_week;
$$;

create or replace function cohort.fn_avg_ticket(p_rest text, p_week date)
returns numeric language sql stable as $$
  select coalesce(round(avg(net_value), 2), 0) from tenant."Order"
  where restaurant_id = p_rest and payment_status = 'ok'
    and order_date > p_week - 28 and order_date <= p_week;
$$;

-- F-1.1 — deterministic cell+subgroup assignment, version-stamped. tenure from signup_date vs
-- Config borders (BY NAME) relative to p_ref_date (deterministic, never wall-clock). signup_date
-- null/future ⇒ conservative (no assignment), never a silent default.
create or replace function cohort.fn_assign_cohorts(p_week date, p_ref_date date)
returns void language plpgsql as $$
declare
  v_version text := catalog.knob_text('cohort_rule_version_current');
  b1 int := catalog.knob_required_num('tenure_border_1_months');
  b2 int := catalog.knob_required_num('tenure_border_2_months');
  b3 int := catalog.knob_required_num('tenure_border_3_months');
begin
  update tenant."Restaurant"
    set tenure_months = (extract(year from age(p_ref_date, signup_date)) * 12
                         + extract(month from age(p_ref_date, signup_date)))::int
    where signup_date is not null and signup_date <= p_ref_date;

  insert into cohort."Cohort"(cohort_id, tenure_bucket, tier_base, cohort_rule_version)
  select distinct r.tier_base || '_' || g.bucket || '_' || v_version,
                  g.bucket::public.tenure_bucket, r.tier_base, v_version
  from tenant."Restaurant" r
  cross join lateral (select case when r.tenure_months < b1 then '0-3m'
                                  when r.tenure_months < b2 then '3-6m'
                                  when r.tenure_months < b3 then '6-12m'
                                  else '12m+' end as bucket) g
  where r.tenure_months is not null
  on conflict (tenure_bucket, tier_base, cohort_rule_version) do nothing;

  insert into cohort."Subgroup"(subgroup_id, cohort_id, label)
  select cohort_id || '_sg', cohort_id, 'all' from cohort."Cohort"
  where cohort_rule_version = v_version
  on conflict (subgroup_id) do nothing;

  insert into cohort."Cohort_Membership_Snapshot"
    (restaurant_id, cohort_id, subgroup_id, week, cohort_rule_version, provenance)
  select r.restaurant_id, c.cohort_id, c.cohort_id || '_sg', p_week, v_version, '[V]'
  from tenant."Restaurant" r
  cross join lateral (select case when r.tenure_months < b1 then '0-3m'
                                  when r.tenure_months < b2 then '3-6m'
                                  when r.tenure_months < b3 then '6-12m'
                                  else '12m+' end as bucket) g
  join cohort."Cohort" c on c.tier_base = r.tier_base
                        and c.tenure_bucket = g.bucket::public.tenure_bucket
                        and c.cohort_rule_version = v_version
  where r.tenure_months is not null
  on conflict (restaurant_id, cohort_id, week, cohort_rule_version) do nothing;
end;
$$;

-- F-1.2 — ranking: percentile + gap_to_top per account; Cohort.n_accounts + atribucion baseline.
create or replace function cohort.fn_rank_cohort(p_week date)
returns void language plpgsql as $$
declare v_version text := catalog.knob_text('cohort_rule_version_current');
begin
  with metric as (
    select p.snapshot_id, p.cohort_id, cohort.fn_recurrence(p.restaurant_id, p_week) as m
    from cohort."Cohort_Membership_Snapshot" p
    where p.week = p_week and p.cohort_rule_version = v_version
  ), ranked as (
    select snapshot_id, m,
           percent_rank() over (partition by cohort_id order by m) as pr,
           max(m) over (partition by cohort_id) as top_m
    from metric
  )
  update cohort."Cohort_Membership_Snapshot" p
    set percentile_in_cohort = round((r.pr * 100)::numeric, 2),
        gap_to_top = (r.top_m - r.m),
        freshness_ts = now()
  from ranked r where r.snapshot_id = p.snapshot_id;

  update cohort."Cohort" c
    set n_accounts = agg.n,
        segment_attribution_baseline = jsonb_build_object('avg_metric', agg.avg_m, 'top_metric', agg.top_m),
        freshness_ts = now()
  from (
    select p.cohort_id, count(*) n,
           round(avg(cohort.fn_recurrence(p.restaurant_id, p_week)), 2) avg_m,
           max(cohort.fn_recurrence(p.restaurant_id, p_week)) top_m
    from cohort."Cohort_Membership_Snapshot" p
    where p.week = p_week and p.cohort_rule_version = v_version
    group by p.cohort_id
  ) agg where agg.cohort_id = c.cohort_id;
end;
$$;

-- F-1.3 — n_min gate (significance, SEPARATE from k-anon). Threshold BY NAME. Boundary defined:
-- n_accounts >= n_min ⇒ ok; below ⇒ collapse to qualitative mode.
create or replace function cohort.fn_gate_n_min(p_week date, p_version text default null)
returns void language plpgsql as $$
declare
  v_version text := coalesce(p_version, catalog.knob_text('cohort_rule_version_current'));
  v_nmin numeric := catalog.knob_required_num('n_min_threshold');
begin
  update cohort."Cohort" c set collapsed = (c.n_accounts is null or c.n_accounts < v_nmin)
    where c.cohort_rule_version = v_version;

  update cohort."Cohort_Membership_Snapshot" p
    set n_min_ok = (c.n_accounts is not null and c.n_accounts >= v_nmin),
        mode = case when (c.n_accounts is not null and c.n_accounts >= v_nmin)
                    then 'percentile'::public.percentile_mode
                    else 'qualitative_no_percentile'::public.percentile_mode end
  from cohort."Cohort" c
  where p.cohort_id = c.cohort_id and p.week = p_week and p.cohort_rule_version = v_version;
end;
$$;

-- F-1.3b — k-anon gate at the OUTPUT frontier (re-identification, SEPARATE from n_min). Threshold
-- BY NAME. fail-closed: indeterminate count ⇒ suppress.
create or replace function cohort.fn_gate_k_anon(p_version text default null)
returns void language plpgsql as $$
declare
  v_version text := coalesce(p_version, catalog.knob_text('cohort_rule_version_current'));
  v_k numeric := catalog.knob_required_num('k_anon_threshold');
begin
  update cohort."Cohort" c
    set k_suppression_applied = (c.n_accounts is null or c.n_accounts < v_k)  -- fail-closed
    where c.cohort_rule_version = v_version;
end;
$$;

-- F-1.4 — P90+ aggregation → descriptive_baseline (top vs base by canonical dimensions).
-- Respects k-anon: suppressed cells get a conservative empty descriptor.
create or replace function cohort.fn_descriptive_baseline(p_week date)
returns void language plpgsql as $$
declare
  v_version text := catalog.knob_text('cohort_rule_version_current');
  v_p90 numeric := catalog.knob_required_num('p90_percentile_cut');
begin
  update cohort."Cohort" c set descriptive_baseline = sub.bd
  from (
    select p.cohort_id,
      jsonb_build_object(
        'dimensions', jsonb_build_array('avg_metric','avg_ticket'),
        'top', jsonb_build_object(
           'n', count(*) filter (where p.percentile_in_cohort >= v_p90),
           'avg_metric', round(coalesce(avg(cohort.fn_recurrence(p.restaurant_id, p_week))
                              filter (where p.percentile_in_cohort >= v_p90),0),2),
           'avg_ticket', round(coalesce(avg(cohort.fn_avg_ticket(p.restaurant_id, p_week))
                              filter (where p.percentile_in_cohort >= v_p90),0),2)),
        'base', jsonb_build_object(
           'n', count(*) filter (where p.percentile_in_cohort < v_p90),
           'avg_metric', round(coalesce(avg(cohort.fn_recurrence(p.restaurant_id, p_week))
                              filter (where p.percentile_in_cohort < v_p90),0),2),
           'avg_ticket', round(coalesce(avg(cohort.fn_avg_ticket(p.restaurant_id, p_week))
                              filter (where p.percentile_in_cohort < v_p90),0),2))
      ) as bd
    from cohort."Cohort_Membership_Snapshot" p
    where p.week = p_week and p.cohort_rule_version = v_version
    group by p.cohort_id
  ) sub
  where sub.cohort_id = c.cohort_id and coalesce(c.k_suppression_applied, true) = false;
end;
$$;

-- F-1.8 — current_kpi_value per KPI into descriptive_baseline (Named_Query, deterministic SQL).
create or replace function cohort.fn_baseline_kpi(p_week date)
returns void language plpgsql as $$
declare v_version text := catalog.knob_text('cohort_rule_version_current');
begin
  update cohort."Cohort" c
    set descriptive_baseline = coalesce(c.descriptive_baseline, '{}'::jsonb)
        || jsonb_build_object('current_kpi_value',
             jsonb_build_object('kpi_recurrence', sub.v))
  from (
    select p.cohort_id, round(avg(cohort.fn_avg_ticket(p.restaurant_id, p_week)), 2) v
    from cohort."Cohort_Membership_Snapshot" p
    where p.week = p_week and p.cohort_rule_version = v_version
    group by p.cohort_id
  ) sub
  where sub.cohort_id = c.cohort_id and coalesce(c.k_suppression_applied, true) = false;
end;
$$;

-- F-1.7 — UPSIDE = f(gap × n_base) projection [C] (never ascends to [V]). NULL if no baseline.
create or replace function cohort.fn_upside(p_version text default null)
returns void language plpgsql as $$
declare v_version text := coalesce(p_version, catalog.knob_text('cohort_rule_version_current'));
begin
  update cohort."Cohort" c
    set opportunity_value = round(
          ((c.descriptive_baseline->'top'->>'avg_metric')::numeric
           - (c.descriptive_baseline->'base'->>'avg_metric')::numeric)
          * (c.descriptive_baseline->'base'->>'n')::numeric, 2)
    where c.cohort_rule_version = v_version
      and c.descriptive_baseline ? 'top' and c.descriptive_baseline ? 'base';
end;
$$;
