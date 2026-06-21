import { cn } from "@/lib/utils";
import { evidenceLine } from "@shared/signalFormat";
import { Button } from "@/components/ui/Button";
import { AutonomyBadge } from "./AutonomyBadge";
import { KbReviewBadge } from "./KbReviewBadge";
import type { NbaCockpitRow } from "@shared/contracts";

export type RowAction = "RELEASE" | "PAUSE";
export interface RowState {
  status: "pending" | "done" | "error";
  msg?: string;
}

// One clean, human-readable evidence line in each dimension's natural unit (rate→%, percentile, €) via the
// shared formatter — the same number, formatted the same way, the cockpit list / modal / dispatch share.
// Falls back to the proposal's prose root_cause if the payload is malformed (never throws, §3.10 / §4).
function describe(j: unknown, rootCause: string | null): string {
  return evidenceLine(j) ?? rootCause ?? "no attributable cause";
}

// One proposal row — compact (~40px), scannable: [action + cohort] · [root cause + before/after] · [level] ·
// [verdict] · [actions]. Presentational: the trpc mutation lives on the page, wired through onAction. AUTO
// rows have no Release (the AI already acts) but keep Pause (a human can always override DOWN). needs-human
// rows expose Release + Pause (02:1C). Disabled while pending or once recorded (anti double-fire). muted =
// the calm auto list (lower visual weight than the action queue).
export interface KbReview {
  shouldReview: boolean;
  note: string | null;
}

export function CockpitRow({
  row,
  onAction,
  onOpen,
  state,
  muted,
  kbReview,
}: {
  row: NbaCockpitRow;
  onAction: (row: NbaCockpitRow, action: RowAction) => void;
  onOpen?: (row: NbaCockpitRow) => void;
  state?: RowState;
  muted?: boolean;
  kbReview?: KbReview;
}) {
  const busy = state?.status === "pending";
  const canAct = row.effective_level != null && state?.status !== "done";
  const detail = describe(row.before_after_expected, row.root_cause);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-mxm-border py-3.5 text-sm last:border-b-0">
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
      <KbReviewBadge shouldReview={kbReview?.shouldReview} note={kbReview?.note} />
      <div className="ml-auto flex items-center gap-2">
        {onOpen && (
          <Button variant="ghost" onClick={() => onOpen(row)}>
            Details
          </Button>
        )}
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
