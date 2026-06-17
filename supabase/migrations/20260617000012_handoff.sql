-- F-5.5 + F-5.2 (04 §3/§14). scope_owner_ref annotation + the único mutante handoff.

-- F-5.5 — annotate scope_owner_ref {dueno_id, nivel} from the pool's operador. Deterministic;
-- dueno validated against gov.Usuario (never an arbitrary client value).
create or replace function cohort.fn_annotate_scope(p_semana date)
returns void language plpgsql as $$
declare v_version text := catalog.perilla_text('cohort_rule_version_vigente');
begin
  update cohort."Pertenencia_Cohort_Snapshot" p
    set scope_owner_ref = jsonb_build_object('dueno_id', o.usuario_id, 'nivel', o.nivel_org)
  from tenant."Restaurante" r
  cross join lateral (
    select usuario_id, nivel_org from gov."Usuario" where tenant_id = r.tenant_id
    order by usuario_id limit 1
  ) o
  where p.restaurante_id = r.restaurante_id
    and p.semana = p_semana and p.cohort_rule_version = v_version;
end;
$$;

-- F-5.2 — handoff: emit EXACTLY ONE Evento_Priorizado_NBA + append Evento_Uso, atomically.
-- tenant resolved server-side (p_tenant from the session, never the body). Cross-pool ⇒ abort.
-- Idempotent on double-click via the natural key. risk_class is NOT born here (born in P02).
-- Payload carries {cohort_id, restaurante_id} to match 02:1A TRIGGER-IN.
create or replace function cohort.fn_handoff(
  p_restaurante text, p_cohort text, p_subgrupo text, p_semana date,
  p_operador text, p_tenant text
) returns cohort."Evento_Priorizado_NBA" language plpgsql as $$
declare
  v_rest_tenant text;
  v_snap cohort."Pertenencia_Cohort_Snapshot";
  v_event cohort."Evento_Priorizado_NBA";
begin
  -- cross-pool guard (04 §7): restaurante must belong to the operator's pool.
  select tenant_id into v_rest_tenant from tenant."Restaurante" where restaurante_id = p_restaurante;
  if v_rest_tenant is null or v_rest_tenant <> p_tenant then
    raise exception 'cross-pool handoff blocked for % (pool %)', p_restaurante, p_tenant
      using errcode = 'check_violation';
  end if;

  -- fail-closed: no snapshot ⇒ nothing to hand off.
  select * into v_snap from cohort."Pertenencia_Cohort_Snapshot"
   where restaurante_id = p_restaurante and cohort_id = p_cohort and semana = p_semana
   order by snapshot_id desc limit 1;
  if v_snap.snapshot_id is null then
    raise exception 'no snapshot to hand off' using errcode = 'no_data_found';
  end if;

  insert into cohort."Evento_Priorizado_NBA"
    (restaurante_id, cohort_id, subgrupo_id, semana, percentil_en_cohort, gap_hasta_top,
     n_min_ok, freshness_ts, modo, cohort_rule_version, scope_owner_ref, operador_id, handoff_ts)
  values (p_restaurante, p_cohort, coalesce(p_subgrupo, v_snap.subgrupo_id), p_semana,
     v_snap.percentil_en_cohort, v_snap.gap_hasta_top, v_snap.n_min_ok, v_snap.freshness_ts,
     v_snap.modo, v_snap.cohort_rule_version, v_snap.scope_owner_ref, p_operador, now())
  on conflict (restaurante_id, cohort_id, semana, cohort_rule_version) do update
    set operador_id = excluded.operador_id, handoff_ts = excluded.handoff_ts
  returning * into v_event;

  insert into tenant."Evento_Uso"(restaurante_id, usuario_id, feature, tipo_evento, payload)
  values (p_restaurante, p_operador, 'cohorts', 'handoff',
    jsonb_build_object('evento_id', v_event.evento_id, 'cohort_id', p_cohort,
                       'restaurante_id', p_restaurante,
                       'cohort_rule_version', v_event.cohort_rule_version));

  return v_event;
end;
$$;
