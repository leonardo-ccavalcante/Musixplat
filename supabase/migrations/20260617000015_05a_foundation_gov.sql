-- 05A FOUNDATION — gov-zone governance/autonomy DDL (04 §3.2 / §3.3 / §3.9 / §14).
-- Foundation owns ALL DDL (CLAUDE.md "Build-doc per feature" + §3.9): the 6 governance
-- entities (Eval_Cell, NBA_Propuesta, Politica_Tier, Credencial, Liberacion_Lote,
-- Decision_Trace) + the Conversation_Episode extension that 05A/05B/P02 consume. DDL ONLY —
-- every RESULT column is NULL pre-run and the seed inserts ZERO rows in these tables;
-- their rows are produced at runtime by their named producers (Eval golden-set, the min()
-- motor, the operator cockpit P02), §14 anti-fake. RLS deferred per 04 §13 (active
-- enforcement = server-side tRPC tenant guard), matching the existing migrations.
--
-- Verbatim sources (quoted in the build report): NBA_Propuesta 04 L221 · Eval_Cell 04 L212 ·
-- Politica_Tier 04 L246 · Credencial 04 L255 · Liberacion_Lote 04 L262 · Decision_Trace
-- 04 L269-270 · Conversation_Episode 04 L107/L112. NBA_Propuesta is NOT on the §3.9 phantom
-- denylist (L483-494) — it is a real persisted entity (§3.2 inventory L63).
--
-- Closed label sets as ordered/unordered ENUMs. public.autonomy_level (ordered) is reused
-- for every autonomy ceiling so least()/min() fail-closed to LOW (04 §3 note).
create type public.financial_class    as enum ('direct', 'indirect', 'none');
create type public.lever_class        as enum ('operational', 'strategic', 'area');
create type public.routing_destination as enum ('NBA', 'Strategy', 'Support', 'discard');
create type public.eval_status        as enum ('red', 'green');
create type public.release_action     as enum ('RELEASE', 'PAUSE');
create type public.trace_action       as enum ('release', 'pause', 'override');
create type public.escalation_axis    as enum ('who', 'effect', 'confidence', 'status', 'anomaly', 'recurrence', 'auto_flag', 'none');
create type public.trace_origin       as enum ('desktop', 'mobile');
create type public.credential_status  as enum ('active', 'suspended', 'revoked');
create type public.credential_role    as enum ('agent_manager_junior', 'agent_manager_senior', 'gov_admin', 'policy_owner', 'finance');

-- ── NBA_Proposal (04 L221): closed catalog A1-A8 + "no-act" instanced per cohort/subgroup.
--    Produced by P02 (the AI instances, never invents). Foundation creates it EMPTY so 05A /
--    min_calculation / Conversation_Episode can FK it; seed inserts NO rows (§14). impact_realized
--    is a RESULT (NULL pre-run · §14 L684); before_after_expected / impact_estimated are
--    projection-NOT-measured ([C], labeled in UI, never a min() arm · §14 L688). ─────────────
create table gov."NBA_Proposal" (
  nba_id                uuid primary key default gen_random_uuid(),
  action_type           text,                                              -- [deferred FK → NBA_Catalogo.codigo {A1..A8|no-act}] catalog not built yet
  cohort_id             text not null references cohort."Cohort"(cohort_id),
  subgroup_id           text references cohort."Subgroup"(subgroup_id),
  intent                text references catalog."Intent_Catalog"(intent_id),
  root_cause            text,                                              -- bruto/proposal text (the AI proposes text, never a number · §3.6)
  nba_request           public.autonomy_level,                            -- 1 arm of the min() (an instanced row supplies it; NULL until P02 instances)
  before_after_expected jsonb default null,                               -- projection-NOT-measured [C] (§14 L688)
  financial_class       public.financial_class,                           -- 'direct' moves balance ⇒ AI only proposes (04 §7 hard-no)
  lever_class           public.lever_class,                               -- routing
  routing_destination   public.routing_destination,                       -- {NBA|Strategy|Support|discard}
  risk_class            public.autonomy_level default null,              -- RESULT (derived worst-case, born in P02 · §14)
  impact_estimated      jsonb default null,                               -- projection-NOT-measured [C] (§14 L688)
  impact_realized       jsonb default null,                               -- RESULT §14 L684 (only from real signal, never copied from estimated · BR-HON-1)
  cohort_rule_version   text not null references catalog."Cohort_Rule_Version"(version_id),  -- stamped per row (anti-mix, 04 §6/§7)
  provenance_by_field  jsonb not null default '{}'::jsonb,               -- per-field provenance (04 §7)
  created_at            timestamptz not null default now()
);
create index nba_proposal_cohort_idx on gov."NBA_Proposal"(cohort_id);
create index nba_proposal_intent_idx on gov."NBA_Proposal"(intent);

-- ── Eval_Cell (04 L212): golden-set per (cohort × intent × version). status red→green
--    produces released_evals (1 arm of the min()). PK surrogate eval_cell_id + UNIQUE
--    (cohort_id, intent, version) — references point at eval_cell_id (04 L217). The golden-set
--    CASES are bruto (seedable elsewhere) but the VERDICT columns (status/kappa/n/released_evals/
--    redteam_judge_vs_human_result) are RESULT: run the golden-set, never type "green"/"LOW" (§14 L681).
--    Foundation seeds NO rows here. status conservative-initial = 'red' (§14 L690) when a row
--    is later inserted by its producer. ───────────────────────────────────────────────────────
create table gov."Eval_Cell" (
  eval_cell_id                    uuid primary key default gen_random_uuid(),
  cohort_id                       text not null references cohort."Cohort"(cohort_id),
  intent                          text not null references catalog."Intent_Catalog"(intent_id),  -- intent never a bare FK-target (04 L217)
  version                         text not null,                          -- golden-set version
  released_evals                  public.autonomy_level default null,    -- RESULT §14 L681 (1 arm of min(); public.autonomy_level per task)
  status                          public.eval_status     default null,    -- RESULT §14 L681 (conservative 'red' when producer writes; never seeded)
  n_cohort_x_intent               integer                default null,    -- RESULT §14 L676 (count)
  kappa                           numeric                default null,    -- RESULT §14 L681 (inter-rater agreement)
  redteam_independence_flag       boolean                default null,    -- RESULT (judge↔human independence, Red_Team_Set absorbed · 04 L488)
  redteam_judge_vs_human_result   text                  default null,    -- RESULT §14 L681
  provenance_by_field            jsonb not null default '{}'::jsonb,     -- per-field provenance (04 §7)
  unique (cohort_id, intent, version)                                     -- 04 L212 / L217
);
create index eval_cell_cohort_intent_idx on gov."Eval_Cell"(cohort_id, intent);

-- ── Credential (04 L255): human authority PER-TENANT (eligibility gate BEFORE the min(), NOT a
--    4th arm). RBAC materialized as a jsonb matrix (role × action_class → level_max_releasable,
--    requires_2_eyes, origin_allowed). level_max_releasable never exceeds tier_cap (enforced
--    at validation time, 04 L585 — not a row CHECK because tier_cap lives on Policy_Tier).
--    audit_divergence is a RESULT (NULL pre-run · §14 L686). Foundation seeds NO rows. ────────
create table gov."Credential" (
  credential_id        text primary key,
  user_id           text not null references gov."User"(user_id),
  tenant_id            text not null,                                      -- per-tenant scope (no global bypass · 04 L585); RLS frontier server-side
  role                  public.credential_role not null,
  status               public.credential_status not null default 'active',
  credential_policy_pin text,                                              -- pinned credential-policy version
  rbac_matrix          jsonb not null default '{}'::jsonb,                 -- RBAC matrix (role×action_class → level_max_releasable/requires_2_eyes/origin_allowed)
  audit_divergence     jsonb default null,                                 -- RESULT §14 L686 (cross-check vs policy: policy wins)
  issued_by_id         text references gov."User"(user_id),
  expires_at           timestamptz
);
create index credential_user_idx on gov."Credential"(user_id);
create index credential_tenant_idx  on gov."Credential"(tenant_id);

-- ── Policy_Tier (04 L246): produces tier_cap (3rd arm of min()). The versioned .md is the
--    source-of-truth. tier_cap/allowed_today/cross_tenant_rule/how_measured are bruto (the
--    .md); measured_result is a RESULT (NULL pre-run · §14 L669/L686). born_from_trace is
--    NULLABLE (seed circularity fix 04 L251): a root policy has born_from_trace=NULL; only 2nd-
--    generation policies fill it. The FK → Decision_Trace is added AFTER Decision_Trace exists
--    (see ALTER below) to break the Policy_Tier↔Decision_Trace cycle. ─────────────────────────
create table gov."Policy_Tier" (
  policy_id            text primary key,
  tier_id              text,                                               -- maps to Restaurant.tier_base (no FK: tier_base is an enum, not a table)
  policy_version       text not null,                                      -- semver
  tier_cap             public.autonomy_level not null,                    -- bruto (the .md) — 3rd arm of min()
  allowed_today        jsonb not null default '{}'::jsonb,                 -- bruto (the .md)
  measured_result      text default null,                                  -- RESULT §14 L669/L686 (NOT in the .md)
  how_measured         text,                                               -- bruto (the .md)
  cross_tenant_rule    text,                                               -- bruto (the .md · cross-tenant hard-no)
  born_from_trace      text default null,                                  -- FK → Decision_Trace.trace_id (NULLABLE, added below · 04 L251)
  human_signature      text references gov."User"(user_id),
  provenance_by_field jsonb not null default '{}'::jsonb,                 -- per-field provenance (04 §7)
  unique (policy_version)                                                  -- Release_Batch/Decision_Trace FK policy_version (04 L262/L269)
);
create index policy_tier_version_idx on gov."Policy_Tier"(policy_version);

-- ── Decision_Trace (04 L269-270): APPEND-ONLY audit of every release/pause/autonomy eval.
--    "Sin trace no hay acción." 4-eyes CHECK: confirmer_id IS NULL OR confirmer_id <>
--    proposer_id (null = auto-confirmed [C]). independence_guaranteed is GENERATED =
--    (confirmer_id IS NOT NULL) (04 L270). XOR origin (release_id vs conversation_id): a trace
--    comes from a governance batch OR a conversation, never both. gate_result / time_to_signature_sec
--    / rubber_stamp_flag are RESULT (NULL pre-run · §14 L686). policy_version NOT NULL (04 L269).
--    Created BEFORE Release_Batch; the release_id FK is added AFTER (cycle break). ──────────
create table gov."Decision_Trace" (
  trace_id                 text primary key,                              -- canonical decision_id
  release_id               text,                                          -- FK → Release_Batch.release_id (added below · cycle break)
  episode_id              text references tenant."Conversation_Episode"(episode_id),  -- ROOT-CAUSE FIX (karpathy): 04 L269 names this "conversation_id", but the real conversation identity is episode_id (PK = tenant:conversation, tenant-embedded). conversation_id alone is tenant-scoped ⇒ unsafe as a cross-table key (UNIQUE would collide cross-tenant §3.4). Reference the real PK with a real FK — integrity + tenant-safe. null if origin governance. [FOLLOW-UP: min_calculation.conversation_id (013, merged) carries the same smell as a deferred provenance ref — unify on episode_id in a later migration]
  calculation_id           uuid references gov."min_calculation"(calculation_id), -- FK → min_calculation log (gate-3, the pair · 04 L269 / §3.4)
  action                   public.trace_action not null,
  proposer_id              text not null references gov."User"(user_id),
  confirmer_id             text references gov."User"(user_id),     -- != proposer; null = auto-confirmed [C]
  effective_level_applied  public.autonomy_level,                        -- the min() level applied (copy)
  escalation_axis          public.escalation_axis default 'none',
  credential_id            text references gov."Credential"(credential_id),  -- gate-1
  policy_version           text not null references gov."Policy_Tier"(policy_version),  -- gate-2 (NOT NULL · 04 L269)
  origin                   public.trace_origin,
  gate_result              jsonb default null,                            -- RESULT §14 L686 (jsonb g1/g2/g3, computed at runtime)
  time_to_signature_sec    integer default null,                          -- RESULT §14 L686
  -- [ASSUMPTION: rubber_stamp_flag is a RESULT column DEFAULT NULL, NOT a STORED GENERATED column.
  --  04 L270 says "(generated) = (time_to_signature_sec < threshold AND origin='mobile')" but the threshold
  --  is the Config_Knobs knob 'tiempo_rubber_stamp_seg' read BY NAME (CLAUDE.md §3.8); a STORED
  --  generated expression cannot read a knob (must be immutable, no subquery). The §14 master rule
  --  (RESULT = NULL pre-run · L686 lists it) + threshold-by-name win: the engine (02:BR-LOG-2)
  --  computes it at runtime reading the knob by name. Hardcoding a literal would violate §3.8.]
  rubber_stamp_flag        boolean default null,                          -- RESULT §14 L686 (computed by engine, knob by name)
  independence_guaranteed  boolean generated always as (confirmer_id is not null) stored,  -- 04 L270 (GENERATED)
  "timestamp"              timestamptz not null default now(),
  constraint decision_trace_4eyes check (confirmer_id is null or confirmer_id <> proposer_id),  -- 4-eyes (04 L270)
  constraint decision_trace_origin_xor check ((release_id is not null) <> (episode_id is not null))  -- XOR origin (governance vs conversation)
);
create index decision_trace_release_idx on gov."Decision_Trace"(release_id);
create index decision_trace_episode_idx   on gov."Decision_Trace"(episode_id);
create index decision_trace_credential_idx on gov."Decision_Trace"(credential_id);

-- Append-only (04 §3.3): the before/after governance audit never mutates. Reuses the shared
-- public.tg_append_only() (raise exception ⇒ SQLSTATE P0001).
create trigger decision_trace_append_only
  before update or delete on gov."Decision_Trace"
  for each row execute function public.tg_append_only();

-- ── Release_Batch (04 L262): human release/pause override IN BATCH per cohort/subgroup.
--    resulting_level <= effective_level (override ONLY DOWN, AUT-11) — enforced at validation
--    against min_calculation.effective_level (cannot be a row CHECK: effective_level lives on
--    min_calculation). proposer_id <> operator_id (4-eyes on the batch · task constraint). Links
--    1-1 to Decision_Trace. Produced by the operator cockpit (P02); seed inserts NO rows. ───────
create table gov."Release_Batch" (
  release_id               text primary key,
  cohort_id                text not null references cohort."Cohort"(cohort_id),
  subgroup_id              text references cohort."Subgroup"(subgroup_id),
  action                   public.release_action not null,
  resulting_level          public.autonomy_level,                        -- <= effective_level (validated vs min_calculation; override only down · AUT-11)
  proposer_id              text not null references gov."User"(user_id),
  operator_id              text not null references gov."User"(user_id),  -- signature
  policy_version_validated text references gov."Policy_Tier"(policy_version),
  in_flight_stages_resolved boolean default null,                         -- RESULT §14 (resolved by the in-flight-stage check at runtime)
  decision_trace_id        text references gov."Decision_Trace"(trace_id),  -- 1-1 (04 L262/L265)
  created_at               timestamptz not null default now(),
  constraint release_batch_4eyes check (proposer_id <> operator_id)   -- 4-eyes: proposer != signer (task constraint)
);
create index release_batch_cohort_idx on gov."Release_Batch"(cohort_id);
create unique index release_batch_trace_uidx on gov."Release_Batch"(decision_trace_id) where decision_trace_id is not null;  -- 1-1

-- ── Circular FKs resolved now that both ends exist (04 §3 create-order note). ───────────────
alter table gov."Decision_Trace"
  add constraint decision_trace_release_fk
  foreign key (release_id) references gov."Release_Batch"(release_id);

alter table gov."Policy_Tier"
  add constraint policy_tier_born_from_trace_fk
  foreign key (born_from_trace) references gov."Decision_Trace"(trace_id);  -- NULLABLE 2nd-generation (04 L251)

-- ── Promote the min_calculation provenance refs (deferred plain text in 20260617000013) to real
--    FKs now that their targets exist (04 L277). policy_id is text↔text — promoted. ──────────
--    [ASSUMPTION: min_calculation.nba_id and .eval_cell_ref are typed TEXT in migration 013, but
--     NBA_Proposal.nba_id and Eval_Cell.eval_cell_id are UUID (04 L221/L212 "PK uuid"). A FK
--     requires identical column types and forbids an expression (no `(eval_cell_ref::uuid)`).
--     Editing migration 013 to retype those columns is out of scope for this foundation pass,
--     so these two refs stay deferred plain text (their value still records provenance; the FK
--     promotion lands when 013 is retyped). Conservative: a deferred ref is honest; a wrong-type
--     FK would not compile.]
alter table gov."min_calculation"
  add constraint min_calculation_policy_fk
  foreign key (policy_id) references gov."Policy_Tier"(policy_id);  -- 04 L277 FK → Policy_Tier.policy_id (text↔text)

-- ── ALTER tenant.Conversation_Episode (04 L107/L112) — top-level FK-able columns 05B/min() cross.
--    cohort_id and injection_signal are RESULT ⇒ NULL pre-run (§14: cohort dimension derived by
--    F-1.1; injection_signal logged by the data-fencing layer at runtime · §14 L451). nba_usada
--    and lock_posesion are operational links filled at runtime, never seeded. ──────────────────
alter table tenant."Conversation_Episode"
  add column cohort_id       text references cohort."Cohort"(cohort_id),   -- RESULT §14 (cohort dimension derived, NULL pre-run · 04 L112)
  add column nba_usada       uuid references gov."NBA_Proposal"(nba_id),  -- FK → NBA_Proposal (promoted now that the table exists · 04 L107/L112)
  add column lock_posesion   text references gov."User"(user_id),    -- possession lock (user_id|null · 04 L107)
  add column "injection_signal" jsonb default null;                        -- RESULT §14 L451 (injection signal logged vs tenant, NULL pre-run)
