import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { makePool, resetDb, rows } from "../helpers/db";

function caller(tenantId: string, userId: string) {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("cohort read routes — tenant-scoped latest week + current deltas", () => {
  it("does not let another tenant's newer snapshot hide this tenant's data", async () => {
    const pool2 = (await rows<{ restaurant_id: string }>(
      pool,
      `select restaurant_id from tenant."Restaurant" where tenant_id='POOL-002' order by restaurant_id limit 1`,
    ))[0]!;

    await pool.query(
      `insert into cohort."Cohort"(cohort_id, cuisine, zone, tier_base, cohort_rule_version)
       values ('c_read', 'pizza', 'north', 'long_tail', 'v1')`,
    );
    await pool.query(
      `insert into cohort."Cohort_Membership_Snapshot"
         (restaurant_id, cohort_id, week, cohort_rule_version, percentile_in_cohort, gap_to_top, provenance)
       values
         ('R001', 'c_read', '2026-06-22', 'v1', 50, 0.5, '[V]'),
         ($1,    'c_read', '2026-06-15', 'v1', 60, 0.4, '[V]')`,
      [pool2.restaurant_id],
    );

    const drill = await caller("POOL-002", "U-OP-002").cohorts.drill({ cohort_id: "c_read" });
    expect(drill).toHaveLength(1);
    expect(drill[0]?.restaurant_id).toBe(pool2.restaurant_id);
    expect(drill[0]?.week).toBe("2026-06-15");

    await pool.query(
      `insert into cohort."Cohort_Membership_Snapshot"
         (restaurant_id, cohort_id, week, cohort_rule_version, percentile_in_cohort, gap_to_top, provenance)
       values ($1, 'c_read', '2026-06-22', 'v1', 30, 0.8, '[V]')`,
      [pool2.restaurant_id],
    );
    await pool.query(
      `insert into cohort."Prioritized_NBA_Event"
         (restaurant_id, cohort_id, week, cohort_rule_version, delta_status, percentile_in_cohort, gap_to_top)
       values
         ($1, 'c_read', '2026-06-15', 'v1', 'percentile_down', 60, 0.4),
         ($1, 'c_read', '2026-06-22', 'v1', 'at_risk',         30, 0.8)`,
      [pool2.restaurant_id],
    );

    const deltas = await caller("POOL-002", "U-OP-002").cohorts.deltas();
    expect(deltas).toHaveLength(1);
    expect(deltas[0]?.week).toBe("2026-06-22");
    expect(deltas[0]?.delta_status).toBe("at_risk");

    // Read-only polish exposes (additive — no P02 handoff contract change):
    // deltas carries percentile_delta (F-2.4 why-it-moved); list carries freshness_ts + stale (BR-12).
    expect(deltas[0]).toHaveProperty("percentile_delta");

    const list = await caller("POOL-002", "U-OP-002").cohorts.list();
    const cread = list.find((c) => c.cohort_id === "c_read");
    expect(cread).toBeDefined();
    expect(cread).toHaveProperty("freshness_ts");
    expect(typeof cread!.stale).toBe("boolean");
    expect(cread!.stale).toBe(true); // freshness_ts NULL ⇒ fn_is_stale fail-closed ⇒ stale
  });
});
