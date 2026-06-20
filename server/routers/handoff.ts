import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { handoffInput } from "../../shared/contracts.js";
import { query } from "../db/pool.js";

interface EventRow {
  evento_id: string;
  restaurant_id: string;
  cohort_id: string;
  cohort_rule_version: string;
  operator_id: string | null;
}

// F-5.2 — handoff confirm. tenant_id + operator come from the SERVER session (tenantProcedure),
// never the body. Cross-pool ⇒ the SQL guard aborts; we log it and surface FORBIDDEN.
export const handoffRouter = router({
  confirm: tenantProcedure.input(handoffInput).mutation(async ({ ctx, input }) => {
    try {
      const rows = await query<EventRow>(
        `select evento_id, restaurant_id, cohort_id, cohort_rule_version, operator_id
         from cohort.fn_handoff($1, $2, $3, $4, $5, $6)`,
        [input.restaurant_id, input.cohort_id, input.subgroup_id ?? null, input.week, ctx.userId, ctx.tenantId],
      );
      return rows[0];
    } catch (e) {
      const msg = e instanceof Error ? e.message : "handoff failed";
      if (msg.includes("cross-pool")) {
        // security log on blocked cross-pool (04 §3 R6) — append-only.
        await query(
          `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1,'cross_pool',$2)`,
          [ctx.tenantId, JSON.stringify({ restaurant_id: input.restaurant_id })],
        );
        throw new TRPCError({ code: "FORBIDDEN", message: "cross-pool handoff blocked" });
      }
      if (msg.includes("no snapshot")) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "no snapshot to hand off" });
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
    }
  }),
});
