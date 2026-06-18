-- Chunk 2 — MODEL v2 cohort engine (Leo ratified 2026-06-18). Hardened after adversarial review.
-- Cohort cell = cuisine × zone × tier (comparable). Ranking = COMPOSITE percentile:
-- 0.40·orders + 0.30·connection + 0.20·quality + 0.10·(1−cancel), weights BY NAME (§3.8).
-- Subgroup = tercile of the composite. n_min + k-anon are SEPARATE gates (separate fns, knobs,
-- columns: n_min_ok vs k_anon_ok), applied per COHORT and per SUBGROUP (EC-13). Deterministic,
-- version-stamped, fail-closed; NOTHING fabricated (§14 — only complete-brutos restaurants rank).

-- ── Axis swap: tenure leaves the key; (cuisine,zone,tier,version) is the cell identity. ──
alter table cohort."Cohort" alter column tenure_bucket drop not null;
alter table cohort."Cohort" drop constraint if exists "Cohort_tenure_bucket_tier_base_cohort_rule_version_key";
alter table cohort."Cohort" drop constraint if exists cohort_axes_v2_key;
alter table cohort."Cohort" add constraint cohort_axes_v2_key unique (cuisine, zone, tier_base, cohort_rule_version);

-- ── Subgroup gets its own count + gates; membership gets a per-row k_anon_ok (symmetry w/ n_min_ok). ──
alter table cohort."Subgroup"
  add column if not exists n_accounts            integer,
  add column if not exists collapsed             boolean,
  add column if not exists k_suppression_applied boolean;
alter table cohort."Cohort_Membership_Snapshot"
  add column if not exists k_anon_ok boolean;

-- ── F-1.1 v2 — assignment by cuisine×zone×tier. Cell + 3 tercile subgroups + a membership per
--    active restaurant (subgroup filled by F-1.2). tenure_months computed (attribute, not axis). ──
create or replace function cohort.fn_assign_cohorts(p_week date, p_ref_date date)
returns void language plpgsql as $$
declare v_version text := catalog.knob_text('cohort_rule_version_current');
begin
  update tenant."Restaurant"
    set tenure_months = (extract(year from age(p_ref_date, signup_date)) * 12
                       + extract(month from age(p_ref_date, signup_date)))::int
    where signup_date is not null and signup_date <= p_ref_date;

  insert into cohort."Cohort"(cohort_id, cuisine, zone, tier_base, cohort_rule_version)
  select distinct r.cuisine || '_' || r.zone || '_' || r.tier_base || '_' || v_version,
                  r.cuisine, r.zone, r.tier_base, v_version
  from tenant."Restaurant" r
  where r.tenure_months is not null and r.cuisine is not null and r.zone is not null
  on conflict (cuisine, zone, tier_base, cohort_rule_version) do nothing;

  insert into cohort."Subgroup"(subgroup_id, cohort_id, label)
  select c.cohort_id || '_' || sg.label, c.cohort_id, sg.label
  from cohort."Cohort" c
  cross join (values ('top'), ('mid'), ('low')) sg(label)
  where c.cohort_rule_version = v_version
  on conflict (subgroup_id) do nothing;

  insert into cohort."Cohort_Membership_Snapshot"
    (restaurant_id, cohort_id, subgroup_id, week, cohort_rule_version, provenance)
  select r.restaurant_id, c.cohort_id, null, p_week, v_version, '[V]'
  from tenant."Restaurant" r
  join cohort."Cohort" c
    on c.cuisine = r.cuisine and c.zone = r.zone and c.tier_base = r.tier_base
   and c.cohort_rule_version = v_version
  where r.tenure_months is not null
  on conflict (restaurant_id, cohort_id, week, cohort_rule_version) do nothing;
end;
$$;

-- ── F-1.2 v2 — COMPOSITE ranking. Component metrics (set-based, from brutos) → per-cohort
--    percentiles → weighted composite → percentile_in_cohort + gap_to_top + tercile subgroup.
--    §14: ONLY restaurants with complete brutos (orders 90d AND connection 63d) are ranked —
--    missing data ⇒ NULL percentile (fail-closed, suppressed by the gate), never a fabricated 0.
--    cancel = failed/(ok+failed) (concluded orders only). cancel ranked DESC (less = better). ──
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
           om.m_orders as mo, cm.m_conn as mc, om.m_quality as mq, coalesce(om.m_cancel, 0) as mx
    from cohort."Cohort_Membership_Snapshot" p
    join om on om.restaurant_id = p.restaurant_id            -- requires order brutos (complete-data)
    join cm on cm.restaurant_id = p.restaurant_id            -- requires connection brutos (complete-data)
    where p.week = p_week and p.cohort_rule_version = v_version
  ), pct as (
    select snapshot_id, cohort_id,
           percent_rank() over (partition by cohort_id order by mo)      as po,
           percent_rank() over (partition by cohort_id order by mc)      as pc,
           percent_rank() over (partition by cohort_id order by mq)      as pq,
           percent_rank() over (partition by cohort_id order by mx desc) as px  -- inverted: less cancel = better
    from base
  ), comp as (
    select snapshot_id, cohort_id, (w_o*po + w_c*pc + w_q*pq + w_x*px) as score from pct
  ), ranked as (
    select snapshot_id, cohort_id, score,
           percent_rank() over (partition by cohort_id order by score) as pr,
           max(score) over (partition by cohort_id) as top_score
    from comp
  )
  update cohort."Cohort_Membership_Snapshot" p
    set percentile_in_cohort = round((r.pr * 100)::numeric, 2),
        gap_to_top           = round((r.top_score - r.score)::numeric, 4),
        subgroup_id          = p.cohort_id || '_' ||
                               case when r.pr >= 2.0/3 then 'top' when r.pr >= 1.0/3 then 'mid' else 'low' end,
        freshness_ts         = now()
  from ranked r
  where r.snapshot_id = p.snapshot_id and p.cohort_rule_version = v_version;  -- explicit version (A=B)

  -- cohort count (LEFT JOIN so an empty cell gets 0, not NULL); explicit version filter.
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

  -- subgroup count (LEFT JOIN so empty terciles get 0).
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

-- ── F-1.3 v2 — n_min gate (significance). Cohort/Subgroup flags from stored n_accounts (this-week,
--    set by rank). Membership n_min_ok/mode from an INLINE per-week subgroup count — correct for
--    ANY p_week regardless of call order (deterministic). SEPARATE from k-anon. ──
create or replace function cohort.fn_gate_n_min(p_week date, p_version text default null)
returns void language plpgsql as $$
declare
  v_version text := coalesce(p_version, catalog.knob_text('cohort_rule_version_current'));
  v_nmin numeric := catalog.knob_required_num('n_min_threshold');
begin
  update cohort."Cohort" c set collapsed = (c.n_accounts is null or c.n_accounts < v_nmin)
    where c.cohort_rule_version = v_version;

  update cohort."Subgroup" s set collapsed = (s.n_accounts is null or s.n_accounts < v_nmin)
    where s.cohort_id in (select cohort_id from cohort."Cohort" where cohort_rule_version = v_version);

  update cohort."Cohort_Membership_Snapshot" p
    set n_min_ok = (sgc.n >= v_nmin),
        mode = case when (sgc.n >= v_nmin) then 'percentile'::public.percentile_mode
                    else 'qualitative_no_percentile'::public.percentile_mode end
  from (select subgroup_id, count(*) n from cohort."Cohort_Membership_Snapshot"
        where week = p_week and cohort_rule_version = v_version group by subgroup_id) sgc
  where p.subgroup_id = sgc.subgroup_id and p.week = p_week and p.cohort_rule_version = v_version;

  -- memberships without a subgroup (rank not run) fail-closed to qualitative.
  update cohort."Cohort_Membership_Snapshot" p
    set n_min_ok = false, mode = 'qualitative_no_percentile'::public.percentile_mode
    where p.week = p_week and p.cohort_rule_version = v_version and p.subgroup_id is null;
end;
$$;

-- ── F-1.3b v2 — k-anon gate (re-identification). SEPARATE from n_min (own fn, own knob, own
--    column k_anon_ok). Cohort/Subgroup flags from stored n_accounts. Membership k_anon_ok from an
--    INLINE per-week subgroup count (only when a week is given). fail-closed: NULL count ⇒ suppress. ──
create or replace function cohort.fn_gate_k_anon(p_week date default null, p_version text default null)
returns void language plpgsql as $$
declare
  v_version text := coalesce(p_version, catalog.knob_text('cohort_rule_version_current'));
  v_k numeric := catalog.knob_required_num('k_anon_threshold');
begin
  update cohort."Cohort" c
    set k_suppression_applied = (c.n_accounts is null or c.n_accounts < v_k)
    where c.cohort_rule_version = v_version;

  update cohort."Subgroup" s
    set k_suppression_applied = (s.n_accounts is null or s.n_accounts < v_k)
    where s.cohort_id in (select cohort_id from cohort."Cohort" where cohort_rule_version = v_version);

  if p_week is not null then
    update cohort."Cohort_Membership_Snapshot" p
      set k_anon_ok = (sgc.n >= v_k)
    from (select subgroup_id, count(*) n from cohort."Cohort_Membership_Snapshot"
          where week = p_week and cohort_rule_version = v_version group by subgroup_id) sgc
    where p.subgroup_id = sgc.subgroup_id and p.week = p_week and p.cohort_rule_version = v_version;

    update cohort."Cohort_Membership_Snapshot" p
      set k_anon_ok = false
      where p.week = p_week and p.cohort_rule_version = v_version and p.subgroup_id is null;
  end if;
end;
$$;
