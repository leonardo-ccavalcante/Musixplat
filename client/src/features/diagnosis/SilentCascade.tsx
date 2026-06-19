import { fmtMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { DiagnosisListRow } from "@shared/contracts_05b";

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div>
      <div
        className={`text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-none tracking-tight tabular-nums ${
          accent ? "text-mxm-brand" : "text-mxm-content"
        }`}
      >
        {n}
      </div>
      <div className="mt-1.5 text-xs text-mxm-content-secondary">{label}</div>
    </div>
  );
}

// The "uau" — the reverse-cascade hero. One restaurant flagged → zoom out → N affected / M silent (never
// spoke) → € at risk. Every number is PRODUCED (anti-join + Named_Query), shown rounded for display only.
// A proactive headline carries the "caught before a ticket" mark — the whole point of the monitor (BR-B12).
export function SilentCascade({ row, onOpen }: { row: DiagnosisListRow; onOpen: (row: DiagnosisListRow) => void }) {
  const proactive = row.origin === "proactive";
  const evaluable = row.silent_status !== "not_evaluable";
  return (
    <section
      aria-label="Silent cascade"
      className="rounded-mxm border border-mxm-border bg-mxm-bg-elevated p-[clamp(1.25rem,2.5vw,2rem)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-mxm-content">The silent cascade</h2>
        {proactive && (
          <span className="rounded-full border border-mxm-brand px-2 py-0.5 text-[11px] font-medium text-mxm-brand">
            caught before a ticket
          </span>
        )}
      </div>
      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-mxm-content-secondary [hyphens:auto] [text-align:justify]">
        {proactive
          ? "The monitor flagged a non-payment before anyone opened a ticket. Zooming out reveals who else is hit."
          : "A customer opened a ticket. Zooming out reveals who else is hit and never said a word."}
      </p>
      {evaluable ? (
        <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-3">
          <Stat n={row.affected} label="affected" />
          <Stat n={row.silent} label="silent · never spoke" accent />
          <div>
            <div className="text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-none tracking-tight tabular-nums text-mxm-content">
              € {row.revenue_lost != null ? fmtMoney(row.revenue_lost) : "n/a"}
            </div>
            <div className="mt-1.5 text-xs text-mxm-content-secondary">at risk</div>
          </div>
          <Button
            variant="ghost"
            className="ml-auto border-mxm-brand font-semibold text-mxm-brand"
            onClick={() => onOpen(row)}
          >
            Open dossier
          </Button>
        </div>
      ) : (
        // BR-B4 fail-closed — population unobservable; we say so, never invent a number.
        <p role="status" className="mt-4 text-sm text-mxm-amber">
          Population unavailable. Silent ones not evaluable. Never assumed zero.
        </p>
      )}
    </section>
  );
}
