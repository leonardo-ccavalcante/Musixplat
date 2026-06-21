import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { runP02 } from "../../server/jobs/p02";
import { listCockpitRows, type Exec } from "../../server/routers/cockpit";

// §3.11 change-lock: runP02 was extracted from scripts/run-p02.ts so the hosted seed (apply-hosted) also
// produces proposals — the omission that left prod with cohorts but ZERO NBAs (empty cockpit). This pins
// the producer (it fills NBA_Proposal and the list shows them) AND the §3.5 anti-mezcla version filter.
const WEEK = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;
beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: WEEK, refDate: REF });
  await runP02({ week: WEEK, sampleLimit: 12 }); // small sample — enough to prove non-empty, fast
}, 180_000);
afterAll(async () => {
  await pool.end();
});

const execOn = (c: pg.PoolClient): Exec => (sql, params) => c.query(sql, params as unknown[]).then((r) => r.rows) as never;

describe("P02 job — fills the cockpit; list is version-scoped (§3.5 / §3.11)", () => {
  it("runP02 produces NBA proposals and the cockpit list shows them for the pool", async () => {
    const c = await pool.connect();
    try {
      const total = (await c.query<{ n: number }>(`select count(*)::int n from gov."NBA_Proposal"`)).rows[0]!.n;
      expect(total).toBeGreaterThan(0); // the forgotten producer now runs ⇒ not empty
      const tenantId = (
        await c.query<{ tenant_id: string }>(`select tenant_id from tenant."Restaurant" order by restaurant_id limit 1`)
      ).rows[0]!.tenant_id;
      const rows = await listCockpitRows(tenantId, execOn(c));
      expect(rows.length).toBeGreaterThan(0); // the cockpit is NOT empty for this operator's pool
    } finally {
      c.release();
    }
  });

  it("proposals are shown ONLY at the current cohort_rule_version (anti-mezcla §3.5)", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const exec = execOn(c);
      const tenantId = (
        await c.query<{ tenant_id: string }>(`select tenant_id from tenant."Restaurant" order by restaurant_id limit 1`)
      ).rows[0]!.tenant_id;
      const before = await listCockpitRows(tenantId, exec);
      expect(before.length).toBeGreaterThan(0);
      // Flip the current-version knob to one no proposal was stamped with: every row must drop out — a KPI
      // shows a number ONLY if its version == current (never mix baselines across versions, §3.5 fail-closed).
      await c.query(`update catalog."Config_Knobs" set value='v-NONE' where key='cohort_rule_version_current'`);
      const after = await listCockpitRows(tenantId, exec);
      expect(after.length).toBe(0);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
