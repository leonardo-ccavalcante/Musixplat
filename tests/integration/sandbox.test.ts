import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count, rows } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// EPIC-6 / F-6.2 / F-6.3 — sandbox is ephemeral + no-commit. The simulation NEVER writes real
// Pertenencia/Prioritized_NBA_Event; only apertura/cierre are logged to Usage_Event.

const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
}, 240_000);
afterAll(async () => {
  await pool.end();
});

function caller() {
  const ctx: Context = {
    session: { user_id: "U-OP-001", tenant_id: "POOL-001", org_level: "team" },
    tenantId: "POOL-001",
    userId: "U-OP-001",
  };
  return appRouter.createCaller(ctx);
}

describe("EPIC-6 sandbox real re-segmentation, no-commit", () => {
  it("re-segments ephemerally without writing real Membership/NBA + logs open/close", async () => {
    const pBefore = await count(pool, 'cohort."Cohort_Membership_Snapshot"');
    const eBefore = await count(pool, 'cohort."Prioritized_NBA_Event"');
    const realBefore = await rows<{ rid: string; sg: string | null }>(
      pool,
      `select restaurant_id rid, subgroup_id sg from cohort."Cohort_Membership_Snapshot" where week='${W1}' order by restaurant_id`,
    );

    // no override ⇒ identical re-seg ⇒ zero moves
    const out = await caller().sandbox.run();
    expect(out.committed).toBe(false);
    expect(out.label).toMatch(/SIMULATION/);
    expect(out.simulated?.total ?? 0).toBeGreaterThan(0);
    expect(out.simulated?.subgroup_moves).toBe(0); // same knobs ⇒ same result

    // override the composite weights ⇒ a real re-segmentation ⇒ percentiles shift
    const out2 = await caller().sandbox.run({
      overrides: {
        weight_score_orders: "0.90", weight_score_connection: "0.04",
        weight_score_quality: "0.03", weight_score_cancel: "0.03",
      },
    });
    expect(out2.committed).toBe(false);
    expect((out2.simulated?.percentile_changes ?? 0)).toBeGreaterThan(0);

    // F-6.3 NO-COMMIT: real tables + the committed snapshot are byte-for-byte unchanged.
    expect(await count(pool, 'cohort."Cohort_Membership_Snapshot"')).toBe(pBefore);
    expect(await count(pool, 'cohort."Prioritized_NBA_Event"')).toBe(eBefore);
    const realAfter = await rows<{ rid: string; sg: string | null }>(
      pool,
      `select restaurant_id rid, subgroup_id sg from cohort."Cohort_Membership_Snapshot" where week='${W1}' order by restaurant_id`,
    );
    expect(realAfter).toEqual(realBefore);
    // observability: apertura + cierre persisted (outside the rollback).
    expect(await count(pool, `tenant."Usage_Event" where event_type='sandbox_open'`)).toBeGreaterThan(0);
    expect(await count(pool, `tenant."Usage_Event" where event_type='sandbox_close'`)).toBeGreaterThan(0);
  }, 240_000);
});
