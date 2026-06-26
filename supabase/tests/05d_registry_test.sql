-- pgTAP — 05D registry. F0 created catalog.Problem_Type; L3 (F5) turned it into the LIVE-type registry:
-- new columns (hypotheses, measured_by, …) + the dead builtin rows REMOVED. Builtins now live ONLY in
-- shared/problem_types.ts + their SQL detector (the dispatcher reads Diagnosed_Problem.problem_type, never
-- this catalog — the rows were dead duplicates). The registry holds ONLY live types, every row read at
-- runtime. Runs in a transaction, rolled back.
begin;
select plan(6);

select has_table('catalog', 'Problem_Type', 'registry table exists');
select has_column('tenant', 'Diagnosed_Problem', 'problem_type', 'type col added');
select has_column('tenant', 'Diagnosed_Problem', 'segment', 'segment col added');
select has_column('catalog', 'Problem_Type', 'hypotheses', 'L3 hypotheses col added');
select has_column('catalog', 'Problem_Type', 'measured_by', 'L3 measured_by col added');
select is(
  (select count(*)::int from catalog."Problem_Type" where origin = 'builtin'),
  0,
  'builtin rows removed — registry holds only live types (L3 single-source)'
);

select * from finish();
rollback;
