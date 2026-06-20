import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";

let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); }, 60_000);
afterAll(async () => { await pool.end(); });

describe("fn_generate_business_base", () => {
  it("seed still produces exactly 5000 restaurants with R001 anchor (parity)", async () => {
    expect(await count(pool, 'tenant."Restaurant"')).toBe(5000);
    expect(await count(pool, `tenant."Restaurant" where restaurant_id='R001'`)).toBe(1);
  });
  it("regenerating with a smaller N truncates+repopulates business only, results stay NULL (§14)", async () => {
    await pool.query(`truncate tenant."Conversation_Episode", tenant."Weekly_Connection", tenant."Order", tenant."Restaurant" restart identity cascade`);
    await pool.query(`select public.fn_generate_business_base(300, date '2026-06-17')`);
    expect(await count(pool, 'tenant."Restaurant"')).toBe(300);
    expect(await count(pool, 'tenant."Order"')).toBeGreaterThan(0);
    expect(await count(pool, 'tenant."Weekly_Connection"')).toBeGreaterThan(0);
    expect(await count(pool, `tenant."Restaurant" where tenure_months is not null`)).toBe(0);
  });
});
