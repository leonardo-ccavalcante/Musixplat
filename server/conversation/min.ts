import { query } from "../db/pool.js";

export type Nivel = "LOW" | "MEDIUM" | "HIGH";

export interface MinConversationInput {
  conversationId: string;
  pedidoNBA: Nivel | null;
  liberadoEvals: Nivel | null;
  tetoTier: Nivel | null;
}
export interface MinConversationResult {
  calculoId: string;
  levelEfectivo: Nivel;
}

// 05A:A.4.6 — seal a min_calculation row for the conversation path (nba_id null ⇒ XOR origin = conversation).
// The least() motor lives in SQL (gov.compute_effective_level over the ordered autonomy_level
// enum); a null/missing arm ⇒ LOW (fail-closed §3.7). The row is append-only and produced HERE
// at runtime — never seeded (§14). The table CHECK re-verifies effective_level = least(arms). BR-A5.
export async function sellarMinCalculoConversation(i: MinConversationInput): Promise<MinConversationResult> {
  const r = await query<{ calculation_id: string; effective_level: Nivel }>(
    `insert into gov."min_calculation"(conversation_id, nba_request, released_evals, tier_cap, effective_level)
     values (
       $1,
       coalesce($2,'LOW')::public.autonomy_level,
       coalesce($3,'LOW')::public.autonomy_level,
       coalesce($4,'LOW')::public.autonomy_level,
       gov.compute_effective_level($2::public.autonomy_level,$3::public.autonomy_level,$4::public.autonomy_level)
     )
     returning calculation_id, effective_level`,
    [i.conversationId, i.pedidoNBA, i.liberadoEvals, i.tetoTier],
  );
  const row = r[0]!;
  return { calculoId: row.calculation_id, levelEfectivo: row.effective_level };
}
