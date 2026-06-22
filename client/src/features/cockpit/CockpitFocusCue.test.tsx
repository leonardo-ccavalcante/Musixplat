import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CockpitFocusCue } from "./CockpitFocusCue";

// 02:CP — the focus cue: a persistent, readable banner (not a vanishing toast) that explains WHERE the
// handoff landed, and honestly covers the rare "no proposal yet" case. "Show all" clears the focus.
describe("02:CP CockpitFocusCue", () => {
  it("present ⇒ tells the operator where the handoff landed + the cohort id", () => {
    render(<CockpitFocusCue cohortId="pizza_centro" present={true} onClear={() => {}} />);
    expect(screen.getByText(/where your handoff landed/i)).toBeInTheDocument();
    expect(screen.getByText("pizza_centro")).toBeInTheDocument();
  });

  it("absent ⇒ honest 'no proposal yet, run Prepare cockpit / Run NBA' (never a blank, §14/§7)", () => {
    render(<CockpitFocusCue cohortId="pizza_centro" present={false} onClear={() => {}} />);
    expect(screen.getByText(/no proposal/i)).toBeInTheDocument();
    expect(screen.getByText(/run nba/i)).toBeInTheDocument();
  });

  it("'Show all' clears the focus", () => {
    const onClear = vi.fn();
    render(<CockpitFocusCue cohortId="cX" present={true} onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
