import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import { runDiagnosis } from "../../server/diagnosis/orchestrator";
import type { Context } from "../../server/_core/context";

// 05D — a THIRD problem type (cancellation) flows E2E through the SAME descriptor-driven engine:
// reportProblem({problem_type:'cancellation'}) → runDiagnosis → real affected/silent/at-risk-€, ALL
// PRODUCED by the SQL dispatchers (fn_hunt_silent → fn_affected_cancellation, fn_impact → fn_impact_
// cancellation). Proof of generalization: a non-payment/non-connection problem yields affected>0/€>0
// without touching the orchestrator. Regression bar: payment still yields 47/35/€3760 via the same
// general path. Invariants: counts/€ PRODUCED (§14, never seeded); knob by name (§3.8); tenant
// server-side (§7). Fixtures are current_date-relative ⇒ drift-immune pinned numbers.
//
// area_type='operations': cancellation is an operations problem. The deterministic classifier gained a
// REAL 'operations' family (reasoning.ts AREA_BY_FAMILY: /cancel|fulfil|operation/) so a cancellation
// case classifies cleanly as operations — a genuine rule, not a guess — and the engine RESOLVES it
// end-to-end (it does not degrade). A reviewed operations Knowledge_Case grounds the agent (BR-B3).

const CAN_POOL = "POOL-CANCEL-G";
const CAN_AFFECTED = 8; // 8 high-cancel restaurants @ rate 0.50 (> cancel_rate_max 0.10)
const CAN_SILENT = 5; // 8 affected − 3 complainants
const CAN_AT_RISK = 3200; // 8 × (5 restaurant-cancelled orders × net 80)

const PAY_POOL = "POOL-PAY-KG";
const PAY_N = 47;
const PAY_SILENT = 35;

function caller(tenantId: string, userId = "U-CANG-001") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

// Cancellation fixture (INPUTS only — zero seeded results, §14). 8 high-cancel (rate 0.50) + 4 healthy
// (rate 0.00, with CUSTOMER-side cancels to prove they are excluded); orders current_date-relative so the
// window always covers them. 3 of 8 complain ⇒ 5 silent. zone split 8 Centro / 4 Norte (a real
// concentration on the descriptor's 'zone' axis: all 8 affected are Centro).
async function stageCancellation(): Promise<void> {
  await pool.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
     select 'KG-'||lpad(g::text,3,'0'), $1, 'long_tail','long_tail'::segment, date '2026-01-01',
            case when g <= 8 then 'Centro' else 'Norte' end, 'pizza', 50
       from generate_series(1,12) g`,
    [CAN_POOL],
  );
  // high-cancel (g<=8): 5 RESTAURANT-cancelled @ net 80 + 5 'ok' ⇒ rate 5/10 = 0.50 > 0.10 (affected).
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, cancelled_by, zone)
     select 'KG-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'failed', 'restaurant', 'Centro'
       from generate_series(1,8) g cross join generate_series(1,5) k`,
  );
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'KG-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'ok', 'Centro'
       from generate_series(1,8) g cross join generate_series(1,5) k`,
  );
  // healthy (g 9-12): 2 CUSTOMER-cancelled + 8 'ok' ⇒ restaurant-rate 0/10 = 0.00 (NOT affected).
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, cancelled_by, zone)
     select 'KG-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'failed', 'customer', 'Norte'
       from generate_series(9,12) g cross join generate_series(1,2) k`,
  );
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'KG-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'ok', 'Norte'
       from generate_series(9,12) g cross join generate_series(1,8) k`,
  );
  // 3 complainants opened a CANCELLATION ticket ⇒ 5 silent. FK → Intent_Catalog, register first.
  await pool.query(
    `insert into catalog."Intent_Catalog"(intent_id, label) values ('cancellation','Order cancellation')
     on conflict (intent_id) do nothing`,
  );
  await pool.query(
    `insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
     select 'KG-'||lpad(g::text,3,'0')||':C1','KG-'||lpad(g::text,3,'0')||':conv1',$1,
            'KG-'||lpad(g::text,3,'0'),'cancellation'
       from generate_series(1,3) g`,
    [CAN_POOL],
  );
  // a REVIEWED operations case so the agent is grounded (mirrors the connection fixture, BR-B3).
  await pool.query(
    `insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, reviewed)
     values ($1,'operations','restaurant_cancelling_orders','resolved','fix availability sync + capacity', true)`,
    [CAN_POOL],
  );
}

// Payment regression fixture (the reverse-cascade, 47 failed @ net 80, 12 complain ⇒ 35 silent / €3760).
async function stagePayment(): Promise<void> {
  await pool.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
     select 'PK-'||lpad(g::text,3,'0'), $1, 'long_tail','long_tail'::segment, date '2026-01-01',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$2) g`,
    [PAY_POOL, PAY_N],
  );
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'PK-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$1) g`,
    [PAY_N],
  );
  await pool.query(
    `insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
     select 'PK-'||lpad(g::text,3,'0')||':C1','PK-'||lpad(g::text,3,'0')||':conv1',$1,
            'PK-'||lpad(g::text,3,'0'),'billing'
       from generate_series(1,$2) g`,
    [PAY_POOL, PAY_N - PAY_SILENT],
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

describe("05D — cancellation E2E via the general descriptor path (zero payment regression)", () => {
  it("reportProblem({problem_type:'cancellation'}) → runDiagnosis yields operations/8/5/€3200 (produced)", async () => {
    await stageCancellation();
    const reported = await caller(CAN_POOL).diagnosis.reportProblem({
      restaurantId: "KG-001",
      conversationId: "KG-001:conv1",
      problem_type: "cancellation",
      segment: null,
    });
    expect(reported.created).toBe(true);

    const out = await runDiagnosis(reported.problem_id, CAN_POOL);
    // operations classifier rule (real) ⇒ clean resolution, NOT a degrade.
    expect(out.areaType).toBe("operations");
    expect(out.degraded).toBe(false);
    expect(out.affected).toBe(CAN_AFFECTED); // fn_hunt_silent dispatcher → fn_affected_cancellation
    expect(out.silent).toBe(CAN_SILENT);
    expect(out.revenueLost).toBe(CAN_AT_RISK); // fn_impact dispatcher → fn_impact_cancellation (at-risk GMV)
    expect(out.revenueLost).toBeGreaterThan(0);
  });

  it("cancellation descriptor area_type is 'operations' in the catalog registry (the honest domain area)", async () => {
    await stageCancellation();
    const r = await pool.query<{ area_type: string }>(
      `select area_type from catalog."Problem_Type" where problem_type = 'cancellation'`,
    );
    expect(r.rows[0]!.area_type).toBe("operations");
  });

  it("cancellation where_concentrated derived from Affected on the 'zone' axis (Centro = 8, the peak)", async () => {
    await stageCancellation();
    const reported = await caller(CAN_POOL).diagnosis.reportProblem({
      restaurantId: "KG-001",
      conversationId: "KG-001:conv1",
      problem_type: "cancellation",
    });
    await runDiagnosis(reported.problem_id, CAN_POOL);
    const r = await pool.query<{ where_concentrated: { dim: string; value: string; n: number } | null }>(
      `select case_repo -> 'where_concentrated' as where_concentrated
         from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    const wc = r.rows[0]!.where_concentrated;
    expect(wc).not.toBeNull();
    expect(wc!.dim).toBe("zone");
    expect(wc!.value).toBe("Centro"); // all 8 affected are in Centro
    expect(wc!.n).toBe(CAN_AFFECTED);
  });

  it("cancellation IGNORES customer-side cancels (healthy Norte restaurants are NOT affected)", async () => {
    await stageCancellation();
    const reported = await caller(CAN_POOL).diagnosis.reportProblem({
      restaurantId: "KG-001",
      conversationId: "KG-001:conv1",
      problem_type: "cancellation",
    });
    await runDiagnosis(reported.problem_id, CAN_POOL);
    // The 4 Norte restaurants have ONLY customer-side cancels ⇒ restaurant-rate 0 ⇒ never in Affected.
    const r = await pool.query<{ n: number }>(
      `select count(*)::int n from tenant."Affected" a
         join tenant."Restaurant" rr on rr.restaurant_id = a.restaurant_id
        where a.problem_id = $1 and rr.zone = 'Norte'`,
      [reported.problem_id],
    );
    expect(r.rows[0]!.n).toBe(0);
  });

  it("REGRESSION: a payment problem still yields 47/35/€3760 via the same general path", async () => {
    await stagePayment();
    const reported = await caller(PAY_POOL).diagnosis.reportProblem({
      restaurantId: "PK-001",
      conversationId: "PK-001:conv1",
      problem_type: "payment",
    });
    const out = await runDiagnosis(reported.problem_id, PAY_POOL);
    expect(out.areaType).toBe("finance");
    expect(out.affected).toBe(PAY_N);
    expect(out.silent).toBe(PAY_SILENT);
    expect(out.revenueLost).toBe(3760); // 47 × net 80
  });
});
