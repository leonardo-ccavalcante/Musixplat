-- P06 Knowledge Base / RAG substrate. DDL only — no embeddings seeded (§14 NULL-pre-run).
-- RLS deferred per 04 §13; active enforcement = server-side tenantProcedure guard.
create extension if not exists vector;

create type public.kb_doc_type as enum ('Policy','Context','FAQ','Terms','Runbook','Other');
create type public.kb_doc_status as enum ('proposed','confirmed','parse_failed');

create table tenant."Knowledge_Document" (
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
create index knowledge_doc_tenant_idx on tenant."Knowledge_Document"(tenant_id);

create table tenant."Knowledge_Chunk" (
  chunk_id    uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references tenant."Knowledge_Document"(doc_id) on delete cascade,
  tenant_id   text not null,
  chunk_index integer not null,
  content     text not null,
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);
create index knowledge_chunk_tenant_idx on tenant."Knowledge_Chunk"(tenant_id);
create index knowledge_chunk_embedding_idx on tenant."Knowledge_Chunk" using hnsw (embedding vector_cosine_ops);

alter table tenant."Diagnosed_Problem" add column if not exists kb_doc_refs jsonb not null default '[]'::jsonb;
