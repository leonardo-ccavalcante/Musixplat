-- 05D L3 — make the dispatchers route a LIVE (operator-taught) type to its BOUND vetted producer.
-- 04 §3 / §7 / §8 / §14. A live type can't author SQL (injection); instead it BINDS its measurement to one
-- of the 5 builtins via catalog."Problem_Type".measured_by. Here both dispatchers resolve the EFFECTIVE
-- producer: if the problem's type is a LIVE row, route to its measured_by; otherwise it's a builtin and
-- routes to itself (zero change for the 5 builtins — payment still 47/35/€3760). A live type with NO
-- binding is unmeasurable: the orchestrator short-circuits to needs_human BEFORE calling these, but if one
-- ever reaches here we fail-closed RAISE (never a silent wrong number). No dynamic SQL — the EFFECTIVE type
-- still feeds the SAME hardcoded `case` over the vetted producers (§8). The builtin list is enumerated ONCE
-- (the case arms); "is this live?" is a catalog lookup, not a re-hardcoded builtin list.

-- ── fn_hunt_silent: AFFECTED dispatcher + live-type effective-producer resolution. ───────────────────────
create or replace function tenant.fn_hunt_silent(
  p_problem uuid, p_tenant text, p_window integer, p_segment text default null
) returns integer language plpgsql as $$
declare v_type text; v_eff text; v_inserted integer;
begin
  select problem_type into v_type
    from tenant."Diagnosed_Problem" where problem_id = p_problem;
  if v_type is null then
    raise exception 'fn_hunt_silent: unknown problem % (fail-closed)', p_problem;
  end if;
  -- L3: a LIVE type routes to its bound producer (measured_by); a builtin routes to itself.
  select measured_by into v_eff
    from catalog."Problem_Type" where problem_type = v_type and origin = 'live' and active;
  if found then
    if v_eff is null then
      raise exception 'fn_hunt_silent: live type % has no bound producer (fail-closed)', v_type;
    end if;
  else
    v_eff := v_type;
  end if;
  case v_eff
    when 'payment'      then v_inserted := tenant.fn_affected_payment(p_problem, p_tenant, p_window, p_segment);
    when 'connection'   then v_inserted := tenant.fn_affected_connection(p_problem, p_tenant, p_window, p_segment);
    when 'cancellation' then v_inserted := tenant.fn_affected_cancellation(p_problem, p_tenant, p_window, p_segment);
    when 'menu_quality' then v_inserted := tenant.fn_affected_menu_quality(p_problem, p_tenant, p_window, p_segment);
    when 'adoption'     then v_inserted := tenant.fn_affected_adoption(p_problem, p_tenant, p_window, p_segment);
    else raise exception 'fn_hunt_silent: no affected producer for % (fail-closed)', v_eff;
  end case;
  return v_inserted;
end;
$$;

-- ── fn_impact_revenue_lost: IMPACT dispatcher + the SAME live-type effective-producer resolution. ─────────
create or replace function tenant.fn_impact_revenue_lost(p_problem uuid)
returns numeric language plpgsql as $$
declare v_type text; v_eff text; v_total numeric;
begin
  select problem_type into v_type
    from tenant."Diagnosed_Problem" where problem_id = p_problem;
  if v_type is null then
    raise exception 'fn_impact_revenue_lost: unknown problem % (fail-closed)', p_problem;
  end if;
  select measured_by into v_eff
    from catalog."Problem_Type" where problem_type = v_type and origin = 'live' and active;
  if found then
    if v_eff is null then
      raise exception 'fn_impact_revenue_lost: live type % has no bound producer (fail-closed)', v_type;
    end if;
  else
    v_eff := v_type;
  end if;
  case v_eff
    when 'payment'      then v_total := tenant.fn_impact_payment(p_problem);
    when 'connection'   then v_total := tenant.fn_impact_connection(p_problem);
    when 'cancellation' then v_total := tenant.fn_impact_cancellation(p_problem);
    when 'menu_quality' then v_total := tenant.fn_impact_menu_quality(p_problem);
    when 'adoption'     then v_total := tenant.fn_impact_adoption(p_problem);
    else raise exception 'fn_impact_revenue_lost: no impact producer for % (fail-closed)', v_eff;
  end case;
  return v_total;
end;
$$;
