-- 05D Diagnosis Engine · LIVE — F1: the ADOPTION problem type. The FIFTH problem flows E2E through the
-- SAME descriptor-driven engine. 04 §3 / §7 / §8 / §14. New per-type producers (fn_affected_adoption /
-- fn_impact_adoption) + register the type, then `create or replace` BOTH dispatchers with a `when
-- 'adoption'` case — the prior four cases stay VERBATIM (zero regression).
--
-- Determinism (§3.6 / §8): the affected anti-join (NOT EXISTS over Usage_Event) + the at-risk-GMV € are
-- SQL, no LLM. Threshold read BY NAME (§3.8): adoption_gap_days (seeded 30) — DEDICATED diagnosis gap,
-- DISTINCT from any nba_* action policy. Knob seeded via THIS migration too (hosted-safe) + idempotent
-- seed. Counts/€ PRODUCED, never seeded (§14). evidence = NULL (no order/row is the "evidence" of a gap).
--
-- REAL DATA: Usage_Event is NOT written by the shipped fn_generate_business_base, so adoption would see
-- every restaurant as non-adopting on the bare seed. fn_seed_usage_events (below) is the standalone
-- recency-signal generator the two real callers (seed.sql + the cohorts "generate example" button) run
-- right after fn_generate_business_base — the shipped generator stays untouched (§3.11).

-- ── register the built-in descriptor (mirrors shared/problem_types.ts PROBLEM_TYPES.adoption). ─────
insert into catalog."Problem_Type"(problem_type, area_type, affected_descriptor, impact_descriptor, concentration_dim, metric)
values ('adoption', 'product',
        '{"table":"Usage_Event","signal":"days_since_last_usage_event > adoption_gap_days","operator":"gt","threshold_knob":"adoption_gap_days"}'::jsonb,
        '{"kind":"at_risk_gmv"}'::jsonb, 'zone', 'restore_feature_adoption')
on conflict (problem_type) do nothing;

-- ── seed the diagnosis knob via the MIGRATION (hosted-safe, Codex P1) + idempotent. ───────────────
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('adoption_gap_days', '30', '[C]', 'leo')
on conflict (key) do nothing;

-- ── fn_seed_usage_events: the platform feature-usage log — the adoption-recency signal. Standalone
--    (the shipped generator stays untouched, §3.11); both real callers run it after the business base.
--    ~70% adopting (recent use within the gap) / ~30% non-adopting (last use 40..90d ago) — a REAL
--    population for the adoption diagnosis. event_type='feature_use' (distinct from movement/sandbox/
--    handoff ⇒ no test-count collision). recency is per-RESTAURANT (det_int salt 82) so a restaurant is
--    wholly recent or wholly stale (a clean signal). Salts 82..86 are unused elsewhere (no draw collision).
--    p_ref defaults to current_date (Codex P2): dates are relative to evaluation time — the SAME clock
--    fn_affected_adoption compares against (current_date - gap) — so the 70/30 split holds at ANY
--    wall-clock and the demo population never expires (a fixed anchor would flip everyone non-adopting
--    once now drifts past the gap). Callers pass current_date explicitly.
create or replace function public.fn_seed_usage_events(p_ref date default current_date)
returns void language plpgsql as $$
begin
  insert into tenant."Usage_Event"(restaurant_id, feature, event_type, ts)
  select r.restaurant_id,
         (array['menu_editor','promo_tool','analytics','inbox'])[1 + public.det_int(r.restaurant_id || ':' || g, 86, 4)],
         'feature_use',
         (p_ref - (case when public.det_int(r.restaurant_id, 82, 100) < 70
                        then public.det_int(r.restaurant_id || ':' || g, 83, 21)        -- adopting: 0..20d (recent)
                        else 40 + public.det_int(r.restaurant_id || ':' || g, 84, 51)   -- non-adopting: 40..90d (stale)
                   end))::timestamptz
  from tenant."Restaurant" r
  cross join lateral generate_series(1, 1 + public.det_int(r.restaurant_id, 85, 3)) g;
end;
$$;

-- ── fn_affected_adoption: restaurants in p_tenant whose MOST-RECENT Usage_Event is older than the gap
--    knob (or who have NO Usage_Event at all) — a NOT EXISTS anti-join over Usage_Event. Same complainant
--    anti-join shape as fn_affected_connection, optional segment slice. evidence = NULL. Knob BY NAME,
--    fail-closed. ────────────────────────────────────────────────────────────────────────────────────
create or replace function tenant.fn_affected_adoption(
  p_problem uuid, p_tenant text, p_window integer, p_segment text default null
) returns integer language plpgsql as $$
declare v_inserted integer; v_gap integer := catalog.knob_required_num('adoption_gap_days')::int;
begin
  insert into tenant."Affected"(problem_id, tenant_id, restaurant_id, complained, silent, evidence)
  select p_problem, r.tenant_id, na.restaurant_id,
         (c.restaurant_id is not null) as complained,
         (c.restaurant_id is null)     as silent,
         null::bigint                  as evidence
  from (
    -- non-adopting = NO usage event within the gap window (covers "never used" AND "stale > gap").
    select rr.restaurant_id
    from tenant."Restaurant" rr
    where rr.tenant_id = p_tenant
      and (p_segment is null or rr.segment::text = p_segment)   -- segment slice (enum ⇒ ::text)
      and not exists (
        -- adoption = recency of FEATURE usage; scope to event_type='feature_use' so unrelated platform
        -- telemetry (handoff/movement/sandbox events, written with a CURRENT ts by P01/cohort producers/
        -- the sandbox) cannot masquerade as adoption and silently drop a stale restaurant from the
        -- affected set (Codex P1). The producer fn_seed_usage_events writes exactly this event_type.
        select 1 from tenant."Usage_Event" ue
        where ue.restaurant_id = rr.restaurant_id
          and ue.event_type = 'feature_use'
          and ue.ts >= (current_date - v_gap)
      )
  ) na
  join tenant."Restaurant" r on r.restaurant_id = na.restaurant_id
  left join (
    select distinct restaurant_id from tenant."Conversation_Episode" where tenant_id = p_tenant
  ) c on c.restaurant_id = r.restaurant_id
  on conflict (problem_id, restaurant_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ── fn_impact_adoption: deterministic AT-RISK GMV. A non-adopting restaurant has disengaged, so its
--    ENTIRE GMV over the window is at risk from churn (no ratio scaling — there is no "fraction
--    adopted"; the whole revenue stream is exposed). Σ net_value over the affected set, window BY NAME.
--    Writes revenue_lost + provenance [I]; returns the total. coalesce ⇒ 0 over an empty set. ──────────
create or replace function tenant.fn_impact_adoption(p_problem uuid)
returns numeric language plpgsql as $$
declare v_total numeric; v_window integer := catalog.knob_required_num('window_silent')::int;
begin
  select coalesce(sum(o.net_value), 0) into v_total
  from tenant."Order" o
  where o.order_date >= (current_date - v_window)
    and o.restaurant_id in (
      select restaurant_id from tenant."Affected" where problem_id = p_problem
    );
  update tenant."Diagnosed_Problem" p
     set revenue_lost = v_total,
         provenance_by_field = p.provenance_by_field || jsonb_build_object('revenue_lost', '[I]')
   where p.problem_id = p_problem;
  return v_total;
end;
$$;

-- ── fn_hunt_silent: DISPATCHER += adoption case (prior four cases VERBATIM). ───────────────────────
create or replace function tenant.fn_hunt_silent(
  p_problem uuid, p_tenant text, p_window integer, p_segment text default null
) returns integer language plpgsql as $$
declare v_type text; v_inserted integer;
begin
  select problem_type into v_type
    from tenant."Diagnosed_Problem" where problem_id = p_problem;
  if v_type is null then
    raise exception 'fn_hunt_silent: unknown problem % (fail-closed)', p_problem;
  end if;
  case v_type
    when 'payment' then
      v_inserted := tenant.fn_affected_payment(p_problem, p_tenant, p_window, p_segment);
    when 'connection' then
      v_inserted := tenant.fn_affected_connection(p_problem, p_tenant, p_window, p_segment);
    when 'cancellation' then
      v_inserted := tenant.fn_affected_cancellation(p_problem, p_tenant, p_window, p_segment);
    when 'menu_quality' then
      v_inserted := tenant.fn_affected_menu_quality(p_problem, p_tenant, p_window, p_segment);
    when 'adoption' then
      v_inserted := tenant.fn_affected_adoption(p_problem, p_tenant, p_window, p_segment);
    else
      raise exception 'fn_hunt_silent: no affected producer for problem_type % (fail-closed)', v_type;
  end case;
  return v_inserted;
end;
$$;

-- ── fn_impact_revenue_lost: DISPATCHER += adoption case (prior four cases VERBATIM). ───────────────
create or replace function tenant.fn_impact_revenue_lost(p_problem uuid)
returns numeric language plpgsql as $$
declare v_type text; v_total numeric;
begin
  select problem_type into v_type
    from tenant."Diagnosed_Problem" where problem_id = p_problem;
  if v_type is null then
    raise exception 'fn_impact_revenue_lost: unknown problem % (fail-closed)', p_problem;
  end if;
  case v_type
    when 'payment' then
      v_total := tenant.fn_impact_payment(p_problem);
    when 'connection' then
      v_total := tenant.fn_impact_connection(p_problem);
    when 'cancellation' then
      v_total := tenant.fn_impact_cancellation(p_problem);
    when 'menu_quality' then
      v_total := tenant.fn_impact_menu_quality(p_problem);
    when 'adoption' then
      v_total := tenant.fn_impact_adoption(p_problem);
    else
      raise exception 'fn_impact_revenue_lost: no impact producer for problem_type % (fail-closed)', v_type;
  end case;
  return v_total;
end;
$$;
