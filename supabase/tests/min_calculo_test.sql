-- pgTAP — 05A:A.4.6 min() engine + §14 anti-fake (CLAUDE.md §1 test:sql). Runs in a transaction,
-- rolled back. The engine lives in SQL (deterministic, never an LLM); min_calculation is never seeded.
begin;
select plan(7);

-- Engine: least() over the ORDERED enum (LOW<MEDIUM<HIGH); a null arm ⇒ LOW (fail-closed).
-- Args cast explicitly to the enum so overload resolution never depends on unknown-literal coercion.
select is(gov.compute_effective_level('HIGH'::public.autonomy_level,'MEDIUM'::public.autonomy_level,'HIGH'::public.autonomy_level), 'MEDIUM'::public.autonomy_level, 'least picks the min arm');
select is(gov.compute_effective_level('HIGH'::public.autonomy_level,'HIGH'::public.autonomy_level,'LOW'::public.autonomy_level), 'LOW'::public.autonomy_level,  'tier_cap caps to LOW');
select is(gov.compute_effective_level(null::public.autonomy_level,'HIGH'::public.autonomy_level,'HIGH'::public.autonomy_level),   'LOW'::public.autonomy_level,  'null arm ⇒ LOW (fail-closed)');
select is(gov.compute_effective_level('HIGH'::public.autonomy_level,'HIGH'::public.autonomy_level,'HIGH'::public.autonomy_level), 'HIGH'::public.autonomy_level,  'all high ⇒ HIGH');

-- §14 anti-fake: the engine log is empty after seed — rows are produced by the engine, never seeded.
select is((select count(*)::int from gov."min_calculation"), 0, 'anti-fake: min_calculation empty pre-run (never seeded)');

-- The engine CHECK rejects a hand-faked effective_level (must equal least of the 3 arms).
select throws_ok(
  $$ insert into gov."min_calculation"(nba_id,nba_request,released_evals,tier_cap,effective_level)
     values ('n','HIGH','MEDIUM','HIGH','HIGH') $$,
  '23514', NULL, 'engine CHECK rejects an effective_level that is not least(arms)');

-- Exactly one origin (nba_id XOR episode_id).
select throws_ok(
  $$ insert into gov."min_calculation"(nba_id,episode_id,nba_request,released_evals,tier_cap,effective_level)
     select 'n', episode_id, 'LOW','LOW','LOW','LOW'
     from tenant."Conversation_Episode" limit 1 $$,
  '23514', NULL, 'XOR origin enforced (cannot set both nba_id and episode_id)');

select * from finish();
rollback;
