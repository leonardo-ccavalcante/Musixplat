import type { ReactNode } from "react";

// Explicit empty/loading/error states — never a green-fake empty (§14 / CLAUDE.md §4).
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="py-6 text-center text-sm text-mxm-content-tertiary">
      {children}
    </p>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" aria-live="polite" className="py-6 text-center text-sm text-mxm-content-secondary">
      {label}
    </p>
  );
}

export function ErrorState({ label = "Failed to load" }: { label?: string }) {
  return (
    <p role="alert" className="py-6 text-center text-sm text-mxm-red">
      {label}
    </p>
  );
}
