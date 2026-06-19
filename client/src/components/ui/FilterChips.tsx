import { cn } from "@/lib/utils";

export type ChipOption = { key: string; label: string; count?: number };

// Reusable multi-select filter chip bar — deltas by cause, matrix by status, tickets by intent.
// Empty `active` = show everything (the "All" chip is pressed). Each chip is a real toggle button
// carrying aria-pressed, so selection is exposed to AT (not color-only): brand outline is the
// redundant visual. Stateless — the parent owns the Set and the filtering.
export function FilterChips({
  options,
  active,
  onToggle,
  onClear,
  ariaLabel,
}: {
  options: ChipOption[];
  active: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
  ariaLabel: string;
}) {
  const cls = (on: boolean) =>
    cn(
      "tabnum rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand",
      on
        ? "border-mxm-brand text-mxm-brand"
        : "border-mxm-border text-mxm-content-secondary hover:text-mxm-content",
    );
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      <button type="button" onClick={onClear} aria-pressed={active.size === 0} className={cls(active.size === 0)}>
        All
      </button>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onToggle(o.key)}
          aria-pressed={active.has(o.key)}
          className={cls(active.has(o.key))}
        >
          {o.label}
          {o.count != null ? ` ${o.count}` : ""}
        </button>
      ))}
    </div>
  );
}
