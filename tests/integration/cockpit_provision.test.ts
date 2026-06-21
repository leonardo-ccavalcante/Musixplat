import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { provisionCockpit } from "../../server/cockpit/provision";
import { listCockpitRows, type Exec } from "../../server/routers/cockpit";

// 02:CP — provisionCockpit is the GUI/tenant-scoped version of runP02 (the "Preparar cockpit" button). From a
// freshly-SEEDED pool with NO P01 yet, one call must yield a WORKING cockpit (cohorts + governance floor +
// proposals) with the auto spectrum EMERGING from the real engine, be §14-honest (the Eval_Cell floor is
// [I], never a measured [V]), and be idempotent. NOTHING is crafted here — the engine decides auto_releasable.
let pool: pg.Pool;
beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // seed only — provision must run P01 itself (cohorts absent)
}, 180_000);
afterAll(async () => {
  await resetDb(pool); // clear committed proposals/dispatches so the next suite starts pristine (§14)
  await pool.end();
});
const execOn = (c: pg.PoolClient): Exec => (sql, params) => c.query(sql, params as unknown[]).then((r) => r.rows) as never;
const aTenant = async (): Promise<string> =>
  (await pool.query<{ t: string }>(`select tenant_id t from tenant."Restaurant" order by restaurant_id limit 1`)).rows[0]!.t;

describe("02:CP — provisionCockpit (the 'Preparar cockpit' button)", () => {
  it("from a seeded-but-uncohorted pool, ONE call yields cohorts + proposals + >=1 auto", async () => {
    const tenantId = await aTenant();
    const r = await provisionCockpit(tenantId);
    expect(r.needsBase).toBe(false);
    expect(r.ranCohorts).toBe(true); // cohorts were absent ⇒ P01 ran inside provision
    expect(r.proposed).toBeGreaterThan(0); // the engine proposed real actions
    expect(r.auto_acted + r.escalated).toBe(r.proposed); // spectrum internally consistent
    expect(r.auto_acted).toBeGreaterThan(0); // the AI cleared >=1 on its own (the feature is NOT hollow)

    const c = await pool.connect();
    try {
      const rows = await listCockpitRows(tenantId, execOn(c));
      expect(rows.length).toBeGreaterThan(0); // the cockpit is populated for this operator's pool
    } finally {
      c.release();
    }
  }, 180_000);

  it("§14: the bootstrap Eval_Cell floor is stamped [I] (seeded), never a measured [V]", async () => {
    const cells = (
      await pool.query<{ prov: Record<string, string>; re: string | null }>(
        `select provenance_by_field prov, released_evals re from gov."Eval_Cell" limit 5`,
      )
    ).rows;
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.prov.released_evals).toBe("[I]");
      expect(cell.prov.status).toBe("[I]");
      expect(cell.re).toBe("LOW"); // the conservative floor caps least() to LOW (never a permissive grant)
    }
  });

  it("is idempotent: a second call skips P01 and adds no duplicate tiers", async () => {
    const tenantId = await aTenant();
    const before = (await pool.query<{ n: number }>(`select count(*)::int n from gov."Policy_Tier"`)).rows[0]!.n;
    const r2 = await provisionCockpit(tenantId);
    expect(r2.ranCohorts).toBe(false); // cohorts now exist ⇒ P01 skipped
    const after = (await pool.query<{ n: number }>(`select count(*)::int n from gov."Policy_Tier"`)).rows[0]!.n;
    expect(after).toBe(before); // bootstrapPolicies is on-conflict ⇒ no duplicate tiers
  }, 180_000);
});
