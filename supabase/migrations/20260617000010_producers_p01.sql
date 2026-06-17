-- P01 deterministic producers (04 §6/§14). Math lives in SQL (CLAUDE.md §1); orchestration in
-- TS (server/jobs/p01.ts). Every function reads thresholds BY NAME, stamps cohort_rule_version
-- per row, and computes RESULTS from brutos — never seeds a number. Determinism: same brutos +
-- same (semana, ref_date) ⇒ identical output.

-- Business metric (recurrencia proxy) from Orden, windowed on the week (28d) so consecutive
-- snapshots differ — deterministic, reused by ranking/baselines. recurrencia is COMPUTED from
-- Orden, never a column (04 §14 denylist).
create or replace function cohort.fn_recurrencia(p_rest text, p_semana date)
returns integer language sql stable as $$
  select count(*)::integer from tenant."Orden"
  where restaurante_id = p_rest and status_pago = 'ok'
    and fecha > p_semana - 28 and fecha <= p_semana;
$$;

create or replace function cohort.fn_ticket_medio(p_rest text, p_semana date)
returns numeric language sql stable as $$
  select coalesce(round(avg(valor_neto), 2), 0) from tenant."Orden"
  where restaurante_id = p_rest and status_pago = 'ok'
    and fecha > p_semana - 28 and fecha <= p_semana;
$$;

-- F-1.1 — deterministic cell+subgroup assignment, version-stamped. tenure from fecha_alta vs
-- Config borders (BY NAME) relative to p_ref_date (deterministic, never wall-clock). fecha_alta
-- null/future ⇒ conservative (no assignment), never a silent default.
create or replace function cohort.fn_assign_cohorts(p_semana date, p_ref_date date)
returns void language plpgsql as $$
declare
  v_version text := catalog.perilla_text('cohort_rule_version_vigente');
  b1 int := catalog.perilla_required_num('tenure_border_1_months');
  b2 int := catalog.perilla_required_num('tenure_border_2_months');
  b3 int := catalog.perilla_required_num('tenure_border_3_months');
begin
  update tenant."Restaurante"
    set tenure_actual = (extract(year from age(p_ref_date, fecha_alta)) * 12
                         + extract(month from age(p_ref_date, fecha_alta)))::int
    where fecha_alta is not null and fecha_alta <= p_ref_date;

  insert into cohort."Cohort"(cohort_id, tenure_bucket, tier_base, cohort_rule_version)
  select distinct r.tier_base || '_' || g.bucket || '_' || v_version,
                  g.bucket::public.tenure_bucket, r.tier_base, v_version
  from tenant."Restaurante" r
  cross join lateral (select case when r.tenure_actual < b1 then '0-3m'
                                  when r.tenure_actual < b2 then '3-6m'
                                  when r.tenure_actual < b3 then '6-12m'
                                  else '12m+' end as bucket) g
  where r.tenure_actual is not null
  on conflict (tenure_bucket, tier_base, cohort_rule_version) do nothing;

  insert into cohort."Subgrupo"(subgrupo_id, cohort_id, label)
  select cohort_id || '_sg', cohort_id, 'all' from cohort."Cohort"
  where cohort_rule_version = v_version
  on conflict (subgrupo_id) do nothing;

  insert into cohort."Pertenencia_Cohort_Snapshot"
    (restaurante_id, cohort_id, subgrupo_id, semana, cohort_rule_version, provenance)
  select r.restaurante_id, c.cohort_id, c.cohort_id || '_sg', p_semana, v_version, '[V]'
  from tenant."Restaurante" r
  cross join lateral (select case when r.tenure_actual < b1 then '0-3m'
                                  when r.tenure_actual < b2 then '3-6m'
                                  when r.tenure_actual < b3 then '6-12m'
                                  else '12m+' end as bucket) g
  join cohort."Cohort" c on c.tier_base = r.tier_base
                        and c.tenure_bucket = g.bucket::public.tenure_bucket
                        and c.cohort_rule_version = v_version
  where r.tenure_actual is not null
  on conflict (restaurante_id, cohort_id, semana, cohort_rule_version) do nothing;
end;
$$;

-- F-1.2 — ranking: percentil + gap_hasta_top per account; Cohort.n_cuentas + atribucion baseline.
create or replace function cohort.fn_rank_cohort(p_semana date)
returns void language plpgsql as $$
declare v_version text := catalog.perilla_text('cohort_rule_version_vigente');
begin
  with metric as (
    select p.snapshot_id, p.cohort_id, cohort.fn_recurrencia(p.restaurante_id, p_semana) as m
    from cohort."Pertenencia_Cohort_Snapshot" p
    where p.semana = p_semana and p.cohort_rule_version = v_version
  ), ranked as (
    select snapshot_id, m,
           percent_rank() over (partition by cohort_id order by m) as pr,
           max(m) over (partition by cohort_id) as top_m
    from metric
  )
  update cohort."Pertenencia_Cohort_Snapshot" p
    set percentil_en_cohort = round((r.pr * 100)::numeric, 2),
        gap_hasta_top = (r.top_m - r.m),
        freshness_ts = now()
  from ranked r where r.snapshot_id = p.snapshot_id;

  update cohort."Cohort" c
    set n_cuentas = agg.n,
        baseline_atribucion_segmento = jsonb_build_object('avg_metric', agg.avg_m, 'top_metric', agg.top_m),
        freshness_ts = now()
  from (
    select p.cohort_id, count(*) n,
           round(avg(cohort.fn_recurrencia(p.restaurante_id, p_semana)), 2) avg_m,
           max(cohort.fn_recurrencia(p.restaurante_id, p_semana)) top_m
    from cohort."Pertenencia_Cohort_Snapshot" p
    where p.semana = p_semana and p.cohort_rule_version = v_version
    group by p.cohort_id
  ) agg where agg.cohort_id = c.cohort_id;
end;
$$;

-- F-1.3 — n_min gate (significance, SEPARATE from k-anon). Threshold BY NAME. Boundary defined:
-- n_cuentas >= n_min ⇒ ok; below ⇒ collapse to qualitative mode.
create or replace function cohort.fn_gate_n_min(p_semana date, p_version text default null)
returns void language plpgsql as $$
declare
  v_version text := coalesce(p_version, catalog.perilla_text('cohort_rule_version_vigente'));
  v_nmin numeric := catalog.perilla_required_num('n_min_threshold');
begin
  update cohort."Cohort" c set colapsada = (c.n_cuentas is null or c.n_cuentas < v_nmin)
    where c.cohort_rule_version = v_version;

  update cohort."Pertenencia_Cohort_Snapshot" p
    set n_min_ok = (c.n_cuentas is not null and c.n_cuentas >= v_nmin),
        modo = case when (c.n_cuentas is not null and c.n_cuentas >= v_nmin)
                    then 'percentil'::public.modo_percentil
                    else 'cualitativo_sin_percentil'::public.modo_percentil end
  from cohort."Cohort" c
  where p.cohort_id = c.cohort_id and p.semana = p_semana and p.cohort_rule_version = v_version;
end;
$$;

-- F-1.3b — k-anon gate at the OUTPUT frontier (re-identification, SEPARATE from n_min). Threshold
-- BY NAME. fail-closed: indeterminate count ⇒ suppress.
create or replace function cohort.fn_gate_k_anon(p_version text default null)
returns void language plpgsql as $$
declare
  v_version text := coalesce(p_version, catalog.perilla_text('cohort_rule_version_vigente'));
  v_k numeric := catalog.perilla_required_num('k_anon_threshold');
begin
  update cohort."Cohort" c
    set supresion_k_aplicada = (c.n_cuentas is null or c.n_cuentas < v_k)  -- fail-closed
    where c.cohort_rule_version = v_version;
end;
$$;

-- F-1.4 — P90+ aggregation → baseline_descriptivo (top vs base by canonical dimensions).
-- Respects k-anon: suppressed cells get a conservative empty descriptor.
create or replace function cohort.fn_baseline_descriptivo(p_semana date)
returns void language plpgsql as $$
declare
  v_version text := catalog.perilla_text('cohort_rule_version_vigente');
  v_p90 numeric := catalog.perilla_required_num('p90_percentil_corte');
begin
  update cohort."Cohort" c set baseline_descriptivo = sub.bd
  from (
    select p.cohort_id,
      jsonb_build_object(
        'dimensions', jsonb_build_array('avg_metric','avg_ticket'),
        'top', jsonb_build_object(
           'n', count(*) filter (where p.percentil_en_cohort >= v_p90),
           'avg_metric', round(coalesce(avg(cohort.fn_recurrencia(p.restaurante_id, p_semana))
                              filter (where p.percentil_en_cohort >= v_p90),0),2),
           'avg_ticket', round(coalesce(avg(cohort.fn_ticket_medio(p.restaurante_id, p_semana))
                              filter (where p.percentil_en_cohort >= v_p90),0),2)),
        'base', jsonb_build_object(
           'n', count(*) filter (where p.percentil_en_cohort < v_p90),
           'avg_metric', round(coalesce(avg(cohort.fn_recurrencia(p.restaurante_id, p_semana))
                              filter (where p.percentil_en_cohort < v_p90),0),2),
           'avg_ticket', round(coalesce(avg(cohort.fn_ticket_medio(p.restaurante_id, p_semana))
                              filter (where p.percentil_en_cohort < v_p90),0),2))
      ) as bd
    from cohort."Pertenencia_Cohort_Snapshot" p
    where p.semana = p_semana and p.cohort_rule_version = v_version
    group by p.cohort_id
  ) sub
  where sub.cohort_id = c.cohort_id and coalesce(c.supresion_k_aplicada, true) = false;
end;
$$;

-- F-1.8 — valor_actual_kpi per KPI into baseline_descriptivo (Named_Query, deterministic SQL).
create or replace function cohort.fn_baseline_kpi(p_semana date)
returns void language plpgsql as $$
declare v_version text := catalog.perilla_text('cohort_rule_version_vigente');
begin
  update cohort."Cohort" c
    set baseline_descriptivo = coalesce(c.baseline_descriptivo, '{}'::jsonb)
        || jsonb_build_object('valor_actual_kpi',
             jsonb_build_object('kpi_recurrencia', sub.v))
  from (
    select p.cohort_id, round(avg(cohort.fn_ticket_medio(p.restaurante_id, p_semana)), 2) v
    from cohort."Pertenencia_Cohort_Snapshot" p
    where p.semana = p_semana and p.cohort_rule_version = v_version
    group by p.cohort_id
  ) sub
  where sub.cohort_id = c.cohort_id and coalesce(c.supresion_k_aplicada, true) = false;
end;
$$;

-- F-1.7 — UPSIDE = f(brecha × n_base) projection [C] (never ascends to [V]). NULL if no baseline.
create or replace function cohort.fn_upside(p_version text default null)
returns void language plpgsql as $$
declare v_version text := coalesce(p_version, catalog.perilla_text('cohort_rule_version_vigente'));
begin
  update cohort."Cohort" c
    set oportunidad_valor = round(
          ((c.baseline_descriptivo->'top'->>'avg_metric')::numeric
           - (c.baseline_descriptivo->'base'->>'avg_metric')::numeric)
          * (c.baseline_descriptivo->'base'->>'n')::numeric, 2)
    where c.cohort_rule_version = v_version
      and c.baseline_descriptivo ? 'top' and c.baseline_descriptivo ? 'base';
end;
$$;
