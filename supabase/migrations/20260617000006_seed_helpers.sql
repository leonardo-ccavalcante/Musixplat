-- Deterministic generation helper (used by seed.sql + the multi-instance generator later).
-- Pure/immutable: same (key, salt, hi) ⇒ same int in [0, hi). hashtextextended is stable.
create or replace function public.det_int(p_key text, p_salt integer, p_hi integer)
returns integer language sql immutable as $$
  select (((hashtextextended(p_key, p_salt::bigint) % p_hi) + p_hi) % p_hi)::integer;
$$;
