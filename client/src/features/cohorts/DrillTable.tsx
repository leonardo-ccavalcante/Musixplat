import { EmptyState } from "@/components/ui/EmptyState";
import { fmtNum } from "@/lib/utils";
import { HandoffButton } from "./HandoffButton";

export type DrillRow = {
  restaurant_id: string;
  cohort_id: string;
  subgroup_id: string | null;
  week: string;
  percentile_in_cohort: number | null;
  gap_to_top: number | null;
  mode: string | null;
};

// F-5.1 — drill: accounts ordered by gap (server-ordered). Each row offers the F-5.2 handoff.
// Keyboard-navigable table; NULL passes through as —.
export function DrillTable({ rows }: { rows: DrillRow[] }) {
  if (rows.length === 0) return <EmptyState>Empty cell.</EmptyState>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-mxm-content-tertiary">
          <th scope="col">Restaurant</th>
          <th scope="col" className="text-right">
            Percentile
          </th>
          <th scope="col" aria-sort="descending" className="text-right">
            Gap
          </th>
          <th scope="col" className="pl-6">
            Action
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.restaurant_id}-${r.week}-${r.subgroup_id ?? ""}`} className="text-mxm-content">
            <td>{r.restaurant_id}</td>
            <td className="tabnum text-right">{r.percentile_in_cohort == null ? "—" : fmtNum(r.percentile_in_cohort)}</td>
            <td className="tabnum text-right">{r.gap_to_top == null ? "—" : fmtNum(r.gap_to_top)}</td>
            <td className="pl-6">
              <HandoffButton
                restaurant_id={r.restaurant_id}
                cohort_id={r.cohort_id}
                subgroup_id={r.subgroup_id}
                week={r.week}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
