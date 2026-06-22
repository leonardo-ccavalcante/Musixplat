-- 05D Part B (F2) — precedent memory on Knowledge_Case: a VERIFIED past fix becomes a reusable precedent.
-- §14 NULL-pre-run preserved: `embedding` is NULL until embed-on-write; `verification_status` is 'unverified'
-- until the Part D re-measurement job confirms a real gap-close (the ONLY [V] field — it is NOT written here,
-- and `outcome`='acted' is downgraded to [C] in learn.ts). `lever` is the structured predicate (§4) the
-- accept-gate re-validates. No rows / embeddings / verifications are seeded here.
create extension if not exists vector;

alter table tenant."Knowledge_Case"
  add column if not exists embedding vector(1536),
  add column if not exists lever jsonb,
  add column if not exists verification_status text not null default 'unverified';

-- verification_status is a closed vocab; default 'unverified' is the conservative pre-measurement state.
do $$ begin
  alter table tenant."Knowledge_Case"
    add constraint knowledge_case_verif_ck
    check (verification_status in ('unverified','verified_fixed','verified_reopened'));
exception when duplicate_object then null; end $$;

-- kNN over the precedent embeddings (cosine) — mirrors the Knowledge_Chunk index (P06).
create index if not exists knowledge_case_embedding_idx
  on tenant."Knowledge_Case" using hnsw (embedding vector_cosine_ops);
