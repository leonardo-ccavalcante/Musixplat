-- 05A foundation DDL (drafted by the 05A builder; PR for review). Extends tenant-zone
-- Conversation_Episode with the columns piece A.1.1 needs (channel, turnos, capa_estructurada,
-- provenance_by_field) and creates the gov-zone min() engine log (min_calculation) that piece
-- A.4.6 writes. 04 §3.1 / §3.3 / §14. DDL only — brutos/config live in seed; min_calculation is
-- NEVER seeded (its rows are produced by the engine at runtime, §14 anti-fake). RLS deferred
-- per 04 §13 (active enforcement = server-side tRPC guard), matching the existing migrations.
--
-- [ASSUMPTION — spine scope] FK provenance to Eval_Cell / Policy_Tier / NBA_Proposal is
-- DEFERRED: those P02/P06 tables are not built yet, so those refs are kept as plain text and
-- promoted to real FKs when P02/P06 land. The engine CHECK + XOR + append-only + ordered-ENUM
-- fail-closed (the testable core of A.4.6) are fully enforced now.

-- Support-conversation channel (04 §3 Conversation_Episode). Closed label set. Distinct from
-- tenant."Order".channel (free-text order channel) — types and columns share no namespace.
create type public.channel as enum ('whatsapp', 'email', 'in_app');

-- Extend Conversation_Episode (04 §3 L107) — additive, keeps slice-01 panels intact.
alter table tenant."Conversation_Episode"
  add column channel                public.channel,                          -- bruto (A.1.1)
  add column turnos               jsonb not null default '[]'::jsonb,    -- bruto sub-records, no child table (A.1.1)
  add column capa_estructurada    jsonb not null default '{}'::jsonb,    -- causa_hipotesis [I]/policy_version/... (A.2.6/A.6.3)
  add column provenance_by_field jsonb not null default '{}'::jsonb;    -- per-field provenance (04 §7)

-- min_calculation (04 §3.3): append-only engine log. effective_level = least(3 arms) over the
-- ordered ENUM; a null arm ⇒ fail-closed to LOW. NEVER seeded (§14). Exactly one origin
-- (nba_id XOR conversation_id): path P02 (nba) or path P05A (conversation).
create table gov."min_calculation" (
  calculation_id      uuid primary key default gen_random_uuid(),
  nba_id              text,                                  -- [deferred FK → NBA_Proposal] path P02
  conversation_id         text,                                  -- [deferred FK → Conversation_Episode] path P05A
  eval_cell_ref       text,                                  -- [deferred FK → Eval_Cell] provenance of released_evals
  policy_id           text,                                  -- [deferred FK → Policy_Tier] provenance of tier_cap
  nba_request         public.autonomy_level not null,
  released_evals      public.autonomy_level not null,
  tier_cap            public.autonomy_level not null,
  effective_level     public.autonomy_level not null,       -- RESULT: computed at insert, never seeded (§14)
  auto_releasable     boolean default null,                  -- RESULT §14
  n_cohort            integer default null,
  cohort_rule_version text,
  computed_at         timestamptz not null default now(),
  constraint min_calculation_origin_xor check ((nba_id is not null) <> (conversation_id is not null)),
  constraint min_calculation_engine_check check (effective_level = least(nba_request, released_evals, tier_cap))
);
create index min_calculation_conversation_idx on gov."min_calculation"(conversation_id);
create index min_calculation_nba_idx on gov."min_calculation"(nba_id);

-- Append-only (04 §3.3): the before/after autonomy audit never mutates.
create trigger min_calculation_append_only
  before update or delete on gov."min_calculation"
  for each row execute function public.tg_append_only();

-- The engine as a reusable deterministic function (CLAUDE.md §3.6: math in SQL, never an LLM).
-- least() over the ordered ENUM is the most conservative; a null arm ⇒ LOW (fail-closed §3.7).
create or replace function gov.compute_effective_level(
  p public.autonomy_level, e public.autonomy_level, t public.autonomy_level
) returns public.autonomy_level language sql immutable as $$
  select least(
    coalesce(p, 'LOW'::public.autonomy_level),
    coalesce(e, 'LOW'::public.autonomy_level),
    coalesce(t, 'LOW'::public.autonomy_level)
  );
$$;
