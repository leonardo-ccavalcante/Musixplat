-- Slice-01 foundation: extensions, shared enums, zone schemas (04 §3, §8, checklist §10).
-- DDL only. Brutos + config rows live in seed.sql so the §14 anti-fake gate stays honest.

create extension if not exists pgcrypto;

-- Zones of isolation (04 §8): tenant (RLS by pool), cohort (k-anon), gov (append-only), catalog.
create schema if not exists catalog;
create schema if not exists tenant;
create schema if not exists cohort;
create schema if not exists gov;

-- Ordered ENUM (04 §3 note): declaration order = ordering, so least()/min() fail-closed to LOW.
-- NEVER varchar (alphabetical would invert the fail-closed).
create type public.autonomy_level as enum ('LOW', 'MEDIUM', 'HIGH');

-- tenure_bucket borders confirmed by Leo (3/6/12 months) — read by NAME in Config_Knobs,
-- this enum is just the closed label set (04 §3.2).
create type public.tenure_bucket as enum ('0-3m', '3-6m', '6-12m', '12m+');

create type public.tier_base as enum ('managed_brand', 'managed_midmarket', 'long_tail');
create type public.segment as enum ('managed', 'long_tail');
create type public.payment_status as enum ('ok', 'failed', 'pending');
create type public.conversation_status as enum ('open', 'in_human', 'live_awaiting_retention', 'escalated');
create type public.percentile_mode as enum ('percentile', 'qualitative_no_percentile');
create type public.org_level as enum ('CEO', 'VP', 'team', 'IC');

-- delta_status (04 §3.2 Prioritized_NBA_Event) — born from the diff producer (F-2.2), never seeded.
create type public.delta_status as enum (
  'cohort_changed', 'percentile_up', 'percentile_down', 'at_risk', 'new', 'churn'
);
