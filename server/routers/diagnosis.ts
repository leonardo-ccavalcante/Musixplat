import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { reportProblemInput, type ReportProblemResult } from "../../shared/contracts_05b.js";

// 05B:US-B1.1.1 (gate tenant_id + restaurant_id) + 05B:B.1.3 (dedup create-or-increment).
// 04 §3/§7. tenant resolved server-side (tenantProcedure, anti-spoofing); cross-pool ⇒ abort +
// Security_Log (BR-B6 hard-no). At most ONE open problem per restaurant (anti double-counting,
// "one case = one PROBLEM") via the partial unique index — a repeat trigger increments frequency
// instead of duplicating (BR-B5/BR-B8). frequency is a computed count, never a seeded number.

export const diagnosisRouter = router({
  reportProblem: tenantProcedure
    .input(reportProblemInput)
    .mutation(async ({ ctx, input }): Promise<ReportProblemResult> => {
      // US-B1.1.1 — restaurant must EXIST and belong to the session's pool (fail-closed).
      const owner = await query<{ tenant_id: string }>(
        `select tenant_id from tenant."Restaurant" where restaurant_id = $1`,
        [input.restaurantId],
      );
      if (!owner[0]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "unknown restaurant_id (fail-closed)" });
      }
      if (owner[0].tenant_id !== ctx.tenantId) {
        await query(
          `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1, 'cross_pool', $2)`,
          [ctx.tenantId, JSON.stringify({ piece: "05B:US-B1.1.1", restaurantId: input.restaurantId })],
        );
        throw new TRPCError({ code: "FORBIDDEN", message: "cross-pool diagnosis blocked" });
      }

      // B.1.3 — create-or-increment. Partial unique (tenant_id, restaurant_id) WHERE open.
      // (xmax = 0) ⇒ this call inserted; otherwise it bumped an existing open problem.
      const rows = await query<{
        problem_id: string;
        status: string;
        frequency: number;
        created: boolean;
      }>(
        `insert into tenant."Diagnosed_Problem"
           (tenant_id, restaurant_id, conversation_id, criticality, status, frequency)
         values ($1, $2, $3, $4, 'open', 1)
         on conflict (tenant_id, restaurant_id) where status = 'open'
           do update set frequency     = tenant."Diagnosed_Problem".frequency + 1,
                         last_seen_ts  = now()
         returning problem_id, status, frequency, (xmax = 0) as created`,
        [ctx.tenantId, input.restaurantId, input.conversationId ?? null, input.criticality ?? null],
      );
      const r = rows[0];
      if (!r) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "report failed" });
      return { problem_id: r.problem_id, status: r.status, frequency: r.frequency, created: r.created };
    }),
});
