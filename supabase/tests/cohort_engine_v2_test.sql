-- pgTAP — Chunk 2 composite cohort engine (F-1.1 v2 + F-1.2 v2). Small deterministic fixture in a
-- throwaway 'vtest' version + one cell (sushi × downtown × long_tail). Connection/quality/cancel are
-- held equal across the 6 restaurants, so the COMPOSITE ordering is driven purely by order volume
-- (weight 0.40) — a clean, predictable check of percentile + tercile subgroup. begin/rollback.
begin;
select plan(8);

-- Isolation: the live DB holds the 5000-restaurant seed and fn_assign_cohorts has no restaurant
-- filter (it ranks ALL restaurants). Truncate the brutos so ONLY this fixture is processed —
-- transactional, restored on rollback. Cohort tables cleared too (no stray 5000 cells).
truncate tenant."Restaurant", tenant."Order", tenant."Weekly_Connection",
         cohort."Cohort", cohort."Subgroup", cohort."Cohort_Membership_Snapshot" cascade;

insert into catalog."Cohort_Rule_Version"(version_id, effective_date, what_changed)
  values ('vtest', date '2026-06-01', 'test');
-- pin the vigente version to vtest so the producers operate on this fixture
update catalog."Config_Knobs" set value = 'vtest' where key = 'cohort_rule_version_current';

-- 6 comparable restaurants (same cell). signup old so tenure_months computes.
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
select 'RV' || g, 'POOLT', 'long_tail', 'long_tail', date '2025-01-01', 'downtown', 'sushi', 40
from generate_series(1, 6) g;

-- order volume = the rank driver: RV1 has 1 'ok' order ... RV6 has 6. All photo+desc true, none failed
-- ⇒ quality/cancel equal; no connection rows ⇒ connection equal. Composite ordering = volume ordering.
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, has_photo, has_description)
select 'RV' || g, date '2026-06-01', 50, 10, 'ok', true, true
from generate_series(1, 6) g
cross join lateral generate_series(1, g) k;

-- connection brutos (equal across the 6 ⇒ doesn't affect ordering, but required: §14 ranks only
-- restaurants with complete brutos = orders AND connection).
insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
select 'RV' || g, date '2026-06-15', 30, 40 from generate_series(1, 6) g;

select cohort.fn_assign_cohorts(date '2026-06-17', date '2026-06-17');
select cohort.fn_rank_cohort(date '2026-06-17');

-- every restaurant got a membership in the one cell
select is((select count(*)::int from cohort."Cohort_Membership_Snapshot"
           where cohort_rule_version='vtest'), 6, 'F-1.1: 6 memberships in the cell');
select is((select count(distinct cohort_id)::int from cohort."Cohort_Membership_Snapshot"
           where cohort_rule_version='vtest'), 1, 'F-1.1: one comparable cell (cuisine×zone×tier)');

-- composite percentile: most orders ⇒ top (100), fewest ⇒ bottom (0)
select is((select percentile_in_cohort from cohort."Cohort_Membership_Snapshot" where restaurant_id='RV6'),
          100.00::numeric, 'F-1.2: highest-volume = percentile 100');
select is((select percentile_in_cohort from cohort."Cohort_Membership_Snapshot" where restaurant_id='RV1'),
          0.00::numeric, 'F-1.2: lowest-volume = percentile 0');
select ok((select percentile_in_cohort from cohort."Cohort_Membership_Snapshot" where restaurant_id='RV4')
        > (select percentile_in_cohort from cohort."Cohort_Membership_Snapshot" where restaurant_id='RV2'),
          'F-1.2: percentile is monotonic in the composite');

-- tercile subgroup: top band → _top, bottom band → _low
select is((select right(subgroup_id, 4) from cohort."Cohort_Membership_Snapshot" where restaurant_id='RV6'),
          '_top', 'F-1.1: top tercile → top subgroup');
select is((select right(subgroup_id, 4) from cohort."Cohort_Membership_Snapshot" where restaurant_id='RV1'),
          '_low', 'F-1.1: bottom tercile → low subgroup');

-- gap_to_top: the top restaurant has zero gap
select is((select gap_to_top from cohort."Cohort_Membership_Snapshot" where restaurant_id='RV6'),
          0.0000::numeric, 'F-1.2: top has zero gap_to_top');

select * from finish();
rollback;
