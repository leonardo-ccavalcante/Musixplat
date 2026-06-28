import { Fragment, useId, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { CapEditModal } from "./CapEditModal";
import { EvalStatusBadge } from "./EvalStatusBadge";
import { CollapsibleTier } from "./CollapsibleTier";
import type { ObservatoryCapRow, ObservatoryEvalCell } from "@shared/contracts_observatory";

// §14 honest-pending + §3.10 provenance gate.
const cell = (v: number | boolean | null, prov?: string): string =>
  v === null ? "not measured" : !prov ? "no provenance" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v);

// Limits = how far the AI may go, per tier, as a scannable table: tier · proven · your cap · runs-alone.
// The honest split (§3.10/§14): PROVEN is producer-measured ([V], read-only) and shown as the BEST cohort
// promoted in the tier (with a K/M count so it never reads as tier-wide — runtime autonomy is per cohort via
// least()); YOUR CAP is the human lever ([V], edited via the EXISTING cockpit template/upload); RUNS-ALONE =
// least(proven, cap). A tier row expands to its per-cohort eval evidence (n/κ/red-team/provenance) so the
// measured detail is never lost. A tier with evals but NO in-pool cap still renders (evidence stays visible).
export function LimitsTier({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const caps = trpc.observatory.capTable.useQuery(undefined, { enabled: true });
  const evals = trpc.observatory.evalList.useQuery(undefined, { enabled: true });
  const [capOpen, setCapOpen] = useState(false);
  const [openTiers, setOpenTiers] = useState<Set<string>>(() => new Set());

  const capByTier = new Map((caps.data ?? []).map((c) => [c.tier, c]));
  const cellsByTier = (evals.data ?? []).reduce<Record<string, ObservatoryEvalCell[]>>((acc, e) => {
    const k = e.tierBase ?? "—";
    (acc[k] ??= []).push(e);
    return acc;
  }, {});
  // a row per tier with EITHER an approved cap OR eval cells — so the [I]/[V] eval evidence stays visible even
  // for a tier/pool with no in-pool-signed Policy_Tier (cap rows and eval floors are scoped differently).
  const tiers = [...new Set([...capByTier.keys(), ...Object.keys(cellsByTier)])].sort();
  const isLoading = caps.isLoading || evals.isLoading;
  const isError = caps.isError || evals.isError;
  const summary = capByTier.size > 0 ? "· you set the ceiling, signed by you" : "· measured evals (no cap set yet)";

  return (
    <>
      <CollapsibleTier
        title="Limits"
        summary={summary}
        open={open}
        onOpenChange={onOpenChange}
        actions={
          <Button variant="ghost" onClick={() => setCapOpen(true)}>
            Edit limits…
          </Button>
        }
      >
        {isLoading ? (
          <div className="h-20 animate-pulse rounded-mxm border border-mxm-border" />
        ) : isError ? (
          <p className="text-sm text-mxm-red">Couldn&apos;t read limits — try again.</p>
        ) : tiers.length === 0 ? (
          <p className="text-sm text-mxm-content-secondary">
            No approved limits or measured evals for this pool yet — prepare the cockpit or upload limits.
          </p>
        ) : (
          <div className="overflow-hidden rounded-mxm border border-mxm-border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-mxm-content-tertiary">
                  <th scope="col" className="px-3 py-2 font-normal">Tier</th>
                  <th scope="col" className="px-3 py-2 font-normal">Proven (best, measured)</th>
                  <th scope="col" className="px-3 py-2 font-normal text-mxm-brand">Your cap</th>
                  <th scope="col" className="px-3 py-2 font-normal">Runs alone</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <TierRow
                    key={tier}
                    tier={tier}
                    cap={capByTier.get(tier)}
                    cells={cellsByTier[tier] ?? []}
                    open={openTiers.has(tier)}
                    onToggle={() =>
                      setOpenTiers((p) => {
                        const n = new Set(p);
                        if (n.has(tier)) n.delete(tier);
                        else n.add(tier);
                        return n;
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
            <p className="border-t border-mxm-border px-3 py-2 text-[0.7rem] text-mxm-content-tertiary">
              Proven is the highest cohort the AI has promoted in this tier (measured, read-only); the count shows
              how many. You set the cap. &ldquo;Runs alone&rdquo; is a ceiling — &ldquo;up to X&rdquo; means the best
              cohort; each cohort acts at the lower of its own level and the cap, unmeasured cohorts at LOW, and a
              tier with no signed cap can&apos;t act alone at all. Open a tier for the per-cohort detail.
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
  cap,
  cells,
  open,
  onToggle,
}: {
  tier: string;
  cap?: ObservatoryCapRow;
  cells: ObservatoryEvalCell[];
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  // promoted = cells whose LEVEL is human-promoted ([V]); the count makes the tier "best" honest (most cells
  // are usually not promoted). Only shown for a tier with an approved cap (where proven is producer-computed).
  const promoted = cells.filter((c) => c.provenanceByField?.released_evals === "[V]").length;
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
        <td className="px-3 py-2 text-mxm-content-tertiary">
          {cap ? (
            <>
              {cap.proven ?? "not graded"}
              {cells.length > 0 ? <span> · {promoted}/{cells.length} promoted</span> : null}
            </>
          ) : (
            "—"
          )}
        </td>
        <td className="px-3 py-2 font-medium text-mxm-content">{cap ? cap.yourCap : "not set"}</td>
        {/* runs-alone honesty: no in-pool cap ⇒ auto-dispatch fails closed, the AI can't act alone here
            ("none", not LOW); a cap with nothing promoted ⇒ every cohort runs at the LOW floor; a cap with
            promoted cohorts ⇒ "up to X" (a ceiling — the best cohort; others run lower), never tier-wide. */}
        <td className="px-3 py-2 text-mxm-content-secondary">
          {!cap ? (
            <span title="No in-pool signed cap — the AI can't act alone here">none</span>
          ) : cap.proven ? (
            `up to ${cap.runsAlone}`
          ) : (
            "LOW"
          )}
        </td>
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
