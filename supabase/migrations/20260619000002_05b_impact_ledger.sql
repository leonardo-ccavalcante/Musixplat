-- 05B EPIC-B5 (US-B5.x) — impact-ledger producer. Completes f5_how_much =
-- {revenue_lost, churn_risk, cost_to_resolve, value_gained}. revenue_lost is produced earlier
-- (tenant.fn_impact_revenue_lost); this fills the OTHER THREE from PRODUCED counts + knobs read BY NAME
-- (§3.8 fail-closed). FAIL-CLOSED: no observable affected population (count(Affected)=0) ⇒ NO write ⇒
-- churn/cost/value stay NULL ⇒ the dossier stays PARTIAL (§14: never invent an impact figure).
-- churn_risk = silent share (churn-exposure proxy), itself a PRODUCED count — never an LLM number (§3.6).
create or replace function tenant.fn_impact_ledger(p_problem uuid) returns void
language plpgsql as $$
declare
  v_affected int;
  v_silent   int;
  v_revenue  numeric;
  v_cost_per numeric := catalog.knob_required_num('cost_per_affected_default');
  v_recovery numeric := catalog.knob_required_num('value_recovery_rate');
begin
  select count(*)::int, count(*) filter (where silent)::int
    into v_affected, v_silent
    from tenant."Affected" where problem_id = p_problem;

  -- fail-closed: nothing observable to quantify ⇒ leave f5 NULL (never invent churn/cost/value).
  if coalesce(v_affected, 0) = 0 then
    return;
  end if;

  select revenue_lost into v_revenue from tenant."Diagnosed_Problem" where problem_id = p_problem;

  update tenant."Diagnosed_Problem"
     set churn_risk      = round(v_silent::numeric / v_affected, 4),     -- silent share = churn exposure
         cost_to_resolve = round(v_cost_per * v_affected, 2),
         value_gained    = round(coalesce(v_revenue, 0) * v_recovery, 2),
         provenance_by_field = provenance_by_field
           || jsonb_build_object('churn_risk', '[I]', 'cost_to_resolve', '[I]', 'value_gained', '[I]'),
         last_seen_ts = now()
   where problem_id = p_problem;
end;
$$;
