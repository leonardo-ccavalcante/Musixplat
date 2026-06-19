import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiagnosisBoard } from "./DiagnosisBoard";
import type { DiagnosisListRow } from "@shared/contracts_05b";

const row = (over: Partial<DiagnosisListRow>): DiagnosisListRow => ({
  problem_id: "p1",
  restaurant_id: "R-PAY-001",
  status: "open",
  origin: "reactive",
  needs_human: false,
  criticality: "critical",
  area_type: "finance",
  hypothesis_root: "payment was not executed",
  confidence: 0.7,
  affected: 47,
  silent: 35,
  silent_status: "evaluable",
  revenue_lost: 3760,
  suggested_route: "fix_internal",
  frequency: 1,
  first_seen_ts: "2026-06-19T00:00:00Z",
  ...over,
});

describe("05B DiagnosisBoard", () => {
  it("empty ⇒ explicit honest empty state (never green-fake)", () => {
    render(<DiagnosisBoard rows={[]} onOpen={() => {}} />);
    expect(screen.getByText(/Nothing to report/i)).toBeInTheDocument();
  });

  it("leads with the reverse-cascade hero showing produced affected + silent counts", () => {
    render(<DiagnosisBoard rows={[row({ origin: "proactive" })]} onOpen={() => {}} />);
    const hero = screen.getByRole("region", { name: "Silent cascade" });
    expect(within(hero).getByText("47")).toBeInTheDocument();
    expect(within(hero).getByText("35")).toBeInTheDocument();
    expect(within(hero).getByText(/caught before a ticket/i)).toBeInTheDocument(); // proactive mark
  });

  it("picks the biggest hidden problem (most silent) as the headline", () => {
    render(
      <DiagnosisBoard
        rows={[row({ problem_id: "small", silent: 2, affected: 4 }), row({ problem_id: "big", silent: 35, affected: 47 })]}
        onOpen={() => {}}
      />,
    );
    const hero = screen.getByRole("region", { name: "Silent cascade" });
    expect(within(hero).getByText("35")).toBeInTheDocument();
  });

  it("surfaces a degraded problem in a 'Needs your decision' queue (BR-B3 fail-closed)", () => {
    render(<DiagnosisBoard rows={[row({ needs_human: true, status: "needs_human" })]} onOpen={() => {}} />);
    const queue = screen.getByRole("region", { name: "Needs your decision" });
    expect(within(queue).getAllByText(/needs you/i).length).toBeGreaterThan(0);
  });

  it("BR-B4 honest empty: a not_evaluable population is shown, never as zero", () => {
    render(<DiagnosisBoard rows={[row({ silent_status: "not_evaluable" })]} onOpen={() => {}} />);
    expect(screen.getAllByText(/not evaluable/i).length).toBeGreaterThan(0);
  });

  it("Open dossier fires onOpen(row)", () => {
    const onOpen = vi.fn();
    render(<DiagnosisBoard rows={[row({ problem_id: "p9" })]} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /Open dossier/i }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ problem_id: "p9" }));
  });
});
