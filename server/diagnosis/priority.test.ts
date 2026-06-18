import { describe, it, expect } from "vitest";
import { dispatchPriority, tieBreak, routeNowQueue, type PriorityInput } from "./priority.js";

// 05B:B.1.4 / US-B1.2.1 / US-B5.2.1 — deterministic prioritization (pure, no LLM, 04 §3).
// BR-B11 conservative: criticality=null ⇒ critical (max); BR-B10: impact/agile null ⇒ 0.

const p = (
  criticality: PriorityInput["criticality"],
  impact: PriorityInput["impact"] = null,
  agile: PriorityInput["agile"] = null,
): PriorityInput => ({ criticality, impact, agile });

describe("dispatchPriority — B.1.4 (higher = attend first)", () => {
  it("criticality DOMINATES impact and agile", () => {
    // critical with worst lower keys still outranks moderate with best lower keys.
    expect(dispatchPriority(p("critical", -1e9, -1e9))).toBeGreaterThan(
      dispatchPriority(p("moderate", 1e9, 1e9)),
    );
    expect(dispatchPriority(p("moderate", -1e9, -1e9))).toBeGreaterThan(
      dispatchPriority(p("low", 1e9, 1e9)),
    );
  });

  it("within same criticality, higher impact wins; impact dominates agile", () => {
    expect(dispatchPriority(p("moderate", 5, 0))).toBeGreaterThan(dispatchPriority(p("moderate", 4, 0)));
    // higher impact beats higher agile (impact is the stronger key).
    expect(dispatchPriority(p("moderate", 1, -1e9))).toBeGreaterThan(
      dispatchPriority(p("moderate", 0, 1e9)),
    );
  });

  it("within same criticality+impact, higher agile wins", () => {
    expect(dispatchPriority(p("low", 2, 9))).toBeGreaterThan(dispatchPriority(p("low", 2, 8)));
  });

  it("BR-B11: criticality=null ranks AS CRITICAL (never deprioritized)", () => {
    // null is conservatively treated as critical ⇒ same rank band, outranks moderate.
    expect(dispatchPriority(p(null, 0, 0))).toBeGreaterThan(dispatchPriority(p("moderate", 1e9, 1e9)));
    expect(dispatchPriority(p(null, 3, 4))).toBeCloseTo(dispatchPriority(p("critical", 3, 4)));
  });

  it("BR-B10: null impact/agile treated as 0 (conservative, not optimistic)", () => {
    expect(dispatchPriority(p("moderate", null, null))).toBeCloseTo(dispatchPriority(p("moderate", 0, 0)));
  });

  it("deterministic: same input twice ⇒ identical score", () => {
    expect(dispatchPriority(p("critical", 7, 3))).toBe(dispatchPriority(p("critical", 7, 3)));
  });
});

describe("tieBreak — US-B1.2.1 (fixed auditable order, descending)", () => {
  it("sorts by criticality first (critical → moderate → low)", () => {
    const rows = [p("low", 9, 9), p("critical", 0, 0), p("moderate", 5, 5)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.criticality);
    expect(sorted).toEqual(["critical", "moderate", "low"]);
  });

  it("ties on criticality resolved by impact (next key)", () => {
    const rows = [p("moderate", 1, 9), p("moderate", 3, 0), p("moderate", 2, 5)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.impact);
    expect(sorted).toEqual([3, 2, 1]);
  });

  it("ties on criticality+impact resolved by agile (least key)", () => {
    const rows = [p("low", 2, 1), p("low", 2, 7), p("low", 2, 4)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.agile);
    expect(sorted).toEqual([7, 4, 1]);
  });

  it("BR-B11: null criticality sorts AS CRITICAL (front of queue)", () => {
    const rows = [p("moderate", 9, 9), p(null, 0, 0)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.criticality);
    expect(sorted[0]).toBeNull(); // conservative: potentially-critical goes first.
  });

  it("stable: fully-equal keys preserve input order (comparator returns 0)", () => {
    const a = p("moderate", 2, 2);
    const b = p("moderate", 2, 2);
    expect(tieBreak(a, b)).toBe(0);
  });

  it("consistent with dispatchPriority ordering", () => {
    const hi = p("critical", 0, 0);
    const lo = p("moderate", 9, 9);
    expect(tieBreak(hi, lo)).toBeLessThan(0); // hi sorts before lo
    expect(dispatchPriority(hi)).toBeGreaterThan(dispatchPriority(lo));
  });
});

describe("routeNowQueue — US-B5.2.1 (risk × impact vs cost)", () => {
  it("net-positive ⇒ 'now'", () => {
    expect(routeNowQueue({ risk: 4, impact: 3, cost: 10 })).toBe("now"); // 12 ≥ 10
  });

  it("boundary: value EXACTLY equals cost ⇒ 'now' (inclusive)", () => {
    expect(routeNowQueue({ risk: 2, impact: 5, cost: 10 })).toBe("now"); // 10 ≥ 10
  });

  it("below cost ⇒ 'queue'", () => {
    expect(routeNowQueue({ risk: 1, impact: 5, cost: 10 })).toBe("queue"); // 5 < 10
  });

  it("fail-closed: NaN / non-finite input ⇒ 'queue' (never act now on garbage)", () => {
    expect(routeNowQueue({ risk: NaN, impact: 5, cost: 1 })).toBe("queue");
    expect(routeNowQueue({ risk: 5, impact: Infinity, cost: 1 })).toBe("queue");
  });

  it("deterministic: same input twice ⇒ identical route", () => {
    const i = { risk: 3, impact: 3, cost: 8 };
    expect(routeNowQueue(i)).toBe(routeNowQueue(i));
  });
});
