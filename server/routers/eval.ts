import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, managerProcedure } from "../_core/trpc.js";
import { query, withTx } from "../db/pool.js";
import { runEval } from "../eval/runEval.js";

// EPIC-B4 — the eval cockpit's two governance acts. Both are managerProcedure (senior-manager only):
// running the evaluator can DROP autonomy, and promoting RAISES it — each is a §6 "human owns the
// decision" boundary change. Tenant is server-side (§3.4); the cohort must be in the caller's pool.
const cellInput = z.object({
  cohortId: z.string().min(1),
  intent: z.string().min(1),
  version: z.string().min(1),
});

// Eval_Cell has NO tenant_id ⇒ anchor the pool check on cohort_id → Cohort_Membership_Snapshot →
// Restaurant.tenant_id (the observatory/provision pattern). Cross-pool ⇒ abort (§3.4/§7), never a silent grant.
async function assertCohortInPool(cohortId: string, tenantId: string): Promise<void> {
  const r = await query<{ ok: boolean }>(
    `select exists(
        select 1 from cohort."Cohort_Membership_Snapshot" cms
          join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
         where cms.cohort_id = $1) as ok`,
    [cohortId, tenantId],
  );
  if (!r[0]?.ok) throw new TRPCError({ code: "FORBIDDEN", message: "cohort is not in your pool (cross-pool blocked)" });
}

export const evalRouter = router({
  // Run the golden-set evaluator for one cell → PRODUCES the [V] verdict (status/κ/n/redteam) and
  // AUTO-DOWNGRADES released_evals→LOW on fail. It NEVER raises (promotion is the human act below).
  run: managerProcedure.input(cellInput).mutation(async ({ ctx, input }) => {
    await assertCohortInPool(input.cohortId, ctx.tenantId);
    return runEval(input.cohortId, input.intent, input.version);
  }),

  // Promote = HUMAN + evidence (00_vision §148). Raises released_evals to the level this golden set
  // certifies (Eval_Set.target_level) ONLY when status='green' — passing alone never raises autonomy.
  // greatest() so a promotion can never LOWER (downgrade is the evaluator's automatic job). Signed by
  // the authenticated senior manager (ctx.userId, spoof-proof — not a client-supplied id), stamped [V].
  promote: managerProcedure.input(cellInput).mutation(async ({ ctx, input }) => {
    await assertCohortInPool(input.cohortId, ctx.tenantId);
    return withTx(async (cx) => {
      // Lock the row FOR UPDATE so a concurrent runEval auto-downgrade can't slip a red verdict in
      // between this read and the write (TOCTOU). The status is re-asserted in the UPDATE WHERE below
      // too (belt-and-suspenders: the raise NEVER lands on a non-green cell, even via a future caller).
      const cell = (
        await cx.query<{ status: string | null }>(
          `select status from gov."Eval_Cell" where cohort_id=$1 and intent=$2 and version=$3 for update`,
          [input.cohortId, input.intent, input.version],
        )
      ).rows[0];
      if (!cell) throw new TRPCError({ code: "NOT_FOUND", message: "no eval cell — run the evaluator first" });
      if (cell.status !== "green") {
        throw new TRPCError({ code: "FORBIDDEN", message: "cannot promote: eval status is not green (evidence-gated)" });
      }
      const set = (
        await cx.query<{ target_level: string }>(`select target_level from gov."Eval_Set" where version=$1`, [input.version])
      ).rows[0];
      if (!set) throw new TRPCError({ code: "NOT_FOUND", message: "no Eval_Set registers this version's target level" });
      const updated = (
        await cx.query<{ released_evals: string }>(
          `update gov."Eval_Cell"
              set released_evals = greatest(coalesce(released_evals,'LOW'::public.autonomy_level), $4::public.autonomy_level),
                  provenance_by_field = provenance_by_field
                    || jsonb_build_object('released_evals','[V]','released_evals_signed_by', $5::text)
            where cohort_id=$1 and intent=$2 and version=$3 and status='green'
            returning released_evals`,
          [input.cohortId, input.intent, input.version, set.target_level, ctx.userId],
        )
      ).rows[0];
      if (!updated) {
        // 0 rows ⇒ status changed out from under the lock-less path (defense in depth) — never raise on non-green.
        throw new TRPCError({ code: "CONFLICT", message: "eval status changed (no longer green) — re-run the evaluator" });
      }
      return {
        cohortId: input.cohortId,
        intent: input.intent,
        version: input.version,
        releasedEvals: updated.released_evals,
        signedBy: ctx.userId,
      };
    });
  }),
});
