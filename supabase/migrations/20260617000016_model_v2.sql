-- MODEL v2 (Leo ratified 2026-06-18). Cohort redesign → comparable cells
-- (categoria × região × tamanho) + real operational signals. ADDITIVE (v1 already deployed);
-- brutos only, every derived value stays a RESULT (§14). Idempotent (db reset re-runs all).
--
-- Chunk 1 of the v2 build = schema + signals + connection telemetry. The cohort-axis UNIQUE swap
-- and producer rewrite land together in chunk 2 (kept atomic so v1 producers stay green here).

-- cancel attribution (who cancelled). Ordered enum not needed; plain closed set.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'cancelado_por') then
    create type public.cancelado_por as enum ('restaurante', 'usuario');
  end if;
end $$;

-- Restaurante: location + cuisine + committed weekly hours.
-- zona/tipo_comida = cohort axes (compare sushi↔sushi, região↔região). horas_prometidas = conexión denominator.
alter table tenant."Restaurante"
  add column if not exists zona                    text,
  add column if not exists tipo_comida             text,
  add column if not exists horas_prometidas_semana numeric(6,2);

-- Orden operational signals (brutos). status_pago='fallido' = cancelada; 'ok' = entregada.
-- cancelado_por set ONLY on a cancel. quality (foto/descrição) is per-order menu signal.
alter table tenant."Orden"
  add column if not exists cancelado_por     public.cancelado_por,
  add column if not exists descuento_pct     numeric(5,2) not null default 0,
  add column if not exists tiene_foto        boolean,
  add column if not exists tiene_descripcion boolean;

-- Connection telemetry: weekly process table. RATIO (conexión = conectadas/prometidas) is a
-- RESULT computed producer-side, NEVER stored here. Both columns are brutos.
create table if not exists tenant."Conexion_Semanal" (
  conexion_id      bigint generated always as identity primary key,
  restaurante_id   text not null references tenant."Restaurante"(restaurante_id),
  semana           date not null,
  horas_conectadas numeric(6,2) not null,        -- bruto numerator
  horas_prometidas numeric(6,2) not null,        -- bruto denominator (committed that week)
  unique (restaurante_id, semana)
);
create index if not exists conexion_rest_semana_idx on tenant."Conexion_Semanal"(restaurante_id, semana);

-- Cohort: add v2 axes now (nullable, harmless). The UNIQUE-key swap (tenure→tipo×zona) + producer
-- rewrite are chunk 2 so v1 fn_assign_cohorts keeps its ON CONFLICT working until then.
alter table cohort."Cohort"
  add column if not exists tipo_comida text,
  add column if not exists zona        text;
