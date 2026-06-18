-- Clean-slate preamble for a full local rebuild (drops everything our migrations create, so
-- re-applying from scratch never hits "already exists"). Bypasses the flaky supabase CLI healthcheck.
drop schema if exists catalog, tenant, cohort, gov cascade;

-- Drop ALL enum types in public (every custom enum across slices is an enum here).
do $$
declare t record;
begin
  for t in
    select tp.typname
    from pg_type tp
    join pg_namespace n on n.oid = tp.typnamespace
    where n.nspname = 'public' and tp.typtype = 'e'
  loop
    execute format('drop type if exists public.%I cascade', t.typname);
  end loop;
end $$;

drop function if exists public.det_int(text, integer, integer);
drop function if exists public.tg_append_only() cascade;
