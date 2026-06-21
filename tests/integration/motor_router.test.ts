import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { runMotorForCohort } from "../../server/motor/runMotorFanout";
import { stubMotorReasoning } from "../../server/motor/reasoning";
import { getControls, setControls, listEscalations } from "../../server/motor/controls";

// 02C MOTOR-LLM — the controls + escalations surface end to end against the REAL substrate. We DO NOT call
// run/runPool with the live LLM (no API key in CI); the money-0 sanity drives runMotorForCohort with the
// deterministic stub directly (NOT via the router). Commits to the shared DB ⇒ afterAll resets (§14).
const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;
const exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]) =>
  pool.query<T>(sql, params as unknown[]).then((r) => r.rows);

// The cohort with the most connection-problem restaurants ⇒ n_min/k_anon hold ⇒ the engine CAN clear an auto.
// Returns the cohort + its tier + this pool's tenant + a problem restaurant (mirrors motor_loop's arrange).
async function pickProblemCohort(): Promise<{ cohortId: string; tierId: string; tenantId: string }> {
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
  return { cohortId: t.cohort_id, tierId: t.tier_base, tenantId: t.tenant_id };
}

// Two distinct tenants present in the seed (for the tenant-scoping assertions).
async function twoTenants(): Promise<{ a: string; b: string }> {
  const rows = (
    await pool.query<{ tenant_id: string }>(`select distinct tenant_id from tenant."Restaurant" order by tenant_id`)
  ).rows;
  return { a: rows[0]!.tenant_id, b: rows[1]!.tenant_id };
}

// Seed ONE Knowledge_Case (reviewed=false). Escalated cases carry not_resolved_reason; resolved carry resolution.
async function seedCase(
  tenantId: string,
  outcome: "resolved" | "escalated",
  attemptId: string | null = null,
): Promise<string> {
  const path = JSON.stringify({ attempt_id: attemptId });
  const r = await pool.query<{ kb_case_id: string }>(
    `insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, not_resolved_reason, path_used, reviewed)
     values ($1,'m_connection',$2,$3,$4,$5,$6::jsonb,false) returning kb_case_id`,
    [
      tenantId,
      `m_connection_below`,
      outcome,
      outcome === "resolved" ? "acted A1" : null,
      outcome === "escalated" ? "out_of_range" : null,
      path,
    ],
  );
  return r.rows[0]!.kb_case_id;
}

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
}, 120_000);
afterAll(async () => {
  await resetDb(pool);
  await pool.end();
});

describe("02C — motor controls + escalations (real substrate)", () => {
  it("setControls(auto_actions) writes the tier range and getControls reads it back", async () => {
    const { tierId, tenantId } = await pickProblemCohort();
    // A signed Policy_Tier for this tier must exist to edit (governance row, keyed by tier).
    const operator = (
      await pool.query<{ user_id: string }>(
        `select user_id from gov."User" where tenant_id=$1 and role='agent_manager_senior' order by user_id limit 1`,
        [tenantId],
      )
    ).rows[0]!.user_id;
    await pool.query(
      `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap, human_signature)
       values ('pt-mrouter', $1, 'pv-zzz-mrouter', 'LOW', $2) on conflict (policy_id) do nothing`,
      [tierId, operator],
    );

    const set = await setControls(tenantId, { tier_id: tierId, auto_actions: ["A1", "A4"] }, exec);
    expect(set.ok).toBe(true);

    const ctrls = await getControls(tenantId, exec);
    const tier = ctrls.tiers.find((t) => t.tier_id === tierId);
    expect(tier).toBeTruthy();
    expect(tier!.auto_actions).toEqual(expect.arrayContaining(["A1", "A4"]));
  });

  it("setControls(knob) updates a motor knob by name (global config)", async () => {
    const { tenantId } = await pickProblemCohort();
    await setControls(tenantId, { knob_key: "motor_min_confidence", knob_value: "0.7" }, exec);
    const ctrls = await getControls(tenantId, exec);
    const knob = ctrls.knobs.find((k) => k.key === "motor_min_confidence");
    expect(knob?.value).toBe("0.7");
  });

  it("setControls(approve_case_id) flips reviewed=true and is TENANT-SCOPED (foreign case untouched)", async () => {
    const { a, b } = await twoTenants();
    const mine = await seedCase(a, "resolved");
    const foreign = await seedCase(b, "resolved");

    const r = await setControls(a, { approve_case_id: foreign }, exec);
    expect(r.ok).toBe(true);
    // Approving tenant-A with tenant-B's id must NOT flip it (the where clause enforces tenant_id=$tenant).
    const foreignReviewed = (
      await pool.query<{ reviewed: boolean }>(`select reviewed from tenant."Knowledge_Case" where kb_case_id=$1`, [foreign])
    ).rows[0]!.reviewed;
    expect(foreignReviewed).toBe(false);

    await setControls(a, { approve_case_id: mine }, exec);
    const mineReviewed = (
      await pool.query<{ reviewed: boolean }>(`select reviewed from tenant."Knowledge_Case" where kb_case_id=$1`, [mine])
    ).rows[0]!.reviewed;
    expect(mineReviewed).toBe(true);
    // And mine no longer shows in the pending queue.
    const ctrls = await getControls(a, exec);
    expect(ctrls.pending_cases.some((c) => c.kb_case_id === mine)).toBe(false);
  });

  it("listEscalations returns only THIS tenant's escalated cases", async () => {
    const { a, b } = await twoTenants();
    const mine = await seedCase(a, "escalated");
    await seedCase(b, "escalated"); // a foreign escalation must NOT appear

    const rows = await listEscalations(a, exec);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.kb_case_id === mine)).toBe(true);
    // Every returned row belongs to tenant A (we re-fetch tenant_id to prove the scope).
    for (const row of rows) {
      const owner = (
        await pool.query<{ tenant_id: string }>(`select tenant_id from tenant."Knowledge_Case" where kb_case_id=$1`, [
          row.kb_case_id,
        ])
      ).rows[0]!.tenant_id;
      expect(owner).toBe(a);
    }
    // cost_usd is NULL here (no priced LLM rows for these seeded attempts) — honest "unpriced", not fake $0.
    const seeded = rows.find((r) => r.kb_case_id === mine)!;
    expect(seeded.cost_usd).toBeNull();
  });

  it("money-0 (§7): running the motor never auto-dispatches a financial_class='direct' NBA", async () => {
    const { cohortId, tierId, tenantId } = await pickProblemCohort();
    const operator = (
      await pool.query<{ user_id: string }>(
        `select user_id from gov."User" where tenant_id=$1 and role='agent_manager_senior' order by user_id limit 1`,
        [tenantId],
      )
    ).rows[0]!.user_id;
    const intent = (await pool.query<{ intent_id: string }>(`select intent_id from catalog."Intent_Catalog" limit 1`)).rows[0]!
      .intent_id;
    await pool.query(
      `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap, allowed_today, human_signature)
       values ('pt-money0', $1, 'pv-zzz-money0', 'LOW', '{"auto_actions":["A1","A3","A4","A6","A7"]}'::jsonb, $2)
       on conflict (policy_id) do update set allowed_today=excluded.allowed_today`,
      [tierId, operator],
    );
    await pool.query(
      `insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status)
       values ($1, $2, 'money0', 'LOW', 'green') on conflict (cohort_id, intent, version) do nothing`,
      [cohortId, intent],
    );

    await runMotorForCohort(cohortId, tenantId, stubMotorReasoning);

    const money = (
      await pool.query<{ n: number }>(
        `select count(*)::int n from gov."Action_Dispatch" ad
           join gov."NBA_Proposal" p on p.nba_id::text = ad.nba_id
          where ad.tenant_id=$1 and p.financial_class='direct'`,
        [tenantId],
      )
    ).rows[0]!.n;
    expect(money).toBe(0); // the AI NEVER auto-released money (the hard-no holds even with A3/A7 in range)
  }, 120_000);
});
