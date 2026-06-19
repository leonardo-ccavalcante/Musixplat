import { render, screen, within, fireEvent } from "@testing-library/react";
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

  it("splits into a 'Needs your decision' queue and a calm 'Auto-handled' list", () => {
    const rows = [
      row({ nba_id: "a1", cohort_id: "co_alpha", status: "auto", auto_releasable: true }),
      row({ nba_id: "h1", cohort_id: "co_beta", status: "needs_human", reason: "money", financial_class: "direct", auto_releasable: false }),
      row({ nba_id: "a2", cohort_id: "co_gamma", status: "auto" }),
    ];
    render(<CockpitBoard rows={rows} onAction={() => {}} actionState={{}} />);
    const needs = screen.getByRole("region", { name: "Needs your decision" });
    const auto = screen.getByRole("region", { name: "Auto-handled by the AI" });

    // the money row sits in the needs queue, with its cohort shown as context + a Release action
    expect(within(needs).getByText("co_beta")).toBeInTheDocument();
    expect(within(needs).getByRole("button", { name: "Release" })).toBeInTheDocument();
    // auto rows live in the calm section — no Release
    expect(within(auto).getByText("co_alpha")).toBeInTheDocument();
    expect(within(auto).queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
    // every row can be paused (human override down)
    expect(screen.getAllByRole("button", { name: "Pause" })).toHaveLength(3);
  });

  it("empty needs-queue ⇒ reassuring message, not a blank", () => {
    render(<CockpitBoard rows={[row({ status: "auto" })]} onAction={() => {}} actionState={{}} />);
    expect(screen.getByText(/Nothing needs you/i)).toBeInTheDocument();
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
