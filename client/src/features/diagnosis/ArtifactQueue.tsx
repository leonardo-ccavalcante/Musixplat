import { Button } from "@/components/ui/Button";
import type { ArtifactRow } from "@shared/contracts_05c";

// 05C/02 human exception gate, surfaced. The operator reviews EXCEPTIONS (pending artifacts), not every
// case: approve / reject / escalate — each writes an append-only 4-eyes trace server-side ("sin trace no
// hay acción"). Decided artifacts show their trace id. No artifact renders "done" without a trace.
export type ArtifactAction = "approve" | "reject" | "escalate";

export function ArtifactQueue({
  artifacts,
  onDecide,
  busyId,
}: {
  artifacts: ArtifactRow[];
  onDecide: (id: string, action: ArtifactAction) => void;
  busyId: string | null;
}) {
  if (artifacts.length === 0) return null;
  return (
    <section aria-label="Artifacts — needs your decision" className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-mxm-content">Artifacts · needs your decision</h2>
      <ul className="space-y-2">
        {artifacts.map((a) => (
          <li key={a.artifact_id} className="rounded-mxm border border-mxm-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <span className="text-mxm-content">{a.artifact_type}</span>
                <span className="ml-2 text-xs text-mxm-content-secondary">→ {a.target_metric}</span>
                <span className="ml-2 rounded bg-mxm-bg-elevated px-1.5 py-0.5 text-xs text-mxm-content-secondary">
                  {a.status}
                </span>
              </div>
              {a.status === "pending_review" ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="text-mxm-content-inverted"
                    disabled={busyId === a.artifact_id}
                    onClick={() => onDecide(a.artifact_id, "approve")}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busyId === a.artifact_id}
                    onClick={() => onDecide(a.artifact_id, "reject")}
                  >
                    Reject
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busyId === a.artifact_id}
                    onClick={() => onDecide(a.artifact_id, "escalate")}
                  >
                    Escalate
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-mxm-content-secondary">
                  {a.status} · trace {a.decision_trace_id?.slice(0, 8) ?? "—"}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
