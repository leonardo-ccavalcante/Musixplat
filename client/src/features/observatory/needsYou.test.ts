import { describe, expect, it } from "vitest";
import { computeNeedsYou } from "./needsYou";

describe("computeNeedsYou — honest triage of what awaits the operator (zero fabricated counts)", () => {
  it("is all-zero (calm state) for undefined / empty inputs", () => {
    expect(computeNeedsYou(undefined, undefined)).toEqual({ signOff: 0, money: 0, lessons: 0, total: 0 });
    expect(computeNeedsYou([], [])).toEqual({ signOff: 0, money: 0, lessons: 0, total: 0 });
  });

  it("counts only needs_human NBAs for sign-off, with money as the reason='money' subset", () => {
    const rows = [
      { status: "needs_human", reason: "money" },
      { status: "needs_human", reason: "level" },
      { status: "needs_human", reason: "gates" },
      { status: "auto", reason: null }, // the AI already cleared this — NOT awaiting you
    ];
    const n = computeNeedsYou(rows, []);
    expect(n.signOff).toBe(3);
    expect(n.money).toBe(1);
    expect(n.total).toBe(3);
  });

  it("counts a lesson only while it is neither vetted nor auto-verified", () => {
    const cases = [
      { reviewed: false, verificationStatus: null }, // draft awaiting OK ✓
      { reviewed: false, verificationStatus: "unverified" }, // still awaiting OK ✓
      { reviewed: true, verificationStatus: null }, // already vetted ✗
      { reviewed: false, verificationStatus: "verified_fixed" }, // auto-verified [V], no OK needed ✗
    ];
    const n = computeNeedsYou([], cases);
    expect(n.lessons).toBe(2);
    expect(n.total).toBe(2);
  });

  it("total = sign-off + lessons (the two buckets the bar surfaces)", () => {
    const n = computeNeedsYou(
      [{ status: "needs_human", reason: "money" }, { status: "needs_human", reason: "gates" }],
      [{ reviewed: false, verificationStatus: null }],
    );
    expect(n).toEqual({ signOff: 2, money: 1, lessons: 1, total: 3 });
  });
});
