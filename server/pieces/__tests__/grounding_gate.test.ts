// Test: 05A:A.4.2 — hard grounding gate. Piece reuses A.2.2 groundingGate. (04 §7)
import { describe, it, expect } from "vitest";
import { hardGroundingGate } from "../grounding_gate.js";
import type { GroundingChecks } from "../grounding.js";

const TTL = 60_000; // supplied by caller (Config_Knobs TTL_baseline); never hardcoded in impl

const validChecks: GroundingChecks = {
  freshnessMs: 1_000,
  sourceResponded: true,
  unambiguous: true,
  tenantMatches: true,
};

describe("hardGroundingGate — 05A:A.4.2", () => {
  it("all checks pass ⇒ pass=true, eje=null, status=verificado", () => {
    const result = hardGroundingGate(validChecks, TTL);
    expect(result.pass).toBe(true);
    expect(result.eje).toBeNull();
    expect(result.status).toBe("verificado");
  });

  it("stale freshness ⇒ pass=false, eje='grounding' (fail-closed)", () => {
    const checks: GroundingChecks = { ...validChecks, freshnessMs: TTL + 1 };
    const result = hardGroundingGate(checks, TTL);
    expect(result.pass).toBe(false);
    expect(result.eje).toBe("grounding");
  });

  it("source not responded ⇒ pass=false, eje='grounding'", () => {
    const checks: GroundingChecks = { ...validChecks, sourceResponded: false };
    const result = hardGroundingGate(checks, TTL);
    expect(result.pass).toBe(false);
    expect(result.eje).toBe("grounding");
  });

  it("ambiguous payload ⇒ pass=false, eje='grounding'", () => {
    const checks: GroundingChecks = { ...validChecks, unambiguous: false };
    const result = hardGroundingGate(checks, TTL);
    expect(result.pass).toBe(false);
    expect(result.eje).toBe("grounding");
  });

  it("tenant mismatch ⇒ pass=false, eje='grounding'", () => {
    const checks: GroundingChecks = { ...validChecks, tenantMatches: false };
    const result = hardGroundingGate(checks, TTL);
    expect(result.pass).toBe(false);
    expect(result.eje).toBe("grounding");
  });

  it("null checks ⇒ pass=false, eje='grounding' (fail-closed §3.7)", () => {
    const result = hardGroundingGate(null, TTL);
    expect(result.pass).toBe(false);
    expect(result.eje).toBe("grounding");
  });

  it("undefined checks ⇒ pass=false, eje='grounding' (fail-closed §3.7)", () => {
    const result = hardGroundingGate(undefined, TTL);
    expect(result.pass).toBe(false);
    expect(result.eje).toBe("grounding");
  });

  it("invalid ttlMs (0) ⇒ pass=false, eje='grounding' (fail-closed)", () => {
    const result = hardGroundingGate(validChecks, 0);
    expect(result.pass).toBe(false);
    expect(result.eje).toBe("grounding");
  });

  it("invalid ttlMs (NaN) ⇒ pass=false, eje='grounding' (fail-closed)", () => {
    const result = hardGroundingGate(validChecks, NaN);
    expect(result.pass).toBe(false);
    expect(result.eje).toBe("grounding");
  });

  it("deterministic: same inputs ⇒ same output", () => {
    const r1 = hardGroundingGate(validChecks, TTL);
    const r2 = hardGroundingGate(validChecks, TTL);
    expect(r1).toEqual(r2);
  });

  it("status propagated from groundingGate (no_verificable on fail)", () => {
    const checks: GroundingChecks = { ...validChecks, tenantMatches: false };
    const result = hardGroundingGate(checks, TTL);
    expect(result.status).toBe("no_verificable");
  });
});
