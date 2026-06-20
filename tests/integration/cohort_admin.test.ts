import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

function caller(tenantId = "POOL-001", userId = "U-OP-001") {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
  return appRouter.createCaller(ctx);
}
let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); }, 60_000);
afterAll(async () => { await pool.end(); });

describe("cohorts.clearBusinessData", () => {
  it("wipes business + cohort tables but PRESERVES catalog + users", async () => {
    expect(await count(pool, 'tenant."Restaurant"')).toBeGreaterThan(0);
    const r = await caller().cohorts.clearBusinessData();
    expect(r.cleared).toBe(true);
    expect(await count(pool, 'tenant."Restaurant"')).toBe(0);
    expect(await count(pool, 'tenant."Order"')).toBe(0);
    expect(await count(pool, 'tenant."Weekly_Connection"')).toBe(0);
    expect(await count(pool, 'cohort."Cohort"')).toBe(0);
    expect(await count(pool, 'cohort."Cohort_Membership_Snapshot"')).toBe(0);
    expect(await count(pool, 'catalog."Config_Knobs"')).toBeGreaterThan(0);
    expect(await count(pool, 'catalog."Cohort_Rule_Version"')).toBeGreaterThan(0);
    expect(await count(pool, 'gov."User"')).toBeGreaterThan(0);
  }, 60_000);
});
