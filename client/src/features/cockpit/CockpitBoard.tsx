import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CockpitRow, type RowAction, type RowState } from "./CockpitRow";
import type { NbaCockpitRow } from "@shared/contracts";

// 02:EPIC-1 / F-1.1 — the bandeja, grouped by cohort (AUTO rows surface first, by server order). Each row
// shows its autonomy verdict; needs-human rows expose the human release/pause path (02:1C). Presentational:
// the page injects rows + onAction + per-row action state.
export function CockpitBoard({
  rows,
  onAction,
  actionState,
}: {
  rows: NbaCockpitRow[];
  onAction: (row: NbaCockpitRow, action: RowAction) => void;
  actionState: Record<string, RowState | undefined>;
}) {
  if (rows.length === 0) return <EmptyState>The AI has proposed no actions yet.</EmptyState>;

  const byCohort = new Map<string, NbaCockpitRow[]>();
  for (const r of rows) {
    const list = byCohort.get(r.cohort_id) ?? [];
    list.push(r);
    byCohort.set(r.cohort_id, list);
  }

  return (
    <div className="grid gap-4">
      {[...byCohort.entries()].map(([cohortId, group]) => {
        const autos = group.filter((r) => r.status === "auto").length;
        return (
          <Card key={cohortId} ariaLabel={`Cohort ${cohortId}`}>
            <CardTitle>
              {cohortId} ·{" "}
              <span className="font-normal text-mxm-content-secondary">
                {group.length} proposed · {autos} auto
              </span>
            </CardTitle>
            <div>
              {group.map((r) => (
                <CockpitRow key={r.nba_id} row={r} onAction={onAction} state={actionState[r.nba_id]} />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
