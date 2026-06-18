import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";

// 03:NBA-TEST — cohort.fn_nba_test(restaurant, action_code, week): the DETERMINISTIC test the AGENTE
// (02:1A) calls per hypothesis. Measures the restaurant's signal vs the named standard and returns a
// verdict — the NUMBER is always SQL, never the AI (§14/§3.6). Catalog-driven (NBA_Catalogo contract
// columns), standard read BY NAME (knob_required_num), no table write, byte-deterministic.
// Verdict object: { action_code, dimension, measured, standard, verdict, gap, within_range,
//                   n_min_ok, k_anon_ok, provenance:'[V]' }.

const W1 = "2026-05-25";
const REF = "2026-06-17";
const NOWEEK = "2020-01-01"; // no membership rows ⇒ no_data

let pool: pg.Pool;
beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
}, 120_000);
afterAll(async () => {
  await pool.end();
});

type V = {
  action_code: string;
  dimension: string | null;
  measured: number | null;
  standard: number | null;
  verdict: string;
  gap: number | null;
  within_range: boolean;
  n_min_ok: boolean | null;
  k_anon_ok: boolean | null;
  provenance: string;
};

const SELECT =
  `action_code, dimension, measured::float8 measured, standard::float8 standard, verdict,
   gap::float8 gap, within_range, n_min_ok, k_anon_ok, provenance`;

async function test1(rid: string, code: string, week = W1): Promise<V> {
  const r = await rows<V>(pool, `select ${SELECT} from cohort.fn_nba_test($1,$2,$3)`, [rid, code, week]);
  return r[0]!;
}
async function testAll(rid: string, week = W1): Promise<V[]> {
  return rows<V>(pool, `select ${SELECT} from cohort.fn_nba_test_all($1,$2)`, [rid, week]);
}
// deterministic fixture: a restaurant whose W1 membership satisfies `cond` (no params in cond).
async function pick(cond: string): Promise<string> {
  const r = await rows<{ restaurant_id: string }>(
    pool,
    `select restaurant_id from cohort."Cohort_Membership_Snapshot" where week=$1 and ${cond} order by restaurant_id limit 1`,
    [W1],
  );
  expect(r.length, `fixture not found: ${cond}`).toBe(1);
  return r[0]!.restaurant_id;
}
async function inTx(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await fn(c);
  } finally {
    await c.query("rollback");
    c.release();
  }
}

describe("03:NBA-TEST — §14 fail-closed (no fabricated number)", () => {
  it("t1: NULL signal ⇒ no_data, never a fabricated below/ok", async () => {
    const rid = await pick("m_connection is not null");
    // positive control: with the signal present, A1 is NOT no_data
    expect((await test1(rid, "A1")).verdict).not.toBe("no_data");
    // null the signal inside a tx ⇒ no_data, measured null
    await inTx(async (c) => {
      await c.query(
        `update cohort."Cohort_Membership_Snapshot" set m_connection=null where restaurant_id=$1 and week=$2`,
        [rid, W1],
      );
      const r = await c.query<V>(`select ${SELECT} from cohort.fn_nba_test($1,'A1',$2)`, [rid, W1]);
      expect(r.rows[0]!.verdict).toBe("no_data");
      expect(r.rows[0]!.measured).toBeNull();
      expect(r.rows[0]!.standard).toBeNull();
      expect(r.rows[0]!.provenance).toBe("[V]");
    });
  });

  it("t2: no snapshot row (unknown week) ⇒ no_data", async () => {
    const v = await test1("R001", "A1", NOWEEK);
    expect(v.verdict).toBe("no_data");
    expect(v.measured).toBeNull();
  });
});

describe("03:NBA-TEST — determinism", () => {
  it("t3: same brutos twice ⇒ byte-identical verdicts", async () => {
    const a = await testAll("R001");
    const b = await testAll("R001");
    expect(b).toEqual(a);
  });
});

describe("03:NBA-TEST — per-dimension sense + scale (catalog-driven)", () => {
  it("t4: A1 below=problem, reads m_connection, standard 0.80", async () => {
    const bad = await test1(await pick("m_connection < 0.80"), "A1");
    expect(bad.dimension).toBe("m_connection");
    expect(bad.verdict).toBe("below");
    expect(bad.standard).toBeCloseTo(0.8, 6);
    expect(bad.gap!).toBeLessThan(0);
    expect(bad.within_range).toBe(false);
    const ok = await test1(await pick("m_connection >= 0.80"), "A1");
    expect(ok.verdict).toBe("ok");
    expect(ok.within_range).toBe(true);
  });

  it("t5: A2 above=problem, SCALE — standard is 75 not 0.75", async () => {
    const bad = await test1(await pick("price_pctile_in_cohort > 75"), "A2");
    expect(bad.dimension).toBe("price_pctile_in_cohort");
    expect(bad.verdict).toBe("above");
    expect(bad.standard).toBeCloseTo(75, 6); // 0.75 knob * scale 100
    expect(bad.gap!).toBeGreaterThan(0);
    const ok = await test1(await pick("price_pctile_in_cohort <= 75 and price_pctile_in_cohort is not null"), "A2");
    expect(ok.verdict).toBe("ok");
  });

  it("t6: A3 reuses A2's price diagnosis — NOT the promo-budget money gate", async () => {
    const rid = await pick("price_pctile_in_cohort > 75");
    const a2 = await test1(rid, "A2");
    const a3 = await test1(rid, "A3");
    expect(a3.measured).toBe(a2.measured);
    expect(a3.standard).toBeCloseTo(75, 6);
    expect(a3.standard).not.toBe(0); // would be 0 if it (wrongly) used nba_promo_budget_max
    expect(a3.verdict).toBe("above");
  });

  it("t7: A4 below=problem, reads m_quality, standard 0.50", async () => {
    const bad = await test1(await pick("m_quality < 0.50"), "A4");
    expect(bad.dimension).toBe("m_quality");
    expect(bad.verdict).toBe("below");
    expect(bad.standard).toBeCloseTo(0.5, 6);
  });

  it("t8: A5 drop=local cause (negated standard -0.20)", async () => {
    // ok case from real data (no real zone has a >=20% drop)
    const ok = await test1(await pick("zone_demand_trend > -0.20 and zone_demand_trend is not null"), "A5");
    expect(ok.dimension).toBe("zone_demand_trend");
    expect(ok.standard).toBeCloseTo(-0.2, 6);
    expect(ok.verdict).toBe("ok");
    // drop case via tx fixture
    const rid = await pick("zone_demand_trend is not null");
    await inTx(async (c) => {
      await c.query(
        `update cohort."Cohort_Membership_Snapshot" set zone_demand_trend=-0.30 where restaurant_id=$1 and week=$2`,
        [rid, W1],
      );
      const r = await c.query<V>(`select ${SELECT} from cohort.fn_nba_test($1,'A5',$2)`, [rid, W1]);
      expect(r.rows[0]!.verdict).toBe("below");
      expect(r.rows[0]!.standard).toBeCloseTo(-0.2, 6);
      expect(r.rows[0]!.within_range).toBe(false);
    });
  });

  it("t9: A6 above=problem, reads cancel_by_restaurant, standard 0.10", async () => {
    const bad = await test1(await pick("cancel_by_restaurant > 0.10"), "A6");
    expect(bad.dimension).toBe("cancel_by_restaurant");
    expect(bad.verdict).toBe("above");
    expect(bad.standard).toBeCloseTo(0.1, 6);
  });

  it("t10: A7 above=problem, reads cancel_by_customer, standard 0.05", async () => {
    const bad = await test1(await pick("cancel_by_customer > 0.05"), "A7");
    expect(bad.dimension).toBe("cancel_by_customer");
    expect(bad.verdict).toBe("above");
    expect(bad.standard).toBeCloseTo(0.05, 6);
  });

  it("t11: A8 always no_data (non-attributable fallback)", async () => {
    const v = await test1("R001", "A8");
    expect(v.verdict).toBe("no_data");
    expect(v.measured).toBeNull();
    expect(v.standard).toBeNull();
  });
});

describe("03:NBA-TEST — fail-closed contracts", () => {
  it("t12: unknown action_code ⇒ raises", async () => {
    await expect(pool.query(`select * from cohort.fn_nba_test('R001','A99',$1)`, [W1])).rejects.toThrow();
  });

  it("t13: missing knob ⇒ raises (read BY NAME, fail-closed)", async () => {
    await inTx(async (c) => {
      await c.query(`delete from catalog."Config_Knobs" where key='nba_connection_min_ratio'`);
      await expect(c.query(`select * from cohort.fn_nba_test('R001','A1',$1)`, [W1])).rejects.toThrow();
    });
  });
});

describe("03:NBA-TEST — k-anon / n_min surfaced (not suppressed in substrate)", () => {
  it("t14: k_anon_ok=false ⇒ flag surfaced, verdict still numeric (frontier is the consumer's job)", async () => {
    const rid = await pick("k_anon_ok = false and m_connection is not null");
    const v = await test1(rid, "A1");
    expect(v.k_anon_ok).toBe(false);
    expect(v.measured).not.toBeNull();
    expect(["below", "ok", "above"]).toContain(v.verdict);
  });

  it("t15: n_min_ok surfaced both ways", async () => {
    expect((await test1(await pick("n_min_ok = false and m_connection is not null"), "A1")).n_min_ok).toBe(false);
    expect((await test1(await pick("n_min_ok = true and m_connection is not null"), "A1")).n_min_ok).toBe(true);
  });
});

describe("03:NBA-TEST — fn_nba_test_all + provenance", () => {
  it("t16: returns one row per catalog code (A1..A8), each matching the single call", async () => {
    const all = await testAll("R001");
    expect(all.map((r) => r.action_code)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"]);
    for (const row of all) {
      expect(await test1("R001", row.action_code)).toEqual(row);
    }
  });

  it("t17: provenance is always [V] (measured, never [C]/[I])", async () => {
    for (const row of await testAll("R001")) expect(row.provenance).toBe("[V]");
  });
});
