import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { proposeAndAutoActForCohort } from "../../server/cockpit/runNbaForCohort";
import { weekSummary, listAutoActions } from "../../server/routers/cockpit";

// 02:CP2 — the REAL engine→propose→auto-act loop end to end. NOTHING is crafted here: proposeNba runs the
// real funnel and sealMinCalculationNBA decides auto_releasable from the real n_min/k_anon/policy. The test
// only sets the governance PRECONDITIONS the demo seed sets (a signed LOW policy + a green LOW eval) and then
// asserts the spectrum EMERGES from the engine — including that the AI clears at least one action on its own
// (Leo's anti-hollow check: if the engine never produces an auto, the autonomy feature has nothing to act on).
// This commits to the shared DB, so afterAll resets it (the gate runs suites sequentially).

const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
}, 120_000);
afterAll(async () => {
  await resetDb(pool); // clear the committed proposals/dispatches so the next suite starts pristine (§14)
  await pool.end();
});

describe("02:CP2 — cockpit propose + auto-act (real engine)", () => {
  it("the engine's auto/human spectrum emerges, and the AI acts alone on >=1 action", async () => {
    // The cohort with the most problem restaurants (so n_min/k_anon hold ⇒ the engine CAN clear an auto).
    const target = (
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
    // The governance preconditions the demo seed provides: a signed LOW policy (accountable IN-POOL human) +
    // green LOW eval ⇒ the 2nd/3rd min() arms resolve LOW ⇒ auto is POSSIBLE (the lever's gates still decide).
    const intent = (
      await pool.query<{ intent_id: string }>(`select intent_id from catalog."Intent_Catalog" limit 1`)
    ).rows[0]!.intent_id;
    const operator = (
      await pool.query<{ user_id: string }>(
        `select user_id from gov."User" where tenant_id=$1 and role='agent_manager_senior' order by user_id limit 1`,
        [target.tenant_id],
      )
    ).rows[0]!.user_id;
    await pool.query(
      `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap, human_signature)
       values ('pt-cp2', $1, 'pv-zzz-cp2', 'LOW', $2) on conflict (policy_id) do nothing`,
      [target.tier_base, operator],
    );
    await pool.query(
      `insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status)
       values ($1, $2, 'cp2', 'LOW', 'green') on conflict (cohort_id, intent, version) do nothing`,
      [target.cohort_id, intent],
    );

    const out = await proposeAndAutoActForCohort(target.cohort_id, target.tenant_id);
    expect(out.proposed).toBeGreaterThan(0); // the engine proposed real actions
    expect(out.auto_acted + out.escalated).toBe(out.proposed); // spectrum is internally consistent
    expect(out.auto_acted).toBeGreaterThan(0); // the AI cleared >=1 on its own (feature is NOT hollow)

    // Every autonomous action left an honest origin='auto', un-confirmed trace (§7 / §3.6).
    const auto = (
      await pool.query<{ n: number; bad: number }>(
        `select count(*)::int as n,
                count(*) filter (where dt.confirmer_id is not null or dt.independence_guaranteed)::int as bad
           from gov."Action_Dispatch" ad
           join gov."Decision_Trace" dt on dt.trace_id = ad.decision_trace_id
          where dt.origin = 'auto' and ad.tenant_id = $1`,
        [target.tenant_id],
      )
    ).rows[0]!;
    expect(auto.n).toBe(out.auto_acted); // each auto-act is one origin='auto' dispatch
    expect(auto.bad).toBe(0); // none claim a human confirmer (independence_guaranteed=false throughout)

    // Registry reads (the cockpit surfaces): "your week" counts the autonomous actions WITHOUT inflating the
    // human "released" tally (§3.11 separation), and the registry lists exactly those dispatches with a title.
    const exec = <T extends import("pg").QueryResultRow>(sql: string, params: readonly unknown[]) =>
      pool.query<T>(sql, params as unknown[]).then((r) => r.rows);
    const ws = await weekSummary(target.tenant_id, exec);
    expect(ws.auto_acted).toBe(out.auto_acted); // every auto-act shows in "your week"
    expect(ws.released).toBe(0); // nobody released by hand here ⇒ auto is NOT mis-counted as a human release
    const reg = await listAutoActions(target.tenant_id, exec);
    expect(reg.length).toBe(out.auto_acted); // the registry lists exactly the autonomous dispatches
    expect(reg.every((r) => r.title.length > 0)).toBe(true); // each carries its rendered title ([V], §14)
  }, 120_000);
});
