-- 05D Diagnosis Engine · LIVE — F1: the CANCELLATION problem type. A THIRD problem flows E2E through
-- the SAME descriptor-driven engine. 04 §3 / §7 / §8 / §14. New per-type producers
-- (fn_affected_cancellation / fn_impact_cancellation) + register the type, then `create or replace`
-- BOTH dispatchers with a `when 'cancellation'` case — the payment + connection cases stay VERBATIM
-- (zero regression: payment 47/35/€3760 + connection still produced via the dispatcher).
--
-- Determinism (§3.6 / §8): the affected anti-join + the at-risk-GMV € are SQL, no LLM. Threshold read
-- BY NAME (§3.8): catalog.knob_required_num('cancel_rate_max') — the DIAGNOSIS threshold (seeded 0.10),
-- DISTINCT from the A6 nba_cancel_rate_max ACTION policy (same Codex split as connection_min_ratio).
-- Restaurant-side cancel = payment_status='failed' AND cancelled_by='restaurant' (model_v2). Counts/€
-- are PRODUCED, never seeded (§14). evidence = the cancelled order_id.

-- ── register the built-in descriptor (mirrors shared/problem_types.ts PROBLEM_TYPES.cancellation). ─
insert into catalog."Problem_Type"(problem_type, area_type, affected_descriptor, impact_descriptor, concentration_dim, metric)
values ('cancellation', 'operations',
        '{"table":"Order","signal":"cancel_rate_restaurant > cancel_rate_max","operator":"gt","threshold_knob":"cancel_rate_max"}'::jsonb,
        '{"kind":"at_risk_gmv"}'::jsonb, 'zone', 'reduce_restaurant_cancellations')
on conflict (problem_type) do nothing;

-- ── seed the diagnosis knobs into Config_Knobs via the MIGRATION (not only seed.sql) so HOSTED upgrades
--    (apply-migrations.ts does NOT re-run seed.sql) have them — else knob_required_num RAISES (Codex P1).
--    Idempotent: a fresh local rebuild already has them from seed.sql. connection_min_ratio is
--    retro-seeded here too (its committed migration only added it to seed.sql, same hosted gap). ──────────
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('connection_min_ratio', '0.80', '[C]', 'leo'),
  ('cancel_rate_max',      '0.10', '[C]', 'leo')
on conflict (key) do nothing;

-- ── fn_affected_cancellation: restaurants in p_tenant whose RESTAURANT-SIDE cancel rate over the window
--    (order_date >= current_date - p_window) EXCEEDS the knob (operator 'gt'). Rate = restaurant-cancelled
--    orders / concluded orders (ok+failed) — the SAME raw definition as cancel_by_restaurant (baseline_kpi_v2
--    L31 / nba_signals L40); recomputed from RAW tenant."Order" (the snapshot column is a DERIVED metric,
--    NOT a source). customer-side cancels are EXCLUDED from the numerator. Same anti-join shape as
--    fn_affected_payment/_connection (∖ complainants via Conversation_Episode), optional segment slice.
--    evidence = min(order_id) of a restaurant-cancelled order. Threshold BY NAME, fail-closed. ─────────
create or replace function tenant.fn_affected_cancellation(
  p_problem uuid, p_tenant text, p_window integer, p_segment text default null
) returns integer language plpgsql as $$
declare v_inserted integer; v_max numeric := catalog.knob_required_num('cancel_rate_max');
begin
  insert into tenant."Affected"(problem_id, tenant_id, restaurant_id, complained, silent, evidence)
  select p_problem, r.tenant_id, hc.restaurant_id,
         (c.restaurant_id is not null) as complained,
         (c.restaurant_id is null)     as silent,
         hc.evidence
  from (
    select o.restaurant_id,
           min(o.order_id) filter (where o.payment_status = 'failed' and o.cancelled_by = 'restaurant') as evidence
    from tenant."Order" o
    join tenant."Restaurant" rr on rr.restaurant_id = o.restaurant_id
    where rr.tenant_id = p_tenant
      and (p_segment is null or rr.segment::text = p_segment)   -- segment slice (enum ⇒ ::text)
      and o.order_date >= (current_date - p_window)
    group by o.restaurant_id
    -- restaurant-cancelled ∕ concluded (ok+failed); excludes 'pending'. nullif ⇒ no concluded ⇒ no row (fail-closed).
    having count(*) filter (where o.payment_status = 'failed' and o.cancelled_by = 'restaurant')::numeric
           / nullif(count(*) filter (where o.payment_status in ('ok','failed')), 0) > v_max
  ) hc
  join tenant."Restaurant" r on r.restaurant_id = hc.restaurant_id
  left join (
    select distinct restaurant_id from tenant."Conversation_Episode" where tenant_id = p_tenant
  ) c on c.restaurant_id = r.restaurant_id
  on conflict (problem_id, restaurant_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ── fn_impact_cancellation: deterministic AT-RISK GMV from restaurant-side cancellations. For the affected
--    set, sum net_value of the RESTAURANT-cancelled orders within the window (the GMV directly lost when the
--    restaurant rejected the order). customer-side cancels EXCLUDED. Window read BY NAME (window_silent),
--    mirroring fn_impact_connection. Writes revenue_lost + provenance [I]; returns the total. ────────────
create or replace function tenant.fn_impact_cancellation(p_problem uuid)
returns numeric language plpgsql as $$
declare v_total numeric; v_window integer := catalog.knob_required_num('window_silent')::int;
begin
  select coalesce(sum(o.net_value), 0) into v_total
  from tenant."Order" o
  where o.payment_status = 'failed'
    and o.cancelled_by = 'restaurant'
    and o.order_date >= (current_date - v_window)
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

-- ── fn_hunt_silent: DISPATCHER += cancellation case (payment + connection VERBATIM). ───────────────
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
    else
      raise exception 'fn_hunt_silent: no affected producer for problem_type % (fail-closed)', v_type;
  end case;
  return v_inserted;
end;
$$;

-- ── fn_impact_revenue_lost: DISPATCHER += cancellation case (payment + connection VERBATIM). ───────
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
    else
      raise exception 'fn_impact_revenue_lost: no impact producer for problem_type % (fail-closed)', v_type;
  end case;
  return v_total;
end;
$$;
