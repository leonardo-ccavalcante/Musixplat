import { query } from "../db/pool.js";

export type Nivel = "BAJA" | "MEDIA" | "ALTA";

export interface MinConversaInput {
  conversaId: string;
  pedidoNBA: Nivel | null;
  liberadoEvals: Nivel | null;
  tetoTier: Nivel | null;
}
export interface MinConversaResult {
  calculoId: string;
  nivelEfectivo: Nivel;
}

// 05A:A.4.6 — seal a min_calculo row for the conversa path (nba_id null ⇒ XOR origin = conversa).
// The least() motor lives in SQL (gov.compute_nivel_efectivo over the ordered nivel_autonomia
// enum); a null/missing arm ⇒ BAJA (fail-closed §3.7). The row is append-only and produced HERE
// at runtime — never seeded (§14). The table CHECK re-verifies nivel_efectivo = least(arms). BR-A5.
export async function sellarMinCalculoConversa(i: MinConversaInput): Promise<MinConversaResult> {
  const r = await query<{ calculo_id: string; nivel_efectivo: Nivel }>(
    `insert into gov."min_calculo"(conversa_id, pedido_NBA, liberado_evals, teto_tier, nivel_efectivo)
     values (
       $1,
       coalesce($2,'BAJA')::public.nivel_autonomia,
       coalesce($3,'BAJA')::public.nivel_autonomia,
       coalesce($4,'BAJA')::public.nivel_autonomia,
       gov.compute_nivel_efectivo($2::public.nivel_autonomia,$3::public.nivel_autonomia,$4::public.nivel_autonomia)
     )
     returning calculo_id, nivel_efectivo`,
    [i.conversaId, i.pedidoNBA, i.liberadoEvals, i.tetoTier],
  );
  const row = r[0]!;
  return { calculoId: row.calculo_id, nivelEfectivo: row.nivel_efectivo };
}
