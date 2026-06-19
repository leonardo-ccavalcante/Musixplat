import { Modal } from "@/components/ui/Modal";
import { trpc } from "@/lib/trpc";
import { fmtNum } from "@/lib/utils";

// The 11-field handoff dossier (#8) in display order. The screen shows EVERY field (even when partial),
// marking the gaps honestly — the gate's job is to block INCOMPLETE handoff, not to hide what it has.
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
const numOrDash = (v: unknown): string => (typeof v === "number" ? fmtNum(v) : v == null ? "—" : String(v));

// Defensive one-line summary per field — never throws on a malformed/partial payload (§3.10 / §4).
function summarize(field: string, v: unknown): string {
  try {
    switch (field) {
      case "f1_tipo_raiz":
        return isObj(v) ? `${v.area_type ?? "—"} · ${v.hypothesis_root ?? "—"} (conf ${numOrDash(v.confidence)})` : "—";
      case "f2_evidence": {
        const paths = isObj(v) && Array.isArray(v.paths) ? v.paths.length : 0;
        return `${paths} ranked path(s)`;
      }
      case "f3_who":
        return Array.isArray(v) ? `${v.length} affected · ${v.filter((a) => isObj(a) && a.silent).length} silent` : "—";
      case "f4_where_concentrated":
        return isObj(v) ? `${v.dim ?? "—"} = ${v.value ?? "—"} (${numOrDash(v.n)})` : "—";
      case "f5_how_much":
        return isObj(v)
          ? `R$ ${numOrDash(v.revenue_lost)} · churn ${numOrDash(v.churn_risk)} · cost ${numOrDash(v.cost_to_resolve)}`
          : "—";
      case "f6_recurrence":
        return isObj(v) ? `${numOrDash(v.frequency)}× since ${String(v.first_seen_ts ?? "").slice(0, 10) || "—"}` : "—";
      case "f7_similar_cases":
        return Array.isArray(v) ? `${v.length} similar case(s)` : "—";
      case "f8_auditable_hypothesis":
        return isObj(v) ? `${v.hypothesis_root ?? "—"} (conf ${numOrDash(v.confidence)})` : "—";
      case "f9_suggested_route":
        return v == null ? "—" : String(v);
      case "f10_raw_data":
        return isObj(v) ? Object.keys(v).join(", ") || "—" : "—";
      case "f11_provenance":
        return isObj(v) ? Object.entries(v).map(([k, p]) => `${k} ${String(p)}`).join(" · ") || "—" : "—";
      default:
        return "—";
    }
  } catch {
    return "—";
  }
}

function DossierBody({ data }: { data: { emitted: boolean; gaps: string[]; fields: Record<string, unknown> | null } }) {
  const gaps = new Set(data.gaps);
  const ready = FIELD_LABELS.filter(([f]) => !gaps.has(f)).length;
  return (
    <div className="space-y-3">
      <div
        role="status"
        className={`rounded-mxm border px-3 py-2 text-sm ${
          data.emitted ? "border-mxm-green text-mxm-green" : "border-mxm-amber text-mxm-amber"
        }`}
      >
        {data.emitted
          ? "✓ Complete — ready to hand off to the next feature (11/11)"
          : `Partial — ${ready}/11 ready · won't emit until complete (gap: ${data.gaps.join(", ")})`}
      </div>
      <dl className="divide-y divide-mxm-border">
        {FIELD_LABELS.map(([f, label]) => (
          <div key={f} className="grid grid-cols-[9.5rem_1fr] gap-3 py-2">
            <dt className="text-xs text-mxm-content-secondary">{label}</dt>
            <dd className="break-words text-xs text-mxm-content">
              {summarize(f, data.fields?.[f])}
              {gaps.has(f) && <span className="ml-1 text-mxm-amber">· incomplete</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// US-B6.3.1 — read-only dossier viewer. Opens when problemId is set; tenant + ownership enforced server-side.
export function DossierModal({ problemId, onClose }: { problemId: string | null; onClose: () => void }) {
  const q = trpc.diagnosis.getDossier.useQuery({ problemId: problemId ?? "" }, { enabled: !!problemId });
  return (
    <Modal open={!!problemId} onClose={onClose} title="Dossier #8 — handoff">
      {q.isLoading ? (
        <p role="status" aria-live="polite" className="text-sm text-mxm-content-secondary">
          Loading dossier…
        </p>
      ) : q.isError ? (
        <p role="alert" className="text-sm text-mxm-red">
          Failed to load dossier
        </p>
      ) : q.data ? (
        <DossierBody data={q.data} />
      ) : null}
    </Modal>
  );
}
