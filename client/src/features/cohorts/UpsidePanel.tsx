import type { DescriptiveBaseline, ProvTag } from "@shared/contracts";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";

// F-1.7 — upside projection render. ALWAYS [C]: a projection NEVER ascends to [V]. Read-only — it is a
// lectura, not an action. null lift ⇒ needs both extremes ≥ k ⇒ conservative empty (§14). null attribution
// field ⇒ "—", never a fabricated 0.

const ATTR: Array<{ k: "connection" | "quality" | "cancel" | "price"; label: string }> = [
  { k: "connection", label: "Connection" },
  { k: "quality", label: "Quality" },
  { k: "cancel", label: "Cancellations" },
  { k: "price", label: "Price" },
];

export function UpsidePanel({ baseline }: { baseline: DescriptiveBaseline }) {
  const upside = baseline?.upside;
  if (upside?.lift_orders == null) {
    return (
      <Card ariaLabel="Cohort upside">
        <CardTitle>Upside (if the base operated like the top)</CardTitle>
        <EmptyState>No upside computed (needs both extremes ≥ k).</EmptyState>
      </Card>
    );
  }
  const attr = upside.attribution;
  return (
    <Card ariaLabel="Cohort upside">
      <CardTitle>Upside (if the base operated like the top)</CardTitle>
      <div className="mb-2 flex items-center gap-2">
        <p className="tabnum text-2xl text-mxm-content">
          +{upside.lift_orders} {upside.unit ?? ""}
        </p>
        <ProvenanceBadge prov={(upside.prov ?? "[C]") as ProvTag} />
      </div>
      <dl className="space-y-1">
        {ATTR.map((a) => (
          <div key={a.k} className="flex justify-between text-sm text-mxm-content">
            <dt className="text-mxm-content-secondary">{a.label}</dt>
            <dd className="tabnum text-right">{attr?.[a.k] ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-mxm-content-tertiary">
        Projection — read-only, not an action (never ascends to [V]).
      </p>
    </Card>
  );
}
