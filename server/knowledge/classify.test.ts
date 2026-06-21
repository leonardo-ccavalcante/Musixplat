import { describe, it, expect } from "vitest";
import { deterministicClassify, DOC_TYPES } from "./classify.js";

describe("deterministicClassify", () => {
  it("maps refund/cancellation wording to Policy", () => {
    const r = deterministicClassify("This refund and cancellation policy governs releases.");
    expect(r.docType).toBe("Policy");
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("maps terms/liability wording to Terms", () => {
    expect(deterministicClassify("These terms and conditions limit our liability.").docType).toBe("Terms");
  });

  it("maps FAQ wording to FAQ", () => {
    expect(deterministicClassify("FAQ: how do I reset my password?").docType).toBe("FAQ");
  });

  it("maps runbook/escalation wording to Runbook", () => {
    expect(deterministicClassify("Runbook: on-call escalation procedure step 1.").docType).toBe("Runbook");
  });

  it("maps company background wording to Context", () => {
    expect(deterministicClassify("About us: company background and mission overview.").docType).toBe("Context");
  });

  it("fail-closed to Other on no signal", () => {
    const r = deterministicClassify("zzz qqq");
    expect(r.docType).toBe("Other");
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("only ever returns a type from the closed MECE list", () => {
    expect(DOC_TYPES).toEqual(["Policy", "Context", "FAQ", "Terms", "Runbook", "Other"]);
    for (const sample of ["refund policy", "terms", "faq", "runbook", "about us", "zzz"]) {
      expect(DOC_TYPES).toContain(deterministicClassify(sample).docType);
    }
  });
});
