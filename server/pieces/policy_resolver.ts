// Piece 05A:A.2.3 — resolve tier×intent policy at the vigente version + seal.
// Pure, fail-closed, anti-mezcla (§3.5 / §3.7). Caller fetches candidates from DB;
// this function SELECTS — it never invents a policy or emits a number. (04 §7)
// Deterministic; no LLM; zero `any`.

export type Nivel = "BAJA" | "MEDIA" | "ALTA";

export interface PolicyRow {
  policy_id: string;
  tier_id: string;
  policy_version: string;
  teto_tier: Nivel;
  permitido_hoy: Record<string, unknown>;
}

export interface PolicyResolution {
  sealed: boolean;
  policy_version: string | null;
  tetoTier: Nivel | null;
  permitidoHoy: Record<string, unknown> | null;
  reason: "ok" | "none" | "stale" | "ambiguous";
}

const CLOSED: Omit<PolicyResolution, "reason"> = {
  sealed: false,
  policy_version: null,
  tetoTier: null,
  permitidoHoy: null,
};

/**
 * From `candidates` (fetched by caller for this `tierId`), find exactly one row
 * where `policy_version === vigenteVersion`. Anti-mezcla: stale rows are never sealed.
 * Fail-closed: returns `sealed=false` when the result is none / stale / ambiguous.
 */
export function resolvePolicy(
  candidates: PolicyRow[] | null | undefined,
  tierId: string,
  vigenteVersion: string,
): PolicyResolution {
  // Missing / empty input ⇒ fail-closed (§3.7).
  if (!candidates || candidates.length === 0) {
    return { ...CLOSED, reason: "none" };
  }

  // Filter to the requested tier.
  const forTier = candidates.filter((r) => r.tier_id === tierId);
  if (forTier.length === 0) {
    return { ...CLOSED, reason: "none" };
  }

  // Anti-mezcla: only rows at the vigente version may be sealed (§3.5).
  const vigente = forTier.filter((r) => r.policy_version === vigenteVersion);

  if (vigente.length === 0) {
    // Tier rows exist but none at the vigente version ⇒ stale.
    return { ...CLOSED, reason: "stale" };
  }

  if (vigente.length > 1) {
    // More than one row at the same tier + version ⇒ ambiguous; refuse to seal.
    return { ...CLOSED, reason: "ambiguous" };
  }

  // Exactly one vigente row ⇒ seal.
  const row = vigente[0];
  if (!row) return { ...CLOSED, reason: "none" };
  return {
    sealed: true,
    policy_version: row.policy_version,
    tetoTier: row.teto_tier,
    permitidoHoy: row.permitido_hoy,
    reason: "ok",
  };
}
