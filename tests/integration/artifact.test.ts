import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// Gate 3 (05C wedge) — artifact.generate turns a COMPLETE dossier into a PERSISTED, metric-bound artifact
// (BR-C1-3 metric-binding mandatory). Fail-closed: incomplete dossier ⇒ no artifact + gaps; missing HOW
// (KB resolution NULL) ⇒ 'missing_how' (BR-C1-6: C never invents the HOW). content is PRODUCED from the
// dossier (deterministic template — never an LLM number); status is conservative pre-decision (§14).

function caller(tenantId: string, userId = "U-OP-001") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

async function stage(opts: { tenant: string; how: boolean; failed: boolean }): Promise<string> {
  // KB polarity (knowledge_case_polarity_ck): resolved ⇒ resolution (the HOW); not_resolved ⇒ reason.
  // missing-HOW is modelled honestly as a NON-resolved precedent — the link exists (f7) but no HOW.
  const kb = opts.how
    ? `'resolved', 'gateway retry + manual reissue', null`
    : `'not_resolved', null, 'gateway vendor unresponsive — no documented fix yet'`;
  const status = opts.failed ? "'failed'" : "'ok'";
  await pool.query(`
    insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
    values ('R-AR-1','${opts.tenant}','long_tail','long_tail', date '2026-01-01','Centro'),
           ('R-AR-2','${opts.tenant}','long_tail','long_tail', date '2026-01-01','Centro'),
           ('R-AR-3','${opts.tenant}','long_tail','long_tail', date '2026-01-01','Norte');
    insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
    values ('R-AR-1', current_date, 100, 20, ${status},'Centro'),
           ('R-AR-2', current_date, 100, 20, ${status},'Centro'),
           ('R-AR-3', current_date, 100, 20, ${status},'Norte');
    insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
    values ('R-AR-1:C1','R-AR-1:conv1','${opts.tenant}','R-AR-1','billing');
    insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, not_resolved_reason, reviewed)
    values ('${opts.tenant}','finance','payment_not_executed', ${kb}, true);
  `);
  const rep = await pool.query<{ problem_id: string }>(`
    insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
    values ('${opts.tenant}','R-AR-1','R-AR-1:conv1','critical','open') returning problem_id;`);
  const problemId = rep.rows[0]!.problem_id;
  await caller(opts.tenant).diagnosis.run({ problemId });
  return problemId;
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

describe("05C Gate 3 — artifact.generate (dossier → persisted, metric-bound artifact)", () => {
  it("COMPLETE dossier + HOW ⇒ persists ONE metric-bound artifact (conservative status, content produced)", async () => {
    const problemId = await stage({ tenant: "POOL-ART", how: true, failed: true });
    const res = await caller("POOL-ART").artifact.generate({ problemId });
    expect(res.status).toBe("generated");

    const a = await rows<{
      artifact_id: string;
      target_metric: string | null;
      content: unknown;
      status: string;
      decision_trace_id: string | null;
    }>(
      pool,
      `select artifact_id::text, target_metric, content, status, decision_trace_id::text
         from gov."Generated_Artifact" where problem_id = $1`,
      [problemId],
    );
    expect(a).toHaveLength(1);
    expect(a[0]!.target_metric).not.toBeNull(); // BR-C1-3 metric-binding at creation
    expect(a[0]!.content).not.toBeNull(); // produced from the dossier
    expect(a[0]!.status).toBe("pending_review"); // conservative pre-decision (§14)
    expect(a[0]!.decision_trace_id).toBeNull(); // no human decision yet (Gate 4)
  });

  it("idempotent — generating twice does NOT duplicate the artifact", async () => {
    const problemId = await stage({ tenant: "POOL-ART", how: true, failed: true });
    await caller("POOL-ART").artifact.generate({ problemId });
    await caller("POOL-ART").artifact.generate({ problemId });
    const n = await rows<{ n: number }>(
      pool,
      `select count(*)::int n from gov."Generated_Artifact" where problem_id = $1`,
      [problemId],
    );
    expect(n[0]!.n).toBe(1);
  });

  it("INCOMPLETE dossier ⇒ fail-closed: no artifact, gaps returned", async () => {
    const problemId = await stage({ tenant: "POOL-ART", how: true, failed: false }); // no failures ⇒ partial
    const res = await caller("POOL-ART").artifact.generate({ problemId });
    expect(res.status).toBe("incomplete_dossier");
    if (res.status === "incomplete_dossier") expect(res.gaps.length).toBeGreaterThan(0);
    const n = await rows<{ n: number }>(
      pool,
      `select count(*)::int n from gov."Generated_Artifact" where problem_id = $1`,
      [problemId],
    );
    expect(n[0]!.n).toBe(0);
  });

  it("missing HOW (KB resolution NULL) ⇒ fail-closed 'missing_how', no artifact (BR-C1-6)", async () => {
    const problemId = await stage({ tenant: "POOL-ART", how: false, failed: true });
    const res = await caller("POOL-ART").artifact.generate({ problemId });
    expect(res.status).toBe("missing_how");
    const n = await rows<{ n: number }>(
      pool,
      `select count(*)::int n from gov."Generated_Artifact" where problem_id = $1`,
      [problemId],
    );
    expect(n[0]!.n).toBe(0);
  });

  it("BR-B6 fail-closed: a foreign pool cannot generate on another pool's problem", async () => {
    const problemId = await stage({ tenant: "POOL-ART", how: true, failed: true });
    await expect(caller("POOL-OTHER").artifact.generate({ problemId })).rejects.toThrow();
  });
});
