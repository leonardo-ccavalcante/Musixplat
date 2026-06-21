import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CSV_COLUMNS } from "../../server/cohorts/csvSchema";
import { parseCsv } from "../../server/cohorts/parseCsv";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

function caller(tenantId = "POOL-001", userId = "U-OP-001") {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
  return appRouter.createCaller(ctx);
}
const HEADER = "tenant_id,restaurant_id,tier_base,segment,signup_date,zone,cuisine,committed_hours_week,order_date,gross_value,fee,payment_status,cancelled_by,discount_pct,has_photo,has_description";
function b64(csv: string) { return Buffer.from(csv, "utf8").toString("base64"); }
let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); await pool.query(`truncate tenant."Weekly_Connection", tenant."Order", tenant."Restaurant" restart identity cascade`); }, 60_000);
afterAll(async () => { await pool.end(); });

describe("cohorts.uploadCsv", () => {
  it("inserts restaurants (deduped) + orders + synthesized connection; results stay NULL (§14)", async () => {
    const row = (rid: string, od: string, pay = "ok") =>
      `POOL-001,${rid},long_tail,long_tail,2024-01-01,downtown,pizza,50,${od},100,20,${pay},,0,true,true`;
    const csv = [HEADER, row("RX1", "2026-03-01"), row("RX1", "2026-03-08"), row("RX2", "2026-03-02")].join("\n");
    const r = await caller().cohorts.uploadCsv({ filename: "base.csv", contentBase64: b64(csv) });
    expect(r.restaurants).toBe(2);
    expect(r.orders).toBe(3);
    expect(await count(pool, 'tenant."Restaurant"')).toBe(2);
    expect(await count(pool, 'tenant."Order"')).toBe(3);
    expect(await count(pool, 'tenant."Weekly_Connection"')).toBeGreaterThan(0);
    expect(await count(pool, `tenant."Restaurant" where tenure_months is not null`)).toBe(0);
  });

  it("accepts DECIMAL fee/discount_pct (regression: coalesce($n,0) must not force integer param type)", async () => {
    const before = await count(pool, 'tenant."Order"');
    const dec = [HEADER, `POOL-001,RDEC,long_tail,long_tail,2024-01-01,downtown,pizza,50,2026-03-01,45.87,12.57,ok,,5.5,true,true`].join("\n");
    const r = await caller().cohorts.uploadCsv({ filename: "dec.csv", contentBase64: b64(dec) });
    expect(r.orders).toBe(1);
    expect(await count(pool, 'tenant."Order"')).toBe(before + 1);
    const stored = await pool.query<{ fee: string; discount_pct: string }>(
      `select fee::text, discount_pct::text from tenant."Order" where restaurant_id='RDEC'`,
    );
    expect(stored.rows[0]!.fee).toBe("12.57");
    expect(stored.rows[0]!.discount_pct).toBe("5.50");
  });

  it("bulk-inserts a large batch in one round-trip (regression: per-row loop timed out at 100k scale)", async () => {
    const before = await count(pool, 'tenant."Order"');
    const N = 1000, R = 100; // many orders across many restaurants → exercises the unnest() bulk path
    const lines = [HEADER];
    for (let i = 0; i < N; i++) {
      lines.push(`POOL-001,RB${i % R},long_tail,long_tail,2024-01-01,downtown,pizza,50,2026-03-01,100,12.57,ok,,0,true,true`);
    }
    const r = await caller().cohorts.uploadCsv({ filename: "big.csv", contentBase64: b64(lines.join("\n")) });
    expect(r.restaurants).toBe(R);
    expect(r.orders).toBe(N);
    expect(await count(pool, 'tenant."Order"')).toBe(before + N);
    const fee = await pool.query<{ fee: string }>(`select fee::text from tenant."Order" where restaurant_id='RB0' limit 1`);
    expect(fee.rows[0]!.fee).toBe("12.57"); // decimals survive the bulk numeric[] cast
  });

  it("cross-batch self-heal: an early batch's restaurant keeps connection IN the engine window after a later batch raises max(order_date) (rank not zeroed)", async () => {
    const mkAt = (rid: string, od: string) =>
      `POOL-001,${rid},long_tail,long_tail,2024-01-01,downtown,pizza,50,${od},100,20,ok,,0,true,true`;
    // Batch 1 carries OLD orders; batch 2 carries the NEWEST order → raises the global max(order_date).
    await caller().cohorts.uploadCsv({ filename: "old.csv", contentBase64: b64([HEADER, mkAt("RA", "2025-01-01")].join("\n")) });
    await caller().cohorts.uploadCsv({ filename: "new.csv", contentBase64: b64([HEADER, mkAt("RZ", "2026-06-01")].join("\n")) });
    // The cohort engine INNER-joins connection over (max(order_date) - 63d, max(order_date)]. RA's
    // first-batch weeks were anchored on the old max; batch 2 must re-anchor RA on the new global max
    // so RA still has connection IN the window — else RA gets a NULL percentile (dropped from the rank).
    // This is exactly why the synthesis is intentionally NOT scoped to the batch.
    const r = await pool.query<{ n: number }>(
      `select count(*)::int n from tenant."Weekly_Connection" wc
       where wc.restaurant_id = 'RA'
         and wc.week >  (select max(order_date) from tenant."Order") - 63
         and wc.week <= (select max(order_date) from tenant."Order")`,
    );
    expect(r.rows[0]!.n).toBeGreaterThan(0);
  });

  it("rejects a bad enum value citing the row + column (fail-closed, nothing inserted)", async () => {
    const before = await count(pool, 'tenant."Order"');
    const bad = [HEADER, `POOL-001,RBAD,WRONG_TIER,long_tail,2024-01-01,downtown,pizza,50,2026-03-01,100,20,ok,,0,true,true`].join("\n");
    await expect(caller().cohorts.uploadCsv({ filename: "bad.csv", contentBase64: b64(bad) }))
      .rejects.toThrow(/row 2.*tier_base/i);
    expect(await count(pool, 'tenant."Order"')).toBe(before);
  });

  it("rejects conflicting restaurant attributes across rows", async () => {
    const conflict = [HEADER,
      `POOL-001,RC1,long_tail,long_tail,2024-01-01,downtown,pizza,50,2026-03-01,100,20,ok,,0,true,true`,
      `POOL-001,RC1,long_tail,long_tail,2024-01-01,north,pizza,50,2026-03-02,100,20,ok,,0,true,true`].join("\n");
    await expect(caller().cohorts.uploadCsv({ filename: "c.csv", contentBase64: b64(conflict) }))
      .rejects.toThrow(/RC1.*conflict/i);
  });
});

describe("cohorts.csvTemplate", () => {
  it("header matches CSV_COLUMNS and every column has type+desc+example", async () => {
    const t = await caller().cohorts.csvTemplate();
    expect(t.csv.split("\n")[0]).toBe(CSV_COLUMNS.join(","));
    expect(t.columns.map((c) => c.name)).toEqual([...CSV_COLUMNS]);
    for (const c of t.columns) {
      expect(c.type).toBeTruthy();
      expect(c.desc).toBeTruthy();
      expect(c.example).toBeTruthy();
    }
    const tierb = t.columns.find((c) => c.name === "tier_base")!;
    expect(tierb.desc).toMatch(/managed_brand/);
  });
  it("the template's own 2 example rows are VALID (parse without error)", async () => {
    const t = await caller().cohorts.csvTemplate();
    const rows = parseCsv(t.csv);
    expect(rows.length).toBe(2);
    expect(rows[0]!.payment_status).toBe("ok");
    expect(rows[1]!.payment_status).toBe("failed");
    expect(rows[1]!.cancelled_by).toBe("customer");
  });
});
