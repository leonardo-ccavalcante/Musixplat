/**
 * Pure, deterministic text chunker for the Knowledge Base / RAG pipeline (P06).
 *
 * Splits `text` into fixed-`size` windows that advance by `size - overlap`, so the
 * tail of each chunk reappears at the head of the next (sliding-window overlap that
 * keeps retrieval context across boundaries). Order is preserved. No external deps.
 *
 * `size`/`overlap` are supplied by the caller, which reads them by NAME from the
 * Config_Knobs catalog (CLAUDE.md §3.8) — never hard-coded here.
 */
export function chunk(text: string, opts: { size: number; overlap: number }): string[] {
  const { size, overlap } = opts;
  // Fail loud on an invalid window. A missing Config_Knobs row is read as NaN (§3.8); without this
  // guard `size = NaN` slips through (`len <= NaN` is false, `step` becomes NaN) and the function
  // emits a single empty-string chunk that fails opaquely downstream at the embeddings API. Surface
  // the real cause here so a missing kb_chunk_size/kb_chunk_overlap knob is diagnosable (§3.7).
  if (!Number.isFinite(size) || size <= 0)
    throw new RangeError(`chunk: size must be a positive number (got ${size}) — check the kb_chunk_size knob`);
  if (!Number.isFinite(overlap) || overlap < 0)
    throw new RangeError(`chunk: overlap must be a non-negative number (got ${overlap}) — check the kb_chunk_overlap knob`);
  if (text.length <= size) return [text];
  const step = Math.max(1, size - overlap);
  const out: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    out.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
  }
  return out;
}
