import { describe, it, expect } from "vitest";
import { redactPII } from "../pii.js";

// Patterns that must NEVER survive redaction (independent of the impl's own detectors).
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const IBAN_RE = /\b[A-Za-z]{2}\d{2}(?:[ ]?\d){10,30}\b/i;

describe("redactPII — 05A:A.1.2 (deterministic PII transform, fail-closed)", () => {
  it("(a) redacts email, phone, iban and card; none survive in texto", () => {
    const input =
      "Contacto: jose.perez@uber.com, tel +34 612 345 678 o 612345678, " +
      "IBAN ES91 2100 0418 4502 0005 1332, tarjeta 4111 1111 1111 1111.";
    const { texto } = redactPII(input);
    expect(texto).not.toMatch(EMAIL_RE);
    expect(texto).not.toMatch(IBAN_RE);
    expect(texto).not.toMatch(/\+34/);
    expect(texto).not.toMatch(/4111/);
    expect(texto).toMatch(/\[REDACTED:email\]/);
    expect(texto).toMatch(/\[REDACTED:phone\]/);
    expect(texto).toMatch(/\[REDACTED:iban\]/);
    expect(texto).toMatch(/\[REDACTED:card\]/);
  });

  it("(b) tipos lists exactly the distinct PII types found, sorted & deduped", () => {
    const { tipos } = redactPII(
      "a@b.com and c@d.com plus IBAN ES91 2100 0418 4502 0005 1332"
    );
    expect(tipos).toEqual(["email", "iban"]);
  });

  it("(c) residualPII is false after redaction on normal input", () => {
    const { residualPII } = redactPII(
      "mail x@y.com tel +34 612 345 678 iban ES91 2100 0418 4502 0005 1332 card 4111111111111111"
    );
    expect(residualPII).toBe(false);
  });

  it("(d) deterministic: same input twice gives identical output", () => {
    const input = "reach me at z@w.com or +34 600 111 222, IBAN ES9121000418450200051332";
    expect(redactPII(input)).toEqual(redactPII(input));
  });

  it("(e) input with no PII is returned unchanged with empty signal", () => {
    const input = "El pedido llego frio y tarde, sin datos personales aqui.";
    expect(redactPII(input)).toEqual({ texto: input, residualPII: false, tipos: [] });
  });

  it("redacts IBAN with no spaces", () => {
    const { texto, tipos } = redactPII("IBAN ES9121000418450200051332 fin");
    expect(texto).not.toMatch(IBAN_RE);
    expect(texto).toContain("[REDACTED:iban]");
    expect(tipos).toContain("iban");
  });

  it("redacts a bare Spanish 9-digit phone", () => {
    const { texto } = redactPII("llamame al 612345678 hoy");
    expect(texto).not.toMatch(/612345678/);
    expect(texto).toContain("[REDACTED:phone]");
  });

  it("redacts a dashed card number", () => {
    const { texto } = redactPII("paga con 4111-1111-1111-1111 gracias");
    expect(texto).not.toMatch(/4111/);
    expect(texto).toContain("[REDACTED:card]");
  });
});

// Regression — every format the adversarial review (2026-06-18) leaked with residualPII=false.
// The fail-closed guarantee is: a PII input is NEVER returned with residualPII=false AND its
// digits still intact. We assert the stronger property that each is actually redacted.
describe("redactPII — fail-closed against adversarial-review leak vectors", () => {
  const leakVectors: ReadonlyArray<readonly [string, string]> = [
    ["Spanish phone spaced 3-3-3", "llamame al 612 345 678"],
    ["phone dashed", "tel 600-123-456"],
    ["phone dotted", "tel 612.345.678"],
    ["phone parenthesized", "(612) 345 678 contesta"],
    ["intl phone spaced", "escribe a +34 600 123 456"],
    ["8-digit run", "ref 12345678 fin"],
    ["10-digit run", "ref 1234567890 fin"],
    ["12-digit run", "ref 123456789012 fin"],
    ["lowercase iban", "iban es91 2100 0418 4502 0005 1332 fin"],
  ];
  it.each(leakVectors)("%s → redacted, no silent leak", (_name, input) => {
    const { texto, residualPII } = redactPII(input);
    expect(texto).toContain("[REDACTED:"); // something was redacted
    // and the original PII digits/structure are gone from texto
    const digitsLeft = texto.replace(/\[REDACTED:[a-z]+\]/g, "").replace(/[^0-9]/g, "");
    expect(/\d{8,}/.test(digitsLeft)).toBe(false);
    expect(residualPII).toBe(false); // fully redacted ⇒ guard clean
  });

  it("backstop: a detector blind spot (slash-separated 16 digits) still trips residualPII", () => {
    // Slash is not a known separator → detectors miss it; the INDEPENDENT residual net must
    // still flag it so the caller fails closed (this is the whole point of the guard).
    const { residualPII } = redactPII("num 1111/1111/1111/1111 fin");
    expect(residualPII).toBe(true);
  });

  it("no false positive: short non-PII numbers (separated by words) do not trip the guard", () => {
    // Each number is broken by letters, so collapsing punctuation never merges them into an
    // 8+ run. (Adjacent numbers with only punctuation between WOULD merge — that is the
    // intended fail-closed over-flag, not tested here.)
    const input = "piso 3, puerta 4, llego el ano 2024 sin problemas";
    const { texto, residualPII } = redactPII(input);
    expect(residualPII).toBe(false);
    expect(texto).not.toContain("[REDACTED:");
  });
});
