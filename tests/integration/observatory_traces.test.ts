import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { makePool, resetDb } from "../helpers/db";

function caller(t: string, u: string) {
  const ctx: Context = { session: { user_id: u, tenant_id: t, org_level: "team" }, tenantId: t, userId: u };
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

describe("observatory.traces — auto-origin only, scoped by Action_Dispatch.tenant_id", () => {
  it("returns the running pool's auto traces and renders NULL result fields honestly", async () => {
    const res = await caller("POOL-PAY", "U-PAY-001").observatory.traces();
    expect(Array.isArray(res)).toBe(true);
    // every returned row is an auto-origin governance trace; NULL result fields stay null (never 0)
    for (const t of res) {
      expect(["release", "pause", "override"]).toContain(t.action);
      if (t.timeToSignatureSec === null) expect(t.timeToSignatureSec).toBeNull();
    }
    // a foreign pool's caller never sees POOL-PAY's auto traces
    const foreign = await caller("POOL-002", "U-OP-002").observatory.traces();
    const ids = new Set(foreign.map((t) => t.traceId));
    for (const t of res) expect(ids.has(t.traceId)).toBe(false);
  });
});
