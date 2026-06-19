import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TicketsPanel, type IntentCount } from "./TicketsPanel";

const after = (a: HTMLElement, b: HTMLElement) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("F-3.3 TicketsPanel — grouped by intent", () => {
  it("orders intent groups by total volume desc and cohorts within by count desc", () => {
    const counts: IntentCount[] = [
      { cohort_id: "x", intent: "billing", n: 2 },
      { cohort_id: "y", intent: "billing", n: 5 },
      { cohort_id: "z", intent: "delivery", n: 9 },
    ];
    render(<TicketsPanel counts={counts} />);
    // delivery total 9 > billing total 7 ⇒ delivery group first
    expect(after(screen.getByText("delivery"), screen.getByText("billing"))).toBe(true);
    // within billing, y (5) before x (2)
    expect(after(screen.getByText("y"), screen.getByText("x"))).toBe(true);
  });

  it("shows the per-intent total as the group count", () => {
    render(
      <TicketsPanel
        counts={[
          { cohort_id: "a", intent: "menu", n: 3 },
          { cohort_id: "b", intent: "menu", n: 4 },
        ]}
      />,
    );
    expect(screen.getByText("menu")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument(); // 3 + 4
  });

  it("renders an explicit empty state (never green-fake)", () => {
    render(<TicketsPanel counts={[]} />);
    expect(screen.getByText(/No tickets/i)).toBeInTheDocument();
  });
});
