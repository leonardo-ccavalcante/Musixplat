import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// 05B operability (Gate 1) — diagnosis.run: the PRODUCT (UI/backend) triggers the orchestrator in-product,
// NOT via the run-05b script. Proves the spine is human-commandable. Fixture mirrors diagnosis_read:
// 4 failed-payment restaurants in POOL-RUN, 2 complainants ⇒ affected 4 / silent 2 / €320.
// Invariants: produced counts (never seeded), idempotent re-run (fn_hunt_silent ON CONFLICT DO NOTHING +
// UPDATE-only writes), fail-closed cross-pool (BR-B6 → Security_Log) and unknown-problem.

function caller(tenantId: string, userId = "U-OP-001") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

async function seedProblem(): Promise<string> {
  await pool.query(`
    insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
    values ('R-RUN-1','POOL-RUN','long_tail','long_tail', date '2026-01-01','Centro'),
           ('R-RUN-2','POOL-RUN','long_tail','long_tail', date '2026-01-01','Centro'),
           ('R-RUN-3','POOL-RUN','long_tail','long_tail', date '2026-01-01','Centro'),
           ('R-RUN-4','POOL-RUN','long_tail','long_tail', date '2026-01-01','Norte');
    insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
    values ('R-RUN-1', current_date, 100, 20, 'failed','Centro'),
           ('R-RUN-2', current_date, 100, 20, 'failed','Centro'),
           ('R-RUN-3', current_date, 100, 20, 'failed','Centro'),
           ('R-RUN-4', current_date, 100, 20, 'failed','Norte');
    insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
    values ('R-RUN-1:C1','R-RUN-1:conv1','POOL-RUN','R-RUN-1','billing'),
           ('R-RUN-2:C1','R-RUN-2:conv1','POOL-RUN','R-RUN-2','billing');
  `);
  const r = await pool.query<{ problem_id: string }>(`
    insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
    values ('POOL-RUN','R-RUN-1','R-RUN-1:conv1','critical','open') returning problem_id;`);
  return r.rows[0]!.problem_id;
}

beforeAll(async () => {
  pool = makePool();
}, 60_000);
beforeEach(async () => {
  await resetDb(pool);
});
afterAll(async () => {
  await pool.end();
});

describe("05B Gate 1 — diagnosis.run (product triggers the orchestrator in-product)", () => {
  it("runs the motor and returns PRODUCED counts (never seeded)", async () => {
    const problemId = await seedProblem();
    const out = await caller("POOL-RUN").diagnosis.run({ problemId });
    expect(out.problem_id).toBe(problemId);
    expect(out.area_type).toBe("finance");
    expect(out.affected).toBe(4); // produced by fn_hunt_silent
    expect(out.silent).toBe(2);
    expect(out.revenue_lost).toBe(320); // Named_Query output
    expect(out.route).toBe("fix_internal");
  });

  it("is idempotent — a second run does NOT duplicate Affected or Diagnosed_Problem", async () => {
    const problemId = await seedProblem();
    await caller("POOL-RUN").diagnosis.run({ problemId });
    await caller("POOL-RUN").diagnosis.run({ problemId });
    const af = await pool.query<{ n: number }>(
      `select count(*)::int n from tenant."Affected" where problem_id = $1`,
      [problemId],
    );
    expect(af.rows[0]!.n).toBe(4);
    const pr = await pool.query<{ n: number }>(
      `select count(*)::int n from tenant."Diagnosed_Problem" where tenant_id = 'POOL-RUN'`,
    );
    expect(pr.rows[0]!.n).toBe(1);
  });

  it("BR-B6 fail-closed: a foreign pool cannot run another pool's problem (+ Security_Log)", async () => {
    const problemId = await seedProblem();
    await expect(caller("POOL-OTHER").diagnosis.run({ problemId })).rejects.toThrow();
    const log = await pool.query<{ n: number }>(
      `select count(*)::int n from gov."Security_Log" where tenant_id = 'POOL-OTHER' and kind = 'cross_pool'`,
    );
    expect(log.rows[0]!.n).toBeGreaterThan(0);
  });

  it("fail-closed: unknown problem id rejects", async () => {
    await seedProblem();
    await expect(
      caller("POOL-RUN").diagnosis.run({ problemId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow();
  });
});
