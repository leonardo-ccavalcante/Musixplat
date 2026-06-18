// Piece 05A:A.3.0 — predraftGates tests (TDD: write first, run red, then green). (04 §7)
import { describe, it, expect } from "vitest";
import { predraftGates } from "../predraft_gates.js";

describe("predraftGates — 05A:A.3.0", () => {
  it("all true ⇒ pass:true, failed:[]", () => {
    expect(
      predraftGates({ grounding: true, ttlOk: true, accessOk: true, policyNotStale: true })
    ).toEqual({ pass: true, failed: [] });
  });

  it("ttlOk false ⇒ pass:false, failed:['ttlOk']", () => {
    expect(
      predraftGates({ grounding: true, ttlOk: false, accessOk: true, policyNotStale: true })
    ).toEqual({ pass: false, failed: ["ttlOk"] });
  });

  it("two false ⇒ both in stable order (grounding, ttlOk)", () => {
    expect(
      predraftGates({ grounding: false, ttlOk: false, accessOk: true, policyNotStale: true })
    ).toEqual({ pass: false, failed: ["grounding", "ttlOk"] });
  });

  it("stable order across all four gates when all false", () => {
    expect(
      predraftGates({ grounding: false, ttlOk: false, accessOk: false, policyNotStale: false })
    ).toEqual({ pass: false, failed: ["grounding", "ttlOk", "accessOk", "policyNotStale"] });
  });

  it("missing field (undefined) counted as failed", () => {
    expect(
      predraftGates({ grounding: true, ttlOk: true, accessOk: true })
    ).toEqual({ pass: false, failed: ["policyNotStale"] });
  });

  it("undefined field in middle counted as failed in stable order", () => {
    expect(
      predraftGates({ grounding: true, accessOk: true, policyNotStale: true })
    ).toEqual({ pass: false, failed: ["ttlOk"] });
  });

  it("null input ⇒ all four failed", () => {
    expect(predraftGates(null)).toEqual({
      pass: false,
      failed: ["grounding", "ttlOk", "accessOk", "policyNotStale"],
    });
  });

  it("undefined input ⇒ all four failed", () => {
    expect(predraftGates(undefined)).toEqual({
      pass: false,
      failed: ["grounding", "ttlOk", "accessOk", "policyNotStale"],
    });
  });

  it("determinism: same input produces identical output on repeated calls", () => {
    const input = { grounding: true, ttlOk: false, accessOk: true, policyNotStale: false };
    expect(predraftGates(input)).toEqual(predraftGates(input));
  });

  it("empty object ⇒ all four failed (all undefined)", () => {
    expect(predraftGates({})).toEqual({
      pass: false,
      failed: ["grounding", "ttlOk", "accessOk", "policyNotStale"],
    });
  });
});
