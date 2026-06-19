-- 05C EPIC-C1/C3a — Generated_Artifact: the wedge artifact derived from a COMPLETE dossier
-- (tenant.v_dossier_handoff via readDossier). Metric-binding is MANDATORY at creation (BR-C1-3:
-- target_metric NOT NULL). content is PRODUCED by generateFromDossier (a deterministic render of the
-- dossier — never seeded, never an LLM number, §14/§3.6). status is conservative ('pending_review') until
-- the human gate (Gate 4) signs a Decision_Trace. Finance is impact-only by construction (BR-C1-7: no
-- artifact type moves balance). One artifact per (problem, type): 1:N at the dossier level, 1:1 per type.
create type public.artifact_type as enum ('email_content', 'ops_memo', 'action_plan', 'finance_impact');
create type public.artifact_status as enum ('pending_review', 'approved', 'rejected', 'escalated');

create table gov."Generated_Artifact" (
  artifact_id        uuid primary key default gen_random_uuid(),
  tenant_id          text not null,                                              -- RLS frontier (server-side)
  problem_id         uuid not null references tenant."Diagnosed_Problem"(problem_id) on delete cascade,
  artifact_type      public.artifact_type not null,
  target_metric      text not null,                                              -- BR-C1-3 metric-binding
  dossier_ref        jsonb not null,                                             -- 11-field dossier snapshot
  content            jsonb not null,                                             -- PRODUCED at generation (§14)
  status             public.artifact_status not null default 'pending_review',   -- conservative pre-decision
  provenance         jsonb not null default '{}'::jsonb,
  decision_trace_id  text,                                                       -- Gate 4: holds Artifact_Decision.decision_id (its own append-only trace, not the NBA Decision_Trace)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  unique (problem_id, artifact_type)
);
create index generated_artifact_tenant_idx on gov."Generated_Artifact"(tenant_id);
create index generated_artifact_problem_idx on gov."Generated_Artifact"(problem_id);
