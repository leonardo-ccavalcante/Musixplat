import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { runRemeasureAllTenants } from "../../server/jobs/remeasure";
import type { PrecedentLever } from "../../server/diagnosis/precedent";

// 05D Part D — the CRON job that closes the loop unattended: runRemeasureAllTenants DISCOVERS every tenant
// with an acted+unverified case and re-measures it (tenant-scoped, §3.4) — the missing scheduled trigger that
// mints verified_fixed and activates precedent-first. It must NOT take a tenant arg (a cron has no session),
// must aggregate the 3-valued tally, and must be idempotent (a re-run touches no already-verified row, §14).
const W1 = "2026-05-25";
const REF = "2026-06-17";
const VERIFY_WEEK = "2026-06-01"; // W1 + resolution_verify_window (1 week, seeded knob)
let pool: pg.Pool;
let rid: string, tenantId: string, ver: string;

const exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]): Promise<T[]> =>
  pool.query<T>(sql, [...params]).then((r) => r.rows);

const leverA1 = (version: string, dimension = "m_connection"): PrecedentLever =>
  ({ action_code: "A1", dimension, verdict: "below", cohort_rule_version: version });

async function seedActedCase(lever: PrecedentLever, actedWeek = W1): Promise<string> {
  const r = await pool.query<{ kb_case_id: string }>(
    `insert into tenant."Knowledge_Case"
       (tenant_id, area_type, pattern, outcome, resolution, path_used, reviewed, verification_status, provenance_by_field, lever)
     values ($1,$2,'m_connection_below','resolved','reset the device',$3::jsonb,false,'unverified','{"outcome":"[C]"}'::jsonb,$4::jsonb)
     returning kb_case_id`,
    [tenantId, lever.dimension, JSON.stringify({ restaurant_id: rid, acted_week: actedWeek }), JSON.stringify(lever)],
  );
  return r.rows[0]!.kb_case_id;
}

async function seedVerifySnapshot(mConnection: number): Promise<void> {
  await pool.query(
    `insert into cohort."Cohort_Membership_Snapshot"
       (restaurant_id, cohort_id, week, cohort_rule_version, n_min_ok, k_anon_ok, m_connection, provenance)
     select restaurant_id, cohort_id, $2::date, cohort_rule_version, true, true, $3, provenance
       from cohort."Cohort_Membership_Snapshot"
      where restaurant_id=$1 and week=$4 and cohort_rule_version=$5`,
    [rid, VERIFY_WEEK, mConnection, W1, ver],
  );
}

const statusOf = async (id: string): Promise<string> =>
  (await pool.query<{ verification_status: string }>(
    `select verification_status from tenant."Knowledge_Case" where kb_case_id=$1`, [id],
  )).rows[0]!.verification_status;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
  const row = (await pool.query<{ restaurant_id: string; tenant_id: string; v: string }>(
    `select cms.restaurant_id, r.tenant_id, cms.cohort_rule_version as v
       from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id
      where cms.week=$1 and cms.m_connection < 0.55 order by cms.restaurant_id limit 1`,
    [W1],
  )).rows[0]!;
  rid = row.restaurant_id; tenantId = row.tenant_id; ver = row.v;
}, 120_000);

beforeEach(async () => {
  await pool.query(`delete from tenant."Knowledge_Case"`);
  await pool.query(`delete from cohort."Cohort_Membership_Snapshot" where week <> $1`, [W1]);
});
afterAll(async () => { await resetDb(pool); await pool.end(); });

describe("05D Part D — runRemeasureAllTenants (the scheduled trigger)", () => {
  it("DISCOVERS a tenant with a due case (no tenant arg) and mints verified_fixed", async () => {
    const id = await seedActedCase(leverA1(ver));
    await seedVerifySnapshot(0.95); // breach gone ⇒ 'ok' ⇒ verified_fixed (real fn_nba_test_all, §14)
    const out = await runRemeasureAllTenants(exec);
    expect(out.tenants).toBeGreaterThanOrEqual(1);
    expect(out.tally.verified_fixed).toBe(1);
    expect(await statusOf(id)).toBe("verified_fixed");
  });

  it("is IDEMPOTENT — a second run re-measures nothing already verified (§14)", async () => {
    await seedActedCase(leverA1(ver));
    await seedVerifySnapshot(0.95);
    await runRemeasureAllTenants(exec);
    const second = await runRemeasureAllTenants(exec);
    expect(second.tally.verified_fixed).toBe(0);
    expect(second.tally.verified_reopened).toBe(0);
    expect(second.tally.unmeasurable).toBe(0);
  });

  it("re-measures NOTHING when no tenant has a due case", async () => {
    const out = await runRemeasureAllTenants(exec);
    expect(out.tally.verified_fixed).toBe(0);
    expect(out.tally.verified_reopened).toBe(0);
  });
});
