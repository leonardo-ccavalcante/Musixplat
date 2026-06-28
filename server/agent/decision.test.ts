import { describe, it, expect } from "vitest";
import { parseDecision } from "./decision.js";

// The agent's single structured output is a strict JSON decision. parseDecision is fail-closed: any
// shape it can't validate ⇒ null, and the caller degrades to a human handoff (never guesses an action).
describe("parseDecision — fail-closed structured output", () => {
  it("parses a clean JSON decision", () => {
    const d = parseDecision('{"internal":"x","action":"ask","problem_type":null,"reply":"oi"}');
    expect(d?.action).toBe("ask");
    expect(d?.reply).toBe("oi");
  });

  it("strips a ```json code fence the model sometimes adds", () => {
    const d = parseDecision('```json\n{"action":"bind","restaurant_id":"R-1","reply":"ok"}\n```');
    expect(d?.action).toBe("bind");
    expect(d?.restaurant_id).toBe("R-1");
  });

  it("accepts a valid problem_type for diagnose", () => {
    const d = parseDecision('{"action":"diagnose","problem_type":"cancellation","reply":"vou ver"}');
    expect(d?.action).toBe("diagnose");
    expect(d?.problem_type).toBe("cancellation");
  });

  it("returns null on non-JSON garbage", () => {
    expect(parseDecision("I think you should...")).toBeNull();
  });

  it("returns null when reply is missing (incomplete contract)", () => {
    expect(parseDecision('{"action":"ask"}')).toBeNull();
  });

  it("returns null on an unknown action", () => {
    expect(parseDecision('{"action":"refund","reply":"x"}')).toBeNull();
  });

  it("returns null on an out-of-enum problem_type", () => {
    expect(parseDecision('{"action":"diagnose","problem_type":"taxes","reply":"x"}')).toBeNull();
  });
});
