import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiagnosisSteps } from "./DiagnosisSteps";
import type { DiagnosisListRow } from "@shared/contracts_05b";
import type { ArtifactRow } from "@shared/contracts_05c";

// 05B — "ver passo a passo o diagnóstico feito pela IA e por quê". Every step renders the PRODUCED data the
// orchestrator persisted (classify → issue-tree → silent-hunt → KB → impact → route → concentration →
// dossier → artifact). No fabricated narrative number: a missing field shows "incomplete", never a fake.
const row = (over: Partial<DiagnosisListRow> = {}): DiagnosisListRow => ({
  problem_id: "p1",
  restaurant_id: "R-PAY-001",
  status: "open",
  origin: "reactive",
  needs_human: false,
  criticality: "critical",
  area_type: "finance",
  hypothesis_root: "payment was not executed",
  confidence: 0.6,
  affected: 47,
  silent: 35,
  silent_status: "evaluable",
  revenue_lost: 3760,
  suggested_route: "fix_internal",
  frequency: 1,
  first_seen_ts: "2026-06-19T00:00:00Z",
  ...over,
});

const fields = {
  f1_tipo_raiz: { area_type: "finance", hypothesis_root: "payment was not executed", confidence: 0.6 },
  f2_evidence: { paths: [{ hypothesis: "payment was not executed", probability: 0.7 }, { hypothesis: "refund dispute", probability: 0.2 }] },
  f3_who: [
    { restaurant_id: "R-PAY-001", complained: true, silent: false },
    { restaurant_id: "R-PAY-002", complained: false, silent: true },
  ],
  f4_where_concentrated: { dim: "zone", value: "Centro", n: 30 },
  f5_how_much: { revenue_lost: 3760, churn_risk: null, cost_to_resolve: 705, value_gained: 2256 },
  f6_recurrence: { frequency: 1, first_seen_ts: "2026-06-19", last_seen_ts: "2026-06-19" },
  f7_similar_cases: ["kb-1234abcd"],
  f8_auditable_hypothesis: { hypothesis_root: "payment was not executed", confidence: 0.6 },
  f9_suggested_route: "fix_internal",
  f10_raw_data: { affected: 47, silent: 35, revenue_lost: 3760 },
  f11_provenance: { area_type: "[C]", revenue_lost: "[I]" },
};
const completeView = { emitted: true, gaps: [] as string[], fields };

const artifact: ArtifactRow = {
  artifact_id: "a1",
  problem_id: "p1",
  artifact_type: "email_content",
  target_metric: "recover_failed_payment_value",
  status: "pending_review",
  content: {},
  decision_trace_id: null,
  created_at: "2026-06-19T00:00:00Z",
};

describe("05B DiagnosisSteps — how the AI diagnosed", () => {
  it("opens an executive summary of the produced diagnosis (area, counts, €)", () => {
    render(<DiagnosisSteps row={row()} view={completeView} artifact={artifact} />);
    const region = screen.getByRole("region", { name: /how the AI diagnosed/i });
    const exec = within(region).getByText(/finance/i);
    expect(exec).toBeInTheDocument();
    expect(within(region).getAllByText(/47/).length).toBeGreaterThan(0);
    expect(within(region).getAllByText(/35/).length).toBeGreaterThan(0);
  });

  it("step Hunt-silent shows the produced counts AND the impacted list (silent marked)", () => {
    render(<DiagnosisSteps row={row()} view={completeView} artifact={artifact} />);
    expect(screen.getByText(/R-PAY-002/)).toBeInTheDocument(); // a silent one, surfaced by name
    expect(screen.getAllByText(/silent/i).length).toBeGreaterThanOrEqual(1);
  });

  it("step Quantify-impact shows the produced € (read, never computed in the UI)", () => {
    render(<DiagnosisSteps row={row()} view={completeView} artifact={artifact} />);
    expect(screen.getByText(/3,?760/)).toBeInTheDocument();
  });

  it("step Classify carries provenance (the AI classification is [C], never measured)", () => {
    render(<DiagnosisSteps row={row()} view={completeView} artifact={artifact} />);
    expect(screen.getAllByText("[C]").length).toBeGreaterThan(0);
  });

  it("step Dossier shows the 11/11 gate verdict", () => {
    render(<DiagnosisSteps row={row()} view={completeView} artifact={artifact} />);
    expect(screen.getByText(/11\s*\/\s*11/)).toBeInTheDocument();
  });

  it("step Artifact when none yet ⇒ honest 'no artifact', never a faked one", () => {
    render(<DiagnosisSteps row={row()} view={completeView} artifact={null} />);
    expect(screen.getByText(/no artifact/i)).toBeInTheDocument();
  });

  it("a partial dossier surfaces the gap honestly (fail-closed), not a fabricated value", () => {
    const partial = { emitted: false, gaps: ["f5_how_much"], fields: { ...fields, f5_how_much: { revenue_lost: null } } };
    render(<DiagnosisSteps row={row({ revenue_lost: null })} view={partial} artifact={null} />);
    expect(screen.getAllByText(/incomplete|partial|pending/i).length).toBeGreaterThan(0);
  });
});
