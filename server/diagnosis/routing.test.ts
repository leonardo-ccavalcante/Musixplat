import { describe, it, expect } from "vitest";
import { routeStub, communicationBranch, proactiveMessageBranch } from "./routing.js";

// 05B EPIC-B6 — routing + proactive-communication branches (deterministic, no LLM).
// Pieces under test: US-B6.1.1 (route stub), US-B6.4.1 (communicationBranch), B.8.6 (proactive).
// 04 §3 R6 (deterministic-never-LLM) / §7 (fail-closed). BR-B13 / EC-B14.

describe("05B:US-B6.1.1 routeStub — demo fixed area_type → route", () => {
  it("maps 'finance' → 'fix_internal' (the one DEMO rule)", () => {
    expect(routeStub("finance")).toBe("fix_internal");
  });

  it("maps an unknown area_type → 'monitor_with_trigger' (conservative default)", () => {
    expect(routeStub("logistica")).toBe("monitor_with_trigger");
    expect(routeStub("")).toBe("monitor_with_trigger");
  });

  it("maps null → 'monitor_with_trigger' (fail-closed default, §7)", () => {
    expect(routeStub(null)).toBe("monitor_with_trigger");
  });
});

describe("05B:US-B6.4.1 communicationBranch — BR-B13 default do_not_notify", () => {
  it("'notify' policy ⇒ 'notify'", () => {
    expect(communicationBranch("notify")).toBe("notify");
  });

  it("'fix_silently' policy ⇒ 'do_not_notify'", () => {
    expect(communicationBranch("fix_silently")).toBe("do_not_notify");
  });

  it("null/absent policy ⇒ 'do_not_notify' (DEFAULT do-not-notify, fail-closed)", () => {
    expect(communicationBranch(null)).toBe("do_not_notify");
  });
});

describe("05B:B.8.6 proactiveMessageBranch — delegate SEND to 05A only on notify (EC-B14)", () => {
  it("'notify' ⇒ dispatch via 05A (never reimplement the send)", () => {
    expect(proactiveMessageBranch("notify")).toEqual({ dispatch: true, via: "05A" });
  });

  it("'fix_silently' ⇒ no dispatch, no via (BR-B13)", () => {
    expect(proactiveMessageBranch("fix_silently")).toEqual({ dispatch: false, via: null });
  });

  it("null ⇒ no dispatch (fail-closed default, never communicate)", () => {
    expect(proactiveMessageBranch(null)).toEqual({ dispatch: false, via: null });
  });
});
