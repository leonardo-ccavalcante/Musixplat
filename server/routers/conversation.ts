import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";

// 05A:A.1.1 — recv an inbound message; resolve tenant SERVER-SIDE (tenantProcedure, anti-spoofing
// 04 §7 / BR-A4) and create the Conversation_Episode idempotently. A body-supplied tenant is ignored.
// channel/turnos are raw; PII is redacted upstream (A.1.2) before persist (BR-A2). The episode_id
// is derived from (tenant, conversation) so a re-delivery is idempotent on the PK — no double-create.
const recvInput = z.object({
  conversationId: z.string().min(1),
  restaurantId: z.string().min(1),
  channel: z.enum(["whatsapp", "email", "in_app"]),
  intent: z.string().min(1).optional(),
  turnos: z.array(z.unknown()).default([]),
});

interface ConversationRow {
  episode_id: string;
  conversation_id: string;
  tenant_id: string;
  restaurant_id: string;
  conversation_status: string;
}

export const conversationRouter = router({
  recv: tenantProcedure.input(recvInput).mutation(async ({ ctx, input }): Promise<ConversationRow> => {
    const owner = await query<{ tenant_id: string }>(
      `select tenant_id from tenant."Restaurant" where restaurant_id=$1`,
      [input.restaurantId],
    );
    if (!owner[0]) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "unknown restaurant_id (fail-closed)" });
    }
    if (owner[0].tenant_id !== ctx.tenantId) {
      await query(
        `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1, 'cross_pool', $2)`,
        [ctx.tenantId, JSON.stringify({ piece: "05A:A.1.1", restaurantId: input.restaurantId })],
      );
      throw new TRPCError({ code: "FORBIDDEN", message: "cross-pool conversation blocked" });
    }

    const episodeId = `${ctx.tenantId}:${input.conversationId}`;
    const inserted = await query<ConversationRow>(
      `insert into tenant."Conversation_Episode"
         (episode_id, conversation_id, tenant_id, restaurant_id, channel, intent, turnos, conversation_status)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,'open')
       on conflict (episode_id) do nothing
       returning episode_id, conversation_id, tenant_id, restaurant_id, conversation_status`,
      [episodeId, input.conversationId, ctx.tenantId, input.restaurantId, input.channel,
        input.intent ?? null, JSON.stringify(input.turnos)],
    );
    if (inserted[0]) return inserted[0];
    // Conflict ⇒ already created (idempotent re-delivery): return the existing row.
    const existing = await query<ConversationRow>(
      `select episode_id, conversation_id, tenant_id, restaurant_id, conversation_status
       from tenant."Conversation_Episode" where episode_id=$1`,
      [episodeId],
    );
    if (!existing[0]) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "conversation create failed" });
    }
    if (existing[0].restaurant_id !== input.restaurantId) {
      throw new TRPCError({ code: "CONFLICT", message: "conversation_id already belongs to another restaurant" });
    }
    return existing[0];
  }),
});
