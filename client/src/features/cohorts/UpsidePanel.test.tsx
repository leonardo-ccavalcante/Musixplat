import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UpsidePanel } from "./UpsidePanel";

// F-1.7 — upside projection render. ALWAYS [C]; read-only, never ascends to [V].
describe("F-1.7 UpsidePanel", () => {
  it("renders lift_orders + attribution + a [C] provenance badge", () => {
    render(
      <UpsidePanel
        baseline={{
          upside: {
            lift_orders: 320,
            unit: "órdenes/mes",
            attribution: { connection: 140, quality: 90, cancel: 50, price: null },
            prov: "[C]",
          },
        }}
      />,
    );
    expect(screen.getByText(/\+320/)).toBeInTheDocument();
    expect(screen.getByText("140")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
    // null attribution field ⇒ em-dash, never 0
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByLabelText("provenance [C]")).toBeInTheDocument();
    // read-only note
    expect(screen.getByText(/Projection — read-only, not an action/i)).toBeInTheDocument();
  });

  it("shows empty message when upside missing", () => {
    render(<UpsidePanel baseline={{}} />);
    expect(screen.getByText(/No upside computed/i)).toBeInTheDocument();
  });
});
