import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SemaforoCohort, type CohortCell } from "./SemaforoCohort";

const cell = (status: CohortCell["status"], id = status): CohortCell => ({
  cohort_id: id,
  tenure_bucket: "0-3m",
  tier_base: "long_tail",
  n_cuentas: 10,
  status,
});

describe("F-2.1 Semáforo", () => {
  it("carries status via TEXT (not color only) for every state", () => {
    render(
      <SemaforoCohort
        cells={[cell("ok"), cell("collapsed"), cell("suppressed"), cell("pending")]}
      />,
    );
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText(/n<n_min/)).toBeInTheDocument();
    expect(screen.getByText(/k-anon suprimido/)).toBeInTheDocument();
    expect(screen.getByText("sin datos")).toBeInTheDocument();
  });

  it("shows explicit empty state when no cohorts", () => {
    render(<SemaforoCohort cells={[]} />);
    expect(screen.getByText(/Sin cohorts/)).toBeInTheDocument();
  });
});
