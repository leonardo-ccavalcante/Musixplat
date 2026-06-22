import { describe, it, expect } from "vitest";
import { brainAgreement } from "./reasoning";
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
