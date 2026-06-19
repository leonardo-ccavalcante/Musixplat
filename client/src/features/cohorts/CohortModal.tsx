import { Modal } from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/EmptyState";
import { FreshnessBadge } from "@/components/ui/FreshnessBadge";
import { ProvenanceLegend } from "@/components/ui/ProvenanceLegend";
import { trpc } from "@/lib/trpc";
import { DrillTable, type DrillRow } from "./DrillTable";
import { CohortProfile } from "./CohortProfile";
import { UpsidePanel } from "./UpsidePanel";
import type { CohortCell, DescriptiveBaseline } from "@shared/contracts";

// F-4.1 / EPIC-4 — cohort context modal: definition + freshness (BR-12) + PERFIL (F-1.5) + UPSIDE
// (F-1.7) + drill (F-5.1). Modal a11y handled by Modal (focus-trap, Esc, focus-return, aria-modal).
// Renders only the DB-computed NUMERIC profile — the "who is this cohort" prose is an AGENTE piece.
export function CohortModal({ cell, onClose }: { cell: CohortCell | null; onClose: () => void }) {
  const drill = trpc.cohorts.drill.useQuery({ cohort_id: cell?.cohort_id ?? "" }, { enabled: !!cell });
  const compare = trpc.cohorts.compare.useQuery({ cohort_id: cell?.cohort_id ?? "" }, { enabled: !!cell });
  const baseline = (compare.data?.baseline ?? null) as DescriptiveBaseline;
  return (
    <Modal open={!!cell} onClose={onClose} title={cell ? `Cohort ${cell.cohort_id}` : ""}>
      {cell && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-mxm-content-tertiary">Tier</dt>
              <dd className="text-mxm-content">{cell.tier_base}</dd>
              <dt className="text-mxm-content-tertiary">Cuisine</dt>
              <dd className="text-mxm-content">{cell.cuisine ?? "—"}</dd>
              <dt className="text-mxm-content-tertiary">Zone</dt>
              <dd className="text-mxm-content">{cell.zone ?? "—"}</dd>
              <dt className="text-mxm-content-tertiary">n_accounts</dt>
              {/* k-anon: never reveal a small n for a suppressed cell */}
              <dd className="tabnum text-mxm-content">
                {cell.status === "suppressed" ? "—" : (cell.n_accounts ?? "—")}
              </dd>
            </dl>
            <FreshnessBadge freshness={cell.freshness_ts} stale={cell.stale} />
          </div>

          {/* decode the [V]/[C]/[I] confidence codes the profile/upside stamp — don't assume the reader knows them */}
          <ProvenanceLegend />

          {compare.isLoading ? (
            <LoadingState />
          ) : (
            <>
              <CohortProfile baseline={baseline} suppressed={compare.data?.suppressed ?? false} />
              <UpsidePanel baseline={baseline} />
            </>
          )}

          <div>
            <h3 className="mb-1 text-xs font-semibold text-mxm-content-secondary">
              Accounts (by gap)
            </h3>
            {drill.isLoading ? (
              <LoadingState />
            ) : (
              <DrillTable rows={(drill.data ?? []) as DrillRow[]} />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
