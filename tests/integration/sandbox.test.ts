import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// EPIC-6 / F-6.2 / F-6.3 — sandbox is ephemeral + no-commit. The simulation NEVER writes real
// Pertenencia/Evento_Priorizado_NBA; only apertura/cierre are logged to Evento_Uso.

const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ semana: W1, refDate: REF });
}, 60_000);
afterAll(async () => {
  await pool.end();
});

function caller() {
  const ctx: Context = {
    session: { usuario_id: "U-OP-001", tenant_id: "POOL-001", nivel_org: "equipo" },
    tenantId: "POOL-001",
    userId: "U-OP-001",
  };
  return appRouter.createCaller(ctx);
}

describe("EPIC-6 sandbox no-commit", () => {
  it("simulates without writing real Pertenencia/Evento (counts invariant) + logs open/close", async () => {
    const pBefore = await count(pool, 'cohort."Pertenencia_Cohort_Snapshot"');
    const eBefore = await count(pool, 'cohort."Evento_Priorizado_NBA"');

    const out = await caller().sandbox.run();
    expect(out.committed).toBe(false);
    expect(out.simulated.length).toBeGreaterThan(0);

    // F-6.3: no real writes happened.
    expect(await count(pool, 'cohort."Pertenencia_Cohort_Snapshot"')).toBe(pBefore);
    expect(await count(pool, 'cohort."Evento_Priorizado_NBA"')).toBe(eBefore);
    // observability: apertura + cierre logged (append-only Evento_Uso).
    expect(await count(pool, `tenant."Evento_Uso" where tipo_evento='sandbox_open'`)).toBeGreaterThan(0);
    expect(await count(pool, `tenant."Evento_Uso" where tipo_evento='sandbox_close'`)).toBeGreaterThan(0);
  });
});
