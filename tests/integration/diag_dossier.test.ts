import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { emitDossier } from "../../server/diagnostico/dossier";

// 05B:US-B6.3.1 — emitDossier gate over tenant.v_dossier_handoff (BR-B17/B18 fail-closed,
// BR-B7 PII sanitized). Mirrors diagnostico_spine.test.ts: bare Problem (RESULT cols null) ⇒ no
// emit + gaps; once all 11 sources are filled + an Affected exists ⇒ emit with an 11-field dossier.

function caller(tenantId: string, userId: string) {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

const FIELDS = [
  "f1_tipo_raiz", "f2_evidence", "f3_who", "f4_where_concentrated", "f5_how_much",
  "f6_recurrence", "f7_similar_cases", "f8_auditable_hypothesis", "f9_suggested_route",
  "f10_raw_data", "f11_provenance",
] as const;

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // seeds R001 in POOL-001 (raw only; no producers, §14)
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("05B:US-B6.3.1 — emitDossier completeness + provenance gate", () => {
  it("bare Problem (RESULT fields null) ⇒ emitted=false, gaps list the empty fields (fail-closed)", async () => {
    const created = await caller("POOL-001", "U-OP-001").diagnostico.reportProblem({
      restaurantId: "R001",
      criticality: "critical",
    });

    const res = await emitDossier(created.problem_id);
    expect(res.emitted).toBe(false);
    expect(res.dossier).toBeNull();
    // f6_recurrence is always present (count + first_seen_ts default), so it is NOT a gap.
    expect([...res.gaps].sort()).toEqual([
      "f1_tipo_raiz", "f2_evidence", "f3_who", "f4_where_concentrated", "f5_how_much",
      "f7_similar_cases", "f8_auditable_hypothesis", "f9_suggested_route",
      "f10_raw_data", "f11_provenance",
    ].sort());
  });

  it("all 11 sources filled + ≥1 Affected ⇒ emitted=true with an 11-field dossier", async () => {
    const r = await rows<{ problem_id: string }>(
      pool,
      `select problem_id from tenant."Diagnosed_Problem" where restaurant_id = 'R001'`,
    );
    const problemId = r[0]!.problem_id;

    // Fill every RESULT source the view derives the 11 fields from (no seeded results pre-this).
    await rows(
      pool,
      `update tenant."Diagnosed_Problem" set
         area_type       = 'billing',
         hypothesis_root = 'gateway timeout in checkout',
         confidence      = 0.82,
         issue_tree      = '[{"path":"payment","weight":0.8}]'::jsonb,
         revenue_lost    = 1200,
         churn_risk      = 0.3,
         cost_to_resolve = 300,
         value_gained    = 900,
         case_repo       = jsonb_build_object(
                            'where_concentrated', jsonb_build_object('zone','downtown'),
                            'raw_data',           jsonb_build_object('orders_failed', 5)),
         suggested_route = 'escalate to payment support',
         similar_links       = '[{"kb_case_id":"kb-1"}]'::jsonb,
         provenance_by_field = jsonb_build_object('revenue_lost','[I]','area_type','[I]')
       where problem_id = $1`,
      [problemId],
    );
    // f3_who: at least one Affected (silent-hunter output). evidence is nullable.
    await rows(
      pool,
      `insert into tenant."Affected"(problem_id, tenant_id, restaurant_id, complained, silent)
       values ($1, 'POOL-001', 'R001', true, false)`,
      [problemId],
    );

    const res = await emitDossier(problemId);
    expect(res.gaps).toEqual([]);
    expect(res.emitted).toBe(true);
    expect(res.dossier).not.toBeNull();
    for (const f of FIELDS) expect(res.dossier).toHaveProperty(f);
    expect(Object.keys(res.dossier!).sort()).toEqual([...FIELDS].sort());
  });
});
