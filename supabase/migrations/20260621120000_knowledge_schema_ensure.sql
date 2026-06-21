-- P06 hotfix — idempotently ENSURE the Knowledge Base / RAG schema exists in every environment.
--
-- Root cause (prod 500s on knowledge.list / knowledge.nbaImpact, "could not index" on upload):
-- the hosted DB was missing tenant."Knowledge_Document" / tenant."Knowledge_Chunk". The original
-- 20260620000001_knowledge_pgvector.sql never executed there — it was recorded as applied in
-- public._schema_migrations without running (the `db:migrate -- --baseline` adoption path records
-- every current file as applied WITHOUT executing it), so the normal deploy migrator skips it forever.
-- A pure DB read (knowledge.list) then fails with "relation does not exist" (§3.7 fail-closed → 500).
--
-- This migration is a NEW file (so the deploy migrator WILL run it) and is fully idempotent: a no-op
-- where the schema already exists (local/CI), and self-healing on the hosted DB. It only creates the
-- structure — no embeddings, no rows are seeded (§14 NULL-pre-run is preserved; producers still fill
-- embeddings at runtime). Mirrors 20260620000001 exactly, guard-for-guard.

create extension if not exists vector;

-- Postgres has no `create type if not exists`; guard each enum on pg_type (public schema).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'kb_doc_type'
                 and typnamespace = 'public'::regnamespace) then
    create type public.kb_doc_type as enum ('Policy','Context','FAQ','Terms','Runbook','Other');
  end if;
  if not exists (select 1 from pg_type where typname = 'kb_doc_status'
                 and typnamespace = 'public'::regnamespace) then
    create type public.kb_doc_status as enum ('proposed','confirmed','parse_failed');
  end if;
end $$;

create table if not exists tenant."Knowledge_Document" (
  doc_id              uuid primary key default gen_random_uuid(),
  tenant_id           text not null,
  filename            text not null,
  mime                text not null,
  source              text not null default 'upload',
  raw_text            text,
  doc_type            public.kb_doc_type,
  doc_type_confidence numeric,
  status              public.kb_doc_status not null default 'proposed',
  provenance_by_field jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists knowledge_doc_tenant_idx on tenant."Knowledge_Document"(tenant_id);

create table if not exists tenant."Knowledge_Chunk" (
  chunk_id    uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references tenant."Knowledge_Document"(doc_id) on delete cascade,
  tenant_id   text not null,
  chunk_index integer not null,
  content     text not null,
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);
create index if not exists knowledge_chunk_tenant_idx on tenant."Knowledge_Chunk"(tenant_id);
create index if not exists knowledge_chunk_embedding_idx
  on tenant."Knowledge_Chunk" using hnsw (embedding vector_cosine_ops);

alter table tenant."Diagnosed_Problem" add column if not exists kb_doc_refs jsonb not null default '[]'::jsonb;
