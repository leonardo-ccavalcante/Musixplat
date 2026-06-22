import type { ReactNode } from "react";

// Shared header for an Observatory tier: a section title, an optional count pill (so the operator knows
// how many rows before expanding — an awareness aid), and a quiet right-aligned action slot. The count
// pill reuses the Disclosure idiom (text pill, not color-only).
export function TierHeader({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-medium text-mxm-content">
        {title}
        {count != null && (
          <span className="tabnum rounded-full bg-mxm-bg-secondary px-2 py-0.5 text-xs font-normal text-mxm-content-secondary">
            {count}
          </span>
        )}
      </h2>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
