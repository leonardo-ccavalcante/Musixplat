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
});
