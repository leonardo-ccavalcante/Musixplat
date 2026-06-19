import { cn } from "@/lib/utils";
import type { NbaCockpitRow } from "@shared/contracts";

// AUTO vs needs-human — color + icon + text, never color-only (WCAG 2.1 AA, CLAUDE.md §4). reason
// explains the human route: money (hard-no, only proposes), escalated level, or a sample/policy gate.
const REASON_LABEL: Record<NonNullable<NbaCockpitRow["reason"]>, string> = {
  money: "money — only proposes",
  level: "escalated level",
  gates: "sample / policy",
};

export function AutonomyBadge({ status, reason }: Pick<NbaCockpitRow, "status" | "reason">) {
  if (status === "auto") {
    return (
      <span className="inline-flex items-center gap-1 rounded-mxm border border-mxm-border px-2 py-0.5 text-xs font-medium text-mxm-green">
        <span aria-hidden>●</span> AUTO · AI acts alone
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-mxm border border-mxm-border px-2 py-0.5 text-xs font-medium",
        reason === "money" ? "text-mxm-red" : "text-mxm-amber",
      )}
    >
      <span aria-hidden>▲</span> Needs human{reason ? ` · ${REASON_LABEL[reason]}` : ""}
    </span>
  );
}
