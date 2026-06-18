import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export type CohortCell = {
  cohort_id: string;
  cuisine: string | null;
  zone: string | null;
  tier_base: string;
  n_accounts: number | null;
  status: "pending" | "suppressed" | "collapsed" | "ok";
};

// F-2.1 — semáforo. Color is NEVER the sole carrier: each status has an icon + text label too.
const META: Record<CohortCell["status"], { icon: string; label: string; cls: string }> = {
  ok: { icon: "●", label: "OK", cls: "text-mxm-green" },
  collapsed: { icon: "◐", label: "n<n_min (cualitativo)", cls: "text-mxm-amber" },
  suppressed: { icon: "▢", label: "k-anon suprimido", cls: "text-mxm-red" },
  pending: { icon: "○", label: "sin datos", cls: "text-mxm-content-tertiary" },
};

export function SemaforoCohort({
  cells,
  onOpen,
}: {
  cells: CohortCell[];
  onOpen?: (c: CohortCell) => void;
}) {
  return (
    <Card ariaLabel="Semáforo de cohorts">
      <CardTitle>Cohorts</CardTitle>
      {cells.length === 0 ? (
        <EmptyState>Sin cohorts calculadas. Corré el job P01.</EmptyState>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
          {cells.map((c) => {
            const m = META[c.status];
            return (
              <li key={c.cohort_id}>
                <button
                  onClick={() => onOpen?.(c)}
                  className="w-full rounded-mxm border border-mxm-border p-2 text-left hover:bg-mxm-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-mxm-content-secondary">
                      {[c.cuisine ?? "unknown cuisine", c.zone ?? "unknown zone", c.tier_base].join(" · ")}
                    </span>
                    <span className={m.cls} aria-hidden="true">
                      {m.icon}
                    </span>
                  </div>
                  <div className={`text-xs ${m.cls}`}>{m.label}</div>
                  <div className="tabnum text-xs text-mxm-content-tertiary">
                    n = {c.n_accounts ?? "—"}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
