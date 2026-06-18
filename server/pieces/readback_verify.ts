// Piece 05A:A.5.4 — independent read-back quality gate (observed vs expected). (04 §10)
// After P2 executes an action, verify by comparing EXPECTED against OBSERVED from an
// INDEPENDENT authoritative source. Match ⇒ confirm; mismatch or echo ⇒ fail-closed.
// Deterministic: no LLM, no randomness. Fail-closed on missing/garbage/non-independent input.
// `sourceIndependent` MUST be true; callers asserting false are rejected — never confirm an echo.

export interface ReadbackInput {
  expected: unknown;
  observed: unknown;
  /** Asserts the observed value came from an independent authoritative source (never an echo). */
  sourceIndependent: boolean;
}

export interface ReadbackResult {
  confirmed: boolean;
  reason: "ok" | "mismatch" | "no_readback" | "not_independent";
}

// --- deterministic deep-equal (handles primitives, arrays, plain objects; stable key order) ---
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false; // covers string/number/boolean handled by === above

  // Both are non-null objects at this point.
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Plain objects: compare sorted keys for stable order.
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj).sort();
  const bKeys = Object.keys(bObj).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    const k = aKeys[i];
    if (k === undefined || k !== bKeys[i]) return false;
    if (!deepEqual(aObj[k], bObj[k])) return false;
  }
  return true;
}

/** Verify an independent read-back against the expected value. Fail-closed on any doubt. */
export function verifyReadback(
  i: ReadbackInput | null | undefined,
): ReadbackResult {
  // Missing input ⇒ conservative state (§3.7 fail-closed).
  if (i == null) {
    return { confirmed: false, reason: "no_readback" };
  }

  // Echo detection: not_independent takes unconditional priority — never reveal match status
  // on a non-independent source (prevents attacker from probing via forced echo).
  if (!i.sourceIndependent) {
    return { confirmed: false, reason: "not_independent" };
  }

  // Missing observed value from independent source ⇒ fail-closed.
  if (i.observed === undefined || i.observed === null) {
    return { confirmed: false, reason: "no_readback" };
  }

  if (deepEqual(i.expected, i.observed)) {
    return { confirmed: true, reason: "ok" };
  }

  return { confirmed: false, reason: "mismatch" };
}
