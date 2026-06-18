-- Tenant zone (04 §3.1, §8): RLS by tenant_id/pool. restaurant_id is data within the pool
-- (NOT NULL), never the frontier. recurrence/cross_sell are COMPUTED from Order, never columns.

-- Append-only guard (04 §3.3) — reused by log tables (Usage_Event here; gov logs later).
create or replace function public.tg_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'append-only table: % not allowed', tg_op;
end;
$$;

-- Restaurant: root/grounding per client (Cerebro).
create table tenant."Restaurant" (
  restaurant_id        text primary key,
  tenant_id             text not null,                         -- pool / RLS frontier
  tier_base             public.tier_base not null,             -- bruto
  segment              public.segment  not null,             -- bruto
  signup_date            date not null,                         -- bruto
  live_attributes       jsonb not null default '{}'::jsonb,    -- bruto config (NO recurrence/cross_sell)
  grounding_sources      jsonb not null default '{}'::jsonb,    -- bruto
  status                text not null default 'active',        -- operational bruto (at_risk is a separate score)
  tenure_months         integer default null,                  -- RESULT §14: months, computed by F-1.1 (NULL pre-run)
  provenance_by_field  jsonb not null default '{}'::jsonb
);
create index restaurant_tenant_idx on tenant."Restaurant"(tenant_id);

-- Order: ALL orders/payments. Source of R$ + silenciosos. net_value is GENERATED arithmetic
-- (its named producer is the column itself; 04 §14 "Aritmética de fila"), not a seeded result.
create table tenant."Order" (
  order_id       bigint generated always as identity primary key,
  restaurant_id text not null references tenant."Restaurant"(restaurant_id),
  order_date          date not null,                                              -- bruto
  gross_value    numeric(12,2) not null,                                     -- bruto
  fee            numeric(12,2) not null default 0,                           -- bruto
  net_value     numeric(12,2) generated always as (gross_value - fee) stored,
  payment_status    public.payment_status not null,                               -- bruto
  failure_reason   text,
  zone           text,
  cuisine    text,
  channel          text,
  provenance     text not null default '[V]'
);
create index order_rest_date_idx on tenant."Order"(restaurant_id, order_date);
create index order_failed_idx on tenant."Order"(restaurant_id) where payment_status = 'failed';

-- Usage_Event: platform-usage log, append-only.
create table tenant."Usage_Event" (
  evento_id      bigint generated always as identity primary key,
  restaurant_id text not null references tenant."Restaurant"(restaurant_id),
  user_id     text references gov."User"(user_id),
  feature        text not null,
  event_type    text not null,
  ts             timestamptz not null default now(),
  payload        jsonb not null default '{}'::jsonb
);
create index usage_event_rest_ts_idx on tenant."Usage_Event"(restaurant_id, ts);
create trigger evento_uso_append_only
  before update or delete on tenant."Usage_Event"
  for each row execute function public.tg_append_only();

-- Conversation_Episode (minimal): ticket signal for panels F-3.3/F-3.4/F-5.4. intent is bruto;
-- cohort dimension is DERIVED via join to Pertenencia (producer output), not stored on the
-- bruto conversation — keeps §14 honest. conversation_status initial = conservative 'open' (never
-- seeded 'escalated'); metrics_layer is a RESULT (NULL pre-run).
create table tenant."Conversation_Episode" (
  episode_id        text primary key,
  conversation_id        text not null,
  tenant_id          text not null,
  restaurant_id     text not null references tenant."Restaurant"(restaurant_id),
  intent             text references catalog."Intent_Catalog"(intent_id),  -- bruto
  conversation_status    public.conversation_status not null default 'open',
  transcript_layer jsonb not null default '{}'::jsonb,                    -- bruto
  metrics_layer      jsonb default null,                                    -- RESULT §14
  ts                 timestamptz not null default now()
);
create index conversation_rest_idx on tenant."Conversation_Episode"(restaurant_id);
create index conversation_intent_idx on tenant."Conversation_Episode"(intent);

-- KPI (minimal): F-1.8 reads the def + Named_Query; current_value is a RESULT (produced by P03,
-- NULL here). target is config [C] (seeded).
create table tenant."KPI" (
  kpi_id           text primary key,
  tenant_id        text,
  restaurant_id   text references tenant."Restaurant"(restaurant_id),
  level            text not null,
  class            text not null,
  kpi_def_version  text not null references catalog."Named_Query"(def_version),
  target           numeric default null,        -- config [C]
  current_value        numeric default null,        -- RESULT §14 (NULL pre-run)
  ultimo_calculo_ts timestamptz default null,
  provenance       text not null default '[C]'
);
create index kpi_tenant_idx on tenant."KPI"(tenant_id, level);
