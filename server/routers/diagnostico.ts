import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { reportProblemaInput, type ReportProblemaResult } from "../../shared/contracts_05b.js";

// 05B:US-B1.1.1 (gate tenant_id + restaurant_id) + 05B:B.1.3 (dedup create-or-increment).
// 04 §3/§7. tenant resolved server-side (tenantProcedure, anti-spoofing); cross-pool ⇒ abort +
// Security_Log (BR-B6 hard-no). At most ONE open problema per restaurant (anti doble-conteo,
// "un caso = un PROBLEMA") via the partial unique index — a repeat trigger increments frecuencia
// instead of duplicating (BR-B5/BR-B8). frecuencia is a computed count, never a seeded number.

export const diagnosticoRouter = router({
  reportProblema: tenantProcedure
    .input(reportProblemaInput)
    .mutation(async ({ ctx, input }): Promise<ReportProblemaResult> => {
      // US-B1.1.1 — restaurant must EXIST and belong to the session's pool (fail-closed).
      const owner = await query<{ tenant_id: string }>(
        `select tenant_id from tenant."Restaurant" where restaurant_id = $1`,
        [input.restaurantId],
      );
      if (!owner[0]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "restaurant_id desconocido (fail-closed)" });
      }
      if (owner[0].tenant_id !== ctx.tenantId) {
        await query(
          `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1, 'cross_pool', $2)`,
          [ctx.tenantId, JSON.stringify({ piece: "05B:US-B1.1.1", restaurantId: input.restaurantId })],
        );
        throw new TRPCError({ code: "FORBIDDEN", message: "cross-pool diagnostico blocked" });
      }

      // B.1.3 — create-or-increment. Partial unique (tenant_id, restaurant_id) WHERE abierto.
      // (xmax = 0) ⇒ this call inserted; otherwise it bumped an existing open problema.
      const rows = await query<{
        problema_id: string;
        status: string;
        frecuencia: number;
        created: boolean;
      }>(
        `insert into tenant."Diagnosed_Problem"
           (tenant_id, restaurant_id, conversation_id, criticidad, status, frecuencia)
         values ($1, $2, $3, $4, 'abierto', 1)
         on conflict (tenant_id, restaurant_id) where status = 'abierto'
           do update set frecuencia     = tenant."Diagnosed_Problem".frecuencia + 1,
                         ultima_vez_ts  = now()
         returning problema_id, status, frecuencia, (xmax = 0) as created`,
        [ctx.tenantId, input.restaurantId, input.conversationId ?? null, input.criticidad ?? null],
      );
      const r = rows[0];
      if (!r) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "report failed" });
      return { problema_id: r.problema_id, status: r.status, frecuencia: r.frecuencia, created: r.created };
    }),
});
