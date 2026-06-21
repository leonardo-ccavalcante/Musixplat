import { describe, expect, it } from "vitest";
import { deterministicCopy, llmCopy, restaurantCopy, type CopyInput } from "./copywriter";
import type { ChatClient } from "../_core/llm";

const input: CopyInput = {
  actionLabel: "Investigate fraud/risk",
  cohortId: "healthy_east_long_tail_v1",
  evidence: "Customer-cancel rate 16.7% vs 5% standard · gap +11.7 pts",
  playbook: "1) Detect a customer-side cancellation pattern. 2) Escalate to human review. 3) Human decides.",
  numbers: ["16.7%", "5%"],
};

// A ChatClient fake — no SDK, no network. Returns whatever text we hand it (server/_core/llm shape).
const fakeClient = (reply: string): ChatClient => ({
  chat: { completions: { create: async () => ({ choices: [{ message: { content: reply } }] }) } },
});

describe("02:1a copywriter — restaurant-facing copy, [V] numbers preserved (§14, no LLM in CI)", () => {
  it("deterministicCopy = the §14-safe template (intro + measured + playbook)", () => {
    const out = deterministicCopy(input);
    expect(out).toContain("What we measured: Customer-cancel rate 16.7% vs 5% standard");
    expect(out).toContain("Recommended next steps:");
    expect(out).toContain("1) Detect a customer-side cancellation pattern");
  });

  it("llmCopy returns the model's message when every required figure survives", async () => {
    const reply =
      "We noticed about 16.7% of your recent orders were cancelled by customers, vs 5% typical.\n" +
      "1) Confirm prep times are realistic.\n2) Keep your menu in sync.\nYou've got this — small fixes add up.";
    const out = await llmCopy(fakeClient(reply))(input);
    expect(out).toContain("16.7%");
    expect(out).toContain("5%");
    expect(out).not.toContain("```");
  });

  it("llmCopy THROWS if the model drops a required [V] figure (number-preservation guard)", async () => {
    const reply = "We noticed more cancellations than usual. 1) Check prep times. 2) Update your menu.";
    await expect(llmCopy(fakeClient(reply))(input)).rejects.toThrow(/dropped required figure/);
  });

  it("llmCopy strips a code fence the model may add", async () => {
    const out = await llmCopy(fakeClient("```\nHi — 16.7% vs 5%. 1) Check prep.\n```"))(input);
    expect(out.startsWith("```")).toBe(false);
    expect(out).toContain("16.7%");
  });

  it("restaurantCopy under vitest is deterministic (never calls the paid LLM)", async () => {
    expect(await restaurantCopy(input)).toBe(deterministicCopy(input));
  });
});
