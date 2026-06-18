// Test: 05A:A.2.3 — resolve tier×intent policy at the vigente version + seal. (04 §7)
// Anti-mezcla: only seal when policy_version === vigente. Fail-closed on none/stale/ambiguous.
import { describe, it, expect } from "vitest";
import { resolvePolicy } from "../policy_resolver.js";
import type { PolicyRow } from "../policy_resolver.js";

const VIGENTE = "v2";

const baseRow: PolicyRow = {
  policy_id: "p1",
  tier_id: "tier_gold",
  policy_version: "v2",
  teto_tier: "HIGH",
  permitido_hoy: { max_discount: 30 },
};

describe("resolvePolicy — 05A:A.2.3", () => {
  it("one matching tier + vigente version ⇒ sealed=true, reason=ok", () => {
    const result = resolvePolicy([baseRow], "tier_gold", VIGENTE);
    expect(result.sealed).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.policy_version).toBe("v2");
    expect(result.tetoTier).toBe("HIGH");
    expect(result.permitidoHoy).toEqual({ max_discount: 30 });
  });

  it("candidates exist but ALL stale version ⇒ sealed=false, reason=stale", () => {
    const staleRow: PolicyRow = { ...baseRow, policy_version: "v1" };
    const result = resolvePolicy([staleRow], "tier_gold", VIGENTE);
    expect(result.sealed).toBe(false);
    expect(result.reason).toBe("stale");
    expect(result.tetoTier).toBeNull();
    expect(result.permitidoHoy).toBeNull();
  });

  it("no candidate for tier ⇒ sealed=false, reason=none", () => {
    const result = resolvePolicy([baseRow], "tier_silver", VIGENTE);
    expect(result.sealed).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("two candidates same tier + same version ⇒ sealed=false, reason=ambiguous", () => {
    const row2: PolicyRow = { ...baseRow, policy_id: "p2" };
    const result = resolvePolicy([baseRow, row2], "tier_gold", VIGENTE);
    expect(result.sealed).toBe(false);
    expect(result.reason).toBe("ambiguous");
  });

  it("null candidates ⇒ sealed=false, reason=none (fail-closed §3.7)", () => {
    const result = resolvePolicy(null, "tier_gold", VIGENTE);
    expect(result.sealed).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("undefined candidates ⇒ sealed=false, reason=none (fail-closed §3.7)", () => {
    const result = resolvePolicy(undefined, "tier_gold", VIGENTE);
    expect(result.sealed).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("empty array ⇒ sealed=false, reason=none", () => {
    const result = resolvePolicy([], "tier_gold", VIGENTE);
    expect(result.sealed).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("mix of stale + vigente rows for tier ⇒ sealed=true (vigente wins, not ambiguous)", () => {
    const staleRow: PolicyRow = { ...baseRow, policy_id: "p_old", policy_version: "v1" };
    const result = resolvePolicy([staleRow, baseRow], "tier_gold", VIGENTE);
    expect(result.sealed).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.policy_version).toBe("v2");
  });

  it("other-tier vigente row does not bleed into tier_silver ⇒ reason=none", () => {
    const result = resolvePolicy([baseRow], "tier_silver", VIGENTE);
    expect(result.sealed).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("deterministic: same inputs produce same output", () => {
    const r1 = resolvePolicy([baseRow], "tier_gold", VIGENTE);
    const r2 = resolvePolicy([baseRow], "tier_gold", VIGENTE);
    expect(r1).toEqual(r2);
  });

  it("policy_version is null on non-ok result", () => {
    const result = resolvePolicy([], "tier_gold", VIGENTE);
    expect(result.policy_version).toBeNull();
  });
});
