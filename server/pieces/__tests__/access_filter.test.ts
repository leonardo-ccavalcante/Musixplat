import { describe, it, expect } from "vitest";
import { accessFilter } from "../access_filter.js";
import type { AccessQuery, AccessDecision } from "../access_filter.js";

describe("accessFilter — 05A:A.2.1 (hard access filter: pool match + k-anon, deny-by-default, 04 §7)", () => {
  it("tenantMatches true + n=10 k=5 ⇒ {allow:true, reason:'ok'}", () => {
    const r = accessFilter({ tenantMatches: true, n: 10 }, 5);
    expect(r).toEqual<AccessDecision>({ allow: true, reason: "ok" });
  });

  it("tenantMatches true + n=3 k=5 ⇒ {allow:false, reason:'k_anon_suppressed'}", () => {
    const r = accessFilter({ tenantMatches: true, n: 3 }, 5);
    expect(r).toEqual<AccessDecision>({ allow: false, reason: "k_anon_suppressed" });
  });

  it("n exactly == k ⇒ allow:true (>= boundary, not strict >)", () => {
    const r = accessFilter({ tenantMatches: true, n: 5 }, 5);
    expect(r.allow).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("tenantMatches false + n=9999 k=1 ⇒ {allow:false, reason:'cross_pool'} (cross_pool takes priority)", () => {
    const r = accessFilter({ tenantMatches: false, n: 9999 }, 1);
    expect(r).toEqual<AccessDecision>({ allow: false, reason: "cross_pool" });
  });

  it("tenantMatches false + n=0 k=100 ⇒ cross_pool still wins over k_anon", () => {
    const r = accessFilter({ tenantMatches: false, n: 0 }, 100);
    expect(r.reason).toBe("cross_pool");
  });

  it("null query ⇒ {allow:false, reason:'fail_closed'}", () => {
    const r = accessFilter(null, 5);
    expect(r).toEqual<AccessDecision>({ allow: false, reason: "fail_closed" });
  });

  it("undefined query ⇒ {allow:false, reason:'fail_closed'}", () => {
    const r = accessFilter(undefined, 5);
    expect(r).toEqual<AccessDecision>({ allow: false, reason: "fail_closed" });
  });

  it("NaN n ⇒ fail_closed", () => {
    const r = accessFilter({ tenantMatches: true, n: NaN }, 5);
    expect(r).toEqual<AccessDecision>({ allow: false, reason: "fail_closed" });
  });

  it("NaN k ⇒ fail_closed", () => {
    const r = accessFilter({ tenantMatches: true, n: 10 }, NaN);
    expect(r).toEqual<AccessDecision>({ allow: false, reason: "fail_closed" });
  });

  it("negative n ⇒ fail_closed", () => {
    const r = accessFilter({ tenantMatches: true, n: -1 }, 5);
    expect(r).toEqual<AccessDecision>({ allow: false, reason: "fail_closed" });
  });

  it("negative k ⇒ fail_closed", () => {
    const r = accessFilter({ tenantMatches: true, n: 10 }, -1);
    expect(r).toEqual<AccessDecision>({ allow: false, reason: "fail_closed" });
  });

  it("non-integer n (float) with n >= k ⇒ allow (valid finite positive)", () => {
    const r = accessFilter({ tenantMatches: true, n: 5.5 }, 5);
    expect(r.allow).toBe(true);
  });

  it("deterministic: same input twice ⇒ identical output", () => {
    const q: AccessQuery = { tenantMatches: true, n: 10 };
    expect(accessFilter(q, 5)).toEqual(accessFilter(q, 5));
  });
});
