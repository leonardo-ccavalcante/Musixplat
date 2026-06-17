import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>(
  function Button({ className, variant = "primary", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-mxm px-3 py-2 text-sm font-medium",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mxm-brand",
          "disabled:cursor-not-allowed disabled:opacity-50",
          variant === "primary" && "bg-mxm-brand text-white",
          variant === "ghost" && "border border-mxm-border bg-transparent text-mxm-content",
          className,
        )}
        {...props}
      />
    );
  },
);
