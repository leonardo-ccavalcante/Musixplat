// Piece 05A:A.7.4b — anti-rubber-stamp: 4-eyes independence + rejection->0 alarm. Pure, fail-closed.
// Invariants: 4-eyes independence (04 §3.3); rubber-stamp alarm (rejection→0); threshold-by-name
// (`rejectionFloor` supplied by caller from Config_Knobs — never a literal, §3.8);
// fail-closed (§3.7); deterministic (§2/§14). No LLM.

export interface ApprovalEvent {
  proposerId: string;
  confirmerId: string | null;
  rejectionRate: number; // 0..1 — confirmer's recent rejection ratio
}

export interface RubberStampResult {
  valid: boolean;
  alarm: boolean;
  reason: "ok" | "not_independent" | "no_confirmer" | "rubber_stamp" | "fail_closed";
}

const FAIL_CLOSED: RubberStampResult = { valid: false, alarm: false, reason: "fail_closed" };

/**
 * Validate a governance approval for 4-eyes independence and rubber-stamp risk.
 *
 * `rejectionFloor` is the minimum acceptable rejection-rate for a confirmer, read by
 * NAME from Config_Knobs by the caller. This function never embeds a literal.
 *
 * [ASSUMPTION] rejectionRate === rejectionFloor triggers alarm (≤ floor ⇒ rubber_stamp).
 * A rate exactly at the floor is indistinguishable from collapse; strict '>' is the safe
 * direction per §3.7 (fail-closed). Caller may adjust rejectionFloor if marginal equality
 * should be treated as acceptable.
 */
export function antiRubberStamp(
  e: ApprovalEvent | null | undefined,
  rejectionFloor: number
): RubberStampResult {
  // Guard: missing or structurally invalid input ⇒ conservative state, not throw (§3.7).
  if (e == null) return FAIL_CLOSED;

  // Guard: rejectionFloor must be a finite number in [0, 1].
  if (!Number.isFinite(rejectionFloor) || rejectionFloor < 0 || rejectionFloor > 1) {
    return FAIL_CLOSED;
  }

  // Guard: rejectionRate must be a finite number in [0, 1].
  if (
    !Number.isFinite(e.rejectionRate) ||
    e.rejectionRate < 0 ||
    e.rejectionRate > 1
  ) {
    return FAIL_CLOSED;
  }

  // 4-eyes rule: unconfirmed approval is not valid (fail-closed — absence of confirmer ≠ ok).
  if (e.confirmerId === null || e.confirmerId === undefined) {
    return { valid: false, alarm: false, reason: "no_confirmer" };
  }

  // 4-eyes rule: confirmer must differ from proposer.
  if (e.confirmerId === e.proposerId) {
    return { valid: false, alarm: false, reason: "not_independent" };
  }

  // Rubber-stamp alarm: rejectionRate <= floor ⇒ confirmer approves everything ⇒ flag it.
  // The approval is still structurally valid but must be escalated for human review.
  if (e.rejectionRate <= rejectionFloor) {
    return { valid: true, alarm: true, reason: "rubber_stamp" };
  }

  return { valid: true, alarm: false, reason: "ok" };
}
