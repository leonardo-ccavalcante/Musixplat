// Piece 05A:A.5.0 — branch on nivel_efectivo (consumes A.4.6 min()); BAJA⇒autónomo, else⇒escala. (04 §3)
// Deterministic router. NEVER recomputes least() — consumes the already-stored nivel_efectivo.
// Fail-closed: null/undefined/unknown value ⇒ route 'A.7' (escalation = safe human path). §3.7

export type Nivel = "BAJA" | "MEDIA" | "ALTA";

export interface BandRoute {
  route: "A.5" | "A.7";
  nivelEfectivo: Nivel;
}

const VALID_NIVELES = new Set<string>(["BAJA", "MEDIA", "ALTA"]);

/** Fallback Nivel for any invalid/missing input — most conservative (escalation). */
const FALLBACK: Nivel = "ALTA";

/**
 * Routes on the already-computed nivel_efectivo from A.4.6 min_calculo.
 * BAJA ⇒ autonomous-low path (A.5); MEDIA | ALTA ⇒ escalation path (A.7).
 * null / undefined / garbage ⇒ A.7 (fail-closed to human, never autonomous).
 */
export function routeBand(nivelEfectivo: Nivel | null | undefined | string): BandRoute {
  const nivel: Nivel = VALID_NIVELES.has(nivelEfectivo as string)
    ? (nivelEfectivo as Nivel)
    : FALLBACK;

  const route: "A.5" | "A.7" = nivel === "BAJA" ? "A.5" : "A.7";

  return { route, nivelEfectivo: nivel };
}
