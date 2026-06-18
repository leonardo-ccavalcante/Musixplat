-- Chunk 3 — F-1.8 v2 cohort KPI profile (MODEL v2 §A.4, BR-25). Hardened after adversarial review.
-- 4 families computed set-based from brutos (deterministic, never LLM), family-level provenance '[V]'
-- (every field uniform [V]; render-level provenance-per-field lands in chunk 6 where [C] upside mixes
-- in). k-anon respected (§3.9): suppressed cells get NO kpis. Stale kpis cleared each run (no toggle
-- residue). NOTHING fabricated: gmv stays NULL when no data; cohorts without orders get no kpis.
--   Volume      : total_orders=Σ(ok) · avg_orders=Σ(ok)/restaurants · avg_ticket=Σnet_value(ok)/Σ(ok) · gmv
--   Connection  : ratio = Σconnected/Σcommitted          (Weekly_Connection, 63d)
--   Fulfillment : delivery_rate=ok/total · cancel_rate_restaurant · cancel_rate_customer (over CONCLUDED=ok+failed)
--   Quality     : pct_photo, pct_description             (over total orders)
--   Tickets     : avg_tickets / restaurant               (Conversation_Episode, 90d window)
create or replace function cohort.fn_baseline_kpi(p_week date)
returns void language plpgsql as $$
declare v_version text := catalog.knob_text('cohort_rule_version_current');
begin
  -- clear any prior kpis for this version (re-run idempotence; suppressed cells stay clean, §3.9).
  update cohort."Cohort" set descriptive_baseline = coalesce(descriptive_baseline, '{}'::jsonb) - 'kpis'
    where cohort_rule_version = v_version;

  with mem as (
    select restaurant_id, cohort_id
    from cohort."Cohort_Membership_Snapshot"
    where week = p_week and cohort_rule_version = v_version
  ), rc as (
    select cohort_id, count(*) nr from mem group by cohort_id
  ), ord as (
    select m.cohort_id,
      count(*) filter (where o.payment_status = 'ok')                                          as n_ok,
      count(*) filter (where o.payment_status in ('ok','failed'))                              as n_concluded,
      count(*)                                                                                 as n_total,
      sum(o.net_value) filter (where o.payment_status = 'ok')                                  as gmv,
      count(*) filter (where o.payment_status = 'failed' and o.cancelled_by = 'restaurant')    as n_canc_rest,
      count(*) filter (where o.payment_status = 'failed' and o.cancelled_by = 'customer')      as n_canc_cust,
      count(*) filter (where o.has_photo)                                                      as n_photo,
      count(*) filter (where o.has_description)                                                as n_desc
    from mem m
    join tenant."Order" o on o.restaurant_id = m.restaurant_id
      and o.order_date > p_week - 90 and o.order_date <= p_week
    group by m.cohort_id
  ), conn as (
    select m.cohort_id, sum(w.connected_hours) ch, sum(w.committed_hours) cm
    from mem m
    join tenant."Weekly_Connection" w on w.restaurant_id = m.restaurant_id
      and w.week > p_week - 63 and w.week <= p_week
    group by m.cohort_id
  ), tick as (
    select m.cohort_id, count(c.episode_id) nt
    from mem m
    left join tenant."Conversation_Episode" c on c.restaurant_id = m.restaurant_id
      and c.ts > (p_week - 90)::timestamptz and c.ts <= (p_week + 1)::timestamptz
    group by m.cohort_id
  )
  update cohort."Cohort" c set descriptive_baseline =
    coalesce(c.descriptive_baseline, '{}'::jsonb) || jsonb_build_object('kpis', jsonb_build_object(
      'volume', jsonb_build_object(
        'total_orders', o.n_ok,
        'avg_orders',   round(o.n_ok::numeric / nullif(rc.nr, 0), 2),
        'avg_ticket',   round(o.gmv / nullif(o.n_ok, 0), 2),
        'gmv',          round(o.gmv, 2),                          -- NULL if no orders (honest, §14)
        'prov', '[V]'),
      'connection', jsonb_build_object(
        'ratio', round(cn.ch / nullif(cn.cm, 0), 4),
        'prov', '[V]'),
      'fulfillment', jsonb_build_object(
        'delivery_rate',          round(o.n_ok::numeric        / nullif(o.n_total, 0), 4),
        'cancel_rate_restaurant', round(o.n_canc_rest::numeric / nullif(o.n_concluded, 0), 4),
        'cancel_rate_customer',   round(o.n_canc_cust::numeric / nullif(o.n_concluded, 0), 4),
        'prov', '[V]'),
      'quality', jsonb_build_object(
        'pct_photo',       round(o.n_photo::numeric / nullif(o.n_total, 0), 4),
        'pct_description', round(o.n_desc::numeric  / nullif(o.n_total, 0), 4),
        'prov', '[V]'),
      'tickets', jsonb_build_object(
        'avg_tickets', round(coalesce(tk.nt, 0)::numeric / nullif(rc.nr, 0), 2),
        'prov', '[V]')
    ))
  from rc
  join ord  o  on o.cohort_id  = rc.cohort_id              -- require orders: no orders ⇒ no kpis (honest)
  left join conn cn on cn.cohort_id = rc.cohort_id
  left join tick tk on tk.cohort_id = rc.cohort_id
  where c.cohort_id = rc.cohort_id and c.cohort_rule_version = v_version
    and coalesce(c.k_suppression_applied, true) = false;   -- §3.9 suppressed ⇒ no KPI rendered
end;
$$;
