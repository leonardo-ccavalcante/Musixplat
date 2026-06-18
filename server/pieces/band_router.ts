// Piece 05A:A.5.0 — branch on effective_level (consumes A.4.6 min()); LOW⇒autonomous, else⇒escalate. (04 §3)
// Deterministic router. NEVER recomputes least() — consumes the already-stored effective_level.
// Fail-closed: null/undefined/unknown value ⇒ route 'A.7' (escalation = safe human path). §3.7

export type Nivel = "LOW" | "MEDIUM" | "HIGH";

export interface BandRoute {
  route: "A.5" | "A.7";
  levelEfectivo: Nivel;
}

const VALID_NIVELES = new Set<string>(["LOW", "MEDIUM", "HIGH"]);

/** Fallback Nivel for any invalid/missing input — most conservative (escalation). */
const FALLBACK: Nivel = "HIGH";

/**
 * Routes on the already-computed effective_level from A.4.6 min_calculation.
 * LOW ⇒ autonomous-low path (A.5); MEDIUM | HIGH ⇒ escalation path (A.7).
 * null / undefined / garbage ⇒ A.7 (fail-closed to human, never autonomous).
 */
export function routeBand(levelEfectivo: Nivel | null | undefined | string): BandRoute {
  const level: Nivel = VALID_NIVELES.has(levelEfectivo as string)
    ? (levelEfectivo as Nivel)
    : FALLBACK;

  const route: "A.5" | "A.7" = level === "LOW" ? "A.5" : "A.7";

  return { route, levelEfectivo: level };
}
