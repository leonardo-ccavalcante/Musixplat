-- 05D Diagnosis Engine · LIVE — F1: the CONNECTION problem type. A SECOND problem flows E2E through
-- the SAME descriptor-driven engine (F0 generalized it). 04 §3 / §7 / §8 / §14. We add the per-type
-- producers (fn_affected_connection / fn_impact_connection) + register the type, then `create or
-- replace` BOTH dispatchers with a `when 'connection'` case — the payment case is copied VERBATIM
-- (zero regression: 47/35/€3760 still produced via the dispatcher).
--
-- Determinism (§3.6 / §8): the affected anti-join + the at-risk-GMV € are SQL, no LLM. Threshold read
-- BY NAME (§3.8): catalog.knob_required_num('connection_min_ratio') — the DIAGNOSIS threshold (seeded
-- 0.80), DISTINCT from the A1 nba_connection_min_ratio ACTION policy (Codex P2: tuning when to PROPOSE
-- reconnect must not silently shift what COUNTS as a diagnosed connection problem). Fail-closed (§3.7):
-- an unregistered type still RAISES. Counts/€ are PRODUCED, never seeded (§14). evidence = NULL for
-- connection (no failed-order row).

-- ── register the built-in descriptor (mirrors shared/problem_types.ts PROBLEM_TYPES.connection and
--    the payment seed in 20260621000002). A CATALOG row (configuration, [C]), not a produced result. ─
insert into catalog."Problem_Type"(problem_type, area_type, affected_descriptor, impact_descriptor, concentration_dim, metric)
values ('connection', 'performance',
        '{"table":"Weekly_Connection","signal":"connection_ratio < connection_min_ratio","operator":"lt","threshold_knob":"connection_min_ratio"}'::jsonb,
        '{"kind":"at_risk_gmv"}'::jsonb, 'zone', 'restore_connection_uptime')
on conflict (problem_type) do nothing;

-- ── fn_affected_connection: restaurants in p_tenant whose connection ratio over the window
--    (week >= current_date - p_window) is BELOW the knob. Same anti-join shape as fn_affected_payment
--    (∖ complainants via Conversation_Episode), optional segment slice. evidence = NULL (no order is
--    the evidence for a connection fault). Threshold BY NAME, fail-closed. ──────────────────────────
create or replace function tenant.fn_affected_connection(
  p_problem uuid, p_tenant text, p_window integer, p_segment text default null
) returns integer language plpgsql as $$
declare v_inserted integer; v_min numeric := catalog.knob_required_num('connection_min_ratio');
begin
  insert into tenant."Affected"(problem_id, tenant_id, restaurant_id, complained, silent, evidence)
  select p_problem, r.tenant_id, lc.restaurant_id,
         (c.restaurant_id is not null) as complained,
         (c.restaurant_id is null)     as silent,
         null::bigint                  as evidence
  from (
    select w.restaurant_id
    from tenant."Weekly_Connection" w
    join tenant."Restaurant" rr on rr.restaurant_id = w.restaurant_id
    where rr.tenant_id = p_tenant
      and (p_segment is null or rr.segment::text = p_segment)   -- segment slice (enum ⇒ ::text)
      and w.week >= (current_date - p_window)
    group by w.restaurant_id
    having sum(w.connected_hours) / nullif(sum(w.committed_hours), 0) < v_min
  ) lc
  join tenant."Restaurant" r on r.restaurant_id = lc.restaurant_id
  left join (
    select distinct restaurant_id from tenant."Conversation_Episode" where tenant_id = p_tenant
  ) c on c.restaurant_id = r.restaurant_id
  on conflict (problem_id, restaurant_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ── fn_impact_connection: deterministic AT-RISK GMV. For each affected restaurant, the GMV over the
--    same window scaled by its disconnection fraction (1 − ratio) — the revenue proportional to the
--    hours it was NOT connected. Summed across the affected set. Window read BY NAME (same knob as the
--    silent-hunt). Writes revenue_lost + provenance [I]; returns the total (mirrors fn_impact_payment). ─
create or replace function tenant.fn_impact_connection(p_problem uuid)
returns numeric language plpgsql as $$
declare v_total numeric; v_window integer := catalog.knob_required_num('window_silent')::int;
begin
  -- per affected restaurant: (Σ net_value over the window) × (1 − ratio); then Σ across the set.
  -- The inner aggregate (group by restaurant_id) collapses the weekly rows into one ratio/restaurant;
  -- the outer sum totals the per-restaurant at-risk €. coalesce ⇒ 0 (never NULL) over an empty set.
  select coalesce(sum(per_rest), 0) into v_total from (
    select (select coalesce(sum(o.net_value), 0) from tenant."Order" o
              where o.restaurant_id = w.restaurant_id and o.order_date >= (current_date - v_window))
           * (1 - sum(w.connected_hours) / nullif(sum(w.committed_hours), 0)) as per_rest
    from tenant."Weekly_Connection" w
    where w.restaurant_id in (select restaurant_id from tenant."Affected" where problem_id = p_problem)
      and w.week >= (current_date - v_window)
    group by w.restaurant_id
  ) s;
  update tenant."Diagnosed_Problem" p
     set revenue_lost = v_total,
         provenance_by_field = p.provenance_by_field || jsonb_build_object('revenue_lost', '[I]')
   where p.problem_id = p_problem;
  return v_total;
end;
$$;

-- ── fn_hunt_silent: DISPATCHER += connection case (payment case VERBATIM from 20260621000003). ─────
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
    else
      raise exception 'fn_hunt_silent: no affected producer for problem_type % (fail-closed)', v_type;
  end case;
  return v_inserted;
end;
$$;

-- ── fn_impact_revenue_lost: DISPATCHER += connection case (payment case VERBATIM from 20260621000004). ─
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
    else
      raise exception 'fn_impact_revenue_lost: no impact producer for problem_type % (fail-closed)', v_type;
  end case;
  return v_total;
end;
$$;
