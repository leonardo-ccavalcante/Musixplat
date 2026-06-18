import { z } from "zod";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query, withRollback } from "../db/pool.js";

// EPIC-6 / F-6.2 — on-demand EPHEMERAL re-segmentation. Re-runs the REAL producers (same gates:
// composite ranking + n_min + k-anon) under a hypothetical knob override, diffs vs the committed
// snapshot, and returns "SIMULATION — not committed". NO-COMMIT by construction: the whole re-seg
// runs inside withRollback (always rolled back), so it NEVER persists Cohort/Membership/NBA. Only
// open/close are logged to Usage_Event (append-only observability) outside the rollback (04 §14).
const OVERRIDABLE = new Set([
  "weight_score_orders", "weight_score_connection", "weight_score_quality", "weight_score_cancel",
  "k_anon_threshold", "n_min_threshold",
]);

export const sandboxRouter = router({
  run: tenantProcedure
    .input(z.object({ week: z.string().optional(), overrides: z.record(z.string(), z.string()).optional() }).optional())
    .query(async ({ ctx, input }) => {
      // only whitelisted knobs may be perturbed (no arbitrary knob injection)
      const overrides = Object.fromEntries(
        Object.entries(input?.overrides ?? {}).filter(([k]) => OVERRIDABLE.has(k)),
      );

      // resolve the week server-side: explicit, else the latest committed snapshot for this pool
      const week =
        input?.week ??
        (
          await query<{ w: string }>(
            `select max(s.week)::text w from cohort."Cohort_Membership_Snapshot" s
             join tenant."Restaurant" r on r.restaurant_id = s.restaurant_id
             where r.tenant_id = $1`,
            [ctx.tenantId],
          )
        )[0]?.w;

      if (!week) {
        return { committed: false as const, label: "SIMULATION — no committed snapshot yet", week: null, overrides, simulated: null };
      }

      // open — persists (outside the rollback), records what-if params
      await query(
        `insert into tenant."Usage_Event"(restaurant_id, user_id, feature, event_type, payload)
         select restaurant_id, $2, 'cohorts', 'sandbox_open', $3::jsonb
         from tenant."Restaurant" where tenant_id=$1 order by restaurant_id limit 1`,
        [ctx.tenantId, ctx.userId, JSON.stringify({ week, overrides })],
      );

      const simulated = await withRollback(async (c) => {
        // snapshot the COMMITTED result for this pool's restaurants
        await c.query(
          `create temp table _real as
           select s.restaurant_id, s.cohort_id, s.subgroup_id, s.percentile_in_cohort
           from cohort."Cohort_Membership_Snapshot" s
           join tenant."Restaurant" r on r.restaurant_id = s.restaurant_id
           where s.week = $1 and r.tenant_id = $2`,
          [week, ctx.tenantId],
        );
        // apply the hypothetical knob overrides (whitelisted), inside the rollback tx
        for (const [k, v] of Object.entries(overrides)) {
          await c.query(`update catalog."Config_Knobs" set value=$2 where key=$1`, [k, v]);
        }
        // re-run the real producers for the week — every write is discarded on rollback
        await c.query(`select cohort.fn_rank_cohort($1)`, [week]);
        await c.query(`select cohort.fn_gate_n_min($1)`, [week]);
        await c.query(`select cohort.fn_gate_k_anon($1)`, [week]);
        // diff the simulated re-seg vs the committed snapshot (this pool only)
        const r = await c.query<{ total: number; subgroup_moves: number; percentile_changes: number }>(
          `select count(*)::int total,
                  count(*) filter (where _real.subgroup_id is distinct from m.subgroup_id)::int subgroup_moves,
                  count(*) filter (where _real.percentile_in_cohort is distinct from m.percentile_in_cohort)::int percentile_changes
           from _real
           join cohort."Cohort_Membership_Snapshot" m
             on m.restaurant_id = _real.restaurant_id and m.cohort_id = _real.cohort_id and m.week = $1`,
          [week],
        );
        return r.rows[0] ?? null;
      });

      // close — persists
      await query(
        `insert into tenant."Usage_Event"(restaurant_id, user_id, feature, event_type, payload)
         select restaurant_id, $2, 'cohorts', 'sandbox_close', '{}'::jsonb
         from tenant."Restaurant" where tenant_id=$1 order by restaurant_id limit 1`,
        [ctx.tenantId, ctx.userId],
      );

      return { committed: false as const, label: "SIMULATION — not committed", week, overrides, simulated };
    }),
});
