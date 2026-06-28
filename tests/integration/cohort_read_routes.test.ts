import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { makePool, resetDb, rows } from "../helpers/db";

function caller(tenantId: string, userId: string) {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("cohort read routes — tenant-scoped latest week + current deltas", () => {
  it("does not let another tenant's newer snapshot hide this tenant's data", async () => {
    const pool2 = (await rows<{ restaurant_id: string }>(
      pool,
      `select restaurant_id from tenant."Restaurant" where tenant_id='POOL-002' order by restaurant_id limit 1`,
    ))[0]!;

    await pool.query(
      `insert into cohort."Cohort"(cohort_id, cuisine, zone, tier_base, cohort_rule_version)
       values ('c_read', 'pizza', 'north', 'long_tail', 'v1')`,
    );
    await pool.query(
      `insert into cohort."Cohort_Membership_Snapshot"
         (restaurant_id, cohort_id, week, cohort_rule_version, percentile_in_cohort, gap_to_top, provenance)
       values
         ('R001', 'c_read', '2026-06-22', 'v1', 50, 0.5, '[V]'),
         ($1,    'c_read', '2026-06-15', 'v1', 60, 0.4, '[V]')`,
      [pool2.restaurant_id],
    );

    const drill = await caller("POOL-002", "U-OP-002").cohorts.drill({ cohort_id: "c_read" });
    expect(drill).toHaveLength(1);
    expect(drill[0]?.restaurant_id).toBe(pool2.restaurant_id);
    expect(drill[0]?.week).toBe("2026-06-15");

    await pool.query(
      `insert into cohort."Cohort_Membership_Snapshot"
         (restaurant_id, cohort_id, week, cohort_rule_version, percentile_in_cohort, gap_to_top, provenance)
       values ($1, 'c_read', '2026-06-22', 'v1', 30, 0.8, '[V]')`,
      [pool2.restaurant_id],
    );
    await pool.query(
      `insert into cohort."Prioritized_NBA_Event"
         (restaurant_id, cohort_id, week, cohort_rule_version, delta_status, percentile_in_cohort, gap_to_top)
       values
         ($1, 'c_read', '2026-06-15', 'v1', 'percentile_down', 60, 0.4),
         ($1, 'c_read', '2026-06-22', 'v1', 'at_risk',         30, 0.8)`,
      [pool2.restaurant_id],
    );

    const deltas = await caller("POOL-002", "U-OP-002").cohorts.deltas();
    expect(deltas).toHaveLength(1);
    expect(deltas[0]?.week).toBe("2026-06-22");
    expect(deltas[0]?.delta_status).toBe("at_risk");

    // Read-only polish exposes (additive — no P02 handoff contract change):
    // deltas carries percentile_delta (F-2.4 why-it-moved); list carries freshness_ts + stale (BR-12).
    expect(deltas[0]).toHaveProperty("percentile_delta");

    const list = await caller("POOL-002", "U-OP-002").cohorts.list();
    const cread = list.find((c) => c.cohort_id === "c_read");
    expect(cread).toBeDefined();
    expect(cread).toHaveProperty("freshness_ts");
    expect(typeof cread!.stale).toBe("boolean");
    expect(cread!.stale).toBe(true); // freshness_ts NULL ⇒ fn_is_stale fail-closed ⇒ stale
  });

  // §3.2 n_min frontier (review fix P0-2): a sub-n_min cell is qualitative — its within-cohort rank is
  // computed from too few accounts to trust, so drill/deltas MUST suppress the quantitative percentile + gap
  // even though the producer leaves the raw value in the table (band math uses it internally).
  it("suppresses the quantitative percentile/gap of a sub-n_min (qualitative) cell at the read frontier", async () => {
    // two POOL-002 restaurants NOT used by the prior test (offset 1) ⇒ no membership-key collision.
    const r2 = await rows<{ restaurant_id: string }>(
      pool,
      `select restaurant_id from tenant."Restaurant" where tenant_id='POOL-002' order by restaurant_id limit 2 offset 1`,
    );
    const trusted = r2[0]!.restaurant_id; // n_min_ok=true  → rank surfaces
    const collapsed = r2[1]!.restaurant_id; // n_min_ok=false → rank suppressed

    await pool.query(
      `insert into cohort."Cohort"(cohort_id, cuisine, zone, tier_base, cohort_rule_version)
       values ('c_nmin', 'pizza', 'south', 'long_tail', 'v1')`,
    );
    await pool.query(
      `insert into cohort."Cohort_Membership_Snapshot"
         (restaurant_id, cohort_id, week, cohort_rule_version, percentile_in_cohort, gap_to_top, n_min_ok, mode, provenance)
       values
         ($1, 'c_nmin', '2026-06-22', 'v1', 70, 0.3, true,  'percentile',                '[V]'),
         ($2, 'c_nmin', '2026-06-22', 'v1', 90, 0.1, false, 'qualitative_no_percentile', '[V]')`,
      [trusted, collapsed],
    );

    const drill = await caller("POOL-002", "U-OP-002").cohorts.drill({ cohort_id: "c_nmin" });
    const drilledTrusted = drill.find((d) => d.restaurant_id === trusted);
    const drilledCollapsed = drill.find((d) => d.restaurant_id === collapsed);
    expect(drilledTrusted?.percentile_in_cohort).toBe(70); // trustworthy cell renders its rank
    expect(drilledCollapsed?.percentile_in_cohort).toBeNull(); // sub-n_min cell suppressed (was 90 in the table)
    expect(drilledCollapsed?.gap_to_top).toBeNull(); // gap suppressed too
    expect(drilledCollapsed?.mode).toBe("qualitative_no_percentile"); // mode still surfaced (qualitative carrier)

    // deltas path mirrors the suppression — the event carries n_min_ok copied from the snapshot. The
    // percentile_delta jsonb (its `magnitud` is a percentile-change number) is suppressed too for sub-n_min.
    await pool.query(
      `insert into cohort."Prioritized_NBA_Event"
         (restaurant_id, cohort_id, week, cohort_rule_version, delta_status, percentile_in_cohort, gap_to_top, percentile_delta, n_min_ok)
       values
         ($1, 'c_nmin', '2026-06-22', 'v1', 'at_risk', 70, 0.3, '{"sentido":"down","magnitud":7,"root_cause":"orders","prov":"[V]"}'::jsonb, true),
         ($2, 'c_nmin', '2026-06-22', 'v1', 'at_risk', 90, 0.1, '{"sentido":"down","magnitud":12,"root_cause":"orders","prov":"[V]"}'::jsonb, false)`,
      [trusted, collapsed],
    );
    const deltas = await caller("POOL-002", "U-OP-002").cohorts.deltas();
    const dTrusted = deltas.find((d) => d.restaurant_id === trusted);
    const dCollapsed = deltas.find((d) => d.restaurant_id === collapsed);
    expect(dTrusted?.percentile_in_cohort).toBe(70); // trustworthy delta keeps rank + cause
    expect(dTrusted?.percentile_delta).not.toBeNull();
    expect(dCollapsed).toBeDefined();
    expect(dCollapsed?.percentile_in_cohort).toBeNull();
    expect(dCollapsed?.gap_to_top).toBeNull();
    expect(dCollapsed?.percentile_delta).toBeNull(); // percentile-derived magnitud suppressed
  });
});
