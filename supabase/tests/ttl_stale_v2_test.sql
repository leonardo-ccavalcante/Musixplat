-- pgTAP — Chunk 6a TTL/staleness (BR-12). TTL_baseline_days=7 (knob). fixed p_now for determinism.
begin;
select plan(3);
select is(cohort.fn_is_stale(timestamptz '2026-06-01', timestamptz '2026-06-17'), true,
          'freshness 16d old > TTL(7) ⇒ stale');
select is(cohort.fn_is_stale(timestamptz '2026-06-15', timestamptz '2026-06-17'), false,
          'freshness 2d old < TTL(7) ⇒ fresh');
select is(cohort.fn_is_stale(null, timestamptz '2026-06-17'), true,
          'NULL freshness ⇒ stale (fail-closed)');
select * from finish();
rollback;
