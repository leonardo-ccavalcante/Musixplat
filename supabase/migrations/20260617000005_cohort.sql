-- Cohort zone (04 §3.2, §8): aggregated, NO restaurant_id. Gate = k-anon (not RLS).
-- The ONLY restaurant↔cohort link lives in Cohort_Membership_Snapshot.
-- Cells + memberships are PRODUCED by P01 (F-1.1), never seeded. All result cols NULL pre-run.

create table cohort."Cohort" (
  cohort_id                     text primary key,                 -- e.g. long_tail_3-6m_v1 (deterministic, F-1.1)
  tenure_bucket                 public.tenure_bucket not null,
  tier_base                     public.tier_base not null,
  cohort_rule_version           text not null references catalog."Cohort_Rule_Version"(version_id),
  n_accounts                     integer default null,             -- RESULT §14 (count)
  descriptive_baseline          jsonb   default null,             -- RESULT (F-1.4 / F-1.8)
  segment_attribution_baseline  jsonb   default null,             -- RESULT (F-1.2)
  collapsed                     boolean default null,             -- RESULT (n_min gate F-1.3)
  k_suppression_applied          boolean default null,             -- RESULT (k-anon gate F-1.3b)
  opportunity_value             numeric default null,             -- RESULT (F-1.7 projection [C])
  freshness_ts                  timestamptz default null,         -- RESULT
  unique (tenure_bucket, tier_base, cohort_rule_version)
);

-- Subgroup (04 §3.2): level-2 cell as a thin table (never a nullable FK-target column).
create table cohort."Subgroup" (
  subgroup_id text primary key,
  cohort_id   text not null references cohort."Cohort"(cohort_id),
  label       text not null
);

-- Cohort_Membership_Snapshot (04 §3.2): weekly position per restaurant. ONLY tenant↔cohort link.
create table cohort."Cohort_Membership_Snapshot" (
  snapshot_id          bigint generated always as identity primary key,
  restaurant_id       text not null references tenant."Restaurant"(restaurant_id),
  cohort_id            text not null references cohort."Cohort"(cohort_id),
  subgroup_id          text references cohort."Subgroup"(subgroup_id),
  week               date not null,
  percentile_in_cohort  numeric default null,                      -- RESULT (F-1.2) — null if no-percentile
  gap_to_top        numeric default null,                      -- RESULT (F-1.2)
  n_min_ok             boolean default null,                      -- RESULT (F-1.3)
  mode                 public.percentile_mode default null,        -- RESULT (F-1.3)
  freshness_ts         timestamptz default null,                  -- RESULT
  cohort_rule_version  text not null references catalog."Cohort_Rule_Version"(version_id),
  scope_owner_ref      jsonb default null,                        -- written by F-5.5 {owner_id, level}
  provenance           text not null default '[V]',
  unique (restaurant_id, cohort_id, week, cohort_rule_version) -- anti-double-count weekly
);
create index membership_cohort_week_idx on cohort."Cohort_Membership_Snapshot"(cohort_id, week);
create index membership_rest_week_idx on cohort."Cohort_Membership_Snapshot"(restaurant_id, week);

-- Prioritized_NBA_Event (04 §3.2): the ONLY real mutant output of P01. delta_status filled by
-- the diff job (F-2.2); operator_id + handoff_ts set on the sync handoff (F-5.2 → P02 NBA).
-- risk_class is NOT born here (born in P02). Idempotency via the natural key.
create table cohort."Prioritized_NBA_Event" (
  event_id             uuid primary key default gen_random_uuid(),
  restaurant_id       text not null references tenant."Restaurant"(restaurant_id),
  cohort_id            text not null references cohort."Cohort"(cohort_id),
  subgroup_id          text references cohort."Subgroup"(subgroup_id),
  week               date not null,
  percentile_in_cohort  numeric default null,                      -- null if no-percentile
  gap_to_top        numeric default null,
  delta_status         public.delta_status default null,          -- RESULT (F-2.2)
  n_min_ok             boolean default null,
  freshness_ts         timestamptz default null,
  mode                 public.percentile_mode default null,
  cohort_rule_version  text not null references catalog."Cohort_Rule_Version"(version_id),
  scope_owner_ref      jsonb default null,
  operator_id          text references gov."User"(user_id), -- set on handoff (F-5.2)
  handoff_ts           timestamptz default null,
  created_at           timestamptz not null default now(),
  unique (restaurant_id, cohort_id, week, cohort_rule_version) -- idempotency (anti double-click)
);
create index nba_event_cohort_week_idx on cohort."Prioritized_NBA_Event"(cohort_id, week);
