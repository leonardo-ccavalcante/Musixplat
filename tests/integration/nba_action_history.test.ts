import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";

// 02:DETAIL-B — per-action operation history, company-wide (Leo: empresa inteira). hit rate is the
// DIAGNOSTIC rate: a pick is "solid" only when its dimension is a breach (below/above) AND backed by
// sufficient, non-suppressed evidence (n_min_ok ∧ k_anon_ok); thin/suppressed breaches = "unconfirmed".
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

type Hist = {
  run_count: number; solid_count: number; unconfirmed_count: number; no_data_count: number; acerto_rate: number | null;
};
async function history(code: string): Promise<Hist> {
  const r = await rows<Hist>(
    pool,
    `select run_count::int as run_count, solid_count::int as solid_count,
            unconfirmed_count::int as unconfirmed_count, no_data_count::int as no_data_count,
            acerto_rate::float8 as acerto_rate
     from cohort.fn_nba_action_history($1)`,
    [code],
  );
  return r[0]!;
}

describe("02:DETAIL-B — fn_nba_action_history (deterministic diagnostic hit rate)", () => {
  it("splits solid / unconfirmed / no_data and computes acerto_rate = solid/(solid+unconfirmed)", async () => {
    const cohort = (
      await rows<{ cohort_id: string }>(pool, `select cohort_id from cohort."Cohort" order by cohort_id limit 1`)
    )[0]!.cohort_id;

    const c = await pool.connect();
    try {
      await c.query("begin");
      // HERMETIC (rolled back): clear any produced proposals so the company-wide count is exactly our 3
      // — independent of whatever runP01 / autodispatch may have produced.
      await c.query(`delete from gov."min_calculation"`);
      await c.query(`delete from gov."NBA_Proposal"`);
      // 3 A1 proposals: 1 solid (breach + evidence), 1 unconfirmed (breach + thin sample), 1 no_data.
      const insert = `insert into gov."NBA_Proposal"
        (action_type, cohort_id, nba_request, cohort_rule_version, diagnosis_verdict, n_min_ok, k_anon_ok)
        values ('A1',$1,'LOW','v1',$2,$3,$4)`;
      await c.query(insert, [cohort, "below", true, true]);   // solid
      await c.query(insert, [cohort, "below", false, true]);  // unconfirmed (thin sample)
      await c.query(insert, [cohort, "no_data", null, null]); // no_data

      const h = (
        await c.query<Hist>(
          `select run_count::int as run_count, solid_count::int as solid_count,
                  unconfirmed_count::int as unconfirmed_count, no_data_count::int as no_data_count,
                  acerto_rate::float8 as acerto_rate
           from cohort.fn_nba_action_history('A1')`,
        )
      ).rows[0]!;
      expect(h.run_count).toBe(3);
      expect(h.solid_count).toBe(1);
      expect(h.unconfirmed_count).toBe(1);
      expect(h.no_data_count).toBe(1);
      expect(h.acerto_rate).toBe(0.5); // 1 / (1+1)
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("§14 — zero runs ⇒ run_count 0 and acerto_rate NULL (never 0-fake)", async () => {
    const h = await history("ZZ"); // nonexistent code ⇒ guaranteed zero, independent of what runP01 produced
    expect(h.run_count).toBe(0);
    expect(h.acerto_rate).toBeNull();
  });
});

describe("02:DETAIL — nba.catalog usage (one row per closed A-code; honest 0-run)", () => {
  it("returns every catalog code with its usage; a never-proposed code is run_count 0 / acerto NULL", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`delete from gov."min_calculation"`);
      await c.query(`delete from gov."NBA_Proposal"`);
      const cohort = (await c.query<{ cohort_id: string }>(`select cohort_id from cohort."Cohort" order by cohort_id limit 1`)).rows[0]!.cohort_id;
      // only A1 gets proposals (2 solid) ⇒ A1 used, every other code honestly empty.
      const ins = `insert into gov."NBA_Proposal"(action_type, cohort_id, nba_request, cohort_rule_version, diagnosis_verdict, n_min_ok, k_anon_ok) values ('A1',$1,'LOW','v1','below',true,true)`;
      await c.query(ins, [cohort]);
      await c.query(ins, [cohort]);

      // the exact query the nba.catalog endpoint runs
      const cat = (
        await c.query<{ code: string; run_count: number; acerto_rate: number | null }>(
          `select c.code, h.run_count::int as run_count, h.acerto_rate::float8 as acerto_rate
           from catalog."NBA_Catalogo" c
           cross join lateral cohort.fn_nba_action_history(c.code) h
           order by c.code`,
        )
      ).rows;

      expect(cat.length).toBeGreaterThanOrEqual(8); // the closed A1–A8 set
      const a1 = cat.find((x) => x.code === "A1")!;
      expect(a1.run_count).toBe(2);
      expect(a1.acerto_rate).toBe(1); // 2 solid / 2 breach
      const a3 = cat.find((x) => x.code === "A3")!;
      expect(a3.run_count).toBe(0);
      expect(a3.acerto_rate).toBeNull(); // §14: never a 0-fake
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
