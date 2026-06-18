// Piece 05A:A.4.7 — Compute queue_priority from a demand-spike signal.
// CRITICAL: NEVER touches autonomy tier / effective_level — priority and tier are isolated concerns.
// Fail-closed: missing or garbage input ⇒ 'NORMAL' (non-disruptive conservative default, §3.7).
// Threshold (`threshold`) is always supplied by the caller, which reads it by-name from
// Config_Knobs; this function embeds no literal threshold (CLAUDE.md §3.8).
// Deterministic, no LLM. (04 §3)

export interface SpikeSignal {
  spike?: boolean;
  intensity?: number;
}

export interface QueuePriority {
  queue_priority: "HIGH" | "NORMAL";
}

/**
 * Returns queue priority from a spike signal.
 * - Boolean path: spike:true ⇒ HIGH; spike:false ⇒ NORMAL.
 * - Numeric path: intensity >= threshold ⇒ HIGH (threshold MUST be a finite positive number;
 *   if absent or invalid, falls through to NORMAL — fail-closed).
 * - Any missing / garbage input ⇒ NORMAL (fail-closed).
 * Output: { queue_priority } ONLY — no level/tier fields, ever.
 */
export function queuePriority(
  signal: SpikeSignal | null | undefined,
  threshold?: number,
): QueuePriority {
  // Fail-closed: null / undefined signal ⇒ NORMAL.
  if (signal == null) return { queue_priority: "NORMAL" };

  // Boolean spike takes precedence when explicitly provided.
  if (typeof signal.spike === "boolean") {
    return { queue_priority: signal.spike ? "HIGH" : "NORMAL" };
  }

  // Numeric intensity path — capture the narrowed values so TS proves them non-null
  // (no `!` assertion, no eslint-disable). Threshold MUST be finite + positive (fail-closed).
  const thresholdNum =
    typeof threshold === "number" && Number.isFinite(threshold) && threshold > 0 ? threshold : null;
  const intensityNum =
    typeof signal.intensity === "number" && Number.isFinite(signal.intensity)
      ? signal.intensity
      : null;

  if (thresholdNum !== null && intensityNum !== null) {
    return { queue_priority: intensityNum >= thresholdNum ? "HIGH" : "NORMAL" };
  }

  // Fallthrough: no usable signal ⇒ conservative default (fail-closed).
  return { queue_priority: "NORMAL" };
}
