import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { makePool, resetDb, rows } from "../helpers/db";

function caller(tenantId: string, userId: string) {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
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

// The "Limits" cap table: per-tier yourCap ([V] human ceiling) vs proven (measured [V]) vs runsAlone
// (least() floor). Tenant scope is anchored on Policy_Tier.human_signature → User.tenant_id (Policy_Tier
// is tier-keyed/global — the autoDispatch-safe anchor, §3.4). proven counts ONLY a measured [V] cell —
// an [I] floor is "not graded" (§14). runsAlone = least(cap, coalesce(proven,'LOW')).
describe("observatory.capTable — yourCap [V] vs proven (measured-only) vs runsAlone (least floor), pool-scoped", () => {
  it("returns this pool's signed tier caps with honest proven + least() runs-alone, and isolates other pools", async () => {
    const version = (
      await rows<{ value: string }>(pool, `select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`)
    )[0]!.value;
    const intent = (
      await rows<{ intent_id: string }>(pool, `select intent_id from catalog."Intent_Catalog" order by intent_id limit 1`)
    )[0]!.intent_id;
    const r2 = (
      await rows<{ restaurant_id: string }>(
        pool,
        `select restaurant_id from tenant."Restaurant" where tenant_id='POOL-002' order by restaurant_id limit 1`,
      )
    )[0]!;

    // Policy_Tier signed by U-OP-002 (POOL-002) — caps: brand MEDIUM, long_tail LOW. Distinct policy_ids/
    // versions so they never clash with the bootstrap (signed by U-OP-001/POOL-001) on conflict.
    await pool.query(
      `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap, how_measured, human_signature)
       values ('PT-brand-p2','managed_brand','pv-brand-p2','MEDIUM','test','U-OP-002'),
              ('PT-mid-p2','managed_midmarket','pv-mid-p2','MEDIUM','test','U-OP-002'),
              ('PT-long-p2','long_tail','pv-long-p2','LOW','test','U-OP-002')
       on conflict (policy_id) do nothing`,
    );

    // A managed_brand cohort owned by POOL-002 with a MEASURED [V] green eval ⇒ proven=MEDIUM for brand.
    await pool.query(
      `insert into cohort."Cohort"(cohort_id,cuisine,zone,tier_base,cohort_rule_version)
       values ('c_cap_brand','pizza','centro','managed_brand',$1) on conflict do nothing`,
      [version],
    );
    await pool.query(
      `insert into cohort."Cohort_Membership_Snapshot"
        (restaurant_id,cohort_id,week,cohort_rule_version,percentile_in_cohort,gap_to_top,provenance)
       values ($1,'c_cap_brand','2026-06-22',$2,50,0.5,'[V]')`,
      [r2.restaurant_id, version],
    );
    await pool.query(
      `insert into gov."Eval_Cell"(cohort_id,intent,version,released_evals,status,provenance_by_field)
       values ('c_cap_brand',$1,'gs-1','MEDIUM'::public.autonomy_level,'green'::public.eval_status,
               jsonb_build_object('released_evals','[V]','status','[V]'))
       on conflict (cohort_id,intent,version) do nothing`,
      [intent],
    );

    // A long_tail cohort owned by POOL-002 with ONLY an [I] floor eval ⇒ NOT proven (stays "not graded").
    await pool.query(
      `insert into cohort."Cohort"(cohort_id,cuisine,zone,tier_base,cohort_rule_version)
       values ('c_cap_long','pizza','norte','long_tail',$1) on conflict do nothing`,
      [version],
    );
    await pool.query(
      `insert into cohort."Cohort_Membership_Snapshot"
        (restaurant_id,cohort_id,week,cohort_rule_version,percentile_in_cohort,gap_to_top,provenance)
       values ($1,'c_cap_long','2026-06-22',$2,50,0.5,'[V]')`,
      [r2.restaurant_id, version],
    );
    await pool.query(
      `insert into gov."Eval_Cell"(cohort_id,intent,version,released_evals,status,provenance_by_field)
       values ('c_cap_long',$1,'gs-1','LOW'::public.autonomy_level,'green'::public.eval_status,
               jsonb_build_object('released_evals','[I]','status','[I]'))
       on conflict (cohort_id,intent,version) do nothing`,
      [intent],
    );

    // A managed_midmarket cohort with a MEASURED green verdict (status [V]) but released_evals still the
    // [I] floor — i.e. evaluated but NOT yet promoted. proven must stay null (gate on released_evals [V],
    // not status). Pins the §14 honesty Codex flagged.
    await pool.query(
      `insert into cohort."Cohort"(cohort_id,cuisine,zone,tier_base,cohort_rule_version)
       values ('c_cap_mid','pizza','este','managed_midmarket',$1) on conflict do nothing`,
      [version],
    );
    await pool.query(
      `insert into cohort."Cohort_Membership_Snapshot"
        (restaurant_id,cohort_id,week,cohort_rule_version,percentile_in_cohort,gap_to_top,provenance)
       values ($1,'c_cap_mid','2026-06-22',$2,50,0.5,'[V]')`,
      [r2.restaurant_id, version],
    );
    await pool.query(
      `insert into gov."Eval_Cell"(cohort_id,intent,version,released_evals,status,provenance_by_field)
       values ('c_cap_mid',$1,'gs-1','MEDIUM'::public.autonomy_level,'green'::public.eval_status,
               jsonb_build_object('released_evals','[I]','status','[V]'))
       on conflict (cohort_id,intent,version) do nothing`,
      [intent],
    );

    const owner = await caller("POOL-002", "U-OP-002").observatory.capTable();
    const brand = owner.find((t) => t.tier === "managed_brand");
    const long = owner.find((t) => t.tier === "long_tail");
    const mid = owner.find((t) => t.tier === "managed_midmarket");

    expect(mid).toBeDefined();
    expect(mid!.proven).toBeNull(); // verdict measured ([V] status) but level NOT promoted ([I]) ⇒ not proven
    expect(mid!.runsAlone).toBe("LOW"); // least(MEDIUM cap, coalesce(null,'LOW')) = LOW

    expect(brand).toBeDefined();
    expect(brand!.yourCap).toBe("MEDIUM"); // the human-approved ceiling [V]
    expect(brand!.proven).toBe("MEDIUM"); // a MEASURED [V] green cell counts as proven
    expect(brand!.runsAlone).toBe("MEDIUM"); // least(MEDIUM, MEDIUM)

    expect(long).toBeDefined();
    expect(long!.yourCap).toBe("LOW");
    expect(long!.proven).toBeNull(); // only an [I] floor exists ⇒ NOT proven (§14)
    expect(long!.runsAlone).toBe("LOW"); // least(LOW, coalesce(null,'LOW')) = LOW

    // A pool whose manager signed NONE of these policies sees neither tier (tenant anchor, §3.4).
    const other = await caller("POOL-PAY", "U-PAY-001").observatory.capTable();
    expect(other.find((t) => t.tier === "managed_brand" && t.yourCap === "MEDIUM")).toBeUndefined();
  });

  it("caps proven below yourCap: a measured HIGH eval still runs at your MEDIUM cap (acts at the lower)", async () => {
    const version = (
      await rows<{ value: string }>(pool, `select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`)
    )[0]!.value;
    const intent = (
      await rows<{ intent_id: string }>(pool, `select intent_id from catalog."Intent_Catalog" order by intent_id limit 1`)
    )[0]!.intent_id;
    const r1 = (
      await rows<{ restaurant_id: string }>(
        pool,
        `select restaurant_id from tenant."Restaurant" where tenant_id='POOL-001' order by restaurant_id limit 1`,
      )
    )[0]!;

    // POOL-001 brand cap = MEDIUM, signed by U-OP-001 (the demo operator's pool). Distinct policy_id/version
    // so it never clashes with the POOL-002 rows above.
    await pool.query(
      `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap, how_measured, human_signature)
       values ('PT-brand-p1','managed_brand','pv-brand-p1','MEDIUM','test','U-OP-001')
       on conflict (policy_id) do nothing`,
    );
    // A managed_brand cohort owned by POOL-001 (distinct axes: zone 'sur') with a measured HIGH eval ⇒
    // proven=HIGH, but runsAlone clamps to the MEDIUM cap.
    await pool.query(
      `insert into cohort."Cohort"(cohort_id,cuisine,zone,tier_base,cohort_rule_version)
       values ('c_cap_high','pizza','sur','managed_brand',$1) on conflict do nothing`,
      [version],
    );
    await pool.query(
      `insert into cohort."Cohort_Membership_Snapshot"
        (restaurant_id,cohort_id,week,cohort_rule_version,percentile_in_cohort,gap_to_top,provenance)
       values ($1,'c_cap_high','2026-06-22',$2,50,0.5,'[V]')`,
      [r1.restaurant_id, version],
    );
    await pool.query(
      `insert into gov."Eval_Cell"(cohort_id,intent,version,released_evals,status,provenance_by_field)
       values ('c_cap_high',$1,'gs-1','HIGH'::public.autonomy_level,'green'::public.eval_status,
               jsonb_build_object('released_evals','[V]','status','[V]'))
       on conflict (cohort_id,intent,version) do nothing`,
      [intent],
    );

    const t = await caller("POOL-001", "U-OP-001").observatory.capTable();
    const brand = t.find((x) => x.tier === "managed_brand");
    expect(brand).toBeDefined();
    expect(brand!.yourCap).toBe("MEDIUM");
    expect(brand!.proven).toBe("HIGH"); // measured pass exists
    expect(brand!.runsAlone).toBe("MEDIUM"); // least(MEDIUM, HIGH) = the cap (acts at the lower)
  });
});
