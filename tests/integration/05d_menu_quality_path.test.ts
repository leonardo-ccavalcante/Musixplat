import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import { runDiagnosis } from "../../server/diagnosis/orchestrator";
import type { Context } from "../../server/_core/context";

// 05D — a FOURTH problem type (menu_quality) flows E2E through the SAME descriptor-driven engine:
// reportProblem({problem_type:'menu_quality'}) → runDiagnosis → real affected/silent/at-risk-€, ALL
// PRODUCED by the SQL dispatchers (fn_hunt_silent → fn_affected_menu_quality, fn_impact → fn_impact_
// menu_quality). Proof of generalization: a non-payment problem yields product/affected>0/€>0 without
// touching the orchestrator. Regression bar: payment still yields 47/35/€3760 via the same general path.
// Invariants: counts/€ PRODUCED (§14, never seeded); knob menu_quality_min by name (§3.8, DISTINCT from
// the A4 nba_menu_quality_min action knob); tenant server-side (§7). Fixtures current_date-relative.
//
// quality source = Order.has_photo + has_description (the REAL raw signal in the seed). The reactive
// complaint uses the REAL seed intent 'menu' (not an invented 'product'); the classifier's product family
// gained 'menu|quality' so a real menu/quality ticket classifies product. The no-conversation case uses
// the descriptor-derived proactive fallback ("Low menu quality — proactive product sweep") ⇒ product.

const MQ_POOL = "POOL-MQ-G";
const MQ_AFFECTED = 8; // 8 low-quality restaurants @ quality 0.25 (< menu_quality_min 0.50)
const MQ_SILENT = 5; // 8 affected − 3 complainants
const MQ_AT_RISK = 2400; // 8 × (4 orders × net 100 = 400 GMV) × (1 − 0.25 quality = 0.75 shortfall)

const PAY_POOL = "POOL-PAY-MG";
const PAY_N = 47;
const PAY_SILENT = 35;

function caller(tenantId: string, userId = "U-MQG-001") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

// menu_quality fixture (INPUTS only — zero seeded results, §14). 8 low-quality (quality 0.25) + 4
// healthy (1.0); orders current_date-relative so the window always covers them. 3 of 8 complain ⇒
// 5 silent. zone split 8 Centro / 4 Norte (a real concentration on the descriptor's 'zone' axis).
async function stageMenuQuality(): Promise<void> {
  await pool.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
     select 'MQ-'||lpad(g::text,3,'0'), $1, 'long_tail','long_tail'::segment, date '2026-01-01',
            case when g <= 8 then 'Centro' else 'Norte' end, 'pizza', 50
       from generate_series(1,12) g`,
    [MQ_POOL],
  );
  // LOW-quality (g<=8): 4 orders/restaurant — k in 1..2 = photo-only (0.5), k in 3..4 = neither (0.0)
  //   ⇒ avg quality = (0.5+0.5+0+0)/4 = 0.25 (< menu_quality_min 0.50 ⇒ affected). gross 120 − fee 20 = net 100.
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, has_photo, has_description, zone)
     select 'MQ-'||lpad(g::text,3,'0'), current_date - 5, 120, 20, 'ok', (k <= 2), false, 'Centro'
       from generate_series(1,8) g cross join generate_series(1,4) k`,
  );
  // HEALTHY (g>=9): 4 orders/restaurant, both flags true ⇒ quality 1.0 (>= 0.50 ⇒ NOT affected).
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, has_photo, has_description, zone)
     select 'MQ-'||lpad(g::text,3,'0'), current_date - 5, 120, 20, 'ok', true, true, 'Norte'
       from generate_series(9,12) g cross join generate_series(1,4) k`,
  );
  // 3 complainants opened a MENU ticket (the REAL seed intent) ⇒ 5 silent. The classifier's product family
  // includes 'menu|quality' ⇒ a real menu/quality ticket classifies product. FK → Intent_Catalog.
  await pool.query(
    `insert into catalog."Intent_Catalog"(intent_id, label) values ('menu','Menu')
     on conflict (intent_id) do nothing`,
  );
  await pool.query(
    `insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
     select 'MQ-'||lpad(g::text,3,'0')||':C1','MQ-'||lpad(g::text,3,'0')||':conv1',$1,
            'MQ-'||lpad(g::text,3,'0'),'menu'
       from generate_series(1,3) g`,
    [MQ_POOL],
  );
  // a REVIEWED product case so the agent is grounded (mirrors the connection-general fixture, BR-B3).
  await pool.query(
    `insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, reviewed)
     values ($1,'product','menu_incomplete','resolved','add photos + descriptions to all menu items', true)`,
    [MQ_POOL],
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

describe("05D — menu_quality E2E via the general descriptor path (zero payment regression)", () => {
  it("reportProblem({problem_type:'menu_quality'}) → runDiagnosis yields product/8/5/€2400 (produced)", async () => {
    await stageMenuQuality();
    const reported = await caller(MQ_POOL).diagnosis.reportProblem({
      restaurantId: "MQ-001",
      conversationId: "MQ-001:conv1",
      problem_type: "menu_quality",
      segment: null,
    });
    expect(reported.created).toBe(true);

    const out = await runDiagnosis(reported.problem_id, MQ_POOL);
    expect(out.areaType).toBe("product"); // intent 'menu' → product via the product family vocab
    expect(out.affected).toBe(MQ_AFFECTED); // fn_hunt_silent dispatcher → fn_affected_menu_quality
    expect(out.silent).toBe(MQ_SILENT);
    expect(out.revenueLost).toBe(MQ_AT_RISK); // fn_impact dispatcher → fn_impact_menu_quality (at-risk GMV)
    expect(out.revenueLost).toBeGreaterThan(0);
  });

  it("menu_quality where_concentrated derived from Affected on the 'zone' axis (Centro = 8, the peak)", async () => {
    await stageMenuQuality();
    const reported = await caller(MQ_POOL).diagnosis.reportProblem({
      restaurantId: "MQ-001",
      conversationId: "MQ-001:conv1",
      problem_type: "menu_quality",
    });
    await runDiagnosis(reported.problem_id, MQ_POOL);
    const r = await pool.query<{ where_concentrated: { dim: string; value: string; n: number } | null }>(
      `select case_repo -> 'where_concentrated' as where_concentrated
         from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    const wc = r.rows[0]!.where_concentrated;
    expect(wc).not.toBeNull();
    expect(wc!.dim).toBe("zone");
    expect(wc!.value).toBe("Centro"); // all 8 affected are in Centro
    expect(wc!.n).toBe(MQ_AFFECTED);
  });

  it("menu_quality runs the full dossier gate (partial until f5 ledger completes)", async () => {
    await stageMenuQuality();
    const reported = await caller(MQ_POOL).diagnosis.reportProblem({
      restaurantId: "MQ-001",
      conversationId: "MQ-001:conv1",
      problem_type: "menu_quality",
    });
    const out = await caller(MQ_POOL).diagnosis.run({ problemId: reported.problem_id });
    expect(out.affected).toBe(MQ_AFFECTED);
    expect(out.silent).toBe(MQ_SILENT);
    expect(out.revenue_lost).toBe(MQ_AT_RISK);
    expect(typeof out.dossier_emitted).toBe("boolean"); // gate runs
  });

  it("menu_quality WITHOUT a conversation classifies as product via the descriptor (not finance)", async () => {
    await stageMenuQuality();
    const reported = await caller(MQ_POOL).diagnosis.reportProblem({
      restaurantId: "MQ-001",
      problem_type: "menu_quality",
    });
    const out = await runDiagnosis(reported.problem_id, MQ_POOL);
    // descriptor-derived proactive fallback "Low menu quality — proactive product sweep" ⇒ product.
    expect(out.areaType).toBe("product");
    expect(out.affected).toBe(MQ_AFFECTED);
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
});
