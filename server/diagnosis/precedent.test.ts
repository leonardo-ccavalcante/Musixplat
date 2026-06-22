import { describe, it, expect } from "vitest";
import { reconfirmsLever, type PrecedentLever } from "./precedent";
import type { NbaVerdict } from "../agente/reasoning";

// 05D Part B — the re-confirmation gate, unit-isolated (pure, no DB). A precedent is only reusable if its
// action's signal STILL shows a real below/above gap on the CURRENT verdicts (the SQL-produced numbers).
const v = (action_code: string, verdict: string, gap: number | null): NbaVerdict => ({
  action_code,
  dimension: "m_connection",
  measured: 1,
  standard: 2,
  verdict,
  gap,
  within_range: true,
  n_min_ok: true,
  k_anon_ok: true,
});
const lever = (action_code: string): PrecedentLever => ({ action_code, dimension: "m_connection", verdict: "below" });

describe("reconfirmsLever (Part B — precedent re-validates on current data)", () => {
  it("re-confirms (returns the FRESH verdict) when the action still shows a real below gap", () => {
    const out = reconfirmsLever([v("A", "below", -5), v("B", "ok", null)], lever("A"));
    expect(out).not.toBeNull();
    expect(out?.gap).toBe(-5); // the CURRENT number, not the stale persisted one
  });

  it("re-confirms on an above gap too", () => {
    expect(reconfirmsLever([v("A", "above", 7)], lever("A"))).not.toBeNull();
  });

  it("null when the action is no longer out of standard (verdict ok / gap null)", () => {
    expect(reconfirmsLever([v("A", "ok", null)], lever("A"))).toBeNull();
  });

  it("null when verdict is below but the gap vanished (no real signal)", () => {
    expect(reconfirmsLever([v("A", "below", null)], lever("A"))).toBeNull();
  });

  it("null when the precedent's action isn't among the current verdicts", () => {
    expect(reconfirmsLever([v("B", "below", -5)], lever("A"))).toBeNull();
  });
});
