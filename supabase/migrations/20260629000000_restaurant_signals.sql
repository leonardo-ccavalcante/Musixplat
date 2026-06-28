-- Agent "find the real problem" scan (Fatia 1.5). Deterministic, per-restaurant: returns which problem
-- types actually have SIGNAL for ONE restaurant, so the chat agent picks among REAL signals instead of
-- guessing a type blind (a wrong guess dumps irrelevant scary numbers on the owner). §8 determinism in SQL.
--
-- REUSE: cohort.fn_nba_test_all already scans 3 of the 5 types per restaurant, cohort-gated (verdict
-- below/above ∧ n_min_ok ∧ k_anon_ok = a real, non-noise, non-re-identifying signal):
--   m_connection -> connection · cancel_by_restaurant -> cancellation · m_quality -> menu_quality.
-- The other 2 are intrinsic raw checks (no cohort gate, like their fn_affected_* producers):
--   payment  -> the restaurant has failed-payment orders in the recent window (90d, the cohort lookback).
--   adoption -> the restaurant has NO feature_use event within adoption_gap_days (knob, BY NAME).
-- Returns at most one row per type, ONLY when there is signal. No result columns (§14): pure read.

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
  -- payment: failed-payment orders present in the recent window (intrinsic, no cohort gate).
  select 'payment', 'above', count(*)::numeric, 0
  from tenant."Order"
  where restaurant_id = p_restaurant
    and payment_status = 'failed'
    and order_date >= current_date - 90
  having count(*) > 0

  union all
  -- adoption: no feature_use event within adoption_gap_days ⇒ the owner isn't using the platform.
  -- Guard on restaurant existence first: "no usage" is vacuously true for an unknown id, so without this a
  -- dangling restaurant would get a phantom adoption signal (the other branches need real orders/membership).
  select 'adoption', 'below', 0, catalog.knob_required_num('adoption_gap_days')
  where exists (select 1 from tenant."Restaurant" where restaurant_id = p_restaurant)
    and not exists (
      select 1 from tenant."Usage_Event"
      where restaurant_id = p_restaurant
        and event_type = 'feature_use'
        and ts >= current_date - (catalog.knob_required_num('adoption_gap_days')::int)
    );
$$;
