-- pgTAP — 05D connection problem type (F1). A SECOND problem flows through the SAME engine: the
-- dispatchers gain a `when 'connection'` case (fn_affected_connection / fn_impact_connection) while
-- the payment case stays byte-identical (zero regression: 47/35 still produced via the dispatcher).
-- 04 §3 / §7 / §8 / §14. The affected anti-join + the at-risk-GMV € are SQL (no LLM, §3.6); the knob
-- nba_connection_min_ratio is read BY NAME (§3.8). Counts/€ are PRODUCED, never seeded (§14).
--
-- Hermetic, drift-immune fixture (rolled back): connection weeks + orders are staged at
-- current_date-relative dates so the window (week >= current_date - window_silent) always covers them
-- ⇒ the pinned numbers (8 affected / €1280) never drift with the calendar. 8 low-conn restaurants @
-- ratio 0.60 (connected 30/committed 50) + 4 healthy @ 0.96; 3 of the 8 complained ⇒ 5 SILENT. Each
-- low-conn restaurant has 5 'ok' orders @ net 80 ⇒ at-risk = 8 × (5×80 GMV × (1-0.60)) = 8 × 160 = €1280.
begin;
select plan(8);

-- ── dispatch contract (drives the refactor): the per-type producers exist; the dispatchers route to
--    them. Without the new migration these RED (the functions are absent / the case raises). ────────
select has_function('tenant', 'fn_affected_connection',
  array['uuid', 'text', 'integer', 'text'], 'fn_affected_connection extracted');
select has_function('tenant', 'fn_impact_connection', array['uuid'], 'fn_impact_connection extracted');

-- ── connection fixture (INPUTS only — counts/€ are PRODUCED, §14) ───────────────────────────────
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
select 'RCN-'||lpad(g::text,3,'0'), 'POOL-CONN', 'long_tail', 'long_tail'::segment, date '2026-01-01',
       case when g <= 8 then 'Centro' else 'Norte' end, 'pizza', 50
  from generate_series(1,12) g;
-- 4 weekly rows/restaurant inside the window. low-conn (g<=8): 30/50 = 0.60; healthy: 48/50 = 0.96.
insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
select 'RCN-'||lpad(g::text,3,'0'), (current_date - (w*7)),
       case when g <= 8 then 30 else 48 end, 50
  from generate_series(1,12) g cross join generate_series(0,3) w;
-- 5 'ok' orders/low-conn restaurant @ net 80 (the GMV the disconnection puts at risk).
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
select 'RCN-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'ok', 'Centro'
  from generate_series(1,8) g cross join generate_series(1,5) k;
-- 3 of the 8 low-conn restaurants opened a ticket ⇒ 5 SILENT (affected but never complained).
insert into catalog."Intent_Catalog"(intent_id, label) values ('delivery','Delivery')
  on conflict (intent_id) do nothing;
insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
select 'RCN-'||lpad(g::text,3,'0')||':C1', 'RCN-'||lpad(g::text,3,'0')||':conv1', 'POOL-CONN',
       'RCN-'||lpad(g::text,3,'0'), 'delivery'
  from generate_series(1,3) g;
-- connection problem the dispatcher resolves (problem_type='connection').
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status, problem_type)
  values ('POOL-CONN','RCN-001','moderate','open','connection');

-- ── NULL pre-run (§14): revenue_lost is NULL BEFORE the impact producer fires. ──────────────────
select is(
  (select revenue_lost from tenant."Diagnosed_Problem" where tenant_id='POOL-CONN'),
  null::numeric, 'connection revenue_lost is NULL before the impact producer runs (§14)');

-- ── affected dispatcher (4-arg, p_segment null). window_silent knob by NAME. ─────────────────────
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-CONN' limit 1),
  'POOL-CONN', (select value::int from catalog."Config_Knobs" where key='window_silent'), null);
select is(
  (select count(*)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-CONN'),
  8, 'connection affected = 8 (ratio < nba_connection_min_ratio) via the general dispatcher path');
select is(
  (select count(*) filter (where silent)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-CONN'),
  5, 'connection silent = 5 (8 affected − 3 complainants) via the anti-join');

-- ── impact dispatcher: deterministic at-risk GMV = Σ GMV_window × (1 − ratio) over affected. ─────
select is(
  tenant.fn_impact_revenue_lost((select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-CONN' limit 1)),
  1280::numeric, 'connection at-risk GMV = €1280 (8 × 400 × 0.40) via the connection dispatcher');
select is(
  (select provenance_by_field->>'revenue_lost' from tenant."Diagnosed_Problem" where tenant_id='POOL-CONN'),
  '[I]', 'connection revenue_lost carries provenance [I] (inferred)');

-- ── REGRESSION: payment still yields 47/35 through the SAME dispatcher (the connection case must not
--    perturb the payment route). Self-contained POOL-PAY-C fixture (47 failed @ net 80, 12 complain). ─
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
select 'RPC-'||lpad(g::text,3,'0'), 'POOL-PAY-C', 'long_tail', 'long_tail'::segment, date '2026-01-01', 'Centro'
  from generate_series(1,47) g;
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
select 'RPC-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed', 'Centro'
  from generate_series(1,47) g;
insert into catalog."Intent_Catalog"(intent_id, label) values ('billing','Billing')
  on conflict (intent_id) do nothing;
insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
select 'RPC-'||lpad(g::text,3,'0')||':C1', 'RPC-'||lpad(g::text,3,'0')||':conv1', 'POOL-PAY-C',
       'RPC-'||lpad(g::text,3,'0'), 'billing'
  from generate_series(1,12) g;
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
  values ('POOL-PAY-C','RPC-001','RPC-001:conv1','critical','open');
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-C' limit 1),
  'POOL-PAY-C', (select value::int from catalog."Config_Knobs" where key='window_silent'), null);
select is(
  (select count(*)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-PAY-C'),
  47, 'REGRESSION: payment affected still 47 via the dispatcher (connection case did not perturb it)');

select * from finish();
rollback;
