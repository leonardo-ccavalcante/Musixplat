import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { runMotorForCohort } from "../../server/motor/runMotorFanout";
import { stubMotorReasoning } from "../../server/motor/reasoning";

// 02C:3c — tenant-scoped fan-out of the ≤3 motor loop over a cohort's PROBLEM restaurants. NOTHING is
// crafted: fn_nba_test_all owns the verdict numbers and sealMinCalculationNBA owns auto_releasable. The
// arrange() fixture (mirrors motor_loop.test.ts) signs a LOW policy with allowed_today A1/A4/A6 + a green
// Eval_Cell on the highest-problem cohort, so the engine CAN clear at least one auto alone. Commits to the
// shared DB ⇒ afterAll resets (§14; integration suites run sequentially). CRITICAL §3.4: cohort presence is
// NOT tenant ownership (a cohort spans pools, 04 §3.2) — a foreign tenant must hit FORBIDDEN.
const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;
let ctx: { cohortId: string; tenantId: string; tierId: string };

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
  ctx = { cohortId: t.cohort_id, tenantId: t.tenant_id, tierId: t.tier_base };
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

describe("02C:3c — runMotorForCohort (tenant-scoped fan-out)", () => {
  it("REJECTS a foreign cohort with FORBIDDEN (presence ≠ ownership §3.4)", async () => {
    await arrange('{"auto_actions":["A1","A4","A6"]}');
    // A REAL cohort id, but a tenant that owns no restaurant in it ⇒ inPool guard empty ⇒ FORBIDDEN.
    await expect(runMotorForCohort(ctx.cohortId, "tenant-nobody", stubMotorReasoning)).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
  });

  it("clears at least one restaurant on its own (anti-hollow): acted+escalated===attempts, acted>0", async () => {
    await arrange('{"auto_actions":["A1","A4","A6"]}');
    const out = await runMotorForCohort(ctx.cohortId, ctx.tenantId, stubMotorReasoning);
    expect(out.attempts).toBeGreaterThan(0);
    expect(out.acted + out.escalated + out.skipped).toBe(out.attempts); // skipped = idempotent dedup (round2 P2-2)
    expect(out.acted).toBeGreaterThan(0); // the engine cleared at least one alone
  });
});
