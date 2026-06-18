// EPIC-B5 puntuador de impacto + libro-razón (math in SQL, TS orchestrates). Pieces:
//   US-B5.1.1   — computeRsPerdido: Named_Query rs_perdido = sum(Orden.valor_neto fallido);
//                 churn_risk fail-closed to null (no pre-churn producer this session).
//   US-B5.3.1   — writeLedger: custo_resolver vs valor_ganho per case (NULL pre-run, §14).
// BR-B10 double-check before declaring; inherits worst provenance.
import { query } from "../db/pool.js";

export interface RsPerdidoResult {
  rsPerdido: number;
  /** null = fail-closed: no pre-churn producer wired this session (US-B5.1.1). */
  churnRisk: null;
}

/**
 * US-B5.1.1 (04 §14, BR-B10) — compute + persist rs_perdido for a problema.
 * The canonical UNIQUE formula lives in SQL: tenant.fn_impacto_rs_perdido sums
 * Orden.valor_neto (fallido) over the Afetado set, writes the column + provenance, and
 * returns the total. TS only orchestrates — it never recomputes the number (determinism in
 * SQL, §3.6). churn_risk stays NULL in the DB: no pre-churn producer was wired this session,
 * so we fail closed and surface null rather than invent a churn figure (§14).
 */
export async function computeRsPerdido(problemaId: string): Promise<RsPerdidoResult> {
  const rows = await query<{ total: string | null }>(
    `select tenant.fn_impacto_rs_perdido($1::uuid) as total`,
    [problemaId],
  );
  // numeric arrives as a string from pg; Number() once at the TS boundary. coalesce(...,0) in
  // SQL guarantees non-null, but fail closed to 0 here too if the driver ever returns null.
  return { rsPerdido: Number(rows[0]?.total ?? 0), churnRisk: null };
}

/**
 * US-B5.3.1 (04 §14, BR-B14) — write the impact ledger (custo_resolver vs valor_ganho) for a
 * resolved case. Both are RESULT columns: NULL pre-run, filled only by this named producer.
 * Provenance is merged per field (||), never overwriting prior fields' marks; ultima_vez_ts is
 * bumped so the dossier #6 recurrencia field reflects the write.
 */
export async function writeLedger(
  problemaId: string,
  entry: { custoResolver: number; valorGanho: number },
): Promise<void> {
  await query(
    `update tenant."Problema_Diagnosticado"
        set custo_resolver = $2,
            valor_ganho = $3,
            provenance_por_campo = provenance_por_campo
              || jsonb_build_object('custo_resolver', '[I]', 'valor_ganho', '[I]'),
            ultima_vez_ts = now()
      where problema_id = $1`,
    [problemaId, entry.custoResolver, entry.valorGanho],
  );
}
