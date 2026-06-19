-- 05B EPIC-B1 (proactive branch, BR-B12) — the critical-process registry + the monitor producer.
-- A process enters the registry only when it scores impact-high × fails-silently × measurable-source
-- (payments, abrupt disconnection, wrong billing). The monitor catches a non-payment BEFORE a ticket:
-- the reverse-cascade uau. `state` is the ONLY result column (NULL pre-run, §14); absence of signal is
-- NEVER read as "all good" — a downed source ⇒ 'monitoring_degraded' (fail-closed §7).

create table if not exists tenant."Critical_Process" (
  process_id       uuid primary key default gen_random_uuid(),
  tenant_id        text not null,
  name             text not null,
  impact_score     numeric not null,                       -- criterion 1: high impact
  fails_silently   boolean not null,                       -- criterion 2
  truth_source_ref text not null,                          -- criterion 3: a measurable source
  origin           text not null check (origin in ('policy','kb_promoted')),
  schedule         text not null,                          -- cron-ish; the proactive cadence
  state            text check (state in ('triggered','green','monitoring_degraded')), -- RESULT, NULL pre-run
  created_at       timestamptz not null default now()
);
create index if not exists critical_process_tenant_idx on tenant."Critical_Process"(tenant_id);

-- BR-B12 monitor: scan the truth source (payments) for this tenant; pick a restaurant with a failed
-- payment in window that has NO open problem yet (catch before the ticket) and open a PROACTIVE
-- Diagnosed_Problem (conversation_id NULL). Source down ⇒ 'monitoring_degraded' + null (never assume zero).
-- Returns the new problem_id, or null when there is nothing to report ('green') or the source is degraded.
create or replace function tenant.fn_monitor_critical(p_tenant text, p_process uuid)
returns uuid
language plpgsql
as $$
declare
  v_window     int := catalog.knob_required_num('window_silent');
  v_has_source boolean;
  v_restaurant text;
  v_problem    uuid;
begin
  -- truth-source heartbeat: does the payments source carry ANY signal for this tenant in window?
  select exists(
    select 1 from tenant."Order" o
      join tenant."Restaurant" r on r.restaurant_id = o.restaurant_id
     where r.tenant_id = p_tenant and o.order_date >= current_date - v_window
  ) into v_has_source;
  if not v_has_source then
    update tenant."Critical_Process" set state = 'monitoring_degraded' where process_id = p_process;
    return null; -- fail-closed: absence of signal ≠ absence of problem (BR-B12).
  end if;

  -- a failed payment on a restaurant nobody has opened a case for yet (the silent one, pre-ticket).
  select o.restaurant_id into v_restaurant
    from tenant."Order" o
    join tenant."Restaurant" r on r.restaurant_id = o.restaurant_id
   where r.tenant_id = p_tenant
     and o.payment_status = 'failed'
     and o.order_date >= current_date - v_window
     and not exists (
       select 1 from tenant."Diagnosed_Problem" d
        where d.tenant_id = p_tenant and d.restaurant_id = o.restaurant_id and d.status = 'open'
     )
   order by o.order_date desc
   limit 1;

  if v_restaurant is null then
    update tenant."Critical_Process" set state = 'green' where process_id = p_process;
    return null; -- nothing to report — processes in green.
  end if;

  -- idempotent open: the partial unique index (tenant_id, restaurant_id) WHERE status='open' is the
  -- conflict target. A concurrent monitor/report run that already opened this one ⇒ no row, return null
  -- (never raise an unhandled unique_violation, never double-open the same restaurant — BR-B5/B8).
  insert into tenant."Diagnosed_Problem"
    (tenant_id, restaurant_id, conversation_id, criticality, status, frequency)
  values (p_tenant, v_restaurant, null, 'critical', 'open', 1)
  on conflict (tenant_id, restaurant_id) where status = 'open' do nothing
  returning problem_id into v_problem;

  if v_problem is null then
    update tenant."Critical_Process" set state = 'green' where process_id = p_process;
    return null; -- another open case already covers this restaurant; nothing new to report.
  end if;

  update tenant."Critical_Process" set state = 'triggered' where process_id = p_process;
  return v_problem;
end
$$;

-- Knobs read BY NAME by the monitor + orchestrator (§3.8): 'window_silent' (fn_monitor_critical) and
-- 'monitor_cost_default' (routeNowQueue); the classify floor reuses 'threshold_classification'. All three
-- are seeded with the rest of the 05B knobs in supabase/seed.sql (single source) — not duplicated here.
