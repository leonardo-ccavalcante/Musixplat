import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { computeRevenueLost, writeLedger } from "../../server/diagnostico/impacto";

// 05B:US-B5.1.1 + US-B5.3.1 — impact scorer + ledger. Math lives in SQL
// (tenant.fn_impact_revenue_lost); TS orchestrates. Anti-fake §14: revenue_lost / cost_to_resolve /
// value_gained are NULL pre-run; churn_risk fail-closed to NULL (no pre-churn producer wired).
// Modeled on diagnostico_spine.test.ts. Uses dedicated fixture restaurants (R-DIAG-*) with
// CONTROLLED Order rows so the expected sum(net_value failed) is exact, independent of the
// seed's deterministic per-restaurant noise. fn sums over the Affected set only.

let pool: pg.Pool;

// Two fixture restaurants in POOL-001. Order net_value = gross_value - fee (generated col).
// Only failed orders over the AFFECTED restaurants count.
//   R-DIAG-1: failed (100-20)=80, failed (50-10)=40, ok (999-0)=ignored   → 120
//   R-DIAG-2: failed (200-50)=150                                         → 150
// expected revenue_lost = 80 + 40 + 150 = 270 (the ok order is excluded by payment_status).
const EXPECTED_REVENUE_LOST = 270;

async function seedFixture(): Promise<string> {
  await pool.query(`
    insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
    values ('R-DIAG-1','POOL-001','long_tail','long_tail', date '2026-01-01'),
           ('R-DIAG-2','POOL-001','long_tail','long_tail', date '2026-01-01');

    insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status)
    values ('R-DIAG-1', date '2026-06-01', 100, 20, 'failed'),
           ('R-DIAG-1', date '2026-06-02',  50, 10, 'failed'),
           ('R-DIAG-1', date '2026-06-03', 999,  0, 'ok'),
           ('R-DIAG-2', date '2026-06-01', 200, 50, 'failed');
  `);
  const r = await pool.query<{ problem_id: string }>(`
    insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status)
    values ('POOL-001','R-DIAG-1','critical','open')
    returning problem_id;
  `);
  const problemId = r.rows[0]!.problem_id;
  // Affected set = both fixture restaurants (silent-hunter output, stubbed here directly).
  await pool.query(
    `insert into tenant."Affected"(problem_id, tenant_id, restaurant_id, complained, silent)
       values ($1,'POOL-001','R-DIAG-1', true, false),
              ($1,'POOL-001','R-DIAG-2', false, true)`,
    [problemId],
  );
  return problemId;
}

beforeAll(async () => {
  pool = makePool();
}, 60_000);

// resetDb per-test: seedFixture re-inserts the same R-DIAG-* PKs, so each test needs a clean slate.
beforeEach(async () => {
  await resetDb(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("05B:US-B5.1.1 — computeRevenueLost (Named_Query, churn fail-closed NULL)", () => {
  it("anti-fake §14: revenue_lost is NULL before computeRevenueLost runs", async () => {
    const problemId = await seedFixture();
    const before = await rows<{ revenue_lost: string | null; churn_risk: string | null }>(
      pool,
      `select revenue_lost, churn_risk from tenant."Diagnosed_Problem" where problem_id = $1`,
      [problemId],
    );
    expect(before[0]?.revenue_lost).toBeNull();
    expect(before[0]?.churn_risk).toBeNull();

    const out = await computeRevenueLost(problemId);
    // SQL is the canonical formula: sum(net_value failed) over the Affected set.
    expect(out.revenueLost).toBe(EXPECTED_REVENUE_LOST);
    expect(out.churnRisk).toBeNull(); // BR-B10/§14: no pre-churn producer ⇒ null, never invented.

    const after = await rows<{ revenue_lost: string | null; churn_risk: string | null; prov: Record<string, string> }>(
      pool,
      `select revenue_lost, churn_risk, provenance_by_field as prov
         from tenant."Diagnosed_Problem" where problem_id = $1`,
      [problemId],
    );
    expect(Number(after[0]?.revenue_lost)).toBe(EXPECTED_REVENUE_LOST);
    expect(after[0]?.churn_risk).toBeNull(); // stays NULL in the DB (fail-closed).
    expect(after[0]?.prov.revenue_lost).toBe("[I]"); // worst-provenance stamp written by the fn.
  });
});

describe("05B:US-B5.3.1 — writeLedger (cost_to_resolve vs value_gained, NULL pre-run)", () => {
  it("anti-fake §14: ledger columns are NULL pre-run, then persisted with provenance", async () => {
    const problemId = await seedFixture();
    const before = await rows<{ cost_to_resolve: string | null; value_gained: string | null }>(
      pool,
      `select cost_to_resolve, value_gained from tenant."Diagnosed_Problem" where problem_id = $1`,
      [problemId],
    );
    expect(before[0]?.cost_to_resolve).toBeNull();
    expect(before[0]?.value_gained).toBeNull();

    await writeLedger(problemId, { costToResolve: 40, valueGained: 320 });

    const after = await rows<{
      cost_to_resolve: string | null;
      value_gained: string | null;
      prov: Record<string, string>;
      last_seen_ts: string | null;
    }>(
      pool,
      `select cost_to_resolve, value_gained, provenance_by_field as prov, last_seen_ts
         from tenant."Diagnosed_Problem" where problem_id = $1`,
      [problemId],
    );
    expect(Number(after[0]?.cost_to_resolve)).toBe(40);
    expect(Number(after[0]?.value_gained)).toBe(320);
    expect(after[0]?.prov.cost_to_resolve).toBe("[I]");
    expect(after[0]?.prov.value_gained).toBe("[I]");
    expect(after[0]?.last_seen_ts).not.toBeNull(); // bumped by the write.
  });
});
