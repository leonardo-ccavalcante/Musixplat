// Piece 05A:A.5.3 — Financial abort gate (directa hard-no + anti-fracturing vs umbral_antifrac).
// clase_financiera='directa' + autonomo=true ⇒ NEVER auto-releases money; degrade to human.
// sumaVentana + montoNuevo > umbralAntifrac ⇒ abort (anti-fracturing rule, 04 §7).
// `umbralAntifrac` is supplied by the caller reading Config_Perillas by name (CLAUDE.md §3.8).
// Missing / garbage input ⇒ fail-closed abort (CLAUDE.md §3.7). Deterministic, no LLM.
//
// [ASSUMPTION] directa + NOT autonomo (human-driven proposal): the directa_no_auto hard-no
// targets autonomous execution only. A human-proposed action of clase_financiera='directa' is
// not auto-released, so the gate allows it — but the antifrac check still applies.

export interface FinancialContext {
  claseFinanciera: string;
  autonomo: boolean;
  sumaVentana: number;
  montoNuevo: number;
}

export interface AbortDecision {
  abort: boolean;
  reason: "directa_no_auto" | "antifrac" | "fail_closed" | "none";
}

const ABORT_CLOSED: AbortDecision = { abort: true, reason: "fail_closed" };

function isValidAmount(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

/** Financial abort gate. Pure, fail-closed. (04 §7) */
export function financialAbort(
  ctx: FinancialContext | null | undefined,
  umbralAntifrac: number,
): AbortDecision {
  // 1. Validate inputs — fail-closed on any garbage (§3.7)
  if (ctx == null) return ABORT_CLOSED;
  if (!Number.isFinite(umbralAntifrac) || umbralAntifrac <= 0) return ABORT_CLOSED;
  if (!isValidAmount(ctx.sumaVentana)) return ABORT_CLOSED;
  if (!isValidAmount(ctx.montoNuevo)) return ABORT_CLOSED;

  // 2. Hard-no: directa + autonomous execution ⇒ abort immediately (§3.3)
  if (ctx.claseFinanciera === "directa" && ctx.autonomo) {
    return { abort: true, reason: "directa_no_auto" };
  }

  // 3. Anti-fracturing: cumulative window exceeds threshold (§3.3)
  if (ctx.sumaVentana + ctx.montoNuevo > umbralAntifrac) {
    return { abort: true, reason: "antifrac" };
  }

  return { abort: false, reason: "none" };
}
