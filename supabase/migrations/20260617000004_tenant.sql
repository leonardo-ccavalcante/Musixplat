-- Tenant zone (04 §3.1, §8): RLS by tenant_id/pool. restaurante_id is data within the pool
-- (NOT NULL), never the frontier. recurrencia/cross_sell are COMPUTED from Orden, never columns.

-- Append-only guard (04 §3.3) — reused by log tables (Evento_Uso here; gov logs later).
create or replace function public.tg_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'append-only table: % not allowed', tg_op;
end;
$$;

-- Restaurante: root/grounding per client (Cerebro).
create table tenant."Restaurante" (
  restaurante_id        text primary key,
  tenant_id             text not null,                         -- pool / RLS frontier
  tier_base             public.tier_base not null,             -- bruto
  segmento              public.segmento  not null,             -- bruto
  fecha_alta            date not null,                         -- bruto
  atributos_vivos       jsonb not null default '{}'::jsonb,    -- bruto config (NO recurrencia/cross_sell)
  fontes_grounding      jsonb not null default '{}'::jsonb,    -- bruto
  estado                text not null default 'activo',        -- operational bruto (at_risk is a separate score)
  tenure_actual         integer default null,                  -- RESULT §14: months, computed by F-1.1 (NULL pre-run)
  provenance_por_campo  jsonb not null default '{}'::jsonb
);
create index restaurante_tenant_idx on tenant."Restaurante"(tenant_id);

-- Orden: ALL orders/payments. Source of R$ + silenciosos. valor_neto is GENERATED arithmetic
-- (its named producer is the column itself; 04 §14 "Aritmética de fila"), not a seeded result.
create table tenant."Orden" (
  orden_id       bigint generated always as identity primary key,
  restaurante_id text not null references tenant."Restaurante"(restaurante_id),
  fecha          date not null,                                              -- bruto
  valor_bruto    numeric(12,2) not null,                                     -- bruto
  fee            numeric(12,2) not null default 0,                           -- bruto
  valor_neto     numeric(12,2) generated always as (valor_bruto - fee) stored,
  status_pago    public.status_pago not null,                               -- bruto
  motivo_fallo   text,
  zona           text,
  tipo_comida    text,
  canal          text,
  provenance     text not null default '[V]'
);
create index orden_rest_fecha_idx on tenant."Orden"(restaurante_id, fecha);
create index orden_fallido_idx on tenant."Orden"(restaurante_id) where status_pago = 'fallido';

-- Evento_Uso: platform-usage log, append-only.
create table tenant."Evento_Uso" (
  evento_id      bigint generated always as identity primary key,
  restaurante_id text not null references tenant."Restaurante"(restaurante_id),
  usuario_id     text references gov."Usuario"(usuario_id),
  feature        text not null,
  tipo_evento    text not null,
  ts             timestamptz not null default now(),
  payload        jsonb not null default '{}'::jsonb
);
create index evento_uso_rest_ts_idx on tenant."Evento_Uso"(restaurante_id, ts);
create trigger evento_uso_append_only
  before update or delete on tenant."Evento_Uso"
  for each row execute function public.tg_append_only();

-- Conversa_Episodio (minimal): ticket signal for panels F-3.3/F-3.4/F-5.4. intent is bruto;
-- cohort dimension is DERIVED via join to Pertenencia (producer output), not stored on the
-- bruto conversa — keeps §14 honest. estado_conversa initial = conservative 'abierta' (never
-- seeded 'escalada'); capa_metricas is a RESULT (NULL pre-run).
create table tenant."Conversa_Episodio" (
  episodio_id        text primary key,
  conversa_id        text not null,
  tenant_id          text not null,
  restaurante_id     text not null references tenant."Restaurante"(restaurante_id),
  intent             text references catalog."Intent_Catalog"(intent_id),  -- bruto
  estado_conversa    public.estado_conversa not null default 'abierta',
  capa_transcripcion jsonb not null default '{}'::jsonb,                    -- bruto
  capa_metricas      jsonb default null,                                    -- RESULT §14
  ts                 timestamptz not null default now()
);
create index conversa_rest_idx on tenant."Conversa_Episodio"(restaurante_id);
create index conversa_intent_idx on tenant."Conversa_Episodio"(intent);

-- KPI (minimal): F-1.8 reads the def + Named_Query; valor_hoy is a RESULT (produced by P03,
-- NULL here). target is config [C] (seeded).
create table tenant."KPI" (
  kpi_id           text primary key,
  tenant_id        text,
  restaurante_id   text references tenant."Restaurante"(restaurante_id),
  nivel            text not null,
  clase            text not null,
  kpi_def_version  text not null references catalog."Named_Query"(def_version),
  target           numeric default null,        -- config [C]
  valor_hoy        numeric default null,        -- RESULT §14 (NULL pre-run)
  ultimo_calculo_ts timestamptz default null,
  provenance       text not null default '[C]'
);
create index kpi_tenant_idx on tenant."KPI"(tenant_id, nivel);
