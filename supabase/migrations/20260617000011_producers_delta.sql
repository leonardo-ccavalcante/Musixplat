-- Delta / movement / counts / anti-mezcla (04 §3/§6/§14). Deterministic, version-stamped.

-- F-2.2 — diff snapshot_to vs snapshot_from ⇒ Evento_Priorizado_NBA.delta_status. Only accounts
-- with a meaningful delta (or novo/churn) get an event. SAME version only (anti-mezcla); same
-- tenant handled by the read guard. at_risk threshold BY NAME.
create or replace function cohort.fn_diff_delta(p_semana date, p_prev_semana date)
returns void language plpgsql as $$
declare
  v_version text := catalog.perilla_text('cohort_rule_version_vigente');
  v_atrisk numeric := catalog.perilla_required_num('at_risk_percentil_max');
begin
  insert into cohort."Evento_Priorizado_NBA"
    (restaurante_id, cohort_id, subgrupo_id, semana, percentil_en_cohort, gap_hasta_top,
     delta_status, n_min_ok, freshness_ts, modo, cohort_rule_version, scope_owner_ref)
  select cur.restaurante_id, cur.cohort_id, cur.subgrupo_id, cur.semana,
         cur.percentil_en_cohort, cur.gap_hasta_top, d.delta::public.delta_status,
         cur.n_min_ok, now(), cur.modo, cur.cohort_rule_version, cur.scope_owner_ref
  from cohort."Pertenencia_Cohort_Snapshot" cur
  left join cohort."Pertenencia_Cohort_Snapshot" prev
    on prev.restaurante_id = cur.restaurante_id
   and prev.semana = p_prev_semana and prev.cohort_rule_version = v_version
  cross join lateral (select case
      when cohort.fn_recurrencia(cur.restaurante_id, cur.semana) = 0 then 'churn'
      when prev.snapshot_id is null then 'novo'
      when prev.cohort_id <> cur.cohort_id then 'mudou_cohort'
      when cur.percentil_en_cohort > prev.percentil_en_cohort then 'melhorou_percentil'
      when cur.percentil_en_cohort < prev.percentil_en_cohort
           and cur.percentil_en_cohort < v_atrisk then 'at_risk'
      when cur.percentil_en_cohort < prev.percentil_en_cohort then 'baixou_percentil'
      else null end as delta) d
  where cur.semana = p_semana and cur.cohort_rule_version = v_version and d.delta is not null
  on conflict (restaurante_id, cohort_id, semana, cohort_rule_version) do update
    set delta_status = excluded.delta_status,
        percentil_en_cohort = excluded.percentil_en_cohort,
        gap_hasta_top = excluded.gap_hasta_top,
        freshness_ts = excluded.freshness_ts;
end;
$$;

-- F-2.6 — movement log, append-only, version stamped per row. MOVIMIENTO_LOG is absorbed into
-- Evento_Uso (no new table, denylist 04 §4).
create or replace function cohort.fn_log_movimiento(p_semana date)
returns void language plpgsql as $$
declare v_version text := catalog.perilla_text('cohort_rule_version_vigente');
begin
  insert into tenant."Evento_Uso"(restaurante_id, feature, tipo_evento, payload)
  select e.restaurante_id, 'cohorts', 'movimiento',
         jsonb_build_object('delta_status', e.delta_status, 'cohort_id', e.cohort_id,
                            'semana', e.semana, 'cohort_rule_version', e.cohort_rule_version)
  from cohort."Evento_Priorizado_NBA" e
  where e.semana = p_semana and e.cohort_rule_version = v_version and e.delta_status is not null;
end;
$$;

-- F-5.4 / F-3.4 — n_cohort_x_intent: deterministic count of raw tickets per cohort × intent.
-- Cohort dimension DERIVED via join to Pertenencia (producer output). k-anon respected: cells
-- with supresion_k_aplicada are excluded from the cross-tenant output.
create or replace function cohort.fn_cohort_intent_count(p_semana date)
returns table(cohort_id text, intent text, n integer) language sql stable as $$
  select p.cohort_id, ce.intent, count(*)::integer
  from tenant."Conversa_Episodio" ce
  join cohort."Pertenencia_Cohort_Snapshot" p
    on p.restaurante_id = ce.restaurante_id and p.semana = p_semana
  join cohort."Cohort" c on c.cohort_id = p.cohort_id
  where coalesce(c.supresion_k_aplicada, true) = false and ce.intent is not null
  group by p.cohort_id, ce.intent;
$$;

-- F-4.3 — anti-mezcla guard. fail-closed: more than one distinct cohort_rule_version ⇒ raise
-- (never render a mix, 04 §6 / EC-3). The TS read layer logs the blocked attempt to Security_Log.
create or replace function cohort.fn_assert_single_version(p_versions text[])
returns void language plpgsql immutable as $$
begin
  if (select count(distinct v) from unnest(p_versions) v where v is not null) > 1 then
    raise exception 'anti-mezcla: refusing to mix cohort_rule_version: %', p_versions
      using errcode = 'check_violation';
  end if;
end;
$$;
