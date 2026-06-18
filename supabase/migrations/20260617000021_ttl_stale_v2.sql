-- Chunk 6a — F-6/BR-12/EC-9/EC-12 TTL + staleness. A computed value is STALE when its freshness_ts
-- is older than TTL_baseline_days (knob, BY NAME) relative to "now". fail-closed: NULL freshness ⇒
-- stale (treat unknown freshness as not-fresh, degrade to qualitative/link rather than trust it).
-- p_now is a PARAMETER (deterministic in tests; the read layer passes now()).
create or replace function cohort.fn_is_stale(p_freshness timestamptz, p_now timestamptz)
returns boolean language plpgsql stable as $$
declare v_ttl numeric := catalog.knob_required_num('TTL_baseline_days');
begin
  return p_freshness is null or p_freshness < (p_now - make_interval(days => v_ttl::int));
end;
$$;
