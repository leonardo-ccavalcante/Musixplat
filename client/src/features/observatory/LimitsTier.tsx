import { Fragment, useId, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { CapEditModal } from "./CapEditModal";
import { EvalStatusBadge } from "./EvalStatusBadge";
import { CollapsibleTier } from "./CollapsibleTier";
import type { ObservatoryEvalCell } from "@shared/contracts_observatory";

// §14 honest-pending + §3.10 provenance gate.
const cell = (v: number | boolean | null, prov?: string): string =>
  v === null ? "not measured" : !prov ? "no provenance" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v);

// Limits = how far the AI may go, per tier, as a scannable table: tier · proven · your cap · runs-alone.
// The honest split (§3.10/§14): PROVEN is producer-measured ([V], read-only); YOUR CAP is the human lever
// ([V], edited via the EXISTING cockpit template/upload — CapEditModal → managerProcedure); the AI acts at
// RUNS-ALONE = least(proven, cap). A tier row expands to its per-cohort eval evidence (n/kappa/red-team/
// provenance) so the measured detail is never lost. The expand toggle is a real <button aria-expanded>.
export function LimitsTier({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const caps = trpc.observatory.capTable.useQuery(undefined, { enabled: true });
  const evals = trpc.observatory.evalList.useQuery(undefined, { enabled: true });
  const [capOpen, setCapOpen] = useState(false);
  const [openTiers, setOpenTiers] = useState<Set<string>>(() => new Set());
  const rows = caps.data ?? [];
  const cellsByTier = (evals.data ?? []).reduce<Record<string, ObservatoryEvalCell[]>>((acc, e) => {
    const k = e.tierBase ?? "—";
    (acc[k] ??= []).push(e);
    return acc;
  }, {});

  return (
    <>
      <CollapsibleTier
        title="Limits"
        summary={rows.length > 0 ? `· ${rows.length} tiers · you set the ceiling, signed by you` : "· you set the ceiling here"}
        open={open}
        onOpenChange={onOpenChange}
        actions={
          <Button variant="ghost" onClick={() => setCapOpen(true)}>
            Edit limits…
          </Button>
        }
      >
        {caps.isLoading ? (
          <div className="h-20 animate-pulse rounded-mxm border border-mxm-border" />
        ) : caps.isError ? (
          <p className="text-sm text-mxm-red">Couldn&apos;t read limits — try again.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-mxm-content-secondary">
            No approved limits for this pool yet — prepare the cockpit or upload limits to set a ceiling.
          </p>
        ) : (
          <div className="overflow-hidden rounded-mxm border border-mxm-border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-mxm-content-tertiary">
                  <th scope="col" className="px-3 py-2 font-normal">Tier</th>
                  <th scope="col" className="px-3 py-2 font-normal">Proven (measured)</th>
                  <th scope="col" className="px-3 py-2 font-normal text-mxm-brand">Your cap</th>
                  <th scope="col" className="px-3 py-2 font-normal">Runs alone</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <TierRow
                    key={t.tier}
                    tier={t.tier}
                    proven={t.proven}
                    yourCap={t.yourCap}
                    runsAlone={t.runsAlone}
                    cells={cellsByTier[t.tier] ?? []}
                    open={openTiers.has(t.tier)}
                    onToggle={() =>
                      setOpenTiers((p) => {
                        const n = new Set(p);
                        if (n.has(t.tier)) n.delete(t.tier);
                        else n.add(t.tier);
                        return n;
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
            <p className="border-t border-mxm-border px-3 py-2 text-[0.7rem] text-mxm-content-tertiary">
              Proven is measured by the AI (read-only). You set the cap; it acts at the lower of the two.
            </p>
          </div>
        )}
      </CollapsibleTier>
      <CapEditModal
        open={capOpen}
        onClose={() => {
          setCapOpen(false);
          void caps.refetch();
        }}
      />
    </>
  );
}

function TierRow({
  tier,
  proven,
  yourCap,
  runsAlone,
  cells,
  open,
  onToggle,
}: {
  tier: string;
  proven: string | null;
  yourCap: string;
  runsAlone: string;
  cells: ObservatoryEvalCell[];
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  return (
    <Fragment>
      <tr className="border-t border-mxm-border">
        <td className="px-3 py-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={onToggle}
            className="flex items-center gap-1.5 rounded-mxm text-mxm-content hover:text-mxm-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mxm-brand"
          >
            <span aria-hidden="true" className={`text-mxm-content-tertiary transition-transform ${open ? "rotate-90" : ""}`}>
              ▸
            </span>
            {tier}
          </button>
        </td>
        <td className="px-3 py-2 text-mxm-content-tertiary">{proven ?? "not graded"}</td>
        <td className="px-3 py-2 font-medium text-mxm-content">{yourCap}</td>
        <td className="px-3 py-2 text-mxm-content-secondary">{runsAlone}</td>
      </tr>
      <tr id={id} hidden={!open}>
        <td colSpan={4} className="bg-mxm-bg-secondary px-3 py-2">
          {cells.length === 0 ? (
            <p className="text-xs text-mxm-content-tertiary">No eval cells for this tier yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {cells.map((e) => (
                <li key={`${e.cohortId}-${e.intent}-${e.version}`} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-mxm-content">
                      {e.cohortId} <span className="text-mxm-content-secondary">· {e.intent}</span>
                    </span>
                    <EvalStatusBadge status={e.status} prov={e.provenanceByField?.status} />
                  </div>
                  <div className="mt-0.5 text-mxm-content-tertiary">
                    n {cell(e.nCohortXIntent, e.provenanceByField?.n_cohort_x_intent)} · κ{" "}
                    {cell(e.kappa, e.provenanceByField?.kappa)} · red-team{" "}
                    {cell(e.redteamIndependenceFlag, e.provenanceByField?.redteam_independence_flag)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </td>
      </tr>
    </Fragment>
  );
}
