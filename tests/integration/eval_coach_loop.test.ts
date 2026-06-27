import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { runEval } from "../../server/eval/runEval";
import { authorGoldenSet } from "../../server/eval/authorGoldenSet";
import { motorAnswerGrounded, groundedEvalProvider, type VerdictLoader } from "../../server/eval/motorAnswerGrounded";
import type { MotorReasoning } from "../../server/motor/reasoning";
import type { NbaVerdict } from "../../server/agente/reasoning";

// EPIC-B4 coach loop — the operator authors their OWN golden set (INPUT [V]); the eval grades the LEARNING
// motor; and TEACHING a lesson (a reviewed Knowledge_Case) raises the score from red→green, after which a
// human promotes the green cell and released_evals lifts LOW→MEDIUM. Hermetic: an injected reasoning stub +
// verdict loader prove the loop with no LLM and no P01 run; every number is still SQL (pass/κ).
function caller(tenantId: string, userId: string) {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
  return appRouter.createCaller(ctx);
}

const TENANT = "POOL-001";
const COHORT = "c_coach";
const VERSION = "coach-gs-medium";
const WEEK = "2026-06-22";

const v = (action_code: string, verdict: string): NbaVerdict => ({
  action_code, dimension: "m_connection", measured: 0.4, standard: 0.6, verdict, gap: 0.2, within_range: true, n_min_ok: true, k_anon_ok: true,
});

let pool: pg.Pool;
let intent: string;
let r1: string; // an "act" restaurant — correct call A4
let r2: string; // a "no-act" restaurant — correct call A8

// The injected loader: r1 has an actionable connection gap (A4 'below'); r2 has none (all 'ok' ⇒ A8).
const load: VerdictLoader = (restaurantId) =>
  Promise.resolve(restaurantId === r1 ? [v("A4", "below"), v("A1", "ok")] : [v("A4", "ok"), v("A1", "ok")]);

// A coachable reasoning stub: UNTAUGHT (no grounding) it MISSES — always picks A1. TAUGHT (a reviewed lesson
// grounds the area) it picks the actionable lever, else no-act (lever null ⇒ A8). So approving the lesson is
// exactly what flips the answer ⇒ raises the eval score. It never invents a number (§8).
const coachable: MotorReasoning = {
  proposeHypothesis: ({ verdicts, grounding }) =>
    Promise.resolve(
      grounding.length === 0
        ? { lever: verdicts.find((x) => x.action_code === "A1") ?? null, rootCause: "untaught", confidence: 0.9, reasoning: "miss" }
        : { lever: verdicts.find((x) => x.verdict === "below") ?? null, rootCause: "taught", confidence: 0.9, reasoning: "grounded" },
    ),
};

const teach = (reviewed: boolean) =>
  pool.query(`update tenant."Knowledge_Case" set reviewed=$2 where tenant_id=$1 and area_type='m_connection'`, [TENANT, reviewed]);

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  const crv = (await rows<{ value: string }>(pool, `select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`))[0]!.value;
  intent = (await rows<{ intent_id: string }>(pool, `select intent_id from catalog."Intent_Catalog" order by intent_id limit 1`))[0]!.intent_id;
  const rs = await rows<{ restaurant_id: string }>(pool, `select restaurant_id from tenant."Restaurant" where tenant_id='POOL-001' order by restaurant_id limit 2`);
  r1 = rs[0]!.restaurant_id;
  r2 = rs[1]!.restaurant_id;

  await pool.query(
    `insert into cohort."Cohort"(cohort_id,cuisine,zone,tier_base,cohort_rule_version) values ($1,'pizza','north','long_tail',$2) on conflict do nothing`,
    [COHORT, crv],
  );
  for (const r of [r1, r2]) {
    await pool.query(
      `insert into cohort."Cohort_Membership_Snapshot"(restaurant_id,cohort_id,week,cohort_rule_version,percentile_in_cohort,gap_to_top,provenance)
       values ($1,$2,$3,$4,50,0.5,'[V]')`,
      [r, COHORT, WEEK, crv],
    );
  }
  // The lesson the operator will approve (starts un-reviewed ⇒ does NOT ground until taught — the RL-guard).
  await pool.query(
    `insert into tenant."Knowledge_Case"(tenant_id,area_type,pattern,outcome,resolution,reviewed)
     values ($1,'m_connection','low connection vs peers','resolved','prefer A4 (connection ops) for a connection gap',false)`,
    [TENANT],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("EPIC-B4 coach loop", () => {
  it("teaching a lesson flips the grounded motor's answer A1→A4 (the coach step)", async () => {
    await teach(false);
    expect(await motorAnswerGrounded(r1, WEEK, TENANT, coachable, load)).toBe("A1"); // untaught ⇒ misses
    await teach(true);
    expect(await motorAnswerGrounded(r1, WEEK, TENANT, coachable, load)).toBe("A4"); // taught ⇒ correct
    expect(await motorAnswerGrounded(r2, WEEK, TENANT, coachable, load)).toBe("A8"); // taught + no gap ⇒ no-act
  });

  it("author own golden set → grade the learning motor → coach to green → promote lifts LOW→MEDIUM", async () => {
    const cases = [
      ...Array.from({ length: 20 }, () => ({ restaurantId: r1, correctLabel: "A4" })),
      ...Array.from({ length: 10 }, () => ({ restaurantId: r2, correctLabel: "A8" })),
    ];
    const authored = await authorGoldenSet({ cohortId: COHORT, intent, version: VERSION, targetLevel: "MEDIUM", week: WEEK, cases, authorId: "U-OP-001" });
    expect(authored.n).toBe(30);

    // §14 anti-fake: authoring writes INPUT only (cases + judges) — NO Eval_Cell verdict exists yet.
    const cellPre = await rows(pool, `select 1 from gov."Eval_Cell" where cohort_id=$1 and intent=$2 and version=$3`, [COHORT, intent, VERSION]);
    expect(cellPre.length).toBe(0);

    const provider = groundedEvalProvider(TENANT, coachable, load);

    // UNTAUGHT: the motor misses every case ⇒ pass 0 ⇒ red. The verdict is PRODUCED, never seeded (§14).
    await teach(false);
    const red = await runEval(COHORT, intent, VERSION, provider);
    expect(red.passRate).toBe(0);
    expect(red.status).toBe("red");

    // COACH: approve the lesson ⇒ the learning motor now answers correctly ⇒ re-grade rises to green.
    await teach(true);
    const green = await runEval(COHORT, intent, VERSION, provider);
    expect(green.passRate).toBe(1);
    expect(green.n).toBe(30);
    expect(green.status).toBe("green");

    // The failing run auto-DOWNGRADED to LOW; the green re-run LEAVES it (raising is the human's act, never
    // automatic) — so the cell sits at the LOW floor until a human promotes. §14: the eval never self-raises.
    const before = (await rows<{ released_evals: string | null }>(pool, `select released_evals from gov."Eval_Cell" where cohort_id=$1 and intent=$2 and version=$3`, [COHORT, intent, VERSION]))[0]!;
    expect(before.released_evals).toBe("LOW");

    // PROMOTE (human + evidence): the senior manager signs ⇒ released_evals lifts to the certified MEDIUM.
    const promoted = await caller(TENANT, "U-OP-001").eval.promote({ cohortId: COHORT, intent, version: VERSION });
    expect(promoted.releasedEvals).toBe("MEDIUM");
  });

  it("re-authoring the same version is idempotent (no duplicate / partial set)", async () => {
    const again = await authorGoldenSet({ cohortId: COHORT, intent, version: VERSION, targetLevel: "MEDIUM", week: WEEK, cases: [{ restaurantId: r1, correctLabel: "A4" }], authorId: "U-OP-001" });
    expect(again.n).toBe(0);
    const n = (await rows<{ c: string }>(pool, `select count(*)::text c from gov."Eval_Case" where cohort_id=$1 and intent=$2 and version=$3`, [COHORT, intent, VERSION]))[0]!.c;
    expect(n).toBe("30");
  });

  it("router: authorFromTemplate authors + produces a verdict; misses lists diffs; cross-pool blocked", async () => {
    const V2 = "coach-router-medium";
    const rows2 = [
      ...Array.from({ length: 20 }, () => ({ restaurantId: r1, correctLabel: "A4" })),
      ...Array.from({ length: 10 }, () => ({ restaurantId: r2, correctLabel: "A8" })),
    ];
    const res = await caller(TENANT, "U-OP-001").eval.authorFromTemplate({ cohortId: COHORT, intent, version: V2, targetLevel: "MEDIUM", week: WEEK, rows: rows2 });
    expect(res.authored).toBe(30);
    expect(typeof res.coachable).toBe("boolean");
    expect(res.verdict.n).toBe(30); // the learning motor was graded on all 30 cases
    const m = await caller(TENANT, "U-OP-001").eval.misses({ cohortId: COHORT, intent, version: V2 });
    expect(Array.isArray(m.misses)).toBe(true);
    // cross-pool: a different pool's manager cannot touch this cohort (§3.4/§7)
    await expect(caller("POOL-002", "U-OP-002").eval.misses({ cohortId: COHORT, intent, version: V2 })).rejects.toThrow();
  });
});
