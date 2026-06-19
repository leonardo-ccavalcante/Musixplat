import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { AutonomyBadge } from "./AutonomyBadge";
import type { NbaCockpitRow } from "@shared/contracts";

export type RowAction = "RELEASE" | "PAUSE";
export interface RowState {
  status: "pending" | "done" | "error";
  msg?: string;
}

// before_after_expected is [C] (projection, never a measured number) — rendered defensively: a malformed
// payload degrades to null, never throws, never fabricates (CLAUDE.md §3.10 / §4).
function beforeAfter(j: unknown): string | null {
  if (!j || typeof j !== "object") return null;
  const o = j as { dimension?: unknown; measured?: unknown; standard?: unknown };
  if (typeof o.dimension !== "string" || typeof o.measured !== "number" || typeof o.standard !== "number") return null;
  return `${o.dimension}: ${o.measured} → ${o.standard}`;
}

// One proposal row — compact (~40px), scannable: [action + cohort] · [root cause + before/after] · [level] ·
// [verdict] · [actions]. Presentational: the trpc mutation lives on the page, wired through onAction. AUTO
// rows have no Release (the AI already acts) but keep Pause (a human can always override DOWN). needs-human
// rows expose Release + Pause (02:1C). Disabled while pending or once recorded (anti double-fire). muted =
// the calm auto list (lower visual weight than the action queue).
export function CockpitRow({
  row,
  onAction,
  state,
  muted,
}: {
  row: NbaCockpitRow;
  onAction: (row: NbaCockpitRow, action: RowAction) => void;
  state?: RowState;
  muted?: boolean;
}) {
  const ba = beforeAfter(row.before_after_expected);
  const busy = state?.status === "pending";
  const canAct = row.effective_level != null && state?.status !== "done";
  const detail = [row.root_cause ?? "no attributable cause", ba].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-mxm-border py-2.5 text-sm last:border-b-0">
      <div className="flex min-w-[11rem] items-baseline gap-2">
        <span className={cn("font-medium", muted ? "text-mxm-content-secondary" : "text-mxm-content")}>
          {row.action_type ?? "—"}
        </span>
        <span className="truncate text-xs text-mxm-content-secondary">{row.cohort_id}</span>
      </div>
      <div
        className="w-full min-w-0 text-xs text-mxm-content-secondary sm:w-auto sm:flex-1 sm:truncate"
        title={detail}
      >
        {detail}
      </div>
      <div className="text-xs tabular-nums text-mxm-content-secondary">
        level <span className="text-mxm-content">{row.effective_level ?? "—"}</span>
      </div>
      <AutonomyBadge status={row.status} reason={row.reason} />
      <div className="ml-auto flex items-center gap-2">
        {state?.status === "done" ? (
          <span role="status" className="text-xs text-mxm-green">
            {state.msg ?? "Recorded ✓"}
          </span>
        ) : (
          <>
            {row.status === "needs_human" && (
              // Primary intent rendered as a brand-outlined ghost: white-on-brand fails AA (3.27:1); brand
              // text on the dark surface passes (5.2:1). The shared primary Button has the same gap — flagged.
              <Button
                variant="ghost"
                className="border-mxm-brand font-semibold text-mxm-brand"
                disabled={!canAct || busy}
                aria-busy={busy}
                onClick={() => onAction(row, "RELEASE")}
              >
                {busy ? "…" : "Release"}
              </Button>
            )}
            <Button variant="ghost" disabled={!canAct || busy} aria-busy={busy} onClick={() => onAction(row, "PAUSE")}>
              Pause
            </Button>
          </>
        )}
        {state?.status === "error" && (
          <span role="alert" className="text-xs text-mxm-red">
            {state.msg ?? "Failed"}
          </span>
        )}
      </div>
    </div>
  );
}
