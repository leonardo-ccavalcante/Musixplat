// Piece 05A:A.4.2 — Hard grounding gate (boolean precondition for A.4 autonomy router).
// Reuses A.2.2 groundingGate; never re-implements its 4 checks (§4 reuse-before-create).
// `ttlMs` is supplied by the caller, which reads it BY NAME from Config_Knobs
// (`TTL_baseline_days`). This gate never embeds a literal threshold (CLAUDE.md §3.8).
// Fail-closed: any failure ⇒ pass=false + eje='grounding' (§3.7). Deterministic, no LLM.
// (04 §7)

import { groundingGate, type GroundingChecks, type GroundingEstado } from "./grounding.js";

export interface HardGateResult {
  pass: boolean;
  eje: "grounding" | null;
  status: GroundingEstado;
}

/**
 * Hard boolean gate for the A.4 autonomy router.
 * Returns pass=true only when groundingGate verifies all 4 checks.
 * Any failure (including null/undefined input) ⇒ pass=false, eje='grounding' (fail-closed §3.7).
 * @param checks - GroundingChecks shape from A.2.2; null/undefined treated as fully failed.
 * @param ttlMs  - TTL threshold in ms; supplied by caller from Config_Knobs TTL_baseline_days.
 */
export function hardGroundingGate(
  checks: GroundingChecks | null | undefined,
  ttlMs: number,
): HardGateResult {
  // null/undefined: groundingGate already handles gracefully, but be explicit for type-safety.
  if (checks == null) {
    return { pass: false, eje: "grounding", status: "no_verificable" };
  }

  const result = groundingGate(checks, ttlMs);

  if (result.verified) {
    return { pass: true, eje: null, status: result.status };
  }

  return { pass: false, eje: "grounding", status: result.status };
}
