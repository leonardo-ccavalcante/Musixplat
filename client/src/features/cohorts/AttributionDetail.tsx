import type { PercentileDelta, RootCause } from "@shared/contracts";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";

// F-2.4 — why-it-moved: RENDER the DB-computed cause, never fabricate (prov gates it). Compact
// inline span group; label text (not color) carries meaning. NULL/undefined ⇒ render nothing.
const CAUSE_EN: Record<RootCause, string> = {
  orders: "fewer sales",
  cancel: "more cancellations",
  connection: "less connection",
  quality: "lower quality",
  none: "no attributable cause",
};

export function AttributionDetail({ delta }: { delta: PercentileDelta }) {
  if (!delta) return null; // null/undefined ⇒ empty cell, never a faked cause
  if (delta.sentido === "new")
    return <span className="text-mxm-content-tertiary">new (no history)</span>;

  const label = delta.root_cause ? CAUSE_EN[delta.root_cause] : CAUSE_EN.none;
  const od = delta.orders_delta;
  return (
    <span className="inline-flex items-center gap-1 text-mxm-content-secondary">
      <span>{label}</span>
      {od != null && <span className="tabnum text-mxm-content-tertiary">({od})</span>}
      <ProvenanceBadge prov={delta.prov} />
    </span>
  );
}
