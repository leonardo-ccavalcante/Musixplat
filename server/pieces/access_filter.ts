// Piece 05A:A.2.1 — hard access filter: pool match + k-anon (N>=k). Deny-by-default, fail-closed.
// RLS single-pool: cross-pool ⇒ abort + reason='cross_pool' (caller must emit security log).
// k-anon: output may only surface when cell count N >= k_anon_threshold (NOT n_min — separate gate).
// k supplied by caller, read by-name from Config_Knobs (never a literal). (04 §7, CLAUDE.md §3.2/§3.4/§3.7/§3.8)

export interface AccessQuery {
  /** tenantMatches: resolved server-side — never from client body (anti-spoofing, §3.4) */
  tenantMatches: boolean;
  /** n: count in the cohort cell, computed via Named_Query by caller (§3.6) */
  n: number;
}

export interface AccessDecision {
  allow: boolean;
  reason: "ok" | "cross_pool" | "k_anon_suppressed" | "fail_closed";
}

const FAIL_CLOSED: AccessDecision = { allow: false, reason: "fail_closed" };

/** Validate that a value is a finite, non-negative number. */
function isValidCount(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * Hard access filter combining (a) tenant/pool match and (b) k-anon gate.
 *
 * Priority order (deny-by-default, fail-closed §3.7):
 *   1. Invalid input ⇒ fail_closed
 *   2. tenantMatches===false ⇒ cross_pool (caller must emit security log)
 *   3. n < k ⇒ k_anon_suppressed (output frontier suppression §3.2)
 *   4. tenantMatches===true AND n >= k ⇒ ok
 *
 * @param q   - AccessQuery with server-resolved tenantMatches and Named_Query count n
 * @param k   - k_anon_threshold, read by-name from Config_Knobs by the caller (§3.8)
 */
export function accessFilter(
  q: AccessQuery | null | undefined,
  k: number,
): AccessDecision {
  // 1. Missing or garbage input ⇒ fail-closed (never optimistic).
  if (q == null) return { ...FAIL_CLOSED };
  if (!isValidCount(q.n)) return { ...FAIL_CLOSED };
  if (!isValidCount(k)) return { ...FAIL_CLOSED };

  // 2. Cross-pool check — highest priority deny; caller must also emit security log + red-block.
  if (!q.tenantMatches) return { allow: false, reason: "cross_pool" };

  // 3. k-anon gate at the output frontier (§3.2): suppress if cell count < k_anon_threshold.
  if (q.n < k) return { allow: false, reason: "k_anon_suppressed" };

  // 4. All checks passed.
  return { allow: true, reason: "ok" };
}
