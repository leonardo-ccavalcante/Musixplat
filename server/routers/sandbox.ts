import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";

// EPIC-6 / F-6.1 / F-6.2 / F-6.3 — on-demand ephemeral re-segmentation.
// NO-COMMIT by construction: the simulation is a pure read; it NEVER writes Pertenencia/Cohort/
// Prioritized_NBA_Event and NEVER hands off. Only apertura/cierre are logged to Usage_Event
// (append-only observability) without persisting the simulated result (04 §14 sandbox denylist).
// Same gates as real (k-anon/n_min/anti-mezcla) apply to the read; here only the effect is blocked.
export const sandboxRouter = router({
  // F-6.2 — simulated diff vs the vigente snapshot. border perturbation = +1 month (what-if),
  // computed read-only. Returns actual vs simulado counts per cell. Writes nothing real.
  run: tenantProcedure.query(async ({ ctx }) => {
    // apertura logged (no result persisted)
    await query(
      `insert into tenant."Usage_Event"(restaurant_id, user_id, feature, event_type, payload)
       select restaurant_id, $2, 'cohorts', 'sandbox_open', '{}'::jsonb
       from tenant."Restaurant" where tenant_id=$1 order by restaurant_id limit 1`,
      [ctx.tenantId, ctx.userId],
    );

    const b1 = Number(
      (await query<{ value: string }>(`select value from catalog."Config_Knobs" where key='tenure_border_1_months'`))[0]
        ?.value ?? 3,
    );

    // read-only what-if: hypothetical re-bucket with border_1 + 1, counted vs the real snapshot.
    const diff = await query<{ tier_base: string; bucket_sim: string; n_sim: number }>(
      `select r.tier_base,
              case when r.tenure_months < ($2 + 1) then '0-3m'
                   when r.tenure_months < 6 then '3-6m'
                   when r.tenure_months < 12 then '6-12m' else '12m+' end as bucket_sim,
              count(*)::int n_sim
       from tenant."Restaurant" r
       where r.tenant_id=$1 and r.tenure_months is not null
       group by r.tier_base, bucket_sim order by r.tier_base, bucket_sim`,
      [ctx.tenantId, b1],
    );

    // cierre logged
    await query(
      `insert into tenant."Usage_Event"(restaurant_id, user_id, feature, event_type, payload)
       select restaurant_id, $2, 'cohorts', 'sandbox_close', '{}'::jsonb
       from tenant."Restaurant" where tenant_id=$1 order by restaurant_id limit 1`,
      [ctx.tenantId, ctx.userId],
    );

    return { committed: false as const, simulated: diff };
  }),
});
