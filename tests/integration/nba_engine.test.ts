import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows, count } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { proposeNba } from "../../server/agente/nba_engine";

// 02:1A — the AGENTE engine proposes an NBA per (restaurant, cohort, week): deterministic gap-rank
// over fn_nba_test_all, picks the worst-relative-gap problem dimension as the lever, writes
// gov.NBA_Proposal{action_type, root_cause, nba_request, before_after_expected} (the §8 text is
// templated by the deterministic ReasoningProvider — the NUMBER stays SQL), then fires 02:1B
// (sealMinCalculationNBA). No candidate ⇒ no-act contrafactual (A8). Contract: breakdown_N8N 02:1A.
// Knowledge_Case is NOT written here (that is the 05B diagnosis flow).

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

type Verdict = { action_code: string; verdict: string; standard: number | null; gap: number | null };

// independent re-derivation of the deterministic rule (worst relative gap among problems; tie → code asc)
function expectedLever(vs: Verdict[]): string | null {
  const problems = vs.filter((v) => (v.verdict === "below" || v.verdict === "above") && v.standard != null && v.gap != null);
  if (problems.length === 0) return null;
  problems.sort((a, b) => {
    const sa = Math.abs(a.gap!) / Math.abs(a.standard!);
    const sb = Math.abs(b.gap!) / Math.abs(b.standard!);
    return sb - sa || a.action_code.localeCompare(b.action_code);
  });
  return problems[0]!.action_code;
}

async function cohortOf(restaurantId: string): Promise<string> {
  const r = await rows<{ cohort_id: string }>(
    pool,
    `select cohort_id from cohort."Cohort_Membership_Snapshot" where restaurant_id=$1 and week=$2`,
    [restaurantId, W1],
  );
  return r[0]!.cohort_id;
}
async function verdicts(restaurantId: string): Promise<Verdict[]> {
  return rows<Verdict>(
    pool,
    `select action_code, verdict, standard::float8 standard, gap::float8 gap from cohort.fn_nba_test_all($1,$2)`,
    [restaurantId, W1],
  );
}
async function pick(cond: string): Promise<string> {
  const r = await rows<{ restaurant_id: string }>(
    pool,
    `select restaurant_id from cohort."Cohort_Membership_Snapshot" where week=$1 and ${cond} order by restaurant_id limit 1`,
    [W1],
  );
  expect(r.length, `fixture not found: ${cond}`).toBe(1);
  return r[0]!.restaurant_id;
}

describe("02:1A — NBA engine proposes a lever (deterministic gap-rank) + fires 02:1B", () => {
  it("e1: proposes the worst-relative-gap problem; writes NBA_Proposal + seals min_calculation", async () => {
    const rid = await pick("m_connection < 0.50"); // a clear problem exists
    const cohort = await cohortOf(rid);
    const expected = expectedLever(await verdicts(rid));
    expect(expected).not.toBeNull();

    const res = await proposeNba({ restaurantId: rid, cohortId: cohort, week: W1 });
    expect(res.levered).toBe(true);
    expect(res.actionType).toBe(expected);
    expect(res.effectiveLevel).toBe("LOW"); // arms: nba_request=LOW(catalog), evals/tier empty ⇒ LOW

    // NBA_Proposal row written with the §8 fields, never a fabricated number
    const p = await rows<{ action_type: string; root_cause: string | null; nba_request: string | null; cohort_rule_version: string }>(
      pool,
      `select action_type, root_cause, nba_request, cohort_rule_version from gov."NBA_Proposal" where nba_id=$1`,
      [res.nbaId],
    );
    expect(p[0]?.action_type).toBe(expected);
    expect(p[0]?.root_cause).toBeTruthy(); // templated text [C]
    expect(p[0]?.nba_request).toBe("LOW"); // never HIGH (§3.10)
    expect(p[0]?.cohort_rule_version).toBe("v1"); // stamped (anti-mix)

    // 02:1B fired: a min_calculation row keyed by nba_id (XOR origin = nba)
    const m = await rows<{ effective_level: string }>(
      pool,
      `select effective_level from gov."min_calculation" where nba_id=$1`,
      [res.nbaId],
    );
    expect(m[0]?.effective_level).toBe("LOW");
  });

  it("e2: deterministic — same brutos ⇒ same proposed action_type", async () => {
    const rid = await pick("m_connection < 0.50");
    const cohort = await cohortOf(rid);
    const a = await proposeNba({ restaurantId: rid, cohortId: cohort, week: W1 });
    await resetDb(pool);
    await runP01({ week: W1, refDate: REF });
    const cohort2 = await cohortOf(rid);
    const b = await proposeNba({ restaurantId: rid, cohortId: cohort2, week: W1 });
    expect(b.actionType).toBe(a.actionType);
  });

  it("e3: no problem in any dimension ⇒ no-act A8, no min sealed (escalate to human)", async () => {
    // make every signal within range for one restaurant, in a tx
    const c = await pool.connect();
    try {
      await c.query("begin");
      const r = await c.query<{ restaurant_id: string; cohort_id: string }>(
        `select restaurant_id, cohort_id from cohort."Cohort_Membership_Snapshot" where week=$1 limit 1`,
        [W1],
      );
      const rid = r.rows[0]!.restaurant_id;
      const cohort = r.rows[0]!.cohort_id;
      await c.query(
        `update cohort."Cohort_Membership_Snapshot"
           set m_connection=0.95, m_quality=0.95, price_pctile_in_cohort=10,
               cancel_by_restaurant=0.01, cancel_by_customer=0.0, zone_demand_trend=0.10
         where restaurant_id=$1 and week=$2`,
        [rid, W1],
      );
      const res = await proposeNba({ restaurantId: rid, cohortId: cohort, week: W1 }, undefined, c);
      expect(res.levered).toBe(false);
      expect(res.actionType).toBe("A8");
      const m = await c.query(`select 1 from gov."min_calculation" where nba_id=$1`, [res.nbaId]);
      expect(m.rowCount).toBe(0); // no candidate ⇒ no autonomy to gate
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("e4: §14 — engine is the producer; NBA_Proposal stays empty until it runs", async () => {
    await resetDb(pool); // pristine: no producer has run
    expect(await count(pool, 'gov."NBA_Proposal"')).toBe(0);
    expect(await count(pool, 'gov."min_calculation"')).toBe(0);
    await runP01({ week: W1, refDate: REF }); // re-seed signals for the afterAll/other files
  });
});
