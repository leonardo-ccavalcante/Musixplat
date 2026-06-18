-- pgTAP — 05A:A.4.6 min() motor + §14 anti-fake (CLAUDE.md §1 test:sql). Runs in a transaction,
-- rolled back. The motor lives in SQL (deterministic, never an LLM); min_calculo is never seeded.
begin;
select plan(7);

-- Motor: least() over the ORDERED enum (BAJA<MEDIA<ALTA); a null arm ⇒ BAJA (fail-closed).
-- Args cast explicitly to the enum so overload resolution never depends on unknown-literal coercion.
select is(gov.compute_nivel_efectivo('ALTA'::public.nivel_autonomia,'MEDIA'::public.nivel_autonomia,'ALTA'::public.nivel_autonomia), 'MEDIA'::public.nivel_autonomia, 'least picks the min arm');
select is(gov.compute_nivel_efectivo('ALTA'::public.nivel_autonomia,'ALTA'::public.nivel_autonomia,'BAJA'::public.nivel_autonomia), 'BAJA'::public.nivel_autonomia,  'teto_tier caps to BAJA');
select is(gov.compute_nivel_efectivo(null::public.nivel_autonomia,'ALTA'::public.nivel_autonomia,'ALTA'::public.nivel_autonomia),   'BAJA'::public.nivel_autonomia,  'null arm ⇒ BAJA (fail-closed)');
select is(gov.compute_nivel_efectivo('ALTA'::public.nivel_autonomia,'ALTA'::public.nivel_autonomia,'ALTA'::public.nivel_autonomia), 'ALTA'::public.nivel_autonomia,  'all high ⇒ ALTA');

-- §14 anti-fake: the motor log is empty after seed — rows are produced by the motor, never seeded.
select is((select count(*)::int from gov."min_calculo"), 0, 'anti-fake: min_calculo empty pre-run (never seeded)');

-- The motor CHECK rejects a hand-faked nivel_efectivo (must equal least of the 3 arms).
select throws_ok(
  $$ insert into gov."min_calculo"(conversa_id,pedido_NBA,liberado_evals,teto_tier,nivel_efectivo)
     values ('x','ALTA','MEDIA','ALTA','ALTA') $$,
  '23514', NULL, 'motor CHECK rejects a nivel_efectivo that is not least(arms)');

-- Exactly one origin (nba_id XOR conversa_id).
select throws_ok(
  $$ insert into gov."min_calculo"(nba_id,conversa_id,pedido_NBA,liberado_evals,teto_tier,nivel_efectivo)
     values ('n','c','BAJA','BAJA','BAJA','BAJA') $$,
  '23514', NULL, 'XOR origin enforced (cannot set both nba_id and conversa_id)');

select * from finish();
rollback;
