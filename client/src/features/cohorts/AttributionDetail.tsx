import type { PercentileDelta, RootCause } from "@shared/contracts";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";

// F-2.4 — why-it-moved: RENDER the DB-computed cause, never fabricate (prov gates it). Compact
// inline span group; label text (not color) carries meaning. NULL/undefined ⇒ render nothing.
export const CAUSE_EN: Record<RootCause, string> = {
  orders: "fewer sales",
  cancel: "more cancellations",
  connection: "less connection",
  quality: "lower quality",
  none: "no attributable cause",
};

// Single source of truth for the cause LABEL — reused by the delta grouping (DeltaPanel) so the
// group header and the per-row badge never drift. null ⇒ no measured cause; "new" ⇒ no history.
export function reasonLabel(delta: PercentileDelta): string {
  if (!delta) return CAUSE_EN.none;
  if (delta.sentido === "new") return "new (no history)";
  return delta.root_cause ? CAUSE_EN[delta.root_cause] : CAUSE_EN.none;
}

export function AttributionDetail({ delta, compact }: { delta: PercentileDelta; compact?: boolean }) {
  if (!delta) return null; // null/undefined ⇒ empty cell, never a faked cause
  if (delta.sentido === "new")
    return <span className="text-mxm-content-tertiary">new (no history)</span>;

  const od = delta.orders_delta;
  return (
    <span className="inline-flex items-center gap-1 text-mxm-content-secondary">
      {/* compact: the cause label is carried by the group header, so show only magnitude + prov */}
      {!compact && <span>{reasonLabel(delta)}</span>}
      {od != null && <span className="tabnum text-mxm-content-tertiary">({od})</span>}
      <ProvenanceBadge prov={delta.prov} />
    </span>
  );
}
