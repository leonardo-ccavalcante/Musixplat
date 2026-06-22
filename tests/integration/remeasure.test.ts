import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { verifyResolutions } from "../../server/motor/remeasure";
import { readGrounding } from "../../server/motor/learn";
import type { PrecedentLever } from "../../server/diagnosis/precedent";

// 05D Part D — prove-it-resolved re-measurement, end-to-end against REAL fn_nba_test_all numbers (§14: the
// verdict is SQL, never crafted). An acted+unverified Knowledge_Case is re-measured a window later: a breach
// that became 'ok' ⇒ verified_fixed (STRONG precedent + activates Part B); still breaching ⇒ verified_reopened;
// no W+window data / failed gate ⇒ unmeasurable (re-queue, never auto-resolved). Plus the §3.4/§3.5/§59 guards.
const W1 = "2026-05-25";
const REF = "2026-06-17";
const VERIFY_WEEK = "2026-06-01"; // W1 + resolution_verify_window (1 week, seeded knob)
let pool: pg.Pool;
let rid: string, tenantId: string, ver: string;

const exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]): Promise<T[]> =>
  pool.query<T>(sql, [...params]).then((r) => r.rows);

const leverA1 = (version: string, dimension = "m_connection"): PrecedentLever =>
  ({ action_code: "A1", dimension, verdict: "below", cohort_rule_version: version });

// Seed one acted+unverified motor case (what writeMotorCase produces) with its re-measure target in path_used.
async function seedActedCase(lever: PrecedentLever, tenant = tenantId, restaurant = rid): Promise<string> {
  const r = await pool.query<{ kb_case_id: string }>(
    `insert into tenant."Knowledge_Case"
       (tenant_id, area_type, pattern, outcome, resolution, path_used, reviewed, verification_status, provenance_by_field, lever)
     values ($1,$2,'m_connection_below','resolved','reset the device',$3::jsonb,false,'unverified','{"outcome":"[C]"}'::jsonb,$4::jsonb)
     returning kb_case_id`,
    [tenant, lever.dimension, JSON.stringify({ restaurant_id: restaurant, acted_week: W1 }), JSON.stringify(lever)],
  );
  return r.rows[0]!.kb_case_id;
}

// Craft the verify-week snapshot row (copy the real W1 row, override the signal + gates) so fn_nba_test_all
// measures a CONTROLLED outcome at W+window. m_connection high ⇒ 'ok' (fixed); low ⇒ 'below' (reopened).
async function seedVerifySnapshot(mConnection: number, nMinOk = true, kAnonOk = true): Promise<void> {
  await pool.query(
    `insert into cohort."Cohort_Membership_Snapshot"
       (restaurant_id, cohort_id, week, cohort_rule_version, n_min_ok, k_anon_ok, m_connection, provenance)
     select restaurant_id, cohort_id, $2::date, cohort_rule_version, $3, $4, $5, provenance
       from cohort."Cohort_Membership_Snapshot"
      where restaurant_id=$1 and week=$6 and cohort_rule_version=$7`,
    [rid, VERIFY_WEEK, nMinOk, kAnonOk, mConnection, W1, ver],
  );
}

const statusOf = async (id: string): Promise<{ verification_status: string; prov: unknown }> => {
  const r = await pool.query<{ verification_status: string; provenance_by_field: unknown }>(
    `select verification_status, provenance_by_field from tenant."Knowledge_Case" where kb_case_id=$1`, [id],
  );
  return { verification_status: r.rows[0]!.verification_status, prov: r.rows[0]!.provenance_by_field };
};

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
  // A real connection-problem restaurant of a real pool (so it has a W1 snapshot + a tenant).
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

describe("05D Part D — verifyResolutions (prove-it-resolved, 3-valued)", () => {
  it("verified_fixed — the breach is GONE at W+window (measured 'ok') ⇒ STRONG precedent, [V] stamped", async () => {
    const id = await seedActedCase(leverA1(ver));
    await seedVerifySnapshot(0.95); // m_connection well above standard ⇒ 'ok'
    const tally = await verifyResolutions(tenantId, exec);
    expect(tally.verified_fixed).toBe(1);
    const s = await statusOf(id);
    expect(s.verification_status).toBe("verified_fixed");
    expect((s.prov as Record<string, string>).verification_status).toBe("[V]"); // the ONLY [V] field
  });

  it("verified_reopened — still breaching at W+window (measured 'below') ⇒ NOT reused (negative precedent)", async () => {
    const id = await seedActedCase(leverA1(ver));
    await seedVerifySnapshot(0.05); // m_connection below standard ⇒ 'below' persists
    const tally = await verifyResolutions(tenantId, exec);
    expect(tally.verified_reopened).toBe(1);
    expect((await statusOf(id)).verification_status).toBe("verified_reopened");
  });

  it("unmeasurable — NO W+window snapshot (no_data) ⇒ stays unverified, re-queued (§14, never auto-resolve)", async () => {
    const id = await seedActedCase(leverA1(ver)); // no seedVerifySnapshot ⇒ fn_nba_test_all = no_data
    const tally = await verifyResolutions(tenantId, exec);
    expect(tally.unmeasurable).toBe(1);
    expect((await statusOf(id)).verification_status).toBe("unverified");
  });

  it("unmeasurable — a suppressed cell (n_min_ok=false) is never resolved on absent data (§14/§3.2)", async () => {
    const id = await seedActedCase(leverA1(ver));
    await seedVerifySnapshot(0.95, false); // would be 'ok' but the gate fails ⇒ unmeasurable
    const tally = await verifyResolutions(tenantId, exec);
    expect(tally.unmeasurable).toBe(1);
    expect((await statusOf(id)).verification_status).toBe("unverified");
  });

  it("§59 carve-out — a zone-shared signal is NEVER auto-verified (non-attributable → human)", async () => {
    const id = await seedActedCase(leverA1(ver, "zone_demand_trend"));
    await seedVerifySnapshot(0.95);
    const tally = await verifyResolutions(tenantId, exec);
    expect(tally.skipped_non_attributable).toBe(1);
    expect(tally.verified_fixed).toBe(0);
    expect((await statusOf(id)).verification_status).toBe("unverified");
  });

  it("§3.5 anti-mezcla — a case acted under an OLD baseline is never re-measured against the current one", async () => {
    const id = await seedActedCase(leverA1("v0")); // verified under v0, current is v1 ⇒ filtered out
    await seedVerifySnapshot(0.95);
    const tally = await verifyResolutions(tenantId, exec);
    expect(tally.verified_fixed + tally.verified_reopened + tally.unmeasurable).toBe(0);
    expect((await statusOf(id)).verification_status).toBe("unverified");
  });

  it("§3.4 tenant-scoped — another pool's verifyResolutions never touches this case", async () => {
    const id = await seedActedCase(leverA1(ver));
    await seedVerifySnapshot(0.95);
    await verifyResolutions("tenant-nobody", exec);
    expect((await statusOf(id)).verification_status).toBe("unverified");
  });

  it("RL-guard split — a verified_fixed case grounds future runs even though reviewed=false (decision #2/#3)", async () => {
    await seedActedCase(leverA1(ver));
    await seedVerifySnapshot(0.95);
    await verifyResolutions(tenantId, exec);
    const grounding = await pool.connect().then(async (c) => {
      try { return await readGrounding(tenantId, ["m_connection"], c); } finally { c.release(); }
    });
    expect(grounding.some((g) => g.resolution === "reset the device")).toBe(true);
  });
});
