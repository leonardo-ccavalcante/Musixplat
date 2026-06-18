import { Modal } from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/EmptyState";
import { trpc } from "@/lib/trpc";
import { DrillTable, type DrillRow } from "./DrillTable";
import type { CohortCell } from "./SemaforoCohort";

// F-4.1 — cohort synthesis modal: definition + drill (F-5.1). Modal a11y handled by Modal
// (focus-trap, Esc, focus-return, aria-modal). Does NOT generate the PERFIL text (that is an
// AGENTE piece) — only renders the definition and opens the drill.
export function CohortModal({ cell, onClose }: { cell: CohortCell | null; onClose: () => void }) {
  const drill = trpc.cohorts.drill.useQuery(
    { cohort_id: cell?.cohort_id ?? "" },
    { enabled: !!cell },
  );
  return (
    <Modal open={!!cell} onClose={onClose} title={cell ? `Cohort ${cell.cohort_id}` : ""}>
      {cell && (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt className="text-mxm-content-tertiary">Tier</dt>
            <dd className="text-mxm-content">{cell.tier_base}</dd>
            <dt className="text-mxm-content-tertiary">Tenure</dt>
            <dd className="text-mxm-content">{cell.tenure_bucket}</dd>
            <dt className="text-mxm-content-tertiary">n_accounts</dt>
            <dd className="tabnum text-mxm-content">{cell.n_accounts ?? "—"}</dd>
          </dl>
          <div>
            <h3 className="mb-1 text-xs font-semibold text-mxm-content-secondary">
              Cuentas (order por gap)
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
