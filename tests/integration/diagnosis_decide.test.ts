import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// 05D Part C — the human decision console. A needs_human diagnosis was a DEAD-END (view-only). `decide`
// closes the human side of the loop: the operator confirms/overrides the area + writes the WHY → a reviewed
// Knowledge_Case (so it grounds future runs, RL-guard) + the problem leaves the queue. No number is written
// (§14: the rationale is [C] text, reviewed is a human [C] vouch). `recentlyVerified` is the decision-#2 audit
// — what Part D auto-approved by measurement — so the human has visibility of the autonomous verifications.
function caller(tenantId: string, userId = "U-OP-001") {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
  return appRouter.createCaller(ctx);
}
let pool: pg.Pool;

async function seedProblem(tenant = "POOL-DIAG", status = "needs_human"): Promise<string> {
  await pool.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
     values ('R-DC-1',$1,'long_tail','long_tail', date '2026-01-01','Centro') on conflict do nothing`,
    [tenant],
  );
  const r = await pool.query<{ problem_id: string }>(
    `insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status, area_type)
     values ($1,'R-DC-1','critical',$2,'performance') returning problem_id`,
    [tenant, status],
  );
  return r.rows[0]!.problem_id;
}

beforeAll(async () => { pool = makePool(); }, 60_000);
beforeEach(async () => { await resetDb(pool); });
afterAll(async () => { await pool.end(); });

describe("05D Part C — diagnosis.decide (human decision capture → learning, closes the dead-end)", () => {
  it("writes a reviewed Knowledge_Case (rationale [C]) + moves the problem OFF the needs-decision queue", async () => {
    const problemId = await seedProblem();
    const out = await caller("POOL-DIAG").diagnosis.decide({
      problemId, areaType: "finance", rationale: "refund dispute — reissue via gateway",
    });
    expect(out.ok).toBe(true);

    const kase = (await pool.query<{ area_type: string; resolution: string; reviewed: boolean; outcome: string }>(
      `select area_type, resolution, reviewed, outcome from tenant."Knowledge_Case" where kb_case_id=$1`, [out.kbCaseId],
    )).rows[0]!;
    expect(kase.area_type).toBe("finance"); // the human's pick (overrode the seeded 'performance')
    expect(kase.resolution).toBe("refund dispute — reissue via gateway"); // the WHY, [C]
    expect(kase.reviewed).toBe(true); // human-vouched ⇒ grounds future runs (RL-guard)

    const prob = (await pool.query<{ status: string; area_type: string }>(
      `select status, area_type from tenant."Diagnosed_Problem" where problem_id=$1`, [problemId],
    )).rows[0]!;
    expect(prob.status).toBe("resolved"); // left the needs_human queue
    expect(prob.area_type).toBe("finance"); // the human override is recorded
  });

  it("§3.4 tenant-scoped: a foreign pool cannot decide on this problem (FORBIDDEN, no write)", async () => {
    const problemId = await seedProblem();
    await expect(
      caller("POOL-OTHER").diagnosis.decide({ problemId, areaType: "finance", rationale: "should not happen" }),
    ).rejects.toThrow();
    // the problem is untouched (still needs_human, no Knowledge_Case written)
    const prob = (await pool.query<{ status: string }>(`select status from tenant."Diagnosed_Problem" where problem_id=$1`, [problemId])).rows[0]!;
    expect(prob.status).toBe("needs_human");
    expect((await pool.query(`select 1 from tenant."Knowledge_Case" where tenant_id='POOL-OTHER'`)).rowCount).toBe(0);
  });

  it("rejects an unknown problem (fail-closed NOT_FOUND)", async () => {
    await expect(
      caller("POOL-DIAG").diagnosis.decide({ problemId: "nope-0000", areaType: "finance", rationale: "x y z" }),
    ).rejects.toThrow();
  });
});

describe("05D Part C — diagnosis.recentlyVerified (decision #2 audit: what Part D auto-approved)", () => {
  it("returns verified_fixed cases (auto-approved by measurement); excludes unverified; tenant-scoped", async () => {
    await pool.query(
      `insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, reviewed, verification_status)
       values ('POOL-DIAG','performance','m_connection_below','resolved','reset the device',false,'verified_fixed'),
              ('POOL-DIAG','performance','m_quality_below','resolved','re-shoot the photos',false,'unverified'),
              ('POOL-OTHER','performance','m_connection_below','resolved','foreign',false,'verified_fixed')`,
    );
    const rows = await caller("POOL-DIAG").diagnosis.recentlyVerified();
    expect(rows).toHaveLength(1); // only the verified_fixed of THIS pool
    expect(rows[0]!.pattern).toBe("m_connection_below");
    expect(rows[0]!.resolution).toBe("reset the device");
  });
});
