import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { makePool, resetDb, rows } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";

// nba.* tRPC routes: read-only verdicts, tenant resolved server-side, cross-tenant gated to empty (§3.4).
const W1 = "2026-05-25";
const REF = "2026-06-17";

function caller(tenantId: string) {
  const ctx: Context = {
    session: { user_id: "U", tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId: "U",
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;
beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
}, 120_000);
afterAll(async () => {
  await pool.end();
});

describe("nba.* routes — tenant-gated verdicts (§3.4)", () => {
  it("returns the funnel for the owning tenant; empty for a foreign tenant", async () => {
    const r = (
      await rows<{ restaurant_id: string; tenant_id: string }>(
        pool,
        `select restaurant_id, tenant_id from tenant."Restaurant"
         where restaurant_id in (select restaurant_id from cohort."Cohort_Membership_Snapshot" where week=$1)
         order by restaurant_id limit 1`,
        [W1],
      )
    )[0]!;
    const foreign = (
      await rows<{ tenant_id: string }>(pool, `select distinct tenant_id from tenant."Restaurant" where tenant_id <> $1 limit 1`, [
        r.tenant_id,
      ])
    )[0]!.tenant_id;

    const own = await caller(r.tenant_id).nba.testAll({ restaurant_id: r.restaurant_id, week: W1 });
    expect(own.length).toBe(8); // A1..A8
    expect(own.map((v) => v.action_code)).toContain("A1");

    const cross = await caller(foreign).nba.testAll({ restaurant_id: r.restaurant_id, week: W1 });
    expect(cross.length).toBe(0); // cross-tenant ⇒ empty, never a leak

    const single = await caller(r.tenant_id).nba.test({ restaurant_id: r.restaurant_id, action_code: "A1", week: W1 });
    expect(single?.action_code).toBe("A1");
    const crossSingle = await caller(foreign).nba.test({ restaurant_id: r.restaurant_id, action_code: "A1", week: W1 });
    expect(crossSingle).toBeNull();
  });
});
