-- Review fix (P1-6) — fn_impact_payment: bound the €-at-risk sum to the SAME window the affected set used.
-- 04 §3.6/§14, BR-B10. fn_hunt_silent builds tenant."Affected" from failed orders WHERE
-- order_date >= current_date - window_silent. The payment impact summed those restaurants' ALL-TIME failed
-- orders, over-counting €-at-risk for any restaurant that ALSO had pre-window failures. Its sibling impact
-- producers (connection/cancellation/menu_quality/adoption) already window by window_silent — this aligns
-- payment to the same measurement frontier. revenue_lost stays a §14 RESULT written ONLY here, provenance [I].
-- create-or-replace keeps the 1-arg signature ⇒ the dispatcher (fn_impact_revenue_lost) and the TS caller
-- (impact.ts computeRevenueLost) are unchanged. Window read BY NAME (§3.8, knob_required_num = fail-closed).
-- Coupling note: fn_hunt_silent takes its window as an ARGUMENT; every current caller (orchestrator
-- silent.ts, pgTAP) passes window_silent, so the affected window == this impact window. A future caller
-- that hunts with a custom p_window would diverge from this knob-based window — keep them aligned.

-- Ensure the window knob exists on a migrated-but-not-reseeded hosted DB (it lives in seed.sql, and a hosted
-- upgrade runs migrations WITHOUT re-running seed.sql). Idempotent; [C] config, not a RESULT ⇒ seeding
-- allowed (§14). Same value as seed.sql so a present knob is preserved by on-conflict-do-nothing.
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('window_silent', '30', '[C]', 'leo')
on conflict (key) do nothing;

create or replace function tenant.fn_impact_payment(p_problem uuid)
returns numeric language plpgsql as $$
declare v_total numeric; v_window integer := catalog.knob_required_num('window_silent')::int;
begin
  select coalesce(sum(o.net_value), 0) into v_total
  from tenant."Order" o
  where o.payment_status = 'failed'
    and o.order_date >= (current_date - v_window)   -- §14: same frontier as the affected set (fn_hunt_silent)
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
