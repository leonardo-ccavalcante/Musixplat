import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// Gate 5 — 1:10 capacity producer + health read. ratio_1_10 is the team-equivalent capacity projected
// from the explicit challenge baseline and OBSERVED human-touch rate. units_per_touch remains a separate
// throughput metric, so a large batch is never mislabeled as people replaced. NULL until a human touch;
// more escalations/reviews consume operator capacity and make the ratio fall.

function caller(tenantId: string, userId = "U-ROI-OP") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

async function setup(tenant: string): Promise<string> {
  await pool.query(`
    insert into gov."User"(user_id, tenant_id, org_level, role) values
      ('U-ROI-OP','${tenant}','team','agent_manager_senior'),
      ('${tenant}-AI','${tenant}','team','ai_agent');
    insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone) values
      ('R-RO-1','${tenant}','long_tail','long_tail', date '2026-01-01','Centro'),
      ('R-RO-2','${tenant}','long_tail','long_tail', date '2026-01-01','Centro'),
      ('R-RO-3','${tenant}','long_tail','long_tail', date '2026-01-01','Norte');
    insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone) values
      ('R-RO-1', current_date, 100, 20, 'failed','Centro'),
      ('R-RO-2', current_date, 100, 20, 'failed','Centro'),
      ('R-RO-3', current_date, 100, 20, 'failed','Norte');
    insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent) values
      ('R-RO-1:C1','R-RO-1:conv1','${tenant}','R-RO-1','billing');
    insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, not_resolved_reason, reviewed) values
      ('${tenant}','finance','payment_not_executed','resolved','gateway retry + manual reissue', null, true);
  `);
  const rep = await pool.query<{ problem_id: string }>(`
    insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
    values ('${tenant}','R-RO-1','R-RO-1:conv1','critical','open') returning problem_id;`);
  await caller(tenant).diagnosis.run({ problemId: rep.rows[0]!.problem_id });
  return rep.rows[0]!.problem_id;
}

beforeAll(async () => {
  pool = makePool();
}, 60_000);
beforeEach(async () => {
  await resetDb(pool);
});
afterAll(async () => {
  await pool.end();
});

describe("Gate 5 — 1:10 producer (ratio_1_10 DERIVED) + health.summary (vitrina)", () => {
  it("after diagnosis only (0 human touches) ⇒ ratio NULL (fail-closed), units PRODUCED", async () => {
    await setup("POOL-ROI");
    const h = await caller("POOL-ROI").roi.summary();
    expect(h.ratio).toBeNull(); // no human touch ⇒ no leverage baseline (honest, not green-fake)
    expect(h.units).toBe(3); // distinct affected the AI processed
    expect(h.unitsPerTouch).toBeNull();
    expect(h.ticketsPerDay).toBe(300);
    expect(h.baselineTeamSize).toBe(10);
    expect(h.slaHours).toBe(24);
    expect(h.reviews).toBe(0);
    expect(h.seal).toBe("no_signal");
  });

  it("approving an artifact PRODUCES a ratio; a further escalation makes it FALL", async () => {
    const problemId = await setup("POOL-ROI");
    const g = await caller("POOL-ROI").artifact.generate({ problemId });
    if (g.status !== "generated") throw new Error("artifact not generated: " + g.status);
    await caller("POOL-ROI").artifact.decide({ artifactId: g.artifact_id, action: "approve" });

    const h1 = await caller("POOL-ROI").roi.summary();
    expect(h1.ratio).toBe(8); // 300 tickets/day projected into one operator's 480-minute day
    expect(h1.unitsPerTouch).toBe(3); // throughput stays distinct from team-equivalent capacity
    expect(h1.projectedHumanMinutes).toBe(600);
    expect(h1.seal).toBe("provisional"); // efficiency, not 2-gate confirmed

    // a second problem falls to a human (escalation) ⇒ touches rise ⇒ ratio FALLS.
    await pool.query(`
      insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status)
      values ('POOL-ROI','R-RO-2','critical','needs_human');`);
    await pool.query(`select gov.fn_roi_1_10('POOL-ROI')`); // recompute (runs after spine actions in prod)

    const h2 = await caller("POOL-ROI").roi.summary();
    expect(h2.ratio).toBe(4.57);
    expect(h2.unitsPerTouch).toBe(1.5);
    expect(h2.projectedHumanMinutes).toBe(1050);
    expect(h2.ratio!).toBeLessThan(h1.ratio!); // observed touch rate rose, so capacity fell
  });

  it("§14: a fresh reset leaves ROI_Operator empty (ratio not seeded)", async () => {
    const n = await rows<{ n: number }>(pool, `select count(*)::int n from gov."ROI_Operator"`);
    expect(n[0]!.n).toBe(0);
  });
});
