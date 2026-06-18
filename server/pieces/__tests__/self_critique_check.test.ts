import { describe, it, expect } from "vitest";
import { selfCritiqueCheck } from "../self_critique_check.js";

// Piece 05A:A.3.6-CHECK — deterministic gate: verdict + bounded retry → decision.
// attempt is 0-based: attempt=0 means "this is the first try", attempt=maxRetries means
// retries exhausted. (04 §14)

describe("selfCritiqueCheck — 05A:A.3.6-CHECK", () => {
  it("(a) pass verdict ⇒ {decision:'pass', nextAttempt:null}", () => {
    expect(selfCritiqueCheck({ verdict: "pass", attempt: 0, maxRetries: 2 })).toEqual({
      decision: "pass",
      nextAttempt: null,
    });
  });

  it("(b) pass verdict on any attempt ⇒ pass (not retry)", () => {
    expect(selfCritiqueCheck({ verdict: "pass", attempt: 1, maxRetries: 2 })).toEqual({
      decision: "pass",
      nextAttempt: null,
    });
  });

  it("(c) fail at attempt 0 with maxRetries 2 ⇒ {decision:'retry', nextAttempt:1}", () => {
    expect(selfCritiqueCheck({ verdict: "fail", attempt: 0, maxRetries: 2 })).toEqual({
      decision: "retry",
      nextAttempt: 1,
    });
  });

  it("(d) fail at attempt 1 with maxRetries 2 ⇒ {decision:'retry', nextAttempt:2}", () => {
    expect(selfCritiqueCheck({ verdict: "fail", attempt: 1, maxRetries: 2 })).toEqual({
      decision: "retry",
      nextAttempt: 2,
    });
  });

  it("(e) fail at attempt 2 with maxRetries 2 ⇒ escalate (retries exhausted)", () => {
    expect(selfCritiqueCheck({ verdict: "fail", attempt: 2, maxRetries: 2 })).toEqual({
      decision: "escalate",
      nextAttempt: null,
    });
  });

  it("(f) fail attempt exceeds maxRetries ⇒ escalate (fail-closed)", () => {
    expect(selfCritiqueCheck({ verdict: "fail", attempt: 5, maxRetries: 2 })).toEqual({
      decision: "escalate",
      nextAttempt: null,
    });
  });

  it("(g) unknown verdict string ⇒ escalate (fail-closed)", () => {
    expect(selfCritiqueCheck({ verdict: "maybe", attempt: 0, maxRetries: 2 })).toEqual({
      decision: "escalate",
      nextAttempt: null,
    });
  });

  it("(h) empty string verdict ⇒ escalate (fail-closed)", () => {
    expect(selfCritiqueCheck({ verdict: "", attempt: 0, maxRetries: 2 })).toEqual({
      decision: "escalate",
      nextAttempt: null,
    });
  });

  it("(i) negative attempt ⇒ escalate (fail-closed; invalid input)", () => {
    expect(selfCritiqueCheck({ verdict: "fail", attempt: -1, maxRetries: 2 })).toEqual({
      decision: "escalate",
      nextAttempt: null,
    });
  });

  it("(j) NaN attempt ⇒ escalate (fail-closed; invalid input)", () => {
    expect(selfCritiqueCheck({ verdict: "fail", attempt: NaN, maxRetries: 2 })).toEqual({
      decision: "escalate",
      nextAttempt: null,
    });
  });

  it("(k) negative maxRetries ⇒ escalate immediately on fail (fail-closed)", () => {
    expect(selfCritiqueCheck({ verdict: "fail", attempt: 0, maxRetries: -1 })).toEqual({
      decision: "escalate",
      nextAttempt: null,
    });
  });

  it("(l) maxRetries=0 ⇒ even attempt 0 fail escalates immediately", () => {
    expect(selfCritiqueCheck({ verdict: "fail", attempt: 0, maxRetries: 0 })).toEqual({
      decision: "escalate",
      nextAttempt: null,
    });
  });

  it("(m) deterministic: same input twice gives identical output", () => {
    const input = { verdict: "fail", attempt: 1, maxRetries: 3 };
    expect(selfCritiqueCheck(input)).toEqual(selfCritiqueCheck(input));
  });
});
