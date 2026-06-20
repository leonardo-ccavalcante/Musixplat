import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
