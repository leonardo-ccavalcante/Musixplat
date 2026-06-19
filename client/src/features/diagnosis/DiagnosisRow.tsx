import { cn, fmtNum } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { DiagnosisListRow, DiagnosisOrigin } from "@shared/contracts_05b";

// origin badge — non-color carrier (icon + word + title), WCAG 2.1 AA. proactive = caught before a ticket.
export function OriginBadge({ origin }: { origin: DiagnosisOrigin }) {
  const proactive = origin === "proactive";
  return (
    <span
      title={proactive ? "Caught by the monitor before a ticket" : "From a customer episode"}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        proactive ? "border-mxm-brand text-mxm-brand" : "border-mxm-border text-mxm-content-secondary",
      )}
    >
      {proactive ? "⚡ proactive" : "✉ reactive"}
    </span>
  );
}

// One diagnosed-problem row — scannable: [restaurant + area] · [affected/silent] · [R$] · [route] ·
// [origin] · [needs-you] · [dossier]. Presentational: the page owns the modal, wired via onOpen. Every
// number is READ (the producers computed it); a not_evaluable population is shown honestly, never as 0.
export function DiagnosisRow({
  row,
  onOpen,
  muted,
}: {
  row: DiagnosisListRow;
  onOpen: (row: DiagnosisListRow) => void;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-mxm-border py-3.5 text-sm last:border-b-0">
      <div className="flex min-w-[10rem] items-baseline gap-2">
        <span className={cn("font-medium", muted ? "text-mxm-content-secondary" : "text-mxm-content")}>
          {row.restaurant_id}
        </span>
        <span className="text-xs text-mxm-content-secondary">{row.area_type ?? "—"}</span>
      </div>
      <div className="text-xs tabular-nums text-mxm-content-secondary">
        {row.silent_status === "not_evaluable" ? (
          <span className="text-mxm-amber" title="Population unobservable — never assumed zero (BR-B4)">
            silent: not evaluable
          </span>
        ) : (
          <>
            <span className="text-mxm-content">{row.affected}</span> affected ·{" "}
            <span className="text-mxm-brand">{row.silent}</span> silent
          </>
        )}
      </div>
      <div className="text-xs tabular-nums text-mxm-content-secondary">
        R$ <span className="text-mxm-content">{row.revenue_lost != null ? fmtNum(row.revenue_lost) : "—"}</span>
      </div>
      <span className="hidden text-xs text-mxm-content-secondary sm:inline">{row.suggested_route ?? "—"}</span>
      <OriginBadge origin={row.origin} />
      {row.needs_human && (
        <span
          role="status"
          title="Degraded to human — low confidence or blocked (fail-closed)"
          className="inline-flex items-center gap-1 rounded-full border border-mxm-amber px-2 py-0.5 text-[11px] font-medium text-mxm-amber"
        >
          ⚠ needs you
        </span>
      )}
      <div className="ml-auto">
        <Button variant="ghost" onClick={() => onOpen(row)}>
          View dossier
        </Button>
      </div>
    </div>
  );
}
