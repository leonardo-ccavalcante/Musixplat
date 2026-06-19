-- E2E spine hardening: preserve cross-tenant/audit boundaries, freeze decided artifacts,
-- record emitted dossiers, and distinguish throughput from team-equivalent leverage.

-- A reset may remove a Diagnosed_Problem while preserving the immutable artifact + decision audit.
alter table gov."Generated_Artifact"
  drop constraint "Generated_Artifact_problem_id_fkey";
alter table gov."Generated_Artifact"
  alter column problem_id drop not null,
  alter column decision_trace_id type uuid using decision_trace_id::uuid,
  add column proposer_id text references gov."User"(user_id),
  add column superseded_at timestamptz,
  add constraint generated_artifact_problem_fk
    foreign key (problem_id) references tenant."Diagnosed_Problem"(problem_id) on delete set null,
  add constraint generated_artifact_decision_state_ck check (
    (status = 'pending_review' and decision_trace_id is null)
    or (status <> 'pending_review' and decision_trace_id is not null)
  );

create index generated_artifact_active_tenant_idx
  on gov."Generated_Artifact"(tenant_id, created_at desc)
  where superseded_at is null;

-- One artifact has one terminal human decision. The audit row remains append-only.
create unique index artifact_decision_one_per_artifact_uidx
  on gov."Artifact_Decision"(artifact_id);
alter table gov."Generated_Artifact"
  add constraint generated_artifact_decision_trace_fk
  foreign key (decision_trace_id) references gov."Artifact_Decision"(decision_id);

-- Dossier is still derived, but emission is a real producer event used by the health read surface.
alter table tenant."Diagnosed_Problem"
  add column dossier_emitted_at timestamptz;

-- Keep the legacy ratio_1_10 column as the team-equivalent result. units_per_touch is a separate
-- throughput signal so a 47-unit batch is never presented as "47 people replaced".
alter table gov."ROI_Operator"
  add column units_per_touch numeric,
  add column tickets_per_day numeric,
  add column relationships_covered integer,
  add column sla_hours numeric,
  add column escalation_rate numeric,
  add column projected_human_minutes numeric,
  add column baseline_team_size integer;

create or replace function gov.fn_roi_1_10(p_tenant text) returns void
language plpgsql as $$
declare
  v_units              int;
  v_escal              int;
  v_reviews            int;
  v_touches            int;
  v_units_per_touch    numeric;
  v_escalation_rate    numeric;
  v_tickets_day        numeric := catalog.knob_required_num('baseline_tickets_per_day');
  v_team_size          int := catalog.knob_required_num('baseline_team_size');
  v_available_minutes  numeric := catalog.knob_required_num('operator_available_minutes');
  v_manual_aht         numeric := catalog.knob_required_num('aht_human_touch_minutes');
  v_ai_aht             numeric := catalog.knob_required_num('aht_ai_absorbed_minutes');
  v_sla_hours          numeric := catalog.knob_required_num('sla_target_hours');
  v_projected_minutes  numeric;
  v_team_equivalent    numeric;
begin
  select count(distinct a.restaurant_id) into v_units
    from tenant."Affected" a
    join tenant."Diagnosed_Problem" p on p.problem_id = a.problem_id
   where p.tenant_id = p_tenant and p.status <> 'resolved';

  select count(*) into v_escal
    from tenant."Diagnosed_Problem"
   where tenant_id = p_tenant and status in ('needs_human', 'blocked');

  select count(*) into v_reviews
    from gov."Artifact_Decision" d
    join gov."Generated_Artifact" a on a.artifact_id = d.artifact_id
   where d.tenant_id = p_tenant and a.superseded_at is null;

  v_touches := coalesce(v_escal, 0) + coalesce(v_reviews, 0);
  v_units_per_touch := case when v_touches > 0
    then round(v_units::numeric / v_touches, 2) else null end;
  v_escalation_rate := case when v_units > 0
    then least(1, v_touches::numeric / v_units) else null end;

  -- Project the observed escalation rate onto the explicit brief baseline. This answers whether one
  -- operator can cover the same X tickets/day as the traditional team within one workday.
  v_projected_minutes := case when v_escalation_rate is null then null else
    round(v_tickets_day * (
      (1 - v_escalation_rate) * v_ai_aht + v_escalation_rate * v_manual_aht
    ), 2) end;
  v_team_equivalent := case
    when v_touches = 0 or v_projected_minutes is null or v_projected_minutes <= 0 then null
    else round(v_team_size * least(1, v_available_minutes / v_projected_minutes), 2)
  end;

  insert into gov."ROI_Operator"(
    roi_id, tenant_id, ratio_1_10, units_per_touch, tickets_per_day,
    relationships_covered, sla_hours, escalation_rate, projected_human_minutes,
    baseline_team_size, is_attributable, attribution_method, result_signal, freshness_ts
  ) values (
    'ROI-' || p_tenant, p_tenant, v_team_equivalent, v_units_per_touch, v_tickets_day,
    v_units, v_sla_hours, v_escalation_rate, v_projected_minutes,
    v_team_size, false, 'capacity_projection', 'operator_efficiency_provisional', now()
  )
  on conflict (roi_id) do update set
    ratio_1_10 = excluded.ratio_1_10,
    units_per_touch = excluded.units_per_touch,
    tickets_per_day = excluded.tickets_per_day,
    relationships_covered = excluded.relationships_covered,
    sla_hours = excluded.sla_hours,
    escalation_rate = excluded.escalation_rate,
    projected_human_minutes = excluded.projected_human_minutes,
    baseline_team_size = excluded.baseline_team_size,
    is_attributable = false,
    attribution_method = excluded.attribution_method,
    result_signal = excluded.result_signal,
    freshness_ts = excluded.freshness_ts;
end;
$$;
