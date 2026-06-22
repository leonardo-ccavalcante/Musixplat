import type { ReactNode } from "react";

// Collapsible group built on native <details>/<summary> — free WCAG a11y (keyboard toggle, focus,
// no JS state). Used to fold long flat lists (deltas by cause, tickets by intent) into one
// open-one-at-a-time group so a human reads a section instead of scrolling a wall. Color is never
// the sole carrier: the chevron rotates (group-open) AND the count is a text pill.
//
// Two modes:
//  - uncontrolled (default): pass `defaultOpen`; native <details> owns the state (free a11y).
//  - controlled: pass `open` + `onOpenChange`; the parent owns the state so a page-level "Expand all /
//    Collapse all" can drive every row at once. `onToggle` only reports a *changed* state, so there is no
//    re-entrant loop. `trailing` lets a caller render right-aligned status (a level + badge) before the
//    optional count pill.
export function Disclosure({
  title,
  count,
  trailing,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
}: {
  title: ReactNode;
  count?: number;
  trailing?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const controlled = open !== undefined;
  return (
    <details
      open={controlled ? open : defaultOpen}
      onToggle={
        controlled
          ? (e) => {
              const next = e.currentTarget.open;
              if (next !== open) onOpenChange?.(next);
            }
          : undefined
      }
      className="rounded-mxm border border-mxm-border"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-mxm px-3 py-2.5 text-sm font-medium text-mxm-content hover:bg-mxm-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand [&::-webkit-details-marker]:hidden">
        {/* rotate via the OWN <details open> only (direct-child selector) — nesting-safe, unlike
            group-open which matches any .group ancestor and would rotate inner chevrons wrongly */}
        <span
          aria-hidden="true"
          className="text-mxm-content-tertiary transition-transform duration-150 [details[open]>summary>&]:rotate-90"
        >
          ▸
        </span>
        <span className="flex-1 truncate">{title}</span>
        {trailing != null && <span className="shrink-0">{trailing}</span>}
        {count != null && (
          <span className="tabnum shrink-0 rounded-full bg-mxm-bg-secondary px-2 py-0.5 text-xs text-mxm-content-secondary">
            {count}
          </span>
        )}
      </summary>
      <div className="border-t border-mxm-border px-3 py-2">{children}</div>
    </details>
  );
}
