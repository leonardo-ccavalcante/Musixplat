-- pgTAP — 02:DETAIL — catalog definition fields + fn_nba_action_history NULL-safety (CLAUDE.md §1 test:sql).
-- Runs against the freshly reset+seeded DB (NBA_Proposal is empty post-seed, §14).
begin;
select plan(4);

-- 02:DETAIL-A1 — every action carries a playbook + a real created_at (reference data, seeded).
select is(
  (select count(*)::int from catalog."NBA_Catalogo" where playbook is not null and created_at is not null),
  8, 'all 8 NBA actions have a playbook + created_at');

select is(
  (select playbook is not null from catalog."NBA_Catalogo" where code='A1'),
  true, 'A1 has a playbook');

-- 02:DETAIL-B — the function exists; with NBA_Proposal empty post-seed (§14) it returns a conservative row.
select is(
  (select run_count from cohort.fn_nba_action_history('A1')),
  0::bigint, 'zero runs ⇒ run_count 0');
select is(
  (select acerto_rate from cohort.fn_nba_action_history('A1')),
  null::numeric, 'zero runs ⇒ acerto_rate NULL (no 0-fake, §14)');

select * from finish();
rollback;
