// Piece 05A:A.4.4 — Confidence vs piso gate (deterministic numeric gate, fail-closed).
// Compares a confidence value against the floor `piso`. The caller reads `piso_confianza`
// BY NAME from Config_Perillas and passes it here — no literal threshold is embedded (CLAUDE.md §3.8).
// Invalid input (NaN, out-of-[0,1], undefined) degrades to conservative state, never optimistic
// (fail-closed, CLAUDE.md §3.7). Deterministic, no LLM (04 §7).

export interface ConfidenceGateResult {
  pass: boolean;
  eje: "confianza" | null;
}

const FAIL_CLOSED: ConfidenceGateResult = { pass: false, eje: "confianza" };

/** Returns true when a number is finite and within [0, 1]. */
function isValidProbability(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 1;
}

/**
 * Gate that compares `confianza` against the supplied `piso` floor.
 *
 * - confianza >= piso ⇒ { pass: true, eje: null }
 * - confianza <  piso ⇒ { pass: false, eje: 'confianza' }
 * - any invalid input  ⇒ fail-closed { pass: false, eje: 'confianza' }
 *
 * @param confianza - confidence score, expected in [0, 1]
 * @param piso      - floor threshold; read from Config_Perillas('piso_confianza') by the caller
 */
export function confidenceGate(confianza: number, piso: number): ConfidenceGateResult {
  if (!isValidProbability(confianza)) return FAIL_CLOSED;
  if (!isValidProbability(piso)) return FAIL_CLOSED;
  if (confianza >= piso) return { pass: true, eje: null };
  return FAIL_CLOSED;
}
