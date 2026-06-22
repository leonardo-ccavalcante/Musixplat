import { describe, it, expect } from "vitest";
import { brainAgreement, conversationText } from "./reasoning";
import type { AreaClassification } from "./reasoning";

// 05D Part A (F3) — the 2-brain agreement gate, unit-isolated (pure, no DB/network). Brain 1 = the
// deterministic keyword FLOOR; Brain 2 = the lead provider (LLM+RAG in prod). Leo 2026-06-22: an AREA
// mismatch ONLY is a disagreement — a same-area difference in sub-hypothesis or confidence is NOT, because
// Part B re-validation + Part D measurement still gate the action downstream. The case proceeds on the
// LEAD's classification (it read the customer's real text); a categorical area conflict ⇒ degrade-to-human.
const cls = (areaType: string, confidence: number): AreaClassification => ({ areaType, confidence });

describe("brainAgreement (Part A 2-brain gate — AREA mismatch only)", () => {
  it("agrees when both brains land on the same area; proceeds on the LEAD", () => {
    const g = brainAgreement(cls("finance", 0.7), cls("finance", 0.92));
    expect(g.disagreement).toBe(false);
    expect(g.areaType).toBe("finance"); // proceed on the lead (read the real text)
    expect(g.confidence).toBe(0.92); // the lead's confidence, not the floor's
  });

  it("disagrees ONLY on a different area ⇒ degrade-to-human", () => {
    const g = brainAgreement(cls("finance", 0.7), cls("product", 0.95));
    expect(g.disagreement).toBe(true);
    expect(g.areaType).toBe("product"); // still surfaces the lead's read for the console (Fase 4)
  });

  it("does NOT disagree on a confidence gap alone (area is the only axis, Leo)", () => {
    // Brain 1's confidence is a constant 0.70; a wildly different lead confidence must NOT trip the gate.
    const g = brainAgreement(cls("operations", 0.7), cls("operations", 0.05));
    expect(g.disagreement).toBe(false);
    expect(g.areaType).toBe("operations");
  });
});

describe("conversationText (Part A — the brains read what the customer SAID, not the label · Codex P1/P2)", () => {
  it("returns ONLY the restaurant-authored turns (the customer); agent replies are excluded", () => {
    const turnos = [
      { role: "restaurant", text: "the card machine keeps dropping the connection" },
      { role: "agent", text: "let me check your billing" }, // an agent reply must NOT skew the classification
      { role: "restaurant", text: "it happens every lunch rush" },
    ];
    expect(conversationText(turnos)).toBe("the card machine keeps dropping the connection it happens every lunch rush");
  });

  it('"" for an empty/absent transcript (or agent-only) ⇒ caller falls back to the intent label', () => {
    expect(conversationText([])).toBe(""); // turnos default '[]' (structured-ticket episode)
    expect(conversationText(null)).toBe("");
    expect(conversationText(undefined)).toBe("");
    expect(conversationText([{ role: "agent", text: "hello" }])).toBe(""); // no customer turn
  });

  it("tolerates a malformed turnos shape without throwing (untrusted)", () => {
    expect(conversationText("not-an-array")).toBe("");
    expect(conversationText([{ role: "restaurant", text: "ok" }, { text: "norole" }, { role: "restaurant", text: 42 }])).toBe("ok");
  });

  it("bounds the transcript so a huge valid upload can't blow the model context (Codex P2)", () => {
    const huge = [{ role: "restaurant", text: "x".repeat(20_000) }];
    expect(conversationText(huge).length).toBe(6000);
  });
});
