-- F-5.5 + F-5.2 (04 §3/§14). scope_owner_ref annotation + the sole mutant output handoff.

-- F-5.5 — annotate scope_owner_ref {owner_id, level} from the pool's operator. Deterministic;
-- owner validated against gov.User (never an arbitrary client value).
create or replace function cohort.fn_annotate_scope(p_week date)
returns void language plpgsql as $$
declare v_version text := catalog.knob_text('cohort_rule_version_current');
begin
  update cohort."Cohort_Membership_Snapshot" p
    set scope_owner_ref = jsonb_build_object('owner_id', o.user_id, 'level', o.org_level)
  from tenant."Restaurant" r
  cross join lateral (
    select user_id, org_level from gov."User" where tenant_id = r.tenant_id
    order by user_id limit 1
  ) o
  where p.restaurant_id = r.restaurant_id
    and p.week = p_week and p.cohort_rule_version = v_version;
end;
$$;

-- F-5.2 — handoff: emit EXACTLY ONE Prioritized_NBA_Event + append Usage_Event, atomically.
-- tenant resolved server-side (p_tenant from the session, never the body). Cross-pool ⇒ abort.
-- Idempotent on double-click via the natural key. risk_class is NOT born here (born in P02).
-- Payload carries {cohort_id, restaurant_id} to match 02:1A TRIGGER-IN.
create or replace function cohort.fn_handoff(
  p_restaurant text, p_cohort text, p_subgroup text, p_week date,
  p_operator text, p_tenant text
) returns cohort."Prioritized_NBA_Event" language plpgsql as $$
declare
  v_rest_tenant text;
  v_snap cohort."Cohort_Membership_Snapshot";
  v_event cohort."Prioritized_NBA_Event";
begin
  -- cross-pool guard (04 §7): restaurant must belong to the operator's pool.
  select tenant_id into v_rest_tenant from tenant."Restaurant" where restaurant_id = p_restaurant;
  if v_rest_tenant is null or v_rest_tenant <> p_tenant then
    raise exception 'cross-pool handoff blocked for % (pool %)', p_restaurant, p_tenant
      using errcode = 'check_violation';
  end if;

  -- fail-closed: no snapshot ⇒ nothing to hand off.
  select * into v_snap from cohort."Cohort_Membership_Snapshot"
   where restaurant_id = p_restaurant and cohort_id = p_cohort and week = p_week
   order by snapshot_id desc limit 1;
  if v_snap.snapshot_id is null then
    raise exception 'no snapshot to hand off' using errcode = 'no_data_found';
  end if;

  insert into cohort."Prioritized_NBA_Event"
    (restaurant_id, cohort_id, subgroup_id, week, percentile_in_cohort, gap_to_top,
     n_min_ok, freshness_ts, mode, cohort_rule_version, scope_owner_ref, operator_id, handoff_ts)
  values (p_restaurant, p_cohort, coalesce(p_subgroup, v_snap.subgroup_id), p_week,
     v_snap.percentile_in_cohort, v_snap.gap_to_top, v_snap.n_min_ok, v_snap.freshness_ts,
     v_snap.mode, v_snap.cohort_rule_version, v_snap.scope_owner_ref, p_operator, now())
  on conflict (restaurant_id, cohort_id, week, cohort_rule_version) do update
    set operator_id = excluded.operator_id, handoff_ts = excluded.handoff_ts
  returning * into v_event;

  insert into tenant."Usage_Event"(restaurant_id, user_id, feature, event_type, payload)
  values (p_restaurant, p_operator, 'cohorts', 'handoff',
    jsonb_build_object('event_id', v_event.event_id, 'cohort_id', p_cohort,
                       'restaurant_id', p_restaurant,
                       'cohort_rule_version', v_event.cohort_rule_version));

  return v_event;
end;
$$;
