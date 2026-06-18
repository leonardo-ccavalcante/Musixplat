-- Catalog zone (04 §3.4): versioned reference + the single source of [C] knobs.
-- Table DDL only; the knob VALUES and version rows are raw inputs/config seeded in seed.sql.

-- Config_Knobs: every threshold read BY NAME (k_anon_threshold, n_min_threshold,
-- tenure borders, TTL_baseline, D, ...). CLAUDE.md §3.8 — never a hard-coded literal.
create table catalog."Config_Knobs" (
  key         text primary key,
  value       text        not null,
  provenance  text        not null default '[C]',
  owner       text
);

-- Cohort_Rule_Version (04 §3.2): the "ML" rule version, stamped PER ROW elsewhere (A=B).
create table catalog."Cohort_Rule_Version" (
  version_id        text primary key,
  effective_date             date        not null,
  what_changed        text        not null,
  baseline_effect text,
  provenance        text        not null default '[C]'
);

-- Intent_Catalog (04 §3.4): FK target for intent across the model.
create table catalog."Intent_Catalog" (
  intent_id text primary key,
  label     text not null,
  version   text not null default 'v1'
);

-- Named_Query (04 §3.4): the deterministic "how-it-is-measured". Executor is ALWAYS SQL,
-- never an LLM (04 §2/§14). KPI.kpi_def_version points here.
create table catalog."Named_Query" (
  def_version  text primary key,
  formula      text not null,
  periodicity text not null,
  group_by     text not null,
  source_ref   text not null,
  unit         text not null
);

-- Knob readers BY NAME, fail-closed: a missing knob raises, never a silent default (04 §7).
create or replace function catalog.knob_num(p_key text)
returns numeric language sql stable as $$
  select case
    when not exists (select 1 from catalog."Config_Knobs" where key = p_key)
      then (select null::numeric where false)
    else (select value::numeric from catalog."Config_Knobs" where key = p_key)
  end;
$$;

create or replace function catalog.knob_required_num(p_key text)
returns numeric language plpgsql stable as $$
declare v numeric;
begin
  select value::numeric into v from catalog."Config_Knobs" where key = p_key;
  if v is null then
    raise exception 'Config_Knobs missing required knob: %', p_key;  -- fail-closed
  end if;
  return v;
end;
$$;

create or replace function catalog.knob_text(p_key text)
returns text language plpgsql stable as $$
declare v text;
begin
  select value into v from catalog."Config_Knobs" where key = p_key;
  if v is null then
    raise exception 'Config_Knobs missing required knob: %', p_key;  -- fail-closed
  end if;
  return v;
end;
$$;
