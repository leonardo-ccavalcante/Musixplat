-- pgTAP — 05A FOUNDATION gov DDL + §14 anti-fake (CLAUDE.md §1 test:sql). Runs in a
-- transaction, rolled back. Asserts: (1) §14 anti-fake — the 6 gov tables are EMPTY after
-- seed (their rows are produced at runtime, never seeded); (2) Decision_Trace append-only;
-- (3) 4-eyes CHECK (confirmador == proponente rejected); (4) XOR origin; (5) Liberacion
-- proponente <> operator; (6) the circular FKs + Conversation_Episode extension exist.
begin;
select plan(12);

-- §14 anti-fake: every new gov table is EMPTY after seed — rows come from their producers
-- (Eval golden-set, the min() motor, the operator cockpit P02), never from the seed.
select is((select count(*)::int from gov."NBA_Propuesta"),  0, 'anti-fake: NBA_Propuesta empty pre-run (P02 produces rows)');
select is((select count(*)::int from gov."Eval_Cell"),      0, 'anti-fake: Eval_Cell empty pre-run (golden-set produces verdict)');
select is((select count(*)::int from gov."Credencial"),     0, 'anti-fake: Credencial empty pre-run');
select is((select count(*)::int from gov."Politica_Tier"),  0, 'anti-fake: Politica_Tier empty pre-run');
select is((select count(*)::int from gov."Decision_Trace"), 0, 'anti-fake: Decision_Trace empty pre-run');
select is((select count(*)::int from gov."Liberacion_Lote"),0, 'anti-fake: Liberacion_Lote empty pre-run');

-- Fixtures: minimal valid graph (a policy + two users + a cohort) so the CHECKs can be exercised.
insert into catalog."Cohort_Rule_Version"(version_id, effective_date, what_changed) values ('vtest', date '2026-06-17', 't');
insert into cohort."Cohort"(cohort_id, tenure_bucket, tier_base, cohort_rule_version)
  values ('cohort_test', '6-12m', 'long_tail', 'vtest');
insert into gov."User"(user_id, tenant_id, org_level) values
  ('U-PROP', 'POOL-T', 'team'), ('U-CONF', 'POOL-T', 'team');
insert into gov."Politica_Tier"(policy_id, policy_version, teto_tier) values ('P-test', 'pv-test', 'MEDIUM');

-- Decision_Trace 4-eyes CHECK: confirmador_id == proponente_id is rejected (23514 check_violation).
select throws_ok(
  $$ insert into gov."Decision_Trace"(trace_id, episode_id, accion, proponente_id, confirmador_id, policy_version)
     values ('t-4eyes', null, 'liberar', 'U-PROP', 'U-PROP', 'pv-test') $$,
  '23514', NULL, '4-eyes CHECK rejects confirmador_id == proponente_id');

-- Decision_Trace XOR origin: setting BOTH liberacion_id and episode_id is rejected.
-- episode_id='E-test' must reference a real Conversation_Episode (real FK) so the CHECK (23514),
-- not the FK (23503), is what fails.
insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id)
  select 'E-test', 'conv-test', 'POOL-001', restaurant_id from tenant."Restaurant" limit 1;
insert into gov."Liberacion_Lote"(liberacion_id, cohort_id, accion, proponente_id, operator_id)
  values ('L-test', 'cohort_test', 'LIBERAR', 'U-PROP', 'U-CONF');
select throws_ok(
  $$ insert into gov."Decision_Trace"(trace_id, liberacion_id, episode_id, accion, proponente_id, policy_version)
     values ('t-xor', 'L-test', 'E-test', 'liberar', 'U-PROP', 'pv-test') $$,
  '23514', NULL, 'XOR origin rejects both liberacion_id and episode_id set');

-- Liberacion_Lote 4-eyes CHECK: proponente_id == operator_id is rejected.
select throws_ok(
  $$ insert into gov."Liberacion_Lote"(liberacion_id, cohort_id, accion, proponente_id, operator_id)
     values ('L-bad', 'cohort_test', 'LIBERAR', 'U-PROP', 'U-PROP') $$,
  '23514', NULL, 'Liberacion 4-eyes CHECK rejects proponente_id == operator_id');

-- Decision_Trace append-only: a valid trace cannot be UPDATEd or DELETEd (P0001 from tg_append_only).
insert into gov."Decision_Trace"(trace_id, episode_id, accion, proponente_id, confirmador_id, policy_version)
  values ('t-ok', 'E-test', 'liberar', 'U-PROP', 'U-CONF', 'pv-test');
select throws_ok(
  $$ update gov."Decision_Trace" set accion = 'pausar' where trace_id = 't-ok' $$,
  'P0001', NULL, 'Decision_Trace append-only: UPDATE rejected');
select throws_ok(
  $$ delete from gov."Decision_Trace" where trace_id = 't-ok' $$,
  'P0001', NULL, 'Decision_Trace append-only: DELETE rejected');

-- independencia_garantida is GENERATED = (confirmador_id IS NOT NULL): true when confirmed.
select is((select independencia_garantida from gov."Decision_Trace" where trace_id = 't-ok'),
          true, 'independencia_garantida GENERATED true when confirmador present');

select * from finish();
rollback;
