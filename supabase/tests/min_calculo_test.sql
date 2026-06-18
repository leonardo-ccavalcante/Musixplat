-- pgTAP — 05A:A.4.6 min() motor + §14 anti-fake (CLAUDE.md §1 test:sql). Runs in a transaction,
-- rolled back. The motor lives in SQL (deterministic, never an LLM); min_calculation is never seeded.
begin;
select plan(7);

-- Motor: least() over the ORDERED enum (LOW<MEDIUM<HIGH); a null arm ⇒ LOW (fail-closed).
-- Args cast explicitly to the enum so overload resolution never depends on unknown-literal coercion.
select is(gov.compute_level_efectivo('HIGH'::public.autonomy_level,'MEDIUM'::public.autonomy_level,'HIGH'::public.autonomy_level), 'MEDIUM'::public.autonomy_level, 'least picks the min arm');
select is(gov.compute_level_efectivo('HIGH'::public.autonomy_level,'HIGH'::public.autonomy_level,'LOW'::public.autonomy_level), 'LOW'::public.autonomy_level,  'teto_tier caps to LOW');
select is(gov.compute_level_efectivo(null::public.autonomy_level,'HIGH'::public.autonomy_level,'HIGH'::public.autonomy_level),   'LOW'::public.autonomy_level,  'null arm ⇒ LOW (fail-closed)');
select is(gov.compute_level_efectivo('HIGH'::public.autonomy_level,'HIGH'::public.autonomy_level,'HIGH'::public.autonomy_level), 'HIGH'::public.autonomy_level,  'all high ⇒ HIGH');

-- §14 anti-fake: the motor log is empty after seed — rows are produced by the motor, never seeded.
select is((select count(*)::int from gov."min_calculation"), 0, 'anti-fake: min_calculation empty pre-run (never seeded)');

-- The motor CHECK rejects a hand-faked level_efectivo (must equal least of the 3 arms).
select throws_ok(
  $$ insert into gov."min_calculation"(conversation_id,pedido_NBA,liberado_evals,teto_tier,level_efectivo)
     values ('x','HIGH','MEDIUM','HIGH','HIGH') $$,
  '23514', NULL, 'motor CHECK rejects a level_efectivo that is not least(arms)');

-- Exactly one origin (nba_id XOR conversation_id).
select throws_ok(
  $$ insert into gov."min_calculation"(nba_id,conversation_id,pedido_NBA,liberado_evals,teto_tier,level_efectivo)
     values ('n','c','LOW','LOW','LOW','LOW') $$,
  '23514', NULL, 'XOR origin enforced (cannot set both nba_id and conversation_id)');

select * from finish();
rollback;
