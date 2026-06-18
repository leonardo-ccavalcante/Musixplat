import { describe, it, expect } from "vitest";
import { dispatchPriority, tieBreak, routeAhoraFila, type PriorityInput } from "./priority.js";

// 05B:B.1.4 / US-B1.2.1 / US-B5.2.1 — deterministic priorización (pure, no LLM, 04 §3).
// BR-B11 conservative: criticidad=null ⇒ grave (max); BR-B10: impacto/agile null ⇒ 0.

const p = (
  criticidad: PriorityInput["criticidad"],
  impacto: PriorityInput["impacto"] = null,
  agile: PriorityInput["agile"] = null,
): PriorityInput => ({ criticidad, impacto, agile });

describe("dispatchPriority — B.1.4 (higher = attend first)", () => {
  it("criticidad DOMINATES impacto and agile", () => {
    // grave with worst lower keys still outranks media with best lower keys.
    expect(dispatchPriority(p("grave", -1e9, -1e9))).toBeGreaterThan(
      dispatchPriority(p("media", 1e9, 1e9)),
    );
    expect(dispatchPriority(p("media", -1e9, -1e9))).toBeGreaterThan(
      dispatchPriority(p("baja", 1e9, 1e9)),
    );
  });

  it("within same criticidad, higher impacto wins; impacto dominates agile", () => {
    expect(dispatchPriority(p("media", 5, 0))).toBeGreaterThan(dispatchPriority(p("media", 4, 0)));
    // higher impacto beats higher agile (impacto is the stronger key).
    expect(dispatchPriority(p("media", 1, -1e9))).toBeGreaterThan(
      dispatchPriority(p("media", 0, 1e9)),
    );
  });

  it("within same criticidad+impacto, higher agile wins", () => {
    expect(dispatchPriority(p("baja", 2, 9))).toBeGreaterThan(dispatchPriority(p("baja", 2, 8)));
  });

  it("BR-B11: criticidad=null ranks AS GRAVE (never deprioritized)", () => {
    // null is conservatively treated as grave ⇒ same rank band, outranks media.
    expect(dispatchPriority(p(null, 0, 0))).toBeGreaterThan(dispatchPriority(p("media", 1e9, 1e9)));
    expect(dispatchPriority(p(null, 3, 4))).toBeCloseTo(dispatchPriority(p("grave", 3, 4)));
  });

  it("BR-B10: null impacto/agile treated as 0 (conservative, not optimistic)", () => {
    expect(dispatchPriority(p("media", null, null))).toBeCloseTo(dispatchPriority(p("media", 0, 0)));
  });

  it("deterministic: same input twice ⇒ identical score", () => {
    expect(dispatchPriority(p("grave", 7, 3))).toBe(dispatchPriority(p("grave", 7, 3)));
  });
});

describe("tieBreak — US-B1.2.1 (fixed auditable order, descending)", () => {
  it("sorts by criticidad first (grave → media → baja)", () => {
    const rows = [p("baja", 9, 9), p("grave", 0, 0), p("media", 5, 5)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.criticidad);
    expect(sorted).toEqual(["grave", "media", "baja"]);
  });

  it("ties on criticidad resolved by impacto (next key)", () => {
    const rows = [p("media", 1, 9), p("media", 3, 0), p("media", 2, 5)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.impacto);
    expect(sorted).toEqual([3, 2, 1]);
  });

  it("ties on criticidad+impacto resolved by agile (least key)", () => {
    const rows = [p("baja", 2, 1), p("baja", 2, 7), p("baja", 2, 4)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.agile);
    expect(sorted).toEqual([7, 4, 1]);
  });

  it("BR-B11: null criticidad sorts AS GRAVE (front of queue)", () => {
    const rows = [p("media", 9, 9), p(null, 0, 0)];
    const sorted = [...rows].sort(tieBreak).map((r) => r.criticidad);
    expect(sorted[0]).toBeNull(); // conservative: potentially-grave goes first.
  });

  it("stable: fully-equal keys preserve input order (comparator returns 0)", () => {
    const a = p("media", 2, 2);
    const b = p("media", 2, 2);
    expect(tieBreak(a, b)).toBe(0);
  });

  it("consistent with dispatchPriority ordering", () => {
    const hi = p("grave", 0, 0);
    const lo = p("media", 9, 9);
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
