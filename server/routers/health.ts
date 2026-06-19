import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import type { HealthSummary } from "../../shared/contracts_health.js";

// 05DE-style read-only VITRINA. Reads the PRODUCED ratio_1_10 (gov.fn_roi_1_10) + counts the spine's
// produced state. Never recomputes the business number (BR-DE1). ratio NULL ⇒ "no_signal" (no green-fake);
// the efficiency leverage is "provisional" — not the 2-gate confirmed business impact (BR-DE2). Tenant
// resolved server-side.
export const healthRouter = router({
  summary: tenantProcedure.query(async ({ ctx }): Promise<HealthSummary> => {
    const roi = (
      await query<{ ratio: number | null; freshness: string | null }>(
        `select ratio_1_10::float8 as ratio, freshness_ts::text as freshness
           from gov."ROI_Operator" where tenant_id = $1 order by freshness_ts desc nulls last limit 1`,
        [ctx.tenantId],
      )
    )[0];
    const c = (
      await query<{ units: number; escalations: number; dossiers: number; artifacts: number; reviews: number }>(
        `select
           (select count(distinct a.restaurant_id) from tenant."Affected" a
              join tenant."Diagnosed_Problem" p on p.problem_id = a.problem_id where p.tenant_id = $1)::int as units,
           (select count(*) from tenant."Diagnosed_Problem" where tenant_id = $1 and status in ('needs_human','blocked'))::int as escalations,
           (select count(*) from tenant."Diagnosed_Problem" where tenant_id = $1)::int as dossiers,
           (select count(*) from gov."Generated_Artifact" where tenant_id = $1)::int as artifacts,
           (select count(*) from gov."Artifact_Decision" where tenant_id = $1)::int as reviews`,
        [ctx.tenantId],
      )
    )[0]!;
    const aht = Number(
      (await query<{ v: number }>(`select catalog.knob_required_num('aht_human_touch_minutes') as v`))[0]?.v ?? 0,
    );
    const touches = c.escalations + c.reviews;
    const ratio = roi?.ratio ?? null;
    return {
      ratio,
      freshness: roi?.freshness ?? null,
      seal: ratio == null ? "no_signal" : "provisional",
      units: c.units,
      escalations: c.escalations,
      dossiers: c.dossiers,
      artifacts: c.artifacts,
      reviews: c.reviews,
      humanMinutes: touches * aht,
      ahtMinutes: aht,
    };
  }),
});
