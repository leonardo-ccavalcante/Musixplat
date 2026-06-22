import type { NbaVerdict } from "../agente/reasoning.js";
import type { PrecedentLever, Exec } from "../diagnosis/precedent.js";

// 05D Part D (F-closed) — prove-it-resolved re-measurement: the MISSING piece that closes the loop. An acted
// Knowledge_Case is `unverified` until THIS producer re-runs the SAME deterministic signal a window later and
// proves the gap actually closed. `verification_status` is the ONLY [V] field (§14) and is written ONLY here;
// a verified_fixed case is what ACTIVATES Part B's precedent-first (until now dormant). The number is always
// SQL (fn_nba_test_all, §3.6) — this only classifies the verdict the SQL produced.

export type ResolutionVerdict = "verified_fixed" | "verified_reopened" | "unmeasurable";

// §59 attribution carve-out: a signal whose movement is NOT causally the restaurant's own action must never
// auto-verify (it would be a fake causal claim). zone-shared (the whole zone moved) and cohort-RELATIVE (rank
// moved, not the restaurant's own absolute metric) are routed to a human instead. Fail-closed: unknown ⇒ no.
const NON_AUTOVERIFIABLE = new Set(["zone_demand_trend", "price_pctile_in_cohort"]);
const ATTRIBUTABLE = new Set(["m_connection", "m_quality", "cancel_by_restaurant", "cancel_by_customer"]);
export const isAutoVerifiable = (dimension: string | null): boolean =>
  dimension != null && ATTRIBUTABLE.has(dimension) && !NON_AUTOVERIFIABLE.has(dimension);

/** 3-valued, never binary (§14 master rule — never auto-resolve on absence of data). Given the FRESH verdict
 *  for the lever's action (the caller selects it by action_code): no row / no_data / a failed n_min∧k_anon gate
 *  / a null gap ⇒ UNMEASURABLE (re-queue, write no [V]). A breach that still holds (below/above, either
 *  direction — an overshoot into the opposite breach is NOT a clean fix) ⇒ REOPENED (negative precedent). A
 *  measured 'ok' (inside the human-approved standard) ⇒ FIXED (the gap closed). Pure. */
export function classifyResolution(fresh: NbaVerdict | undefined): ResolutionVerdict {
  if (!fresh || fresh.verdict === "no_data" || !fresh.n_min_ok || !fresh.k_anon_ok || fresh.gap == null) return "unmeasurable";
  if (fresh.verdict === "below" || fresh.verdict === "above") return "verified_reopened";
  return "verified_fixed";
}

export interface ResolutionTally { verified_fixed: number; verified_reopened: number; unmeasurable: number; skipped_non_attributable: number; }

interface DueCase { kb_case_id: string; lever: PrecedentLever; restaurant_id: string; verify_week: string; }

/** 05D Part D producer — the named [V] writer. For every acted+unverified case of the CURRENT baseline whose
 *  verify-window has data, re-measure the lever's signal and stamp the 3-valued verdict. Tenant-scoped (§3.4),
 *  baseline-pinned (§3.5 — never measure a v0 fix against v1 standards), idempotent (only flips 'unverified').
 *  Operator/cron triggers it (the scheduler is out of scope — the data-availability of W+window gates it). */
export async function verifyResolutions(tenantId: string, exec: Exec, limit = 200): Promise<ResolutionTally> {
  const tally: ResolutionTally = { verified_fixed: 0, verified_reopened: 0, unmeasurable: 0, skipped_non_attributable: 0 };
  // window = weeks after the acted week to re-measure (§3.8 by NAME). verify_week is data-time, not wall-clock:
  // if W+window has no snapshot yet, fn_nba_test_all returns no_data ⇒ unmeasurable ⇒ re-queue (correct in
  // both prod and the seeded demo — no Date dependency). Only CURRENT-baseline cases (lever version match).
  const due = await exec<DueCase>(
    `select kb_case_id, lever, path_used->>'restaurant_id' as restaurant_id,
            ((path_used->>'acted_week')::date
               + make_interval(weeks => (select value from catalog."Config_Knobs" where key='resolution_verify_window')::int))::date::text as verify_week
       from tenant."Knowledge_Case"
      where tenant_id = $1 and outcome = 'resolved' and verification_status = 'unverified'
        and lever is not null and path_used->>'restaurant_id' is not null and path_used->>'acted_week' is not null
        and lever->>'cohort_rule_version' = (select value from catalog."Config_Knobs" where key='cohort_rule_version_current')
      order by created_at limit $2`,
    [tenantId, limit],
  );
  for (const c of due) {
    if (!isAutoVerifiable(c.lever.dimension)) { tally.skipped_non_attributable++; continue; } // §59 → human (Part C)
    const verdicts = await exec<NbaVerdict>(
      `select action_code, dimension, measured::float8 measured, standard::float8 standard, verdict,
              gap::float8 gap, within_range, n_min_ok, k_anon_ok from cohort.fn_nba_test_all($1,$2)`,
      [c.restaurant_id, c.verify_week],
    );
    const fresh = verdicts.find((v) => v.action_code === c.lever.action_code);
    const verdict = classifyResolution(fresh);
    if (verdict === "unmeasurable") { tally.unmeasurable++; continue; } // re-queue, write no [V] (§14)
    await exec(
      `update tenant."Knowledge_Case"
          set verification_status = $2,
              provenance_by_field = coalesce(provenance_by_field,'{}'::jsonb) || jsonb_build_object('verification_status','[V]')
        where kb_case_id = $1 and tenant_id = $3 and verification_status = 'unverified'`,
      [c.kb_case_id, verdict, tenantId],
    );
    tally[verdict]++;
  }
  return tally;
}
