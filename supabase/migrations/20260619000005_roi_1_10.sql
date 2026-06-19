-- 1:10 leverage producer (04 §12) — DERIVES gov.ROI_Operator.ratio_1_10 from PRODUCED counts, never
-- hard-coded (§14). The operator's leverage = units the AI processed (distinct affected restaurants) per
-- unit of HUMAN touch (artifact decisions + escalated/degraded problems). FAIL-CLOSED: zero human touches
-- ⇒ ratio NULL (no human baseline to express a ratio against). Invariant: more escalations/reviews ⇒ more
-- touches ⇒ ratio FALLS. is_attributable stays FALSE — this is operator EFFICIENCY, not the 2-gate
-- confirmed business impact (no D-day permanence window in the prototype, BR-DE2); money.summary stays
-- conservative. AHT knob read BY NAME (§3.8) for the minutes the health surface displays. Deterministic SQL,
-- never an LLM number (§3.6).
create or replace function gov.fn_roi_1_10(p_tenant text) returns void
language plpgsql as $$
declare
  v_units   int;   -- distinct affected restaurants the AI worked across this pool's problems
  v_escal   int;   -- problems that fell to a human (escalated / degraded)
  v_reviews int;   -- artifact decisions = human review touches
  v_touches int;
  v_ratio   numeric;
begin
  select count(distinct a.restaurant_id) into v_units
    from tenant."Affected" a
    join tenant."Diagnosed_Problem" p on p.problem_id = a.problem_id
   where p.tenant_id = p_tenant;

  select count(*) into v_escal
    from tenant."Diagnosed_Problem"
   where tenant_id = p_tenant and status in ('needs_human', 'blocked');

  select count(*) into v_reviews from gov."Artifact_Decision" where tenant_id = p_tenant;

  v_touches := coalesce(v_escal, 0) + coalesce(v_reviews, 0);
  v_ratio := case when v_touches > 0 then round(v_units::numeric / v_touches, 2) else null end;

  insert into gov."ROI_Operator"(roi_id, tenant_id, ratio_1_10, is_attributable, attribution_method, result_signal, freshness_ts)
  values ('ROI-' || p_tenant, p_tenant, v_ratio, false, 'count_based', 'operator_efficiency_provisional', now())
  on conflict (roi_id) do update
     set ratio_1_10 = excluded.ratio_1_10,
         is_attributable = false,
         attribution_method = excluded.attribution_method,
         result_signal = excluded.result_signal,
         freshness_ts = excluded.freshness_ts;
end;
$$;
