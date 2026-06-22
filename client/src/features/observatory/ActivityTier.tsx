import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { AutonomousRegistry } from "@/features/cockpit/AutonomousRegistry";
import { EscalatedList } from "@/features/cockpit/EscalatedList";

// Activity = what the AI did alone + its governance gates. NULL result fields (time-to-sign, gates,
// rubber-stamp) render an explicit "not measured", never 0 or a fake value (§14). Decision_Trace is an
// append-only audit — read-only here. Release/pause is operated per-NBA on the Cockpit (reuse, not a
// rebuilt invariant-bearing flow) — linked, not duplicated.
export function ActivityTier({ ready }: { ready: boolean }) {
  const traces = trpc.observatory.traces.useQuery(undefined, { enabled: ready });
  const [registryOpen, setRegistryOpen] = useState(false);
  const [escOpen, setEscOpen] = useState(false);

  return (
    <section className="mt-8" aria-label="What the AI did alone">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-mxm-content">Activity &amp; trace</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setRegistryOpen(true)}>Full registry…</Button>
          <Button variant="ghost" onClick={() => setEscOpen(true)}>Escalations…</Button>
          <Link href="/cockpit" className="inline-flex min-h-[24px] items-center rounded-mxm px-2 text-sm text-mxm-content-secondary hover:text-mxm-content">
            Release / pause on Cockpit →
          </Link>
        </div>
      </div>

      {!ready || traces.isLoading ? (
        <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
      ) : traces.isError ? (
        <p className="text-sm text-mxm-red">Couldn&apos;t read traces — try again.</p>
      ) : (traces.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-mxm-content-secondary">No autonomous actions recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-mxm border border-mxm-border">
          <table className="w-full text-sm">
            <thead className="bg-mxm-bg-secondary text-left text-xs text-mxm-content-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Level</th>
                <th className="px-3 py-2 font-medium">Independent?</th>
                <th className="px-3 py-2 font-medium">Time to sign</th>
              </tr>
            </thead>
            <tbody>
              {traces.data!.map((t) => (
                <tr key={t.traceId} className="border-t border-mxm-border">
                  <td className="px-3 py-2 text-mxm-content-secondary">{t.ts.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-mxm-content">{t.action}</td>
                  <td className="px-3 py-2 text-mxm-content">{t.effectiveLevelApplied ?? "—"}</td>
                  <td className="px-3 py-2 text-mxm-content-secondary">
                    {t.independenceGuaranteed === null ? "—" : t.independenceGuaranteed ? "yes" : "no"}
                  </td>
                  <td className="px-3 py-2 text-mxm-content-secondary">
                    {t.timeToSignatureSec === null ? "not measured" : `${t.timeToSignatureSec}s`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AutonomousRegistry open={registryOpen} onClose={() => setRegistryOpen(false)} />
      <EscalatedList open={escOpen} onClose={() => setEscOpen(false)} />
    </section>
  );
}
