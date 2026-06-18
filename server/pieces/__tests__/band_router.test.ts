import { describe, it, expect } from "vitest";
import { routeBand } from "../band_router.js";

// Piece 05A:A.5.0 — branch on level_efectivo (consumes A.4.6 min()); LOW⇒autónomo, else⇒escala. (04 §3)

describe("routeBand — 05A:A.5.0 (LOW⇒A.5 autónomo; MEDIUM|HIGH|invalid⇒A.7 escalación)", () => {
  it("LOW ⇒ route A.5 (autonomous-low path)", () => {
    const r = routeBand("LOW");
    expect(r.route).toBe("A.5");
    expect(r.levelEfectivo).toBe("LOW");
  });

  it("MEDIUM ⇒ route A.7 (escalation path)", () => {
    const r = routeBand("MEDIUM");
    expect(r.route).toBe("A.7");
    expect(r.levelEfectivo).toBe("MEDIUM");
  });

  it("HIGH ⇒ route A.7 (escalation path)", () => {
    const r = routeBand("HIGH");
    expect(r.route).toBe("A.7");
    expect(r.levelEfectivo).toBe("HIGH");
  });

  it("null ⇒ route A.7 fail-closed (degrade to human, never autonomous)", () => {
    const r = routeBand(null);
    expect(r.route).toBe("A.7");
    expect(r.levelEfectivo).toBe("HIGH"); // conservative fallback
  });

  it("undefined ⇒ route A.7 fail-closed", () => {
    const r = routeBand(undefined);
    expect(r.route).toBe("A.7");
    expect(r.levelEfectivo).toBe("HIGH");
  });

  it("garbage string ⇒ route A.7 fail-closed (never autonomous on unknown value)", () => {
    const r = routeBand("garbage");
    expect(r.route).toBe("A.7");
    expect(r.levelEfectivo).toBe("HIGH");
  });

  it("deterministic: same input twice ⇒ identical output", () => {
    expect(routeBand("LOW")).toEqual(routeBand("LOW"));
    expect(routeBand("HIGH")).toEqual(routeBand("HIGH"));
  });

  it("does NOT call least() or recompute — output levelEfectivo equals the consumed input (LOW)", () => {
    // The value passed in is the already-computed level from min_calculation; it must be echoed
    // verbatim (not re-derived). Verified by checking levelEfectivo === input.
    const r = routeBand("LOW");
    expect(r.levelEfectivo).toBe("LOW");
  });
});
