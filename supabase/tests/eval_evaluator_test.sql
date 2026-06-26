-- pgTAP — EPIC-B4 golden-set evaluator (CLAUDE.md §1 test:sql). The κ is DETERMINISTIC SQL (§2/§14):
-- a hand-computed Fleiss κ pins the formula; the Eval_Cell verdict is never seeded (anti-fake); the
-- thresholds are read by NAME (§3.8). Runs in a transaction, rolled back.
begin;
select plan(8);

-- §14 anti-fake: the VERDICT table is empty after seed — produced by runEval, never seeded.
select is((select count(*)::int from gov."Eval_Cell"), 0, 'anti-fake: Eval_Cell empty pre-run (verdict never seeded)');

-- The eval's OWN sample size is a distinct column from the raw-ticket count (n_cohort_x_intent).
select has_column('gov', 'Eval_Cell', 'n_golden_cases', 'Eval_Cell.n_golden_cases exists (golden-case count, RESULT)');

-- Thresholds by NAME (§3.8) — the status gate reads these; never hard-coded.
select is(catalog.knob_required_num('eval_pass_threshold'), 0.80::numeric, 'eval_pass_threshold seeded = 0.80');
select is(catalog.knob_required_num('eval_min_n'), 30::numeric, 'eval_min_n seeded = 30');
select is(catalog.knob_required_num('eval_kappa_min'), 0.60::numeric, 'eval_kappa_min seeded = 0.60');

-- ── Fleiss κ formula proof. 3 cases × 3 judges, 2 categories. By hand:
--    P̄ = (1 + 1 + 1/3)/3 = 7/9; p_A1 = 5/9, p_A2 = 4/9 ⇒ P̄_e = 41/81;
--    κ = (7/9 − 41/81)/(1 − 41/81) = (22/81)/(40/81) = 22/40 = 0.5500.
insert into cohort."Cohort"(cohort_id, cuisine, zone, tier_base, cohort_rule_version)
  values ('c_ktest', 'pizza', 'north', 'long_tail',
          (select value from catalog."Config_Knobs" where key = 'cohort_rule_version_current'));
insert into gov."Eval_Set"(version, target_level) values ('kt-v', 'MEDIUM');
insert into gov."Eval_Case"(eval_case_id, cohort_id, intent, version, scenario, correct_label) values
  ('00000000-0000-0000-0000-000000000001', 'c_ktest', (select intent_id from catalog."Intent_Catalog" order by intent_id limit 1), 'kt-v', '{}'::jsonb, 'A1'),
  ('00000000-0000-0000-0000-000000000002', 'c_ktest', (select intent_id from catalog."Intent_Catalog" order by intent_id limit 1), 'kt-v', '{}'::jsonb, 'A2'),
  ('00000000-0000-0000-0000-000000000003', 'c_ktest', (select intent_id from catalog."Intent_Catalog" order by intent_id limit 1), 'kt-v', '{}'::jsonb, 'A1');
insert into gov."Eval_Judge_Label"(eval_case_id, judge_id, label) values
  ('00000000-0000-0000-0000-000000000001', 'U-J1', 'A1'), ('00000000-0000-0000-0000-000000000001', 'U-J2', 'A1'), ('00000000-0000-0000-0000-000000000001', 'U-J3', 'A1'),
  ('00000000-0000-0000-0000-000000000002', 'U-J1', 'A2'), ('00000000-0000-0000-0000-000000000002', 'U-J2', 'A2'), ('00000000-0000-0000-0000-000000000002', 'U-J3', 'A2'),
  ('00000000-0000-0000-0000-000000000003', 'U-J1', 'A1'), ('00000000-0000-0000-0000-000000000003', 'U-J2', 'A1'), ('00000000-0000-0000-0000-000000000003', 'U-J3', 'A2');

select is(
  gov.fn_fleiss_kappa('c_ktest', (select intent_id from catalog."Intent_Catalog" order by intent_id limit 1), 'kt-v'),
  0.55::numeric,
  'Fleiss κ = 0.5500 for the hand-computed fixture (deterministic SQL, not an LLM)');

-- κ is NULL (honest, never an optimistic 1.0) when expected agreement is degenerate — every label the
-- same category ⇒ P̄_e = 1 ⇒ undefined. Delete the split case ⇒ all-unanimous-A1/A2 → still varies; instead
-- collapse to one category: relabel case-2's judges to A1 so every assignment is A1.
update gov."Eval_Judge_Label" set label = 'A1' where eval_case_id = '00000000-0000-0000-0000-000000000002';
update gov."Eval_Judge_Label" set label = 'A1' where eval_case_id = '00000000-0000-0000-0000-000000000003';
select ok(
  gov.fn_fleiss_kappa('c_ktest', (select intent_id from catalog."Intent_Catalog" order by intent_id limit 1), 'kt-v') is null,
  'κ is NULL when all labels are one category (P̄_e=1, undefined) — never a faked 1.0');

-- §3.10 wire: a produced released_evals=MEDIUM flows into the least() engine as MEDIUM (play/cap permissive).
select is(
  gov.compute_effective_level('HIGH'::public.autonomy_level, 'MEDIUM'::public.autonomy_level, 'HIGH'::public.autonomy_level),
  'MEDIUM'::public.autonomy_level,
  'released_evals=MEDIUM flows into effective_level=MEDIUM (the evaluator unblocks autonomy)');

select * from finish();
rollback;
