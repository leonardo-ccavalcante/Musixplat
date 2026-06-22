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

describe("observatory.evalList — own-tenant only, provenance passed through, no fabricated freshness", () => {
  it("returns this pool's eval cells and NOT another pool's", async () => {
    const version = (
      await rows<{ value: string }>(pool, `select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`)
    )[0]!.value;
    const r2 = (
      await rows<{ restaurant_id: string }>(
        pool,
        `select restaurant_id from tenant."Restaurant" where tenant_id='POOL-002' order by restaurant_id limit 1`,
      )
    )[0]!;
    const intent = (
      await rows<{ intent_id: string }>(pool, `select intent_id from catalog."Intent_Catalog" order by intent_id limit 1`)
    )[0]!.intent_id;

    // a cohort owned by POOL-002 (membership) with an [I] floor eval cell
    await pool.query(
      `insert into cohort."Cohort"(cohort_id,cuisine,zone,tier_base,cohort_rule_version)
       values ('c_obs','pizza','north','long_tail',$1) on conflict do nothing`,
      [version],
    );
    await pool.query(
      `insert into cohort."Cohort_Membership_Snapshot"
        (restaurant_id,cohort_id,week,cohort_rule_version,percentile_in_cohort,gap_to_top,provenance)
       values ($1,'c_obs','2026-06-22',$2,50,0.5,'[V]')`,
      [r2.restaurant_id, version],
    );
    await pool.query(
      `insert into gov."Eval_Cell"(cohort_id,intent,version,released_evals,status,provenance_by_field)
       values ('c_obs',$1,'gs-1','LOW'::public.autonomy_level,'green'::public.eval_status,
               jsonb_build_object('released_evals','[I]','status','[I]'))
       on conflict (cohort_id,intent,version) do nothing`,
      [intent],
    );

    const owner = await caller("POOL-002", "U-OP-002").observatory.evalList();
    const cell = owner.find((c) => c.cohortId === "c_obs");
    expect(cell).toBeDefined();
    expect(cell!.releasedEvals).toBe("LOW");
    expect(cell!.status).toBe("green");
    expect(cell!.provenanceByField.status).toBe("[I]"); // green is [I] floor, NOT a measured pass
    expect(cell!.kappa).toBeNull(); // RESULT NULL under floor, never 0
    expect(cell).not.toHaveProperty("freshness"); // Eval_Cell has no timestamp ⇒ no freshness

    const other = await caller("POOL-PAY", "U-PAY-001").observatory.evalList();
    expect(other.find((c) => c.cohortId === "c_obs")).toBeUndefined(); // cross-pool isolation (§3.4)
  });
});
