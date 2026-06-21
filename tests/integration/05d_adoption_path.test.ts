import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import { runDiagnosis } from "../../server/diagnosis/orchestrator";
import type { Context } from "../../server/_core/context";

// 05D — a FIFTH problem type (adoption) flows E2E through the SAME descriptor-driven engine:
// reportProblem({problem_type:'adoption'}) → runDiagnosis → real affected/silent/at-risk-€, ALL PRODUCED
// by the SQL dispatchers (fn_hunt_silent → fn_affected_adoption, fn_impact → fn_impact_adoption). Proof of
// generalization: a non-payment problem yields product/affected>0/€>0 without touching the orchestrator.
// Regression bar: payment still yields 47/35/€3760 via the same general path. Invariants: counts/€ PRODUCED
// (§14, never seeded); knob by name (§3.8); tenant server-side (§7). Fixtures current_date-relative.
// adoption classifies product via the product family token 'adop' (no vocab change). The base-seed test
// below proves the recency signal (fn_seed_usage_events) makes adoption REAL on the production seed too.

const ADOPT_POOL = "POOL-ADOPT-G";
const ADOPT_AFFECTED = 6; // 6 non-adopting restaurants (last usage 60d ago > adoption_gap_days 30)
const ADOPT_SILENT = 4; // 6 affected − 2 complainants
const ADOPT_AT_RISK = 2400; // 6 × (5 orders × net 80 = 400 GMV at risk from disengagement)

const PAY_POOL = "POOL-PAY-AG";
const PAY_N = 47;
const PAY_SILENT = 35;

function caller(tenantId: string, userId = "U-ADOPTG-001") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

// Adoption fixture (INPUTS only — zero seeded results, §14). 6 non-adopting (last usage 60d ago) + 4
// adopting (usage 5d ago); usage events + orders current_date-relative so the gap/impact windows are
// drift-immune. 2 of 6 complain ⇒ 4 silent. zone split 6 Centro / 4 Norte (a real concentration on the
// descriptor's 'zone' axis: all 6 affected are Centro).
async function stageAdoption(): Promise<void> {
  await pool.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
     select 'AG-'||lpad(g::text,3,'0'), $1, 'long_tail','long_tail'::segment, date '2026-01-01',
            case when g <= 6 then 'Centro' else 'Norte' end, 'pizza', 50
       from generate_series(1,10) g`,
    [ADOPT_POOL],
  );
  // non-adopting (g<=6): last FEATURE use 60d ago (> 30d gap ⇒ affected); adopting (g>6): used 5d ago.
  // event_type='feature_use' — the SAME signal the producer writes & fn_affected_adoption scopes to (Codex P1).
  await pool.query(
    `insert into tenant."Usage_Event"(restaurant_id, feature, event_type, ts)
     select 'AG-'||lpad(g::text,3,'0'), 'menu_editor', 'feature_use',
            case when g <= 6 then (current_date - 60) else (current_date - 5) end
       from generate_series(1,10) g`,
  );
  // 5 'ok' orders/non-adopting restaurant @ net 80 — the at-risk GMV (inside window_silent).
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'AG-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'ok', 'Centro'
       from generate_series(1,6) g cross join generate_series(1,5) k`,
  );
  // 2 complainants opened an ADOPTION ticket ⇒ 4 silent. 'adoption' matches the product family ('adop').
  await pool.query(
    `insert into catalog."Intent_Catalog"(intent_id, label) values ('adoption','Adoption')
     on conflict (intent_id) do nothing`,
  );
  await pool.query(
    `insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
     select 'AG-'||lpad(g::text,3,'0')||':C1','AG-'||lpad(g::text,3,'0')||':conv1',$1,
            'AG-'||lpad(g::text,3,'0'),'adoption'
       from generate_series(1,2) g`,
    [ADOPT_POOL],
  );
  // a REVIEWED product case so the agent is grounded (mirrors the connection-general fixture, BR-B3).
  await pool.query(
    `insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, reviewed)
     values ($1,'product','feature_not_adopted','resolved','guided onboarding + activation nudge', true)`,
    [ADOPT_POOL],
  );
}

// Payment regression fixture (47 failed @ net 80, 12 complain ⇒ 35 silent / €3760).
async function stagePayment(): Promise<void> {
  await pool.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
     select 'PA-'||lpad(g::text,3,'0'), $1, 'long_tail','long_tail'::segment, date '2026-01-01',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$2) g`,
    [PAY_POOL, PAY_N],
  );
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'PA-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$1) g`,
    [PAY_N],
  );
  await pool.query(
    `insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
     select 'PA-'||lpad(g::text,3,'0')||':C1','PA-'||lpad(g::text,3,'0')||':conv1',$1,
            'PA-'||lpad(g::text,3,'0'),'billing'
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

describe("05D — adoption E2E via the general descriptor path (zero payment regression)", () => {
  it("reportProblem({problem_type:'adoption'}) → runDiagnosis yields product/6/4/€2400 (produced)", async () => {
    await stageAdoption();
    const reported = await caller(ADOPT_POOL).diagnosis.reportProblem({
      restaurantId: "AG-001",
      conversationId: "AG-001:conv1",
      problem_type: "adoption",
      segment: null,
    });
    expect(reported.created).toBe(true);

    const out = await runDiagnosis(reported.problem_id, ADOPT_POOL);
    expect(out.areaType).toBe("product"); // 'adop' matches the product family
    expect(out.affected).toBe(ADOPT_AFFECTED); // fn_hunt_silent dispatcher → fn_affected_adoption
    expect(out.silent).toBe(ADOPT_SILENT);
    expect(out.revenueLost).toBe(ADOPT_AT_RISK); // fn_impact dispatcher → fn_impact_adoption (at-risk GMV)
    expect(out.revenueLost).toBeGreaterThan(0);
  });

  it("adoption where_concentrated derived from Affected on the 'zone' axis (Centro = 6, the peak)", async () => {
    await stageAdoption();
    const reported = await caller(ADOPT_POOL).diagnosis.reportProblem({
      restaurantId: "AG-001",
      conversationId: "AG-001:conv1",
      problem_type: "adoption",
    });
    await runDiagnosis(reported.problem_id, ADOPT_POOL);
    const r = await pool.query<{ where_concentrated: { dim: string; value: string; n: number } | null }>(
      `select case_repo -> 'where_concentrated' as where_concentrated
         from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    const wc = r.rows[0]!.where_concentrated;
    expect(wc).not.toBeNull();
    expect(wc!.dim).toBe("zone");
    expect(wc!.value).toBe("Centro"); // all 6 affected are in Centro
    expect(wc!.n).toBe(ADOPT_AFFECTED);
  });

  it("adoption runs the full dossier gate (partial until f5 ledger completes)", async () => {
    await stageAdoption();
    const reported = await caller(ADOPT_POOL).diagnosis.reportProblem({
      restaurantId: "AG-001",
      conversationId: "AG-001:conv1",
      problem_type: "adoption",
    });
    const out = await caller(ADOPT_POOL).diagnosis.run({ problemId: reported.problem_id });
    expect(out.affected).toBe(ADOPT_AFFECTED);
    expect(out.silent).toBe(ADOPT_SILENT);
    expect(out.revenue_lost).toBe(ADOPT_AT_RISK);
    expect(typeof out.dossier_emitted).toBe("boolean"); // gate runs
  });

  it("adoption WITHOUT a conversation classifies as product via the descriptor (not finance)", async () => {
    await stageAdoption();
    const reported = await caller(ADOPT_POOL).diagnosis.reportProblem({
      restaurantId: "AG-001",
      problem_type: "adoption",
    });
    const out = await runDiagnosis(reported.problem_id, ADOPT_POOL);
    // descriptor-derived proactive fallback "Feature adoption gap — proactive product sweep" ⇒ product.
    expect(out.areaType).toBe("product");
    expect(out.affected).toBe(ADOPT_AFFECTED);
  });

  it("the base seed produces a REAL non-adopting population (fn_seed_usage_events ran in seed.sql)", async () => {
    // resetDb ran seed.sql ⇒ fn_seed_usage_events populated Usage_Event for the base restaurants, so the
    // adoption diagnosis is meaningful on REAL data, not only the self-contained fixture (#1 real / #4).
    const ev = await pool.query<{ n: number }>(
      `select count(*)::int n from tenant."Usage_Event" where event_type = 'feature_use'`,
    );
    expect(ev.rows[0]!.n).toBeGreaterThan(0);
    // a real non-adopting population exists (some base restaurants have only stale usage > the gap).
    const nonAdopting = await pool.query<{ n: number }>(
      `select count(*)::int n from tenant."Restaurant" r
        where r.tenant_id = 'POOL-001'
          and not exists (select 1 from tenant."Usage_Event" ue
                          where ue.restaurant_id = r.restaurant_id
                            and ue.event_type = 'feature_use' and ue.ts >= current_date - 30)`,
    );
    expect(nonAdopting.rows[0]!.n).toBeGreaterThan(0);
  });

  it("REGRESSION: a payment problem still yields 47/35/€3760 via the same general path", async () => {
    await stagePayment();
    const reported = await caller(PAY_POOL).diagnosis.reportProblem({
      restaurantId: "PA-001",
      conversationId: "PA-001:conv1",
      problem_type: "payment",
    });
    const out = await runDiagnosis(reported.problem_id, PAY_POOL);
    expect(out.areaType).toBe("finance");
    expect(out.affected).toBe(PAY_N);
    expect(out.silent).toBe(PAY_SILENT);
    expect(out.revenueLost).toBe(3760); // 47 × net 80
  });
});
