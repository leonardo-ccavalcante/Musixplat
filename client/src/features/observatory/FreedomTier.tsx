import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { CockpitSetup } from "@/features/cockpit/CockpitSetup";
import { EvalStatusBadge } from "./EvalStatusBadge";

// Freedom = how far the AI may go. The eval grid is READ-ONLY (the grade is producer-measured; a human
// cannot type it — §14). The honest human lever is the CAP, edited via the EXISTING cockpit config
// template/upload (CockpitSetup → managerProcedure, [V], version-immutable). No new write code.
export function FreedomTier({ ready }: { ready: boolean }) {
  const evals = trpc.observatory.evalList.useQuery(undefined, { enabled: ready });
  const [setupOpen, setSetupOpen] = useState(false);

  return (
    <section className="mt-8" aria-label="How far the AI may go">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-mxm-content">Freedom — how far the AI may go</h2>
        <Button variant="ghost" onClick={() => setSetupOpen(true)}>
          Edit limits…
        </Button>
      </div>
      <p className="mb-3 max-w-[68ch] text-xs text-mxm-content-secondary">
        The AI&apos;s autonomy grade per cohort &amp; intent. Today these are a conservative floor the system
        has <em>not yet measured</em> — green counts as a real pass only once measured. You can tighten the
        ceiling any time (a human decision, never a faked measurement).
      </p>

      {!ready || evals.isLoading ? (
        <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
      ) : evals.isError ? (
        <p className="text-sm text-mxm-red">Couldn&apos;t read evals — try again.</p>
      ) : (evals.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-mxm-content-secondary">
          No eval cells yet. Use “Edit limits…” → “Prepare cockpit” to seed the floor.
        </p>
      ) : (
        <div className="overflow-hidden rounded-mxm border border-mxm-border">
          <table className="w-full text-sm">
            <thead className="bg-mxm-bg-secondary text-left text-xs text-mxm-content-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Cohort</th>
                <th className="px-3 py-2 font-medium">Intent</th>
                <th className="px-3 py-2 font-medium">Allowed level</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {evals.data!.map((e) => (
                <tr key={`${e.cohortId}-${e.intent}-${e.version}`} className="border-t border-mxm-border">
                  <td className="px-3 py-2 text-mxm-content">{e.cohortId}</td>
                  <td className="px-3 py-2 text-mxm-content-secondary">{e.intent}</td>
                  <td className="px-3 py-2 text-mxm-content">{e.releasedEvals ?? "not yet measured"}</td>
                  <td className="px-3 py-2">
                    <EvalStatusBadge status={e.status} prov={e.provenanceByField?.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CockpitSetup
        open={setupOpen}
        onClose={() => {
          setSetupOpen(false);
          void evals.refetch();
        }}
      />
    </section>
  );
}
