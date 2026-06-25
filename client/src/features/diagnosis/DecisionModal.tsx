import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DECISION_AREAS, type DecisionArea, type DiagnosisListRow } from "@shared/contracts_05b";

// 05D Part C — the human decision console. A needs_human case is no longer a dead-end: the operator confirms
// or OVERRIDES the AI's area and writes the WHY (required). On submit it becomes a reviewed Knowledge_Case
// (grounds future runs) and the problem leaves the queue. No number is entered — the rationale is the [C] WHY.
// Presentational (the page owns the mutation, mirroring ArtifactModal): onSubmit(area, rationale) + pending/error.
const isArea = (v: string | null): v is DecisionArea => v != null && (DECISION_AREAS as readonly string[]).includes(v);

export function DecisionModal({
  row,
  onClose,
  onSubmit,
  pending = false,
  errorMsg,
}: {
  row: DiagnosisListRow | null;
  onClose: () => void;
  onSubmit: (areaType: DecisionArea, rationale: string) => void;
  pending?: boolean;
  errorMsg?: string | null;
}) {
  const [area, setArea] = useState<DecisionArea>("unclassified");
  const [rationale, setRationale] = useState("");

  // Pre-fill with the AI's area each time a new case opens (the human confirms or overrides it).
  useEffect(() => {
    if (row) {
      setArea(isArea(row.area_type) ? row.area_type : "unclassified");
      setRationale("");
    }
  }, [row?.problem_id]);

  if (!row) return null;
  const tooShort = rationale.trim().length < 3;

  return (
    <Modal open={!!row} onClose={onClose} title={`Record your decision · ${row.restaurant_id}`}>
      <div className="grid gap-4">
        <p className="text-xs leading-relaxed text-mxm-content-secondary">
          The AI flagged this for you (low confidence or a 2-brain area conflict). Confirm or override the area
          and write the reason — it becomes a reviewed precedent the AI learns from.
        </p>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-mxm-content">Area</span>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as DecisionArea)}
            className="rounded-mxm border border-mxm-border bg-mxm-bg px-3 py-2 text-mxm-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
          >
            {DECISION_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
                {a === row.area_type ? " (AI’s read)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-mxm-content">
            Why <span className="text-mxm-content-tertiary">(required)</span>
          </span>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="What is actually wrong, and what should be done?"
            className="resize-y rounded-mxm border border-mxm-border bg-mxm-bg px-3 py-2 text-mxm-content placeholder:text-mxm-content-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
          />
        </label>

        {errorMsg && (
          <p role="alert" className="text-sm text-mxm-red">
            Fail-closed: {errorMsg}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => !tooShort && onSubmit(area, rationale.trim())}
            disabled={tooShort || pending}
            className="text-mxm-content-inverted"
          >
            {pending ? "Recording…" : "Record decision"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
