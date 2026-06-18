import type { Criticality } from "../../shared/contracts_05b.js";
import { CRITICALITY_RANK } from "../../shared/contracts_05b.js";

// EPIC-B1/B5 prioritization (pure, deterministic, no LLM — CLAUDE.md §3.6). Pieces:
//   B.1.4       — dispatchPriority: f(criticality, impact[C], agile)
//   US-B1.2.1   — tieBreak: fixed auditable order criticality > impact > agile
//   US-B5.2.1   — routeNowQueue: risk × impact × cost ⇒ now|queue
// BR-B11: indeterminate ⇒ conservative (never deprioritize a potentially critical problem).
// BR-B10: a missing/ambiguous lower key ⇒ 0 (conservative), never an optimistic guess.

export interface PriorityInput {
  criticality: Criticality | null;
  impact: number | null;
  agile: number | null;
}

// Conservative fallback: a null criticality is treated as the MAX rank (critical) so a
// potentially-critical problem is never sent to the back of the queue (BR-B11).
const MAX_CRITICALITY_RANK = Math.max(...Object.values(CRITICALITY_RANK));

/** Rank for sorting/scoring; null ⇒ critical (max) per BR-B11 fail-closed. */
function rankOf(criticality: Criticality | null): number {
  return criticality == null ? MAX_CRITICALITY_RANK : CRITICALITY_RANK[criticality];
}

/** Numeric key; null / non-finite ⇒ 0 (BR-B10 conservative, never optimistic). */
function num(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * B.1.4 — deterministic dispatch-priority score (HIGHER = attend first).
 * criticality DOMINATES, then impact, then agile. The score packs the three keys into
 * disjoint magnitude bands (criticality in the integer block, impact/agile mapped into a
 * bounded fraction below it) so a higher criticality always outranks any impact/agile —
 * mirroring the lexicographic order of `tieBreak`. impact/agile null ⇒ 0 (BR-B10).
 * criticality null ⇒ critical/max (BR-B11): a potentially-critical problem is never deprioritized.
 */
export function dispatchPriority(input: PriorityInput): number {
  const rank = rankOf(input.criticality);
  // Map impact/agile (possibly negative/unbounded) into (0,1) via a monotonic squash so
  // they tie-break WITHIN a criticality band but can NEVER cross into the next rank: the two
  // fractions are weighted to sum strictly below 1, keeping `rank` the dominant integer band.
  const squash = (x: number): number => 0.5 + Math.atan(x) / Math.PI; // strictly increasing, ∈ (0,1)
  const impactFrac = squash(num(input.impact)); // ∈ (0,1) — stronger lower key
  const agileFrac = squash(num(input.agile)); // ∈ (0,1) — weakest key
  // impact fills [0, 0.999), agile the residual [0, 0.000999): combined fraction ∈ (0,1).
  return rank + impactFrac * 0.999 + agileFrac * 0.000999;
}

/**
 * US-B1.2.1 — comparator for Array.sort: FIXED auditable order criticality > impact > agile,
 * all DESCENDING (higher attends first). Deterministic + stable: returns 0 only when all three
 * keys are equal, so a stable sort preserves prior order. Mirrors `dispatchPriority`'s ordering.
 */
export function tieBreak(a: PriorityInput, b: PriorityInput): number {
  const byCriticality = rankOf(b.criticality) - rankOf(a.criticality);
  if (byCriticality !== 0) return byCriticality;
  const byImpact = num(b.impact) - num(a.impact);
  if (byImpact !== 0) return byImpact;
  return num(b.agile) - num(a.agile);
}

/**
 * US-B5.2.1 — route 'now' vs 'queue' from expected value vs cost. 'now' only when the
 * value justifies acting now: risk × impact ≥ cost (net-positive). No magic literal — the
 * boundary IS the supplied cost. Fail-closed: any missing/garbage input ⇒ 'queue' (BR-B11:
 * do not pull a case forward on an optimistic guess).
 */
export function routeNowQueue(input: { risk: number; impact: number; cost: number }): "now" | "queue" {
  const { risk, cost } = input;
  const impact = input.impact;
  if (![risk, impact, cost].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return "queue"; // fail-closed: cannot evaluate net value ⇒ queue, never act now.
  }
  return risk * impact >= cost ? "now" : "queue";
}
