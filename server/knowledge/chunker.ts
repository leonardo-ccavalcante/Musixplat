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
  if (text.length <= size) return [text];
  const step = Math.max(1, size - overlap);
  const out: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    out.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
  }
  return out;
}
