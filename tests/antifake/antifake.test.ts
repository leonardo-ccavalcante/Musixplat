import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// ── §14 ANTI-FAKE GATE (MASTER) ──────────────────────────────────────────────
// After seed (raw only) and BEFORE any producer runs, every RESULT column must be
// NULL/empty. A seeded result number = fatal bug (CLAUDE.md §3.1). This test resets to the
// pristine post-seed state, then asserts. It is the FIRST gate (TDD: gate before producers).

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // raw only, no producers
}, 300_000);

afterAll(async () => {
  await pool.end();
});

describe("§14 anti-fake — results are NULL/empty pre-run", () => {
  it("producer-output tables are EMPTY (cells/memberships/events/ROI/NBA/min)", async () => {
    expect(await count(pool, 'cohort."Cohort"')).toBe(0);
    expect(await count(pool, 'cohort."Subgroup"')).toBe(0);
    expect(await count(pool, 'cohort."Cohort_Membership_Snapshot"')).toBe(0);
    expect(await count(pool, 'cohort."Prioritized_NBA_Event"')).toBe(0);
    expect(await count(pool, 'gov."ROI_Operator"')).toBe(0);
    // 02:1A/02:1B producers — the engine writes these at runtime, never seeded (§14).
    expect(await count(pool, 'gov."NBA_Proposal"')).toBe(0);
    expect(await count(pool, 'gov."min_calculation"')).toBe(0);
    // EPIC-B4 eval evaluator — the VERDICT is produced by runEval, never seeded. The golden-set
    // INPUT (Eval_Set/Eval_Case/Eval_Judge_Label) is seedable [V], but Eval_Cell verdict rows are NOT.
    expect(await count(pool, 'gov."Eval_Cell"')).toBe(0);
    expect(await count(pool, 'gov."Eval_Cell" where released_evals is not null or status is not null or n_golden_cases is not null')).toBe(0);
    // 05C artifact — generateFromDossier creates rows at runtime; never seeded (§14).
    expect(await count(pool, 'gov."Generated_Artifact"')).toBe(0);
    expect(await count(pool, 'gov."Artifact_Decision"')).toBe(0);
  });

  it("05B: diagnosis tables are EMPTY pre-run (Problem/Affected/Knowledge_Case/Critical_Process)", async () => {
    // Problems are CREATED at runtime by the orchestrator; Affected rows are PRODUCED by the
    // silent-hunter anti-join. Neither is ever seeded (§14, BR-B4). Knowledge_Case has no
    // producer this session ⇒ empty. Critical_Process is registered by run-05b/policy, never seeded,
    // and its `state` RESULT column is NULL until fn_monitor_critical runs (BR-B12).
    expect(await count(pool, 'tenant."Diagnosed_Problem"')).toBe(0);
    expect(await count(pool, 'tenant."Affected"')).toBe(0);
    expect(await count(pool, 'tenant."Knowledge_Case"')).toBe(0);
    expect(await count(pool, 'tenant."Critical_Process"')).toBe(0);
    expect(await count(pool, 'tenant."Critical_Process" where state is not null')).toBe(0);
  });

  it("in-place RESULT columns are NULL (tenure_months, current_value, metrics_layer)", async () => {
    expect(await count(pool, 'tenant."Restaurant" where tenure_months is not null')).toBe(0);
    expect(await count(pool, 'tenant."KPI" where current_value is not null')).toBe(0);
    expect(await count(pool, 'tenant."Conversation_Episode" where metrics_layer is not null')).toBe(0);
    // 02:BR-LOG-2 — Decision_Trace signature-quality is a RESULT computed ONLY by gov.fn_signature_quality
    // (called inline by the human-signed writer). NEVER seeded: seed inserts no traces, so post-seed both
    // columns are NULL on every row. Guards against a future seed faking a signed/non-rubber-stamp trace.
    expect(await count(pool, 'gov."Decision_Trace" where time_to_signature_sec is not null')).toBe(0);
    expect(await count(pool, 'gov."Decision_Trace" where rubber_stamp_flag is not null')).toBe(0);
  });

  it("BRUTOS are present (seed actually ran)", async () => {
    expect(await count(pool, 'tenant."Restaurant"')).toBe(5000);
    expect(await count(pool, 'tenant."Order"')).toBeGreaterThan(50000);
    expect(await count(pool, 'gov."User"')).toBe(6); // 3 human operators + 3 AI proposers, one pair per pool (POOL-001/002/PAY); U-PAY-001 seeded so Diagnosis/Cost/Knowledge/Health never 401 on a fresh deploy
    expect(await count(pool, 'catalog."Config_Knobs"')).toBeGreaterThan(0);
  });

  it("knobs are read BY NAME from Config_Knobs (k_anon=5, n_min=20)", async () => {
    const r = await rows<{ key: string; value: string }>(
      pool,
      `select key, value from catalog."Config_Knobs" where key in ('k_anon_threshold','n_min_threshold')`,
    );
    const map = Object.fromEntries(r.map((x) => [x.key, x.value]));
    expect(map["k_anon_threshold"]).toBe("5");
    expect(map["n_min_threshold"]).toBe("20");
  });
});

// ── MODEL v2 raw contract (Leo ratified: 5000, cohort axis = cuisine×zone×tier,
// generated operational signals with real correlations). Still NO results computed. ───────────
describe("MODEL v2 — correlated raw present (5000), results still NULL", () => {
  it("5000 restaurants carry location + cuisine + promised hours (raw, cohort axes)", async () => {
    expect(await count(pool, 'tenant."Restaurant"')).toBe(5000);
    expect(await count(pool, 'tenant."Restaurant" where zone is not null')).toBe(5000);
    expect(await count(pool, 'tenant."Restaurant" where cuisine is not null')).toBe(5000);
    expect(await count(pool, 'tenant."Restaurant" where committed_hours_week is not null')).toBe(5000);
  });

  it("cohort axes actually VARY (not constant like v1)", async () => {
    const [r] = await rows<{ dz: string; dt: string; dr: string }>(
      pool,
      `select count(distinct zone)::text dz, count(distinct cuisine)::text dt,
              count(distinct tier_base)::text dr from tenant."Restaurant"`,
    );
    if (!r) throw new Error("no rows from distinct-axis query");
    expect(Number(r.dz)).toBeGreaterThanOrEqual(6); // zones
    expect(Number(r.dt)).toBeGreaterThanOrEqual(5); // cuisines
    expect(Number(r.dr)).toBe(3); // tiers
  });

  it("Order carries operational signals (cancel attribution, discount, menu quality)", async () => {
    expect(await count(pool, `tenant."Order" where cancelled_by = 'restaurant'`)).toBeGreaterThan(0);
    expect(await count(pool, `tenant."Order" where cancelled_by = 'customer'`)).toBeGreaterThan(0);
    expect(await count(pool, "tenant.\"Order\" where discount_pct > 0")).toBeGreaterThan(0);
    expect(await count(pool, "tenant.\"Order\" where has_photo = true")).toBeGreaterThan(0);
    expect(await count(pool, "tenant.\"Order\" where has_photo = false")).toBeGreaterThan(0);
    expect(await count(pool, "tenant.\"Order\" where has_description = true")).toBeGreaterThan(0);
  });

  it("connection telemetry exists as weekly raw (connection numerator+denominator)", async () => {
    expect(await count(pool, 'tenant."Weekly_Connection"')).toBeGreaterThan(10000);
    expect(await count(pool, 'tenant."Weekly_Connection" where connected_hours is not null')).toBeGreaterThan(10000);
    expect(await count(pool, 'tenant."Weekly_Connection" where committed_hours is not null')).toBeGreaterThan(10000);
  });

  it("new support intents seeded (menu, order_review, cancellation)", async () => {
    expect(
      await count(pool, `catalog."Intent_Catalog" where intent_id in ('menu','order_review','cancellation')`),
    ).toBe(3);
  });

  it("connection RATIO is a RESULT — NOT computed pre-run (no producer ran)", async () => {
    // The ratio connected_hours/committed_hours lives in KPI/baseline AFTER a producer.
    // Raw are present, but the derived connection value must still be NULL (§14).
    expect(await count(pool, 'tenant."KPI" where current_value is not null')).toBe(0);
    expect(await count(pool, 'cohort."Cohort" where descriptive_baseline is not null')).toBe(0);
  });
});

// ── 05D F0 §14 — the GENERAL (descriptor) path does NOT pre-seed results ───────────────────────
// A freshly-reported payment problem (via reportProblem, the general path) must have revenue_lost
// NULL and ZERO Affected rows BEFORE the orchestrator/producers run. Proves the registry/dispatch
// refactor kept the anti-fake invariant: results come only from the named producers, never the
// report step. Runs LAST (stages its own pool) so it never perturbs the emptiness assertions above.
describe("05D F0 anti-fake — general path reports a problem with NO produced results", () => {
  function caller(tenantId: string, userId = "U-AF-001"): ReturnType<typeof appRouter.createCaller> {
    const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
    return appRouter.createCaller(ctx);
  }

  it("revenue_lost is NULL and Affected is empty for a freshly-reported payment problem", async () => {
    const POOL = "POOL-AF";
    // INPUT only — one failed-payment restaurant (no producer runs here).
    await pool.query(
      `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
       values ('R-AF-1', $1, 'long_tail','long_tail'::segment, date '2026-01-01','Centro')`,
      [POOL],
    );
    await pool.query(
      `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
       values ('R-AF-1', current_date, 100, 20, 'failed','Centro')`,
    );

    const reported = await caller(POOL).diagnosis.reportProblem({
      restaurantId: "R-AF-1",
      problem_type: "payment",
    });
    expect(reported.created).toBe(true);

    // §14: report does NOT compute — revenue_lost is NULL and there are ZERO Affected rows.
    const r = await rows<{ revenue_lost: number | null }>(
      pool,
      `select revenue_lost from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    expect(r[0]!.revenue_lost).toBeNull();
    expect(await count(pool, `tenant."Affected" where problem_id = '${reported.problem_id}'`)).toBe(0);
  });

  it("connection (F1): revenue_lost is NULL and Affected is empty for a freshly-reported problem", async () => {
    const POOL = "POOL-AF-CONN";
    // INPUT only — one low-connection restaurant (no producer runs at report time).
    await pool.query(
      `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
       values ('R-AFC-1', $1, 'long_tail','long_tail'::segment, date '2026-01-01','Centro','pizza',50)`,
      [POOL],
    );
    await pool.query(
      `insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
       select 'R-AFC-1', (current_date - (w*7)), 30, 50 from generate_series(0,3) w`,
    );

    const reported = await caller(POOL).diagnosis.reportProblem({
      restaurantId: "R-AFC-1",
      problem_type: "connection",
    });
    expect(reported.created).toBe(true);

    // §14: the connection report path computes NOTHING — revenue_lost NULL, zero Affected rows.
    const r = await rows<{ revenue_lost: number | null }>(
      pool,
      `select revenue_lost from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    expect(r[0]!.revenue_lost).toBeNull();
    expect(await count(pool, `tenant."Affected" where problem_id = '${reported.problem_id}'`)).toBe(0);
  });

  it("cancellation: revenue_lost is NULL and Affected is empty for a freshly-reported problem", async () => {
    const POOL = "POOL-AF-CANCEL";
    // INPUT only — one high-cancel restaurant (no producer runs at report time). 1 restaurant-cancelled
    // order + 1 'ok' ⇒ rate 0.50, but report computes NOTHING.
    await pool.query(
      `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
       values ('R-AFK-1', $1, 'long_tail','long_tail'::segment, date '2026-01-01','Centro','pizza',50)`,
      [POOL],
    );
    await pool.query(
      `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, cancelled_by, zone)
       values ('R-AFK-1', current_date, 100, 20, 'failed', 'restaurant', 'Centro')`,
    );
    await pool.query(
      `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
       values ('R-AFK-1', current_date, 100, 20, 'ok', 'Centro')`,
    );

    const reported = await caller(POOL).diagnosis.reportProblem({
      restaurantId: "R-AFK-1",
      problem_type: "cancellation",
    });
    expect(reported.created).toBe(true);

    // §14: the cancellation report path computes NOTHING — revenue_lost NULL, zero Affected rows.
    const r = await rows<{ revenue_lost: number | null }>(
      pool,
      `select revenue_lost from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    expect(r[0]!.revenue_lost).toBeNull();
    expect(await count(pool, `tenant."Affected" where problem_id = '${reported.problem_id}'`)).toBe(0);
  });

  it("menu_quality: revenue_lost is NULL and Affected is empty for a freshly-reported problem", async () => {
    const POOL = "POOL-AF-MQ";
    // INPUT only — one low-menu-quality restaurant (no producer runs at report time). 2 orders, both
    // flags false ⇒ quality 0.0 (< menu_quality_min) but NOTHING is computed by report.
    await pool.query(
      `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
       values ('R-AFM-1', $1, 'long_tail','long_tail'::segment, date '2026-01-01','Centro','pizza',50)`,
      [POOL],
    );
    await pool.query(
      `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, has_photo, has_description, zone)
       select 'R-AFM-1', current_date - 5, 120, 20, 'ok', false, false, 'Centro' from generate_series(1,2) k`,
    );

    const reported = await caller(POOL).diagnosis.reportProblem({
      restaurantId: "R-AFM-1",
      problem_type: "menu_quality",
    });
    expect(reported.created).toBe(true);

    // §14: the menu_quality report path computes NOTHING — revenue_lost NULL, zero Affected rows.
    const r = await rows<{ revenue_lost: number | null }>(
      pool,
      `select revenue_lost from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    expect(r[0]!.revenue_lost).toBeNull();
    expect(await count(pool, `tenant."Affected" where problem_id = '${reported.problem_id}'`)).toBe(0);
  });

  it("adoption: revenue_lost is NULL and Affected is empty for a freshly-reported problem", async () => {
    const POOL = "POOL-AF-ADOPT";
    // INPUT only — one non-adopting restaurant (a stale usage event, no producer runs at report time).
    await pool.query(
      `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
       values ('R-AFA-1', $1, 'long_tail','long_tail'::segment, date '2026-01-01','Centro','pizza',50)`,
      [POOL],
    );
    await pool.query(
      `insert into tenant."Usage_Event"(restaurant_id, feature, event_type, ts)
       values ('R-AFA-1', 'orders_dashboard', 'view', current_date - 60)`,
    );

    const reported = await caller(POOL).diagnosis.reportProblem({
      restaurantId: "R-AFA-1",
      problem_type: "adoption",
    });
    expect(reported.created).toBe(true);

    // §14: the adoption report path computes NOTHING — revenue_lost NULL, zero Affected rows.
    const r = await rows<{ revenue_lost: number | null }>(
      pool,
      `select revenue_lost from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    expect(r[0]!.revenue_lost).toBeNull();
    expect(await count(pool, `tenant."Affected" where problem_id = '${reported.problem_id}'`)).toBe(0);
  });
});
