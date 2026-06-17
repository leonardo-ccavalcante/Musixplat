-- Gov zone (04 §3.3): governance/audit, append-only. Slice-01 needs Usuario (operador_id,
-- scope_owner_ref, dev-login) and a minimal ROI_Operador (read-only by the money panel F-3.1).

-- Usuario: the actor that governs the AI. tenant_id (pool) is the RLS frontier; resolved
-- server-side, never from the client (04 §7).
create table gov."Usuario" (
  usuario_id text primary key,
  tenant_id  text        not null,
  nivel_org  public.nivel_org not null,
  manager_id text references gov."Usuario"(usuario_id),
  rol        text        not null default 'agent_manager_senior'
);
create index usuario_tenant_idx on gov."Usuario"(tenant_id);

-- ROI_Operador (minimal): the money panel (F-3.1) LINKS to this; it is produced by P02/P03,
-- never by slice-01. Left empty ⇒ panel renders the conservative "no-confiable/0" state (§14).
-- All value columns are RESULTS (NULL pre-run): es_atribuible, ratio_1_10, etc.
create table gov."ROI_Operador" (
  roi_id                       text primary key,
  tenant_id                    text not null,
  restaurante_id               text,
  impacto_negocio_atribuible   text,
  es_atribuible                boolean default null,
  ratio_1_10                   numeric default null,
  metodo_atribucion            text,
  signal_de_resultado          text,
  freshness_ts                 timestamptz default null
);
create index roi_tenant_idx on gov."ROI_Operador"(tenant_id);
