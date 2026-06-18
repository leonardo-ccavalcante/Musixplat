// Piece 05A:A.2.2 — Grounding gate (4 deterministic boolean checks, fail-closed).
// BR-A1 (04 §7): no response is composed without valid grounding. The 4 checks are: the
// anchor is fresh (freshness <= TTL), the authoritative source actually responded, the
// payload is unambiguous, and it belongs to this tenant. ANY check failing ⇒
// status='no_verificable' and the caller degrades to human (fail-closed, CLAUDE.md §3.7).
// `ttlMs` is supplied by the caller, which reads it BY NAME from Config_Knobs
// (`TTL_baseline_days`); this gate never embeds a literal threshold (CLAUDE.md §3.8).
// Deterministic, no LLM.

export interface GroundingChecks {
  /** age of the grounding anchor, in ms */
  freshnessMs: number;
  /** the authoritative source actually answered */
  sourceResponded: boolean;
  /** the payload is not ambiguous */
  unambiguous: boolean;
  /** the grounding anchor belongs to this tenant (cross-tenant ⇒ fail) */
  tenantMatches: boolean;
}

export type GroundingEstado = "verificado" | "no_verificable";

export interface GroundingResult {
  verified: boolean;
  status: GroundingEstado;
  /** checks that failed — for the decision/security log (observability). Empty when verified. */
  failed: string[];
}

/** Run the 4 grounding checks. Fail-closed: a non-finite/negative ttl or freshness fails. */
export function groundingGate(checks: GroundingChecks, ttlMs: number): GroundingResult {
  // Missing input (whole object absent) ⇒ degrade to conservative state, not throw (§3.7).
  if (!checks) {
    return { verified: false, status: "no_verificable", failed: ["freshness", "source", "ambiguous", "tenant"] };
  }
  const failed: string[] = [];

  const freshOk =
    Number.isFinite(ttlMs) &&
    ttlMs > 0 &&
    Number.isFinite(checks.freshnessMs) &&
    checks.freshnessMs >= 0 &&
    checks.freshnessMs <= ttlMs;
  if (!freshOk) failed.push("freshness");
  if (!checks.sourceResponded) failed.push("source");
  if (!checks.unambiguous) failed.push("ambiguous");
  if (!checks.tenantMatches) failed.push("tenant");

  const verified = failed.length === 0;
  return { verified, status: verified ? "verificado" : "no_verificable", failed };
}
