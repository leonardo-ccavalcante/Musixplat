import { describe, it, expect } from "vitest";
import { classifyResolution, isAutoVerifiable } from "./remeasure";
import type { NbaVerdict } from "../agente/reasoning";

// 05D Part D — the prove-it-resolved classifier, unit-isolated (pure, no DB). After an action + a window,
// the SAME signal is re-measured (fn_nba_test_all). The verdict the SQL already produces IS the resolution
// signal: a breach (below/above) that became 'ok' is FIXED; one that still breaches is REOPENED; one that
// can't be measured (no_data / failed n_min∧k_anon) is UNMEASURABLE → re-queue, NEVER auto-resolved (§14).
const fresh = (verdict: string, gap: number | null, over: Partial<NbaVerdict> = {}): NbaVerdict => ({
  action_code: "A1", dimension: "m_connection", measured: 1, standard: 2, verdict, gap,
  within_range: verdict === "ok", n_min_ok: true, k_anon_ok: true, ...over,
});

describe("classifyResolution (Part D — 3-valued, never binary, never auto-resolve on absence)", () => {
  it("verified_fixed — the breach is gone (verdict 'ok'), measured with both gates", () => {
    expect(classifyResolution(fresh("ok", 0.3))).toBe("verified_fixed");
  });

  it("verified_reopened — the breach STILL holds (same direction)", () => {
    expect(classifyResolution(fresh("below", -0.4))).toBe("verified_reopened");
  });

  it("verified_reopened — the action OVERSHOT into the opposite breach (not a clean fix · conservative)", () => {
    expect(classifyResolution(fresh("above", 0.4))).toBe("verified_reopened");
  });

  it("unmeasurable — no_data (no W+window snapshot yet) ⇒ re-queue, never resolved (§14)", () => {
    expect(classifyResolution(fresh("no_data", null))).toBe("unmeasurable");
  });

  it("unmeasurable — gate failed (n_min or k_anon) ⇒ never resolve on a suppressed cell (§14/§3.2)", () => {
    expect(classifyResolution(fresh("ok", 0.3, { n_min_ok: false }))).toBe("unmeasurable");
    expect(classifyResolution(fresh("ok", 0.3, { k_anon_ok: false }))).toBe("unmeasurable");
  });

  it("unmeasurable — a null gap is never treated as a fix (belt-and-suspenders for no_data)", () => {
    expect(classifyResolution(fresh("ok", null))).toBe("unmeasurable");
  });

  it("unmeasurable — the action isn't among the fresh verdicts (undefined)", () => {
    expect(classifyResolution(undefined)).toBe("unmeasurable");
  });
});

describe("isAutoVerifiable (Part D — §59 attribution carve-out)", () => {
  it("a short-window own-metric signal CAN auto-verify (the restaurant's OWN absolute metric moved)", () => {
    expect(isAutoVerifiable("m_connection")).toBe(true);
    expect(isAutoVerifiable("m_quality")).toBe(true);
  });

  it("zone-shared signal is NEVER auto-verified (the whole zone moved — non-attributable → human)", () => {
    expect(isAutoVerifiable("zone_demand_trend")).toBe(false);
  });

  it("cohort-RELATIVE rank is NEVER auto-verified (rank moved ≠ the restaurant's own metric moved → human)", () => {
    expect(isAutoVerifiable("price_pctile_in_cohort")).toBe(false);
  });

  it("a rolling-window signal is NOT auto-verified yet (1-week verify ≠ its window — per-signal windows deferred)", () => {
    expect(isAutoVerifiable("cancel_by_restaurant")).toBe(false);
    expect(isAutoVerifiable("cancel_by_customer")).toBe(false);
  });

  it("an unknown/null dimension fails closed (not auto-verifiable)", () => {
    expect(isAutoVerifiable(null)).toBe(false);
    expect(isAutoVerifiable("something_new")).toBe(false);
  });
});
