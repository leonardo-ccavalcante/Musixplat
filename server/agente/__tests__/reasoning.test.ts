import { describe, expect, it } from "vitest";
import { deterministicReasoning, type NbaVerdict } from "../reasoning";

// 02:1A reasoning provider — pure, no DB. The NUMBER is SQL (fn_nba_test); this only RANKS/selects.
// Severity = relative gap |gap|/|standard| (worst-first; tie → action_code asc). A zero standard ⇒
// Infinity (ranks worst, never silently dropped — §8: the AGENTE must not contradict an SQL verdict
// that DID attribute a cause). 'ok'/'no_data' are never problems (§14 fail-closed).
const v = (p: Partial<NbaVerdict> & Pick<NbaVerdict, "action_code" | "verdict">): NbaVerdict => ({
  dimension: p.action_code,
  measured: 0,
  standard: 1,
  gap: 0,
  within_range: false,
  n_min_ok: true,
  k_anon_ok: true,
  ...p,
});

describe("deterministicReasoning.select — worst relative gap, fail-closed", () => {
  it("ranks the worst relative gap as the lever; ok/no_data never selected; HARD CAP 3", () => {
    const sel = deterministicReasoning.select([
      v({ action_code: "A1", verdict: "below", standard: 0.8, gap: -0.1 }), // 0.125
      v({ action_code: "A6", verdict: "above", standard: 0.05, gap: 0.05 }), // 1.0  ← worst
      v({ action_code: "A2", verdict: "above", standard: 75, gap: 30 }), // 0.4
      v({ action_code: "A4", verdict: "ok", standard: 1, gap: 0 }), // not a problem
      v({ action_code: "A8", verdict: "no_data", standard: null, gap: null }), // not a problem
    ]);
    expect(sel.lever?.action_code).toBe("A6");
    expect(sel.ranked).toEqual(["A6", "A2", "A1"]); // worst→best, capped at 3
  });

  it("a zero-standard breach is NOT dropped — it ranks WORST (Infinity), not a silent A8 (§8)", () => {
    const sel = deterministicReasoning.select([
      v({ action_code: "A2", verdict: "above", standard: 75, gap: 30 }), // 0.4
      v({ action_code: "A6", verdict: "above", standard: 0, gap: 0.05 }), // Infinity ← worst
    ]);
    expect(sel.lever?.action_code).toBe("A6");
    expect(sel.ranked[0]).toBe("A6");
  });

  it("total + deterministic order under ties (incl. Infinity===Infinity) ⇒ action_code asc, input-order independent", () => {
    const input: NbaVerdict[] = [
      v({ action_code: "A7", verdict: "above", standard: 0, gap: 1 }), // Infinity
      v({ action_code: "A3", verdict: "above", standard: 0, gap: 9 }), // Infinity
    ];
    const a = deterministicReasoning.select(input);
    const b = deterministicReasoning.select([...input].reverse());
    expect(a.lever?.action_code).toBe("A3"); // tie → action_code asc
    expect(b.lever?.action_code).toBe("A3"); // same regardless of input order (no NaN in comparator)
  });

  it("no problem (all ok/no_data) ⇒ no lever ⇒ escalate / A8", () => {
    const sel = deterministicReasoning.select([
      v({ action_code: "A1", verdict: "ok" }),
      v({ action_code: "A8", verdict: "no_data", standard: null, gap: null }),
    ]);
    expect(sel.lever).toBeNull();
    expect(sel.ranked).toEqual([]);
  });
});
