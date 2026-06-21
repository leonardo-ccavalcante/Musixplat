-- 02C MOTOR-LLM knobs (P1-1). These also live in supabase/seed.sql (so resetDb/local tests have them), but
-- HOSTED upgrades run pending migrations WITHOUT re-running seed.sql — so an existing prod DB would never
-- receive these keys and every runMotorAttempt would fail at knob_required_num. This idempotent migration
-- closes that gap. Knobs are [C] config, not RESULTs ⇒ seeding allowed (§14). By name (§3.8).
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('motor_max_loops',               '3',        '[C]', 'leo'),
  ('motor_min_confidence',          '0.6',      '[C]', 'leo'),
  ('motor_allowed_actions_default', 'A1,A4,A6', '[C]', 'leo')
on conflict (key) do nothing;
