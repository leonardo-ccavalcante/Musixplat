-- 03:NBA-TEST — the deterministic test the Autonomy Cockpit's AGENTE (02:1A) calls per hypothesis.
-- cohort.fn_nba_test(restaurant, action_code, week) MEASURES the restaurant's signal vs the named
-- standard and returns a verdict. The NUMBER is always SQL, never the AI (§14/§3.6). Side-effect-free
-- (no table write), byte-deterministic (same restaurant + same brutos ⇒ same verdict), catalog-driven
-- (NBA_Catalogo contract columns below), standard read BY NAME via knob_required_num (§3.8 fail-closed).
--
-- Catalog = contract (editable in DB, no redeploy to tune): fn_nba_test is a thin router over these
-- columns, NOT a hardcoded map. It reuses root_cause_signal as the EXACT membership column to read
-- (seed.sql fixes A1→m_connection, A4→m_quality), and adds the measurement metadata:
--   standard_knob   — the knob that is the STANDARD. = threshold_knob for all EXCEPT A3, whose
--                     threshold_knob (nba_promo_budget_max=0) is a MONEY gate (BR-2/§3.3), not a
--                     measurement line; A3 reuses A2's price knob for the diagnosis.
--   verdict_sense   — which side is the problem ('below' | 'above').
--   signal_scale    — normalizes the standard to the signal's unit (price_pctile is 0-100, its knob 0-1).
--   standard_negate — A5: the problem is a DROP >= knob, so compare against -(knob*scale).

alter table catalog."NBA_Catalogo" add column if not exists standard_knob   text;
alter table catalog."NBA_Catalogo" add column if not exists verdict_sense   text;
alter table catalog."NBA_Catalogo" add column if not exists signal_scale    numeric not null default 1;
alter table catalog."NBA_Catalogo" add column if not exists standard_negate boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'nba_catalogo_verdict_sense_ck') then
    alter table catalog."NBA_Catalogo"
      add constraint nba_catalogo_verdict_sense_ck
      check (verdict_sense is null or verdict_sense in ('below','above'));
  end if;
end $$;

-- Shared verdict shape (single source of truth for both functions + the future tRPC Zod schema).
-- action_code keys the row (A2/A3 share a dimension, so dimension alone is ambiguous in _all).
do $$ begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'nba_verdict' and n.nspname = 'cohort'
  ) then
    create type cohort.nba_verdict as (
      action_code  text,
      dimension    text,
      measured     numeric,
      standard     numeric,
      verdict      text,     -- 'below' | 'ok' | 'above' | 'no_data'
      gap          numeric,  -- measured - standard (signed)
      within_range boolean,  -- verdict = 'ok' (inside the human-approved standard)
      n_min_ok     boolean,
      k_anon_ok    boolean,
      provenance   text      -- always '[V]' (measured deterministically)
    );
  end if;
end $$;

create or replace function cohort.fn_nba_test(
  p_restaurant_id text,
  p_action_code   text,
  p_week          date
) returns cohort.nba_verdict
language plpgsql stable as $$
declare
  v_version  text := catalog.knob_text('cohort_rule_version_current');  -- pin version (anti-mix)
  cat        record;
  v_measured numeric;
  v_nmin     boolean;
  v_kanon    boolean;
  v_found    boolean;
  r          cohort.nba_verdict;
begin
  -- 1. Load the contract row (the single source of truth — no business rule hardcoded here).
  select root_cause_signal as signal_col, standard_knob, verdict_sense, signal_scale, standard_negate
    into cat
    from catalog."NBA_Catalogo"
    where code = p_action_code;
  if not found then
    raise exception 'fn_nba_test: unknown action_code %', p_action_code;  -- fail-closed
  end if;

  r.action_code  := p_action_code;
  r.dimension    := cat.signal_col;
  r.provenance   := '[V]';
  r.within_range := false;

  -- 2. A8 / incomplete contract ⇒ no_data, read nothing (never invent a cause).
  if cat.signal_col is null or cat.standard_knob is null or cat.verdict_sense is null then
    r.verdict := 'no_data';
    return r;
  end if;

  -- 3. Read the measured signal + per-row gates via a STATIC CASE (deterministic, planner-friendly,
  --    no dynamic SQL / no injection surface). The signal column set is the closed slice-2 contract.
  select
    case cat.signal_col
      when 'm_connection'           then m_connection
      when 'm_quality'              then m_quality
      when 'price_pctile_in_cohort' then price_pctile_in_cohort
      when 'zone_demand_trend'      then zone_demand_trend
      when 'cancel_by_restaurant'   then cancel_by_restaurant
      when 'cancel_by_customer'     then cancel_by_customer
      else null
    end,
    n_min_ok, k_anon_ok, true
    into v_measured, v_nmin, v_kanon, v_found
    from cohort."Cohort_Membership_Snapshot"
    where restaurant_id = p_restaurant_id and week = p_week and cohort_rule_version = v_version;

  -- 3b. Drift guard: a contract signal with no CASE arm must fail loudly, not silently no_data.
  if coalesce(v_found, false) and cat.signal_col not in
       ('m_connection','m_quality','price_pctile_in_cohort','zone_demand_trend',
        'cancel_by_restaurant','cancel_by_customer') then
    raise exception 'fn_nba_test: signal column % has no CASE arm (catalog drift)', cat.signal_col;
  end if;

  r.n_min_ok  := v_nmin;
  r.k_anon_ok := v_kanon;

  -- 4. §14 fail-closed: no membership row OR null signal ⇒ no_data (never a fabricated below/ok).
  if not coalesce(v_found, false) or v_measured is null then
    r.verdict := 'no_data';
    return r;
  end if;

  -- 5. Standard, normalized (scale + optional negate). Read BY NAME — raises if the knob is missing.
  r.standard := catalog.knob_required_num(cat.standard_knob) * cat.signal_scale;
  if cat.standard_negate then
    r.standard := - r.standard;
  end if;

  -- 6. Deterministic verdict.
  r.measured := v_measured;
  r.gap      := v_measured - r.standard;
  if cat.verdict_sense = 'below' then
    r.verdict := case when v_measured < r.standard then 'below' else 'ok' end;
  else
    r.verdict := case when v_measured > r.standard then 'above' else 'ok' end;
  end if;
  r.within_range := (r.verdict = 'ok');
  return r;
end;
$$;

-- Whole-funnel view: one verdict per catalog code (A1..A8), catalog-driven order. The AGENTE may test
-- one hypothesis at a time via fn_nba_test; the cockpit reads the full funnel via fn_nba_test_all.
create or replace function cohort.fn_nba_test_all(
  p_restaurant_id text,
  p_week          date
) returns setof cohort.nba_verdict
language plpgsql stable as $$
declare rec record;
begin
  for rec in select code from catalog."NBA_Catalogo" order by code loop
    return next cohort.fn_nba_test(p_restaurant_id, rec.code, p_week);
  end loop;
  return;
end;
$$;
