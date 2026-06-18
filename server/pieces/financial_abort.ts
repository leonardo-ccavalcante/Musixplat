// Piece 05A:A.5.3 — Financial abort gate (direct hard-no + anti-fracturing vs umbral_antifrac).
// financial_class='direct' + autonomous=true ⇒ NEVER auto-releases money; degrade to human.
// windowSum + newAmount > antifracThreshold ⇒ abort (anti-fracturing rule, 04 §7).
// `antifracThreshold` is supplied by the caller reading Config_Knobs by name (CLAUDE.md §3.8).
// Missing / garbage input ⇒ fail-closed abort (CLAUDE.md §3.7). Deterministic, no LLM.
//
// [ASSUMPTION] direct + NOT autonomous (human-driven proposal): the direct_no_auto hard-no
// targets autonomous execution only. A human-proposed action of financial_class='direct' is
// not auto-released, so the gate allows it — but the antifrac check still applies.

export interface FinancialContext {
  financialClass: string;
  autonomous: boolean;
  windowSum: number;
  newAmount: number;
}

export interface AbortDecision {
  abort: boolean;
  reason: "direct_no_auto" | "antifrac" | "fail_closed" | "none";
}

const ABORT_CLOSED: AbortDecision = { abort: true, reason: "fail_closed" };

function isValidAmount(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

/** Financial abort gate. Pure, fail-closed. (04 §7) */
export function financialAbort(
  ctx: FinancialContext | null | undefined,
  antifracThreshold: number,
): AbortDecision {
  // 1. Validate inputs — fail-closed on any garbage (§3.7)
  if (ctx == null) return ABORT_CLOSED;
  if (!Number.isFinite(antifracThreshold) || antifracThreshold <= 0) return ABORT_CLOSED;
  if (!isValidAmount(ctx.windowSum)) return ABORT_CLOSED;
  if (!isValidAmount(ctx.newAmount)) return ABORT_CLOSED;

  // 2. Hard-no: direct + autonomous execution ⇒ abort immediately (§3.3)
  if (ctx.financialClass === "direct" && ctx.autonomous) {
    return { abort: true, reason: "direct_no_auto" };
  }

  // 3. Anti-fracturing: cumulative window exceeds threshold (§3.3)
  if (ctx.windowSum + ctx.newAmount > antifracThreshold) {
    return { abort: true, reason: "antifrac" };
  }

  return { abort: false, reason: "none" };
}
