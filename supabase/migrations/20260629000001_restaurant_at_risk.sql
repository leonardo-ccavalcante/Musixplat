-- Per-restaurant at-risk € for the owner-facing reply. The diagnosis engine's revenue_lost sums net_value
-- over the WHOLE affected set (pool-wide pattern) — correct for the operator cockpit, but WRONG to show one
-- owner as "your money at risk" (it's far too high). This returns THIS restaurant's OWN at-risk value, and
-- only for the money-bearing types; non-money types (connection/menu_quality/adoption) return 0 ⇒ the agent
-- shows NO number, just the finding + plan. Deterministic, read-only (§8/§14).
--
--   payment      -> sum(net_value) of this restaurant's failed orders within window_silent.
--   cancellation -> sum(net_value) of this restaurant's restaurant-cancelled failed orders within window_silent.
--   else         -> 0 (no honest per-restaurant money figure).
-- Window read BY NAME (window_silent, §3.8) so the owner figure uses the SAME frontier as the engine impact
-- producers (fn_impact_payment/cancellation) — never a wider window that would inflate the owner's number.

create or replace function tenant.fn_restaurant_at_risk(p_restaurant text, p_problem_type text)
returns numeric language sql stable as $$
  select case p_problem_type
    when 'payment' then (
      select coalesce(sum(net_value), 0)
      from tenant."Order"
      where restaurant_id = p_restaurant
        and payment_status = 'failed'
        and order_date >= current_date - catalog.knob_required_num('window_silent')::int
    )
    when 'cancellation' then (
      select coalesce(sum(net_value), 0)
      from tenant."Order"
      where restaurant_id = p_restaurant
        and payment_status = 'failed'
        and cancelled_by = 'restaurant'
        and order_date >= current_date - catalog.knob_required_num('window_silent')::int
    )
    else 0
  end;
$$;
