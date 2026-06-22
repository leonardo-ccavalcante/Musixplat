import type { NbaVerdict } from "../agente/reasoning.js";
import type { PrecedentLever, Exec } from "../diagnosis/precedent.js";

// 05D Part D (F-closed) — prove-it-resolved re-measurement: the MISSING piece that closes the loop. An acted
// Knowledge_Case is `unverified` until THIS producer re-runs the SAME deterministic signal a window later and
// proves the gap actually closed. `verification_status` is the ONLY [V] field (§14) and is written ONLY here;
// a verified_fixed case is what ACTIVATES Part B's precedent-first (until now dormant). The number is always
// SQL (fn_nba_test_all, §3.6) — this only classifies the verdict the SQL produced.

export type ResolutionVerdict = "verified_fixed" | "verified_reopened" | "unmeasurable";

// §59 attribution carve-out — a signal whose movement is NOT causally the restaurant's own action must never
// auto-verify (it would be a fake causal claim), so it stays unverified and is routed to a human (Part C):
//   · zone-shared (zone_demand_trend) — the whole zone moved, not this restaurant.
//   · cohort-RELATIVE (price_pctile_in_cohort) — rank moved, not the restaurant's own absolute metric.
//   · rolling-window signals (cancel_by_*) — their natural observation window is far longer than the single
//     global verify-window, so a 1-week re-measure verifies window churn, not the action (per-signal windows
//     are deferred, §92). Only signals a SHORT window can attribute are auto-verified for now. Fail-closed.
const AUTO_VERIFIABLE = new Set(["m_connection", "m_quality"]);
export const isAutoVerifiable = (dimension: string | null): boolean => dimension != null && AUTO_VERIFIABLE.has(dimension);

/** Resolution verdict, STRICT-BINARY on the SQL verdict (§14). Given the FRESH verdict for the lever's action
 *  (the caller selects it by action_code): no row / no_data / a failed n_min∧k_anon gate / a null gap ⇒
 *  UNMEASURABLE (re-queue, write no [V]). A measured 'ok' (inside the human-approved standard) ⇒ FIXED — the
 *  breach is GONE. Anything still breaching (below/above, incl. an overshoot into the opposite breach) ⇒
 *  REOPENED. NOTE (vs spec §55 gap_after<gap_before): the spec's lenient "partial improvement counts" is
 *  COUPLED with a persistence ≥N-week filter (§59) to reject noise; shipping the lenient half WITHOUT the
 *  noise-filter would let one noisy 0.01 improvement mint a strong precedent. The strict "breach fully gone"
 *  is the conservative whole — a partial improvement fails toward human (reopened), §7-correct. Pure. */
export function classifyResolution(fresh: NbaVerdict | undefined): ResolutionVerdict {
  if (!fresh || fresh.verdict === "no_data" || !fresh.n_min_ok || !fresh.k_anon_ok || fresh.gap == null) return "unmeasurable";
  if (fresh.verdict === "below" || fresh.verdict === "above") return "verified_reopened";
  return "verified_fixed";
}

export interface ResolutionTally {
  verified_fixed: number; verified_reopened: number; unmeasurable: number;
  skipped_non_attributable: number; skipped_confounded: number;
}

interface DueCase { kb_case_id: string; lever: PrecedentLever; restaurant_id: string; verify_week: string; confounded: boolean; }

/** 05D Part D producer — the named [V] writer. For every acted+unverified case of the CURRENT baseline whose
 *  verify-window has data, re-measure the lever's signal and stamp the 3-valued verdict. Tenant-scoped (§3.4),
 *  baseline-pinned (§3.5 — never measure a v0 fix against v1 standards), idempotent (only flips 'unverified').
 *  Operator/cron triggers it (the scheduler is out of scope — the data-availability of W+window gates it). */
export async function verifyResolutions(tenantId: string, exec: Exec, limit = 200): Promise<ResolutionTally> {
  const tally: ResolutionTally = { verified_fixed: 0, verified_reopened: 0, unmeasurable: 0, skipped_non_attributable: 0, skipped_confounded: 0 };
  // window = weeks after the acted week to re-measure (§3.8 by NAME). verify_week is data-time, not wall-clock:
  // if W+window has no snapshot yet, fn_nba_test_all returns no_data ⇒ unmeasurable ⇒ re-queue (correct in
  // both prod and the seeded demo — no Date dependency). Only CURRENT-baseline cases (lever version match).
  // `confounded` (§59): ANOTHER action acted on the SAME restaurant strictly inside this window ⇒ the metric
  // can't be attributed to THIS case ⇒ never auto-verify (route to human). Scoped to motor Knowledge_Cases
  // (human/cockpit dispatches lack a restaurant-scoped log — deferred).
  const due = await exec<DueCase>(
    `with due as (
       select kb_case_id, lever, path_used->>'restaurant_id' as restaurant_id,
              (path_used->>'acted_week')::date as acted_week,
              ((path_used->>'acted_week')::date
                 + make_interval(weeks => (select value from catalog."Config_Knobs" where key='resolution_verify_window')::int))::date as verify_week
         from tenant."Knowledge_Case"
        where tenant_id = $1 and outcome = 'resolved' and verification_status = 'unverified'
          and lever is not null and path_used->>'restaurant_id' is not null and path_used->>'acted_week' is not null
          and lever->>'cohort_rule_version' = (select value from catalog."Config_Knobs" where key='cohort_rule_version_current')
        order by created_at limit $2)
     select d.kb_case_id, d.lever, d.restaurant_id, d.verify_week::text as verify_week,
            exists (select 1 from tenant."Knowledge_Case" k2
                     where k2.tenant_id = $1 and k2.outcome = 'resolved' and k2.kb_case_id <> d.kb_case_id
                       and k2.path_used->>'restaurant_id' = d.restaurant_id
                       and (k2.path_used->>'acted_week')::date > d.acted_week
                       and (k2.path_used->>'acted_week')::date <= d.verify_week) as confounded
       from due d`,
    [tenantId, limit],
  );
  for (const c of due) {
    if (!isAutoVerifiable(c.lever.dimension)) { tally.skipped_non_attributable++; continue; } // §59 → human (Part C)
    if (c.confounded) { tally.skipped_confounded++; continue; } // §59 overlapping action → human (Part C)
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
