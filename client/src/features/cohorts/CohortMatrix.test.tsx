import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CohortCell, DeltaRow } from "@shared/contracts";
import { CohortMatrix } from "./CohortMatrix";

const cell = (over: Partial<CohortCell> & Pick<CohortCell, "cohort_id" | "status">): CohortCell => ({
  cuisine: "sushi",
  zone: "z1",
  tier_base: "long_tail",
  n_accounts: 10,
  freshness_ts: "2026-06-18T00:00:00Z",
  stale: false,
  ...over,
});

const delta = (over: Partial<DeltaRow> & Pick<DeltaRow, "cohort_id">): DeltaRow => ({
  evento_id: "e1",
  restaurant_id: "r1",
  week: "2026-06-15",
  delta_status: "at_risk",
  percentile_in_cohort: 0.2,
  gap_to_top: 0.18,
  percentile_delta: null,
  ...over,
});

describe("F-2.1 CohortMatrix — heatmap hero (2D cuisine × zone, per tier)", () => {
  it("carries every status via a TEXT label on the cell (not color only)", () => {
    render(
      <CohortMatrix
        cells={[
          cell({ cohort_id: "a", status: "ok", cuisine: "sushi", zone: "z1" }),
          cell({ cohort_id: "b", status: "collapsed", cuisine: "sushi", zone: "z2" }),
          cell({ cohort_id: "c", status: "suppressed", cuisine: "sushi", zone: "z3" }),
          cell({ cohort_id: "d", status: "pending", cuisine: "sushi", zone: "z4" }),
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /: OK, n=/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /: Too few accounts, n=/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /: Hidden \(privacy\), n=/ })).toBeInTheDocument();
    expect(screen.getAllByText("No data").length).toBeGreaterThanOrEqual(1); // pending cell (+ legend)
  });

  it("renders a block per tier (prettified) with cuisine row labels", () => {
    render(
      <CohortMatrix
        cells={[
          cell({ cohort_id: "m1", status: "ok", tier_base: "managed_brand", cuisine: "brazilian", zone: "coast" }),
          cell({ cohort_id: "l1", status: "ok", tier_base: "long_tail", cuisine: "sushi", zone: "z1" }),
        ]}
      />,
    );
    expect(screen.getByText("Managed · Brand")).toBeInTheDocument();
    expect(screen.getByText("Long-tail")).toBeInTheDocument();
    expect(screen.getByText("brazilian")).toBeInTheDocument(); // cuisine row label
    expect(screen.queryByText("Managed · Midmarket")).not.toBeInTheDocument();
  });

  it("clicking a cell calls onOpen with that cohort", () => {
    const onOpen = vi.fn();
    const ok = cell({ cohort_id: "ok-1", status: "ok", cuisine: "sushi", zone: "z1", tier_base: "long_tail" });
    render(<CohortMatrix cells={[ok]} onOpen={onOpen} />);
    screen.getByRole("button", { name: /sushi · z1 · long_tail: OK, n=/ }).click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(ok);
  });

  it("suppressed cell does NOT reveal its n_accounts (k-anon re-identification)", () => {
    render(<CohortMatrix cells={[cell({ cohort_id: "s", status: "suppressed", n_accounts: 3 })]} />);
    expect(screen.getByRole("button", { name: /: Hidden \(privacy\), n=—/ })).toBeInTheDocument();
    expect(screen.queryByText(/n = 3/)).not.toBeInTheDocument();
  });

  it("a status chip filters which cells show", () => {
    render(
      <CohortMatrix
        cells={[
          cell({ cohort_id: "ok1", status: "ok", cuisine: "sushi", zone: "z1" }),
          cell({ cohort_id: "col1", status: "collapsed", cuisine: "sushi", zone: "z2" }),
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /: Too few accounts, n=/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^OK 1$/ })); // the status chip
    expect(screen.queryByRole("button", { name: /: Too few accounts, n=/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /: OK, n=/ })).toBeInTheDocument();
  });

  it("collapses a tier so the operator can focus another", () => {
    render(
      <CohortMatrix
        cells={[
          cell({ cohort_id: "m1", status: "ok", tier_base: "managed_brand", cuisine: "brazilian", zone: "coast" }),
          cell({ cohort_id: "l1", status: "ok", tier_base: "long_tail", cuisine: "sushi", zone: "z1" }),
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /brazilian · coast · managed_brand: OK/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Managed · Brand/ })); // collapse the tier
    expect(screen.queryByRole("button", { name: /brazilian · coast · managed_brand: OK/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sushi · z1 · long_tail: OK/ })).toBeInTheDocument();
  });

  it("flags a cohort that carries a prioritized delta (opportunity overlay, gap to top)", () => {
    const c = cell({ cohort_id: "x", status: "ok", cuisine: "sushi", zone: "z1", tier_base: "long_tail" });
    render(<CohortMatrix cells={[c]} deltas={[delta({ cohort_id: "x", gap_to_top: 0.18 })]} />);
    const btn = screen.getByRole("button", { name: /sushi · z1 · long_tail: OK/ });
    expect(within(btn).getByText(/^gap /)).toBeInTheDocument();
  });

  it("caps the opportunity overlay to the top opportunities (coral stays meaningful, §1)", () => {
    const cells = Array.from({ length: 14 }, (_, i) =>
      cell({ cohort_id: `c${i}`, status: "ok", cuisine: "sushi", zone: `z${i}`, tier_base: "long_tail" }),
    );
    const deltas = Array.from({ length: 14 }, (_, i) => delta({ cohort_id: `c${i}`, evento_id: `e${i}`, gap_to_top: (i + 1) / 20 }));
    render(<CohortMatrix cells={cells} deltas={deltas} />);
    expect(screen.getAllByText(/^gap /).length).toBe(12); // 14 candidates → capped at TOP_OPPORTUNITIES
  });

  it("renders explicit empty state when no cohorts", () => {
    render(<CohortMatrix cells={[]} />);
    expect(screen.getByText(/No cohorts computed/)).toBeInTheDocument();
  });
});
