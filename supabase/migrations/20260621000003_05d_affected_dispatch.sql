-- 05D Diagnosis Engine · LIVE — F0 Task 3: AFFECTED dispatcher (generalizes the silent-hunt).
-- 04 §3 / §7 / §8 / §14. The shipped fn_hunt_silent hard-coded the payment anti-join. We
-- DE-COUPLE it: the payment body moves verbatim into fn_affected_payment (+ an optional segment
-- filter), and fn_hunt_silent becomes a DISPATCHER that reads Diagnosed_Problem.problem_type and
-- routes to the per-type producer. Payment output is byte-identical ⇒ zero regression (47/35).
--
-- Fail-closed (§3.7): an unknown/unregistered problem_type RAISES — never a silent wrong answer.
-- Determinism (§3.6 / §8): the anti-join is SQL; no LLM. tenant + window are passed in (BR-B6
-- cross-tenant hard-no; bounded sweep). segment is an OPTIONAL slice (Restaurant.segment, an enum
-- ⇒ compared as ::text against the text param). Counts are PRODUCED, never seeded (§14).

-- ── drop the shipped 3-arg fn_hunt_silent so the new 4-arg (p_segment default null) is the ONLY
--    resolution for the existing 3-arg TS caller (no ambiguous overload). ─────────────────────
drop function if exists tenant.fn_hunt_silent(uuid, text, integer);

-- ── fn_affected_payment: the EXACT anti-join body from migration 20260617000014 (Order failed ∖
--    complainants) + the optional segment filter. payment_status='failed' lives HERE (the type's
--    own producer), not in the orchestrator (the coupling moves down, per F0). ─────────────────
create or replace function tenant.fn_affected_payment(
  p_problem uuid, p_tenant text, p_window integer, p_segment text default null
) returns integer language plpgsql as $$
declare v_inserted integer;
begin
  insert into tenant."Affected"(problem_id, tenant_id, restaurant_id, complained, silent, evidence)
  select p_problem, r.tenant_id, f.restaurant_id,
         (c.restaurant_id is not null) as complained,
         (c.restaurant_id is null)     as silent,
         f.evidence
  from (
    select o.restaurant_id, min(o.order_id) as evidence
    from tenant."Order" o
    join tenant."Restaurant" rr on rr.restaurant_id = o.restaurant_id
    where o.payment_status = 'failed'
      and rr.tenant_id = p_tenant
      and (p_segment is null or rr.segment::text = p_segment)   -- F0 segment slice (enum ⇒ ::text)
      and o.order_date >= (current_date - p_window)
    group by o.restaurant_id
  ) f
  join tenant."Restaurant" r on r.restaurant_id = f.restaurant_id
  left join (
    select distinct restaurant_id from tenant."Conversation_Episode" where tenant_id = p_tenant
  ) c on c.restaurant_id = r.restaurant_id
  on conflict (problem_id, restaurant_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ── fn_hunt_silent: DISPATCHER. Reads the problem's problem_type and routes to the per-type
--    producer. 4-arg (p_segment default null) so the shipped 3-arg caller (silent.ts) is unchanged.
--    case 'payment' → fn_affected_payment; any other (unregistered) type ⇒ fail-closed RAISE. ───
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
    else
      raise exception 'fn_hunt_silent: no affected producer for problem_type % (fail-closed)', v_type;
  end case;
  return v_inserted;
end;
$$;
