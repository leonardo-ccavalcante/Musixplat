-- pgTAP — 02:DETAIL — catalog definition fields + fn_nba_action_history NULL-safety (CLAUDE.md §1 test:sql).
-- Runs against the freshly reset+seeded DB (NBA_Proposal is empty post-seed, §14).
begin;
select plan(2);

-- 02:DETAIL-A1 — every action carries a playbook + a real created_at (reference data, seeded).
select is(
  (select count(*)::int from catalog."NBA_Catalogo" where playbook is not null and created_at is not null),
  8, 'all 8 NBA actions have a playbook + created_at');

select is(
  (select playbook is not null from catalog."NBA_Catalogo" where code='A1'),
  true, 'A1 has a playbook');

select * from finish();
rollback;
