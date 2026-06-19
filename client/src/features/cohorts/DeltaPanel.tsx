import { useMemo, useState } from "react";
import type { DeltaRow } from "@shared/contracts";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Disclosure } from "@/components/ui/Disclosure";
import { FilterChips, type ChipOption } from "@/components/ui/FilterChips";
import { ProvenanceLegend } from "@/components/ui/ProvenanceLegend";
import { fmtNum } from "@/lib/utils";
import { AttributionDetail, reasonLabel } from "./AttributionDetail";

// F-2.3 — prioritized deltas, GROUPED by why-it-moved (F-2.4 cause). Render/sort only — never
// recomputes deltas (produced by F-2.2). Within a group: at_risk on top (deterministic), then gap
// desc. Groups ordered by size desc. A multi-select chip bar filters by cause; each group is a
// collapsible <details>. Order/at_risk exposed via redundant text (▲ AT RISK), never color-only.
// A helper line + provenance legend decode the screen for a non-technical reader. NULL ⇒ "—".
const RANK: Record<string, number> = { at_risk: 0, churn: 1, percentile_down: 2 };

// plain-language status labels (the enum strings are developer tokens, not manager language)
const STATUS_LABEL: Record<string, string> = {
  at_risk: "At risk",
  churn: "Churning",
  percentile_down: "Falling behind",
  percentile_up: "Improving",
};

function withinGroup(a: DeltaRow, b: DeltaRow): number {
  const ra = RANK[a.delta_status ?? ""] ?? 9;
  const rb = RANK[b.delta_status ?? ""] ?? 9;
  if (ra !== rb) return ra - rb;
  return (b.gap_to_top ?? -Infinity) - (a.gap_to_top ?? -Infinity);
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
  const chipOptions: ChipOption[] = groups.map((g) => ({ key: g.reason, label: g.reason, count: g.rows.length }));

  return (
    <Card ariaLabel="Prioritized delta panel">
      <CardTitle>Prioritized deltas</CardTitle>
      {groups.length === 0 ? (
        <EmptyState>No deltas this period.</EmptyState>
      ) : (
        <>
          <p className="mb-1 text-xs text-mxm-content-secondary">
            {rows.length} restaurant{rows.length === 1 ? "" : "s"} slipping behind their cohort&apos;s best,
            grouped by reason — the count on each group is how many. Open a group, or filter by reason.
          </p>
          <p className="mb-1 text-xs text-mxm-content-tertiary">
            Rank in cohort and gap to top are 0–1; lower rank / bigger gap = further behind.
          </p>
          <ProvenanceLegend className="mb-3" />

          <div className="mb-3">
            <FilterChips
              options={chipOptions}
              active={active}
              onToggle={toggle}
              onClear={() => setActive(new Set())}
              ariaLabel="Filter by reason"
            />
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
                      <th scope="col">Status</th>
                      <th scope="col" className="text-right">
                        Rank in cohort
                      </th>
                      <th scope="col" className="text-right">
                        Gap to top
                      </th>
                      <th scope="col" className="pl-6">
                        Confidence
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
                            {r.delta_status ? (STATUS_LABEL[r.delta_status] ?? r.delta_status) : "—"}
                          </td>
                          <td className="tabnum text-right">
                            {r.percentile_in_cohort == null ? "—" : fmtNum(r.percentile_in_cohort)}
                          </td>
                          <td className="tabnum text-right">
                            {r.gap_to_top == null ? "—" : fmtNum(r.gap_to_top)}
                          </td>
                          <td className="pl-6">
                            {/* cause is the group header ⇒ this column shows confidence (the provenance word) only */}
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
