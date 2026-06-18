// Piece 05A:A.6.2 — 2nd-pass transcript PII redaction (reuses A.1.2) + retention gate.
// Pure, fail-closed. Invariants: reuse-before-create (§4); fail-closed on residual (§3.7);
// retention threshold by-name param (§3.8); deterministic — no Date/now (04 §7).
import { redactPII } from "./pii.js";

export interface TranscriptPIIResult {
  texto: string;
  safeToPersist: boolean;
  tipos: string[];
  retainUntilDays: number | null;
}

/** Validate the caller-supplied retention window (read by-name from Config_Perillas). */
function validRetention(days: number): number | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

/**
 * Second-pass PII redaction over the full transcript + retention gate.
 * Reuses A.1.2 redactPII — no regex duplication.
 * Fail-closed: null/undefined input or residual PII ⇒ safeToPersist:false.
 */
export function redactTranscript(
  transcript: string | null | undefined,
  retencionPIIDias: number
): TranscriptPIIResult {
  // Fail-closed: null/undefined input — do NOT persist.
  if (transcript == null) {
    return { texto: "", safeToPersist: false, tipos: [], retainUntilDays: null };
  }

  const retainUntilDays = validRetention(retencionPIIDias);

  // Delegate fully to the A.1.2 redactor (reuse-before-create).
  const { texto, residualPII, tipos } = redactPII(transcript);

  // Fail-closed: residual PII survives ⇒ caller must NOT persist raw.
  const safeToPersist = !residualPII;

  return { texto, safeToPersist, tipos, retainUntilDays };
}
