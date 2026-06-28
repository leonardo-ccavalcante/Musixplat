-- Anti-fracturing gate (04 §3.3/§7) — seed the umbral_antifrac knob so the financial-abort gate is LIVE.
-- The rule: before a human RELEASES a money action to a cohort, refuse if any member restaurant shows
-- fracturing — its recent order volume (within window_silent) exceeds umbral_antifrac (many micro-orders
-- split to dodge a threshold). Enforced in server/cockpit/antifrac.ts via the pure financial_abort piece;
-- the knob is read BY NAME (§3.8, fail-closed RAISE if absent). [C] config, not a §14 RESULT ⇒ seed allowed.
--
-- Default 10000 is CONSERVATIVE / effectively inert on the seeded base (observed max per-restaurant
-- 30-day volume ≈ €1.36k) — the rule is wired and live, but won't fire until tuned DOWN to the real
-- fracturing economics. Also lives in seed.sql (local/test); this migration closes the hosted gap (a hosted
-- upgrade runs migrations WITHOUT re-running seed.sql). Idempotent.
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('umbral_antifrac', '10000', '[C]', 'leo')
on conflict (key) do nothing;
