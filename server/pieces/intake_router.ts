// Piece 05A:A.1.3 — deterministic has-image branch (A.1.4 vs A.1.5). NO LLM, deterministic. (04 §3)
//
// Conservative-default rationale: when input is malformed or ambiguous, this routes to A.1.5
// (injection-classifier), NOT to A.1.4 (image extractor). Routing to A.1.4 on bad input would
// trigger heavier VLM/OCR work on nothing, and a false negative (missing an image) is handled
// downstream by A.1.5's fallback. The safe direction is: detect image ONLY when unambiguously
// present (mime starts 'image/' OR kind === 'image'|'imagen'); anything else ⇒ A.1.5.
//
// [ASSUMPTION — why: spec says "fail-closed" but doesn't state which branch is conservative.
// Chosen A.1.5 as conservative because: (1) unnecessary VLM invocation on non-images wastes
// resources and can produce garbage output; (2) A.1.5 can still handle image-less turns correctly;
// (3) CLAUDE.md §3.7 fail-closed = degrade to conservative, not heavier. Human can override.]

export interface IntakeTurno {
  adjuntos?: Array<{ kind?: string; mime?: string }>;
  [k: string]: unknown;
}

export interface IntakeRoute {
  route: "A.1.4" | "A.1.5";
  hasImage: boolean;
}

/** Returns true iff the adjunto is unambiguously an image. Strict: unknown ⇒ false. */
function isImageAdjunto(adjunto: { kind?: string; mime?: string }): boolean {
  // mime check: must start with 'image/' (case-insensitive)
  if (typeof adjunto.mime === "string" && adjunto.mime.toLowerCase().startsWith("image/")) {
    return true;
  }
  // kind check: 'image' (EN) or 'imagen' (ES) — exact match, case-insensitive
  if (typeof adjunto.kind === "string") {
    const k = adjunto.kind.toLowerCase();
    if (k === "image" || k === "imagen") return true;
  }
  return false;
}

/** Route a conversationtion turn to image-extraction (A.1.4) or injection-classifier (A.1.5).
 *  Deterministic, no LLM. Missing/malformed input ⇒ A.1.5 (fail-closed). (04 §3) */
export function routeIntake(turno: IntakeTurno | null | undefined): IntakeRoute {
  // Fail-closed: null/undefined input ⇒ no image ⇒ A.1.5
  if (turno == null) {
    return { route: "A.1.5", hasImage: false };
  }

  const adjuntos = turno.adjuntos;

  // No adjuntos field or empty array ⇒ A.1.5
  if (!Array.isArray(adjuntos) || adjuntos.length === 0) {
    return { route: "A.1.5", hasImage: false };
  }

  // Scan for ANY unambiguous image — one is enough to route to A.1.4
  const hasImage = adjuntos.some(isImageAdjunto);

  return hasImage
    ? { route: "A.1.4", hasImage: true }
    : { route: "A.1.5", hasImage: false };
}
