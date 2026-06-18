import { useMemo } from "react";
import type { DeltaRow } from "@shared/contracts";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

// F-2.3 — reusable ordered delta panel: at_risk on top (deterministic), then gap desc. Render/sort
// only — never recomputes deltas (produced by F-2.2). Order exposed semantically (aria-sort),
// color is NOT the sole carrier (redundant "AT RISK" label). NULL passes through as "—".
const RANK: Record<string, number> = { at_risk: 0, churn: 1, percentile_down: 2 };

export function DeltaPanel({ rows }: { rows: DeltaRow[] }) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ra = RANK[a.delta_status ?? ""] ?? 9;
        const rb = RANK[b.delta_status ?? ""] ?? 9;
        if (ra !== rb) return ra - rb;
        return (b.gap_to_top ?? -Infinity) - (a.gap_to_top ?? -Infinity);
      }),
    [rows],
  );

  return (
    <Card ariaLabel="Panel de delta priorizado">
      <CardTitle>Deltas priorizados</CardTitle>
      {sorted.length === 0 ? (
        <EmptyState>Sin deltas en este período.</EmptyState>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-mxm-content-tertiary">
              <th scope="col">Restaurant</th>
              <th scope="col" aria-sort="ascending">
                Estado
              </th>
              <th scope="col" className="text-right">
                Percentil
              </th>
              <th scope="col" aria-sort="descending" className="text-right">
                Gap
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
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
                  <td className="tabnum text-right">{r.percentile_in_cohort ?? "—"}</td>
                  <td className="tabnum text-right">{r.gap_to_top ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
