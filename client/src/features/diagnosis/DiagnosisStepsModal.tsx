import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";
import { DiagnosisSteps } from "./DiagnosisSteps";
import type { DiagnosisListRow } from "@shared/contracts_05b";
import type { ArtifactRow } from "@shared/contracts_05c";

// 05B — "How the AI diagnosed" drill. Reads the dossier gate (getDossier) for the produced step fields and
// renders the process the orchestrator took (DiagnosisSteps). A link opens the full 11-field dossier. The
// matching artifact (if generated) is passed so the last step shows the real artifact, never a faked one.
export function DiagnosisStepsModal({
  row,
  artifact,
  onClose,
  onOpenDossier,
}: {
  row: DiagnosisListRow | null;
  artifact: ArtifactRow | null;
  onClose: () => void;
  onOpenDossier: (row: DiagnosisListRow) => void;
}) {
  const q = trpc.diagnosis.getDossier.useQuery({ problemId: row?.problem_id ?? "" }, { enabled: !!row });
  return (
    <Modal open={!!row} onClose={onClose} title={row ? `How the AI diagnosed · ${row.restaurant_id}` : "How the AI diagnosed"}>
      {q.isLoading ? (
        <p role="status" aria-live="polite" className="text-sm text-mxm-content-secondary">
          Reading the diagnosis trace…
        </p>
      ) : q.isError ? (
        <p role="alert" className="text-sm text-mxm-red">
          Failed to load the diagnosis
        </p>
      ) : q.data && row ? (
        <div className="space-y-4">
          <DiagnosisSteps row={row} view={q.data} artifact={artifact} />
          <div className="flex justify-end border-t border-mxm-border pt-3">
            <Button variant="ghost" onClick={() => onOpenDossier(row)}>
              Open full dossier (11 fields)
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
