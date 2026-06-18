import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { trpc } from "@/lib/trpc";

type SimSummary = { total: number; subgroup_moves: number; percentile_changes: number };

// EPIC-6 / F-6.1 — "run now" triggers an ephemeral, read-only re-segmentation simulation.
// no-commit: the server never persists or hands off (F-6.3). Button is busy/disabled during the
// run (anti double-fire), aria-busy; result is labelled as a non-persisted simulation.
export function SandboxPanel() {
  const [run, setRun] = useState(false);
  const sim = trpc.sandbox.run.useQuery(undefined, { enabled: run, refetchOnWindowFocus: false });
  const busy = run && sim.isFetching;
  const simulated = sim.data?.simulated as SimSummary | null | undefined;
  const rows = simulated
    ? [
        { label: "Total accounts", value: simulated.total },
        { label: "Subgroup moves", value: simulated.subgroup_moves },
        { label: "Percentile changes", value: simulated.percentile_changes },
      ]
    : [];
  return (
    <Card ariaLabel="Re-segmentation sandbox">
      <div className="mb-2 flex items-center justify-between">
        <CardTitle>Re-segmentation simulation</CardTitle>
        <Button
          variant="ghost"
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            setRun(true);
            void sim.refetch();
          }}
        >
          {busy ? "Running…" : "Run now"}
        </Button>
      </div>
      {!run ? (
        <EmptyState>Ephemeral — does not persist, does not hand off.</EmptyState>
      ) : busy ? (
        <EmptyState>Simulating…</EmptyState>
      ) : sim.isError ? (
        <EmptyState>Simulation unavailable.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>{sim.data?.label ?? "No committed snapshot."}</EmptyState>
      ) : (
        <>
          <p className="mb-1 text-xs text-mxm-amber" role="status">
            Simulation (does not persist) · committed = {String(sim.data?.committed ?? false)}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-mxm-content-tertiary">
                <th scope="col">Metric</th>
                <th scope="col" className="text-right">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="text-mxm-content">
                  <td className="text-mxm-content-secondary">{r.label}</td>
                  <td className="tabnum text-right">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
