// Piece 05A:A.3.6-CHECK — gate self-critique verdict + bounded retry; exhaust/unknown ⇒ escalate.
// Leaf-split (§3.6/§14): AGENTE proposes the verdict (text judgment); THIS CÓDIGO piece only
// gates on the verdict value + retry counter. It never re-judges text. Fail-closed: any input
// that is not a clean "pass" or a retriable "fail" degrades to 'escalate', never to an
// optimistic default (CLAUDE.md §3.7). maxRetries is a parameter (§3.8), never a literal.
//
// attempt is 0-BASED: attempt=0 = first try, attempt=maxRetries = retries exhausted.
// nextAttempt is attempt+1 when retrying, null otherwise.

export interface CritiqueInput {
  verdict: "pass" | "fail" | string;
  /** 0-based: 0 = first try. */
  attempt: number;
  /** Supplied by caller from Config_Perillas by name (§3.8). */
  maxRetries: number;
}

export interface CritiqueDecision {
  decision: "pass" | "retry" | "escalate";
  nextAttempt: number | null;
}

const ESCALATE: CritiqueDecision = { decision: "escalate", nextAttempt: null };

/** Deterministic CHECK: marks verdict pass/fail and enforces bounded retry. (04 §14) */
export function selfCritiqueCheck(i: CritiqueInput): CritiqueDecision {
  // Validate inputs fail-closed: non-finite / negative attempt or maxRetries ⇒ escalate.
  if (
    !Number.isFinite(i.attempt) ||
    i.attempt < 0 ||
    !Number.isFinite(i.maxRetries) ||
    i.maxRetries < 0
  ) {
    return ESCALATE;
  }

  if (i.verdict === "pass") {
    return { decision: "pass", nextAttempt: null };
  }

  if (i.verdict === "fail") {
    // attempt < maxRetries ⇒ retry still available (0-based: attempt=maxRetries is exhausted).
    if (i.attempt < i.maxRetries) {
      return { decision: "retry", nextAttempt: i.attempt + 1 };
    }
    return ESCALATE;
  }

  // Unknown / garbage verdict ⇒ fail-closed escalate.
  return ESCALATE;
}
