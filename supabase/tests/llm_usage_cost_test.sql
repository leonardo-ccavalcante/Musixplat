-- pgTAP — P07 LLM token-cost tracking (CLAUDE.md §1 test:sql). Runs in a transaction, rolled back.
-- Asserts: usage table + cost view exist; ref_id nullable; 4 price knobs seeded; cost arithmetic for
-- chat + embedding; fail-closed NULL cost for an unpriced model (never an optimistic $0).
begin;
select plan(7);

select has_table('gov', 'Llm_Usage_Log', 'usage log table exists');
select has_view('gov', 'v_llm_cost', 'cost view exists');
select col_is_null('gov', 'Llm_Usage_Log', 'ref_id', 'ref_id nullable (ad-hoc search has no ticket)');
select results_eq(
  $$select count(*)::int from catalog."Config_Knobs" where key like 'llm\_price\_%'$$,
  $$values (4)$$, '4 llm price knobs seeded');

-- chat cost: 1e6 in @ $0.15/M + 1e6 out @ $0.60/M = $0.75
insert into gov."Llm_Usage_Log"(tenant_id,process_type,kind,model,ref_id,in_tok,out_tok)
  values ('t_test','diagnosis','chat','gpt-4o-mini','p1',1000000,1000000);
select results_eq(
  $$select round(cost_usd,2) from gov.v_llm_cost where tenant_id='t_test' and model='gpt-4o-mini'$$,
  $$values (0.75::numeric)$$, 'chat cost = (in*0.15 + out*0.60) per 1M tokens');

-- embedding cost: 1e6 in @ $0.02/M, out 0 = $0.02
insert into gov."Llm_Usage_Log"(tenant_id,process_type,kind,model,ref_id,in_tok,out_tok)
  values ('t_test','kb_ingest','embedding','text-embedding-3-small','d1',1000000,0);
select results_eq(
  $$select round(cost_usd,2) from gov.v_llm_cost where tenant_id='t_test' and kind='embedding'$$,
  $$values (0.02::numeric)$$, 'embedding cost = in tokens x price/1M, out side is 0');

-- fail-closed: an unpriced model ⇒ NULL cost (visibly unpriced, never an optimistic $0 that hides spend)
insert into gov."Llm_Usage_Log"(tenant_id,process_type,kind,model,ref_id,in_tok,out_tok)
  values ('t_test','diagnosis','chat','mystery-model','p2',500,500);
select is(
  (select cost_usd from gov.v_llm_cost where model='mystery-model'),
  null, 'unpriced model ⇒ NULL cost (fail-closed, not $0)');

select * from finish();
rollback;
