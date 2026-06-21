import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import { runDiagnosis } from "../../server/diagnosis/orchestrator";
import type { Context } from "../../server/_core/context";

// 05D F0 — payment diagnosis E2E via the GENERAL (descriptor-driven) path. The whole point of F0:
// behavioral identity with the shipped payment screen, but now flowing through problem_type +
// fn_hunt_silent dispatcher + fn_impact dispatcher + type-aware concentration. Regression bar:
// the POOL-PAY-G reverse-cascade still yields 47 affected / 35 silent / €3760 (47 × net 80) and the
// dossier behaves identically. reportProblem now carries problem_type/segment (default payment).
// Invariants: counts/€ PRODUCED by the SQL producers (§14, never seeded); tenant server-side (§7).

const POOL = "POOL-PAY-G";
const PAY_N = 47;
const PAY_SILENT = 35;
const COMPLAINANTS = PAY_N - PAY_SILENT; // 12

function caller(tenantId: string, userId = "U-PAYG-001") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

// Stages the reverse-cascade fixture (INPUTS only — zero seeded results, §14). zone split
// 30 Centro / 17 Norte (a real concentration pattern, mirrors scenario_pay.ts).
async function stage(): Promise<void> {
  await pool.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
     select 'RG-'||lpad(g::text,3,'0'), $1, 'long_tail','long_tail'::segment, date '2026-01-01',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$2) g`,
    [POOL, PAY_N],
  );
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'RG-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$1) g`,
    [PAY_N],
  );
  await pool.query(
    `insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
     select 'RG-'||lpad(g::text,3,'0')||':C1','RG-'||lpad(g::text,3,'0')||':conv1',$1,
            'RG-'||lpad(g::text,3,'0'),'billing'
       from generate_series(1,$2) g`,
    [POOL, COMPLAINANTS],
  );
  await pool.query(
    `insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, reviewed)
     values ($1,'finance','payment_not_executed','resolved','gateway retry + manual reissue', true)`,
    [POOL],
  );
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

describe("05D F0 — payment E2E via the general descriptor path (zero regression)", () => {
  it("reportProblem({problem_type:'payment'}) → runDiagnosis yields 47/35/€3760 (produced)", async () => {
    await stage();
    const reported = await caller(POOL).diagnosis.reportProblem({
      restaurantId: "RG-001",
      conversationId: "RG-001:conv1",
      problem_type: "payment",
      segment: null,
    });
    expect(reported.created).toBe(true);

    const out = await runDiagnosis(reported.problem_id, POOL);
    expect(out.areaType).toBe("finance");
    expect(out.affected).toBe(47); // fn_hunt_silent dispatcher → fn_affected_payment
    expect(out.silent).toBe(35);
    expect(out.revenueLost).toBe(3760); // fn_impact dispatcher → fn_impact_payment (47 × net 80)
    expect(out.revenueLost).toBeGreaterThan(0);
  });

  it("persists problem_type + segment on the problem row (classification INPUT, not a result)", async () => {
    await stage();
    const reported = await caller(POOL).diagnosis.reportProblem({
      restaurantId: "RG-001",
      problem_type: "payment",
      segment: "long_tail",
    });
    const r = await pool.query<{ problem_type: string; segment: string | null }>(
      `select problem_type, segment from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    expect(r.rows[0]!.problem_type).toBe("payment");
    expect(r.rows[0]!.segment).toBe("long_tail");
  });

  it("type-aware concentration: where_concentrated derived from Affected (Centro = 30, the peak)", async () => {
    await stage();
    const reported = await caller(POOL).diagnosis.reportProblem({
      restaurantId: "RG-001",
      conversationId: "RG-001:conv1",
      problem_type: "payment",
    });
    await runDiagnosis(reported.problem_id, POOL);
    const r = await pool.query<{ where_concentrated: { dim: string; value: string; n: number } | null }>(
      `select case_repo -> 'where_concentrated' as where_concentrated
         from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    const wc = r.rows[0]!.where_concentrated;
    expect(wc).not.toBeNull();
    expect(wc!.dim).toBe("zone");
    expect(wc!.value).toBe("Centro"); // 30 of 47 affected concentrate in Centro
    expect(wc!.n).toBe(30);
  });

  it("dossier behavior unchanged — runs the full gate (partial until f5 ledger completes)", async () => {
    await stage();
    const reported = await caller(POOL).diagnosis.reportProblem({
      restaurantId: "RG-001",
      conversationId: "RG-001:conv1",
      problem_type: "payment",
    });
    const out = await caller(POOL).diagnosis.run({ problemId: reported.problem_id });
    expect(out.affected).toBe(47);
    expect(out.silent).toBe(35);
    expect(out.revenue_lost).toBe(3760);
    expect(typeof out.dossier_emitted).toBe("boolean"); // gate runs (emitted true once f5 computed)
  });
});
