import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows, count } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// F-5.2 — handoff via the tRPC caller: server-side tenant, exactly-one event, Usage_Event append,
// idempotency, cross-pool block. Payload round-trips against 02:1A {cohort_id, restaurant_id}.

const W1 = "2026-05-25";
const REF = "2026-06-17";

let pool: pg.Pool;
let cohortId: string;

function caller(tenantId: string, userId: string) {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "equipo" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
  const r = await rows<{ cohort_id: string }>(
    pool,
    `select cohort_id from cohort."Cohort_Membership_Snapshot" where restaurant_id='R001' and week=$1`,
    [W1],
  );
  cohortId = r[0]!.cohort_id;
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("F-5.2 handoff", () => {
  it("emits exactly one Prioritized_NBA_Event + appends Usage_Event (tenant server-side)", async () => {
    const ev = await caller("POOL-001", "U-OP-001").handoff.confirm({
      restaurant_id: "R001",
      cohort_id: cohortId,
      week: W1,
    });
    expect(ev?.operator_id).toBe("U-OP-001");
    // payload round-trip vs 02:1A: both keys present
    expect(ev?.cohort_id).toBe(cohortId);
    expect(ev?.restaurant_id).toBe("R001");

    expect(
      await count(pool, `cohort."Prioritized_NBA_Event" where restaurant_id='R001' and week='${W1}'`),
    ).toBe(1);
    expect(
      await count(pool, `tenant."Usage_Event" where restaurant_id='R001' and event_type='handoff'`),
    ).toBe(1);
  });

  it("is idempotent on double-click — still exactly one event", async () => {
    await caller("POOL-001", "U-OP-001").handoff.confirm({ restaurant_id: "R001", cohort_id: cohortId, week: W1 });
    await caller("POOL-001", "U-OP-001").handoff.confirm({ restaurant_id: "R001", cohort_id: cohortId, week: W1 });
    expect(
      await count(pool, `cohort."Prioritized_NBA_Event" where restaurant_id='R001' and week='${W1}'`),
    ).toBe(1);
  });

  it("blocks cross-pool handoff (FORBIDDEN) + writes a security log", async () => {
    const before = await count(pool, `gov."Security_Log" where kind='cross_pool'`);
    await expect(
      caller("POOL-002", "U-OP-002").handoff.confirm({ restaurant_id: "R001", cohort_id: cohortId, week: W1 }),
    ).rejects.toThrow(/cross-pool/);
    expect(await count(pool, `gov."Security_Log" where kind='cross_pool'`)).toBe(before + 1);
  });

  it("rejects with no session (fail-closed tenant guard)", async () => {
    const anon = appRouter.createCaller({ session: null, tenantId: null, userId: null });
    await expect(
      anon.handoff.confirm({ restaurant_id: "R001", cohort_id: cohortId, week: W1 }),
    ).rejects.toThrow();
  });
});
