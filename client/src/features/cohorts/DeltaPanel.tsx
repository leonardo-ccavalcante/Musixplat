import { useMemo, useState } from "react";
import type { DeltaRow } from "@shared/contracts";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Disclosure } from "@/components/ui/Disclosure";
import { cn, fmtNum } from "@/lib/utils";
import { AttributionDetail, reasonLabel } from "./AttributionDetail";

// F-2.3 — prioritized deltas, GROUPED by why-it-moved (F-2.4 cause). Render/sort only — never
// recomputes deltas (produced by F-2.2). Within a group: at_risk on top (deterministic), then gap
// desc. Groups ordered by size desc. A multi-select chip bar filters by cause; each group is a
// collapsible <details> so a human opens one cause at a time. Order/at_risk exposed via redundant
// text (▲ AT RISK), never color-only. NULL passes through as "—".
const RANK: Record<string, number> = { at_risk: 0, churn: 1, percentile_down: 2 };

function withinGroup(a: DeltaRow, b: DeltaRow): number {
  const ra = RANK[a.delta_status ?? ""] ?? 9;
  const rb = RANK[b.delta_status ?? ""] ?? 9;
  if (ra !== rb) return ra - rb;
  return (b.gap_to_top ?? -Infinity) - (a.gap_to_top ?? -Infinity);
}

function chipCls(active: boolean): string {
  return cn(
    "tabnum rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand",
    active
      ? "border-mxm-brand text-mxm-brand"
      : "border-mxm-border text-mxm-content-secondary hover:text-mxm-content",
  );
}

export function DeltaPanel({ rows }: { rows: DeltaRow[] }) {
  // group by cause (single source of truth: reasonLabel), sort within, then order groups by size.
  const groups = useMemo(() => {
    const m = new Map<string, DeltaRow[]>();
    for (const r of rows) {
      const k = reasonLabel(r.percentile_delta);
      const bucket = m.get(k);
      if (bucket) bucket.push(r);
      else m.set(k, [r]);
    }
    return [...m.entries()]
      .map(([reason, rs]) => ({ reason, rows: [...rs].sort(withinGroup) }))
      .sort((a, b) => b.rows.length - a.rows.length || a.reason.localeCompare(b.reason));
  }, [rows]);

  // empty selection = show all; otherwise show only the chosen causes (multi-select).
  const [active, setActive] = useState<Set<string>>(new Set());
  const toggle = (reason: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });
  const visible = active.size === 0 ? groups : groups.filter((g) => active.has(g.reason));

  return (
    <Card ariaLabel="Prioritized delta panel">
      <CardTitle>Prioritized deltas</CardTitle>
      {groups.length === 0 ? (
        <EmptyState>No deltas this period.</EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by cause">
            <button type="button" onClick={() => setActive(new Set())} aria-pressed={active.size === 0} className={chipCls(active.size === 0)}>
              All
            </button>
            {groups.map((g) => (
              <button
                key={g.reason}
                type="button"
                onClick={() => toggle(g.reason)}
                aria-pressed={active.has(g.reason)}
                className={chipCls(active.has(g.reason))}
              >
                {g.reason} {g.rows.length}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {visible.map((g, i) => (
              <Disclosure
                key={`${g.reason}|${visible.length}`}
                title={g.reason}
                count={g.rows.length}
                defaultOpen={i === 0}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-mxm-content-tertiary">
                      <th scope="col">Restaurant</th>
                      <th scope="col" aria-sort="ascending">
                        Status
                      </th>
                      <th scope="col" className="text-right">
                        Percentile
                      </th>
                      <th scope="col" aria-sort="descending" className="text-right">
                        Gap
                      </th>
                      <th scope="col" className="pl-6">
                        Why
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const atRisk = r.delta_status === "at_risk";
                      return (
                        <tr
                          key={r.evento_id}
                          data-delta={r.delta_status ?? "none"}
                          className={atRisk ? "text-mxm-red" : "text-mxm-content"}
                        >
                          <td>{r.restaurant_id}</td>
                          <td>
                            <span aria-hidden="true">{atRisk ? "▲ " : ""}</span>
                            {r.delta_status ?? "—"}
                          </td>
                          <td className="tabnum text-right">
                            {r.percentile_in_cohort == null ? "—" : fmtNum(r.percentile_in_cohort)}
                          </td>
                          <td className="tabnum text-right">
                            {r.gap_to_top == null ? "—" : fmtNum(r.gap_to_top)}
                          </td>
                          <td className="pl-6">
                            {/* cause label is the group header ⇒ compact: magnitude + provenance only */}
                            <AttributionDetail delta={r.percentile_delta} compact />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Disclosure>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
