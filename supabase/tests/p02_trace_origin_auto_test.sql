-- pgTAP — 02:CP2 — the autonomous-action audit origin exists (CLAUDE.md §1 test:sql).
-- Runs against the freshly reset+seeded DB. The enum gains 'auto' for AI-acted-alone traces; the
-- §7 money hard-no + auto_releasable gate live in the TS autoDispatch (integration), not here.
begin;
select plan(3);

-- 'auto' is now a valid trace_origin label (the new autonomous origin).
select has_type('public', 'trace_origin', 'trace_origin enum exists');
select ok(
  'auto' = any (enum_range(null::public.trace_origin)::text[]),
  'trace_origin includes the autonomous origin ''auto''');

-- The human surfaces stay valid (additive, no removal) — desktop is still a label.
select ok(
  'desktop' = any (enum_range(null::public.trace_origin)::text[]),
  'trace_origin still includes ''desktop'' (additive)');

select * from finish();
rollback;
