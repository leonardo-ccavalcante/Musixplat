import { describe, it, expect } from "vitest";
import { financialAbort } from "../financial_abort.js";

// umbralAntifrac supplied by caller reading Config_Knobs by name (CLAUDE.md §3.8)
const UMBRAL = 1000;

const base = {
  classFinanciera: "indirecta",
  autonomo: false,
  sumaVentana: 0,
  montoNuevo: 100,
};

describe("financialAbort — 05A:A.5.3 (financial abort gate, hard-no + anti-frac, 04 §7)", () => {
  // --- hard-no: directa + autonomo ---
  it("directa + autonomo ⇒ abort 'directa_no_auto'", () => {
    const r = financialAbort(
      { classFinanciera: "directa", autonomo: true, sumaVentana: 0, montoNuevo: 100 },
      UMBRAL,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("directa_no_auto");
  });

  // --- directa + NOT autonomo: human proposes ⇒ no directa_no_auto; antifrac still applies ---
  it("directa + NOT autonomo + under umbral ⇒ {abort:false,'none'}", () => {
    const r = financialAbort(
      { classFinanciera: "directa", autonomo: false, sumaVentana: 0, montoNuevo: 100 },
      UMBRAL,
    );
    expect(r.abort).toBe(false);
    expect(r.reason).toBe("none");
  });

  it("directa + NOT autonomo + over umbral ⇒ abort 'antifrac'", () => {
    const r = financialAbort(
      { classFinanciera: "directa", autonomo: false, sumaVentana: 900, montoNuevo: 200 },
      UMBRAL,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("antifrac");
  });

  // --- directa + autonomo + also over umbral: directa_no_auto takes precedence ---
  it("directa + autonomo + over umbral ⇒ reason is 'directa_no_auto' (hard-no checked first)", () => {
    const r = financialAbort(
      { classFinanciera: "directa", autonomo: true, sumaVentana: 900, montoNuevo: 200 },
      UMBRAL,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("directa_no_auto");
  });

  // --- antifrac: indirecta ---
  it("indirecta + sum+nuevo > umbral ⇒ abort 'antifrac'", () => {
    const r = financialAbort(
      { classFinanciera: "indirecta", autonomo: true, sumaVentana: 900, montoNuevo: 200 },
      UMBRAL,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("antifrac");
  });

  it("indirecta + sum+nuevo === umbral (boundary) ⇒ {abort:false,'none'}", () => {
    const r = financialAbort(
      { classFinanciera: "indirecta", autonomo: true, sumaVentana: 900, montoNuevo: 100 },
      UMBRAL,
    );
    expect(r.abort).toBe(false);
    expect(r.reason).toBe("none");
  });

  it("indirecta + sum+nuevo < umbral ⇒ {abort:false,'none'}", () => {
    const r = financialAbort(
      { classFinanciera: "indirecta", autonomo: false, sumaVentana: 0, montoNuevo: 100 },
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

  it("NaN umbralAntifrac ⇒ abort 'fail_closed'", () => {
    const r = financialAbort(base, NaN);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("negative umbralAntifrac ⇒ abort 'fail_closed'", () => {
    const r = financialAbort(base, -1);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("zero umbralAntifrac ⇒ abort 'fail_closed' (nonsensical threshold)", () => {
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
    const ctx = { classFinanciera: "indirecta", autonomo: true, sumaVentana: 500, montoNuevo: 200 };
    expect(financialAbort(ctx, UMBRAL)).toEqual(financialAbort(ctx, UMBRAL));
  });
});
