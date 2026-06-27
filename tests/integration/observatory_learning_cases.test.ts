import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { makePool, resetDb } from "../helpers/db";

function caller(t: string, u: string) {
  const ctx: Context = { session: { user_id: u, tenant_id: t, org_level: "team" }, tenantId: t, userId: u };
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

describe("observatory.learningCases — own-tenant, provenance + reviewed surfaced", () => {
  it("returns this pool's cases (resolved/escalated) and not another pool's", async () => {
    await pool.query(
      `insert into tenant."Knowledge_Case"
        (tenant_id,area_type,pattern,outcome,resolution,reviewed,provenance_by_field)
       values ('POOL-002','payment','dup charge','resolved','refunded',false,
               jsonb_build_object('outcome','[V]','resolution','[C]'))`,
    );
    await pool.query(
      `insert into tenant."Knowledge_Case"
        (tenant_id,area_type,pattern,outcome,not_resolved_reason,reviewed,provenance_by_field)
       values ('POOL-PAY','payment','secret pattern','escalated','needs human',false,
               jsonb_build_object('outcome','[V]','not_resolved_reason','[C]'))`,
    );

    const owner = await caller("POOL-002", "U-OP-002").observatory.learningCases({});
    expect(owner.some((c) => c.pattern === "dup charge")).toBe(true);
    expect(owner.some((c) => c.pattern === "secret pattern")).toBe(false); // cross-pool isolation
    const one = owner.find((c) => c.pattern === "dup charge")!;
    expect(one.provenanceByField.outcome).toBe("[V]");
    expect(one.reviewed).toBe(false);
    expect(one.probability).toBeNull(); // never written by motor ⇒ NULL, not 0
  });

  it("surfaces verification_status so a re-measured verified_fixed reads as verified, not amber", async () => {
    await pool.query(
      `insert into tenant."Knowledge_Case"
        (tenant_id,area_type,pattern,outcome,resolution,reviewed,verification_status,provenance_by_field)
       values ('POOL-002','connection','conn fixed','resolved','reset device',false,'verified_fixed',
               jsonb_build_object('outcome','[C]','verification_status','[V]'))`,
    );
    const rows = await caller("POOL-002", "U-OP-002").observatory.learningCases({});
    const v = rows.find((c) => c.pattern === "conn fixed")!;
    expect(v.verificationStatus).toBe("verified_fixed"); // the [V] re-measurement verdict is observable
  });
});
