import { describe, it, expect } from "vitest";
import type { ChatClient } from "../_core/llm.js";
import { deterministicReasoning, llmReasoning } from "./reasoning";

// 05B AGENTE seam. The deterministic provider drives the CI gate (no key/network). The LLM provider
// is exercised here with a FAKE client so the real-Claude path (US-B2.1.1/US-B2.2.1) has coverage:
// it must parse TEXT only (§8), clamp confidence to [0,1], and THROW on any off-contract output so
// the orchestrator fail-closes (BR-B3) — never invent an area/number.

function fakeClient(text: string): ChatClient {
  return {
    chat: { completions: { create: async () => ({ choices: [{ message: { content: text } }] }) } },
  } as unknown as ChatClient;
}

describe("deterministicReasoning (gate provider, no LLM)", () => {
  it("classifies finance from a payment/billing signal; unknown ⇒ low-confidence unclassified", async () => {
    expect(await deterministicReasoning.classifyArea({ text: "billing" })).toEqual({
      areaType: "finance",
      confidence: 0.7,
    });
    expect(await deterministicReasoning.classifyArea({ text: "menu" })).toEqual({
      areaType: "unclassified",
      confidence: 0.3,
    });
  });

  it("ranks the seed hypotheses in order with strictly-decreasing [C] probabilities", async () => {
    const ranked = await deterministicReasoning.rankPaths({
      areaType: "finance",
      hypotheses: ["a", "b", "c"],
    });
    expect(ranked.map((r) => r.path_id)).toEqual([1, 2, 3]);
    expect(ranked[0]!.probability).toBeGreaterThan(ranked[2]!.probability);
  });
});

describe("llmReasoning (real-OpenAI path, faked client)", () => {
  it("parses TEXT-only JSON and clamps confidence into [0,1]", async () => {
    const r = llmReasoning(fakeClient('{"areaType":"finance","confidence":1.5}'));
    expect(await r.classifyArea({ text: "no le cayó el pago" })).toEqual({
      areaType: "finance",
      confidence: 1, // clamped — never a fabricated >1 value
    });
  });

  it("throws (fail-closed §8/BR-B3) when the area is off the closed list", async () => {
    const r = llmReasoning(fakeClient('{"areaType":"sales","confidence":0.9}'));
    await expect(r.classifyArea({ text: "x" })).rejects.toThrow(/off-contract/);
  });

  it("throws when confidence is not a number", async () => {
    const r = llmReasoning(fakeClient('{"areaType":"finance","confidence":"high"}'));
    await expect(r.classifyArea({ text: "x" })).rejects.toThrow(/off-contract/);
  });

  it("throws when the model returns an empty response", async () => {
    const noText = {
      chat: { completions: { create: async () => ({ choices: [{ message: { content: null } }] }) } },
    } as unknown as ChatClient;
    await expect(llmReasoning(noText).classifyArea({ text: "x" })).rejects.toThrow(/empty response/);
  });

  it("ranks paths from a JSON array and assigns path_ids most-likely first", async () => {
    const r = llmReasoning(
      fakeClient('[{"hypothesis":"h1","probability":0.9},{"hypothesis":"h2","probability":0.4}]'),
    );
    const ranked = await r.rankPaths({ areaType: "finance", hypotheses: ["h1", "h2"] });
    expect(ranked.map((p) => p.path_id)).toEqual([1, 2]);
    expect(ranked[0]!.hypothesis).toBe("h1");
  });

  it("throws on an empty rank (fail-closed: never proceed with no path)", async () => {
    const r = llmReasoning(fakeClient("[]"));
    await expect(r.rankPaths({ areaType: "finance", hypotheses: [] })).rejects.toThrow(/empty/);
  });
});
