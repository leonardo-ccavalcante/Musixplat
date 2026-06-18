-- 05A foundation DDL (drafted by the 05A builder; PR for review). Extends tenant-zone
-- Conversa_Episodio with the columns piece A.1.1 needs (canal, turnos, capa_estructurada,
-- provenance_por_campo) and creates the gov-zone min() motor log (min_calculo) that piece
-- A.4.6 writes. 04 §3.1 / §3.3 / §14. DDL only — brutos/config live in seed; min_calculo is
-- NEVER seeded (its rows are produced by the motor at runtime, §14 anti-fake). RLS deferred
-- per 04 §13 (active enforcement = server-side tRPC guard), matching the existing migrations.
--
-- [ASSUMPTION — spine scope] FK provenance to Eval_Cell / Politica_Tier / NBA_Propuesta is
-- DEFERRED: those P02/P06 tables are not built yet, so those refs are kept as plain text and
-- promoted to real FKs when P02/P06 land. The motor CHECK + XOR + append-only + ordered-ENUM
-- fail-closed (the testable core of A.4.6) are fully enforced now.

-- Support-conversation channel (04 §3 Conversa_Episodio). Closed label set. Distinct from
-- tenant."Orden".canal (free-text order channel) — types and columns share no namespace.
create type public.canal as enum ('whatsapp', 'email', 'in_app');

-- Extend Conversa_Episodio (04 §3 L107) — additive, keeps slice-01 panels intact.
alter table tenant."Conversa_Episodio"
  add column canal                public.canal,                          -- bruto (A.1.1)
  add column turnos               jsonb not null default '[]'::jsonb,    -- bruto sub-records, no child table (A.1.1)
  add column capa_estructurada    jsonb not null default '{}'::jsonb,    -- causa_hipotesis [I]/policy_version/... (A.2.6/A.6.3)
  add column provenance_por_campo jsonb not null default '{}'::jsonb;    -- per-field provenance (04 §7)

-- min_calculo (04 §3.3): append-only motor log. nivel_efectivo = least(3 arms) over the
-- ordered ENUM; a null arm ⇒ fail-closed to BAJA. NEVER seeded (§14). Exactly one origin
-- (nba_id XOR conversa_id): path P02 (nba) or path P05A (conversa).
create table gov."min_calculo" (
  calculo_id          uuid primary key default gen_random_uuid(),
  nba_id              text,                                  -- [deferred FK → NBA_Propuesta] path P02
  conversa_id         text,                                  -- [deferred FK → Conversa_Episodio] path P05A
  eval_cell_ref       text,                                  -- [deferred FK → Eval_Cell] provenance of liberado_evals
  policy_id           text,                                  -- [deferred FK → Politica_Tier] provenance of teto_tier
  pedido_NBA          public.nivel_autonomia not null,
  liberado_evals      public.nivel_autonomia not null,
  teto_tier           public.nivel_autonomia not null,
  nivel_efectivo      public.nivel_autonomia not null,       -- RESULT: computed at insert, never seeded (§14)
  auto_liberable      boolean default null,                  -- RESULT §14
  n_cohort            integer default null,
  cohort_rule_version text,
  computed_at         timestamptz not null default now(),
  constraint min_calculo_origen_xor check ((nba_id is not null) <> (conversa_id is not null)),
  constraint min_calculo_motor check (nivel_efectivo = least(pedido_NBA, liberado_evals, teto_tier))
);
create index min_calculo_conversa_idx on gov."min_calculo"(conversa_id);
create index min_calculo_nba_idx on gov."min_calculo"(nba_id);

-- Append-only (04 §3.3): the before/after autonomy audit never mutates.
create trigger min_calculo_append_only
  before update or delete on gov."min_calculo"
  for each row execute function public.tg_append_only();

-- The motor as a reusable deterministic function (CLAUDE.md §3.6: math in SQL, never an LLM).
-- least() over the ordered ENUM is the most conservative; a null arm ⇒ BAJA (fail-closed §3.7).
create or replace function gov.compute_nivel_efectivo(
  p public.nivel_autonomia, e public.nivel_autonomia, t public.nivel_autonomia
) returns public.nivel_autonomia language sql immutable as $$
  select least(
    coalesce(p, 'BAJA'::public.nivel_autonomia),
    coalesce(e, 'BAJA'::public.nivel_autonomia),
    coalesce(t, 'BAJA'::public.nivel_autonomia)
  );
$$;
