import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CohortCell } from "@shared/contracts";
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

describe("F-2.1 CohortMatrix — nested collapse + status filter", () => {
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
    // interactive cells expose status in the accessible name; pending is inert text
    expect(screen.getByRole("button", { name: /: OK, n=/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /: Too few accounts, n=/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /: Hidden \(privacy\), n=/ })).toBeInTheDocument();
    expect(screen.getAllByText("No data").length).toBeGreaterThanOrEqual(1);
  });

  it("groups into nested tier → cuisine collapsibles", () => {
    render(
      <CohortMatrix
        cells={[
          cell({ cohort_id: "m1", status: "ok", tier_base: "managed_brand", cuisine: "brazilian", zone: "coast" }),
          cell({ cohort_id: "l1", status: "ok", tier_base: "long_tail", cuisine: "sushi", zone: "z1" }),
        ]}
      />,
    );
    expect(screen.getByText("managed_brand")).toBeInTheDocument();
    expect(screen.getByText("long_tail")).toBeInTheDocument();
    expect(screen.getByText("brazilian")).toBeInTheDocument();
    expect(screen.queryByText("managed_midmarket")).not.toBeInTheDocument();
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

  it("renders explicit empty state when no cohorts", () => {
    render(<CohortMatrix cells={[]} />);
    expect(screen.getByText(/No cohorts computed/)).toBeInTheDocument();
  });
});
