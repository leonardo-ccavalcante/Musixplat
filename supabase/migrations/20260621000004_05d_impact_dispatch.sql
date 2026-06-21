-- 05D Diagnosis Engine · LIVE — F0 Task 4: IMPACT dispatcher (generalizes €-at-risk).
-- 04 §3 / §7 / §8 / §14. The shipped fn_impact_revenue_lost hard-coded the payment € formula.
-- We DE-COUPLE it: the payment body moves verbatim into fn_impact_payment, and
-- fn_impact_revenue_lost becomes a DISPATCHER on Diagnosed_Problem.problem_type. Payment € is
-- byte-identical (sum(net_value) over the affected failed orders) ⇒ zero regression (€3760).
--
-- Fail-closed (§3.7): an unregistered problem_type RAISES — never a silent wrong number (§8).
-- Determinism (§3.6): the sum is SQL. revenue_lost is a §14 RESULT — written ONLY here, with
-- provenance [I] (inferred, BR-B10). churn_risk stays NULL (no producer this session).

-- ── fn_impact_payment: the EXACT revenue_lost body from migration 20260617000014. Writes
--    revenue_lost + provenance [I] over the affected set; returns the total. ───────────────────
create or replace function tenant.fn_impact_payment(p_problem uuid)
returns numeric language plpgsql as $$
declare v_total numeric;
begin
  select coalesce(sum(o.net_value), 0) into v_total
  from tenant."Order" o
  where o.payment_status = 'failed'
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

-- ── fn_impact_revenue_lost: DISPATCHER on problem_type. Same 1-arg signature ⇒ the shipped TS
--    caller (impact.ts computeRevenueLost) is unchanged. case 'payment' → fn_impact_payment;
--    any other (unregistered) type ⇒ fail-closed RAISE. ────────────────────────────────────────
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
    else
      raise exception 'fn_impact_revenue_lost: no impact producer for problem_type % (fail-closed)', v_type;
  end case;
  return v_total;
end;
$$;
