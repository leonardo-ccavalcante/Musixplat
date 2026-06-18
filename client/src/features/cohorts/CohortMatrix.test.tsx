import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CohortCell } from "@shared/contracts";
import { CohortMatrix } from "./CohortMatrix";

// minimal cell factory; tier/cuisine/zone vary per test
const cell = (over: Partial<CohortCell> & Pick<CohortCell, "cohort_id" | "status">): CohortCell => ({
  cuisine: "sushi",
  zone: "downtown",
  tier_base: "long_tail",
  n_accounts: 10,
  freshness_ts: "2026-06-18T00:00:00Z",
  stale: false,
  ...over,
});

describe("F-2.1 CohortMatrix heatmap", () => {
  it("carries every status via TEXT label (not color only)", () => {
    render(
      <CohortMatrix
        cells={[
          cell({ cohort_id: "a", status: "ok", cuisine: "sushi", zone: "z1" }),
          cell({ cohort_id: "b", status: "collapsed", cuisine: "pizza", zone: "z1" }),
          cell({ cohort_id: "c", status: "suppressed", cuisine: "tacos", zone: "z1" }),
          cell({ cohort_id: "d", status: "pending", cuisine: "ramen", zone: "z1" }),
        ]}
      />,
    );
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText("n<n_min")).toBeInTheDocument();
    expect(screen.getByText("k-anon")).toBeInTheDocument();
    expect(screen.getByText("no data")).toBeInTheDocument();
  });

  it("clicking an ok cell calls onOpen with that cohort", async () => {
    const onOpen = vi.fn();
    const ok = cell({ cohort_id: "ok-1", status: "ok", cuisine: "sushi", zone: "z1" });
    render(<CohortMatrix cells={[ok]} onOpen={onOpen} />);
    const btn = screen.getByRole("button", { name: /sushi · z1 · long_tail: OK/ });
    btn.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(ok);
  });

  it("suppressed cell does NOT reveal its n_accounts (k-anon re-identification)", () => {
    render(
      <CohortMatrix
        cells={[cell({ cohort_id: "s", status: "suppressed", n_accounts: 3, cuisine: "sushi", zone: "z1" })]}
      />,
    );
    expect(screen.getByText("k-anon")).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    expect(screen.queryByText(/n=3/)).not.toBeInTheDocument();
  });

  it("renders explicit empty state when no cohorts", () => {
    render(<CohortMatrix cells={[]} />);
    expect(screen.getByText(/No cohorts computed/)).toBeInTheDocument();
  });

  it("renders one section + caption per tier present (small-multiples)", () => {
    render(
      <CohortMatrix
        cells={[
          cell({ cohort_id: "m1", status: "ok", tier_base: "managed_brand", cuisine: "sushi", zone: "z1" }),
          cell({ cohort_id: "l1", status: "ok", tier_base: "long_tail", cuisine: "sushi", zone: "z1" }),
        ]}
      />,
    );
    // both present tiers get a <caption>; the unused managed_midmarket does not
    expect(screen.getByText("managed_brand")).toBeInTheDocument();
    expect(screen.getByText("long_tail")).toBeInTheDocument();
    expect(screen.queryByText("managed_midmarket")).not.toBeInTheDocument();
  });
});
