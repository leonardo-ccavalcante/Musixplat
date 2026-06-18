import { describe, it, expect } from "vitest";
import { confidenceGate } from "../confidence_gate.js";

// floor is supplied by the caller who reads 'piso_confianza' BY NAME from Config_Knobs.
// This test uses a concrete value to drive the gate; no literal is embedded in the impl.
const FLOOR = 0.5;

describe("confidenceGate — 05A:A.4.4 (deterministic numeric gate, fail-closed, 04 §7)", () => {
  it("confidence above floor ⇒ pass:true, axis:null", () => {
    const r = confidenceGate(0.8, FLOOR);
    expect(r.pass).toBe(true);
    expect(r.axis).toBeNull();
  });

  it("confidence below floor ⇒ pass:false, axis:'confidence'", () => {
    const r = confidenceGate(0.4, FLOOR);
    expect(r.pass).toBe(false);
    expect(r.axis).toBe("confidence");
  });

  it("confidence exactly equal to floor ⇒ pass:true (>= boundary)", () => {
    const r = confidenceGate(0.5, FLOOR);
    expect(r.pass).toBe(true);
    expect(r.axis).toBeNull();
  });

  it("confidence === 0 (valid minimum) with floor 0 ⇒ pass:true", () => {
    expect(confidenceGate(0, 0).pass).toBe(true);
  });

  it("confidence === 1 (valid maximum) ⇒ pass:true", () => {
    expect(confidenceGate(1, FLOOR).pass).toBe(true);
  });

  it("NaN confidence ⇒ fail-closed (pass:false, axis:'confidence')", () => {
    const r = confidenceGate(NaN, FLOOR);
    expect(r.pass).toBe(false);
    expect(r.axis).toBe("confidence");
  });

  it("undefined-cast confidence ⇒ fail-closed", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = confidenceGate(undefined as any, FLOOR);
    expect(r.pass).toBe(false);
    expect(r.axis).toBe("confidence");
  });

  it("confidence > 1 (out of [0,1]) ⇒ fail-closed", () => {
    const r = confidenceGate(1.5, FLOOR);
    expect(r.pass).toBe(false);
    expect(r.axis).toBe("confidence");
  });

  it("confidence < 0 (out of [0,1]) ⇒ fail-closed", () => {
    const r = confidenceGate(-0.1, FLOOR);
    expect(r.pass).toBe(false);
    expect(r.axis).toBe("confidence");
  });

  it("invalid floor (NaN) ⇒ fail-closed regardless of confidence value", () => {
    const r = confidenceGate(0.8, NaN);
    expect(r.pass).toBe(false);
    expect(r.axis).toBe("confidence");
  });

  it("invalid floor (< 0) ⇒ fail-closed", () => {
    expect(confidenceGate(0.8, -0.1).pass).toBe(false);
  });

  it("invalid floor (> 1) ⇒ fail-closed", () => {
    expect(confidenceGate(0.8, 1.5).pass).toBe(false);
  });

  it("deterministic: same inputs twice ⇒ identical output", () => {
    expect(confidenceGate(0.7, FLOOR)).toEqual(confidenceGate(0.7, FLOOR));
  });
});
