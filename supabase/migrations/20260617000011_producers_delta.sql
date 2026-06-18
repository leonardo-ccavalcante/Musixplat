-- Delta / movement / counts / anti-mezcla (04 §3/§6/§14). Deterministic, version-stamped.

-- F-2.2 — diff snapshot_to vs snapshot_from ⇒ Prioritized_NBA_Event.delta_status. Only accounts
-- with a meaningful delta (or novo/churn) get an event. SAME version only (anti-mezcla); same
-- tenant handled by the read guard. at_risk threshold BY NAME.
create or replace function cohort.fn_diff_delta(p_week date, p_prev_week date)
returns void language plpgsql as $$
declare
  v_version text := catalog.knob_text('cohort_rule_version_current');
  v_atrisk numeric := catalog.knob_required_num('at_risk_percentile_max');
begin
  insert into cohort."Prioritized_NBA_Event"
    (restaurant_id, cohort_id, subgroup_id, week, percentile_in_cohort, gap_to_top,
     delta_status, n_min_ok, freshness_ts, mode, cohort_rule_version, scope_owner_ref)
  select cur.restaurant_id, cur.cohort_id, cur.subgroup_id, cur.week,
         cur.percentile_in_cohort, cur.gap_to_top, d.delta::public.delta_status,
         cur.n_min_ok, now(), cur.mode, cur.cohort_rule_version, cur.scope_owner_ref
  from cohort."Cohort_Membership_Snapshot" cur
  left join cohort."Cohort_Membership_Snapshot" prev
    on prev.restaurant_id = cur.restaurant_id
   and prev.week = p_prev_week and prev.cohort_rule_version = v_version
  cross join lateral (select case
      when cohort.fn_recurrence(cur.restaurant_id, cur.week) = 0 then 'churn'
      when prev.snapshot_id is null then 'new'
      when prev.cohort_id <> cur.cohort_id then 'cohort_changed'
      when cur.percentile_in_cohort > prev.percentile_in_cohort then 'percentile_up'
      when cur.percentile_in_cohort < prev.percentile_in_cohort
           and cur.percentile_in_cohort < v_atrisk then 'at_risk'
      when cur.percentile_in_cohort < prev.percentile_in_cohort then 'percentile_down'
      else null end as delta) d
  where cur.week = p_week and cur.cohort_rule_version = v_version and d.delta is not null
  on conflict (restaurant_id, cohort_id, week, cohort_rule_version) do update
    set delta_status = excluded.delta_status,
        percentile_in_cohort = excluded.percentile_in_cohort,
        gap_to_top = excluded.gap_to_top,
        freshness_ts = excluded.freshness_ts;
end;
$$;

-- F-2.6 — movement log, append-only, version stamped per row. MOVIMIENTO_LOG is absorbed into
-- Usage_Event (no new table, denylist 04 §4).
create or replace function cohort.fn_log_movement(p_week date)
returns void language plpgsql as $$
declare v_version text := catalog.knob_text('cohort_rule_version_current');
begin
  insert into tenant."Usage_Event"(restaurant_id, feature, event_type, payload)
  select e.restaurant_id, 'cohorts', 'movement',
         jsonb_build_object('delta_status', e.delta_status, 'cohort_id', e.cohort_id,
                            'week', e.week, 'cohort_rule_version', e.cohort_rule_version)
  from cohort."Prioritized_NBA_Event" e
  where e.week = p_week and e.cohort_rule_version = v_version and e.delta_status is not null;
end;
$$;

-- F-5.4 / F-3.4 — n_cohort_x_intent: deterministic count of raw tickets per cohort × intent.
-- Cohort dimension DERIVED via join to Pertenencia (producer output). k-anon respected: cells
-- with k_suppression_applied are excluded from the cross-tenant output.
create or replace function cohort.fn_cohort_intent_count(p_week date)
returns table(cohort_id text, intent text, n integer) language sql stable as $$
  select p.cohort_id, ce.intent, count(*)::integer
  from tenant."Conversation_Episode" ce
  join cohort."Cohort_Membership_Snapshot" p
    on p.restaurant_id = ce.restaurant_id and p.week = p_week
  join cohort."Cohort" c on c.cohort_id = p.cohort_id
  where coalesce(c.k_suppression_applied, true) = false and ce.intent is not null
  group by p.cohort_id, ce.intent;
$$;

-- F-4.3 — anti-mezcla guard. fail-closed: more than one distinct cohort_rule_version ⇒ raise
-- (never render a mix, 04 §6 / EC-3). The TS read layer logs the blocked attempt to Security_Log.
create or replace function cohort.fn_assert_single_version(p_versions text[])
returns void language plpgsql immutable as $$
begin
  if (select count(distinct v) from unnest(p_versions) v where v is not null) > 1 then
    raise exception 'anti-mezcla: refusing to mix cohort_rule_version: %', p_versions
      using errcode = 'check_violation';
  end if;
end;
$$;
