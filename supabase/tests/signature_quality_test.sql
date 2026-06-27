-- pgTAP — 02:BR-LOG-2 — gov.fn_signature_quality: the deterministic signature-quality producer for
-- gov."Decision_Trace" (04 §7 / §14 / §3.8). Runs against the freshly reset+seeded DB (CLAUDE.md §1
-- test:sql). The umbral knob rubber_stamp_max_sec=30 comes from seed.sql, read BY NAME (never a literal).
-- Rule: rubber_stamp_flag = (time_to_signature_sec < umbral AND origin in the human quick-sign set).
-- 04 §7 literal is origin='movil' ONLY; Leo ratified 2026-06-27 widening the set to {mobile, desktop}
-- (explicit, documented override) since desktop is the only LIVE human signer and a fast signature on ANY
-- human channel is the rubber-stamp risk. 'auto' (no human signature) ⇒ both columns NULL (conservative).
begin;
select plan(15);

-- the named producer exists
select has_function('gov', 'fn_signature_quality', 'gov.fn_signature_quality exists (named §14 producer)');

-- the umbral is read BY NAME from Config_Knobs (§3.8), at the [C] engineering default
select is(catalog.knob_required_num('rubber_stamp_max_sec'), 30::numeric, 'rubber_stamp_max_sec knob = 30 (seed, by name)');

-- fast DESKTOP human sign (10s < 30) ⇒ time computed AND flagged (Leo-ratified: desktop in quick-sign set)
select is((select time_to_signature_sec from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:00+00', timestamptz '2026-06-27 12:00:10+00', 'desktop')),
          10, 'desktop 10s ⇒ time_to_signature_sec = 10');
select is((select rubber_stamp_flag from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:00+00', timestamptz '2026-06-27 12:00:10+00', 'desktop')),
          true, 'desktop fast (<30s) ⇒ rubber_stamp_flag = true');

-- fast MOBILE sign (5s < 30) ⇒ flagged (04 §7 literal channel)
select is((select rubber_stamp_flag from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:00+00', timestamptz '2026-06-27 12:00:05+00', 'mobile')),
          true, 'mobile fast (<30s) ⇒ rubber_stamp_flag = true');

-- slow DESKTOP sign (100s ≥ 30) ⇒ time computed but NOT flagged
select is((select rubber_stamp_flag from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:00+00', timestamptz '2026-06-27 12:01:40+00', 'desktop')),
          false, 'desktop slow (100s ≥ 30) ⇒ rubber_stamp_flag = false');

-- boundary: exactly the umbral (30s) is NOT < 30 ⇒ false (strict <)
select is((select rubber_stamp_flag from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:00+00', timestamptz '2026-06-27 12:00:30+00', 'desktop')),
          false, 'exactly 30s (== umbral) ⇒ rubber_stamp_flag = false (strict <)');

-- §14/§7: no human signature (signed_at NULL, e.g. origin='auto' auto-dispatch) ⇒ BOTH columns NULL
select is((select time_to_signature_sec from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:00+00', null, 'auto')),
          null, 'no signature ⇒ time_to_signature_sec NULL (not measured)');
select is((select rubber_stamp_flag from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:00+00', null, 'auto')),
          null, 'no signature ⇒ rubber_stamp_flag NULL (not measured)');

-- §14/§7 (Codex P1): origin='auto' (the AI acted ALONE) ⇒ both columns NULL EVEN WITH non-null timestamps.
-- 'auto' is not a human quick-sign channel, so there is no signature to score; the producer must NOT
-- fabricate a flag=false ("measured & clean") for an action that never had a human signature. The function
-- self-enforces this (fail-closed for any non-human origin) — it does not rely on callers passing NULLs.
select is((select time_to_signature_sec from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:00+00', timestamptz '2026-06-27 12:00:05+00', 'auto')),
          null, 'auto + non-null timestamps ⇒ time_to_signature_sec NULL (AI acted alone, no signature)');
select is((select rubber_stamp_flag from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:00+00', timestamptz '2026-06-27 12:00:05+00', 'auto')),
          null, 'auto + non-null timestamps ⇒ rubber_stamp_flag NULL (never fabricate false for an unsigned action)');

-- rounding boundary (Codex P2): a 29.6s sign is genuinely < 30, so it MUST be flagged — the comparison
-- uses the RAW elapsed, not ::integer (which would round 29.6→30 and wrongly clear the flag). Stored = floor.
select is((select rubber_stamp_flag from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:00+00', timestamptz '2026-06-27 12:00:29.6+00', 'desktop')),
          true, '29.6s (< 30 raw) ⇒ rubber_stamp_flag = true (rounding never flips the boundary)');
select is((select time_to_signature_sec from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:00+00', timestamptz '2026-06-27 12:00:29.6+00', 'desktop')),
          29, '29.6s ⇒ time_to_signature_sec = 29 (floor, never rounds up past the umbral)');

-- clock skew (signed before proposed) clamps to 0 ⇒ instant sign ⇒ flagged on a human channel
select is((select time_to_signature_sec from gov.fn_signature_quality(
            timestamptz '2026-06-27 12:00:10+00', timestamptz '2026-06-27 12:00:00+00', 'desktop')),
          0, 'negative skew clamps time_to_signature_sec to 0');

-- §3.8 fail-closed: a missing umbral knob RAISES on the human path (never a silent default). The DELETE is
-- rolled back with the whole test tx; it runs LAST so the knob-dependent assertions above already passed.
delete from catalog."Config_Knobs" where key = 'rubber_stamp_max_sec';
select throws_ok(
  $$ select * from gov.fn_signature_quality(timestamptz '2026-06-27 12:00:00+00', timestamptz '2026-06-27 12:00:01+00', 'desktop') $$,
  'P0001',
  'Config_Knobs missing required knob: rubber_stamp_max_sec',
  'missing umbral knob ⇒ fail-closed raise (§3.8)');

select * from finish();
rollback;
