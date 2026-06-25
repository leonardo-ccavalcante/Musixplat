-- 05D Part D (prove-it-resolved re-measurement) — the knob that closes the loop. No DDL: Part B already added
-- `verification_status` (default 'unverified', the conservative §14 pre-run state) and its closed-vocab check
-- ('unverified'|'verified_fixed'|'verified_reopened'). This adds only the verify-window threshold, BY NAME
-- (§3.8). No rows / verifications are seeded — verification_status is written solely by the Part D producer
-- (server/motor/remeasure.ts) once it measures a real gap-close via fn_nba_test_all (§14, the only [V] field).

-- resolution_verify_window = weeks AFTER the acted week to re-measure the same signal. '[I]' = an engineering
-- default, operator-tunable; a single global value here (per-signal windows are a later refinement, §92).
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('resolution_verify_window', '1', '[I]', 'leo')
on conflict (key) do nothing;
