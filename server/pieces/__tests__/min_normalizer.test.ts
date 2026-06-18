import { describe, it, expect } from "vitest";
import { normalizeArms } from "../min_normalizer.js";
import type { Nivel } from "../min_normalizer.js";

// 05A:A.4.1 — normalize the 3 min() arms; missing/invalid arm ⇒ BAJA (most conservative). (04 §7)

describe("normalizeArms — 05A:A.4.1 (fail-closed, deterministic)", () => {
  // All valid — pass through unchanged
  it.each([
    ["all BAJA", { pedidoNBA: "BAJA", liberadoEvals: "BAJA", tetoTier: "BAJA" }],
    ["all MEDIA", { pedidoNBA: "MEDIA", liberadoEvals: "MEDIA", tetoTier: "MEDIA" }],
    ["all ALTA", { pedidoNBA: "ALTA", liberadoEvals: "ALTA", tetoTier: "ALTA" }],
    ["mixed valid", { pedidoNBA: "ALTA", liberadoEvals: "MEDIA", tetoTier: "BAJA" }],
  ] as [string, { pedidoNBA: Nivel; liberadoEvals: Nivel; tetoTier: Nivel }][])(
    "all valid pass through unchanged: %s",
    (_label, arms) => {
      expect(normalizeArms(arms)).toEqual(arms);
    }
  );

  // Single null arm ⇒ that arm becomes BAJA, others pass through
  it("null pedidoNBA ⇒ BAJA, others unchanged", () => {
    const r = normalizeArms({ pedidoNBA: null, liberadoEvals: "ALTA", tetoTier: "MEDIA" });
    expect(r).toEqual({ pedidoNBA: "BAJA", liberadoEvals: "ALTA", tetoTier: "MEDIA" });
  });

  it("null liberadoEvals ⇒ BAJA, others unchanged", () => {
    const r = normalizeArms({ pedidoNBA: "ALTA", liberadoEvals: null, tetoTier: "ALTA" });
    expect(r).toEqual({ pedidoNBA: "ALTA", liberadoEvals: "BAJA", tetoTier: "ALTA" });
  });

  it("null tetoTier ⇒ BAJA, others unchanged", () => {
    const r = normalizeArms({ pedidoNBA: "MEDIA", liberadoEvals: "ALTA", tetoTier: null });
    expect(r).toEqual({ pedidoNBA: "MEDIA", liberadoEvals: "ALTA", tetoTier: "BAJA" });
  });

  // undefined arms
  it("undefined pedidoNBA ⇒ BAJA", () => {
    const r = normalizeArms({ pedidoNBA: undefined, liberadoEvals: "ALTA", tetoTier: "MEDIA" });
    expect(r).toEqual({ pedidoNBA: "BAJA", liberadoEvals: "ALTA", tetoTier: "MEDIA" });
  });

  // Invalid string ⇒ BAJA
  it("invalid string 'foo' ⇒ BAJA for that arm", () => {
    const r = normalizeArms({ pedidoNBA: "foo", liberadoEvals: "ALTA", tetoTier: "MEDIA" });
    expect(r).toEqual({ pedidoNBA: "BAJA", liberadoEvals: "ALTA", tetoTier: "MEDIA" });
  });

  it("invalid string 'baja' (lowercase) ⇒ BAJA (enum is strict)", () => {
    const r = normalizeArms({ pedidoNBA: "baja", liberadoEvals: "MEDIA", tetoTier: "ALTA" });
    expect(r).toEqual({ pedidoNBA: "BAJA", liberadoEvals: "MEDIA", tetoTier: "ALTA" });
  });

  it("numeric arm ⇒ BAJA", () => {
    const r = normalizeArms({ pedidoNBA: 1, liberadoEvals: "ALTA", tetoTier: "ALTA" });
    expect(r).toEqual({ pedidoNBA: "BAJA", liberadoEvals: "ALTA", tetoTier: "ALTA" });
  });

  // All null/undefined/invalid ⇒ all BAJA
  it("all null ⇒ all BAJA", () => {
    expect(normalizeArms({ pedidoNBA: null, liberadoEvals: null, tetoTier: null })).toEqual({
      pedidoNBA: "BAJA",
      liberadoEvals: "BAJA",
      tetoTier: "BAJA",
    });
  });

  it("all undefined ⇒ all BAJA", () => {
    expect(normalizeArms({ pedidoNBA: undefined, liberadoEvals: undefined, tetoTier: undefined })).toEqual({
      pedidoNBA: "BAJA",
      liberadoEvals: "BAJA",
      tetoTier: "BAJA",
    });
  });

  it("all invalid strings ⇒ all BAJA", () => {
    expect(normalizeArms({ pedidoNBA: "x", liberadoEvals: "y", tetoTier: "z" })).toEqual({
      pedidoNBA: "BAJA",
      liberadoEvals: "BAJA",
      tetoTier: "BAJA",
    });
  });

  // Null input object ⇒ all BAJA (degrade, not throw)
  it("null input object ⇒ all BAJA (fail-closed, degrade not throw)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeArms(null as any)).toEqual({
      pedidoNBA: "BAJA",
      liberadoEvals: "BAJA",
      tetoTier: "BAJA",
    });
  });

  it("undefined input object ⇒ all BAJA (fail-closed, degrade not throw)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeArms(undefined as any)).toEqual({
      pedidoNBA: "BAJA",
      liberadoEvals: "BAJA",
      tetoTier: "BAJA",
    });
  });

  // Determinism
  it("deterministic: same input twice ⇒ identical output", () => {
    const input = { pedidoNBA: "ALTA" as Nivel, liberadoEvals: null, tetoTier: "foo" };
    expect(normalizeArms(input)).toEqual(normalizeArms(input));
  });

  // Output is always a fresh object (no mutation)
  it("does not mutate input", () => {
    const input = { pedidoNBA: null, liberadoEvals: "ALTA" as Nivel, tetoTier: "MEDIA" as Nivel };
    normalizeArms(input);
    expect(input.pedidoNBA).toBeNull();
  });
});
