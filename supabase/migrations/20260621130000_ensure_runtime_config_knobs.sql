-- P06/P07 hotfix — idempotently ENSURE the required runtime config knobs exist in every environment.
--
-- Root cause (upload "could not index" on prod): ingestDocument reads kb_chunk_size / kb_chunk_overlap
-- by name (§3.8); on prod they were absent, so knob() returned NaN, chunk() produced a single empty
-- chunk, and the OpenAI embeddings API rejected the empty input (400) — surfaced as the generic
-- index-failed message. These knobs live in supabase/seed.sql, but the deploy migrator
-- (scripts/apply-migrations.ts, run as the railway preDeployCommand) runs MIGRATIONS ONLY — it never
-- runs seed.sql. So any config added to seed.sql after the last full db:hosted seed never reaches prod.
--
-- A migration is the ONLY path the prod pipeline actually executes, so the REQUIRED runtime config for
-- P06 (Knowledge/RAG) + P07 (token cost) is provisioned here. Idempotent (on conflict do nothing): a
-- no-op where the rows already exist (local/CI/seed.sql), self-healing on the hosted DB. These are [C]
-- config, not RESULT numbers — seeding is allowed (§14 NULL-pre-run is about result columns).
-- seed.sql remains the source of truth for fresh/local databases; this only guarantees prod parity.
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('kb_chunk_size',           '1200', '[C]', 'p06'),
  ('kb_chunk_overlap',        '150',  '[C]', 'p06'),
  ('kb_retrieval_top_k',      '5',    '[C]', 'p06'),
  ('kb_similarity_threshold', '0.30', '[C]', 'p06'),
  ('kb_classification_floor', '0.55', '[C]', 'p06'),
  ('llm_price_in_per_mtok:gpt-4o-mini',             '0.15', '[C]', 'cost'),
  ('llm_price_out_per_mtok:gpt-4o-mini',            '0.60', '[C]', 'cost'),
  ('llm_price_in_per_mtok:text-embedding-3-small',  '0.02', '[C]', 'cost'),
  ('llm_price_out_per_mtok:text-embedding-3-small', '0',    '[C]', 'cost')
on conflict (key) do nothing;
