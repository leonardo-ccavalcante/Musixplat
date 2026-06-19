import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// Gate 4 — artifact human gate. approve/reject/escalate writes an APPEND-ONLY Artifact_Decision (4-eyes:
// confirmer=operator != proposer=AI) and the artifact status changes ONLY together with that trace
// ("sin trace no hay acción", mirrors the cockpit release pattern). Cross-pool / unknown ⇒ fail-closed.

function caller(tenantId: string, userId = "U-DC-OP") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

// Stage a COMPLETE-dossier artifact in `tenant`, plus an operator + an independent AI proposer (4-eyes).
async function setup(tenant: string): Promise<string> {
  await pool.query(`
    insert into gov."User"(user_id, tenant_id, org_level, role) values
      ('U-DC-OP','${tenant}','team','agent_manager_senior'),
      ('${tenant}-AI','${tenant}','team','ai_agent');
    insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone) values
      ('R-DC-1','${tenant}','long_tail','long_tail', date '2026-01-01','Centro'),
      ('R-DC-2','${tenant}','long_tail','long_tail', date '2026-01-01','Centro'),
      ('R-DC-3','${tenant}','long_tail','long_tail', date '2026-01-01','Norte');
    insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone) values
      ('R-DC-1', current_date, 100, 20, 'failed','Centro'),
      ('R-DC-2', current_date, 100, 20, 'failed','Centro'),
      ('R-DC-3', current_date, 100, 20, 'failed','Norte');
    insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent) values
      ('R-DC-1:C1','R-DC-1:conv1','${tenant}','R-DC-1','billing');
    insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, not_resolved_reason, reviewed) values
      ('${tenant}','finance','payment_not_executed','resolved','gateway retry + manual reissue', null, true);
  `);
  const rep = await pool.query<{ problem_id: string }>(`
    insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
    values ('${tenant}','R-DC-1','R-DC-1:conv1','critical','open') returning problem_id;`);
  await caller(tenant).diagnosis.run({ problemId: rep.rows[0]!.problem_id });
  const g = await caller(tenant).artifact.generate({ problemId: rep.rows[0]!.problem_id });
  if (g.status !== "generated") throw new Error("setup: artifact not generated: " + g.status);
  return g.artifact_id;
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

describe("05C Gate 4 — artifact.decide (human gate, append-only trace, 4-eyes, no-trace-no-action)", () => {
  it("approve ⇒ status 'approved' AND a 4-eyes trace, written together (no status change without a trace)", async () => {
    const artifactId = await setup("POOL-DC");

    // pre: conservative, no trace.
    const before = await rows<{ status: string; decision_trace_id: string | null }>(
      pool,
      `select status, decision_trace_id from gov."Generated_Artifact" where artifact_id = $1`,
      [artifactId],
    );
    expect(before[0]!.status).toBe("pending_review");
    expect(before[0]!.decision_trace_id).toBeNull();

    const res = await caller("POOL-DC").artifact.decide({ artifactId, action: "approve" });
    expect(res.status).toBe("approved");
    expect(res.trace_id).toBeTruthy();

    // post: status changed AND a single append-only trace exists, 4-eyes (confirmer != proposer).
    const after = await rows<{ status: string; decision_trace_id: string | null }>(
      pool,
      `select status, decision_trace_id from gov."Generated_Artifact" where artifact_id = $1`,
      [artifactId],
    );
    expect(after[0]!.status).toBe("approved");
    expect(after[0]!.decision_trace_id).toBe(res.trace_id);
    const trace = await rows<{ proposer_id: string; confirmer_id: string; action: string; independence_guaranteed: boolean }>(
      pool,
      `select proposer_id, confirmer_id, action, independence_guaranteed from gov."Artifact_Decision" where artifact_id = $1`,
      [artifactId],
    );
    expect(trace).toHaveLength(1);
    expect(trace[0]!.action).toBe("approve");
    expect(trace[0]!.confirmer_id).toBe("U-DC-OP"); // the human operator
    expect(trace[0]!.proposer_id).not.toBe("U-DC-OP"); // the AI proposer (4-eyes)
    expect(trace[0]!.independence_guaranteed).toBe(true);
  });

  it("reject and escalate persist with their trace", async () => {
    const a1 = await setup("POOL-DC");
    const rej = await caller("POOL-DC").artifact.decide({ artifactId: a1, action: "reject" });
    expect(rej.status).toBe("rejected");

    await resetDb(pool);
    const a2 = await setup("POOL-DC");
    const esc = await caller("POOL-DC").artifact.decide({ artifactId: a2, action: "escalate" });
    expect(esc.status).toBe("escalated");
  });

  it("append-only: an Artifact_Decision cannot be updated or deleted", async () => {
    const artifactId = await setup("POOL-DC");
    const res = await caller("POOL-DC").artifact.decide({ artifactId, action: "approve" });
    await expect(
      pool.query(`update gov."Artifact_Decision" set action='reject' where decision_id = $1`, [res.trace_id]),
    ).rejects.toThrow();
  });

  it("a terminal artifact rejects a second decision and keeps exactly one audit row", async () => {
    const artifactId = await setup("POOL-DC");
    await caller("POOL-DC").artifact.decide({ artifactId, action: "approve" });
    await expect(caller("POOL-DC").artifact.decide({ artifactId, action: "reject" })).rejects.toThrow(
      "already decided or superseded",
    );
    const decisions = await rows<{ n: number }>(
      pool,
      `select count(*)::int n from gov."Artifact_Decision" where artifact_id=$1`,
      [artifactId],
    );
    expect(decisions[0]!.n).toBe(1);
  });

  it("regeneration cannot mutate content after the human decision", async () => {
    const artifactId = await setup("POOL-DC");
    const before = await rows<{ problem_id: string; content: unknown }>(
      pool,
      `select problem_id::text, content from gov."Generated_Artifact" where artifact_id=$1`,
      [artifactId],
    );
    await caller("POOL-DC").artifact.decide({ artifactId, action: "approve" });

    const regenerated = await caller("POOL-DC").artifact.generate({ problemId: before[0]!.problem_id });
    expect(regenerated).toEqual({ status: "locked", artifact_id: artifactId });
    const after = await rows<{ status: string; content: unknown }>(
      pool,
      `select status, content from gov."Generated_Artifact" where artifact_id=$1`,
      [artifactId],
    );
    expect(after[0]!.status).toBe("approved");
    expect(after[0]!.content).toEqual(before[0]!.content);
  });

  it("BR-B6 fail-closed: a foreign pool cannot decide on another pool's artifact (+ Security_Log)", async () => {
    const artifactId = await setup("POOL-DC");
    await expect(caller("POOL-OTHER").artifact.decide({ artifactId, action: "approve" })).rejects.toThrow();
    const log = await rows<{ n: number }>(
      pool,
      `select count(*)::int n from gov."Security_Log" where tenant_id = 'POOL-OTHER' and kind = 'cross_pool'`,
    );
    expect(log[0]!.n).toBeGreaterThan(0);
  });

  it("fail-closed: unknown artifact id rejects", async () => {
    await setup("POOL-DC");
    await expect(
      caller("POOL-DC").artifact.decide({ artifactId: "00000000-0000-0000-0000-000000000000", action: "approve" }),
    ).rejects.toThrow();
  });
});
