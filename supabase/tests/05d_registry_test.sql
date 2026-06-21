-- pgTAP — 05D registry (F0 Task 2). The descriptor registry that generalizes the engine:
-- catalog.Problem_Type (one row per problem type) + Diagnosed_Problem.{problem_type, segment}.
-- Runs in a transaction, rolled back. Asserts table + columns + the seeded payment descriptor row
-- (the payment built-in must exist so the dispatcher resolves it; §B.1 registry).
begin;
select plan(4);

select has_table('catalog', 'Problem_Type', 'registry table exists');
select has_column('tenant', 'Diagnosed_Problem', 'problem_type', 'type col added');
select has_column('tenant', 'Diagnosed_Problem', 'segment', 'segment col added');
select is(
  (select area_type from catalog."Problem_Type" where problem_type = 'payment'),
  'finance',
  'payment descriptor seeded'
);

select * from finish();
rollback;
