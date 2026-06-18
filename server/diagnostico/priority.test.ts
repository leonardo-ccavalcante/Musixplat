import { describe, it, expect } from "vitest";
import { dispatchPriority, tieBreak, routeAhoraFila, type PriorityInput } from "./priority.js";

// 05B:B.1.4 / US-B1.2.1 / US-B5.2.1 — deterministic prioritization (pure, no LLM, 04 §3).
// BR-B11 conservative: criticidad=null ⇒ critical (max); BR-B10: impacto/agile null ⇒ 0.

const p = (
  criticidad: PriorityInput["criticidad"],
  impacto: PriorityInput["impacto"] = null,
  agile: PriorityInput["agile"] = null,
): PriorityInput => ({ criticidad, impacto, agile });

describe("dispatchPriority — B.1.4 (higher = attend first)", () => {
  it("criticidad DOMINATES impacto and agile", () => {
    // critical with worst lower keys still outranks medium with best lower keys.
    expect(dispatchPriority(p("critical", -1e9, -1e9))).toBeGreaterThan(
      dispatchPriority(p("medium", 1e9, 1e9)),
    );
    expect(dispatchPriority(p("medium", -1e9, -1e9))).toBeGreaterThan(
      dispatchPriority(p("low", 1e9, 1e9)),
    );
  });

  it("within same criticidad, higher impacto wins; impacto dominates agile", () => {
    expect(dispatchPriority(p("medium", 5, 0))).toBeGreaterThan(dispatchPriority(p("medium", 4, 0)));
    // higher impacto beats higher agile (impacto is the stronger key).
    expect(dispatchPriority(p("medium", 1, -1e9))).toBeGreaterThan(
      dispatchPriority(p("medium", 0, 1e9)),
    );
  });

  it("within same criticidad+impacto, higher agile wins", () => {
    expect(dispatchPriority(p("low", 2, 9))).toBeGreaterThan(dispatchPriority(p("low", 2, 8)));
  });

  it("BR-B11: criticidad=null ranks AS CRITICAL (never deprioritized)", () => {
    // null is conservatively treated as critical ⇒ same rank band, outranks medium.
    expect(dispatchPriority(p(null, 0, 0))).toBeGreaterThan(dispatchPriority(p("medium", 1e9, 1e9)));
    expect(dispatchPriority(p(null, 3, 4))).toBeCloseTo(dispatchPriority(p("critical", 3, 4)));
  });

  it("BR-B10: null impacto/agile treated as 0 (conservative, not optimistic)", () => {
    expect(dispatchPriority(p("medium", null, null))).toBeCloseTo(dispatchPriority(p("medium", 0, 0)));
  });

  it("deterministic: same input twice ⇒ identical score", () => {
    expect(dispatchPriority(p("critical", 7, 3))).toBe(dispatchPriority(p("critical", 7, 3)));
  });
});

describe("tieBreak — US-B1.2.1 (fixed auditable order, descending)", () => {
  it("sorts by criticidad first (critical → medium → low)", () => {
    const rows = [p("low", 9, 9), p("critical", 0, 0), p("medium", 5, 5)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.criticidad);
    expect(sorted).toEqual(["critical", "medium", "low"]);
  });

  it("ties on criticidad resolved by impacto (next key)", () => {
    const rows = [p("medium", 1, 9), p("medium", 3, 0), p("medium", 2, 5)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.impacto);
    expect(sorted).toEqual([3, 2, 1]);
  });

  it("ties on criticidad+impacto resolved by agile (least key)", () => {
    const rows = [p("low", 2, 1), p("low", 2, 7), p("low", 2, 4)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.agile);
    expect(sorted).toEqual([7, 4, 1]);
  });

  it("BR-B11: null criticidad sorts AS GRAVE (front of queue)", () => {
    const rows = [p("medium", 9, 9), p(null, 0, 0)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.criticidad);
    expect(sorted[0]).toBeNull(); // conservative: potentially-critical goes first.
  });

  it("stable: fully-equal keys preserve input order (comparator returns 0)", () => {
    const a = p("medium", 2, 2);
    const b = p("medium", 2, 2);
    expect(tieBreak(a, b)).toBe(0);
  });

  it("consistent with dispatchPriority ordering", () => {
    const hi = p("critical", 0, 0);
    const lo = p("medium", 9, 9);
    expect(tieBreak(hi, lo)).toBeLessThan(0); // hi sorts before lo
    expect(dispatchPriority(hi)).toBeGreaterThan(dispatchPriority(lo));
  });
});

describe("routeAhoraFila — US-B5.2.1 (riesgo × impacto vs costo)", () => {
  it("net-positive ⇒ 'ahora'", () => {
    expect(routeAhoraFila({ riesgo: 4, impacto: 3, costo: 10 })).toBe("ahora"); // 12 ≥ 10
  });

  it("boundary: value EXACTLY equals costo ⇒ 'ahora' (inclusive)", () => {
    expect(routeAhoraFila({ riesgo: 2, impacto: 5, costo: 10 })).toBe("ahora"); // 10 ≥ 10
  });

  it("below costo ⇒ 'fila'", () => {
    expect(routeAhoraFila({ riesgo: 1, impacto: 5, costo: 10 })).toBe("fila"); // 5 < 10
  });

  it("fail-closed: NaN / non-finite input ⇒ 'fila' (never act now on garbage)", () => {
    expect(routeAhoraFila({ riesgo: NaN, impacto: 5, costo: 1 })).toBe("fila");
    expect(routeAhoraFila({ riesgo: 5, impacto: Infinity, costo: 1 })).toBe("fila");
  });

  it("deterministic: same input twice ⇒ identical route", () => {
    const i = { riesgo: 3, impacto: 3, costo: 8 };
    expect(routeAhoraFila(i)).toBe(routeAhoraFila(i));
  });
});
