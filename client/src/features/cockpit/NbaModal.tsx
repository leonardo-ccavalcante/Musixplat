import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { AutonomyBadge } from "./AutonomyBadge";
import { fmtNum } from "@/lib/utils";
import type { RowAction, RowState } from "./CockpitRow";
import type { NbaCockpitRow } from "@shared/contracts";

// 02 — open one NBA so the operator SEES it: the recommended action, the cohort, the root cause, THE PATH it
// indicates (before_after_expected, a [C] projection), the autonomy verdict + WHY a human is on it, and the
// edit = release/pause (override only DOWN). Every field is READ from the produced proposal row (§14).
const REASON_TEXT: Record<NonNullable<NbaCockpitRow["reason"]>, string> = {
  money: "Touches money directly — the AI may only PROPOSE; a human releases it (financial hard-no, BR-2).",
  level: "Autonomy is above LOW — escalated to you to release at the granted level or clamp it down.",
  gates: "A sample-size / policy / k-anon gate is not satisfied — held for you (fail-closed).",
};

function PathView({ j }: { j: unknown }) {
  if (j && typeof j === "object") {
    const o = j as { dimension?: unknown; measured?: unknown; standard?: unknown; gap?: unknown };
    if (typeof o.dimension === "string" && typeof o.measured === "number" && typeof o.standard === "number") {
      return (
        <span>
          {o.dimension}: <span className="text-mxm-content">{fmtNum(o.measured)}</span> →{" "}
          <span className="text-mxm-content">{fmtNum(o.standard)}</span>
          {typeof o.gap === "number" ? ` · gap ${fmtNum(o.gap)}` : ""}
        </span>
      );
    }
  }
  return <span>no projected path (rendered conservatively)</span>;
}

export function NbaModal({
  row,
  onClose,
  onAction,
  state,
}: {
  row: NbaCockpitRow | null;
  onClose: () => void;
  onAction: (row: NbaCockpitRow, action: RowAction) => void;
  state?: RowState;
}) {
  const busy = state?.status === "pending";
  const canAct = !!row && row.effective_level != null && state?.status !== "done";

  return (
    <Modal open={!!row} onClose={onClose} title={row ? `Next Best Action · ${row.cohort_id}` : "Next Best Action"}>
      {row && (
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">Recommended action</p>
            <p className="mt-0.5 font-medium text-mxm-content">{row.action_type ?? "—"}</p>
            <p className="text-xs text-mxm-content-secondary">cohort {row.cohort_id}</p>
          </div>

          <div className="rounded-mxm border border-mxm-border p-3">
            <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">Root cause</p>
            <p className="mt-0.5 text-mxm-content">{row.root_cause ?? "no attributable cause"}</p>
          </div>

          <div className="rounded-mxm border border-mxm-border p-3">
            <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">
              The path it indicates <ProvenanceBadge prov="[C]" className="ml-1" /> projection
            </p>
            <p className="mt-0.5 text-mxm-content-secondary">
              <PathView j={row.before_after_expected} />
            </p>
          </div>

          <div className="rounded-mxm border border-mxm-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-mxm-content-tertiary">Autonomy</span>
              <span className="tabnum text-mxm-content">{row.effective_level ?? "not computed"}</span>
              <AutonomyBadge status={row.status} reason={row.reason} />
            </div>
            {row.status === "needs_human" && row.reason && (
              <p className="mt-1.5 text-xs text-mxm-content-secondary">{REASON_TEXT[row.reason]}</p>
            )}
            <p className="mt-1.5 text-xs text-mxm-content-tertiary">financial class · {row.financial_class ?? "n/a"}</p>
          </div>

          <div className="border-t border-mxm-border pt-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-mxm-content-tertiary">
              Where to change it — override only DOWN (server re-validates)
            </p>
            {state?.status === "done" ? (
              <span role="status" className="text-xs text-mxm-green">{state.msg ?? "Recorded ✓"}</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {row.status === "needs_human" && (
                  <Button
                    className="border-mxm-brand font-semibold text-mxm-brand"
                    variant="ghost"
                    disabled={!canAct || busy}
                    aria-busy={busy}
                    onClick={() => onAction(row, "RELEASE")}
                  >
                    Release
                  </Button>
                )}
                <Button variant="ghost" disabled={!canAct || busy} aria-busy={busy} onClick={() => onAction(row, "PAUSE")}>
                  Pause
                </Button>
              </div>
            )}
            {state?.status === "error" && (
              <p role="alert" className="mt-1.5 text-xs text-mxm-red">{state.msg ?? "Failed"}</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
