import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { runEval, type EvalProvider } from "../../server/eval/runEval";

// EPIC-B4 — the golden-set evaluator E2E. The VERDICT (status/κ/n/redteam) is PRODUCED by runEval over a
// seeded golden set (INPUT [V]); promotion is a human act; the produced released_evals flows into the
// least() engine. All numbers are SQL/math — the LLM is only the evaluated (a deterministic provider here).
function caller(tenantId: string, userId: string) {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
  return appRouter.createCaller(ctx);
}

const VERSION = "b4-gs-medium"; // certifies MEDIUM
const COHORT = "c_b4";
// A provider that always answers "A1": correct on the 20 A1-cases, WRONG on the 10 A2-cases ⇒ 20/30 ≈ 0.667
// pass-rate < eval_pass_threshold(0.80) ⇒ status red. κ is unchanged (κ is over judges, not the AI).
const failProvider: EvalProvider = { answer: () => Promise.resolve("A1") };

let pool: pg.Pool;
let intent: string;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);

  const crv = (
    await rows<{ value: string }>(pool, `select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`)
  )[0]!.value;
  intent = (await rows<{ intent_id: string }>(pool, `select intent_id from catalog."Intent_Catalog" order by intent_id limit 1`))[0]!
    .intent_id;
  const r1 = (
    await rows<{ restaurant_id: string }>(
      pool,
      `select restaurant_id from tenant."Restaurant" where tenant_id='POOL-001' order by restaurant_id limit 1`,
    )
  )[0]!.restaurant_id;

  // INPUT (seedable [V]): a POOL-001 cohort + the golden set that certifies MEDIUM.
  await pool.query(
    `insert into cohort."Cohort"(cohort_id,cuisine,zone,tier_base,cohort_rule_version)
     values ($1,'pizza','north','long_tail',$2) on conflict do nothing`,
    [COHORT, crv],
  );
  await pool.query(
    `insert into cohort."Cohort_Membership_Snapshot"
       (restaurant_id,cohort_id,week,cohort_rule_version,percentile_in_cohort,gap_to_top,provenance)
     values ($1,$2,'2026-06-22',$3,50,0.5,'[V]')`,
    [r1, COHORT, crv],
  );
  await pool.query(`insert into gov."Eval_Set"(version,target_level,description) values ($1,'MEDIUM','b4 test set')`, [VERSION]);

  // 30 cases (= eval_min_n): 20 with correct_label A1, 10 with A2. Each case has 3 judges who AGREE
  // per case (unanimous) but the cases vary across categories ⇒ Fleiss κ = 1.0 (≥ eval_kappa_min 0.60).
  for (let i = 0; i < 30; i++) {
    const label = i < 20 ? "A1" : "A2";
    const cid = (
      await rows<{ eval_case_id: string }>(
        pool,
        `insert into gov."Eval_Case"(cohort_id,intent,version,scenario,correct_label)
         values ($1,$2,$3,$4::jsonb,$5) returning eval_case_id`,
        [COHORT, intent, VERSION, JSON.stringify({ ai_label: label }), label],
      )
    )[0]!.eval_case_id;
    for (const j of ["U-J1", "U-J2", "U-J3"]) {
      await pool.query(`insert into gov."Eval_Judge_Label"(eval_case_id,judge_id,label) values ($1,$2,$3)`, [cid, j, label]);
    }
  }
}, 120_000);

afterAll(async () => {
  await resetDb(pool);
  await pool.end();
});

describe("EPIC-B4 eval evaluator — produced verdict, human promotion, wired effective_level", () => {
  it("SC-001 + INV-3a: a passed golden set ⇒ status=green + real κ/n, and does NOT raise released_evals", async () => {
    const v = await runEval(COHORT, intent, VERSION); // default deterministic provider ⇒ all-correct
    expect(v.status).toBe("green");
    expect(v.passRate).toBe(1);
    expect(v.kappa).toBe(1); // Fleiss κ over the judges (SQL), not an LLM number
    expect(v.n).toBe(30);
    expect(v.redteamIndependent).toBe(true);

    // INV-3a: passing alone never raises autonomy (promotion is human). The verdict cols are [V]; released
    // stays at the conservative floor (NULL on this first green insert — runEval does not raise on green).
    const cell = (
      await rows<{ released_evals: string | null; status: string; n_golden_cases: number; prov: Record<string, string> }>(
        pool,
        `select released_evals, status, n_golden_cases, provenance_by_field as prov
           from gov."Eval_Cell" where cohort_id=$1 and intent=$2 and version=$3`,
        [COHORT, intent, VERSION],
      )
    )[0]!;
    expect(cell.released_evals).toBeNull(); // NOT raised by a green run
    expect(cell.prov.status).toBe("[V]"); // verdict is a measured pass, not the [I] floor
  });

  it("INV-2: κ is identical whatever the AI answers (the number is SQL over judges, not the model)", async () => {
    const passV = await runEval(COHORT, intent, VERSION);
    const failV = await runEval(COHORT, intent, VERSION, failProvider);
    expect(passV.kappa).toBe(failV.kappa); // same judges ⇒ same κ
    expect(passV.passRate).toBe(1);
    expect(failV.passRate).toBeCloseTo(20 / 30, 4); // graded deterministically: 20 right / 30
    expect(passV.status).toBe("green");
    expect(failV.status).toBe("red"); // grade is what flips status, not κ
  });

  it("INV-3b: promote is rejected unless status=green (evidence-gated)", async () => {
    // The cell is RED from the previous block ⇒ promotion must be refused.
    await expect(caller("POOL-001", "U-OP-001").eval.promote({ cohortId: COHORT, intent, version: VERSION })).rejects.toThrow(
      /not green/i,
    );
  });

  it("INV-3b + INV-4: a human promotes a green cell to MEDIUM, and effective_level then computes MEDIUM", async () => {
    await runEval(COHORT, intent, VERSION); // back to green
    const out = await caller("POOL-001", "U-OP-001").eval.promote({ cohortId: COHORT, intent, version: VERSION });
    expect(out.releasedEvals).toBe("MEDIUM");
    expect(out.signedBy).toBe("U-OP-001");

    const cell = (
      await rows<{ released_evals: string; prov: Record<string, string> }>(
        pool,
        `select released_evals, provenance_by_field as prov from gov."Eval_Cell" where cohort_id=$1 and intent=$2 and version=$3`,
        [COHORT, intent, VERSION],
      )
    )[0]!;
    expect(cell.released_evals).toBe("MEDIUM");
    expect(cell.prov.released_evals).toBe("[V]");
    expect(cell.prov.released_evals_signed_by).toBe("U-OP-001");

    // INV-4 wire: the produced released_evals flows into the least() engine — with permissive play+cap,
    // effective_level is now MEDIUM (was floored at LOW before the evaluator existed).
    const eff = (
      await rows<{ lvl: string }>(
        pool,
        `select gov.compute_effective_level('HIGH'::public.autonomy_level, $1::public.autonomy_level, 'HIGH'::public.autonomy_level) as lvl`,
        [cell.released_evals],
      )
    )[0]!.lvl;
    expect(eff).toBe("MEDIUM");
  });

  it("SC-002: a failing re-run flips status=red and AUTO-DOWNGRADES released_evals MEDIUM→LOW", async () => {
    // Precondition: the cell is MEDIUM (promoted in the previous block).
    const before = (
      await rows<{ released_evals: string }>(
        pool,
        `select released_evals from gov."Eval_Cell" where cohort_id=$1 and intent=$2 and version=$3`,
        [COHORT, intent, VERSION],
      )
    )[0]!.released_evals;
    expect(before).toBe("MEDIUM");

    const v = await runEval(COHORT, intent, VERSION, failProvider);
    expect(v.status).toBe("red");
    expect(v.downgraded).toBe(true);

    const cell = (
      await rows<{ released_evals: string; prov: Record<string, string> }>(
        pool,
        `select released_evals, provenance_by_field as prov from gov."Eval_Cell" where cohort_id=$1 and intent=$2 and version=$3`,
        [COHORT, intent, VERSION],
      )
    )[0]!;
    expect(cell.released_evals).toBe("LOW"); // auto-downgrade, no human needed
    expect(cell.prov.released_evals).toBe("[C]"); // computed downgrade, not a [V] human grant
    // B4-2: the prior promotion's signature is stripped — a downgraded LOW must NOT claim a human signed it.
    expect(cell.prov.released_evals_signed_by).toBeUndefined();
  });

  it("§3.4: running another pool's cohort is blocked (cross-pool abort)", async () => {
    await expect(caller("POOL-002", "U-OP-002").eval.run({ cohortId: COHORT, intent, version: VERSION })).rejects.toThrow(
      /your pool/i,
    );
  });
});
