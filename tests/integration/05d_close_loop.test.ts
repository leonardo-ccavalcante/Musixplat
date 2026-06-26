import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { triggerActionForProblem } from "../../server/diagnosis/triggerAction";
import { stubMotorReasoning } from "../../server/motor/reasoning";

// 05D close-the-loop (integration) — proves the FORWARD edge against the real DB + real motor: a diagnosed
// problem's AFFECTED restaurants resolve to (cohort, week, tier) via TARGETS_SQL and the per-restaurant motor
// runs. Deterministic: stubMotorReasoning (no LLM/key). The §7 money hard-no + the auto-dispatch authority
// are the motor's own (covered by cockpit_auto_exec); here we pin the BRIDGE: resolve → invoke + tenant scope.
const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF }); // creates the W1 cohorts (current rule version) the bridge resolves on
}, 120_000);
afterAll(async () => {
  await pool.end();
});

// A diagnosed problem over `n` real cohort restaurants (INPUTS only — Affected.complained/silent are crafted
// preconditions for the bridge, never a seeded diagnosis RESULT). Returns the tenant + problemId.
async function seedProblem(n: number, order: "asc" | "desc"): Promise<{ tenant: string; problemId: string; restaurants: string[] }> {
  const rows = (
    await pool.query<{ restaurant_id: string; tenant_id: string }>(
      `select cms.restaurant_id, rt.tenant_id
         from cohort."Cohort_Membership_Snapshot" cms
         join tenant."Restaurant" rt on rt.restaurant_id = cms.restaurant_id
        where cms.week = $1 order by cms.restaurant_id ${order === "asc" ? "asc" : "desc"} limit ${n}`,
      [W1],
    )
  ).rows;
  const tenant = rows[0]!.tenant_id;
  const prob = (
    await pool.query<{ problem_id: string }>(
      `insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, status, frequency)
       values ($1,$2,'open',1) returning problem_id`,
      [tenant, rows[0]!.restaurant_id],
    )
  ).rows[0]!;
  for (const r of rows.filter((x) => x.tenant_id === tenant)) {
    await pool.query(
      `insert into tenant."Affected"(problem_id, tenant_id, restaurant_id, complained, silent) values ($1,$2,$3,true,false)`,
      [prob.problem_id, tenant, r.restaurant_id],
    );
  }
  return { tenant, problemId: prob.problem_id, restaurants: rows.filter((x) => x.tenant_id === tenant).map((r) => r.restaurant_id) };
}

describe("05D close-the-loop — triggerActionForProblem resolves affected → motor (integration)", () => {
  it("resolves the diagnosed problem's affected restaurants to (cohort,week,tier) and invokes the motor", async () => {
    const { tenant, problemId, restaurants } = await seedProblem(3, "asc");

    const out = await triggerActionForProblem(problemId, tenant, { reasoning: stubMotorReasoning });

    // The bridge reached the motor for the in-pool affected restaurants (real TARGETS_SQL resolved them).
    expect(out.attempts).toBeGreaterThan(0);
    expect(out.attempts).toBeLessThanOrEqual(restaurants.length);
    // Every attempt landed in exactly one bucket (acted | escalated | skipped) — no lost outcome.
    expect(out.acted + out.escalated + out.skipped).toBe(out.attempts);
  });

  it("§3.4 tenant-scoped: a foreign pool resolves ZERO targets — no cross-pool action", async () => {
    const { problemId } = await seedProblem(1, "desc");

    const out = await triggerActionForProblem(problemId, "POOL-999", { reasoning: stubMotorReasoning });

    expect(out).toEqual({ acted: 0, escalated: 0, skipped: 0, attempts: 0 });
  });
});
