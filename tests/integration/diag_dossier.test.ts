import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { emitDossier } from "../../server/diagnostico/dossier";

// 05B:US-B6.3.1 — emitDossier gate over tenant.v_dossier_handoff (BR-B17/B18 fail-closed,
// BR-B7 PII saneada). Mirrors diagnostico_spine.test.ts: bare Problema (RESULT cols null) ⇒ no
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
  "f1_tipo_raiz", "f2_evidencia", "f3_quien", "f4_onde_concentra", "f5_cuanto",
  "f6_recurrence", "f7_casos_similares", "f8_hipotese_auditable", "f9_ruta_sugerida",
  "f10_dados_crudos", "f11_provenance",
] as const;

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // seeds R001 in POOL-001 (brutos only; no producers, §14)
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("05B:US-B6.3.1 — emitDossier completeness + provenance gate", () => {
  it("bare Problema (RESULT fields null) ⇒ emitted=false, gaps list the empty fields (fail-closed)", async () => {
    const created = await caller("POOL-001", "U-OP-001").diagnostico.reportProblema({
      restaurantId: "R001",
      criticidad: "grave",
    });

    const res = await emitDossier(created.problema_id);
    expect(res.emitted).toBe(false);
    expect(res.dossier).toBeNull();
    // f6_recurrence is always present (count + primera_vez_ts default), so it is NOT a gap.
    expect([...res.gaps].sort()).toEqual([
      "f1_tipo_raiz", "f2_evidencia", "f3_quien", "f4_onde_concentra", "f5_cuanto",
      "f7_casos_similares", "f8_hipotese_auditable", "f9_ruta_sugerida",
      "f10_dados_crudos", "f11_provenance",
    ].sort());
  });

  it("all 11 sources filled + ≥1 Affected ⇒ emitted=true with an 11-field dossier", async () => {
    const r = await rows<{ problema_id: string }>(
      pool,
      `select problema_id from tenant."Diagnosed_Problem" where restaurant_id = 'R001'`,
    );
    const problemaId = r[0]!.problema_id;

    // Fill every RESULT source the view derives the 11 fields from (no seeded results pre-this).
    await rows(
      pool,
      `update tenant."Diagnosed_Problem" set
         tipo_area      = 'billing',
         raiz_hipotese  = 'gateway timeout en checkout',
         confianza      = 0.82,
         issue_tree     = '[{"path":"pago","peso":0.8}]'::jsonb,
         rs_perdido     = 1200,
         churn_risk     = 0.3,
         custo_resolver = 300,
         value_ganho    = 900,
         caso_repo      = jsonb_build_object(
                            'onde_concentra', jsonb_build_object('zone','downtown'),
                            'dados_crudos',   jsonb_build_object('orderes_fallidas', 5)),
         ruta_sugerida  = 'escalar a soporte de pagos',
         links_similares      = '[{"kb_case_id":"kb-1"}]'::jsonb,
         provenance_by_field = jsonb_build_object('rs_perdido','[I]','tipo_area','[I]')
       where problema_id = $1`,
      [problemaId],
    );
    // f3_quien: at least one Affected (caza-silenciosos output). evidencia is nullable.
    await rows(
      pool,
      `insert into tenant."Affected"(problema_id, tenant_id, restaurant_id, reclamou, silencioso)
       values ($1, 'POOL-001', 'R001', true, false)`,
      [problemaId],
    );

    const res = await emitDossier(problemaId);
    expect(res.gaps).toEqual([]);
    expect(res.emitted).toBe(true);
    expect(res.dossier).not.toBeNull();
    for (const f of FIELDS) expect(res.dossier).toHaveProperty(f);
    expect(Object.keys(res.dossier!).sort()).toEqual([...FIELDS].sort());
  });
});
