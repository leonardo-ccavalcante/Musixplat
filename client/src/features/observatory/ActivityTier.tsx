import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { AutonomousRegistry } from "@/features/cockpit/AutonomousRegistry";
import { EscalatedList } from "@/features/cockpit/EscalatedList";
import { CollapsibleTier } from "./CollapsibleTier";

const PREVIEW = 6; // show a calm preview; the full audit lives in the existing registry modal

// Activity = what the AI did ALONE (origin='auto'), as a scannable table (when · what · freedom · mode ·
// checks). The deep per-trace audit (proposer/confirmer/independence/time-to-sign/gates) stays in the
// EXISTING AutonomousRegistry modal — "Show all" opens it (no rebuild). RESULT/NULL fields render an honest
// "—" (§14), never 0. Decision_Trace is append-only; read-only here. Checks is icon+text, never color-only.
export function ActivityTier({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const traces = trpc.observatory.traces.useQuery(undefined, { enabled: true });
  const [registryOpen, setRegistryOpen] = useState(false);
  const [escOpen, setEscOpen] = useState(false);
  const rows = traces.data ?? [];
  const flagged = rows.filter((t) => t.rubberStampFlag === true).length;
  // "all clear" only when EVERY check was measured false — a NULL rubber_stamp_flag is pre-run, not clean
  // (§14): never fabricate a clean governance result from unmeasured data.
  const allMeasuredClean = rows.length > 0 && rows.every((t) => t.rubberStampFlag === false);

  const summary = !traces.isSuccess
    ? "· …"
    : rows.length === 0
      ? "· nothing autonomous yet"
      : `· ${rows.length} autonomous${
          flagged > 0 ? ` · ${flagged} to check` : allMeasuredClean ? " · all clear" : " · checks pending"
        }`;

  return (
    <>
      <CollapsibleTier
        title="Activity"
        summary={summary}
        open={open}
        onOpenChange={onOpenChange}
        actions={
          <>
            {/* the full per-trace audit (proposer/confirmer/independence/time-to-sign/gates) lives in the
                registry — always reachable, not only when the preview table is truncated. */}
            <Button variant="ghost" onClick={() => setRegistryOpen(true)}>
              Full registry…
            </Button>
            <Button variant="ghost" onClick={() => setEscOpen(true)}>
              Escalations…
            </Button>
            <Link
              href="/cockpit"
              className="inline-flex min-h-[24px] items-center rounded-mxm px-2 text-sm text-mxm-content-secondary hover:text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mxm-brand"
            >
              Release / pause on Cockpit →
            </Link>
          </>
        }
      >
        {traces.isLoading ? (
          <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
        ) : traces.isError ? (
          <p className="text-sm text-mxm-red">Couldn&apos;t read traces — try again.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-mxm-content-secondary">No autonomous actions recorded yet.</p>
        ) : (
          <div className="overflow-hidden rounded-mxm border border-mxm-border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-mxm-content-tertiary">
                  <th scope="col" className="px-3 py-2 font-normal">When</th>
                  <th scope="col" className="px-3 py-2 font-normal">What it did</th>
                  <th scope="col" className="px-3 py-2 font-normal">Freedom</th>
                  <th scope="col" className="px-3 py-2 font-normal">Mode</th>
                  <th scope="col" className="px-3 py-2 font-normal">Checks</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PREVIEW).map((t) => (
                  <tr key={t.traceId} className="border-t border-mxm-border">
                    <td className="px-3 py-2 tabular-nums text-mxm-content-tertiary">{t.ts.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-mxm-content">{t.action}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-mxm bg-mxm-bg-secondary px-1.5 py-0.5 text-mxm-content-secondary">
                        {t.effectiveLevelApplied ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-mxm-content-secondary">{t.confirmerId === null ? "Alone" : "Reviewed"}</td>
                    <td className="px-3 py-2">
                      {t.rubberStampFlag === true ? (
                        <span className="text-mxm-amber">⚠ to check</span>
                      ) : t.rubberStampFlag === false ? (
                        <span className="text-mxm-green">✓ clean</span>
                      ) : (
                        <span className="text-mxm-content-tertiary">— not measured</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length > PREVIEW && (
                  <tr className="border-t border-mxm-border">
                    <td colSpan={5} className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setRegistryOpen(true)}
                        className="rounded-mxm px-1 text-mxm-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mxm-brand"
                      >
                        Show all {rows.length} →
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleTier>
      <AutonomousRegistry open={registryOpen} onClose={() => setRegistryOpen(false)} />
      <EscalatedList open={escOpen} onClose={() => setEscOpen(false)} />
    </>
  );
}
