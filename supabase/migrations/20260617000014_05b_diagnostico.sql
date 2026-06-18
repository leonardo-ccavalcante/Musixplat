-- 05B Diagnosis foundation DDL (orchestrator + subagents). 04 §3 / §7 / §8 / §14.
-- DDL only — Diagnosed_Problem/Affected/Knowledge_Case are NEVER seeded (their rows are produced at
-- runtime by the orchestrator + silent-hunter + impact producers; §14 anti-fake). The only
-- seeded 05B data is the [C] knobs in seed.sql. RLS deferred per 04 §13 (active enforcement =
-- server-side tRPC tenantProcedure guard), matching the existing migrations.
--
-- Design (CLAUDE.md "fat tables by process, don't fragment" + §4 phantom denylist):
--   * Diagnosed_Problem is the FAT case table — issue_tree / revenue_lost / churn_risk /
--     cost_to_resolve / value_gained / case_repo all live here (jsonb or column), matching the
--     breakdown_CODE_AGENT contracts (B.1.3, B.5.1, B.5.3, B.6.2).
--   * Affected is the only child table — the anti-join (silent-hunter) producer output.
--   * DOSSIER #8 is a derived VIEW (v_dossier_handoff), NOT a table (§4: derived ⇒ view).
--   * Math (anti-join, revenue_lost) lives in SQL functions; TS only orchestrates (§3.6).

-- ── Diagnosed_Problem (04 §3): one row per diagnosed case. tenant_id is the RLS frontier
--    (BR-B6). RESULT columns are NULL pre-run (§14): only a named producer fills them. ──────
create table tenant."Diagnosed_Problem" (
  problem_id           uuid primary key default gen_random_uuid(),
  tenant_id            text not null,                                       -- pool / RLS frontier (US-B1.1.1)
  restaurant_id       text not null references tenant."Restaurant"(restaurant_id),
  conversation_id          text,                                               -- origin episode (05A); null on proactive
  criticality          text,                                               -- trigger hint (critical|...) — bruto, nullable
  status               text not null default 'open',                       -- conservative default (open|blocked|degrade_human|resolved)
  frequency            integer not null default 1,                         -- count, incremented by B.1.3 (computed)
  area_type            text,                                               -- RESULT §14 — B.2 classifier (NULL pre-run)
  hypothesis_root      text,                                               -- RESULT §14 — B.3 issue-tree validated
  confidence           numeric,                                            -- RESULT [C] — B.2/B.3
  issue_tree           jsonb,                                              -- RESULT §14 — B.3 ranked paths
  revenue_lost         numeric,                                            -- RESULT §14 — B.5.1 Named_Query
  churn_risk           numeric,                                            -- RESULT §14 — B.5.1 (NULL if no pre-churn producer = fail-closed)
  cost_to_resolve      numeric,                                            -- RESULT §14 — B.5.3 ledger
  value_gained         numeric,                                            -- RESULT §14 — B.5.3 ledger
  case_repo            jsonb,                                              -- RESULT §14 — B.6.2 replicable case (jsonb sub-object, §4 not a table)
  suggested_route      text,                                               -- RESULT §14 — B.6.1 router stub
  similar_links        jsonb not null default '[]'::jsonb,                 -- KB links (dossier #7/#8)
  silent_status        text,                                               -- RESULT — US-B1.3.1 reconcile flag (evaluable|not_evaluable)
  first_seen_ts        timestamptz not null default now(),
  last_seen_ts         timestamptz,                                        -- RESULT — bumped by B.1.3 increment / B.6.2
  provenance_by_field jsonb not null default '{}'::jsonb                  -- per-field [V]/[I]/[C] (04 §7, BR-B8)
);
create index problem_tenant_idx on tenant."Diagnosed_Problem"(tenant_id);
create index problem_rest_idx on tenant."Diagnosed_Problem"(restaurant_id);
-- Dedup natural key (B.1.3, "one case = one PROBLEM"): at most ONE open problem per restaurant.
-- B.1.3 does INSERT ... ON CONFLICT (...) WHERE status='open' DO UPDATE frequency+1.
create unique index problem_open_uniq
  on tenant."Diagnosed_Problem"(tenant_id, restaurant_id) where status = 'open';

-- ── Affected (04 §3, §14): silent-hunter producer output. NEVER seeded — zero rows pre-run.
--    complained/silent are RESULTS of the anti-join. k-anon does NOT suppress here (BR-B5:
--    B is internal, resolves the n=1 case); cross-tenant suppression is enforced at the output
--    frontier (BR-B6), not here. ──────────────────────────────────────────────────────────
create table tenant."Affected" (
  affected_id    uuid primary key default gen_random_uuid(),
  problem_id     uuid not null references tenant."Diagnosed_Problem"(problem_id) on delete cascade,
  tenant_id      text not null,                                            -- same pool (BR-B6)
  restaurant_id text not null references tenant."Restaurant"(restaurant_id),
  complained     boolean not null,                                         -- RESULT: has a Conversation (opened ticket)
  silent         boolean not null,                                         -- RESULT: affected but complained=false
  evidence       bigint references tenant."Order"(order_id),               -- the failed order proving impact
  computed_at    timestamptz not null default now(),
  unique (problem_id, restaurant_id)
);
create index affected_problem_idx on tenant."Affected"(problem_id);

-- ── Knowledge_Case (04 §3): KB for grounding (BR-B3) + RL guard (BR-B16). Real governance
--    entity (NOT a §4 phantom). Empty pre-run; producers are EPIC-B4 (thin) / FILA.
--    Stores BOTH polarities of a closed case so the learning loop CONVERGES, not oscillates:
--      POSITIVE (how it was solved) = resolution + path_used → replicated next time.
--      NEGATIVE (why it did NOT)    = not_resolved_reason + discarded_branches → grounding
--      prunes those dead hypotheses next time, so the AI stops re-proposing them.
--    Provenance split (§14 + BR-B8): `outcome` is MEASURED ⇒ [V]/[I]; the narrative
--    `not_resolved_reason` is AI text ⇒ [C], never a number, human-gated (reviewed=false). ──
create table tenant."Knowledge_Case" (
  kb_case_id           uuid primary key default gen_random_uuid(),
  tenant_id            text not null,
  area_type            text not null,
  pattern              text,
  outcome              text,                                              -- RESULT §14 — measured: 'resolved'|'not_resolved'|'escalated' (NULL pre-producer)
  resolution           text,                                              -- POSITIVE polarity: how it was solved (NULL when not resolved)
  path_used            jsonb,                                             -- the issue-tree path that worked
  not_resolved_reason  text,                                             -- NEGATIVE polarity [C]: why it did NOT close (NULL when resolved)
  discarded_branches   jsonb not null default '[]'::jsonb,                -- hypotheses tried+falsified (+why) ⇒ grounding prunes them next case
  probability          numeric,                                           -- [C] historical likelihood
  similar_links        jsonb not null default '[]'::jsonb,
  reviewed             boolean not null default false,                   -- BR-B16: pending-review until human RLHF
  provenance_by_field  jsonb not null default '{}'::jsonb,                -- per-field [V]/[I]/[C] (04 §7, BR-B8)
  created_at           timestamptz not null default now(),
  -- two-polarity invariant (fail-closed, §3.7): an outcome must carry its evidence —
  -- resolved ⇒ HOW (resolution); not_resolved/escalated ⇒ WHY (not_resolved_reason).
  constraint knowledge_case_outcome_ck
    check (outcome is null or outcome in ('resolved','not_resolved','escalated')),
  constraint knowledge_case_polarity_ck check (
    outcome is null
    or (outcome = 'resolved' and resolution is not null)
    or (outcome in ('not_resolved','escalated') and not_resolved_reason is not null)
  )
);
create index knowledge_case_areatype_idx on tenant."Knowledge_Case"(tenant_id, area_type);

-- ── silent-hunter (B.5.2b, BR-B4/B5/B6): anti-join. Within ONE tenant + window, every
--    restaurant with a failed Order is an affected; those WITHOUT a Conversation (ticket) are the
--    silent ones. Deterministic, no LLM. Scoped by p_tenant (BR-B6 hard-no cross-tenant) and
--    p_window_days (bounded sweep, B-block-2). Returns rows inserted. ────────────────────
create or replace function tenant.fn_hunt_silent(
  p_problem uuid, p_tenant text, p_window_days integer
) returns integer language plpgsql as $$
declare v_inserted integer;
begin
  insert into tenant."Affected"(problem_id, tenant_id, restaurant_id, complained, silent, evidence)
  select p_problem, r.tenant_id, f.restaurant_id,
         (c.restaurant_id is not null) as complained,
         (c.restaurant_id is null)     as silent,
         f.evidence
  from (
    select o.restaurant_id, min(o.order_id) as evidence
    from tenant."Order" o
    join tenant."Restaurant" rr on rr.restaurant_id = o.restaurant_id
    where o.payment_status = 'failed'
      and rr.tenant_id = p_tenant
      and o.order_date >= (current_date - p_window_days)
    group by o.restaurant_id
  ) f
  join tenant."Restaurant" r on r.restaurant_id = f.restaurant_id
  left join (
    select distinct restaurant_id from tenant."Conversation_Episode" where tenant_id = p_tenant
  ) c on c.restaurant_id = r.restaurant_id
  on conflict (problem_id, restaurant_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ── impact revenue_lost (B.5.1, BR-B10): canonical UNIQUE formula
--    revenue_lost = sum(Order.net_value WHERE payment_status='failed') over the affected set.
--    churn_risk stays NULL (no pre-churn producer this session = fail-closed, US-B5.1.1).
--    Writes the result + inherits worst provenance [I]. Returns the sum. ────────────────────
create or replace function tenant.fn_impact_revenue_lost(p_problem uuid)
returns numeric language plpgsql as $$
declare v_total numeric;
begin
  select coalesce(sum(o.net_value), 0) into v_total
  from tenant."Order" o
  where o.payment_status = 'failed'
    and o.restaurant_id in (
      select restaurant_id from tenant."Affected" where problem_id = p_problem
    );
  update tenant."Diagnosed_Problem" p
     set revenue_lost = v_total,
         provenance_by_field = p.provenance_by_field || jsonb_build_object('revenue_lost', '[I]')
   where p.problem_id = p_problem;
  return v_total;
end;
$$;

-- ── DOSSIER_HANDOFF #8 (04 §3.4, §4): the 11 fields are DERIVED ⇒ a VIEW, never a table.
--    restaurants_affected = count(Affected) is computed here (US-B1.3.1: never a stored number).
--    The TS completeness gate (US-B6.3.1) refuses to emit when any field is NULL / unprovenanced.
create view tenant.v_dossier_handoff as
select
  p.problem_id,
  p.tenant_id,
  jsonb_build_object('area_type', p.area_type, 'hypothesis_root', p.hypothesis_root,
                     'confidence', p.confidence)                       as f1_tipo_raiz,
  p.issue_tree                                                          as f2_evidence,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'restaurant_id', a.restaurant_id, 'complained', a.complained,
            'silent', a.silent)), '[]'::jsonb)
     from tenant."Affected" a where a.problem_id = p.problem_id)        as f3_who,
  (p.case_repo -> 'where_concentrated')                                 as f4_where_concentrated,
  jsonb_build_object('revenue_lost', p.revenue_lost, 'churn_risk', p.churn_risk,
                     'cost_to_resolve', p.cost_to_resolve,
                     'value_gained', p.value_gained)                    as f5_how_much,
  jsonb_build_object('frequency', p.frequency, 'first_seen_ts', p.first_seen_ts,
                     'last_seen_ts', p.last_seen_ts)                    as f6_recurrence,
  p.similar_links                                                       as f7_similar_cases,
  jsonb_build_object('hypothesis_root', p.hypothesis_root, 'confidence', p.confidence) as f8_auditable_hypothesis,
  p.suggested_route                                                     as f9_suggested_route,
  (p.case_repo -> 'raw_data')                                           as f10_raw_data,
  p.provenance_by_field                                                as f11_provenance,
  p.status,
  (select count(*) from tenant."Affected" a where a.problem_id = p.problem_id) as restaurants_affected
from tenant."Diagnosed_Problem" p;
