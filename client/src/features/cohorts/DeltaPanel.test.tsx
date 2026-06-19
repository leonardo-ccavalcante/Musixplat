import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeltaPanel } from "./DeltaPanel";
import type { DeltaRow, PercentileDelta } from "@shared/contracts";

const row = (
  id: string,
  delta: DeltaRow["delta_status"],
  gap: number,
  pd: PercentileDelta = null,
): DeltaRow => ({
  evento_id: id,
  restaurant_id: id,
  cohort_id: "c1",
  week: "2026-06-15",
  delta_status: delta,
  percentile_in_cohort: 50,
  gap_to_top: gap,
  percentile_delta: pd,
});

const cause = (root: NonNullable<PercentileDelta>["root_cause"], prov?: string): PercentileDelta => ({
  sentido: "down",
  root_cause: root,
  ...(prov ? { prov } : {}),
});

describe("F-2.3 DeltaPanel — grouped by cause", () => {
  it("groups rows by why-it-moved and orders groups by size desc (chips show counts)", () => {
    render(
      <DeltaPanel
        rows={[
          row("R-q1", "percentile_down", 9, cause("quality")),
          row("R-q2", "percentile_down", 8, cause("quality")),
          row("R-c1", "percentile_down", 7, cause("cancel")),
        ]}
      />,
    );
    // two filter chips, the larger group's chip carries its count
    expect(screen.getByRole("button", { name: /lower quality 2/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more cancellations 1/i })).toBeInTheDocument();
  });

  it("orders at_risk first then gap desc WITHIN a group", () => {
    render(
      <DeltaPanel
        rows={[
          row("R-down", "percentile_down", 9, cause("quality")),
          row("R-risk1", "at_risk", 5, cause("quality")),
          row("R-risk2", "at_risk", 20, cause("quality")),
        ]}
      />,
    );
    const bodyRows = screen.getAllByRole("row").slice(1); // drop header row
    expect(within(bodyRows[0]!).getByText("R-risk2")).toBeInTheDocument();
    expect(within(bodyRows[1]!).getByText("R-risk1")).toBeInTheDocument();
    expect(bodyRows[0]).toHaveAttribute("data-delta", "at_risk");
  });

  it("filtering by a cause chip hides rows of the other causes", () => {
    render(
      <DeltaPanel
        rows={[row("R-q", "percentile_down", 9, cause("quality")), row("R-c", "percentile_down", 7, cause("cancel"))]}
      />,
    );
    expect(screen.getByText("R-q")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /more cancellations 1/i }));
    expect(screen.queryByText("R-q")).not.toBeInTheDocument();
    expect(screen.getByText("R-c")).toBeInTheDocument();
  });

  it("shows an explicit empty state (never green-fake) when there are no deltas", () => {
    render(<DeltaPanel rows={[]} />);
    expect(screen.getByText(/No deltas/i)).toBeInTheDocument();
  });

  it("passes NULL percentile/gap through as — (never a fabricated number)", () => {
    render(
      <DeltaPanel
        rows={[{ ...row("R1", "at_risk", 0, cause("quality")), percentile_in_cohort: null, gap_to_top: null }]}
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the per-row provenance in the compact Why cell (cause label is the group header)", () => {
    render(<DeltaPanel rows={[row("R-why", "percentile_down", 4, cause("orders", "[V]"))]} />);
    // group header carries the label; the row keeps provenance per field (§3.10)
    expect(screen.getByLabelText("provenance [V]")).toBeInTheDocument();
  });
});
