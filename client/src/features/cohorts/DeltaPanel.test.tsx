import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeltaPanel } from "./DeltaPanel";
import type { DeltaRow } from "@shared/contracts";

const row = (id: string, delta: DeltaRow["delta_status"], gap: number): DeltaRow => ({
  evento_id: id,
  restaurant_id: id,
  cohort_id: "c1",
  delta_status: delta,
  percentile_in_cohort: 50,
  gap_to_top: gap,
});

describe("F-2.3 DeltaPanel", () => {
  it("renders at_risk accounts on top regardless of input order", () => {
    render(
      <DeltaPanel
        rows={[
          row("R-up", "melhorou_percentile", 1),
          row("R-risk1", "at_risk", 5),
          row("R-down", "baixou_percentile", 9),
          row("R-risk2", "at_risk", 20),
        ]}
      />,
    );
    const bodyRows = screen.getAllByRole("row").slice(1); // drop header
    // at_risk first, ordered by gap desc within the band
    expect(within(bodyRows[0]!).getByText("R-risk2")).toBeInTheDocument();
    expect(within(bodyRows[1]!).getByText("R-risk1")).toBeInTheDocument();
    expect(bodyRows[0]).toHaveAttribute("data-delta", "at_risk");
  });

  it("shows an explicit empty state (never green-fake) when there are no deltas", () => {
    render(<DeltaPanel rows={[]} />);
    expect(screen.getByText(/Sin deltas/i)).toBeInTheDocument();
  });

  it("passes NULL through as — (never a fabricated number)", () => {
    render(<DeltaPanel rows={[{ ...row("R1", "new", 0), percentile_in_cohort: null, gap_to_top: null }]} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
