// server/motor/reasoning.test.ts  (REAL action codes A1..A8)
import { describe, expect, it } from "vitest";
import { stubMotorReasoning, leverAdapter } from "./reasoning.js";
import type { NbaVerdict } from "../agente/reasoning.js";

const v = (action_code: string, dimension: string | null, verdict: string, standard: number, gap: number | null): NbaVerdict => ({
  action_code, dimension, measured: 0.4, standard, verdict,
  gap, within_range: verdict === "ok", n_min_ok: true, k_anon_ok: true,
});

describe("stubMotorReasoning", () => {
  it("picks the worst-relative-gap problem lever NOT in discarded, with confidence", async () => {
    const h = await stubMotorReasoning.proposeHypothesis({
      verdicts: [v("A1", "m_connection", "below", 0.8, -0.6), v("A4", "m_quality", "below", 0.5, -0.025), v("A8", null, "no_data", 0, null)],
      discarded: [], grounding: [],
    });
    expect(h.lever?.action_code).toBe("A1");
    expect(h.confidence).toBeGreaterThan(0);
  });
  it("skips a discarded lever and returns the next; null when only 'ok'/'no_data'/discarded remain", async () => {
    const h = await stubMotorReasoning.proposeHypothesis({
      verdicts: [v("A1", "m_connection", "below", 0.8, -0.6), v("A8", null, "no_data", 0, null)],
      discarded: [{ action_code: "A1", reason: "sql_no_gap" }], grounding: [],
    });
    expect(h.lever).toBeNull();
  });
});

describe("leverAdapter", () => {
  it("returns an NbaReasoning whose select yields exactly the chosen lever", () => {
    const lever = v("A1", "m_connection", "below", 0.8, -0.6);
    const sel = leverAdapter(lever, "connection below").select([lever]);
    expect(sel.lever).toBe(lever);
    expect(sel.ranked).toEqual(["A1"]);
  });
});
