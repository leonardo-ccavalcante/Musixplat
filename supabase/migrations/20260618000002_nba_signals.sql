-- 02:NBA-SIG — deterministic funnel signals per restaurant (the "señales de cuentas" the Autonomy
-- Cockpit's node 1A reads to walk the issue tree). Stored on membership, NULL pre-run (§14). Numbers
-- from SQL only, never the LLM (§2). Computed ONLY for ranked (complete-brutos) restaurants — a row
-- with m_orders NULL (failed fn_rank's orders∧connection inner join) gets NO signal (fail-closed, no
-- fabricated 0). Reuses the existing m_* metrics; adds price-vs-cohort, the cancel split, the zone trend.
-- NOTE (output frontier §3.2): written PRE-gate (before fn_gate_n_min/k_anon in runP01), like
-- percentile_in_cohort. These are a restaurant's OWN-data signals (not cross-tenant aggregates), but any
-- consumer (cockpit node 1A / the AGENTE) MUST still join on k_anon_ok / mode before surfacing them.

alter table cohort."Cohort_Membership_Snapshot"
  add column if not exists price_pctile_in_cohort numeric,   -- A2/A3 — price vs cohort peers
  add column if not exists cancel_by_restaurant    numeric,   -- A6 — restaurant-side cancel rate
  add column if not exists cancel_by_customer       numeric,   -- A7 — customer-side cancel rate
  add column if not exists zone_demand_trend         numeric;  -- A5 — zone demand recent vs prior (may be < 0 = drop)

create or replace function cohort.fn_nba_signals(p_week date)
returns void language plpgsql as $$
declare v_version text := catalog.knob_text('cohort_rule_version_current');
begin
  -- A2/A3 — price percentile within cohort (avg gross_value of concluded-ok orders, ranked per cohort).
  with px as (
    select restaurant_id, avg(gross_value) as price
    from tenant."Order"
    where order_date > p_week - 90 and order_date <= p_week and payment_status = 'ok'
    group by restaurant_id
  ), ranked as (
    select p.snapshot_id,
           percent_rank() over (partition by p.cohort_id order by px.price) as pr
    from cohort."Cohort_Membership_Snapshot" p
    join px on px.restaurant_id = p.restaurant_id
    where p.week = p_week and p.cohort_rule_version = v_version and p.m_orders is not null
  )
  update cohort."Cohort_Membership_Snapshot" p
    set price_pctile_in_cohort = round((r.pr * 100)::numeric, 2)
    from ranked r where r.snapshot_id = p.snapshot_id;

  -- A6/A7 — cancel split over concluded orders (restaurant vs customer). NULL if no concluded (§14).
  with cx as (
    select restaurant_id,
           count(*) filter (where payment_status = 'failed' and cancelled_by = 'restaurant')::numeric
             / nullif(count(*) filter (where payment_status in ('ok','failed')), 0) as c_rest,
           count(*) filter (where payment_status = 'failed' and cancelled_by = 'customer')::numeric
             / nullif(count(*) filter (where payment_status in ('ok','failed')), 0) as c_cust
    from tenant."Order"
    where order_date > p_week - 90 and order_date <= p_week
    group by restaurant_id
  )
  update cohort."Cohort_Membership_Snapshot" p
    set cancel_by_restaurant = cx.c_rest, cancel_by_customer = cx.c_cust
    from cx
    where cx.restaurant_id = p.restaurant_id
      and p.week = p_week and p.cohort_rule_version = v_version and p.m_orders is not null;

  -- A5 — zone demand trend (concluded-ok orders last 30d vs prior 30d), per zone. NULL if no prior (§14).
  with zt as (
    select r.zone,
           count(*) filter (where o.order_date > p_week - 30 and o.order_date <= p_week      and o.payment_status='ok')::numeric as recent,
           count(*) filter (where o.order_date > p_week - 60 and o.order_date <= p_week - 30 and o.payment_status='ok')::numeric as prior
    from tenant."Order" o
    join tenant."Restaurant" r on r.restaurant_id = o.restaurant_id
    where o.order_date > p_week - 60 and o.order_date <= p_week and r.zone is not null
    group by r.zone
  )
  update cohort."Cohort_Membership_Snapshot" p
    set zone_demand_trend = round((zt.recent / nullif(zt.prior, 0) - 1)::numeric, 4)
    from tenant."Restaurant" r, zt
    where r.restaurant_id = p.restaurant_id and zt.zone = r.zone and zt.prior is not null
      and p.week = p_week and p.cohort_rule_version = v_version and p.m_orders is not null;
end;
$$;
