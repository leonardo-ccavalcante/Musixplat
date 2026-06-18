import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";

// 05A:A.1.1 — recv an inbound message; resolve tenant SERVER-SIDE (tenantProcedure, anti-spoofing
// 04 §7 / BR-A4) and create the Conversa_Episodio idempotently. A body-supplied tenant is ignored.
// canal/turnos are bruto; PII is redacted upstream (A.1.2) before persist (BR-A2). The episodio_id
// is derived from (tenant, conversa) so a re-delivery is idempotent on the PK — no double-create.
const recvInput = z.object({
  conversaId: z.string().min(1),
  restauranteId: z.string().min(1),
  canal: z.enum(["whatsapp", "email", "in_app"]),
  intent: z.string().min(1).optional(),
  turnos: z.array(z.unknown()).default([]),
});

interface ConversaRow {
  episodio_id: string;
  conversa_id: string;
  tenant_id: string;
  estado_conversa: string;
}

export const conversaRouter = router({
  recv: tenantProcedure.input(recvInput).mutation(async ({ ctx, input }): Promise<ConversaRow> => {
    const episodioId = `${ctx.tenantId}:${input.conversaId}`;
    const inserted = await query<ConversaRow>(
      `insert into tenant."Conversa_Episodio"
         (episodio_id, conversa_id, tenant_id, restaurante_id, canal, intent, turnos, estado_conversa)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,'abierta')
       on conflict (episodio_id) do nothing
       returning episodio_id, conversa_id, tenant_id, estado_conversa`,
      [episodioId, input.conversaId, ctx.tenantId, input.restauranteId, input.canal,
        input.intent ?? null, JSON.stringify(input.turnos)],
    );
    if (inserted[0]) return inserted[0];
    // Conflict ⇒ already created (idempotent re-delivery): return the existing row.
    const existing = await query<ConversaRow>(
      `select episodio_id, conversa_id, tenant_id, estado_conversa
       from tenant."Conversa_Episodio" where episodio_id=$1`,
      [episodioId],
    );
    if (!existing[0]) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "conversa create failed" });
    }
    return existing[0];
  }),
});
