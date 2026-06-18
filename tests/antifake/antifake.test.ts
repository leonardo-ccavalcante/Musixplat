import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count, rows } from "../helpers/db";

// ── §14 ANTI-FAKE GATE (MASTER) ──────────────────────────────────────────────
// After seed (brutos only) and BEFORE any producer runs, every RESULT column must be
// NULL/empty. A seeded result number = fatal bug (CLAUDE.md §3.1). This test resets to the
// pristine post-seed state, then asserts. It is the FIRST gate (TDD: gate before producers).

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // brutos only, no producers
}, 300_000);

afterAll(async () => {
  await pool.end();
});

describe("§14 anti-fake — results are NULL/empty pre-run", () => {
  it("producer-output tables are EMPTY (cells/memberships/events/ROI)", async () => {
    expect(await count(pool, 'cohort."Cohort"')).toBe(0);
    expect(await count(pool, 'cohort."Subgroup"')).toBe(0);
    expect(await count(pool, 'cohort."Cohort_Membership_Snapshot"')).toBe(0);
    expect(await count(pool, 'cohort."Prioritized_NBA_Event"')).toBe(0);
    expect(await count(pool, 'gov."ROI_Operator"')).toBe(0);
  });

  it("05B: diagnosis tables are EMPTY pre-run (Problema/Affected/Knowledge_Case)", async () => {
    // Problemas are CREATED at runtime by the orchestrator; Affected rows are PRODUCED by the
    // caza-silenciosos anti-join. Neither is ever seeded (§14, BR-B4). Knowledge_Case has no
    // producer this session ⇒ empty.
    expect(await count(pool, 'tenant."Diagnosed_Problem"')).toBe(0);
    expect(await count(pool, 'tenant."Affected"')).toBe(0);
    expect(await count(pool, 'tenant."Knowledge_Case"')).toBe(0);
  });

  it("in-place RESULT columns are NULL (tenure_months, current_value, metrics_layer)", async () => {
    expect(await count(pool, 'tenant."Restaurant" where tenure_months is not null')).toBe(0);
    expect(await count(pool, 'tenant."KPI" where current_value is not null')).toBe(0);
    expect(await count(pool, 'tenant."Conversation_Episode" where metrics_layer is not null')).toBe(0);
  });

  it("BRUTOS are present (seed actually ran)", async () => {
    expect(await count(pool, 'tenant."Restaurant"')).toBe(5000);
    expect(await count(pool, 'tenant."Order"')).toBeGreaterThan(50000);
    expect(await count(pool, 'gov."User"')).toBe(2);
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

// ── MODEL v2 brutos contract (Leo ratified: 5000, cohort axis = cuisine×zone×tier,
// generated operational signals with real correlations). Still NO results computed. ───────────
describe("MODEL v2 — correlated brutos present (5000), results still NULL", () => {
  it("5000 restaurants carry location + cuisine + promised hours (brutos, cohort axes)", async () => {
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

  it("connection telemetry exists as weekly brutos (conexión numerator+denominator)", async () => {
    expect(await count(pool, 'tenant."Weekly_Connection"')).toBeGreaterThan(10000);
    expect(await count(pool, 'tenant."Weekly_Connection" where connected_hours is not null')).toBeGreaterThan(10000);
    expect(await count(pool, 'tenant."Weekly_Connection" where committed_hours is not null')).toBeGreaterThan(10000);
  });

  it("new support intents seeded (menu, order_review, cancelamento)", async () => {
    expect(
      await count(pool, `catalog."Intent_Catalog" where intent_id in ('menu','order_review','cancellation')`),
    ).toBe(3);
  });

  it("conexión RATIO is a RESULT — NOT computed pre-run (no producer ran)", async () => {
    // The ratio connected_hours/committed_hours lives in KPI/baseline AFTER a producer.
    // Brutos are present, but the derived conexión value must still be NULL (§14).
    expect(await count(pool, 'tenant."KPI" where current_value is not null')).toBe(0);
    expect(await count(pool, 'cohort."Cohort" where descriptive_baseline is not null')).toBe(0);
  });
});
