-- Review fix (P0-2 follow-up) — fn_diff_delta: refresh n_min_ok + mode on conflict. 04 §3.2/§14.
-- The shipped ON CONFLICT (20260617000020) refreshed delta_status/percentile_in_cohort/gap_to_top/
-- percentile_delta on a re-run but LEFT n_min_ok and mode stale. So a Prioritized_NBA_Event first written
-- when its subgroup was ≥ n_min (n_min_ok=true) could, on a later run where the subgroup shrinks below
-- n_min, get its percentile/gap/delta refreshed to the new sub-n_min values while keeping n_min_ok=true —
-- reopening the n_min leak the read frontier (cohorts.deltas) closes by gating on e.n_min_ok. The flag must
-- refresh WITH the values it qualifies. Body is byte-identical to 20260617000020 except the two added SET
-- clauses. Deterministic, version-stamped, anti-mix preserved. create-or-replace ⇒ no signature change.

create or replace function cohort.fn_diff_delta(p_week date, p_prev_week date)
returns void language plpgsql as $$
declare
  v_version text := catalog.knob_text('cohort_rule_version_current');
  v_atrisk numeric := catalog.knob_required_num('at_risk_percentile_max');
begin
  insert into cohort."Prioritized_NBA_Event"
    (restaurant_id, cohort_id, subgroup_id, week, percentile_in_cohort, gap_to_top,
     delta_status, percentile_delta, n_min_ok, freshness_ts, mode, cohort_rule_version, scope_owner_ref)
  select cur.restaurant_id, cur.cohort_id, cur.subgroup_id, cur.week,
         cur.percentile_in_cohort, cur.gap_to_top, d.delta::public.delta_status,
         d.pdelta, cur.n_min_ok, now(), cur.mode, cur.cohort_rule_version, cur.scope_owner_ref
  from cohort."Cohort_Membership_Snapshot" cur
  left join cohort."Cohort_Membership_Snapshot" prev
    on prev.restaurant_id = cur.restaurant_id
   and prev.week = p_prev_week and prev.cohort_rule_version = v_version
  cross join lateral (
    select
      case
        when prev.snapshot_id is null                            then 'new'          -- first appearance (even if 0 orders)
        when coalesce(cur.m_orders, 0) = 0                        then 'churn'        -- HAD history, now stopped selling
        when prev.cohort_id <> cur.cohort_id                     then 'cohort_changed'
        when cur.percentile_in_cohort < prev.percentile_in_cohort
          and (cur.percentile_in_cohort < v_atrisk
               or cur.m_orders < prev.m_orders)                  then 'at_risk'       -- dropped + (low OR orders↓)
        when cur.percentile_in_cohort > prev.percentile_in_cohort then 'percentile_up'
        when cur.percentile_in_cohort < prev.percentile_in_cohort then 'percentile_down'
        else null
      end as delta,
      case when prev.snapshot_id is null then
        jsonb_build_object('sentido', 'new', 'ventana_dias', (p_week - p_prev_week),
                           'n_min_ok', cur.n_min_ok, 'prov', '[V]')
      else
        jsonb_build_object(
          'sentido', case when cur.percentile_in_cohort > prev.percentile_in_cohort then 'up'
                          when cur.percentile_in_cohort < prev.percentile_in_cohort then 'down'
                          else 'equal' end,
          'magnitud', round(abs(cur.percentile_in_cohort - prev.percentile_in_cohort), 2),
          'ventana_dias', (p_week - p_prev_week),
          'n_min_ok', cur.n_min_ok,
          'orders_delta', round(coalesce(cur.m_orders, 0) - coalesce(prev.m_orders, 0), 2),
          'root_cause', case                                                          -- Leo: orders is the crux
            when coalesce(cur.m_orders, 0)     < coalesce(prev.m_orders, 0)     then 'orders'
            when coalesce(cur.m_cancel, 0)     > coalesce(prev.m_cancel, 0)     then 'cancel'
            when coalesce(cur.m_connection, 0) < coalesce(prev.m_connection, 0) then 'connection'
            when coalesce(cur.m_quality, 0)    < coalesce(prev.m_quality, 0)    then 'quality'
            else 'none' end,
          'prov', '[V]')
      end as pdelta
  ) d
  where cur.week = p_week and cur.cohort_rule_version = v_version and d.delta is not null
  on conflict (restaurant_id, cohort_id, week, cohort_rule_version) do update
    set delta_status = excluded.delta_status,
        percentile_in_cohort = excluded.percentile_in_cohort,
        gap_to_top = excluded.gap_to_top,
        percentile_delta = excluded.percentile_delta,
        n_min_ok = excluded.n_min_ok,                 -- review fix: refresh the gate flag WITH its values
        mode = excluded.mode,                         -- (kept stale before ⇒ sub-n_min leak on re-run)
        freshness_ts = excluded.freshness_ts;
end;
$$;
