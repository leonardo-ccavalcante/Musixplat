-- Slice-01 foundation: extensions, shared enums, zone schemas (04 §3, §8, checklist §10).
-- DDL only. Brutos + config rows live in seed.sql so the §14 anti-fake gate stays honest.

create extension if not exists pgcrypto;

-- Zones of isolation (04 §8): tenant (RLS by pool), cohort (k-anon), gov (append-only), catalog.
create schema if not exists catalog;
create schema if not exists tenant;
create schema if not exists cohort;
create schema if not exists gov;

-- Ordered ENUM (04 §3 note): declaration order = ordering, so least()/min() fail-closed to BAJA.
-- NEVER varchar (alphabetical would invert the fail-closed).
create type public.nivel_autonomia as enum ('BAJA', 'MEDIA', 'ALTA');

-- tenure_bucket borders confirmed by Leo (3/6/12 months) — read by NAME in Config_Perillas,
-- this enum is just the closed label set (04 §3.2).
create type public.tenure_bucket as enum ('0-3m', '3-6m', '6-12m', '12m+');

create type public.tier_base as enum ('managed_brand', 'managed_midmarket', 'long_tail');
create type public.segmento as enum ('managed', 'long_tail');
create type public.status_pago as enum ('ok', 'fallido', 'pendiente');
create type public.estado_conversa as enum ('abierta', 'en_humano', 'live_aguardando_permanencia', 'escalada');
create type public.modo_percentil as enum ('percentil', 'cualitativo_sin_percentil');
create type public.nivel_org as enum ('CEO', 'VP', 'equipo', 'IC');

-- delta_status (04 §3.2 Evento_Priorizado_NBA) — born from the diff producer (F-2.2), never seeded.
create type public.delta_status as enum (
  'mudou_cohort', 'melhorou_percentil', 'baixou_percentil', 'at_risk', 'novo', 'churn'
);
