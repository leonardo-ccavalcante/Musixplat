// Piece 05A:A.4.1 — normalize the 3 min() arms; missing/invalid arm ⇒ LOW (most conservative).
// Feeds A.4.6's least() engine (gov.compute_effective_level) — does NOT compute min, only sanitizes.
// Fail-closed (CLAUDE.md §3.7): null | undefined | non-enum string ⇒ LOW.
// Deterministic, no LLM, no I/O. (04 §7)

export type Level = "LOW" | "MEDIUM" | "HIGH";

export interface Arms {
  nbaRequest: unknown;
  releasedEvals: unknown;
  tierCap: unknown;
}

export interface NormalizedArms {
  nbaRequest: Level;
  releasedEvals: Level;
  tierCap: Level;
}

const VALID: ReadonlySet<string> = new Set<Level>(["LOW", "MEDIUM", "HIGH"]);
const CONSERVATIVE: Level = "LOW";

/** Coerce an unknown value to a valid Level; anything that is not a member of the enum ⇒ LOW. */
function coerce(v: unknown): Level {
  return typeof v === "string" && VALID.has(v) ? (v as Level) : CONSERVATIVE;
}

/**
 * Normalize the 3 autonomy arms into a guaranteed-valid NormalizedArms triple.
 * A null/undefined/invalid input object or any invalid arm ⇒ LOW for that arm (fail-closed).
 * Never mutates the input.
 */
export function normalizeArms(a: Arms | null | undefined): NormalizedArms {
  if (a == null) {
    return { nbaRequest: CONSERVATIVE, releasedEvals: CONSERVATIVE, tierCap: CONSERVATIVE };
  }
  return {
    nbaRequest: coerce(a.nbaRequest),
    releasedEvals: coerce(a.releasedEvals),
    tierCap: coerce(a.tierCap),
  };
}
