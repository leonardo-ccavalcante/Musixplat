import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { sealMinCalculationNBA, type MinNbaInput } from "../../server/conversation/min";
import { proposeNba } from "../../server/agente/nba_engine";

// 02:BR-5 / 04 §3.3 L280 — the auto_releasable gate (the AUTO-vs-needs-human decision the cockpit shows).
// auto_releasable = effective_level=LOW ∧ no-money ∧ n_min_ok ∧ k_anon_ok ∧ policy_resolved. Any missing
// arm ⇒ false (fail-closed §3.7). LOW = low-stakes action ⇒ the AI acts alone; money / MEDIUM / HIGH /
// missing-policy ⇒ escalate to a human. Every insert runs inside a ROLLED-BACK tx so min_calculation
// stays empty pre-run (§14 antifake — the table is shared with the antifake project on one DB).

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

// Seal one min_calculation row in a throwaway tx; read its auto_releasable back, then roll back.
async function sealAuto(i: MinNbaInput): Promise<boolean | null> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await sealMinCalculationNBA(i, c);
    const row = await c.query<{ auto_releasable: boolean | null }>(
      `select auto_releasable from gov."min_calculation" where calculation_id=$1`,
      [r.calculationId],
    );
    return row.rows[0]!.auto_releasable;
  } finally {
    await c.query("rollback");
    c.release();
  }
}

const base: MinNbaInput = {
  nbaId: "nba-autodispatch-test",
  nbaRequest: "LOW",
  releasedEvals: "LOW",
  tierCap: "LOW",
  financialDirect: false,
  nMinOk: true,
  kAnonOk: true,
  policyResolved: true,
};

describe("02:BR-5 — auto_releasable gate (AUTO vs human, deterministic)", () => {
  it("LOW + non-money + n_min_ok + k_anon_ok + policy ⇒ auto (AI acts alone)", async () => {
    expect(await sealAuto({ ...base })).toBe(true);
  });

  it("money (financial_class=direct) ⇒ never auto (human)", async () => {
    expect(await sealAuto({ ...base, financialDirect: true })).toBe(false);
  });

  it("no policy resolved ⇒ fail-closed (human)", async () => {
    expect(await sealAuto({ ...base, policyResolved: false })).toBe(false);
  });

  it("n_min_ok=false (sample too small) ⇒ human", async () => {
    expect(await sealAuto({ ...base, nMinOk: false })).toBe(false);
  });

  it("k_anon_ok=false ⇒ human", async () => {
    expect(await sealAuto({ ...base, kAnonOk: false })).toBe(false);
  });

  it("effective_level not LOW (all arms MEDIUM) ⇒ human", async () => {
    expect(
      await sealAuto({ ...base, nbaRequest: "MEDIUM", releasedEvals: "MEDIUM", tierCap: "MEDIUM" }),
    ).toBe(false);
  });

  it("null arm ⇒ effective LOW but unknown gates default false ⇒ human (fail-closed)", async () => {
    // Only the arms passed; the gate inputs are omitted ⇒ financialDirect defaults true, gates false.
    expect(await sealAuto({ nbaId: "nba-x", nbaRequest: "LOW", releasedEvals: null, tierCap: null })).toBe(
      false,
    );
  });

  it("engine wiring: proposeNba with a resolved policy+eval computes auto_releasable (not null)", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const r = await c.query<{ restaurant_id: string; cohort_id: string }>(
        `select cms.restaurant_id, cms.cohort_id from cohort."Cohort_Membership_Snapshot" cms
         where cms.week=$1 and cms.m_connection < 0.50 order by cms.restaurant_id limit 1`,
        [W1],
      );
      const { restaurant_id, cohort_id } = r.rows[0]!;
      const tier = await c.query<{ tier_base: string; intent: string }>(
        `select c.tier_base, (select intent_id from catalog."Intent_Catalog" limit 1) as intent
         from cohort."Cohort" c where c.cohort_id=$1`,
        [cohort_id],
      );
      const { tier_base, intent } = tier.rows[0]!;
      await c.query(
        `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap)
         values ('pt-auto', $1, 'pv-auto', 'LOW')`,
        [tier_base],
      );
      await c.query(
        `insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status)
         values ($1, $2, 'v1', 'LOW', 'green')`,
        [cohort_id, intent],
      );
      const res = await proposeNba({ restaurantId: restaurant_id, cohortId: cohort_id, week: W1 }, undefined, c);
      const m = await c.query<{ auto_releasable: boolean | null; effective_level: string }>(
        `select auto_releasable, effective_level from gov."min_calculation" where nba_id=$1`,
        [res.nbaId],
      );
      expect(m.rows[0]!.effective_level).toBe("LOW");
      expect(m.rows[0]!.auto_releasable).not.toBeNull(); // the engine computes it, never leaves it null
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
