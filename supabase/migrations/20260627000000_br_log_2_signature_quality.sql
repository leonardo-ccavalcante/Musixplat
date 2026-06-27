-- 02:BR-LOG-2 (04 §7 / §14 / §3.8) — signature-quality scorer: the NAMED, deterministic producer that
-- fills gov."Decision_Trace"'s two reserved RESULT columns (time_to_signature_sec, rubber_stamp_flag).
-- Both are DEFAULT NULL (§14: NULL pre-run; ONLY this producer writes a non-null value, never seeded).
-- Decision_Trace is APPEND-ONLY, so the writers call this inline at INSERT time — the score is set once,
-- at the trace's birth, and never mutated. Deterministic SQL, no LLM (§2). The umbral is read BY NAME via
-- catalog.knob_required_num (§3.8, fail-closed: a missing knob RAISES, never a silent default).
--
-- Rule (04 §7): rubber_stamp_flag = (time_to_signature_sec < umbral AND origin is a human quick-sign
-- channel). 04 §7 literal says origin='movil' ONLY; Leo ratified 2026-06-27 widening the quick-sign set to
-- {mobile, desktop} — an EXPLICIT, documented override of the mobile-only literal — because 'desktop' is the
-- only LIVE human signer today (recordRelease) and a fast signature on ANY human channel is the rubber-stamp
-- risk. 'auto' (the AI acted alone, no human signature) is excluded ⇒ both columns stay NULL (§7 conservative).
--
-- time_to_signature_sec = signed_at − proposed_at, where proposed_at = NBA_Proposal.created_at (when the AI
-- proposed) and signed_at = the release moment (now() at recordRelease). No signature (signed_at NULL) ⇒ both
-- NULL, and the knob is not read on that path.

-- §3.8 umbral knob (mirrored in seed.sql so resetDb/test paths have it). [C] engineering default; Leo
-- ratifies the number in the cockpit, like the nba_* action knobs. Idempotent for the hosted full-reset path.
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('rubber_stamp_max_sec', '30', '[C]', 'leo')
on conflict (key) do nothing;

create or replace function gov.fn_signature_quality(
  p_proposed_at timestamptz,
  p_signed_at   timestamptz,
  p_origin      public.trace_origin
) returns table(time_to_signature_sec integer, rubber_stamp_flag boolean)
language plpgsql stable as $$
declare v_elapsed numeric;  -- raw non-negative elapsed seconds (fractional, pre-rounding)
begin
  -- No human signature ⇒ not measured (§14/§7 conservative): leave BOTH columns NULL and never read the
  -- umbral knob on this path. Two no-signature cases: a missing timestamp, OR origin='auto' (the AI acted
  -- ALONE — there is no human signature event to score). ONLY a human quick-sign channel {mobile,desktop}
  -- with both timestamps present is measured; the producer self-enforces this, fail-closed for ANY future
  -- non-human origin (not just 'auto') — never fabricate a flag=false for an action that was never signed.
  if p_signed_at is null or p_proposed_at is null
     or p_origin not in ('mobile'::public.trace_origin, 'desktop'::public.trace_origin) then
    time_to_signature_sec := null;
    rubber_stamp_flag := null;
    return next;
    return;
  end if;
  -- Clamp clock skew to a non-negative gap (an instant sign is the strongest rubber-stamp signal).
  v_elapsed := greatest(0, extract(epoch from (p_signed_at - p_proposed_at)));
  -- Store the FLOOR (whole-second count that never rounds UP past the umbral). Compare the RAW elapsed
  -- against the knob — NOT the stored integer: a 29.6s sign is genuinely < 30, but ::integer rounds it to 30
  -- and would wrongly clear the flag at the boundary (half a second of clock noise must not flip a §7 verdict).
  time_to_signature_sec := floor(v_elapsed)::integer;
  -- origin is guaranteed ∈ {mobile,desktop} by the no-signature guard above, so the verdict is purely the
  -- raw-elapsed-vs-umbral test (the origin AND is now enforced upstream, fail-closed — see the guard).
  rubber_stamp_flag := (v_elapsed < catalog.knob_required_num('rubber_stamp_max_sec'));
  return next;
  return;
end;
$$;

comment on function gov.fn_signature_quality(timestamptz, timestamptz, public.trace_origin) is
  '02:BR-LOG-2 (04 §7/§14/§3.8) — deterministic signature-quality producer for gov."Decision_Trace": '
  'time_to_signature_sec = signed_at−proposed_at, rubber_stamp_flag = (that < knob rubber_stamp_max_sec, '
  'read by name, AND origin in {mobile,desktop}). No signature ⇒ both NULL. Called inline by recordRelease.';
