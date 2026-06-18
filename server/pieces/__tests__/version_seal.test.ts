// Tests for 05A:A.6.1 — sealVersions pure fn. Red must precede green.
import { describe, it, expect } from "vitest";
import { sealVersions } from "../version_seal.js";

const ok = {
  actedPolicyVersion: "policy-v3",
  currentPolicyVersion: "policy-v3",
  actedTonoVersion: "tono-v2",
  currentTonoVersion: "tono-v2",
};

describe("sealVersions — 05A:A.6.1 (anti-mezcla version seal, fail-closed)", () => {
  it("both versions match ⇒ sealed:true, stale:false, versions populated, drifted empty", () => {
    const r = sealVersions(ok);
    expect(r.sealed).toBe(true);
    expect(r.stale).toBe(false);
    expect(r.policy_version).toBe("policy-v3");
    expect(r.tono_version).toBe("tono-v2");
    expect(r.drifted).toEqual([]);
  });

  it("policy drifted ⇒ sealed:false, stale:true, drifted=['policy_version']", () => {
    const r = sealVersions({ ...ok, currentPolicyVersion: "policy-v4" });
    expect(r.sealed).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.drifted).toEqual(["policy_version"]);
  });

  it("tono drifted ⇒ sealed:false, stale:true, drifted=['tono_version']", () => {
    const r = sealVersions({ ...ok, currentTonoVersion: "tono-v3" });
    expect(r.sealed).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.drifted).toEqual(["tono_version"]);
  });

  it("both drifted ⇒ drifted contains both keys", () => {
    const r = sealVersions({
      actedPolicyVersion: "policy-v1",
      currentPolicyVersion: "policy-v2",
      actedTonoVersion: "tono-v1",
      currentTonoVersion: "tono-v2",
    });
    expect(r.sealed).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.drifted.sort()).toEqual(["policy_version", "tono_version"]);
  });

  it.each([
    ["null input", null],
    ["undefined input", undefined],
  ])("fail-closed (degrade, not throw) on missing input: %s ⇒ sealed:false, stale:true", (_n, input) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = sealVersions(input as any);
    expect(r.sealed).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.policy_version).toBeNull();
    expect(r.tono_version).toBeNull();
  });

  it("deterministic: same input twice ⇒ identical output", () => {
    expect(sealVersions(ok)).toEqual(sealVersions(ok));
  });

  it("drifted is empty array (not omitted) when no drift", () => {
    expect(sealVersions(ok).drifted).toEqual([]);
  });

  it("versions are null in the output when sealed:false (no attributable version on drift)", () => {
    const r = sealVersions({ ...ok, currentPolicyVersion: "policy-v99" });
    expect(r.policy_version).toBeNull();
    expect(r.tono_version).toBeNull();
  });
});
