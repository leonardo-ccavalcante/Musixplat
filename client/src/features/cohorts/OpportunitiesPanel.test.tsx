import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CohortCell, DeltaRow } from "@shared/contracts";
import { OpportunitiesPanel } from "./OpportunitiesPanel";

const delta = (over: Partial<DeltaRow> & Pick<DeltaRow, "cohort_id">): DeltaRow => ({
  evento_id: "e1",
  restaurant_id: "r1",
  week: "2026-06-15",
  delta_status: "at_risk",
  percentile_in_cohort: 0.2,
  gap_to_top: 0.5,
  percentile_delta: null,
  ...over,
});

const cell = (over: Partial<CohortCell> & Pick<CohortCell, "cohort_id">): CohortCell => ({
  cuisine: "sushi",
  zone: "z1",
  tier_base: "long_tail",
  n_accounts: 10,
  status: "ok",
  freshness_ts: null,
  stale: null,
  ...over,
});

describe("OpportunitiesPanel — where to act (top-5 + show-all by cohort)", () => {
  it("shows the top opportunities and opens the cohort modal on click", () => {
    const onOpen = vi.fn();
    const c = cell({ cohort_id: "x" });
    render(
      <OpportunitiesPanel
        deltas={[delta({ evento_id: "e1", cohort_id: "x", restaurant_id: "r1" })]}
        cells={[c]}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /r1/ }));
    expect(onOpen).toHaveBeenCalledWith(c);
  });

  it("reveals all opportunities grouped by cohort when expanded", () => {
    render(
      <OpportunitiesPanel
        deltas={[
          delta({ evento_id: "e1", cohort_id: "x", restaurant_id: "r1", gap_to_top: 0.5 }),
          delta({ evento_id: "e2", cohort_id: "x", restaurant_id: "r2", gap_to_top: 0.3 }),
        ]}
        cells={[cell({ cohort_id: "x" })]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Show all opportunities/ }));
    expect(screen.getByRole("button", { name: /Hide all opportunities, by cohort \(2\)/ })).toBeInTheDocument();
  });

  it("renders an honest empty state with no opportunities", () => {
    render(<OpportunitiesPanel deltas={[]} cells={[]} />);
    expect(screen.getByText(/No opportunities/)).toBeInTheDocument();
  });
});
