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
    expect(await count(pool, 'cohort."Subgroup"')).toBe(0);
    expect(await count(pool, 'cohort."Prioritized_NBA_Event"')).toBe(0);
    expect(await count(pool, 'tenant."Conversation_Episode"')).toBe(0);
    expect(await count(pool, 'catalog."Config_Knobs"')).toBeGreaterThan(0);
    expect(await count(pool, 'catalog."Cohort_Rule_Version"')).toBeGreaterThan(0);
    expect(await count(pool, 'gov."User"')).toBeGreaterThan(0);
  }, 60_000);
});

describe("cohorts.generateExample", () => {
  it("clears then generates a dimensioned base; Run Flow then ranks (gates pass)", async () => {
    const g = await caller().cohorts.generateExample({ restaurants: 1500 });
    expect(g.restaurants).toBe(1500);
    expect(await count(pool, 'tenant."Restaurant"')).toBe(1500);
    expect(await count(pool, `tenant."Restaurant" where tenure_months is not null`)).toBe(0); // §14 pre-run
    const r = await caller().cohorts.run();
    expect(r.cohorts).toBeGreaterThan(0);
    const ranked = await count(pool, 'cohort."Cohort_Membership_Snapshot" where percentile_in_cohort is not null');
    expect(ranked).toBeGreaterThan(0);
  }, 120_000);
});
