-- Cohort zone (04 §3.2, §8): aggregated, NO restaurante_id. Gate = k-anon (not RLS).
-- The ONLY restaurante↔cohort link lives in Pertenencia_Cohort_Snapshot.
-- Cells + memberships are PRODUCED by P01 (F-1.1), never seeded. All result cols NULL pre-run.

create table cohort."Cohort" (
  cohort_id                     text primary key,                 -- e.g. long_tail_3-6m_v1 (deterministic, F-1.1)
  tenure_bucket                 public.tenure_bucket not null,
  tier_base                     public.tier_base not null,
  cohort_rule_version           text not null references catalog."Cohort_Rule_Version"(version_id),
  n_cuentas                     integer default null,             -- RESULT §14 (count)
  baseline_descriptivo          jsonb   default null,             -- RESULT (F-1.4 / F-1.8)
  baseline_atribucion_segmento  jsonb   default null,             -- RESULT (F-1.2)
  colapsada                     boolean default null,             -- RESULT (n_min gate F-1.3)
  supresion_k_aplicada          boolean default null,             -- RESULT (k-anon gate F-1.3b)
  oportunidad_valor             numeric default null,             -- RESULT (F-1.7 projection [C])
  freshness_ts                  timestamptz default null,         -- RESULT
  unique (tenure_bucket, tier_base, cohort_rule_version)
);

-- Subgrupo (04 §3.2): level-2 cell as a thin table (never a nullable FK-target column).
create table cohort."Subgrupo" (
  subgrupo_id text primary key,
  cohort_id   text not null references cohort."Cohort"(cohort_id),
  label       text not null
);

-- Pertenencia_Cohort_Snapshot (04 §3.2): weekly position per restaurante. ONLY tenant↔cohort link.
create table cohort."Pertenencia_Cohort_Snapshot" (
  snapshot_id          bigint generated always as identity primary key,
  restaurante_id       text not null references tenant."Restaurante"(restaurante_id),
  cohort_id            text not null references cohort."Cohort"(cohort_id),
  subgrupo_id          text references cohort."Subgrupo"(subgrupo_id),
  semana               date not null,
  percentil_en_cohort  numeric default null,                      -- RESULT (F-1.2) — null si sin-percentil
  gap_hasta_top        numeric default null,                      -- RESULT (F-1.2)
  n_min_ok             boolean default null,                      -- RESULT (F-1.3)
  modo                 public.modo_percentil default null,        -- RESULT (F-1.3)
  freshness_ts         timestamptz default null,                  -- RESULT
  cohort_rule_version  text not null references catalog."Cohort_Rule_Version"(version_id),
  scope_owner_ref      jsonb default null,                        -- written by F-5.5 {dueno_id, nivel}
  provenance           text not null default '[V]',
  unique (restaurante_id, cohort_id, semana, cohort_rule_version) -- anti-double-count semanal
);
create index pertenencia_cohort_semana_idx on cohort."Pertenencia_Cohort_Snapshot"(cohort_id, semana);
create index pertenencia_rest_semana_idx on cohort."Pertenencia_Cohort_Snapshot"(restaurante_id, semana);

-- Evento_Priorizado_NBA (04 §3.2): the ONLY real mutant output of P01. delta_status filled by
-- the diff job (F-2.2); operador_id + handoff_ts set on the sync handoff (F-5.2 → P02 NBA).
-- risk_class is NOT born here (born in P02). Idempotency via the natural key.
create table cohort."Evento_Priorizado_NBA" (
  evento_id            uuid primary key default gen_random_uuid(),
  restaurante_id       text not null references tenant."Restaurante"(restaurante_id),
  cohort_id            text not null references cohort."Cohort"(cohort_id),
  subgrupo_id          text references cohort."Subgrupo"(subgrupo_id),
  semana               date not null,
  percentil_en_cohort  numeric default null,                      -- null si sin-percentil
  gap_hasta_top        numeric default null,
  delta_status         public.delta_status default null,          -- RESULT (F-2.2)
  n_min_ok             boolean default null,
  freshness_ts         timestamptz default null,
  modo                 public.modo_percentil default null,
  cohort_rule_version  text not null references catalog."Cohort_Rule_Version"(version_id),
  scope_owner_ref      jsonb default null,
  operador_id          text references gov."Usuario"(usuario_id), -- set on handoff (F-5.2)
  handoff_ts           timestamptz default null,
  created_at           timestamptz not null default now(),
  unique (restaurante_id, cohort_id, semana, cohort_rule_version) -- idempotency (anti double-click)
);
create index evento_nba_cohort_semana_idx on cohort."Evento_Priorizado_NBA"(cohort_id, semana);
