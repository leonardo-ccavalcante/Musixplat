// Piece 05A:A.4.4 — Confidence vs floor gate (deterministic numeric gate, fail-closed).
// Compares a confidence value against the floor `floor`. The caller reads `piso_confianza`
// BY NAME from Config_Knobs and passes it here — no literal threshold is embedded (CLAUDE.md §3.8).
// Invalid input (NaN, out-of-[0,1], undefined) degrades to conservative state, never optimistic
// (fail-closed, CLAUDE.md §3.7). Deterministic, no LLM (04 §7).

export interface ConfidenceGateResult {
  pass: boolean;
  axis: "confidence" | null;
}

const FAIL_CLOSED: ConfidenceGateResult = { pass: false, axis: "confidence" };

/** Returns true when a number is finite and within [0, 1]. */
function isValidProbability(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 1;
}

/**
 * Gate that compares `confidence` against the supplied `floor` floor.
 *
 * - confidence >= floor ⇒ { pass: true, axis: null }
 * - confidence <  floor ⇒ { pass: false, axis: 'confidence' }
 * - any invalid input  ⇒ fail-closed { pass: false, axis: 'confidence' }
 *
 * @param confidence - confidence score, expected in [0, 1]
 * @param floor      - floor threshold; read from Config_Knobs('piso_confianza') by the caller
 */
export function confidenceGate(confidence: number, floor: number): ConfidenceGateResult {
  if (!isValidProbability(confidence)) return FAIL_CLOSED;
  if (!isValidProbability(floor)) return FAIL_CLOSED;
  if (confidence >= floor) return { pass: true, axis: null };
  return FAIL_CLOSED;
}
