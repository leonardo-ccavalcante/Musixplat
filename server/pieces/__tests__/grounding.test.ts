import { describe, it, expect } from "vitest";
import { groundingGate } from "../grounding.js";

const TTL = 7 * 24 * 60 * 60 * 1000; // 7d in ms — value the caller reads from TTL_baseline_days
const ok = { freshnessMs: 1000, sourceResponded: true, unambiguous: true, tenantMatches: true };

describe("groundingGate — 05A:A.2.2 (4 deterministic checks, fail-closed BR-A1)", () => {
  it("all 4 checks pass ⇒ verificado, no failures", () => {
    const r = groundingGate(ok, TTL);
    expect(r.verified).toBe(true);
    expect(r.status).toBe("verificado");
    expect(r.failed).toEqual([]);
  });

  it("freshness boundary (freshnessMs === ttlMs) is still fresh (<=)", () => {
    expect(groundingGate({ ...ok, freshnessMs: TTL }, TTL).verified).toBe(true);
  });

  it.each([
    ["freshness", { ...ok, freshnessMs: TTL + 1 }],
    ["source", { ...ok, sourceResponded: false }],
    ["ambiguous", { ...ok, unambiguous: false }],
    ["tenant", { ...ok, tenantMatches: false }],
  ])("fail-closed on a single failed check: %s", (which, input) => {
    const r = groundingGate(input, TTL);
    expect(r.verified).toBe(false);
    expect(r.status).toBe("no_verificable");
    expect(r.failed).toContain(which);
  });

  it.each([
    ["NaN ttl", NaN],
    ["zero ttl", 0],
    ["negative ttl", -1],
  ])("fail-closed when ttl is invalid: %s (never optimistic)", (_n, ttl) => {
    const r = groundingGate(ok, ttl);
    expect(r.verified).toBe(false);
    expect(r.failed).toContain("freshness");
  });

  it.each([
    ["NaN freshness", NaN],
    ["negative freshness (future anchor)", -1],
  ])("fail-closed when freshness is invalid: %s", (_n, freshnessMs) => {
    expect(groundingGate({ ...ok, freshnessMs }, TTL).verified).toBe(false);
  });

  it("lists ALL failed checks together (observability for the decision/security log)", () => {
    const r = groundingGate(
      { freshnessMs: TTL + 1, sourceResponded: false, unambiguous: false, tenantMatches: false },
      TTL
    );
    expect(r.failed.sort()).toEqual(["ambiguous", "freshness", "source", "tenant"]);
  });

  it("deterministic: same input twice ⇒ identical output", () => {
    expect(groundingGate(ok, TTL)).toEqual(groundingGate(ok, TTL));
  });

  it.each([
    ["undefined checks", undefined],
    ["null checks", null],
  ])("fail-closed (degrade, not throw) when the whole checks object is missing: %s", (_n, c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = groundingGate(c as any, TTL);
    expect(r.verified).toBe(false);
    expect(r.status).toBe("no_verificable");
  });
});
