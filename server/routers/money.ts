import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";

// F-3.1 / F-3.2 — money panel. READS/LINKS ROI_Operador, never recalculates (the number is its
// owner's, P02/P03). Invariant: sin señal = conservative state, never gross/estimado (§14).
export const moneyRouter = router({
  summary: tenantProcedure.query(async ({ ctx }) => {
    const rows = await query<{
      impacto_negocio_atribuible: string | null;
      es_atribuible: boolean | null;
      freshness_ts: string | null;
    }>(
      `select impacto_negocio_atribuible, es_atribuible, freshness_ts
       from gov."ROI_Operador" where tenant_id=$1 and es_atribuible is true
       order by freshness_ts desc nulls last limit 1`,
      [ctx.tenantId],
    );
    const r = rows[0];
    if (!r) {
      // F-3.2: no signal ⇒ conservative, never a fabricated gross/estimado.
      return { hasSignal: false as const, value: null, sello: "no-confiable" as const, freshness: null };
    }
    return {
      hasSignal: true as const,
      value: r.impacto_negocio_atribuible,
      sello: "confirmado" as const,
      freshness: r.freshness_ts,
    };
  }),
});
