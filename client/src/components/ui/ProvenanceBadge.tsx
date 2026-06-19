import type { ProvTag } from "@shared/contracts";

// Provenance per field (CLAUDE.md §3.10): [V] measured · [I] inferred · [C] projection/config.
// Color is NEVER the sole carrier — the code (or the plain WORD when showLabel) IS the text, with a
// title for the meaning. No prov ⇒ render nothing (a field with no provenance is not rendered/
// exported, never faked). PROV_META is exported so a legend can decode the same codes in one place.
export const PROV_META: Record<string, { cls: string; word: string; title: string }> = {
  "[V]": { cls: "text-mxm-green", word: "measured", title: "Measured — computed from raw data ([V])" },
  "[I]": { cls: "text-mxm-amber", word: "inferred", title: "Inferred — derived, not measured directly ([I])" },
  "[C]": { cls: "text-mxm-content-tertiary", word: "projected", title: "Projected — an estimate, never ascends to measured ([C])" },
};

export function ProvenanceBadge({
  prov,
  className,
  showLabel,
}: {
  prov?: ProvTag | null;
  className?: string;
  // showLabel renders the plain word ("measured") instead of the bracketed code — used where a
  // non-technical reader meets provenance for the first time (the cause "Why", the cohort modal).
  showLabel?: boolean;
}) {
  if (!prov) return null;
  const m = PROV_META[prov] ?? { cls: "text-mxm-content-tertiary", word: "provenance", title: "provenance" };
  return (
    <span
      className={`tabnum align-middle font-medium ${showLabel ? "text-[11px]" : "text-[10px]"} ${m.cls} ${className ?? ""}`}
      title={m.title}
      aria-label={`provenance ${prov}`}
    >
      {showLabel ? m.word : prov}
    </span>
  );
}
