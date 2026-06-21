import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { runMotorAttempt, type MotorAttemptInput } from "../../server/motor/runMotor";
import { stubMotorReasoning, type MotorReasoning } from "../../server/motor/reasoning";

// 02C — the ≤3 hypothesis loop end to end against the REAL engine. NOTHING is crafted: fn_nba_test_all decides
// the verdict numbers and sealMinCalculationNBA decides auto_releasable. The motor ADDS the inRange gate
// (Policy_Tier.allowed_today) on top of the floor. The stub provider keeps CI deterministic (worst-relative
// gap = A1 m_connection). Commits to the shared DB ⇒ afterAll resets (§14, suites run sequentially).
const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;
let ctx: { cohortId: string; tenantId: string; tierId: string; restaurantId: string; operator: string };

async function arrange(allowed: string): Promise<void> {
  // The cohort with the most connection-problem restaurants ⇒ n_min/k_anon hold ⇒ the engine CAN clear an auto.
  const t = (
    await pool.query<{ cohort_id: string; tier_base: string; tenant_id: string }>(
      `select cms.cohort_id, ct.tier_base::text as tier_base, rt.tenant_id
         from cohort."Cohort_Membership_Snapshot" cms
         join cohort."Cohort" ct on ct.cohort_id = cms.cohort_id
         join tenant."Restaurant" rt on rt.restaurant_id = cms.restaurant_id
        where cms.week=$1 and cms.m_connection < 0.55
        group by cms.cohort_id, ct.tier_base, rt.tenant_id
        order by count(*) desc limit 1`,
      [W1],
    )
  ).rows[0]!;
  // A restaurant in that cohort where A1 is a CONFIRMED problem with both gates passing ⇒ auto_releasable holds.
  const r = (
    await pool.query<{ restaurant_id: string }>(
      `select cms.restaurant_id from cohort."Cohort_Membership_Snapshot" cms,
              lateral cohort.fn_nba_test(cms.restaurant_id, 'A1', $2::date) v
        where cms.cohort_id=$1 and cms.week=$2 and v.verdict='below' and v.n_min_ok and v.k_anon_ok
        order by cms.restaurant_id limit 1`,
      [t.cohort_id, W1],
    )
  ).rows[0]!;
  const operator = (
    await pool.query<{ user_id: string }>(
      `select user_id from gov."User" where tenant_id=$1 and role='agent_manager_senior' order by user_id limit 1`,
      [t.tenant_id],
    )
  ).rows[0]!.user_id;
  const intent = (await pool.query<{ intent_id: string }>(`select intent_id from catalog."Intent_Catalog" limit 1`)).rows[0]!.intent_id;
  // Signed LOW policy (the human-approved range) WITH the motor's allowed_today.auto_actions + green LOW eval.
  await pool.query(
    `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap, allowed_today, human_signature)
     values ('pt-motor', $1, 'pv-zzz-motor', 'LOW', $3::jsonb, $2)
     on conflict (policy_id) do update set allowed_today=excluded.allowed_today`,
    [t.tier_base, operator, allowed],
  );
  await pool.query(
    `insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status)
     values ($1, $2, 'motor', 'LOW', 'green') on conflict (cohort_id, intent, version) do nothing`,
    [t.cohort_id, intent],
  );
  ctx = { cohortId: t.cohort_id, tenantId: t.tenant_id, tierId: t.tier_base, restaurantId: r.restaurant_id, operator };
}

const input = (): MotorAttemptInput => ({ restaurantId: ctx.restaurantId, cohortId: ctx.cohortId, week: W1, tenantId: ctx.tenantId, tierId: ctx.tierId });

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
}, 120_000);
afterAll(async () => {
  await resetDb(pool);
  await pool.end();
});

describe("02C — runMotorAttempt (≤3 loop, real engine + stub provider)", () => {
  it("ACTS alone: A1 confirmed, in-range, auto_releasable ⇒ outcome=acted + honest origin='auto' trace", async () => {
    await arrange('{"auto_actions":["A1","A4","A6"]}');
    const out = await runMotorAttempt(input(), stubMotorReasoning);
    expect(out.outcome).toBe("acted");
    expect(["A1", "A4", "A6"]).toContain(out.reason); // acted on the worst-relative-gap ALLOWED non-money lever
    expect(out.nbaId).toBeTruthy();
    const trace = (
      await pool.query<{ n: number; bad: number }>(
        `select count(*)::int as n,
                count(*) filter (where dt.confirmer_id is not null or dt.independence_guaranteed)::int as bad
           from gov."Action_Dispatch" ad join gov."Decision_Trace" dt on dt.trace_id = ad.decision_trace_id
          where dt.origin='auto' and ad.tenant_id=$1`,
        [ctx.tenantId],
      )
    ).rows[0]!;
    expect(trace.n).toBeGreaterThan(0); // the AI acted alone
    expect(trace.bad).toBe(0); // no human confirmer claimed (independence_guaranteed=false §3.6)
    // A resolved Knowledge_Case (reviewed=false) was written for the next run to ground on (after approval).
    const kb = (await pool.query<{ n: number }>(`select count(*)::int n from tenant."Knowledge_Case" where tenant_id=$1 and outcome='resolved' and reviewed=false`, [ctx.tenantId])).rows[0]!;
    expect(kb.n).toBeGreaterThan(0);
  });

  it("ESCALATES out-of-range (§7): the confirmed lever is NOT in allowed_today ⇒ 0 dispatch, escalated case", async () => {
    await arrange('{"auto_actions":["A6"]}'); // A1 (the worst gap) is NOT allowed
    const before = (await pool.query<{ n: number }>(`select count(*)::int n from gov."Action_Dispatch" ad join gov."Decision_Trace" dt on dt.trace_id=ad.decision_trace_id where dt.origin='auto' and ad.tenant_id=$1`, [ctx.tenantId])).rows[0]!.n;
    const out = await runMotorAttempt(input(), stubMotorReasoning);
    expect(out.outcome).toBe("escalated");
    expect(out.reason).toBe("out_of_range");
    expect(out.nbaId).toBeNull();
    const after = (await pool.query<{ n: number }>(`select count(*)::int n from gov."Action_Dispatch" ad join gov."Decision_Trace" dt on dt.trace_id=ad.decision_trace_id where dt.origin='auto' and ad.tenant_id=$1`, [ctx.tenantId])).rows[0]!.n;
    expect(after).toBe(before); // NOTHING new dispatched — the human owns it
  });

  it("ESCALATES no-suppose: the AI has no confident hypothesis ⇒ escalate without acting", async () => {
    await arrange('{"auto_actions":["A1","A4","A6"]}');
    const noSuppose: MotorReasoning = { proposeHypothesis: async () => ({ lever: null, rootCause: "", confidence: null, reasoning: "" }) };
    const out = await runMotorAttempt(input(), noSuppose);
    expect(out.outcome).toBe("escalated");
    expect(out.reason).toBe("no_confident_hypothesis");
  });
});
