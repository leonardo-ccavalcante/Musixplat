import type { ReactNode } from "react";

// Collapsible group built on native <details>/<summary> — free WCAG a11y (keyboard toggle, focus,
// no JS state). Used to fold long flat lists (deltas by cause, tickets by intent) into one
// open-one-at-a-time group so a human reads a section instead of scrolling a wall. Color is never
// the sole carrier: the chevron rotates (group-open) AND the count is a text pill.
export function Disclosure({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-mxm border border-mxm-border">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-mxm px-3 py-2.5 text-sm font-medium text-mxm-content hover:bg-mxm-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="text-mxm-content-tertiary transition-transform duration-150 group-open:rotate-90"
        >
          ▸
        </span>
        <span className="flex-1 truncate">{title}</span>
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
