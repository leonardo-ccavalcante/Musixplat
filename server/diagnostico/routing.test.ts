import { describe, it, expect } from "vitest";
import { routeStub, comunicacionBranch, proactiveMessageBranch } from "./routing.js";

// 05B EPIC-B6 — routing + proactive-communication branches (deterministic, no LLM).
// Pieces under test: US-B6.1.1 (route stub), US-B6.4.1 (comunicacionBranch), B.8.6 (proactive).
// 04 §3 R6 (deterministic-never-LLM) / §7 (fail-closed). BR-B13 / EC-B14.

describe("05B:US-B6.1.1 routeStub — demo fixed area_type → ruta", () => {
  it("maps 'finance' → 'fix_internal' (the one DEMO rule)", () => {
    expect(routeStub("finance")).toBe("fix_internal");
  });

  it("maps an unknown area_type → 'monitor_with_trigger' (conservative default)", () => {
    expect(routeStub("logistics")).toBe("monitor_with_trigger");
    expect(routeStub("")).toBe("monitor_with_trigger");
  });

  it("maps null → 'monitor_with_trigger' (fail-closed default, §7)", () => {
    expect(routeStub(null)).toBe("monitor_with_trigger");
  });
});

describe("05B:US-B6.4.1 comunicacionBranch — BR-B13 default no-notify", () => {
  it("'notify' policy ⇒ 'notify'", () => {
    expect(comunicacionBranch("notify")).toBe("notify");
  });

  it("'fix_silently' policy ⇒ 'no_notify'", () => {
    expect(comunicacionBranch("fix_silently")).toBe("no_notify");
  });

  it("null/absent policy ⇒ 'no_notify' (DEFAULT no-notify, fail-closed)", () => {
    expect(comunicacionBranch(null)).toBe("no_notify");
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
