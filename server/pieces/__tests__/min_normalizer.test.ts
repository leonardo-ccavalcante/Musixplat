import { describe, it, expect } from "vitest";
import { normalizeArms } from "../min_normalizer.js";
import type { Level } from "../min_normalizer.js";

// 05A:A.4.1 — normalize the 3 min() arms; missing/invalid arm ⇒ LOW (most conservative). (04 §7)

describe("normalizeArms — 05A:A.4.1 (fail-closed, deterministic)", () => {
  // All valid — pass through unchanged
  it.each([
    ["all LOW", { nbaRequest: "LOW", releasedEvals: "LOW", tierCap: "LOW" }],
    ["all MEDIUM", { nbaRequest: "MEDIUM", releasedEvals: "MEDIUM", tierCap: "MEDIUM" }],
    ["all HIGH", { nbaRequest: "HIGH", releasedEvals: "HIGH", tierCap: "HIGH" }],
    ["mixed valid", { nbaRequest: "HIGH", releasedEvals: "MEDIUM", tierCap: "LOW" }],
  ] as [string, { nbaRequest: Level; releasedEvals: Level; tierCap: Level }][])(
    "all valid pass through unchanged: %s",
    (_label, arms) => {
      expect(normalizeArms(arms)).toEqual(arms);
    }
  );

  // Single null arm ⇒ that arm becomes LOW, others pass through
  it("null nbaRequest ⇒ LOW, others unchanged", () => {
    const r = normalizeArms({ nbaRequest: null, releasedEvals: "HIGH", tierCap: "MEDIUM" });
    expect(r).toEqual({ nbaRequest: "LOW", releasedEvals: "HIGH", tierCap: "MEDIUM" });
  });

  it("null releasedEvals ⇒ LOW, others unchanged", () => {
    const r = normalizeArms({ nbaRequest: "HIGH", releasedEvals: null, tierCap: "HIGH" });
    expect(r).toEqual({ nbaRequest: "HIGH", releasedEvals: "LOW", tierCap: "HIGH" });
  });

  it("null tierCap ⇒ LOW, others unchanged", () => {
    const r = normalizeArms({ nbaRequest: "MEDIUM", releasedEvals: "HIGH", tierCap: null });
    expect(r).toEqual({ nbaRequest: "MEDIUM", releasedEvals: "HIGH", tierCap: "LOW" });
  });

  // undefined arms
  it("undefined nbaRequest ⇒ LOW", () => {
    const r = normalizeArms({ nbaRequest: undefined, releasedEvals: "HIGH", tierCap: "MEDIUM" });
    expect(r).toEqual({ nbaRequest: "LOW", releasedEvals: "HIGH", tierCap: "MEDIUM" });
  });

  // Invalid string ⇒ LOW
  it("invalid string 'foo' ⇒ LOW for that arm", () => {
    const r = normalizeArms({ nbaRequest: "foo", releasedEvals: "HIGH", tierCap: "MEDIUM" });
    expect(r).toEqual({ nbaRequest: "LOW", releasedEvals: "HIGH", tierCap: "MEDIUM" });
  });

  it("invalid string 'low' (lowercase) ⇒ LOW (enum is strict)", () => {
    const r = normalizeArms({ nbaRequest: "low", releasedEvals: "MEDIUM", tierCap: "HIGH" });
    expect(r).toEqual({ nbaRequest: "LOW", releasedEvals: "MEDIUM", tierCap: "HIGH" });
  });

  it("numeric arm ⇒ LOW", () => {
    const r = normalizeArms({ nbaRequest: 1, releasedEvals: "HIGH", tierCap: "HIGH" });
    expect(r).toEqual({ nbaRequest: "LOW", releasedEvals: "HIGH", tierCap: "HIGH" });
  });

  // All null/undefined/invalid ⇒ all LOW
  it("all null ⇒ all LOW", () => {
    expect(normalizeArms({ nbaRequest: null, releasedEvals: null, tierCap: null })).toEqual({
      nbaRequest: "LOW",
      releasedEvals: "LOW",
      tierCap: "LOW",
    });
  });

  it("all undefined ⇒ all LOW", () => {
    expect(normalizeArms({ nbaRequest: undefined, releasedEvals: undefined, tierCap: undefined })).toEqual({
      nbaRequest: "LOW",
      releasedEvals: "LOW",
      tierCap: "LOW",
    });
  });

  it("all invalid strings ⇒ all LOW", () => {
    expect(normalizeArms({ nbaRequest: "x", releasedEvals: "y", tierCap: "z" })).toEqual({
      nbaRequest: "LOW",
      releasedEvals: "LOW",
      tierCap: "LOW",
    });
  });

  // Null input object ⇒ all LOW (degrade, not throw)
  it("null input object ⇒ all LOW (fail-closed, degrade not throw)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeArms(null as any)).toEqual({
      nbaRequest: "LOW",
      releasedEvals: "LOW",
      tierCap: "LOW",
    });
  });

  it("undefined input object ⇒ all LOW (fail-closed, degrade not throw)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeArms(undefined as any)).toEqual({
      nbaRequest: "LOW",
      releasedEvals: "LOW",
      tierCap: "LOW",
    });
  });

  // Determinism
  it("deterministic: same input twice ⇒ identical output", () => {
    const input = { nbaRequest: "HIGH" as Level, releasedEvals: null, tierCap: "foo" };
    expect(normalizeArms(input)).toEqual(normalizeArms(input));
  });

  // Output is always a fresh object (no mutation)
  it("does not mutate input", () => {
    const input = { nbaRequest: null, releasedEvals: "HIGH" as Level, tierCap: "MEDIUM" as Level };
    normalizeArms(input);
    expect(input.nbaRequest).toBeNull();
  });
});
