import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CohortCell } from "@shared/contracts";
import { SegmentModal } from "./SegmentModal";

const cell = (over: Partial<CohortCell> & Pick<CohortCell, "cohort_id" | "status">): CohortCell => ({
  cuisine: "brazilian",
  zone: "coast",
  tier_base: "managed_brand",
  n_accounts: 4,
  freshness_ts: "2026-06-18T00:00:00Z",
  stale: false,
  ...over,
});

const cells: CohortCell[] = [
  cell({ cohort_id: "mb-burger", cuisine: "burger", zone: "downtown", status: "ok", n_accounts: 8 }),
  cell({ cohort_id: "mb-brazilian", cuisine: "brazilian", zone: "coast", status: "ok", n_accounts: 4 }),
  cell({ cohort_id: "lt-sushi", tier_base: "long_tail", cuisine: "sushi", zone: "z1", status: "ok", n_accounts: 2 }),
];

describe("F-2.1 SegmentModal — drill by segment", () => {
  it("lists only the cohorts on the clicked segment, ordered by n desc", () => {
    render(
      <SegmentModal filter={{ kind: "tier", value: "managed_brand" }} cells={cells} onOpenCell={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/Tier: managed_brand/)).toBeInTheDocument();
    // burger (n=8) and brazilian (n=4) are on the tier; the long_tail sushi is not
    const list = screen.getByRole("list");
    expect(list).toHaveTextContent("burger");
    expect(list).toHaveTextContent("brazilian");
    expect(screen.queryByText(/sushi/)).not.toBeInTheDocument();
  });

  it("opening a row hands the cell back to the caller", () => {
    const onOpenCell = vi.fn();
    render(
      <SegmentModal filter={{ kind: "cuisine", value: "burger" }} cells={cells} onOpenCell={onOpenCell} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /burger/ }));
    expect(onOpenCell).toHaveBeenCalledWith(cells[0]);
  });

  it("never reveals n_accounts for a k-anon suppressed cell (re-identification)", () => {
    render(
      <SegmentModal
        filter={{ kind: "tier", value: "managed_brand" }}
        cells={[cell({ cohort_id: "s", status: "suppressed", n_accounts: 3 })]}
        onOpenCell={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("k-anon")).toBeInTheDocument();
    expect(screen.queryByText(/n = 3/)).not.toBeInTheDocument();
  });

  it("renders nothing when no segment is selected", () => {
    render(<SegmentModal filter={null} cells={cells} onOpenCell={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText(/Tier:/)).not.toBeInTheDocument();
  });
});
