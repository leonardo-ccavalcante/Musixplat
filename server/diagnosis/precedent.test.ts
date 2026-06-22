import { describe, it, expect } from "vitest";
import { reconfirmsLever, type PrecedentLever } from "./precedent";
import type { NbaVerdict } from "../agente/reasoning";

// 05D Part B — the re-confirmation gate, unit-isolated (pure, no DB). A precedent is only reusable if its
// action's signal STILL shows a real below/above gap on the CURRENT verdicts (the SQL-produced numbers).
const v = (action_code: string, dimension: string, verdict: string, gap: number | null): NbaVerdict => ({
  action_code, dimension, measured: 1, standard: 2, verdict, gap, within_range: true, n_min_ok: true, k_anon_ok: true,
});
const lever = (action_code: string, dimension: string, verdict: string): PrecedentLever =>
  ({ action_code, dimension, verdict, cohort_rule_version: "v1" });

describe("reconfirmsLever (Part B — precedent re-validates the FULL predicate on current data)", () => {
  it("re-confirms (returns the FRESH verdict) when action+dimension+direction all still hold", () => {
    const out = reconfirmsLever([v("A", "m_connection", "below", -5), v("B", "m_cancel", "ok", null)], lever("A", "m_connection", "below"));
    expect(out).not.toBeNull();
    expect(out?.gap).toBe(-5); // the CURRENT number, not the stale persisted one
  });

  it("re-confirms on a matching above breach", () => {
    expect(reconfirmsLever([v("A", "m_x", "above", 7)], lever("A", "m_x", "above"))).not.toBeNull();
  });

  it("null when the breach DIRECTION flipped (precedent fixed a below, now above · Codex)", () => {
    expect(reconfirmsLever([v("A", "m_connection", "above", 7)], lever("A", "m_connection", "below"))).toBeNull();
  });

  it("null when the DIMENSION differs (same action_code, different signal · Codex)", () => {
    expect(reconfirmsLever([v("A", "m_other", "below", -5)], lever("A", "m_connection", "below"))).toBeNull();
  });

  it("null when the signal is no longer out of standard (verdict ok / gap null)", () => {
    expect(reconfirmsLever([v("A", "m_connection", "ok", null)], lever("A", "m_connection", "below"))).toBeNull();
    expect(reconfirmsLever([v("A", "m_connection", "below", null)], lever("A", "m_connection", "below"))).toBeNull();
  });

  it("null when the action isn't among the current verdicts", () => {
    expect(reconfirmsLever([v("B", "m_connection", "below", -5)], lever("A", "m_connection", "below"))).toBeNull();
  });
});
