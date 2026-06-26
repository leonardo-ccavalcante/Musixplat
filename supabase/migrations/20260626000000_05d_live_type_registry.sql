-- 05D Diagnosis Engine · LIVE — F5 / L3: operator-taught problem types + revive the dead registry.
-- 04 §3 / §7 / §8 / §14. Goal: a manager registers a NEW problem type + its candidate causes at RUNTIME,
-- no source edit. The descriptor becomes DATA; the DETECTOR stays code (SQL math can't be runtime-authored
-- without injection, §8) — so a live type BINDS its measurement to an existing vetted producer (measured_by)
-- or, with no binding, honestly degrades-to-human ("can't measure yet").
--
-- ROOT-FIX (one home per type). `catalog."Problem_Type"` was seeded (F0) as "the single source of truth a
-- problem type is read from", but the dispatcher reads Diagnosed_Problem.problem_type and NEVER this catalog
-- (verified by grep: 5 INSERT, 0 SELECT in any runtime path). So the 5 builtin rows are dead copies of
-- shared/problem_types.ts. We remove them: builtins live in code (TS descriptor + their vetted SQL detector,
-- change-locked §3.11); the registry now holds ONLY live types, every row of which IS read at runtime
-- (resolveDescriptor + the dispatcher's measured_by resolution). No phantom table (§3.9): columns on the
-- existing catalog. No §14 result column: all fields here are INPUT/config ([C]), never a produced number.

-- ── new columns the operator's teaching needs. hypotheses = the candidate causes the LLM RANKS (§8, never
--    invents). measured_by = the bound vetted producer (null ⇒ unmeasurable ⇒ degrade-to-human). label =
--    display title. defined_by/created_at = provenance (who taught it, when). ──────────────────────────────
alter table catalog."Problem_Type"
  add column if not exists hypotheses  jsonb,
  add column if not exists measured_by text,
  add column if not exists label       text,
  add column if not exists defined_by  text,
  add column if not exists created_at  timestamptz not null default now();

-- ── live rows INHERIT the measurement (affected/impact/metric) from their bound builtin at resolve time,
--    so those per-row descriptors are no longer required (null for live). Drop NOT NULL. The builtins that
--    carried them are removed just below. ──────────────────────────────────────────────────────────────────
alter table catalog."Problem_Type"
  alter column affected_descriptor drop not null,
  alter column impact_descriptor   drop not null,
  alter column metric              drop not null;

-- ── remove the dead builtin copies (see ROOT-FIX above). After this the registry == live types only. The 2
--    tests that asserted a builtin row here (pgTAP 05d_registry_test, integration 05d_cancellation_path) are
--    updated to assert the NEW contract: builtins absent here, resolved from code. ────────────────────────
delete from catalog."Problem_Type" where origin = 'builtin';

-- ── guards (fail-closed at the DB, defense-in-depth). A live row MUST carry ≥1 hypothesis (the §8 seed the
--    LLM ranks). origin is a closed set. measured_by's allowlist is enforced at the write surface (defineType
--    zod) + at resolve (only a real builtin makes a live type measurable) — the single source for that list
--    is shared/problem_types.ts PROBLEM_TYPES, NOT re-hardcoded here. ─────────────────────────────────────
alter table catalog."Problem_Type"
  add constraint problem_type_origin_ck check (origin in ('builtin','live')),
  add constraint problem_type_live_hypotheses_ck
    check (origin <> 'live' or (hypotheses is not null and jsonb_array_length(hypotheses) >= 1));
