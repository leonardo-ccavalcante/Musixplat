import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import { runDiagnosis } from "../../server/diagnosis/orchestrator";
import type { Context } from "../../server/_core/context";

// 05D L3 — operator-taught (LIVE) problem types. A live type is DATA in catalog."Problem_Type" (origin=
// 'live'); the engine reads it (resolveDescriptor) and either MEASURES via its bound vetted producer
// (measured_by) or — with NO binding — honestly degrades-to-human. The §14 anti-fake heart: an unmeasurable
// live type must yield NULL numbers (never a fabricated 0), so "can't measure yet" is distinguishable from a
// measured zero. Invariants: number from SQL (§14), tenant server-side (§7), nothing seeded.

const POOL = "POOL-LIVE-X";

function caller(tenantId: string, userId = "U-LIVE-001") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

async function stageRestaurant(): Promise<void> {
  await pool.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
     values ('LX-001', $1, 'long_tail', 'long_tail'::segment, date '2026-01-01', 'Centro', 'pizza', 50)`,
    [POOL],
  );
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'LX-001', current_date - 3, 100, 20, 'ok', 'Centro' from generate_series(1, 5)`,
  );
}

// Pass 5's defineType isn't built yet — insert the live row directly to pin the §14 behaviour FIRST (TDD).
async function defineLiveTypeDirect(slug: string, measuredBy: string | null): Promise<void> {
  await pool.query(
    `insert into catalog."Problem_Type"
       (problem_type, area_type, label, hypotheses, measured_by, concentration_dim, origin, defined_by)
     values ($1, 'product', $2, $3::jsonb, $4, 'zone', 'live', 'U-LIVE-001')`,
    [slug, `Live ${slug}`, JSON.stringify(["unknown cause A", "unknown cause B"]), measuredBy],
  );
}

// Connection fixture for a BOUND live type ("weekend_blackout" → measured_by='connection'). 3 restaurants
// each with a weekly ratio 40/100 = 0.40 < connection_min_ratio (0.80) ⇒ all 3 affected. No complainants ⇒
// 3 silent. 2 'ok' orders @ net 80 each ⇒ per-restaurant at-risk = 160 × (1 − 0.40) = 96; × 3 = €288.
const WB_HYPOTHESES = ["staff scheduling gap", "weekend POS not provisioned", "owner travels weekends"];
async function stageConnectionPool(): Promise<void> {
  await pool.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week)
     select 'WB-'||lpad(g::text,3,'0'), $1, 'long_tail', 'long_tail'::segment, date '2026-01-01', 'Centro', 'pizza', 100
       from generate_series(1, 3) g`,
    [POOL],
  );
  await pool.query(
    `insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
     select 'WB-'||lpad(g::text,3,'0'), current_date - 7, 40, 100 from generate_series(1, 3) g`,
  );
  await pool.query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'WB-'||lpad(g::text,3,'0'), current_date - 5, 100, 20, 'ok', 'Centro'
       from generate_series(1, 3) g cross join generate_series(1, 2) k`,
  );
}

beforeAll(async () => {
  pool = makePool();
}, 60_000);
beforeEach(async () => {
  await resetDb(pool);
  // Problem_Type is NOT truncated by resetDb — clear any live row from a prior test for isolation.
  await pool.query(`delete from catalog."Problem_Type" where origin = 'live'`);
});
afterAll(async () => {
  await pool.end();
});

describe("05D L3 — a live type with NO bound producer degrades-to-human (§14 anti-fake)", () => {
  it("measured_by=null ⇒ needs_human + affected/silent/revenue NULL (never a fabricated 0)", async () => {
    await stageRestaurant();
    await defineLiveTypeDirect("mystery_x", null);

    const reported = await caller(POOL).diagnosis.reportProblem({
      restaurantId: "LX-001",
      problem_type: "mystery_x", // proactive (no conversationId) ⇒ descriptor authoritative
    });
    expect(reported.created).toBe(true);

    const out = await runDiagnosis(reported.problem_id, POOL);
    expect(out.degraded).toBe(true);
    // §14 honesty: "can't measure yet" is NULL — distinguishable from a measured zero.
    expect(out.affected).toBeNull();
    expect(out.silent).toBeNull();
    expect(out.revenueLost).toBeNull();

    const r = await pool.query<{ status: string; revenue_lost: string | null }>(
      `select status, revenue_lost from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    expect(r.rows[0]!.status).toBe("needs_human");
    expect(r.rows[0]!.revenue_lost).toBeNull();
  });

  it("via the diagnosis.run procedure (the UI path) — degraded + NULL, computeImpactLedger no-ops (no crash)", async () => {
    await stageRestaurant();
    await defineLiveTypeDirect("mystery_run", null);
    const reported = await caller(POOL).diagnosis.reportProblem({ restaurantId: "LX-001", problem_type: "mystery_run" });
    const res = await caller(POOL).diagnosis.run({ problemId: reported.problem_id });
    expect(res.degraded).toBe(true);
    expect(res.affected).toBeNull();
    expect(res.revenue_lost).toBeNull();
    expect(res.silent_status).toBe("not_evaluable");
    expect(res.dossier_emitted).toBe(false); // partial — nothing measured (§14)
  });
});

describe("05D L3 — a live type BOUND to an existing producer MEASURES via that detector (B-lite)", () => {
  it("weekend_blackout → measured_by=connection yields operations/3/3/€288 (operator owns the frame)", async () => {
    await stageConnectionPool();
    // operator teaches a NEW type: own area (operations ≠ connection's 'performance'), own hypotheses +
    // routing, but measured by the EXISTING connection detector (zero new SQL).
    await pool.query(
      `insert into catalog."Problem_Type"
         (problem_type, area_type, label, hypotheses, measured_by, concentration_dim, origin, defined_by)
       values ('weekend_blackout', 'operations', 'Weekend blackout', $1::jsonb, 'connection', 'zone', 'live', 'U-LIVE-001')`,
      [JSON.stringify(WB_HYPOTHESES)],
    );

    const reported = await caller(POOL).diagnosis.reportProblem({
      restaurantId: "WB-001",
      problem_type: "weekend_blackout", // proactive (no conversationId)
    });
    const out = await runDiagnosis(reported.problem_id, POOL);

    expect(out.degraded).toBe(false); // measurable ⇒ proceeds, not degraded
    expect(out.areaType).toBe("operations"); // the OPERATOR's frame, NOT connection's 'performance'
    expect(out.affected).toBe(3); // fn_hunt_silent → (live) → fn_affected_connection
    expect(out.silent).toBe(3); // no complainants
    expect(out.revenueLost).toBe(288); // fn_impact_connection: 3 × (160 × (1 − 0.40)) — a REAL produced €

    // §8 set-equality: the engine RANKED the operator's hypotheses — never invented/dropped/rewrote one.
    const tree = await pool.query<{ paths: { hypothesis: string }[] }>(
      `select issue_tree -> 'paths' as paths from tenant."Diagnosed_Problem" where problem_id = $1`,
      [reported.problem_id],
    );
    const got = tree.rows[0]!.paths.map((p) => p.hypothesis).sort();
    expect(got).toEqual([...WB_HYPOTHESES].sort());
  });
});
