-- 02:DETAIL-B — per-action OPERATION history. COMPANY-WIDE (Leo 2026-06-19: empresa inteira — action
-- reliability is validated knowledge about the POLICY, flows across pools · 04 §7/§8). Derived (no table).
-- Deterministic (§6). §14: counts are real; acerto_rate is NULL when there is no breach-class proposal
-- (never a 0-fake). "solid" = the chosen dimension is a breach AND backed by sufficient, non-suppressed
-- evidence (n_min_ok ∧ k_anon_ok); a breach on thin/suppressed data = "unconfirmed" (não-atribuível).
create or replace function cohort.fn_nba_action_history(p_action_code text)
returns table (
  action_code       text,
  run_count         bigint,
  last_run_at       timestamptz,
  solid_count       bigint,
  unconfirmed_count bigint,
  no_data_count     bigint,
  acerto_rate       numeric
)
language sql
stable
as $$
  select
    p_action_code,
    count(*),
    max(created_at),
    count(*) filter (where diagnosis_verdict in ('below','above') and n_min_ok and k_anon_ok),
    count(*) filter (where diagnosis_verdict in ('below','above')
                       and not (coalesce(n_min_ok,false) and coalesce(k_anon_ok,false))),
    count(*) filter (where diagnosis_verdict is null or diagnosis_verdict not in ('below','above')),
    round(
      count(*) filter (where diagnosis_verdict in ('below','above') and n_min_ok and k_anon_ok)::numeric
      / nullif(count(*) filter (where diagnosis_verdict in ('below','above')), 0)
    , 4)
  from gov."NBA_Proposal"
  where action_type = p_action_code;
$$;
