import { describe, it, expect } from "vitest";
import { resolveAccessScope } from "../access_scope.js";
import type { Credential } from "../access_scope.js";

const cred: Credential = {
  status: "active",
  role: "agent",
  rbac_matrix: {
    RELEASE: { level_max_releasable: "HIGH", requires_2_eyes: false, origin_allowed: ["conversation"] },
    ESCALATE: { level_max_releasable: "LOW", requires_2_eyes: true, origin_allowed: ["nba"] },
  },
};

describe("resolveAccessScope — 05A:A.2.0 (access scope resolver, fail-closed, 04 §7)", () => {
  it("active + action present + level_max HIGH, tierCap MEDIUM ⇒ allowed, levelMax MEDIUM (capped by tier_cap)", () => {
    const r = resolveAccessScope(cred, "RELEASE", "MEDIUM");
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("MEDIUM");
    expect(r.requires2Eyes).toBe(false);
    expect(r.originAllowed).toEqual(["conversation"]);
  });

  it("active + level_max LOW, tierCap HIGH ⇒ levelMax LOW (cap is no-op, rbac wins)", () => {
    const r = resolveAccessScope(cred, "ESCALATE", "HIGH");
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("LOW");
  });

  it("active + level_max HIGH, tierCap HIGH ⇒ levelMax HIGH (equal, no cap reduction)", () => {
    const r = resolveAccessScope(cred, "RELEASE", "HIGH");
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("HIGH");
  });

  it("active + level_max MEDIUM, tierCap LOW ⇒ levelMax LOW (tier_cap is lower cap)", () => {
    const cred2: Credential = {
      status: "active",
      role: "agent",
      rbac_matrix: {
        PROPOSE: { level_max_releasable: "MEDIUM", requires_2_eyes: false, origin_allowed: ["nba"] },
      },
    };
    const r = resolveAccessScope(cred2, "PROPOSE", "LOW");
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("LOW");
  });

  it("status 'suspended' ⇒ fail-closed regardless of rbac", () => {
    const suspended: Credential = { ...cred, status: "suspended" };
    const r = resolveAccessScope(suspended, "RELEASE", "HIGH");
    expect(r.allowed).toBe(false);
    expect(r.levelMax).toBe("LOW");
    expect(r.requires2Eyes).toBe(true);
    expect(r.originAllowed).toEqual([]);
  });

  it("status 'revoked' ⇒ fail-closed", () => {
    const revoked: Credential = { ...cred, status: "revoked" };
    const r = resolveAccessScope(revoked, "RELEASE", "HIGH");
    expect(r.allowed).toBe(false);
    expect(r.levelMax).toBe("LOW");
  });

  it("action missing from rbac_matrix ⇒ fail-closed", () => {
    const r = resolveAccessScope(cred, "UNKNOWN_ACTION", "HIGH");
    expect(r.allowed).toBe(false);
    expect(r.levelMax).toBe("LOW");
    expect(r.requires2Eyes).toBe(true);
  });

  it("null cred ⇒ fail-closed", () => {
    const r = resolveAccessScope(null, "RELEASE", "HIGH");
    expect(r.allowed).toBe(false);
    expect(r.levelMax).toBe("LOW");
    expect(r.requires2Eyes).toBe(true);
    expect(r.originAllowed).toEqual([]);
  });

  it("undefined cred ⇒ fail-closed", () => {
    const r = resolveAccessScope(undefined, "RELEASE", "MEDIUM");
    expect(r.allowed).toBe(false);
    expect(r.levelMax).toBe("LOW");
  });

  it("null tierCap ⇒ LOW cap (fail-closed on unknown ceiling)", () => {
    const r = resolveAccessScope(cred, "RELEASE", null);
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("LOW");
  });

  it("undefined tierCap ⇒ LOW cap (fail-closed)", () => {
    const r = resolveAccessScope(cred, "RELEASE", undefined);
    expect(r.allowed).toBe(true);
    expect(r.levelMax).toBe("LOW");
  });

  it("requires2Eyes passthrough from rbac entry", () => {
    const r = resolveAccessScope(cred, "ESCALATE", "HIGH");
    expect(r.requires2Eyes).toBe(true);
  });

  it("deterministic: same input twice ⇒ identical output", () => {
    expect(resolveAccessScope(cred, "RELEASE", "MEDIUM")).toEqual(
      resolveAccessScope(cred, "RELEASE", "MEDIUM"),
    );
  });
});
