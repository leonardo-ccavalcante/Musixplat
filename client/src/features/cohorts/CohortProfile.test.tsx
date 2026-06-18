import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CohortProfile } from "./CohortProfile";

// F-1.5 — numeric/structured PERFIL render. NO prose (that is AGENTE). Read-only; null ⇒ "—".
describe("F-1.5 CohortProfile", () => {
  it("renders a KPI value + its family provenance badge", () => {
    render(
      <CohortProfile
        baseline={{
          kpis: {
            volume: { total_orders: 1240, avg_orders: 3.1, avg_ticket: 18.5, gmv: 22940, prov: "[V]" },
            connection: { ratio: 0.82, prov: "[I]" },
          },
        }}
      />,
    );
    // value rendered as-is (no invented transform)
    expect(screen.getByText("1240")).toBeInTheDocument();
    expect(screen.getByText("0.82")).toBeInTheDocument();
    // family provenance badge present
    expect(screen.getByLabelText("provenance [V]")).toBeInTheDocument();
    expect(screen.getByLabelText("provenance [I]")).toBeInTheDocument();
  });

  it("shows suppression message when suppressed", () => {
    render(<CohortProfile baseline={null} suppressed />);
    expect(screen.getByText(/Profile suppressed by k-anonymity/i)).toBeInTheDocument();
  });

  it("shows 'No profile' when kpis missing", () => {
    render(<CohortProfile baseline={{}} />);
    expect(screen.getByText(/No profile computed/i)).toBeInTheDocument();
  });

  it("renders '—' for a null field, never a fabricated 0", () => {
    render(
      <CohortProfile
        baseline={{
          kpis: {
            volume: { total_orders: 100, avg_orders: null, avg_ticket: null, gmv: null, prov: "[V]" },
          },
        }}
      />,
    );
    expect(screen.getByText("100")).toBeInTheDocument();
    // three null fields ⇒ three em-dashes, no zeros invented
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});
