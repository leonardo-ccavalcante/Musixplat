-- 05C/02 Gate 4 — human gate for artifacts. Mirrors the gov.Decision_Trace PATTERN (04 L269-270):
-- APPEND-ONLY audit, 4-eyes (confirmer != proposer), "sin trace no hay acción". Purpose-built for
-- artifacts because gov.Decision_Trace is bound to NBA-release governance (cohort/policy/episode XOR
-- origin); an artifact decision has none of those. No status change on Generated_Artifact happens
-- without a row here (enforced atomically in artifact.decide). action: approve | reject | escalate.
create type public.artifact_action as enum ('approve', 'reject', 'escalate');

create table gov."Artifact_Decision" (
  decision_id   uuid primary key default gen_random_uuid(),
  artifact_id   uuid not null references gov."Generated_Artifact"(artifact_id) on delete cascade,
  tenant_id     text not null,
  action        public.artifact_action not null,
  proposer_id   text not null references gov."User"(user_id),   -- the AI that proposed the artifact
  confirmer_id  text not null references gov."User"(user_id),   -- the human operator who signs (4-eyes)
  gate_reason   text,                                           -- why it sat at the gate (e.g. manual_review)
  decided_at    timestamptz not null default now(),
  independence_guaranteed boolean generated always as (confirmer_id is not null) stored,
  constraint artifact_decision_4eyes check (confirmer_id <> proposer_id)   -- 4-eyes: no self-confirm
);
create index artifact_decision_artifact_idx on gov."Artifact_Decision"(artifact_id);

-- Append-only (04 §3.3): the decision audit never mutates. Reuses the shared public.tg_append_only().
create trigger artifact_decision_append_only
  before update or delete on gov."Artifact_Decision"
  for each row execute function public.tg_append_only();
