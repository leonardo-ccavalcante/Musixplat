import { describe, it, expect } from "vitest";
import { formatUsd, formatTokens } from "./cost";

// Honest money formatting: tiny per-ticket costs must stay visible (4 decimals under a cent) and an
// unknown/unpriced cost shows "—", never a misleading "$0.00".
describe("formatUsd", () => {
  it("shows '—' for an unknown (null) cost — never a fake $0", () => {
    expect(formatUsd(null)).toBe("—");
  });
  it("shows two decimals for a real zero and for cents-and-up", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.75)).toBe("$0.75");
    expect(formatUsd(12.5)).toBe("$12.50");
  });
  it("shows four decimals for sub-cent amounts so they don't round to $0.00", () => {
    expect(formatUsd(0.0006)).toBe("$0.0006");
  });
});

describe("formatTokens", () => {
  it("renders raw under 1k, k under 1M, M above", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(1500000)).toBe("1.50M");
  });
});
