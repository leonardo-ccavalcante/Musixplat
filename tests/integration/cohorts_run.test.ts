import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows, count } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// 01 operability — cohorts.run: the PRODUCT triggers the P01 batch in-product (no `pnpm db:p01` terminal),
// mirroring diagnosis.run (Gate 1). Proves the Cohorts Explorer is human-commandable for a demo. Numbers are
// PRODUCED by the SQL producers over the seeded population (never seeded as results, §14); deterministic ⇒
// a re-run does not duplicate memberships.
function caller(tenantId: string, userId = "U-OP-001") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;
let tenant: string;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  tenant = (
    await rows<{ tenant_id: string }>(
      pool,
      `select tenant_id from tenant."Restaurant" group by tenant_id order by count(*) desc limit 1`,
    )
  )[0]!.tenant_id;
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("01 cohorts.run — product-triggered P01", () => {
  it("pre-run: cohort results are empty (anti-fake §14)", async () => {
    expect(await count(pool, 'cohort."Cohort_Membership_Snapshot"')).toBe(0);
  });

  it("run PRODUCES real cohorts + memberships, and the read surface fills", async () => {
    const r = await caller(tenant).cohorts.run();
    expect(r.weeks).toEqual(["2026-05-25", "2026-06-15"]);
    expect(r.memberships).toBeGreaterThan(0);
    expect(r.cohorts).toBeGreaterThan(0);
    expect(await count(pool, 'cohort."Cohort_Membership_Snapshot"')).toBeGreaterThan(0);
    const list = await caller(tenant).cohorts.list();
    expect(list.length).toBeGreaterThan(0);
  }, 60_000);

  it("idempotent — a second run does not duplicate memberships (deterministic)", async () => {
    const before = await count(pool, 'cohort."Cohort_Membership_Snapshot"');
    await caller(tenant).cohorts.run();
    const after = await count(pool, 'cohort."Cohort_Membership_Snapshot"');
    expect(after).toBe(before);
  }, 60_000);
});
