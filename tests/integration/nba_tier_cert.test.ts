import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { proposeNba } from "../../server/agente/nba_engine";

// 02:B4-TIER — autonomy is certified by TIER, not by concrete cohort. loadArms resolves a cohort's
// released_evals = least(own_cap, tier_default), default LOW, where tier_default = the highest [V]-PROMOTED +
// green Eval_Cell level among cohorts of the SAME tier_base+version. It is GLOBAL (eval-global model: the eval
// certifies the MODEL on a cohort-type for every pool), so ONE promotion lifts every cohort of that tier; the
// promote is the human-gated safety boundary. own_cap is the cohort's conservative floor: its own [V]
// promotion (worst tightens — the engine is intent-agnostic) OR any [C] auto-downgrade (a red re-eval vetoes
// inheritance so a downgraded cohort can't ride a sibling's cert, fail-closed §7). The number is still
// produced by compute_effective_level (§14) — only WHERE released_evals comes from changes.

const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;

let ridB: string; // a restaurant WITH a connection problem (so a lever is picked + min sealed)
let cohortB: string; // ridB's cohort (the one that should INHERIT)
let cohortA: string; // a different cohort of the SAME tier (the one we CERTIFY)

// mirror eval.promote: a [V] release (green) on a cohort. The level lifts the whole tier (global).
const promote = (cohortId: string, level: string, intent = "menu", ver = "gs-1") =>
  `insert into gov."Eval_Cell"(cohort_id,intent,version,released_evals,status,provenance_by_field)
   values ('${cohortId}','${intent}','${ver}','${level}','green','{"released_evals":"[V]"}'::jsonb)`;

async function releasedOf(client: pg.PoolClient, nbaId: string): Promise<string> {
  const r = await client.query<{ released_evals: string }>(
    `select released_evals from gov."min_calculation" where nba_id=$1`,
    [nbaId],
  );
  return r.rows[0]!.released_evals;
}

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });

  const b = (
    await rows<{ restaurant_id: string; cohort_id: string; tier_base: string }>(
      pool,
      `select cms.restaurant_id, cms.cohort_id, c.tier_base
         from cohort."Cohort_Membership_Snapshot" cms
         join cohort."Cohort" c on c.cohort_id = cms.cohort_id
        where cms.week = $1 and cms.m_connection < 0.50
        order by cms.restaurant_id limit 1`,
      [W1],
    )
  )[0]!;
  ridB = b.restaurant_id;
  cohortB = b.cohort_id;

  cohortA = (
    await rows<{ cohort_id: string }>(
      pool,
      `select distinct cms.cohort_id from cohort."Cohort_Membership_Snapshot" cms
         join cohort."Cohort" c on c.cohort_id = cms.cohort_id and c.tier_base = $2
        where cms.week = $1 and cms.cohort_id <> $3 order by cms.cohort_id limit 1`,
      [W1, b.tier_base, cohortB],
    )
  )[0]!.cohort_id;
}, 120_000);

afterAll(async () => {
  await pool.end();
});

// each test mutates Eval_Cell in a tx and rolls back — the seeded base is never polluted
async function withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback");
    c.release();
  }
}

describe("02:B4-TIER — by-tier autonomy certification (global)", () => {
  it("inherit: a sibling cohort with NO cell of its own inherits the tier's promoted level", async () => {
    await withTx(async (c) => {
      await c.query(promote(cohortA, "MEDIUM")); // certify a DIFFERENT cohort of the same tier
      const res = await proposeNba({ restaurantId: ridB, cohortId: cohortB, week: W1 }, undefined, c);
      expect(res.levered).toBe(true);
      expect(await releasedOf(c, res.nbaId)).toBe("MEDIUM"); // cohortB inherits from the tier
    });
  });

  it("tighten-down: the cohort's OWN promoted cell only lowers it below the tier (never raises)", async () => {
    await withTx(async (c) => {
      await c.query(promote(cohortA, "HIGH")); // tier proven HIGH
      await c.query(promote(cohortB, "LOW")); // but THIS cohort is tightened to LOW
      const res = await proposeNba({ restaurantId: ridB, cohortId: cohortB, week: W1 }, undefined, c);
      expect(await releasedOf(c, res.nbaId)).toBe("LOW"); // own (LOW) wins via least
    });
  });

  it("fail-closed: no promoted cell anywhere in the tier ⇒ LOW", async () => {
    await withTx(async (c) => {
      const res = await proposeNba({ restaurantId: ridB, cohortId: cohortB, week: W1 }, undefined, c);
      expect(await releasedOf(c, res.nbaId)).toBe("LOW");
    });
  });

  it("§14: a green but NON-[V] cell (un-promoted / auto-downgraded floor) never grants autonomy", async () => {
    await withTx(async (c) => {
      await c.query(
        `insert into gov."Eval_Cell"(cohort_id,intent,version,released_evals,status,provenance_by_field)
         values ('${cohortA}','menu','gs-1','HIGH','green','{"released_evals":"[I]"}'::jsonb)`,
      );
      const res = await proposeNba({ restaurantId: ridB, cohortId: cohortB, week: W1 }, undefined, c);
      expect(await releasedOf(c, res.nbaId)).toBe("LOW"); // not promoted ⇒ does not count
    });
  });

  it("collapse: multiple promoted cells in the tier resolve to the MAX (one promotion lifts the tier)", async () => {
    await withTx(async (c) => {
      await c.query(promote(cohortA, "MEDIUM", "menu"));
      await c.query(promote(cohortA, "HIGH", "order_review")); // a 2nd intent at a higher level
      const res = await proposeNba({ restaurantId: ridB, cohortId: cohortB, week: W1 }, undefined, c);
      expect(await releasedOf(c, res.nbaId)).toBe("HIGH"); // max over the tier
    });
  });

  it("own floor: a cohort certified at conflicting levels (HIGH + LOW) tightens to the LOWEST — never max up (§7)", async () => {
    await withTx(async (c) => {
      await c.query(promote(cohortA, "HIGH")); // tier proven HIGH
      await c.query(promote(cohortB, "HIGH", "menu")); // own: HIGH for one intent
      await c.query(promote(cohortB, "LOW", "order_review")); // own: LOW for another intent
      const res = await proposeNba({ restaurantId: ridB, cohortId: cohortB, week: W1 }, undefined, c);
      // the engine is intent-agnostic ⇒ the cohort's WORST own certification caps it (fail-closed), never HIGH
      expect(await releasedOf(c, res.nbaId)).toBe("LOW");
    });
  });

  it("auto-downgrade veto: a cohort whose own eval went red ([C]) caps at LOW even if a sibling keeps the tier promoted (§7)", async () => {
    await withTx(async (c) => {
      await c.query(promote(cohortA, "MEDIUM")); // a sibling keeps the tier proven at MEDIUM
      // cohortB's own eval re-ran RED ⇒ runEval auto-downgraded it ([C] LOW, status red) — NOT a [V] promotion
      await c.query(
        `insert into gov."Eval_Cell"(cohort_id,intent,version,released_evals,status,provenance_by_field)
         values ('${cohortB}','menu','gs-1','LOW','red','{"released_evals":"[C]"}'::jsonb)`,
      );
      const res = await proposeNba({ restaurantId: ridB, cohortId: cohortB, week: W1 }, undefined, c);
      expect(await releasedOf(c, res.nbaId)).toBe("LOW"); // the auto-downgrade vetoes the inherited MEDIUM
    });
  });
});
