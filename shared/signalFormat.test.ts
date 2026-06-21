import { describe, expect, it } from "vitest";
import { fmtValue, fmtGap, evidenceLine, readSignal } from "./signalFormat";

describe("signalFormat — dimension-aware units, no false precision (§3.6/§3.10)", () => {
  it("renders a rate (0-1) as a 1-decimal % and its gap in percentage points", () => {
    expect(fmtValue("cancel_by_customer", 0.0833333333)).toBe("8.3%");
    expect(fmtValue("cancel_by_customer", 0.05)).toBe("5%");
    expect(fmtGap("cancel_by_customer", 0.0333333333)).toBe("+3.3 pts");
    expect(fmtGap("cancel_by_customer", -0.0333333333)).toBe("−3.3 pts");
  });

  it("renders a percentile (already 0-100) without ×100", () => {
    expect(fmtValue("price_pctile_in_cohort", 82.5)).toBe("82.5 pctile");
    expect(fmtGap("price_pctile_in_cohort", 7.5)).toBe("+7.5 pts");
  });

  it("an unknown dimension falls back to rate (never throws)", () => {
    expect(fmtValue("brand_new_signal", 0.5)).toBe("50%");
  });

  it("evidenceLine assembles a clean line with the human label + units", () => {
    expect(
      evidenceLine({ dimension: "cancel_by_customer", measured: 0.0833333333, standard: 0.05, gap: 0.0333333333 }),
    ).toBe("Customer-cancel rate 8.3% vs 5% standard · gap +3.3 pts");
  });

  it("readSignal returns null on a malformed payload (defensive, never throws)", () => {
    expect(readSignal(null)).toBeNull();
    expect(readSignal({ dimension: "x" })).toBeNull();
    expect(evidenceLine("not an object")).toBeNull();
  });
});
