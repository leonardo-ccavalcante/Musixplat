-- Align fn_restaurant_signals' payment window to the window_silent knob (§3.8 threshold-by-name), so the
-- signal scan uses the SAME recent frontier as the engine impact producers instead of a hard-coded 90 days
-- (Codex review). Body otherwise identical to 20260629000000 — only the payment branch window changes.

create or replace function cohort.fn_restaurant_signals(p_restaurant text, p_week date)
returns table(problem_type text, direction text, measured numeric, standard numeric)
language sql stable as $$
  -- 3 cohort-gated NBA dimensions — real signal only (below/above + both gates true).
  select m.problem_type, v.verdict as direction, v.measured, v.standard
  from cohort.fn_nba_test_all(p_restaurant, p_week) v
  join (values ('m_connection', 'connection'),
               ('cancel_by_restaurant', 'cancellation'),
               ('m_quality', 'menu_quality')) as m(dimension, problem_type)
    on m.dimension = v.dimension
  where v.verdict in ('below', 'above') and v.n_min_ok and v.k_anon_ok

  union all
  -- payment: failed-payment orders present within window_silent (BY NAME, aligned with the impact producer).
  select 'payment', 'above', count(*)::numeric, 0
  from tenant."Order"
  where restaurant_id = p_restaurant
    and payment_status = 'failed'
    and order_date >= current_date - catalog.knob_required_num('window_silent')::int
  having count(*) > 0

  union all
  -- adoption: no feature_use within adoption_gap_days; guarded on restaurant existence (no phantom signal).
  select 'adoption', 'below', 0, catalog.knob_required_num('adoption_gap_days')
  where exists (select 1 from tenant."Restaurant" where restaurant_id = p_restaurant)
    and not exists (
      select 1 from tenant."Usage_Event"
      where restaurant_id = p_restaurant
        and event_type = 'feature_use'
        and ts >= current_date - (catalog.knob_required_num('adoption_gap_days')::int)
    );
$$;
