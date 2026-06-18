import type { Criticidad } from "../../shared/contracts_05b.js";
import { CRITICIDAD_RANK } from "../../shared/contracts_05b.js";

// EPIC-B1/B5 priorización (pure, deterministic, no LLM — CLAUDE.md §3.6). Pieces:
//   B.1.4       — dispatchPriority: f(criticidad, impacto[C], agile)
//   US-B1.2.1   — tieBreak: fixed auditable order criticidad > impacto > agile
//   US-B5.2.1   — routeAhoraFila: riesgo × impacto × costo ⇒ ahora|fila
// BR-B11: indeterminado ⇒ conservative (never deprioritize a potentially grave problem).
// BR-B10: a missing/ambiguous lower key ⇒ 0 (conservative), never an optimistic guess.

export interface PriorityInput {
  criticidad: Criticidad | null;
  impacto: number | null;
  agile: number | null;
}

// Conservative fallback: a null criticidad is treated as the MAX rank (grave) so a
// potentially-grave problem is never sent to the back of the queue (BR-B11).
const MAX_CRITICIDAD_RANK = Math.max(...Object.values(CRITICIDAD_RANK));

/** Rank for sorting/scoring; null ⇒ grave (max) per BR-B11 fail-closed. */
function rankOf(criticidad: Criticidad | null): number {
  return criticidad == null ? MAX_CRITICIDAD_RANK : CRITICIDAD_RANK[criticidad];
}

/** Numeric key; null / non-finite ⇒ 0 (BR-B10 conservative, never optimistic). */
function num(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * B.1.4 — deterministic dispatch-priority score (HIGHER = attend first).
 * criticidad DOMINATES, then impacto, then agile. The score packs the three keys into
 * disjoint magnitude bands (criticidad in the integer block, impacto/agile mapped into a
 * bounded fraction below it) so a higher criticidad always outranks any impacto/agile —
 * mirroring the lexicographic order of `tieBreak`. impacto/agile null ⇒ 0 (BR-B10).
 * criticidad null ⇒ grave/max (BR-B11): a potentially-grave problem is never deprioritized.
 */
export function dispatchPriority(input: PriorityInput): number {
  const rank = rankOf(input.criticidad);
  // Map impacto/agile (possibly negative/unbounded) into (0,1) via a monotonic squash so
  // they tie-break WITHIN a criticidad band but can NEVER cross into the next rank: the two
  // fractions are weighted to sum strictly below 1, keeping `rank` the dominant integer band.
  const squash = (x: number): number => 0.5 + Math.atan(x) / Math.PI; // strictly increasing, ∈ (0,1)
  const impactoFrac = squash(num(input.impacto)); // ∈ (0,1) — stronger lower key
  const agileFrac = squash(num(input.agile)); // ∈ (0,1) — weakest key
  // impacto fills [0, 0.999), agile the residual [0, 0.000999): combined fraction ∈ (0,1).
  return rank + impactoFrac * 0.999 + agileFrac * 0.000999;
}

/**
 * US-B1.2.1 — comparator for Array.sort: FIXED auditable order criticidad > impacto > agile,
 * all DESCENDING (higher attends first). Deterministic + stable: returns 0 only when all three
 * keys are equal, so a stable sort preserves prior order. Mirrors `dispatchPriority`'s ordering.
 */
export function tieBreak(a: PriorityInput, b: PriorityInput): number {
  const byCriticidad = rankOf(b.criticidad) - rankOf(a.criticidad);
  if (byCriticidad !== 0) return byCriticidad;
  const byImpacto = num(b.impacto) - num(a.impacto);
  if (byImpacto !== 0) return byImpacto;
  return num(b.agile) - num(a.agile);
}

/**
 * US-B5.2.1 — route 'ahora' vs 'fila' from expected value vs cost. 'ahora' only when the
 * value justifies acting now: riesgo × impacto ≥ costo (net-positive). No magic literal — the
 * boundary IS the supplied costo. Fail-closed: any missing/garbage input ⇒ 'fila' (BR-B11:
 * do not pull a case forward on an optimistic guess).
 */
export function routeAhoraFila(input: { riesgo: number; impacto: number; costo: number }): "ahora" | "fila" {
  const { riesgo, costo } = input;
  const impacto = input.impacto;
  if (![riesgo, impacto, costo].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return "fila"; // fail-closed: cannot evaluate net value ⇒ queue, never act now.
  }
  return riesgo * impacto >= costo ? "ahora" : "fila";
}
