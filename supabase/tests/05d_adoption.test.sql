-- pgTAP — 05D adoption problem type. A FIFTH problem flows through the SAME engine: the dispatchers gain
-- a `when 'adoption'` case (fn_affected_adoption / fn_impact_adoption) while the prior cases stay
-- byte-identical (zero regression: payment 47 still produced via the dispatcher). 04 §3 / §7 / §8 / §14.
-- The affected anti-join (NOT EXISTS over Usage_Event) + the at-risk-GMV € are SQL (no LLM, §3.6); the knob
-- adoption_gap_days is read BY NAME (§3.8). Counts/€ are PRODUCED, never seeded (§14).
--
-- Hermetic, drift-immune fixture (rolled back): usage events + orders are staged at current_date-relative
-- dates so the gap window (ts >= current_date - adoption_gap_days[30]) and the impact window
-- (order_date >= current_date - window_silent[30]) always cover/exclude the right rows ⇒ the pinned numbers
-- (6 affected / 4 silent / €2400) never drift. 10 restaurants: 6 non-adopting (last usage 60d ago, OLDER
-- than the 30d gap) + 4 adopting (usage 5d ago, INSIDE the gap). 2 of the 6 non-adopting complained ⇒ 4
-- SILENT. Each non-adopting restaurant has 5 'ok' orders @ net 80 over the window ⇒ at-risk = 6 × 400 = €2400.
begin;
select plan(8);

-- dispatch contract: the per-type producers exist; the dispatchers route to them.
select has_function('tenant', 'fn_affected_adoption',
  array['uuid', 'text', 'integer', 'text'], 'fn_affected_adoption extracted');
select has_function('tenant', 'fn_impact_adoption', array['uuid'], 'fn_impact_adoption extracted');

-- adoption fixture (INPUTS only — counts/€ are PRODUCED, §14)
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
select 'RAD-'||lpad(g::text,3,'0'), 'POOL-ADOPT', 'long_tail', 'long_tail'::segment, date '2026-01-01',
       case when g <= 6 then 'Centro' else 'Norte' end, 'pizza', 50
  from generate_series(1,10) g;
-- usage events: non-adopting (g<=6) last FEATURE use 60d ago (> 30d gap ⇒ affected); adopting (g>6) 5d ago.
-- event_type='feature_use' — the SAME signal the producer writes & fn_affected_adoption scopes to (Codex P1).
insert into tenant."Usage_Event"(restaurant_id, feature, event_type, ts)
select 'RAD-'||lpad(g::text,3,'0'), 'menu_editor', 'feature_use',
       case when g <= 6 then (current_date - 60) else (current_date - 5) end
  from generate_series(1,10) g;
-- P1 GUARD: a non-adopting restaurant (RAD-001) ALSO has a recent NON-feature_use event ('movement' from a
-- cohort producer). adoption must IGNORE it (scope to feature_use) ⇒ RAD-001 STAYS affected. Without the
-- event_type filter this recent row would drop RAD-001 ⇒ affected would be 5, not 6 — so the assert below pins it.
insert into tenant."Usage_Event"(restaurant_id, feature, event_type, ts)
  values ('RAD-001', 'cohorts', 'movement', current_date - 1);
-- 5 'ok' orders/non-adopting restaurant @ net 80 (the GMV the disengagement puts at risk), inside the window.
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
select 'RAD-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'ok', 'Centro'
  from generate_series(1,6) g cross join generate_series(1,5) k;
-- 2 of the 6 non-adopting restaurants opened a ticket ⇒ 4 SILENT (affected but never complained).
insert into catalog."Intent_Catalog"(intent_id, label) values ('adoption','Adoption')
  on conflict (intent_id) do nothing;
insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
select 'RAD-'||lpad(g::text,3,'0')||':C1', 'RAD-'||lpad(g::text,3,'0')||':conv1', 'POOL-ADOPT',
       'RAD-'||lpad(g::text,3,'0'), 'adoption'
  from generate_series(1,2) g;
-- adoption problem the dispatcher resolves (problem_type='adoption').
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status, problem_type)
  values ('POOL-ADOPT','RAD-001','moderate','open','adoption');

-- NULL pre-run (§14): revenue_lost is NULL BEFORE the impact producer fires.
select is(
  (select revenue_lost from tenant."Diagnosed_Problem" where tenant_id='POOL-ADOPT'),
  null::numeric, 'adoption revenue_lost is NULL before the impact producer runs (§14)');

-- affected dispatcher (4-arg, p_segment null). window_silent knob by NAME (the silent-hunt window arg).
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-ADOPT' limit 1),
  'POOL-ADOPT', (select value::int from catalog."Config_Knobs" where key='window_silent'), null);
select is(
  (select count(*)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-ADOPT'),
  6, 'adoption affected = 6 (no usage event within adoption_gap_days) via the general dispatcher path');
select is(
  (select count(*) filter (where silent)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-ADOPT'),
  4, 'adoption silent = 4 (6 affected − 2 complainants) via the anti-join');

-- impact dispatcher: deterministic at-risk GMV = Σ GMV_window over the affected set.
select is(
  tenant.fn_impact_revenue_lost((select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-ADOPT' limit 1)),
  2400::numeric, 'adoption at-risk GMV = €2400 (6 × 5 orders × net 80) via the adoption dispatcher');
select is(
  (select provenance_by_field->>'revenue_lost' from tenant."Diagnosed_Problem" where tenant_id='POOL-ADOPT'),
  '[I]', 'adoption revenue_lost carries provenance [I] (inferred)');

-- REGRESSION: payment still yields 47 through the SAME dispatcher (the adoption case must not perturb the
-- payment route). Self-contained POOL-PAY-A fixture (47 failed @ net 80, 12 complain).
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
select 'RPA-'||lpad(g::text,3,'0'), 'POOL-PAY-A', 'long_tail', 'long_tail'::segment, date '2026-01-01', 'Centro'
  from generate_series(1,47) g;
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
select 'RPA-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed', 'Centro'
  from generate_series(1,47) g;
insert into catalog."Intent_Catalog"(intent_id, label) values ('billing','Billing')
  on conflict (intent_id) do nothing;
insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
select 'RPA-'||lpad(g::text,3,'0')||':C1', 'RPA-'||lpad(g::text,3,'0')||':conv1', 'POOL-PAY-A',
       'RPA-'||lpad(g::text,3,'0'), 'billing'
  from generate_series(1,12) g;
insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
  values ('POOL-PAY-A','RPA-001','RPA-001:conv1','critical','open');
select tenant.fn_hunt_silent(
  (select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY-A' limit 1),
  'POOL-PAY-A', (select value::int from catalog."Config_Knobs" where key='window_silent'), null);
select is(
  (select count(*)::int from tenant."Affected" a
     join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id where p.tenant_id='POOL-PAY-A'),
  47, 'REGRESSION: payment affected still 47 via the dispatcher (adoption case did not perturb it)');

select * from finish();
rollback;
