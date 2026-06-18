-- Gov zone (04 §3.3): governance/audit, append-only. Slice-01 needs User (operator_id,
-- scope_owner_ref, dev-login) and a minimal ROI_Operator (read-only by the money panel F-3.1).

-- User: the actor that governs the AI. tenant_id (pool) is the RLS frontier; resolved
-- server-side, never from the client (04 §7).
create table gov."User" (
  user_id text primary key,
  tenant_id  text        not null,
  org_level  public.org_level not null,
  manager_id text references gov."User"(user_id),
  role        text        not null default 'agent_manager_senior'
);
create index user_tenant_idx on gov."User"(tenant_id);

-- ROI_Operator (minimal): the money panel (F-3.1) LINKS to this; it is produced by P02/P03,
-- never by slice-01. Left empty ⇒ panel renders the conservative "no-confiable/0" state (§14).
-- All value columns are RESULTS (NULL pre-run): is_attributable, ratio_1_10, etc.
create table gov."ROI_Operator" (
  roi_id                       text primary key,
  tenant_id                    text not null,
  restaurant_id               text,
  attributable_business_impact   text,
  is_attributable                boolean default null,
  ratio_1_10                   numeric default null,
  attribution_method            text,
  result_signal          text,
  freshness_ts                 timestamptz default null
);
create index roi_tenant_idx on gov."ROI_Operator"(tenant_id);
