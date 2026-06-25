-- Single source of the demo's "today" (read BY NAME via the app.demo_ref GUC — CLAUDE.md §3.8 spirit).
-- Every SEEDING anchor (the business base + the usage-event recency signal, in seed.sql and the in-UI
-- "generate example" button) reads THIS so the generated board tracks ONE clock:
--   · GUC unset  ⇒ current_date  — live + hosted board tracks TODAY and never ages out.
--   · GUC set    ⇒ that date     — resetDb pins it to 2026-06-17 so tests stay deterministic; apply-hosted
--                                  sets current_date explicitly.
-- This fixes the skew where the base was frozen at 2026-06-17 while usage/measurement used current_date,
-- so the board went stale as the clock moved. Diagnosis MEASUREMENT windows keep current_date (they are
-- self-consistent at any evaluation time) — this only unifies the seeding side. STABLE (reads settings +
-- the clock), never IMMUTABLE.
create or replace function public.fn_demo_ref() returns date language sql stable as $$
  select coalesce(nullif(current_setting('app.demo_ref', true), '')::date, current_date);
$$;
