import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { recordRelease } from "../../server/routers/cockpit";
import { sealMinCalculationNBA } from "../../server/conversation/min";

// 05A:A.5.3 — anti-fracturing on a HUMAN money RELEASE (04 §3.3/§7). Before a human releases a money action
// (financial_class direct|indirect) to a cohort, refuse if any member restaurant's recent order volume
// (window_silent) exceeds umbral_antifrac. Operational (none) actions skip; PAUSE skips. Rolled-back tx (§14).

const WEEK = "2026-06-15";
let pool: pg.Pool;
let version: string;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  version = (await pool.query<{ v: string }>(`select value v from catalog."Config_Knobs" where key='cohort_rule_version_current'`)).rows[0]!.v;
  // umbral_antifrac is seeded at 10000 (inert on the base); these fixtures cross it deliberately.
  await pool.query(`update catalog."Config_Knobs" set value='10000' where key='umbral_antifrac'`);
}, 120_000);
afterAll(async () => {
  await pool.end();
});

// Build a cohort + a single member restaurant with `volume` of recent order €, and a released-ready NBA
// proposal of `financialClass`. Returns the nba_id. All inside the caller's tx.
async function fixture(
  c: pg.PoolClient,
  suffix: string,
  volume: number,
  financialClass: "direct" | "indirect" | "none" | null,
  actionType: string,
): Promise<string> {
  const rid = `R-AF-${suffix}`;
  const cohort = `c_af_${suffix}`;
  await c.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine)
     values ($1,'POOL-001','long_tail','long_tail',date '2025-01-01','downtown','pizza')`,
    [rid],
  );
  // one recent order carrying the whole volume (within window_silent) ⇒ windowed sum = volume.
  await c.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone, cuisine)
     values ($1, current_date - 1, $2, 0, 'ok', 'downtown', 'pizza')`,
    [rid, volume],
  );
  await c.query(
    `insert into cohort."Cohort"(cohort_id, cuisine, zone, tier_base, cohort_rule_version)
     values ($1,'pizza','downtown','long_tail',$2)`,
    [cohort, version],
  );
  await c.query(
    `insert into cohort."Cohort_Membership_Snapshot"(restaurant_id, cohort_id, week, cohort_rule_version, provenance)
     values ($1,$2,$3,$4,'[V]')`,
    [rid, cohort, WEEK, version],
  );
  const nba = (
    await c.query<{ nba_id: string }>(
      `insert into gov."NBA_Proposal"(cohort_id, action_type, financial_class, cohort_rule_version)
       values ($1,$2,$3::public.financial_class,$4) returning nba_id::text as nba_id`,
      [cohort, actionType, financialClass, version],
    )
  ).rows[0]!.nba_id;
  // seal a LOW autonomy calc so recordRelease finds effective_level + calc_id.
  await sealMinCalculationNBA({ nbaId: nba, nbaRequest: "LOW", releasedEvals: "LOW", tierCap: "LOW" }, c);
  // a resolved policy for the tier (recordRelease fail-closes without one).
  await c.query(
    `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap) values ($1,'long_tail',$2,'MEDIUM')
     on conflict do nothing`,
    [`pt-af-${suffix}`, `pv-af-${suffix}`],
  );
  return nba;
}

const release = (nbaId: string) =>
  ({ tenantId: "POOL-001", operatorId: "U-OP-001", nbaId, action: "RELEASE" as const, resultingLevel: "LOW" as const });

describe("05A:A.5.3 — anti-fracturing gate on human money release", () => {
  it("BLOCKS a direct money release when a cohort restaurant's recent volume exceeds umbral_antifrac", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const nba = await fixture(c, "frac", 15000, "direct", "A3"); // 15000 > 10000 ⇒ fracturing
      await expect(recordRelease(release(nba), c)).rejects.toThrow(/anti-fracturing|umbral_antifrac/);
    } finally {
      await c.query("rollback");
      c.release();
    }
    // the block is audited on a separate connection ⇒ it survives the rolled-back tx (§3.4 fail-closed).
    // Security_Log is append-only (DELETE blocked by trigger), so we assert presence, scoped by kind.
    const log = await pool.query<{ n: string }>(
      `select count(*) n from gov."Security_Log" where kind='antifrac_block' and detail->>'cohort_id'='c_af_frac'`,
    );
    expect(Number(log.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  it("ALLOWS a direct money release when no restaurant breaches the threshold", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const nba = await fixture(c, "ok", 500, "direct", "A3"); // 500 < 10000 ⇒ clean
      const out = await recordRelease(release(nba), c);
      expect(out.effectiveLevel).toBe("LOW");
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("SKIPS the gate for a non-money (operational) action even on a fracturing cohort", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const nba = await fixture(c, "none", 15000, "none", "A1"); // breaches volume, but action moves no money
      const out = await recordRelease(release(nba), c);
      expect(out.effectiveLevel).toBe("LOW");
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("SKIPS the gate for an INDIRECT (propose-only) action — disburses nothing, not money-fracturable", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const nba = await fixture(c, "ind", 15000, "indirect", "A2"); // price recommendation: propose-only
      const out = await recordRelease(release(nba), c);
      expect(out.effectiveLevel).toBe("LOW");
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("FAILS CLOSED on a NULL/unknown financial_class — treats it as money and blocks (§3.7)", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const nba = await fixture(c, "nullfc", 15000, null, "A3"); // unknown class + breaches volume
      await expect(recordRelease(release(nba), c)).rejects.toThrow(/anti-fracturing|umbral_antifrac/);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("FAILS CLOSED when a gated release's cohort has no members in the proposal's version (no coalesce-to-0 slip)", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      // member exists only under an OLDER rule version (passes recordRelease's any-version presence check),
      // but the proposal is stamped with the CURRENT version, which has zero members.
      await c.query(`insert into catalog."Cohort_Rule_Version"(version_id, effective_date, what_changed) values ('v_old_af', date '2026-01-01', 'older') on conflict do nothing`);
      await c.query(`insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine) values ('R-AF-stale','POOL-001','long_tail','long_tail',date '2025-01-01','downtown','pizza')`);
      await c.query(`insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone, cuisine) values ('R-AF-stale', current_date - 1, 15000, 0, 'ok','downtown','pizza')`);
      await c.query(`insert into cohort."Cohort"(cohort_id, cuisine, zone, tier_base, cohort_rule_version) values ('c_af_stale','pizza','downtown','long_tail','v_old_af')`);
      await c.query(`insert into cohort."Cohort_Membership_Snapshot"(restaurant_id, cohort_id, week, cohort_rule_version, provenance) values ('R-AF-stale','c_af_stale',$1,'v_old_af','[V]')`, [WEEK]);
      const nba = (
        await c.query<{ nba_id: string }>(
          `insert into gov."NBA_Proposal"(cohort_id, action_type, financial_class, cohort_rule_version)
           values ('c_af_stale','A3','direct'::public.financial_class,$1) returning nba_id::text as nba_id`,
          [version],
        )
      ).rows[0]!.nba_id;
      await sealMinCalculationNBA({ nbaId: nba, nbaRequest: "LOW", releasedEvals: "LOW", tierCap: "LOW" }, c);
      await c.query(`insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap) values ('pt-af-stale','long_tail','pv-af-stale','MEDIUM') on conflict do nothing`);
      await expect(recordRelease(release(nba), c)).rejects.toThrow(/no current members|fail-closed/);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
