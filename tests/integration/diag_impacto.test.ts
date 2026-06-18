import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { computeRsPerdido, writeLedger } from "../../server/diagnostico/impacto";

// 05B:US-B5.1.1 + US-B5.3.1 — impacto puntuador + libro-razón. Math lives in SQL
// (tenant.fn_impacto_rs_perdido); TS orchestrates. Anti-fake §14: rs_perdido / custo_resolver /
// value_ganho are NULL pre-run; churn_risk fail-closed to NULL (no pre-churn producer wired).
// Modeled on diagnostico_spine.test.ts. Uses dedicated fixture restaurants (R-DIAG-*) with
// CONTROLLED Order rows so the expected sum(net_value fallido) is exact, independent of the
// seed's deterministic per-restaurant noise. fn sums over the Affected set only.

let pool: pg.Pool;

// Two fixture restaurants in POOL-001. Order net_value = gross_value - fee (generated col).
// Only fallido orders over the AFETADO restaurants count.
//   R-DIAG-1: fallido (100-20)=80, fallido (50-10)=40, ok (999-0)=ignored   → 120
//   R-DIAG-2: fallido (200-50)=150                                          → 150
// expected rs_perdido = 80 + 40 + 150 = 270 (the ok order is excluded by payment_status).
const EXPECTED_RS_PERDIDO = 270;

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
  const r = await pool.query<{ problema_id: string }>(`
    insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticidad, status)
    values ('POOL-001','R-DIAG-1','grave','abierto')
    returning problema_id;
  `);
  const problemaId = r.rows[0]!.problema_id;
  // Affected set = both fixture restaurants (caza-silenciosos output, stubbed here directly).
  await pool.query(
    `insert into tenant."Affected"(problema_id, tenant_id, restaurant_id, reclamou, silencioso)
       values ($1,'POOL-001','R-DIAG-1', true, false),
              ($1,'POOL-001','R-DIAG-2', false, true)`,
    [problemaId],
  );
  return problemaId;
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

describe("05B:US-B5.1.1 — computeRsPerdido (Named_Query, churn fail-closed NULL)", () => {
  it("anti-fake §14: rs_perdido is NULL before computeRsPerdido runs", async () => {
    const problemaId = await seedFixture();
    const before = await rows<{ rs_perdido: string | null; churn_risk: string | null }>(
      pool,
      `select rs_perdido, churn_risk from tenant."Diagnosed_Problem" where problema_id = $1`,
      [problemaId],
    );
    expect(before[0]?.rs_perdido).toBeNull();
    expect(before[0]?.churn_risk).toBeNull();

    const out = await computeRsPerdido(problemaId);
    // SQL is the canonical formula: sum(net_value fallido) over the Affected set.
    expect(out.rsPerdido).toBe(EXPECTED_RS_PERDIDO);
    expect(out.churnRisk).toBeNull(); // BR-B10/§14: no pre-churn producer ⇒ null, never invented.

    const after = await rows<{ rs_perdido: string | null; churn_risk: string | null; prov: Record<string, string> }>(
      pool,
      `select rs_perdido, churn_risk, provenance_by_field as prov
         from tenant."Diagnosed_Problem" where problema_id = $1`,
      [problemaId],
    );
    expect(Number(after[0]?.rs_perdido)).toBe(EXPECTED_RS_PERDIDO);
    expect(after[0]?.churn_risk).toBeNull(); // stays NULL in the DB (fail-closed).
    expect(after[0]?.prov.rs_perdido).toBe("[I]"); // worst-provenance stamp written by the fn.
  });
});

describe("05B:US-B5.3.1 — writeLedger (custo_resolver vs value_ganho, NULL pre-run)", () => {
  it("anti-fake §14: ledger columns are NULL pre-run, then persisted with provenance", async () => {
    const problemaId = await seedFixture();
    const before = await rows<{ custo_resolver: string | null; value_ganho: string | null }>(
      pool,
      `select custo_resolver, value_ganho from tenant."Diagnosed_Problem" where problema_id = $1`,
      [problemaId],
    );
    expect(before[0]?.custo_resolver).toBeNull();
    expect(before[0]?.value_ganho).toBeNull();

    await writeLedger(problemaId, { custoResolver: 40, valueGanho: 320 });

    const after = await rows<{
      custo_resolver: string | null;
      value_ganho: string | null;
      prov: Record<string, string>;
      ultima_vez_ts: string | null;
    }>(
      pool,
      `select custo_resolver, value_ganho, provenance_by_field as prov, ultima_vez_ts
         from tenant."Diagnosed_Problem" where problema_id = $1`,
      [problemaId],
    );
    expect(Number(after[0]?.custo_resolver)).toBe(40);
    expect(Number(after[0]?.value_ganho)).toBe(320);
    expect(after[0]?.prov.custo_resolver).toBe("[I]");
    expect(after[0]?.prov.value_ganho).toBe("[I]");
    expect(after[0]?.ultima_vez_ts).not.toBeNull(); // bumped by the write.
  });
});
