import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { trpc } from "@/lib/trpc";

type SimRow = { tier_base: string; bucket_sim: string; n_sim: number };

// EPIC-6 / F-6.1 — "correr ahora" triggers an ephemeral, read-only re-segmentation simulation.
// no-commit: the server never persists or hands off (F-6.3). Button is busy/disabled during the
// run (anti double-fire), aria-busy; result is labelled as a non-persisted simulation.
export function SandboxPanel() {
  const [run, setRun] = useState(false);
  const sim = trpc.sandbox.run.useQuery(undefined, { enabled: run, refetchOnWindowFocus: false });
  const busy = run && sim.isFetching;
  return (
    <Card ariaLabel="Sandbox de re-segmentación">
      <div className="mb-2 flex items-center justify-between">
        <CardTitle>Simulación de re-segmentación</CardTitle>
        <Button
          variant="ghost"
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            setRun(true);
            void sim.refetch();
          }}
        >
          {busy ? "Corriendo…" : "Correr ahora"}
        </Button>
      </div>
      {!run ? (
        <EmptyState>Efímero — no persiste, no hace handoff.</EmptyState>
      ) : busy ? (
        <EmptyState>Simulando…</EmptyState>
      ) : (
        <>
          <p className="mb-1 text-xs text-mxm-amber" role="status">
            Simulación (no persiste) · committed = {String(sim.data?.committed ?? false)}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-mxm-content-tertiary">
                <th scope="col">Tier</th>
                <th scope="col">Bucket (sim)</th>
                <th scope="col" className="text-right">
                  n
                </th>
              </tr>
            </thead>
            <tbody>
              {((sim.data?.simulated ?? []) as SimRow[]).map((r) => (
                <tr key={`${r.tier_base}:${r.bucket_sim}`} className="text-mxm-content">
                  <td className="text-mxm-content-secondary">{r.tier_base}</td>
                  <td>{r.bucket_sim}</td>
                  <td className="tabnum text-right">{r.n_sim}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
