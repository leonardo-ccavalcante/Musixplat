import { describe, it, expect } from "vitest";
import { confidenceGate } from "../confidence_gate.js";

// piso is supplied by the caller who reads 'piso_confianza' BY NAME from Config_Knobs.
// This test uses a concrete value to drive the gate; no literal is embedded in the impl.
const PISO = 0.5;

describe("confidenceGate — 05A:A.4.4 (deterministic numeric gate, fail-closed, 04 §7)", () => {
  it("confianza above piso ⇒ pass:true, eje:null", () => {
    const r = confidenceGate(0.8, PISO);
    expect(r.pass).toBe(true);
    expect(r.eje).toBeNull();
  });

  it("confianza below piso ⇒ pass:false, eje:'confianza'", () => {
    const r = confidenceGate(0.4, PISO);
    expect(r.pass).toBe(false);
    expect(r.eje).toBe("confianza");
  });

  it("confianza exactly equal to piso ⇒ pass:true (>= boundary)", () => {
    const r = confidenceGate(0.5, PISO);
    expect(r.pass).toBe(true);
    expect(r.eje).toBeNull();
  });

  it("confianza === 0 (valid minimum) with piso 0 ⇒ pass:true", () => {
    expect(confidenceGate(0, 0).pass).toBe(true);
  });

  it("confianza === 1 (valid maximum) ⇒ pass:true", () => {
    expect(confidenceGate(1, PISO).pass).toBe(true);
  });

  it("NaN confianza ⇒ fail-closed (pass:false, eje:'confianza')", () => {
    const r = confidenceGate(NaN, PISO);
    expect(r.pass).toBe(false);
    expect(r.eje).toBe("confianza");
  });

  it("undefined-cast confianza ⇒ fail-closed", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = confidenceGate(undefined as any, PISO);
    expect(r.pass).toBe(false);
    expect(r.eje).toBe("confianza");
  });

  it("confianza > 1 (out of [0,1]) ⇒ fail-closed", () => {
    const r = confidenceGate(1.5, PISO);
    expect(r.pass).toBe(false);
    expect(r.eje).toBe("confianza");
  });

  it("confianza < 0 (out of [0,1]) ⇒ fail-closed", () => {
    const r = confidenceGate(-0.1, PISO);
    expect(r.pass).toBe(false);
    expect(r.eje).toBe("confianza");
  });

  it("invalid piso (NaN) ⇒ fail-closed regardless of confianza value", () => {
    const r = confidenceGate(0.8, NaN);
    expect(r.pass).toBe(false);
    expect(r.eje).toBe("confianza");
  });

  it("invalid piso (< 0) ⇒ fail-closed", () => {
    expect(confidenceGate(0.8, -0.1).pass).toBe(false);
  });

  it("invalid piso (> 1) ⇒ fail-closed", () => {
    expect(confidenceGate(0.8, 1.5).pass).toBe(false);
  });

  it("deterministic: same inputs twice ⇒ identical output", () => {
    expect(confidenceGate(0.7, PISO)).toEqual(confidenceGate(0.7, PISO));
  });
});
