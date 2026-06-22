import type { ReactNode } from "react";
import { Disclosure } from "@/components/ui/Disclosure";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { fmtNum } from "@/lib/utils";
import type { DiagnosisListRow } from "@shared/contracts_05b";
import type { ArtifactRow } from "@shared/contracts_05c";
import type { ProvTag } from "@shared/contracts";

// 05B — "passo a passo o diagnóstico feito pela IA e por quê". The orchestrator (B.2→B.8) persists each
// step's output; this view READS them back as the process the AI took. Executive line = the strategic
// shape; each step = the produced data + provenance. A missing field shows "incomplete", never a fake (§14).
export interface DiagnosisStepsView {
  emitted: boolean;
  gaps: string[];
  fields: Record<string, unknown> | null;
}
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, dash = "incomplete"): string => (v == null || v === "" ? dash : String(v));
const money = (v: unknown): string => (typeof v === "number" ? fmtNum(v) : "incomplete");
const provOf = (fields: Record<string, unknown> | null, key: string): ProvTag | null => {
  const p = isObj(fields?.f11_provenance) ? (fields!.f11_provenance as Record<string, unknown>)[key] : null;
  return typeof p === "string" ? (p as ProvTag) : null;
};

type Affected = { restaurant_id?: unknown; complained?: unknown; silent?: unknown };
interface Step { label: string; summary: string; prov?: ProvTag | null; detail: ReactNode }

export function DiagnosisSteps({
  row,
  view,
  artifact,
}: {
  row: DiagnosisListRow;
  view: DiagnosisStepsView;
  artifact: ArtifactRow | null;
}) {
  const f = view.fields ?? {};
  const f1 = isObj(f.f1_tipo_raiz) ? f.f1_tipo_raiz : {};
  const paths = isObj(f.f2_evidence) && Array.isArray(f.f2_evidence.paths) ? f.f2_evidence.paths : [];
  const who = (Array.isArray(f.f3_who) ? f.f3_who : []) as Affected[];
  const conc = isObj(f.f4_where_concentrated) ? f.f4_where_concentrated : {};
  const impact = isObj(f.f5_how_much) ? f.f5_how_much : {};
  const sims = Array.isArray(f.f7_similar_cases) ? f.f7_similar_cases : [];
  const area = str(f1.area_type ?? row.area_type);
  const conf = f1.confidence ?? row.confidence;

  const steps: Step[] = [
    { label: "Classify (B.2)", summary: `${area} · confidence ${str(conf)}`, prov: provOf(f, "area_type"),
      detail: <p>Root hypothesis: {str(f1.hypothesis_root ?? row.hypothesis_root)}. Classification is text-only (the AI ranks, never measures).</p> },
    { label: "Issue tree (B.3)", summary: `${paths.length} ranked hypothesis path(s)`,
      detail: <ul className="space-y-0.5">{paths.map((p, i) => <li key={i}>{isObj(p) ? `${str(p.hypothesis)} (p≈${str(p.probability)})` : "—"}</li>)}</ul> },
    { label: "Hunt silent (B.5)", summary: `${row.affected} affected · ${row.silent} silent`,
      detail: who.length === 0 ? <p>No population resolved (fail-closed).</p> : (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto">{who.map((a, i) => (
          <li key={`${str(a.restaurant_id, "r")}-${i}`} className="flex justify-between gap-3">
            <span className="text-mxm-content">{str(a.restaurant_id)}</span>
            <span className={a.silent ? "text-mxm-brand" : "text-mxm-content-secondary"}>{a.silent ? "silent · never spoke" : "spoke up"}</span>
          </li>))}</ul>) },
    { label: "Ground in KB (B.6)", summary: `${sims.length} prior precedent(s)`,
      detail: <p>Grounded against: {sims.length ? sims.map(String).map((s) => s.slice(0, 8)).join(", ") : "no precedent (degrade-to-human if also low confidence)"}.</p> },
    { label: "Quantify impact (B.7)", summary: `€ ${money(impact.revenue_lost)} at risk`, prov: provOf(f, "revenue_lost"),
      detail: <p>cost to resolve € {money(impact.cost_to_resolve)} · value recoverable € {money(impact.value_gained)} · churn {money(impact.churn_risk)} (no pre-churn producer ⇒ floor, not ceiling).</p> },
    { label: "Route (B.8)", summary: str(f.f9_suggested_route ?? row.suggested_route),
      detail: <p>Deterministic route stub (1 rule per area); a policy decides notify-vs-fix-silently downstream.</p> },
    { label: "Concentration", summary: `${str(conc.dim)} = ${str(conc.value)} (${str(conc.n)})`,
      detail: <p>The single biggest cut where the failure concentrates (real GROUP BY over the affected set).</p> },
    { label: "Dossier gate", summary: view.emitted ? "complete (11/11) — cleared for handoff" : `partial · gaps: ${view.gaps.join(", ") || "—"}`,
      detail: <p>Fail-closed: the dossier is not handed off until all 11 fields are present with provenance.</p> },
    { label: "Artifact (05C)", summary: artifact ? `${artifact.artifact_type} → ${artifact.target_metric}` : "no artifact yet — generate from a complete dossier",
      detail: <p>{artifact ? `Status: ${artifact.status}. Open it to see the email + impacted list.` : "Fail-closed: a partial dossier never becomes an artifact."}</p> },
  ];

  return (
    <section aria-label="How the AI diagnosed" className="space-y-3">
      <p className="rounded-mxm border border-mxm-border bg-mxm-bg-secondary px-3 py-2 text-sm text-mxm-content-secondary">
        The AI turned one {row.origin === "proactive" ? "monitor alert" : "ticket"} into a pool-wide diagnosis:{" "}
        <span className="text-mxm-content">{row.affected} affected, {row.silent} silent</span>, quantified, grounded and gated.
        Below is every step with the data it produced.
      </p>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Disclosure
              title={
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-mxm-content-tertiary tabnum">{i + 1}.</span>
                  <span>{s.label}</span>
                  <span className="text-mxm-content-secondary">— {s.summary}</span>
                  {s.prov && <ProvenanceBadge prov={s.prov} />}
                </span>
              }
            >
              <div className="text-xs leading-relaxed text-mxm-content-secondary">{s.detail}</div>
            </Disclosure>
          </li>
        ))}
      </ol>
    </section>
  );
}
