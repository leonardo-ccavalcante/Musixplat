import { describe, it, expect } from "vitest";
import { normalizeArms } from "../min_normalizer.js";
import type { Nivel } from "../min_normalizer.js";

// 05A:A.4.1 — normalize the 3 min() arms; missing/invalid arm ⇒ LOW (most conservative). (04 §7)

describe("normalizeArms — 05A:A.4.1 (fail-closed, deterministic)", () => {
  // All valid — pass through unchanged
  it.each([
    ["all LOW", { pedidoNBA: "LOW", liberadoEvals: "LOW", tetoTier: "LOW" }],
    ["all MEDIUM", { pedidoNBA: "MEDIUM", liberadoEvals: "MEDIUM", tetoTier: "MEDIUM" }],
    ["all HIGH", { pedidoNBA: "HIGH", liberadoEvals: "HIGH", tetoTier: "HIGH" }],
    ["mixed valid", { pedidoNBA: "HIGH", liberadoEvals: "MEDIUM", tetoTier: "LOW" }],
  ] as [string, { pedidoNBA: Nivel; liberadoEvals: Nivel; tetoTier: Nivel }][])(
    "all valid pass through unchanged: %s",
    (_label, arms) => {
      expect(normalizeArms(arms)).toEqual(arms);
    }
  );

  // Single null arm ⇒ that arm becomes LOW, others pass through
  it("null pedidoNBA ⇒ LOW, others unchanged", () => {
    const r = normalizeArms({ pedidoNBA: null, liberadoEvals: "HIGH", tetoTier: "MEDIUM" });
    expect(r).toEqual({ pedidoNBA: "LOW", liberadoEvals: "HIGH", tetoTier: "MEDIUM" });
  });

  it("null liberadoEvals ⇒ LOW, others unchanged", () => {
    const r = normalizeArms({ pedidoNBA: "HIGH", liberadoEvals: null, tetoTier: "HIGH" });
    expect(r).toEqual({ pedidoNBA: "HIGH", liberadoEvals: "LOW", tetoTier: "HIGH" });
  });

  it("null tetoTier ⇒ LOW, others unchanged", () => {
    const r = normalizeArms({ pedidoNBA: "MEDIUM", liberadoEvals: "HIGH", tetoTier: null });
    expect(r).toEqual({ pedidoNBA: "MEDIUM", liberadoEvals: "HIGH", tetoTier: "LOW" });
  });

  // undefined arms
  it("undefined pedidoNBA ⇒ LOW", () => {
    const r = normalizeArms({ pedidoNBA: undefined, liberadoEvals: "HIGH", tetoTier: "MEDIUM" });
    expect(r).toEqual({ pedidoNBA: "LOW", liberadoEvals: "HIGH", tetoTier: "MEDIUM" });
  });

  // Invalid string ⇒ LOW
  it("invalid string 'foo' ⇒ LOW for that arm", () => {
    const r = normalizeArms({ pedidoNBA: "foo", liberadoEvals: "HIGH", tetoTier: "MEDIUM" });
    expect(r).toEqual({ pedidoNBA: "LOW", liberadoEvals: "HIGH", tetoTier: "MEDIUM" });
  });

  it("invalid string 'baja' (lowercase) ⇒ LOW (enum is strict)", () => {
    const r = normalizeArms({ pedidoNBA: "baja", liberadoEvals: "MEDIUM", tetoTier: "HIGH" });
    expect(r).toEqual({ pedidoNBA: "LOW", liberadoEvals: "MEDIUM", tetoTier: "HIGH" });
  });

  it("numeric arm ⇒ LOW", () => {
    const r = normalizeArms({ pedidoNBA: 1, liberadoEvals: "HIGH", tetoTier: "HIGH" });
    expect(r).toEqual({ pedidoNBA: "LOW", liberadoEvals: "HIGH", tetoTier: "HIGH" });
  });

  // All null/undefined/invalid ⇒ all LOW
  it("all null ⇒ all LOW", () => {
    expect(normalizeArms({ pedidoNBA: null, liberadoEvals: null, tetoTier: null })).toEqual({
      pedidoNBA: "LOW",
      liberadoEvals: "LOW",
      tetoTier: "LOW",
    });
  });

  it("all undefined ⇒ all LOW", () => {
    expect(normalizeArms({ pedidoNBA: undefined, liberadoEvals: undefined, tetoTier: undefined })).toEqual({
      pedidoNBA: "LOW",
      liberadoEvals: "LOW",
      tetoTier: "LOW",
    });
  });

  it("all invalid strings ⇒ all LOW", () => {
    expect(normalizeArms({ pedidoNBA: "x", liberadoEvals: "y", tetoTier: "z" })).toEqual({
      pedidoNBA: "LOW",
      liberadoEvals: "LOW",
      tetoTier: "LOW",
    });
  });

  // Null input object ⇒ all LOW (degrade, not throw)
  it("null input object ⇒ all LOW (fail-closed, degrade not throw)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeArms(null as any)).toEqual({
      pedidoNBA: "LOW",
      liberadoEvals: "LOW",
      tetoTier: "LOW",
    });
  });

  it("undefined input object ⇒ all LOW (fail-closed, degrade not throw)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeArms(undefined as any)).toEqual({
      pedidoNBA: "LOW",
      liberadoEvals: "LOW",
      tetoTier: "LOW",
    });
  });

  // Determinism
  it("deterministic: same input twice ⇒ identical output", () => {
    const input = { pedidoNBA: "HIGH" as Nivel, liberadoEvals: null, tetoTier: "foo" };
    expect(normalizeArms(input)).toEqual(normalizeArms(input));
  });

  // Output is always a fresh object (no mutation)
  it("does not mutate input", () => {
    const input = { pedidoNBA: null, liberadoEvals: "HIGH" as Nivel, tetoTier: "MEDIUM" as Nivel };
    normalizeArms(input);
    expect(input.pedidoNBA).toBeNull();
  });
});
