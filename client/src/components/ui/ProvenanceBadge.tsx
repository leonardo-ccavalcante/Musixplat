import type { ProvTag } from "@shared/contracts";

// Provenance per field (CLAUDE.md §3.10): [V] measured · [I] inferred · [C] projection/config.
// Color is NEVER the sole carrier — the bracketed code IS the text, with a title for the meaning.
// No prov ⇒ render nothing (a field with no provenance is not rendered/exported, never faked).
const PROV_META: Record<string, { cls: string; title: string }> = {
  "[V]": { cls: "text-mxm-green", title: "Verified — measured from raw data" },
  "[I]": { cls: "text-mxm-amber", title: "Inferred — derived, not measured directly" },
  "[C]": { cls: "text-mxm-content-tertiary", title: "Computed/projection — never ascends to [V]" },
};

export function ProvenanceBadge({ prov, className }: { prov?: ProvTag | null; className?: string }) {
  if (!prov) return null;
  const m = PROV_META[prov] ?? { cls: "text-mxm-content-tertiary", title: "provenance" };
  return (
    <span
      className={`tabnum align-middle text-[10px] font-medium ${m.cls} ${className ?? ""}`}
      title={m.title}
      aria-label={`provenance ${prov}`}
    >
      {prov}
    </span>
  );
}
