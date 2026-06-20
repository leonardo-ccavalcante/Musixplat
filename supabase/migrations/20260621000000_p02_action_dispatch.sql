-- 02:1a — cockpit-owned dispatch of a released NBA's artifact to a cohort's restaurants.
-- NOT the Support Generated_Artifact (no problem_id/dossier coupling). content is PRODUCED
-- (deterministic render of the proposal + catalog playbook), never seeded (§14). One dispatch
-- per nba_id (idempotent). decision_trace_id ties it to the release ("sin trace no acción").
do $$ begin
  if not exists (select 1 from pg_type where typname = 'dispatch_status') then
    create type public.dispatch_status as enum ('draft', 'sent');
  end if;
end $$;

create table if not exists gov."Action_Dispatch" (
  dispatch_id        uuid primary key default gen_random_uuid(),
  nba_id             text not null,                     -- [deferred FK → NBA_Proposal] path P02
  cohort_id          text not null,
  tenant_id          text not null,                     -- RLS frontier (server-side)
  artifact_kind      text not null,                     -- email_offer | ops_memo | price_rec | ... (code map)
  content            jsonb not null,                    -- RESULT §14: rendered at send, never seeded
  target_count       integer not null,                 -- restaurants reached (computed at send)
  status             public.dispatch_status not null default 'sent',
  decision_trace_id  text references gov."Decision_Trace"(trace_id),
  created_at         timestamptz not null default now(),
  constraint action_dispatch_nba_uniq unique (nba_id)   -- no double dispatch
);
create index if not exists action_dispatch_tenant_idx on gov."Action_Dispatch"(tenant_id);
