// Piece 05A:A.3.0 — Pre-draft composite gate (grounding/ttl/access/policy-not-stale).
// Fail-closed: any gate not strictly `true` (false, undefined, missing, null input) ⇒ blocked.
// Decoupled: caller supplies pre-computed gate booleans — no imports of A.2.2/A.2.3.
// Deterministic, no LLM. (04 §7 / CLAUDE.md §3.7)

/** Caller-supplied results of the four hard pre-draft gates. */
export interface PredraftGates {
  grounding?: boolean;
  ttlOk?: boolean;
  accessOk?: boolean;
  policyNotStale?: boolean;
}

export interface PredraftResult {
  pass: boolean;
  /** Names of gates that failed (not strictly true). Stable order: grounding, ttlOk, accessOk, policyNotStale. */
  failed: string[];
}

/** Canonical gate names in stable evaluation order. */
const GATE_NAMES: ReadonlyArray<keyof PredraftGates> = [
  "grounding",
  "ttlOk",
  "accessOk",
  "policyNotStale",
] as const;

/**
 * Evaluate all four hard pre-draft gates.
 * Fail-closed (CLAUDE.md §3.7): null/undefined input or any gate not strictly `true` ⇒ failed.
 */
export function predraftGates(g: PredraftGates | null | undefined): PredraftResult {
  if (g == null) {
    return { pass: false, failed: [...GATE_NAMES] };
  }

  const failed: string[] = GATE_NAMES.filter((name) => g[name] !== true);
  return { pass: failed.length === 0, failed };
}
