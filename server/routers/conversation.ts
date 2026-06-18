import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";

// 05A:A.1.1 — recv an inbound message; resolve tenant SERVER-SIDE (tenantProcedure, anti-spoofing
// 04 §7 / BR-A4) and create the Conversation_Episode idempotently. A body-supplied tenant is ignored.
// channel/turns are raw inputs; PII is redacted upstream (A.1.2) before persist (BR-A2). The episode_id
// is derived from (tenant, conversation) so a re-delivery is idempotent on the PK — no double-create.
const recvInput = z.object({
  conversationId: z.string().min(1),
  restaurantId: z.string().min(1),
  channel: z.enum(["whatsapp", "email", "in_app"]),
  intent: z.string().min(1).optional(),
  turns: z.array(z.unknown()).default([]),
});

interface ConversationRow {
  episode_id: string;
  conversation_id: string;
  tenant_id: string;
  conversation_status: string;
}

export const conversationRouter = router({
  recv: tenantProcedure.input(recvInput).mutation(async ({ ctx, input }): Promise<ConversationRow> => {
    const episodioId = `${ctx.tenantId}:${input.conversationId}`;
    const inserted = await query<ConversationRow>(
      `insert into tenant."Conversation_Episode"
         (episode_id, conversation_id, tenant_id, restaurant_id, channel, intent, turns, conversation_status)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,'open')
       on conflict (episode_id) do nothing
       returning episode_id, conversation_id, tenant_id, conversation_status`,
      [episodioId, input.conversationId, ctx.tenantId, input.restaurantId, input.channel,
        input.intent ?? null, JSON.stringify(input.turns)],
    );
    if (inserted[0]) return inserted[0];
    // Conflict ⇒ already created (idempotent re-delivery): return the existing row.
    const existing = await query<ConversationRow>(
      `select episode_id, conversation_id, tenant_id, conversation_status
       from tenant."Conversation_Episode" where episode_id=$1`,
      [episodioId],
    );
    if (!existing[0]) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "conversation create failed" });
    }
    return existing[0];
  }),
});
