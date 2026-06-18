// Piece 05A:A.2.3 — resolve tier×intent policy at the current version + seal.
// Pure, fail-closed, anti-mix (§3.5 / §3.7). Caller fetches candidates from DB;
// this function SELECTS — it never invents a policy or emits a number. (04 §7)
// Deterministic; no LLM; zero `any`.

export type Nivel = "LOW" | "MEDIUM" | "HIGH";

export interface PolicyRow {
  policy_id: string;
  tier_id: string;
  policy_version: string;
  tier_cap: Nivel;
  allowed_today: Record<string, unknown>;
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
 * where `policy_version === vigenteVersion`. Anti-mix: stale rows are never sealed.
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

  // Anti-mix: only rows at the current version may be sealed (§3.5).
  const vigente = forTier.filter((r) => r.policy_version === vigenteVersion);

  if (vigente.length === 0) {
    // Tier rows exist but none at the current version ⇒ stale.
    return { ...CLOSED, reason: "stale" };
  }

  if (vigente.length > 1) {
    // More than one row at the same tier + version ⇒ ambiguous; refuse to seal.
    return { ...CLOSED, reason: "ambiguous" };
  }

  // Exactly one current row ⇒ seal.
  const row = vigente[0];
  if (!row) return { ...CLOSED, reason: "none" };
  return {
    sealed: true,
    policy_version: row.policy_version,
    tetoTier: row.tier_cap,
    permitidoHoy: row.allowed_today,
    reason: "ok",
  };
}
