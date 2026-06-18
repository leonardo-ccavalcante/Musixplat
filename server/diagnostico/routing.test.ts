import { describe, it, expect } from "vitest";
import { routeStub, comunicacionBranch, proactiveMessageBranch } from "./routing.js";

// 05B EPIC-B6 — routing + proactive-communication branches (deterministic, no LLM).
// Pieces under test: US-B6.1.1 (route stub), US-B6.4.1 (comunicacionBranch), B.8.6 (proactive).
// 04 §3 R6 (deterministic-never-LLM) / §7 (fail-closed). BR-B13 / EC-B14.

describe("05B:US-B6.1.1 routeStub — demo fixed tipo_area → ruta", () => {
  it("maps 'finanzas' → 'corregir_interno' (the one DEMO rule)", () => {
    expect(routeStub("finanzas")).toBe("corregir_interno");
  });

  it("maps an unknown tipo_area → 'monitorear_con_gatilho' (conservative default)", () => {
    expect(routeStub("logistica")).toBe("monitorear_con_gatilho");
    expect(routeStub("")).toBe("monitorear_con_gatilho");
  });

  it("maps null → 'monitorear_con_gatilho' (fail-closed default, §7)", () => {
    expect(routeStub(null)).toBe("monitorear_con_gatilho");
  });
});

describe("05B:US-B6.4.1 comunicacionBranch — BR-B13 default no-comunicar", () => {
  it("'avisar' policy ⇒ 'avisar'", () => {
    expect(comunicacionBranch("avisar")).toBe("avisar");
  });

  it("'corregir_callado' policy ⇒ 'no_comunicar'", () => {
    expect(comunicacionBranch("corregir_callado")).toBe("no_comunicar");
  });

  it("null/absent policy ⇒ 'no_comunicar' (DEFAULT no-comunicar, fail-closed)", () => {
    expect(comunicacionBranch(null)).toBe("no_comunicar");
  });
});

describe("05B:B.8.6 proactiveMessageBranch — delegate SEND to 05A only on avisar (EC-B14)", () => {
  it("'avisar' ⇒ dispatch via 05A (never reimplement the send)", () => {
    expect(proactiveMessageBranch("avisar")).toEqual({ dispatch: true, via: "05A" });
  });

  it("'corregir_callado' ⇒ no dispatch, no via (BR-B13)", () => {
    expect(proactiveMessageBranch("corregir_callado")).toEqual({ dispatch: false, via: null });
  });

  it("null ⇒ no dispatch (fail-closed default, never communicate)", () => {
    expect(proactiveMessageBranch(null)).toEqual({ dispatch: false, via: null });
  });
});
