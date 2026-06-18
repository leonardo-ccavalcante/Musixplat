import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttributionDetail } from "./AttributionDetail";
import type { PercentileDelta } from "@shared/contracts";

// F-2.4 — why-it-moved: render root_cause as en label, never fabricate (prov gates it).
describe("F-2.4 AttributionDetail", () => {
  it("renders nothing when delta is null", () => {
    const { container } = render(<AttributionDetail delta={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when delta is undefined", () => {
    const { container } = render(
      <AttributionDetail delta={undefined as unknown as PercentileDelta} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders 'new (no history)' for a new account", () => {
    render(<AttributionDetail delta={{ sentido: "new" }} />);
    expect(screen.getByText(/new \(no history\)/i)).toBeInTheDocument();
  });

  it("maps each root_cause to its human en label", () => {
    const cases: Array<[NonNullable<PercentileDelta>["root_cause"], string]> = [
      ["orders", "fewer sales"],
      ["cancel", "more cancellations"],
      ["connection", "less connection"],
      ["quality", "lower quality"],
      ["none", "no attributable cause"],
    ];
    for (const [cause, label] of cases) {
      const { unmount } = render(
        <AttributionDetail delta={{ sentido: "down", root_cause: cause }} />,
      );
      expect(screen.getByText(new RegExp(label, "i"))).toBeInTheDocument();
      unmount();
    }
  });

  it("shows orders_delta and the provenance badge", () => {
    render(
      <AttributionDetail
        delta={{
          sentido: "down",
          magnitud: 5,
          ventana_dias: 7,
          n_min_ok: true,
          orders_delta: -3,
          root_cause: "orders",
          prov: "[V]",
        }}
      />,
    );
    expect(screen.getByText(/fewer sales/i)).toBeInTheDocument();
    expect(screen.getByText(/-3/)).toBeInTheDocument();
    expect(screen.getByLabelText("provenance [V]")).toBeInTheDocument();
  });

  it("renders the cause without a badge when prov is absent (never faked)", () => {
    render(<AttributionDetail delta={{ sentido: "down", root_cause: "quality" }} />);
    expect(screen.getByText(/lower quality/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/provenance/)).not.toBeInTheDocument();
  });
});
