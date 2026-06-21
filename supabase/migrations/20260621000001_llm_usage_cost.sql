-- P07 — LLM token-cost tracking ("custo da atención"). Every LLM call (chat or embedding) records the
-- raw token COUNTS the provider reports; the COST is derived in a view from Config_Knobs prices read BY
-- NAME (§3.8). The number stays in SQL (§3.6/§14): the LLM never emits a cost. Rows are written ONLY by
-- the runtime producer (server/_core/usage.ts recordUsage) — seed never inserts usage (§14 anti-fake).

create table gov."Llm_Usage_Log" (
  usage_id     uuid primary key default gen_random_uuid(),
  tenant_id    text not null,
  process_type text not null,                              -- business process (extensible, no enum): diagnosis|kb_ingest|kb_ask|kb_search|nba_kb_check|...
  kind         text not null,                              -- price family
  model        text not null,                              -- exact model string (picks the price knob)
  ref_id       text,                                       -- unit of attention: episode_id|problem_id|doc_id|nba_id (null for ad-hoc search)
  in_tok       integer not null,                           -- provider fact (prompt tokens) — NOT an LLM-produced number
  out_tok      integer not null,                           -- provider fact (completion tokens; 0 for embeddings)
  ts           timestamptz not null default now(),
  constraint llm_usage_kind_ck    check (kind in ('chat','embedding')),
  constraint llm_usage_tok_nonneg check (in_tok >= 0 and out_tok >= 0)
);
-- "Custo por ticket" groups by ref_id; per-process cost groups by process_type.
create index llm_usage_ref_idx     on gov."Llm_Usage_Log"(tenant_id, ref_id);
create index llm_usage_process_idx on gov."Llm_Usage_Log"(tenant_id, process_type);

-- Per-call cost. Prices are USD per 1,000,000 tokens, read BY NAME per model (§3.8):
--   llm_price_in_per_mtok:<model>   · llm_price_out_per_mtok:<model>
-- Fail-closed (§3.7): a missing price knob yields NULL cost (visibly "unpriced"), NEVER an optimistic
-- $0 that hides spend. A zero-token side costs 0 even if its price is absent (no charge ⇒ no gap).
create view gov.v_llm_cost as
select
  u.usage_id, u.tenant_id, u.process_type, u.kind, u.model, u.ref_id,
  u.in_tok, u.out_tok, u.ts,
  (case when u.in_tok = 0 then 0
        else (u.in_tok::numeric / 1000000) * pin.value::numeric end)
  + (case when u.out_tok = 0 then 0
          else (u.out_tok::numeric / 1000000) * pout.value::numeric end) as cost_usd
from gov."Llm_Usage_Log" u
left join catalog."Config_Knobs" pin  on pin.key  = 'llm_price_in_per_mtok:'  || u.model
left join catalog."Config_Knobs" pout on pout.key = 'llm_price_out_per_mtok:' || u.model;
