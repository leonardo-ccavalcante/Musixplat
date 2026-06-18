// Piece 05A:A.4.1 — normalize the 3 min() arms; missing/invalid arm ⇒ LOW (most conservative).
// Feeds A.4.6's least() motor (gov.compute_effective_level) — does NOT compute min, only sanitizes.
// Fail-closed (CLAUDE.md §3.7): null | undefined | non-enum string ⇒ LOW.
// Deterministic, no LLM, no I/O. (04 §7)

export type Nivel = "LOW" | "MEDIUM" | "HIGH";

export interface Arms {
  pedidoNBA: unknown;
  liberadoEvals: unknown;
  tetoTier: unknown;
}

export interface NormalizedArms {
  pedidoNBA: Nivel;
  liberadoEvals: Nivel;
  tetoTier: Nivel;
}

const VALID: ReadonlySet<string> = new Set<Nivel>(["LOW", "MEDIUM", "HIGH"]);
const CONSERVATIVE: Nivel = "LOW";

/** Coerce an unknown value to a valid Nivel; anything that is not a member of the enum ⇒ LOW. */
function coerce(v: unknown): Nivel {
  return typeof v === "string" && VALID.has(v) ? (v as Nivel) : CONSERVATIVE;
}

/**
 * Normalize the 3 autonomy arms into a guaranteed-valid NormalizedArms triple.
 * A null/undefined/invalid input object or any invalid arm ⇒ LOW for that arm (fail-closed).
 * Never mutates the input.
 */
export function normalizeArms(a: Arms | null | undefined): NormalizedArms {
  if (a == null) {
    return { pedidoNBA: CONSERVATIVE, liberadoEvals: CONSERVATIVE, tetoTier: CONSERVATIVE };
  }
  return {
    pedidoNBA: coerce(a.pedidoNBA),
    liberadoEvals: coerce(a.liberadoEvals),
    tetoTier: coerce(a.tetoTier),
  };
}
