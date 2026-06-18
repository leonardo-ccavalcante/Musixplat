// Test suite for Piece 05A:A.5.4 — independent read-back quality gate. (04 §10)
import { describe, it, expect } from "vitest";
import { verifyReadback } from "../readback_verify.js";

describe("verifyReadback — 05A:A.5.4 (independent read-back quality gate, fail-closed)", () => {
  // --- confirmed:true cases ---

  it("equal primitive strings + independent ⇒ confirmed, reason ok", () => {
    const r = verifyReadback({ expected: "hello", observed: "hello", sourceIndependent: true });
    expect(r.confirmed).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("equal numbers + independent ⇒ confirmed", () => {
    const r = verifyReadback({ expected: 42, observed: 42, sourceIndependent: true });
    expect(r.confirmed).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("equal booleans + independent ⇒ confirmed", () => {
    const r = verifyReadback({ expected: false, observed: false, sourceIndependent: true });
    expect(r.confirmed).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("equal plain objects + independent ⇒ confirmed", () => {
    const r = verifyReadback({
      expected: { a: 1, b: "x" },
      observed: { a: 1, b: "x" },
      sourceIndependent: true,
    });
    expect(r.confirmed).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("nested objects deep-equal + independent ⇒ confirmed", () => {
    const r = verifyReadback({
      expected: { a: { b: { c: [1, 2, 3] } } },
      observed: { a: { b: { c: [1, 2, 3] } } },
      sourceIndependent: true,
    });
    expect(r.confirmed).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("equal arrays + independent ⇒ confirmed", () => {
    const r = verifyReadback({ expected: [1, 2, 3], observed: [1, 2, 3], sourceIndependent: true });
    expect(r.confirmed).toBe(true);
    expect(r.reason).toBe("ok");
  });

  // --- mismatch cases ---

  it("different primitive strings ⇒ mismatch, not confirmed", () => {
    const r = verifyReadback({ expected: "hello", observed: "world", sourceIndependent: true });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("mismatch");
  });

  it("different numbers ⇒ mismatch", () => {
    const r = verifyReadback({ expected: 1, observed: 2, sourceIndependent: true });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("mismatch");
  });

  it("objects with different values ⇒ mismatch", () => {
    const r = verifyReadback({
      expected: { a: 1 },
      observed: { a: 2 },
      sourceIndependent: true,
    });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("mismatch");
  });

  it("objects with different keys ⇒ mismatch", () => {
    const r = verifyReadback({
      expected: { a: 1 },
      observed: { b: 1 },
      sourceIndependent: true,
    });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("mismatch");
  });

  it("arrays with different lengths ⇒ mismatch", () => {
    const r = verifyReadback({ expected: [1, 2], observed: [1, 2, 3], sourceIndependent: true });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("mismatch");
  });

  it("nested objects differ at depth ⇒ mismatch", () => {
    const r = verifyReadback({
      expected: { a: { b: 1 } },
      observed: { a: { b: 2 } },
      sourceIndependent: true,
    });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("mismatch");
  });

  // --- no_readback cases ---

  it("observed undefined ⇒ no_readback (fail-closed)", () => {
    const r = verifyReadback({ expected: "x", observed: undefined, sourceIndependent: true });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("no_readback");
  });

  it("observed null ⇒ no_readback (fail-closed)", () => {
    const r = verifyReadback({ expected: "x", observed: null, sourceIndependent: true });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("no_readback");
  });

  it("null input ⇒ no_readback (fail-closed)", () => {
    const r = verifyReadback(null);
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("no_readback");
  });

  it("undefined input ⇒ no_readback (fail-closed)", () => {
    const r = verifyReadback(undefined);
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("no_readback");
  });

  // --- not_independent (fail-closed: echo detection) ---

  it("sourceIndependent=false, even if equal ⇒ not_independent (never confirm on echo)", () => {
    const r = verifyReadback({ expected: "same", observed: "same", sourceIndependent: false });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("not_independent");
  });

  it("sourceIndependent=false with matching objects ⇒ not_independent", () => {
    const r = verifyReadback({
      expected: { x: 1 },
      observed: { x: 1 },
      sourceIndependent: false,
    });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("not_independent");
  });

  it("sourceIndependent=false with mismatch still returns not_independent (not mismatch)", () => {
    // not_independent takes priority: we must not reveal whether they matched or not
    const r = verifyReadback({ expected: "a", observed: "b", sourceIndependent: false });
    expect(r.confirmed).toBe(false);
    expect(r.reason).toBe("not_independent");
  });

  // --- determinism ---

  it("same inputs always produce same output (deterministic)", () => {
    const input = { expected: { k: [1, 2] }, observed: { k: [1, 2] }, sourceIndependent: true };
    const r1 = verifyReadback(input);
    const r2 = verifyReadback(input);
    expect(r1).toEqual(r2);
  });
});
