-- 05D Diagnosis Engine · LIVE — F0 Task 2: descriptor REGISTRY (generalizes the engine).
-- 04 §3 / §7 / §8 / §14. The earlier 05B producers were payment-bound; this registry is the
-- single source of truth a problem type is read from, so ONE pipeline serves many types
-- (built-in AND live-defined). Payment stays E2E via the general path — zero regression.
--
-- Design (CLAUDE.md §3.9 phantom check): creates only catalog."Problem_Type" + two columns on
-- the existing fat Diagnosed_Problem table. No denylisted table. Result columns stay NULL-pre-run
-- (§14): problem_type/segment are INPUT classification fields (DATA, not a produced number),
-- defaulted to 'payment' so the shipped 3-arg path keeps working unchanged.

-- ── catalog.Problem_Type (04 §3, NEW registry): one row per problem type. The descriptor the
--    dispatcher reads — which affected/impact producer to run, the concentration axis, the metric.
--    affected/impact descriptors are jsonb (the SAME contract shared/problem_types.ts encodes for
--    the client). origin 'builtin' ships a vetted SQL fn; 'live' (F5) compiles from a whitelist. ──
create table catalog."Problem_Type" (
  problem_type        text primary key,
  area_type           text not null,
  affected_descriptor jsonb not null,
  impact_descriptor   jsonb not null,
  concentration_dim   text not null default 'zone',
  metric              text not null,
  origin              text not null default 'builtin',
  active              boolean not null default true
);

-- ── Diagnosed_Problem += problem_type, segment. problem_type defaults 'payment' so EVERY existing
--    row + the shipped reportProblem path stay valid (the dispatcher resolves 'payment' → the
--    extracted payment producer). segment is the slicing axis (Restaurant.segment), nullable
--    (null ⇒ whole pool). Both are INPUT (classification), never a §14 RESULT column. ────────────
alter table tenant."Diagnosed_Problem"
  add column if not exists problem_type text not null default 'payment',
  add column if not exists segment      text;

-- ── seed the payment built-in descriptor (mirrors shared/problem_types.ts PROBLEM_TYPES.payment).
--    This is a CATALOG row (configuration, [C]), not a produced result — the registry must carry
--    payment so the dispatcher's `case 'payment'` resolves. ─────────────────────────────────────
insert into catalog."Problem_Type"(problem_type, area_type, affected_descriptor, impact_descriptor, metric)
values ('payment', 'finance',
        '{"table":"Order","signal":"payment_status=''failed''"}'::jsonb,
        '{"kind":"sum_net_value"}'::jsonb, 'recover_failed_payment_value');
