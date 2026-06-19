import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CockpitBoard } from "./CockpitBoard";
import type { NbaCockpitRow } from "@shared/contracts";

const row = (over: Partial<NbaCockpitRow>): NbaCockpitRow => ({
  nba_id: "n1",
  cohort_id: "c1",
  action_type: "A1",
  root_cause: "connection below standard",
  financial_class: "none",
  effective_level: "LOW",
  auto_releasable: true,
  before_after_expected: null,
  status: "auto",
  reason: null,
  cohort_rule_version: "v1",
  ...over,
});

describe("02:F-1.1 CockpitBoard", () => {
  it("empty ⇒ explicit empty state (never green-fake)", () => {
    render(<CockpitBoard rows={[]} onAction={() => {}} actionState={{}} />);
    expect(screen.getByText(/proposed no actions/i)).toBeInTheDocument();
  });

  it("groups by cohort; Release only on needs-human, Pause on every row", () => {
    const rows = [
      row({ nba_id: "a1", cohort_id: "c1", status: "auto", auto_releasable: true }),
      row({ nba_id: "h1", cohort_id: "c1", status: "needs_human", reason: "money", financial_class: "direct", auto_releasable: false }),
      row({ nba_id: "a2", cohort_id: "c2", status: "auto" }),
    ];
    render(<CockpitBoard rows={rows} onAction={() => {}} actionState={{}} />);
    expect(screen.getByLabelText("Cohort c1")).toBeInTheDocument();
    expect(screen.getByLabelText("Cohort c2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Release" })).toHaveLength(1); // only the needs-human row
    expect(screen.getAllByRole("button", { name: "Pause" })).toHaveLength(3); // human can pause any row (override down)
  });

  it("Release fires onAction(row, RELEASE)", () => {
    const onAction = vi.fn();
    render(
      <CockpitBoard
        rows={[row({ nba_id: "h1", status: "needs_human", reason: "gates", auto_releasable: false })]}
        onAction={onAction}
        actionState={{}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Release" }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ nba_id: "h1" }), "RELEASE");
  });

  it("done state hides actions and shows the recorded trace", () => {
    render(
      <CockpitBoard
        rows={[row({ nba_id: "h1", status: "needs_human", auto_releasable: false })]}
        onAction={() => {}}
        actionState={{ h1: { status: "done", msg: "Released ✓ trace abcd1234" } }}
      />,
    );
    expect(screen.getByText(/Released ✓/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
  });
});
