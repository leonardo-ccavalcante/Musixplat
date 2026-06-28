import { type ReactNode, useId } from "react";

// A collapsible Observatory tier: a one-line summary that opens to the full table/list. The toggle is a
// REAL <button> with aria-expanded + aria-controls (keyboard-operable, focus-visible) — NOT a clickable
// <div> (the mock's anti-pattern) and NOT a <summary> with nested action buttons (that would be a
// nested-interactive a11y violation). The tier's action buttons sit as SIBLINGS of the toggle, never
// inside it. Color is never the sole carrier: the chevron rotates AND the title/summary are text. The body
// stays mounted but `hidden` when collapsed, so aria-controls always resolves and the owning tier can still
// read its data to compute the summary line.
export function CollapsibleTier({
  title,
  summary,
  actions,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  summary: ReactNode;
  actions?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <section className="border-t border-mxm-border">
      <div className="flex items-center gap-2 py-1.5">
        {/* heading > button[aria-expanded] is the ARIA disclosure pattern — gives the section a heading for
            screen-reader navigation AND a real, keyboard-operable toggle (not a clickable div). */}
        <h2 className="m-0 flex-1 text-base font-medium">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => onOpenChange(!open)}
            className="flex min-h-[36px] w-full items-center gap-2 rounded-mxm px-1 text-left text-mxm-content hover:bg-mxm-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mxm-brand"
          >
            <span
              aria-hidden="true"
              className={`text-mxm-content-tertiary transition-transform duration-150 ${open ? "rotate-90" : ""}`}
            >
              ▸
            </span>
            <span>{title}</span>
            <span className="text-sm font-normal text-mxm-content-secondary">{summary}</span>
          </button>
        </h2>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div id={bodyId} hidden={!open} className="pb-2">
        {children}
      </div>
    </section>
  );
}
