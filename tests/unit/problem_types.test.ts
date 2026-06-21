import { describe, it, expect } from "vitest";
import { PROBLEM_TYPES, getDescriptor } from "../../shared/problem_types.js";

describe("problem_types registry", () => {
  it("has the payment built-in with a complete descriptor", () => {
    const d = getDescriptor("payment");
    expect(d.area_type).toBe("finance");
    expect(d.affected.table).toBe("Order");
    expect(d.impact.kind).toBe("sum_net_value");
    expect(d.origin).toBe("builtin");
  });
  it("throws fail-closed on unknown type", () => {
    expect(() => getDescriptor("nope")).toThrow(/unknown problem_type/);
  });
  it("exposes payment in the PROBLEM_TYPES registry", () => {
    expect(Object.keys(PROBLEM_TYPES)).toContain("payment");
    expect(getDescriptor("payment").problem_type).toBe("payment");
  });
  it("has the connection built-in with an at-risk-GMV descriptor (05D F1)", () => {
    const d = getDescriptor("connection");
    expect(d.area_type).toBe("performance");
    expect(d.impact.kind).toBe("at_risk_gmv");
    expect(d.origin).toBe("builtin");
    // threshold read BY NAME (§3.8) — the DIAGNOSIS knob, distinct from the A1 nba action policy (Codex P2).
    expect(d.affected.threshold_knob).toBe("connection_min_ratio");
    expect(Object.keys(PROBLEM_TYPES)).toContain("connection");
  });
  it("has cancellation (operations) + menu_quality (product) built-ins with dedicated knobs (05D F1)", () => {
    const k = getDescriptor("cancellation");
    expect(k.area_type).toBe("operations");
    expect(k.affected.threshold_knob).toBe("cancel_rate_max");
    const m = getDescriptor("menu_quality");
    expect(m.area_type).toBe("product");
    expect(m.impact.kind).toBe("at_risk_gmv");
    expect(m.affected.threshold_knob).toBe("menu_quality_min");
    const a = getDescriptor("adoption");
    expect(a.area_type).toBe("product");
    expect(a.affected.threshold_knob).toBe("adoption_gap_days");
    expect(Object.keys(PROBLEM_TYPES)).toEqual(
      expect.arrayContaining(["cancellation", "menu_quality", "adoption"]),
    );
  });
});
