import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// Gate 2 (05B EPIC-B5) — diagnosis.run QUANTIFIES impact (f5 = churn_risk / cost_to_resolve / value_gained)
// from PRODUCED counts + named knobs, completing the dossier. Fail-closed: a reported problem with no
// observable affected population leaves f5 NULL ⇒ the dossier stays PARTIAL (honest). Numbers never
// seeded (§14): churn = silent share, cost = knob × affected, value = revenue × recovery knob.

function caller(tenantId: string, userId = "U-OP-001") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;
beforeAll(async () => {
  pool = makePool();
}, 60_000);
beforeEach(async () => {
  await resetDb(pool);
});
afterAll(async () => {
  await pool.end();
});

describe("05B Gate 2 — impact ledger completes the dossier (or fails closed)", () => {
  it("COMPLETE: affected population + KB precedent ⇒ f5 PRODUCED ⇒ dossier emitted", async () => {
    await pool.query(`
      insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
      values ('R-LED-1','POOL-LED','long_tail','long_tail', date '2026-01-01','Centro'),
             ('R-LED-2','POOL-LED','long_tail','long_tail', date '2026-01-01','Centro'),
             ('R-LED-3','POOL-LED','long_tail','long_tail', date '2026-01-01','Norte');
      insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
      values ('R-LED-1', current_date, 100, 20, 'failed','Centro'),
             ('R-LED-2', current_date, 100, 20, 'failed','Centro'),
             ('R-LED-3', current_date, 100, 20, 'failed','Norte');
      insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
      values ('R-LED-1:C1','R-LED-1:conv1','POOL-LED','R-LED-1','billing');
      insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, reviewed)
      values ('POOL-LED','finance','payment_not_executed','resolved','gateway retry + manual reissue', true);
    `);
    const rep = await pool.query<{ problem_id: string }>(`
      insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
      values ('POOL-LED','R-LED-1','R-LED-1:conv1','critical','open') returning problem_id;`);
    const problemId = rep.rows[0]!.problem_id;

    const out = await caller("POOL-LED").diagnosis.run({ problemId });
    expect(out.affected).toBe(3);
    expect(out.dossier_emitted).toBe(true);
    expect(out.dossier_gaps).toEqual([]);

    // f5 inner values are PRODUCED (non-null), never seeded.
    const f5 = await rows<{ churn_risk: string | null; cost_to_resolve: string | null; value_gained: string | null }>(
      pool,
      `select churn_risk, cost_to_resolve, value_gained from tenant."Diagnosed_Problem" where problem_id=$1`,
      [problemId],
    );
    expect(f5[0]!.churn_risk).not.toBeNull();
    expect(f5[0]!.cost_to_resolve).not.toBeNull();
    expect(f5[0]!.value_gained).not.toBeNull();
  });

  it("FAIL-CLOSED: a reported problem with no observable failures ⇒ f5 NULL ⇒ dossier PARTIAL", async () => {
    await pool.query(`
      insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
      values ('R-NOF-1','POOL-LED','long_tail','long_tail', date '2026-01-01','Centro');
      insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
      values ('R-NOF-1', current_date, 100, 20, 'ok','Centro');
      insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
      values ('R-NOF-1:C1','R-NOF-1:conv1','POOL-LED','R-NOF-1','billing');
    `);
    const rep = await pool.query<{ problem_id: string }>(`
      insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
      values ('POOL-LED','R-NOF-1','R-NOF-1:conv1','critical','open') returning problem_id;`);
    const problemId = rep.rows[0]!.problem_id;

    const out = await caller("POOL-LED").diagnosis.run({ problemId });
    expect(out.affected).toBe(0); // no failed orders ⇒ no affected population
    expect(out.dossier_emitted).toBe(false);
    expect(out.dossier_gaps).toContain("f5_how_much");
    const f5 = await rows<{ churn_risk: string | null }>(
      pool,
      `select churn_risk from tenant."Diagnosed_Problem" where problem_id=$1`,
      [problemId],
    );
    expect(f5[0]!.churn_risk).toBeNull(); // fail-closed: cannot quantify ⇒ NULL, never invented
  });
});
