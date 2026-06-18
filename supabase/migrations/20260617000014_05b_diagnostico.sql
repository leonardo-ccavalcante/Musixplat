-- 05B Diagnóstico foundation DDL (orquestador + subagentes). 04 §3 / §7 / §8 / §14.
-- DDL only — Problema/Afetado/Knowledge_Case are NEVER seeded (their rows are produced at
-- runtime by the orchestrator + caza-silenciosos + impacto producers; §14 anti-fake). The only
-- seeded 05B data is the [C] knobs in seed.sql. RLS deferred per 04 §13 (active enforcement =
-- server-side tRPC tenantProcedure guard), matching the existing migrations.
--
-- Design (CLAUDE.md "fat tables by process, don't fragment" + §4 phantom denylist):
--   * Problema_Diagnosticado is the FAT case table — issue_tree / rs_perdido / churn_risk /
--     custo_resolver / valor_ganho / caso_repo all live here (jsonb or column), matching the
--     breakdown_CODE_AGENT contracts (B.1.3, B.5.1, B.5.3, B.6.2).
--   * Afetado is the only child table — the anti-join (caza-silenciosos) producer output.
--   * DOSSIER #8 is a derived VIEW (v_dossier_handoff), NOT a table (§4: derived ⇒ view).
--   * Math (anti-join, rs_perdido) lives in SQL functions; TS only orchestrates (§3.6).

-- ── Problema_Diagnosticado (04 §3): one row per diagnosed case. tenant_id is the RLS frontier
--    (BR-B6). RESULT columns are NULL pre-run (§14): only a named producer fills them. ──────
create table tenant."Problema_Diagnosticado" (
  problema_id          uuid primary key default gen_random_uuid(),
  tenant_id            text not null,                                       -- pool / RLS frontier (US-B1.1.1)
  restaurante_id       text not null references tenant."Restaurante"(restaurante_id),
  conversa_id          text,                                               -- origin episodio (05A); null on proactive
  criticidad           text,                                               -- trigger hint (grave|...) — bruto, nullable
  estado               text not null default 'abierto',                    -- conservative default (abierto|bloqueado|degrade_humano|resuelto)
  frecuencia           integer not null default 1,                         -- count, incremented by B.1.3 (computed)
  tipo_area            text,                                               -- RESULT §14 — B.2 classifier (NULL pre-run)
  raiz_hipotese        text,                                               -- RESULT §14 — B.3 issue-tree validated
  confianza            numeric,                                            -- RESULT [C] — B.2/B.3
  issue_tree           jsonb,                                              -- RESULT §14 — B.3 ranked paths
  rs_perdido           numeric,                                            -- RESULT §14 — B.5.1 Named_Query
  churn_risk           numeric,                                            -- RESULT §14 — B.5.1 (NULL if no pre-churn producer = fail-closed)
  custo_resolver       numeric,                                            -- RESULT §14 — B.5.3 ledger
  valor_ganho          numeric,                                            -- RESULT §14 — B.5.3 ledger
  caso_repo            jsonb,                                              -- RESULT §14 — B.6.2 replicable case (jsonb sub-object, §4 not a table)
  ruta_sugerida        text,                                               -- RESULT §14 — B.6.1 router stub
  links_similares      jsonb not null default '[]'::jsonb,                 -- KB links (dossier #7/#8)
  silenciosos_estado   text,                                               -- RESULT — US-B1.3.1 reconcile flag (evaluable|no_evaluable)
  primera_vez_ts       timestamptz not null default now(),
  ultima_vez_ts        timestamptz,                                        -- RESULT — bumped by B.1.3 increment / B.6.2
  provenance_por_campo jsonb not null default '{}'::jsonb                  -- per-field [V]/[I]/[C] (04 §7, BR-B8)
);
create index problema_tenant_idx on tenant."Problema_Diagnosticado"(tenant_id);
create index problema_rest_idx on tenant."Problema_Diagnosticado"(restaurante_id);
-- Dedup natural key (B.1.3, "un caso = un PROBLEMA"): at most ONE open problema per restaurante.
-- B.1.3 does INSERT ... ON CONFLICT (...) WHERE estado='abierto' DO UPDATE frecuencia+1.
create unique index problema_abierto_uniq
  on tenant."Problema_Diagnosticado"(tenant_id, restaurante_id) where estado = 'abierto';

-- ── Afetado (04 §3, §14): caza-silenciosos producer output. NEVER seeded — zero rows pre-run.
--    reclamou/silencioso are RESULTS of the anti-join. k-anon does NOT suppress here (BR-B5:
--    B is internal, resolves the n=1 case); cross-tenant suppression is enforced at the output
--    frontier (BR-B6), not here. ──────────────────────────────────────────────────────────
create table tenant."Afetado" (
  afetado_id     uuid primary key default gen_random_uuid(),
  problema_id    uuid not null references tenant."Problema_Diagnosticado"(problema_id) on delete cascade,
  tenant_id      text not null,                                            -- same pool (BR-B6)
  restaurante_id text not null references tenant."Restaurante"(restaurante_id),
  reclamou       boolean not null,                                         -- RESULT: has a Conversa (opened ticket)
  silencioso     boolean not null,                                         -- RESULT: affected but reclamou=false
  evidencia      bigint references tenant."Orden"(orden_id),               -- the failed order proving impact
  computed_at    timestamptz not null default now(),
  unique (problema_id, restaurante_id)
);
create index afetado_problema_idx on tenant."Afetado"(problema_id);

-- ── Knowledge_Case (04 §3): KB for grounding (BR-B3) + RL guard (BR-B16). Real governance
--    entity (NOT a §4 phantom). Empty pre-run; producers are EPIC-B4 (thin) / FILA. ─────────
create table tenant."Knowledge_Case" (
  kb_case_id      uuid primary key default gen_random_uuid(),
  tenant_id       text not null,
  tipo_area       text not null,
  padrao          text,
  resolucao       text,
  probabilidad    numeric,                                                 -- [C] historical likelihood
  caminho_usado   jsonb,
  links_similares jsonb not null default '[]'::jsonb,
  revisado        boolean not null default false,                         -- BR-B16: pendiente-de-revisión until human RLHF
  created_at      timestamptz not null default now()
);
create index knowledge_case_tipo_idx on tenant."Knowledge_Case"(tenant_id, tipo_area);

-- ── caza-silenciosos (B.5.2b, BR-B4/B5/B6): anti-join. Within ONE tenant + ventana, every
--    restaurante with a fallido Orden is an afetado; those WITHOUT a Conversa (ticket) are the
--    silenciosos. Deterministic, no LLM. Scoped by p_tenant (BR-B6 hard-no cross-tenant) and
--    p_ventana_dias (acotado barrido, B-block-2). Returns rows inserted. ────────────────────
create or replace function tenant.fn_cazar_silenciosos(
  p_problema uuid, p_tenant text, p_ventana_dias integer
) returns integer language plpgsql as $$
declare v_inserted integer;
begin
  insert into tenant."Afetado"(problema_id, tenant_id, restaurante_id, reclamou, silencioso, evidencia)
  select p_problema, r.tenant_id, f.restaurante_id,
         (c.restaurante_id is not null) as reclamou,
         (c.restaurante_id is null)     as silencioso,
         f.evidencia
  from (
    select o.restaurante_id, min(o.orden_id) as evidencia
    from tenant."Orden" o
    join tenant."Restaurante" rr on rr.restaurante_id = o.restaurante_id
    where o.status_pago = 'fallido'
      and rr.tenant_id = p_tenant
      and o.fecha >= (current_date - p_ventana_dias)
    group by o.restaurante_id
  ) f
  join tenant."Restaurante" r on r.restaurante_id = f.restaurante_id
  left join (
    select distinct restaurante_id from tenant."Conversa_Episodio" where tenant_id = p_tenant
  ) c on c.restaurante_id = r.restaurante_id
  on conflict (problema_id, restaurante_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ── impacto rs_perdido (B.5.1, BR-B10): canonical UNIQUE formula
--    rs_perdido = sum(Orden.valor_neto WHERE status_pago='fallido') over the afetado set.
--    churn_risk stays NULL (no pre-churn producer this session = fail-closed, US-B5.1.1).
--    Writes the result + inherits worst provenance [I]. Returns the sum. ────────────────────
create or replace function tenant.fn_impacto_rs_perdido(p_problema uuid)
returns numeric language plpgsql as $$
declare v_total numeric;
begin
  select coalesce(sum(o.valor_neto), 0) into v_total
  from tenant."Orden" o
  where o.status_pago = 'fallido'
    and o.restaurante_id in (
      select restaurante_id from tenant."Afetado" where problema_id = p_problema
    );
  update tenant."Problema_Diagnosticado" p
     set rs_perdido = v_total,
         provenance_por_campo = p.provenance_por_campo || jsonb_build_object('rs_perdido', '[I]')
   where p.problema_id = p_problema;
  return v_total;
end;
$$;

-- ── DOSSIER_HANDOFF #8 (04 §3.4, §4): the 11 fields are DERIVED ⇒ a VIEW, never a table.
--    restaurantes_afetados = count(Afetado) is computed here (US-B1.3.1: never a stored number).
--    The TS completeness gate (US-B6.3.1) refuses to emit when any field is NULL / unprovenanced.
create view tenant.v_dossier_handoff as
select
  p.problema_id,
  p.tenant_id,
  jsonb_build_object('tipo_area', p.tipo_area, 'raiz_hipotese', p.raiz_hipotese,
                     'confianza', p.confianza)                         as f1_tipo_raiz,
  p.issue_tree                                                          as f2_evidencia,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'restaurante_id', a.restaurante_id, 'reclamou', a.reclamou,
            'silencioso', a.silencioso)), '[]'::jsonb)
     from tenant."Afetado" a where a.problema_id = p.problema_id)       as f3_quien,
  (p.caso_repo -> 'onde_concentra')                                     as f4_onde_concentra,
  jsonb_build_object('rs_perdido', p.rs_perdido, 'churn_risk', p.churn_risk,
                     'custo_resolver', p.custo_resolver,
                     'valor_ganho', p.valor_ganho)                      as f5_cuanto,
  jsonb_build_object('frecuencia', p.frecuencia, 'primera_vez_ts', p.primera_vez_ts,
                     'ultima_vez_ts', p.ultima_vez_ts)                  as f6_recurrencia,
  p.links_similares                                                     as f7_casos_similares,
  jsonb_build_object('raiz_hipotese', p.raiz_hipotese, 'confianza', p.confianza) as f8_hipotese_auditable,
  p.ruta_sugerida                                                       as f9_ruta_sugerida,
  (p.caso_repo -> 'dados_crudos')                                       as f10_dados_crudos,
  p.provenance_por_campo                                                as f11_provenance,
  p.estado,
  (select count(*) from tenant."Afetado" a where a.problema_id = p.problema_id) as restaurantes_afetados
from tenant."Problema_Diagnosticado" p;
