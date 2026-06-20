import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows, count } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

function caller(tenantId = "POOL-001", userId = "U-OP-001") {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
  return appRouter.createCaller(ctx);
}
let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); }, 60_000);
afterAll(async () => { await pool.end(); });

describe("cohorts.run derives window from data (any dates work)", () => {
  it("ranks a base whose orders are far from the old hardcoded 2026-06 window", async () => {
    await pool.query(`update tenant."Order" set order_date = order_date - interval '2 years'`);
    await pool.query(`update tenant."Weekly_Connection" set week = week - interval '2 years'`);
    await pool.query(`update tenant."Restaurant" set signup_date = signup_date - interval '2 years'`);
    const r = await caller().cohorts.run();
    const maxd = (await rows<{ d: string }>(pool, `select max(order_date)::text d from tenant."Order"`))[0]!.d;
    expect(r.weeks[1]).toBe(maxd);
    expect(r.cohorts).toBeGreaterThan(0);
    const ranked = await count(pool, 'cohort."Cohort_Membership_Snapshot" where percentile_in_cohort is not null');
    expect(ranked).toBeGreaterThan(0);
  }, 90_000);
});
