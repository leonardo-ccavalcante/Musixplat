import type { DescriptiveBaseline, CohortKpis, ProvTag } from "@shared/contracts";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { fmtNum } from "@/lib/utils";

// F-1.5 — numeric/structured PERFIL render. The "who is this cohort" PROSE is AGENTE; here we ONLY
// render DB-computed KPIs honestly. Defensive per field: missing family ⇒ skip; null ⇒ "—", never a
// fabricated 0 (§14). Numbers formatted to <=2 decimals for display (DB stores full precision).

type Family = { prov?: ProvTag } & Record<string, number | null | ProvTag | undefined>;
type FamilyDef = { key: keyof CohortKpis; title: string; fields: Array<{ k: string; label: string }> };

const FAMILIES: FamilyDef[] = [
  {
    key: "volume",
    title: "Volume",
    fields: [
      { k: "total_orders", label: "Orders" },
      { k: "avg_orders", label: "Orders/account" },
      { k: "avg_ticket", label: "Avg ticket" },
      { k: "gmv", label: "GMV" },
    ],
  },
  { key: "connection", title: "Connection", fields: [{ k: "ratio", label: "Connection ratio" }] },
  {
    key: "fulfillment",
    title: "Fulfillment",
    fields: [
      { k: "delivery_rate", label: "Delivery rate" },
      { k: "cancel_rate_restaurant", label: "Cancel. (restaurant)" },
      { k: "cancel_rate_customer", label: "Cancel. (customer)" },
    ],
  },
  {
    key: "quality",
    title: "Quality",
    fields: [
      { k: "pct_photo", label: "% photo" },
      { k: "pct_description", label: "% description" },
    ],
  },
  { key: "tickets", title: "Tickets", fields: [{ k: "avg_tickets", label: "Tickets/account" }] },
];

export function CohortProfile({ baseline, suppressed }: { baseline: DescriptiveBaseline; suppressed?: boolean }) {
  if (suppressed) {
    return (
      <Card ariaLabel="Cohort profile">
        <CardTitle>Cohort profile</CardTitle>
        <EmptyState>Profile suppressed by k-anonymity.</EmptyState>
      </Card>
    );
  }
  const kpis = baseline?.kpis;
  if (!kpis) {
    return (
      <Card ariaLabel="Cohort profile">
        <CardTitle>Cohort profile</CardTitle>
        <EmptyState>No profile computed.</EmptyState>
      </Card>
    );
  }
  const present = FAMILIES.filter((f) => kpis[f.key]);
  return (
    <Card ariaLabel="Cohort profile">
      <CardTitle>Cohort profile</CardTitle>
      <div className="space-y-4">
        {present.map((f) => {
          const fam = kpis[f.key] as Family;
          return (
            <dl key={String(f.key)}>
              <div className="mb-1 flex items-center gap-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-mxm-content-tertiary">{f.title}</dt>
                <ProvenanceBadge prov={fam.prov as ProvTag} />
              </div>
              {f.fields.map((field) => {
                const v = fam[field.k] as number | null | undefined;
                return (
                  <div key={field.k} className="flex justify-between text-sm text-mxm-content">
                    <span className="text-mxm-content-secondary">{field.label}</span>
                    <span className="tabnum text-right">{typeof v === "number" ? fmtNum(v) : "—"}</span>
                  </div>
                );
              })}
            </dl>
          );
        })}
      </div>
    </Card>
  );
}
