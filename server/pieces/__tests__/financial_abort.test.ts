import { describe, it, expect } from "vitest";
import { financialAbort } from "../financial_abort.js";

// thresholdAntifrac supplied by caller reading Config_Knobs by name (CLAUDE.md §3.8)
const UMBRAL = 1000;

const base = {
  classFinanciera: "indirect",
  autonomo: false,
  sumaVentana: 0,
  montoNuevo: 100,
};

describe("financialAbort — 05A:A.5.3 (financial abort gate, hard-no + anti-frac, 04 §7)", () => {
  // --- hard-no: direct + autonomo ---
  it("direct + autonomo ⇒ abort 'direct_no_auto'", () => {
    const r = financialAbort(
      { classFinanciera: "direct", autonomo: true, sumaVentana: 0, montoNuevo: 100 },
      UMBRAL,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("direct_no_auto");
  });

  // --- direct + NOT autonomo: human proposes ⇒ no direct_no_auto; antifrac still applies ---
  it("direct + NOT autonomo + under threshold ⇒ {abort:false,'none'}", () => {
    const r = financialAbort(
      { classFinanciera: "direct", autonomo: false, sumaVentana: 0, montoNuevo: 100 },
      UMBRAL,
    );
    expect(r.abort).toBe(false);
    expect(r.reason).toBe("none");
  });

  it("direct + NOT autonomo + over threshold ⇒ abort 'antifrac'", () => {
    const r = financialAbort(
      { classFinanciera: "direct", autonomo: false, sumaVentana: 900, montoNuevo: 200 },
      UMBRAL,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("antifrac");
  });

  // --- direct + autonomo + also over threshold: direct_no_auto takes precedence ---
  it("direct + autonomo + over threshold ⇒ reason is 'direct_no_auto' (hard-no checked first)", () => {
    const r = financialAbort(
      { classFinanciera: "direct", autonomo: true, sumaVentana: 900, montoNuevo: 200 },
      UMBRAL,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("direct_no_auto");
  });

  // --- antifrac: indirect ---
  it("indirect + sum+nuevo > threshold ⇒ abort 'antifrac'", () => {
    const r = financialAbort(
      { classFinanciera: "indirect", autonomo: true, sumaVentana: 900, montoNuevo: 200 },
      UMBRAL,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("antifrac");
  });

  it("indirect + sum+nuevo === threshold (boundary) ⇒ {abort:false,'none'}", () => {
    const r = financialAbort(
      { classFinanciera: "indirect", autonomo: true, sumaVentana: 900, montoNuevo: 100 },
      UMBRAL,
    );
    expect(r.abort).toBe(false);
    expect(r.reason).toBe("none");
  });

  it("indirect + sum+nuevo < threshold ⇒ {abort:false,'none'}", () => {
    const r = financialAbort(
      { classFinanciera: "indirect", autonomo: false, sumaVentana: 0, montoNuevo: 100 },
      UMBRAL,
    );
    expect(r.abort).toBe(false);
    expect(r.reason).toBe("none");
  });

  // --- fail-closed ---
  it("null ctx ⇒ abort 'fail_closed'", () => {
    const r = financialAbort(null, UMBRAL);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("undefined ctx ⇒ abort 'fail_closed'", () => {
    const r = financialAbort(undefined, UMBRAL);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("NaN thresholdAntifrac ⇒ abort 'fail_closed'", () => {
    const r = financialAbort(base, NaN);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("negative thresholdAntifrac ⇒ abort 'fail_closed'", () => {
    const r = financialAbort(base, -1);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("zero thresholdAntifrac ⇒ abort 'fail_closed' (nonsensical threshold)", () => {
    const r = financialAbort(base, 0);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("NaN sumaVentana ⇒ abort 'fail_closed'", () => {
    const r = financialAbort({ ...base, sumaVentana: NaN }, UMBRAL);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("NaN montoNuevo ⇒ abort 'fail_closed'", () => {
    const r = financialAbort({ ...base, montoNuevo: NaN }, UMBRAL);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("negative montoNuevo ⇒ abort 'fail_closed' (garbage input)", () => {
    const r = financialAbort({ ...base, montoNuevo: -1 }, UMBRAL);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("negative sumaVentana ⇒ abort 'fail_closed' (garbage input)", () => {
    const r = financialAbort({ ...base, sumaVentana: -1 }, UMBRAL);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  // --- determinism ---
  it("deterministic: same input twice ⇒ identical output", () => {
    const ctx = { classFinanciera: "indirect", autonomo: true, sumaVentana: 500, montoNuevo: 200 };
    expect(financialAbort(ctx, UMBRAL)).toEqual(financialAbort(ctx, UMBRAL));
  });
});
