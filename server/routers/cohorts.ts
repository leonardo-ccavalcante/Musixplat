import { z } from "zod";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { assertSingleVersion } from "../_core/antimezcla.js";

// Read-only projections of P01 results. All tenant-scoped server-side (RLS guard); cohort-zone
// reads honor k-anon (supresion_k_aplicada) and anti-mezcla (single cohort_rule_version).
// NULL pre-run passes through as NULL — never a fabricated number (§14).

async function vigente(): Promise<string> {
  const r = await query<{ valor: string }>(
    `select valor from catalog."Config_Perillas" where key='cohort_rule_version_vigente'`,
  );
  return r[0]?.valor ?? "v1";
}
async function latestSemana(v: string): Promise<string | null> {
  const r = await query<{ s: string }>(
    `select max(semana)::text s from cohort."Pertenencia_Cohort_Snapshot" where cohort_rule_version=$1`,
    [v],
  );
  return r[0]?.s ?? null;
}

type CohortRow = {
  cohort_id: string;
  tenure_bucket: string;
  tier_base: string;
  n_cuentas: number | null;
  colapsada: boolean | null;
  supresion_k_aplicada: boolean | null;
  cohort_rule_version: string;
  baseline_descriptivo: unknown;
  oportunidad_valor: number | null;
};

// Semáforo status (F-2.1): redundant text/icon carrier, never color-only.
function status(c: CohortRow): "pending" | "suppressed" | "collapsed" | "ok" {
  if (c.supresion_k_aplicada) return "suppressed";
  if (c.n_cuentas === null) return "pending";
  if (c.colapsada) return "collapsed";
  return "ok";
}

export const cohortsRouter = router({
  // F-2.1 / F-4.1 — cohort cells + semáforo status.
  list: tenantProcedure.query(async ({ ctx }) => {
    const v = await vigente();
    const rows = await query<CohortRow>(
      `select cohort_id, tenure_bucket, tier_base, n_cuentas, colapsada, supresion_k_aplicada,
              cohort_rule_version, baseline_descriptivo, oportunidad_valor
       from cohort."Cohort" where cohort_rule_version=$1 order by tier_base, tenure_bucket`,
      [v],
    );
    await assertSingleVersion(ctx.tenantId, rows.map((r) => r.cohort_rule_version));
    return rows.map((c) => ({ ...c, status: status(c) }));
  }),

  // F-1.6 — top-vs-base baseline comparison for one cohort (suppressed ⇒ no data).
  compare: tenantProcedure.input(z.object({ cohort_id: z.string() })).query(async ({ ctx, input }) => {
    const v = await vigente();
    const rows = await query<CohortRow>(
      `select cohort_id, supresion_k_aplicada, baseline_descriptivo, cohort_rule_version
       from cohort."Cohort" where cohort_id=$1 and cohort_rule_version=$2`,
      [input.cohort_id, v],
    );
    await assertSingleVersion(ctx.tenantId, rows.map((r) => r.cohort_rule_version));
    const c = rows[0];
    if (!c || c.supresion_k_aplicada) return { suppressed: true as const, baseline: null };
    return { suppressed: false as const, baseline: c.baseline_descriptivo };
  }),

  // F-2.3 / F-2.7 — prioritized deltas (at_risk first), gap exposed. Tenant-scoped via join.
  deltas: tenantProcedure.query(async ({ ctx }) => {
    const v = await vigente();
    const rows = await query(
      `select e.evento_id, e.restaurante_id, e.cohort_id, e.delta_status,
              e.percentil_en_cohort, e.gap_hasta_top
       from cohort."Evento_Priorizado_NBA" e
       join tenant."Restaurante" r on r.restaurante_id=e.restaurante_id and r.tenant_id=$1
       where e.cohort_rule_version=$2
       order by (e.delta_status='at_risk') desc, e.gap_hasta_top desc nulls last`,
      [ctx.tenantId, v],
    );
    return rows;
  }),

  // F-5.1 — drill into one cohort's accounts, ordered by gap. Tenant-scoped.
  drill: tenantProcedure.input(z.object({ cohort_id: z.string() })).query(async ({ ctx, input }) => {
    const v = await vigente();
    const s = await latestSemana(v);
    if (!s) return [];
    return query(
      `select p.restaurante_id, p.percentil_en_cohort, p.gap_hasta_top, p.subgrupo_id,
              p.n_min_ok, p.modo, p.semana::text as semana, p.cohort_id
       from cohort."Pertenencia_Cohort_Snapshot" p
       join tenant."Restaurante" r on r.restaurante_id=p.restaurante_id and r.tenant_id=$1
       where p.cohort_id=$2 and p.semana=$3 and p.cohort_rule_version=$4
       order by p.gap_hasta_top desc nulls last`,
      [ctx.tenantId, input.cohort_id, s, v],
    );
  }),

  // F-4.2 — ML changelog timeline (read-only, ordered by fecha).
  changelog: tenantProcedure.query(async () => {
    return query(
      `select version_id, fecha::text as fecha, que_cambio, efecto_en_baseline, provenance
       from catalog."Cohort_Rule_Version" order by fecha`,
    );
  }),

  // F-3.3 / F-3.4 — raw ticket distribution intent × cohort, tenant-scoped, k-anon respected.
  intentCounts: tenantProcedure.query(async ({ ctx }) => {
    const v = await vigente();
    const s = await latestSemana(v);
    if (!s) return [];
    return query<{ cohort_id: string; intent: string; n: number }>(
      `select p.cohort_id, ce.intent, count(*)::int n
       from tenant."Conversa_Episodio" ce
       join cohort."Pertenencia_Cohort_Snapshot" p
         on p.restaurante_id=ce.restaurante_id and p.semana=$2 and p.cohort_rule_version=$3
       join cohort."Cohort" c on c.cohort_id=p.cohort_id
       where ce.tenant_id=$1 and coalesce(c.supresion_k_aplicada,true)=false and ce.intent is not null
       group by p.cohort_id, ce.intent order by p.cohort_id, ce.intent`,
      [ctx.tenantId, s, v],
    );
  }),
});
