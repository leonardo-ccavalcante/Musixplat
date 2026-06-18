// Piece 05A:A.5.3 — Financial abort gate (direct hard-no + anti-fracturing vs threshold_antifrac).
// financial_class='direct' + autonomo=true ⇒ NEVER auto-releases money; degrade to human.
// sumaVentana + montoNuevo > thresholdAntifrac ⇒ abort (anti-fracturing rule, 04 §7).
// `thresholdAntifrac` is supplied by the caller reading Config_Knobs by name (CLAUDE.md §3.8).
// Missing / garbage input ⇒ fail-closed abort (CLAUDE.md §3.7). Deterministic, no LLM.
//
// [ASSUMPTION] direct + NOT autonomo (human-driven proposal): the direct_no_auto hard-no
// targets autonomous execution only. A human-proposed action of financial_class='direct' is
// not auto-released, so the gate allows it — but the antifrac check still applies.

export interface FinancialContext {
  classFinanciera: string;
  autonomo: boolean;
  sumaVentana: number;
  montoNuevo: number;
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
  thresholdAntifrac: number,
): AbortDecision {
  // 1. Validate inputs — fail-closed on any garbage (§3.7)
  if (ctx == null) return ABORT_CLOSED;
  if (!Number.isFinite(thresholdAntifrac) || thresholdAntifrac <= 0) return ABORT_CLOSED;
  if (!isValidAmount(ctx.sumaVentana)) return ABORT_CLOSED;
  if (!isValidAmount(ctx.montoNuevo)) return ABORT_CLOSED;

  // 2. Hard-no: direct + autonomous execution ⇒ abort immediately (§3.3)
  if (ctx.classFinanciera === "direct" && ctx.autonomo) {
    return { abort: true, reason: "direct_no_auto" };
  }

  // 3. Anti-fracturing: cumulative window exceeds threshold (§3.3)
  if (ctx.sumaVentana + ctx.montoNuevo > thresholdAntifrac) {
    return { abort: true, reason: "antifrac" };
  }

  return { abort: false, reason: "none" };
}
