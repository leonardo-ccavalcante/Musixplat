-- pgTAP — deterministic producers + gates (CLAUDE.md §1 test:sql). Runs in a transaction;
-- uses a throwaway 'vtest' version so fixtures never collide with live cohorts.
begin;
select plan(9);

-- det_int is deterministic (same key/salt/hi ⇒ same value), in range.
select is(public.det_int('R001', 7, 100), public.det_int('R001', 7, 100), 'det_int deterministic');
select ok(public.det_int('R001', 7, 100) >= 0 and public.det_int('R001', 7, 100) < 100, 'det_int in [0,100)');

-- net_value is GENERATED arithmetic (bruto - fee), not a seeded result.
insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
  values ('RT01','POOLT','long_tail','long_tail', date '2025-01-01');
insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status)
  values ('RT01', date '2026-06-01', 100.00, 20.00, 'ok');
select is((select net_value from tenant."Order" where restaurant_id='RT01'), 80.00::numeric, 'net_value = bruto - fee');

insert into catalog."Cohort_Rule_Version"(version_id, effective_date, what_changed) values ('vtest', date '2026-06-01', 'test');

-- F-1.3b k-anon boundary (k=5): below suppresses, at/above passes, NULL fail-closed.
insert into cohort."Cohort"(cohort_id, tenure_bucket, tier_base, cohort_rule_version, n_accounts)
  values ('ck4','0-3m','long_tail','vtest',4), ('ck5','3-6m','long_tail','vtest',5), ('cknull','6-12m','long_tail','vtest',null);
select cohort.fn_gate_k_anon(null, 'vtest');
select is((select k_suppression_applied from cohort."Cohort" where cohort_id='ck4'), true, 'k-anon: n<5 suppresses');
select is((select k_suppression_applied from cohort."Cohort" where cohort_id='ck5'), false, 'k-anon: n>=5 passes');
select is((select k_suppression_applied from cohort."Cohort" where cohort_id='cknull'), true, 'k-anon: NULL fail-closed');

-- F-1.3 n_min boundary (20) — SEPARATE constraint from k-anon.
insert into cohort."Cohort"(cohort_id, tenure_bucket, tier_base, cohort_rule_version, n_accounts)
  values ('cn19','12m+','long_tail','vtest',19), ('cn20','0-3m','managed_brand','vtest',20);
select cohort.fn_gate_n_min(date '2026-05-25', 'vtest');
select is((select collapsed from cohort."Cohort" where cohort_id='cn19'), true, 'n_min: n<20 collapses');
select is((select collapsed from cohort."Cohort" where cohort_id='cn20'), false, 'n_min: n>=20 ok');

-- F-4.3 anti-mix raises on mixed versions.
select throws_ok($$ select cohort.fn_assert_single_version(array['v1','v0']) $$, '23514', null, 'anti-mix raises');

select * from finish();
rollback;
