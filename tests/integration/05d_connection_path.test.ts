import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import { runDiagnosis } from "../../server/diagnosis/orchestrator";
import type { Context } from "../../server/_core/context";

// 05D F1 — a SECOND problem type (connection) flows E2E through the SAME descriptor-driven engine:
// reportProblem({problem_type:'connection'}) → runDiagnosis → real affected/silent/at-risk-€, ALL
// PRODUCED by the SQL dispatchers (fn_hunt_silent → fn_affected_connection, fn_impact → fn_impact_
// connection). Proof of generalization: a non-payment problem yields performance/affected>0/€>0
// without touching the orchestrator. Regression bar: payment still yields 47/35/€3760 via the same
// general path. Invariants: counts/€ PRODUCED (§14, never seeded); knob by name (§3.8); tenant
// server-side (§7). Fixtures are current_date-relative ⇒ drift-immune pinned numbers.

const CONN_POOL = "POOL-CONN-G";
const CONN_AFFECTED = 8; // 8 low-conn restaurants @ ratio 0.60 (< nba_connection_min_ratio 0.80)
const CONN_SILENT = 5; // 8 affected − 3 complainants
const CONN_AT_RISK = 1280; // 8 × (5 orders × net 80 = 400 GMV) × (1 − 0.60 ratio = 0.40 disconnection)

const PAY_POOL = "POOL-PAY-CG";
const PAY_N = 47;
const PAY_SILENT = 35;

function caller(tenantId: string, userId = "U-CONNG-001") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

// Connection fixture (INPUTS only — zero seeded results, §14). 8 low-conn (ratio 0.60) + 4 healthy
// (0.96); weeks + orders current_date-relative so the window always covers them. 3 of 8 complain ⇒
// 5 silent. zone split 8 Centro / 4 Norte (a real concentration on the descriptor's 'zone' axis).
async function stageConnection(): Promise<void> {
  await pool.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
     select 'CG-'||lpad(g::text,3,'0'), $1, 'long_tail','long_tail'::segment, date '2026-01-01',
            case when g <= 8 then 'Centro' else 'Norte' end, 'pizza', 50
       from generate_series(1,12) g`,
    [CONN_POOL],
  );
  await pool.query(
    `insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
     select 'CG-'||lpad(g::text,3,'0'), (current_date - (w*7)),
            case when g <= 8 then 30 else 48 end, 50
       from generate_series(1,12) g cross join generate_series(0,3) w`,
  );
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'CG-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'ok', 'Centro'
       from generate_series(1,8) g cross join generate_series(1,5) k`,
  );
  // 3 complainants opened a CONNECTION ticket ⇒ 5 silent. The intent text ('connection') is what the
  // deterministic classifier keys on to return area_type='performance' for the reported problem (the
  // proactive fallback line contains "payments" ⇒ would mis-classify as finance; a real connection
  // case has a connection conversation). FK → Intent_Catalog, so register the intent first.
  await pool.query(
    `insert into catalog."Intent_Catalog"(intent_id, label) values ('connection','Connection')
     on conflict (intent_id) do nothing`,
  );
  await pool.query(
    `insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
     select 'CG-'||lpad(g::text,3,'0')||':C1','CG-'||lpad(g::text,3,'0')||':conv1',$1,
            'CG-'||lpad(g::text,3,'0'),'connection'
       from generate_series(1,3) g`,
    [CONN_POOL],
  );
  // a REVIEWED performance case so the agent is grounded (mirrors the payment-general fixture).
  await pool.query(
    `insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, reviewed)
     values ($1,'performance','restaurant_disconnected','resolved','reconnect device + monitor uptime', true)`,
    [CONN_POOL],
  );
}

// Payment regression fixture (the reverse-cascade, 47 failed @ net 80, 12 complain ⇒ 35 silent / €3760).
async function stagePayment(): Promise<void> {
  await pool.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
     select 'PG-'||lpad(g::text,3,'0'), $1, 'long_tail','long_tail'::segment, date '2026-01-01',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$2) g`,
    [PAY_POOL, PAY_N],
  );
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'PG-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$1) g`,
    [PAY_N],
  );
  await pool.query(
    `insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
     select 'PG-'||lpad(g::text,3,'0')||':C1','PG-'||lpad(g::text,3,'0')||':conv1',$1,
            'PG-'||lpad(g::text,3,'0'),'billing'
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

describe("05D F1 — connection E2E via the general descriptor path (zero payment regression)", () => {
  it("reportProblem({problem_type:'connection'}) → runDiagnosis yields performance/8/5/€1280 (produced)", async () => {
    await stageConnection();
    const reported = await caller(CONN_POOL).diagnosis.reportProblem({
      restaurantId: "CG-001",
      conversationId: "CG-001:conv1",
      problem_type: "connection",
      segment: null,
    });
    expect(reported.created).toBe(true);

    const out = await runDiagnosis(reported.problem_id, CONN_POOL);
    expect(out.areaType).toBe("performance"); // descriptor.area_type drives the classifier hint path
    expect(out.affected).toBe(CONN_AFFECTED); // fn_hunt_silent dispatcher → fn_affected_connection
    expect(out.silent).toBe(CONN_SILENT);
    expect(out.revenueLost).toBe(CONN_AT_RISK); // fn_impact dispatcher → fn_impact_connection (at-risk GMV)
    expect(out.revenueLost).toBeGreaterThan(0);
  });

  it("connection where_concentrated derived from Affected on the 'zone' axis (Centro = 8, the peak)", async () => {
    await stageConnection();
    const reported = await caller(CONN_POOL).diagnosis.reportProblem({
      restaurantId: "CG-001",
      conversationId: "CG-001:conv1",
      problem_type: "connection",
    });
    await runDiagnosis(reported.problem_id, CONN_POOL);
    const r = await pool.query<{ where_concentrated: { dim: string; value: string; n: number } | null }>(
      `select case_repo -> 'where_concentrated' as where_concentrated
         from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    const wc = r.rows[0]!.where_concentrated;
    expect(wc).not.toBeNull();
    expect(wc!.dim).toBe("zone");
    expect(wc!.value).toBe("Centro"); // all 8 affected are in Centro
    expect(wc!.n).toBe(CONN_AFFECTED);
  });

  it("connection runs the full dossier gate (partial until f5 ledger completes)", async () => {
    await stageConnection();
    const reported = await caller(CONN_POOL).diagnosis.reportProblem({
      restaurantId: "CG-001",
      conversationId: "CG-001:conv1",
      problem_type: "connection",
    });
    const out = await caller(CONN_POOL).diagnosis.run({ problemId: reported.problem_id });
    expect(out.affected).toBe(CONN_AFFECTED);
    expect(out.silent).toBe(CONN_SILENT);
    expect(out.revenue_lost).toBe(CONN_AT_RISK);
    expect(typeof out.dossier_emitted).toBe("boolean"); // gate runs
  });

  it("REGRESSION: a payment problem still yields 47/35/€3760 via the same general path", async () => {
    await stagePayment();
    const reported = await caller(PAY_POOL).diagnosis.reportProblem({
      restaurantId: "PG-001",
      conversationId: "PG-001:conv1",
      problem_type: "payment",
    });
    const out = await runDiagnosis(reported.problem_id, PAY_POOL);
    expect(out.areaType).toBe("finance");
    expect(out.affected).toBe(PAY_N);
    expect(out.silent).toBe(PAY_SILENT);
    expect(out.revenueLost).toBe(3760); // 47 × net 80
  });

  it("connection WITHOUT a conversation classifies as performance via the descriptor (not finance)", async () => {
    await stageConnection();
    const reported = await caller(CONN_POOL).diagnosis.reportProblem({
      restaurantId: "CG-001",
      problem_type: "connection",
    });
    const out = await runDiagnosis(reported.problem_id, CONN_POOL);
    // Codex P1: the proactive fallback is descriptor-derived ⇒ 'performance', never the hard-coded
    // "payments process monitor" text that would mis-route a connection problem to finance.
    expect(out.areaType).toBe("performance");
    expect(out.affected).toBe(CONN_AFFECTED);
  });
});
