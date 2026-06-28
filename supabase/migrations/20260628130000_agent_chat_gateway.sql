-- Agent Chat Gateway (Fatia 1) — channel-agnostic conversational entry point (Telegram today,
-- Intercom tomorrow). The brain lives in the platform; n8n is a dumb relay (Opção B).
--
-- Two tables, both pure INFRA (no §14 result columns — nothing here is a measured number):
--   1. gov."Channel_Identity" — binds (channel, external_id) → restaurant/tenant/user. The tenant
--      is resolved SERVER-SIDE from the restaurant_id at bind time (anti-spoofing, 04 §7); the
--      external party never supplies tenant_id. This is the only authorization for a chat session.
--   2. gov.n8n_chat_histories — conversation memory in the LangChain Postgres-Chat-Memory column shape
--      the n8n estate uses (session_id + message jsonb). It lives in the `gov` schema (NOT `public`) so
--      the Supabase Data API / PostgREST never exposes it — in Opção B the platform owns this table and
--      n8n is a dumb relay, so the public-schema convenience buys nothing and only adds an exposure
--      surface. `tenant_id` is carried (best-effort, nullable for pre-bind onboarding turns) so a future
--      tenant-scoped RLS policy needs no schema change. NOTE: the platform writes `content` ALREADY
--      REDACTED (redactPII) — the B2B owner case must never persist raw PII.

create table if not exists gov."Channel_Identity" (
  channel       text        not null,                 -- 'telegram' | 'intercom' | ...
  external_id   text        not null,                 -- the channel's user/chat id (e.g. Telegram chat.id)
  restaurant_id text        not null,                 -- DATA within the pool (what the owner typed)
  tenant_id     text        not null,                 -- RESOLVED server-side from restaurant_id (never client)
  user_id       text        not null,                 -- a resolved user of the tenant (ctx for createCaller)
  created_at    timestamptz not null default now(),
  primary key (channel, external_id)
);

-- Conversation memory (LangChain Postgres Chat Memory column shape — reuse the format, in gov schema).
create table if not exists gov.n8n_chat_histories (
  id              bigint generated always as identity primary key,
  session_id      text        not null,               -- = "<channel>:<external_id>" (composite, no cross-channel collision)
  tenant_id       text,                               -- best-effort from the binding; NULL on pre-bind onboarding turns
  message         jsonb       not null,               -- { "type": "human"|"ai", "content": "...redacted..." }
  sequence_number integer     not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists n8n_chat_histories_session_seq
  on gov.n8n_chat_histories (session_id, sequence_number);
