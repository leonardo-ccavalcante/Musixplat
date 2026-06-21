-- 05D Diagnosis Engine · LIVE — F1: the MENU_QUALITY problem type. A FOURTH problem flows E2E through
-- the SAME descriptor-driven engine. 04 §3 / §7 / §8 / §14. New per-type producers
-- (fn_affected_menu_quality / fn_impact_menu_quality) + register the type, then `create or replace`
-- BOTH dispatchers with a `when 'menu_quality'` case — payment + connection + cancellation cases stay
-- VERBATIM (zero regression).
--
-- Determinism (§3.6 / §8): the affected anti-join + the at-risk-GMV € are SQL, no LLM. menu quality =
-- avg((has_photo::int + has_description::int)/2.0) over the window's orders — the SAME raw signal the
-- DERIVED cohort.m_quality is built from (cohort_engine_v2), read straight from raw tenant."Order" (§14).
-- Threshold read BY NAME (§3.8): menu_quality_min (seeded 0.50) — DISTINCT from the A4 nba_menu_quality_min
-- ACTION policy. Knob seeded via THIS migration too (hosted-safe, apply-migrations path) + idempotent seed.
-- Counts/€ PRODUCED, never seeded (§14). evidence = NULL (no single order is the evidence for a menu fault).

-- ── register the built-in descriptor (mirrors shared/problem_types.ts PROBLEM_TYPES.menu_quality). ─
insert into catalog."Problem_Type"(problem_type, area_type, affected_descriptor, impact_descriptor, concentration_dim, metric)
values ('menu_quality', 'product',
        '{"table":"Order","signal":"menu_quality < menu_quality_min","operator":"lt","threshold_knob":"menu_quality_min"}'::jsonb,
        '{"kind":"at_risk_gmv"}'::jsonb, 'zone', 'improve_menu_quality')
on conflict (problem_type) do nothing;

-- ── seed the diagnosis knob via the MIGRATION (hosted-safe, Codex P1) + idempotent. ───────────────
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('menu_quality_min', '0.50', '[C]', 'leo')
on conflict (key) do nothing;

-- ── fn_affected_menu_quality: restaurants in p_tenant whose menu-quality fraction over the window
--    (order_date >= current_date - p_window) is BELOW the knob. menu_quality = avg of per-order
--    (has_photo + has_description)/2. Same anti-join shape as fn_affected_connection (∖ complainants),
--    optional segment slice. evidence = NULL. Threshold BY NAME, fail-closed. ─────────────────────────
create or replace function tenant.fn_affected_menu_quality(
  p_problem uuid, p_tenant text, p_window integer, p_segment text default null
) returns integer language plpgsql as $$
declare v_inserted integer; v_min numeric := catalog.knob_required_num('menu_quality_min');
begin
  insert into tenant."Affected"(problem_id, tenant_id, restaurant_id, complained, silent, evidence)
  select p_problem, r.tenant_id, lq.restaurant_id,
         (c.restaurant_id is not null) as complained,
         (c.restaurant_id is null)     as silent,
         null::bigint                  as evidence
  from (
    select o.restaurant_id
    from tenant."Order" o
    join tenant."Restaurant" rr on rr.restaurant_id = o.restaurant_id
    where rr.tenant_id = p_tenant
      and (p_segment is null or rr.segment::text = p_segment)   -- segment slice (enum ⇒ ::text)
      and o.order_date >= (current_date - p_window)
    group by o.restaurant_id
    having avg((o.has_photo::int + o.has_description::int) / 2.0) < v_min
  ) lq
  join tenant."Restaurant" r on r.restaurant_id = lq.restaurant_id
  left join (
    select distinct restaurant_id from tenant."Conversation_Episode" where tenant_id = p_tenant
  ) c on c.restaurant_id = r.restaurant_id
  on conflict (problem_id, restaurant_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ── fn_impact_menu_quality: deterministic AT-RISK GMV. For each affected restaurant, the GMV over the
--    same window scaled by its quality SHORTFALL (1 − quality). Summed across the affected set. Window
--    read BY NAME (window_silent). Writes revenue_lost + provenance [I]; returns the total. ────────────
create or replace function tenant.fn_impact_menu_quality(p_problem uuid)
returns numeric language plpgsql as $$
declare v_total numeric; v_window integer := catalog.knob_required_num('window_silent')::int;
begin
  -- per affected restaurant: (Σ net_value over window) × (1 − avg quality); then Σ across the set.
  -- coalesce ⇒ 0 (never NULL) over an empty affected set.
  select coalesce(sum(per_rest), 0) into v_total from (
    select sum(o.net_value)
           * (1 - avg((o.has_photo::int + o.has_description::int) / 2.0)) as per_rest
    from tenant."Order" o
    where o.restaurant_id in (select restaurant_id from tenant."Affected" where problem_id = p_problem)
      and o.order_date >= (current_date - v_window)
    group by o.restaurant_id
  ) s;
  update tenant."Diagnosed_Problem" p
     set revenue_lost = v_total,
         provenance_by_field = p.provenance_by_field || jsonb_build_object('revenue_lost', '[I]')
   where p.problem_id = p_problem;
  return v_total;
end;
$$;

-- ── fn_hunt_silent: DISPATCHER += menu_quality case (payment + connection + cancellation VERBATIM). ─
create or replace function tenant.fn_hunt_silent(
  p_problem uuid, p_tenant text, p_window integer, p_segment text default null
) returns integer language plpgsql as $$
declare v_type text; v_inserted integer;
begin
  select problem_type into v_type
    from tenant."Diagnosed_Problem" where problem_id = p_problem;
  if v_type is null then
    raise exception 'fn_hunt_silent: unknown problem % (fail-closed)', p_problem;
  end if;
  case v_type
    when 'payment' then
      v_inserted := tenant.fn_affected_payment(p_problem, p_tenant, p_window, p_segment);
    when 'connection' then
      v_inserted := tenant.fn_affected_connection(p_problem, p_tenant, p_window, p_segment);
    when 'cancellation' then
      v_inserted := tenant.fn_affected_cancellation(p_problem, p_tenant, p_window, p_segment);
    when 'menu_quality' then
      v_inserted := tenant.fn_affected_menu_quality(p_problem, p_tenant, p_window, p_segment);
    else
      raise exception 'fn_hunt_silent: no affected producer for problem_type % (fail-closed)', v_type;
  end case;
  return v_inserted;
end;
$$;

-- ── fn_impact_revenue_lost: DISPATCHER += menu_quality case (others VERBATIM). ─────────────────────
create or replace function tenant.fn_impact_revenue_lost(p_problem uuid)
returns numeric language plpgsql as $$
declare v_type text; v_total numeric;
begin
  select problem_type into v_type
    from tenant."Diagnosed_Problem" where problem_id = p_problem;
  if v_type is null then
    raise exception 'fn_impact_revenue_lost: unknown problem % (fail-closed)', p_problem;
  end if;
  case v_type
    when 'payment' then
      v_total := tenant.fn_impact_payment(p_problem);
    when 'connection' then
      v_total := tenant.fn_impact_connection(p_problem);
    when 'cancellation' then
      v_total := tenant.fn_impact_cancellation(p_problem);
    when 'menu_quality' then
      v_total := tenant.fn_impact_menu_quality(p_problem);
    else
      raise exception 'fn_impact_revenue_lost: no impact producer for problem_type % (fail-closed)', v_type;
  end case;
  return v_total;
end;
$$;
