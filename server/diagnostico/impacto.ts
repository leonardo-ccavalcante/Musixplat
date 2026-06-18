// EPIC-B5 impact scorer + ledger (math in SQL, TS orchestrates). Pieces:
//   US-B5.1.1   — computeRevenueLost: Named_Query revenue_lost = sum(Order.net_value failed);
//                 churn_risk fail-closed to null (no pre-churn producer this session).
//   US-B5.3.1   — writeLedger: cost_to_resolve vs value_gained per case (NULL pre-run, §14).
// BR-B10 double-check before declaring; inherits worst provenance.
import { query } from "../db/pool.js";

export interface RevenueLostResult {
  revenueLost: number;
  /** null = fail-closed: no pre-churn producer wired this session (US-B5.1.1). */
  churnRisk: null;
}

/**
 * US-B5.1.1 (04 §14, BR-B10) — compute + persist revenue_lost for a problem.
 * The canonical UNIQUE formula lives in SQL: tenant.fn_impact_revenue_lost sums
 * Order.net_value (failed) over the Affected set, writes the column + provenance, and
 * returns the total. TS only orchestrates — it never recomputes the number (determinism in
 * SQL, §3.6). churn_risk stays NULL in the DB: no pre-churn producer was wired this session,
 * so we fail closed and surface null rather than invent a churn figure (§14).
 */
export async function computeRevenueLost(problemId: string): Promise<RevenueLostResult> {
  const rows = await query<{ total: string | null }>(
    `select tenant.fn_impact_revenue_lost($1::uuid) as total`,
    [problemId],
  );
  // numeric arrives as a string from pg; Number() once at the TS boundary. coalesce(...,0) in
  // SQL guarantees non-null, but fail closed to 0 here too if the driver ever returns null.
  return { revenueLost: Number(rows[0]?.total ?? 0), churnRisk: null };
}

/**
 * US-B5.3.1 (04 §14, BR-B14) — write the impact ledger (cost_to_resolve vs value_gained) for a
 * resolved case. Both are RESULT columns: NULL pre-run, filled only by this named producer.
 * Provenance is merged per field (||), never overwriting prior fields' marks; last_seen_ts is
 * bumped so the dossier #6 recurrence field reflects the write.
 */
export async function writeLedger(
  problemId: string,
  entry: { costToResolve: number; valueGained: number },
): Promise<void> {
  await query(
    `update tenant."Diagnosed_Problem"
        set cost_to_resolve = $2,
            value_gained = $3,
            provenance_by_field = provenance_by_field
              || jsonb_build_object('cost_to_resolve', '[I]', 'value_gained', '[I]'),
            last_seen_ts = now()
      where problem_id = $1`,
    [problemId, entry.costToResolve, entry.valueGained],
  );
}
