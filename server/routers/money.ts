import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";

// F-3.1 / F-3.2 — money panel. READS/LINKS ROI_Operator, never recalculates (the number is its
// owner's, P02/P03). Invariant: no signal = conservative state, never gross/estimated (§14).
export const moneyRouter = router({
  summary: tenantProcedure.query(async ({ ctx }) => {
    const rows = await query<{
      attributable_business_impact: string | null;
      is_attributable: boolean | null;
      freshness_ts: string | null;
    }>(
      `select attributable_business_impact, is_attributable, freshness_ts
       from gov."ROI_Operator" where tenant_id=$1 and is_attributable is true
       order by freshness_ts desc nulls last limit 1`,
      [ctx.tenantId],
    );
    const r = rows[0];
    if (!r) {
      // F-3.2: no signal ⇒ conservative, never a fabricated gross/estimated.
      return { hasSignal: false as const, value: null, seal: "unreliable" as const, freshness: null };
    }
    return {
      hasSignal: true as const,
      value: r.attributable_business_impact,
      seal: "confirmed" as const,
      freshness: r.freshness_ts,
    };
  }),
});
