import { PROV_META } from "./ProvenanceBadge";

// Decodes the [V]/[C]/[I] provenance codes in plain language, in-context — so a reader never has to
// know the acronyms by default (CLAUDE.md §3.10 keeps provenance per field; this makes it legible).
// One muted line: a colored dot (redundant with the word) + "code — word (gloss)".
const ITEMS: Array<{ code: keyof typeof PROV_META | string; gloss: string }> = [
  { code: "[V]", gloss: "from raw data" },
  { code: "[I]", gloss: "derived" },
  { code: "[C]", gloss: "an estimate" },
];

export function ProvenanceLegend({ className }: { className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mxm-content-tertiary ${className ?? ""}`}>
      <span className="text-mxm-content-secondary">How to read confidence:</span>
      {ITEMS.map(({ code, gloss }) => {
        const m = PROV_META[code];
        if (!m) return null;
        return (
          <span key={code} className="inline-flex items-center gap-1">
            <span aria-hidden="true" className={m.cls}>
              ●
            </span>
            <span className="text-mxm-content-secondary">{code}</span>
            <span>
              {m.word} ({gloss})
            </span>
          </span>
        );
      })}
    </p>
  );
}
