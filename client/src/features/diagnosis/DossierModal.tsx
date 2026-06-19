import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ProvenanceLegend } from "@/components/ui/ProvenanceLegend";
import { trpc } from "@/lib/trpc";
import { fmtNum } from "@/lib/utils";
import type { DiagnosisListRow } from "@shared/contracts_05b";
import { printDossierMemo, type DossierData } from "./dossierMemo";
import { openEmailPreview } from "./dossierEmail";

const FIELD_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["f1_tipo_raiz", "Type & root"],
  ["f2_evidence", "Evidence (issue-tree)"],
  ["f3_who", "Who is affected"],
  ["f4_where_concentrated", "Where it concentrates"],
  ["f5_how_much", "How much (R$ + churn)"],
  ["f6_recurrence", "Recurrence"],
  ["f7_similar_cases", "Similar cases (KB)"],
  ["f8_auditable_hypothesis", "Hypothesis"],
  ["f9_suggested_route", "Suggested route"],
  ["f10_raw_data", "Raw data (already fetched)"],
  ["f11_provenance", "Provenance per field"],
];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numOrDash = (v: unknown): string => (typeof v === "number" ? fmtNum(v) : v == null ? "n/a" : String(v));

function summarize(field: string, v: unknown): string {
  try {
    switch (field) {
      case "f1_tipo_raiz":
        return isObj(v) ? `${v.area_type ?? "n/a"} · ${v.hypothesis_root ?? "n/a"} (conf ${numOrDash(v.confidence)})` : "n/a";
      case "f2_evidence":
        return `${isObj(v) && Array.isArray(v.paths) ? v.paths.length : 0} ranked path(s)`;
      case "f3_who":
        return Array.isArray(v) ? `${v.length} affected · ${v.filter((a) => isObj(a) && a.silent).length} silent` : "n/a";
      case "f4_where_concentrated":
        return isObj(v) ? `${v.dim ?? "n/a"} = ${v.value ?? "n/a"} (${numOrDash(v.n)})` : "n/a";
      case "f5_how_much":
        return isObj(v)
          ? `R$ ${numOrDash(v.revenue_lost)} · churn ${numOrDash(v.churn_risk)} · cost ${numOrDash(v.cost_to_resolve)}`
          : "n/a";
      case "f6_recurrence":
        return isObj(v) ? `${numOrDash(v.frequency)}× since ${String(v.first_seen_ts ?? "").slice(0, 10) || "n/a"}` : "n/a";
      case "f8_auditable_hypothesis":
        return isObj(v) ? `${v.hypothesis_root ?? "n/a"} (conf ${numOrDash(v.confidence)})` : "n/a";
      case "f9_suggested_route":
        return v == null ? "n/a" : String(v);
      case "f10_raw_data":
        return isObj(v) ? Object.keys(v).join(", ") || "n/a" : "n/a";
      case "f11_provenance":
        return isObj(v) ? Object.entries(v).map(([k, p]) => `${k} ${String(p)}`).join(" · ") || "n/a" : "n/a";
      default:
        return "n/a";
    }
  } catch {
    return "n/a";
  }
}

// Clickable KB precedent links — the dossier's "similar cases" open the actual case (BR-B3 grounding).
function SimilarCases({ ids, onOpen }: { ids: unknown; onOpen: (id: string) => void }) {
  const list = Array.isArray(ids) ? ids.map(String) : [];
  if (list.length === 0) return <span className="text-mxm-content">n/a</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {list.map((id) => (
        <button
          key={id}
          onClick={() => onOpen(id)}
          className="rounded border border-mxm-border px-1.5 text-mxm-brand underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand"
        >
          case {id.slice(0, 8)}
        </button>
      ))}
    </span>
  );
}

// In-modal KB case panel — opens when a similar-case link is clicked; Back returns to the dossier.
function KbCasePanel({ kbCaseId, onBack }: { kbCaseId: string; onBack: () => void }) {
  const q = trpc.diagnosis.getKnowledgeCase.useQuery({ kbCaseId });
  const row = (label: string, v: unknown) => (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-1.5">
      <dt className="text-xs text-mxm-content-secondary">{label}</dt>
      <dd className="break-words text-xs text-mxm-content">{v == null || v === "" ? "n/a" : String(v)}</dd>
    </div>
  );
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-mxm-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-mxm-brand">
        ← Back to dossier
      </button>
      <h3 className="text-sm font-semibold text-mxm-content">Knowledge case · {kbCaseId.slice(0, 8)}</h3>
      {q.isLoading ? (
        <p role="status" aria-live="polite" className="text-sm text-mxm-content-secondary">Loading case…</p>
      ) : q.isError ? (
        <p role="alert" className="text-sm text-mxm-red">Failed to load case</p>
      ) : q.data ? (
        <dl className="divide-y divide-mxm-border">
          {row("Area", q.data.area_type)}
          {row("Pattern", q.data.pattern)}
          {row("Outcome", q.data.outcome)}
          {row("Resolution", q.data.resolution)}
          {row("Not-resolved reason", q.data.not_resolved_reason)}
          {row("Historical probability", q.data.probability)}
          {row("Discarded branches", Array.isArray(q.data.discarded_branches) ? q.data.discarded_branches.length + " tried" : "n/a")}
          {row("Recorded", String(q.data.created_at).slice(0, 10))}
        </dl>
      ) : null}
    </div>
  );
}

function DossierBody({ row, data }: { row: DiagnosisListRow; data: DossierData }) {
  const [kbCaseId, setKbCaseId] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const gaps = new Set(data.gaps);
  const ready = FIELD_LABELS.filter(([f]) => !gaps.has(f)).length;

  if (kbCaseId) return <KbCasePanel kbCaseId={kbCaseId} onBack={() => setKbCaseId(null)} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="status"
          className={`flex-1 rounded-mxm border px-3 py-2 text-sm ${
            data.emitted ? "border-mxm-green text-mxm-green" : "border-mxm-amber text-mxm-amber"
          }`}
        >
          {data.emitted
            ? "✓ Complete · ready to hand off (11/11)"
            : `Partial · ${ready}/11 ready · won't emit until complete (gap: ${data.gaps.join(", ")})`}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => printDossierMemo(row, data, today)} title="Open a print-ready memo (Save as PDF)">
            Download PDF
          </Button>
          <Button variant="ghost" onClick={() => openEmailPreview(row, data, today)}>
            Email
          </Button>
        </div>
      </div>

      <dl className="divide-y divide-mxm-border">
        {FIELD_LABELS.map(([f, label]) => (
          <div key={f} className="grid grid-cols-[9.5rem_1fr] gap-3 py-2">
            <dt className="text-xs text-mxm-content-secondary">{label}</dt>
            <dd className="break-words text-xs text-mxm-content">
              {f === "f7_similar_cases" ? (
                <SimilarCases ids={data.fields?.f7_similar_cases} onOpen={setKbCaseId} />
              ) : (
                <>
                  {summarize(f, data.fields?.[f])}
                  {gaps.has(f) && <span className="ml-1 text-mxm-amber">· incomplete</span>}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <ProvenanceLegend className="border-t border-mxm-border pt-3" />
    </div>
  );
}

// US-B6.3.1 — read-only dossier viewer (PDF memo + email + clickable KB precedents + provenance legend).
export function DossierModal({ row, onClose }: { row: DiagnosisListRow | null; onClose: () => void }) {
  const q = trpc.diagnosis.getDossier.useQuery({ problemId: row?.problem_id ?? "" }, { enabled: !!row });
  return (
    <Modal open={!!row} onClose={onClose} title="Dossier #8 · handoff">
      {q.isLoading ? (
        <p role="status" aria-live="polite" className="text-sm text-mxm-content-secondary">
          Loading dossier…
        </p>
      ) : q.isError ? (
        <p role="alert" className="text-sm text-mxm-red">
          Failed to load dossier
        </p>
      ) : q.data && row ? (
        <DossierBody row={row} data={q.data} />
      ) : null}
    </Modal>
  );
}
