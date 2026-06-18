// Piece 05A:A.4.7 — Compute prioridad_cola from a demand-spike signal.
// CRITICAL: NEVER touches autonomy tier / nivel_efectivo — priority and tier are isolated concerns.
// Fail-closed: missing or garbage input ⇒ 'NORMAL' (non-disruptive conservative default, §3.7).
// Threshold (`umbral`) is always supplied by the caller, which reads it by-name from
// Config_Perillas; this function embeds no literal threshold (CLAUDE.md §3.8).
// Deterministic, no LLM. (04 §3)

export interface SpikeSignal {
  spike?: boolean;
  intensidad?: number;
}

export interface QueuePriority {
  prioridad_cola: "ALTA" | "NORMAL";
}

/**
 * Returns queue priority from a spike signal.
 * - Boolean path: spike:true ⇒ ALTA; spike:false ⇒ NORMAL.
 * - Numeric path: intensidad >= umbral ⇒ ALTA (umbral MUST be a finite positive number;
 *   if absent or invalid, falls through to NORMAL — fail-closed).
 * - Any missing / garbage input ⇒ NORMAL (fail-closed).
 * Output: { prioridad_cola } ONLY — no nivel/tier fields, ever.
 */
export function queuePriority(
  signal: SpikeSignal | null | undefined,
  umbral?: number,
): QueuePriority {
  // Fail-closed: null / undefined signal ⇒ NORMAL.
  if (signal == null) return { prioridad_cola: "NORMAL" };

  // Boolean spike takes precedence when explicitly provided.
  if (typeof signal.spike === "boolean") {
    return { prioridad_cola: signal.spike ? "ALTA" : "NORMAL" };
  }

  // Numeric intensity path — capture the narrowed values so TS proves them non-null
  // (no `!` assertion, no eslint-disable). Threshold MUST be finite + positive (fail-closed).
  const umbralNum =
    typeof umbral === "number" && Number.isFinite(umbral) && umbral > 0 ? umbral : null;
  const intensidadNum =
    typeof signal.intensidad === "number" && Number.isFinite(signal.intensidad)
      ? signal.intensidad
      : null;

  if (umbralNum !== null && intensidadNum !== null) {
    return { prioridad_cola: intensidadNum >= umbralNum ? "ALTA" : "NORMAL" };
  }

  // Fallthrough: no usable signal ⇒ conservative default (fail-closed).
  return { prioridad_cola: "NORMAL" };
}
