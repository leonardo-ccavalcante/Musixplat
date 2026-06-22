import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DecisionModal } from "./DecisionModal";
import type { DiagnosisListRow } from "@shared/contracts_05b";

// 05D Part C — the human decision console. Closed dead-end: a needs_human case now gets a decision + WHY.
// Presentational (page owns the mutation): pre-fills the AI's area, requires a non-trivial rationale, and
// emits onSubmit(area, rationale). Numbers are never entered — the rationale is the [C] WHY.
const row = (over: Partial<DiagnosisListRow> = {}): DiagnosisListRow =>
  ({
    problem_id: "p1", restaurant_id: "R-DC-1", status: "needs_human", criticality: "critical",
    area_type: "performance", hypothesis_root: null, confidence: null, affected: 3, silent: 1,
    silent_status: "ok", revenue_lost: null, suggested_route: null, frequency: 1,
    first_seen_ts: "2026-06-22T00:00:00Z", origin: "reactive", needs_human: true, ...over,
  }) as DiagnosisListRow;

describe("05D Part C DecisionModal", () => {
  it("closed when no row is selected", () => {
    render(<DecisionModal row={null} onClose={() => {}} onSubmit={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pre-fills the AI's area and blocks submit until a reason is written", () => {
    const onSubmit = vi.fn();
    render(<DecisionModal row={row()} onClose={() => {}} onSubmit={onSubmit} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("performance"); // AI's read pre-filled
    const submit = screen.getByRole("button", { name: /record decision/i });
    expect(submit).toBeDisabled(); // no rationale yet
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("emits onSubmit(area, rationale) — the human can OVERRIDE the area", () => {
    const onSubmit = vi.fn();
    render(<DecisionModal row={row()} onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "finance" } }); // override performance→finance
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "refund dispute — reissue" } });
    fireEvent.click(screen.getByRole("button", { name: /record decision/i }));
    expect(onSubmit).toHaveBeenCalledWith("finance", "refund dispute — reissue");
  });

  it("surfaces a fail-closed error", () => {
    render(<DecisionModal row={row()} onClose={() => {}} onSubmit={() => {}} errorMsg="cross-pool decision blocked" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/cross-pool decision blocked/);
  });
});
