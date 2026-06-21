import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { readGrounding, writeMotorCase } from "../../server/motor/learn";

// 02C MOTOR-LLM learning store. Each terminal decision writes ONE Knowledge_Case row with reviewed=false
// (BR-B16 RL-guard) — it does NOT ground future runs until a human approves it. Grounding reads ONLY
// reviewed=true cases, so the AI never learns from un-vetted text. NO number is ever written here (§14):
// `outcome` is a measured RESULT, the narrative is [C]. Every insert runs in a ROLLED-BACK tx so the
// Knowledge_Case table stays empty pre-run (antifake).

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
}, 120_000);
afterAll(async () => {
  await pool.end();
});

async function pickTenant(c: pg.PoolClient): Promise<string> {
  const r = await c.query<{ tenant_id: string }>(`select tenant_id from tenant."Restaurant" limit 1`);
  return r.rows[0]!.tenant_id;
}

describe("writeMotorCase", () => {
  it("persists an escalated case as reviewed=false with its discarded branches", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const tenantId = await pickTenant(c);
      const id = await writeMotorCase(
        {
          tenantId,
          areaType: "m_connection",
          pattern: "m_connection_below",
          outcome: "escalated",
          notResolvedReason: "out_of_range",
          discarded: [{ action_code: "A3", reason: "out_of_range" }],
          attemptId: "att-1",
          nbaId: null,
        },
        c,
      );
      const r = await c.query<{ outcome: string; reviewed: boolean; discarded_branches: unknown[] }>(
        `select outcome, reviewed, discarded_branches from tenant."Knowledge_Case" where kb_case_id=$1`,
        [id],
      );
      expect(r.rows[0]!.outcome).toBe("escalated");
      expect(r.rows[0]!.reviewed).toBe(false);
      expect(r.rows[0]!.discarded_branches).toHaveLength(1);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});

describe("readGrounding", () => {
  it("returns ONLY reviewed cases, all with a non-null outcome", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const tenantId = await pickTenant(c);
      // reviewed=true ⇒ grounds. resolution non-null satisfies knowledge_case_polarity_ck.
      await c.query(
        `insert into tenant."Knowledge_Case"
           (tenant_id, area_type, pattern, outcome, resolution, reviewed)
         values ($1,'m_connection','m_connection_below','resolved','dispatched A1',true)`,
        [tenantId],
      );
      // reviewed=false ⇒ MUST NOT ground (un-vetted text, BR-B16).
      await c.query(
        `insert into tenant."Knowledge_Case"
           (tenant_id, area_type, pattern, outcome, not_resolved_reason, reviewed)
         values ($1,'m_connection','m_connection_below','escalated','out_of_range',false)`,
        [tenantId],
      );
      const g = await readGrounding(tenantId, ["m_connection"], c);
      expect(g).toHaveLength(1);
      expect(g.every((row) => row.outcome != null)).toBe(true);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
