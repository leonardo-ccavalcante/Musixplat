-- pgTAP — P06 Knowledge Base / RAG substrate (CLAUDE.md §1 test:sql).
-- Runs in a transaction, rolled back.
-- Asserts: vector extension; Knowledge_Document + Knowledge_Chunk tables;
-- embedding column nullable (§14 NULL-pre-run); kb_doc_refs on Diagnosed_Problem;
-- 5 kb_* config knobs seeded.
begin;
select plan(7);

select has_extension('vector');
select has_table('tenant', 'Knowledge_Document', 'doc table exists');
select has_table('tenant', 'Knowledge_Chunk', 'chunk table exists');
select has_column('tenant', 'Knowledge_Chunk', 'embedding', 'embedding column exists');
select col_is_null('tenant', 'Knowledge_Chunk', 'embedding', 'embedding nullable - §14 NULL-pre-run');
select has_column('tenant', 'Diagnosed_Problem', 'kb_doc_refs', 'dossier carries doc citations');
select results_eq(
  $$select count(*)::int from catalog."Config_Knobs" where key like 'kb\_%'$$,
  $$values (5)$$, '5 kb_* knobs seeded');

select * from finish();
rollback;
