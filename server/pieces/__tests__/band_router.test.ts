import { describe, it, expect } from "vitest";
import { routeBand } from "../band_router.js";

// Piece 05A:A.5.0 — branch on nivel_efectivo (consumes A.4.6 min()); BAJA⇒autónomo, else⇒escala. (04 §3)

describe("routeBand — 05A:A.5.0 (BAJA⇒A.5 autónomo; MEDIA|ALTA|invalid⇒A.7 escalación)", () => {
  it("BAJA ⇒ route A.5 (autonomous-low path)", () => {
    const r = routeBand("BAJA");
    expect(r.route).toBe("A.5");
    expect(r.nivelEfectivo).toBe("BAJA");
  });

  it("MEDIA ⇒ route A.7 (escalation path)", () => {
    const r = routeBand("MEDIA");
    expect(r.route).toBe("A.7");
    expect(r.nivelEfectivo).toBe("MEDIA");
  });

  it("ALTA ⇒ route A.7 (escalation path)", () => {
    const r = routeBand("ALTA");
    expect(r.route).toBe("A.7");
    expect(r.nivelEfectivo).toBe("ALTA");
  });

  it("null ⇒ route A.7 fail-closed (degrade to human, never autonomous)", () => {
    const r = routeBand(null);
    expect(r.route).toBe("A.7");
    expect(r.nivelEfectivo).toBe("ALTA"); // conservative fallback
  });

  it("undefined ⇒ route A.7 fail-closed", () => {
    const r = routeBand(undefined);
    expect(r.route).toBe("A.7");
    expect(r.nivelEfectivo).toBe("ALTA");
  });

  it("garbage string ⇒ route A.7 fail-closed (never autonomous on unknown value)", () => {
    const r = routeBand("garbage");
    expect(r.route).toBe("A.7");
    expect(r.nivelEfectivo).toBe("ALTA");
  });

  it("deterministic: same input twice ⇒ identical output", () => {
    expect(routeBand("BAJA")).toEqual(routeBand("BAJA"));
    expect(routeBand("ALTA")).toEqual(routeBand("ALTA"));
  });

  it("does NOT call least() or recompute — output nivelEfectivo equals the consumed input (BAJA)", () => {
    // The value passed in is the already-computed nivel from min_calculo; it must be echoed
    // verbatim (not re-derived). Verified by checking nivelEfectivo === input.
    const r = routeBand("BAJA");
    expect(r.nivelEfectivo).toBe("BAJA");
  });
});
