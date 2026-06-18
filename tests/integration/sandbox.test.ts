import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";
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
}, 60_000);
afterAll(async () => {
  await pool.end();
});

function caller() {
  const ctx: Context = {
    session: { user_id: "U-OP-001", tenant_id: "POOL-001", org_level: "equipo" },
    tenantId: "POOL-001",
    userId: "U-OP-001",
  };
  return appRouter.createCaller(ctx);
}

describe("EPIC-6 sandbox no-commit", () => {
  it("simulates without writing real Pertenencia/Evento (counts invariant) + logs open/close", async () => {
    const pBefore = await count(pool, 'cohort."Cohort_Membership_Snapshot"');
    const eBefore = await count(pool, 'cohort."Prioritized_NBA_Event"');

    const out = await caller().sandbox.run();
    expect(out.committed).toBe(false);
    expect(out.simulated.length).toBeGreaterThan(0);

    // F-6.3: no real writes happened.
    expect(await count(pool, 'cohort."Cohort_Membership_Snapshot"')).toBe(pBefore);
    expect(await count(pool, 'cohort."Prioritized_NBA_Event"')).toBe(eBefore);
    // observability: apertura + cierre logged (append-only Usage_Event).
    expect(await count(pool, `tenant."Usage_Event" where event_type='sandbox_open'`)).toBeGreaterThan(0);
    expect(await count(pool, `tenant."Usage_Event" where event_type='sandbox_close'`)).toBeGreaterThan(0);
  });
});
