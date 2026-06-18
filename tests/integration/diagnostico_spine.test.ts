import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// 05B spine — US-B1.1.1 (gate tenant_id + restaurant_id, fail-closed) + B.1.3 (dedup
// create-or-increment). Hits the local DB via the tRPC caller, mirroring conversation_spine.test.ts.

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
  await resetDb(pool); // seeds R001 in POOL-001 + a POOL-002 cohort
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("05B:US-B1.1.1 + B.1.3 — gate + dedup create-or-increment", () => {
  it("anti-fake §14: Diagnosed_Problem is empty pre-run", async () => {
    expect(await count(pool, `tenant."Diagnosed_Problem"`)).toBe(0);
  });

  it("creates ONE open problem (tenant from session), then increments frequency on repeat", async () => {
    const a = await caller("POOL-001", "U-OP-001").diagnostico.reportProblem({
      restaurantId: "R001",
      criticality: "critical",
    });
    expect(a.created).toBe(true);
    expect(a.frequency).toBe(1);
    expect(a.status).toBe("open");

    const b = await caller("POOL-001", "U-OP-001").diagnostico.reportProblem({ restaurantId: "R001" });
    expect(b.created).toBe(false); // B.1.3: same case, no duplicate
    expect(b.frequency).toBe(2); // frequency is a computed count
    expect(b.problem_id).toBe(a.problem_id);
    expect(await count(pool, `tenant."Diagnosed_Problem" where restaurant_id='R001'`)).toBe(1);
  });

  it("US-B1.1.1 fail-closed: unknown restaurant_id rejects (never creates)", async () => {
    await expect(
      caller("POOL-001", "U-OP-001").diagnostico.reportProblem({ restaurantId: "R-NOPE" }),
    ).rejects.toThrow();
    expect(await count(pool, `tenant."Diagnosed_Problem" where restaurant_id='R-NOPE'`)).toBe(0);
  });

  it("BR-B6 hard-no: cross-pool report aborts + writes a cross_pool Security_Log", async () => {
    const before = await count(pool, `gov."Security_Log" where kind='cross_pool'`);
    await expect(
      caller("POOL-002", "U-OP-002").diagnostico.reportProblem({ restaurantId: "R001" }),
    ).rejects.toThrow();
    expect(await count(pool, `gov."Security_Log" where kind='cross_pool'`)).toBe(before + 1);
  });

  it("fail-closed: no session ⇒ reject (tenantProcedure)", async () => {
    const anon = appRouter.createCaller({ session: null, tenantId: null, userId: null });
    await expect(anon.diagnostico.reportProblem({ restaurantId: "R001" })).rejects.toThrow();
  });
});
