import { describe, expect, it } from "vitest";
import { llmMotorReasoning } from "./llmReasoning.js";
import type { NbaVerdict } from "../agente/reasoning.js";

// A fake ChatClient — no network. Returns the given content + a fixed usage so we assert the §8 map-back and
// that token cost is reported (the loop records it). gpt shape: { choices:[{message:{content}}], usage }.
const fakeClient = (content: string) =>
  ({
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 12, completion_tokens: 7 } }),
      },
    },
  }) as never;

const v = (action_code: string, dimension: string, verdict: string, gap: number | null): NbaVerdict => ({
  action_code, dimension, measured: 0.4, standard: 0.6, verdict, gap, within_range: verdict === "ok", n_min_ok: true, k_anon_ok: true,
});

describe("llmMotorReasoning", () => {
  it("maps the LLM's chosen action_code BACK to the SQL verdict (§8: never a number) + returns usage", async () => {
    const r = llmMotorReasoning(fakeClient(JSON.stringify({ action_code: "A1", confidence: 0.8, reasoning: "late-night supply gap" })));
    const h = await r.proposeHypothesis({ verdicts: [v("A1", "m_connection", "below", -0.2), v("A4", "m_quality", "ok", null)], discarded: [], grounding: [] });
    expect(h.lever?.action_code).toBe("A1");
    expect(h.lever?.gap).toBe(-0.2); // the NUMBER came from the verdict, not the LLM
    expect(h.confidence).toBe(0.8);
    expect(h.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
  });

  it("returns lever=null when the LLM invents an action_code not in the verdicts (anti-fabrication ⇒ escalate)", async () => {
    const r = llmMotorReasoning(fakeClient(JSON.stringify({ action_code: "A9_made_up", confidence: 0.9, reasoning: "x" })));
    const h = await r.proposeHypothesis({ verdicts: [v("A1", "m_connection", "below", -0.2)], discarded: [], grounding: [] });
    expect(h.lever).toBeNull();
  });

  it("returns lever=null when the LLM chooses null (no-suppose)", async () => {
    const r = llmMotorReasoning(fakeClient(JSON.stringify({ action_code: null, confidence: 0, reasoning: "nothing confident" })));
    const h = await r.proposeHypothesis({ verdicts: [v("A1", "m_connection", "below", -0.2)], discarded: [], grounding: [] });
    expect(h.lever).toBeNull();
    expect(h.confidence).toBeNull();
  });

  it("returns the 'ok' lever the model picked so SQL can FALSIFY it downstream (loop reachable, P1-9)", async () => {
    const r = llmMotorReasoning(fakeClient(JSON.stringify({ action_code: "A4", confidence: 0.9, reasoning: "x" })));
    const h = await r.proposeHypothesis({ verdicts: [v("A1", "m_connection", "below", -0.2), v("A4", "m_quality", "ok", null)], discarded: [], grounding: [] });
    expect(h.lever?.action_code).toBe("A4"); // mapped back to the REAL verdict (no number invented, §8)
    expect(h.lever?.verdict).toBe("ok"); // validateHypothesis.confirmed will be false ⇒ falsified ⇒ retry, not refused here
  });

  it("fails closed on a non-finite confidence — NaN never slips past the floor (P1-8)", async () => {
    const r = llmMotorReasoning(fakeClient(JSON.stringify({ action_code: "A1", reasoning: "x" }))); // confidence omitted
    const h = await r.proposeHypothesis({ verdicts: [v("A1", "m_connection", "below", -0.2)], discarded: [], grounding: [] });
    expect(h.lever?.action_code).toBe("A1");
    expect(h.confidence).toBeNull(); // runMotor escalates on null — never acts on a NaN confidence
  });
});
