-- Chunk 4 — F-1.6 topo-vs-base (2 band pairs) + F-1.7 UPSIDE weighted (MODEL v2 §A.5/§A.6).
-- The 4 component metrics are stored on the membership by fn_rank (single source of truth — no
-- metric-SQL drift across producers). Bands = P90+/P75+/P25-/P10-; topo-vs-base pairs = P90↔P10 and
-- P75↔P25 (Leo: "como o 90 compara com 10, e o 75 com 25"). UPSIDE = order-lift if the base operated
-- like the top, ATTRIBUTED across factors by the ratified weights (connection .40 · quality .25 ·
-- cancel .20 · price .15) — always [C] (projection). k-anon respected per cohort AND per band.

-- ── store the per-restaurant component metrics on the membership (RESULT, NULL pre-run, §14). ──
alter table cohort."Cohort_Membership_Snapshot"
  add column if not exists m_orders     numeric,
  add column if not exists m_connection numeric,
  add column if not exists m_quality    numeric,
  add column if not exists m_cancel     numeric;

-- ── F-1.2 v2.1 — fn_rank now also persists mo/mc/mq/mx (carried through the CTEs). Composite logic
--    unchanged from chunk 2 (still pgTAP-verified). ──
create or replace function cohort.fn_rank_cohort(p_week date)
returns void language plpgsql as $$
declare
  v_version text := catalog.knob_text('cohort_rule_version_current');
  w_o numeric := catalog.knob_required_num('weight_score_orders');
  w_c numeric := catalog.knob_required_num('weight_score_connection');
  w_q numeric := catalog.knob_required_num('weight_score_quality');
  w_x numeric := catalog.knob_required_num('weight_score_cancel');
begin
  with om as (
    select restaurant_id,
           count(*) filter (where payment_status = 'ok')::numeric                       as m_orders,
           avg((has_photo::int + has_description::int) / 2.0)                            as m_quality,
           count(*) filter (where payment_status = 'failed')::numeric
             / nullif(count(*) filter (where payment_status in ('ok','failed')), 0)      as m_cancel
    from tenant."Order"
    where order_date > p_week - 90 and order_date <= p_week
    group by restaurant_id
  ), cm as (
    select restaurant_id, sum(connected_hours) / nullif(sum(committed_hours), 0) as m_conn
    from tenant."Weekly_Connection"
    where week > p_week - 63 and week <= p_week
    group by restaurant_id
  ), base as (
    select p.snapshot_id, p.cohort_id,
           om.m_orders as mo, cm.m_conn as mc, om.m_quality as mq, om.m_cancel as mx  -- §14: NULL if no concluded orders
    from cohort."Cohort_Membership_Snapshot" p
    join om on om.restaurant_id = p.restaurant_id
    join cm on cm.restaurant_id = p.restaurant_id
    where p.week = p_week and p.cohort_rule_version = v_version
  ), pct as (
    select snapshot_id, cohort_id, mo, mc, mq, mx,
           percent_rank() over (partition by cohort_id order by mo)      as po,
           percent_rank() over (partition by cohort_id order by mc)      as pc,
           percent_rank() over (partition by cohort_id order by mq)      as pq,
           percent_rank() over (partition by cohort_id order by mx desc) as px
    from base
  ), comp as (
    select snapshot_id, cohort_id, mo, mc, mq, mx, (w_o*po + w_c*pc + w_q*pq + w_x*px) as score from pct
  ), ranked as (
    select snapshot_id, cohort_id, mo, mc, mq, mx, score,
           percent_rank() over (partition by cohort_id order by score) as pr,
           max(score) over (partition by cohort_id) as top_score
    from comp
  )
  update cohort."Cohort_Membership_Snapshot" p
    set percentile_in_cohort = round((r.pr * 100)::numeric, 2),
        gap_to_top           = round((r.top_score - r.score)::numeric, 4),
        subgroup_id          = p.cohort_id || '_' ||
                               case when r.pr >= 2.0/3 then 'top' when r.pr >= 1.0/3 then 'mid' else 'low' end,
        m_orders = r.mo, m_connection = r.mc, m_quality = r.mq, m_cancel = r.mx,
        freshness_ts         = now()
  from ranked r
  where r.snapshot_id = p.snapshot_id and p.cohort_rule_version = v_version;

  update cohort."Cohort" c set n_accounts = agg.n, freshness_ts = now()
  from (
    select c2.cohort_id, count(s.snapshot_id) n
    from cohort."Cohort" c2
    left join cohort."Cohort_Membership_Snapshot" s
      on s.cohort_id = c2.cohort_id and s.week = p_week and s.cohort_rule_version = c2.cohort_rule_version
    where c2.cohort_rule_version = v_version
    group by c2.cohort_id
  ) agg
  where agg.cohort_id = c.cohort_id and c.cohort_rule_version = v_version;

  update cohort."Subgroup" s set n_accounts = agg.n
  from (
    select sg.subgroup_id, count(m.snapshot_id) n
    from cohort."Subgroup" sg
    join cohort."Cohort" c on c.cohort_id = sg.cohort_id and c.cohort_rule_version = v_version
    left join cohort."Cohort_Membership_Snapshot" m
      on m.subgroup_id = sg.subgroup_id and m.week = p_week and m.cohort_rule_version = v_version
    group by sg.subgroup_id
  ) agg
  where agg.subgroup_id = s.subgroup_id;
end;
$$;

-- ── F-1.6 v2 — topo-vs-base bands. Per cohort: P90+/P75+/P25-/P10- band averages of the 4 metrics
--    + n per band. Band metrics SUPPRESSED when band n < k_anon (re-identification, §3.9). Pairs:
--    P90↔P10 and P75↔P25 (deltas per factor). Replaces descriptive_baseline->'top'/'base'/'bands'. ──
create or replace function cohort.fn_descriptive_baseline(p_week date)
returns void language plpgsql as $$
declare
  v_version text := catalog.knob_text('cohort_rule_version_current');
  v_k numeric := catalog.knob_required_num('k_anon_threshold');
begin
  with m as (
    select cohort_id, percentile_in_cohort p, m_orders mo, m_connection mc, m_quality mq, m_cancel mx
    from cohort."Cohort_Membership_Snapshot"
    where week = p_week and cohort_rule_version = v_version and percentile_in_cohort is not null
  ), b as (
    select cohort_id,
      count(*) filter (where p >= 90) n90, avg(mo) filter (where p >= 90) o90, avg(mc) filter (where p >= 90) c90, avg(mq) filter (where p >= 90) q90, avg(mx) filter (where p >= 90) x90,
      count(*) filter (where p >= 75) n75, avg(mo) filter (where p >= 75) o75, avg(mc) filter (where p >= 75) c75, avg(mq) filter (where p >= 75) q75, avg(mx) filter (where p >= 75) x75,
      count(*) filter (where p <= 25) n25, avg(mo) filter (where p <= 25) o25, avg(mc) filter (where p <= 25) c25, avg(mq) filter (where p <= 25) q25, avg(mx) filter (where p <= 25) x25,
      count(*) filter (where p <= 10) n10, avg(mo) filter (where p <= 10) o10, avg(mc) filter (where p <= 10) c10, avg(mq) filter (where p <= 10) q10, avg(mx) filter (where p <= 10) x10
    from m group by cohort_id
  )
  update cohort."Cohort" c set descriptive_baseline =
    coalesce(c.descriptive_baseline, '{}'::jsonb) || jsonb_build_object(
      'bands', jsonb_build_object(
        'p90', cohort.fn_band_json(b.n90, b.o90, b.c90, b.q90, b.x90, v_k),
        'p75', cohort.fn_band_json(b.n75, b.o75, b.c75, b.q75, b.x75, v_k),
        'p25', cohort.fn_band_json(b.n25, b.o25, b.c25, b.q25, b.x25, v_k),
        'p10', cohort.fn_band_json(b.n10, b.o10, b.c10, b.q10, b.x10, v_k)),
      'topo_vs_base', jsonb_build_object(
        'p90_vs_p10', cohort.fn_topo_json(b.n90, b.n10, b.o90, b.o10, b.c90, b.c10, b.q90, b.q10, b.x90, b.x10, v_k),
        'p75_vs_p25', cohort.fn_topo_json(b.n75, b.n25, b.o75, b.o25, b.c75, b.c25, b.q75, b.q25, b.x75, b.x25, v_k)),
      'prov', '[V]')
  from b
  where c.cohort_id = b.cohort_id and c.cohort_rule_version = v_version
    and coalesce(c.k_suppression_applied, true) = false;
end;
$$;

-- helper: a band's json; metrics NULL-suppressed when the band itself is below k (re-id, §3.9).
create or replace function cohort.fn_band_json(n bigint, o numeric, c numeric, q numeric, x numeric, k numeric)
returns jsonb language sql immutable as $$
  select jsonb_build_object('n', n,
    'orders',     case when n >= k then round(o, 2) end,
    'connection', case when n >= k then round(c, 4) end,
    'quality',    case when n >= k then round(q, 4) end,
    'cancel',     case when n >= k then round(x, 4) end);
$$;

-- helper: a topo-vs-base pair; deltas emitted only when BOTH bands ≥ k (re-id, §3.2/§3.9).
-- d_cancel = base − top so POSITIVE = top is better (less cancel), consistent with the other deltas.
create or replace function cohort.fn_topo_json(
  n_top bigint, n_base bigint, o_t numeric, o_b numeric, c_t numeric, c_b numeric,
  q_t numeric, q_b numeric, x_t numeric, x_b numeric, k numeric)
returns jsonb language sql immutable as $$
  select jsonb_build_object('n_top', n_top, 'n_base', n_base,
    'd_orders',     case when n_top >= k and n_base >= k then round(o_t - o_b, 2) end,
    'd_connection', case when n_top >= k and n_base >= k then round(c_t - c_b, 4) end,
    'd_quality',    case when n_top >= k and n_base >= k then round(q_t - q_b, 4) end,
    'd_cancel',     case when n_top >= k and n_base >= k then round(x_b - x_t, 4) end);
$$;

-- ── F-1.7 v2 — UPSIDE [C]. Order-lift if the base (< P90) operated like the top (P90+), ATTRIBUTED
--    across factors by the ratified upside weights. lift_orders = n_base · (top_orders − base_orders);
--    attribution[f] = weight_f · lift. unit = orders (→ R$ via base avg_ticket). Never ascends to [V]. ──
drop function if exists cohort.fn_upside(text);  -- supersede v1 signature (was (p_version text))
create or replace function cohort.fn_upside(p_week date)
returns void language plpgsql as $$
declare
  v_version text := catalog.knob_text('cohort_rule_version_current');
  w_c numeric := catalog.knob_required_num('weight_upside_connection');
  w_q numeric := catalog.knob_required_num('weight_upside_quality');
  w_x numeric := catalog.knob_required_num('weight_upside_cancel');
  w_p numeric := catalog.knob_required_num('weight_upside_price');
  v_k numeric := catalog.knob_required_num('k_anon_threshold');
begin
  -- fail-closed: the ratified weighting must fully allocate the lift (Σweights = 1.0).
  if abs(w_c + w_q + w_x + w_p - 1.0) > 0.0001 then
    raise exception 'upside weights must sum to 1.0 (got %)', w_c + w_q + w_x + w_p;
  end if;

  with m as (
    select cohort_id, percentile_in_cohort p, m_orders mo
    from cohort."Cohort_Membership_Snapshot"
    where week = p_week and cohort_rule_version = v_version and percentile_in_cohort is not null
  ), a as (
    select cohort_id,
      avg(mo) filter (where p >= 90) top_o,
      avg(mo) filter (where p <  90) base_o,
      count(*) filter (where p >= 90) n_top,
      count(*) filter (where p <  90) n_base
    from m group by cohort_id
  ), lift as (
    -- band-level k-anon: top (P90+) AND base must each be ≥ k (no re-id via the lift, §3.2)
    select cohort_id, round(n_base * (top_o - base_o), 2) as lift_orders from a
    where top_o is not null and base_o is not null and n_top >= v_k and n_base >= v_k
  )
  update cohort."Cohort" c
    set opportunity_value = lift.lift_orders,
        descriptive_baseline = coalesce(c.descriptive_baseline, '{}'::jsonb) || jsonb_build_object(
          'upside', jsonb_build_object(
            'lift_orders', lift.lift_orders,
            'attribution', jsonb_build_object(
              'connection', round(w_c * lift.lift_orders, 2),
              'quality',    round(w_q * lift.lift_orders, 2),
              'cancel',     round(w_x * lift.lift_orders, 2),
              'price',      round(w_p * lift.lift_orders, 2)),
            'unit', 'orders', 'prov', '[C]'))
  from lift
  where c.cohort_id = lift.cohort_id and c.cohort_rule_version = v_version
    and coalesce(c.k_suppression_applied, true) = false;
end;
$$;
