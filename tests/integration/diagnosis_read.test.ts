import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { runDiagnosis } from "../../server/diagnosis/orchestrator";

// 05B read surface — diagnosis.list (board) + diagnosis.getDossier (11-field gate). Hits the tRPC
// caller like diagnosis_spine.test.ts. Proves: numbers are READ from the producers (not recomputed),
// the board is tenant-scoped (BR-B6 RLS — a foreign pool sees nothing), and the dossier is honestly
// partial. Fixture: 4 failed-payment restaurants in POOL-DIAG, 2 complainants ⇒ affected 4 / silent 2.

function caller(tenantId: string, userId = "U-OP-001") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

async function seedAndDiagnose(): Promise<string> {
  await pool.query(`
    insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
    values ('R-RD-1','POOL-DIAG','long_tail','long_tail', date '2026-01-01','Centro'),
           ('R-RD-2','POOL-DIAG','long_tail','long_tail', date '2026-01-01','Centro'),
           ('R-RD-3','POOL-DIAG','long_tail','long_tail', date '2026-01-01','Centro'),
           ('R-RD-4','POOL-DIAG','long_tail','long_tail', date '2026-01-01','Norte');
    insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
    values ('R-RD-1', current_date, 100, 20, 'failed','Centro'),
           ('R-RD-2', current_date, 100, 20, 'failed','Centro'),
           ('R-RD-3', current_date, 100, 20, 'failed','Centro'),
           ('R-RD-4', current_date, 100, 20, 'failed','Norte');
    insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
    values ('R-RD-1:C1','R-RD-1:conv1','POOL-DIAG','R-RD-1','billing'),
           ('R-RD-2:C1','R-RD-2:conv1','POOL-DIAG','R-RD-2','billing');
  `);
  const r = await pool.query<{ problem_id: string }>(`
    insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
    values ('POOL-DIAG','R-RD-1','R-RD-1:conv1','critical','open') returning problem_id;`);
  const problemId = r.rows[0]!.problem_id;
  await runDiagnosis(problemId, "POOL-DIAG");
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

describe("05B:F-B1.3 — diagnosis.list (board, tenant-scoped, numbers read not recomputed)", () => {
  it("lists the diagnosed problem with PRODUCED counts + reactive origin", async () => {
    const problemId = await seedAndDiagnose();
    const rows = await caller("POOL-DIAG").diagnosis.list();
    const row = rows.find((x) => x.problem_id === problemId);
    expect(row).toBeDefined();
    expect(row!.area_type).toBe("finance");
    expect(row!.affected).toBe(4); // live count of Affected (produced by fn_hunt_silent)
    expect(row!.silent).toBe(2);
    expect(row!.revenue_lost).toBe(320); // Named_Query output, read not recomputed
    expect(row!.origin).toBe("reactive"); // has an episode
    expect(row!.needs_human).toBe(false);
    expect(row!.suggested_route).toBe("fix_internal");
  });

  it("BR-B6 RLS: a foreign pool sees NONE of POOL-DIAG's problems", async () => {
    await seedAndDiagnose();
    const foreign = await caller("POOL-OTHER").diagnosis.list();
    expect(foreign).toHaveLength(0);
  });
});

describe("05B:US-B6.3.1 — diagnosis.getDossier (11-field gate, honest partial, no cross-pool leak)", () => {
  it("returns the gate result — partial with the f5_how_much (churn) gap", async () => {
    const problemId = await seedAndDiagnose();
    const dossier = await caller("POOL-DIAG").diagnosis.getDossier({ problemId });
    expect(dossier.emitted).toBe(false);
    expect(dossier.gaps).toContain("f5_how_much"); // churn_risk fail-closed NULL ⇒ honest gap
  });

  it("BR-B6 hard-no: a foreign pool cannot read the dossier (NOT_FOUND, no leak)", async () => {
    const problemId = await seedAndDiagnose();
    await expect(caller("POOL-OTHER").diagnosis.getDossier({ problemId })).rejects.toThrow();
  });
});

describe("05B getKnowledgeCase + emailDossier (KB precedent read + email stub)", () => {
  it("getKnowledgeCase opens a precedent; a foreign pool is blocked (BR-B6)", async () => {
    const r = await pool.query<{ kb_case_id: string }>(`
      insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, reviewed)
      values ('POOL-DIAG','finance','payment_not_executed','resolved','gateway retry + reissue', true)
      returning kb_case_id::text as kb_case_id;`);
    const id = r.rows[0]!.kb_case_id;
    const kase = await caller("POOL-DIAG").diagnosis.getKnowledgeCase({ kbCaseId: id });
    expect(kase.outcome).toBe("resolved");
    expect(kase.pattern).toBe("payment_not_executed");
    await expect(caller("POOL-OTHER").diagnosis.getKnowledgeCase({ kbCaseId: id })).rejects.toThrow();
  });

  it("emailDossier is an honest stub (delivered:false) + enforces ownership", async () => {
    const problemId = await seedAndDiagnose();
    const res = await caller("POOL-DIAG").diagnosis.emailDossier({ problemId, to: "ops@example.com" });
    expect(res.delivered).toBe(false); // fail-closed: no email service ⇒ client uses mailto
    await expect(
      caller("POOL-OTHER").diagnosis.emailDossier({ problemId, to: "ops@example.com" }),
    ).rejects.toThrow();
  });
});
