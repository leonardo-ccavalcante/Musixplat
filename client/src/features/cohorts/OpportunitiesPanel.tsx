import { useMemo, useState } from "react";
import type { CohortCell, DeltaRow } from "@shared/contracts";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtNum } from "@/lib/utils";
import { reasonLabel } from "./AttributionDetail";

// Secondary altitude (§0): "where to act" — a curated top-5 of the prioritized deltas (F-2.3) plus a
// summoned "all, by cohort" view (Pillar 2 progressive disclosure applied to the list). Read-only
// projection — never recomputes a delta (produced by F-2.2). gap_to_top is 0–1 from the producer (§14);
// NULL ⇒ "—". Clicking a row opens that cohort's drill modal (where the per-account detail + handoff live).
const RANK: Record<string, number> = { at_risk: 0, churn: 1, percentile_down: 2 };
function byImpact(a: DeltaRow, b: DeltaRow): number {
  const ra = RANK[a.delta_status ?? ""] ?? 9;
  const rb = RANK[b.delta_status ?? ""] ?? 9;
  if (ra !== rb) return ra - rb;
  return (b.gap_to_top ?? -Infinity) - (a.gap_to_top ?? -Infinity);
}

export function OpportunitiesPanel({
  deltas,
  cells,
  onOpen,
}: {
  deltas: DeltaRow[];
  cells: CohortCell[];
  onOpen?: (c: CohortCell) => void;
}) {
  const cellById = useMemo(() => new Map(cells.map((c) => [c.cohort_id, c])), [cells]);
  const cohortLabel = (id: string) => {
    const c = cellById.get(id);
    return c ? `${c.cuisine ?? "—"} · ${c.zone ?? "—"}` : id;
  };
  const open = (id: string) => {
    const c = cellById.get(id);
    if (c && onOpen) onOpen(c);
  };

  const top = useMemo(() => [...deltas].sort(byImpact).slice(0, 5), [deltas]);
  const groups = useMemo(() => {
    const m = new Map<string, DeltaRow[]>();
    for (const d of deltas) {
      const b = m.get(d.cohort_id);
      if (b) b.push(d);
      else m.set(d.cohort_id, [d]);
    }
    return [...m.entries()]
      .map(([id, rows]) => ({ id, rows: [...rows].sort(byImpact), max: Math.max(...rows.map((r) => r.gap_to_top ?? -Infinity)) }))
      .sort((a, b) => b.max - a.max);
  }, [deltas]);

  const [showAll, setShowAll] = useState(false);

  return (
    <Card ariaLabel="Top opportunities">
      <CardTitle>Top opportunities — where to act</CardTitle>
      {deltas.length === 0 ? (
        <EmptyState>No opportunities this period.</EmptyState>
      ) : (
        <>
          <ol className="divide-y divide-mxm-border">
            {top.map((d, i) => (
              <li key={d.evento_id}>
                <button
                  type="button"
                  onClick={() => open(d.cohort_id)}
                  className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 py-2 text-left hover:bg-mxm-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
                >
                  <span className="tabnum grid h-5 w-5 place-items-center rounded border border-mxm-border text-[0.68rem] text-mxm-content-tertiary">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-mxm-content">
                      <span className="capitalize">{cohortLabel(d.cohort_id)}</span>
                      <span className="font-normal text-mxm-content-secondary"> — {d.restaurant_id}</span>
                    </span>
                    <span className="block text-xs text-mxm-content-tertiary">{reasonLabel(d.percentile_delta)}</span>
                  </span>
                  <span className="tabnum whitespace-nowrap text-right text-sm font-bold text-mxm-brand">
                    gap {d.gap_to_top == null ? "—" : fmtNum(d.gap_to_top)}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <div className="mt-2 border-t border-mxm-border pt-2">
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
              className="flex items-center gap-2 py-1 text-sm text-mxm-content-secondary hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
            >
              <span aria-hidden="true" className={`text-xs transition-transform ${showAll ? "rotate-90" : ""}`}>▸</span>
              {showAll ? "Hide" : "Show"} all opportunities, by cohort ({deltas.length})
            </button>

            {showAll && (
              <div className="mt-1 space-y-3">
                {groups.map((g) => (
                  <div key={g.id}>
                    <div className="flex items-baseline justify-between gap-2 border-b border-mxm-border pb-1 text-xs text-mxm-content-secondary">
                      <span className="capitalize">{cohortLabel(g.id)}</span>
                      <span className="tabnum font-bold text-mxm-brand">gap {g.max === -Infinity ? "—" : fmtNum(g.max)}</span>
                    </div>
                    {g.rows.map((d) => (
                      <button
                        key={d.evento_id}
                        type="button"
                        onClick={() => open(g.id)}
                        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 py-1.5 text-left text-xs text-mxm-content-tertiary hover:bg-mxm-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
                      >
                        <span className="truncate">{d.restaurant_id} — {reasonLabel(d.percentile_delta)}</span>
                        <span className="tabnum font-semibold text-mxm-brand">gap {d.gap_to_top == null ? "—" : fmtNum(d.gap_to_top)}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
