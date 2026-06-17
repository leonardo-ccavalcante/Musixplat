import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ children, className, ariaLabel }: { children: ReactNode; className?: string; ariaLabel?: string }) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "rounded-mxm border border-mxm-border bg-mxm-bg-elevated p-[clamp(0.75rem,1.5vw,1.25rem)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-mxm-content">{children}</h2>;
}
