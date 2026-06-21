import { describe, it, expect } from "vitest";
import { getActiveChatModel } from "./model.js";
import { CHAT_MODEL } from "./llm.js";

// The operator picks the chat model (knob llm_chat_model); the seam resolves it at call time so the
// choice takes effect. Fail-safe: an unset knob falls back to the default model (never empty/undefined).
describe("getActiveChatModel", () => {
  it("returns the configured model from the knob", async () => {
    expect(await getActiveChatModel(async () => "gpt-4o")).toBe("gpt-4o");
  });
  it("falls back to the default model when the knob is unset", async () => {
    expect(await getActiveChatModel(async () => undefined)).toBe(CHAT_MODEL);
  });
});
