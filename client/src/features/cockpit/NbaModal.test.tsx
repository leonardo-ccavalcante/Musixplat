import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NbaModal } from "./NbaModal";
import type { NbaCockpitRow } from "@shared/contracts";

// 02 — the operator must SEE what the NBA is, the PATH it recommends, and WHERE to change it (Leo: "ver
// quais são essas NBAs... qual é o path... onde posso entrar para alterar"). Every field is READ from the
// produced proposal row; before_after_expected is a [C] projection, never a fabricated measurement.
const nba = (over: Partial<NbaCockpitRow> = {}): NbaCockpitRow => ({
  nba_id: "n1",
  cohort_id: "C-finance-Centro",
  action_type: "Proactive payment-retry outreach",
  root_cause: "payment gateway timeout concentrated in Centro",
  financial_class: "indirect",
  effective_level: "MEDIUM",
  auto_releasable: false,
  before_after_expected: { dimension: "recovery_rate", measured: 0.42, standard: 0.78, gap: 0.36 },
  status: "needs_human",
  reason: "level",
  cohort_rule_version: "v1",
  ...over,
});

describe("02 NbaModal — the NBA made legible + editable", () => {
  it("closed when no NBA is selected", () => {
    render(<NbaModal row={null} onClose={() => {}} onAction={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the NBA: the recommended action, its cohort, and the root cause", () => {
    render(<NbaModal row={nba()} onClose={() => {}} onAction={() => {}} />);
    expect(screen.getByText(/Proactive payment-retry outreach/)).toBeInTheDocument();
    // cohort shows in both the title and the body (intended) — assert presence, not uniqueness.
    expect(screen.getAllByText(/C-finance-Centro/).length).toBeGreaterThan(0);
    expect(screen.getByText(/payment gateway timeout concentrated in Centro/)).toBeInTheDocument();
  });

  it("shows THE PATH it indicates (before → after projection), marked [C]", () => {
    render(<NbaModal row={nba()} onClose={() => {}} onAction={() => {}} />);
    expect(screen.getByText(/recovery_rate/)).toBeInTheDocument();
    expect(screen.getByText(/0\.42/)).toBeInTheDocument();
    expect(screen.getByText(/0\.78/)).toBeInTheDocument();
    expect(screen.getAllByText("[C]").length).toBeGreaterThan(0); // projection, never measured
  });

  it("shows the autonomy level and WHY a human is needed (the min() reason)", () => {
    render(<NbaModal row={nba()} onClose={() => {}} onAction={() => {}} />);
    expect(screen.getByText(/MEDIUM/)).toBeInTheDocument();
    expect(screen.getAllByText(/needs human/i).length).toBeGreaterThan(0);
  });

  it("needs_human ⇒ Release + Pause are the edit (override only DOWN), and they fire onAction", () => {
    const onAction = vi.fn();
    render(<NbaModal row={nba()} onClose={() => {}} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /^Release$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Pause$/ }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ nba_id: "n1" }), "RELEASE");
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ nba_id: "n1" }), "PAUSE");
  });

  it("auto ⇒ no Release (the AI acts alone), Pause still available to override down", () => {
    render(<NbaModal row={nba({ status: "auto", reason: null, auto_releasable: true })} onClose={() => {}} onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: /^Release$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pause$/ })).toBeInTheDocument();
  });
});
