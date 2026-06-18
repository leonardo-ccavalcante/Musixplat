import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows, count } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";

// 02:NBA-SIG — the deterministic per-restaurant signals the Autonomy Cockpit's node 1A reads to walk
// the funnel (01_nba_issue_tree). Stored on membership, computed by fn_nba_signals inside runP01.
// §14: only complete-brutos restaurants get a value — missing data ⇒ NULL (fail-closed), never a 0.
// Reuses the existing m_* metrics; adds price-vs-cohort, the cancel restaurant/customer split, zone trend.

const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
}, 120_000);
afterAll(async () => {
  await pool.end();
});

const M = 'cohort."Cohort_Membership_Snapshot"';

describe("02:NBA-SIG — funnel signals (price pctile · cancel split · zone trend)", () => {
  it("computes the new signals for complete-brutos restaurants, in valid ranges", async () => {
    expect(await count(pool, `${M} where price_pctile_in_cohort is not null`)).toBeGreaterThan(0);
    expect(await count(pool, `${M} where cancel_by_restaurant is not null`)).toBeGreaterThan(0);
    expect(await count(pool, `${M} where cancel_by_customer is not null`)).toBeGreaterThan(0);
    expect(await count(pool, `${M} where zone_demand_trend is not null`)).toBeGreaterThan(0);
    // ranges: price percentile ∈ [0,100]; cancel rates ∈ [0,1]
    expect(await count(pool, `${M} where price_pctile_in_cohort not between 0 and 100`)).toBe(0);
    expect(await count(pool, `${M} where cancel_by_restaurant not between 0 and 1`)).toBe(0);
    expect(await count(pool, `${M} where cancel_by_customer not between 0 and 1`)).toBe(0);
  });

  it("§14 fail-closed: missing order brutos (m_orders null) ⇒ cancel signals NULL (never a fabricated 0)", async () => {
    expect(
      await count(
        pool,
        `${M} where m_orders is null and (cancel_by_restaurant is not null or cancel_by_customer is not null)`,
      ),
    ).toBe(0);
  });

  it("deterministic: a second fresh runP01 yields identical signals", async () => {
    const q = `select restaurant_id,
                 coalesce(price_pctile_in_cohort::text,'-') p,
                 coalesce(cancel_by_restaurant::text,'-')   cr,
                 coalesce(cancel_by_customer::text,'-')     cc,
                 coalesce(zone_demand_trend::text,'-')      z
               from ${M} where week = $1 order by restaurant_id`;
    const a = await rows(pool, q, [W1]);
    await resetDb(pool);
    await runP01({ week: W1, refDate: REF });
    const b = await rows(pool, q, [W1]);
    expect(b).toEqual(a);
  });
});
