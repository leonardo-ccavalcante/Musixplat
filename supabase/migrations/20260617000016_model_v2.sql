-- MODEL v2 (Leo ratified 2026-06-18). Cohort redesign → comparable cells
-- (category × region × size) + real operational signals. ADDITIVE (v1 already deployed);
-- brutos only, every derived value stays a RESULT (§14). Idempotent (db reset re-runs all).
--
-- Chunk 1 of the v2 build = schema + signals + connection telemetry. The cohort-axis UNIQUE swap
-- and producer rewrite land together in chunk 2 (kept atomic so v1 producers stay green here).

-- cancel attribution (who cancelled). Ordered enum not needed; plain closed set.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'cancelled_by') then
    create type public.cancelled_by as enum ('restaurant', 'customer');
  end if;
end $$;

-- Restaurant: location + cuisine + committed weekly hours.
-- zone/cuisine = cohort axes (compare sushi↔sushi, region↔region). committed_hours = connection denominator.
alter table tenant."Restaurant"
  add column if not exists zone                    text,
  add column if not exists cuisine             text,
  add column if not exists committed_hours_week numeric(6,2);

-- Order operational signals (brutos). payment_status='failed' = cancelada; 'ok' = entregada.
-- cancelled_by set ONLY on a cancel. quality (foto/descrição) is per-order menu signal.
alter table tenant."Order"
  add column if not exists cancelled_by     public.cancelled_by,
  add column if not exists discount_pct     numeric(5,2) not null default 0,
  add column if not exists has_photo        boolean,
  add column if not exists has_description boolean;

-- Connection telemetry: weekly process table. RATIO (conexión = conectadas/prometidas) is a
-- RESULT computed producer-side, NEVER stored here. Both columns are brutos.
create table if not exists tenant."Weekly_Connection" (
  connection_id      bigint generated always as identity primary key,
  restaurant_id   text not null references tenant."Restaurant"(restaurant_id),
  week           date not null,
  connected_hours numeric(6,2) not null,        -- bruto numerator
  committed_hours numeric(6,2) not null,        -- bruto denominator (committed that week)
  unique (restaurant_id, week)
);
create index if not exists connection_rest_week_idx on tenant."Weekly_Connection"(restaurant_id, week);

-- Cohort: add v2 axes now (nullable, harmless). The UNIQUE-key swap (tenure→tipo×zone) + producer
-- rewrite are chunk 2 so v1 fn_assign_cohorts keeps its ON CONFLICT working until then.
alter table cohort."Cohort"
  add column if not exists cuisine text,
  add column if not exists zone        text;
