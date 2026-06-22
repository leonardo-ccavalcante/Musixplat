import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { DrillTable, type DrillRow } from "./DrillTable";

// Fase 0 / Bug A — the SAME restaurant legitimately appears across weeks/subgroups in a drill cell, so
// keying a drill row by restaurant_id ALONE yields duplicate React keys (the prod R0012/R0046/R0059 warning).
// The fix: key by the row's full identity (restaurant + week + subgroup). This reproduces + locks it.
vi.mock("./HandoffButton", () => ({ HandoffButton: () => null }));

describe("DrillTable unique row keys (no duplicate-key warning)", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("does not emit a duplicate-key warning when one restaurant spans two weeks", () => {
    const rows: DrillRow[] = [
      { restaurant_id: "R0012", cohort_id: "C1", subgroup_id: null, week: "2026-W24", percentile_in_cohort: 10, gap_to_top: 5, mode: null },
      { restaurant_id: "R0012", cohort_id: "C1", subgroup_id: null, week: "2026-W25", percentile_in_cohort: 12, gap_to_top: 4, mode: null },
    ];
    render(<DrillTable rows={rows} />);
    const dupKeyWarning = errSpy.mock.calls.some((c) => String(c[0]).includes("same key"));
    expect(dupKeyWarning).toBe(false);
  });
});
