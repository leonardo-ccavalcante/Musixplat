-- Query accuracy + tenant-contract hardening.
-- - New writes get DB-level restaurant↔tenant consistency for Conversation_Episode.
-- - min_calculation conversation provenance moves to tenant-safe episode_id.
-- - Read-path indexes match tenant-scoped latest-week, current-week deltas, and intent counts.

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_tenant_restaurant_uidx'
      and conrelid = 'tenant."Restaurant"'::regclass
  ) then
    alter table tenant."Restaurant"
      add constraint restaurant_tenant_restaurant_uidx unique (tenant_id, restaurant_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversation_episode_tenant_restaurant_fk'
      and conrelid = 'tenant."Conversation_Episode"'::regclass
  ) then
    alter table tenant."Conversation_Episode"
      add constraint conversation_episode_tenant_restaurant_fk
      foreign key (tenant_id, restaurant_id)
      references tenant."Restaurant"(tenant_id, restaurant_id)
      not valid;
  end if;
end $$;

alter table gov."min_calculation"
  add column if not exists episode_id text;

-- Preserve rows that were already using the tenant-safe key exactly. Ambiguous bare conversation_id
-- rows remain historical only; the NOT VALID check/FK below protects every new write.
update gov."min_calculation" m
  set episode_id = ce.episode_id
from tenant."Conversation_Episode" ce
where m.episode_id is null
  and m.conversation_id is not null
  and ce.episode_id = m.conversation_id;

alter table gov."min_calculation"
  drop constraint if exists min_calculation_origin_xor;

alter table gov."min_calculation"
  add constraint min_calculation_origin_xor
  check ((nba_id is not null) <> (episode_id is not null))
  not valid;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'min_calculation_episode_fk'
      and conrelid = 'gov."min_calculation"'::regclass
  ) then
    alter table gov."min_calculation"
      add constraint min_calculation_episode_fk
      foreign key (episode_id)
      references tenant."Conversation_Episode"(episode_id)
      not valid;
  end if;
end $$;

create index if not exists min_calculation_episode_idx
  on gov."min_calculation"(episode_id);

create index if not exists cohort_membership_version_week_rest_idx
  on cohort."Cohort_Membership_Snapshot"(cohort_rule_version, week desc, restaurant_id);

create index if not exists nba_event_version_week_rest_idx
  on cohort."Prioritized_NBA_Event"(cohort_rule_version, week, restaurant_id)
  include (evento_id, cohort_id, delta_status, percentile_in_cohort, gap_to_top);

create index if not exists conversation_tenant_rest_intent_idx
  on tenant."Conversation_Episode"(tenant_id, restaurant_id, intent)
  where intent is not null;

create index if not exists cohort_version_axes_idx
  on cohort."Cohort"(cohort_rule_version, tier_base, cuisine, zone);
