import { describe, it, expect } from "vitest";
import { chatText, type ChatClient } from "./llm.js";

// A fake OpenAI-shaped client: returns one assistant message and (optionally) a usage block, exactly
// like OpenAI / OpenRouter do. The seam must surface token usage so cost-per-process can be logged
// (§3.6: the COUNT is a provider fact, the COST is computed in SQL — never an LLM-produced number).
function fakeClient(
  content: string,
  usage?: { prompt_tokens: number; completion_tokens: number },
): ChatClient {
  return {
    chat: { completions: { create: async () => ({ choices: [{ message: { content } }], usage }) } },
  } as unknown as ChatClient;
}

describe("chatText", () => {
  it("returns the assistant text alongside token usage from the provider", async () => {
    const res = await chatText(
      fakeClient("hello", { prompt_tokens: 12, completion_tokens: 7 }),
      "sys",
      "usr",
    );
    expect(res.text).toBe("hello");
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
  });

  it("defaults usage to zero when the provider omits it (text still returned)", async () => {
    const res = await chatText(fakeClient("hi"), "s", "u");
    expect(res.text).toBe("hi");
    expect(res.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("throws on an empty response so callers fail-closed", async () => {
    await expect(chatText(fakeClient(""), "s", "u")).rejects.toThrow();
  });
});
